import { readFile, writeFile } from "node:fs/promises";
import { EXACT_SCORE } from "./constants.js";

const UNIT_KEYS_TO_DIFF = [
  "fuzzy_match_percent",
  "matched_code_percent",
  "matched_data_percent",
  "complete_code_percent",
  "complete_data_percent",
] as const;

const FUNCTION_KEYS_TO_DIFF = ["fuzzy_match_percent"] as const;
const SECTION_KEYS_TO_DIFF = ["fuzzy_match_percent"] as const;

type MetricKey =
  | (typeof UNIT_KEYS_TO_DIFF)[number]
  | (typeof FUNCTION_KEYS_TO_DIFF)[number]
  | (typeof SECTION_KEYS_TO_DIFF)[number];

export interface MetricValues {
  fuzzy_match_percent?: unknown;
  matched_code_percent?: unknown;
  matched_data_percent?: unknown;
  complete_code_percent?: unknown;
  complete_data_percent?: unknown;
  matched_code?: unknown;
  matched_data?: unknown;
  size?: unknown;
}

interface ReportRow {
  name: string;
  from?: MetricValues;
  to?: MetricValues;
  metadata?: { virtual_address?: unknown };
  movedAcrossUnits?: boolean;
}

interface ReportUnit extends ReportRow {
  sections?: ReportRow[];
  functions?: ReportRow[];
}

interface ObjdiffReportChanges {
  from?: MetricValues;
  to?: MetricValues;
  units?: ReportUnit[];
}

export interface MetricChange {
  name: string | null;
  key: string;
  from: number;
  to: number;
}

export interface ReportEntry {
  unitName: string;
  itemName: string;
  sourcePath: string;
  size: number;
  fromPercent: number;
  toPercent: number;
  bytesDelta: number;
}

export interface RenamedFunction {
  unitName: string;
  fromName: string;
  toName: string;
  address: string | null;
  size: number;
  fromPercent: number;
  toPercent: number;
  pairedBy: "address" | "size";
}

export interface MovedUnit {
  from: string;
  to: string;
}

export interface RegressionReportSummary {
  matchedCodePercentFrom: number;
  matchedCodePercentTo: number;
  matchedCodePercentDelta: number;
  matchedCodeBytesFrom: number;
  matchedCodeBytesTo: number;
  matchedCodeBytesDelta: number;
  matchedDataPercentFrom: number;
  matchedDataPercentTo: number;
  matchedDataPercentDelta: number;
  matchedDataBytesFrom: number;
  matchedDataBytesTo: number;
  matchedDataBytesDelta: number;
}

export type PrPromotionStatus = "pr_ready" | "local_only" | "blocked";

export interface PrPromotionPolicy {
  minNewMatches: number;
  minMatchedCodeBytesDelta: number;
  minMatchedDataBytesDelta: number;
  minUnmatchedImprovementBytes: number;
}

export interface PrPromotionEvidence {
  newMatches: number;
  matchedCodeBytesDelta: number;
  matchedDataBytesDelta: number;
  unmatchedImprovementBytes: number;
  significantUnmatchedImprovements: number;
  brokenMatches: number;
  fuzzyRegressions: number;
  metricRegressions: number;
}

export interface PrPromotionEvaluation {
  status: PrPromotionStatus;
  label: string;
  reasons: string[];
  blockers: string[];
  evidence: PrPromotionEvidence;
  policy: PrPromotionPolicy;
}

export interface RegressionReport {
  regressions: MetricChange[];
  progressions: MetricChange[];
  newMatches: ReportEntry[];
  brokenMatches: ReportEntry[];
  improvements: ReportEntry[];
  fuzzyRegressions: ReportEntry[];
  renames: RenamedFunction[];
  movedUnits: MovedUnit[];
  summary: RegressionReportSummary;
  promotion: PrPromotionEvaluation;
  markdown: string;
}

function sameItem(row: ReportRow, candidate: ReportRow, includeName: boolean): boolean {
  if (includeName && row.name !== candidate.name) return false;
  const address = rowAddress(row);
  const candidateAddress = rowAddress(candidate);
  if (address === null || candidateAddress === null || address !== candidateAddress) return false;
  const size = toNumber(row.from?.size ?? row.to?.size);
  const candidateSize = toNumber(candidate.to?.size ?? candidate.from?.size);
  return size <= 0 || candidateSize <= 0 || size === candidateSize;
}

function resolveCrossUnitMoves(report: ObjdiffReportChanges): { report: ObjdiffReportChanges; movedUnits: MovedUnit[] } {
  const units = asArray<ReportUnit>(report.units).map((unit) => ({
    ...unit,
    functions: asArray<ReportRow>(unit.functions).map((row) => ({ ...row })),
    sections: asArray<ReportRow>(unit.sections).map((row) => ({ ...row })),
  }));
  const pairedSourceFunctions = new Map<string, Set<ReportRow>>();
  const pairedSourceSections = new Map<string, Set<ReportRow>>();
  const destinations = new Map<string, Set<string>>();

  const pairRows = (kind: "functions" | "sections", includeName: boolean): void => {
    const targets = units.flatMap((unit) =>
      asArray<ReportRow>(unit[kind])
        .filter((row) => row.to != null)
        .map((row) => ({ unit, row })),
    );
    const usedTargets = new Set<ReportRow>();
    for (const sourceUnit of units) {
      const sourceRows = asArray<ReportRow>(sourceUnit[kind]).filter((row) => row.from != null && row.to == null);
      for (const sourceRow of sourceRows) {
        const matches = targets.filter(({ unit, row }) => {
          if (unit.name === sourceUnit.name || usedTargets.has(row)) return false;
          if (kind === "sections") {
            return sourceRow.name === row.name && rowAddress(sourceRow) !== null && rowAddress(sourceRow) === rowAddress(row);
          }
          return sameItem(sourceRow, row, includeName);
        });
        if (matches.length !== 1) continue;
        const target = matches[0]!;
        usedTargets.add(target.row);
        if (target.row.from == null) target.row.from = sourceRow.from;
        target.row.movedAcrossUnits = true;
        const sourceList = sourceUnit[kind] as ReportRow[];
        sourceList.splice(sourceList.indexOf(sourceRow), 1);
        if (kind === "functions") {
          const paired = pairedSourceFunctions.get(sourceUnit.name) ?? new Set<ReportRow>();
          paired.add(sourceRow);
          pairedSourceFunctions.set(sourceUnit.name, paired);
          const movedTo = destinations.get(sourceUnit.name) ?? new Set<string>();
          movedTo.add(target.unit.name);
          destinations.set(sourceUnit.name, movedTo);
        } else {
          const paired = pairedSourceSections.get(sourceUnit.name) ?? new Set<ReportRow>();
          paired.add(sourceRow);
          pairedSourceSections.set(sourceUnit.name, paired);
          const movedTo = destinations.get(sourceUnit.name) ?? new Set<string>();
          movedTo.add(target.unit.name);
          destinations.set(sourceUnit.name, movedTo);
        }
      }
    }
  };

  pairRows("functions", false);
  pairRows("sections", true);

  const movedUnits: MovedUnit[] = [];
  for (const unit of units) {
    if (unit.from == null || unit.to != null) continue;
    const baselineFunctions = asArray<ReportRow>(report.units?.find((entry) => entry.name === unit.name)?.functions)
      .filter((row) => row.from != null);
    const baselineSections = asArray<ReportRow>(report.units?.find((entry) => entry.name === unit.name)?.sections)
      .filter((row) => row.from != null);
    const functionsMoved = baselineFunctions.length > 0 && pairedSourceFunctions.get(unit.name)?.size === baselineFunctions.length;
    const dataOnlyUnitMoved = baselineFunctions.length === 0 && baselineSections.length > 0 && pairedSourceSections.get(unit.name)?.size === baselineSections.length;
    if (!functionsMoved && !dataOnlyUnitMoved) continue;
    unit.from = undefined;
    for (const to of [...(destinations.get(unit.name) ?? [])].sort()) movedUnits.push({ from: unit.name, to });
  }
  movedUnits.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { report: { ...report, units }, movedUnits };
}

export const DEFAULT_PR_PROMOTION_POLICY: PrPromotionPolicy = {
  minNewMatches: 1,
  minMatchedCodeBytesDelta: 1,
  minMatchedDataBytesDelta: 1,
  minUnmatchedImprovementBytes: 0,
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function metricValue(row: ReportRow | ObjdiffReportChanges, side: "from" | "to", key: MetricKey): number {
  return toNumber(row[side]?.[key]);
}

function sizeOf(row: ReportRow): number {
  return toNumber(row.to?.size ?? row.from?.size);
}

function bytesDelta(size: number, fromPercent: number, toPercent: number): number {
  const delta = (size * (toPercent - fromPercent)) / 100.0;
  return delta < 0 ? Math.trunc(delta - 0.5) : Math.trunc(delta + 0.5);
}

function rowAddress(row: ReportRow): string | null {
  const address = row.metadata?.virtual_address;
  if (typeof address === "string" && address.trim() !== "") return address;
  if (typeof address === "number" && Number.isFinite(address)) return String(address);
  return null;
}

/**
 * Upstream merges rename symbols (e.g. `fn_8002F488` -> `Camera_SetBounds`),
 * which a name-keyed diff misreads as one lost match plus one new function.
 * Pair removed (from-only) and added (to-only) rows within a unit — exactly by
 * virtual address when both sides carry it, otherwise conservatively by
 * matching size with a non-regressing percent — and merge each pair into a
 * single row under the new name. Unpaired removals fall through unchanged and
 * still count as regressions (fail-closed).
 */
function resolveFunctionRenames(unit: ReportUnit): { rows: ReportRow[]; renames: RenamedFunction[] } {
  const rows = asArray<ReportRow>(unit.functions);
  const removed: ReportRow[] = [];
  const added: ReportRow[] = [];
  const resolved: ReportRow[] = [];
  for (const row of rows) {
    const hasFrom = row.from != null;
    const hasTo = row.to != null;
    if (hasFrom && !hasTo) removed.push(row);
    else if (hasTo && !hasFrom) added.push(row);
    else resolved.push(row);
  }
  if (removed.length === 0 || added.length === 0) {
    return { rows, renames: [] };
  }

  const renames: RenamedFunction[] = [];
  const pairedAdded = new Set<ReportRow>();
  const pair = (removedRow: ReportRow, addedRow: ReportRow, pairedBy: RenamedFunction["pairedBy"]): void => {
    pairedAdded.add(addedRow);
    const merged: ReportRow = { name: addedRow.name, from: removedRow.from, to: addedRow.to, metadata: addedRow.metadata };
    resolved.push(merged);
    renames.push({
      unitName: unit.name,
      fromName: removedRow.name,
      toName: addedRow.name,
      address: rowAddress(addedRow) ?? rowAddress(removedRow),
      size: sizeOf(merged),
      fromPercent: toNumber(removedRow.from?.fuzzy_match_percent),
      toPercent: toNumber(addedRow.to?.fuzzy_match_percent),
      pairedBy,
    });
  };

  // Pass 1: exact pairing by virtual address (only when the address is unambiguous).
  const addedByAddress = new Map<string, ReportRow | null>();
  for (const row of added) {
    const address = rowAddress(row);
    if (address === null) continue;
    addedByAddress.set(address, addedByAddress.has(address) ? null : row);
  }
  const fallbackRemoved: ReportRow[] = [];
  for (const row of removed) {
    const address = rowAddress(row);
    const candidate = address !== null ? addedByAddress.get(address) : undefined;
    if (candidate && !pairedAdded.has(candidate)) pair(row, candidate, "address");
    else fallbackRemoved.push(row);
  }

  // Pass 2: conservative fallback for rows without address metadata. Pair only
  // when sizes agree (when known) and the new percent does not regress; on
  // ambiguity require an identical size+percent match, else leave unpaired.
  for (const row of fallbackRemoved) {
    if (rowAddress(row) !== null && addedByAddress.size > 0) {
      // The removed row has an address but no added row shares it: genuinely gone.
      resolved.push(row);
      continue;
    }
    const fromPercent = toNumber(row.from?.fuzzy_match_percent);
    const fromSize = toNumber(row.from?.size);
    const candidates = added.filter((entry) => {
      if (pairedAdded.has(entry)) return false;
      const toSize = toNumber(entry.to?.size);
      if (fromSize > 0 && toSize > 0 && fromSize !== toSize) return false;
      return toNumber(entry.to?.fuzzy_match_percent) >= fromPercent;
    });
    if (candidates.length === 1) {
      pair(row, candidates[0]!, "size");
      continue;
    }
    const exact = candidates.find(
      (entry) => toNumber(entry.to?.size) === fromSize && toNumber(entry.to?.fuzzy_match_percent) === fromPercent,
    );
    if (exact) pair(row, exact, "size");
    else resolved.push(row);
  }

  resolved.push(...added.filter((row) => !pairedAdded.has(row)));
  return { rows: resolved, renames };
}

function formatFloat(value: number): string {
  const clamped = value < 100.0 && value > 99.99 ? 99.99 : value;
  return clamped.toFixed(2).padStart(6, " ");
}

function formatPercent(value: number): string {
  return `${formatFloat(value).trim()}%`;
}

function formatDeltaPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDeltaBytes(value: number): string {
  return `${value >= 0 ? "+" : ""}${value} bytes`;
}

function normalizePrPromotionPolicy(policy?: Partial<PrPromotionPolicy>): PrPromotionPolicy {
  return {
    ...DEFAULT_PR_PROMOTION_POLICY,
    ...(policy ?? {}),
  };
}

function positiveBytes(entries: ReportEntry[]): number {
  return entries.reduce((total, entry) => total + Math.max(entry.bytesDelta, 0), 0);
}

function diffKey(
  regressions: MetricChange[],
  progressions: MetricChange[],
  name: string | null,
  row: ReportRow | ObjdiffReportChanges,
  key: MetricKey,
): void {
  const from = metricValue(row, "from", key);
  const to = metricValue(row, "to", key);
  const change: MetricChange = {
    name,
    key: key.endsWith("_percent") ? key.slice(0, -"_percent".length) : key,
    from,
    to,
  };
  if (from > to) regressions.push(change);
  else if (to > from) progressions.push(change);
}

function metricChanges(report: ObjdiffReportChanges): Pick<RegressionReport, "regressions" | "progressions"> {
  const regressions: MetricChange[] = [];
  const progressions: MetricChange[] = [];

  for (const key of UNIT_KEYS_TO_DIFF) {
    diffKey(regressions, progressions, null, report, key);
  }

  for (const unit of asArray<ReportUnit>(report.units)) {
    for (const key of UNIT_KEYS_TO_DIFF) {
      diffKey(regressions, progressions, unit.name, unit, key);
    }
    for (const section of asArray<ReportRow>(unit.sections)) {
      for (const key of SECTION_KEYS_TO_DIFF) {
        diffKey(regressions, progressions, `${unit.name}::${section.name}`, section, key);
      }
    }
    for (const func of resolveFunctionRenames(unit).rows) {
      for (const key of FUNCTION_KEYS_TO_DIFF) {
        diffKey(regressions, progressions, func.name, func, key);
      }
    }
  }

  return { regressions, progressions };
}

function reportSummary(report: ObjdiffReportChanges): RegressionReportSummary {
  const from = report.from ?? {};
  const to = report.to ?? {};
  const matchedCodePercentFrom = toNumber(from.matched_code_percent);
  const matchedCodePercentTo = toNumber(to.matched_code_percent);
  const matchedCodeBytesFrom = toNumber(from.matched_code);
  const matchedCodeBytesTo = toNumber(to.matched_code);
  const matchedDataPercentFrom = toNumber(from.matched_data_percent);
  const matchedDataPercentTo = toNumber(to.matched_data_percent);
  const matchedDataBytesFrom = toNumber(from.matched_data);
  const matchedDataBytesTo = toNumber(to.matched_data);
  return {
    matchedCodePercentFrom,
    matchedCodePercentTo,
    matchedCodePercentDelta: matchedCodePercentTo - matchedCodePercentFrom,
    matchedCodeBytesFrom,
    matchedCodeBytesTo,
    matchedCodeBytesDelta: matchedCodeBytesTo - matchedCodeBytesFrom,
    matchedDataPercentFrom,
    matchedDataPercentTo,
    matchedDataPercentDelta: matchedDataPercentTo - matchedDataPercentFrom,
    matchedDataBytesFrom,
    matchedDataBytesTo,
    matchedDataBytesDelta: matchedDataBytesTo - matchedDataBytesFrom,
  };
}

function sortedEntries(report: ObjdiffReportChanges): Omit<
  RegressionReport,
  "regressions" | "progressions" | "movedUnits" | "summary" | "promotion" | "markdown"
> {
  const newMatches: ReportEntry[] = [];
  const brokenMatches: ReportEntry[] = [];
  const improvements: ReportEntry[] = [];
  const fuzzyRegressions: ReportEntry[] = [];
  const renames: RenamedFunction[] = [];

  for (const unit of asArray<ReportUnit>(report.units)) {
    const metadata = (unit as { metadata?: { source_path?: unknown } }).metadata ?? {};
    const sourcePath = typeof metadata.source_path === "string" ? metadata.source_path : "";
    const resolvedFunctions = resolveFunctionRenames(unit);
    renames.push(...resolvedFunctions.renames);
    const rows = [
      ...asArray<ReportRow>(unit.sections).filter((row) => row.name !== ".text"),
      ...resolvedFunctions.rows,
    ];
    for (const row of rows) {
      const fromPercent = toNumber(row.from?.fuzzy_match_percent);
      const toPercent = toNumber(row.to?.fuzzy_match_percent);
      if (fromPercent === toPercent) continue;
      if (row.movedAcrossUnits && toPercent < fromPercent) continue;
      const size = sizeOf(row);
      const entry: ReportEntry = {
        unitName: unit.name,
        itemName: row.name,
        sourcePath,
        size,
        fromPercent,
        toPercent,
        bytesDelta: bytesDelta(size, fromPercent, toPercent),
      };
      if (fromPercent >= EXACT_SCORE && toPercent < EXACT_SCORE) brokenMatches.push(entry);
      else if (fromPercent < EXACT_SCORE && toPercent >= EXACT_SCORE) newMatches.push(entry);
      else if (toPercent > fromPercent) improvements.push(entry);
      else fuzzyRegressions.push(entry);
    }
  }

  newMatches.sort((a, b) => b.bytesDelta - a.bytesDelta);
  brokenMatches.sort((a, b) => a.bytesDelta - b.bytesDelta);
  improvements.sort((a, b) => b.bytesDelta - a.bytesDelta);
  fuzzyRegressions.sort((a, b) => a.bytesDelta - b.bytesDelta);
  return { newMatches, brokenMatches, improvements, fuzzyRegressions, renames };
}

function reportTable(entries: ReportEntry[], maxRows: number): string[] {
  const shown = maxRows <= 0 ? entries : entries.slice(0, maxRows);
  if (shown.length === 0) return ["No entries."];

  const lines = ["| Unit | Item | Bytes | Before | After |", "| - | - | - | - | - |"];
  for (const entry of shown) {
    lines.push(
      `| \`${entry.unitName}\` | \`${entry.itemName}\` | ${entry.bytesDelta >= 0 ? "+" : ""}${entry.bytesDelta} | ${formatPercent(entry.fromPercent)} | ${formatPercent(entry.toPercent)} |`,
    );
  }
  if (maxRows > 0 && entries.length > maxRows) {
    lines.push("", `...and ${entries.length - maxRows} more`);
  }
  return lines;
}

function renameSection(renames: RenamedFunction[], maxRows: number): string[] {
  const shown = maxRows <= 0 ? renames : renames.slice(0, maxRows);
  const lines = ["<details>", `<summary>${renames.length} renamed functions (paired, not regressions)</summary>`, ""];
  if (shown.length === 0) {
    lines.push("No entries.");
  } else {
    lines.push("| Unit | Before | After | Paired by | Before % | After % |", "| - | - | - | - | - | - |");
    for (const rename of shown) {
      lines.push(
        `| \`${rename.unitName}\` | \`${rename.fromName}\` | \`${rename.toName}\` | ${rename.pairedBy} | ${formatPercent(rename.fromPercent)} | ${formatPercent(rename.toPercent)} |`,
      );
    }
    if (maxRows > 0 && renames.length > maxRows) {
      lines.push("", `...and ${renames.length - maxRows} more`);
    }
  }
  lines.push("</details>");
  return lines;
}

function movedUnitSection(movedUnits: MovedUnit[], maxRows: number): string[] {
  const shown = maxRows <= 0 ? movedUnits : movedUnits.slice(0, maxRows);
  const lines = ["<details>", `<summary>${movedUnits.length} moved units (paired, not regressions)</summary>`, ""];
  if (shown.length === 0) lines.push("No entries.");
  else {
    lines.push("| Before | After |", "| - | - |");
    for (const move of shown) lines.push(`| \`${move.from}\` | \`${move.to}\` |`);
    if (maxRows > 0 && movedUnits.length > maxRows) lines.push("", `...and ${movedUnits.length - maxRows} more`);
  }
  lines.push("</details>");
  return lines;
}

function reportSection(title: string, entries: ReportEntry[], maxRows: number, open = false): string[] {
  return [
    `<details${open ? " open" : ""}>`,
    `<summary>${entries.length} ${title}</summary>`,
    "",
    ...reportTable(entries, maxRows),
    "</details>",
  ];
}

export function evaluatePrPromotion(
  report: Pick<RegressionReport, "regressions" | "newMatches" | "brokenMatches" | "improvements" | "fuzzyRegressions" | "summary">,
  policy?: Partial<PrPromotionPolicy>,
): PrPromotionEvaluation {
  const effectivePolicy = normalizePrPromotionPolicy(policy);
  const unmatchedImprovementBytes = positiveBytes(report.improvements);
  const significantUnmatchedImprovements =
    effectivePolicy.minUnmatchedImprovementBytes > 0
      ? report.improvements.filter((entry) => entry.bytesDelta >= effectivePolicy.minUnmatchedImprovementBytes).length
      : 0;
  const evidence: PrPromotionEvidence = {
    newMatches: report.newMatches.length,
    matchedCodeBytesDelta: report.summary.matchedCodeBytesDelta,
    matchedDataBytesDelta: report.summary.matchedDataBytesDelta,
    unmatchedImprovementBytes,
    significantUnmatchedImprovements,
    brokenMatches: report.brokenMatches.length,
    fuzzyRegressions: report.fuzzyRegressions.length,
    metricRegressions: report.regressions.length,
  };

  const blockers: string[] = [];
  if (evidence.metricRegressions > 0) blockers.push(`${evidence.metricRegressions} metric regression(s)`);
  if (evidence.brokenMatches > 0) blockers.push(`${evidence.brokenMatches} broken exact match(es)`);
  if (evidence.fuzzyRegressions > 0) blockers.push(`${evidence.fuzzyRegressions} unmatched-item fuzzy regression(s)`);
  if (blockers.length > 0) {
    return {
      status: "blocked",
      label: "blocked",
      reasons: ["Fix regressions before considering PR promotion."],
      blockers,
      evidence,
      policy: effectivePolicy,
    };
  }

  const reasons: string[] = [];
  if (effectivePolicy.minNewMatches > 0 && evidence.newMatches >= effectivePolicy.minNewMatches) {
    reasons.push(`${evidence.newMatches} new exact match(es) meets the promotion policy.`);
  }
  if (effectivePolicy.minMatchedCodeBytesDelta > 0 && evidence.matchedCodeBytesDelta >= effectivePolicy.minMatchedCodeBytesDelta) {
    reasons.push(`${formatDeltaBytes(evidence.matchedCodeBytesDelta)} matched code meets the promotion policy.`);
  }
  if (effectivePolicy.minMatchedDataBytesDelta > 0 && evidence.matchedDataBytesDelta >= effectivePolicy.minMatchedDataBytesDelta) {
    reasons.push(`${formatDeltaBytes(evidence.matchedDataBytesDelta)} matched data meets the promotion policy.`);
  }
  if (
    effectivePolicy.minUnmatchedImprovementBytes > 0 &&
    evidence.unmatchedImprovementBytes >= effectivePolicy.minUnmatchedImprovementBytes
  ) {
    reasons.push(`${formatDeltaBytes(evidence.unmatchedImprovementBytes)} unmatched-item fuzzy improvement meets the explicit promotion policy.`);
  }
  if (reasons.length > 0) {
    return {
      status: "pr_ready",
      label: "PR-ready",
      reasons,
      blockers,
      evidence,
      policy: effectivePolicy,
    };
  }

  const localReasons = [
    "No exact new match or matched code/data byte movement met the promotion policy.",
  ];
  if (evidence.unmatchedImprovementBytes > 0) {
    localReasons.push("Fuzzy-only improvements are local evidence by default because match percent can rise without proving review-worthy correctness.");
  }
  return {
    status: "local_only",
    label: "local-only evidence",
    reasons: localReasons,
    blockers,
    evidence,
    policy: effectivePolicy,
  };
}

function promotionSection(promotion: PrPromotionEvaluation): string[] {
  return [
    `<details${promotion.status !== "pr_ready" ? " open" : ""}>`,
    `<summary>PR promotion gate: ${promotion.label}</summary>`,
    "",
    ...promotion.reasons.map((reason) => `- ${reason}`),
    ...(promotion.blockers.length > 0 ? ["", ...promotion.blockers.map((blocker) => `- Blocker: ${blocker}`)] : []),
    "",
    `Evidence: ${promotion.evidence.newMatches} new exact match(es), ${formatDeltaBytes(promotion.evidence.matchedCodeBytesDelta)} matched code, ${formatDeltaBytes(promotion.evidence.matchedDataBytesDelta)} matched data, ${formatDeltaBytes(promotion.evidence.unmatchedImprovementBytes)} unmatched-item fuzzy movement.`,
    "</details>",
  ];
}

function generateMarkdown(report: ObjdiffReportChanges, title: string, maxRows: number, movedUnits: MovedUnit[], policy?: Partial<PrPromotionPolicy>): string {
  const changes = metricChanges(report);
  const entries = sortedEntries(report);
  const summary = reportSummary(report);
  const promotion = evaluatePrPromotion({ ...changes, ...entries, summary }, policy);
  const lines = [
    `### ${title}`,
    "",
    `**Matched code**: ${formatPercent(summary.matchedCodePercentTo)} (${formatDeltaPercent(summary.matchedCodePercentDelta)}, ${formatDeltaBytes(summary.matchedCodeBytesDelta)})`,
    `**Matched data**: ${formatPercent(summary.matchedDataPercentTo)} (${formatDeltaPercent(summary.matchedDataPercentDelta)}, ${formatDeltaBytes(summary.matchedDataBytesDelta)})`,
    "",
    ...promotionSection(promotion),
    "",
    ...reportSection("new matches", entries.newMatches, maxRows),
    "",
    ...reportSection("broken matches", entries.brokenMatches, maxRows, entries.brokenMatches.length > 0),
    "",
    ...reportSection("improvements in unmatched items", entries.improvements, maxRows),
    "",
    ...reportSection("regressions in unmatched items", entries.fuzzyRegressions, maxRows, entries.fuzzyRegressions.length > 0),
    "",
    ...renameSection(entries.renames, maxRows),
    "",
    ...movedUnitSection(movedUnits, maxRows),
    "",
  ];
  return lines.join("\n");
}

export function buildRegressionReport(
  raw: unknown,
  title: string,
  maxRows: number,
  promotionPolicy?: Partial<PrPromotionPolicy>,
): RegressionReport {
  const original = asRecord(raw) as ObjdiffReportChanges;
  const { report, movedUnits } = resolveCrossUnitMoves(original);
  const changes = metricChanges(report);
  const entries = sortedEntries(report);
  const summary = reportSummary(report);
  const promotion = evaluatePrPromotion({ ...changes, ...entries, summary }, promotionPolicy);
  return {
    ...changes,
    ...entries,
    movedUnits,
    summary,
    promotion,
    markdown: generateMarkdown(report, title, maxRows, movedUnits, promotionPolicy),
  };
}

export async function readRegressionReport(
  reportChangesPath: string,
  title: string,
  maxRows: number,
  promotionPolicy?: Partial<PrPromotionPolicy>,
): Promise<RegressionReport> {
  const raw = JSON.parse(await readFile(reportChangesPath, "utf8")) as unknown;
  return buildRegressionReport(raw, title, maxRows, promotionPolicy);
}

export async function writePrReport(
  reportChangesPath: string,
  outputPath: string,
  title: string,
  maxRows: number,
  promotionPolicy?: Partial<PrPromotionPolicy>,
): Promise<RegressionReport> {
  const report = await readRegressionReport(reportChangesPath, title, maxRows, promotionPolicy);
  await writeFile(outputPath, report.markdown);
  return report;
}
