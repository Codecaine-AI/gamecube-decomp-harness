import { existsSync, readFileSync } from "node:fs";
import type { BoardMeasures } from "@server/core/shared/types/index.js";
import { EXACT_SCORE } from "@server/core/validation/objdiff/constants.js";
import { evaluatePrPromotion, renderRegressionMarkdown, type RegressionReport, type RegressionReportSummary, type ReportEntry } from "@server/core/validation/objdiff/report.js";
import { completionIndexUnknown, isUnverifiedTarget, type UnverifiedIndex } from "./candidates.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";

/**
 * Progress metrics with `unverified_match` functions withheld.
 *
 * An active `unverified_match` function is not done, whatever its score. From
 * an objdiff report (game measures and each unit's measures) the helper:
 *
 * - removes every active unverified function's fuzzy contribution (its score
 *   is unverified, so it counts as 0%, never as partial credit);
 * - moves exact (100%) unverified functions out of the matched function and
 *   code counts, back into the unmatched targets;
 * - drops a complete unit holding any of them from the complete units and code/data;
 * - reports what it withheld as the separate "100% but unverified" figure
 *   (`unverified_*` keys, zeros included).
 *
 * The `unverified_*` keys mark measures as adjusted. Stored measures are
 * re-derived from their raw archived report (never by subtracting again from
 * already adjusted figures), so the current active rows apply exactly once.
 * Without an index (Melee, steering gate off) or with an empty one, the
 * report's own measures come back untouched and unmarked. The report itself
 * is never modified. Under `UNKNOWN_COMPLETION_INDEX` (the steering state
 * could not be read) every completion metric is unknown (null,
 * `unverified_unbounded`), never the raw credit.
 */

/**
 * Completion holds that depend on the saved revision a figure measures: a
 * rollback hold stops withholding a saved revision only when a certifying
 * rev is an ancestor of it, so each stored report is withheld under its own
 * revision's index (`at(commitSha)`), never the live head's. `unknown`: the
 * state could not be read, and `at` returns `UNKNOWN_COMPLETION_INDEX`.
 */
export interface RevisionCompletionIndex {
  readonly unknown: boolean;
  /** Keys withheld from the figures saved at `rev`; a missing rev clears no rollback. */
  at(rev: string | null | undefined): UnverifiedIndex;
}

/** A plain index (the same keys for every revision) or a revision-aware one. */
export type CompletionIndexSource = UnverifiedIndex | RevisionCompletionIndex;

export function isRevisionCompletionIndex(source: CompletionIndexSource | null | undefined): source is RevisionCompletionIndex {
  return Boolean(source) && !(source instanceof Map) && !(source instanceof Set)
    && typeof (source as Partial<RevisionCompletionIndex>).at === "function";
}

/** The index a figure saved at `rev` is withheld under; undefined (raw) without a source. */
export function completionIndexAt(source: CompletionIndexSource | null | undefined, rev: string | null | undefined): UnverifiedIndex | undefined {
  if (!source) return undefined;
  return isRevisionCompletionIndex(source) ? source.at(rev) : source;
}

export interface UnverifiedMeasures {
  /** Exact unverified functions withheld from the matched counts: the "100% but unverified" count. */
  unverified_functions: number;
  /** Their bytes. */
  unverified_code: number;
  /** Their share of the total code: the "100% but unverified" figure next to matched code (null without a total). */
  unverified_code_percent: number | null;
  /** Every active unverified function in the report, any score. */
  unverified_targets: number;
  /** Fuzzy match withheld (percent of the total code), all active unverified functions (null without a total). */
  unverified_fuzzy_percent: number | null;
  /** Complete units withheld because they hold an active unverified function (any score). */
  unverified_complete_units: number;
}

export type WithheldMeasures = BoardMeasures & JsonObject;

export interface WithheldUnverifiedReport {
  measures: WithheldMeasures;
  /** Unit name -> that unit's measures with the same withholding (only units that report measures). */
  units: Map<string, WithheldMeasures>;
}

interface Withheld {
  functions: number;
  code: number;
  targets: number;
  /** Sum of fuzzy * size over withheld functions. */
  fuzzyWeight: number;
  completeUnits: number;
  completeCode: number;
  completeData: number;
}

function emptyWithheld(): Withheld {
  return { functions: 0, code: 0, targets: 0, fuzzyWeight: 0, completeUnits: 0, completeCode: 0, completeData: 0 };
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Number(((part / whole) * 100).toFixed(5));
}

function finite(value: unknown): number | null {
  const number = numberValue(value, NaN);
  return Number.isFinite(number) ? number : null;
}

function unitIsComplete(unit: JsonObject): boolean {
  const measures = asObject(unit.measures);
  if (finite(measures.complete_units) !== null) return numberValue(measures.complete_units) > 0;
  return asObject(unit.metadata).complete === true;
}

function unitWithheld(unit: JsonObject, unverified: UnverifiedIndex): Withheld {
  const unitName = stringValue(unit.name);
  const withheld = emptyWithheld();
  for (const fnValue of asArray(unit.functions)) {
    const fn = asObject(fnValue);
    const symbol = stringValue(fn.name);
    if (!symbol || !isUnverifiedTarget(unverified, `${unitName}::${symbol}`)) continue;
    const size = numberValue(fn.size);
    const fuzzy = numberValue(fn.fuzzy_match_percent, 100);
    withheld.targets += 1;
    withheld.fuzzyWeight += fuzzy * size;
    if (fuzzy >= EXACT_SCORE) {
      withheld.functions += 1;
      withheld.code += size;
    }
  }
  // Any active unverified function, exact or not, keeps its unit from counting as complete.
  if (withheld.targets > 0 && unitIsComplete(unit)) {
    const measures = asObject(unit.measures);
    withheld.completeUnits = 1;
    // NaN: the unit's complete bytes are unknown, so a game figure that needs them becomes unknown.
    withheld.completeCode = finite(measures.complete_code) ?? finite(measures.total_code) ?? NaN;
    withheld.completeData = finite(measures.complete_data) ?? finite(measures.total_data) ?? NaN;
  }
  return withheld;
}

/**
 * Withholds `amount` from a count and its percent of `totalKey`. A percent
 * the amount cannot be bounded against (no count and no total, or an unknown
 * amount) becomes null (unknown), never the raw credit; nothing withheld
 * leaves both as reported. Keys the measures do not report stay absent.
 */
function withholdRatio(next: JsonObject, measures: JsonObject, countKey: string, percentKey: string, totalKey: string, amount: number): void {
  if (amount === 0) return;
  const count = finite(measures[countKey]);
  const total = finite(measures[totalKey]);
  const reportedPercent = finite(measures[percentKey]);
  const known = Number.isFinite(amount);
  if (count !== null) next[countKey] = known ? Math.max(0, count - amount) : null;
  if (reportedPercent === null && !(percentKey in measures)) return;
  if (!known) next[percentKey] = null;
  else if (count !== null && total !== null) next[percentKey] = percent(next[countKey] as number, total);
  else if (reportedPercent !== null && total !== null) next[percentKey] = Math.max(0, Number((reportedPercent - percent(amount, total)).toFixed(5)));
  else next[percentKey] = null;
}

/** `measures` with `withheld` taken out; keys the measures do not report stay absent. */
function applyWithheld(measures: JsonObject, withheld: Withheld): WithheldMeasures {
  // Unknown (unboundable) figures are null in the JSON; readers treat them as missing.
  const next: JsonObject = { ...measures };
  const totalCode = finite(measures.total_code);

  withholdRatio(next, measures, "matched_functions", "matched_functions_percent", "total_functions", withheld.functions);
  withholdRatio(next, measures, "matched_code", "matched_code_percent", "total_code", withheld.code);

  // Fuzzy credit is size-weighted over the total code: without a denominator it is unknown.
  const fuzzyWithheld = totalCode !== null && totalCode > 0 ? withheld.fuzzyWeight / totalCode : withheld.targets > 0 ? NaN : 0;
  if (finite(measures.fuzzy_match_percent) !== null) {
    next.fuzzy_match_percent = Number.isFinite(fuzzyWithheld)
      ? Math.max(0, Number((numberValue(measures.fuzzy_match_percent) - fuzzyWithheld).toFixed(5)))
      : null;
  }

  withholdRatio(next, measures, "complete_units", "complete_units_percent", "total_units", withheld.completeUnits);
  withholdRatio(next, measures, "complete_code", "complete_code_percent", "total_code", withheld.completeCode);
  withholdRatio(next, measures, "complete_data", "complete_data_percent", "total_data", withheld.completeData);

  const unmatched = finite(measures.unmatched_targets);
  if (unmatched !== null) next.unmatched_targets = unmatched + withheld.functions;

  next.unverified_functions = withheld.functions;
  next.unverified_code = withheld.code;
  next.unverified_code_percent = totalCode !== null ? percent(withheld.code, totalCode) : null;
  next.unverified_targets = withheld.targets;
  next.unverified_fuzzy_percent = Number.isFinite(fuzzyWithheld) ? Number(fuzzyWithheld.toFixed(5)) : null;
  next.unverified_complete_units = withheld.completeUnits;
  return next as WithheldMeasures;
}

/**
 * The report's game and unit measures with active `unverified_match`
 * functions withheld. Identity (unmarked, empty unit map) without an index or
 * with an empty one.
 */
export function withholdUnverifiedReport(report: JsonObject, unverified: UnverifiedIndex | undefined): WithheldUnverifiedReport {
  const measures = asObject(report.measures) as WithheldMeasures;
  const units = new Map<string, WithheldMeasures>();
  if (completionIndexUnknown(unverified)) {
    for (const unitValue of asArray(report.units)) {
      const unit = asObject(unitValue);
      const name = stringValue(unit.name);
      if (name && Object.keys(asObject(unit.measures)).length > 0) units.set(name, unknownCompletion(asObject(unit.measures)) as WithheldMeasures);
    }
    return { measures: unknownCompletion(measures) as WithheldMeasures, units };
  }
  if (!unverified || unverified.size === 0) return { measures, units };
  const total = emptyWithheld();
  for (const unitValue of asArray(report.units)) {
    const unit = asObject(unitValue);
    const withheld = unitWithheld(unit, unverified);
    for (const key of Object.keys(total) as (keyof Withheld)[]) total[key] += withheld[key];
    const name = stringValue(unit.name);
    if (name && Object.keys(asObject(unit.measures)).length > 0) units.set(name, applyWithheld(asObject(unit.measures), withheld));
  }
  return { measures: applyWithheld(measures, total), units };
}

/** The report's game measures with active `unverified_match` functions withheld (see `withholdUnverifiedReport`). */
export function withholdUnverifiedMeasures(report: JsonObject, unverified: UnverifiedIndex | undefined): WithheldMeasures {
  return withholdUnverifiedReport(report, unverified).measures;
}

/** Completion metrics a stored figure cannot bound without its report: shown as unknown, never as raw done. */
export const UNVERIFIED_UNBOUNDED_KEYS = [
  "fuzzy_match_percent",
  "matched_code",
  "matched_code_percent",
  "matched_functions",
  "matched_functions_percent",
  "complete_code",
  "complete_code_percent",
  "complete_data",
  "complete_data_percent",
  "complete_units",
  "unmatched_targets",
] as const;

/**
 * Stored progress measures (save point, board artifact) as unverified-withheld
 * figures under the current active rows:
 *
 * - with a readable archived report, re-derived from that report's raw
 *   measures (the current index applied once, whatever the stored figures
 *   already withheld), so a row recorded or cleared since is honoured;
 * - without one, while rows are active, the completion metrics are unknown
 *   (null, `unverified_unbounded`): raw or stale figures could count an
 *   unverified function as done;
 * - without an index (Melee, gate off), stored measures come back unchanged.
 */
export function withholdUnverifiedStoredMeasures(
  measures: JsonObject,
  reportPath: string | null | undefined,
  unverified: UnverifiedIndex | undefined,
): JsonObject {
  if (!unverified) return measures;
  if (completionIndexUnknown(unverified)) return unknownCompletion(measures);
  const report = readReport(reportPath);
  if (report) return { ...withoutDerivedKeys(measures), ...withholdUnverifiedMeasures(report, unverified) };
  if (unverified.size === 0) return measures;
  const unbounded: JsonObject = { ...measures, unverified_unbounded: true };
  for (const key of UNVERIFIED_UNBOUNDED_KEYS) if (key in measures) unbounded[key] = null;
  return unbounded;
}

/**
 * Measures whose completion is unknown (the steering state could not be
 * read): every completion metric and stale withheld figure is null, marked
 * `unverified_unbounded`, whatever the measures already withheld.
 */
function unknownCompletion(measures: JsonObject): JsonObject {
  const unknown: JsonObject = { ...measures };
  for (const key of Object.keys(unknown)) if (key.startsWith("unverified_")) unknown[key] = null;
  for (const key of UNVERIFIED_UNBOUNDED_KEYS) if (key in measures) unknown[key] = null;
  unknown.unverified_unbounded = true;
  return unknown;
}

/** Stored measures without the figures a re-derivation replaces: a stale withheld count never survives it. */
function withoutDerivedKeys(measures: JsonObject): JsonObject {
  const next: JsonObject = {};
  const derived = new Set<string>(UNVERIFIED_UNBOUNDED_KEYS);
  for (const [key, value] of Object.entries(measures)) {
    if (!derived.has(key) && !key.startsWith("unverified_")) next[key] = value;
  }
  return next;
}

function readReport(reportPath: string | null | undefined): JsonObject | null {
  if (!reportPath || !existsSync(reportPath)) return null;
  try {
    const report = asObject(JSON.parse(readFileSync(reportPath, "utf8")));
    return Object.keys(asObject(report.measures)).length > 0 ? report : null;
  } catch {
    return null;
  }
}

/** A function the regression report's progress view withheld: still `unverified_match`. */
export type UnverifiedReportEntry = ReportEntry & { verification: "unverified_match" };

/**
 * A regression report (report_changes) as progress, while `unverified_match`
 * rows are active:
 *
 * - an active unverified function reaching 100% is not a new match (listed,
 *   flagged, with the improvements) and one leaving 100% is not a broken match
 *   (it was never done; listed with the fuzzy regressions);
 * - the matched code summary withholds active unverified functions on both
 *   sides: `to` is the epoch's withheld measures (`toMeasures`, so a function
 *   unverified on both sides is withheld too), the delta drops the withheld
 *   transitions, and `from` follows. Explicit `toMeasures` are authoritative:
 *   missing or unknown matched bytes leave both totals unknown, never raw.
 *   The transition delta can stay bounded independently of those totals;
 * - the promotion evidence is re-evaluated and the markdown is rendered from
 *   these entries, with the withheld rows in their own section, so the report
 *   never lists them as matches.
 *
 * Identity without an index, an empty one, or anything to withhold (no
 * transition and no `toMeasures`): Melee keeps its report byte for byte.
 */
export function withholdUnverifiedRegression<T extends RegressionReport>(
  report: T,
  unverified: UnverifiedIndex | undefined,
  options: { totalCode?: number | null; toMeasures?: JsonObject; title?: string; maxRows?: number } = {},
): T {
  if (!unverified || (unverified.size === 0 && !completionIndexUnknown(unverified))) return report;
  const withheld = (entry: ReportEntry) => isUnverifiedTarget(unverified, `${entry.unitName}::${entry.itemName}`);
  const flag = (entry: ReportEntry): UnverifiedReportEntry => ({ ...entry, verification: "unverified_match" });
  const newWithheld = report.newMatches.filter(withheld);
  const brokenWithheld = report.brokenMatches.filter(withheld);
  if (newWithheld.length === 0 && brokenWithheld.length === 0 && !options.toMeasures) return report;
  const size = (entries: ReportEntry[]) => entries.reduce((sum, entry) => sum + entry.size, 0);
  const bytesDelta = report.summary.matchedCodeBytesDelta - size(newWithheld) + size(brokenWithheld);
  const totalCode = finite(options.toMeasures?.total_code) ?? options.totalCode ?? null;
  const percentDelta = totalCode && totalCode > 0 ? percent(bytesDelta, totalCode) : NaN;
  const toBytes = options.toMeasures
    ? finite(options.toMeasures.matched_code) ?? NaN
    : report.summary.matchedCodeBytesTo - size(newWithheld);
  const toPercent = options.toMeasures
    ? finite(options.toMeasures.matched_code_percent) ?? NaN
    : totalCode && totalCode > 0 ? percent(toBytes, totalCode) : NaN;
  const summary: RegressionReportSummary = {
    ...report.summary,
    matchedCodeBytesTo: toBytes,
    matchedCodeBytesDelta: bytesDelta,
    matchedCodeBytesFrom: toBytes - bytesDelta,
    matchedCodePercentTo: toPercent,
    matchedCodePercentDelta: percentDelta,
    matchedCodePercentFrom: toPercent - percentDelta,
  };
  const entries = {
    newMatches: report.newMatches.filter((entry) => !withheld(entry)),
    brokenMatches: report.brokenMatches.filter((entry) => !withheld(entry)),
    improvements: [...newWithheld.map(flag), ...report.improvements],
    fuzzyRegressions: [...brokenWithheld.map(flag), ...report.fuzzyRegressions],
  };
  const promotion = evaluatePrPromotion({ ...report, ...entries, summary }, report.promotion.policy);
  const title = options.title ?? /^### (.*)$/m.exec(report.markdown)?.[1] ?? "Regression report";
  const unverifiedRows = [...newWithheld, ...brokenWithheld];
  const markdown = [
    renderRegressionMarkdown({ ...report, ...entries, summary, promotion }, title, options.maxRows ?? 50).trimEnd(),
    "",
    `**100% but unverified**: ${finite(options.toMeasures?.unverified_functions) ?? newWithheld.length} function(s), ` +
      `${finite(options.toMeasures?.unverified_code) ?? size(newWithheld)} bytes, not counted as matched until the steering gate certifies them.`,
    ...unverifiedRows.length > 0
      ? ["", ...unverifiedRows.map((entry) => `- \`${entry.unitName}\` \`${entry.itemName}\`: ${entry.fromPercent}% -> ${entry.toPercent}% (unverified)`)]
      : [],
    "",
  ].join("\n");
  return { ...report, ...entries, summary, promotion, markdown };
}
