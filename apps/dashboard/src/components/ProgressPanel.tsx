import { asArray, asObject, clock, delta, duration, numberValue, pct, shortId, text, whole, type Dashboard, type JsonObject } from "@decomp-orchestrator/ui-contract";
import { PanelTitle, Pill } from "./primitives";

const metricSpecs = [
  { key: "complete_code_percent", label: "Complete code", kind: "percent" },
  { key: "matched_functions_percent", label: "Matched funcs", kind: "percent" },
  { key: "fuzzy_match_percent", label: "Fuzzy match", kind: "percent" },
  { key: "complete_units", label: "Complete units", kind: "units" },
];

function valueForMetric(spec: (typeof metricSpecs)[number], measures: JsonObject): string {
  if (spec.kind === "units") return `${whole(measures.complete_units)} / ${whole(measures.total_units)}`;
  return pct(measures[spec.key]);
}

function deltaForMetric(spec: (typeof metricSpecs)[number], startMeasures: JsonObject, currentMeasures: JsonObject): string {
  const start = Number(startMeasures[spec.key]);
  const now = Number(currentMeasures[spec.key]);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return "n/a";
  if (spec.kind === "units") return `${now - start >= 0 ? "+" : ""}${Math.round(now - start)}`;
  return `${now - start >= 0 ? "+" : ""}${(now - start).toFixed(3)}`;
}

function generatedDetail(value: unknown, fallback: string): string {
  if (!value) return fallback;
  return `at ${new Date(String(value)).toLocaleTimeString()}`;
}

function trustedReport(dashboard: Dashboard | null): JsonObject {
  return asObject(dashboard?.trustedReport);
}

function trustedReady(dashboard: Dashboard | null): boolean {
  return trustedReport(dashboard).status === "ready";
}

function agoText(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function trustedDetail(dashboard: Dashboard | null): string {
  const report = trustedReport(dashboard);
  if (report.status === "ready") {
    if (!report.generatedAt) return text(report.source, "report ready");
    const generatedAt = new Date(String(report.generatedAt)).getTime();
    const runCreatedAt = dashboard?.status?.run ? new Date(String(asObject(dashboard.status.run).createdAt)).getTime() : 0;
    const lastReportAt = dashboard?.runSummary?.lastReportAt ? new Date(String(dashboard.runSummary.lastReportAt)).getTime() : 0;
    if (Number.isFinite(generatedAt) && Number.isFinite(runCreatedAt) && runCreatedAt > generatedAt) return "stale: before run";
    if (Number.isFinite(generatedAt) && Number.isFinite(lastReportAt) && lastReportAt > generatedAt) return "stale: before latest worker";
    return `generated ${agoText(report.generatedAt)} ago`;
  }
  if (report.status === "stale") return text(report.staleReason, "report is stale for this run");
  if (report.status === "parse_error") return "report parse error";
  return "report_changes missing";
}

function progressDetail(dashboard: Dashboard | null, report: JsonObject): string {
  if (trustedReady(dashboard)) return generatedDetail(report.generatedAt, "local report");
  return trustedDetail(dashboard);
}

function processPillState(dashboard: Dashboard | null): string {
  const proc = asObject(dashboard?.process);
  const saved = asArray(proc.knownProcesses).map(asObject);
  const display = proc.pid ? proc : saved.find((item) => item.alive === true) || {};
  const detached = !proc.pid && display.alive === true;
  const savedState = text(display.state);
  if (proc.state && proc.state !== "idle") return text(proc.state);
  if (detached && savedState) return savedState;
  if (detached) return "detached";
  return savedState || "idle";
}

function RunFact({ label, title, value, valueClassName = "" }: { label: string; title?: string; value: string; valueClassName?: string }) {
  return (
    <div className="grid min-h-6 grid-cols-[70px_minmax(0,1fr)] items-baseline gap-2">
      <span className="text-[11px] uppercase text-[#969b97]">{label}</span>
      <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[#cfd4d0] ${valueClassName}`} title={title ?? value}>
        {value}
      </span>
    </div>
  );
}

function RunCounters({ dashboard, streamState }: { dashboard: Dashboard | null; streamState: string }) {
  const run = asObject(dashboard?.status?.run);
  const status = asObject(dashboard?.status);
  const summary = asObject(dashboard?.runSummary);
  const runId = text(run.id);
  const processState = processPillState(dashboard);
  const counters: Array<[string, unknown]> = [
    ["elapsed", run.id ? duration(summary.elapsedMs) : "-"],
    ["active", status.activeLeases],
    ["queued", status.queued],
    ["reports", status.workerReports],
  ];
  return (
    <div className="mt-2.5 overflow-hidden rounded-md border border-[#292d2b]">
      <div className="bg-[#181a19] px-2 py-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-base text-[#e2e5e2]">{runId ? `Run ${shortId(runId)}` : "No run"}</strong>
            <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#969b97]" title={runId}>
              {runId || "No run rows in state"}
            </span>
          </div>
          <Pill state={processState} />
        </div>
        <div className="mt-2 grid gap-1">
          <RunFact label="Status" value={text(run.status, runId ? "-" : "none")} />
          <RunFact label="Stream" value={text(streamState, "-")} valueClassName="uppercase" />
          <RunFact label="Created" value={run.createdAt ? clock(run.createdAt) : "-"} />
        </div>
      </div>
      {counters.map(([label, value]) => (
        <div className="grid min-h-[30px] grid-cols-[minmax(80px,1fr)_minmax(86px,auto)] items-baseline gap-2 border-t border-[#292d2b] bg-[#181a19] px-2 py-1 first:border-t-0" key={label}>
          <span className="text-[11px] uppercase text-[#969b97]">{label}</span>
          <strong className="text-right text-base text-[#e2e5e2]">{typeof value === "number" ? String(value) : String(value ?? "-")}</strong>
        </div>
      ))}
    </div>
  );
}

export function ProgressPanel({ dashboard, statusMessage, streamState }: { dashboard: Dashboard | null; statusMessage: string; streamState: string }) {
  const run = asObject(dashboard?.status?.run);
  const initial = asObject(asObject(dashboard?.initial).measures);
  const current = asObject(asObject(dashboard?.current).measures);
  const report = trustedReport(dashboard);
  const reportMeasures = asObject(report.measures);
  const matchedStart = Number(initial.matched_code_percent);
  const matchedNow = Number(current.matched_code_percent);
  const matchedDelta = Number.isFinite(matchedStart) && Number.isFinite(matchedNow) ? matchedNow - matchedStart : 0;
  const reportReady = trustedReady(dashboard);
  const reportStart = reportReady ? pct(reportMeasures.matchedCodePercentFrom) : pct(matchedStart);
  const reportEnd = reportReady ? pct(reportMeasures.matchedCodePercentTo) : pct(matchedNow);
  const reportDelta = reportReady ? numberValue(reportMeasures.matchedCodePercentDelta) : matchedDelta;

  return (
    <div className="grid items-start border-b border-[#292d2b] min-[1180px]:grid-cols-[minmax(620px,1fr)_minmax(210px,260px)]">
      <section className="h-full border-b border-[#292d2b] p-3 min-[1180px]:border-r min-[1180px]:border-b-0">
        <div className="flex justify-between gap-3">
          <div>
            <PanelTitle>Progress</PanelTitle>
            <div className={`${run.id && !statusMessage ? "hidden" : ""} text-[#969b97]`}>{statusMessage || "No run rows in state"}</div>
          </div>
        </div>
        <div className="mt-2.5 overflow-hidden rounded-md border border-[#292d2b]">
          <div className="grid min-h-[38px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-[#181a19] px-2.5 py-2 max-[780px]:grid-cols-1">
            <span className="text-[11px] uppercase text-[#969b97]">Report</span>
            <div className="flex min-w-0 items-baseline justify-center gap-2 max-[780px]:flex-wrap max-[780px]:justify-start">
              <span className="inline-flex min-w-0 items-baseline gap-1.5">
                <small className="text-[11px] text-[#969b97]">start</small>
                <strong className="text-lg text-[#45e05e]">{reportStart}</strong>
              </span>
              <span className="text-[#969b97]">-&gt;</span>
              <span className="inline-flex min-w-0 items-baseline gap-1.5">
                <small className="text-[11px] text-[#969b97]">end</small>
                <strong className="text-lg text-[#45e05e]">{reportEnd}</strong>
              </span>
              <span className={Math.abs(reportDelta) < 0.0005 ? "text-[#969b97]" : "text-[#45b8d8]"}>{delta(reportDelta)}</span>
            </div>
            <small className="overflow-hidden text-ellipsis whitespace-nowrap text-right text-[11px] text-[#969b97] max-[780px]:whitespace-normal max-[780px]:text-left">{progressDetail(dashboard, report)}</small>
          </div>
        </div>
        <div className="mt-2 overflow-hidden rounded-md border border-[#292d2b] max-[560px]:overflow-x-auto">
          <div className="grid min-h-[30px] grid-cols-[minmax(130px,1fr)_112px_112px_86px] gap-2 bg-[#202321] px-2 py-1 text-[11px] text-[#969b97] max-[780px]:min-w-[420px] max-[780px]:grid-cols-[minmax(108px,1fr)_86px_86px_72px]">
            <span>Metric</span>
            <span className="text-right">Start</span>
            <span className="text-right">Now</span>
            <span className="text-right">Delta</span>
          </div>
          {metricSpecs.map((spec) => {
            const start = Number(initial[spec.key]);
            const now = Number(current[spec.key]);
            const diff = Number.isFinite(start) && Number.isFinite(now) ? now - start : 0;
            return (
              <div className="grid min-h-[30px] grid-cols-[minmax(130px,1fr)_112px_112px_86px] gap-2 border-t border-[#292d2b] bg-[#181a19] px-2 py-1 max-[780px]:min-w-[420px] max-[780px]:grid-cols-[minmax(108px,1fr)_86px_86px_72px]" key={spec.key}>
                <div className="text-[#c0c5c1]">{spec.label}</div>
                <div className="text-right text-[#969b97]">{valueForMetric(spec, initial)}</div>
                <div className="text-right text-[#45e05e]">{valueForMetric(spec, current)}</div>
                <div className={`text-right ${Math.abs(diff) < 0.00001 ? "text-[#969b97]" : "text-[#45b8d8]"}`}>{deltaForMetric(spec, initial, current)}</div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="h-full p-3">
        <PanelTitle>Run</PanelTitle>
        <RunCounters dashboard={dashboard} streamState={streamState} />
      </section>
    </div>
  );
}
