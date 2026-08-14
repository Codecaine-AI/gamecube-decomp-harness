import type { EventActor, JsonObject } from "@server/core/project-state/events.js";
import type { Blocker } from "@server/core/project-state/types.js";

export const SYNC_STATUSES = [
  "requested",
  "ingesting",
  "reconciling",
  "validating",
  "validated",
  "publishing",
  "published",
  "blocked",
  "cancelled",
] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_WORKFLOW_EVENT_TYPES = [
  "sync.requested",
  "sync.observation_refreshed",
  "sync.ingesting",
  "sync.reconciling",
  "sync.staging_progressed",
  "sync.validating",
  "sync.validated",
  "sync.publishing",
  "sync.blocked",
  "sync.reconciliation_blocked",
  "sync.recovered",
  "sync.cancelled",
  "sync.boundary_published",
  "sync.published",
] as const;

export const SYNC_KNOWLEDGE_EVENT_TYPES = [
  "knowledge.job_enqueued",
  "knowledge.job_processing",
  "knowledge.job_waiting",
  "knowledge.job_succeeded",
  "knowledge.job_failed",
  "knowledge.job_cancelled",
  "knowledge.revision_advanced",
] as const;

export const SYNC_EVENT_TYPES = [
  ...SYNC_WORKFLOW_EVENT_TYPES,
  ...SYNC_KNOWLEDGE_EVENT_TYPES,
] as const;

export type SyncWorkflowEventType = (typeof SYNC_WORKFLOW_EVENT_TYPES)[number];
export type SyncKnowledgeEventType = (typeof SYNC_KNOWLEDGE_EVENT_TYPES)[number];
export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export interface SyncReconciliationBlockedPayload extends JsonObject {
  conflict_identities: string[];
  conflicts_awaiting_operator: number;
}

export interface SyncObservationRefreshedPayload extends JsonObject {
  prior_upstream_revision: string;
  observed_upstream_revision: string;
  merged_pr_ids: string[];
  corpus_batch_ids: string[];
  knowledge_only: boolean;
  observation_source_identity: string;
  state_revision: number;
}

export interface SyncRecoveredPayload {
  staging_preserved: boolean;
  staging_discarded: boolean;
  resume_stage: SyncStatus | null;
  recovery_reason: string;
  untouched_submodule_heads?: JsonObject[];
}

export interface SyncCancelledPayload {
  discarded_staging_workspace_id: string | null;
  untouched_session_head: string;
  untouched_submodule_heads: JsonObject[];
}

export interface SyncSubmodulePointer extends JsonObject {
  path: string;
  gitlink_head: string;
  checked_out_head: string;
}

export interface SyncBoundaryPublishedPayload extends JsonObject {
  upstream_revision: string;
  knowledge_revision: string;
  invalidations: string[];
  validation_evidence: JsonObject;
}

interface SyncKnowledgeEventContext {
  projectId: string;
  subjectId: string;
  traceId: string;
  actor: EventActor;
  causationId: string;
  correlationId: string;
  spanId: string;
  parentSpanId?: string;
  occurredAt?: string;
}

export type KnowledgeJobExecutionFacts =
  | {
      execution_class: "sync_stage";
      sync_id: string;
      source_class: string;
      provenance: JsonObject;
      source_kind: string;
      source_id: string;
    }
  | {
      execution_class: "background_safe";
      sync_id: null;
      source_class: string;
      provenance: JsonObject;
      source_kind: string;
      source_id: string;
    };

type KnowledgeJobTransitionPayload<
  TFrom extends string,
  TTo extends string,
  TFacts extends object = Record<never, never>,
> = KnowledgeJobExecutionFacts & {
  from_status: TFrom;
  to_status: TTo;
} & TFacts;

export type SyncKnowledgeEventInput =
  | (SyncKnowledgeEventContext & {
      eventType: "knowledge.job_enqueued";
      payload: {
        source_class: string;
        provenance: JsonObject;
        execution_class: "sync_stage" | "background_safe";
      };
    })
  | (SyncKnowledgeEventContext & {
      eventType: "knowledge.job_processing";
      payload: KnowledgeJobTransitionPayload<"queued" | "waiting", "processing">;
    })
  | (SyncKnowledgeEventContext & {
      eventType: "knowledge.job_waiting";
      payload: KnowledgeJobTransitionPayload<
        "processing" | "succeeded" | "failed",
        "waiting",
        { reason: string }
      >;
    })
  | (SyncKnowledgeEventContext & {
      eventType: "knowledge.job_succeeded";
      payload: KnowledgeJobTransitionPayload<"processing", "succeeded", { staged_digest: string }>;
    })
  | (SyncKnowledgeEventContext & {
      eventType: "knowledge.job_failed";
      payload: KnowledgeJobTransitionPayload<"processing", "failed", { error: string }>;
    })
  | (SyncKnowledgeEventContext & {
      eventType: "knowledge.job_cancelled";
      payload: KnowledgeJobTransitionPayload<
        "queued" | "processing" | "waiting" | "succeeded" | "failed",
        "cancelled",
        { reason: string }
      >;
    })
  | (SyncKnowledgeEventContext & {
      eventType: "knowledge.revision_advanced";
      payload: {
        old_revision: string;
        new_revision: string;
        accepted_job_ids: string[];
      };
    });

export interface SyncIntake {
  upstream_from: string;
  upstream_to: string;
  merged_pr_ids: string[];
  corpus_batch_ids: string[];
  knowledge_only: boolean;
}

export interface SyncStagingProgress {
  workspace_id: string;
  epochs_total: number;
  epochs_applied: number;
  minor_conflicts_resolved: number;
  conflicts_awaiting_operator: number;
  auto_resolved_paths?: string[];
  workspace_path?: string;
  session_head_sha?: string;
  staging_head_sha?: string;
  observed_upstream?: string;
  validated_upstream?: string;
  last_durable_stage?: "workspace_created" | "session_rebased" | "pr_series_reconciled" | "validated";
  rebase_in_progress?: boolean;
  conflicting_paths?: string[];
  pr_workspaces?: Array<{
    series_id: string;
    branch: string;
    workspace_path: string;
    source_head: string;
    staging_head?: string;
    commits_total?: number;
    auto_resolved_paths?: string[];
    conflicting_paths?: string[];
  }>;
  validation_evidence?: JsonObject;
}

export type SyncPrReconciliationResult = "clean" | "auto_resolved" | "needs_operator";

export interface SyncPrReconciliation {
  series_id: string;
  branch: string;
  result: SyncPrReconciliationResult;
  pushed: boolean;
}

export interface SyncPublication {
  remote_application_id?: string;
  prior_head: string;
  new_head: string;
  knowledge_revision: string;
  invalidated_ids: string[];
}

export interface SyncState {
  sync_id: string;
  project_id: string;
  session_uuid: string;
  revision: number;
  status: SyncStatus;
  trace_id: string;
  caused_by_event_id: string;
  blockers: Blocker[];
  created_at: string;
  updated_at: string;
  latest_event_sequence: number;
  intake: SyncIntake;
  staging: SyncStagingProgress | null;
  pr_reconciliation: SyncPrReconciliation[];
  publication: SyncPublication | null;
  blocked_origin_status: SyncStatus | null;
  validation_evidence: JsonObject | null;
  resolved_conflict_paths: string[];
}

export interface SyncTransitionPatch {
  status?: SyncStatus;
  blockers?: Blocker[];
  intake?: SyncIntake;
  staging?: SyncStagingProgress | null;
  prReconciliation?: SyncPrReconciliation[];
  publication?: SyncPublication | null;
  validationEvidence?: JsonObject | null;
  resolvedConflictPaths?: string[];
}

export interface SyncTransitionInput {
  actor: EventActor;
  commandId: string;
  correlationId: string;
  causationId?: string;
  eventType?: SyncWorkflowEventType;
  expectedRevision: number;
  occurredAt?: string;
  patch: SyncTransitionPatch;
  payload?: JsonObject;
  spanId?: string;
  parentSpanId?: string;
}

export interface RecordSyncRequestedInput {
  projectId: string;
  sessionUuid: string;
  intake: SyncIntake;
  observationSourceIdentity: string;
  syncId?: string;
  traceId?: string;
  actor: EventActor;
  commandId: string;
  correlationId: string;
  spanId?: string;
  occurredAt?: string;
}
