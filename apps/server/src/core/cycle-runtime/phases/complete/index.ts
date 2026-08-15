import { completePhase, type CompletePhaseState, type CyclePatch, type CycleRecord } from "@server/core/cycle";

export function completeCycle(
  record: CycleRecord,
  now: string,
  options: {
    completedBy?: string;
    completedReason?: string;
    finalSavePoint?: Record<string, unknown>;
    settledPrCounts?: Record<string, unknown>;
  } = {},
): CyclePatch {
  if (record.phase !== "pr") throw new Error(`Cannot mark cycle complete from ${record.phase}`);
  if (record.pr_state_json.status !== "complete") throw new Error("Cannot mark cycle complete until PR phase is complete");
  const completeState: CompletePhaseState = {
    ...completePhase(record.complete_state_json, now),
    subphase: "settled",
    started_at: record.complete_state_json.started_at ?? now,
    completed_reason: options.completedReason,
    completed_by: options.completedBy,
    final_save_point: options.finalSavePoint,
    settled_pr_counts: options.settledPrCounts,
  };
  return {
    status: "complete",
    phase: "complete",
    complete_state_json: completeState,
    completed_at: now,
  };
}
