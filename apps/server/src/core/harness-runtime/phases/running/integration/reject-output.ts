import {
  addEvent,
  updateWorkerOutputIntegration,
  type StateStore,
  type WorkerOutputIntegrationRecord,
  type WorkerOutputIntegrationUpdate,
} from "@server/core/harness-runtime/run-state";
import { immediateTransaction, now } from "@server/core/orchestrator-state";

export interface RejectWorkerOutputIntegrationInput {
  outcome: WorkerOutputIntegrationRecord;
  disposition: string;
  /** Event source: "operator" for resolve-integration, "worker-output-integration" for the queue's gates. */
  actor: string;
  reason: string;
  /** Merged into the outcome's metadata. */
  metadata: Record<string, unknown>;
  /** Further outcome fields (summary path, failure reasons) written in the same transaction. */
  update?: Omit<WorkerOutputIntegrationUpdate, "status" | "disposition" | "resolvedAt" | "metadata">;
  /** Merged into the checkpoint's metadata_json under these keys, in the same transaction. */
  checkpointMetadata?: Record<string, unknown>;
  /** Event payload; defaults to the outcome, target, checkpoint and reason. */
  eventPayload?: Record<string, unknown>;
}

export interface RejectWorkerOutputIntegrationResult {
  updated: WorkerOutputIntegrationRecord;
  resolvedAt: string;
  eventId: string;
}

/**
 * Terminal `rejected` disposition for one worker output, atomically: the
 * outcome row, the checkpoint deselected (`selected = 0`, so the target is
 * re-admitted by the next epoch's board admission) and the event. Callers own
 * their own guards (the operator wrapper's live-lease check; the queue's
 * serial claim).
 */
export function rejectWorkerOutputIntegrationRecord(
  store: StateStore,
  input: RejectWorkerOutputIntegrationInput,
): RejectWorkerOutputIntegrationResult {
  const checkpointId = input.outcome.workerCheckpointId;
  if (!checkpointId) throw new Error(`Worker output integration ${input.outcome.id} has no checkpoint`);
  return immediateTransaction(store.db, () => {
    const resolvedAt = now();
    const updated = updateWorkerOutputIntegration(store, input.outcome.id, {
      ...(input.update ?? {}),
      status: "rejected",
      disposition: input.disposition,
      resolvedAt,
      metadata: input.metadata,
    });
    const checkpointUpdate = store.db
      .query("UPDATE worker_checkpoints SET selected = 0 WHERE id = ?")
      .run(checkpointId);
    if (checkpointUpdate.changes !== 1) {
      throw new Error(`Worker checkpoint not found: ${checkpointId}`);
    }
    if (input.checkpointMetadata) {
      const row = store.db.query("SELECT metadata_json FROM worker_checkpoints WHERE id = ?").get(checkpointId) as { metadata_json?: unknown } | undefined;
      let current: Record<string, unknown> = {};
      try {
        const parsed: unknown = typeof row?.metadata_json === "string" ? JSON.parse(row.metadata_json) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed as Record<string, unknown>;
      } catch {
        current = {};
      }
      store.db
        .query("UPDATE worker_checkpoints SET metadata_json = ? WHERE id = ?")
        .run(JSON.stringify({ ...current, ...input.checkpointMetadata }), checkpointId);
    }
    const eventId = addEvent(store, input.outcome.runId, "worker_integration_rejected", input.actor, input.eventPayload ?? {
      outcome_id: input.outcome.id,
      target_key: input.outcome.targetKey,
      checkpoint_id: checkpointId,
      reason: input.reason,
    });
    return { updated, resolvedAt, eventId };
  });
}
