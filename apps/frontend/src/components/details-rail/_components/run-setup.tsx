import type { ReactNode } from "react";
import {
  Hammer,
  Play,
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
  MiniRows,
  SelectField,
} from "@/components/primitives";
import {
  candidateRerankOptions,
  candidateRerankTooltip,
  candidateWindowOptions,
  candidateWindowTooltip,
  epochSizeOptions,
  resolverConcurrencyOptions,
  resolverConcurrencyTooltip,
  schedulingForWorkers,
  workerCountOptions,
} from "@/pages/workspace/_lib/model";
import type {
  DashboardAction,
  CycleView,
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

export function runSetupSummary(view: CycleView): string {
  const baselineStatus = text(view.prepareState.baseline.status);
  return view.prepareState.readyToStartRun
    ? "ready to start"
    : view.prepareState.baselineDone
      ? "baseline ready"
      : baselineStatus === "failed"
        ? "baseline failed"
        : "baseline pending";
}

export function RunSetupSection({
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
  view: CycleView;
}) {
  const timeoutMinutes = workerTimeoutMinutes(form.agentTimeoutSeconds);
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
  const baselineStatus = text(view.prepareState.baseline.status);
  const baselineFailed = baselineStatus === "failed";
  const baselineError = text(view.prepareState.baseline.error);
  const baselineMetrics = baselineSummary(view.prepareState.baseline);
  const baselineHasMetrics = hasBaselineSummary(baselineMetrics);
  const unmatchedTargets = finiteMetric(baselineMetrics.unmatchedTargets);
  const incompleteUnits = finiteMetric(baselineMetrics.incompleteUnits);
  const totalUnits = finiteMetric(baselineMetrics.totalUnits);
  const completeUnits = finiteMetric(baselineMetrics.completeUnits);
  const baselineDetail = view.prepareState.baselineDone
    ? baselineOutput(view.prepareState.baseline)
    : baselineFailed
      ? `failed: ${baselineError || "retry available"}`
      : "cycle baseline report";
  const baselineState: GateState = view.prepareState.baselineDone
    ? "done"
    : baselineFailed
      ? "failed"
      : view.canonicalSubphase === "baseline"
        ? "current"
        : "todo";
  const configState = gateState(
    view.canonicalPhase !== "preparing" && Boolean(view.activeCycleId),
    view.prepareState.baselineDone,
  );
  return (
    <div className="grid gap-3 p-3">
          <div className="grid gap-3">
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
                  : "Reset and report the cycle baseline."
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
          <div className="flex justify-center">
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
    </div>
  );
}
