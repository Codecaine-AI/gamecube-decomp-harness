import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import {
  asArray,
  asObject,
  ago,
  clock,
  delta,
  num,
  scoreOrPercent,
  scorePairLooksPercent,
  shortId,
  text,
  type Dashboard,
  type JsonObject,
  type RunDetails,
} from "@decomp-orchestrator/ui-contract";
import { Button } from "./primitives";

interface DetailsRailProps {
  collapsed: boolean;
  dashboard: Dashboard | null;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onResizeEnd: () => void;
  onResizeStart: () => void;
  onWidthChange: (width: number) => void;
  runDetails: RunDetails | null;
  tabRequest?: { nonce: number; tab: DetailsTab } | null;
}

type DetailsTab = "logs" | "run" | "agents";

function formatElapsed(fromIso: unknown, toIso?: unknown): string {
  const from = Date.parse(text(fromIso));
  const to = toIso ? Date.parse(text(toIso)) : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return "";
  const totalSeconds = Math.floor((to - from) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

const operationStepGlyph: Record<string, { className: string; glyph: string }> = {
  done: { className: "text-up", glyph: "✓" },
  running: { className: "text-fg", glyph: "▸" },
  failed: { className: "text-down", glyph: "✕" },
  skipped: { className: "text-dim", glyph: "–" },
  pending: { className: "text-dim", glyph: "·" },
};

/**
 * Live view of the one long-running server operation (sync, prepare handoff,
 * QA, fresh run). The last result stays visible until the next operation
 * starts, so "did my sync finish, and at which step did it die" is always
 * answerable here without scrolling raw logs.
 */
function OperationActivity({ dashboard }: { dashboard: Dashboard | null }) {
  const operation = asObject(asObject(dashboard?.process).operation);
  const running = text(operation.status) === "running";
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);
  if (!operation.name) {
    return <div className="mb-3 border border-line bg-card px-2.5 py-2 text-xs text-dim">No sync, handoff, or QA operation has run since the UI server started.</div>;
  }

  const steps = asArray(operation.steps).map(asObject);
  const status = text(operation.status);
  const elapsed = formatElapsed(operation.startedAt, running ? undefined : operation.endedAt);

  return (
    <div className="mb-3 border border-line bg-card px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-soft">{text(operation.label, "Activity")}</span>
        <span className={`text-xs ${status === "failed" ? "text-down" : status === "done" ? "text-up" : "text-fg"}`}>
          {running ? `running · ${elapsed}` : `${status} · ${elapsed}`}
        </span>
      </div>
      <div className="grid gap-1">
        {steps.map((step) => {
          const stepStatus = text(step.status, "pending");
          const tone = operationStepGlyph[stepStatus] ?? operationStepGlyph.pending;
          const stepElapsed = step.startedAt ? formatElapsed(step.startedAt, stepStatus === "running" ? undefined : step.endedAt) : "";
          return (
            <div className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-2 text-xs" key={text(step.name)}>
              <span className={tone.className}>{tone.glyph}</span>
              <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${stepStatus === "running" ? "text-fg" : stepStatus === "pending" || stepStatus === "skipped" ? "text-dim" : "text-soft"}`}>
                {text(step.name)}
                {step.detail ? <span className="text-dim"> — {text(step.detail)}</span> : null}
              </span>
              <span className="whitespace-nowrap text-dim">{stepElapsed}</span>
            </div>
          );
        })}
      </div>
      {status === "failed" && operation.error ? (
        <p className="mt-2 mb-0 break-words text-xs text-down" title={text(operation.error)}>
          {text(operation.error).slice(0, 400)}
        </p>
      ) : null}
      {status === "failed" && operation.next ? (
        <p className="mt-1.5 mb-0 break-words text-xs text-soft">
          <span className="font-semibold uppercase tracking-[0.08em] text-dim">Next </span>
          {text(operation.next)}
        </p>
      ) : null}
    </div>
  );
}

function LogLines({ dashboard }: { dashboard: Dashboard | null }) {
  const logs = asArray(asObject(dashboard?.process).logs).map(asObject).slice(-120);
  if (logs.length === 0) return <pre className="min-h-[360px] max-h-[calc(100vh-132px)] overflow-auto rounded-none border border-line bg-inset p-2 text-soft whitespace-pre-wrap max-[1180px]:max-h-[540px]" />;
  return (
    <pre className="min-h-[360px] max-h-[calc(100vh-132px)] overflow-auto rounded-none border border-line bg-inset p-2 text-soft whitespace-pre-wrap max-[1180px]:max-h-[540px]">
      {logs.map((line, index) => (
        <span key={index}>
          <span className={line.stream === "stderr" ? "text-down" : line.stream === "stdout" ? "text-up/75" : "text-dim"}>[{text(line.stream)}]</span> {text(line.text)}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`min-h-8 rounded-none border px-2.5 py-1 text-xs font-bold uppercase ${
        active ? "border-line2 bg-raised text-fg" : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

function RunDetailsPanel({ loadRunDetails, loadingRunDetails, runDetails }: Pick<DetailsRailProps, "loadRunDetails" | "loadingRunDetails" | "runDetails">) {
  const summary = asObject(runDetails?.summary);
  const timeline = asArray(runDetails?.timeline).map(asObject);
  const facts: Array<[string, unknown]> = [
    ["reports", summary.workerReports],
    ["score+", summary.positiveAttempts],
    ["exact%", summary.exactMatches],
    ["files+", summary.improvedFiles],
    ["sessions", summary.piSessions],
    ["events", summary.events],
    ["leases", summary.leases],
    ["queue", summary.queueRows],
    ["targets", summary.targets],
  ];

  function download() {
    if (!runDetails) return;
    const blob = new Blob([JSON.stringify(runDetails, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `decomp-run-${shortId(runDetails.runId)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2">
        <Button className="min-h-6 px-2 py-0.5" icon={<RefreshCw size={13} />} onClick={loadRunDetails} type="button">
          {loadingRunDetails ? "Loading" : "Refresh"}
        </Button>
        <Button className="min-h-6 px-2 py-0.5" disabled={!runDetails} icon={<Download size={13} />} onClick={download} type="button">
          JSON
        </Button>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-dim">{runDetails?.generatedAt ? `loaded ${clock(runDetails.generatedAt)}` : ""}</span>
      </div>
      {runDetails ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {facts.map(([label, value]) => (
              <div className="rounded-none border border-line bg-card px-2 py-1" key={label}>
                <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] text-up">{num(value)}</strong>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim">{label}</span>
              </div>
            ))}
          </div>
          <div className="grid max-h-[520px] gap-1.5 overflow-auto">
            {timeline.map((item) => (
              <article className={`rounded-none border border-l-[3px] border-line bg-card p-2 ${text(item.kind) === "worker_report" ? "border-l-cyan" : text(item.kind) === "event" ? "border-l-warn" : text(item.kind) === "pi_session" ? "border-l-up" : "border-l-purple"}`} key={`${text(item.kind)}-${text(item.id)}-${text(item.at)}`}>
                <div className="flex justify-between gap-2 text-[11px] text-dim">
                  <span>{text(item.kind)}</span>
                  <span>{clock(item.at)}</span>
                </div>
                <strong className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap" title={text(item.title)}>{text(item.title) || text(item.id, "-")}</strong>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-dim" title={text(item.path)}>{text(item.path)}</div>
                <div className="text-dim">
                  {text(item.detail)}
                  {Number(item.delta || 0) > 0 ? ` / delta ${delta(item.delta)}` : ""}
                  {Number(item.exactMatches || 0) > 0 ? ` / exact ${num(item.exactMatches)}` : ""}
                </div>
              </article>
            ))}
            {timeline.length === 0 ? <div className="text-dim">No timeline entries</div> : null}
          </div>
        </>
      ) : (
        <div className="text-dim">Not loaded</div>
      )}
    </>
  );
}

type ReportOutcome = "exact" | "improved_stalled" | "improved_needs_fact" | "no_progress_stalled" | "no_progress_needs_fact" | "needs_rework" | "tool_error" | "provider_error";
type ReportFilter = "all" | ReportOutcome;
type ReportResult = "exact" | "improved" | "no_progress";
type StopReason = "target_complete" | "needs_fact" | "stalled";

const reportsPageSize = 8;

const reportFilters: Array<{ description: string; id: ReportFilter; label: string }> = [
  { id: "all", label: "All", description: "Every worker report in this run or recent window." },
  { id: "exact", label: "Exact %", description: "Worker report with percent score movement to 100%." },
  { id: "improved_stalled", label: "Improved / Stalled", description: "Positive percent score movement, then no evidence-backed next move." },
  { id: "improved_needs_fact", label: "Improved / Needs", description: "Positive percent score movement, then a specific missing fact/resource blocks the next move." },
  { id: "no_progress_stalled", label: "No Progress / Stalled", description: "No positive score movement and no evidence-backed next move." },
  { id: "no_progress_needs_fact", label: "No Progress / Needs", description: "No positive score movement because a specific missing fact/resource blocks progress." },
  { id: "needs_rework", label: "Needs Rework", description: "The runner could not verify the return — claim and measurement disagree, or the return was inconsistent. The direction may still be promising; retry after updating facts or tooling." },
  { id: "tool_error", label: "Tool Error", description: "A tool, command, build, or parse infrastructure failure blocked trustworthy worker evaluation." },
  { id: "provider_error", label: "Provider Error", description: "The LLM provider failed before the target was really attempted; the target requeued and the pool paused until a probe succeeded." },
];
const reportFilterIds: ReportFilter[] = reportFilters.map((option) => option.id);

function reportTypeLabel(value: unknown): string {
  const reportType = text(value);
  if (reportType === "score_candidate") return "score candidate";
  if (reportType === "needs_fact") return "needs fact";
  if (reportType === "needs_rework") return "needs rework";
  if (reportType === "tool_error") return "tool error";
  if (reportType === "provider_error") return "provider error";
  if (reportType === "stalled_no_useful_guess") return "stalled";
  return reportType || "unknown";
}

function attemptNumber(value: unknown, fallback = NaN): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function attemptLooksPercent(attempt: JsonObject): boolean {
  return scorePairLooksPercent(attempt.oldScore, attempt.newScore, attempt.delta);
}

function positivePercentAttempts(report: JsonObject): JsonObject[] {
  return asArray(report.attempts)
    .map(asObject)
    .filter((attempt) => attemptLooksPercent(attempt) && attemptNumber(attempt.delta, 0) > 0);
}

// Runner validation is the canonical score outcome when it passed; the
// model-authored attempts[] narrative is only a fallback for older reports.
function reportRunnerTarget(report: JsonObject): JsonObject | null {
  const validation = asObject(report.runnerValidation);
  if (text(validation.status) !== "passed") return null;
  const target = asObject(validation.target);
  return Object.keys(target).length > 0 ? target : null;
}

function runnerTargetDelta(target: JsonObject): number {
  const before = attemptNumber(target.before, NaN);
  const after = attemptNumber(target.after, NaN);
  return Number.isFinite(before) && Number.isFinite(after) ? after - before : NaN;
}

function reportScoreDelta(report: JsonObject): number {
  const runnerTarget = reportRunnerTarget(report);
  if (runnerTarget) {
    const runnerDelta = runnerTargetDelta(runnerTarget);
    if (Number.isFinite(runnerDelta)) return Math.max(0, runnerDelta);
  }
  const recorded = attemptNumber(report.scoreDelta, NaN);
  if (Number.isFinite(recorded)) return recorded;
  return positivePercentAttempts(report).reduce((sum, attempt) => sum + Math.max(0, attemptNumber(attempt.delta, 0)), 0);
}

function reportHasExactAttempt(report: JsonObject): boolean {
  const runnerTarget = reportRunnerTarget(report);
  if (runnerTarget) return runnerTarget.exact === true;
  return asArray(report.attempts)
    .map(asObject)
    .some((attempt) => attemptLooksPercent(attempt) && attemptNumber(attempt.oldScore) < 99.99999 && attemptNumber(attempt.newScore) >= 99.99999);
}

function reportFailed(report: JsonObject): boolean {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  const repairAttempts = asObject(report.repairAttempts);
  const validationStatus = text(validation.status);
  return (
    gate.accepted === false ||
    (validationStatus !== "" && validationStatus !== "passed" && validationStatus !== "skipped") ||
    repairAttempts.exhausted === true
  );
}

function runnerValidationRejected(report: JsonObject): boolean {
  const status = text(asObject(report.runnerValidation).status);
  return status !== "" && status !== "passed" && status !== "skipped";
}

function reportResult(report: JsonObject): ReportResult {
  const runnerTarget = reportRunnerTarget(report);
  if (runnerTarget) {
    if (runnerTarget.exact === true) return "exact";
    if (runnerTarget.improved === true || runnerTargetDelta(runnerTarget) > 0) return "improved";
    return "no_progress";
  }
  // A rejected runner validation can never render as success, even when the
  // model-authored result/attempts claim exact or improved.
  if (runnerValidationRejected(report)) return "no_progress";
  const explicit = text(report.result);
  if (reportHasExactAttempt(report)) return "exact";
  if (explicit === "no_progress") return explicit;
  if (explicit === "exact" || explicit === "improved") return reportScoreDelta(report) > 0 ? "improved" : "no_progress";
  if (reportScoreDelta(report) > 0) return "improved";
  return "no_progress";
}

function reportStopReason(report: JsonObject, result = reportResult(report)): StopReason {
  const explicit = text(report.stopReason);
  if (explicit === "target_complete" || explicit === "needs_fact" || explicit === "stalled") return explicit;
  if (explicit === "no_useful_hypothesis") return "stalled";
  if (result === "exact") return "target_complete";
  if (text(report.reportType) === "needs_fact") return "needs_fact";
  return "stalled";
}

function reportOutcome(report: JsonObject): ReportOutcome {
  const reportType = text(report.reportType);
  // Legacy rows recorded gate rejections as tool_error; recover them by error kind.
  const errorKind = text(asObject(report.error).kind);
  if (reportType === "needs_rework" || /^(?:runner_validation_|acceptance_gate_failed$)/.test(errorKind)) return "needs_rework";
  if (reportType === "provider_error" || errorKind === "provider_error") return "provider_error";
  if (reportType === "tool_error" || Object.keys(asObject(report.error)).length > 0) return "tool_error";
  if (reportFailed(report)) return "needs_rework";
  const result = reportResult(report);
  const stopReason = reportStopReason(report, result);
  if (result === "exact") return "exact";
  if (result === "improved") return stopReason === "needs_fact" ? "improved_needs_fact" : "improved_stalled";
  return stopReason === "needs_fact" ? "no_progress_needs_fact" : "no_progress_stalled";
}

function reportMatchesFilter(report: JsonObject, filter: ReportFilter): boolean {
  if (filter === "all") return true;
  return reportOutcome(report) === filter;
}

function emptyReportCounts(): Record<ReportFilter, number> {
  return {
    all: 0,
    exact: 0,
    improved_stalled: 0,
    improved_needs_fact: 0,
    no_progress_stalled: 0,
    no_progress_needs_fact: 0,
    needs_rework: 0,
    tool_error: 0,
    provider_error: 0,
  };
}

function reportCountsForReports(reports: JsonObject[]): Record<ReportFilter, number> {
  const counts = emptyReportCounts();
  counts.all = reports.length;
  for (const report of reports) counts[reportOutcome(report)] += 1;
  return counts;
}

function reportTotalCounts(dashboard: Dashboard | null, loadedCounts: Record<ReportFilter, number>): Record<ReportFilter, number> {
  const summary = asObject(dashboard?.runSummary);
  const outcomeCounts = asObject(summary.reportOutcomeCounts);
  const counts = { ...loadedCounts };
  for (const id of reportFilterIds) {
    const sourceValue = id === "all" ? outcomeCounts.all ?? summary.totalReports : outcomeCounts[id];
    const parsed = Number(sourceValue);
    if (Number.isFinite(parsed)) counts[id] = parsed;
  }
  return counts;
}

function reportWindowText(filter: ReportFilter, loadedCounts: Record<ReportFilter, number>, totalCounts: Record<ReportFilter, number>, loadedAll: boolean): string {
  const loadedForFilter = loadedCounts[filter];
  const totalForFilter = totalCounts[filter];
  if (filter === "all") {
    if (loadedAll && loadedForFilter >= totalForFilter) return `${num(totalForFilter)} reports loaded`;
    return `${num(loadedForFilter)}/${num(totalForFilter)} reports recent`;
  }
  if (loadedAll && loadedForFilter >= totalForFilter) return `${num(totalForFilter)} matching reports loaded`;
  return `${num(loadedForFilter)}/${num(totalForFilter)} matching reports in ${loadedAll ? "loaded set" : `recent ${num(loadedCounts.all)}`}`;
}

function pageReportText(filter: ReportFilter, loadedCounts: Record<ReportFilter, number>, totalCounts: Record<ReportFilter, number>): string {
  const loadedForFilter = loadedCounts[filter];
  const totalForFilter = totalCounts[filter];
  if (loadedForFilter === totalForFilter) return `${num(loadedForFilter)} reports`;
  return `${num(loadedForFilter)}/${num(totalForFilter)} shown`;
}

function reportBorderClass(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "tool_error") return "border-l-down";
  if (outcome === "provider_error") return "border-l-warn";
  if (outcome === "needs_rework") return "border-l-warn";
  if (outcome === "exact") return "border-l-up";
  if (outcome === "improved_needs_fact" || outcome === "no_progress_needs_fact") return "border-l-warn";
  if (outcome === "improved_stalled") return "border-l-cyan";
  return "border-l-purple";
}

function reportFinishLabel(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "exact") return "exact";
  if (outcome === "improved_needs_fact") return "improved / needs";
  if (outcome === "improved_stalled") return "improved / stalled";
  if (outcome === "no_progress_needs_fact") return "no progress / needs";
  if (outcome === "no_progress_stalled") return "no progress / stalled";
  if (outcome === "tool_error") return "tool error";
  if (outcome === "provider_error") return "provider error";
  return "needs rework";
}

function reportOutcomeDescription(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "exact") return "Exact %: a measured percent score reached 100%.";
  if (outcome === "improved_needs_fact") return "Improved / Needs: positive percent score movement, then a specific missing fact/resource blocks the next move.";
  if (outcome === "improved_stalled") return "Improved / Stalled: positive percent score movement, then no evidence-backed next move remains.";
  if (outcome === "no_progress_needs_fact") return "No Progress / Needs: no positive score movement because a specific missing fact/resource blocks progress.";
  if (outcome === "no_progress_stalled") return "No Progress / Stalled: no positive score movement and no evidence-backed next move remains.";
  if (outcome === "tool_error") return "Tool Error: a tool, command, build, or parse infrastructure failure blocked trustworthy worker evaluation.";
  if (outcome === "provider_error") return "Provider Error: the LLM provider failed before the target was really attempted; the target requeued and worker spawns paused until a provider probe succeeded.";
  return "Needs Rework: the runner could not verify the return — claim and measurement disagree, or the return was inconsistent. The direction may still be promising; retry after updating facts or tooling.";
}

function stopReasonLabel(value: StopReason): string {
  if (value === "target_complete") return "target complete";
  if (value === "needs_fact") return "needs fact";
  return "no useful hypothesis";
}

function compactValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function statusText(report: JsonObject): string {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  const accepted = gate.accepted === false ? "gate failed" : gate.accepted === true ? "accepted" : "";
  const runner = text(validation.status);
  return [accepted, runner ? `validation ${runner}` : ""].filter(Boolean).join(" / ") || "-";
}

function reasonLines(report: JsonObject): string[] {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  const error = asObject(report.error);
  return [
    ...asArray(error.reasons),
    text(error.summary || error.kind),
    ...asArray(gate.reasons),
    ...asArray(validation.reasons),
  ]
    .map((item) => text(item))
    .filter(Boolean);
}

function attemptScoreText(attempt: JsonObject): string {
  const percent = attemptLooksPercent(attempt);
  return `${percent ? "pct" : "local"} ${scoreOrPercent(attempt.oldScore, percent)} -> ${scoreOrPercent(attempt.newScore, percent)} (${delta(attempt.delta)})`;
}

// Model-authored attempt notes never carry runner build evidence; label them as
// notes instead of implying a failed build.
function modelAttemptBuildLabel(attempt: JsonObject): { label: string; className: string; title: string } {
  if (attempt.compiled === true) {
    return { label: "compiled", className: "text-up", title: "The model reported this attempt as compiled." };
  }
  return {
    label: "model note",
    className: "text-dim",
    title: "Model-authored attempt description without runner-owned build evidence. See Runner Validation for deterministic build results.",
  };
}

function runnerAttemptBuildLabel(attempt: JsonObject): { label: string; className: string } {
  if (attempt.compiled === true) return { label: "compiled", className: "text-up" };
  if (text(attempt.status) === "build_failed") return { label: "build failed", className: "text-down" };
  return { label: "no build", className: "text-dim" };
}

function runnerAttemptScoreText(attempt: JsonObject): string {
  const oldScore = attemptNumber(attempt.oldScore, NaN);
  const newScore = attemptNumber(attempt.newScore, NaN);
  if (!Number.isFinite(oldScore) && !Number.isFinite(newScore)) return "-";
  return `pct ${scoreOrPercent(attempt.oldScore, true)} -> ${scoreOrPercent(attempt.newScore, true)} (${delta(attempt.delta)})`;
}

function MetaItem({ label, value, valueClassName = "" }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <span className="mr-1 text-faint">{label}</span>
      <span className={`break-words text-soft ${valueClassName}`}>{value}</span>
    </div>
  );
}

function traceEventTone(eventType: string): string {
  if (eventType === "runner_validation_passed" || eventType === "report_recorded") return "text-up";
  if (eventType === "runner_validation_rejected" || eventType === "repair_requested") return "text-warn";
  if (eventType === "acceptance_gate") return "text-soft";
  return "text-dim";
}

function traceEventLabel(event: JsonObject): string {
  const attemptIndex = Number(event.attemptIndex);
  const eventType = text(event.eventType).replace(/_/g, " ");
  return Number.isFinite(attemptIndex) ? `a${attemptIndex} ${eventType}` : eventType;
}

function traceScoreText(event: JsonObject): string {
  const score = asObject(event.score);
  const before = Number(score.before);
  const after = Number(score.after);
  if (!Number.isFinite(before) && !Number.isFinite(after)) return "";
  return `${scoreOrPercent(score.before, true)} -> ${scoreOrPercent(score.after, true)}${score.exact === true ? " (exact)" : ""}`;
}

// Chronological runner-owned lease timeline (activity.jsonl / return gates),
// only available once the full run details are loaded.
function TraceSection({ report, loadedAll }: { report: JsonObject; loadedAll: boolean }) {
  const activity = asObject(report.activity);
  const events = asArray(activity.recentEvents).map(asObject);
  if (events.length === 0) {
    if (loadedAll) return null;
    return <div className="mt-2 border-t border-line pt-2 text-[11px] text-faint">Load all reports to see the runner trace for this lease.</div>;
  }
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-dim" title="Runner-owned lease timeline from activity.jsonl: attempts, gate decisions, validation results, repairs.">
          Trace
        </span>
        <span className="text-[10px] text-faint">{text(activity.source) === "return_gates" ? "from return gates" : `${events.length} events`}</span>
      </div>
      <div className="grid gap-1 border-l-2 border-line pl-2.5">
        {events.map((event, index) => {
          const scoreText = traceScoreText(event);
          return (
            <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 text-xs leading-5" key={`${text(event.createdAt)}-${index}`}>
              <span className="whitespace-nowrap pt-px text-[10px] text-faint" title={text(event.createdAt)}>{clock(event.createdAt)}</span>
              <span className="min-w-0">
                <span className={`mr-1.5 font-semibold ${traceEventTone(text(event.eventType))}`}>{traceEventLabel(event)}</span>
                <span className="[overflow-wrap:anywhere] text-soft">{text(event.summary)}</span>
                {scoreText ? <span className="ml-1.5 whitespace-nowrap text-dim">{scoreText}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkerReports({
  dashboard,
  loadRunDetails,
  loadingRunDetails,
  runDetails,
}: Pick<DetailsRailProps, "dashboard" | "loadRunDetails" | "loadingRunDetails" | "runDetails">) {
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [page, setPage] = useState(0);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const recentReports = (dashboard?.reports || []).map(asObject);
  const fullReports = asArray(runDetails?.reports).map(asObject);
  const reports = fullReports.length > 0 ? fullReports : recentReports;
  const loadedCounts = reportCountsForReports(reports);
  const totalCounts = reportTotalCounts(dashboard, loadedCounts);
  const filteredReports = reports.filter((report) => reportMatchesFilter(report, filter));
  const pages = Math.max(1, Math.ceil(filteredReports.length / reportsPageSize));
  const safePage = Math.min(page, pages - 1);
  const visibleReports = filteredReports.slice(safePage * reportsPageSize, safePage * reportsPageSize + reportsPageSize);
  const loadedAll = fullReports.length > 0;

  if (reports.length === 0) return <div className="text-dim">No worker reports yet</div>;

  function selectFilter(nextFilter: ReportFilter) {
    setFilter(nextFilter);
    setPage(0);
    setExpandedReportId(null);
  }

  function selectPage(nextPage: number) {
    setPage(Math.max(0, Math.min(pages - 1, nextPage)));
    setExpandedReportId(null);
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-dim">
            {reportWindowText(filter, loadedCounts, totalCounts, loadedAll)}
          </span>
          <Button className="min-h-6 px-2 py-0.5" icon={<RefreshCw size={13} />} onClick={loadRunDetails} type="button">
            {loadingRunDetails ? "Loading" : loadedAll ? "Refresh All" : "Load All"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Worker report filters">
          {reportFilters.map((option) => {
            const active = filter === option.id;
            const loadedCount = loadedCounts[option.id];
            const count = totalCounts[option.id];
            const title = loadedCount === count ? option.description : `${option.description} Showing ${num(loadedCount)} of ${num(count)} loaded rows.`;
            return (
              <button
                aria-selected={active}
                className={`min-h-7 rounded-none border px-2 py-1 text-xs ${
                  active ? "border-line2 bg-raised text-fg" : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
                }`}
                key={option.id}
                onClick={() => selectFilter(option.id)}
                role="tab"
                title={title}
                type="button"
              >
                {option.label} <span className="text-faint">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-2">
          <Button
            className="h-7 min-w-7 px-0"
            disabled={safePage === 0}
            icon={<ChevronLeft size={13} />}
            onClick={() => selectPage(safePage - 1)}
            title="Previous report page"
            type="button"
          >
            <span className="sr-only">Previous</span>
          </Button>
          <span className="min-w-0 text-center text-xs text-dim">
            Page {safePage + 1} / {pages} <span className="text-faint">({pageReportText(filter, loadedCounts, totalCounts)})</span>
          </span>
          <Button
            className="h-7 min-w-7 px-0"
            disabled={safePage >= pages - 1}
            icon={<ChevronRight size={13} />}
            onClick={() => selectPage(safePage + 1)}
            title="Next report page"
            type="button"
          >
            <span className="sr-only">Next</span>
          </Button>
        </div>
      </div>
      <div className="grid max-h-[calc(100vh-190px)] gap-2 overflow-auto pr-1 max-[1180px]:max-h-[540px]">
        {visibleReports.map((report) => {
          const target = asObject(report.target);
          const attempts = asArray(report.attempts).map(asObject);
          const runnerAttempts = asArray(report.runnerAttempts).map(asObject);
          const writeSet = asArray(report.writeSet).map((item) => text(item)).filter(Boolean);
          const reasons = reasonLines(report);
          const reportDelta = reportScoreDelta(report);
          const reportId = text(report.id) || `${text(report.leaseId)}-${text(report.createdAt)}`;
          const expanded = expandedReportId === reportId;
          const title = text(target.symbol) || text(target.sourcePath) || text(report.leaseId, "worker report");
          const result = reportResult(report);
          const stopReason = reportStopReason(report, result);
          const neededFact = compactValue(report.neededFact);
          const nextRecommendation = text(report.nextRecommendation);
          return (
            <article className={`rounded-none border border-l-[3px] border-line ${reportBorderClass(report)} bg-card hover:bg-raised`} key={reportId}>
              <button
                aria-expanded={expanded}
                className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2 text-left"
                onClick={() => setExpandedReportId(expanded ? null : reportId)}
                title={expanded ? "Collapse report" : "Expand report"}
                type="button"
              >
                <span className="pt-0.5 text-dim">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="min-w-0">
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-fg" title={title}>
                    {title}
                  </span>
                  <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-path" title={text(target.sourcePath) || text(target.unit)}>
                    {text(target.sourcePath) || text(target.unit)}
                  </span>
                  <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim" title={text(report.summary)}>
                    {text(report.summary, "No summary recorded.")}
                  </span>
                </span>
                <span className="grid justify-items-end gap-1 text-[11px] text-dim">
                  <span className="border border-line2 bg-inset px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-soft" title={reportOutcomeDescription(report)}>
                    {reportFinishLabel(report)}
                  </span>
                  <span className={reportDelta > 0 ? "text-up" : "text-dim"}>{delta(reportDelta)}</span>
                  <span>{ago(report.createdAt)}</span>
                </span>
              </button>
              {expanded ? (
                <div className="border-t border-line px-3 pb-3 pt-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
                    <span>{reportTypeLabel(report.reportType)}</span>
                    <span>{ago(report.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-soft">{text(report.summary, "No summary recorded.")}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] max-[520px]:grid-cols-1">
                    <MetaItem label="result" value={result.replace("_", " ")} />
                    <MetaItem label="stop" value={stopReasonLabel(stopReason)} />
                    <MetaItem label="delta" value={delta(reportDelta)} valueClassName={reportDelta > 0 ? "text-up" : ""} />
                    <MetaItem label="worker" value={shortId(report.workerId)} />
                    <MetaItem label="lease" value={`${shortId(report.leaseId)} / ${text(report.leaseStatus, "-")}`} />
                    <MetaItem label="queue" value={text(report.queueStatus, "-")} />
                    <MetaItem label="gate" value={statusText(report)} />
                    <MetaItem label="attempts" value={num(attempts.length)} />
                  </div>
                  {neededFact ? <div className="mt-2 rounded-none border border-warn/40 bg-warn/5 p-2 text-xs leading-5 text-warn">needed fact: {neededFact}</div> : null}
                  {nextRecommendation ? <div className="mt-2 rounded-none border border-line bg-inset p-2 text-xs leading-5 text-soft">next: {nextRecommendation}</div> : null}
                  <TraceSection loadedAll={loadedAll} report={report} />
                  {runnerAttempts.length > 0 ? (
                    <div className="mt-2 border-t border-line pt-2">
                      <div className="mb-1 text-[11px] font-bold uppercase text-dim" title="Deterministic build + score evidence recorded by the runner for each validation attempt.">
                        Runner Validation
                      </div>
                      <div className="grid gap-1">
                        {runnerAttempts.slice(-3).map((attempt, index) => {
                          const build = runnerAttemptBuildLabel(attempt);
                          const attemptDelta = Number(attempt.delta ?? 0);
                          const attemptIndex = attemptNumber(attempt.attemptIndex, NaN);
                          return (
                            <div className="grid grid-cols-[72px_minmax(0,1fr)_minmax(120px,150px)] gap-2 text-xs max-[520px]:grid-cols-1" key={`${text(attempt.artifactPath)}-${index}`}>
                              <span className={build.className}>{build.label}</span>
                              <span className="min-w-0 [overflow-wrap:anywhere] text-soft" title={text(attempt.artifactPath)}>
                                {Number.isFinite(attemptIndex) ? `attempt ${attemptIndex} · ` : ""}
                                {text(attempt.status, "-").replace(/_/g, " ")}
                              </span>
                              <span className={`text-right max-[520px]:text-left ${attemptDelta > 0 ? "text-up" : "text-dim"}`}>
                                {runnerAttemptScoreText(attempt)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {attempts.length > 0 ? (
                    <div className="mt-2 border-t border-line pt-2">
                      <div className="mb-1 text-[11px] font-bold uppercase text-dim" title="Model-authored attempt narrative from the worker report. Score numbers here are claims, not runner evidence.">
                        Attempts (model)
                      </div>
                      <div className="grid gap-1">
                        {attempts.slice(0, 3).map((attempt, index) => {
                          const attemptDelta = Number(attempt.delta ?? 0);
                          const build = modelAttemptBuildLabel(attempt);
                          return (
                            <div className="grid grid-cols-[72px_minmax(0,1fr)_minmax(120px,150px)] gap-2 text-xs max-[520px]:grid-cols-1" key={`${text(attempt.artifactPath)}-${index}`}>
                              <span className={build.className} title={build.title}>{build.label}</span>
                              <span className="min-w-0 [overflow-wrap:anywhere] text-soft">{text(attempt.description, text(attempt.artifactPath, "attempt"))}</span>
                              <span className={`text-right max-[520px]:text-left ${attemptDelta > 0 ? "text-up" : "text-dim"}`}>
                                {attemptScoreText(attempt)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {writeSet.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {writeSet.slice(0, 4).map((path) => (
                        <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-none border border-line bg-inset px-1.5 py-0.5 text-[11px] text-dim" key={path} title={path}>
                          {path}
                        </span>
                      ))}
                      {writeSet.length > 4 ? <span className="px-1.5 py-0.5 text-[11px] text-dim">+{writeSet.length - 4}</span> : null}
                    </div>
                  ) : null}
                  {reasons.length > 0 ? <div className="mt-2 border-t border-line pt-2 text-xs leading-5 text-warn">{reasons.slice(0, 2).join(" / ")}</div> : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {filteredReports.length === 0 ? <div className="text-dim">No reports match this filter</div> : null}
      </div>
    </div>
  );
}

function RailDetails({ children, open, summary, onToggle }: { children: ReactNode; open?: boolean; summary: string; onToggle?: (open: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(open ?? false);
  return (
    <details
      className="border-b border-line p-3"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
        onToggle?.(event.currentTarget.open);
      }}
      open={isOpen}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

function RunTab({ dashboard, loadRunDetails, loadingRunDetails, runDetails }: Pick<DetailsRailProps, "dashboard" | "loadRunDetails" | "loadingRunDetails" | "runDetails">) {
  const run = asObject(dashboard?.status?.run);
  if (!run.id) {
    return <div className="p-3 text-dim">No active run</div>;
  }

  return (
    <>
      <RailDetails open summary="Worker Reports">
        <WorkerReports dashboard={dashboard} loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
      </RailDetails>
      <RailDetails summary="Full Run" onToggle={(open) => open && !runDetails && loadRunDetails()}>
        <RunDetailsPanel loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
      </RailDetails>
    </>
  );
}

const agentRoleOrder = ["worker", "knowledge-curator", "pr-review", "reconcile", "qa-repair"];
const agentSessionsPerRole = 8;

function sessionStatusTone(status: string): string {
  if (status === "succeeded") return "text-up";
  if (status === "failed") return "text-down";
  return "text-dim";
}

function lessonKindLabel(kind: string): string {
  if (kind === "worker_lesson") return "worker";
  if (kind === "pr_lesson") return "pr";
  if (kind === "source_update_proposal") return "proposal";
  return kind || "lesson";
}

function Callout({ children, tone }: { children: ReactNode; tone: "ok" | "warn" }) {
  return (
    <div className={`rounded-none border p-2 text-xs leading-5 ${tone === "ok" ? "border-line bg-inset text-soft" : "border-warn/40 bg-warn/5 text-warn"}`}>
      {children}
    </div>
  );
}

function AgentSessionGroup({ role, sessions, leaseSymbols }: { role: string; sessions: JsonObject[]; leaseSymbols: Map<string, string> }) {
  const [showAll, setShowAll] = useState(false);
  const succeeded = sessions.filter((session) => text(session.status) === "succeeded").length;
  const failed = sessions.filter((session) => text(session.status) === "failed").length;
  const visible = showAll ? sessions : sessions.slice(0, agentSessionsPerRole);
  return (
    <div className="border border-line bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-line bg-raised px-2.5 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-fg">{role.replace(/-/g, " ")}</span>
        <span className="text-[11px] text-dim">
          {num(sessions.length)} session{sessions.length === 1 ? "" : "s"}
          {succeeded > 0 ? <span className="ml-1.5 text-up">{num(succeeded)} ok</span> : null}
          {failed > 0 ? <span className="ml-1.5 text-down">{num(failed)} failed</span> : null}
        </span>
      </div>
      <div className="grid gap-0.5 p-1.5">
        {visible.map((session) => {
          const symbol = leaseSymbols.get(text(session.leaseId)) ?? "";
          return (
            <div
              className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-2 px-1 py-0.5 text-xs"
              key={text(session.id)}
              title={text(session.outputPath) || text(session.sessionFile)}
            >
              <span className={`font-semibold ${sessionStatusTone(text(session.status))}`}>{text(session.status, "-").replace(/_/g, " ")}</span>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">
                {symbol || text(session.model, "-")}
                {symbol ? <span className="ml-1.5 text-faint">{text(session.model)}</span> : null}
              </span>
              <span className="whitespace-nowrap text-[11px] text-dim" title={text(session.createdAt)}>{ago(session.createdAt)}</span>
            </div>
          );
        })}
        {sessions.length > agentSessionsPerRole ? (
          <button className="px-1 py-0.5 text-left text-[11px] text-dim hover:text-soft" onClick={() => setShowAll(!showAll)} type="button">
            {showAll ? "Show fewer" : `Show all ${num(sessions.length)}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function KnowledgeIntakePanel({ runDetails }: { runDetails: RunDetails | null }) {
  const intake = asObject(runDetails?.knowledgeIntake);
  const curatorRuns = asArray(intake.curatorRuns).map(asObject);
  const lessons = asArray(intake.recentLessons).map(asObject);
  const mergedPrs = asArray(intake.mergedPrUpdates).map(asObject);
  const sessions = asArray(runDetails?.sessions).map(asObject);
  const reports = asArray(runDetails?.reports).map(asObject);

  const lastReportAt = reports.reduce((latest, report) => {
    const at = text(report.createdAt);
    return at > latest ? at : latest;
  }, "");
  const lastIntakeAt = [
    ...sessions.filter((session) => text(session.role) === "knowledge-curator").map((session) => text(session.createdAt)),
    ...curatorRuns.map((run) => text(run.startedAt)),
  ].reduce((latest, at) => (at > latest ? at : latest), "");
  const intakeStale = Boolean(lastReportAt) && (!lastIntakeAt || lastIntakeAt < lastReportAt);

  return (
    <div className="grid gap-2">
      {lastReportAt ? (
        intakeStale ? (
          <Callout tone="warn">
            No knowledge intake recorded since the last worker report ({ago(lastReportAt)}). Run sync / kg-curate so the curator folds this run&apos;s learnings into the knowledge base.
          </Callout>
        ) : (
          <Callout tone="ok">
            Knowledge intake is current: latest curator activity {ago(lastIntakeAt)}, latest worker report {ago(lastReportAt)}.
          </Callout>
        )
      ) : null}

      <div className="border border-line bg-card">
        <div className="border-b border-line bg-raised px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-fg">Curator agent runs</div>
        <div className="grid gap-0.5 p-1.5">
          {curatorRuns.map((run) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 px-1 py-0.5 text-xs" key={text(run.id)} title={text(run.outputPath) || text(run.dir)}>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">{text(run.id)}</span>
              <span className="whitespace-nowrap text-[11px] text-dim">{ago(run.startedAt)}</span>
            </div>
          ))}
          {curatorRuns.length === 0 ? <div className="px-1 py-0.5 text-xs text-dim">No curator agent runs recorded in this state dir</div> : null}
        </div>
      </div>

      <div className="border border-line bg-card">
        <div className="border-b border-line bg-raised px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-fg">Merged PR intake</div>
        <div className="grid gap-0.5 p-1.5">
          {mergedPrs.map((row) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 px-1 py-0.5 text-xs" key={`pr-${text(row.pr)}`}>
              <span className="min-w-0 text-soft">
                PR #{num(row.pr)} <span className="text-faint">{num(row.touchedFiles)} file{Number(row.touchedFiles) === 1 ? "" : "s"}</span>
              </span>
              <span className="whitespace-nowrap text-[11px] text-dim" title={`merged ${text(row.mergedAt)} / indexed ${text(row.indexedAt)}`}>
                indexed {ago(row.indexedAt)}
              </span>
            </div>
          ))}
          {mergedPrs.length === 0 ? <div className="px-1 py-0.5 text-xs text-dim">No merged PRs ingested into the graph yet</div> : null}
        </div>
      </div>

      <div className="border border-line bg-card">
        <div className="border-b border-line bg-raised px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-fg">Curated lessons</div>
        <div className="grid gap-0.5 p-1.5">
          {lessons.map((lesson) => (
            <div className="grid grid-cols-[56px_minmax(0,1fr)] items-baseline gap-2 px-1 py-0.5 text-xs" key={text(lesson.id)} title={`${text(lesson.title)}\n${text(lesson.sourcePath)}\nstatus: ${text(lesson.status)} / confidence ${text(lesson.confidence)}`}>
              <span className={`text-[10px] font-semibold uppercase ${text(lesson.status) === "accepted" ? "text-up" : "text-dim"}`}>{lessonKindLabel(text(lesson.kind))}</span>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">{text(lesson.title, text(lesson.id))}</span>
            </div>
          ))}
          {lessons.length === 0 ? <div className="px-1 py-0.5 text-xs text-dim">No curated lessons in the enrichment log yet</div> : null}
        </div>
      </div>
    </div>
  );
}

function AgentsTab({ loadRunDetails, loadingRunDetails, runDetails }: Pick<DetailsRailProps, "loadRunDetails" | "loadingRunDetails" | "runDetails">) {
  const sessions = asArray(runDetails?.sessions).map(asObject);
  const leases = asArray(runDetails?.leases).map(asObject);
  const leaseSymbols = new Map(leases.map((lease) => [text(lease.id), text(lease.symbol)]));
  const grouped = new Map<string, JsonObject[]>();
  for (const session of sessions) {
    const role = text(session.role, "unknown");
    grouped.set(role, [...(grouped.get(role) ?? []), session]);
  }
  const roles = [...agentRoleOrder.filter((role) => grouped.has(role)), ...[...grouped.keys()].filter((role) => !agentRoleOrder.includes(role))];

  if (!runDetails) {
    return <div className="p-3 text-dim">{loadingRunDetails ? "Loading agent sessions..." : "No run details loaded yet"}</div>;
  }

  return (
    <>
      <RailDetails open summary="Agent Sessions">
        <div className="grid gap-2">
          <div className="flex min-h-7 items-center justify-between gap-2">
            <span className="text-dim">{num(sessions.length)} sessions across {num(roles.length)} role{roles.length === 1 ? "" : "s"}</span>
            <Button className="min-h-6 px-2 py-0.5" icon={<RefreshCw size={13} />} onClick={loadRunDetails} type="button">
              {loadingRunDetails ? "Loading" : "Refresh"}
            </Button>
          </div>
          {roles.map((role) => (
            <AgentSessionGroup key={role} leaseSymbols={leaseSymbols} role={role} sessions={grouped.get(role) ?? []} />
          ))}
          {roles.length === 0 ? <div className="text-dim">No agent sessions recorded for this run</div> : null}
        </div>
      </RailDetails>
      <RailDetails open summary="Knowledge Intake">
        <KnowledgeIntakePanel runDetails={runDetails} />
      </RailDetails>
    </>
  );
}

export function DetailsRail({
  collapsed,
  dashboard,
  loadRunDetails,
  loadingRunDetails,
  onCollapsedChange,
  onResizeEnd,
  onResizeStart,
  onWidthChange,
  runDetails,
  tabRequest,
}: DetailsRailProps) {
  const [activeTab, setActiveTab] = useState<DetailsTab>(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get("details");
      return requested === "run" || requested === "agents" || requested === "logs" ? requested : "run";
    } catch {
      return "run";
    }
  });

  // The Agents tab is built from full run details; fetch them on first open.
  useEffect(() => {
    if (activeTab === "agents" && !runDetails && !loadingRunDetails) loadRunDetails();
  }, [activeTab, loadRunDetails, loadingRunDetails, runDetails]);

  // Parent-driven tab switch (e.g. a long operation starts → show Logs).
  useEffect(() => {
    if (tabRequest) setActiveTab(tabRequest.tab);
  }, [tabRequest]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    onResizeStart();
    const onMove = (moveEvent: PointerEvent) => onWidthChange(window.innerWidth - moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onResizeEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <aside className={`details-rail ${collapsed ? "details-rail-collapsed" : "details-rail-open"} relative grid min-w-0 border-l border-line2 bg-panel ${collapsed ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"} overflow-hidden max-[1180px]:col-span-2 max-[1180px]:border-t max-[780px]:block`}>
      {!collapsed ? <div aria-hidden className="details-rail-resize-handle" onPointerDown={startResize} title="Drag to resize" /> : null}
      <div className={`details-rail-tab z-10 flex items-center gap-2 border-b border-line bg-raised px-2 py-1.5 ${collapsed ? "h-full flex-col justify-start" : "sticky top-0 min-h-[42px]"} max-[1180px]:static max-[1180px]:h-[42px] max-[1180px]:flex-row`}>
        <Button
          aria-expanded={!collapsed}
          className="h-7 min-w-7 px-0"
          icon={collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? "Show details" : "Hide details"}
          type="button"
        >
          <span className="sr-only">{collapsed ? "Show" : "Hide"}</span>
        </Button>
        <span className={`text-[11px] font-bold uppercase tracking-[0.14em] text-soft ${collapsed ? "[writing-mode:vertical-rl] rotate-180" : ""} max-[1180px]:[writing-mode:initial] max-[1180px]:rotate-0`}>Details</span>
      </div>
      <div className={`details-rail-content ${collapsed ? "hidden" : ""} grid min-h-0 grid-rows-[auto_minmax(0,1fr)]`}>
        <div className="flex gap-1.5 border-b border-line bg-raised p-2" role="tablist" aria-label="Details rail">
          <TabButton active={activeTab === "run"} onClick={() => setActiveTab("run")}>
            Run
          </TabButton>
          <TabButton active={activeTab === "agents"} onClick={() => setActiveTab("agents")}>
            Agents
          </TabButton>
          <TabButton active={activeTab === "logs"} onClick={() => setActiveTab("logs")}>
            Logs
          </TabButton>
        </div>
        <div className="min-h-0 overflow-auto" role="tabpanel">
          {activeTab === "logs" ? (
            <section className="p-3">
              <OperationActivity dashboard={dashboard} />
              <LogLines dashboard={dashboard} />
            </section>
          ) : activeTab === "run" ? (
            <RunTab dashboard={dashboard} loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
          ) : (
            <AgentsTab loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
          )}
        </div>
      </div>
    </aside>
  );
}
