import type { JsonObject } from "@server/core/harness-state/events.js";
import type { StateStore } from "@server/core/orchestrator-state";
import type { JobRecord } from "@server/core/job-queue/types.js";

/** Restores a worker job payload to the fields written at initial enqueue. */
export function enqueuePayloadForWorkerJob(payload: JsonObject): JsonObject {
  return {
    epoch_target_id: payload.epoch_target_id,
    epoch_id: payload.epoch_id,
    target_key: payload.target_key,
  };
}

export function workerJobHasEnrichment(payload: JsonObject): boolean {
  return typeof payload.worker_state_id === "string" || typeof payload.target_claim_id === "string";
}

/** Checks that claim-time payload fields still name one active worker attempt. */
export function workerJobEnrichmentIsLive(
  store: StateStore,
  job: JobRecord,
  runId: string,
  at: string,
): boolean {
  const workerStateId = job.payload.worker_state_id;
  const targetClaimId = job.payload.target_claim_id;
  const workerId = job.payload.worker_id;
  const epochTargetId = job.payload.epoch_target_id;
  const epochId = job.payload.epoch_id;
  if (
    typeof workerStateId !== "string" || workerStateId.length === 0
    || typeof targetClaimId !== "string" || targetClaimId.length === 0
    || typeof workerId !== "string" || workerId.length === 0
    || typeof epochTargetId !== "string" || epochTargetId.length === 0
    || typeof epochId !== "string" || epochId.length === 0
  ) {
    return false;
  }
  const row = store.db.query(`
    SELECT 1
    FROM target_claims tc
    JOIN worker_state ws ON ws.target_claim_id = tc.id
    WHERE tc.id = ? AND ws.id = ?
      AND tc.run_id = ? AND ws.run_id = tc.run_id
      AND tc.epoch_id = ? AND ws.epoch_id = tc.epoch_id
      AND tc.epoch_target_id = ? AND ws.epoch_target_id = tc.epoch_target_id
      AND tc.worker_id = ? AND ws.worker_id = tc.worker_id
      AND tc.status = 'active'
      AND ws.lifecycle_status = 'running' AND ws.ended_at IS NULL
      AND (tc.ttl IS NULL OR julianday(tc.ttl) > julianday(?))
  `).get(targetClaimId, workerStateId, runId, epochId, epochTargetId, workerId, at);
  return row !== null && row !== undefined;
}
