import {
  AlertTriangle,
  Archive,
  Ban,
  BookOpen,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Hammer,
  History,
  Home,
  ListTree,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";
import {
  asArray,
  asObject,
  clock,
  num,
  numberValue,
  pct,
  shortId,
  text,
  type Dashboard,
  type FormState,
  type JsonObject,
  type UiConfig,
} from "@decomp-orchestrator/ui-contract";
import { processView } from "../lib/processView";
import {
  type AppRoute,
  type SessionFocus,
  type SessionSubPage,
  type WorkspaceSection,
  SESSION_PHASES,
  SESSION_SUBPAGES,
  WORKSPACE_SECTIONS,
} from "../routing";
import { KnowledgeGraphPage, StandardsPage } from "./KnowledgeBase";
import { ProgressPanel } from "./ProgressPanel";
import {
  Button,
  CheckboxField,
  EmptyState,
  Field,
  InfoRows,
  List,
  NavItem,
  PageHeader,
  PanelSection,
  PanelTitle,
  PhaseStepperBar,
  Pill,
  SelectField,
  StatCard,
  SubNav,
} from "./primitives";
import { type ImprovedMode, type WorkMode, WorkTables } from "./WorkTables";

export type DashboardAction =
  | "refresh"
  | "sync"
  | "init"
  | "fresh"
  | "start"
  | "startWork"
  | "stop"
  | "forceStop"
  | "pausePr"
  | "resumePr"
  | "checkpoint"
  | "qa"
  | "reconcile"
  | "splitPlan"
  | "preparePr"
  | "syncPrs"
  | "prepareLocalPr"
  | "prepareLocalBatch"
  | "openPr"
  | "openDraftBatch"
  | "openAllPrs";

interface PrFlowRecord {
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
  activeLeases: number;
  baselineLabel: string;
  branchLabel: string;
  canOpenPrs: boolean;
  canStartWorkers: boolean;
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
  syncLocked: boolean;
  syncing: boolean;
}

function isLocalBranchPrRecord(record: PrFlowRecord): boolean {
  return record.sourceDetail === "local_branch_discovery" || /^codex\/split-\d{2}-/.test(record.branch);
}

function isDraftBatchCandidate(record: PrFlowRecord): boolean {
  return record.status === "planned" && Boolean(record.branch) && (record.localStatus === "ready" || (record.localStatus === "local_only" && isLocalBranchPrRecord(record)));
}

function processName(value: unknown): string {
  const raw = text(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

function schedulingForWorkers(
  workers: number,
): Pick<
  FormState,
  | "candidateLimit"
  | "candidateWindow"
  | "epochReadyQueueSize"
  | "epochSize"
  | "fastKgMaintenanceIntervalMs"
  | "fastKgMaintenanceReportCount"
  | "maxWorkers"
  | "queueLowWatermark"
  | "queueTargetSize"
> {
  const maxWorkers = Math.max(1, Math.trunc(workers));
  const queueTargetSize = maxWorkers * 4;
  return {
    maxWorkers,
    candidateLimit: queueTargetSize,
    candidateWindow: queueTargetSize,
    queueLowWatermark: maxWorkers,
    queueTargetSize,
    epochSize: String(queueTargetSize),
    epochReadyQueueSize: queueTargetSize,
    fastKgMaintenanceIntervalMs: 180000,
    fastKgMaintenanceReportCount: Math.max(4, maxWorkers),
  };
}

const schedulingPresets = [
  { id: "small", label: "Small", workers: 4 },
  { id: "medium", label: "Medium", workers: 8 },
  { id: "large", label: "Large", workers: 16 },
  { id: "xl", label: "XL", workers: 32 },
] as const;

function schedulingPresetForWorkers(workers: unknown) {
  return schedulingPresets.find((preset) => preset.workers === Number(workers)) ?? schedulingPresets[2];
}

function statusClass(value: unknown): string {
  const status = text(value);
  if (status === "passed" || status === "pr_ready" || status === "passing" || status === "merged" || status === "ready") return "text-up";
  if (status === "failed" || status === "blocked" || status === "qa_repair_blocked" || status === "failing" || status === "changes_requested" || status === "dirty") return "text-down";
  if (status === "local_only" || status === "remote_only" || status === "published" || status === "open" || status === "draft" || status === "pending" || status === "planned_mock" || status === "warning" || status === "not_prepared" || status === "preparing" || status === "repairing" || status === "branch_pushed") return "text-warn";
  return "text-dim";
}

function prettyStatus(value: unknown, fallback = "-"): string {
  const raw = text(value, fallback);
  return raw.replace(/_/g, " ");
}

function compactFilePath(path: string): string {
  return path.replace(/^src\/melee\//, "").replace(/^src\//, "");
}

function fileCountLabel(count: number): string {
  return count === 1 ? "1 file" : `${num(count)} files`;
}

function hasKeys(value: JsonObject): boolean {
  return Object.keys(value).length > 0;
}

function artifactStatus(value: JsonObject, keys: string[]): boolean {
  return keys.some((key) => Boolean(value[key]));
}

function operationLooksPrMode(name: string): boolean {
  return /pr|qa|handoff|reconcile|split|draft|open/i.test(name);
}

function sessionIdForRun(runId: string): string {
  return runId ? `run:${runId}` : "legacy";
}

function prRecordMatchesSession(record: JsonObject, runId: string, activeBranches: Set<string>): boolean {
  if (!runId) return true;
  const recordRunId = text(record.runId);
  if (recordRunId) return recordRunId === runId;
  const sessionId = text(record.sessionId);
  if (sessionId && sessionId !== "legacy") return sessionId === sessionIdForRun(runId);
  const branch = text(record.branch);
  if (branch && activeBranches.has(branch)) return true;
  const status = text(record.status, "planned");
  return !Number.isFinite(numberValue(record.prNumber, NaN)) && ["planned", "planned_mock", "blocked"].includes(status);
}

function derivedPrRecords(dashboard: Dashboard | null, hasMeleePrFixture: boolean): PrFlowRecord[] {
  const prs = asObject(dashboard?.prs);
  const records = asArray(prs.records).map(asObject);
  const runId = text(asObject(asObject(dashboard?.status).run).id);
  const splitPlan = asObject(asObject(dashboard?.handoff).splitPlan);
  const activeBranches = new Set(asArray(splitPlan.slices).map((slice) => text(asObject(slice).branchName)).filter(Boolean));
  if (records.length > 0) {
    return records.filter((record) => prRecordMatchesSession(record, runId, activeBranches)).map((record): PrFlowRecord => {
      const local = asObject(record.local);
      const validation = asObject(record.validation);
      const sourcePlan = asObject(record.sourcePlan);
      return {
        branch: text(record.branch),
        ci: text(record.ci),
        comments: numberValue(record.comments, 0),
        displayName: text(record.displayName, text(record.sliceId, text(record.branch, "-"))),
        files: asArray(record.files).map((file) => text(file)).filter(Boolean),
        localBranch: text(local.branch),
        localStatus: text(local.status, "not_prepared"),
        localWorktreePath: text(local.worktreePath),
        prepStartedAt: text(local.prepStartedAt),
        prNumber: numberValue(record.prNumber, NaN),
        repairNote: text(validation.repairNote),
        reviewSubState: text(asObject(record.review).subState),
        source: "pr_records",
        sourceDetail: text(sourcePlan.source),
        status: text(record.status, "planned"),
        title: text(record.title),
        url: text(record.url),
        validationStatus: text(validation.status, "not_run"),
      };
    });
  }

  const slices = asArray(splitPlan.slices).map(asObject).filter((slice) => text(slice.lane) === "match");
  if (slices.length > 0) {
    return slices.map((slice): PrFlowRecord => ({
      branch: text(slice.branchName),
      ci: "",
      comments: 0,
      displayName: text(slice.displayName, text(slice.id, "planned slice")),
      files: asArray(slice.pathspecs).map((file) => text(file)).filter(Boolean),
      localBranch: "",
      localStatus: "not_prepared",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "split_plan",
      sourceDetail: "split_plan",
      status: "planned",
      title: text(slice.title),
      url: "",
      validationStatus: "not_run",
    }));
  }

  if (!hasMeleePrFixture) return [];
  return [
    {
      branch: "planned/mock/melee-match-slice-a",
      ci: "",
      comments: 0,
      displayName: "Planned match slice A",
      files: ["18 routed warning-only candidate files"],
      localBranch: "",
      localStatus: "not_prepared",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "current_objective_fixture",
      sourceDetail: "current_objective_fixture",
      status: "planned_mock",
      title: "Mock PR slice from routed QA handoff state",
      url: "",
      validationStatus: "not_run",
    },
    {
      branch: "planned/mock/melee-match-slice-b",
      ci: "",
      comments: 0,
      displayName: "Planned match slice B",
      files: ["ship set isolation required before draft opening"],
      localBranch: "",
      localStatus: "blocked",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "current_objective_fixture",
      sourceDetail: "current_objective_fixture",
      status: "blocked",
      title: "Blocked until PR promotion gate is clean",
      url: "",
      validationStatus: "failed",
    },
  ];
}

export function deriveSessionView(dashboard: Dashboard | null, config: UiConfig | null, form: FormState): SessionView {
  const project =
    dashboard?.project ??
    config?.availableProjects.find((item) => item.id === form.projectId) ??
    config?.selectedProject ??
    null;
  const selectedProcessName = processName(form.processName || project?.processName);
  const process = processView(dashboard, selectedProcessName);
  const status = asObject(dashboard?.status);
  const run = asObject(status.run);
  const runStatus = text(run.status);
  const runId = text(run.id);
  const activeLeases = numberValue(status.activeLeases, 0);
  const campaign = asObject(dashboard?.campaign);
  const head = asObject(campaign.head);
  const handoff = asObject(dashboard?.handoff);
  const checkpoint = asObject(handoff.checkpoint || dashboard?.checkpoint);
  const qa = asObject(handoff.qa);
  const qaRepair = asObject(handoff.qaRepair);
  const splitPlan = asObject(handoff.splitPlan);
  const ship = asObject(handoff.ship);
  const prs = asObject(dashboard?.prs);
  const operation = asObject(asObject(dashboard?.process).operation);
  const operationStatus = text(operation.status);
  const operationName = text(operation.name);
  const operationActive = operationStatus === "running" || asObject(dashboard?.process).freshRunActive === true;
  const syncing = asObject(dashboard?.process).projectSyncActive === true;
  const syncLocked = runStatus === "active";
  const hasHandoffEvidence =
    artifactStatus(checkpoint, ["id", "checkpointPath", "prCandidatesPath"]) ||
    artifactStatus(qa, ["status", "summaryPath", "prReportPath"]) ||
    artifactStatus(qaRepair, ["status", "recommendation", "schema_version", "summaryPath", "shipStatusPath"]) ||
    artifactStatus(splitPlan, ["status", "summaryPath", "outputPath", "matchSlices"]) ||
    artifactStatus(ship, ["status", "patchPath"]) ||
    asArray(prs.records).length > 0 ||
    operationLooksPrMode(operationName);
  const hasMeleePrFixture = project?.id === "melee" && !process.running && runStatus !== "active";
  const modeEvidence: string[] = [];
  if (process.running) modeEvidence.push(process.draining ? "process draining" : "worker process running");
  if (activeLeases > 0) modeEvidence.push(`${num(activeLeases)} active lease(s)`);
  if (runStatus === "active") modeEvidence.push("run status active");
  if (hasHandoffEvidence) modeEvidence.push("handoff, QA, split, ship, or PR evidence exists");
  if (hasMeleePrFixture && !hasHandoffEvidence) modeEvidence.push("current Melee PR-flow planned/mock fixture");

  let mode: SessionView["mode"] = "none";
  if (process.running || activeLeases > 0) mode = "run";
  else if (hasHandoffEvidence || hasMeleePrFixture) mode = "pr";
  else if (runStatus === "active" || runId) mode = "run";

  const prRecords = derivedPrRecords(dashboard, hasMeleePrFixture);
  const prBlockedReasons: string[] = [];
  const shipStatus = text(ship.status);
  const qaStatus = text(asObject(qa.prPromotion).status, text(qa.status));
  const qaRepairStatus = text(qaRepair.recommendation, text(qaRepair.status));
  if (shipStatus && shipStatus !== "pr_ready") prBlockedReasons.push(`ship set ${prettyStatus(shipStatus)}`);
  if (qaStatus === "blocked" || qaStatus === "failed") prBlockedReasons.push(`QA ${prettyStatus(qaStatus)}`);
  if (qaRepairStatus && !["passed", "clean", "pr_ready"].includes(qaRepairStatus)) prBlockedReasons.push(`QA repair ${prettyStatus(qaRepairStatus)}`);
  if (hasMeleePrFixture) prBlockedReasons.push("current PR repair campaign is routed-blocked; isolate ship set before draft opening");

  const activePrStatuses = new Set(["planned", "planned_mock", "branch_pushed", "draft", "open", "changes_requested", "blocked"]);
  const unresolvedPrRecords = prRecords.filter((record) => activePrStatuses.has(record.status));
  const localPrRecords = prRecords.filter((record) => !["merged", "closed"].includes(record.status) && ["ready", "blocked", "dirty"].includes(record.localStatus));
  const newSessionReasons: string[] = [];
  if (process.running) newSessionReasons.push("worker process is running or detached");
  if (activeLeases > 0) newSessionReasons.push(`${num(activeLeases)} active lease(s) remain`);
  if (runStatus === "active") newSessionReasons.push("run status is active");
  if (unresolvedPrRecords.length > 0) newSessionReasons.push(`${num(unresolvedPrRecords.length)} PR slice(s) unresolved`);
  if (localPrRecords.length > 0) newSessionReasons.push(`${num(localPrRecords.length)} local PR workspace(s) unresolved`);
  if (prBlockedReasons.length > 0) newSessionReasons.push(...prBlockedReasons);
  if (head.dirty === true) newSessionReasons.push("campaign head is dirty");

  const handoffIdle = Boolean(runId) && !process.running && activeLeases === 0 && !syncing && !operationActive;
  const handoffReason = !runId
    ? "No run yet."
    : process.draining
      ? "Workers are draining."
      : process.running
        ? "Pause the run first."
        : syncing
          ? "Sync is in progress."
          : operationActive
            ? `${text(operation.label, "An operation")} is in progress.`
            : activeLeases > 0
              ? `Waiting on ${num(activeLeases)} draining lease(s).`
              : "";

  const baseline = asObject(handoff.baseline);
  const baselineSha = text(baseline.baseSha, text(campaign.baseSha));
  const branch = text(head.branch, text(campaign.branch, "-"));
  const activeSessionId = runId || text(asObject(campaign.savePoint).commit_sha, `${project?.id ?? "project"}:no-run`);
  const activeSessionLabel = runId ? `Run ${shortId(runId)}` : `Session at ${shortId(activeSessionId)}`;
  // The active-session sub-page that matches the current phase. Overview and
  // the sessions index use this so "open the active session" lands on the right
  // phase surface instead of a mode-specific global tab.
  const recommendedSub: SessionSubPage = mode === "pr" ? "pr" : mode === "run" ? "run" : "summary";

  return {
    activeSessionId,
    activeSessionLabel,
    activeLeases,
    baselineLabel: baselineSha ? baselineSha.slice(0, 10) : "not built",
    branchLabel: `${branch}${head.dirty === true ? " dirty" : ""}`,
    canOpenPrs: !process.running && activeLeases === 0 && !syncing && !operationActive,
    canStartWorkers: !process.running && !syncing && !operationActive && mode !== "pr",
    handoffIdle,
    handoffReason,
    hasMeleePrFixture,
    mode,
    modeEvidence,
    modeLabel: mode === "pr" ? "PR Mode" : mode === "run" ? "Run Mode" : "No Active Session",
    newSessionBlocked: newSessionReasons.length > 0,
    newSessionReasons,
    operationActive,
    operationLabel: text(operation.label, "An operation"),
    prBlockedReasons,
    prRecords,
    prSummary: {
      checkpoint,
      qa,
      qaRepair,
      ship,
      splitPlan,
      upstreamOpen: numberValue(prs.upstreamOpen, NaN),
      warning: text(prs.warning),
    },
    process,
    project,
    recommendedSub,
    runStatus,
    syncLocked,
    syncing,
  };
}

function ErrorStrip({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div className="flex w-full shrink-0 items-start gap-2.5 border-b border-down/40 bg-down/10 px-3 py-1.5 text-xs text-down">
      <AlertTriangle className="mt-0.5 shrink-0" size={14} />
      <span className="min-w-0 flex-1 whitespace-normal break-words" title={error}>
        {error}
      </span>
      <button className="ml-auto shrink-0 whitespace-nowrap text-down/80 hover:text-down" onClick={onDismiss} type="button">
        dismiss
      </button>
    </div>
  );
}

export interface ProjectWorkspaceProps {
  busy: boolean;
  collapsed: boolean;
  config: UiConfig | null;
  dashboard: Dashboard | null;
  errorMessage: string;
  form: FormState;
  improvedMode: ImprovedMode;
  improvedPage: number;
  onAction: (action: DashboardAction) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onDismissError: () => void;
  onNavigate: (route: AppRoute) => void;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
  setForm: (updates: Partial<FormState>) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  streamState: string;
  workMode: WorkMode;
}

interface WorkspaceNav {
  goToDashboard: () => void;
  goToSection: (section: WorkspaceSection) => void;
  goToSession: (focus: SessionFocus, sub?: SessionSubPage) => void;
}

function useWorkspaceNav(onNavigate: (route: AppRoute) => void, projectId: string | undefined): WorkspaceNav {
  return {
    goToDashboard: () => onNavigate({ kind: "dashboard" }),
    goToSection: (section) => onNavigate({ kind: "workspace", section, projectId }),
    goToSession: (focus, sub) => onNavigate({ kind: "workspace", section: "sessions", session: focus, sessionSub: sub, projectId }),
  };
}

const SECTION_ICONS: Record<WorkspaceSection, ReactNode> = {
  overview: <Home size={15} />,
  standards: <ClipboardCheck size={15} />,
  knowledge: <BookOpen size={15} />,
  sessions: <ListTree size={15} />,
  settings: <Settings size={15} />,
};

function ProjectWorkspaceNav({
  collapsed,
  nav,
  onCollapsedChange,
  route,
  view,
}: {
  collapsed: boolean;
  nav: WorkspaceNav;
  onCollapsedChange: (collapsed: boolean) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
  view: SessionView;
}) {
  if (collapsed) {
    return (
      <aside className="sidebar-rail sidebar-rail-collapsed grid min-w-0 overflow-hidden border-r border-line2 bg-ink max-[780px]:block">
        <div className="sidebar-rail-tab z-10 flex h-full flex-col items-center justify-start gap-3 bg-raised px-0 max-[780px]:h-[42px] max-[780px]:flex-row max-[780px]:items-center max-[780px]:gap-2 max-[780px]:px-3">
          {/* Header region mirrors the open rail's 68px top bar (including its
              bottom separator) so the divider stays at the same vertical point
              and the toggle button keeps its position when toggling. */}
          <div className="flex h-[68px] w-full shrink-0 items-center justify-center border-b border-line2 max-[780px]:h-auto max-[780px]:w-auto">
            <button aria-expanded={false} className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line2 bg-raised text-soft hover:border-faint hover:text-fg" onClick={() => onCollapsedChange(false)} title="Show project navigation" type="button">
              <ChevronRight size={16} />
              <span className="sr-only">Show</span>
            </button>
          </div>
          {/* Collapsed navigation: section icons with tooltips instead of the
              project name, so collapsing keeps full section nav available. */}
          <nav className="flex w-full flex-col items-center gap-2 max-[780px]:flex-row" aria-label="Project workspace">
            {WORKSPACE_SECTIONS.map((item) => (
              <button
                aria-current={route.section === item.id ? "page" : undefined}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border ${
                  route.section === item.id ? "border-up/60 bg-up/10 text-fg" : "border-line bg-card text-soft hover:border-line2 hover:bg-raised"
                }`}
                key={item.id}
                onClick={() => nav.goToSection(item.id)}
                title={item.label}
                type="button"
              >
                {SECTION_ICONS[item.id]}
                <span className="sr-only">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar-rail sidebar-rail-open min-w-0 overflow-auto border-r border-line2 bg-ink">
      <div className="sidebar-rail-content">
        {/* Shares a fixed 68px height with the main content PageHeader
            (see primitives.tsx) so the two top bars align exactly. */}
        <div className="sticky top-0 z-10 flex h-[68px] items-center gap-2 border-b border-line2 bg-raised px-3 py-3">
          <button aria-expanded className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line2 bg-raised text-soft hover:border-faint hover:text-fg" onClick={() => onCollapsedChange(true)} title="Collapse navigation" type="button">
            <ChevronLeft size={16} />
            <span className="sr-only">Collapse</span>
          </button>
          {/* The project name centers in the space between the collapse button
              and the right edge, and truncates so it always fits the rail. */}
          {/* The project name centers between the collapse button and the
              right edge. Font size scales with the viewport (and thus the
              vw-based rail width) so long titles shrink to fit instead of
              truncating with an ellipsis. */}
          <h1 className="m-0 min-w-0 flex-1 overflow-hidden whitespace-nowrap px-3 text-center text-[13px] font-bold uppercase tracking-[0.14em] text-fg">GC DECOMP HARNESS</h1>
        </div>
        <div className="grid gap-2.5 p-2.5">
          <button
            className="block w-full border border-line bg-panel p-3 text-center hover:border-line2 hover:bg-raised"
            onClick={() => nav.goToSession("active", view.recommendedSub)}
            title="Open the active session"
            type="button"
          >
            <div className="flex items-center justify-center gap-2.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-dim">Active Session</span>
              <span className="h-3 w-px bg-line2" aria-hidden="true" />
              <span className={`text-[11px] ${view.mode === "pr" ? "text-warn" : view.mode === "run" ? "text-up" : "text-dim"}`}>{view.modeLabel}</span>
            </div>
          </button>
          <div className="border-t border-line" />
          <nav className="grid gap-1.5" aria-label="Project workspace">
            {WORKSPACE_SECTIONS.map((item) => (
              <NavItem
                active={route.section === item.id}
                description={item.description}
                icon={SECTION_ICONS[item.id]}
                key={item.id}
                label={item.label}
                onClick={() => nav.goToSection(item.id)}
              />
            ))}
          </nav>
          <button className="flex items-center justify-center gap-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-dim hover:text-soft" onClick={nav.goToDashboard} title="Back to all projects" type="button">
            <ChevronLeft size={12} /> All Projects
          </button>
        </div>
      </div>
    </aside>
  );
}

function RunControls({ busy, form, onAction, setForm, view }: { busy: boolean; form: FormState; onAction: (action: DashboardAction) => void; setForm: (updates: Partial<FormState>) => void; view: SessionView }) {
  const preset = schedulingPresetForWorkers(form.maxWorkers);
  const startBlocked = view.mode === "pr" ? "PR Mode work is unresolved for this active session." : view.process.running ? "Workers are already running." : view.syncing ? "Sync is in progress." : view.operationActive ? `${view.operationLabel} is in progress.` : "";
  return (
    <PanelSection>
      <PanelTitle>Run Controls</PanelTitle>
      <div className="grid grid-cols-3 gap-2">
        <Button disabled={busy || !view.canStartWorkers} icon={<Play size={14} />} onClick={() => onAction("startWork")} title={view.canStartWorkers ? "Init/resume this run and start workers." : startBlocked} tone={view.canStartWorkers ? "primary" : undefined} type="button">
          {view.runStatus === "paused" ? "Resume" : "Start"}
        </Button>
        <Button disabled={busy || !view.process.running || view.process.draining} icon={view.process.draining ? <RefreshCw size={14} /> : <Pause size={14} />} onClick={() => onAction("pausePr")} title={view.process.running ? "Drain workers and pause intake." : "Workers are not running."} tone="warning" type="button">
          {view.process.draining ? "Draining" : "Pause"}
        </Button>
        <Button disabled={busy || !view.process.running} icon={<Ban size={14} />} onClick={() => onAction("forceStop")} title={view.process.running ? "Kill workers and recover leases." : "No process is running."} tone="danger" type="button">
          Kill
        </Button>
      </div>
      {view.mode === "pr" ? <p className="mb-0 mt-2 text-xs text-warn">Run start is gated because this active session is in PR Mode.</p> : null}
      <details className="control-disclosure" open>
        <summary>{`Setup - ${text(form.provider, "codex-lb")} - ${preset.label} - epoch ${text(form.epochSize)}`}</summary>
        <label className="mt-2 mb-2 block text-xs text-dim">
          <span>Run size</span>
          <select className="mt-1" onChange={(event) => setForm(schedulingForWorkers(Number(event.currentTarget.value)))} value={preset.workers}>
            {schedulingPresets.map((item) => (
              <option key={item.id} value={item.workers}>
                {item.label} / {item.workers} workers / queue {item.workers * 4}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-2 @[30rem]:grid-cols-2">
          <SelectField label="Epoch size" onChange={(event) => setForm({ epochSize: event.currentTarget.value })} options={["32", "64", "128", "256", "512", "full"]} value={form.epochSize} />
          <Field label="Ready queue" min={1} onChange={(event) => setForm({ epochReadyQueueSize: Math.max(1, Number(event.currentTarget.value) || 1) })} type="number" value={form.epochReadyQueueSize} />
          <SelectField label="Boundary KG" onChange={(event) => setForm({ fullKgMaintenanceMode: event.currentTarget.value })} options={["full", "no-tool-runners", "skip"]} value={form.fullKgMaintenanceMode} />
          <SelectField label="Worker thinking" onChange={(event) => setForm({ workerThinkingLevel: event.currentTarget.value })} options={["medium", "low", "high", "xhigh"]} value={form.workerThinkingLevel} />
        </div>
        <CheckboxField checked={form.fastKgMaintenanceEnabled} label="Fast run-evidence refresh" onChange={(event) => setForm({ fastKgMaintenanceEnabled: event.currentTarget.checked })} />
      </details>
    </PanelSection>
  );
}

function ProcessCard({ form, view }: { form: FormState; view: SessionView }) {
  const selectedName = processName(form.processName);
  const display = view.process.display;
  return (
    <PanelSection>
      <PanelTitle>Process</PanelTitle>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Pill state={view.process.pillState} />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-dim">{text(display.name, selectedName)}</span>
      </div>
      <InfoRows
        rows={[
          ["PID", text(display.pid, "-")],
          ["Started", display.startedAt ? clock(display.startedAt) : "-"],
          ["Exit", String(display.exitCode ?? display.signal ?? "-")],
          ["Run", view.activeSessionLabel],
        ]}
      />
    </PanelSection>
  );
}

function readinessRows(view: SessionView, nav: WorkspaceNav): Array<[string, ReactNode, string]> {
  const repoTone = view.project?.repoRootExists === false ? "text-down" : "text-up";
  const stateTone = view.project?.stateDirExists === false ? "text-down" : "text-up";
  const graphTone = view.project?.graphDbExists === false ? "text-down" : "text-up";
  return [
    ["Repository", view.project?.repoRootExists === false ? "missing checkout" : "synced / known branch", repoTone],
    ["State dir", view.project?.stateDirExists === false ? "missing" : "present", stateTone],
    ["Graph DB", view.project?.graphDbExists === false ? "not built" : "built", graphTone],
    ["Standards", <button className="text-up underline-offset-2 hover:underline" onClick={() => nav.goToSection("standards")} title="Open standards" type="button">loaded / editable</button>, "text-up"],
  ];
}

function ProjectOverviewPage({ busy, form, nav, onAction, view }: { busy: boolean; form: FormState; nav: WorkspaceNav; onAction: (action: DashboardAction) => void; view: SessionView }) {
  const recommendedAction = view.mode === "pr" ? "Open PR Queue" : view.mode === "run" ? "Open Run" : "Start a Session";
  const recommendedHint =
    view.mode === "pr"
      ? "Resolve the active PR-mode session before starting another run."
      : view.mode === "run"
        ? "Workers are driving the board; telemetry and controls are the primary surface."
        : "No active session. Open the project sessions to start a run when ready.";
  return (
    <>
      <PageHeader kicker={view.project?.displayName ?? "No project selected"} title="Overview" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <section className="grid grid-cols-2 gap-3 @[36rem]:grid-cols-4">
          <StatCard label="Status" tone={view.mode === "pr" ? "text-warn" : view.mode === "run" ? "text-up" : "text-dim"} value={view.mode === "none" ? "No active session" : `Active session ${view.modeLabel}`} />
          <StatCard label="Session" value={view.activeSessionLabel} />
          <StatCard label="Branch" value={view.branchLabel} />
          <StatCard label="Baseline" value={view.baselineLabel} />
        </section>
        <PanelSection>
          <PanelTitle>Active Session</PanelTitle>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg">{view.activeSessionLabel}</div>
              <div className="mt-1 text-xs text-dim">
                Phase: <span className={view.mode === "pr" ? "text-warn" : view.mode === "run" ? "text-up" : "text-dim"}>{view.modeLabel}</span>
                {" · "}branch {view.branchLabel}
                {" · "}gate {view.newSessionBlocked ? "blocked" : "clear"}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button icon={<ListTree size={13} />} onClick={() => nav.goToSession("active", view.recommendedSub)} tone="primary" type="button">
                Open Session
              </Button>
              {view.mode === "pr" ? (
                <Button icon={<GitPullRequest size={13} />} onClick={() => nav.goToSession("active", "pr")} type="button">
                  Open PR Queue
                </Button>
              ) : null}
              <Button disabled={busy || !view.canStartWorkers} icon={view.process.draining ? <RefreshCw size={13} /> : <Ban size={13} />} onClick={() => onAction("stop")} title={view.process.running ? "Drain the managed process." : "No process is running."} tone="warning" type="button">
                Drain / Stop
              </Button>
              <Button icon={<RefreshCw size={13} />} onClick={() => onAction("refresh")} type="button">
                Refresh
              </Button>
              <Button disabled={busy || view.syncLocked || view.process.running || view.activeLeases > 0 || view.operationActive} icon={<Database size={13} />} onClick={() => onAction("sync")} title={view.syncLocked ? "Sync is locked while the run is active." : "Pull upstream, intake merged PRs, and rebuild knowledge."} type="button">
                Sync
              </Button>
            </div>
          </div>
        </PanelSection>
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <PanelSection>
            <PanelTitle>Recommended Next Step</PanelTitle>
            <p className="m-0 text-sm text-soft">{recommendedHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={view.mode === "pr" ? <GitPullRequest size={14} /> : <Play size={14} />} onClick={() => nav.goToSession("active", view.recommendedSub)} tone="primary" type="button">
                {recommendedAction}
              </Button>
              <Button icon={<RotateCcw size={14} />} disabled={busy || view.newSessionBlocked} onClick={() => onAction("fresh")} title={view.newSessionBlocked ? view.newSessionReasons.join("; ") : "Checkpoint, reset baseline, and start a new session."} tone="warning" type="button">
                New Session
              </Button>
              <Button icon={<Settings size={14} />} onClick={() => nav.goToSection("settings")} type="button">
                Project Settings
              </Button>
            </div>
          </PanelSection>
          <PanelSection>
            <PanelTitle>Session Gate</PanelTitle>
            {view.newSessionBlocked ? (
              <ul className="m-0 grid gap-1.5 p-0 text-xs text-warn">
                {view.newSessionReasons.slice(0, 6).map((reason) => (
                  <li className="list-none" key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-xs text-up">No session gate blockers detected.</p>
            )}
          </PanelSection>
        </div>
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
          <PanelSection>
            <PanelTitle>Project Readiness</PanelTitle>
            <InfoRows rows={readinessRows(view, nav)} />
          </PanelSection>
          <PanelSection>
            <PanelTitle>Repository Paths</PanelTitle>
            <InfoRows
              rows={[
                ["Checkout", form.repoRoot || view.project?.repoRoot || "-"],
                ["Artifacts", form.stateDir || view.project?.stateDir || "-"],
                ["Standards", "decomp_standards (shared)"],
                ["Process", processName(form.processName || view.project?.processName)],
                ["Base ref", view.project?.baseRef ?? "-"],
              ]}
            />
          </PanelSection>
        </div>
      </div>
    </>
  );
}

function ProjectSettingsPage({ config, form, nav, setForm, view }: { config: UiConfig | null; form: FormState; nav: WorkspaceNav; setForm: (updates: Partial<FormState>) => void; view: SessionView }) {
  const projects = config?.availableProjects ?? [];
  const defaults = asObject(config?.projectDefaults);
  const validation = asObject(defaults.validation);
  const pr = asObject(defaults.pr);
  return (
    <>
      <PageHeader kicker={view.project?.displayName ?? "No project selected"} title="Settings" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-[minmax(320px,0.75fr)_minmax(0,1fr)]">
          <PanelSection>
            <PanelTitle>Project Selection</PanelTitle>
            <SelectField
              label="Project"
              onChange={(event) => {
                const project = projects.find((item) => item.id === event.currentTarget.value);
                setForm({
                  projectId: event.currentTarget.value,
                  usePathOverrides: false,
                  repoRoot: project?.repoRoot ?? form.repoRoot,
                  stateDir: project?.stateDir ?? form.stateDir,
                  graphDbPath: project?.graphDbPath ?? form.graphDbPath,
                  processName: project?.processName ?? form.processName,
                });
              }}
              options={projects.length ? projects.map((project) => project.id) : [form.projectId || ""]}
              value={form.projectId}
            />
            <CheckboxField checked={form.usePathOverrides} label="Use custom paths" onChange={(event) => setForm({ usePathOverrides: event.currentTarget.checked })} />
            <Field disabled={!form.usePathOverrides} label="Repo root" onChange={(event) => setForm({ repoRoot: event.currentTarget.value })} spellCheck={false} value={form.repoRoot} />
            <Field disabled={!form.usePathOverrides} label="State dir" onChange={(event) => setForm({ stateDir: event.currentTarget.value })} spellCheck={false} value={form.stateDir} />
            <Field disabled={!form.usePathOverrides} label="Graph DB" onChange={(event) => setForm({ graphDbPath: event.currentTarget.value })} spellCheck={false} value={form.graphDbPath} />
            <p className="mb-0 mt-2 text-xs text-dim">
              Standards and durable project knowledge live in the <button className="text-accent underline-offset-2 hover:underline" onClick={() => nav.goToSection("standards")} type="button">Standards</button> page, not here.
            </p>
          </PanelSection>
          <PanelSection>
            <PanelTitle>Path Health</PanelTitle>
            <InfoRows
              rows={[
                ["Repo", form.repoRoot || view.project?.repoRoot || "-", view.project?.repoRootExists === false ? "text-down" : "text-soft"],
                ["State", form.stateDir || view.project?.stateDir || "-", view.project?.stateDirExists === false ? "text-down" : "text-soft"],
                ["Graph", form.graphDbPath || view.project?.graphDbPath || "-", view.project?.graphDbExists === false ? "text-down" : "text-soft"],
                ["Process", processName(form.processName || view.project?.processName)],
                ["Base ref", view.project?.baseRef ?? "-"],
              ]}
            />
          </PanelSection>
        </div>
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
          <PanelSection>
            <PanelTitle>Validation Defaults</PanelTitle>
            <List values={Object.entries(validation).map(([key, value]) => `${key}: ${String(value)}`)} empty="No validation defaults configured." />
          </PanelSection>
          <PanelSection>
            <PanelTitle>PR Defaults</PanelTitle>
            <List values={Object.entries(pr).map(([key, value]) => `${key}: ${String(value)}`)} empty="No PR defaults configured." />
          </PanelSection>
        </div>
      </div>
    </>
  );
}

function SessionsIndexPage({ busy, nav, onAction, view }: { busy: boolean; nav: WorkspaceNav; onAction: (action: DashboardAction) => void; view: SessionView }) {
  const savePoint = asObject(asObject(view.prSummary.ship).savePoint);
  return (
    <>
      <PageHeader kicker={view.project?.displayName ?? "No project selected"} title="Sessions" />
      <div className="@container grid min-h-0 flex-1 content-start grid-cols-[minmax(300px,1fr)_minmax(0,1.6fr)] gap-4 overflow-auto p-4 max-[1180px]:grid-cols-1">
        <PanelSection>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <PanelTitle className="mb-0">Active Session</PanelTitle>
            <span className={`text-[11px] ${view.mode === "pr" ? "text-warn" : view.mode === "run" ? "text-up" : "text-dim"}`}>{view.modeLabel}</span>
          </div>
          <div className="grid gap-3">
            <div className="min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg">{view.activeSessionLabel}</div>
              <div className="mt-1 text-xs text-dim">
                Phase: {view.modeLabel} {" · "} branch {view.branchLabel}
                {" · "} leases {num(view.activeLeases)}
              </div>
              {view.newSessionBlocked ? (
                <div className="mt-2 text-xs text-warn">
                  New session blocked — {view.newSessionReasons.slice(0, 3).join("; ")}
                  {view.newSessionReasons.length > 3 ? " …" : ""}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={<ListTree size={13} />} onClick={() => nav.goToSession("active", view.recommendedSub)} tone="primary" type="button">
                Open Session
              </Button>
              {view.process.running ? (
                <Button disabled={busy} icon={view.process.draining ? <RefreshCw size={13} /> : <Ban size={13} />} onClick={() => onAction("stop")} tone="warning" type="button">
                  {view.process.draining ? "Draining" : "Drain Run"}
                </Button>
              ) : null}
              <Button icon={<RotateCcw size={13} />} disabled={busy || view.newSessionBlocked} onClick={() => onAction("fresh")} title={view.newSessionBlocked ? view.newSessionReasons.join("; ") : "Checkpoint, reset baseline, and start a new session."} tone="warning" type="button">
                New Session
              </Button>
            </div>
          </div>
        </PanelSection>
        <PanelSection>
          <PanelTitle>Past Sessions</PanelTitle>
          <SessionHistoryTable savePoint={savePoint} view={view} />
        </PanelSection>
      </div>
    </>
  );
}

function SessionHistoryTable({ savePoint, view }: { savePoint: JsonObject; view: SessionView }) {
  // Today the dashboard payload is single-session; epoch checkpoints stand in
  // for past-session rows until a session index exists. The columns match the
  // plan's Sessions Index table so the shape is ready.
  const rows: Array<{ id: string; state: string; branch: string; outcome: string }> = [];
  if (view.activeSessionId && view.mode !== "none") {
    rows.push({ id: view.activeSessionLabel, state: view.modeLabel, branch: view.branchLabel, outcome: view.newSessionBlocked ? "in progress" : "active" });
  }
  if (text(savePoint.commit_sha)) {
    rows.push({ id: `Savepoint ${shortId(text(savePoint.commit_sha))}`, state: text(savePoint.trigger_kind, "complete"), branch: text(savePoint.branch, view.branchLabel), outcome: text(savePoint.trigger_kind, "carried forward") });
  }
  if (rows.length === 0) return <EmptyState>No past sessions recorded yet. Run evidence appears here as sessions close.</EmptyState>;
  return (
    <div className="overflow-hidden border border-line bg-card">
      <div className="grid grid-cols-[minmax(120px,1fr)_120px_minmax(120px,1fr)_minmax(120px,1fr)] gap-2 border-b border-line2 bg-raised px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">
        <span>Run</span>
        <span>State</span>
        <span>Branch</span>
        <span>Outcome</span>
      </div>
      {rows.map((row) => (
        <div className="grid grid-cols-[minmax(120px,1fr)_120px_minmax(120px,1fr)_minmax(120px,1fr)] gap-2 border-t border-line px-2.5 py-1.5 text-xs first:border-t-0" key={`${row.id}-${row.branch}`}>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-soft" title={row.id}>{row.id}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-soft">{row.state}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-dim" title={row.branch}>{row.branch}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-dim">{row.outcome}</span>
        </div>
      ))}
    </div>
  );
}

function currentPhaseId(view: SessionView): string {
  if (view.mode === "run") return "run";
  if (view.mode === "pr") return "pr";
  return "prepare";
}

function ActiveSessionPage(props: { busy: boolean; dashboard: Dashboard | null; form: FormState; improvedMode: ImprovedMode; improvedPage: number; nav: WorkspaceNav; onAction: (action: DashboardAction) => void; onOpenPr: (branch: string) => void; onPrepareLocalPr: (branch: string) => void; onSetReviewState: (branch: string, subState: string) => void; route: Extract<AppRoute, { kind: "workspace" }>; setForm: (updates: Partial<FormState>) => void; setImprovedMode: (mode: ImprovedMode) => void; setImprovedPage: (page: number | ((page: number) => number)) => void; setWorkMode: (mode: WorkMode) => void; streamState: string; view: SessionView; workMode: WorkMode }) {
  const sub = props.route.sessionSub ?? props.view.recommendedSub;
  const subItems = SESSION_SUBPAGES.map((item) => ({
    active: item.id === sub,
    id: item.id,
    label: item.label,
    onClick: () => props.nav.goToSession("active", item.id),
  }));
  return (
    <>
      <PageHeader kicker={props.view.project?.displayName ?? "No project selected"} title="Active Session" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <PhaseStepperBar current={currentPhaseId(props.view)} phases={SESSION_PHASES as unknown as Array<{ id: string; label: string }>} />
        <SubNav items={subItems} />
        <ActiveSessionSubPage {...props} sub={sub} />
      </div>
    </>
  );
}

function ActiveSessionSubPage(props: { busy: boolean; dashboard: Dashboard | null; form: FormState; improvedMode: ImprovedMode; improvedPage: number; nav: WorkspaceNav; onAction: (action: DashboardAction) => void; onOpenPr: (branch: string) => void; onPrepareLocalPr: (branch: string) => void; onSetReviewState: (branch: string, subState: string) => void; setForm: (updates: Partial<FormState>) => void; setImprovedMode: (mode: ImprovedMode) => void; setImprovedPage: (page: number | ((page: number) => number)) => void; setWorkMode: (mode: WorkMode) => void; streamState: string; sub: SessionSubPage; view: SessionView; workMode: WorkMode }) {
  if (props.sub === "run") {
    return (
      <RunModePage
        busy={props.busy}
        dashboard={props.dashboard}
        form={props.form}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        onAction={props.onAction}
        setForm={props.setForm}
        setImprovedMode={props.setImprovedMode}
        setImprovedPage={props.setImprovedPage}
        setWorkMode={props.setWorkMode}
        streamState={props.streamState}
        view={props.view}
        workMode={props.workMode}
      />
    );
  }
  if (props.sub === "pr") {
    return <PrModePage busy={props.busy} dashboard={props.dashboard} onAction={props.onAction} onOpenPr={props.onOpenPr} onPrepareLocalPr={props.onPrepareLocalPr} onSetReviewState={props.onSetReviewState} view={props.view} />;
  }
  if (props.sub === "prepare") return <PrepareSubPage busy={props.busy} onAction={props.onAction} view={props.view} />;
  if (props.sub === "review") return <ReviewSubPage busy={props.busy} onSetReviewState={props.onSetReviewState} view={props.view} />;
  if (props.sub === "artifacts") return <SessionHistoryPage dashboard={props.dashboard} view={props.view} />;
  return <ActiveSessionSummary nav={props.nav} view={props.view} />;
}

function ActiveSessionSummary({ nav, view }: { nav: WorkspaceNav; view: SessionView }) {
  const savePoint = asObject(asObject(view.prSummary.ship).savePoint);
  return (
    <div className="grid gap-4">
      <section className="grid grid-cols-2 gap-3 @[36rem]:grid-cols-4">
        <StatCard label="Mode" tone={view.mode === "pr" ? "text-warn" : view.mode === "run" ? "text-up" : "text-dim"} value={view.modeLabel} />
        <StatCard label="Run" value={view.runStatus || "no run"} />
        <StatCard label="Leases" value={num(view.activeLeases)} />
        <StatCard label="Process" value={view.process.pillState} />
      </section>
      <PanelSection>
        <PanelTitle>Mode Evidence</PanelTitle>
        <List values={view.modeEvidence.length ? view.modeEvidence : ["No active mode evidence yet."]} empty="No active mode evidence yet." />
      </PanelSection>
      <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
        <PanelSection>
          <PanelTitle>Run Artifacts</PanelTitle>
          <InfoRows
            rows={[
              ["Session id", view.activeSessionId],
              ["Baseline", view.baselineLabel],
              ["Branch", view.branchLabel],
              ["Latest save", text(savePoint.trigger_kind, "-")],
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<Play size={13} />} onClick={() => nav.goToSession("active", "run")} tone="primary" type="button">Open Run</Button>
          </div>
        </PanelSection>
        <PanelSection>
          <PanelTitle>PR Artifacts</PanelTitle>
          <InfoRows
            rows={[
              ["Checkpoint", hasKeys(view.prSummary.checkpoint) ? "available" : "none"],
              ["QA", prettyStatus(asObject(view.prSummary.qa.prPromotion).status, prettyStatus(view.prSummary.qa.status, "none")), statusClass(asObject(view.prSummary.qa.prPromotion).status || view.prSummary.qa.status)],
              ["QA repair", prettyStatus(view.prSummary.qaRepair.recommendation, prettyStatus(view.prSummary.qaRepair.status, "none")), statusClass(view.prSummary.qaRepair.recommendation || view.prSummary.qaRepair.status)],
              ["Split plan", prettyStatus(view.prSummary.splitPlan.status, "none"), statusClass(view.prSummary.splitPlan.status)],
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<GitPullRequest size={13} />} onClick={() => nav.goToSession("active", "pr")} tone="primary" type="button">Open PR Queue</Button>
            <Button icon={<Archive size={13} />} onClick={() => nav.goToSession("active", "artifacts")} type="button">Artifacts</Button>
          </div>
        </PanelSection>
      </div>
    </div>
  );
}

function PrepareSubPage({ busy, onAction, view }: { busy: boolean; onAction: (action: DashboardAction) => void; view: SessionView }) {
  return (
    <div className="grid gap-4">
      <PanelSection>
        <PanelTitle>Prepare Handoff</PanelTitle>
        <p className="mb-3 text-sm text-soft">
          Package this session for PR handoff: pause the run, rebuild the baseline, run QA, checkpoint, and plan the split. The full Prepare pipeline runs these in order; the manual steps below are escape hatches.
        </p>
        <PrModeActions busy={busy} onAction={onAction} view={view} />
      </PanelSection>
    </div>
  );
}

function ReviewSubPage({ busy, onSetReviewState, view }: { busy: boolean; onSetReviewState: (branch: string, subState: string) => void; view: SessionView }) {
  const inReview = view.prRecords.filter((record) => prStage(record) === "review" || record.reviewSubState);
  if (inReview.length === 0) return <EmptyState>No PR slices are in review. Drafts awaiting upstream feedback appear here.</EmptyState>;
  return (
    <div className="grid gap-3">
      {inReview.map((record) => {
        const stage = prStage(record);
        const sub = prSubStatus(record);
        return (
          <PanelSection key={`${record.source}-${record.branch}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg" title={record.title || record.displayName}>{record.displayName}</div>
                <div className="mt-1 text-xs text-dim">
                  {stage === "review" ? <span className={sub.tone}>{sub.label || prettyStatus(record.status)}</span> : <span className="text-dim">{prettyStatus(record.status)}</span>}
                  {Number.isFinite(record.prNumber) ? ` · #${record.prNumber}` : ""}
                  {record.comments > 0 ? ` · ${num(record.comments)} comment${record.comments === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(record.reviewSubState === "new_comments" || record.reviewSubState === "changes_requested") ? (
                  <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Mark these comments as seen." type="button">Ack</Button>
                ) : null}
                {record.reviewSubState !== "fixing" ? (
                  <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "fixing")} title="Mark that you are addressing the review feedback." type="button">Fixing</Button>
                ) : (
                  <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Clear the fixing flag." type="button">Clear Fixing</Button>
                )}
                {record.url ? (
                  <a className="pr-card-link" href={record.url} rel="noreferrer" target="_blank" title="Open on GitHub">View PR <ExternalLink size={11} /></a>
                ) : null}
              </div>
            </div>
          </PanelSection>
        );
      })}
    </div>
  );
}

function RunModePage(props: {
  busy: boolean;
  dashboard: Dashboard | null;
  form: FormState;
  improvedMode: ImprovedMode;
  improvedPage: number;
  onAction: (action: DashboardAction) => void;
  setForm: (updates: Partial<FormState>) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  streamState: string;
  view: SessionView;
  workMode: WorkMode;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)]">
        <RunControls busy={props.busy} form={props.form} onAction={props.onAction} setForm={props.setForm} view={props.view} />
        <ProcessCard form={props.form} view={props.view} />
      </div>
      <ProgressPanel dashboard={props.dashboard} streamState={props.streamState} />
      <WorkTables
        dashboard={props.dashboard}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        setImprovedMode={props.setImprovedMode}
        setImprovedPage={props.setImprovedPage}
        setWorkMode={props.setWorkMode}
        workMode={props.workMode}
      />
    </div>
  );
}

const PR_STAGES = [
  { id: "planned", label: "Planned", hint: "Waiting in split plan" },
  { id: "preparing", label: "Preparing", hint: "Verifying / QA repair" },
  { id: "prepared", label: "Prepared", hint: "Draft-ready (local clean)" },
  { id: "draft", label: "Draft", hint: "Our manual review" },
  { id: "review", label: "In Review", hint: "Upstream review" },
  { id: "done", label: "Done", hint: "Merged / closed" },
] as const;

type PrStageId = (typeof PR_STAGES)[number]["id"];

function prStage(record: PrFlowRecord): PrStageId {
  const { status } = record;
  if (status === "merged" || status === "closed") return "done";
  if (status === "open" || status === "changes_requested") return "review";
  if (status === "draft" || status === "branch_pushed" || Number.isFinite(record.prNumber)) return "draft";
  // Preparing takes precedence over prepared: a slice mid-verification, or one
  // whose files are still pending QA repair, is not draft-ready yet.
  if (record.localStatus === "preparing" || record.validationStatus === "repairing") return "preparing";
  if (record.localStatus === "ready" || record.localStatus === "local_only" || record.localStatus === "dirty") return "prepared";
  return "planned";
}

function prSubStatus(record: PrFlowRecord): { label: string; tone: string } {
  const stage = prStage(record);
  if (stage === "preparing") {
    if (record.status === "blocked" || record.localStatus === "blocked") return { label: "blocked", tone: "text-down" };
    if (record.validationStatus === "repairing") return { label: "QA repair", tone: "text-warn" };
    if (record.localStatus === "preparing") return { label: "verifying", tone: "text-warn" };
    return { label: "in flight", tone: "text-warn" };
  }
  if (stage === "prepared") {
    if (record.localStatus === "dirty") return { label: "uncommitted changes", tone: "text-down" };
    if (record.localStatus === "local_only") return { label: "local branch", tone: "text-warn" };
    return { label: "ready", tone: "text-up" };
  }
  if (stage === "draft") return { label: "opened", tone: "text-accent" };
  if (stage === "review") {
    const sub = record.reviewSubState;
    if (sub === "changes_requested") return { label: "changes requested", tone: "text-down" };
    if (sub === "new_comments") return { label: "new comments", tone: "text-warn" };
    if (sub === "fixing") return { label: "fixing", tone: "text-warn" };
    return { label: "awaiting", tone: "text-dim" };
  }
  if (stage === "done") return { label: record.status, tone: record.status === "merged" ? "text-up" : "text-faint" };
  return { label: "", tone: "text-dim" };
}

function prLampTone(record: PrFlowRecord): string {
  const stage = prStage(record);
  if (stage === "planned") return "lamp-idle";
  if (stage === "preparing") return "lamp-flight";
  if (stage === "prepared") return "lamp-ready";
  if (stage === "done") return record.status === "merged" ? "lamp-ready" : "lamp-idle";
  if (record.reviewSubState === "changes_requested" || record.reviewSubState === "new_comments") return "lamp-attention";
  return "lamp-neutral";
}

function prLockReason(view: SessionView): string {
  return view.canOpenPrs
    ? ""
    : view.process.running
      ? "Pause the run first."
      : view.syncing
        ? "Sync is in progress."
        : view.operationActive
          ? `${view.operationLabel} is in progress.`
          : view.activeLeases > 0
            ? `Waiting on ${num(view.activeLeases)} draining lease(s).`
            : "";
}

function PrPipelineStepper({ view }: { view: SessionView }) {
  const { checkpoint, qa, qaRepair, ship } = view.prSummary;
  const qaStatus = text(asObject(qa.prPromotion).status, text(qa.status));
  const qaRepairStatus = text(qaRepair.recommendation, text(qaRepair.status));
  const stages: Array<{ label: string; tone: string; value: ReactNode }> = [
    { label: "Checkpoint", tone: hasKeys(checkpoint) ? "text-up" : "text-dim", value: hasKeys(checkpoint) ? "available" : "none" },
    { label: "QA", tone: statusClass(qaStatus), value: prettyStatus(qaStatus, "not run") },
    { label: "QA Repair", tone: statusClass(qaRepairStatus), value: prettyStatus(qaRepairStatus, "not run") },
    { label: "Ship Set", tone: statusClass(ship.status), value: prettyStatus(ship.status, "not verified") },
    { label: "Draft PRs", tone: "text-soft", value: num(view.prRecords.length) },
  ];
  return (
    <div className="pipeline">
      {stages.map((stage, index) => (
        <Fragment key={stage.label}>
          <div className="pipeline-node">
            <span className="pipeline-node-label">{stage.label}</span>
            <span className={`pipeline-node-value ${stage.tone}`}>{stage.value}</span>
          </div>
          {index < stages.length - 1 ? <div aria-hidden="true" className="pipeline-connector" /> : null}
        </Fragment>
      ))}
    </div>
  );
}

function PrStageCard({
  busy,
  lockReason,
  onOpenPr,
  onPrepareLocalPr,
  onSetReviewState,
  record,
}: {
  busy: boolean;
  lockReason: string;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  record: PrFlowRecord;
}) {
  const stage = prStage(record);
  const sub = prSubStatus(record);
  const blocked = record.status === "blocked" || record.localStatus === "blocked";
  const hasPrNumber = Number.isFinite(record.prNumber);
  const sourceLabel =
    record.source === "current_objective_fixture"
      ? "mock"
      : record.source === "split_plan"
        ? "planned"
        : record.sourceDetail === "github_import"
          ? "imported"
          : record.sourceDetail === "local_branch_discovery"
            ? "local"
            : "tracked";
  const canPrepare = stage === "planned" && Boolean(record.branch) && record.localStatus === "not_prepared";
  // Open Draft is draft-ready only when the local workspace is clean (ready or
  // a discovered local branch); a dirty worktree must be committed first.
  const canOpen = stage === "prepared" && Boolean(record.branch) && record.localStatus !== "dirty";
  const showValidation = record.validationStatus !== "not_run" || Boolean(record.ci);
  const inReview = stage === "review";
  const needsReviewAck = inReview && (record.reviewSubState === "new_comments" || record.reviewSubState === "changes_requested");
  return (
    <article className={`pr-card ${blocked ? "pr-card-blocked" : ""}`}>
      <div className="pr-card-head">
        <span aria-hidden="true" className={`pr-card-lamp ${prLampTone(record)}`} />
        <span className="pr-card-title" title={record.title || record.displayName}>
          {record.displayName}
        </span>
      </div>
      <div className="pr-card-meta">
        {hasPrNumber ? <span className="text-path">#{record.prNumber}</span> : <span className="text-faint">{sourceLabel}</span>}
        <span aria-hidden="true" className="text-faint">·</span>
        {sub.label ? <span className={sub.tone}>{sub.label}</span> : <span className="text-dim">{prettyStatus(record.status)}</span>}
        <span aria-hidden="true" className="text-faint">·</span>
        <span className="text-dim">{fileCountLabel(record.files.length)}</span>
      </div>
      {record.repairNote ? <div className="pr-card-note text-warn">{record.repairNote}</div> : null}
      {showValidation ? (
        <div className="pr-card-meta">
          <span className={statusClass(record.validationStatus)}>QA {prettyStatus(record.validationStatus, "not run")}</span>
          {record.ci ? (
            <>
              <span aria-hidden="true" className="text-faint">·</span>
              <span className={statusClass(record.ci)}>CI {prettyStatus(record.ci)}</span>
            </>
          ) : null}
        </div>
      ) : null}
      {record.comments > 0 ? <div className="pr-card-meta text-dim">{num(record.comments)} comment{record.comments === 1 ? "" : "s"}</div> : null}
      {blocked ? <div className="pr-card-blocked-note">Blocked — needs isolation</div> : null}
      {canPrepare || canOpen || record.url ? (
        <div className="pr-card-actions">
          {canPrepare ? (
            <Button disabled={busy || Boolean(lockReason)} icon={<Hammer size={13} />} onClick={() => onPrepareLocalPr(record.branch)} title={lockReason || "Verify this slice and prepare a persistent local PR worktree without publishing."} type="button">
              Prepare
            </Button>
          ) : null}
          {canOpen ? (
            <Button disabled={busy || Boolean(lockReason)} icon={<GitPullRequest size={13} />} onClick={() => onOpenPr(record.branch)} title={lockReason || "Verify this slice and open a draft PR."} tone="primary" type="button">
              Open Draft
            </Button>
          ) : null}
          {record.url ? (
            <a className="pr-card-link" href={record.url} rel="noreferrer" target="_blank" title={`Open PR ${hasPrNumber ? `#${record.prNumber}` : record.displayName} on GitHub`}>
              View PR <ExternalLink size={11} />
            </a>
          ) : null}
        </div>
      ) : null}
      {inReview ? (
        <div className="pr-card-actions">
          {needsReviewAck ? (
            <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Mark these comments as seen." type="button">
              Ack
            </Button>
          ) : null}
          {record.reviewSubState !== "fixing" ? (
            <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "fixing")} title="Mark that you are addressing the review feedback." type="button">
              Fixing
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Clear the fixing flag." type="button">
              Clear Fixing
            </Button>
          )}
        </div>
      ) : null}
      {record.files.length > 0 ? (
        <details className="pr-card-files">
          <summary>{fileCountLabel(record.files.length)}</summary>
          <ul className="pr-card-file-list">
            {record.files.map((file) => (
              <li key={file} title={file}>{compactFilePath(file)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function PrStageBoard({
  busy,
  onOpenPr,
  onPrepareLocalPr,
  onSetReviewState,
  view,
}: {
  busy: boolean;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  view: SessionView;
}) {
  const lockReason = prLockReason(view);
  if (view.prRecords.length === 0) {
    return <EmptyState>No PR slices yet. Run Prepare (or Plan PRs) to build the split plan and seed the board.</EmptyState>;
  }
  return (
    <div className="kanban">
      {PR_STAGES.map((stage) => {
        const records = view.prRecords.filter((record) => prStage(record) === stage.id);
        return (
          <div className="kanban-col" key={stage.id}>
            <header className="kanban-col-head">
              <span className="kanban-col-label">{stage.label}</span>
              <span className="kanban-col-count">{num(records.length)}</span>
            </header>
            <div className="kanban-col-body">
              {records.length === 0 ? (
                <div className="kanban-empty">{stage.hint}</div>
              ) : (
                records.map((record) => (
                  <PrStageCard
                    busy={busy}
                    key={`${record.source}-${record.branch}-${record.displayName}`}
                    lockReason={lockReason}
                    onOpenPr={onOpenPr}
                    onPrepareLocalPr={onPrepareLocalPr}
                    onSetReviewState={onSetReviewState}
                    record={record}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrModeActions({ busy, onAction, view }: { busy: boolean; onAction: (action: DashboardAction) => void; view: SessionView }) {
  const prepareEnabled = view.handoffIdle && (view.runStatus === "active" || view.runStatus === "paused");
  const lockReason = prLockReason(view);
  const localPrepCount = view.prRecords.filter((record) => record.status === "planned" && record.localStatus === "not_prepared").length;
  const draftCandidateCount = view.prRecords.filter(isDraftBatchCandidate).length;
  const plannedCount = view.prRecords.filter((record) => record.status === "planned").length;
  return (
    <PanelSection>
      <PanelTitle>Pipeline Actions</PanelTitle>
      <div className="pr-action-groups">
        <div className="pr-action-group">
          <span className="pr-action-group-label">Pipeline</span>
          <Button disabled={busy || !prepareEnabled} icon={<GitPullRequest size={13} />} onClick={() => onAction("preparePr")} title={prepareEnabled ? "Run the full prepare handoff pipeline." : view.handoffReason || "Run is not active or paused."} tone={prepareEnabled ? "primary" : undefined} type="button">
            Prepare
          </Button>
          <Button disabled={busy || !view.handoffIdle} icon={<GitBranch size={13} />} onClick={() => onAction("splitPlan")} title={view.handoffIdle ? "Build the PR split plan." : view.handoffReason} type="button">
            Plan PRs
          </Button>
          <Button disabled={busy} icon={<RefreshCw size={13} />} onClick={() => onAction("syncPrs")} title="Seed/sync PR status from the split plan and GitHub." type="button">
            Sync PRs
          </Button>
        </div>
        <div className="pr-action-group">
          <span className="pr-action-group-label">Local Drafts</span>
          <Button disabled={busy || localPrepCount === 0 || Boolean(lockReason)} icon={<Hammer size={13} />} onClick={() => onAction("prepareLocalBatch")} title={lockReason || (localPrepCount > 0 ? "Prepare the next three planned PR slices in local worktrees without publishing drafts." : "No planned slices need local preparation.")} type="button">
            Prepare Next 3
          </Button>
          <Button disabled={busy || draftCandidateCount === 0 || Boolean(lockReason)} icon={<GitPullRequest size={13} />} onClick={() => onAction("openDraftBatch")} title={lockReason || (draftCandidateCount > 0 ? "Open the next three local-ready or local-branch slices as GitHub drafts." : "No local draft candidates to open.")} tone={draftCandidateCount > 0 && !lockReason ? "primary" : undefined} type="button">
            Open Next 3
          </Button>
        </div>
        <div className="pr-action-group">
          <span className="pr-action-group-label">Session</span>
          <Button disabled={busy || view.process.running} icon={<Pause size={13} />} onClick={() => onAction("pausePr")} title={view.process.running ? "Drain workers and lock PR handoff." : "Workers are already stopped."} tone="warning" type="button">
            Pause Intake
          </Button>
          <Button disabled={busy || view.newSessionBlocked} icon={<RotateCcw size={13} />} onClick={() => onAction("fresh")} title={view.newSessionBlocked ? view.newSessionReasons.join("; ") : "Start a fresh session."} tone="warning" type="button">
            New Session
          </Button>
        </div>
      </div>
      <details className="control-disclosure mt-3">
        <summary>Manual handoff steps — QA, checkpoint, reconcile, open all drafts</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy || !view.handoffIdle} icon={<ShieldCheck size={13} />} onClick={() => onAction("qa")} title={view.handoffIdle ? "Run the PR QA gate." : view.handoffReason} type="button">
            Run QA
          </Button>
          <Button disabled={busy || !view.handoffIdle} icon={<Archive size={13} />} onClick={() => onAction("checkpoint")} title={view.handoffIdle ? "Write a PR handoff checkpoint for the current run." : view.handoffReason} type="button">
            Checkpoint
          </Button>
          <Button disabled={busy || !view.handoffIdle || view.runStatus !== "paused"} icon={<Wrench size={13} />} onClick={() => onAction("reconcile")} title={view.handoffIdle && view.runStatus === "paused" ? "Run reconcile against the latest QA report." : view.handoffReason || "Pause the run first."} type="button">
            Reconcile
          </Button>
          <Button disabled={busy || plannedCount === 0 || Boolean(lockReason)} icon={<GitPullRequest size={13} />} onClick={() => onAction("openAllPrs")} title={lockReason || (plannedCount > 0 ? "Legacy path: open all planned slices as draft PRs." : "No planned real PR slices to open.")} type="button">
            Open All Drafts
          </Button>
        </div>
      </details>
    </PanelSection>
  );
}

function PrModePage({ busy, dashboard, onAction, onOpenPr, onPrepareLocalPr, onSetReviewState, view }: { busy: boolean; dashboard: Dashboard | null; onAction: (action: DashboardAction) => void; onOpenPr: (branch: string) => void; onPrepareLocalPr: (branch: string) => void; onSetReviewState: (branch: string, subState: string) => void; view: SessionView }) {
  const splitPlan = view.prSummary.splitPlan;
  const qa = view.prSummary.qa;
  const qaRepair = view.prSummary.qaRepair;
  const checkpoint = view.prSummary.checkpoint;
  const sliceCount = view.prRecords.length;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${view.prBlockedReasons.length > 0 ? "text-warn" : "text-up"}`}>{view.prBlockedReasons.length > 0 ? "blocked / needs isolation" : "ready to package"}</span>
      </div>
      <PrPipelineStepper view={view} />
      {view.prBlockedReasons.length > 0 ? (
        <PanelSection className="border-warn/50 bg-warn/5">
          <PanelTitle>Blockers</PanelTitle>
          <List values={view.prBlockedReasons} empty="No PR blockers detected." />
        </PanelSection>
      ) : null}
      <PrModeActions busy={busy} onAction={onAction} view={view} />
      <PanelSection>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg">Draft PR Board</span>
          <span className="text-[11px] text-dim">{num(sliceCount)} slice{sliceCount === 1 ? "" : "s"} · stages planned → merged</span>
        </div>
        <PrStageBoard busy={busy} onOpenPr={onOpenPr} onPrepareLocalPr={onPrepareLocalPr} onSetReviewState={onSetReviewState} view={view} />
        {view.prSummary.warning ? <p className="mb-0 mt-3 text-xs text-warn">{view.prSummary.warning}</p> : null}
      </PanelSection>
      <details className="control-disclosure">
        <summary>Handoff artifacts</summary>
        <InfoRows
          rows={[
            ["Candidates", text(checkpoint.prCandidatesPath, "-")],
            ["QA report", text(qa.prReportPath, text(qa.summaryPath, "-"))],
            ["QA repair", text(qaRepair.reportPath, text(qaRepair.summaryPath, "-"))],
            ["Split plan", text(splitPlan.outputPath, text(splitPlan.summaryPath, "-"))],
            ["Upstream PRs", Number.isFinite(view.prSummary.upstreamOpen) ? num(view.prSummary.upstreamOpen) : "unknown"],
          ]}
        />
      </details>
      {dashboard ? null : <EmptyState>Waiting for dashboard data.</EmptyState>}
    </div>
  );
}

function SessionHistoryPage({ dashboard, view }: { dashboard: Dashboard | null; view: SessionView }) {
  const epochs = asArray(dashboard?.epochs).map(asObject).slice(-12).reverse();
  const savePoint = asObject(asObject(dashboard?.campaign).savePoint);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
        <PanelSection>
          <PanelTitle>Latest Save Point</PanelTitle>
          <InfoRows
            rows={[
              ["Commit", text(savePoint.commit_sha, "-")],
              ["Trigger", text(savePoint.trigger_kind, "-")],
              ["Branch", text(savePoint.branch, view.branchLabel)],
              ["Matched", savePoint.matched_code_percent ? pct(savePoint.matched_code_percent) : "-"],
            ]}
          />
        </PanelSection>
        <PanelSection>
          <PanelTitle>PR Intake</PanelTitle>
          <InfoRows
            rows={[
              ["Tracked PRs", num(view.prRecords.length)],
              ["Unresolved", num(view.prRecords.filter((record) => !["merged", "closed"].includes(record.status)).length)],
              ["Upstream", Number.isFinite(view.prSummary.upstreamOpen) ? num(view.prSummary.upstreamOpen) : "unknown"],
              ["Gate", view.newSessionBlocked ? "blocked" : "clear", view.newSessionBlocked ? "text-warn" : "text-up"],
            ]}
          />
        </PanelSection>
      </div>
      <PanelSection>
        <PanelTitle>Epoch Checkpoints</PanelTitle>
        {epochs.length === 0 ? (
          <EmptyState>No epoch checkpoints recorded for the visible session.</EmptyState>
        ) : (
          <div className="overflow-hidden border border-line bg-card">
            {epochs.map((epoch) => (
              <div className="grid min-h-8 grid-cols-[160px_110px_minmax(0,1fr)] items-center gap-2 border-t border-line px-2.5 py-1.5 first:border-t-0 max-[780px]:grid-cols-1" key={text(epoch.id, text(epoch.createdAt))}>
                <span className="text-soft">{clock(epoch.createdAt)}</span>
                <span className="text-up">{pct(epoch.matchedCodePercent)}</span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-dim">{text(epoch.label, "epoch checkpoint")}</span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}

function WorkspaceSectionContent(props: ProjectWorkspaceProps & { nav: WorkspaceNav; view: SessionView }) {
  if (props.route.section === "standards") {
    return <StandardsPage form={props.form} projectName={props.view.project?.displayName ?? "No project selected"} onNavigate={props.onNavigate} route={props.route} />;
  }
  if (props.route.section === "knowledge") {
    return <KnowledgeGraphPage form={props.form} projectName={props.view.project?.displayName ?? "No project selected"} />;
  }
  if (props.route.section === "settings") {
    return <ProjectSettingsPage config={props.config} form={props.form} nav={props.nav} setForm={props.setForm} view={props.view} />;
  }
  if (props.route.section === "sessions") {
    if (props.route.session === "active" || (props.route.session && props.route.session !== "new")) {
      return (
        <ActiveSessionPage
          busy={props.busy}
          dashboard={props.dashboard}
          form={props.form}
          improvedMode={props.improvedMode}
          improvedPage={props.improvedPage}
          nav={props.nav}
          onAction={props.onAction}
          onOpenPr={props.onOpenPr}
          onPrepareLocalPr={props.onPrepareLocalPr}
          onSetReviewState={props.onSetReviewState}
          route={props.route}
          setForm={props.setForm}
          setImprovedMode={props.setImprovedMode}
          setImprovedPage={props.setImprovedPage}
          setWorkMode={props.setWorkMode}
          streamState={props.streamState}
          view={props.view}
          workMode={props.workMode}
        />
      );
    }
    return <SessionsIndexPage busy={props.busy} nav={props.nav} onAction={props.onAction} view={props.view} />;
  }
  return <ProjectOverviewPage busy={props.busy} form={props.form} nav={props.nav} onAction={props.onAction} view={props.view} />;
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const view = deriveSessionView(props.dashboard, props.config, props.form);
  const nav = useWorkspaceNav(props.onNavigate, props.route.projectId);
  return (
    <>
      <ProjectWorkspaceNav collapsed={props.collapsed} nav={nav} onCollapsedChange={props.onCollapsedChange} route={props.route} view={view} />
      <section className="flex min-w-0 flex-col overflow-hidden bg-panel">
        <ErrorStrip error={props.errorMessage} onDismiss={props.onDismissError} />
        <WorkspaceSectionContent {...props} nav={nav} view={view} />
      </section>
    </>
  );
}
