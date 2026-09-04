import type { SyncMergePolicy } from "@server/core/game-registry/runtime-options.js";
import type { EventActor, JsonObject } from "@server/core/harness-state/events.js";
import type { Blocker } from "@server/core/harness-state/types.js";

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

// sync.pr_push_* events intentionally use subject_kind "sync_push", not this sync_workflow union.
export const SYNC_WORKFLOW_EVENT_TYPES = [
  "sync.requested",
  "sync.observation_refreshed",
  "sync.discord_refresh_requested",
  "sync.discord_refresh_completed",
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

export type SyncWorkflowEventType = (typeof SYNC_WORKFLOW_EVENT_TYPES)[number];
export type SyncEventType = SyncWorkflowEventType;

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
  untouched_cycle_head: string;
  untouched_submodule_heads: JsonObject[];
}

export interface SyncSubmodulePointer extends JsonObject {
  path: string;
  gitlink_head: string;
  checked_out_head: string;
}

export interface SyncBoundaryPublishedPayload extends JsonObject {
  upstream_revision: string;
  knowledge_intake: JsonObject;
  validation_evidence: JsonObject;
}

export interface SyncIntake {
  upstream_from: string;
  upstream_to: string;
  merged_pr_ids: string[];
  corpus_batch_ids: string[];
  knowledge_only: boolean;
}

export interface SyncStagingProgress {
  workspace_id: string;
  commits_behind: number;
  merge_policy?: SyncMergePolicy;
  minor_conflicts_resolved: number;
  conflicts_awaiting_operator: number;
  auto_resolved_paths?: string[];
  workspace_path?: string;
  cycle_head_sha?: string;
  staging_head_sha?: string;
  observed_upstream?: string;
  validated_upstream?: string;
  last_durable_stage?: "workspace_created" | "cycle_merged" | "pr_series_reconciled" | "validated";
  merge_in_progress?: boolean;
  conflicting_paths?: string[];
  pr_workspaces?: Array<{
    series_id: string;
    branch: string;
    workspace_path: string;
    source_head: string;
    staging_head?: string;
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
  knowledge_intake: JsonObject;
}

export interface SyncState {
  sync_id: string;
  game_id: string;
  cycle_uuid: string;
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
  gameId: string;
  cycleUuid: string;
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
