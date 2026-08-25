import { randomUUID } from "node:crypto";
import {
  getHarnessState,
  initializeHarnessState,
  releaseDispatch,
  requestDispatch,
  requireActiveLease,
  requireLease,
  type DispatchLease,
  type DispatchKind,
  type EventActor,
} from "@server/core/harness-state";
import { newSpanId } from "@server/core/harness-state/events.js";
import { openState } from "@server/core/orchestrator-state";

export interface DispatchGuardContext {
  game?: { gameId: string } | null;
  stateDir: string;
}

export interface DispatchGuardInput {
  actor?: EventActor;
  beginHandoffOnQueue?: boolean;
  commandId?: string;
  kind: DispatchKind;
  gameId?: string;
  reason: string;
  spanId?: string;
  stopRunOnHandoff?: (input: { reason: string; runId: string }) => Promise<unknown>;
  workflowId: string;
}

export type DispatchLeaseRevalidator = () => DispatchLease;

export class DispatchLeaseUnavailableError extends Error {
  readonly blockedBy: { kind: DispatchKind; workflowId: string; leaseId: string };

  constructor(blockedBy: { kind: DispatchKind; workflowId: string; leaseId: string }) {
    super(`Dispatch lease is held by ${blockedBy.kind}:${blockedBy.workflowId}`);
    this.name = "DispatchLeaseUnavailableError";
    this.blockedBy = blockedBy;
  }
}

function gameIdFor(context: DispatchGuardContext, input: DispatchGuardInput): string {
  const gameId = input.gameId ?? context.game?.gameId;
  if (!gameId) throw new Error(`${input.kind} dispatch requires a game id`);
  return gameId;
}

/**
 * Runs one checkout-mutating workflow section under the canonical dispatch
 * lease. Acquisition, fencing, and release all go through harness-state's
 * public API; the workflow body never reaches into harness_state directly.
 */
export async function withDispatchLease<T>(
  context: DispatchGuardContext,
  input: DispatchGuardInput,
  operation: (leaseId: string, revalidateLease: DispatchLeaseRevalidator) => Promise<T>,
): Promise<T> {
  const gameId = gameIdFor(context, input);
  const actor = input.actor ?? "operator";
  const commandId = input.commandId ?? `command-${input.kind}-${randomUUID()}`;
  const actionSpanId = input.spanId ?? newSpanId();
  const store = openState(context.stateDir);
  let leaseId: string | null = null;
  try {
    initializeHarnessState(store, { gameId, traceId: `trace-game-${gameId}` });
    const current = getHarnessState(store, gameId)?.active_workflow;
    if (
      input.beginHandoffOnQueue &&
      current?.kind === input.kind &&
      current.workflow_id === input.workflowId &&
      current.status === "active"
    ) {
      leaseId = current.lease_id;
      requireActiveLease(store, leaseId, gameId);
      const revalidateLease: DispatchLeaseRevalidator = () => requireLease(store, leaseId!, gameId);
      return await operation(leaseId, revalidateLease);
    }
    const decision = requestDispatch(store, {
      actor,
      commandId,
      correlationId: input.workflowId,
      kind: input.kind,
      gameId,
      reason: input.reason,
      handoffOnQueue: input.beginHandoffOnQueue,
      workflowId: input.workflowId,
      spanId: actionSpanId,
    });
    if (decision.queued) {
      if (input.beginHandoffOnQueue) {
        if (actor !== "operator") throw new Error("Dispatch handoff activation is operator-only");
        const holder = decision.blockedBy;
        if (holder.kind !== "run") {
          throw new Error(
            `Cannot hand off ${holder.kind}:${holder.workflow_id} to ${input.kind}:${input.workflowId}; only the active run supports operator handoff`,
          );
        }
        if (holder.status !== "active") {
          throw new Error(
            `Cannot begin dispatch handoff while ${holder.kind}:${holder.workflow_id} is ${holder.status}`,
          );
        }
        if (!input.stopRunOnHandoff) throw new Error("Dispatch handoff requires a managed run stop callback");
        await input.stopRunOnHandoff({ reason: input.reason, runId: holder.workflow_id });
      }
      throw new DispatchLeaseUnavailableError({
        kind: decision.blockedBy.kind,
        workflowId: decision.blockedBy.workflow_id,
        leaseId: decision.blockedBy.lease_id,
      });
    }
    leaseId = decision.leaseId;
    requireActiveLease(store, leaseId, gameId);
    const revalidateLease: DispatchLeaseRevalidator = () => requireLease(store, leaseId!, gameId);
    return await operation(leaseId, revalidateLease);
  } finally {
    try {
      if (leaseId) {
        releaseDispatch(store, {
          actor,
          commandId,
          correlationId: input.workflowId,
          leaseId,
          gameId,
          spanId: actionSpanId,
        });
      }
    } finally {
      store.db.close();
    }
  }
}
