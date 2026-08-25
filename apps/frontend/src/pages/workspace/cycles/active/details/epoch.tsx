import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "@/icons";

import { Button, PanelSection, PanelTitle, StatCard } from "@/components/primitives";
import {
  asArray,
  asObject,
  ago,
  delta,
  num,
  numberValue,
  shortId,
  text,
  type Dashboard,
  type JsonObject,
  type RunDetails,
} from "@/lib/format";
import type { CycleFocus } from "@/routing";
import type { WorkspaceNav } from "@/pages/workspace/_lib/types";
import {
  mergeActiveWorkerState,
  workerStateKey,
} from "@/components/details-rail/_components/worker-reports";
import {
  epochOptionsFor,
  type EpochOption,
} from "@/components/details-rail/_components/worker-reports/epoch-selector";
import {
  reportBorderClass,
  reportCountsForReports,
  reportFinishLabel,
  reportOutcome,
  reportOutcomeDescription,
  reportResult,
  reportScoreDelta,
} from "@/components/details-rail/_lib/worker-reports";

export interface EpochDetailPageProps {
  cycleFocus: CycleFocus;
  dashboard: Dashboard | null;
  epochId: string;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  nav: WorkspaceNav;
  runDetails: RunDetails | null;
}

function unionWorkerStates(dashboard: Dashboard | null, runDetails: RunDetails | null): JsonObject[] {
  const byId = new Map<string, JsonObject>();
  for (const report of (dashboard?.workerStates ?? []).map(asObject)) {
    const id = workerStateKey(report);
    if (id) byId.set(id, report);
  }
  for (const report of asArray(runDetails?.workerStates).map(asObject)) {
    const id = workerStateKey(report);
    if (id) byId.set(id, report);
  }
  return [...byId.values()];
}

function allEpochTargets(dashboard: Dashboard | null, runDetails: RunDetails | null): JsonObject[] {
  const byId = new Map<string, JsonObject>();
  for (const target of (dashboard?.epochTargets ?? []).map(asObject)) {
    const id = text(target.epochTargetId) || `${text(target.epochId)}:${text(target.symbol)}:${text(target.sourcePath)}`;
    byId.set(id, target);
  }
  for (const target of asArray(runDetails?.epochTargets).map(asObject)) {
    const id = text(target.epochTargetId) || `${text(target.epochId)}:${text(target.symbol)}:${text(target.sourcePath)}`;
    byId.set(id, target);
  }
  return [...byId.values()];
}

function EpochPlaceholder({
  epochId,
  loadRunDetails,
  loadingRunDetails,
}: Pick<EpochDetailPageProps, "epochId" | "loadRunDetails" | "loadingRunDetails">) {
  return (
    <PanelSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PanelTitle className="mb-0">Epoch {shortId(epochId)} — not in the loaded window yet</PanelTitle>
        <Button
          disabled={loadingRunDetails}
          icon={<RefreshCw size={13} />}
          onClick={loadRunDetails}
          type="button"
        >
          {loadingRunDetails ? "Loading" : "Load all worker states"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 @[760px]:grid-cols-3">
        <StatCard label="Worker states" value="-" />
        <StatCard label="Exact" value="-" />
        <StatCard label="Active" value="-" />
      </div>
    </PanelSection>
  );
}

function orderedEpochOptions(options: EpochOption[]): EpochOption[] {
  return options.filter((option) => option.id !== "all");
}

export function EpochDetailPage(props: EpochDetailPageProps) {
  const loadAttemptedFor = useRef("");
  const workerStates = useMemo(
    () => unionWorkerStates(props.dashboard, props.runDetails),
    [props.dashboard, props.runDetails],
  );
  const knownTargets = useMemo(
    () => allEpochTargets(props.dashboard, props.runDetails),
    [props.dashboard, props.runDetails],
  );
  const activeClaims = (props.dashboard?.activeFiles ?? [])
    .map(asObject)
    .filter((claim) => text(claim.epochId) === props.epochId);
  const reports = workerStates.filter((report) => text(report.epochId) === props.epochId);
  const targets = knownTargets.filter((target) => text(target.epochId) === props.epochId);
  const reportsById = new Map(reports.map((report) => [workerStateKey(report), report]));
  const activeIds = new Set(activeClaims.map((claim) => text(claim.workerStateId)).filter(Boolean));
  const attempts = [
    ...activeClaims.map((claim) => mergeActiveWorkerState(claim, reportsById.get(text(claim.workerStateId)) ?? null)),
    ...reports.filter((report) => !activeIds.has(workerStateKey(report))),
  ].sort((left, right) => {
    const activeOrder = Number(Boolean(asObject(right.activeClaim).workerStateId)) - Number(Boolean(asObject(left.activeClaim).workerStateId));
    if (activeOrder !== 0) return activeOrder;
    return text(right.createdAt).localeCompare(text(left.createdAt));
  });
  const found = attempts.length > 0 || targets.length > 0;
  const loadedAll = Array.isArray(props.runDetails?.workerStates);

  useEffect(() => {
    if (found || loadedAll || props.loadingRunDetails || loadAttemptedFor.current === props.epochId) return;
    loadAttemptedFor.current = props.epochId;
    props.loadRunDetails();
  }, [found, loadedAll, props.epochId, props.loadRunDetails, props.loadingRunDetails]);

  const allReports = unionWorkerStates(props.dashboard, props.runDetails);
  const allClaims = (props.dashboard?.activeFiles ?? []).map(asObject);
  const claimIds = new Set(allClaims.map((claim) => text(claim.workerStateId)).filter(Boolean));
  const reportMap = new Map(allReports.map((report) => [workerStateKey(report), report]));
  const allAttempts = [
    ...allClaims.map((claim) => mergeActiveWorkerState(claim, reportMap.get(text(claim.workerStateId)) ?? null)),
    ...allReports.filter((report) => !claimIds.has(workerStateKey(report))),
  ];
  const epochOptions = orderedEpochOptions(epochOptionsFor(allAttempts, knownTargets));
  const currentIndex = epochOptions.findIndex((option) => option.id === props.epochId);
  const previousEpoch = currentIndex >= 0 ? epochOptions[currentIndex + 1] : undefined;
  const nextEpoch = currentIndex > 0 ? epochOptions[currentIndex - 1] : undefined;
  const ordinalRecord = attempts.find((record) => Number.isFinite(Number(record.epochOrdinal)))
    ?? targets.find((record) => Number.isFinite(Number(record.epochOrdinal)));
  const ordinal = numberValue(ordinalRecord?.epochOrdinal, NaN);
  const epochTitle = `Epoch ${Number.isFinite(ordinal) ? ordinal : shortId(props.epochId)}`;

  if (!found) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<ChevronLeft size={13} />} onClick={() => props.nav.goToCycle(props.cycleFocus, "run")} type="button">
            Back to Run
          </Button>
          <h3 className="m-0 text-lg font-bold text-fg">{epochTitle}</h3>
        </div>
        <EpochPlaceholder {...props} />
      </div>
    );
  }

  const counts = reportCountsForReports(reports);
  const exactCount = counts.exact;
  const improvementCount = reports.filter((report) =>
    reportOutcome(report) === "improvement_banked" || reportResult(report) === "improved"
  ).length;
  const admittedCount = targets.filter((target) => text(target.epochTargetStatus) === "admitted").length;
  const epochSummary = asArray(props.dashboard?.epochs)
    .map(asObject)
    .find((epoch) => text(epoch.epochId) === props.epochId || text(epoch.id) === props.epochId);
  const queueSizeValue = epochSummary?.remaining ?? epochSummary?.available ?? admittedCount;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button icon={<ChevronLeft size={13} />} onClick={() => props.nav.goToCycle(props.cycleFocus, "run")} type="button">
            Back to Run
          </Button>
          <h3 className="m-0 text-lg font-bold text-fg">{epochTitle}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={!previousEpoch}
            icon={<ChevronLeft size={13} />}
            onClick={() => previousEpoch && props.nav.goToCycle(props.cycleFocus, "run", { kind: "epoch", id: previousEpoch.id })}
            title={previousEpoch ? `Open ${previousEpoch.label}` : "No earlier epoch"}
            type="button"
          >
            Previous
          </Button>
          <Button
            disabled={!nextEpoch}
            icon={<ChevronRight size={13} />}
            onClick={() => nextEpoch && props.nav.goToCycle(props.cycleFocus, "run", { kind: "epoch", id: nextEpoch.id })}
            title={nextEpoch ? `Open ${nextEpoch.label}` : "No later epoch"}
            type="button"
          >
            Next
          </Button>
        </div>
      </div>

      <PanelSection>
        <PanelTitle>Epoch Summary</PanelTitle>
        <div className="grid grid-cols-2 gap-2 @[760px]:grid-cols-3 @[1040px]:grid-cols-6">
          <StatCard label="Worker states" value={num(reports.length)} />
          <StatCard label="Exact" tone={exactCount > 0 ? "text-up" : "text-soft"} value={num(exactCount)} />
          <StatCard label="Improvements" tone={improvementCount > 0 ? "text-up" : "text-soft"} value={num(improvementCount)} />
          <StatCard label="Active" tone={activeClaims.length > 0 ? "text-warn" : "text-soft"} value={num(activeClaims.length)} />
          <StatCard label="Admitted targets" value={num(admittedCount)} />
          <StatCard label="Queue size" value={num(queueSizeValue)} />
        </div>
      </PanelSection>

      <PanelSection>
        <PanelTitle>Attempts</PanelTitle>
        {attempts.length > 0 ? (
          <div className="grid gap-2">
            {attempts.map((report, index) => {
              const target = asObject(report.target);
              const workerStateId = workerStateKey(report);
              const active = Boolean(asObject(report.activeClaim).workerStateId);
              const outcomeLabel = active && report.activeReportLoaded !== true ? "active" : reportFinishLabel(report);
              const outcomeTitle = active && report.activeReportLoaded !== true
                ? "Active claim without a runner checkpoint report yet."
                : reportOutcomeDescription(report);
              const reportDelta = reportScoreDelta(report);
              const title = text(target.symbol) || text(report.symbol) || text(target.sourcePath) || text(report.sourcePath) || "worker state";
              const sourcePath = text(target.sourcePath) || text(report.sourcePath) || text(target.unit);
              return (
                <button
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border border-l-[3px] border-line ${active ? "border-l-up" : reportBorderClass(report)} bg-card px-3 py-2.5 text-left hover:bg-raised`}
                  disabled={!workerStateId}
                  key={workerStateId || `${text(report.claimId)}-${index}`}
                  onClick={() => workerStateId && props.nav.goToCycle(props.cycleFocus, "run", { kind: "attempt", id: workerStateId })}
                  title={workerStateId ? "Open attempt detail" : "Worker state id unavailable"}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-fg" title={title}>{title}</span>
                    <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-path" title={sourcePath}>{sourcePath}</span>
                  </span>
                  <span className="grid min-w-32 grid-cols-3 items-center gap-3 text-right text-[11px]">
                    <span className="text-soft" title={outcomeTitle}>{outcomeLabel}</span>
                    <span className={reportDelta > 0 ? "text-up" : "text-dim"}>{active && report.activeReportLoaded !== true ? "-" : delta(reportDelta)}</span>
                    <span className="text-dim">{ago(report.createdAt || report.claimedAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-line2 bg-card p-4 text-sm text-dim">No worker states were recorded for this epoch.</div>
        )}
      </PanelSection>
    </div>
  );
}
