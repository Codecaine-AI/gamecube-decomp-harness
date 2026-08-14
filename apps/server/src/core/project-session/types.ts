import type { EventActor, JsonObject } from "@server/core/project-state/events.js";

export type ProjectSessionStatus = "active" | "blocked" | "complete" | "closing" | "closed";
export type ProjectSessionPhase = "preparing" | "running" | "pr" | "complete";
export type PhaseLifecycleStatus = "pending" | "active" | "complete" | "blocked";

export type PreparingSubphase = "config" | "sync_intake" | "processing_prs" | "knowledge_refresh" | "baseline" | "ready" | "other";
export type RunningSubphase = "candidate_list" | "graph_rebuild" | "epoch_build" | "workers" | "checkpoint" | "draining" | "other";
export type PrSubphase = "final_build" | "qa" | "qa_fixes" | "split" | "prepare_prs" | "publish" | "review" | "intake" | "other";
export type CompleteSubphase = "settled" | "other";

export type PhaseSubphase = PreparingSubphase | RunningSubphase | PrSubphase | CompleteSubphase;
export type RunningStopReason = "hit_100_percent" | "manual_stop" | "error" | "other";
export type ManualStopMode = "finish_epoch" | "hard_stop";

export interface ProjectSessionBlocker {
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
export interface ProjectSessionRuntimeBlocker extends ProjectSessionBlocker {
  source_kind: string;
  source_id: string;
  recovery_choices: string[];
}

export type SessionTimelineEntryKind = "epoch_completed" | "remote_application" | "pr_phase" | "save_point";

export interface SessionTimelineEntry {
  id: number;
  session_uuid: string;
  entry_kind: SessionTimelineEntryKind;
  entry_id: string;
  occurred_at: string;
  payload: JsonObject;
  caused_by_event_id: string | null;
}

export interface SessionTransitionContext {
  projectId?: string;
  sessionUuid?: string;
  commandId: string;
  causationId?: string;
  actor: EventActor;
  correlationId: string;
  spanId?: string;
  occurredAt?: string;
}

/** Accepted session progress revisions that do not change session status. */
export type ProjectSessionProgressEventType =
  | "session.preparing_subphase_updated"
  | "session.preparing_completed"
  | "session.running_started"
  | "session.running_subphase_updated"
  | "session.running_stopped"
  | "session.blockers_updated"
  | "session.pr_entered"
  | "session.pr_final_build_completed"
  | "session.pr_subphase_updated"
  | "session.pr_completed";

export type ProjectSessionStatusPreservingEventType =
  ProjectSessionProgressEventType;

export interface ProjectSessionDestinationStatusByEvent {
  "session.running_unblocked": "active";
  "session.blocked": "blocked";
  "session.complete": "complete";
  "session.closing": "closing";
  "session.closed": "closed";
}

export interface ProjectSessionPayloadByEvent {
  "session.running_unblocked": {
    from_status: ProjectSessionStatus;
    to_status: "active";
  };
  "session.blocked": {
    from_status: ProjectSessionStatus;
    to_status: "blocked";
    prior_status: ProjectSessionStatus;
    blocker_codes: string[];
    source_identities: Array<{
      source_kind: string;
      source_id: string;
    }>;
    recovery_choices: string[];
    state_revision: number;
  };
  "session.blockers_updated": {
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
  "session.complete": {
    from_status: ProjectSessionStatus;
    to_status: "complete";
  };
  "session.closing": {
    from_status: ProjectSessionStatus;
    to_status: "closing";
  };
  "session.closed": {
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

interface ProjectSessionPayloadInputByEvent {
  "session.closed": Pick<
    ProjectSessionPayloadByEvent["session.closed"],
    "final_save_point_id" | "shipped_and_unshipped_work_summary"
  >;
}

export type ProjectSessionStatusTransitionEventType = keyof ProjectSessionDestinationStatusByEvent;
export type ProjectSessionTransitionEventType =
  | ProjectSessionStatusPreservingEventType
  | ProjectSessionStatusTransitionEventType;

type ProjectSessionPatchForEvent<TEvent extends string> =
  string extends TEvent
    ? ProjectSessionPatch
    : TEvent extends ProjectSessionStatusPreservingEventType
      ? Omit<ProjectSessionPatch, "status"> & { status?: never }
      : TEvent extends ProjectSessionStatusTransitionEventType
        ? Omit<ProjectSessionPatch, "status"> & {
            status: ProjectSessionDestinationStatusByEvent[TEvent];
          }
        : never;

export type ProjectSessionStatusPreservingTransitionInput<
  TEvent extends ProjectSessionStatusPreservingEventType,
> = SessionTransitionContext & {
  eventType: TEvent;
  expectedRevision: number;
  patch: Omit<ProjectSessionPatch, "status"> & { status?: never };
  payload?: JsonObject;
};

export type ProjectSessionDerivedStatusTransitionEventType = Exclude<
  ProjectSessionStatusTransitionEventType,
  keyof ProjectSessionPayloadInputByEvent
>;

export type ProjectSessionDerivedStatusTransitionInput<
  TEvent extends ProjectSessionDerivedStatusTransitionEventType,
> = SessionTransitionContext & {
  eventType: TEvent;
  expectedRevision: number;
  patch: Omit<ProjectSessionPatch, "status"> & {
    status: ProjectSessionDestinationStatusByEvent[TEvent];
  };
  payload?: never;
};

export type ProjectSessionTransitionInput<
  TEvent extends string = ProjectSessionTransitionEventType,
> = string extends TEvent
  ? SessionTransitionContext & {
      eventType: string;
      expectedRevision: number;
      patch: ProjectSessionPatch;
      payload?: JsonObject;
    }
  : TEvent extends ProjectSessionStatusPreservingEventType
    ? ProjectSessionStatusPreservingTransitionInput<TEvent>
    : TEvent extends ProjectSessionDerivedStatusTransitionEventType
      ? ProjectSessionDerivedStatusTransitionInput<TEvent>
      : TEvent extends keyof ProjectSessionPayloadInputByEvent
        ? SessionTransitionContext & {
            eventType: TEvent;
            expectedRevision: number;
            patch: ProjectSessionPatchForEvent<TEvent>;
            payload: ProjectSessionPayloadInputByEvent[TEvent];
          }
        : never;

export interface RecordEpochCompletedInput extends SessionTransitionContext {
  epochId: string;
  runId: string;
  integrationCommit: string;
  scoreDelta?: number | null;
  payload?: JsonObject;
}

export interface RecordRemoteApplicationInput extends Omit<SessionTransitionContext, "correlationId"> {
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

export interface RecordSavePointAnchorInput extends SessionTransitionContext {
  savePointId: string;
  commitSha: string;
  triggerKind: string;
  headlineScore?: number | null;
  artifactPaths?: string[];
  payload?: JsonObject;
}

export interface RecordSavePointFailureInput extends SessionTransitionContext {
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

export interface CloseProjectSessionInput extends SessionTransitionContext {
  worktreeDirtyBeyondHead: boolean;
  aheadOfBase: number;
  namedSavePointId?: string | null;
}

export type CloseProjectSessionBlockerCode = "dispatch_lease_held" | "unshipped_work";

export interface CloseProjectSessionBlocked {
  closed: false;
  blockers: Array<{
    code: CloseProjectSessionBlockerCode;
    message: string;
    source_kind: string;
    source_id: string;
    recoverable: true;
  }>;
}

export interface CloseProjectSessionAccepted {
  closed: true;
  session: ProjectSessionRecord;
}

export type CloseProjectSessionDecision = CloseProjectSessionBlocked | CloseProjectSessionAccepted;

export interface PhaseStateEnvelope<TSubphase extends string = string> {
  status: PhaseLifecycleStatus;
  subphase: TSubphase;
  subphase_detail?: string;
  started_at: string | null;
  completed_at: string | null;
  blockers: ProjectSessionBlocker[];
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

export interface ProjectSessionProcessState {
  process_name: string;
  project_id: string;
  session_uuid: string;
  status: "idle" | "running" | "draining" | "stopping" | "exited" | "unknown";
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

export interface ProjectSessionKernelTraceState {
  session_uuid: string;
  app_session_id: string;
  root_container_id?: string | null;
  active_container_id?: string | null;
  trace_url?: string | null;
  last_linkage_cursor?: ProjectSessionKernelTraceLinkageCursor | null;
  [key: string]: unknown;
}

export interface ProjectSessionKernelTraceLinkageCursor {
  project_event_id: string;
  kernel_event_id: string;
  correlation_id: string;
  caused_by_event_id: string | null;
  linked_at: string;
}

export interface ProjectSessionKernelTracePatch {
  app_session_id?: string;
  root_container_id?: string | null;
  active_container_id?: string | null;
  trace_url?: string | null;
  last_linkage_cursor?: ProjectSessionKernelTraceLinkageCursor | null;
  [key: string]: unknown;
}

export interface ProjectSessionRecord {
  id: string;
  project_id: string;
  session_uuid: string;
  status: ProjectSessionStatus;
  phase: ProjectSessionPhase;
  active_run_id: string | null;
  base_ref: string | null;
  base_sha: string | null;
  revision: number;
  head_revision: string | null;
  trace_id: string;
  blockers_json: ProjectSessionBlocker[];
  save_point_stale: boolean;
  caused_by_event_id: string | null;
  preparing_state_json: PreparingPhaseState;
  running_state_json: RunningPhaseState;
  pr_state_json: PrPhaseState;
  complete_state_json: CompletePhaseState;
  process_state_json: ProjectSessionProcessState | null;
  kernel_trace_json: ProjectSessionKernelTraceState | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  closed_at: string | null;
}

export interface ProjectSessionGates {
  can_start_workers: boolean;
  can_prepare_prs: boolean;
  can_publish_prs: boolean;
  can_mark_complete: boolean;
  can_start_next: boolean;
  force_to_pr_available: boolean;
}

export interface ProjectSessionView {
  id: string;
  projectId: string;
  sessionUuid: string;
  status: ProjectSessionStatus;
  phase: ProjectSessionPhase;
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
  process: ProjectSessionProcessState | null;
  kernelTrace: ProjectSessionKernelTraceState | null;
  gates: ProjectSessionGates;
  blockers: ProjectSessionBlocker[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  closedAt: string | null;
}

export interface CreateProjectSessionInput {
  projectId: string;
  baseRef?: string | null;
  baseSha?: string | null;
  activeRunId?: string | null;
  now?: string;
  sessionUuid?: string;
  id?: string;
  traceId?: string;
  actor: EventActor;
  commandId?: string;
  spanId?: string;
  worktreeIdentity?: string;
  openingSyncId?: string | null;
}

export type ProjectSessionTelemetryPatch = Pick<
  ProjectSessionPatch,
  "kernel_trace_json" | "process_state_json"
>;

export interface ProjectSessionPatch {
  status?: ProjectSessionStatus;
  phase?: ProjectSessionPhase;
  active_run_id?: string | null;
  base_ref?: string | null;
  base_sha?: string | null;
  head_revision?: string | null;
  trace_id?: string;
  blockers_json?: ProjectSessionBlocker[];
  save_point_stale?: boolean;
  caused_by_event_id?: string | null;
  preparing_state_json?: PreparingPhaseState;
  running_state_json?: RunningPhaseState;
  pr_state_json?: PrPhaseState;
  complete_state_json?: CompletePhaseState;
  process_state_json?: ProjectSessionProcessState | null;
  kernel_trace_json?: ProjectSessionKernelTraceState | null;
  completed_at?: string | null;
  closed_at?: string | null;
}
