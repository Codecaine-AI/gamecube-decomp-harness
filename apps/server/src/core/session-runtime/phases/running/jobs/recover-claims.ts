import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  activeClaimsForRun,
  addEvent,
  bestCheckpointForWorkerState,
  closeWorkerState,
  enqueueWorkerOutputIntegration,
  getLatestRun,
  getRun,
  openState,
  workerStateHasExecutionEvidence,
  type ActiveClaimRecord,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import { immediateTransaction, now as currentTime } from "@server/core/orchestrator-state";
import { processWorkerOutputIntegrationQueue, type WorkerOutputIntegrationApplyResult } from "@server/core/session-runtime/phases/running/integration/worker-output-queue.js";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import type { RunBlocker } from "@server/core/shared/types";

export interface RecoverClaimsResult {
  runId: string;
  force: boolean;
  scannedActiveClaims: number;
  recoveredClaims: number;
  recovered: Record<string, unknown>[];
  workerOutputIntegration: { queued: string[]; processed: WorkerOutputIntegrationApplyResult[] } | null;
  blockers: RunBlocker[];
  skippedActiveClaims: Record<string, unknown>[];
}

export interface RecoverActiveClaimsParams {
  globals: GlobalArgs;
  store: StateStore;
  runId: string;
  repoRoot: string;
  force?: boolean;
  claimIdFilter?: string;
  workerStateIdFilter?: string;
  workerIdFilter?: string;
  leaseId?: string;
  reason: string;
  processIntegrations?: boolean;
}

export interface RecoveryJournalRecord {
  recoveryId: string;
  runId: string;
  action: "run.recover" | "run.hard_stop";
  commandId: string;
  correlationId: string;
  recoveryReason: string;
  expectedRunRevision: number;
  cancelledClaimIds: string[];
  cancelledOperationIds: [];
  status: "prepared" | "completed";
  causedByEventId: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PreparedRecoveryClaim {
  claim: ActiveClaimRecord;
  executionEvidence: boolean;
  bestCheckpoint: ReturnType<typeof bestCheckpointForWorkerState>;
  requeued: boolean;
  summaryPath: string;
}

export interface PreparedRunClaimRecovery {
  journal: RecoveryJournalRecord;
  claims: PreparedRecoveryClaim[];
  scannedActiveClaims: number;
}

export interface PrepareRunClaimRecoveryParams extends RecoverActiveClaimsParams {
  action: RecoveryJournalRecord["action"];
  commandId: string;
  correlationId: string;
  expectedRunRevision: number;
}

function claimExpired(ttl: string): boolean {
  const ttlMs = Date.parse(ttl);
  return Number.isFinite(ttlMs) && ttlMs <= Date.now();
}

function recoveryArtifactDir(globals: GlobalArgs, runId: string, workerStateId: string): string {
  return resolve(globals.stateDir, "runs", runId, "worker_state", workerStateId, "state");
}

function recordString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseStringArray(value: unknown, label: string): string[] {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`${label} must be an array of non-empty strings`);
    }
    return parsed.map((item) => String(item));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label} must`)) throw error;
    throw new Error(`Invalid ${label}`, { cause: error });
  }
}

function rowToRecoveryJournal(row: Record<string, unknown>): RecoveryJournalRecord {
  const recoveryId = String(row.recovery_id);
  const action = String(row.action);
  if (action !== "run.recover" && action !== "run.hard_stop") {
    throw new Error(`Recovery journal ${recoveryId} has unsupported action ${action}`);
  }
  const status = String(row.status);
  if (status !== "prepared" && status !== "completed") {
    throw new Error(`Recovery journal ${recoveryId} has unsupported status ${status}`);
  }
  const claimIds = parseStringArray(row.cancelled_claim_ids_json, "cancelled_claim_ids_json");
  if (new Set(claimIds).size !== claimIds.length) {
    throw new Error(`Recovery journal ${recoveryId} contains duplicate cancelled claim ids`);
  }
  const operationIds = parseStringArray(row.cancelled_operation_ids_json, "cancelled_operation_ids_json");
  if (operationIds.length > 0) {
    throw new Error(`Recovery journal ${recoveryId} has unsupported durable operation ids`);
  }
  return {
    recoveryId,
    runId: String(row.run_id),
    action,
    commandId: String(row.command_id),
    correlationId: String(row.correlation_id),
    recoveryReason: String(row.recovery_reason),
    expectedRunRevision: Number(row.expected_run_revision),
    cancelledClaimIds: claimIds,
    cancelledOperationIds: [],
    status,
    causedByEventId: row.caused_by_event_id == null ? null : String(row.caused_by_event_id),
    createdAt: String(row.created_at),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
  };
}

function recoveryJournalById(store: StateStore, recoveryId: string): RecoveryJournalRecord {
  const row = store.db
    .query("SELECT * FROM run_recovery_journal WHERE recovery_id = ?")
    .get(recoveryId) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Recovery journal not found: ${recoveryId}`);
  return rowToRecoveryJournal(row);
}

function recoverySummaryForClaim(store: StateStore, claimId: string): Record<string, unknown> | null {
  const row = store.db
    .query(
      `SELECT worker_state.summary_json
       FROM worker_state
       JOIN target_claims ON target_claims.id = worker_state.target_claim_id
       WHERE target_claims.id = ?`,
    )
    .get(claimId) as { summary_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed: unknown = JSON.parse(String(row.summary_json ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Persists the complete cancelled-subject set before writing recovery files.
 * A prepared row is resumed after a crash and remains the attribution source.
 */
export async function prepareRunClaimRecovery(
  params: PrepareRunClaimRecoveryParams,
): Promise<PreparedRunClaimRecovery> {
  const force = params.force ?? false;
  const allActive = activeClaimsForRun(params.store, params.runId);
  const selected = allActive.filter((claim) => {
    if (params.claimIdFilter && claim.claimId !== params.claimIdFilter) return false;
    if (params.workerStateIdFilter && claim.workerStateId !== params.workerStateIdFilter) return false;
    if (params.workerIdFilter && claim.workerId !== params.workerIdFilter) return false;
    return force || claimExpired(claim.ttl);
  });
  const journal = immediateTransaction(params.store.db, () => {
    const existingRow = params.store.db
      .query("SELECT * FROM run_recovery_journal WHERE run_id = ? AND status = 'prepared'")
      .get(params.runId) as Record<string, unknown> | undefined;
    if (existingRow) {
      const existing = rowToRecoveryJournal(existingRow);
      if (existing.action !== params.action) {
        throw new Error(
          `Run ${params.runId} already has prepared ${existing.action} recovery ${existing.recoveryId}`,
        );
      }
      if (existing.expectedRunRevision !== params.expectedRunRevision) {
        throw new Error(
          `Recovery journal ${existing.recoveryId} expects run revision ${existing.expectedRunRevision}, found ${params.expectedRunRevision}`,
        );
      }
      const merged = [...new Set([...existing.cancelledClaimIds, ...selected.map((claim) => claim.claimId)])];
      if (merged.length !== existing.cancelledClaimIds.length) {
        params.store.db
          .query(
            `UPDATE run_recovery_journal
             SET cancelled_claim_ids_json = ?
             WHERE recovery_id = ? AND status = 'prepared'`,
          )
          .run(JSON.stringify(merged), existing.recoveryId);
      }
      return recoveryJournalById(params.store, existing.recoveryId);
    }
    const recoveryId = randomUUID();
    const createdAt = currentTime();
    params.store.db
      .query(
        `INSERT INTO run_recovery_journal (
           recovery_id, run_id, action, command_id, correlation_id,
           recovery_reason, expected_run_revision, cancelled_claim_ids_json,
           cancelled_operation_ids_json, status, caused_by_event_id, created_at, completed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 'prepared', NULL, ?, NULL)`,
      )
      .run(
        recoveryId,
        params.runId,
        params.action,
        params.commandId,
        params.correlationId,
        params.reason,
        params.expectedRunRevision,
        JSON.stringify(selected.map((claim) => claim.claimId)),
        createdAt,
      );
    return recoveryJournalById(params.store, recoveryId);
  });

  const activeById = new Map(activeClaimsForRun(params.store, params.runId).map((claim) => [claim.claimId, claim]));
  const claims: PreparedRecoveryClaim[] = [];
  for (const claimId of journal.cancelledClaimIds) {
    const claim = activeById.get(claimId);
    if (!claim) {
      const summary = recoverySummaryForClaim(params.store, claimId);
      if (summary?.recovery_id !== journal.recoveryId) {
        throw new Error(
          `Journaled claim ${claimId} is neither active nor settled by recovery ${journal.recoveryId}`,
        );
      }
      continue;
    }
    const executionEvidence = workerStateHasExecutionEvidence(params.store, claim.workerStateId);
    const bestCheckpoint = bestCheckpointForWorkerState(params.store, claim.workerStateId);
    const requeued = bestCheckpoint == null;
    const summaryPath = await writeRecoverySummary({
      claim,
      globals: params.globals,
      recoveryCreatedAt: journal.createdAt,
      recoveryId: journal.recoveryId,
      requeued,
      reason: journal.recoveryReason,
      runId: params.runId,
    });
    claims.push({ claim, executionEvidence, bestCheckpoint, requeued, summaryPath });
  }
  return { journal, claims, scannedActiveClaims: allActive.length };
}

/** Settles every journaled SQL subject inside the caller's run transition tx. */
export function settlePreparedRunClaimRecovery(
  params: PrepareRunClaimRecoveryParams,
  prepared: PreparedRunClaimRecovery,
): RecoverClaimsResult {
  const force = params.force ?? false;
  if (!params.store.db.inTransaction) {
    throw new Error("Prepared run claim recovery must settle inside the run transition transaction");
  }
  const journal = recoveryJournalById(params.store, prepared.journal.recoveryId);
  if (journal.status !== "prepared" || journal.runId !== params.runId || journal.action !== params.action) {
    throw new Error(`Recovery journal ${journal.recoveryId} no longer matches ${params.action} for run ${params.runId}`);
  }
  const recovered: Record<string, unknown>[] = [];
  const queuedIntegrations: string[] = [];
  for (const item of prepared.claims) {
    const claimRow = params.store.db
      .query("SELECT run_id, status FROM target_claims WHERE id = ?")
      .get(item.claim.claimId) as { run_id: string; status: string } | undefined;
    if (!claimRow || claimRow.run_id !== params.runId) {
      throw new Error(`Journaled claim ${item.claim.claimId} does not belong to run ${params.runId}`);
    }
    if (claimRow.status === "closed") {
      const summary = recoverySummaryForClaim(params.store, item.claim.claimId);
      if (summary?.recovery_id !== journal.recoveryId) {
        throw new Error(`Journaled claim ${item.claim.claimId} was closed outside recovery ${journal.recoveryId}`);
      }
      continue;
    }
    if (claimRow.status !== "active") {
      throw new Error(`Journaled claim ${item.claim.claimId} has unsupported status ${claimRow.status}`);
    }
    closeWorkerState(params.store, {
      workerStateId: item.claim.workerStateId,
      lifecycleStatus: "error",
      epochTargetStatus: item.requeued ? "admitted" : "finished",
      errorSummary: `Recovered interrupted active worker: ${journal.recoveryReason}`,
      summary: {
        recovery_id: journal.recoveryId,
        run_id: params.runId,
        epoch_id: item.claim.epochId,
        epoch_target_id: item.claim.epochTargetId,
        target_claim_id: item.claim.claimId,
        worker_state_id: item.claim.workerStateId,
        worker_id: item.claim.workerId,
        target: item.claim.target,
        write_set: item.claim.writeSet,
        summary_path: item.summaryPath,
        recovered_by: "recover-claims",
        recovery_reason: journal.recoveryReason,
        execution_evidence: item.executionEvidence,
        selected_checkpoint_id: item.bestCheckpoint?.id ?? null,
        epoch_target_status: item.requeued ? "admitted" : "finished",
        requeued: item.requeued,
      },
    });
    const wakeEvent = addEvent(params.store, params.runId, "worker_error", "recover-claims", {
      recovery_id: journal.recoveryId,
      worker_state_id: item.claim.workerStateId,
      target_claim_id: item.claim.claimId,
      epoch_target_id: item.claim.epochTargetId,
      worker_id: item.claim.workerId,
      lifecycle_status: "error",
      execution_evidence: item.executionEvidence,
      selected_checkpoint_id: item.bestCheckpoint?.id ?? null,
      epoch_target_status: item.requeued ? "admitted" : "finished",
      requeued: item.requeued,
      summary_path: item.summaryPath,
      reason: journal.recoveryReason,
    });
    let integrationItemId: string | null = null;
    if (item.bestCheckpoint) {
      const integration = enqueueWorkerOutputIntegration(params.store, {
        runId: params.runId,
        epochId: item.claim.epochId,
        epochTargetId: item.claim.epochTargetId,
        targetClaimId: item.claim.claimId,
        workerStateId: item.claim.workerStateId,
        workerCheckpointId: item.bestCheckpoint.id,
        targetKey: `${recordString(item.claim.target.unit)}::${recordString(item.claim.target.symbol)}`,
        patchPath: item.bestCheckpoint.patchPath,
        diffPath: item.bestCheckpoint.diffPath,
        writeSet: item.claim.writeSet,
        metadata: {
          recovery_id: journal.recoveryId,
          lifecycle_status: "error",
          recovered_by: "recover-claims",
          recovery_reason: journal.recoveryReason,
          worker_state_summary_path: item.summaryPath,
          worker_worktree_path: item.claim.worktreePath ?? null,
          target: item.claim.target,
        },
      });
      integrationItemId = integration.id;
      queuedIntegrations.push(integration.id);
    }
    recovered.push({
      claimId: item.claim.claimId,
      workerStateId: item.claim.workerStateId,
      epochTargetId: item.claim.epochTargetId,
      workerId: item.claim.workerId,
      target: item.claim.target,
      writeSet: item.claim.writeSet,
      executionEvidence: item.executionEvidence,
      selectedCheckpointId: item.bestCheckpoint?.id ?? null,
      epochTargetStatus: item.requeued ? "admitted" : "finished",
      requeued: item.requeued,
      wakeEvent,
      workerStateSummary: item.summaryPath,
      workerOutputIntegrationItemId: integrationItemId,
    });
  }

  for (const claimId of journal.cancelledClaimIds) {
    const row = params.store.db
      .query("SELECT run_id, status FROM target_claims WHERE id = ?")
      .get(claimId) as { run_id: string; status: string } | undefined;
    const summary = recoverySummaryForClaim(params.store, claimId);
    if (!row || row.run_id !== params.runId || row.status !== "closed" || summary?.recovery_id !== journal.recoveryId) {
      throw new Error(`Recovery ${journal.recoveryId} did not settle journaled claim ${claimId}`);
    }
  }
  const remainingActive = activeClaimsForRun(params.store, params.runId);
  if (remainingActive.length > 0) {
    throw new Error(
      `Recovery ${journal.recoveryId} found unjournaled active claim(s): ${remainingActive.map((claim) => claim.claimId).join(", ")}`,
    );
  }
  const blockers: RunBlocker[] = [];
  if (queuedIntegrations.length > 0) {
    blockers.push({
      code: "worker_output_integration_lease_unavailable",
      message: `Recovery left worker output integration work queued until dispatch authority is available: ${queuedIntegrations.join(", ")}`,
      source_kind: "worker_output_integration",
      source_id: queuedIntegrations.join(","),
      recoverable: true,
    });
  }
  return {
    runId: params.runId,
    force,
    scannedActiveClaims: prepared.scannedActiveClaims,
    recoveredClaims: journal.cancelledClaimIds.length,
    recovered: journal.cancelledClaimIds.map((claimId) =>
      recovered.find((entry) => entry.claimId === claimId) ?? { claimId, recoveryId: journal.recoveryId },
    ),
    workerOutputIntegration:
      queuedIntegrations.length > 0 ? { queued: queuedIntegrations, processed: [] } : null,
    blockers,
    skippedActiveClaims: [],
  };
}

export function completeRunRecoveryJournal(
  store: StateStore,
  input: { recoveryId: string; causedByEventId: string; completedAt?: string },
): RecoveryJournalRecord {
  if (!store.db.inTransaction) {
    throw new Error("Recovery journal completion must share the run transition transaction");
  }
  const result = store.db
    .query(
      `UPDATE run_recovery_journal
       SET status = 'completed', caused_by_event_id = ?, completed_at = ?
       WHERE recovery_id = ? AND status = 'prepared'`,
    )
    .run(input.causedByEventId, input.completedAt ?? currentTime(), input.recoveryId);
  if (result.changes !== 1) throw new Error(`Recovery journal ${input.recoveryId} could not be completed`);
  return recoveryJournalById(store, input.recoveryId);
}

export async function recoverActiveClaims(params: RecoverActiveClaimsParams): Promise<RecoverClaimsResult> {
  const preparedJournal = params.store.db
    .query("SELECT recovery_id, action FROM run_recovery_journal WHERE run_id = ? AND status = 'prepared'")
    .get(params.runId) as { recovery_id: string; action: string } | undefined;
  if (preparedJournal) {
    throw new Error(
      `Run ${params.runId} has prepared ${preparedJournal.action} recovery ${preparedJournal.recovery_id}; resume that run control operation before standalone claim recovery`,
    );
  }
  const force = params.force ?? false;
  const claimIdFilter = params.claimIdFilter ?? "";
  const workerStateIdFilter = params.workerStateIdFilter ?? "";
  const workerIdFilter = params.workerIdFilter ?? "";
  const processIntegrations = params.processIntegrations ?? true;
  const activeClaims = activeClaimsForRun(params.store, params.runId);
  const selectedClaims = activeClaims.filter((claim) => {
    if (claimIdFilter && claim.claimId !== claimIdFilter) return false;
    if (workerStateIdFilter && claim.workerStateId !== workerStateIdFilter) return false;
    if (workerIdFilter && claim.workerId !== workerIdFilter) return false;
    return force || claimExpired(claim.ttl);
  });
  const skippedClaims = activeClaims.filter((claim) => !selectedClaims.some((selected) => selected.claimId === claim.claimId));
  const recovered: Record<string, unknown>[] = [];
  const queuedIntegrations: string[] = [];
  const blockers: RunBlocker[] = [];

  for (const claim of selectedClaims) {
    const hadExecutionEvidence = workerStateHasExecutionEvidence(params.store, claim.workerStateId);
    const bestCheckpoint = bestCheckpointForWorkerState(params.store, claim.workerStateId);
    const requeued = bestCheckpoint == null;
    const summaryPath = await writeRecoverySummary({ claim, globals: params.globals, requeued, reason: params.reason, runId: params.runId });
    closeWorkerState(params.store, {
      workerStateId: claim.workerStateId,
      lifecycleStatus: "error",
      epochTargetStatus: requeued ? "admitted" : "finished",
      errorSummary: `Recovered interrupted active worker: ${params.reason}`,
      summary: {
        run_id: params.runId,
        epoch_id: claim.epochId,
        epoch_target_id: claim.epochTargetId,
        target_claim_id: claim.claimId,
        worker_state_id: claim.workerStateId,
        worker_id: claim.workerId,
        target: claim.target,
        write_set: claim.writeSet,
        summary_path: summaryPath,
        recovered_by: "recover-claims",
        recovery_reason: params.reason,
        execution_evidence: hadExecutionEvidence,
        selected_checkpoint_id: bestCheckpoint?.id ?? null,
        epoch_target_status: requeued ? "admitted" : "finished",
        requeued,
      },
    });
    const wakeEvent = addEvent(params.store, params.runId, "worker_error", "recover-claims", {
      worker_state_id: claim.workerStateId,
      target_claim_id: claim.claimId,
      epoch_target_id: claim.epochTargetId,
      worker_id: claim.workerId,
      lifecycle_status: "error",
      execution_evidence: hadExecutionEvidence,
      selected_checkpoint_id: bestCheckpoint?.id ?? null,
      epoch_target_status: requeued ? "admitted" : "finished",
      requeued,
      summary_path: summaryPath,
      reason: params.reason,
    });
    let integrationItemId: string | null = null;
    if (bestCheckpoint) {
      const item = enqueueWorkerOutputIntegration(params.store, {
        runId: params.runId,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        workerStateId: claim.workerStateId,
        workerCheckpointId: bestCheckpoint.id,
        targetKey: `${recordString(claim.target.unit)}::${recordString(claim.target.symbol)}`,
        patchPath: bestCheckpoint.patchPath,
        diffPath: bestCheckpoint.diffPath,
        writeSet: claim.writeSet,
        metadata: {
          lifecycle_status: "error",
          recovered_by: "recover-claims",
          recovery_reason: params.reason,
          worker_state_summary_path: summaryPath,
          worker_worktree_path: claim.worktreePath ?? null,
          target: claim.target,
        },
      });
      integrationItemId = item.id;
      queuedIntegrations.push(item.id);
    }
    recovered.push({
      claimId: claim.claimId,
      workerStateId: claim.workerStateId,
      epochTargetId: claim.epochTargetId,
      workerId: claim.workerId,
      target: claim.target,
      writeSet: claim.writeSet,
      executionEvidence: hadExecutionEvidence,
      selectedCheckpointId: bestCheckpoint?.id ?? null,
      epochTargetStatus: requeued ? "admitted" : "finished",
      requeued,
      wakeEvent,
      workerStateSummary: summaryPath,
      workerOutputIntegrationItemId: integrationItemId,
    });
  }
  let workerOutputIntegration: { queued: string[]; processed: WorkerOutputIntegrationApplyResult[] } | null = null;
  if (queuedIntegrations.length > 0) {
    workerOutputIntegration = { queued: queuedIntegrations, processed: [] };
  }
  if (processIntegrations && queuedIntegrations.length > 0 && params.leaseId?.trim()) {
    const integration = await processWorkerOutputIntegrationQueue({
      dryRun: params.globals.dryRunAgents,
      leaseId: params.leaseId,
      repoRoot: params.repoRoot,
      runId: params.runId,
      stateDir: params.globals.stateDir,
      store: params.store,
      limit: Math.max(16, queuedIntegrations.length),
    });
    workerOutputIntegration = {
      queued: queuedIntegrations,
      processed: integration.processed,
    };
  } else if (processIntegrations && queuedIntegrations.length > 0) {
    blockers.push({
      code: "worker_output_integration_lease_unavailable",
      message: `Recovery left worker output integration work queued until dispatch authority is available: ${queuedIntegrations.join(", ")}`,
      source_kind: "worker_output_integration",
      source_id: queuedIntegrations.join(","),
      recoverable: true,
    });
  }

  return {
    runId: params.runId,
    force,
    scannedActiveClaims: activeClaims.length,
    recoveredClaims: recovered.length,
    recovered,
    workerOutputIntegration,
    blockers,
    skippedActiveClaims: skippedClaims.map((claim) => ({
      claimId: claim.claimId,
      workerStateId: claim.workerStateId,
      workerId: claim.workerId,
      ttl: claim.ttl,
      target: claim.target,
      reason:
        claimIdFilter && claim.claimId !== claimIdFilter
          ? "claim_id_filter"
          : workerStateIdFilter && claim.workerStateId !== workerStateIdFilter
            ? "worker_state_id_filter"
            : workerIdFilter && claim.workerId !== workerIdFilter
              ? "worker_id_filter"
              : force
                ? "filtered"
                : "not_expired_without_force",
    })),
  };
}

async function writeRecoverySummary(params: {
  claim: ActiveClaimRecord;
  globals: GlobalArgs;
  recoveryCreatedAt?: string;
  recoveryId?: string;
  requeued: boolean;
  reason: string;
  runId: string;
}): Promise<string> {
  const artifactDir = recoveryArtifactDir(params.globals, params.runId, params.claim.workerStateId);
  await mkdir(artifactDir, { recursive: true });
  const summaryPath = resolve(artifactDir, "recovered_worker_state.json");
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        run_id: params.runId,
        recovery_id: params.recoveryId ?? null,
        epoch_id: params.claim.epochId,
        epoch_target_id: params.claim.epochTargetId,
        target_claim_id: params.claim.claimId,
        worker_state_id: params.claim.workerStateId,
        worker_id: params.claim.workerId,
        target: params.claim.target,
        write_set: params.claim.writeSet,
        worktree_path: params.claim.worktreePath ?? null,
        lifecycle_status: "error",
        epoch_target_status: params.requeued ? "admitted" : "finished",
        requeued: params.requeued,
        recovered_by: "recover-claims",
        recovery_reason: params.reason,
        ttl: params.claim.ttl,
        heartbeat_at: params.claim.heartbeatAt,
        recovered_at: params.recoveryCreatedAt ?? new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return summaryPath;
}

export async function recoverClaims(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const force = booleanArg(args, "--force");
    const claimIdFilter = stringArg(args, "--claim-id", "");
    const workerStateIdFilter = stringArg(args, "--worker-state-id", "");
    const workerIdFilter = stringArg(args, "--worker-id", "");
    const leaseId = stringArg(args, "--lease-id", "").trim() || undefined;
    const reason = stringArg(args, "--reason", force ? "forced worker recovery after interrupted worker process" : "expired worker claim recovery");
    const result = await recoverActiveClaims({
      globals,
      store,
      runId,
      repoRoot: run.project?.repoRoot ?? globals.repoRoot,
      force,
      claimIdFilter,
      workerStateIdFilter,
      workerIdFilter,
      leaseId,
      reason,
    });

    console.log(
      JSON.stringify(
        result,
        null,
        2,
      ),
    );
  } finally {
    store.db.close();
  }
}
