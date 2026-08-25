import {
  type CompletePhaseState,
  type CreateCycleInput,
  type PhaseStateEnvelope,
  type PreparingPhaseState,
  type PrPhaseState,
  type CycleBlocker,
  type CycleGates,
  type CycleKernelTraceState,
  type CyclePhase,
  type CycleProcessState,
  type CycleRecord,
  type CycleStatus,
  type CycleView,
  type RunningPhaseState,
} from "./types.js";

const ACTIVE_STATUSES = new Set<CycleStatus>(["active", "blocked", "closing"]);

export function defaultPreparingState(now: string): PreparingPhaseState {
  return {
    status: "active",
    subphase: "config",
    started_at: now,
    completed_at: null,
    blockers: [],
  };
}

export function defaultRunningState(): RunningPhaseState {
  return {
    status: "pending",
    subphase: "candidate_list",
    started_at: null,
    completed_at: null,
    blockers: [],
  };
}

export function defaultPrState(): PrPhaseState {
  return {
    status: "pending",
    subphase: "final_build",
    started_at: null,
    completed_at: null,
    blockers: [],
  };
}

export function defaultCompleteState(): CompletePhaseState {
  return {
    status: "pending",
    subphase: "settled",
    started_at: null,
    completed_at: null,
    blockers: [],
  };
}

export function defaultKernelTraceState(cycleUuid: string): CycleKernelTraceState {
  return {
    cycle_uuid: cycleUuid,
    app_session_id: kernelAppSessionId(cycleUuid),
    root_container_id: null,
    active_container_id: null,
    trace_url: null,
  };
}

export function kernelAppSessionId(cycleUuid: string): string {
  return `cycle:${cycleUuid}`;
}

function blockerList(value: unknown): CycleBlocker[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      code: typeof item.code === "string" && item.code ? item.code : "unknown",
      message: typeof item.message === "string" && item.message ? item.message : "Unspecified blocker",
      source: typeof item.source === "string" ? item.source : undefined,
      source_kind: typeof item.source_kind === "string" ? item.source_kind : undefined,
      source_id: typeof item.source_id === "string" ? item.source_id : undefined,
      recoverable: typeof item.recoverable === "boolean" ? item.recoverable : undefined,
      severity: item.severity === "info" || item.severity === "warning" || item.severity === "error" ? item.severity : undefined,
    }));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function normalizeEnvelope<T extends PhaseStateEnvelope<string>>(value: unknown, fallback: T): T {
  const raw = objectValue(value);
  return {
    ...fallback,
    ...raw,
    status: raw.status === "pending" || raw.status === "active" || raw.status === "complete" || raw.status === "blocked" ? raw.status : fallback.status,
    subphase: typeof raw.subphase === "string" && raw.subphase ? raw.subphase : fallback.subphase,
    subphase_detail: typeof raw.subphase_detail === "string" ? raw.subphase_detail : undefined,
    started_at: stringOrNull(raw.started_at),
    completed_at: stringOrNull(raw.completed_at),
    blockers: blockerList(raw.blockers),
  } as T;
}

export function normalizePreparingState(value: unknown, now: string): PreparingPhaseState {
  return normalizeEnvelope(value, defaultPreparingState(now));
}

export function normalizeRunningState(value: unknown): RunningPhaseState {
  const state = normalizeEnvelope(value, defaultRunningState());
  if (!["hit_100_percent", "manual_stop", "error", "other"].includes(String(state.stop_reason ?? ""))) delete state.stop_reason;
  if (!["finish_epoch", "hard_stop"].includes(String(state.manual_stop_mode ?? ""))) delete state.manual_stop_mode;
  return state;
}

export function normalizePrState(value: unknown): PrPhaseState {
  return normalizeEnvelope(value, defaultPrState());
}

export function normalizeCompleteState(value: unknown): CompletePhaseState {
  return normalizeEnvelope(value, defaultCompleteState());
}

export function normalizeProcessState(value: unknown, gameId: string, cycleUuid: string, now: string): CycleProcessState | null {
  const raw = objectValue(value);
  if (Object.keys(raw).length === 0) return null;
  const command = Array.isArray(raw.command) ? raw.command.map((item) => String(item)) : undefined;
  const status = ["idle", "running", "stopping", "exited", "unknown"].includes(String(raw.status)) ? String(raw.status) : "unknown";
  return {
    ...raw,
    process_name: typeof raw.process_name === "string" && raw.process_name ? raw.process_name : "melee-live",
    game_id: typeof raw.game_id === "string" && raw.game_id ? raw.game_id : gameId,
    cycle_uuid: typeof raw.cycle_uuid === "string" && raw.cycle_uuid ? raw.cycle_uuid : cycleUuid,
    status: status as CycleProcessState["status"],
    pid: typeof raw.pid === "number" ? raw.pid : null,
    process_group: typeof raw.process_group === "number" ? raw.process_group : null,
    process_file_path: typeof raw.process_file_path === "string" ? raw.process_file_path : null,
    command,
    repo_root: typeof raw.repo_root === "string" ? raw.repo_root : null,
    state_dir: typeof raw.state_dir === "string" ? raw.state_dir : null,
    graph_db_path: typeof raw.graph_db_path === "string" ? raw.graph_db_path : null,
    started_at: typeof raw.started_at === "string" ? raw.started_at : null,
    ended_at: typeof raw.ended_at === "string" ? raw.ended_at : null,
    updated_at: typeof raw.updated_at === "string" && raw.updated_at ? raw.updated_at : now,
  };
}

export function normalizeKernelTraceState(value: unknown, cycleUuid: string): CycleKernelTraceState {
  const raw = objectValue(value);
  return {
    ...raw,
    cycle_uuid: typeof raw.cycle_uuid === "string" && raw.cycle_uuid ? raw.cycle_uuid : cycleUuid,
    app_session_id: typeof raw.app_session_id === "string" && raw.app_session_id ? raw.app_session_id : kernelAppSessionId(cycleUuid),
    root_container_id: typeof raw.root_container_id === "string" ? raw.root_container_id : null,
    active_container_id: typeof raw.active_container_id === "string" ? raw.active_container_id : null,
    trace_url: typeof raw.trace_url === "string" ? raw.trace_url : null,
  };
}

export function createCycleRecord(input: Required<Pick<CreateCycleInput, "gameId" | "now" | "cycleUuid" | "id">> & CreateCycleInput): CycleRecord {
  return {
    id: input.id,
    game_id: input.gameId,
    cycle_uuid: input.cycleUuid,
    status: "active",
    phase: "preparing",
    active_run_id: input.activeRunId ?? null,
    base_ref: input.baseRef ?? null,
    base_sha: input.baseSha ?? null,
    revision: 0,
    head_revision: input.baseSha ?? null,
    trace_id: input.traceId ?? `trace-cycle-${input.cycleUuid}`,
    blockers_json: [],
    save_point_stale: false,
    caused_by_event_id: null,
    preparing_state_json: defaultPreparingState(input.now),
    running_state_json: defaultRunningState(),
    pr_state_json: defaultPrState(),
    complete_state_json: defaultCompleteState(),
    process_state_json: null,
    kernel_trace_json: defaultKernelTraceState(input.cycleUuid),
    created_at: input.now,
    updated_at: input.now,
    completed_at: null,
    closed_at: null,
  };
}

export function activePhaseState(record: CycleRecord): PhaseStateEnvelope<string> {
  switch (record.phase) {
    case "preparing":
      return record.preparing_state_json;
    case "running":
      return record.running_state_json;
    case "pr":
      return record.pr_state_json;
    case "complete":
      return record.complete_state_json;
  }
}

export function cycleBlockers(record: CycleRecord): CycleBlocker[] {
  const seen = new Set<string>();
  const blockers: CycleBlocker[] = [];
  for (const blocker of [
    ...record.blockers_json,
    ...record.preparing_state_json.blockers,
    ...record.running_state_json.blockers,
    ...record.pr_state_json.blockers,
    ...record.complete_state_json.blockers,
  ]) {
    const key = `${blocker.code}\0${blocker.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blockers.push(blocker);
  }
  return blockers;
}

export function cycleGates(record: CycleRecord): CycleGates {
  const blockers = cycleBlockers(record);
  const activeBlockers = blockers.length > 0 || record.status === "blocked" || activePhaseState(record).status === "blocked";
  const runningStopped = record.running_state_json.status === "complete" || Boolean(record.running_state_json.stop_reason);
  const finalBuildComplete = record.pr_state_json.final_build?.status === "complete" || Boolean(record.pr_state_json.final_build?.completed_at);
  const unresolvedPrBlockers = record.pr_state_json.blockers.length > 0 || record.pr_state_json.status === "blocked";
  return {
    can_start_workers: record.status === "active" && record.phase === "preparing" && record.preparing_state_json.status === "complete" && !activeBlockers,
    can_prepare_prs: record.status === "active" && (record.phase === "running" || record.phase === "pr") && runningStopped && !activeBlockers,
    can_publish_prs: record.status === "active" && record.phase === "pr" && finalBuildComplete && !unresolvedPrBlockers,
    can_start_next: record.status === "closed",
    force_to_pr_available:
      (record.status === "active" || record.status === "blocked") &&
      record.phase === "running" &&
      (record.running_state_json.stop_reason === "error" ||
        (record.running_state_json.stop_reason === "manual_stop" && record.running_state_json.manual_stop_mode === "hard_stop")),
  };
}

export function cycleView(record: CycleRecord): CycleView {
  const phaseState = activePhaseState(record);
  return {
    id: record.id,
    gameId: record.game_id,
    cycleUuid: record.cycle_uuid,
    status: record.status,
    phase: record.phase,
    activeSubphase: phaseState.subphase as CycleView["activeSubphase"],
    activeSubphaseDetail: phaseState.subphase === "other" ? (phaseState.subphase_detail ?? null) : null,
    activeRunId: record.active_run_id,
    baseRef: record.base_ref,
    baseSha: record.base_sha,
    revision: record.revision,
    headRevision: record.head_revision,
    traceId: record.trace_id,
    savePointStale: record.save_point_stale,
    causedByEventId: record.caused_by_event_id,
    phases: {
      preparing: record.preparing_state_json,
      running: record.running_state_json,
      pr: record.pr_state_json,
      complete: record.complete_state_json,
    },
    process: record.process_state_json,
    kernelTrace: record.kernel_trace_json,
    gates: cycleGates(record),
    blockers: cycleBlockers(record),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    completedAt: record.completed_at,
    closedAt: record.closed_at,
  };
}

export function isActiveCycle(record: CycleRecord): boolean {
  return ACTIVE_STATUSES.has(record.status);
}

export function completePhase<T extends PhaseStateEnvelope<string>>(phase: T, now: string): T {
  return {
    ...phase,
    status: "complete",
    completed_at: now,
    blockers: [],
  };
}

export function activatePhase<T extends PhaseStateEnvelope<string>>(phase: T, now: string): T {
  return {
    ...phase,
    status: "active",
    started_at: phase.started_at ?? now,
    completed_at: null,
  };
}

export function setPhaseBlocked<T extends PhaseStateEnvelope<string>>(phase: T, blockers: CycleBlocker[]): T {
  return {
    ...phase,
    status: "blocked",
    blockers,
  };
}

export function assertKnownPhase(phase: string): asserts phase is CyclePhase {
  if (phase !== "preparing" && phase !== "running" && phase !== "pr" && phase !== "complete") {
    throw new Error(`Unknown cycle phase: ${phase}`);
  }
}
