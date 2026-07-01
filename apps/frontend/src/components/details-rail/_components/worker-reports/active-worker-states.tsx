import { useState } from "react";
import { ChevronDown, ChevronRight } from "@/icons";

import { fetchWorkerStateTrace } from "@/lib/api";
import { asObject, ago, num, pct, shortId, text, type JsonObject } from "@/lib/format";
import type { FormState } from "@/lib/api-types";
import { activeRuntime, activityAttemptLabel, activityScoreText, latestActivity } from "@/lib/workerActivity";

import {
  reportBorderClass,
  reportCountsForReports,
  reportFinishLabel,
  reportMatchesFilter,
  reportOutcomeDescription,
  traceEventLabel,
  visibleReportFilters,
  type WorkerStateFilter,
} from "../../_lib/worker-reports";
import { MetaItem, ToolTraceSection, TraceSection } from "./shared";

export function ActiveWorkerStates({ activeReports, form, runId }: { activeReports: JsonObject[]; form: FormState; runId: string }) {
  const [filter, setFilter] = useState<WorkerStateFilter>("all");
  const [expandedWorkerStateId, setExpandedWorkerStateId] = useState<string | null>(null);
  const [traceByWorkerStateId, setTraceByWorkerStateId] = useState<Record<string, JsonObject>>({});
  const [traceErrorByWorkerStateId, setTraceErrorByWorkerStateId] = useState<Record<string, string>>({});
  const [loadingTraceId, setLoadingTraceId] = useState<string | null>(null);
  const counts = reportCountsForReports(activeReports.filter((report) => report.activeReportLoaded === true));
  counts.all = activeReports.length;
  const filteredActiveReports =
    filter === "all"
      ? activeReports
      : activeReports.filter((report) => report.activeReportLoaded === true && reportMatchesFilter(report, filter));
  const visibleFilters = visibleReportFilters(counts, filter);

  function selectFilter(nextFilter: WorkerStateFilter) {
    setFilter(nextFilter);
    setExpandedWorkerStateId(null);
  }

  function loadTrace(workerStateId: string) {
    if (!runId || !workerStateId || traceByWorkerStateId[workerStateId] || loadingTraceId === workerStateId) return;
    setLoadingTraceId(workerStateId);
    setTraceErrorByWorkerStateId((current) => {
      const next = { ...current };
      delete next[workerStateId];
      return next;
    });
    fetchWorkerStateTrace(form, runId, workerStateId)
      .then((trace) => {
        setTraceByWorkerStateId((current) => ({ ...current, [workerStateId]: trace }));
      })
      .catch((error) => {
        setTraceErrorByWorkerStateId((current) => ({
          ...current,
          [workerStateId]: error instanceof Error ? error.message : String(error),
        }));
      })
      .finally(() => setLoadingTraceId((current) => (current === workerStateId ? null : current)));
  }

  function toggleExpanded(reportId: string, workerStateId: string) {
    const nextExpanded = expandedWorkerStateId === reportId ? null : reportId;
    setExpandedWorkerStateId(nextExpanded);
    if (nextExpanded) loadTrace(workerStateId);
  }

  if (activeReports.length === 0) {
    return <div className="border border-dashed border-line2 bg-card p-3 text-sm text-dim">No active worker states right now</div>;
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Active worker state filters">
        {visibleFilters.map((option) => {
          const active = filter === option.id;
          return (
            <button
              aria-selected={active}
              className={`min-h-7 rounded-none border px-2 py-1 text-xs ${
                active ? "border-line2 bg-raised text-fg" : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
              }`}
              key={option.id}
              onClick={() => selectFilter(option.id)}
              role="tab"
              type="button"
            >
              {option.label} <span className="text-faint">{counts[option.id]}</span>
            </button>
          );
        })}
      </div>
      <div className="grid max-h-[calc(100vh-198px)] gap-2 overflow-auto pr-1 max-[1180px]:max-h-[540px]">
        {filteredActiveReports.map((claim) => {
          const target = asObject(claim.target);
          const claimId = text(claim.claimId) || text(claim.workerStateId) || `${text(target.symbol)}-${text(claim.createdAt)}`;
          const workerStateId = text(claim.workerStateId);
          const loadedTrace = asObject(traceByWorkerStateId[workerStateId]);
          const claimWithTrace = Object.keys(loadedTrace).length > 0 ? { ...claim, activity: loadedTrace } : claim;
          const reportId = `active:${claimId}`;
          const expanded = expandedWorkerStateId === reportId;
          const title = text(target.symbol) || text(claim.symbol) || text(target.sourcePath) || text(claim.sourcePath) || "active worker state";
          const runtime = activeRuntime(claim.claimedAt || claim.heartbeatAt, claim.ttl);
          const { activity, lastEvent } = latestActivity(claimWithTrace);
          const lastEventType = text(lastEvent.eventType);
          const lastSummary = text(lastEvent.summary, text(claim.summary, text(claim.reason, "Waiting for runner activity.")));
          const attemptLabel = lastEventType ? activityAttemptLabel(activity, lastEvent) : "waiting";
          const scoreText = activityScoreText(asObject(activity.lastScore));
          const outcomeLabel = claim.activeReportLoaded === true ? reportFinishLabel(claim) : "active";
          const outcomeTitle = claim.activeReportLoaded === true ? reportOutcomeDescription(claim) : "Active claim without a runner checkpoint report yet.";

          return (
            <article className={`rounded-none border border-l-[3px] border-line ${claim.activeReportLoaded === true ? reportBorderClass(claim) : "border-l-up"} bg-card hover:bg-raised`} key={reportId}>
              <button
                aria-expanded={expanded}
                className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2 text-left"
                onClick={() => toggleExpanded(reportId, workerStateId)}
                title={expanded ? "Collapse active worker state" : "Expand active worker state"}
                type="button"
              >
                <span className="pt-0.5 text-dim">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="min-w-0">
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-fg" title={title}>
                    {title}
                  </span>
                  <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-path" title={text(target.sourcePath) || text(claim.sourcePath) || text(target.unit)}>
                    {text(target.sourcePath) || text(claim.sourcePath) || text(target.unit)}
                  </span>
                  <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim" title={lastSummary}>
                    {lastEventType ? `${attemptLabel} · ${traceEventLabel(lastEvent)}` : "waiting for runner activity"}
                  </span>
                </span>
                <span className="grid justify-items-end gap-1 text-[11px] text-dim">
                  <span className="border border-line2 bg-inset px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-soft" title={outcomeTitle}>{outcomeLabel}</span>
                  <span className="text-soft">{runtime.primary}</span>
                  <span>{pct(claim.fuzzy ?? target.fuzzy)}</span>
                </span>
              </button>
              {expanded ? (
                <div className="border-t border-line px-3 pb-3 pt-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
                    <span>active claim</span>
                    <span>claimed {ago(claim.claimedAt)}</span>
                    <span>{runtime.secondary}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-soft">{lastSummary}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] max-[520px]:grid-cols-1">
                    <MetaItem label="worker" value={shortId(claim.workerId)} />
                    <MetaItem label="claim" value={shortId(claim.claimId)} />
                    <MetaItem label="state" value={shortId(claim.workerStateId)} />
                    <MetaItem label="type" value={outcomeLabel} />
                    <MetaItem label="fuzzy" value={pct(claim.fuzzy ?? target.fuzzy)} />
                    <MetaItem label="priority" value={num(claim.priority)} />
                    <MetaItem label="heartbeat" value={ago(claim.heartbeatAt)} />
                    <MetaItem label="elapsed" value={runtime.primary} />
                    <MetaItem label="timeout" value={runtime.secondary} />
                  </div>
                  {scoreText ? <div className="mt-2 rounded-none border border-line bg-inset p-2 text-xs leading-5 text-soft">latest score: {scoreText}</div> : null}
                  {text(claim.worktreePath) ? <div className="mt-2 rounded-none border border-line bg-inset p-2 text-xs leading-5 text-path [overflow-wrap:anywhere]">worktree: {text(claim.worktreePath)}</div> : null}
                  {text(claim.reason) ? <div className="mt-2 rounded-none border border-line bg-inset p-2 text-xs leading-5 text-soft">reason: {text(claim.reason)}</div> : null}
                  {loadingTraceId === workerStateId ? <div className="mt-2 border-t border-line pt-2 text-[11px] text-faint">Loading worker trace...</div> : null}
                  {text(traceErrorByWorkerStateId[workerStateId]) ? <div className="mt-2 border-t border-line pt-2 text-[11px] text-warn">Trace unavailable: {text(traceErrorByWorkerStateId[workerStateId])}</div> : null}
                  <TraceSection activity={activity} emptyText="Waiting for runner activity for this active claim." />
                  <ToolTraceSection activity={activity} emptyText="No Pi/tool JSONL lines for this active claim yet." />
                </div>
              ) : null}
            </article>
          );
        })}
        {filteredActiveReports.length === 0 ? <div className="text-dim">No active worker states match this filter</div> : null}
      </div>
    </div>
  );
}
