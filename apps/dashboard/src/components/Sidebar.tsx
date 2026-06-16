import { Ban, ChevronLeft, ChevronRight, Download, GitBranch, GitPullRequest, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { asArray, asObject, clock, num, numberValue, text, type Dashboard, type FormState, type UiConfig } from "@decomp-orchestrator/ui-contract";
import { derivePhaseModel } from "./PhaseStepper";
import { agoText } from "./PositionPanel";
import { Button, CheckboxField, Field, PanelSection, PanelTitle, SelectField } from "./primitives";
import { processView } from "../lib/processView";

type SidebarAction =
  | "refresh"
  | "sync"
  | "fresh"
  | "startWork"
  | "forceStop"
  | "pausePr"
  | "checkpoint"
  | "qa"
  | "reconcile"
  | "splitPlan"
  | "preparePr"
  | "syncPrs"
  | "openAllPrs";

interface SidebarProps {
  busy: boolean;
  collapsed: boolean;
  config: UiConfig | null;
  dashboard: Dashboard | null;
  form: FormState;
  onAction: (action: SidebarAction) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onOpenPr: (branch: string) => void;
  setForm: (updates: Partial<FormState>) => void;
}

function processName(value: unknown): string {
  const raw = text(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

const schedulingPresets = [
  { id: "small", label: "Small", workers: 4 },
  { id: "medium", label: "Medium", workers: 8 },
  { id: "large", label: "Large", workers: 16 },
  { id: "xl", label: "XL", workers: 32 },
] as const;

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

function schedulingPresetForWorkers(workers: unknown) {
  return schedulingPresets.find((preset) => preset.workers === Number(workers)) ?? schedulingPresets[2];
}

function statusClass(value: unknown): string {
  const status = text(value);
  if (status === "passed" || status === "pr_ready") return "text-up";
  if (status === "failed" || status === "blocked") return "text-down";
  if (status === "local_only" || status === "open") return "text-warn";
  return "text-dim";
}

function existsClass(value: unknown): string {
  return value === false ? "bg-down" : "bg-up";
}

function ProjectPathRow({ exists, label, path }: { exists?: unknown; label: string; path?: unknown }) {
  return (
    <div className="grid min-h-7 grid-cols-[72px_8px_minmax(0,1fr)] items-center gap-2 rounded-none border border-line bg-card px-2 py-1">
      <span className="text-[10px] uppercase tracking-[0.1em] text-dim">{label}</span>
      <span className={`h-2 w-2 rounded-full ${existsClass(exists)}`} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft" title={text(path)}>
        {text(path, "-")}
      </span>
    </div>
  );
}

function ArtifactRow({ label, path, status }: { label: string; path?: unknown; status?: unknown }) {
  return (
    <div className="grid min-h-7 grid-cols-[72px_74px_minmax(0,1fr)] items-center gap-2 border-t border-line bg-card px-2 py-1 first:border-t-0">
      <span className="text-[10px] uppercase tracking-[0.1em] text-dim">{label}</span>
      <span className={`${statusClass(status)} overflow-hidden text-ellipsis whitespace-nowrap`}>{text(status, "-")}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-dim" title={text(path)}>
        {text(path, "-")}
      </span>
    </div>
  );
}

interface ActionSpec {
  action: SidebarAction;
  className?: string;
  enabled: boolean;
  icon: ReactNode;
  label: string;
  /** Tooltip when enabled: what the button does. */
  title: string;
  /** Tooltip when disabled: why it is grayed out right now. */
  reason: string;
  tone?: "warning" | "danger";
}

/**
 * Every sidebar panel follows one shape: a title row with right-aligned meta
 * (current status at a glance), always-visible primary content, and at most
 * one disclosure for secondary detail. Anything that doesn't earn a spot in
 * that shape belongs in the details rail or the project config, not here.
 */
function SidebarPanel({ children, meta, title }: { children: ReactNode; meta?: ReactNode; title: string }) {
  return (
    <PanelSection>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
        <PanelTitle className="mb-0">{title}</PanelTitle>
        <span className="flex min-w-0 items-center overflow-hidden whitespace-nowrap text-[11px] text-dim">{meta}</span>
      </div>
      {children}
    </PanelSection>
  );
}

/**
 * The one action the current flow position recommends; it gets the primary
 * tone in the Actions panel so "what do I do next" stays a one-glance answer.
 */
function recommendedAction(options: { activeLeases: number; behind: number; draining: boolean; operationActive: boolean; runActive: boolean; runPaused: boolean; running: boolean; syncing: boolean }): SidebarAction | null {
  const { activeLeases, behind, draining, operationActive, runActive, runPaused, running, syncing } = options;
  if (syncing || operationActive) return null;
  if (draining) return null;
  if (runActive && running) return "pausePr";
  if (runActive) return "startWork";
  if (runPaused) return activeLeases > 0 || running ? null : "preparePr";
  if (Number.isFinite(behind) && behind > 0) return "sync";
  return "startWork";
}

function StatusRow({ label, tone = "text-soft", value }: { label: string; tone?: string; value: string }) {
  return (
    <div className="grid min-h-7 grid-cols-[84px_minmax(0,1fr)] items-center gap-2 border-t border-line bg-card px-2 py-1 first:border-t-0">
      <span className="text-[10px] uppercase tracking-[0.1em] text-dim">{label}</span>
      <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${tone}`} title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * One lifecycle stage as a vertical slice: numbered header with the stage's
 * one-line verdict, then everything that belongs to the stage — detail rows,
 * its own buttons, and its disclosures. The current stage gets the filled
 * number chip and bright border so "where am I" is a one-glance answer.
 */
function StageCard({ active, children, index, title, tone = "text-soft", verdict }: { active: boolean; children: ReactNode; index: number; title: string; tone?: string; verdict?: string }) {
  return (
    <section className={`border bg-panel ${active ? "border-faint" : "border-line"}`}>
      <header className="flex min-h-8 items-center gap-2 border-b border-line bg-raised px-2.5 py-1.5">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-bold ${active ? "bg-fg text-ink" : "border border-line2 text-dim"}`}>{index}</span>
        <span className={`shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] ${active ? "text-fg" : "text-dim"}`}>{title}</span>
        {verdict ? (
          <span className={`ml-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] ${tone}`} title={verdict}>
            {verdict}
          </span>
        ) : null}
      </header>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

/** Shared flow position computed once and handed to every stage. */
interface FlowState {
  activeLeases: number;
  behind: number;
  handoffIdle: boolean;
  handoffReason: string;
  hasRun: boolean;
  draining: boolean;
  /** A multi-step server operation (QA, Prepare, New Session, ...) is running. */
  operationActive: boolean;
  operationLabel: string;
  recommended: SidebarAction | null;
  runActive: boolean;
  runPaused: boolean;
  running: boolean;
  syncLocked: boolean;
  syncing: boolean;
}

function flowState(dashboard: Dashboard | null, running: boolean, syncLocked: boolean, draining: boolean): FlowState {
  const status = asObject(dashboard?.status);
  const run = asObject(status.run);
  const runStatus = text(run.status);
  const runActive = runStatus === "active";
  const runPaused = runStatus === "paused";
  const hasRun = Boolean(run.id);
  const activeLeases = Number(status.activeLeases || 0);
  const proc = asObject(dashboard?.process);
  const syncing = proc.projectSyncActive === true;
  const operation = asObject(proc.operation);
  const operationActive = text(operation.status) === "running" || proc.freshRunActive === true;
  const operationLabel = text(operation.label, "An operation");
  const behind = numberValue(asObject(dashboard?.campaign).behindBase, NaN);
  const handoffIdle = hasRun && !running && activeLeases === 0 && !syncing && !operationActive;
  const leaseReason = activeLeases > 0 ? `Waiting on ${activeLeases} draining lease(s).` : "";
  const handoffReason = !hasRun
    ? "No run yet — Start first."
    : draining
      ? "Workers are draining."
    : running
      ? "Pause the run first."
      : syncing
        ? "Sync is in progress."
        : operationActive
          ? `${operationLabel} is in progress.`
          : leaseReason;
  const recommended = recommendedAction({ activeLeases, behind, draining, operationActive, runActive, runPaused, running, syncing });
  return { activeLeases, behind, draining, handoffIdle, handoffReason, hasRun, operationActive, operationLabel, recommended, runActive, runPaused, running, syncLocked, syncing };
}

/**
 * Which stage the operator is in right now. The cycle wraps: PRs merge ->
 * sync intake (1) -> new session (5) -> run (2).
 */
function currentStageIndex(flow: FlowState, shipStatus: string, records: JsonObjectLike[]): number {
  if (flow.syncing) return 1;
  if (flow.runActive) return 2;
  if (flow.runPaused) return shipStatus === "pr_ready" ? 4 : 3;
  if (Number.isFinite(flow.behind) && flow.behind > 0) return 1;
  if (records.length > 0 && records.every((record) => ["merged", "closed"].includes(text(record.status)))) return 5;
  return 2;
}

type JsonObjectLike = Record<string, unknown>;

/** Stage 1 — pull upstream, intake merged PRs, rebuild knowledge. */
function SyncStage({ active, busy, dashboard, flow, onAction }: { active: boolean; busy: boolean; dashboard: Dashboard | null; flow: FlowState; onAction: (action: SidebarAction) => void }) {
  const campaign = asObject(dashboard?.campaign);
  const head = asObject(campaign.head);
  const baseRef = text(campaign.baseRef, "origin/master");
  const baseline = asObject(asObject(dashboard?.handoff).baseline);
  const baselineSha = text(baseline.baseSha);
  const baselineFresh = Boolean(baselineSha) && baselineSha === text(campaign.baseSha);
  const behindKnown = Number.isFinite(flow.behind);
  const dirty = head.dirty === true;
  const enabled = !flow.syncLocked && !flow.running && !flow.syncing && !flow.operationActive && flow.activeLeases === 0;
  return (
    <StageCard
      active={active}
      index={1}
      title="Sync"
      tone={behindKnown && flow.behind > 0 ? "text-warn" : behindKnown ? "text-up" : "text-dim"}
      verdict={!behindKnown ? "unknown" : flow.behind > 0 ? `${num(flow.behind)} commit(s) behind ${baseRef}` : `up to date with ${baseRef}`}
    >
      <div className="overflow-hidden border border-line">
        <StatusRow label="Branch" tone={dirty ? "text-warn" : "text-soft"} value={`${text(head.branch, "-")}${dirty ? " · dirty" : ""}`} />
        <StatusRow
          label="Baseline"
          tone={baselineFresh ? "text-up" : baselineSha ? "text-warn" : "text-dim"}
          value={baselineSha ? `${baselineSha.slice(0, 10)} · ${baselineFresh ? "current" : "stale — Prepare rebuilds it"}` : "not built — Prepare builds it"}
        />
      </div>
      <div className="mt-2">
        <Button
          disabled={!enabled || busy}
          icon={<Download size={14} />}
          onClick={() => onAction("sync")}
          title={
            enabled
              ? "Pull upstream, intake newly merged PRs, and rebuild knowledge."
              : flow.syncing
                ? "Sync already in progress."
                : flow.syncLocked
                  ? "Sync is locked while the run is active."
                  : flow.running
                    ? "Pause the run first."
                    : flow.operationActive
                      ? `${flow.operationLabel} is in progress.`
                      : `Waiting on ${num(flow.activeLeases)} draining lease(s).`
          }
          tone={!enabled ? undefined : flow.recommended === "sync" ? "primary" : undefined}
          type="button"
        >
          Sync Merged PRs
        </Button>
      </div>
    </StageCard>
  );
}

/** Stage 2 — the worker loop plus everything that configures or hosts it. */
function RunStage({
  active,
  busy,
  dashboard,
  flow,
  form,
  onAction,
  setForm,
}: { active: boolean; busy: boolean; flow: FlowState; onAction: (action: SidebarAction) => void } & Pick<SidebarProps, "dashboard" | "form" | "setForm">) {
  const buttons: ActionSpec[] = [
    {
      action: "startWork",
      enabled: !flow.running && !flow.syncing && !flow.operationActive,
      icon: <Play size={14} />,
      label: flow.runPaused ? "Resume" : "Start",
      title: flow.runPaused ? "Resume scheduling for this paused run and start the worker loop." : "Init a run (if needed) and start the worker loop.",
      reason: flow.draining ? "Workers are draining." : flow.running ? "Workers are already running." : flow.syncing ? "Sync is in progress." : `${flow.operationLabel} is in progress.`,
    },
    {
      action: "pausePr",
      className: flow.draining ? "draining-action" : "",
      enabled: flow.running && !flow.draining,
      icon: flow.draining ? <RefreshCw size={14} /> : <Pause size={14} />,
      label: flow.draining ? "Draining" : "Pause",
      title: "Let in-flight workers finish, stop scheduling new ones, and pause the run at a save point.",
      reason: flow.draining ? "Drain already requested; waiting for workers to exit." : flow.runPaused ? "Run is already paused." : "Workers are not running.",
      tone: "warning",
    },
    {
      action: "forceStop",
      enabled: flow.running,
      icon: <Ban size={14} />,
      label: "Kill",
      title: "Kill all workers immediately and recover their leases (asks to confirm).",
      reason: "No process is running.",
      tone: "danger",
    },
  ];
  return (
    <StageCard
      active={active}
      index={2}
      title="Run"
    >
      <div className="grid grid-cols-3 gap-2">
        {buttons.map((item) => (
          <Button
            className={item.className}
            disabled={!item.enabled || busy}
            icon={item.icon}
            key={item.action}
            onClick={() => onAction(item.action)}
            title={item.enabled ? item.title : item.reason}
            tone={item.action === "pausePr" && flow.draining ? "warning" : !item.enabled ? undefined : item.action === "startWork" && flow.runPaused ? "primary" : item.action === "pausePr" ? "warning" : flow.recommended === item.action ? "primary" : item.tone}
            type="button"
          >
            {item.label}
          </Button>
        ))}
      </div>
      <RunSetupDisclosure dashboard={dashboard} form={form} setForm={setForm} />
      <ProcessDisclosure dashboard={dashboard} form={form} />
    </StageCard>
  );
}

/** Stage 3 — package what the run produced and verify the ship set. */
function ShipStage({ active, busy, dashboard, flow, onAction }: { active: boolean; busy: boolean; dashboard: Dashboard | null; flow: FlowState; onAction: (action: SidebarAction) => void }) {
  const handoff = asObject(dashboard?.handoff);
  const checkpoint = asObject(handoff.checkpoint || dashboard?.checkpoint);
  const counts = asObject(checkpoint.counts);
  const qa = asObject(handoff.qa);
  const qaStatus = text(asObject(qa.prPromotion).status, text(qa.status));
  const qaRepair = asObject(handoff.qaRepair);
  const qaRepairCounts = asObject(qaRepair.counts);
  const qaRepairStatus = text(qaRepair.recommendation, text(qaRepair.status));
  const regressionCounts = asObject(qa.regressionCounts);
  const fuzzy = numberValue(regressionCounts.fuzzyRegressions, 0);
  const metric = numberValue(regressionCounts.metricRegressions, 0);
  const splitPlan = asObject(handoff.splitPlan);
  const planMatch = numberValue(splitPlan.matchSlices, NaN);
  const ship = asObject(handoff.ship);
  const shipStatus = text(ship.status);
  const prepareEnabled = flow.handoffIdle && (flow.runActive || flow.runPaused);
  // Checkpointing is automatic (epoch drains and the handoff itself), and
  // reconcile runs inside Prepare when the ship set is blocked — these are
  // manual escape hatches for debugging, not part of the normal flow.
  const stepwise: ActionSpec[] = [
    {
      action: "qa",
      enabled: flow.handoffIdle,
      icon: <ShieldCheck size={14} />,
      label: "Run QA",
      title: "Build the branch and run the regression + promotion gates vs the installed baseline.",
      reason: flow.handoffReason,
    },
    {
      action: "reconcile",
      enabled: flow.handoffIdle && flow.runPaused,
      icon: <Wrench size={14} />,
      label: "Reconcile",
      title: "Agent fix-loop for the regressions in the latest QA report (Prepare runs this automatically when the ship set is blocked).",
      reason: flow.handoffReason || "Pause the run first — reconcile only runs while scheduling is locked.",
    },
    {
      action: "splitPlan",
      enabled: flow.handoffIdle,
      icon: <GitBranch size={14} />,
      label: "Plan PRs",
      title: "Lane-aware PR split plan from the checkpoint and regression report.",
      reason: flow.handoffReason,
    },
  ];
  // The card face is verdict + two facts + the one button; the four
  // diagnostic rows live in the disclosure. Flow, not diagnostics.
  const factOne = shipStatus
    ? shipStatus === "pr_ready"
      ? `${num(ship.newMatches)} confirmed match(es) · 0 regressions`
      : `${num(ship.fuzzyRegressions)} fuzzy · ${num(ship.metricRegressions)} metric regression(s) in the ship set`
    : flow.runActive && flow.running
      ? "run active — pause to package this session"
      : flow.hasRun
        ? "workers stopped — Prepare packages this session"
        : "no run yet — Start first";
  const reworkCount = numberValue(counts.needs_rework, 0);
  const factTwo = checkpoint.id ? `${num(reworkCount)} rework requeued for the next run` : "";
  return (
    <StageCard
      active={active}
      index={3}
      title="Ship"
      tone={statusClass(shipStatus === "pr_ready" ? "pr_ready" : shipStatus)}
      verdict={shipStatus ? (shipStatus === "pr_ready" ? `pr_ready — ${num(splitPlan.matchSlices)} PR(s)` : shipStatus) : "not verified yet"}
    >
      <p className="m-0 text-xs text-soft">{factOne}</p>
      {factTwo ? <p className="mt-0.5 mb-0 text-xs text-dim">{factTwo}</p> : null}
      <div className="mt-2">
        <Button
          className="w-full"
          disabled={!prepareEnabled || busy}
          icon={<GitPullRequest size={14} />}
          onClick={() => onAction("preparePr")}
          title={
            prepareEnabled
              ? "End the session as a hard save point: pause, pull & rebase, rebuild baseline, QA, checkpoint, plan, verify the ship set (reconciling if blocked), seed the PR board, save point."
              : flow.handoffReason || "Run is not active or paused."
          }
          tone={!prepareEnabled ? undefined : flow.recommended === "preparePr" ? "primary" : undefined}
          type="button"
        >
          Prepare Handoff
        </Button>
      </div>
      <details className="control-disclosure">
        <summary>Details &amp; manual steps</summary>
        <div className="mt-2 overflow-hidden border border-line">
          <StatusRow
            label="Checkpoint"
            tone={checkpoint.id ? "text-soft" : "text-dim"}
            value={checkpoint.id ? `${num(counts.pr_candidate)} match · ${num(counts.improvement_candidate)} improve · ${num(counts.needs_rework)} rework` : "not run"}
          />
          <StatusRow
            label="Branch QA"
            tone={statusClass(qaStatus)}
            value={qaStatus ? (qaStatus === "blocked" ? `blocked — ${num(fuzzy)} fuzzy · ${num(metric)} metric regression(s) (rework; does not gate PRs)` : qaStatus) : "not run"}
          />
          <StatusRow
            label="QA repair"
            tone={statusClass(qaRepairStatus)}
            value={
              qaRepairStatus
                ? `${qaRepairStatus} — ${num(qaRepairCounts.files_with_errors)} file(s) · ${num(qaRepairCounts.queued_items)} item(s)`
                : "not run"
            }
          />
          <StatusRow
            label="Ship set"
            tone={statusClass(shipStatus === "pr_ready" ? "pr_ready" : shipStatus)}
            value={
              shipStatus
                ? shipStatus === "pr_ready"
                  ? `pr_ready — ${num(ship.newMatches)} confirmed match(es), 0 regressions`
                  : `${shipStatus} — ${num(ship.fuzzyRegressions)} fuzzy · ${num(ship.metricRegressions)} metric`
                : "not verified"
            }
          />
          <StatusRow
            label="Plan"
            tone={statusClass(splitPlan.status)}
            value={
              text(splitPlan.status)
                ? Number.isFinite(planMatch)
                  ? `${text(splitPlan.status)} — ${num(splitPlan.matchSlices)} match PR(s) · ${num(splitPlan.localSlices)} local`
                  : text(splitPlan.status)
                : "not run"
            }
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {stepwise.map((item) => (
            <Button
              disabled={!item.enabled || busy}
              icon={item.icon}
              key={item.action}
              onClick={() => onAction(item.action)}
              title={item.enabled ? item.title : item.reason}
              type="button"
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="mt-2 overflow-hidden border border-line">
          <ArtifactRow label="Candidates" path={checkpoint.prCandidatesPath} status={checkpoint.id ? "written" : "-"} />
          <ArtifactRow label="QA report" path={qa.prReportPath || qa.summaryPath} status={text(qa.status, "-")} />
          <ArtifactRow label="QA repair" path={qaRepair.reportPath || qaRepair.summaryPath} status={qaRepairStatus || "-"} />
          <ArtifactRow label="Plan" path={splitPlan.outputPath} status={text(splitPlan.status, "-")} />
        </div>
      </details>
    </StageCard>
  );
}

/** Stage 5 — close the session; unshipped improvements stay on the branch. */
function SessionStage({ active, busy, flow, onAction }: { active: boolean; busy: boolean; flow: FlowState; onAction: (action: SidebarAction) => void }) {
  const enabled = !flow.running && !flow.syncing && !flow.operationActive && flow.activeLeases === 0;
  return (
    <StageCard active={active} index={5} title="New Session" tone="text-dim" verdict="restart baseline · keep local work">
      <p className="m-0 text-xs text-dim">Checkpoint anything pending, reset the report baseline, and init a brand-new run. Unshipped improvements stay on the branch as the local delta.</p>
      <div className="mt-2">
        <Button
          disabled={!enabled || busy}
          icon={<RotateCcw size={14} />}
          onClick={() => onAction("fresh")}
          title={
            enabled
              ? "Checkpoint, reset the report baseline, and init a new run."
              : flow.running
                ? "Pause the run first."
                : flow.syncing
                  ? "Sync is in progress."
                  : flow.operationActive
                    ? `${flow.operationLabel} is in progress.`
                    : `Waiting on ${num(flow.activeLeases)} draining lease(s).`
          }
          tone={!enabled ? undefined : "warning"}
          type="button"
        >
          New Session
        </Button>
      </div>
    </StageCard>
  );
}

const prStatusMeta: Record<string, { label: string; tone: string }> = {
  planned: { label: "not opened", tone: "text-dim" },
  branch_pushed: { label: "pushed", tone: "text-soft" },
  draft: { label: "draft", tone: "text-warn" },
  open: { label: "open", tone: "text-soft" },
  changes_requested: { label: "changes req.", tone: "text-down" },
  merged: { label: "merged", tone: "text-up" },
  closed: { label: "closed", tone: "text-dim" },
};

function PrRecordRow({ busy, lockReason, onOpenPr, record }: { busy: boolean; lockReason: string; onOpenPr: (branch: string) => void; record: Record<string, unknown> }) {
  const status = text(record.status, "planned");
  const meta = prStatusMeta[status] ?? { label: status, tone: "text-soft" };
  const files = asArray(record.files).map((path) => text(path)).filter(Boolean);
  const prNumber = numberValue(record.prNumber, NaN);
  const comments = numberValue(record.comments, 0);
  const ci = text(record.ci);
  const url = text(record.url);
  const branch = text(record.branch);
  const right = [
    Number.isFinite(prNumber) ? `#${prNumber}` : `${files.length}f`,
    comments > 0 ? `💬${comments}` : "",
    ci === "failing" ? "ci ✗" : ci === "pending" ? "ci …" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const name = text(record.displayName, text(record.sliceId, text(record.branch, "-")));
  return (
    <details className="group border-t border-line bg-card first:border-t-0">
      <summary className="grid min-h-7 cursor-pointer list-none grid-cols-[minmax(0,1fr)_92px_64px] items-center gap-2 px-2 py-1 hover:bg-raised [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">{name}</span>
        <span className={`overflow-hidden text-ellipsis whitespace-nowrap ${meta.tone}`}>{meta.label}</span>
        <span className={`text-right ${ci === "failing" ? "text-down" : "text-dim"}`}>{right}</span>
      </summary>
      <div className="border-t border-line2 bg-panel px-2 py-1.5">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-dim" title={text(record.title)}>
            {text(record.branch, "-")}
          </span>
          {url ? (
            <a className="shrink-0 text-soft underline decoration-line2 hover:text-fg" href={url} rel="noreferrer" target="_blank">
              {Number.isFinite(prNumber) ? `#${prNumber} ↗` : "open ↗"}
            </a>
          ) : null}
        </div>
        <ul className="m-0 list-none p-0 font-mono text-[11px] leading-5 text-soft">
          {files.map((file) => (
            <li className="overflow-hidden text-ellipsis whitespace-nowrap" key={file} title={file}>
              {file.replace(/^src\//, "")}
            </li>
          ))}
          {files.length === 0 ? <li className="text-dim">no file manifest (synced from GitHub only)</li> : null}
        </ul>
        {status === "planned" && branch ? (
          <div className="mt-1.5">
            <Button
              disabled={busy || Boolean(lockReason)}
              icon={<GitPullRequest size={14} />}
              onClick={() => onOpenPr(branch)}
              title={lockReason || "Verify this slice alone against the baseline, then branch, push to your fork, and open a draft PR on the upstream repo."}
              tone={lockReason ? undefined : "primary"}
              type="button"
            >
              Open draft PR
            </Button>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Stage 4 — the hub for shipped work: every match slice tracked from planned
 * through merged, with comment/CI state pulled from GitHub on demand.
 * Records persist across sessions so PR history outlives the plan it came
 * from.
 */
function PrsStage({ active, busy, dashboard, flow, onAction, onOpenPr }: { active: boolean; flow: FlowState } & Pick<SidebarProps, "busy" | "dashboard" | "onAction" | "onOpenPr">) {
  // Opening a PR checks out branches and pushes — never while workers, sync,
  // or another operation can touch the tree.
  const lockReason = flow.running
    ? "Pause the run first."
    : flow.syncing
      ? "Sync is in progress."
      : flow.operationActive
        ? `${flow.operationLabel} is in progress.`
        : flow.activeLeases > 0
          ? `Waiting on ${num(flow.activeLeases)} draining lease(s).`
          : "";
  const prs = asObject(dashboard?.prs);
  const records = asArray(prs.records).map(asObject);
  const opened = records.filter((record) => ["draft", "open", "changes_requested"].includes(text(record.status)));
  const merged = records.filter((record) => text(record.status) === "merged");
  const toOpen = records.length - opened.length - merged.length - records.filter((record) => text(record.status) === "closed").length;
  const upstreamOpen = numberValue(prs.upstreamOpen, NaN);
  const needsAttention = records.some((record) => text(record.status) === "changes_requested" || text(record.ci) === "failing");
  const summary = records.length === 0 ? "none tracked" : `${opened.length} open · ${toOpen} to open · ${merged.length} merged`;

  return (
    <StageCard active={active} index={4} title="PRs" tone={needsAttention ? "text-down" : records.length ? "text-soft" : "text-dim"} verdict={summary}>
      <div className="overflow-hidden border border-line">
        {records.map((record) => (
          <PrRecordRow busy={busy} key={text(record.branch, text(record.sliceId))} lockReason={lockReason} onOpenPr={onOpenPr} record={record} />
        ))}
        {records.length === 0 ? <div className="bg-card px-2 py-1.5 text-xs text-dim">No PR records yet — run Plan PRs (stage 3), then Sync PR Status.</div> : null}
        <div className="grid min-h-7 grid-cols-[84px_minmax(0,1fr)] items-center gap-2 border-t border-line bg-card px-2 py-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-dim">Upstream</span>
          <span className="text-dim">{Number.isFinite(upstreamOpen) ? `${num(upstreamOpen)} other open PR(s)` : "unknown — sync to fetch"}</span>
        </div>
      </div>
      {text(prs.warning) ? <p className="mt-1.5 mb-0 text-xs text-warn">{text(prs.warning)}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {toOpen > 0 ? (
            <Button
              disabled={busy || Boolean(lockReason)}
              icon={<GitPullRequest size={14} />}
              onClick={() => onAction("openAllPrs")}
              title={lockReason || `Open all ${toOpen} planned slice(s) as draft PRs, one at a time (support slices first). Each is verified alone against the baseline before anything is pushed.`}
              tone={lockReason ? undefined : "primary"}
              type="button"
            >
              Open All Drafts
            </Button>
          ) : null}
          <Button disabled={busy} icon={<RefreshCw size={14} />} onClick={() => onAction("syncPrs")} title="Re-seed from the latest split plan and pull status, comments, and CI from GitHub." type="button">
            Sync PR Status
          </Button>
        </div>
        {prs.syncedAt ? <span className="whitespace-nowrap text-[11px] text-dim">synced {agoText(prs.syncedAt)}</span> : null}
      </div>
    </StageCard>
  );
}

function RunSetupDisclosure({ dashboard, form, setForm }: Pick<SidebarProps, "dashboard" | "form" | "setForm">) {
  const schedulingPreset = schedulingPresetForWorkers(form.maxWorkers);
  const run = asObject(dashboard?.status?.run);
  const runDesiredWorkers = numberValue(run.desiredWorkers);
  const runWorkersMismatch = text(run.status) === "active" && runDesiredWorkers > 0 && runDesiredWorkers !== form.maxWorkers;
  return (
    <details className="control-disclosure">
      <summary>{`Setup — ${text(form.provider, "codex-lb")} · ${schedulingPreset.label} · epoch ${text(form.epochSize)}`}</summary>
      <label className="mt-2 mb-2 block text-xs text-dim">
        <span>Run size</span>
        <select className="mt-1" onChange={(event) => setForm(schedulingForWorkers(Number(event.currentTarget.value)))} value={schedulingPreset.workers}>
          {schedulingPresets.map((preset) => (
            <option key={preset.id} value={preset.workers}>
              {preset.label} / {preset.workers} workers / queue {preset.workers * 4}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Epoch size"
          onChange={(event) => setForm({ epochSize: event.currentTarget.value })}
          options={["32", "64", "128", "256", "512", "full"]}
          value={form.epochSize}
        />
        <Field
          label="Ready queue"
          min={1}
          onChange={(event) => setForm({ epochReadyQueueSize: Math.max(1, Number(event.currentTarget.value) || 1) })}
          type="number"
          value={form.epochReadyQueueSize}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field
          disabled={!form.fastKgMaintenanceEnabled}
          label="Fast ms"
          min={0}
          onChange={(event) => setForm({ fastKgMaintenanceIntervalMs: Math.max(0, Number(event.currentTarget.value) || 0) })}
          type="number"
          value={form.fastKgMaintenanceIntervalMs}
        />
        <Field
          disabled={!form.fastKgMaintenanceEnabled}
          label="Fast reports"
          min={0}
          onChange={(event) => setForm({ fastKgMaintenanceReportCount: Math.max(0, Number(event.currentTarget.value) || 0) })}
          type="number"
          value={form.fastKgMaintenanceReportCount}
        />
      </div>
      <SelectField label="Boundary KG" onChange={(event) => setForm({ fullKgMaintenanceMode: event.currentTarget.value })} options={["full", "no-tool-runners", "skip"]} value={form.fullKgMaintenanceMode} />
      <CheckboxField checked={form.fastKgMaintenanceEnabled} label="Fast run-evidence refresh" onChange={(event) => setForm({ fastKgMaintenanceEnabled: event.currentTarget.checked })} />
      {runWorkersMismatch ? (
        <p className="mb-2 text-xs text-warn">
          Active run is set to {runDesiredWorkers} workers. Start Work applies the new size ({form.maxWorkers}) to this run.
        </p>
      ) : null}
      <SelectField label="Default thinking" onChange={(event) => setForm({ thinkingLevel: event.currentTarget.value })} options={["medium", "low", "high", "xhigh"]} value={form.thinkingLevel} />
      <SelectField label="Worker thinking" onChange={(event) => setForm({ workerThinkingLevel: event.currentTarget.value })} options={["medium", "low", "high", "xhigh"]} value={form.workerThinkingLevel} />
      <p className="mt-2 text-xs text-dim">
        Handoff and QA settings (QA target, base ref, grouping, max files per PR, improvement promotion floors) come from{" "}
        <code>projects/&lt;id&gt;/project.json</code>.
      </p>
    </details>
  );
}

function nextCheckpointText(dashboard: Dashboard | null): string {
  const epoch = asObject(asObject(dashboard?.status).schedulerEpoch);
  if (epoch.epochId) {
    const completed = numberValue(epoch.completed, 0);
    const admitted = numberValue(epoch.admitted, 0);
    const ready = numberValue(epoch.readyQueued, 0);
    const leased = numberValue(epoch.leased, 0);
    return `${num(completed)}/${num(admitted)} complete · ${num(ready)} queued · ${num(leased)} leased`;
  }
  const progress = asObject(dashboard?.checkpointProgress);
  const remaining = numberValue(progress.remaining, NaN);
  const interval = numberValue(progress.interval, NaN);
  if (!Number.isFinite(remaining) || !Number.isFinite(interval) || interval <= 0) return "-";
  if (remaining <= 0) return "due (fires on the pool's next completed lease past its interval)";
  return `in ~${remaining} ${remaining === 1 ? "lease" : "leases"} (every ${interval})`;
}

function ProcessDisclosure({ dashboard, form }: Pick<SidebarProps, "dashboard" | "form">) {
  const selectedName = processName(form.processName);
  const { display, pillState, saved } = processView(dashboard, selectedName);
  const run = asObject(asObject(dashboard?.status).run);
  const facts: Array<[string, unknown]> = [
    ["PID", display.pid || "-"],
    ["Started", display.startedAt ? clock(display.startedAt) : "-"],
    ["Exit", display.exitCode ?? display.signal ?? "-"],
    ["Kill", display.killCommand || "-"],
  ];
  const runFacts: Array<[string, unknown]> = [
    ["Run ID", text(run.id) || "-"],
    ["Created", run.createdAt ? clock(run.createdAt) : "-"],
    ["Status", text(run.status) || "-"],
    ["Epoch", nextCheckpointText(dashboard)],
  ];

  return (
    <details className="control-disclosure">
      <summary>{`Process — ${text(display.name, selectedName)} · ${pillState}`}</summary>
      <div>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {facts.map(([label, value]) => (
            <div className="contents" key={label}>
              <dt className="text-dim">{label}</dt>
              <dd className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={String(value ?? "")}>
                {String(value ?? "")}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 text-[10px] uppercase tracking-[0.1em] text-dim">Run Details</div>
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {runFacts.map(([label, value]) => (
            <div className="contents" key={label}>
              <dt className="text-dim">{label}</dt>
              <dd className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={String(value ?? "")}>
                {String(value ?? "")}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 text-[10px] uppercase tracking-[0.1em] text-dim">Saved Processes</div>
        <div className="mt-1.5 grid gap-1.5">
          {saved.slice(0, 4).map((item) => (
            <div
              className={`grid min-h-7 w-full grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-2 rounded-none border px-2 py-1 text-left ${
                text(item.name) === selectedName ? "border-up/60" : "border-line2"
              } bg-card`}
              key={text(item.name)}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-fg">{text(item.name, "-")}</span>
              <span className={`text-right ${item.alive ? "text-up" : "text-dim"}`}>{item.alive ? "alive" : text(item.viewState, "saved")}</span>
              <span className="text-right">{String(item.pid || "-")}</span>
            </div>
          ))}
          {saved.length === 0 ? <div className="pt-1 text-dim">No saved process files</div> : null}
        </div>
      </div>
    </details>
  );
}

export function Sidebar({ busy, collapsed, config, dashboard, form, onAction, onCollapsedChange, onOpenPr, setForm }: SidebarProps) {
  const selectedName = processName(form.processName);
  const { draining, running } = processView(dashboard, selectedName);
  const projects = config?.availableProjects ?? [];
  const selectedProject = projects.find((project) => project.id === form.projectId) ?? dashboard?.project ?? config?.selectedProject ?? null;
  const phaseModel = derivePhaseModel(dashboard, running);
  const syncLocked = Boolean(phaseModel.syncLockReason);
  const flow = flowState(dashboard, running, syncLocked, draining);
  const shipStatus = text(asObject(asObject(dashboard?.handoff).ship).status);
  const prRecords = asArray(asObject(dashboard?.prs).records).map(asObject);
  const stage = currentStageIndex(flow, shipStatus, prRecords);

  if (collapsed) {
    return (
      <aside className="sidebar-rail sidebar-rail-collapsed grid min-w-0 border-r border-line2 bg-ink overflow-hidden max-[780px]:block">
        <div className="sidebar-rail-tab z-10 flex h-full flex-col items-center justify-start gap-2 border-b border-line bg-raised px-2 py-1.5 max-[780px]:h-[42px] max-[780px]:flex-row">
          <Button
            aria-expanded={false}
            className="h-7 min-w-7 px-0"
            icon={<ChevronRight size={14} />}
            onClick={() => onCollapsedChange(false)}
            title="Show controls"
            type="button"
          >
            <span className="sr-only">Show</span>
          </Button>
          <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-bold uppercase tracking-[0.14em] text-soft max-[780px]:[writing-mode:initial] max-[780px]:rotate-0">
            Controls
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar-rail sidebar-rail-open min-w-0 overflow-auto border-r border-line2 bg-ink">
      <div className="sidebar-rail-content">
        <div className="sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 border-b border-line2 bg-raised px-3 py-2.5">
          <Button
            aria-expanded
            className="h-7 min-w-7 px-0"
            icon={<ChevronLeft size={14} />}
            onClick={() => onCollapsedChange(true)}
            title="Hide controls"
            type="button"
          >
            <span className="sr-only">Hide</span>
          </Button>
          <div className="min-w-0">
            <h1 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold uppercase tracking-[0.2em] text-fg">Decomp Orchestrator</h1>
          </div>
        </div>

        <div className="grid gap-2.5 p-2.5">
          <SyncStage active={stage === 1} busy={busy} dashboard={dashboard} flow={flow} onAction={onAction} />
          <RunStage active={stage === 2} busy={busy} dashboard={dashboard} flow={flow} form={form} onAction={onAction} setForm={setForm} />
          <ShipStage active={stage === 3} busy={busy} dashboard={dashboard} flow={flow} onAction={onAction} />
          <PrsStage active={stage === 4} busy={busy} dashboard={dashboard} flow={flow} onAction={onAction} onOpenPr={onOpenPr} />
          <SessionStage active={stage === 5} busy={busy} flow={flow} onAction={onAction} />

          <SidebarPanel meta={text(form.projectId || selectedProject?.id, "-")} title="Project">
            <details className="control-disclosure project-disclosure">
              <summary>{selectedProject?.displayName ?? text(form.projectId, "-")}</summary>
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
              <div className="project-paths">
                <ProjectPathRow exists={selectedProject?.repoRootExists} label="Repo" path={form.repoRoot || selectedProject?.repoRoot} />
                <ProjectPathRow exists={selectedProject?.stateDirExists} label="State" path={form.stateDir || selectedProject?.stateDir} />
                <ProjectPathRow exists={selectedProject?.graphDbExists} label="Graph" path={form.graphDbPath || selectedProject?.graphDbPath} />
              </div>
              <CheckboxField checked={form.usePathOverrides} label="Use custom paths" onChange={(event) => setForm({ usePathOverrides: event.currentTarget.checked })} />
              <Field disabled={!form.usePathOverrides} label="Repo root" onChange={(event) => setForm({ repoRoot: event.currentTarget.value })} spellCheck={false} value={form.repoRoot} />
              <Field disabled={!form.usePathOverrides} label="State dir" onChange={(event) => setForm({ stateDir: event.currentTarget.value })} spellCheck={false} value={form.stateDir} />
              <Field disabled={!form.usePathOverrides} label="Graph DB" onChange={(event) => setForm({ graphDbPath: event.currentTarget.value })} spellCheck={false} value={form.graphDbPath} />
            </details>
          </SidebarPanel>
        </div>
      </div>
    </aside>
  );
}
