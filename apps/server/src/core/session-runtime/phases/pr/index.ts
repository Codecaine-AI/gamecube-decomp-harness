import {
  activatePhase,
  completePhase,
  type PrPhaseState,
  type ProjectSessionPatch,
  type ProjectSessionRecord,
} from "@server/core/project-session";

function runningCanEnterPr(record: ProjectSessionRecord, force: boolean): boolean {
  if (record.phase === "pr") return true;
  if (record.phase !== "running") return false;
  if (record.running_state_json.status === "complete") return true;
  if (!force) return false;
  return (
    record.running_state_json.stop_reason === "error" ||
    (record.running_state_json.stop_reason === "manual_stop" && record.running_state_json.manual_stop_mode === "hard_stop")
  );
}

export function enterPrPhase(record: ProjectSessionRecord, now: string, options: { force?: boolean } = {}): ProjectSessionPatch {
  if (!runningCanEnterPr(record, Boolean(options.force))) {
    throw new Error("Cannot enter PR phase until running is complete, hard-stopped, or errored");
  }
  const runningState = record.phase === "running" && record.running_state_json.completed_at ? record.running_state_json : completePhase(record.running_state_json, now);
  return {
    phase: "pr",
    running_state_json: runningState,
    pr_state_json: {
      ...activatePhase(record.pr_state_json, now),
      subphase: "final_build",
      final_build: {
        status: "active",
        started_at: record.pr_state_json.final_build?.started_at ?? now,
        completed_at: record.pr_state_json.final_build?.completed_at ?? null,
      },
    },
  };
}

export function completeFinalBuild(record: ProjectSessionRecord, now: string, finalBuild: Record<string, unknown> = {}): ProjectSessionPatch {
  if (record.phase !== "pr") throw new Error(`Cannot complete PR final build while session is ${record.phase}`);
  return {
    pr_state_json: {
      ...record.pr_state_json,
      status: "active",
      subphase: "qa",
      final_build: {
        ...record.pr_state_json.final_build,
        ...finalBuild,
        status: "complete",
        completed_at: now,
      },
    },
  };
}

function finalBuildComplete(state: PrPhaseState): boolean {
  return state.final_build?.status === "complete" || Boolean(state.final_build?.completed_at);
}

export function setPrSubphase(
  record: ProjectSessionRecord,
  now: string,
  subphase: PrPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PrPhaseState> } = {},
): ProjectSessionPatch {
  if (record.phase !== "pr") throw new Error(`Cannot update PR subphase while session is ${record.phase}`);
  if (subphase !== "final_build" && !finalBuildComplete(record.pr_state_json)) {
    throw new Error("Cannot advance PR work before final_build is complete");
  }
  return {
    pr_state_json: {
      ...activatePhase(record.pr_state_json, now),
      ...options.data,
      subphase,
      subphase_detail: subphase === "other" ? options.detail : undefined,
    },
  };
}

export function completePr(record: ProjectSessionRecord, now: string, completion: Record<string, unknown> = {}): ProjectSessionPatch {
  if (record.phase !== "pr") throw new Error(`Cannot complete PR phase while session is ${record.phase}`);
  if (!finalBuildComplete(record.pr_state_json)) throw new Error("Cannot complete PR phase before final_build is complete");
  if (record.pr_state_json.blockers.length > 0) throw new Error("Cannot complete PR phase while PR blockers remain");
  return {
    pr_state_json: {
      ...completePhase(record.pr_state_json, now),
      subphase: "intake",
      completion,
    },
  };
}
