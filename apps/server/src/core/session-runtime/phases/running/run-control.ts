import { randomUUID } from "node:crypto";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { immediateTransaction } from "@server/core/orchestrator-state";
import { reconcilePendingIntegrations } from "@server/core/project-session";
import {
  beginDrain,
  getProjectState,
  initializeProjectState,
  recoverDispatch,
  releaseDispatch,
  requestDispatch,
  requireLease,
  STALE_DISPATCH_LEASE_MS,
  type DispatchLease,
  type DispatchKind,
} from "@server/core/project-state";
import {
  completeRunRecoveryJournal,
  prepareRunClaimRecovery,
  settlePreparedRunClaimRecovery,
} from "@server/core/session-runtime/phases/running/jobs/recover-claims.js";
import {
  activeClaimsForRun,
  getRun,
  transitionRun,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import type { RunBlocker, RunRecord } from "@server/core/shared/types";

interface ConfirmedRunControlInput {
  commandId?: string;
  confirmed: boolean;
  correlationId?: string;
  reason: string;
  runId: string;
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
  projectId?: string;
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
  const lease = getProjectState(store, run.projectId ?? undefined)?.active_workflow ?? null;
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

function requireProjectId(run: RunRecord, explicit?: string): string {
  const projectId = explicit ?? run.projectId ?? run.project?.projectId;
  if (!projectId) throw new Error(`Run ${run.id} has no project id; dispatch authority cannot be managed`);
  return projectId;
}

/** Atomically acquires dispatch authority and activates a ready/paused run. */
export function activateRun(input: ActivateRunInput): { leaseId: string; run: RunRecord } {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-activate");
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
    const projectId = requireProjectId(original, input.projectId);
    initializeProjectState(input.store, { projectId, traceId: `trace-project-${projectId}` });
    const decision = requestDispatch(input.store, {
      actor: input.actor ?? "operator",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? original.id,
      kind: "run",
      projectId,
      reason: input.reason,
      workflowId: original.id,
    });
    if (decision.queued) {
      throw new RunControlBlockedError(
        `Dispatch lease is held by ${decision.blockedBy.kind}:${decision.blockedBy.workflow_id}; run ${original.id} was queued`,
        ["dispatch_lease_unavailable"],
      );
    }
    const run = transitionRun(input.store, original.id, {
      actor: input.actor ?? "operator",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? original.id,
      eventType: "run.activated",
      expectedRevision: original.revision,
      patch: { status: "active", stopRequest: null },
      payload: { lease_id: decision.leaseId, previous_status: original.status, resulting_status: "active" },
    });
    return { leaseId: decision.leaseId, run };
  });
}

/** Atomically disables admission in both the run and its dispatch lease. */
export function pauseRun(input: PauseRunInput): PauseRunResult {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-pause");
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
    const run = transitionRun(input.store, original.id, {
      actor: input.actor ?? "operator",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? original.id,
      eventType: "run.draining",
      expectedRevision: original.revision,
      patch: { status: "draining", stopRequest: { mode: "pause", reason: input.reason } },
      payload: { lease_id: lease.lease_id, reason: input.reason, resulting_status: "draining" },
    });
    beginDrain(input.store, {
      actor: input.actor ?? "operator",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? original.id,
      leaseId: lease.lease_id,
      projectId: requireProjectId(original),
      reason: input.reason,
      targetKind: input.targetKind,
      targetWorkflowId: input.targetWorkflowId,
    });
    return { leaseId: lease.lease_id, run, settled: false };
  });
}

/** Supervisor-owned boundary report: release/park authority and then pause. */
export function settlePausedRun(input: SettlePausedRunInput): PauseRunResult {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-pause-settled");
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
    const released = releaseDispatch(input.store, {
      actor: input.actor ?? "guardian",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? original.id,
      leaseId: lease.lease_id,
      projectId: requireProjectId(original),
    });
    if (released.active_workflow?.kind === "run" && released.active_workflow.workflow_id === original.id) {
      throw new RunControlBlockedError(`Run ${original.id} dispatch lease could not be released`, ["dispatch_release_blocked"]);
    }
    const run = transitionRun(input.store, original.id, {
      actor: input.actor ?? "guardian",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? original.id,
      eventType: "run.paused",
      expectedRevision: original.revision,
      patch: { status: "paused", stopRequest: null },
      payload: { reason: input.reason, resulting_status: "paused" },
    });
    return { leaseId: null, run, settled: true };
  });
}

/** Loud startup repair for the two status/lease crash-window shapes. */
export function reconcileRunLeaseState(input: PauseRunInput): RunLeaseReconciliation | null {
  const operationCommandId = commandId({ ...input, confirmed: true }, "run-lease-reconcile");
  return immediateTransaction(input.store.db, () => {
    const original = requireRun(input.store, input.runId);
    const projectId = requireProjectId(original);
    const lease = runLease(input.store, original);
    if ((original.status === "ready" || original.status === "paused") && lease) {
      const released = releaseDispatch(input.store, {
        actor: "guardian",
        commandId: operationCommandId,
        correlationId: input.correlationId ?? original.id,
        leaseId: lease.lease_id,
        projectId,
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
        correlationId: input.correlationId ?? original.id,
        eventType: "run.lease_reconciled",
        expectedRevision: original.revision,
        patch: { status: "draining", stopRequest: { mode: "pause", reason: input.reason } },
        payload: { lease_id: lease.lease_id, previous_status: "active", resulting_status: "draining", reason: input.reason },
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
        correlationId: input.correlationId ?? original.id,
        eventType: "run.lease_reconciled",
        expectedRevision: original.revision,
        patch: { status: "paused", stopRequest: null },
        payload: { previous_status: original.status, resulting_status: "paused", reason: input.reason },
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
  const repoRoot = input.repoRoot ?? run.project?.repoRoot ?? input.globals.repoRoot;
  return prepareRunClaimRecovery({
    action,
    commandId: operationCommandId,
    correlationId: input.correlationId ?? run.id,
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
): boolean {
  if (!lease) return false;
  if (!run.projectId) throw new Error(`Run ${run.id} cannot recover its dispatch lease without a project id`);
  recoverDispatch(input.store, {
    actor: "operator",
    cancelledSubjectIds: cancelledClaimIds,
    commandId: operationCommandId,
    correlationId: input.correlationId ?? run.id,
    leaseId: lease.lease_id,
    projectId: run.projectId,
    recoveryReason: input.reason,
  });
  return true;
}

/**
 * Reconciles durable boundaries, settles orphaned claims, breaks a stale run
 * lease when present, then records the recovery point as the final operation.
 */
export async function recoverRun(input: RecoverRunInput): Promise<RecoverRunResult> {
  requireConfirmation(input.confirmed, "run.recover");
  const operationCommandId = commandId(input, "run-recover");
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

  const projectId = requireProjectId(original);
  initializeProjectState(input.store, { projectId, traceId: `trace-project-${projectId}` });
  if (!lease) {
    const decision = requestDispatch(input.store, {
      actor: "operator",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? original.id,
      kind: "run",
      projectId,
      reason: `recover run: ${input.reason}`,
      workflowId: original.id,
    });
    if (!decision.queued) lease = decision.state.active_workflow;
  }
  if (lease) requireLease(input.store, lease.lease_id, projectId);
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
        repoRoot: input.repoRoot ?? current.project?.repoRoot ?? input.globals.repoRoot,
      },
      prepared,
    );
    const currentLease = runLease(input.store, current);
    dispatchLeaseRecovered = Boolean(currentLease);
    if (currentLease) {
      recoverHeldLease(
        {
          ...input,
          correlationId: prepared.journal.correlationId,
          reason: prepared.journal.recoveryReason,
        },
        current,
        currentLease,
        cancelledClaimIds,
        prepared.journal.commandId,
      );
    }
    const transitioned = transitionRun(input.store, current.id, {
      actor: "operator",
      commandId: prepared.journal.commandId,
      correlationId: prepared.journal.correlationId,
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
        repoRoot: input.repoRoot ?? current.project?.repoRoot ?? input.globals.repoRoot,
      },
      prepared,
    );
    const currentLease = runLease(input.store, current);
    dispatchLeaseRecovered = Boolean(currentLease);
    if (currentLease) {
      recoverHeldLease(
        {
          ...input,
          correlationId: prepared.journal.correlationId,
          reason: prepared.journal.recoveryReason,
        },
        current,
        currentLease,
        cancelledClaimIds,
        prepared.journal.commandId,
      );
    }
    const transitioned = current.status === "paused" ? current : transitionRun(input.store, current.id, {
      actor: "operator",
      commandId: prepared.journal.commandId,
      correlationId: prepared.journal.correlationId,
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
        resulting_status: "paused",
      },
    });
    const causedByEventId =
      transitioned === current
        ? getProjectState(input.store, requireProjectId(current))?.caused_by_event_id ?? null
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
    recoverHeldLease(input, current, runLease(input.store, current), [], operationCommandId);
    return transitionRun(input.store, current.id, {
      actor: "operator",
      commandId: operationCommandId,
      correlationId: input.correlationId ?? current.id,
      eventType: "run.cancelled",
      expectedRevision: current.revision,
      patch: { status: "cancelled", stopRequest: null, terminalReason: input.reason },
      payload: {
        cancellation_reason: input.reason,
        previous_status: current.status,
        resulting_status: "cancelled",
      },
    });
  });
}
