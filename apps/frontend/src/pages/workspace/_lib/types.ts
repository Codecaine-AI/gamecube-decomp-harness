import type { AppRoute, SessionFocus, SessionStage, SessionSubPage } from "@/routing";
import type { Dashboard, FormState, JsonObject, UiConfig } from "@/lib/format";
import type { GrainSettings, GrainSettingsPatch } from "@/lib/styleSettings";
import type { ImprovedMode, WorkMode } from "@/pages/workspace/sessions/active/subphases/run/components/work-tables";
import type { processView } from "@/lib/processView";

export type DashboardAction =
  | "refresh"
  | "sync"
  | "syncGit"
  | "indexPrs"
  | "calculateBaseline"
  | "init"
  | "fresh"
  | "completeRun"
  | "start"
  | "startWork"
  | "stop"
  | "finishEpoch"
  | "forceStop"
  | "pausePr"
  | "resumePr"
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
