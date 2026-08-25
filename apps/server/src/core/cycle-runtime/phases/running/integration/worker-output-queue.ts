import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCommand } from "@server/infrastructure/shell";
import {
  addEvent,
  getWorkerOutputIntegration,
  updateWorkerOutputIntegration,
  workerOutputIntegrationQueueSummary,
  type StateStore,
  type WorkerOutputIntegrationRecord,
  type WorkerOutputIntegrationStatus,
} from "@server/core/cycle-runtime/run-state";
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

async function commitAppliedPatch(params: {
  commandRunner: CommandRunner;
  leaseId: string;
  repoRoot: string;
  record: WorkerOutputIntegrationRecord;
  patchPath: string;
  paths?: string[];
  store: StateStore;
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
    "-m",
    integrationCommitMessage(params.record),
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

async function applyClaimedWorkerOutput(params: {
  commandRunner: CommandRunner;
  dryRun: boolean;
  leaseId: string;
  repoRoot: string;
  stateDir: string;
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
}): Promise<WorkerOutputIntegrationApplyResult> {
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
  repoRoot: string;
  runId: string;
  stateDir: string;
  store: StateStore;
}): Promise<WorkerOutputIntegrationQueueResult> {
  const processed: WorkerOutputIntegrationApplyResult[] = [];
  const limit = Math.max(1, Math.trunc(params.limit ?? 64));
  const commandRunner = params.commandRunner ?? runCommand;
  let headRev: string | null = null;

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
      });
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
