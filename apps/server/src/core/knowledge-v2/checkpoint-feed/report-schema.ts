// Structural validation of an epoch's frozen Objdiff `report_changes.json`
// (plan §6.8 rule 4, round 2 A3-F3, round 3 A3-F2). Pure. The selector never
// uses `readRegressionReport`, which parses without validation and
// substitutes empty structures: a report that does not validate is evidence
// against confirming any checkpoint of its epoch.
//
// Field checks follow `MetricValues` (`objdiff/report.ts`): the five
// percentages are finite numbers in [0, 100] (or numeric strings that parse to
// one); `matched_code`, `matched_data` and `size` are non-negative safe
// integers or canonical non-negative decimal strings (real Objdiff output uses
// strings). Byte counts are kept as `bigint`, so comparisons lose no
// precision. Unknown fields are ignored.

export const PERCENT_METRICS = [
  "fuzzy_match_percent",
  "matched_code_percent",
  "matched_data_percent",
  "complete_code_percent",
  "complete_data_percent",
] as const;
export type PercentMetric = (typeof PERCENT_METRICS)[number];

export const BYTE_METRICS = ["matched_code", "matched_data", "size"] as const;
export type ByteMetric = (typeof BYTE_METRICS)[number];

/** One side (`from` or `to`) of a row, with only the fields it carried. */
export interface ReportMetrics {
  percents: Partial<Record<PercentMetric, number>>;
  bytes: Partial<Record<ByteMetric, bigint>>;
}

export interface ReportRow {
  name: string;
  /** Null when the side is absent: a row with no `to` disappeared, a row with no `from` is new. */
  from: ReportMetrics | null;
  to: ReportMetrics | null;
}

export interface ReportUnit extends ReportRow {
  sections: ReportRow[];
  functions: ReportRow[];
}

export interface ValidatedReportChanges {
  units: ReportUnit[];
}

export type ReportValidation =
  | { ok: true; report: ValidatedReportChanges }
  | { ok: false; issues: string[] };

/** Enough issues to tell a malformed report from a wrong one; the rest are counted. */
const MAX_ISSUES = 20;
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;
const NUMERIC_STRING = /^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : String(value);
}

function percentValue(value: unknown): number | null {
  let parsed: number | null = null;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && NUMERIC_STRING.test(value)) parsed = Number(value);
  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function byteValue(value: unknown): bigint | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value === "string" && CANONICAL_DECIMAL.test(value)) return BigInt(value);
  return null;
}

/** Validates every field of one MetricValues object; adds issues and returns null when any fails. */
function metrics(value: unknown, path: string, issues: string[]): ReportMetrics | null {
  if (!isPlainObject(value)) {
    issues.push(`${path} is ${describe(value)}, not an object`);
    return null;
  }
  const result: ReportMetrics = { percents: {}, bytes: {} };
  let valid = true;
  for (const key of PERCENT_METRICS) {
    if (!(key in value)) continue;
    const parsed = percentValue(value[key]);
    if (parsed === null) {
      issues.push(`${path}.${key} is ${describe(value[key])}, not a percentage in [0, 100]`);
      valid = false;
    } else {
      result.percents[key] = parsed;
    }
  }
  for (const key of BYTE_METRICS) {
    if (!(key in value)) continue;
    const parsed = byteValue(value[key]);
    if (parsed === null) {
      issues.push(`${path}.${key} is ${describe(value[key])}, not a non-negative integer or canonical decimal string`);
      valid = false;
    } else {
      result.bytes[key] = parsed;
    }
  }
  return valid ? result : null;
}

/** `from` and `to` when present; an absent side is null, a present one must validate. */
function sides(row: Record<string, unknown>, path: string, issues: string[]): { from: ReportMetrics | null; to: ReportMetrics | null } | null {
  const before = issues.length;
  const from = "from" in row ? metrics(row.from, `${path}.from`, issues) : null;
  const to = "to" in row ? metrics(row.to, `${path}.to`, issues) : null;
  return issues.length === before ? { from, to } : null;
}

function rowName(row: Record<string, unknown>, path: string, issues: string[]): string | null {
  if (typeof row.name === "string" && row.name.length > 0) return row.name;
  issues.push(`${path}.name is ${"name" in row ? describe(row.name) : "missing"}, not a non-empty string`);
  return null;
}

function rows(value: unknown, path: string, issues: string[]): ReportRow[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path} is ${describe(value)}, not an array`);
    return [];
  }
  const result: ReportRow[] = [];
  value.forEach((entry, index) => {
    const rowPath = `${path}[${index}]`;
    if (!isPlainObject(entry)) {
      issues.push(`${rowPath} is ${describe(entry)}, not an object`);
      return;
    }
    const name = rowName(entry, rowPath, issues);
    const values = sides(entry, rowPath, issues);
    if (name !== null && values !== null) result.push({ name, ...values });
  });
  return result;
}

/**
 * Validates a parsed `report_changes.json`. The root must be an object with a
 * non-empty `units` array; every unit, section and function row needs a
 * non-empty string `name`; `sections` and `functions`, when present, are
 * arrays of objects; every `from`/`to` present (the root's included) is an
 * object whose known metric fields pass their checks.
 */
export function validateReportChanges(value: unknown): ReportValidation {
  const issues: string[] = [];
  if (!isPlainObject(value)) return { ok: false, issues: [`report is ${describe(value)}, not an object`] };
  sides(value, "report", issues);
  if (!Array.isArray(value.units)) {
    issues.push(`report.units is ${"units" in value ? describe(value.units) : "missing"}, not an array`);
    return { ok: false, issues };
  }
  if (value.units.length === 0) issues.push("report.units is empty");
  const units: ReportUnit[] = [];
  value.units.forEach((entry, index) => {
    const path = `units[${index}]`;
    if (!isPlainObject(entry)) {
      issues.push(`${path} is ${describe(entry)}, not an object`);
      return;
    }
    const name = rowName(entry, path, issues);
    const values = sides(entry, path, issues);
    const sections = rows(entry.sections, `${path}.sections`, issues);
    const functions = rows(entry.functions, `${path}.functions`, issues);
    if (name !== null && values !== null) units.push({ name, ...values, sections, functions });
  });
  if (issues.length > 0) {
    const shown = issues.slice(0, MAX_ISSUES);
    if (issues.length > MAX_ISSUES) shown.push(`… and ${issues.length - MAX_ISSUES} more`);
    return { ok: false, issues: shown };
  }
  return { ok: true, report: { units } };
}
