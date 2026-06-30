import {
  asArray,
  asObject,
  delta,
  num,
  pct,
  scoreOrPercent,
  scorePairLooksPercent,
  signedWhole,
  text,
  type Dashboard,
  type JsonObject,
} from "@/lib/format";
import type { ImprovedMode, ImprovedResultMode } from "./types";

function trustedReport(dashboard: Dashboard | null): JsonObject {
  return asObject(dashboard?.trustedReport);
}

function trustedReady(dashboard: Dashboard | null): boolean {
  return trustedReport(dashboard).status === "ready";
}

function improvementSourceReport(dashboard: Dashboard | null): { report: JsonObject; ready: boolean } {
  return { report: trustedReport(dashboard), ready: trustedReady(dashboard) };
}

function workerImprovementRows(dashboard: Dashboard | null): JsonObject[] {
  return (dashboard?.improvements || []).map(asObject);
}

function activeWorkerStateIds(dashboard: Dashboard | null): Set<string> {
  return new Set((dashboard?.activeFiles || []).map(asObject).map((row) => text(row.workerStateId)).filter(Boolean));
}

function workerScore(row: JsonObject, key: "oldScore" | "newScore"): string {
  return scoreOrPercent(row[key], scorePairLooksPercent(row.oldScore, row.newScore, row.totalDelta));
}

function isWorkerMatch(row: JsonObject): boolean {
  return Number(row.exactMatches || 0) > 0;
}

function workerRowDisplay(row: JsonObject): JsonObject {
  return {
    ...row,
    unitName: text(row.sourcePath) || text(row.unit),
    itemName: text(row.symbol, "-"),
    scoreLabel: workerScore(row, "newScore"),
    deltaLabel: `${delta(row.totalDelta)} pp`,
    deltaTitle: `${workerScore(row, "oldScore")} -> ${workerScore(row, "newScore")} (${delta(row.totalDelta)} percentage points)`,
    source: "worker_report",
  };
}

function trustedGeneratedMs(dashboard: Dashboard | null): number {
  return trustedReady(dashboard) ? Date.parse(text(trustedReport(dashboard).generatedAt)) : NaN;
}

function currentEpochStartedMs(dashboard: Dashboard | null): number {
  const checkpoint = asObject(dashboard?.checkpointProgress);
  const summary = asObject(dashboard?.runSummary);
  const candidates = [
    Date.parse(text(checkpoint.lastCheckpointAt)),
    trustedGeneratedMs(dashboard),
    Date.parse(text(summary.createdAt)),
  ].filter(Number.isFinite);
  return candidates.length > 0 ? Math.max(...candidates) : NaN;
}

function isCurrentEpochWorkerRow(dashboard: Dashboard | null, row: JsonObject): boolean {
  const epochStartMs = currentEpochStartedMs(dashboard);
  if (!Number.isFinite(epochStartMs)) return true;
  const rowMs = Date.parse(text(row.createdAt));
  return Number.isFinite(rowMs) && rowMs > epochStartMs;
}

function completedWorkerImprovementRows(dashboard: Dashboard | null): JsonObject[] {
  const activeIds = activeWorkerStateIds(dashboard);
  return workerImprovementRows(dashboard)
    .filter((row) => text(row.lifecycleStatus) !== "running")
    .filter((row) => {
      const workerStateId = text(row.workerStateId);
      return !workerStateId || !activeIds.has(workerStateId);
    })
    .filter((row) => isCurrentEpochWorkerRow(dashboard, row));
}

// Confirmed = full-build truth accumulated across the run's saved epoch reports.
export function confirmedMatchRows(dashboard: Dashboard | null): JsonObject[] {
  const source = improvementSourceReport(dashboard);
  return source.ready ? asArray(source.report.newMatches).map(asObject) : [];
}

export function confirmedImprovementRows(dashboard: Dashboard | null): JsonObject[] {
  const source = improvementSourceReport(dashboard);
  return source.ready ? asArray(source.report.improvements).map(asObject) : [];
}

export function confirmedRows(dashboard: Dashboard | null): JsonObject[] {
  return [...confirmedMatchRows(dashboard), ...confirmedImprovementRows(dashboard)];
}

function latestPromotedRows(dashboard: Dashboard | null): JsonObject[] {
  const cumulative = trustedReport(dashboard);
  const latest = asObject(cumulative.latestReport);
  const source = Object.keys(latest).length > 0 ? latest : cumulative;
  return [
    ...asArray(source.newMatches).map(asObject),
    ...asArray(source.improvements).map(asObject),
  ];
}

function latestPromotedItemNames(dashboard: Dashboard | null): Set<string> {
  return new Set(latestPromotedRows(dashboard).map((row) => text(row.itemName)).filter(Boolean));
}

// Tentative = completed-worker evidence from the current epoch that the next
// full baseline build has not promoted into the epoch report yet.
export function tentativeMatchRows(dashboard: Dashboard | null): JsonObject[] {
  const promoted = latestPromotedItemNames(dashboard);
  return completedWorkerImprovementRows(dashboard)
    .filter(isWorkerMatch)
    .filter((row) => !promoted.has(text(row.symbol)))
    .map(workerRowDisplay);
}

export function tentativeImprovementRows(dashboard: Dashboard | null): JsonObject[] {
  const promoted = latestPromotedItemNames(dashboard);
  return completedWorkerImprovementRows(dashboard)
    .filter((row) => !isWorkerMatch(row))
    .filter((row) => !promoted.has(text(row.symbol)))
    .map(workerRowDisplay);
}

export function tentativeRows(dashboard: Dashboard | null): JsonObject[] {
  return [...tentativeMatchRows(dashboard), ...tentativeImprovementRows(dashboard)];
}

export function reportRows(dashboard: Dashboard | null, mode: ImprovedMode, resultMode: ImprovedResultMode): JsonObject[] {
  if (mode === "confirmed") return resultMode === "matches" ? confirmedMatchRows(dashboard) : confirmedImprovementRows(dashboard);
  return resultMode === "matches" ? tentativeMatchRows(dashboard) : tentativeImprovementRows(dashboard);
}

export function deltaColumnLabel(mode: ImprovedMode): string {
  if (mode === "confirmed") return "Bytes +/-";
  return "Score +/-";
}

export function deltaColumnTitle(mode: ImprovedMode): string {
  if (mode === "confirmed") return "Cumulative byte movement from confirmed epoch builds";
  return "Completed-worker score movement in percentage points; confirmed by the next baseline build";
}

export function improvedEmptyText(dashboard: Dashboard | null, mode: ImprovedMode, resultMode: ImprovedResultMode): string {
  const report = trustedReport(dashboard);
  const noun = resultMode === "matches" ? "matches" : "improvements";
  if (mode === "confirmed") {
    if (report.status === "stale") return text(report.staleReason, `Report is stale — confirmed ${noun} appear after the next epoch build`);
    if (report.status === "parse_error") return text(report.error, "Could not parse the saved report");
    if (!trustedReady(dashboard)) return `No fresh epoch build yet — confirmed ${noun} appear after the next baseline build`;
    return `No confirmed ${noun} in this run yet`;
  }
  return `No completed worker ${noun} waiting for the next baseline build`;
}

export function rowPath(entry: JsonObject): string {
  return text(entry.unitName) || text(entry.sourcePath) || text(entry.unit, "-");
}

export function rowItem(entry: JsonObject): string {
  const exactMatches = Number(entry.exactMatches || 0);
  const suffix = text(entry.source) === "worker_report" && exactMatches > 1 ? ` (${num(exactMatches)} exact)` : "";
  return `${text(entry.itemName) || text(entry.symbol, "-")}${suffix}`;
}

export function rowScore(entry: JsonObject): string {
  const scoreLabel = text(entry.scoreLabel);
  if (scoreLabel) return scoreLabel;
  const fromPercent = Number(entry.fromPercent);
  const toPercent = Number(entry.toPercent);
  if (Number.isFinite(fromPercent) && Number.isFinite(toPercent)) return `${fromPercent.toFixed(2)}% -> ${toPercent.toFixed(2)}%`;
  return pct(entry.toPercent);
}

export function rowDelta(entry: JsonObject): string {
  return text(entry.deltaLabel) || `${signedWhole(entry.bytesDelta)}b`;
}

export function rowDeltaTitle(entry: JsonObject): string {
  return text(entry.deltaTitle) || `${pct(entry.fromPercent)} -> ${pct(entry.toPercent)}`;
}

export function rowDeltaClass(entry: JsonObject): string {
  const raw = Number(entry.totalDelta ?? entry.bytesDelta);
  if (!Number.isFinite(raw) || raw === 0) return "text-dim";
  return raw > 0 ? "text-up" : "text-down";
}
