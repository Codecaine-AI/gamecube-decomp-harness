import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  activeClaimsForSession,
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
import { processWorkerOutputIntegrationQueue, type WorkerOutputIntegrationApplyResult } from "@server/core/session-runtime/phases/running/integration/worker-output-queue.js";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/project-registry/runtime-options.js";

export interface RecoverClaimsResult {
  runId: string;
  force: boolean;
  scannedActiveClaims: number;
  recoveredClaims: number;
  recovered: Record<string, unknown>[];
  workerOutputIntegration: { queued: string[]; processed: WorkerOutputIntegrationApplyResult[] } | null;
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
  reason: string;
  processIntegrations?: boolean;
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

export async function recoverActiveClaims(params: RecoverActiveClaimsParams): Promise<RecoverClaimsResult> {
  const force = params.force ?? false;
  const claimIdFilter = params.claimIdFilter ?? "";
  const workerStateIdFilter = params.workerStateIdFilter ?? "";
  const workerIdFilter = params.workerIdFilter ?? "";
  const processIntegrations = params.processIntegrations ?? true;
  const activeClaims = activeClaimsForSession(params.store, params.runId);
  const selectedClaims = activeClaims.filter((claim) => {
    if (claimIdFilter && claim.claimId !== claimIdFilter) return false;
    if (workerStateIdFilter && claim.workerStateId !== workerStateIdFilter) return false;
    if (workerIdFilter && claim.workerId !== workerIdFilter) return false;
    return force || claimExpired(claim.ttl);
  });
  const skippedClaims = activeClaims.filter((claim) => !selectedClaims.some((selected) => selected.claimId === claim.claimId));
  const recovered: Record<string, unknown>[] = [];
  const queuedIntegrations: string[] = [];

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
        session_id: params.runId,
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
        sessionId: params.runId,
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
  if (processIntegrations && queuedIntegrations.length > 0) {
    const integration = await processWorkerOutputIntegrationQueue({
      dryRun: params.globals.dryRunAgents,
      repoRoot: params.repoRoot,
      sessionId: params.runId,
      stateDir: params.globals.stateDir,
      store: params.store,
      limit: Math.max(16, queuedIntegrations.length),
    });
    workerOutputIntegration = {
      queued: queuedIntegrations,
      processed: integration.processed,
    };
  }

  return {
    runId: params.runId,
    force,
    scannedActiveClaims: activeClaims.length,
    recoveredClaims: recovered.length,
    recovered,
    workerOutputIntegration,
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
        session_id: params.runId,
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
        recovered_at: new Date().toISOString(),
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
