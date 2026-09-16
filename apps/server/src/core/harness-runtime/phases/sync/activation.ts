import type { StateStore } from "@server/core/orchestrator-state";
import type { EventActor } from "@server/core/harness-state/events.js";
import { requireActiveLease } from "@server/core/harness-state/lease.js";
import { getSyncState, transitionSync } from "./state.js";
import type { SyncState } from "./types.js";

export interface ActivateAcquiredSyncInput {
  actor: EventActor;
  store: StateStore;
  gameId: string;
  syncId: string;
  leaseId: string;
  commandId: string;
  correlationId: string;
  causationId: string;
  spanId?: string;
  occurredAt?: string;
}

/**
 * Records the operator-authorized start only after dispatch authority exists.
 * The initial click may have happened before a run drained; acquiring the
 * queued handoff lease is the durable condition that permits ingesting.
 */
export function activateAcquiredSync(input: ActivateAcquiredSyncInput): SyncState {
  const lease = requireActiveLease(input.store, input.leaseId, input.gameId);
  if (lease.kind !== "sync" || lease.workflow_id !== input.syncId) {
    throw new Error(
      `Dispatch lease ${lease.lease_id} belongs to ${lease.kind}:${lease.workflow_id}, not sync:${input.syncId}`,
    );
  }
  const sync = getSyncState(input.store, input.syncId);
  if (!sync) throw new Error(`Sync not found: ${input.syncId}`);
  if (sync.game_id !== input.gameId) {
    throw new Error(`Sync ${sync.sync_id} belongs to ${sync.game_id}, not ${input.gameId}`);
  }
  if (sync.status === "ingesting") return sync;
  if (sync.status !== "requested") {
    throw new Error(`sync.start requires requested status; ${sync.sync_id} is ${sync.status}`);
  }
  return transitionSync(input.store, sync.sync_id, {
    actor: input.actor,
    commandId: input.commandId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    expectedRevision: sync.revision,
    occurredAt: input.occurredAt,
    patch: { status: "ingesting" },
    payload: { lease_id: lease.lease_id, activation: "operator_sync_start" },
    spanId: input.spanId,
  });
}
