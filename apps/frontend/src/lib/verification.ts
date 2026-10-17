import { asObject, num, text, type JsonObject } from "./format";

/** Server `verification` value for a steering-gated function whose code is "100% but unverified". */
export const UNVERIFIED_MATCH_STATE = "unverified_match";
export const UNVERIFIED_MATCH_LABEL = "100% but unverified";

export interface UnverifiedMatchView {
  label: string;
  /** The gate's first reason, if recorded. */
  reason: string;
  /** Tooltip: label, candidate score and the gate's reasons; says it is not done. */
  title: string;
}

/** The row's unverified state, or null for verified rows and games without an active steering gate. */
export function unverifiedMatch(row: JsonObject | null | undefined): UnverifiedMatchView | null {
  if (!row || row.verification !== UNVERIFIED_MATCH_STATE) return null;
  const label = text(row.verification_label, UNVERIFIED_MATCH_LABEL);
  const reasons = Array.isArray(row.verification_reasons) ? row.verification_reasons.filter((reason): reason is string => typeof reason === "string" && Boolean(reason)) : [];
  const candidate = Number(asObject(row.verification_match).candidate);
  const scoreLine = Number.isFinite(candidate) ? ` (candidate ${candidate}%)` : "";
  const title = [`${label}${scoreLine}: the steering gate could not verify this code; not counted as done.`, ...reasons].join("\n");
  return { label, reason: reasons[0] ?? "", title };
}

/**
 * The run's unverified-target count from `runSummary` / run-details `summary`,
 * or null when the game has no active steering gate (the field is absent).
 */
export function unverifiedRunTargets(summary: JsonObject | null | undefined): number | null {
  const value = summary?.unverified_run_targets;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** "12 done · 3 100% but unverified"; "12 done" without unverified targets. */
export function doneWithUnverifiedLabel(done: unknown, unverified: number | null): string {
  const doneLabel = `${num(done)} done`;
  return unverified ? `${doneLabel} · ${num(unverified)} ${UNVERIFIED_MATCH_LABEL}` : doneLabel;
}
