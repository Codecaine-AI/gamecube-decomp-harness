import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { asArray, asObject, ago, clock, delta, num, scoreOrPercent, scorePairLooksPercent, shortId, text } from "../lib/format";
import type { Dashboard, JsonObject, RunDetails } from "../types";
import { Button } from "./primitives";

interface DetailsRailProps {
  collapsed: boolean;
  dashboard: Dashboard | null;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  runDetails: RunDetails | null;
}

function LogLines({ dashboard }: { dashboard: Dashboard | null }) {
  const logs = asArray(asObject(dashboard?.process).logs).map(asObject).slice(-120);
  if (logs.length === 0) return <pre className="min-h-44 max-h-[520px] overflow-auto rounded-md border border-[#292d2b] bg-[#101110] p-2 text-[#cfd4cf] whitespace-pre-wrap" />;
  return (
    <pre className="min-h-44 max-h-[520px] overflow-auto rounded-md border border-[#292d2b] bg-[#101110] p-2 text-[#cfd4cf] whitespace-pre-wrap">
      {logs.map((line, index) => (
        <span key={index}>
          <span className={line.stream === "stderr" ? "text-[#ff8f8f]" : line.stream === "stdout" ? "text-[#b8dabf]" : "text-[#969b97]"}>[{text(line.stream)}]</span> {text(line.text)}
          {"\n"}
        </span>
      ))}
    </pre>
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
    ["director", summary.directorCycles],
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
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#969b97]">{runDetails?.generatedAt ? `loaded ${clock(runDetails.generatedAt)}` : ""}</span>
      </div>
      {runDetails ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {facts.map(([label, value]) => (
              <div className="rounded-[5px] border border-[#292d2b] bg-[#151715] px-2 py-1" key={label}>
                <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] text-[#45e05e]">{num(value)}</strong>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#969b97]">{label}</span>
              </div>
            ))}
          </div>
          <div className="grid max-h-[520px] gap-1.5 overflow-auto">
            {timeline.map((item) => (
              <article className={`rounded-md border border-l-[3px] border-[#292d2b] bg-[#151715] p-2 ${text(item.kind) === "worker_report" ? "border-l-[#45b8d8]" : text(item.kind) === "event" ? "border-l-[#d7a64b]" : text(item.kind) === "pi_session" ? "border-l-[#45e05e]" : "border-l-[#8a7ad8]"}`} key={`${text(item.kind)}-${text(item.id)}-${text(item.at)}`}>
                <div className="flex justify-between gap-2 text-[11px] text-[#969b97]">
                  <span>{text(item.kind)}</span>
                  <span>{clock(item.at)}</span>
                </div>
                <strong className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap" title={text(item.title)}>{text(item.title) || text(item.id, "-")}</strong>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[#969b97]" title={text(item.path)}>{text(item.path)}</div>
                <div className="text-[#969b97]">
                  {text(item.detail)}
                  {Number(item.delta || 0) > 0 ? ` / delta ${delta(item.delta)}` : ""}
                  {Number(item.exactMatches || 0) > 0 ? ` / exact ${num(item.exactMatches)}` : ""}
                </div>
              </article>
            ))}
            {timeline.length === 0 ? <div className="text-[#969b97]">No timeline entries</div> : null}
          </div>
        </>
      ) : (
        <div className="text-[#969b97]">Not loaded</div>
      )}
    </>
  );
}

type ReportOutcome = "exact" | "improved_stalled" | "improved_needs_fact" | "no_progress_stalled" | "no_progress_needs_fact" | "failed";
type ReportFilter = "all" | ReportOutcome;
type ReportResult = "exact" | "improved" | "no_progress";
type StopReason = "target_complete" | "needs_fact" | "no_useful_hypothesis";

const reportsPageSize = 8;

const reportFilters: Array<{ description: string; id: ReportFilter; label: string }> = [
  { id: "all", label: "All", description: "Every worker report in this run or recent window." },
  { id: "exact", label: "Exact %", description: "Worker report with percent score movement to 100%." },
  { id: "improved_stalled", label: "Improved / Stalled", description: "Positive percent score movement, then no evidence-backed next move." },
  { id: "improved_needs_fact", label: "Improved / Needs", description: "Positive percent score movement, then a specific missing fact/resource blocks the next move." },
  { id: "no_progress_stalled", label: "No Progress / Stalled", description: "No positive score movement and no evidence-backed next move." },
  { id: "no_progress_needs_fact", label: "No Progress / Needs", description: "No positive score movement because a specific missing fact/resource blocks progress." },
  { id: "failed", label: "Failed", description: "The report failed the acceptance gate or runner validation." },
];
const reportFilterIds: ReportFilter[] = reportFilters.map((option) => option.id);

function reportTypeLabel(value: unknown): string {
  const reportType = text(value);
  if (reportType === "score_candidate") return "score candidate";
  if (reportType === "needs_fact") return "needs fact";
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

function reportScoreDelta(report: JsonObject): number {
  return positivePercentAttempts(report).reduce((sum, attempt) => sum + Math.max(0, attemptNumber(attempt.delta, 0)), 0);
}

function reportHasExactAttempt(report: JsonObject): boolean {
  return asArray(report.attempts)
    .map(asObject)
    .some((attempt) => attemptLooksPercent(attempt) && attemptNumber(attempt.oldScore) < 99.99999 && attemptNumber(attempt.newScore) >= 99.99999);
}

function reportFailed(report: JsonObject): boolean {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  return gate.accepted === false || text(validation.status) === "failed";
}

function reportResult(report: JsonObject): ReportResult {
  const explicit = text(report.result);
  if (reportHasExactAttempt(report)) return "exact";
  if (explicit === "no_progress") return explicit;
  if (explicit === "exact" || explicit === "improved") return reportScoreDelta(report) > 0 ? "improved" : "no_progress";
  if (reportScoreDelta(report) > 0) return "improved";
  return "no_progress";
}

function reportStopReason(report: JsonObject, result = reportResult(report)): StopReason {
  const explicit = text(report.stopReason);
  if (explicit === "target_complete" || explicit === "needs_fact" || explicit === "no_useful_hypothesis") return explicit;
  if (result === "exact") return "target_complete";
  if (text(report.reportType) === "needs_fact") return "needs_fact";
  return "no_useful_hypothesis";
}

function reportOutcome(report: JsonObject): ReportOutcome {
  if (reportFailed(report)) return "failed";
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
    failed: 0,
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
  if (outcome === "failed") return "border-l-[#ff8f8f]";
  if (outcome === "exact") return "border-l-[#45e05e]";
  if (outcome === "improved_needs_fact" || outcome === "no_progress_needs_fact") return "border-l-[#d7a64b]";
  if (outcome === "improved_stalled") return "border-l-[#45b8d8]";
  return "border-l-[#8a7ad8]";
}

function reportFinishLabel(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "exact") return "exact";
  if (outcome === "improved_needs_fact") return "improved / needs";
  if (outcome === "improved_stalled") return "improved / stalled";
  if (outcome === "no_progress_needs_fact") return "no progress / needs";
  if (outcome === "no_progress_stalled") return "no progress / stalled";
  return "failed";
}

function reportOutcomeDescription(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "exact") return "Exact %: a measured percent score reached 100%.";
  if (outcome === "improved_needs_fact") return "Improved / Needs: positive percent score movement, then a specific missing fact/resource blocks the next move.";
  if (outcome === "improved_stalled") return "Improved / Stalled: positive percent score movement, then no evidence-backed next move remains.";
  if (outcome === "no_progress_needs_fact") return "No Progress / Needs: no positive score movement because a specific missing fact/resource blocks progress.";
  if (outcome === "no_progress_stalled") return "No Progress / Stalled: no positive score movement and no evidence-backed next move remains.";
  return "Failed: the report failed the acceptance gate or runner validation.";
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
  return [...asArray(gate.reasons), ...asArray(validation.reasons)].map((item) => text(item)).filter(Boolean);
}

function attemptScoreText(attempt: JsonObject): string {
  const percent = attemptLooksPercent(attempt);
  return `${percent ? "pct" : "local"} ${scoreOrPercent(attempt.oldScore, percent)} -> ${scoreOrPercent(attempt.newScore, percent)} (${delta(attempt.delta)})`;
}

function MetaItem({ label, value, valueClassName = "" }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <span className="mr-1 text-[#737873]">{label}</span>
      <span className={`break-words text-[#c8ccc8] ${valueClassName}`}>{value}</span>
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

  if (reports.length === 0) return <div className="text-[#969b97]">No worker reports yet</div>;

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
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#969b97]">
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
                className={`min-h-7 rounded-[5px] border px-2 py-1 text-xs ${
                  active ? "border-[#2a7d38] bg-[#152018] text-[#45e05e]" : "border-[#292d2b] bg-[#171918] text-[#969b97] hover:bg-[#222624]"
                }`}
                key={option.id}
                onClick={() => selectFilter(option.id)}
                role="tab"
                title={title}
                type="button"
              >
                {option.label} <span className="text-[#737873]">{count}</span>
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
          <span className="min-w-0 text-center text-xs text-[#969b97]">
            Page {safePage + 1} / {pages} <span className="text-[#737873]">({pageReportText(filter, loadedCounts, totalCounts)})</span>
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
            <article className={`rounded-md border border-l-[3px] border-[#292d2b] ${reportBorderClass(report)} bg-[#171918] hover:bg-[#202421]`} key={reportId}>
              <button
                aria-expanded={expanded}
                className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2 text-left"
                onClick={() => setExpandedReportId(expanded ? null : reportId)}
                title={expanded ? "Collapse report" : "Expand report"}
                type="button"
              >
                <span className="pt-0.5 text-[#969b97]">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="min-w-0">
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-[#e2e5e2]" title={title}>
                    {title}
                  </span>
                  <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#b5d4e8]" title={text(target.sourcePath) || text(target.unit)}>
                    {text(target.sourcePath) || text(target.unit)}
                  </span>
                  <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#969b97]" title={text(report.summary)}>
                    {text(report.summary, "No summary recorded.")}
                  </span>
                </span>
                <span className="grid justify-items-end gap-1 text-[11px] text-[#969b97]">
                  <span className="rounded-full border border-[#363a38] bg-[#101110] px-2 py-0.5 uppercase text-[#c0c5c1]" title={reportOutcomeDescription(report)}>
                    {reportFinishLabel(report)}
                  </span>
                  <span className={reportDelta > 0 ? "text-[#45e05e]" : "text-[#969b97]"}>{delta(reportDelta)}</span>
                  <span>{ago(report.createdAt)}</span>
                </span>
              </button>
              {expanded ? (
                <div className="border-t border-[#292d2b] px-3 pb-3 pt-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#969b97]">
                    <span>{reportTypeLabel(report.reportType)}</span>
                    <span>{ago(report.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-[#c8ccc8]">{text(report.summary, "No summary recorded.")}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] max-[520px]:grid-cols-1">
                    <MetaItem label="result" value={result.replace("_", " ")} />
                    <MetaItem label="stop" value={stopReasonLabel(stopReason)} />
                    <MetaItem label="delta" value={delta(reportDelta)} valueClassName={reportDelta > 0 ? "text-[#45e05e]" : ""} />
                    <MetaItem label="worker" value={shortId(report.workerId)} />
                    <MetaItem label="lease" value={`${shortId(report.leaseId)} / ${text(report.leaseStatus, "-")}`} />
                    <MetaItem label="queue" value={text(report.queueStatus, "-")} />
                    <MetaItem label="gate" value={statusText(report)} />
                    <MetaItem label="attempts" value={num(attempts.length)} />
                  </div>
                  {neededFact ? <div className="mt-2 rounded-[5px] border border-[#3e3420] bg-[#17140f] p-2 text-xs leading-5 text-[#d7a64b]">needed fact: {neededFact}</div> : null}
                  {nextRecommendation ? <div className="mt-2 rounded-[5px] border border-[#292d2b] bg-[#101110] p-2 text-xs leading-5 text-[#c8ccc8]">next: {nextRecommendation}</div> : null}
                  {attempts.length > 0 ? (
                    <div className="mt-2 border-t border-[#292d2b] pt-2">
                      <div className="mb-1 text-[11px] font-bold uppercase text-[#969b97]">Attempts</div>
                      <div className="grid gap-1">
                        {attempts.slice(0, 3).map((attempt, index) => {
                          const attemptDelta = Number(attempt.delta ?? 0);
                          return (
                            <div className="grid grid-cols-[72px_minmax(0,1fr)_minmax(120px,150px)] gap-2 text-xs max-[520px]:grid-cols-1" key={`${text(attempt.artifactPath)}-${index}`}>
                              <span className={attempt.compiled === true ? "text-[#45e05e]" : "text-[#d7a64b]"}>{attempt.compiled === true ? "compiled" : "not built"}</span>
                              <span className="min-w-0 [overflow-wrap:anywhere] text-[#c8ccc8]">{text(attempt.description, text(attempt.artifactPath, "attempt"))}</span>
                              <span className={`text-right max-[520px]:text-left ${attemptDelta > 0 ? "text-[#45e05e]" : "text-[#969b97]"}`}>
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
                        <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] border border-[#292d2b] bg-[#101110] px-1.5 py-0.5 text-[11px] text-[#969b97]" key={path} title={path}>
                          {path}
                        </span>
                      ))}
                      {writeSet.length > 4 ? <span className="px-1.5 py-0.5 text-[11px] text-[#969b97]">+{writeSet.length - 4}</span> : null}
                    </div>
                  ) : null}
                  {reasons.length > 0 ? <div className="mt-2 border-t border-[#292d2b] pt-2 text-xs leading-5 text-[#d7a64b]">{reasons.slice(0, 2).join(" / ")}</div> : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {filteredReports.length === 0 ? <div className="text-[#969b97]">No reports match this filter</div> : null}
      </div>
    </div>
  );
}

function RailDetails({ children, open, summary, onToggle }: { children: ReactNode; open?: boolean; summary: string; onToggle?: (open: boolean) => void }) {
  return (
    <details className="border-b border-[#292d2b] p-3" defaultOpen={open} onToggle={(event) => onToggle?.(event.currentTarget.open)}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

export function DetailsRail({ collapsed, dashboard, loadRunDetails, loadingRunDetails, onCollapsedChange, runDetails }: DetailsRailProps) {
  return (
    <aside className={`details-rail ${collapsed ? "details-rail-collapsed" : "details-rail-open"} grid min-w-0 border-l border-[#363a38] bg-[#1d1f1e] ${collapsed ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"} overflow-hidden max-[1180px]:col-span-2 max-[1180px]:border-t max-[780px]:block`}>
      <div className={`details-rail-tab z-10 flex items-center gap-2 border-b border-[#292d2b] bg-[#181a19] px-2 py-1.5 ${collapsed ? "h-full flex-col justify-start" : "sticky top-0 min-h-[42px]"} max-[1180px]:static max-[1180px]:h-[42px] max-[1180px]:flex-row`}>
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
        <span className={`text-xs font-bold uppercase text-[#c0c5c1] ${collapsed ? "[writing-mode:vertical-rl] rotate-180" : ""} max-[1180px]:[writing-mode:initial] max-[1180px]:rotate-0`}>Reports</span>
      </div>
      <div className={`details-rail-content ${collapsed ? "hidden" : ""} min-h-0 overflow-auto`}>
        <RailDetails open summary="Worker Reports">
          <WorkerReports dashboard={dashboard} loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
        </RailDetails>
        <RailDetails summary="Full Run" onToggle={(open) => open && !runDetails && loadRunDetails()}>
          <RunDetailsPanel loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
        </RailDetails>
        <RailDetails summary="Logs"><LogLines dashboard={dashboard} /></RailDetails>
      </div>
    </aside>
  );
}
