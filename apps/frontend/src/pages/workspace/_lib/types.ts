import type { AppRoute, HarnessDetail, HarnessSubPage } from "@/routing";
import type { Dashboard, FormState, JsonObject, RunDetails, UiConfig } from "@/lib/format";
import type { GrainSettings, GrainSettingsPatch } from "@/lib/styleSettings";
import type { ImprovedMode, WorkMode } from "@/pages/workspace/harness/subphases/run/components/work-tables";
import type { processView } from "@/lib/processView";

export type DashboardAction =
  | "refresh"
  | "syncGit"
  | "indexPrs"
  | "init"
  | "harnessPause"
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

export interface DispatchStateBlocker {
  code: string;
  message: string;
  source_kind: string;
  source_id: string;
  recoverable: boolean;
}

export interface DispatchStateActionProjection {
  action_id: string;
  subject_kind: string;
  subject_id: string;
  enabled: boolean;
  blocked_by: DispatchStateBlocker[];
  expected_transition: string;
  confirmation_required: boolean;
}

export type DispatchStateRunStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type DispatchStateRunSchedulerCondition =
  | "idle"
  | "planning"
  | "dispatching"
  | "waiting"
  | "boundary"
  | "blocked";

export interface DispatchStateRunRecoveryPoint {
  event_id: string;
  sequence: number;
  occurred_at: string;
  recovery_reason: string | null;
  cancelled_claim_ids: string[];
  cancelled_operation_ids: string[];
  resulting_status: DispatchStateRunStatus | null;
}

export interface DispatchStateRunReadModel {
  workflow_id: string;
  status: DispatchStateRunStatus;
  scheduler_condition: DispatchStateRunSchedulerCondition | null;
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
  recovery_points: DispatchStateRunRecoveryPoint[];
}

export type DispatchStateSyncStatus =
  | "requested"
  | "ingesting"
  | "reconciling"
  | "validating"
  | "validated"
  | "publishing"
  | "published"
  | "blocked"
  | "cancelled";

export interface DispatchStateSyncReadModel {
  workflow_id: string;
  status: DispatchStateSyncStatus;
  blockers: DispatchStateBlocker[];
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
    prs: DispatchStateSyncKnowledgeJobGroup;
    discord: DispatchStateSyncKnowledgeJobGroup;
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
    commits_behind: number;
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
    knowledge_intake: DispatchStateKnowledgeIntakeSummary | null;
  } | null;
  staleness: {
    stale: boolean;
    validated_upstream: string | null;
    observed_upstream: string | null;
    blocker: DispatchStateBlocker | null;
    revalidate_action_id: "sync.cancel" | null;
  };
}

export interface DispatchStateSyncKnowledgeJobGroup {
  jobs_total: number;
  jobs_succeeded: number;
  jobs_failed: number;
  jobs_processing: number;
}

// Server-owned repo state: what is our head vs the upstream branch, and do we
// need a sync? The client renders these fields as-is and never re-derives them.
export interface DispatchStateRepoSyncReadModel {
  head: string | null;
  upstream_ref: string;
  upstream_anchor: string | null;
  local_upstream_sha: string | null;
  behind_count: number | null;
  last_synced_at: string | null;
  needs_sync: boolean;
}

export interface DispatchStateDispatchHandoff {
  target_kind: "run" | "pr" | "sync";
  target_workflow_id: string;
  reason: string;
  requested_at: string;
}

export interface DispatchStateDispatchLease {
  kind: "run" | "pr" | "sync";
  workflow_id: string;
  lease_id: string;
  status: "acquiring" | "active" | "blocked" | "releasing";
  acquired_at: string;
  heartbeat_at: string;
  headline: string;
  requested_handoff?: DispatchStateDispatchHandoff;
  blockers: DispatchStateBlocker[];
}

export interface DispatchStateQueuedDispatchRequest {
  kind: "run" | "pr" | "sync";
  workflow_id: string;
  reason: string;
  requested_at: string;
  requested_by: string;
}

export interface DispatchStateSavePoint {
  id: string;
  triggerKind: string;
  label: string | null;
  commitSha: string | null;
  matchedCodePercent: number | null;
  createdAt: string;
}

export interface DispatchStateKnowledgeLease extends JsonObject {
  id: string;
  expires_at: string;
}

export interface DispatchStateKnowledgeFailure extends JsonObject {
  job_id: string;
  worker_state_id: string;
  error: string;
  attempts: number;
  updated_at: string;
}

export interface DispatchStateKnowledgeIntakeSummary {
  fetched_prs: number;
  skipped_prs: number;
  renames_applied: number;
  tasks_enqueued: number;
  lanes: string[];
}

export interface DispatchStateKnowledgeFreshness extends JsonObject {
  queued: number;
  processing: number;
  waiting: number;
  failed: number;
  oldest_pending_at: string | null;
  active_lease: DispatchStateKnowledgeLease | null;
  retry: JsonObject | null;
  recent_failures: DispatchStateKnowledgeFailure[];
}

export interface DispatchStateOperationSummary extends JsonObject {
  operation_id: string;
  status: string;
}

export interface DispatchStateEventSummary extends JsonObject {
  event_type: string;
  sequence: number;
}

export interface HarnessStateReadModel {
  identity: { game_id: string; harness_id: string; revision: number };
  source: { worktree: string; head: string | null; upstream_revision: string | null; configuration_revision: string };
  execution: { desired: "run" | "paused"; workflow: "sync" | "run" | "none"; status: string; blockers: DispatchStateBlocker[] };
  readiness: { build: string; sources: string; sandbox: string; evidence: string };
  history: { run_id: string | null; epoch_id: string | null; sync_id: string | null; timeline_cursor: number; save_point_id: string | null };
}

export interface HarnessBoundaryReadModel {
  identity: { game_id: string; harness_id: string; event_id: string; order: number; occurred_at: string; command_id: string };
  kind: string;
  outcome: string;
  runId: string | null;
  epochId: string | null;
  syncId: string | null;
  source: JsonObject;
  evidence: JsonObject;
  recovery: JsonObject | null;
}

export interface HarnessStateViewModel {
  state?: HarnessStateReadModel | null;
  timeline?: HarnessBoundaryReadModel[];
  game_id: string;
  harness_revision: number;
  active_workflow: DispatchStateDispatchLease | null;
  queued_dispatch_requests: DispatchStateQueuedDispatchRequest[];
  run: DispatchStateRunReadModel | null;
  knowledge: DispatchStateKnowledgeFreshness;
  sync: DispatchStateSyncReadModel | null;
  repo_sync: DispatchStateRepoSyncReadModel | null;
  active_operations: DispatchStateOperationSummary[];
  recent_events: DispatchStateEventSummary[];
  available_actions: DispatchStateActionProjection[];
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

export interface HarnessView {
  harnessId: string;
  harnessLabel: string;
  activeClaims: number;
  baselineLabel: string;
  branchLabel: string;
  canOpenPrs: boolean;
  canStartWorkers: boolean;
  canonicalBlockers: string[];
  canonicalPhase: string;
  canonicalSubphase: string;
  handoffIdle: boolean;
  handoffReason: string;
  mode: "none" | "pr" | "run";
  modeEvidence: string[];
  modeLabel: string;
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
  harnessState: HarnessStateViewModel | null;
  recommendedSub: HarnessSubPage;
  runStatus: string;
  syncLocked: boolean;
  syncing: boolean;
}

export interface WorkspaceNav {
  goToDashboard: () => void;
  goToSection: (section: Extract<AppRoute, { kind: "workspace" }>["section"]) => void;
  goToHarness: (sub?: HarnessSubPage, detail?: HarnessDetail) => void;
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
  view: HarnessView;
  workMode: WorkMode;
}
