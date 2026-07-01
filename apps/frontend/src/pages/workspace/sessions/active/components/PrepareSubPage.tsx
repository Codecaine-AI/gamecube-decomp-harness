import type { ReactNode } from "react";
import {
  Database,
  GitBranch,
  Hammer,
  Play,
  RefreshCw,
  Settings,
} from "@/icons";
import {
  asObject,
  numberValue,
  text,
  type FormState,
  type JsonObject,
} from "@/lib/format";
import {
  workerTimeoutMinutes,
  workerTimeoutSecondsFromMinutes,
} from "@/lib/workerConfig";
import {
  Button,
  Field,
  InfoRows,
  PanelSection,
  PanelTitle,
  SelectField,
  StatCard,
} from "@/components/primitives";
import {
  candidateRerankOptions,
  candidateRerankTooltip,
  candidateWindowOptions,
  candidateWindowTooltip,
  epochSizeOptions,
  prettyStatus,
  resolverConcurrencyOptions,
  resolverConcurrencyTooltip,
  schedulingForWorkers,
  statusClass,
  workerCountOptions,
} from "@/pages/workspace/_lib/model";
import type {
  DashboardAction,
  SessionView,
} from "@/pages/workspace/_lib/types";

type GateState = "done" | "current" | "failed" | "todo";

function gateTone(state: GateState): string {
  if (state === "done") return "border-up/40 bg-up/10 text-up";
  if (state === "failed") return "border-down/50 bg-down/10 text-down";
  if (state === "current") return "border-warn/50 bg-warn/10 text-warn";
  return "border-line2 bg-card text-dim";
}

function gateState(done: boolean, active: boolean): GateState {
  if (done) return "done";
  if (active) return "current";
  return "todo";
}

function setupStatus(view: SessionView): string {
  if (view.operationActive) return view.operationLabel;
  if (view.syncing) return "Syncing";
  if (view.prepareState.readyToStartRun) return "Worker config";
  if (view.prepareState.baselineDone) return "Baseline ready";
  if (text(view.prepareState.baseline.status) === "failed")
    return "Baseline failed";
  if (view.prepareState.intakeDone && view.prepareState.knowledgeDone)
    return "Baseline";
  if (view.prepareState.syncDone) return "PR intake";
  return view.canonicalSubphase
    ? prettyStatus(view.canonicalSubphase)
    : "Waiting";
}

function shortPath(value: unknown): string {
  const path = text(value);
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-3).join("/");
}

function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function compactCount(value: unknown): string {
  const parsed = numberValue(value, NaN);
  return Number.isFinite(parsed) ? Math.round(parsed).toLocaleString() : "-";
}

function compactPercent(value: unknown): string {
  const parsed = numberValue(value, NaN);
  return Number.isFinite(parsed) ? `${parsed.toFixed(3)}%` : "-";
}

function finiteMetric(value: unknown): number {
  return numberValue(value, NaN);
}

function upstreamChangeLabel(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "changed" : "unchanged";
}

function upstreamChangeTone(value: boolean | null): string {
  if (value === null) return "text-dim";
  return value ? "text-warn" : "text-up";
}

function MiniRows({
  rows,
}: {
  rows: Array<{
    label: string;
    title?: string;
    tone?: string;
    value: string;
  }>;
}) {
  return (
    <div className="grid gap-1 text-[11px]">
      {rows.map((row) => (
        <div
          className="grid min-w-0 grid-cols-[82px_minmax(0,1fr)] items-center gap-2"
          key={row.label}
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.08em] text-dim">
            {row.label}
          </span>
          <span
            className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium ${row.tone ?? "text-soft"}`}
            title={row.title ?? row.value}
          >
            {row.value || "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

function baselineOutput(baseline: JsonObject): string {
  const reportRun = asObject(baseline.reportRun);
  const resetReport = asObject(baseline.resetReport);
  return (
    shortPath(reportRun.reportChangesPath) ||
    shortPath(reportRun.reportPath) ||
    shortPath(resetReport.baselinePath) ||
    "not calculated"
  );
}

function baselineSummary(baseline: JsonObject): JsonObject {
  const summary = asObject(baseline.summary);
  if (Object.keys(summary).length > 0) return summary;
  const reportRunSummary = asObject(asObject(baseline.reportRun).summary);
  if (Object.keys(reportRunSummary).length > 0) return reportRunSummary;
  return asObject(asObject(baseline.resetReport).summary);
}

function hasBaselineSummary(summary: JsonObject): boolean {
  return Object.values(summary).some((value) => Number.isFinite(Number(value)));
}

function GateCard({
  action,
  children,
  detail,
  disabled,
  icon,
  label,
  state,
  title,
}: {
  action?: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    tone?: "default" | "primary" | "warning";
  };
  children?: ReactNode;
  detail?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  state: GateState;
  title?: string;
}) {
  const hasDetail = Boolean(detail);
  return (
    <div
      className={`grid min-h-[220px] min-w-0 ${hasDetail ? "grid-rows-[auto_auto_1fr_auto]" : "grid-rows-[auto_1fr_auto]"} gap-2 border p-3 ${gateTone(state)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold uppercase tracking-[0.1em]">
            {label}
          </span>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase">
          {state}
        </span>
      </div>
      {hasDetail ? (
        <div
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim"
          title={detail}
        >
          {detail}
        </div>
      ) : null}
      <div className="min-w-0">{children}</div>
      {action ? (
        <Button
          disabled={disabled}
          icon={action.icon}
          onClick={action.onClick}
          title={title}
          tone={action.tone}
          type="button"
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function PrepareSubPage({
  busy,
  form,
  onAction,
  setForm,
  view,
}: {
  busy: boolean;
  form: FormState;
  onAction: (action: DashboardAction) => void;
  setForm: (updates: Partial<FormState>) => void;
  view: SessionView;
}) {
  const timeoutMinutes = workerTimeoutMinutes(form.agentTimeoutSeconds);
  const syncBlocked =
    view.syncLocked ||
    view.process.running ||
    view.activeClaims > 0 ||
    view.operationActive;
  const intakeBlocked =
    !view.prepareState.syncDone ||
    view.operationActive ||
    view.process.running ||
    view.activeClaims > 0;
  const baselineBlocked =
    !view.prepareState.intakeDone ||
    !view.prepareState.knowledgeDone ||
    view.operationActive ||
    view.process.running ||
    view.activeClaims > 0;
  const startBlocked = view.prepareState.readyToStartRun
    ? ""
    : view.operationActive
      ? `${view.operationLabel} is in progress.`
      : view.process.running
        ? "Workers are already running."
        : !view.prepareState.baselineDone
          ? "Baseline is not ready."
          : "Preparation is not ready.";
  const mergedPrCount = view.prepareState.mergedPrs.length;
  const pendingIntakePrCount = view.prepareState.pendingIntakePrCount;
  const pendingMergedPrIndexCount = view.prepareState.pendingMergedPrIndexCount;
  const pendingPrIndexCount = view.prepareState.pendingPrIndexCount;
  const runningIntakeItemCount = view.prepareState.runningIntakeItemCount;
  const completedIntakeItemCount = view.prepareState.completedIntakeItemCount;
  const failedIntakeItemCount = view.prepareState.failedIntakeItemCount;
  const retryableIntakeItemCount = view.prepareState.retryableIntakeItemCount;
  const totalIntakeItemCount = view.prepareState.totalIntakeItemCount;
  const hasIntakeItems =
    totalIntakeItemCount > 0 ||
    runningIntakeItemCount > 0 ||
    completedIntakeItemCount > 0 ||
    failedIntakeItemCount > 0;
  const baselineStatus = text(view.prepareState.baseline.status);
  const baselineFailed = baselineStatus === "failed";
  const baselineError = text(view.prepareState.baseline.error);
  const baselineMetrics = baselineSummary(view.prepareState.baseline);
  const baselineHasMetrics = hasBaselineSummary(baselineMetrics);
  const unmatchedTargets = finiteMetric(baselineMetrics.unmatchedTargets);
  const incompleteUnits = finiteMetric(baselineMetrics.incompleteUnits);
  const totalUnits = finiteMetric(baselineMetrics.totalUnits);
  const completeUnits = finiteMetric(baselineMetrics.completeUnits);
  const prIndexDebt = view.prepareState.prIndexDebt;
  const prIndexDebtKnown = view.prepareState.prIndexDebtKnown;
  const knownMergedPrCount = numberValue(prIndexDebt.knownMergedPrs, 0);
  const agentIndexedMergedPrCount = numberValue(
    prIndexDebt.agentIndexedMergedPrs,
    0,
  );
  const missingRawPrCount = numberValue(prIndexDebt.missingRawPrs, 0);
  const rawSlicePrCount = numberValue(prIndexDebt.rawSlicePrs, 0);
  const upstreamWorktree = view.prepareState.upstreamWorktreePath;
  const sessionCurrentWorktree = view.prepareState.sessionCurrentWorktreePath;
  const syncHead = view.prepareState.headShortSha || "-";
  const syncChange = upstreamChangeLabel(view.prepareState.upstreamChanged);
  const syncDetail = view.prepareState.syncDone
    ? `head ${syncHead} / upstream ${syncChange}`
    : "upstream current/session current worktrees and merged PR discovery";
  const intakeDetail = view.prepareState.intakeDone
    ? prIndexDebtKnown && pendingMergedPrIndexCount > 0
      ? `${countLabel(pendingMergedPrIndexCount, "merged PR")} still need agent indexing; knowledge ${view.prepareState.knowledgeDone ? "refreshed" : "pending"}`
      : `agent index current; knowledge ${view.prepareState.knowledgeDone ? "refreshed" : "pending"}`
    : view.prepareState.syncDone
      ? hasIntakeItems
        ? `${completedIntakeItemCount.toLocaleString()}/${totalIntakeItemCount.toLocaleString()} complete; ${countLabel(retryableIntakeItemCount, "retryable failure")}`
        : prIndexDebtKnown
          ? `${countLabel(pendingMergedPrIndexCount, "merged PR")} need agent indexing; ${countLabel(mergedPrCount, "new PR")} git-discovered`
          : `${countLabel(pendingIntakePrCount, "PR")} need intake; missing-record scan pending`
      : "waiting for Git Sync";
  const baselineDetail = view.prepareState.baselineDone
    ? baselineOutput(view.prepareState.baseline)
    : baselineFailed
      ? `failed: ${baselineError || "retry available"}`
      : "session baseline report";
  const syncState = gateState(
    view.prepareState.syncDone,
    view.canonicalSubphase === "sync_intake" || view.syncing,
  );
  const intakeState = gateState(
    view.prepareState.intakeDone && view.prepareState.knowledgeDone,
    view.canonicalSubphase === "processing_prs" ||
      view.canonicalSubphase === "knowledge_refresh",
  );
  const baselineState: GateState = view.prepareState.baselineDone
    ? "done"
    : baselineFailed
      ? "failed"
      : view.canonicalSubphase === "baseline"
        ? "current"
        : "todo";
  const configState = gateState(
    view.canonicalPhase !== "preparing" && Boolean(view.activeSessionId),
    view.prepareState.baselineDone,
  );

  return (
    <div className="grid gap-4">
      <PanelSection>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PanelTitle className="mb-0">Preparation</PanelTitle>
          <Button
            disabled={busy}
            icon={<RefreshCw size={13} />}
            onClick={() => onAction("refresh")}
            type="button"
          >
            Refresh
          </Button>
        </div>
        <div className="grid gap-3 @[760px]:grid-cols-4">
          <GateCard
            action={{
              icon: <GitBranch size={13} />,
              label: view.prepareState.syncDone ? "Resync" : "Sync GitHub",
              onClick: () => onAction("syncGit"),
            }}
            detail={syncDetail}
            disabled={busy || syncBlocked}
            icon={<GitBranch size={15} />}
            label="Git Sync"
            state={syncState}
            title={
              syncBlocked
                ? "Sync is locked while setup, workers, claims, or another operation is active."
                : view.prepareState.syncDone
                  ? "Fetch upstream again, refresh the session worktrees, and rediscover merged PRs."
                  : "Fetch upstream, update upstream current/session current worktrees, and discover merged PRs."
            }
          >
            <MiniRows
              rows={[
                {
                  label: "Head",
                  title: view.prepareState.headSha,
                  tone: view.prepareState.syncDone ? "text-fg" : "text-dim",
                  value: syncHead,
                },
                {
                  label: "Upstream",
                  tone: view.prepareState.syncDone
                    ? upstreamChangeTone(view.prepareState.upstreamChanged)
                    : "text-dim",
                  value: view.prepareState.syncDone ? syncChange : "pending",
                },
                {
                  label: "New PRs",
                  tone:
                    mergedPrCount > 0
                      ? "text-warn"
                      : view.prepareState.syncDone
                        ? "text-up"
                        : "text-dim",
                  value: view.prepareState.syncDone
                    ? countLabel(mergedPrCount, "PR")
                    : "-",
                },
                {
                  label: "upstream-current",
                  title: upstreamWorktree,
                  value: shortPath(upstreamWorktree),
                },
                {
                  label: "session-current",
                  title: sessionCurrentWorktree,
                  value: shortPath(sessionCurrentWorktree),
                },
              ]}
            />
          </GateCard>
          <GateCard
            action={{
              icon: <Database size={13} />,
              label: "Start Intake",
              onClick: () => onAction("indexPrs"),
            }}
            detail={intakeDetail}
            disabled={busy || intakeBlocked}
            icon={<Database size={15} />}
            label="PR Intake"
            state={intakeState}
            title={
              intakeBlocked
                ? "Git sync must finish before PR intake."
                : "Index merged PR postmortems, missing records, and refresh knowledge."
            }
          >
            <MiniRows
              rows={[
                {
                  label: "Pending items",
                  tone:
                    pendingIntakePrCount > 0
                      ? "text-warn"
                      : hasIntakeItems
                        ? "text-up"
                        : "text-dim",
                  value:
                    hasIntakeItems || view.prepareState.syncDone
                      ? countLabel(pendingIntakePrCount, "PR")
                      : "-",
                },
                {
                  label: "Running",
                  tone: runningIntakeItemCount > 0 ? "text-warn" : "text-dim",
                  value: hasIntakeItems
                    ? countLabel(runningIntakeItemCount, "PR")
                    : "-",
                },
                {
                  label: "Completed",
                  tone: completedIntakeItemCount > 0 ? "text-up" : "text-dim",
                  value: hasIntakeItems
                    ? countLabel(completedIntakeItemCount, "PR")
                    : "-",
                },
                {
                  label: "Retryable",
                  tone:
                    retryableIntakeItemCount > 0
                      ? "text-down"
                      : hasIntakeItems
                        ? "text-up"
                        : "text-dim",
                  value: hasIntakeItems
                    ? countLabel(retryableIntakeItemCount, "PR")
                    : "-",
                },
                {
                  label: "Needs indexing",
                  tone:
                    pendingMergedPrIndexCount > 0
                      ? "text-warn"
                      : view.prepareState.syncDone
                        ? "text-up"
                        : "text-dim",
                  value: view.prepareState.syncDone
                    ? countLabel(pendingMergedPrIndexCount, "merged PR")
                    : "-",
                },
                {
                  label: "All local debt",
                  tone:
                    pendingPrIndexCount > 0
                      ? "text-warn"
                      : view.prepareState.syncDone
                        ? "text-up"
                        : "text-dim",
                  value: prIndexDebtKnown
                    ? countLabel(pendingPrIndexCount, "PR")
                    : "unknown",
                },
                {
                  label: "Git-discovered",
                  tone: view.prepareState.syncDone ? "text-soft" : "text-dim",
                  value: view.prepareState.syncDone
                    ? countLabel(mergedPrCount, "new PR")
                    : "pending",
                },
                {
                  label: "Agent indexed",
                  tone: prIndexDebtKnown ? "text-soft" : "text-dim",
                  value: prIndexDebtKnown
                    ? `${agentIndexedMergedPrCount.toLocaleString()}/${knownMergedPrCount.toLocaleString()} merged`
                    : "-",
                },
                {
                  label: "Raw records",
                  tone:
                    prIndexDebtKnown && missingRawPrCount > 0
                      ? "text-warn"
                      : prIndexDebtKnown
                        ? "text-up"
                        : "text-dim",
                  value: prIndexDebtKnown
                    ? missingRawPrCount > 0
                      ? `${countLabel(missingRawPrCount, "PR")} missing`
                      : `${rawSlicePrCount.toLocaleString()} ready`
                    : "-",
                },
                {
                  label: "Knowledge",
                  tone: view.prepareState.knowledgeDone
                    ? "text-up"
                    : "text-dim",
                  value: view.prepareState.knowledgeDone
                    ? "refreshed"
                    : "pending",
                },
              ]}
            />
          </GateCard>
          <GateCard
            action={{
              icon: <Hammer size={13} />,
              label: "Calculate Baseline",
              onClick: () => onAction("calculateBaseline"),
              tone: "warning",
            }}
            detail={baselineDetail}
            disabled={busy || baselineBlocked}
            icon={<Hammer size={15} />}
            label="Baseline"
            state={baselineState}
            title={
              baselineBlocked
                ? "PR intake and knowledge refresh must finish before baseline."
                : "Reset and report the session baseline."
            }
          >
            <MiniRows
              rows={[
                {
                  label: "Fuzzy",
                  tone: baselineHasMetrics ? "text-fg" : "text-dim",
                  value: baselineHasMetrics
                    ? compactPercent(baselineMetrics.fuzzyMatchPercent)
                    : "-",
                },
                {
                  label: "Code",
                  title: `${compactCount(baselineMetrics.matchedCodeBytes)} / ${compactCount(baselineMetrics.totalCodeBytes)} matched code bytes`,
                  tone: baselineHasMetrics ? "text-soft" : "text-dim",
                  value: baselineHasMetrics
                    ? compactPercent(baselineMetrics.matchedCodePercent)
                    : "-",
                },
                {
                  label: "Data",
                  title: `${compactCount(baselineMetrics.matchedDataBytes)} / ${compactCount(baselineMetrics.totalDataBytes)} matched data bytes`,
                  tone: baselineHasMetrics ? "text-soft" : "text-dim",
                  value: baselineHasMetrics
                    ? compactPercent(baselineMetrics.matchedDataPercent)
                    : "-",
                },
                {
                  label: "Funcs",
                  title: `${compactCount(baselineMetrics.matchedFunctions)} / ${compactCount(baselineMetrics.totalFunctions)} matched functions`,
                  tone: baselineHasMetrics ? "text-soft" : "text-dim",
                  value: baselineHasMetrics
                    ? compactPercent(baselineMetrics.matchedFunctionsPercent)
                    : "-",
                },
                {
                  label: "Unmatched",
                  title: "Functions below exact match in the baseline report",
                  tone: Number.isFinite(unmatchedTargets)
                    ? unmatchedTargets > 0
                      ? "text-warn"
                      : "text-up"
                    : "text-dim",
                  value: Number.isFinite(unmatchedTargets)
                    ? countLabel(unmatchedTargets, "target")
                    : "-",
                },
                {
                  label: "Units",
                  title: Number.isFinite(incompleteUnits)
                    ? `${compactCount(incompleteUnits)} incomplete unit${incompleteUnits === 1 ? "" : "s"}`
                    : undefined,
                  tone: Number.isFinite(incompleteUnits)
                    ? incompleteUnits > 0
                      ? "text-warn"
                      : "text-up"
                    : "text-dim",
                  value:
                    Number.isFinite(completeUnits) && Number.isFinite(totalUnits)
                      ? `${compactCount(completeUnits)}/${compactCount(totalUnits)}`
                      : "-",
                },
              ]}
            />
          </GateCard>
          <GateCard
            icon={<Settings size={15} />}
            label="Worker Config"
            state={configState}
          >
            <div className="grid gap-2">
              <div className="grid grid-cols-1 gap-2">
                <SelectField
                  className="mb-0"
                  label="Num workers"
                  onChange={(event) =>
                    setForm(
                      schedulingForWorkers(Number(event.currentTarget.value)),
                    )
                  }
                  options={[...workerCountOptions]}
                  value={form.maxWorkers}
                />
                <SelectField
                  className="mb-0"
                  label="Epoch size"
                  onChange={(event) =>
                    setForm({ epochSize: event.currentTarget.value })
                  }
                  options={[...epochSizeOptions]}
                  value={form.epochSize}
                />
                <SelectField
                  className="mb-0"
                  label="Candidate window"
                  onChange={(event) =>
                    setForm({ candidateWindow: event.currentTarget.value })
                  }
                  options={[...candidateWindowOptions]}
                  title={candidateWindowTooltip}
                  value={form.candidateWindow}
                />
                <SelectField
                  className="mb-0"
                  label="Rerank"
                  onChange={(event) =>
                    setForm({ candidateRerank: event.currentTarget.value })
                  }
                  options={[...candidateRerankOptions]}
                  title={candidateRerankTooltip}
                  value={form.candidateRerank}
                />
                <SelectField
                  className="mb-0"
                  label="Resolvers"
                  onChange={(event) =>
                    setForm({
                      integrationResolverConcurrency: Number(
                        event.currentTarget.value,
                      ),
                    })
                  }
                  options={[...resolverConcurrencyOptions]}
                  title={resolverConcurrencyTooltip}
                  value={form.integrationResolverConcurrency}
                />
                <Field
                  className="mb-0"
                  label="Timeout (min)"
                  min={1}
                  onChange={(event) =>
                    setForm({
                      agentTimeoutSeconds:
                        workerTimeoutSecondsFromMinutes(
                          event.currentTarget.value,
                        ),
                    })
                  }
                  step={1}
                  type="number"
                  value={timeoutMinutes}
                />
              </div>
            </div>
          </GateCard>
        </div>
        <div className="mt-4 flex justify-center">
          <Button
            className="min-w-[180px]"
            disabled={busy || !view.prepareState.readyToStartRun}
            icon={<Play size={14} />}
            onClick={() => onAction("startWork")}
            title={startBlocked || "Initialize the run and start workers."}
            tone={view.prepareState.readyToStartRun ? "primary" : undefined}
            type="button"
          >
            Start Run
          </Button>
        </div>
      </PanelSection>
    </div>
  );
}
