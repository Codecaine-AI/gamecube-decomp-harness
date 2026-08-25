import { useState } from "react";

import { Button } from "@/components/primitives";
import { ChevronLeft, ChevronRight, RefreshCw } from "@/icons";
import { ago, asArray, asObject, delta, num, numberValue, text, type Dashboard, type JsonObject, type RunDetails } from "@/lib/format";

import { reportBorderClass, reportFinishLabel, reportOutcomeDescription, reportScoreDelta } from "../_lib/worker-reports";
import type { RunDetailsControls } from "../_lib/types";
import { activeWorkerClaims, mergeActiveWorkerState, workerStateKey } from "./worker-reports";
import { ALL_EPOCHS, CURRENT_EPOCH, currentEpochId, epochOptionsFor, reportsForEpoch } from "./worker-reports/epoch-selector";

function loadedWorkerStates(dashboard: Dashboard | null, runDetails: RunDetails | null): { loadedAll: boolean; workerStates: JsonObject[] } {
  const recentWorkerStates = (dashboard?.workerStates || []).map(asObject);
  const fullWorkerStates = asArray(runDetails?.workerStates).map(asObject);
  return {
    loadedAll: fullWorkerStates.length > 0,
    workerStates: fullWorkerStates.length > 0 ? fullWorkerStates : recentWorkerStates,
  };
}

export function navigatorSectionHint(dashboard: Dashboard | null, runDetails: RunDetails | null): string {
  const { workerStates } = loadedWorkerStates(dashboard, runDetails);
  return `${num(workerStates.length)} states`;
}

function activeFuzzy(report: JsonObject): string {
  const target = asObject(report.target);
  const fuzzy = numberValue(report.fuzzy ?? target.fuzzy, NaN);
  return Number.isFinite(fuzzy) ? `${fuzzy.toFixed(3)}%` : "-";
}

function targetTitle(report: JsonObject): { sourcePath: string; symbol: string } {
  const target = asObject(report.target);
  return {
    sourcePath: text(report.sourcePath, text(target.sourcePath, text(report.unit, text(target.unit)))),
    symbol: text(report.symbol, text(target.symbol, "worker state")),
  };
}

function AttemptRow({ active, onSelect, report }: { active?: boolean; onSelect: (workerStateId: string) => void; report: JsonObject }) {
  const id = workerStateKey(report);
  const target = targetTitle(report);
  const reportDelta = reportScoreDelta(report);
  const outcome = active ? "running" : reportFinishLabel(report);
  const createdAt = active ? report.heartbeatAt ?? report.claimedAt ?? report.createdAt : report.createdAt;
  const metric = active ? activeFuzzy(report) : delta(reportDelta);
  return (
    <button
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border border-l-[3px] border-line ${active ? "border-l-up" : reportBorderClass(report)} bg-card px-2 py-1.5 text-left hover:bg-raised disabled:cursor-default disabled:hover:bg-card`}
      disabled={!id}
      onClick={() => id && onSelect(id)}
      title={id ? "Open attempt detail" : "Worker state id unavailable"}
      type="button"
    >
      <span className="min-w-0">
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-fg" title={target.symbol}>
          {target.symbol}
        </span>
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-path" title={target.sourcePath}>
          {target.sourcePath || "-"}
        </span>
      </span>
      <span className="grid min-w-0 justify-items-end gap-0.5 text-[10px] text-dim">
        <span className={active ? "text-up" : "text-soft"} title={active ? "Active worker state" : reportOutcomeDescription(report)}>
          {outcome}
        </span>
        <span className={!active && reportDelta > 0 ? "text-up" : "text-dim"}>{metric}</span>
        <span>{ago(createdAt)}</span>
      </span>
    </button>
  );
}

export function NavigatorSection({
  dashboard,
  loadRunDetails,
  loadingRunDetails,
  onSelectAttempt,
  onSelectEpoch,
  runDetails,
}: RunDetailsControls & {
  dashboard: Dashboard | null;
  onSelectAttempt: (workerStateId: string) => void;
  onSelectEpoch: (epochId: string) => void;
}) {
  const [selectedEpoch, setSelectedEpoch] = useState<string>(CURRENT_EPOCH);
  const { loadedAll, workerStates } = loadedWorkerStates(dashboard, runDetails);
  const activeClaims = activeWorkerClaims(dashboard, runDetails);
  const activeIds = new Set(activeClaims.map((claim) => text(claim.workerStateId)).filter(Boolean));
  const workerStatesById = new Map<string, JsonObject>();
  for (const workerState of workerStates) {
    const id = workerStateKey(workerState);
    if (id) workerStatesById.set(id, workerState);
  }
  const activeReports = activeClaims.map((claim) => {
    const id = text(claim.workerStateId);
    return mergeActiveWorkerState(claim, id ? workerStatesById.get(id) ?? null : null);
  });
  const completedWorkerStates = workerStates.filter((workerState) => {
    const id = workerStateKey(workerState);
    return !id || !activeIds.has(id);
  });
  const knownEpochRecords = [
    ...asArray(dashboard?.epochTargets).map(asObject),
    ...asArray(runDetails?.epochTargets).map(asObject),
  ];
  const epochOptions = epochOptionsFor([...activeReports, ...completedWorkerStates], knownEpochRecords);
  const currentId = currentEpochId(epochOptions);
  const safeSelectedEpoch =
    selectedEpoch === CURRENT_EPOCH
      ? currentId
      : selectedEpoch === ALL_EPOCHS || epochOptions.some((option) => option.id === selectedEpoch)
        ? selectedEpoch
        : currentId;
  const selectedIsAll = safeSelectedEpoch === ALL_EPOCHS;
  const epochs = epochOptions.filter((option) => option.id !== ALL_EPOCHS);
  const selectedIndex = Math.max(0, epochs.findIndex((option) => option.id === safeSelectedEpoch));
  const selectedOption = selectedIsAll ? epochOptions.find((option) => option.id === ALL_EPOCHS) : epochs[selectedIndex];
  const visibleActiveReports = reportsForEpoch(activeReports, safeSelectedEpoch);
  const visibleCompletedWorkerStates = reportsForEpoch(completedWorkerStates, safeSelectedEpoch);

  function selectEpoch(epochId: string): void {
    setSelectedEpoch(epochId);
    if (epochId !== ALL_EPOCHS && !loadedAll && !loadingRunDetails) loadRunDetails();
  }

  const olderEpoch = !selectedIsAll ? epochs[selectedIndex + 1] : undefined;
  const newerEpoch = !selectedIsAll ? epochs[selectedIndex - 1] : undefined;

  return (
    <div className="grid gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <Button className="min-h-6 px-2 py-0.5" disabled={loadingRunDetails} icon={<RefreshCw size={13} />} onClick={loadRunDetails} type="button">
          {loadingRunDetails ? "Loading" : loadedAll ? "Refresh All" : "Load All"}
        </Button>
        <button
          aria-pressed={selectedIsAll}
          className={`min-h-6 border px-2 py-0.5 text-[11px] ${selectedIsAll ? "border-line2 bg-raised text-fg" : "border-line bg-card text-dim hover:border-line2 hover:text-soft"}`}
          onClick={() => selectEpoch(ALL_EPOCHS)}
          type="button"
        >
          All
        </button>
      </div>

      <div className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-1.5 border border-line bg-card p-1.5">
        <button
          className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim hover:border-line2 hover:text-fg disabled:opacity-40"
          disabled={!olderEpoch}
          onClick={() => olderEpoch && selectEpoch(olderEpoch.id)}
          title="Previous epoch"
          type="button"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] text-soft hover:text-fg disabled:cursor-default"
          disabled={selectedIsAll || !selectedOption || selectedOption.id === ALL_EPOCHS}
          onClick={() => selectedOption && selectedOption.id !== ALL_EPOCHS && onSelectEpoch(selectedOption.id)}
          title={selectedIsAll ? "All epochs" : "Open epoch detail"}
          type="button"
        >
          {selectedIsAll ? "All epochs" : selectedOption?.label ?? "No epochs"} · {num(selectedOption?.count)} states
          {!selectedIsAll && selectedOption?.id === currentId ? <span className="ml-1 text-up">current</span> : null}
        </button>
        <button
          className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim hover:border-line2 hover:text-fg disabled:opacity-40"
          disabled={!newerEpoch}
          onClick={() => newerEpoch && selectEpoch(newerEpoch.id)}
          title="Next epoch"
          type="button"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="grid gap-1.5">
        {visibleActiveReports.map((report) => (
          <AttemptRow active key={`active-${workerStateKey(report) || text(report.claimId)}`} onSelect={onSelectAttempt} report={report} />
        ))}
        {visibleCompletedWorkerStates.map((report) => (
          <AttemptRow key={workerStateKey(report) || `${text(report.claimId)}-${text(report.createdAt)}`} onSelect={onSelectAttempt} report={report} />
        ))}
        {visibleActiveReports.length === 0 && visibleCompletedWorkerStates.length === 0 ? (
          <div className="border border-dashed border-line2 bg-card p-3 text-xs text-dim">
            {loadedAll ? "No worker states for this epoch." : "No loaded worker states for this epoch yet."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
