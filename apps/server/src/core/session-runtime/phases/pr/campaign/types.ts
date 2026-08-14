import type { EventActor, JsonObject } from "@server/core/project-state/events.js";
import type { Blocker } from "@server/core/project-state/types.js";

export const PR_CAMPAIGN_STATUSES = [
  "preparing",
  "in_review",
  "working",
  "completed",
  "abandoned",
] as const;

export const PR_SERIES_STATUSES = [
  "prepared",
  "published",
  "changes_requested",
  "revising",
  "approved",
  "merged",
  "closed",
] as const;

export const PR_WORK_ITEM_STATUSES = ["pending", "in_progress", "resolved", "declined"] as const;

export const PR_LIFECYCLE_EVENT_TYPES = [
  "pr.campaign_opened",
  "pr.batch_published",
  "pr.series_published",
  "pr.feedback_ingested",
  "pr.series_revised",
  "pr.series_merged",
  "pr.series_closed",
  "pr.campaign_recovered",
  "pr.campaign_closed",
] as const;

export const PR_DERIVED_STATUS_EVENT_TYPES = [
  "pr.campaign_in_review",
  "pr.campaign_working",
  "pr.series_prepared",
  "pr.series_changes_requested",
  "pr.series_revising",
  "pr.series_approved",
] as const;

export const PR_PROGRESS_EVENT_TYPES = [
  "pr.work_items_claimed",
  "pr.work_items_resolved",
  "pr.work_items_declined",
] as const;

export const PR_EVENT_TYPES = [
  ...PR_LIFECYCLE_EVENT_TYPES,
  ...PR_DERIVED_STATUS_EVENT_TYPES,
  ...PR_PROGRESS_EVENT_TYPES,
] as const;

export type PrCampaignStatus = (typeof PR_CAMPAIGN_STATUSES)[number];
export type PrSeriesStatus = (typeof PR_SERIES_STATUSES)[number];
export type PrWorkItemStatus = (typeof PR_WORK_ITEM_STATUSES)[number];
export type PrLifecycleEventType = (typeof PR_LIFECYCLE_EVENT_TYPES)[number];
export type PrDerivedStatusEventType = (typeof PR_DERIVED_STATUS_EVENT_TYPES)[number];
export type PrProgressEventType = (typeof PR_PROGRESS_EVENT_TYPES)[number];
export type PrEventType = (typeof PR_EVENT_TYPES)[number];

export interface PrSourceAnchor {
  save_point_id: string;
  source_revision: string;
}

export interface PrPublicationPolicy {
  batch_size: number;
}

export interface PrWorkItem {
  item_id: string;
  series_id: string;
  source_kind: string;
  source_id: string;
  status: PrWorkItemStatus;
  summary: string;
  created_at: string;
  resolved_at: string | null;
}

export interface PrSeriesState {
  series_id: string;
  campaign_id: string;
  revision: number;
  batch_index: number;
  status: PrSeriesStatus;
  branch: string;
  upstream_pr_number: number | null;
  target_units: string[];
  last_validation: JsonObject | null;
  trace_id: string;
  caused_by_event_id: string;
  blockers: Blocker[];
  updated_at: string;
  work_items: PrWorkItem[];
}

export interface PrCampaignState {
  campaign_id: string;
  project_id: string;
  session_uuid: string;
  revision: number;
  status: PrCampaignStatus;
  trace_id: string;
  caused_by_event_id: string;
  blockers: Blocker[];
  created_at: string;
  closed_at: string | null;
  latest_event_sequence: number;
  source_anchor: PrSourceAnchor;
  publication_policy: PrPublicationPolicy;
  series_ids: string[];
}

export interface PrTransitionContext {
  actor: EventActor;
  commandId: string;
  correlationId: string;
  causationId?: string;
  occurredAt?: string;
  spanId?: string;
}

export interface PrCampaignTransitionPatch {
  status?: PrCampaignStatus;
  blockers?: Blocker[];
  closedAt?: string | null;
}

export interface PrCampaignTransitionInput extends PrTransitionContext {
  expectedRevision: number;
  eventType?: PrEventType;
  patch: PrCampaignTransitionPatch;
  payload?: JsonObject;
}

export interface PrSeriesTransitionPatch {
  status?: PrSeriesStatus;
  blockers?: Blocker[];
  upstreamPrNumber?: number | null;
  lastValidation?: JsonObject | null;
}

export interface PrSeriesTransitionInput extends PrTransitionContext {
  expectedRevision: number;
  eventType?: PrEventType;
  patch: PrSeriesTransitionPatch;
  payload?: JsonObject;
}

export interface PreparedPrSeriesInput {
  seriesId?: string;
  batchIndex: number;
  branch: string;
  targetUnits: string[];
  lastValidation?: JsonObject | null;
  traceId?: string;
}

export interface OpenPrCampaignInput extends PrTransitionContext {
  projectId: string;
  sessionUuid: string;
  namedSavePointId: string;
  campaignId?: string;
  traceId?: string;
  publicationPolicy?: Partial<PrPublicationPolicy>;
  series?: PreparedPrSeriesInput[];
}

export interface RecordPreparedPrSeriesInput extends PrTransitionContext, PreparedPrSeriesInput {
  campaignId: string;
}

export interface PrFeedbackWorkItemInput {
  itemId?: string;
  sourceKind: string;
  sourceId: string;
  summary: string;
}

export interface IngestPrFeedbackInput extends Omit<PrTransitionContext, "actor"> {
  actor?: EventActor;
  seriesId: string;
  expectedRevision: number;
  items: PrFeedbackWorkItemInput[];
}

export interface IngestPrFeedbackResult {
  acceptedItemIds: string[];
  duplicateItemIds: string[];
  series: PrSeriesState;
}

export interface ObservePrSeriesFeedbackInput {
  sourceKind: string;
  sourceId: string;
  summary: string;
}

export interface ObservePrSeriesRemoteInput {
  /** Required nonblank when reviewDecision resolves to APPROVED. */
  approvalSourceIdentity?: string;
  /** Required nonblank when reviewDecision resolves to APPROVED. */
  approvedRevision?: string;
  /** Required nonblank when reviewDecision resolves to APPROVED. */
  approvingActor?: string;
  branch: string;
  commandId: string;
  correlationId: string;
  feedback?: ObservePrSeriesFeedbackInput[];
  mergedUpstreamRevision?: string;
  occurredAt?: string;
  reviewDecision?: string;
  state: string;
  spanId?: string;
  upstreamPrNumber: number;
}

export interface ObservePrSeriesRemoteResult {
  feedbackItemIds: string[];
  ignored: boolean;
  series: PrSeriesState | null;
}

export interface PrWorkItemStatusTransition {
  itemId: string;
  expectedStatus: PrWorkItemStatus;
  status: PrWorkItemStatus;
  resolvedAt?: string | null;
}

export interface TransitionPrWorkItemsInput extends PrSeriesTransitionInput {
  seriesId: string;
  workItems: PrWorkItemStatusTransition[];
}
