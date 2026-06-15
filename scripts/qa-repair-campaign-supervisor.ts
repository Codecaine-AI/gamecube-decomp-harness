#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

type Mode = "dry-run" | "live";

interface QueueItem {
  id: string;
  status: string;
  source_path: string;
  findings?: unknown[];
  warnings?: unknown[];
  rule_counts?: Record<string, number>;
}

interface QueueFile {
  run_id?: string;
  base_ref?: string | null;
  head_sha?: string | null;
  repo_root?: string;
  items?: QueueItem[];
}

interface CommandResult {
  command: string[];
  cwd: string;
  exitCode: number;
  stdoutPath: string;
  stderrPath: string;
}

interface WorkerRecord {
  item_id: string;
  source_path: string;
  worker_id: string;
  status: string;
  lease_path: string;
  artifact_dir: string;
  worktree_path: string | null;
  qa_repair_output_dir: string;
  command_result?: CommandResult;
  patch_path?: string | null;
  patch_bytes?: number;
  diff_paths?: string[];
  non_item_diff_paths?: string[];
  worker_item_status?: string | null;
  worker_routing_reason?: string | null;
  merge_status?: string | null;
  validation_paths?: Record<string, string | null>;
  routing_reason?: string | null;
  started_at: string;
  finished_at?: string;
}

interface Manifest {
  schema_version: string;
  campaign_id: string;
  supervisor_run_id: string;
  mode: Mode;
  created_at: string;
  base_ref: string;
  head_sha_start: string | null;
  head_sha_current: string | null;
  queue_source: {
    kind: string;
    queue_path: string;
    scan_json_path: string | null;
  };
  repo_root: string;
  orchestrator_root: string;
  max_concurrency: number;
  supervisor_mode: string;
  validation_hooks_path: string | null;
  selected_item_count: number;
  workers: WorkerRecord[];
  items: Record<string, WorkerRecord>;
  final_status: string;
}

interface Options {
  queuePath: string;
  scanJsonPath: string | null;
  repoRoot: string;
  orchestratorRoot: string;
  stateDir: string;
  runId: string;
  baseRef: string;
  campaignDir: string;
  maxConcurrency: number;
  mode: Mode;
  limit: number | null;
  itemIds: Set<string>;
  agentTimeoutSeconds: number | null;
  mergeAccepted: boolean;
  keepWorktrees: boolean;
  validationHooksPath: string | null;
}

let gitWorktreeQueue: Promise<void> = Promise.resolve();

async function withGitWorktreeLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = gitWorktreeQueue;
  let release!: () => void;
  gitWorktreeQueue = new Promise((resolveLock) => {
    release = resolveLock;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function usage(): string {
  return [
    "Usage:",
    "  bun scripts/qa-repair-campaign-supervisor.ts --queue path --repo-root path --state-dir path [flags]",
    "",
    "Flags:",
    "  --scan-json path              saved review_lint scan JSON to replay for each worker",
    "  --orchestrator-root path      default: current working directory",
    "  --run-id id                   default: queue.run_id or manual",
    "  --base-ref ref                default: queue.base_ref or origin/master",
    "  --campaign-dir path           default: <state-dir>/qa_repair_campaign_supervisor/<run-id>/<timestamp>",
    "  --max-concurrency n           default: 32",
    "  --mode dry-run|live           default: dry-run",
    "  --limit n                     select at most n queued items",
    "  --item-id id                  repeatable or comma-separated item filter",
    "  --agent-timeout-seconds n     forwarded to qa-repair live sessions",
    "  --merge-accepted              apply clean worker patches to the primary checkout serially",
    "  --keep-worktrees              keep isolated worktrees after worker completion",
    "  --validation-hooks path       record hook policy/config path in the manifest",
  ].join("\n");
}

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function argValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argv[index]}`);
  return value;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function parseArgs(argv: string[], queue: QueueFile | null = null): Options {
  let queuePath = "";
  let scanJsonPath: string | null = null;
  let repoRoot = "";
  let orchestratorRoot = process.cwd();
  let stateDir = "";
  let runId = "";
  let baseRef = "";
  let campaignDir = "";
  let maxConcurrency = 32;
  let mode: Mode = "dry-run";
  let limit: number | null = null;
  const itemIds = new Set<string>();
  let agentTimeoutSeconds: number | null = null;
  let mergeAccepted = false;
  let keepWorktrees = false;
  let validationHooksPath: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--queue") {
      queuePath = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--scan-json") {
      scanJsonPath = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--repo-root") {
      repoRoot = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--orchestrator-root") {
      orchestratorRoot = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--state-dir") {
      stateDir = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--run-id") {
      runId = argValue(argv, i);
      i += 1;
    } else if (arg === "--base-ref") {
      baseRef = argValue(argv, i);
      i += 1;
    } else if (arg === "--campaign-dir") {
      campaignDir = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--max-concurrency") {
      maxConcurrency = Number(argValue(argv, i));
      i += 1;
    } else if (arg === "--mode") {
      const raw = argValue(argv, i);
      if (raw !== "dry-run" && raw !== "live") throw new Error("--mode must be dry-run or live");
      mode = raw;
      i += 1;
    } else if (arg === "--limit") {
      limit = Number(argValue(argv, i));
      i += 1;
    } else if (arg === "--item-id") {
      for (const id of argValue(argv, i).split(",")) {
        const trimmed = id.trim();
        if (trimmed) itemIds.add(trimmed);
      }
      i += 1;
    } else if (arg === "--agent-timeout-seconds") {
      agentTimeoutSeconds = Number(argValue(argv, i));
      i += 1;
    } else if (arg === "--merge-accepted") {
      mergeAccepted = true;
    } else if (arg === "--keep-worktrees") {
      keepWorktrees = true;
    } else if (arg === "--validation-hooks") {
      validationHooksPath = resolvePath(argValue(argv, i));
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!queuePath) throw new Error("--queue is required");
  const knownQueue = queue ?? readJson<QueueFile>(queuePath);
  if (!repoRoot) repoRoot = knownQueue.repo_root ? resolvePath(knownQueue.repo_root) : "";
  if (!repoRoot) throw new Error("--repo-root is required when queue.repo_root is missing");
  if (!stateDir) throw new Error("--state-dir is required");
  if (!runId) runId = knownQueue.run_id || "manual";
  if (!baseRef) baseRef = knownQueue.base_ref || "origin/master";
  if (!campaignDir) {
    campaignDir = resolve(stateDir, "qa_repair_campaign_supervisor", runId, timestampForPath());
  }
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) throw new Error("--max-concurrency must be a positive integer");
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) throw new Error("--limit must be a non-negative integer");
  if (agentTimeoutSeconds !== null && (!Number.isFinite(agentTimeoutSeconds) || agentTimeoutSeconds < 0)) {
    throw new Error("--agent-timeout-seconds must be a non-negative number");
  }
  return {
    queuePath,
    scanJsonPath,
    repoRoot,
    orchestratorRoot,
    stateDir,
    runId,
    baseRef,
    campaignDir,
    maxConcurrency,
    mode,
    limit,
    itemIds,
    agentTimeoutSeconds,
    mergeAccepted,
    keepWorktrees,
    validationHooksPath,
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendEvent(path: string, event: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, { flag: "a" });
}

async function runCommand(params: {
  cwd: string;
  command: string[];
  stdoutPath: string;
  stderrPath: string;
}): Promise<CommandResult> {
  await mkdir(dirname(params.stdoutPath), { recursive: true });
  await mkdir(dirname(params.stderrPath), { recursive: true });
  const stdout = createWriteStream(params.stdoutPath);
  const stderr = createWriteStream(params.stderrPath);
  return new Promise((resolveCommand) => {
    const child = spawn(params.command[0] ?? "", params.command.slice(1), { cwd: params.cwd });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.on("error", (error) => {
      stderr.write(`\n[spawn error] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      stdout.end();
      stderr.end();
      resolveCommand({
        command: params.command,
        cwd: params.cwd,
        exitCode: -1,
        stdoutPath: params.stdoutPath,
        stderrPath: params.stderrPath,
      });
    });
    child.on("close", (code) => {
      stdout.end();
      stderr.end();
      resolveCommand({
        command: params.command,
        cwd: params.cwd,
        exitCode: code ?? -1,
        stdoutPath: params.stdoutPath,
        stderrPath: params.stderrPath,
      });
    });
  });
}

async function commandText(cwd: string, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveCommand) => {
    const child = spawn(command[0] ?? "", command.slice(1), { cwd });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      resolveCommand({
        exitCode: -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${error instanceof Error ? error.message : String(error)}`,
      });
    });
    child.on("close", (code) => {
      resolveCommand({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function headSha(repoRoot: string): Promise<string | null> {
  const result = await commandText(repoRoot, ["git", "rev-parse", "HEAD"]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function selectItems(queue: QueueFile, options: Options): QueueItem[] {
  const queued = (queue.items ?? []).filter((item) => item.status === "queued");
  const filtered = options.itemIds.size > 0 ? queued.filter((item) => options.itemIds.has(item.id)) : queued;
  return options.limit === null ? filtered : filtered.slice(0, options.limit);
}

async function createLease(path: string, record: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
  } finally {
    await handle.close();
  }
}

async function createWorktree(repoRoot: string, worktreePath: string): Promise<CommandResult> {
  return withGitWorktreeLock(() =>
    runCommand({
      cwd: repoRoot,
      command: ["git", "worktree", "add", "--detach", worktreePath, "HEAD"],
      stdoutPath: resolve(worktreePath, "..", `${worktreePath.split("/").pop()}.worktree-add.stdout.txt`),
      stderrPath: resolve(worktreePath, "..", `${worktreePath.split("/").pop()}.worktree-add.stderr.txt`),
    }),
  );
}

function qaRepairCommand(options: Options, item: QueueItem, worker: WorkerRecord): string[] {
  const command = [
    "bun",
    "run",
    "orch",
    "--project",
    "melee",
    "--repo-root",
    worker.worktree_path ?? options.repoRoot,
    "--state-dir",
    resolve(worker.artifact_dir, "state"),
  ];
  if (options.mode === "dry-run") command.push("--dry-run-agents");
  if (options.agentTimeoutSeconds !== null) command.push("--agent-timeout-seconds", String(options.agentTimeoutSeconds));
  command.push(
    "qa-repair",
    "--run-id",
    options.runId,
    "--base-ref",
    options.baseRef,
    "--checkpoint",
    "none",
    "--candidate-files",
    item.source_path,
    "--run-agents",
    "--item-id",
    item.id,
    "--max-items",
    "1",
    "--output-dir",
    worker.qa_repair_output_dir,
  );
  if (options.scanJsonPath) command.push("--scan-json", options.scanJsonPath);
  return command;
}

async function readWorkerStatus(outputDir: string, itemId: string): Promise<{ status: string | null; reason: string | null }> {
  const queuePath = resolve(outputDir, "queue.json");
  if (!existsSync(queuePath)) return { status: null, reason: null };
  const queue = readJson<QueueFile>(queuePath);
  const item = (queue.items ?? []).find((candidate) => candidate.id === itemId) as (QueueItem & { routing_reason?: string }) | undefined;
  return { status: item?.status ?? null, reason: item?.routing_reason ?? null };
}

async function writePatch(repoRoot: string, item: QueueItem, patchPath: string): Promise<{ bytes: number; paths: string[]; nonItemPaths: string[] }> {
  const names = await commandText(repoRoot, ["git", "diff", "--name-only", "HEAD"]);
  const result = await commandText(repoRoot, ["git", "diff", "--binary", "HEAD", "--", item.source_path]);
  await mkdir(dirname(patchPath), { recursive: true });
  await writeFile(patchPath, result.stdout);
  const paths = names.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    bytes: Buffer.byteLength(result.stdout),
    paths,
    nonItemPaths: paths.filter((path) => path !== item.source_path),
  };
}

async function validatePrimaryQa(options: Options, item: QueueItem, outputDir: string): Promise<{ status: string; paths: Record<string, string | null>; reason: string }> {
  const stdoutPath = resolve(outputDir, "primary_post_scan.json");
  const stderrPath = resolve(outputDir, "primary_post_scan.txt");
  const result = await runCommand({
    cwd: options.orchestratorRoot,
    command: [
      "python3",
      resolve(options.orchestratorRoot, "tools/source_editing/review_lint/api/scan_diff.py"),
      "--repo",
      options.repoRoot,
      "--base",
      options.baseRef,
      "--path",
      item.source_path,
      "--include-worktree",
      "--gate",
      "--json",
    ],
    stdoutPath,
    stderrPath,
  });
  if (result.exitCode === 0 || result.exitCode === 2) {
    return { status: "primary_qa_passed", paths: { primary_post_scan: stdoutPath, primary_post_scan_text: stderrPath }, reason: "primary checkout QA scan has no error findings for item" };
  }
  if (result.exitCode === 1) {
    return { status: "primary_qa_failed", paths: { primary_post_scan: stdoutPath, primary_post_scan_text: stderrPath }, reason: "primary checkout QA scan still has error findings for item" };
  }
  return { status: "primary_qa_blocked", paths: { primary_post_scan: stdoutPath, primary_post_scan_text: stderrPath }, reason: `primary checkout QA scan tool failed with exit ${result.exitCode}` };
}

async function removeWorktree(repoRoot: string, worktreePath: string, artifactDir: string): Promise<CommandResult> {
  return withGitWorktreeLock(() =>
    runCommand({
      cwd: repoRoot,
      command: ["git", "worktree", "remove", "--force", worktreePath],
      stdoutPath: resolve(artifactDir, "worktree-remove.stdout.txt"),
      stderrPath: resolve(artifactDir, "worktree-remove.stderr.txt"),
    }),
  );
}

async function runWorker(options: Options, item: QueueItem, ordinal: number, manifestPath: string, eventsPath: string): Promise<WorkerRecord> {
  const workerId = `worker-${String(ordinal + 1).padStart(3, "0")}-${item.id}`;
  const artifactDir = resolve(options.campaignDir, "workers", workerId, item.id);
  const worktreePath = resolve(options.campaignDir, "worktrees", workerId);
  const qaRepairOutputDir = resolve(artifactDir, "qa-repair");
  const leasePath = resolve(options.campaignDir, "locks", `${item.id}.lock.json`);
  const worker: WorkerRecord = {
    item_id: item.id,
    source_path: item.source_path,
    worker_id: workerId,
    status: "leased",
    lease_path: leasePath,
    artifact_dir: artifactDir,
    worktree_path: worktreePath,
    qa_repair_output_dir: qaRepairOutputDir,
    started_at: new Date().toISOString(),
  };
  await mkdir(artifactDir, { recursive: true });
  await createLease(leasePath, {
    item_id: item.id,
    source_path: item.source_path,
    worker_id: workerId,
    artifact_dir: artifactDir,
    worktree_path: worktreePath,
    created_at: worker.started_at,
  });
  await appendEvent(eventsPath, { event: "lease_created", item_id: item.id, worker_id: workerId, status: "leased", artifact_path: leasePath });

  const addResult = await createWorktree(options.repoRoot, worktreePath);
  if (addResult.exitCode !== 0) {
    worker.status = "blocked";
    worker.routing_reason = `worktree add failed with exit ${addResult.exitCode}`;
    worker.finished_at = new Date().toISOString();
    await writeJson(resolve(artifactDir, "worker_record.json"), worker);
    await appendEvent(eventsPath, { event: "worker_blocked", item_id: item.id, worker_id: workerId, status: worker.status, artifact_path: artifactDir });
    return worker;
  }

  await appendEvent(eventsPath, { event: "worker_started", item_id: item.id, worker_id: workerId, status: "running", artifact_path: artifactDir });
  const command = qaRepairCommand(options, item, worker);
  const commandResult = await runCommand({
    cwd: options.orchestratorRoot,
    command,
    stdoutPath: resolve(artifactDir, "qa-repair.stdout.json"),
    stderrPath: resolve(artifactDir, "qa-repair.stderr.txt"),
  });
  worker.command_result = commandResult;
  const workerStatus = await readWorkerStatus(qaRepairOutputDir, item.id);
  worker.worker_item_status = workerStatus.status;
  worker.worker_routing_reason = workerStatus.reason;

  const patchPath = resolve(artifactDir, `${item.id}.patch`);
  worker.patch_path = patchPath;
  const patch = await writePatch(worktreePath, item, patchPath);
  worker.patch_bytes = patch.bytes;
  worker.diff_paths = patch.paths;
  worker.non_item_diff_paths = patch.nonItemPaths;
  worker.status = commandResult.exitCode === 0 ? "worker_finished" : "worker_failed";
  if (patch.nonItemPaths.length > 0) {
    worker.status = "worker_finished_non_item_edits";
    worker.routing_reason = `worker edited paths outside leased item: ${patch.nonItemPaths.join(", ")}`;
  }
  worker.finished_at = new Date().toISOString();

  if (!options.keepWorktrees && options.mode === "dry-run") {
    await removeWorktree(options.repoRoot, worktreePath, artifactDir);
    worker.worktree_path = null;
  }

  await writeJson(resolve(artifactDir, "worker_record.json"), worker);
  await appendEvent(eventsPath, { event: "worker_finished", item_id: item.id, worker_id: workerId, status: worker.status, artifact_path: artifactDir });
  return worker;
}

async function runPool<T>(items: T[], concurrency: number, run: (item: T, index: number) => Promise<WorkerRecord>, onDone: (record: WorkerRecord) => Promise<void>): Promise<WorkerRecord[]> {
  const records: WorkerRecord[] = [];
  let next = 0;
  async function workerLoop(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const record = await run(items[index] as T, index);
      records[index] = record;
      await onDone(record);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => workerLoop()));
  return records;
}

async function mergeAcceptedWorkers(options: Options, manifest: Manifest, manifestPath: string, eventsPath: string): Promise<void> {
  if (options.mode !== "live" || !options.mergeAccepted) return;
  for (const worker of manifest.workers) {
    const acceptedByWorker = worker.worker_item_status === "clean_same_match" || worker.worker_item_status === "clean_lower_score";
    if (!acceptedByWorker) {
      worker.merge_status = "not_merged";
      worker.routing_reason = worker.worker_routing_reason || `worker status ${worker.worker_item_status ?? "unknown"} is not merge-eligible`;
      continue;
    }
    if (worker.non_item_diff_paths && worker.non_item_diff_paths.length > 0) {
      worker.merge_status = "not_merged";
      worker.routing_reason = `worker edited paths outside leased item: ${worker.non_item_diff_paths.join(", ")}`;
      continue;
    }
    if (!worker.patch_path || !worker.patch_bytes) {
      worker.merge_status = "not_merged";
      worker.routing_reason = "worker produced no source patch";
      continue;
    }
    const item = { id: worker.item_id, source_path: worker.source_path, status: "queued" };
    const mergeDir = resolve(worker.artifact_dir, "primary-merge");
    const check = await runCommand({
      cwd: options.repoRoot,
      command: ["git", "apply", "--check", worker.patch_path],
      stdoutPath: resolve(mergeDir, "git-apply-check.stdout.txt"),
      stderrPath: resolve(mergeDir, "git-apply-check.stderr.txt"),
    });
    if (check.exitCode !== 0) {
      worker.merge_status = "conflict";
      worker.routing_reason = `git apply --check failed with exit ${check.exitCode}`;
      worker.validation_paths = { apply_check_stdout: check.stdoutPath, apply_check_stderr: check.stderrPath };
      await appendEvent(eventsPath, { event: "patch_conflict", item_id: worker.item_id, worker_id: worker.worker_id, status: worker.merge_status, artifact_path: mergeDir });
      await writeJson(manifestPath, manifest);
      continue;
    }
    const applied = await runCommand({
      cwd: options.repoRoot,
      command: ["git", "apply", worker.patch_path],
      stdoutPath: resolve(mergeDir, "git-apply.stdout.txt"),
      stderrPath: resolve(mergeDir, "git-apply.stderr.txt"),
    });
    if (applied.exitCode !== 0) {
      worker.merge_status = "apply_failed";
      worker.routing_reason = `git apply failed with exit ${applied.exitCode}`;
      worker.validation_paths = { apply_stdout: applied.stdoutPath, apply_stderr: applied.stderrPath };
      await appendEvent(eventsPath, { event: "patch_apply_failed", item_id: worker.item_id, worker_id: worker.worker_id, status: worker.merge_status, artifact_path: mergeDir });
      await writeJson(manifestPath, manifest);
      continue;
    }
    const validation = await validatePrimaryQa(options, item, mergeDir);
    worker.merge_status = validation.status === "primary_qa_passed" ? "merged_primary_qa_passed" : "merged_primary_qa_failed";
    worker.validation_paths = validation.paths;
    worker.routing_reason = validation.reason;
    await appendEvent(eventsPath, { event: "patch_merged", item_id: worker.item_id, worker_id: worker.worker_id, status: worker.merge_status, artifact_path: mergeDir });
    await writeJson(manifestPath, manifest);
  }
}

async function main(): Promise<void> {
  const queuePathArgIndex = process.argv.indexOf("--queue");
  const queuePath = queuePathArgIndex >= 0 ? resolvePath(argValue(process.argv, queuePathArgIndex)) : "";
  const queue = queuePath ? readJson<QueueFile>(queuePath) : null;
  const options = parseArgs(process.argv.slice(2), queue);
  const selected = selectItems(queue ?? readJson<QueueFile>(options.queuePath), options);
  await mkdir(options.campaignDir, { recursive: true });
  const manifestPath = resolve(options.campaignDir, "campaign_manifest.json");
  const eventsPath = resolve(options.campaignDir, "campaign_events.jsonl");
  const manifest: Manifest = {
    schema_version: "qa_repair_campaign_manifest_v1",
    campaign_id: options.runId,
    supervisor_run_id: options.campaignDir.split("/").pop() || "supervisor-run",
    mode: options.mode,
    created_at: new Date().toISOString(),
    base_ref: options.baseRef,
    head_sha_start: queue?.head_sha ?? (await headSha(options.repoRoot)),
    head_sha_current: await headSha(options.repoRoot),
    queue_source: {
      kind: options.scanJsonPath ? "fresh_scan_queue_with_saved_scan_replay" : "fresh_scan_queue",
      queue_path: options.queuePath,
      scan_json_path: options.scanJsonPath,
    },
    repo_root: options.repoRoot,
    orchestrator_root: options.orchestratorRoot,
    max_concurrency: options.maxConcurrency,
    supervisor_mode: "isolated_worktrees_serial_primary_merge",
    validation_hooks_path: options.validationHooksPath,
    selected_item_count: selected.length,
    workers: [],
    items: {},
    final_status: "running",
  };
  await writeJson(manifestPath, manifest);
  await appendEvent(eventsPath, { event: "supervisor_started", status: "running", artifact_path: options.campaignDir });

  const records = await runPool(
    selected,
    options.maxConcurrency,
    (item, index) => runWorker(options, item, index, manifestPath, eventsPath),
    async (record) => {
      manifest.workers.push(record);
      manifest.items[record.item_id] = record;
      manifest.head_sha_current = await headSha(options.repoRoot);
      await writeJson(manifestPath, manifest);
    },
  );
  manifest.workers = records.filter(Boolean);
  manifest.items = Object.fromEntries(manifest.workers.map((record) => [record.item_id, record]));
  await mergeAcceptedWorkers(options, manifest, manifestPath, eventsPath);
  manifest.head_sha_current = await headSha(options.repoRoot);
  const blocked = manifest.workers.some((worker) => worker.status === "blocked" || worker.status === "worker_failed" || worker.merge_status === "conflict" || worker.merge_status === "apply_failed");
  const mergedFailures = manifest.workers.some((worker) => worker.merge_status === "merged_primary_qa_failed");
  manifest.final_status = blocked || mergedFailures ? "completed_with_residuals" : "completed";
  await writeJson(manifestPath, manifest);
  await appendEvent(eventsPath, { event: "supervisor_finished", status: manifest.final_status, artifact_path: options.campaignDir });
  console.log(JSON.stringify({ manifestPath, eventsPath, selectedItems: selected.length, finalStatus: manifest.final_status }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
