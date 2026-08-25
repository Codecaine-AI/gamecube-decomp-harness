import type { EventActor, JsonObject } from "@server/core/harness-state/events.js";

export type CycleStatus = "active" | "blocked" | "complete" | "closing" | "closed";
export type CyclePhase = "preparing" | "running" | "pr" | "complete";
export type PhaseLifecycleStatus = "pending" | "active" | "complete" | "blocked";

/**
 * `sync_intake`, `processing_prs`, and `knowledge_refresh` are retired: nothing
 * writes them any more and the UI stopped rendering them. They stay in the union
 * because preparing phase state is persisted as JSON on the cycle row, so stored
 * rows from before the retirement still carry these values and narrowing the type
 * would make reading them unsound. Drop them only behind a state migration.
 */
export type PreparingSubphase = "config" | "sync_intake" | "processing_prs" | "knowledge_refresh" | "baseline" | "ready" | "other";
export type RunningSubphase = "candidate_list" | "graph_rebuild" | "epoch_build" | "workers" | "checkpoint" | "other";
export type PrSubphase = "final_build" | "qa" | "qa_fixes" | "split" | "prepare_prs" | "publish" | "review" | "intake" | "other";
export type CompleteSubphase = "settled" | "other";

export type PhaseSubphase = PreparingSubphase | RunningSubphase | PrSubphase | CompleteSubphase;
export type RunningStopReason = "hit_100_percent" | "manual_stop" | "error" | "other";
export type ManualStopMode = "finish_epoch" | "hard_stop";

export interface CycleBlocker {
  code: string;
  message: string;
  source?: string;
  source_kind?: string;
  source_id?: string;
  recovery_choices?: string[];
  recoverable?: boolean;
  severity?: "info" | "warning" | "error";
}

/** Blockers authored at the runtime boundary cannot rely on legacy defaults. */
export interface CycleRuntimeBlocker extends CycleBlocker {
  source_kind: string;
  source_id: string;
  recovery_choices: string[];
}

export type CycleTimelineEntryKind = "epoch_completed" | "remote_application" | "pr_phase" | "save_point";

export interface CycleTimelineEntry {
  id: number;
  cycle_uuid: string;
  entry_kind: CycleTimelineEntryKind;
  entry_id: string;
  occurred_at: string;
  payload: JsonObject;
  caused_by_event_id: string | null;
}

export interface CycleTransitionContext {
  gameId?: string;
  cycleUuid?: string;
  commandId: string;
  causationId?: string;
  actor: EventActor;
  correlationId: string;
  spanId?: string;
  occurredAt?: string;
}

/** Accepted cycle progress revisions that do not change cycle status. */
export type CycleProgressEventType =
  | "cycle.preparing_subphase_updated"
  | "cycle.preparing_completed"
  | "cycle.running_started"
  | "cycle.running_subphase_updated"
  | "cycle.running_stopped"
  | "cycle.blockers_updated"
  | "cycle.pr_entered"
  | "cycle.pr_final_build_completed"
  | "cycle.pr_subphase_updated"
  | "cycle.pr_completed";

export type CycleStatusPreservingEventType =
  CycleProgressEventType;

export interface CycleDestinationStatusByEvent {
  "cycle.running_unblocked": "active";
  "cycle.blocked": "blocked";
  "cycle.complete": "complete";
  "cycle.closing": "closing";
  "cycle.closed": "closed";
}

export interface CyclePayloadByEvent {
  "cycle.running_unblocked": {
    from_status: CycleStatus;
    to_status: "active";
  };
  "cycle.blocked": {
    from_status: CycleStatus;
    to_status: "blocked";
    prior_status: CycleStatus;
    blocker_codes: string[];
    source_identities: Array<{
      source_kind: string;
      source_id: string;
    }>;
    recovery_choices: string[];
    state_revision: number;
  };
  "cycle.blockers_updated": {
    added_blocker_codes: string[];
    removed_blocker_codes: string[];
    blocker_codes: string[];
    source_identities: Array<{
      source_kind: string;
      source_id: string;
    }>;
    recovery_choices: string[];
    state_revision: number;
  };
  "cycle.complete": {
    from_status: CycleStatus;
    to_status: "complete";
  };
  "cycle.closing": {
    from_status: CycleStatus;
    to_status: "closing";
  };
  "cycle.closed": {
    final_head: string | null;
    shipped_and_unshipped_work_summary: {
      ahead_of_base: number;
      worktree_dirty_beyond_head: boolean;
    };
    final_save_point_id: string | null;
    closing_operator: string;
    state_revision: number;
  };
}

interface CyclePayloadInputByEvent {
  "cycle.closed": Pick<
    CyclePayloadByEvent["cycle.closed"],
    "final_save_point_id" | "shipped_and_unshipped_work_summary"
  >;
}

export type CycleStatusTransitionEventType = keyof CycleDestinationStatusByEvent;
export type CycleTransitionEventType =
  | CycleStatusPreservingEventType
  | CycleStatusTransitionEventType;

type CyclePatchForEvent<TEvent extends string> =
  string extends TEvent
    ? CyclePatch
    : TEvent extends CycleStatusPreservingEventType
      ? Omit<CyclePatch, "status"> & { status?: never }
      : TEvent extends CycleStatusTransitionEventType
        ? Omit<CyclePatch, "status"> & {
            status: CycleDestinationStatusByEvent[TEvent];
          }
        : never;

export type CycleStatusPreservingTransitionInput<
  TEvent extends CycleStatusPreservingEventType,
> = CycleTransitionContext & {
  eventType: TEvent;
  expectedRevision: number;
  patch: Omit<CyclePatch, "status"> & { status?: never };
  payload?: JsonObject;
};

export type CycleDerivedStatusTransitionEventType = Exclude<
  CycleStatusTransitionEventType,
  keyof CyclePayloadInputByEvent
>;

export type CycleDerivedStatusTransitionInput<
  TEvent extends CycleDerivedStatusTransitionEventType,
> = CycleTransitionContext & {
  eventType: TEvent;
  expectedRevision: number;
  patch: Omit<CyclePatch, "status"> & {
    status: CycleDestinationStatusByEvent[TEvent];
  };
  payload?: never;
};

export type CycleTransitionInput<
  TEvent extends string = CycleTransitionEventType,
> = string extends TEvent
  ? CycleTransitionContext & {
      eventType: string;
      expectedRevision: number;
      patch: CyclePatch;
      payload?: JsonObject;
    }
  : TEvent extends CycleStatusPreservingEventType
    ? CycleStatusPreservingTransitionInput<TEvent>
    : TEvent extends CycleDerivedStatusTransitionEventType
      ? CycleDerivedStatusTransitionInput<TEvent>
      : TEvent extends keyof CyclePayloadInputByEvent
        ? CycleTransitionContext & {
            eventType: TEvent;
            expectedRevision: number;
            patch: CyclePatchForEvent<TEvent>;
            payload: CyclePayloadInputByEvent[TEvent];
          }
        : never;

export interface RecordEpochCompletedInput extends CycleTransitionContext {
  epochId: string;
  runId: string;
  integrationCommit: string;
  scoreDelta?: number | null;
  payload?: JsonObject;
}

export interface RecordRemoteApplicationInput extends Omit<CycleTransitionContext, "correlationId"> {
  remoteApplicationId: string;
  boundaryEventId: string;
  syncId: string;
  priorHead: string;
  newHead: string;
  resolvedConflicts: string[];
  scoreDelta?: number | null;
  runId?: string | null;
  repositoryRoot?: string;
  payload?: JsonObject;
}

export interface RecordSavePointAnchorInput extends CycleTransitionContext {
  savePointId: string;
  commitSha: string;
  triggerKind: string;
  headlineScore?: number | null;
  artifactPaths?: string[];
  payload?: JsonObject;
}

export interface RecordSavePointFailureInput extends CycleTransitionContext {
  triggerKind: string;
  sourceKind: string;
  sourceId: string;
  message: string;
}

export type DeferredSavePointEvidence =
  | {
      status: "recorded";
      savePointId: string;
      commitSha: string;
      triggerKind: string;
      headlineScore?: number | null;
      artifactPaths?: string[];
      payload?: JsonObject;
    }
  | {
      status: "failed";
      triggerKind: string;
      sourceKind: string;
      sourceId: string;
      message: string;
    };

export interface CloseCycleInput extends CycleTransitionContext {
  worktreeDirtyBeyondHead: boolean;
  aheadOfBase: number;
  namedSavePointId?: string | null;
}

export type CloseCycleBlockerCode = "dispatch_lease_held" | "unshipped_work";

export interface CloseCycleBlocked {
  closed: false;
  blockers: Array<{
    code: CloseCycleBlockerCode;
    message: string;
    source_kind: string;
    source_id: string;
    recoverable: true;
  }>;
}

export interface CloseCycleAccepted {
  closed: true;
  cycle: CycleRecord;
}

export type CloseCycleDecision = CloseCycleBlocked | CloseCycleAccepted;

export interface PhaseStateEnvelope<TSubphase extends string = string> {
  status: PhaseLifecycleStatus;
  subphase: TSubphase;
  subphase_detail?: string;
  started_at: string | null;
  completed_at: string | null;
  blockers: CycleBlocker[];
}

export interface PreparingPhaseState extends PhaseStateEnvelope<PreparingSubphase> {
  completion?: Record<string, unknown>;
  config?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  intake?: Record<string, unknown>;
  knowledge?: Record<string, unknown>;
  baseline?: Record<string, unknown>;
  worker_config?: Record<string, unknown>;
}

export interface RunningPhaseState extends PhaseStateEnvelope<RunningSubphase> {
  stop_reason?: RunningStopReason;
  manual_stop_mode?: ManualStopMode;
  completion?: Record<string, unknown>;
  candidate_list?: Record<string, unknown>;
  graph?: Record<string, unknown>;
  epoch?: Record<string, unknown>;
  workers?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
}

export interface PrPhaseStepState {
  status?: PhaseLifecycleStatus;
  started_at?: string | null;
  completed_at?: string | null;
  [key: string]: unknown;
}

export interface PrPhaseState extends PhaseStateEnvelope<PrSubphase> {
  completion?: Record<string, unknown>;
  final_build?: PrPhaseStepState;
  final_score?: Record<string, unknown>;
  qa?: Record<string, unknown>;
  qa_fixes?: Record<string, unknown>;
  split?: Record<string, unknown>;
  prs?: Record<string, unknown>;
  review?: Record<string, unknown>;
}

export interface CompletePhaseState extends PhaseStateEnvelope<CompleteSubphase> {
  completed_reason?: string;
  completed_by?: string;
  final_save_point?: Record<string, unknown>;
  settled_pr_counts?: Record<string, unknown>;
}

export interface CycleProcessState {
  process_name: string;
  game_id: string;
  cycle_uuid: string;
  status: "idle" | "running" | "stopping" | "exited" | "unknown";
  pid?: number | null;
  process_group?: number | null;
  process_file_path?: string | null;
  command?: string[];
  repo_root?: string | null;
  state_dir?: string | null;
  graph_db_path?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  updated_at: string;
  [key: string]: unknown;
}

export interface CycleKernelTraceState {
  cycle_uuid: string;
  app_session_id: string;
  root_container_id?: string | null;
  active_container_id?: string | null;
  trace_url?: string | null;
  last_linkage_cursor?: CycleKernelTraceLinkageCursor | null;
  [key: string]: unknown;
}

export interface CycleKernelTraceLinkageCursor {
  game_event_id: string;
  kernel_event_id: string;
  correlation_id: string;
  caused_by_event_id: string | null;
  linked_at: string;
}

export interface CycleKernelTracePatch {
  app_session_id?: string;
  root_container_id?: string | null;
  active_container_id?: string | null;
  trace_url?: string | null;
  last_linkage_cursor?: CycleKernelTraceLinkageCursor | null;
  [key: string]: unknown;
}

export interface CycleRecord {
  id: string;
  game_id: string;
  cycle_uuid: string;
  status: CycleStatus;
  phase: CyclePhase;
  active_run_id: string | null;
  base_ref: string | null;
  base_sha: string | null;
  revision: number;
  head_revision: string | null;
  trace_id: string;
  blockers_json: CycleBlocker[];
  save_point_stale: boolean;
  caused_by_event_id: string | null;
  preparing_state_json: PreparingPhaseState;
  running_state_json: RunningPhaseState;
  pr_state_json: PrPhaseState;
  complete_state_json: CompletePhaseState;
  process_state_json: CycleProcessState | null;
  kernel_trace_json: CycleKernelTraceState | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  closed_at: string | null;
}

export interface CycleGates {
  can_start_workers: boolean;
  can_prepare_prs: boolean;
  can_publish_prs: boolean;
  can_mark_complete: boolean;
  can_start_next: boolean;
  force_to_pr_available: boolean;
}

export interface CycleView {
  id: string;
  gameId: string;
  cycleUuid: string;
  status: CycleStatus;
  phase: CyclePhase;
  activeSubphase: PhaseSubphase;
  activeSubphaseDetail: string | null;
  activeRunId: string | null;
  baseRef: string | null;
  baseSha: string | null;
  revision: number;
  headRevision: string | null;
  traceId: string;
  savePointStale: boolean;
  causedByEventId: string | null;
  phases: {
    preparing: PreparingPhaseState;
    running: RunningPhaseState;
    pr: PrPhaseState;
    complete: CompletePhaseState;
  };
  process: CycleProcessState | null;
  kernelTrace: CycleKernelTraceState | null;
  gates: CycleGates;
  blockers: CycleBlocker[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  closedAt: string | null;
}

export interface CreateCycleInput {
  gameId: string;
  baseRef?: string | null;
  baseSha?: string | null;
  activeRunId?: string | null;
  now?: string;
  cycleUuid?: string;
  id?: string;
  traceId?: string;
  actor: EventActor;
  commandId?: string;
  spanId?: string;
  worktreeIdentity?: string;
  openingSyncId?: string | null;
}

export type CycleTelemetryPatch = Pick<
  CyclePatch,
  "kernel_trace_json" | "process_state_json"
>;

export interface CyclePatch {
  status?: CycleStatus;
  phase?: CyclePhase;
  active_run_id?: string | null;
  base_ref?: string | null;
  base_sha?: string | null;
  head_revision?: string | null;
  trace_id?: string;
  blockers_json?: CycleBlocker[];
  save_point_stale?: boolean;
  caused_by_event_id?: string | null;
  preparing_state_json?: PreparingPhaseState;
  running_state_json?: RunningPhaseState;
  pr_state_json?: PrPhaseState;
  complete_state_json?: CompletePhaseState;
  process_state_json?: CycleProcessState | null;
  kernel_trace_json?: CycleKernelTraceState | null;
  completed_at?: string | null;
  closed_at?: string | null;
}
