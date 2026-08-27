import type { AppRoute, CycleDetail, CycleFocus, CycleStage, CycleSubPage } from "@/routing";
import type { Dashboard, FormState, JsonObject, RunDetails, UiConfig } from "@/lib/format";
import type { GrainSettings, GrainSettingsPatch } from "@/lib/styleSettings";
import type { ImprovedMode, WorkMode } from "@/pages/workspace/cycles/active/subphases/run/components/work-tables";
import type { processView } from "@/lib/processView";

export type DashboardAction =
  | "refresh"
  | "syncGit"
  | "indexPrs"
  | "init"
  | "fresh"
  | "completeRun"
  | "cycleSavePoint"
  | "cycleClose"
  | "runStart"
  | "runResume"
  | "runHardStop"
  | "runCancel"
  | "runRecover"
  | "syncStart"
  | "syncResolveConflict"
  | "syncPublish"
  | "syncCancel"
  | "syncRecover"
  | "syncRecoverDiscard"
  | "syncRevalidate"
  | "prAdoptLegacy"
  | "knowledgeProcess"
  | "start"
  | "startWork"
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

export interface HarnessStateBlocker {
  code: string;
  message: string;
  source_kind: string;
  source_id: string;
  recoverable: boolean;
}

export interface HarnessStateActionProjection {
  action_id: string;
  subject_kind: string;
  subject_id: string;
  enabled: boolean;
  blocked_by: HarnessStateBlocker[];
  expected_transition: string;
  confirmation_required: boolean;
}

export type HarnessStateRunStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type HarnessStateRunSchedulerCondition =
  | "idle"
  | "planning"
  | "dispatching"
  | "waiting"
  | "boundary"
  | "blocked";

export interface HarnessStateRunRecoveryPoint {
  event_id: string;
  sequence: number;
  occurred_at: string;
  recovery_reason: string | null;
  cancelled_claim_ids: string[];
  cancelled_operation_ids: string[];
  resulting_status: HarnessStateRunStatus | null;
}

export interface HarnessStateRunReadModel {
  workflow_id: string;
  status: HarnessStateRunStatus;
  scheduler_condition: HarnessStateRunSchedulerCondition | null;
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
  recovery_points: HarnessStateRunRecoveryPoint[];
}

export type HarnessStateSyncStatus =
  | "requested"
  | "ingesting"
  | "reconciling"
  | "validating"
  | "validated"
  | "publishing"
  | "published"
  | "blocked"
  | "cancelled";

export interface HarnessStateSyncReadModel {
  workflow_id: string;
  status: HarnessStateSyncStatus;
  blockers: HarnessStateBlocker[];
  intake: {
    upstream_from: string;
    upstream_to: string;
    merged_pr_count: number;
    corpus_batches: string[];
    knowledge_only: boolean;
  };
  knowledge_jobs?: {
    jobs_total: number;
    jobs_succeeded: number;
    jobs_failed: number;
    jobs_processing: number;
    prs: HarnessStateSyncKnowledgeJobGroup;
    discord: HarnessStateSyncKnowledgeJobGroup;
  } | null;
  discord: {
    corpus?: {
      batches_done: number;
      messages_indexed: number;
      through_month: string | null;
    };
    refresh: {
      status: "running" | "ok" | "failed";
      detail: string | null;
      at: string | null;
      messages_pulled: number | null;
    } | null;
    staged: {
      batches: number;
      messages: number;
      days: number;
      channels: number;
    } | null;
  } | null;
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
    blocker: HarnessStateBlocker | null;
    revalidate_action_id: "sync.cancel" | null;
  };
}

export interface HarnessStateSyncKnowledgeJobGroup {
  jobs_total: number;
  jobs_succeeded: number;
  jobs_failed: number;
  jobs_processing: number;
}

// Server-owned repo state: what is our head vs the upstream branch, and do we
// need a sync? The client renders these fields as-is and never re-derives them.
export interface HarnessStateRepoSyncReadModel {
  cycle_head: string | null;
  upstream_ref: string;
  upstream_anchor: string | null;
  local_upstream_sha: string | null;
  behind_count: number | null;
  last_synced_at: string | null;
  needs_sync: boolean;
}

export interface HarnessStateDispatchHandoff {
  target_kind: "run" | "pr" | "sync";
  target_workflow_id: string;
  reason: string;
  requested_at: string;
}

export interface HarnessStateDispatchLease {
  kind: "run" | "pr" | "sync";
  workflow_id: string;
  lease_id: string;
  status: "acquiring" | "active" | "blocked" | "releasing";
  acquired_at: string;
  heartbeat_at: string;
  headline: string;
  requested_handoff?: HarnessStateDispatchHandoff;
  blockers: HarnessStateBlocker[];
}

export interface HarnessStateQueuedDispatchRequest {
  kind: "run" | "pr" | "sync";
  workflow_id: string;
  reason: string;
  requested_at: string;
  requested_by: string;
}

export interface HarnessStateSavePoint {
  id: string;
  triggerKind: string;
  label: string | null;
  commitSha: string | null;
  matchedCodePercent: number | null;
  createdAt: string;
}

export interface HarnessStateTimelineEntry {
  id: number;
  cycle_uuid: string;
  entry_kind: "epoch_completed" | "remote_application" | "pr_phase" | "save_point";
  entry_id: string;
  occurred_at: string;
  payload: JsonObject;
  caused_by_event_id: string | null;
}

export interface HarnessStateCycleReadModel {
  cycle_uuid: string;
  head_revision: string | null;
  status: string;
  latest_save_point: HarnessStateSavePoint | null;
  save_point_stale: boolean;
  timeline: HarnessStateTimelineEntry[];
}

export interface HarnessStateKnowledgeLease extends JsonObject {
  id: string;
  expires_at: string;
}

export interface HarnessStateKnowledgeFailure extends JsonObject {
  job_id: string;
  worker_state_id: string;
  error: string;
  attempts: number;
  updated_at: string;
}

export interface HarnessStateKnowledgeFreshness extends JsonObject {
  published_revision: string | null;
  queued: number;
  processing: number;
  waiting: number;
  failed: number;
  oldest_pending_at: string | null;
  active_lease: HarnessStateKnowledgeLease | null;
  retry: JsonObject | null;
  recent_failures: HarnessStateKnowledgeFailure[];
}

export interface HarnessStateOperationSummary extends JsonObject {
  operation_id: string;
  status: string;
}

export interface HarnessStateEventSummary extends JsonObject {
  event_type: string;
  sequence: number;
}

export interface HarnessStateReadModel {
  game_id: string;
  harness_revision: number;
  active_workflow: HarnessStateDispatchLease | null;
  queued_dispatch_requests: HarnessStateQueuedDispatchRequest[];
  cycle: HarnessStateCycleReadModel | null;
  run: HarnessStateRunReadModel | null;
  knowledge: HarnessStateKnowledgeFreshness;
  sync: HarnessStateSyncReadModel | null;
  repo_sync: HarnessStateRepoSyncReadModel | null;
  active_operations: HarnessStateOperationSummary[];
  recent_events: HarnessStateEventSummary[];
  available_actions: HarnessStateActionProjection[];
  compatibility_actions: HarnessStateActionProjection[];
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

export interface CycleView {
  activeCycleId: string;
  activeCycleLabel: string;
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
  newCycleBlocked: boolean;
  newCycleReasons: string[];
  operationActive: boolean;
  operationLabel: string;
  prBlockedReasons: string[];
  prRecords: PrFlowRecord[];
  // The run configuration and automatic baseline status live in the details
  // rail. The Prepare stage's git-sync/PR-intake framing is retired.
  prepareState: {
    baseline: JsonObject;
    baselineDone: boolean;
    intakeDone: boolean;
    knowledgeDone: boolean;
    readyToStartRun: boolean;
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
  game: UiConfig["selectedGame"];
  harnessState: HarnessStateReadModel | null;
  recommendedSub: CycleSubPage;
  runStatus: string;
  cycleStageStates: Record<CycleStage, "done" | "todo">;
  syncLocked: boolean;
  syncing: boolean;
}

export interface WorkspaceNav {
  goToDashboard: () => void;
  goToSection: (section: Extract<AppRoute, { kind: "workspace" }>["section"]) => void;
  goToCycle: (focus: CycleFocus, sub?: CycleSubPage, detail?: CycleDetail) => void;
}

export interface GameWorkspaceProps {
  busy: boolean;
  collapsed: boolean;
  config: UiConfig | null;
  dashboard: Dashboard | null;
  errorMessage: string;
  form: FormState;
  grainSettings: GrainSettings;
  improvedMode: ImprovedMode;
  improvedPage: number;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  onAction: (action: DashboardAction) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onDismissError: () => void;
  onGrainSettingsChange: (updates: GrainSettingsPatch) => void;
  onNavigate: (route: AppRoute) => void;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
  runDetails: RunDetails | null;
  setForm: (updates: Partial<FormState>) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  view: CycleView;
  workMode: WorkMode;
}
