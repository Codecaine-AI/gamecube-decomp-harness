import { delta, num, pct, signedWhole, text, type Dashboard, type JsonObject } from "@/lib/format";
import type { ImprovedMode, ImprovedResultMode } from "./types";

export function confirmedMatchRows(dashboard: Dashboard | null): JsonObject[] {
  return dashboard?.scoreTiers?.confirmed.matches ?? [];
}

export function confirmedImprovementRows(dashboard: Dashboard | null): JsonObject[] {
  return dashboard?.scoreTiers?.confirmed.improvements ?? [];
}

export function confirmedBreakageRows(dashboard: Dashboard | null): JsonObject[] {
  return dashboard?.scoreTiers?.confirmed.breakages ?? [];
}

export function confirmedRows(dashboard: Dashboard | null): JsonObject[] {
  return [...confirmedMatchRows(dashboard), ...confirmedImprovementRows(dashboard), ...confirmedBreakageRows(dashboard)];
}

export function tentativeMatchRows(dashboard: Dashboard | null): JsonObject[] {
  return dashboard?.scoreTiers?.tentative.matches ?? [];
}

export function tentativeImprovementRows(dashboard: Dashboard | null): JsonObject[] {
  return dashboard?.scoreTiers?.tentative.improvements ?? [];
}

export function tentativeRows(dashboard: Dashboard | null): JsonObject[] {
  return [...tentativeMatchRows(dashboard), ...tentativeImprovementRows(dashboard)];
}

export function reportRows(dashboard: Dashboard | null, mode: ImprovedMode, resultMode: ImprovedResultMode): JsonObject[] {
  if (mode === "confirmed") {
    if (resultMode === "matches") return confirmedMatchRows(dashboard);
    if (resultMode === "improvements") return confirmedImprovementRows(dashboard);
    return confirmedBreakageRows(dashboard);
  }
  return resultMode === "matches" ? tentativeMatchRows(dashboard) : tentativeImprovementRows(dashboard);
}

export function deltaColumnLabel(mode: ImprovedMode): string {
  return mode === "confirmed" ? "Score / Delta" : "Score Delta";
}

export function deltaColumnTitle(mode: ImprovedMode): string {
  if (mode === "confirmed") return "Boundary-validated score or improvement against the upstream baseline";
  return "Checkpoint score movement in the open epoch";
}

export function improvedEmptyText(_dashboard: Dashboard | null, mode: ImprovedMode, resultMode: ImprovedResultMode): string {
  const noun = resultMode;
  if (mode === "confirmed") return `No confirmed ${noun} against upstream yet`;
  return "No tentative wins yet this epoch";
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
  if (scoreLabel) return Number(scoreLabel.replace("%", "")) === 100 ? "100%" : scoreLabel;
  const directScore = Number(entry.score);
  if (entry.score != null && Number.isFinite(directScore)) return directScore === 100 ? "100%" : pct(directScore);
  const fromPercent = Number(entry.fromPercent);
  const toPercent = Number(entry.toPercent);
  if (Number.isFinite(fromPercent) && Number.isFinite(toPercent)) return `${fromPercent.toFixed(2)}% -> ${toPercent.toFixed(2)}%`;
  const directDelta = Number(entry.delta);
  if (entry.delta != null && Number.isFinite(directDelta)) return `${delta(directDelta)} pp`;
  return pct(entry.toPercent);
}

export function rowDelta(entry: JsonObject): string {
  const directDelta = Number(entry.delta);
  if (entry.delta != null && Number.isFinite(directDelta)) return `${delta(directDelta)} pp`;
  return text(entry.deltaLabel) || `${signedWhole(entry.bytesDelta)}b`;
}

export function rowDeltaTitle(entry: JsonObject): string {
  return text(entry.deltaTitle) || `${pct(entry.fromPercent)} -> ${pct(entry.toPercent)}`;
}

export function rowDeltaClass(entry: JsonObject): string {
  const raw = Number(entry.delta ?? entry.totalDelta ?? entry.bytesDelta);
  if (!Number.isFinite(raw) || raw === 0) return "text-dim";
  return raw > 0 ? "text-up" : "text-down";
}

export function rowUpstreamState(entry: JsonObject): string {
  if (entry.state === "in_branch") return "In branch";
  if (entry.state === "in_upstream") return "In upstream";
  return "-";
}
