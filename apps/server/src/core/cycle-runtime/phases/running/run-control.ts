import { randomUUID } from "node:crypto";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { immediateTransaction } from "@server/core/orchestrator-state";
import { reconcilePendingIntegrations } from "@server/core/cycle";
import { newSpanId, type EventActor } from "@server/core/harness-state/events.js";
import {
  beginDrain,
  getHarnessState,
  initializeHarnessState,
  recoverDispatch,
  releaseDispatch,
  releaseDispatchDetailed,
  requestDispatch,
  requireLease,
  STALE_DISPATCH_LEASE_MS,
  type DispatchLease,
  type DispatchKind,
} from "@server/core/harness-state";
import {
  completeRunRecoveryJournal,
  prepareRunClaimRecovery,
  settlePreparedRunClaimRecovery,
} from "@server/core/cycle-runtime/phases/running/jobs/recover-claims.js";
import {
  activeClaimsForRun,
  getRun,
  transitionRun,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import { activateAcquiredSync } from "@server/core/cycle-runtime/phases/sync/activation.js";
import { activateAcquiredPrCampaign } from "@server/core/cycle-runtime/phases/pr/campaign/activation.js";
import { getPrCampaign } from "@server/core/cycle-runtime/phases/pr/campaign/state.js";
import type { RunBlocker, RunRecord } from "@server/core/shared/types";

interface ConfirmedRunControlInput {
  commandId?: string;
  confirmed: boolean;
  reason: string;
  runId: string;
  spanId?: string;
  store: StateStore;
}

interface SettlingRunControlInput extends ConfirmedRunControlInput {
  globals: GlobalArgs;
  processIntegrations?: boolean;
  repoRoot?: string;
}

export interface RecoverRunInput extends SettlingRunControlInput {
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  now?: Date | number | string;
}

export type ProcessLiveness = "live" | "not_live" | "unknown";
export type RunDispatchLeaseStaleness = "stale" | "not_stale" | "process_liveness_unknown";

export type HardStopRunInput = SettlingRunControlInput;
export type CancelRunInput = ConfirmedRunControlInput;

export interface PauseRunInput extends Omit<ConfirmedRunControlInput, "confirmed"> {
  actor?: "guardian" | "operator" | "runner";
  targetKind?: DispatchKind;
  targetWorkflowId?: string;
}

export interface SettlePausedRunInput extends PauseRunInput {
  leaseId?: string;
}

export interface ActivateRunInput extends PauseRunInput {
  gameId?: string;
}

export interface SettledRunControlResult {
  cancelledClaimIds: string[];
  cancelledOperationIds: [];
  run: RunRecord;
}

export interface RecoverRunResult extends SettledRunControlResult {
  dispatchLeaseRecovered: boolean;
  recoveryReason: string;
}

export interface HardStopRunResult extends SettledRunControlResult {
  dispatchLeaseRecovered: boolean;
}

export interface PauseRunResult {
  leaseId: string | null;
  run: RunRecord;
  settled: boolean;
}

export interface RunLeaseReconciliation {
  action: "released_unexpected_lease" | "paused_lease_free_run" | "aligned_run_to_draining_lease";
  message: string;
  run: RunRecord;
}

export class RunControlConfirmationRequiredError extends Error {
  constructor(action: string) {
    super(`${action} requires operator confirmation`);
    this.name = "RunControlConfirmationRequiredError";
  }
}

export class RunControlBlockedError extends Error {
  readonly blockerCodes: string[];

  constructor(message: string, blockerCodes: string[]) {
    super(message);
    this.name = "RunControlBlockedError";
    this.blockerCodes = blockerCodes;
  }
}

function requireConfirmation(confirmed: boolean, action: string): void {
  if (!confirmed) throw new RunControlConfirmationRequiredError(action);
}

function requireRun(store: StateStore, runId: string): RunRecord {
  const run = getRun(store, runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  return run;
}

function commandId(input: ConfirmedRunControlInput, action: string): string {
  return input.commandId ?? `command-${action}-${randomUUID()}`;
}

function runLease(store: StateStore, run: RunRecord): DispatchLease | null {
  const lease = getHarnessState(store, run.gameId ?? undefined)?.active_workflow ?? null;
  return lease?.kind === "run" && lease.workflow_id === run.id ? lease : null;
}

function timeMs(value: Date | number | string | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Date.now();
}

function mergeRunBlockers(current: RunBlocker[], additions: RunBlocker[]): RunBlocker[] {
  const merged = new Map(current.map((blocker) => [`${blocker.code}\0${blocker.source_kind}\0${blocker.source_id}`, blocker]));
  for (const blocker of additions) {
    merged.set(`${blocker.code}\0${blocker.source_kind}\0${blocker.source_id}`, blocker);
  }
  return [...merged.values()];
}

function requireGameId(run: RunRecord, explicit?: string): string {
  const gameId = explicit ?? run.gameId ?? run.game?.gameId;
  if (!gameId) throw new Error(`Run ${run.id} has no game id; dispatch authority cannot be managed`);
  return gameId;
}

function dispatchReleaseEventId(store: StateStore, causedByEventId: string | null): string {
  if (!causedByEventId) throw new Error("Dispatch release did not record a causal event");
  const event = store.db
    .query("SELECT event_type, causation_id FROM game_events WHERE event_id = ?")
    .get(causedByEventId) as { event_type: string; causation_id: string } | null;
  if (!event) throw new Error(`Dispatch release event ${causedByEventId} was not found`);
  if (event.event_type === "game.dispatch_released") return causedByEventId;
  if (event.event_type === "game.dispatch_acquired") return event.causation_id;
  throw new Error(`Dispatch release ended with unexpected event ${event.event_type}`);
}

function settlementReleaseCausationId(store: StateStore, gameId: string, fallbackCommandId: string): string {
  const causedByEventId = getHarnessState(store, gameId)?.caused_by_event_id;
  if (!causedByEventId) return fallbackCommandId;
  const event = store.db
    .query("SELECT event_type FROM game_events WHERE event_id = ? AND game_id = ?")
    .get(causedByEventId, gameId) as { event_type: string } | null;
  return event?.event_type === "game.dispatch_drain_started" || event?.event_type === "game.dispatch_requested"
    ? causedByEventId
    : fallbackCommandId;
}

/** Atomically acquires dispatch authority and activates a ready/paused run. */
export function activateRun(input: ActivateRunInput): { leaseId: string; run: RunRecord } {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-activate");
  const actionSpanId = input.spanId ?? newSpanId();
  return immediateTransaction(input.store.db, () => {
    const original = requireRun(input.store, input.runId);
    if (original.status === "active") {
      const existing = runLease(input.store, original);
      if (!existing || existing.status !== "active") {
        throw new RunControlBlockedError(`Run ${original.id} is active without its active dispatch lease`, ["run_lease_disagreement"]);
      }
      return { leaseId: existing.lease_id, run: original };
    }
    if (original.status !== "ready" && original.status !== "paused") {
      throw new RunControlBlockedError(`Run ${original.id} is ${original.status}; activation requires ready or paused`, ["run_not_ready_or_paused"]);
    }
    const gameId = requireGameId(original, input.gameId);
    initializeHarnessState(input.store, { gameId, traceId: `trace-game-${gameId}` });
    const actor = input.actor ?? "operator";
    const decision = requestDispatch(input.store, {
      actor,
      commandId: operationCommandId,
      correlationId: original.id,
      kind: "run",
      gameId,
      reason: input.reason,
      spanId: actionSpanId,
      workflowId: original.id,
    });
    if (decision.queued) {
      throw new RunControlBlockedError(
        `Dispatch lease is held by ${decision.blockedBy.kind}:${decision.blockedBy.workflow_id}; run ${original.id} was queued`,
        ["dispatch_lease_unavailable"],
      );
    }
    const run = transitionRun(input.store, original.id, {
      actor,
      causationId: decision.state.caused_by_event_id ?? operationCommandId,
      commandId: operationCommandId,
      correlationId: original.id,
      eventType: "run.activated",
      expectedRevision: original.revision,
      patch: { status: "active", stopRequest: null },
      payload: { lease_id: decision.leaseId },
      spanId: actionSpanId,
    });
    return { leaseId: decision.leaseId, run };
  });
}

/** Atomically disables admission in both the run and its dispatch lease. */
export function pauseRun(input: PauseRunInput): PauseRunResult {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-pause");
  const actionSpanId = input.spanId ?? newSpanId();
  return immediateTransaction(input.store.db, () => {
    const original = requireRun(input.store, input.runId);
    const lease = runLease(input.store, original);
    if (original.status === "paused" && !lease) return { leaseId: null, run: original, settled: true };
    if (original.status === "draining" && lease?.status === "draining") {
      return { leaseId: lease.lease_id, run: original, settled: false };
    }
    if (original.status !== "active") {
      throw new RunControlBlockedError(`Run ${original.id} is ${original.status}; pause requires active`, ["run_not_active"]);
    }
    if (!lease || lease.status !== "active") {
      throw new RunControlBlockedError(`Run ${original.id} cannot pause without its active dispatch lease`, ["run_lease_disagreement"]);
    }
    const actor = input.actor ?? "operator";
    const run = transitionRun(input.store, original.id, {
      actor,
      commandId: operationCommandId,
      correlationId: original.id,
      eventType: "run.draining",
      expectedRevision: original.revision,
      patch: { status: "draining", stopRequest: { mode: "pause", reason: input.reason } },
      payload: { lease_id: lease.lease_id, reason: input.reason },
      spanId: actionSpanId,
    });
    beginDrain(input.store, {
      actor,
      causationId: run.causedByEventId ?? operationCommandId,
      commandId: operationCommandId,
      correlationId: original.id,
      leaseId: lease.lease_id,
      gameId: requireGameId(original),
      reason: input.reason,
      spanId: actionSpanId,
      targetKind: input.targetKind,
      targetWorkflowId: input.targetWorkflowId,
    });
    return { leaseId: lease.lease_id, run, settled: false };
  });
}

/** Supervisor-owned boundary report: release/park authority and then pause. */
export function settlePausedRun(input: SettlePausedRunInput): PauseRunResult {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-pause-settled");
  const actionSpanId = input.spanId ?? newSpanId();
  return immediateTransaction(input.store.db, () => {
    const original = requireRun(input.store, input.runId);
    const lease = runLease(input.store, original);
    if (original.status === "paused" && !lease) return { leaseId: null, run: original, settled: true };
    if (original.status !== "active" && original.status !== "draining") {
      throw new RunControlBlockedError(`Run ${original.id} is ${original.status}; pause settlement requires active or draining`, ["run_not_settling"]);
    }
    const activeClaims = activeClaimsForRun(input.store, original.id);
    if (activeClaims.length > 0) {
      throw new RunControlBlockedError(
        `Run ${original.id} still has ${activeClaims.length} active claim(s) at supervisor settlement: ${activeClaims.map((claim) => claim.claimId).join(", ")}`,
        ["unsettled_claims"],
      );
    }
    if (!lease || (input.leaseId && lease.lease_id !== input.leaseId)) {
      throw new RunControlBlockedError(`Run ${original.id} lost its dispatch lease before supervisor settlement`, ["run_lease_disagreement"]);
    }
    const actor = input.actor ?? "runner";
    const gameId = requireGameId(original);
    const release = releaseDispatchDetailed(input.store, {
      actor,
      causationId: settlementReleaseCausationId(input.store, gameId, operationCommandId),
      commandId: operationCommandId,
      correlationId: original.id,
      leaseId: lease.lease_id,
      gameId,
      spanId: actionSpanId,
    });
    const released = release.state;
    if (released.active_workflow?.kind === "run" && released.active_workflow.workflow_id === original.id) {
      throw new RunControlBlockedError(`Run ${original.id} dispatch lease could not be released`, ["dispatch_release_blocked"]);
    }
    if (!release.releasedEventId) throw new Error(`Run ${original.id} dispatch release did not accept a release event`);
    const releaseEventId = release.releasedEventId;
    if (released.active_workflow?.kind === "sync") {
      const successor = release.successorActivation;
      if (
        !successor || successor.kind !== "sync" ||
        successor.workflowId !== released.active_workflow.workflow_id ||
        successor.leaseId !== released.active_workflow.lease_id
      ) {
        throw new Error(`Run ${original.id} sync handoff is missing its accepted request activation context`);
      }
      activateAcquiredSync({
        actor: successor.actor,
        causationId: successor.causationId,
        store: input.store,
        gameId,
        syncId: successor.workflowId,
        leaseId: successor.leaseId,
        commandId: successor.commandId,
        correlationId: successor.correlationId,
        spanId: successor.spanId,
      });
    }
    if (
      released.active_workflow?.kind === "pr" &&
      getPrCampaign(input.store, released.active_workflow.workflow_id)
    ) {
      const successor = release.successorActivation;
      if (
        !successor || successor.kind !== "pr" ||
        successor.workflowId !== released.active_workflow.workflow_id ||
        successor.leaseId !== released.active_workflow.lease_id
      ) {
        throw new Error(`Run ${original.id} PR handoff is missing its accepted request activation context`);
      }
      activateAcquiredPrCampaign({
        actor: successor.actor,
        causationId: successor.causationId,
        store: input.store,
        gameId,
        campaignId: successor.workflowId,
        leaseId: successor.leaseId,
        commandId: successor.commandId,
        correlationId: successor.correlationId,
        spanId: successor.spanId,
      });
    }
    const run = transitionRun(input.store, original.id, {
      actor,
      causationId: releaseEventId,
      commandId: operationCommandId,
      correlationId: original.id,
      eventType: "run.paused",
      expectedRevision: original.revision,
      patch: { status: "paused" },
      payload: {},
      spanId: actionSpanId,
    });
    return { leaseId: null, run, settled: true };
  });
}

/** Loud startup repair for the two status/lease crash-window shapes. */
export function reconcileRunLeaseState(input: PauseRunInput): RunLeaseReconciliation | null {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-lease-reconcile");
  const actionSpanId = input.spanId ?? newSpanId();
  return immediateTransaction(input.store.db, () => {
    const original = requireRun(input.store, input.runId);
    const gameId = requireGameId(original);
    const lease = runLease(input.store, original);
    if ((original.status === "ready" || original.status === "paused") && lease) {
      const released = releaseDispatch(input.store, {
        actor: "guardian",
        commandId: operationCommandId,
        correlationId: original.id,
        leaseId: lease.lease_id,
        gameId,
        spanId: actionSpanId,
      });
      if (released.active_workflow?.kind === "run" && released.active_workflow.workflow_id === original.id) {
        throw new Error(`Startup reconciliation could not release unexpected lease ${lease.lease_id} from ${original.status} run ${original.id}`);
      }
      return {
        action: "released_unexpected_lease",
        message: `Startup reconciliation released dispatch lease ${lease.lease_id} held by ${original.status} run ${original.id}`,
        run: original,
      };
    }
    if (original.status === "active" && lease?.status === "draining") {
      const run = transitionRun(input.store, original.id, {
        actor: "guardian",
        commandId: operationCommandId,
        correlationId: original.id,
        eventType: "run.draining",
        expectedRevision: original.revision,
        patch: { status: "draining", stopRequest: { mode: "pause", reason: input.reason } },
        payload: { lease_id: lease.lease_id, reason: input.reason },
        spanId: actionSpanId,
      });
      return {
        action: "aligned_run_to_draining_lease",
        message: `Startup reconciliation moved active run ${original.id} to draining to match lease ${lease.lease_id}`,
        run,
      };
    }
    if ((original.status === "active" || original.status === "draining") && !lease) {
      const run = transitionRun(input.store, original.id, {
        actor: "guardian",
        commandId: operationCommandId,
        correlationId: original.id,
        eventType: "run.paused",
        expectedRevision: original.revision,
        patch: {
          status: "paused",
          stopRequest: original.stopRequest ?? { mode: "pause", reason: input.reason },
        },
        payload: {},
        spanId: actionSpanId,
      });
      return {
        action: "paused_lease_free_run",
        message: `Startup reconciliation paused ${original.status} run ${original.id} because it did not own dispatch authority`,
        run,
      };
    }
    return null;
  });
}

function processLiveness(
  hasActiveProcess: ((stateDir: string) => { active: boolean }) | undefined,
  stateDir: string,
): ProcessLiveness {
  if (!hasActiveProcess) return "unknown";
  try {
    return hasActiveProcess(stateDir).active ? "live" : "not_live";
  } catch {
    return "unknown";
  }
}

export function runDispatchLeaseStaleness(input: {
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  lease: DispatchLease | null;
  now?: Date | number | string;
  stateDir: string;
}): RunDispatchLeaseStaleness {
  if (!input.lease) return "not_stale";
  const heartbeatAt = Date.parse(input.lease.heartbeat_at);
  const at = timeMs(input.now);
  if (!Number.isFinite(heartbeatAt) || !Number.isFinite(at) || at - heartbeatAt <= STALE_DISPATCH_LEASE_MS) {
    return "not_stale";
  }
  const liveness = processLiveness(input.hasActiveProcess, input.stateDir);
  if (liveness === "unknown") return "process_liveness_unknown";
  return liveness === "not_live" ? "stale" : "not_stale";
}

export function isStaleRunDispatchLease(input: {
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  lease: DispatchLease | null;
  now?: Date | number | string;
  stateDir: string;
}): boolean {
  return runDispatchLeaseStaleness(input) === "stale";
}

async function prepareSettlingRunClaims(
  input: SettlingRunControlInput,
  run: RunRecord,
  action: "run.recover" | "run.hard_stop",
  operationCommandId: string,
) {
  const repoRoot = input.repoRoot ?? run.game?.repoRoot ?? input.globals.repoRoot;
  return prepareRunClaimRecovery({
    action,
    commandId: operationCommandId,
    correlationId: run.id,
    expectedRunRevision: run.revision,
    force: true,
    globals: input.globals,
    processIntegrations: input.processIntegrations,
    reason: input.reason,
    repoRoot,
    runId: run.id,
    store: input.store,
  });
}

function recoverHeldLease(
  input: ConfirmedRunControlInput,
  run: RunRecord,
  lease: DispatchLease | null,
  cancelledClaimIds: string[],
  operationCommandId: string,
  actionSpanId: string,
  actor: EventActor,
): string | null {
  if (!lease) return null;
  if (!run.gameId) throw new Error(`Run ${run.id} cannot recover its dispatch lease without a game id`);
  const recovered = recoverDispatch(input.store, {
    actor,
    cancelledSubjectIds: cancelledClaimIds,
    commandId: operationCommandId,
    correlationId: run.id,
    leaseId: lease.lease_id,
    gameId: run.gameId,
    recoveryReason: input.reason,
    spanId: actionSpanId,
  });
  return dispatchReleaseEventId(input.store, recovered.state.caused_by_event_id);
}

/**
 * Reconciles durable boundaries, settles orphaned claims, breaks a stale run
 * lease when present, then records the recovery point as the final operation.
 */
export async function recoverRun(input: RecoverRunInput): Promise<RecoverRunResult> {
  requireConfirmation(input.confirmed, "run.recover");
  const operationCommandId = commandId(input, "run-recover");
  const actionSpanId = input.spanId ?? newSpanId();
  const original = requireRun(input.store, input.runId);
  if (original.status === "completed" || original.status === "cancelled") {
    throw new RunControlBlockedError(`Run ${original.id} is terminal (${original.status})`, ["run_terminal"]);
  }
  if (original.status !== "failed" && original.status !== "active" && original.status !== "draining" && original.status !== "paused") {
    throw new RunControlBlockedError(`Run ${original.id} is ${original.status}; recovery requires failed, active, draining, or paused`, [
      "run_status_not_recoverable",
    ]);
  }
  let lease = runLease(input.store, original);
  const leaseStaleness = runDispatchLeaseStaleness({
    hasActiveProcess: input.hasActiveProcess,
    lease,
    now: input.now,
    stateDir: input.globals.stateDir,
  });
  if (original.status !== "failed" && leaseStaleness === "process_liveness_unknown") {
    throw new RunControlBlockedError(`Run ${original.id} process liveness could not be determined`, ["process_liveness_unknown"]);
  }
  if (original.status !== "failed" && leaseStaleness !== "stale") {
    throw new RunControlBlockedError(`Run ${original.id} is not failed and its dispatch lease is not stale`, ["run_not_failed", "dispatch_lease_not_stale"]);
  }

  const gameId = requireGameId(original);
  initializeHarnessState(input.store, { gameId, traceId: `trace-game-${gameId}` });
  if (!lease) {
    const decision = requestDispatch(input.store, {
      actor: "operator",
      commandId: operationCommandId,
      correlationId: original.id,
      kind: "run",
      gameId,
      reason: `recover run: ${input.reason}`,
      spanId: actionSpanId,
      workflowId: original.id,
    });
    if (!decision.queued) lease = decision.state.active_workflow;
  }
  if (!lease) {
    throw new RunControlBlockedError(`Run ${original.id} recovery dispatch authority is unavailable`, [
      "dispatch_authority_unavailable",
    ]);
  }
  requireLease(input.store, lease.lease_id, gameId);
  reconcilePendingIntegrations(input.store, { runId: original.id });
  const preparedRun = requireRun(input.store, original.id);
  const prepared = await prepareSettlingRunClaims(input, preparedRun, "run.recover", operationCommandId);
  const cancelledClaimIds = prepared.journal.cancelledClaimIds;
  const cancelledOperationIds = prepared.journal.cancelledOperationIds;
  let dispatchLeaseRecovered = false;
  const run = immediateTransaction(input.store.db, () => {
    const current = requireRun(input.store, original.id);
    if (current.revision !== prepared.journal.expectedRunRevision) {
      throw new Error(
        `Recovery journal ${prepared.journal.recoveryId} expects run revision ${prepared.journal.expectedRunRevision}, found ${current.revision}`,
      );
    }
    if (current.status !== "failed" && current.status !== "active" && current.status !== "draining" && current.status !== "paused") {
      throw new RunControlBlockedError(`Run ${current.id} changed to ${current.status} during recovery`, ["run_status_changed"]);
    }
    const recovery = settlePreparedRunClaimRecovery(
      {
        ...input,
        action: "run.recover",
        commandId: prepared.journal.commandId,
        correlationId: prepared.journal.correlationId,
        expectedRunRevision: prepared.journal.expectedRunRevision,
        force: true,
        repoRoot: input.repoRoot ?? current.game?.repoRoot ?? input.globals.repoRoot,
      },
      prepared,
    );
    const currentLease = runLease(input.store, current);
    dispatchLeaseRecovered = Boolean(currentLease);
    const releaseEventId = currentLease
      ? recoverHeldLease(
          {
            ...input,
            reason: prepared.journal.recoveryReason,
          },
          current,
          currentLease,
          cancelledClaimIds,
          prepared.journal.commandId,
          actionSpanId,
          "operator",
        )
      : null;
    const transitioned = transitionRun(input.store, current.id, {
      actor: "operator",
      causationId: releaseEventId ?? prepared.journal.commandId,
      commandId: prepared.journal.commandId,
      correlationId: current.id,
      eventType: "run.recovered",
      expectedRevision: current.revision,
      patch: {
        blockers: mergeRunBlockers(current.blockers, recovery.blockers),
        status: "paused",
        stopRequest: null,
        terminalReason: null,
      },
      payload: {
        recovery_id: prepared.journal.recoveryId,
        recovery_reason: prepared.journal.recoveryReason,
        cancelled_claim_ids: cancelledClaimIds,
        cancelled_operation_ids: cancelledOperationIds,
        queued_work: recovery.workerOutputIntegration?.queued ?? [],
        resulting_status: "paused",
      },
      spanId: actionSpanId,
    });
    if (!transitioned.causedByEventId) {
      throw new Error(`Recovered run ${transitioned.id} has no transition event id`);
    }
    completeRunRecoveryJournal(input.store, {
      recoveryId: prepared.journal.recoveryId,
      causedByEventId: transitioned.causedByEventId,
    });
    return transitioned;
  });
  return {
    cancelledClaimIds,
    cancelledOperationIds,
    dispatchLeaseRecovered,
    recoveryReason: prepared.journal.recoveryReason,
    run,
  };
}

/** Force-settles in-flight claims and returns an active run to paused. */
export async function hardStopRun(input: HardStopRunInput): Promise<HardStopRunResult> {
  requireConfirmation(input.confirmed, "run.hard_stop");
  const operationCommandId = commandId(input, "run-hard-stop");
  const actionSpanId = input.spanId ?? newSpanId();
  const original = requireRun(input.store, input.runId);
  const originalLease = runLease(input.store, original);
  if (original.status === "paused" && !originalLease && activeClaimsForRun(input.store, original.id).length === 0) {
    return { cancelledClaimIds: [], cancelledOperationIds: [], dispatchLeaseRecovered: false, run: original };
  }
  if (original.status !== "active" && original.status !== "draining" && original.status !== "paused") {
    throw new RunControlBlockedError(`Run ${original.id} is ${original.status}; hard stop requires active or draining`, ["run_not_active_or_draining"]);
  }
  const lease = originalLease;
  const prepared = await prepareSettlingRunClaims(input, original, "run.hard_stop", operationCommandId);
  const cancelledClaimIds = prepared.journal.cancelledClaimIds;
  const cancelledOperationIds = prepared.journal.cancelledOperationIds;
  let dispatchLeaseRecovered = Boolean(lease);
  const run = immediateTransaction(input.store.db, () => {
    const current = requireRun(input.store, original.id);
    if (current.revision !== prepared.journal.expectedRunRevision) {
      throw new Error(
        `Recovery journal ${prepared.journal.recoveryId} expects run revision ${prepared.journal.expectedRunRevision}, found ${current.revision}`,
      );
    }
    if (current.status !== "active" && current.status !== "draining" && current.status !== "paused") {
      throw new RunControlBlockedError(`Run ${current.id} changed to ${current.status} during hard stop`, ["run_status_changed"]);
    }
    const recovery = settlePreparedRunClaimRecovery(
      {
        ...input,
        action: "run.hard_stop",
        commandId: prepared.journal.commandId,
        correlationId: prepared.journal.correlationId,
        expectedRunRevision: prepared.journal.expectedRunRevision,
        force: true,
        repoRoot: input.repoRoot ?? current.game?.repoRoot ?? input.globals.repoRoot,
      },
      prepared,
    );
    const currentLease = runLease(input.store, current);
    dispatchLeaseRecovered = Boolean(currentLease);
    const releaseEventId = currentLease
      ? recoverHeldLease(
          {
            ...input,
            reason: prepared.journal.recoveryReason,
          },
          current,
          currentLease,
          cancelledClaimIds,
          prepared.journal.commandId,
          actionSpanId,
          "operator",
        )
      : null;
    const transitioned =
      current.status === "paused"
        ? current
        : transitionRun(input.store, current.id, {
            actor: "operator",
            causationId: releaseEventId ?? prepared.journal.commandId,
            commandId: prepared.journal.commandId,
            correlationId: current.id,
            eventType: "run.paused",
            expectedRevision: current.revision,
            patch: {
              blockers: mergeRunBlockers(current.blockers, recovery.blockers),
              status: "paused",
              stopRequest: { mode: "hard_stop", reason: input.reason },
            },
            payload: {
              recovery_id: prepared.journal.recoveryId,
              recovery_reason: prepared.journal.recoveryReason,
              cancelled_claim_ids: cancelledClaimIds,
              cancelled_operation_ids: cancelledOperationIds,
              queued_work: recovery.workerOutputIntegration?.queued ?? [],
            },
            spanId: actionSpanId,
          });
    const causedByEventId =
      transitioned === current
        ? getHarnessState(input.store, requireGameId(current))?.caused_by_event_id ?? null
        : transitioned.causedByEventId;
    if (!causedByEventId) throw new Error(`Hard-stopped run ${transitioned.id} has no transition event id`);
    completeRunRecoveryJournal(input.store, {
      recoveryId: prepared.journal.recoveryId,
      causedByEventId,
    });
    return transitioned;
  });
  return { cancelledClaimIds, cancelledOperationIds, dispatchLeaseRecovered, run };
}

/** Cancels a settled paused or failed run; cancellation is terminal. */
export function cancelRun(input: CancelRunInput): RunRecord {
  requireConfirmation(input.confirmed, "run.cancel");
  const operationCommandId = commandId(input, "run-cancel");
  const actionSpanId = input.spanId ?? newSpanId();
  const original = requireRun(input.store, input.runId);
  if (original.status !== "paused" && original.status !== "failed") {
    throw new RunControlBlockedError(`Run ${original.id} is ${original.status}; cancellation requires paused or failed`, ["run_not_paused_or_failed"]);
  }
  const unsettledClaims = activeClaimsForRun(input.store, original.id);
  if (unsettledClaims.length > 0) {
    throw new RunControlBlockedError(
      `Run ${original.id} has ${unsettledClaims.length} unsettled claim(s): ${unsettledClaims.map((claim) => claim.claimId).join(", ")}`,
      ["unsettled_claims"],
    );
  }
  return immediateTransaction(input.store.db, () => {
    const current = requireRun(input.store, original.id);
    const releaseEventId = recoverHeldLease(
      input,
      current,
      runLease(input.store, current),
      [],
      operationCommandId,
      actionSpanId,
      "operator",
    );
    return transitionRun(input.store, current.id, {
      actor: "operator",
      causationId: releaseEventId ?? operationCommandId,
      commandId: operationCommandId,
      correlationId: current.id,
      eventType: "run.cancelled",
      expectedRevision: current.revision,
      patch: { status: "cancelled", stopRequest: null, terminalReason: input.reason },
      payload: {
        cancellation_reason: input.reason,
      },
      spanId: actionSpanId,
    });
  });
}
