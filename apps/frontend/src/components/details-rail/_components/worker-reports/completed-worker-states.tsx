import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from "@/icons";

import { Button } from "@/components/primitives";
import { asArray, asObject, ago, delta, num, shortId, text, type JsonObject } from "@/lib/format";

import type { RunTabProps } from "../../_lib/types";
import {
  attemptNumber,
  attemptScoreText,
  compactValue,
  modelAttemptBuildLabel,
  pageReportText,
  reasonLines,
  reportBorderClass,
  reportCountsForReports,
  reportFinishLabel,
  reportMatchesFilter,
  reportOutcomeDescription,
  reportResult,
  reportScoreDelta,
  reportStopReason,
  reportWindowText,
  reportsPageSize,
  runnerAttemptBuildLabel,
  runnerAttemptScoreText,
  statusText,
  stopReasonLabel,
  visibleReportFilters,
  workerStateStatusLabel,
  type WorkerStateFilter,
} from "../../_lib/worker-reports";
import { MetaItem, TraceSection } from "./shared";

type CompletedWorkerStatesProps = Pick<RunTabProps, "loadRunDetails" | "loadingRunDetails"> & {
  loadedAll: boolean;
  workerStates: JsonObject[];
};

export function CompletedWorkerStates({
  loadedAll,
  loadRunDetails,
  loadingRunDetails,
  workerStates,
}: CompletedWorkerStatesProps) {
  const [filter, setFilter] = useState<WorkerStateFilter>("all");
  const [page, setPage] = useState(0);
  const [expandedWorkerStateId, setExpandedWorkerStateId] = useState<string | null>(null);
  const loadedCounts = reportCountsForReports(workerStates);
  const totalCounts = loadedCounts;
  const filteredWorkerStates = workerStates.filter((workerState) => reportMatchesFilter(workerState, filter));
  const pages = Math.max(1, Math.ceil(filteredWorkerStates.length / reportsPageSize));
  const safePage = Math.min(page, pages - 1);
  const visibleWorkerStates = filteredWorkerStates.slice(safePage * reportsPageSize, safePage * reportsPageSize + reportsPageSize);
  const visibleFilters = visibleReportFilters(totalCounts, filter);

  if (workerStates.length === 0) {
    return (
      <div className="grid gap-2">
        {!loadedAll ? (
          <div className="flex justify-end">
            <Button className="min-h-6 px-2 py-0.5" icon={<RefreshCw size={13} />} onClick={loadRunDetails} type="button">
              {loadingRunDetails ? "Loading" : "Load All"}
            </Button>
          </div>
        ) : null}
        <div className="border border-dashed border-line2 bg-card p-3 text-sm text-dim">
          {loadedAll ? "No completed worker states for this epoch." : "No loaded completed worker states for this epoch yet."}
        </div>
      </div>
    );
  }

  function selectFilter(nextFilter: WorkerStateFilter) {
    setFilter(nextFilter);
    setPage(0);
    setExpandedWorkerStateId(null);
  }

  function selectPage(nextPage: number) {
    setPage(Math.max(0, Math.min(pages - 1, nextPage)));
    setExpandedWorkerStateId(null);
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
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Worker state filters">
          {visibleFilters.map((option) => {
            const active = filter === option.id;
            const count = totalCounts[option.id];
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
            title="Previous worker state page"
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
            title="Next worker state page"
            type="button"
          >
            <span className="sr-only">Next</span>
          </Button>
        </div>
      </div>
      <div className="grid max-h-[calc(100vh-190px)] gap-2 overflow-auto pr-1 max-[1180px]:max-h-[540px]">
        {visibleWorkerStates.map((report) => {
          const target = asObject(report.target);
          const attempts = asArray(report.attempts).map(asObject);
          const runnerAttempts = asArray(report.runnerAttempts).map(asObject);
          const writeSet = asArray(report.writeSet).map((item) => text(item)).filter(Boolean);
          const reasons = reasonLines(report);
          const reportDelta = reportScoreDelta(report);
          const reportId = text(report.id) || `${text(report.claimId)}-${text(report.createdAt)}`;
          const expanded = expandedWorkerStateId === reportId;
          const title = text(target.symbol) || text(target.sourcePath) || text(report.claimId, "worker state");
          const result = reportResult(report);
          const stopReason = reportStopReason(report, result);
          const outcomeLabel = reportFinishLabel(report);
          const neededFact = compactValue(report.neededFact);
          const nextRecommendation = text(report.nextRecommendation);
          return (
            <article className={`rounded-none border border-l-[3px] border-line ${reportBorderClass(report)} bg-card hover:bg-raised`} key={reportId}>
              <button
                aria-expanded={expanded}
                className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2 text-left"
                onClick={() => setExpandedWorkerStateId(expanded ? null : reportId)}
                title={expanded ? "Collapse worker state" : "Expand worker state"}
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
                    <span>{workerStateStatusLabel(report.lifecycleStatus)}</span>
                    <span>{ago(report.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-soft">{text(report.summary, "No summary recorded.")}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] max-[520px]:grid-cols-1">
                    <MetaItem label="outcome" value={outcomeLabel} />
                    <MetaItem label="result" value={result.replace("_", " ")} />
                    <MetaItem label="stop" value={stopReasonLabel(stopReason)} />
                    <MetaItem label="delta" value={delta(reportDelta)} valueClassName={reportDelta > 0 ? "text-up" : ""} />
                    <MetaItem label="worker" value={shortId(report.workerId)} />
                    <MetaItem label="claim" value={shortId(report.claimId)} />
                    <MetaItem label="epoch target" value={text(report.epochTargetStatus, "-")} />
                    <MetaItem label="gate" value={statusText(report)} />
                    <MetaItem label="attempts" value={num(attempts.length)} />
                  </div>
                  {neededFact ? <div className="mt-2 rounded-none border border-warn/40 bg-warn/5 p-2 text-xs leading-5 text-warn">needed fact: {neededFact}</div> : null}
                  {nextRecommendation ? <div className="mt-2 rounded-none border border-line bg-inset p-2 text-xs leading-5 text-soft">next: {nextRecommendation}</div> : null}
                  <TraceSection activity={asObject(report.activity)} emptyText="Load all worker states to see the runner trace for this claim." showEmpty={!loadedAll} />
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
                      <div className="mb-1 text-[11px] font-bold uppercase text-dim" title="Model-authored checkpoint note. Score numbers here are claims, not runner evidence.">
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
        {filteredWorkerStates.length === 0 ? <div className="text-dim">No worker states match this filter</div> : null}
      </div>
    </div>
  );
}
