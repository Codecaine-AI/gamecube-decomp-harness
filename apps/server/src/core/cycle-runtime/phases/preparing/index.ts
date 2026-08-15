import { activatePhase, completePhase, type PreparingPhaseState, type CyclePatch, type CycleRecord } from "@server/core/cycle";

export function setPreparingSubphase(
  record: CycleRecord,
  now: string,
  subphase: PreparingPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PreparingPhaseState> } = {},
): CyclePatch {
  return {
    preparing_state_json: {
      ...activatePhase(record.preparing_state_json, now),
      ...options.data,
      subphase,
      subphase_detail: subphase === "other" ? options.detail : undefined,
    },
  };
}

export function completePreparing(record: CycleRecord, now: string, completion: Record<string, unknown> = {}): CyclePatch {
  return {
    preparing_state_json: {
      ...completePhase(record.preparing_state_json, now),
      subphase: "ready",
      completion,
    },
  };
}

export function startRunningFromPreparing(record: CycleRecord, now: string): CyclePatch {
  if (record.phase !== "preparing") throw new Error(`Cannot start running from ${record.phase}`);
  if (record.preparing_state_json.status !== "complete") {
    throw new Error("Cannot start workers until preparing is complete");
  }
  return {
    phase: "running",
    preparing_state_json: record.preparing_state_json.completed_at ? record.preparing_state_json : completePhase(record.preparing_state_json, now),
    running_state_json: {
      ...activatePhase(record.running_state_json, now),
      subphase: "candidate_list",
    },
  };
}
