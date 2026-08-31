import { randomUUID } from "node:crypto";
import { enqueueJob, getJob, getJobByDedupeKey } from "@server/core/job-queue/kernel.js";
import type { JobRecord } from "@server/core/job-queue/types.js";
import { immediateTransaction, now, withBusyRetry, type StateStore } from "@server/core/orchestrator-state";

export type WorkerOutputIntegrationStatus =
  | "queued" | "applying" | "applied" | "conflict" | "skipped" | "failed"
  | "resolved" | "needs_rework" | "blocked" | "rejected" | "resolver_failed";

type OutcomeStatus = Exclude<WorkerOutputIntegrationStatus, "queued" | "applying">;

export interface WorkerOutputIntegrationInput {
  runId: string; epochId: string; epochTargetId: string; targetClaimId: string;
  workerStateId: string; workerCheckpointId: string; targetKey?: string | null;
  patchPath?: string | null; diffPath?: string | null; writeSet?: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkerOutputIntegrationRecord {
  id: string; runId: string; epochId: string; epochTargetId: string; targetClaimId: string;
  workerStateId: string; workerCheckpointId: string | null; status: WorkerOutputIntegrationStatus;
  disposition: string | null; targetKey: string | null; patchPath: string | null;
  diffPath: string | null; itemPath: string | null; summaryPath: string | null;
  checkStdoutPath: string | null; checkStderrPath: string | null; applyStdoutPath: string | null;
  applyStderrPath: string | null; writeSet: string[]; conflictPaths: string[];
  failureReasons: string[]; metadata: Record<string, unknown>; createdAt: string;
  updatedAt: string; resolvedAt: string | null;
}

export interface WorkerOutputIntegrationUpdate {
  status?: WorkerOutputIntegrationStatus; disposition?: string | null; itemPath?: string | null;
  summaryPath?: string | null; checkStdoutPath?: string | null; checkStderrPath?: string | null;
  applyStdoutPath?: string | null; applyStderrPath?: string | null; conflictPaths?: string[];
  failureReasons?: string[]; metadata?: Record<string, unknown>; resolvedAt?: string | null;
}

const ACTIVE_JOB_STATUSES = ["queued", "claimed", "running", "waiting"] as const;
const BLOCKING_OUTCOMES = ["conflict", "failed", "needs_rework", "blocked", "resolver_failed"] as const;

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []; }
  catch { return []; }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

function outcomeFromRow(row: Record<string, unknown>): WorkerOutputIntegrationRecord {
  return {
    id: String(row.id), runId: String(row.run_id), epochId: String(row.epoch_id),
    epochTargetId: String(row.epoch_target_id), targetClaimId: String(row.target_claim_id),
    workerStateId: String(row.worker_state_id), workerCheckpointId: String(row.worker_checkpoint_id),
    status: String(row.status) as OutcomeStatus, disposition: row.disposition == null ? null : String(row.disposition),
    targetKey: row.target_key == null ? null : String(row.target_key), patchPath: row.patch_path == null ? null : String(row.patch_path),
    diffPath: row.diff_path == null ? null : String(row.diff_path), itemPath: row.item_path == null ? null : String(row.item_path),
    summaryPath: row.summary_path == null ? null : String(row.summary_path), checkStdoutPath: row.check_stdout_path == null ? null : String(row.check_stdout_path),
    checkStderrPath: row.check_stderr_path == null ? null : String(row.check_stderr_path), applyStdoutPath: row.apply_stdout_path == null ? null : String(row.apply_stdout_path),
    applyStderrPath: row.apply_stderr_path == null ? null : String(row.apply_stderr_path), writeSet: stringArray(row.write_set_json),
    conflictPaths: stringArray(row.conflict_paths_json), failureReasons: stringArray(row.failure_reasons_json), metadata: jsonObject(row.metadata_json),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
  };
}

function jobRecord(store: StateStore, job: JobRecord): WorkerOutputIntegrationRecord {
  const p = job.payload;
  const checkpointId = String(p.worker_checkpoint_id);
  const checkpoint = store.db.query("SELECT patch_path, diff_path, write_set_json FROM worker_checkpoints WHERE id = ?").get(checkpointId) as Record<string, unknown> | undefined;
  return {
    id: job.jobId, runId: String(p.run_id), epochId: String(p.epoch_id), epochTargetId: String(p.epoch_target_id),
    targetClaimId: String(p.target_claim_id), workerStateId: String(p.worker_state_id), workerCheckpointId: checkpointId,
    status: job.status === "claimed" || job.status === "running" ? "applying" : "queued", disposition: null,
    targetKey: p.target_key == null ? null : String(p.target_key), patchPath: checkpoint?.patch_path == null ? null : String(checkpoint.patch_path),
    diffPath: checkpoint?.diff_path == null ? null : String(checkpoint.diff_path), itemPath: null, summaryPath: null,
    checkStdoutPath: null, checkStderrPath: null, applyStdoutPath: null, applyStderrPath: null,
    writeSet: stringArray(checkpoint?.write_set_json), conflictPaths: [], failureReasons: [], metadata: jsonObject(p.metadata),
    createdAt: job.createdAt, updatedAt: job.updatedAt, resolvedAt: null,
  };
}

export function getWorkerOutputIntegration(store: StateStore, id: string): WorkerOutputIntegrationRecord | null {
  const outcome = withBusyRetry(() => store.db.query("SELECT * FROM integration_outcomes WHERE id = ?").get(id) as Record<string, unknown> | undefined);
  if (outcome) return outcomeFromRow(outcome);
  const job = getJob(store, id);
  return job?.kind === "integration" ? jobRecord(store, job) : null;
}

export function enqueueWorkerOutputIntegration(store: StateStore, input: WorkerOutputIntegrationInput): WorkerOutputIntegrationRecord {
  const existingOutcome = store.db.query("SELECT * FROM integration_outcomes WHERE worker_checkpoint_id = ?").get(input.workerCheckpointId) as Record<string, unknown> | undefined;
  const existingJob = getJobByDedupeKey(store, "integration", input.workerCheckpointId);
  if (existingJob && ACTIVE_JOB_STATUSES.includes(existingJob.status as typeof ACTIVE_JOB_STATUSES[number])) return jobRecord(store, existingJob);
  if (existingOutcome && existingJob?.status === "succeeded") return outcomeFromRow(existingOutcome);
  const game = store.db.query("SELECT game_id FROM runs WHERE id = ?").get(input.runId) as { game_id?: string } | undefined;
  if (!game?.game_id) throw new Error(`Run ${input.runId} has no game id`);
  const job = enqueueJob(store, {
    kind: "integration", dedupeKey: input.workerCheckpointId, gameId: game.game_id, runId: input.runId,
    priority: 0, concurrencyKey: input.runId, executionClass: "local",
    payload: { run_id: input.runId, epoch_id: input.epochId, epoch_target_id: input.epochTargetId,
      target_claim_id: input.targetClaimId, worker_state_id: input.workerStateId,
      worker_checkpoint_id: input.workerCheckpointId, target_key: input.targetKey ?? null,
      metadata: (input.metadata ?? {}) as never },
  });
  return jobRecord(store, job);
}

export function updateWorkerOutputIntegration(store: StateStore, id: string, patch: WorkerOutputIntegrationUpdate): WorkerOutputIntegrationRecord {
  return immediateTransaction(store.db, () => {
    const currentRow = store.db.query("SELECT * FROM integration_outcomes WHERE id=?").get(id) as Record<string, unknown> | undefined;
    const base = currentRow ? outcomeFromRow(currentRow) : getWorkerOutputIntegration(store, id);
    if (!base || !base.workerCheckpointId) throw new Error(`Worker output integration not found: ${id}`);
    const status = patch.status ?? base.status;
    if (status === "queued" || status === "applying") throw new Error(`Dispatch status ${status} belongs to the job kernel`);
    const at = now(); const metadata = patch.metadata ? { ...base.metadata, ...patch.metadata } : base.metadata;
    store.db.query(`INSERT INTO integration_outcomes (id,run_id,epoch_id,epoch_target_id,target_claim_id,worker_state_id,worker_checkpoint_id,status,disposition,target_key,patch_path,diff_path,item_path,summary_path,check_stdout_path,check_stderr_path,apply_stdout_path,apply_stderr_path,write_set_json,conflict_paths_json,failure_reasons_json,metadata_json,created_at,updated_at,resolved_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(worker_checkpoint_id) DO UPDATE SET status=excluded.status,disposition=excluded.disposition,target_key=excluded.target_key,patch_path=excluded.patch_path,diff_path=excluded.diff_path,item_path=excluded.item_path,summary_path=excluded.summary_path,check_stdout_path=excluded.check_stdout_path,check_stderr_path=excluded.check_stderr_path,apply_stdout_path=excluded.apply_stdout_path,apply_stderr_path=excluded.apply_stderr_path,write_set_json=excluded.write_set_json,conflict_paths_json=excluded.conflict_paths_json,failure_reasons_json=excluded.failure_reasons_json,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at,resolved_at=excluded.resolved_at`).run(
      base.id,base.runId,base.epochId,base.epochTargetId,base.targetClaimId,base.workerStateId,base.workerCheckpointId,status,
      patch.disposition === undefined ? base.disposition : patch.disposition,base.targetKey,base.patchPath,base.diffPath,
      patch.itemPath === undefined ? base.itemPath : patch.itemPath,patch.summaryPath === undefined ? base.summaryPath : patch.summaryPath,
      patch.checkStdoutPath === undefined ? base.checkStdoutPath : patch.checkStdoutPath,patch.checkStderrPath === undefined ? base.checkStderrPath : patch.checkStderrPath,
      patch.applyStdoutPath === undefined ? base.applyStdoutPath : patch.applyStdoutPath,patch.applyStderrPath === undefined ? base.applyStderrPath : patch.applyStderrPath,
      JSON.stringify(base.writeSet),JSON.stringify(patch.conflictPaths ?? base.conflictPaths),JSON.stringify(patch.failureReasons ?? base.failureReasons),JSON.stringify(metadata),
      currentRow ? base.createdAt : at,at,patch.resolvedAt === undefined ? base.resolvedAt : patch.resolvedAt);
    return outcomeFromRow(store.db.query("SELECT * FROM integration_outcomes WHERE worker_checkpoint_id=?").get(base.workerCheckpointId) as Record<string, unknown>);
  });
}

export function workerOutputIntegrationQueueSummary(store: StateStore, runId: string): Record<string, unknown> {
  const outcomeRows = store.db.query("SELECT status,COUNT(*) count FROM integration_outcomes WHERE run_id=? GROUP BY status").all(runId) as Record<string, unknown>[];
  const jobRows = store.db.query("SELECT status,COUNT(*) count FROM jobs WHERE kind='integration' AND run_id=? AND status IN ('queued','claimed','running','waiting') GROUP BY status").all(runId) as Record<string, unknown>[];
  const counts: Record<string, number> = {}; for (const row of [...outcomeRows,...jobRows]) counts[String(row.status)] = (counts[String(row.status)] ?? 0) + Number(row.count);
  const jobs = store.db.query("SELECT job_id id,payload_json, status,created_at,updated_at FROM jobs WHERE kind='integration' AND run_id=? AND status IN ('queued','claimed','running','waiting') ORDER BY created_at").all(runId) as Record<string, unknown>[];
  const outcomes = store.db.query("SELECT id,worker_state_id,worker_checkpoint_id,status,target_key,patch_path,item_path,created_at,updated_at FROM integration_outcomes WHERE run_id=? AND status IN ('conflict','failed','needs_rework','blocked','resolver_failed') ORDER BY created_at").all(runId) as Record<string, unknown>[];
  return { schema_version: "worker_output_integration_queue_summary_v1", run_id: runId, counts, pending: [...jobs,...outcomes] };
}

export function blockingWorkerOutputIntegrationCount(store: StateStore, runId: string): number {
  const jobs = store.db.query("SELECT COUNT(*) count FROM jobs WHERE kind='integration' AND run_id=? AND status IN ('queued','claimed','running','waiting')").get(runId) as { count: number };
  const outcomes = store.db.query("SELECT COUNT(*) count FROM integration_outcomes WHERE run_id=? AND status IN ('conflict','failed','needs_rework','blocked','resolver_failed')").get(runId) as { count: number };
  return Number(jobs.count) + Number(outcomes.count);
}
