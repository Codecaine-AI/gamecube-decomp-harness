import {
  activatePhase,
  completePhase,
  setPhaseBlocked,
  type ManualStopMode,
  type CycleBlocker,
  type CyclePatch,
  type CycleRecord,
  type RunningPhaseState,
  type RunningStopReason,
} from "@server/core/cycle";

export {
  cancelRun,
  hardStopRun,
  isStaleRunDispatchLease,
  runDispatchLeaseStaleness,
  recoverRun,
  RunControlBlockedError,
  RunControlConfirmationRequiredError,
  type CancelRunInput,
  type HardStopRunInput,
  type HardStopRunResult,
  type RecoverRunInput,
  type RecoverRunResult,
  type ProcessLiveness,
  type RunDispatchLeaseStaleness,
  type SettledRunControlResult,
} from "./run-control.js";

export function setRunningSubphase(
  record: CycleRecord,
  now: string,
  subphase: RunningPhaseState["subphase"],
  options: { detail?: string; data?: Partial<RunningPhaseState> } = {},
): CyclePatch {
  if (record.phase !== "running") throw new Error(`Cannot update running subphase while cycle is ${record.phase}`);
  return {
    running_state_json: {
      ...activatePhase(record.running_state_json, now),
      ...options.data,
      subphase,
      subphase_detail: subphase === "other" ? options.detail : undefined,
      stop_reason: undefined,
      manual_stop_mode: undefined,
    },
  };
}

export function stopRunning(
  record: CycleRecord,
  now: string,
  stopReason: RunningStopReason,
  options: { manualStopMode?: ManualStopMode; blockers?: CycleBlocker[] } = {},
): CyclePatch {
  if (record.phase !== "running") throw new Error(`Cannot stop running while cycle is ${record.phase}`);
  const blocked = stopReason === "error" || Boolean(options.blockers?.length);
  const runningState = {
    ...record.running_state_json,
    status: blocked ? "blocked" : "complete",
    subphase: "other",
    subphase_detail: "stopped",
    completed_at: blocked ? record.running_state_json.completed_at : now,
    stop_reason: stopReason,
    manual_stop_mode: options.manualStopMode,
    blockers: options.blockers ?? [],
  } satisfies RunningPhaseState;
  return {
    status: blocked ? "blocked" : record.status,
    ...(blocked ? { blockers_json: options.blockers ?? [] } : {}),
    running_state_json: runningState,
  };
}

export function unblockStoppedRunning(record: CycleRecord, now: string): CyclePatch {
  if (record.phase !== "running") throw new Error(`Cannot unblock running while cycle is ${record.phase}`);
  return {
    status: "active",
    blockers_json: [],
    running_state_json: {
      ...completePhase(record.running_state_json, now),
      subphase: "other",
      subphase_detail: "stopped",
    },
  };
}

export function blockRunning(record: CycleRecord, blockers: CycleBlocker[]): CyclePatch {
  if (record.phase !== "running") throw new Error(`Cannot block running while cycle is ${record.phase}`);
  return {
    status: "blocked",
    blockers_json: blockers,
    running_state_json: setPhaseBlocked(record.running_state_json, blockers),
  };
}
