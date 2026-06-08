import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { asArray, asObject, ago, clock, delta, num, score, shortId, text } from "../lib/format";
import type { Dashboard, JsonObject, RunDetails } from "../types";
import { Button, EmptyState } from "./primitives";

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

function ImprovementFeed({ dashboard }: { dashboard: Dashboard | null }) {
  const improvements = dashboard?.improvements || [];
  if (improvements.length === 0) return <EmptyState>No accepted score improvements yet.</EmptyState>;
  return (
    <div className="grid max-h-90 gap-1.5 overflow-auto">
      {improvements.slice(0, 24).map((item) => (
        <article className={`rounded-md border border-[#292d2b] border-l-[3px] ${Number(item.exactMatches || 0) > 0 ? "border-l-[#45e05e]" : "border-l-[#45b8d8]"} bg-[#161817] p-2`} key={`${text(item.reportId)}-${text(item.symbol)}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_78px] items-center gap-2">
            <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#e2e5e2]">{text(item.symbol) || text(item.sourcePath, "unknown")}</strong>
            <span className="text-right text-xs text-[#969b97]">{ago(item.createdAt)}</span>
          </div>
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_140px_86px_88px] items-center gap-2 text-xs text-[#969b97] max-[780px]:grid-cols-1">
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#b5d4e8]" title={text(item.sourcePath)}>{text(item.sourcePath) || text(item.unit)}</span>
            <span className="text-right text-[#45b8d8] max-[780px]:text-left">{score(item.oldScore)} -&gt; {score(item.newScore)}</span>
            <span className="text-right text-[#45b8d8] max-[780px]:text-left">{delta(item.totalDelta)}</span>
            <span className="text-right text-[#45b8d8] max-[780px]:text-left">{num(item.attempts)} attempts</span>
          </div>
          <p className="mt-1.5 text-[#c8ccc8]">{text(item.summary)}</p>
        </article>
      ))}
    </div>
  );
}

function RunDetailsPanel({ loadRunDetails, loadingRunDetails, runDetails }: Pick<DetailsRailProps, "loadRunDetails" | "loadingRunDetails" | "runDetails">) {
  const summary = asObject(runDetails?.summary);
  const timeline = asArray(runDetails?.timeline).map(asObject);
  const facts: Array<[string, unknown]> = [
    ["reports", summary.workerReports],
    ["positive", summary.positiveAttempts],
    ["exact", summary.exactMatches],
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

function WorkerReports({ dashboard }: { dashboard: Dashboard | null }) {
  const reports = dashboard?.reports || [];
  if (reports.length === 0) return <div className="text-[#969b97]">No worker reports yet</div>;
  return (
    <div className="grid max-h-90 gap-1.5 overflow-auto">
      {reports.slice(0, 30).map((report) => {
        const target = asObject(report.target);
        return (
          <article className="rounded-md border border-[#292d2b] bg-[#171918] p-2 hover:bg-[#212624]" key={text(report.id)}>
            <div className="flex justify-between gap-2 text-xs text-[#969b97]">
              <span>{text(report.reportType)}</span>
              <span>{ago(report.createdAt)}</span>
            </div>
            <strong className="my-1 block [overflow-wrap:anywhere] text-[#e2e5e2]">{text(target.symbol) || text(target.sourcePath) || text(report.leaseId)}</strong>
            <div className="text-[#969b97]">{text(target.sourcePath)}</div>
            <p className="text-[#c8ccc8]">{text(report.summary)}</p>
            <div className="text-[#969b97]">delta {Number(report.scoreDelta || 0).toFixed(3)} / worker {shortId(report.workerId)}</div>
          </article>
        );
      })}
    </div>
  );
}

function Events({ dashboard }: { dashboard: Dashboard | null }) {
  const events = dashboard?.events || [];
  if (events.length === 0) return <div className="text-[#969b97]">No events</div>;
  return (
    <div className="grid max-h-90 gap-1.5 overflow-auto">
      {events.slice(0, 30).map((event) => (
        <div className="rounded-md border border-[#292d2b] bg-[#171918] p-2" key={text(event.id)}>
          <div className="flex justify-between gap-2 text-xs text-[#969b97]">
            <span>{text(event.eventType)}</span>
            <span>{event.handledAt ? "handled" : "open"}</span>
          </div>
          <div>{text(event.symbol) || text(event.reason) || text(event.leaseId) || text(event.producer)}</div>
          <div className="text-[#969b97]">{text(event.sourcePath)}</div>
        </div>
      ))}
    </div>
  );
}

function RailDetails({ children, open, summary, onToggle }: { children: React.ReactNode; open?: boolean; summary: string; onToggle?: (open: boolean) => void }) {
  return (
    <details className="border-b border-[#292d2b] p-3" defaultOpen={open} onToggle={(event) => onToggle?.(event.currentTarget.open)}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

export function DetailsRail({ collapsed, dashboard, loadRunDetails, loadingRunDetails, onCollapsedChange, runDetails }: DetailsRailProps) {
  return (
    <aside className={`grid min-w-0 border-l border-[#363a38] bg-[#1d1f1e] ${collapsed ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"} overflow-hidden max-[1180px]:col-span-2 max-[1180px]:border-t max-[780px]:block`}>
      <div className={`z-10 flex items-center gap-2 border-b border-[#292d2b] bg-[#181a19] px-2 py-1.5 ${collapsed ? "h-full flex-col justify-start" : "sticky top-0 min-h-[42px]"} max-[1180px]:static max-[1180px]:h-[42px] max-[1180px]:flex-row`}>
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
        <span className={`text-xs font-bold uppercase text-[#c0c5c1] ${collapsed ? "[writing-mode:vertical-rl] rotate-180" : ""} max-[1180px]:[writing-mode:initial] max-[1180px]:rotate-0`}>Details</span>
      </div>
      <div className={`${collapsed ? "hidden" : ""} min-h-0 overflow-auto`}>
        <RailDetails open summary="Logs"><LogLines dashboard={dashboard} /></RailDetails>
        <RailDetails summary="Improvements"><ImprovementFeed dashboard={dashboard} /></RailDetails>
        <RailDetails summary="Full Run" onToggle={(open) => open && !runDetails && loadRunDetails()}>
          <RunDetailsPanel loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
        </RailDetails>
        <RailDetails summary="Worker Reports"><WorkerReports dashboard={dashboard} /></RailDetails>
        <RailDetails summary="Events"><Events dashboard={dashboard} /></RailDetails>
      </div>
    </aside>
  );
}
