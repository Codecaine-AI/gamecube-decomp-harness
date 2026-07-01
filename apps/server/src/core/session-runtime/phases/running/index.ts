import {
  activatePhase,
  completePhase,
  setPhaseBlocked,
  type ManualStopMode,
  type ProjectSessionBlocker,
  type ProjectSessionPatch,
  type ProjectSessionRecord,
  type RunningPhaseState,
  type RunningStopReason,
} from "@server/core/project-session";

export function setRunningSubphase(
  record: ProjectSessionRecord,
  now: string,
  subphase: RunningPhaseState["subphase"],
  options: { detail?: string; data?: Partial<RunningPhaseState> } = {},
): ProjectSessionPatch {
  if (record.phase !== "running") throw new Error(`Cannot update running subphase while session is ${record.phase}`);
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
  record: ProjectSessionRecord,
  now: string,
  stopReason: RunningStopReason,
  options: { manualStopMode?: ManualStopMode; blockers?: ProjectSessionBlocker[] } = {},
): ProjectSessionPatch {
  if (record.phase !== "running") throw new Error(`Cannot stop running while session is ${record.phase}`);
  const blocked = stopReason === "error" || Boolean(options.blockers?.length);
  const runningState = {
    ...record.running_state_json,
    status: blocked ? "blocked" : "complete",
    subphase: "draining",
    completed_at: blocked ? record.running_state_json.completed_at : now,
    stop_reason: stopReason,
    manual_stop_mode: options.manualStopMode,
    blockers: options.blockers ?? [],
  } satisfies RunningPhaseState;
  return {
    status: blocked ? "blocked" : record.status,
    running_state_json: runningState,
  };
}

export function unblockStoppedRunning(record: ProjectSessionRecord, now: string): ProjectSessionPatch {
  if (record.phase !== "running") throw new Error(`Cannot unblock running while session is ${record.phase}`);
  return {
    status: "active",
    running_state_json: {
      ...completePhase(record.running_state_json, now),
      subphase: "draining",
    },
  };
}

export function blockRunning(record: ProjectSessionRecord, blockers: ProjectSessionBlocker[]): ProjectSessionPatch {
  if (record.phase !== "running") throw new Error(`Cannot block running while session is ${record.phase}`);
  return {
    status: "blocked",
    running_state_json: setPhaseBlocked(record.running_state_json, blockers),
  };
}
