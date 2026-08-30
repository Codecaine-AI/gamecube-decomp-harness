import { useEffect, useMemo, useState } from "react";

import { activeWorkerClaims, mergeActiveWorkerState, workerStateKey } from "@/components/details-rail/_components/worker-reports";
import { ALL_EPOCHS, CURRENT_EPOCH, currentEpochId, epochOptionsFor } from "@/components/details-rail/_components/worker-reports/epoch-selector";
import { reportBorderClass, reportFinishLabel, reportOutcomeDescription, reportScoreDelta, type WorkerStateFilter } from "@/components/details-rail/_lib/worker-reports";
import { ChevronLeft, ChevronRight } from "@/icons";
import { fetchKernelContainerTrace, fetchKernelStatus, fetchKernelTraceSessionDetail, fetchKernelTraceSessions, fetchKernelWorkerTrace } from "@/lib/api";
import { ago, asArray, asObject, delta, numberValue, text, type Dashboard, type JsonObject, type RunDetails } from "@/lib/format";
import type { CyclesPageProps } from "@/pages/workspace/cycles/_lib/types";
import { TraceDetailViewer } from "@/pages/workspace/trace/detail-viewer";
import type { CycleFocus } from "@/routing";

import { buildAgentListModel, findEpochTraceContainer, findWorkerTraceContainer, traceSessionMatchesContext, workerTraceContainerId } from "./model";

type SelectedAgent = { kind: "worker"; id: string } | null;

function loadedWorkerStates(dashboard: Dashboard | null, runDetails: RunDetails | null) {
  const recent = (dashboard?.workerStates ?? []).map(asObject);
  const full = asArray(runDetails?.workerStates).map(asObject);
  return { loadedAll: full.length > 0, workerStates: full.length > 0 ? full : recent };
}

function targetTitle(report: JsonObject) {
  const target = asObject(report.target);
  return {
    sourcePath: text(report.sourcePath, text(target.sourcePath, text(report.unit, text(target.unit)))),
    symbol: text(report.symbol, text(target.symbol, "worker state")),
  };
}

function AttemptRow({ active, onSelect, report, selected }: { active?: boolean; onSelect: (id: string) => void; report: JsonObject; selected: boolean }) {
  const id = workerStateKey(report);
  const target = targetTitle(report);
  const fuzzy = numberValue(report.fuzzy ?? asObject(report.target).fuzzy, NaN);
  const outcome = active ? "running" : reportFinishLabel(report);
  return (
    <button aria-pressed={selected} className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border border-l-[3px] border-line ${active ? "border-l-up" : reportBorderClass(report)} ${selected ? "bg-raised" : "bg-card hover:bg-raised"} px-2 py-1.5 text-left disabled:cursor-default`} disabled={!id} onClick={() => id && onSelect(id)} title={id ? "Inspect agent" : "Worker state id unavailable"} type="button">
      <span className="min-w-0"><span className="block truncate text-[11px] font-semibold text-fg">{target.symbol}</span><span className="block truncate text-[10px] text-path">{target.sourcePath || "-"}</span></span>
      <span className="grid justify-items-end gap-0.5 text-[10px] text-dim"><span className={active ? "text-up" : "text-soft"} title={active ? "Active worker state" : reportOutcomeDescription(report)}>{outcome}</span><span className={!active && reportScoreDelta(report) > 0 ? "text-up" : "text-dim"}>{active ? (Number.isFinite(fuzzy) ? `${fuzzy.toFixed(3)}%` : "-") : delta(reportScoreDelta(report))}</span><span>{ago(active ? report.heartbeatAt ?? report.claimedAt : report.createdAt)}</span></span>
    </button>
  );
}

function EpochWorkers({ dashboard, loadRunDetails, loadingRunDetails, onSelect, onSelectEpoch, runDetails, selected }: Pick<CyclesPageProps, "dashboard" | "loadRunDetails" | "loadingRunDetails" | "runDetails"> & { onSelect: (id: string) => void; onSelectEpoch: (id: string) => void; selected: SelectedAgent }) {
  const [selectedEpoch, setSelectedEpoch] = useState(CURRENT_EPOCH);
  const [outcomeFilter, setOutcomeFilter] = useState<WorkerStateFilter>("running");
  const [page, setPage] = useState(0);
  const { workerStates } = loadedWorkerStates(dashboard, runDetails);
  useEffect(() => {
    if (!runDetails && !loadingRunDetails) loadRunDetails();
  }, [loadRunDetails, loadingRunDetails, runDetails]);
  const claims = activeWorkerClaims(dashboard, runDetails);
  const activeIds = new Set(claims.map((claim) => text(claim.workerStateId)).filter(Boolean));
  const statesById = new Map(workerStates.map((state) => [workerStateKey(state), state]));
  const activeReports = claims.map((claim) => mergeActiveWorkerState(claim, statesById.get(text(claim.workerStateId)) ?? null));
  const completed = workerStates.filter((state) => !activeIds.has(workerStateKey(state)));
  const allReports = [...activeReports, ...completed];
  const knownEpochs = [...asArray(dashboard?.epochTargets).map(asObject), ...asArray(runDetails?.epochTargets).map(asObject)];
  const options = epochOptionsFor(allReports, knownEpochs);
  const currentId = currentEpochId(options);
  const safeEpoch = selectedEpoch === CURRENT_EPOCH ? currentId : selectedEpoch === ALL_EPOCHS || options.some((option) => option.id === selectedEpoch) ? selectedEpoch : currentId;
  const { counts, filters, reports: visible } = buildAgentListModel(allReports, safeEpoch, outcomeFilter, activeIds);
  const epochs = options.filter((option) => option.id !== ALL_EPOCHS);
  const selectedIndex = Math.max(0, epochs.findIndex((option) => option.id === safeEpoch));
  const selectedOption = safeEpoch === ALL_EPOCHS ? options.find((option) => option.id === ALL_EPOCHS) : epochs[selectedIndex];
  const older = safeEpoch !== ALL_EPOCHS ? epochs[selectedIndex + 1] : undefined;
  const newer = safeEpoch !== ALL_EPOCHS ? epochs[selectedIndex - 1] : undefined;
  const pageCount = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedVisible = visible.slice(currentPage * 10, currentPage * 10 + 10);
  function selectEpoch(id: string) { setSelectedEpoch(id); setPage(0); }
  function selectOutcomeFilter(value: WorkerStateFilter) { setOutcomeFilter(value); setPage(0); }

  return <section className="grid gap-2"><div className="grid gap-1.5 border border-line bg-card p-1.5"><div className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-1.5"><button aria-label="Previous epoch" className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim disabled:opacity-40" disabled={!older} onClick={() => older && selectEpoch(older.id)} title="Previous epoch" type="button"><ChevronLeft size={13} /></button><button className="truncate text-center text-[11px] font-semibold text-soft hover:text-fg disabled:cursor-default" disabled={!selectedOption} onClick={() => selectedOption && onSelectEpoch(selectedOption.id)} type="button">{selectedOption?.label ?? "No epochs"}</button><button aria-label="Next epoch" className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim disabled:opacity-40" disabled={!newer} onClick={() => newer && selectEpoch(newer.id)} title="Next epoch" type="button"><ChevronRight size={13} /></button></div><div className="grid grid-cols-[minmax(0,1fr)_28px_auto_28px] items-center gap-1.5"><select aria-label="Worker outcome" className="min-w-0 border border-line bg-card px-2 py-1 font-mono text-[10px] text-soft" onChange={(event) => selectOutcomeFilter(event.target.value as WorkerStateFilter)} value={outcomeFilter}>{filters.map((filter) => <option key={filter.id} value={filter.id}>{filter.label} · {counts[filter.id]}</option>)}</select><button aria-label="Previous page" className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim disabled:opacity-40" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} title="Previous page" type="button"><ChevronLeft size={13} /></button><span className="whitespace-nowrap text-center font-mono text-[10px] text-dim">Page {currentPage + 1} / {pageCount}</span><button aria-label="Next page" className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim disabled:opacity-40" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} title="Next page" type="button"><ChevronRight size={13} /></button></div></div>
    {loadingRunDetails ? <div className="text-[10px] text-dim">Loading all agents...</div> : null}
    <div className="grid gap-1.5">{pagedVisible.map((report) => <AttemptRow active={activeIds.has(workerStateKey(report))} key={workerStateKey(report) || text(report.claimId)} onSelect={onSelect} report={report} selected={selected?.kind === "worker" && selected.id === workerStateKey(report)} />)}{visible.length === 0 ? <div className="border border-dashed border-line2 bg-card p-3 text-xs text-dim">No matching worker states.</div> : null}</div></section>;
}

function workerReportFor(
  dashboard: Dashboard | null,
  runDetails: RunDetails | null,
  workerStateId: string,
): JsonObject | null {
  const { workerStates } = loadedWorkerStates(dashboard, runDetails);
  const report = workerStates.find((state) => workerStateKey(state) === workerStateId) ?? null;
  const claim = activeWorkerClaims(dashboard, runDetails)
    .find((candidate) => text(candidate.workerStateId) === workerStateId) ?? null;
  return claim ? mergeActiveWorkerState(claim, report) : report;
}

function WorkerTraceDetail({
  cycleFocus,
  dashboard,
  form,
  runDetails,
  view,
  workerStateId,
}: Pick<CyclesPageProps, "dashboard" | "form" | "runDetails" | "view"> & {
  cycleFocus: CycleFocus;
  workerStateId: string;
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchKernelContainerTrace>> | null>(null);
  const [error, setError] = useState("");
  const report = useMemo(
    () => workerReportFor(dashboard, runDetails, workerStateId),
    [dashboard, runDetails, workerStateId],
  );
  const claimId = text(report?.claimId, text(asObject(report?.activeClaim).claimId));
  const epochId = text(report?.epochId, text(asObject(report?.activeClaim).epochId));
  const reportLoaded = Boolean(report);
  const runId = text(asObject(dashboard?.status?.run).id, text(runDetails?.runId));
  const cycleId = cycleFocus === "active" ? text(view.activeCycleId) : cycleFocus;
  const gameId = text(view.game?.id, form.gameId);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError("");
    if (!reportLoaded) {
      setError("Worker state is not loaded.");
      return () => { cancelled = true; };
    }
    async function load() {
      try {
        if (claimId && cycleId && epochId && gameId && runId) {
          try {
            const directDetail = await fetchKernelWorkerTrace({
              claimId,
              epochId,
              gameId,
              runId,
              sessionId: cycleId,
            });
            if (cancelled) return;
            if (directDetail) {
              setDetail(directDetail);
              return;
            }
          } catch {
            try {
              const containerId = await workerTraceContainerId({
                claimId,
                epochId,
                gameId,
                runId,
                sessionId: cycleId,
              });
              const directDetail = await fetchKernelContainerTrace(containerId);
              if (cancelled) return;
              setDetail(directDetail);
              return;
            } catch {
              // Legacy traces without deterministic ids use session discovery.
            }
          }
        }

        const status = await fetchKernelStatus();
        if (cancelled) return;
        if (!status.enabled) {
          setError("Kernel trace unavailable.");
          return;
        }
        const response = await fetchKernelTraceSessions();
        if (cancelled) return;
        const candidateIds = response.trace_sessions
          .filter((session) => traceSessionMatchesContext(session, gameId, cycleId))
          .sort((left, right) => Date.parse(right.latestEventAt ?? right.updatedAt ?? right.createdAt ?? "") - Date.parse(left.latestEventAt ?? left.updatedAt ?? left.createdAt ?? ""))
          .map((session) => session.id);
        if (candidateIds.length === 0) {
          setError("No kernel trace session was recorded for this cycle.");
          return;
        }
        for (const sessionId of candidateIds) {
          const sessionDetail = await fetchKernelTraceSessionDetail(sessionId);
          if (cancelled) return;
          let container = findWorkerTraceContainer(sessionDetail, { claimId }, workerStateId, runId);
          if (!container) {
            // Cycle traces are capped at 500 containers. Long-lived cycles can
            // return the current epoch but omit its worker children, so read
            // that smaller subtree before deciding the trace is missing.
            const epochContainer = findEpochTraceContainer(sessionDetail, epochId, runId);
            if (epochContainer) {
              const epochDetail = await fetchKernelContainerTrace(epochContainer.id);
              if (cancelled) return;
              container = findWorkerTraceContainer(epochDetail, { claimId }, workerStateId, runId);
            }
          }
          if (!container) continue;
          const workerDetail = await fetchKernelContainerTrace(container.id);
          if (!cancelled) setDetail(workerDetail);
          return;
        }
        if (!cancelled) setError("No kernel trace was recorded for this agent.");
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [claimId, cycleId, epochId, gameId, reportLoaded, runId, workerStateId]);

  if (error) return <div className="grid h-full place-items-center border border-dashed border-line2 bg-card p-4 text-center text-xs text-dim">{error}</div>;
  if (!detail) return <div className="grid h-full place-items-center text-xs text-dim">Loading agent trace...</div>;
  return <TraceDetailViewer detail={detail} initialTraceLevel={0} />;
}

export function CycleAgentsBrowser(props: Pick<CyclesPageProps, "dashboard" | "form" | "loadRunDetails" | "loadingRunDetails" | "nav" | "runDetails" | "view"> & { cycleFocus: CycleFocus; onSelectWorkerState: (id: string) => void; selectedWorkerStateId: string }) {
  const selected: SelectedAgent = props.selectedWorkerStateId
    ? { kind: "worker", id: props.selectedWorkerStateId }
    : null;

  return (
    <div className="grid h-[calc(100vh-7rem)] min-h-[640px] grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-4 max-[780px]:grid-cols-1">
      <aside className="grid min-h-0 content-start gap-5 overflow-y-auto border border-line bg-panel p-3">
        <EpochWorkers
          {...props}
          onSelect={props.onSelectWorkerState}
          onSelectEpoch={(id) => props.nav.goToCycle(props.cycleFocus, "run", { kind: "epoch", id })}
          selected={selected}
        />
      </aside>
      <main className="min-h-0 min-w-0 overflow-hidden">
        {selected?.kind === "worker" ? (
          <WorkerTraceDetail
            cycleFocus={props.cycleFocus}
            dashboard={props.dashboard}
            form={props.form}
            runDetails={props.runDetails}
            view={props.view}
            workerStateId={selected.id}
          />
        ) : (
          <div className="grid h-full place-items-center border border-dashed border-line2 bg-card text-sm text-dim">Select an agent</div>
        )}
      </main>
    </div>
  );
}
