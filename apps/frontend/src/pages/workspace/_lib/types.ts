import type { AppRoute, SessionFocus, SessionStage, SessionSubPage } from "@/routing";
import type { Dashboard, FormState, JsonObject, UiConfig } from "@/lib/format";
import type { GrainSettings, GrainSettingsPatch } from "@/lib/styleSettings";
import type { ImprovedMode, WorkMode } from "@/pages/workspace/sessions/active/subphases/run/components/work-tables";
import type { processView } from "@/lib/processView";

export type DashboardAction =
  | "refresh"
  | "syncGit"
  | "indexPrs"
  | "calculateBaseline"
  | "init"
  | "fresh"
  | "completeRun"
  | "sessionSavePoint"
  | "sessionClose"
  | "runStart"
  | "runPause"
  | "runResume"
  | "runHardStop"
  | "runCancel"
  | "runRecover"
  | "syncStart"
  | "syncResolveConflict"
  | "syncPublish"
  | "syncCancel"
  | "syncRecover"
  | "syncRevalidate"
  | "prOpenCampaign"
  | "prActivate"
  | "prPublishBatch"
  | "prRelease"
  | "prCloseCampaign"
  | "prAbandonCampaign"
  | "prCampaignRecover"
  | "prAdoptLegacy"
  | "knowledgeProcess"
  | "start"
  | "startWork"
  | "finishEpoch"
  | "checkpoint"
  | "qa"
  | "qaRepair"
  | "reconcile"
  | "splitPlan"
  | "preparePr"
  | "syncPrs"
  | "prepareLocalPr"
  | "prepareLocalBatch"
  | "openPr"
  | "openDraftBatch"
  | "openAllPrs";

export interface ProjectStateBlocker {
  code: string;
  message: string;
  source_kind: string;
  source_id: string;
  recoverable: boolean;
}

export interface ProjectStateActionProjection {
  action_id: string;
  subject_kind: string;
  subject_id: string;
  enabled: boolean;
  blocked_by: ProjectStateBlocker[];
  expected_transition: string;
  confirmation_required: boolean;
}

export type ProjectStateRunStatus =
  | "draft"
  | "ready"
  | "active"
  | "draining"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type ProjectStateRunSchedulerCondition =
  | "idle"
  | "planning"
  | "dispatching"
  | "waiting"
  | "boundary"
  | "blocked";

export interface ProjectStateRunRecoveryPoint {
  event_id: string;
  sequence: number;
  occurred_at: string;
  recovery_reason: string | null;
  cancelled_claim_ids: string[];
  cancelled_operation_ids: string[];
  resulting_status: ProjectStateRunStatus | null;
}

export interface ProjectStateRunReadModel {
  workflow_id: string;
  status: ProjectStateRunStatus;
  scheduler_condition: ProjectStateRunSchedulerCondition | null;
  active_epoch: {
    epoch_id: string;
    ordinal: number;
  } | null;
  admitted: number;
  claimed: number;
  running: number;
  progress: {
    baseline_score: number | null;
    confirmed_score: number | null;
    tentative_changes: number;
    confirmed_changes: number;
    regressed_changes: number;
  };
  recovery_points: ProjectStateRunRecoveryPoint[];
}

export type ProjectStateSyncStatus =
  | "requested"
  | "ingesting"
  | "reconciling"
  | "validating"
  | "validated"
  | "publishing"
  | "published"
  | "blocked"
  | "cancelled";

export interface ProjectStateSyncReadModel {
  workflow_id: string;
  status: ProjectStateSyncStatus;
  blockers: ProjectStateBlocker[];
  intake: {
    upstream_from: string;
    upstream_to: string;
    merged_pr_count: number;
    corpus_batches: string[];
    knowledge_only: boolean;
  };
  staging: {
    epochs_applied: number;
    epochs_total: number;
    minor_auto_resolved_count: number;
    conflicts_awaiting_operator: number;
    conflicts: string[];
  } | null;
  pr_reconciliation: {
    total: number;
    clean: number;
    auto_resolved: number;
    needs_operator: number;
    pushed: number;
    pending_pushes: number;
  };
  publish_preview: {
    prior_head: string;
    new_head: string;
    series_pushes: number;
  };
  publication: {
    remote_application_id?: string;
    prior_head: string;
    new_head: string;
    knowledge_revision: string;
    invalidated_ids: string[];
  } | null;
  staleness: {
    stale: boolean;
    validated_upstream: string | null;
    observed_upstream: string | null;
    blocker: ProjectStateBlocker | null;
    revalidate_action_id: "sync.cancel" | null;
  };
}

export type ProjectStatePrCampaignStatus =
  | "preparing"
  | "in_review"
  | "working"
  | "completed"
  | "abandoned";

export type ProjectStatePrSeriesStatus =
  | "prepared"
  | "published"
  | "changes_requested"
  | "revising"
  | "approved"
  | "merged"
  | "closed";

export type ProjectStatePrWorkItemStatus = "pending" | "in_progress" | "resolved" | "declined";

export interface ProjectStatePrWorkItem {
  item_id: string;
  series_id: string;
  series_branch: string;
  source_kind: string;
  source_id: string;
  status: ProjectStatePrWorkItemStatus;
  summary: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ProjectStatePrSeriesSummary {
  series_id: string;
  batch_index: number;
  status: ProjectStatePrSeriesStatus;
  branch: string;
  upstream_pr_number: number | null;
  target_units: string[];
  last_validation: JsonObject | null;
  blockers: ProjectStateBlocker[];
  work_items: ProjectStatePrWorkItem[];
}

export interface ProjectStatePrReadModel {
  workflow_id: string;
  status: ProjectStatePrCampaignStatus;
  source_anchor: {
    save_point_id: string;
    source_revision: string;
  };
  publication_policy: {
    batch_size: number;
  };
  blockers: ProjectStateBlocker[];
  series: ProjectStatePrSeriesSummary[];
  series_by_status: Record<ProjectStatePrSeriesStatus, ProjectStatePrSeriesSummary[]>;
  next_batch: {
    batch_index: number;
    series_ids: string[];
    validation_state: string;
    blockers: ProjectStateBlocker[];
    series: ProjectStatePrSeriesSummary[];
  } | null;
  pending_work_items: {
    count: number;
    items: ProjectStatePrWorkItem[];
  };
  activation: {
    active: boolean;
    queued: boolean;
    lease_id: string | null;
    status: string | null;
    blockers: ProjectStateBlocker[];
  };
}

export interface ProjectStateDispatchHandoff {
  target_kind: "run" | "pr" | "sync";
  target_workflow_id: string;
  reason: string;
  requested_at: string;
}

export interface ProjectStateDispatchLease {
  kind: "run" | "pr" | "sync";
  workflow_id: string;
  lease_id: string;
  status: "acquiring" | "active" | "draining" | "blocked" | "releasing";
  acquired_at: string;
  heartbeat_at: string;
  headline: string;
  requested_handoff?: ProjectStateDispatchHandoff;
  blockers: ProjectStateBlocker[];
}

export interface ProjectStateQueuedDispatchRequest {
  kind: "run" | "pr" | "sync";
  workflow_id: string;
  reason: string;
  requested_at: string;
  requested_by: string;
}

export interface ProjectStateSavePoint {
  id: string;
  triggerKind: string;
  label: string | null;
  commitSha: string | null;
  matchedCodePercent: number | null;
  createdAt: string;
}

export interface ProjectStateTimelineEntry {
  id: number;
  session_uuid: string;
  entry_kind: "epoch_completed" | "remote_application" | "pr_phase" | "save_point";
  entry_id: string;
  occurred_at: string;
  payload: JsonObject;
  caused_by_event_id: string | null;
}

export interface ProjectStateSessionReadModel {
  session_uuid: string;
  head_revision: string | null;
  status: string;
  latest_save_point: ProjectStateSavePoint | null;
  save_point_stale: boolean;
  timeline: ProjectStateTimelineEntry[];
}

export interface ProjectStateKnowledgeLease extends JsonObject {
  id: string;
  expires_at: string;
}

export interface ProjectStateKnowledgeFailure extends JsonObject {
  job_id: string;
  worker_state_id: string;
  error: string;
  attempts: number;
  updated_at: string;
}

export interface ProjectStateKnowledgeFreshness extends JsonObject {
  published_revision: string | null;
  queued: number;
  processing: number;
  waiting: number;
  failed: number;
  oldest_pending_at: string | null;
  active_lease: ProjectStateKnowledgeLease | null;
  retry: JsonObject | null;
  recent_failures: ProjectStateKnowledgeFailure[];
}

export interface ProjectStateOperationSummary extends JsonObject {
  operation_id: string;
  status: string;
}

export interface ProjectStateEventSummary extends JsonObject {
  event_type: string;
  sequence: number;
}

export interface ProjectStateReadModel {
  project_id: string;
  project_revision: number;
  active_workflow: ProjectStateDispatchLease | null;
  queued_dispatch_requests: ProjectStateQueuedDispatchRequest[];
  session: ProjectStateSessionReadModel | null;
  run: ProjectStateRunReadModel | null;
  pr_work: ProjectStatePrReadModel[];
  knowledge: ProjectStateKnowledgeFreshness;
  sync: ProjectStateSyncReadModel | null;
  active_operations: ProjectStateOperationSummary[];
  recent_events: ProjectStateEventSummary[];
  available_actions: ProjectStateActionProjection[];
  compatibility_actions: ProjectStateActionProjection[];
}

export interface PrFlowRecord {
  branch: string;
  ci: string;
  comments: number;
  displayName: string;
  files: string[];
  localBranch: string;
  localStatus: string;
  localWorktreePath: string;
  prepStartedAt: string;
  repairNote: string;
  reviewSubState: string;
  validationStatus: string;
  prNumber: number;
  source: "pr_records" | "split_plan" | "current_objective_fixture";
  sourceDetail: string;
  status: string;
  title: string;
  url: string;
}

export interface SessionView {
  activeSessionId: string;
  activeSessionLabel: string;
  activeClaims: number;
  baselineLabel: string;
  branchLabel: string;
  canOpenPrs: boolean;
  canCompleteRun: boolean;
  canStartWorkers: boolean;
  canonicalBlockers: string[];
  canonicalGates: JsonObject;
  canonicalPhase: string;
  canonicalSubphase: string;
  handoffIdle: boolean;
  handoffReason: string;
  hasMeleePrFixture: boolean;
  mode: "none" | "pr" | "run";
  modeEvidence: string[];
  modeLabel: string;
  newSessionBlocked: boolean;
  newSessionReasons: string[];
  operationActive: boolean;
  operationLabel: string;
  prBlockedReasons: string[];
  prRecords: PrFlowRecord[];
  prepareState: {
    baseline: JsonObject;
    baselineDone: boolean;
    headSha: string;
    headShortSha: string;
    intake: JsonObject;
    intakeDone: boolean;
    knowledge: JsonObject;
    knowledgeDone: boolean;
    mergedPrs: number[];
    prIndexDebt: JsonObject;
    prIndexDebtKnown: boolean;
    pendingMergedPrIndexCount: number;
    pendingIntakePrCount: number;
    pendingPrIndexCount: number;
    runningIntakeItemCount: number;
    completedIntakeItemCount: number;
    failedIntakeItemCount: number;
    retryableIntakeItemCount: number;
    totalIntakeItemCount: number;
    readyToStartRun: boolean;
    sessionCurrentWorktreePath: string;
    sync: JsonObject;
    syncDone: boolean;
    upstreamChanged: boolean | null;
    upstreamWorktreePath: string;
  };
  prSummary: {
    checkpoint: JsonObject;
    qa: JsonObject;
    qaRepair: JsonObject;
    ship: JsonObject;
    splitPlan: JsonObject;
    upstreamOpen: number;
    warning: string;
  };
  process: ReturnType<typeof processView>;
  project: UiConfig["selectedProject"];
  projectState: ProjectStateReadModel | null;
  recommendedSub: SessionSubPage;
  runStatus: string;
  sessionStageStates: Record<SessionStage, "done" | "todo">;
  syncLocked: boolean;
  syncing: boolean;
}

export interface WorkspaceNav {
  goToDashboard: () => void;
  goToSection: (section: Extract<AppRoute, { kind: "workspace" }>["section"]) => void;
  goToSession: (focus: SessionFocus, sub?: SessionSubPage) => void;
}

export interface ProjectWorkspaceProps {
  busy: boolean;
  collapsed: boolean;
  config: UiConfig | null;
  dashboard: Dashboard | null;
  errorMessage: string;
  form: FormState;
  grainSettings: GrainSettings;
  improvedMode: ImprovedMode;
  improvedPage: number;
  onAction: (action: DashboardAction) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onDismissError: () => void;
  onGrainSettingsChange: (updates: GrainSettingsPatch) => void;
  onNavigate: (route: AppRoute) => void;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
  setForm: (updates: Partial<FormState>) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  workMode: WorkMode;
}
