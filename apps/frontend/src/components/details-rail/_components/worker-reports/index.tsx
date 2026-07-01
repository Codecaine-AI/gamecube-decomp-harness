import { useState } from "react";

import { asArray, asObject, num, numberValue, text, type JsonObject } from "@/lib/format";

import type { RunTabProps } from "../../_lib/types";
import { TabButton } from "../tab-button";
import { ActiveWorkerStates } from "./active-worker-states";
import { CompletedWorkerStates } from "./completed-worker-states";
import { ALL_EPOCHS, CURRENT_EPOCH, currentEpochId, EpochSelector, epochOptionsFor, reportsForEpoch } from "./epoch-selector";

type WorkerStateTab = "active" | "completed";

function workerStateKey(record: JsonObject): string {
  return text(record.workerStateId) || text(record.id);
}

function targetFromActiveClaim(claim: JsonObject): JsonObject {
  const target: JsonObject = {};
  const unit = text(claim.unit);
  const symbol = text(claim.symbol);
  const sourcePath = text(claim.sourcePath);
  if (unit) target.unit = unit;
  if (symbol) target.symbol = symbol;
  if (sourcePath) target.sourcePath = sourcePath;
  if (claim.size !== undefined) target.size = claim.size;
  if (claim.fuzzy !== undefined) target.fuzzy = claim.fuzzy;
  return target;
}

function activeWorkerClaims(dashboard: RunTabProps["dashboard"], runDetails: RunTabProps["runDetails"]): JsonObject[] {
  const claims: JsonObject[] = [];
  const seen = new Set<string>();
  function addClaim(claim: JsonObject) {
    const key = text(claim.workerStateId) || text(claim.claimId) || `${text(claim.symbol)}-${text(claim.claimedAt)}`;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    claims.push(claim);
  }
  for (const claim of (dashboard?.activeFiles || []).map(asObject)) {
    addClaim(claim);
  }
  for (const claim of asArray(runDetails?.targetClaims).map(asObject)) {
    if (text(claim.status) !== "active") continue;
    addClaim(claim);
  }
  return claims;
}

function mergeActiveWorkerState(claim: JsonObject, report: JsonObject | null): JsonObject {
  const reportTarget = asObject(report?.target);
  const claimTarget = targetFromActiveClaim(claim);
  return {
    ...(report ?? {}),
    activeClaim: claim,
    activeReportLoaded: Boolean(report),
    activity: Object.keys(asObject(report?.activity)).length > 0 ? report?.activity : claim.activity,
    claimId: text(claim.claimId, text(report?.claimId)),
    claimedAt: claim.claimedAt ?? report?.claimedAt ?? report?.createdAt,
    createdAt: text(report?.createdAt, text(claim.claimedAt)),
    fuzzy: claim.fuzzy ?? reportTarget.fuzzy,
    heartbeatAt: claim.heartbeatAt ?? report?.heartbeatAt,
    id: text(report?.id, text(claim.workerStateId)),
    epochId: text(claim.epochId, text(report?.epochId)),
    epochOrdinal: numberValue(claim.epochOrdinal ?? report?.epochOrdinal, NaN),
    lifecycleStatus: text(report?.lifecycleStatus, "running"),
    priority: claim.priority ?? report?.priority,
    reason: text(claim.reason, text(report?.reason)),
    sourcePath: text(claim.sourcePath, text(reportTarget.sourcePath)),
    symbol: text(claim.symbol, text(reportTarget.symbol)),
    target: { ...reportTarget, ...claimTarget },
    ttl: claim.ttl ?? report?.ttl,
    unit: text(claim.unit, text(reportTarget.unit)),
    workerId: text(claim.workerId, text(report?.workerId)),
    workerStateId: text(claim.workerStateId, text(report?.workerStateId, text(report?.id))),
    worktreePath: text(claim.worktreePath, text(report?.worktreePath)),
  };
}

function completedCountLabel(dashboard: RunTabProps["dashboard"], loadedCount: number, activeCount: number, loadedAll: boolean): string {
  if (loadedAll) return num(loadedCount);
  const summary = asObject(dashboard?.runSummary);
  const outcomeCounts = asObject(summary.workerStateOutcomeCounts);
  const total = Number(outcomeCounts.all ?? summary.totalWorkerStates);
  return num(Number.isFinite(total) ? Math.max(0, total - activeCount) : loadedCount);
}

export function WorkerStates(props: RunTabProps) {
  const [tab, setTab] = useState<WorkerStateTab>("active");
  const [selectedEpoch, setSelectedEpoch] = useState<string>(CURRENT_EPOCH);
  const runId = text(asObject(props.dashboard?.status?.run).id);
  const recentWorkerStates = (props.dashboard?.workerStates || []).map(asObject);
  const fullWorkerStates = asArray(props.runDetails?.workerStates).map(asObject);
  const workerStates = fullWorkerStates.length > 0 ? fullWorkerStates : recentWorkerStates;
  const loadedAll = fullWorkerStates.length > 0;
  const activeClaims = activeWorkerClaims(props.dashboard, props.runDetails);
  const activeIds = new Set(activeClaims.map((claim) => text(claim.workerStateId)).filter(Boolean));
  const workerStatesById = new Map<string, JsonObject>();
  for (const workerState of workerStates) {
    const id = workerStateKey(workerState);
    if (id) workerStatesById.set(id, workerState);
  }
  const seenActiveIds = new Set<string>();
  const activeReports = activeClaims.map((claim) => {
    const id = text(claim.workerStateId);
    if (id) seenActiveIds.add(id);
    return mergeActiveWorkerState(claim, id ? workerStatesById.get(id) ?? null : null);
  });
  for (const id of activeIds) {
    if (seenActiveIds.has(id)) continue;
    const report = workerStatesById.get(id);
    if (report) activeReports.push(mergeActiveWorkerState({} as JsonObject, report));
  }
  const completedWorkerStates = workerStates.filter((workerState) => {
    const id = workerStateKey(workerState);
    return !id || !activeIds.has(id);
  });
  const knownEpochRecords = [
    ...asArray(props.dashboard?.epochTargets).map(asObject),
    ...asArray(props.runDetails?.epochTargets).map(asObject),
  ];
  const epochOptions = epochOptionsFor([...activeReports, ...completedWorkerStates], knownEpochRecords);
  const currentId = currentEpochId(epochOptions);
  const safeSelectedEpoch =
    selectedEpoch === CURRENT_EPOCH
      ? currentId
      : epochOptions.some((option) => option.id === selectedEpoch)
        ? selectedEpoch
        : currentId;
  const activeReportsForEpoch = reportsForEpoch(activeReports, safeSelectedEpoch);
  const completedWorkerStatesForEpoch = reportsForEpoch(completedWorkerStates, safeSelectedEpoch);
  function selectEpoch(epochId: string) {
    setSelectedEpoch(epochId);
    if (epochId !== ALL_EPOCHS && !loadedAll && !props.loadingRunDetails) props.loadRunDetails();
  }

  return (
    <div className="grid min-h-0 gap-3 p-3">
      <EpochSelector options={epochOptions} selectedEpoch={safeSelectedEpoch} onSelect={selectEpoch} />
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Worker state status">
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          Active <span className="text-faint">{num(activeReportsForEpoch.length)}</span>
        </TabButton>
        <TabButton active={tab === "completed"} onClick={() => setTab("completed")}>
          Completed{" "}
          <span className="text-faint">
            {safeSelectedEpoch === ALL_EPOCHS
              ? completedCountLabel(props.dashboard, completedWorkerStatesForEpoch.length, activeReportsForEpoch.length, loadedAll)
              : num(completedWorkerStatesForEpoch.length)}
          </span>
        </TabButton>
      </div>
      {tab === "active" ? (
        <ActiveWorkerStates activeReports={activeReportsForEpoch} form={props.form} runId={runId} />
      ) : (
        <CompletedWorkerStates
          loadedAll={loadedAll}
          loadRunDetails={props.loadRunDetails}
          loadingRunDetails={props.loadingRunDetails}
          workerStates={completedWorkerStatesForEpoch}
        />
      )}
    </div>
  );
}
