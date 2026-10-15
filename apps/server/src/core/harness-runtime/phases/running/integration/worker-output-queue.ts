import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { runCommand } from "@server/infrastructure/shell";
import { resolveGame } from "@server/core/game-registry/resolver.js";
import { orderingActive, orderingEnforced } from "@server/core/tools/ordering.js";
import { packageRoot } from "@server/core/knowledge";
import {
  EDIT_SCOPE_TOOLPACK_PATH,
  editScopePolicyFromGame,
  editScopeProblem,
  editScopeRejectionReason,
  hostEditScopeRunner,
  runEditScope,
  type EditScopeOrderingPolicy,
  type EditScopeResult,
  type EditScopeRunner,
} from "@server/core/validation/edit-scope/edit-scope.js";
import {
  UNUSED_RECERTIFY_INSTRUCTION,
  checkpointUnusedChecks,
  evidenceInlinedTrailers,
  partitionUnusedChecksByContent,
  type BoundUnusedCheck,
  type UnusedCheckFreshness,
} from "@server/core/validation/edit-scope/unused-evidence.js";
import { REJECTED_OUT_OF_SCOPE_DISPOSITION } from "@server/core/harness-runtime/run-state/worker-output-integration.js";
import { rejectWorkerOutputIntegrationRecord } from "./reject-output.js";
import {
  addEvent,
  getRun,
  getWorkerOutputIntegration,
  updateWorkerOutputIntegration,
  workerOutputIntegrationQueueSummary,
  type StateStore,
  type WorkerOutputIntegrationRecord,
  type WorkerOutputIntegrationStatus,
} from "@server/core/harness-runtime/run-state";
import { claimNextJob, completeJob, failJob } from "@server/core/job-queue/kernel.js";
import { requireLease } from "@server/core/harness-state";

type CommandRunner = typeof runCommand;

function revalidateIntegrationLease(store: StateStore, leaseId: string): void {
  if (!leaseId.trim()) throw new Error("worker output integration requires a dispatch lease id");
  requireLease(store, leaseId);
}

export interface WorkerOutputIntegrationApplyResult {
  id: string;
  status: WorkerOutputIntegrationStatus;
  disposition: string | null;
  patchPath: string | null;
  itemPath: string | null;
  summaryPath: string | null;
  failureReasons: string[];
  conflictPaths: string[];
  /** Commit sha of the per-accept integration commit, when one was created. */
  integratedRev: string | null;
}

export interface WorkerOutputIntegrationQueueResult {
  processed: WorkerOutputIntegrationApplyResult[];
  queueSummary: Record<string, unknown>;
  /** Last integration commit created by this drain; new workers base off it. */
  headRev: string | null;
}

interface ApplyArtifacts {
  artifactDir: string;
  summaryPath: string;
  itemPath: string;
  queueSummaryPath: string;
  checkStdoutPath: string;
  checkStderrPath: string;
  applyStdoutPath: string;
  applyStderrPath: string;
}

function outputTail(text: string, maxChars = 2000): string {
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractConflictPaths(text: string, writeSet: string[]): string[] {
  const paths: string[] = [];
  const patterns = [
    /(?:patch failed|error):\s+([^:\n]+):/g,
    /error:\s+([^\n]+): patch does not apply/g,
    /Checking patch\s+(.+?)\.\.\./g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) paths.push(match[1]);
    }
  }
  return uniqueStrings(paths.length > 0 ? paths : writeSet);
}

function integrationArtifacts(stateDir: string, runId: string, id: string): ApplyArtifacts {
  const artifactDir = resolve(stateDir, "runs", runId, "worker_integrations", id);
  return {
    artifactDir,
    summaryPath: resolve(artifactDir, "summary.json"),
    itemPath: resolve(artifactDir, "integration_conflict_item.json"),
    queueSummaryPath: resolve(artifactDir, "integration_queue_summary.json"),
    checkStdoutPath: resolve(artifactDir, "git_apply_check.stdout.txt"),
    checkStderrPath: resolve(artifactDir, "git_apply_check.stderr.txt"),
    applyStdoutPath: resolve(artifactDir, "git_apply.stdout.txt"),
    applyStderrPath: resolve(artifactDir, "git_apply.stderr.txt"),
  };
}

function targetSnapshot(store: StateStore, record: WorkerOutputIntegrationRecord): Record<string, unknown> {
  const row = store.db
    .query(
      `
        SELECT unit, symbol, source_path, size, baseline_score, target_key
        FROM epoch_targets
        WHERE id = ?
      `,
    )
    .get(record.epochTargetId) as Record<string, unknown> | undefined;
  return {
    epoch_target_id: record.epochTargetId,
    target_key: record.targetKey ?? row?.target_key ?? null,
    unit: row?.unit ?? null,
    symbol: row?.symbol ?? null,
    source_path: row?.source_path ?? null,
    size: row?.size ?? null,
    baseline_score: row?.baseline_score ?? null,
  };
}

function checkpointSnapshot(store: StateStore, record: WorkerOutputIntegrationRecord): Record<string, unknown> {
  if (!record.workerCheckpointId) return {};
  const row = store.db.query("SELECT * FROM worker_checkpoints WHERE id = ?").get(record.workerCheckpointId) as Record<string, unknown> | undefined;
  if (!row) return {};
  return {
    id: String(row.id),
    attempt_index: row.attempt_index,
    validation_time: row.validation_time,
    old_score: row.old_score,
    new_score: row.new_score,
    delta: row.delta,
    exact_match: Number(row.exact_match) === 1,
    hard_gates_passed: Number(row.hard_gates_passed) === 1,
    selectable: Number(row.selectable) === 1,
    selected: Number(row.selected) === 1,
    validation_status: row.validation_status,
    artifact_path: row.artifact_path,
    patch_path: row.patch_path,
    diff_path: row.diff_path,
  };
}

function checkpointOutOfWriteSetPaths(store: StateStore, record: WorkerOutputIntegrationRecord): string[] {
  if (!record.workerCheckpointId) return [];
  const row = store.db
    .query("SELECT metadata_json FROM worker_checkpoints WHERE id = ?")
    .get(record.workerCheckpointId) as Record<string, unknown> | undefined;
  if (!row) return [];
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
  } catch {
    return [];
  }
  const changes = metadata.out_of_write_set_changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const paths = (changes as Record<string, unknown>).paths;
  if (!Array.isArray(paths)) return [];
  return uniqueStrings(
    paths.flatMap((change) => {
      if (typeof change === "string") return [change];
      if (!change || typeof change !== "object" || Array.isArray(change)) return [];
      const path = (change as Record<string, unknown>).path;
      return typeof path === "string" ? [path] : [];
    }),
  );
}

function conflictItem(params: {
  record: WorkerOutputIntegrationRecord;
  target: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutPath: string;
  stderrPath: string;
  conflictPaths: string[];
  failureReasons: string[];
}): Record<string, unknown> {
  return {
    schema_version: "integration_conflict_item_v1",
    id: params.record.id,
    queue_item_id: params.record.id,
    run_id: params.record.runId,
    epoch_id: params.record.epochId,
    epoch_target_id: params.record.epochTargetId,
    target_claim_id: params.record.targetClaimId,
    conflict_group_id: `worker-output:${params.record.id}`,
    target: params.target,
    failed_apply: {
      command: params.command.join(" "),
      exit_code: params.exitCode,
      stdout_path: params.stdoutPath,
      stderr_path: params.stderrPath,
      stdout_tail: outputTail(params.stdout, 1000),
      stderr_tail: outputTail(params.stderr, 1000),
    },
    conflict_paths: params.conflictPaths,
    failure_reasons: params.failureReasons,
    worker_outputs: [
      {
        worker_state_id: params.record.workerStateId,
        checkpoint_id: params.record.workerCheckpointId,
        target_claim_id: params.record.targetClaimId,
        epoch_target_id: params.record.epochTargetId,
        patch_path: params.record.patchPath,
        diff_path: params.record.diffPath,
        write_set: params.record.writeSet,
        checkpoint: params.checkpoint,
      },
    ],
    created_at: new Date().toISOString(),
  };
}

async function writeSummary(path: string, result: WorkerOutputIntegrationApplyResult, extra: Record<string, unknown> = {}): Promise<void> {
  await writeFile(path, `${JSON.stringify({ ...result, ...extra }, null, 2)}\n`);
}

async function updateAndSummarize(
  store: StateStore,
  record: WorkerOutputIntegrationRecord,
  update: {
    status: WorkerOutputIntegrationStatus;
    disposition: string | null;
    artifacts: ApplyArtifacts;
    failureReasons?: string[];
    conflictPaths?: string[];
    checkStdoutPath?: string | null;
    checkStderrPath?: string | null;
    applyStdoutPath?: string | null;
    applyStderrPath?: string | null;
    itemPath?: string | null;
    metadata?: Record<string, unknown>;
    integratedRev?: string | null;
  },
): Promise<WorkerOutputIntegrationApplyResult> {
  const updated = updateWorkerOutputIntegration(store, record.id, {
    status: update.status,
    disposition: update.disposition,
    summaryPath: update.artifacts.summaryPath,
    itemPath: update.itemPath ?? null,
    checkStdoutPath: update.checkStdoutPath ?? null,
    checkStderrPath: update.checkStderrPath ?? null,
    applyStdoutPath: update.applyStdoutPath ?? null,
    applyStderrPath: update.applyStderrPath ?? null,
    failureReasons: update.failureReasons ?? [],
    conflictPaths: update.conflictPaths ?? [],
    metadata: update.metadata,
  });
  const result: WorkerOutputIntegrationApplyResult = {
    id: updated.id,
    status: updated.status,
    disposition: updated.disposition,
    patchPath: updated.patchPath,
    itemPath: updated.itemPath,
    summaryPath: updated.summaryPath,
    failureReasons: updated.failureReasons,
    conflictPaths: updated.conflictPaths,
    integratedRev: update.integratedRev ?? null,
  };
  await writeSummary(update.artifacts.summaryPath, result, {
    queue_record: {
      worker_state_id: updated.workerStateId,
      worker_checkpoint_id: updated.workerCheckpointId,
      target_claim_id: updated.targetClaimId,
      epoch_target_id: updated.epochTargetId,
      write_set: updated.writeSet,
    },
  });
  return result;
}

function markTentative(store: StateStore, record: WorkerOutputIntegrationRecord): void {
  if (record.workerCheckpointId) {
    store.db.query("UPDATE worker_checkpoints SET validation_state = 'tentative' WHERE id = ?").run(record.workerCheckpointId);
  }
}

async function compensateAppliedPatch(params: {
  commandRunner: CommandRunner;
  leaseId: string;
  repoRoot: string;
  patchPath: string;
  paths: string[];
  store: StateStore;
}): Promise<string[]> {
  const failures: string[] = [];
  revalidateIntegrationLease(params.store, params.leaseId);
  const reverse = await params.commandRunner(params.repoRoot, ["git", "apply", "--reverse", params.patchPath]);
  if (reverse.exitCode !== 0) failures.push(`reverse apply failed: ${outputTail(reverse.stderr || reverse.stdout, 1000)}`);
  if (params.paths.length > 0) {
    revalidateIntegrationLease(params.store, params.leaseId);
    const restage = await params.commandRunner(params.repoRoot, ["git", "add", "--", ...params.paths]);
    if (restage.exitCode !== 0) failures.push(`index cleanup failed: ${outputTail(restage.stderr || restage.stdout, 1000)}`);
  }
  return failures;
}

/**
 * Detects the stage/commit race where another commit (a resolver commit or a
 * boundary `add -A` sweep) captured the applied content first: the working
 * tree then matches HEAD for the integration's paths, so a pathspec commit
 * exits non-zero with "no changes" even though the accepted work is already
 * in HEAD. Reverse-applying in that state would silently revert accepted
 * work, so callers must treat this as success at the current HEAD.
 */
async function contentCapturedByHead(commandRunner: CommandRunner, repoRoot: string, paths: string[]): Promise<string | null> {
  const status = await commandRunner(repoRoot, ["git", "status", "--porcelain", "--", ...paths]);
  if (status.exitCode !== 0 || status.stdout.trim()) return null;
  const head = await commandRunner(repoRoot, ["git", "rev-parse", "HEAD"]);
  return head.exitCode === 0 && head.stdout.trim() ? head.stdout.trim() : null;
}

/** Paths touched by a patch, from `git apply --numstat` (covers empty write sets). */
async function patchPaths(commandRunner: CommandRunner, repoRoot: string, patchPath: string): Promise<string[]> {
  const numstat = await commandRunner(repoRoot, ["git", "apply", "--numstat", patchPath]);
  if (numstat.exitCode !== 0) return [];
  return uniqueStrings(
    numstat.stdout
      .split("\n")
      .map((line) => line.split("\t")[2] ?? "")
      .filter(Boolean),
  );
}

export function integrationCommitMessage(record: Pick<WorkerOutputIntegrationRecord, "id" | "targetKey" | "workerCheckpointId">): string {
  const target = (record.targetKey ?? record.id).replace(/[\r\n]+/g, " ");
  const checkpoint = record.workerCheckpointId ? ` [checkpoint ${record.workerCheckpointId.slice(0, 8)}]` : "";
  return `worker-integration(${record.id.slice(0, 8)}): ${target}${checkpoint}`;
}

/**
 * `git commit` message arguments: the subject (unchanged; boundary Sync reads
 * `%s` only) and, when the checkpoint carries `inlined` UNUSED evidence, a
 * trailer paragraph (`-m` paragraphs are joined by a blank line).
 */
export function integrationCommitMessageArgs(
  record: Pick<WorkerOutputIntegrationRecord, "id" | "targetKey" | "workerCheckpointId">,
  unusedChecks?: readonly BoundUnusedCheck[] | null,
): string[] {
  const trailers = evidenceInlinedTrailers(unusedChecks);
  return ["-m", integrationCommitMessage(record), ...(trailers.length > 0 ? ["-m", trailers.join("\n")] : [])];
}

function checkpointMetadata(store: StateStore, record: WorkerOutputIntegrationRecord): Record<string, unknown> {
  if (!record.workerCheckpointId) return {};
  const row = store.db.query("SELECT metadata_json FROM worker_checkpoints WHERE id = ?").get(record.workerCheckpointId) as { metadata_json?: unknown } | undefined;
  try {
    const parsed: unknown = typeof row?.metadata_json === "string" ? JSON.parse(row.metadata_json) : row?.metadata_json;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function commitAppliedPatch(params: {
  commandRunner: CommandRunner;
  leaseId: string;
  repoRoot: string;
  record: WorkerOutputIntegrationRecord;
  patchPath: string;
  paths?: string[];
  store: StateStore;
  unusedChecks?: readonly BoundUnusedCheck[] | null;
}): Promise<{ preApplyRev: string; integratedRev: string }> {
  let paths = uniqueStrings(params.paths ?? params.record.writeSet);
  if (paths.length === 0) paths = await patchPaths(params.commandRunner, params.repoRoot, params.patchPath);
  if (paths.length === 0) throw new Error("worker integration cannot commit an empty write set");
  const before = await params.commandRunner(params.repoRoot, ["git", "rev-parse", "HEAD"]);
  if (before.exitCode !== 0 || !before.stdout.trim()) {
    throw new Error(`worker integration could not resolve pre-apply revision: ${outputTail(before.stderr || before.stdout)}`);
  }
  revalidateIntegrationLease(params.store, params.leaseId);
  const stage = await params.commandRunner(params.repoRoot, ["git", "add", "--", ...paths]);
  if (stage.exitCode !== 0) {
    const capturedRev = await contentCapturedByHead(params.commandRunner, params.repoRoot, paths);
    if (capturedRev) return { preApplyRev: before.stdout.trim(), integratedRev: capturedRev };
    const cleanup = await compensateAppliedPatch({ ...params, paths });
    throw new Error(
      [`worker integration git add failed: ${outputTail(stage.stderr || stage.stdout)}`, ...cleanup].join("; "),
    );
  }
  revalidateIntegrationLease(params.store, params.leaseId);
  const commit = await params.commandRunner(params.repoRoot, [
    "git",
    "commit",
    "--no-verify",
    ...integrationCommitMessageArgs(params.record, params.unusedChecks),
    "--",
    ...paths,
  ]);
  if (commit.exitCode !== 0) {
    const capturedRev = await contentCapturedByHead(params.commandRunner, params.repoRoot, paths);
    if (capturedRev) return { preApplyRev: before.stdout.trim(), integratedRev: capturedRev };
    const cleanup = await compensateAppliedPatch({ ...params, paths });
    throw new Error(
      [`worker integration git commit failed: ${outputTail(commit.stderr || commit.stdout)}`, ...cleanup].join("; "),
    );
  }
  const after = await params.commandRunner(params.repoRoot, ["git", "rev-parse", "HEAD"]);
  if (after.exitCode !== 0 || !after.stdout.trim()) {
    throw new Error(`worker integration could not resolve integrated revision: ${outputTail(after.stderr || after.stdout)}`);
  }
  return { preApplyRev: before.stdout.trim(), integratedRev: after.stdout.trim() };
}

async function handleApplyConflict(params: {
  artifacts: ApplyArtifacts;
  command: string[];
  exitCode: number;
  failureReasons: string[];
  conflictPaths: string[];
  stderr: string;
  stderrPath: string;
  stdout: string;
  stdoutPath: string;
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
  disposition: string;
}): Promise<WorkerOutputIntegrationApplyResult> {
  const item = conflictItem({
    record: params.record,
    target: targetSnapshot(params.store, params.record),
    checkpoint: checkpointSnapshot(params.store, params.record),
    command: params.command,
    exitCode: params.exitCode,
    stdout: params.stdout,
    stderr: params.stderr,
    stdoutPath: params.stdoutPath,
    stderrPath: params.stderrPath,
    conflictPaths: params.conflictPaths,
    failureReasons: params.failureReasons,
  });
  await writeFile(params.artifacts.itemPath, `${JSON.stringify(item, null, 2)}\n`);

  const result = await updateAndSummarize(params.store, params.record, {
    status: "conflict",
    disposition: params.disposition,
    artifacts: params.artifacts,
    itemPath: params.artifacts.itemPath,
    checkStdoutPath: params.artifacts.checkStdoutPath,
    checkStderrPath: params.artifacts.checkStderrPath,
    applyStdoutPath: params.disposition === "apply_failed" ? params.artifacts.applyStdoutPath : null,
    applyStderrPath: params.disposition === "apply_failed" ? params.artifacts.applyStderrPath : null,
    failureReasons: params.failureReasons,
    conflictPaths: params.conflictPaths,
    metadata: {
      queue_summary_path: params.artifacts.queueSummaryPath,
    },
  });
  await writeFile(
    params.artifacts.queueSummaryPath,
    `${JSON.stringify(workerOutputIntegrationQueueSummary(params.store, params.record.runId), null, 2)}\n`,
  );
  addEvent(params.store, params.record.runId, "worker_integration_conflict", "worker-output-integration", result);
  return result;
}

/** Integration-gate inputs for the order-and-scope fence (plan v3 section 5). */
export interface WorkerOutputIntegrationScopeOptions {
  /** The game's ordering policy; null (or mode off) never runs the checker. */
  ordering: EditScopeOrderingPolicy | null;
  /**
   * Set when no policy was passed and the run's game descriptor did not
   * resolve: the policy is unknown. Recorded on every output; rejects when
   * the run's stored configuration says ordering is enforced.
   */
  unresolved?: string | null;
  /** `ordering.mode` from the run's stored configuration snapshot, when it records one. */
  storedMode?: string | null;
  /** Defaults to the toolpack `edit_scope.py` run on the host against the repo. */
  editScopeRunner?: EditScopeRunner;
}

/** Host path of the toolpack checker, resolved like the steering gate's script. */
export function integrationEditScopeScript(): string {
  return resolve(packageRoot(), "toolpacks/gamecube-decomp", EDIT_SCOPE_TOOLPACK_PATH);
}

function storedOrderingMode(snapshot: Record<string, unknown> | null | undefined): string | null {
  const ordering = snapshot?.ordering;
  if (ordering && typeof ordering === "object" && !Array.isArray(ordering)) {
    const mode = (ordering as Record<string, unknown>).mode;
    if (typeof mode === "string") return mode;
  }
  return typeof snapshot?.ordering_mode === "string" ? snapshot.ordering_mode : null;
}

export interface RunOrderingResolution {
  policy: EditScopeOrderingPolicy | null;
  /** Why the policy is unknown (`ordering_unresolved: ...`), else null. */
  unresolved: string | null;
  storedMode: string | null;
}

/**
 * The ordering policy of the run's game, for callers that do not pass one.
 * A game that resolves without an active `ordering` block is off; a game id
 * whose descriptor does not resolve is `unresolved` (never silently off).
 */
export function runOrderingPolicy(store: StateStore, runId: string): RunOrderingResolution {
  const run = getRun(store, runId);
  const storedMode = storedOrderingMode(run?.inputs?.configuration_snapshot);
  const gameId = run?.game?.gameId ?? run?.gameId ?? null;
  if (!gameId) return { policy: null, unresolved: null, storedMode };
  try {
    const descriptorPath = run?.game?.descriptorPath;
    const gameDir = descriptorPath ? dirname(descriptorPath) : undefined;
    const orchestratorRoot = gameDir && basename(dirname(gameDir)) === "games" ? dirname(dirname(gameDir)) : undefined;
    return { policy: editScopePolicyFromGame(resolveGame({ gameId, orchestratorRoot })), unresolved: null, storedMode };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { policy: null, unresolved: `ordering_unresolved: the ordering policy of game ${gameId} is unknown (${detail})`, storedMode };
  }
}

interface IntegrationScopeCheck {
  result: EditScopeResult;
  headRev: string | null;
  targetUnit: string | null;
  overlayDir: string | null;
  changedPaths: string[];
  deletedPaths: string[];
  /** Certificates whose unit inputs changed since certification (not passed to the checker). */
  staleUnusedChecks: UnusedCheckFreshness["stale"];
  /** Stale certificates for a body in a file the patch rewrites: enforce rejects them (re-certify). */
  staleReconstructed: UnusedCheckFreshness["stale"];
}

function failedScopeResult(mode: EditScopeOrderingPolicy["mode"], error: string, started: number): EditScopeResult {
  return { mode, report: null, error, durationMs: Date.now() - started };
}

/**
 * Post-apply texts of the patch's changed files over the current HEAD,
 * mirrored by repo-relative path under `<dir>/overlay` (the layout
 * `read_overlay` reads). The patch is applied to a throwaway index
 * (`GIT_INDEX_FILE`, `git apply --cached`), so the repo's index and working
 * tree are never touched. Deleted files cannot be expressed in an overlay and
 * are listed separately.
 */
async function buildIntegrationOverlay(params: {
  commandRunner: CommandRunner;
  repoRoot: string;
  patchPath: string;
  dir: string;
}): Promise<{ headRev: string; overlayDir: string; changedPaths: string[]; deletedPaths: string[] }> {
  await rm(params.dir, { recursive: true, force: true });
  const overlayDir = resolve(params.dir, "overlay");
  await mkdir(overlayDir, { recursive: true });
  const env = { GIT_INDEX_FILE: resolve(params.dir, "index") };
  const run = async (command: string[], label: string) => {
    const result = await params.commandRunner(params.repoRoot, command, { env });
    if (result.exitCode !== 0) throw new Error(`${label} exited ${result.exitCode}: ${outputTail(result.stderr || result.stdout, 600)}`);
    return result.stdout;
  };
  const headRev = (await run(["git", "rev-parse", "HEAD"], "git rev-parse HEAD")).trim();
  if (!headRev) throw new Error("git rev-parse HEAD returned no revision");
  await run(["git", "read-tree", headRev], "git read-tree");
  await run(["git", "apply", "--cached", params.patchPath], "git apply --cached");
  const status = await run(["git", "diff", "--cached", "--name-status", "--no-renames", headRev], "git diff --cached");
  const changedPaths: string[] = [];
  const deletedPaths: string[] = [];
  for (const line of status.split("\n")) {
    const [code, path] = line.split("\t");
    if (!code || !path) continue;
    if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`patch path escapes the repo: ${path}`);
    changedPaths.push(path);
    if (code.startsWith("D")) {
      deletedPaths.push(path);
      continue;
    }
    const text = await run(["git", "show", `:${path}`], `git show :${path}`);
    const target = resolve(overlayDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  return { headRev, overlayDir, changedPaths, deletedPaths };
}

/**
 * Classifies the actual patch over the current HEAD (`edit_scope.py check
 * --overlay-dir`), with the checkpoint's bound UNUSED evidence. Runs under the
 * queue's serial claim, so HEAD cannot move underneath it. Never throws:
 * overlay or checker failures come back as `error`.
 */
async function runIntegrationScopeGate(params: {
  commandRunner: CommandRunner;
  repoRoot: string;
  record: WorkerOutputIntegrationRecord;
  patchPath: string;
  store: StateStore;
  artifacts: ApplyArtifacts;
  ordering: EditScopeOrderingPolicy;
  runner?: EditScopeRunner;
  unusedChecks: readonly BoundUnusedCheck[] | null;
}): Promise<IntegrationScopeCheck> {
  const started = Date.now();
  const dir = resolve(params.artifacts.artifactDir, "edit_scope");
  const unit = targetSnapshot(params.store, params.record).unit;
  const targetUnit = typeof unit === "string" && unit ? unit : null;
  let overlay: Awaited<ReturnType<typeof buildIntegrationOverlay>>;
  try {
    overlay = await buildIntegrationOverlay({ commandRunner: params.commandRunner, repoRoot: params.repoRoot, patchPath: params.patchPath, dir });
  } catch (error) {
    return {
      result: failedScopeResult(params.ordering.mode, `integration overlay failed: ${error instanceof Error ? error.message : String(error)}`, started),
      headRev: null, targetUnit, overlayDir: null, changedPaths: [], deletedPaths: [], staleUnusedChecks: [], staleReconstructed: [],
    };
  }
  // Certificates bind to unit content, not to the claim base: a check stays
  // valid while its unit inputs are byte-identical in the texts being checked
  // (the patch's post-apply texts over HEAD), whatever HEAD moved by.
  const deleted = new Set(overlay.deletedPaths);
  const patched = new Set(overlay.changedPaths);
  const readText = async (path: string): Promise<string | null> => {
    if (deleted.has(path)) return null;
    if (patched.has(path)) {
      try {
        return await readFile(resolve(overlay.overlayDir, path), "utf8");
      } catch {
        return null;
      }
    }
    const shown = await params.commandRunner(params.repoRoot, ["git", "show", `${overlay.headRev}:${path}`]);
    return shown.exitCode === 0 ? shown.stdout : null;
  };
  const freshness: UnusedCheckFreshness = params.unusedChecks
    ? await partitionUnusedChecksByContent(params.unusedChecks, readText)
    : { fresh: [], stale: [] };
  const staleReconstructed = freshness.stale.filter((entry) => patched.has(entry.check.file) && !deleted.has(entry.check.file));
  const args = ["check", "--repo", params.repoRoot, "--base-rev", overlay.headRev, "--overlay-dir", overlay.overlayDir];
  if (targetUnit) args.push("--target-unit", targetUnit);
  if (params.unusedChecks) {
    const unusedPath = resolve(dir, "unused_checks.json");
    await writeFile(unusedPath, `${JSON.stringify(freshness.fresh, null, 2)}\n`);
    args.push("--unused-checks", unusedPath);
  }
  const result = await runEditScope({
    runner: params.runner ?? hostEditScopeRunner(integrationEditScopeScript(), params.repoRoot, params.ordering),
    where: "host",
    args,
    policy: params.ordering,
    artifactPath: resolve(dir, "report.json"),
  });
  return {
    result,
    headRev: overlay.headRev,
    targetUnit,
    overlayDir: overlay.overlayDir,
    changedPaths: overlay.changedPaths,
    deletedPaths: overlay.deletedPaths,
    staleUnusedChecks: freshness.stale,
    staleReconstructed,
  };
}

const UNUSED_REJECT_VERDICTS = new Set(["unused_unverified", "dead_unused"]);

/**
 * Stale-certificate reasons that make the check fail: the checker rejected an
 * UNUSED body (with the stale certificate withheld), or a stale certificate
 * covers a body in a file the patch rewrites. Empty when no certificate went
 * stale or the stale ones are irrelevant to this patch.
 */
function staleUnusedFailures(check: IntegrationScopeCheck): string[] {
  if (check.staleUnusedChecks.length === 0) return [];
  const unusedRejected = (check.result.report?.hunks ?? []).some((hunk) => UNUSED_REJECT_VERDICTS.has(hunk.verdict));
  const relevant = unusedRejected ? check.staleUnusedChecks : check.staleReconstructed;
  return relevant.map((entry) => entry.reason);
}

/** Why the integration scope check fails, or null: the checker's problem plus any stale-certificate failure. */
function integrationScopeProblem(check: IntegrationScopeCheck): string | null {
  const stale = staleUnusedFailures(check);
  const problem = editScopeProblem(check.result);
  if (stale.length === 0) return problem;
  return [problem, `edit_scope: ${stale.join("; ")}`].filter(Boolean).join("; ");
}

/** What the outcome and checkpoint record about one integration scope check. */
function integrationScopeRecord(check: IntegrationScopeCheck): Record<string, unknown> {
  return {
    mode: check.result.mode,
    verdict: check.result.report?.verdict ?? null,
    problem: integrationScopeProblem(check),
    error: check.result.error,
    head_rev: check.headRev,
    target_unit: check.targetUnit,
    changed_paths: check.changedPaths,
    deleted_paths: check.deletedPaths,
    artifact_path: check.result.artifactPath ?? null,
    duration_ms: check.result.durationMs,
    report: check.result.report,
    unused_stale: check.staleUnusedChecks.map((entry) => ({
      unit: entry.check.unit,
      file: entry.check.file,
      function: entry.check.function,
      reason: entry.reason,
    })),
  };
}

/**
 * Enforce: terminal `rejected` / `rejected_out_of_scope`, atomically with the
 * checkpoint deselection, before anything touches the index or working tree.
 * Not a blocking conflict: the target is re-admitted next epoch with the
 * reason in its failure reasons (the attempt history the next claim reads).
 */
async function rejectOutOfScope(params: {
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
  artifacts: ApplyArtifacts;
  /** The checker run; null when the policy itself is unknown (`ordering_unresolved`). */
  check: IntegrationScopeCheck | null;
  problem: string;
}): Promise<WorkerOutputIntegrationApplyResult> {
  const stale = params.check ? staleUnusedFailures(params.check) : [];
  const reason = stale.length > 0
    ? `${params.problem}. ${UNUSED_RECERTIFY_INSTRUCTION}`
    : (params.check ? editScopeRejectionReason(params.check.result) : null) ?? params.problem;
  const scope = params.check ? integrationScopeRecord(params.check) : { mode: "enforce", verdict: null, problem: params.problem, ordering_unresolved: params.problem };
  const { updated } = rejectWorkerOutputIntegrationRecord(params.store, {
    outcome: params.record,
    disposition: REJECTED_OUT_OF_SCOPE_DISPOSITION,
    actor: "worker-output-integration",
    reason,
    metadata: {
      rejected_by: "edit_scope",
      reason: params.problem,
      previous_status: params.record.status,
      edit_scope: scope,
      ...(params.check ? {} : { ordering_unresolved: params.problem }),
    },
    update: {
      summaryPath: params.artifacts.summaryPath,
      itemPath: null,
      checkStdoutPath: params.artifacts.checkStdoutPath,
      checkStderrPath: params.artifacts.checkStderrPath,
      applyStdoutPath: null,
      applyStderrPath: null,
      failureReasons: [reason],
      conflictPaths: [],
    },
    checkpointMetadata: {
      integration_rejection: { disposition: REJECTED_OUT_OF_SCOPE_DISPOSITION, outcome_id: params.record.id, reason, edit_scope: scope },
    },
    eventPayload: {
      outcome_id: params.record.id,
      target_key: params.record.targetKey,
      checkpoint_id: params.record.workerCheckpointId,
      disposition: REJECTED_OUT_OF_SCOPE_DISPOSITION,
      reason: params.problem,
      head_rev: params.check?.headRev ?? null,
    },
  });
  const result: WorkerOutputIntegrationApplyResult = {
    id: updated.id,
    status: updated.status,
    disposition: updated.disposition,
    patchPath: updated.patchPath,
    itemPath: updated.itemPath,
    summaryPath: updated.summaryPath,
    failureReasons: updated.failureReasons,
    conflictPaths: updated.conflictPaths,
    integratedRev: null,
  };
  await writeSummary(params.artifacts.summaryPath, result, {
    queue_record: {
      worker_state_id: updated.workerStateId,
      worker_checkpoint_id: updated.workerCheckpointId,
      target_claim_id: updated.targetClaimId,
      epoch_target_id: updated.epochTargetId,
      write_set: updated.writeSet,
    },
    edit_scope: scope,
  });
  return result;
}

/** A re-claimed job whose output a gate already rejected: report it, never apply it. */
function alreadyRejectedResult(record: WorkerOutputIntegrationRecord): WorkerOutputIntegrationApplyResult {
  return {
    id: record.id,
    status: record.status,
    disposition: record.disposition,
    patchPath: record.patchPath,
    itemPath: record.itemPath,
    summaryPath: record.summaryPath,
    failureReasons: record.failureReasons,
    conflictPaths: record.conflictPaths,
    integratedRev: null,
  };
}

async function applyClaimedWorkerOutput(params: {
  commandRunner: CommandRunner;
  dryRun: boolean;
  leaseId: string;
  repoRoot: string;
  stateDir: string;
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
  scope: () => WorkerOutputIntegrationScopeOptions;
}): Promise<WorkerOutputIntegrationApplyResult> {
  // A crash between the rejection transaction and completeJob re-claims the
  // job; the terminal rejection stands and nothing is applied.
  if (params.record.status === "rejected") return alreadyRejectedResult(params.record);

  const artifacts = integrationArtifacts(params.stateDir, params.record.runId, params.record.id);
  await mkdir(artifacts.artifactDir, { recursive: true });

  if (params.dryRun) {
    const result = await updateAndSummarize(params.store, params.record, {
      status: "skipped",
      disposition: "dry_run",
      artifacts,
      failureReasons: ["dry-run agents do not apply worker output patches"],
    });
    addEvent(params.store, params.record.runId, "worker_integration_skipped", "worker-output-integration", result);
    return result;
  }

  if (!params.record.patchPath || !existsSync(params.record.patchPath)) {
    const result = await updateAndSummarize(params.store, params.record, {
      status: "failed",
      disposition: "missing_patch",
      artifacts,
      failureReasons: [`selected checkpoint patch is missing: ${params.record.patchPath ?? "(none)"}`],
    });
    addEvent(params.store, params.record.runId, "worker_integration_conflict", "worker-output-integration", result);
    return result;
  }

  const patchText = await readFile(params.record.patchPath, "utf8");
  if (!patchText.trim()) {
    const result = await updateAndSummarize(params.store, params.record, {
      status: "skipped",
      disposition: "empty_patch",
      artifacts,
      failureReasons: ["selected checkpoint patch was empty"],
    });
    addEvent(params.store, params.record.runId, "worker_integration_skipped", "worker-output-integration", result);
    return result;
  }

  const droppedPaths = checkpointOutOfWriteSetPaths(params.store, params.record);
  if (droppedPaths.length > 0) {
    const failureReasons = [
      `checkpoint validation included paths outside the integration write set; filtered patch would drop: ${droppedPaths.join(", ")}`,
    ];
    await writeFile(artifacts.checkStdoutPath, "");
    await writeFile(artifacts.checkStderrPath, `${failureReasons[0]}\n`);
    return handleApplyConflict({
      artifacts,
      command: ["checkpoint", "write-set-invariant"],
      exitCode: 1,
      failureReasons,
      conflictPaths: droppedPaths,
      stderr: failureReasons[0],
      stderrPath: artifacts.checkStderrPath,
      stdout: "",
      stdoutPath: artifacts.checkStdoutPath,
      store: params.store,
      record: params.record,
      disposition: "checkpoint_write_set_mismatch",
    });
  }

  const checkCommand = ["git", "apply", "--check", params.record.patchPath];
  const check = await params.commandRunner(params.repoRoot, checkCommand);
  await writeFile(artifacts.checkStdoutPath, check.stdout);
  await writeFile(artifacts.checkStderrPath, check.stderr);
  if (check.exitCode !== 0) {
    const conflictPaths = extractConflictPaths(`${check.stdout}\n${check.stderr}`, params.record.writeSet);
    const failureReasons = [`git apply --check exited ${check.exitCode}: ${outputTail(check.stderr || check.stdout, 1000)}`];
    return handleApplyConflict({
      artifacts,
      command: checkCommand,
      exitCode: check.exitCode,
      failureReasons,
      conflictPaths,
      stderr: check.stderr,
      stderrPath: artifacts.checkStderrPath,
      stdout: check.stdout,
      stdoutPath: artifacts.checkStdoutPath,
      store: params.store,
      record: params.record,
      disposition: "apply_check_failed",
    });
  }

  // Order-and-scope fence: classify the patch over the current HEAD before it
  // touches the index or working tree. Enforce rejects on a reject verdict or
  // any checker failure (fail closed); shadow records and applies.
  const unusedChecks = checkpointUnusedChecks(checkpointMetadata(params.store, params.record));
  const { ordering, editScopeRunner, unresolved, storedMode } = params.scope();
  let scopeRecord: Record<string, unknown> | null = null;
  if (!ordering && unresolved) {
    // Unknown policy: fail closed only where the run recorded enforce.
    if (orderingEnforced(storedMode)) {
      return rejectOutOfScope({ store: params.store, record: params.record, artifacts, check: null, problem: unresolved });
    }
  } else if (ordering && orderingActive(ordering.mode)) {
    const check = await runIntegrationScopeGate({
      commandRunner: params.commandRunner,
      repoRoot: params.repoRoot,
      record: params.record,
      patchPath: params.record.patchPath,
      store: params.store,
      artifacts,
      ordering,
      runner: editScopeRunner,
      unusedChecks,
    });
    const problem = integrationScopeProblem(check);
    if (problem && orderingEnforced(ordering.mode)) {
      return rejectOutOfScope({ store: params.store, record: params.record, artifacts, check, problem });
    }
    scopeRecord = integrationScopeRecord(check);
  }

  const applyCommand = ["git", "apply", params.record.patchPath];
  revalidateIntegrationLease(params.store, params.leaseId);
  const apply = await params.commandRunner(params.repoRoot, applyCommand);
  await writeFile(artifacts.applyStdoutPath, apply.stdout);
  await writeFile(artifacts.applyStderrPath, apply.stderr);
  if (apply.exitCode !== 0) {
    const conflictPaths = extractConflictPaths(`${apply.stdout}\n${apply.stderr}`, params.record.writeSet);
    const failureReasons = [`git apply exited ${apply.exitCode}: ${outputTail(apply.stderr || apply.stdout, 1000)}`];
    return handleApplyConflict({
      artifacts,
      command: applyCommand,
      exitCode: apply.exitCode,
      failureReasons,
      conflictPaths,
      stderr: apply.stderr,
      stderrPath: artifacts.applyStderrPath,
      stdout: apply.stdout,
      stdoutPath: artifacts.applyStdoutPath,
      store: params.store,
      record: params.record,
      disposition: "apply_failed",
    });
  }

  // Apply-on-accept: every clean apply commits immediately so new workers can
  // base off the integrated head instead of the epoch-start revision.
  const revisions = await commitAppliedPatch({
    commandRunner: params.commandRunner,
    leaseId: params.leaseId,
    repoRoot: params.repoRoot,
    record: params.record,
    patchPath: params.record.patchPath,
    store: params.store,
    unusedChecks,
  });
  const result = await updateAndSummarize(params.store, params.record, {
    status: "applied",
    disposition: "clean_apply",
    artifacts,
    checkStdoutPath: artifacts.checkStdoutPath,
    checkStderrPath: artifacts.checkStderrPath,
    applyStdoutPath: artifacts.applyStdoutPath,
    applyStderrPath: artifacts.applyStderrPath,
    metadata: {
      validation_state: "tentative",
      pre_apply_rev: revisions.preApplyRev,
      integrated_rev: revisions.integratedRev,
      ...(scopeRecord ? { edit_scope: scopeRecord } : {}),
      ...(!ordering && unresolved ? { ordering_unresolved: unresolved } : {}),
    },
    integratedRev: revisions.integratedRev,
  });
  markTentative(params.store, params.record);
  addEvent(params.store, params.record.runId, "worker_integration_applied", "worker-output-integration", result);
  return result;
}

export async function processWorkerOutputIntegrationQueue(params: {
  commandRunner?: CommandRunner;
  dryRun: boolean;
  leaseId: string;
  limit?: number;
  /**
   * Called as soon as a job's integration commit lands, before the job is
   * completed. headRev arrives only if the whole drain returns, but a commit
   * landed earlier in a drain that later throws is already the checkout head.
   */
  onIntegrated?: (integratedRev: string) => void;
  /**
   * The game's ordering policy for the integration scope gate. Undefined:
   * resolved from the run's game descriptor on the first claimed job (a
   * descriptor that does not resolve records `ordering_unresolved`, and
   * rejects when the run's stored configuration says enforce); null:
   * ordering off (the checker never runs). Pass `orderingPolicy` from the
   * run context wherever the resolved game is at hand.
   */
  ordering?: EditScopeOrderingPolicy | null;
  /** Injectable checker runner (tests); defaults to the host toolpack script. */
  editScopeRunner?: EditScopeRunner;
  repoRoot: string;
  runId: string;
  stateDir: string;
  store: StateStore;
}): Promise<WorkerOutputIntegrationQueueResult> {
  const processed: WorkerOutputIntegrationApplyResult[] = [];
  const limit = Math.max(1, Math.trunc(params.limit ?? 64));
  const commandRunner = params.commandRunner ?? runCommand;
  let headRev: string | null = null;
  let scopeOptions: WorkerOutputIntegrationScopeOptions | null = null;
  const scope = (): WorkerOutputIntegrationScopeOptions => {
    if (!scopeOptions) {
      const resolution = params.ordering !== undefined ? null : runOrderingPolicy(params.store, params.runId);
      scopeOptions = {
        ordering: resolution ? resolution.policy : params.ordering ?? null,
        unresolved: resolution?.unresolved ?? null,
        storedMode: resolution?.storedMode ?? null,
        ...(params.editScopeRunner ? { editScopeRunner: params.editScopeRunner } : {}),
      };
    }
    return scopeOptions;
  };

  while (processed.length < limit) {
    revalidateIntegrationLease(params.store, params.leaseId);
    const claimed = claimNextJob(params.store, {
      kind: "integration",
      concurrencyLimit: 1,
      leaseMs: 15 * 60_000,
      runId: params.runId,
    });
    if (!claimed) break;
    const record = getWorkerOutputIntegration(params.store, claimed.job.jobId);
    if (!record) {
      failJob(params.store, claimed.token, `integration job ${claimed.job.jobId} has no record view`);
      continue;
    }
    try {
      const result = await applyClaimedWorkerOutput({
          commandRunner,
          dryRun: params.dryRun,
          leaseId: params.leaseId,
          repoRoot: params.repoRoot,
          stateDir: params.stateDir,
          store: params.store,
          record,
          scope,
      });
      if (result.integratedRev) params.onIntegrated?.(result.integratedRev);
      completeJob(params.store, claimed.token, { resultRef: result.id });
      processed.push(result);
      if (result.integratedRev) headRev = result.integratedRev;
    } catch (error) {
      failJob(params.store, claimed.token, error instanceof Error ? error.message : String(error));
    }
  }

  return {
    processed,
    queueSummary: workerOutputIntegrationQueueSummary(params.store, params.runId),
    headRev,
  };
}
