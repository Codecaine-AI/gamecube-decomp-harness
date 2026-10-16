import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { isRecordedStackOnly } from "@server/core/harness-runtime/run-state/stack-only-functions.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";

/** `unit::symbol` -> recorded score of functions done up to the stack frame (stop_at_frame games only). */
export type StackOnlyIndex = ReadonlyMap<string, number | null>;

/** `unit::symbol` keys of functions in the `unverified_match` state (steering-gated games only). */
export type UnverifiedIndex = ReadonlySet<string> | ReadonlyMap<string, unknown>;

const UNKNOWN_COMPLETION = Symbol("unknown completion");

/**
 * The index of a game whose steering state could not be read: every target
 * counts as held, and progress withheld under it is unknown (null), never
 * the raw report's credit. Never mutated.
 */
export const UNKNOWN_COMPLETION_INDEX: ReadonlySet<string> = Object.assign(new Set<string>(), { [UNKNOWN_COMPLETION]: true });

/** The index is `UNKNOWN_COMPLETION_INDEX`: completion under it is unknown. */
export function completionIndexUnknown(index: UnverifiedIndex | undefined): boolean {
  return Boolean(index && (index as unknown as Record<symbol, unknown>)[UNKNOWN_COMPLETION] === true);
}

export function isUnverifiedTarget(index: UnverifiedIndex | undefined, key: string): boolean {
  return completionIndexUnknown(index) || Boolean(index?.has(key));
}

/** Unverified candidates first, each group in its own order: they are close, so they are admitted before untouched targets. */
export function rankUnverifiedFirst(candidates: TargetCandidate[]): TargetCandidate[] {
  if (!candidates.some((candidate) => candidate.verification === "unverified_match")) return candidates;
  return [
    ...candidates.filter((candidate) => candidate.verification === "unverified_match"),
    ...candidates.filter((candidate) => candidate.verification !== "unverified_match"),
  ];
}

export function objdiffSourceMap(objdiff: JsonObject): Map<string, string> {
  const byUnit = new Map<string, string>();
  for (const unitValue of asArray(objdiff.units)) {
    const unit = asObject(unitValue);
    const metadata = asObject(unit.metadata);
    const name = stringValue(unit.name);
    const sourcePath = stringValue(metadata.source_path);
    if (name && sourcePath) byUnit.set(name, sourcePath);
  }
  return byUnit;
}

export function candidateFromReportFunction(params: {
  unitName: string;
  sourcePath: string;
  fn: JsonObject;
  /** Functions recorded as stack-only; a function still at its recorded score is done, not a candidate. */
  stackOnly?: StackOnlyIndex;
  /** `unverified_match` functions: a candidate even at 100%, and never retired as stack-only. */
  unverified?: UnverifiedIndex;
}): TargetCandidate | null {
  const fuzzy = numberValue(params.fn.fuzzy_match_percent, 100);
  const size = numberValue(params.fn.size);
  const symbol = stringValue(params.fn.name);
  const unverified = Boolean(symbol) && isUnverifiedTarget(params.unverified, `${params.unitName}::${symbol}`);
  if (fuzzy >= 100 && !unverified) return null;
  if (!symbol || size <= 0) return null;
  if (!unverified && isRecordedStackOnly(params.stackOnly, `${params.unitName}::${symbol}`, fuzzy)) return null;
  return {
    unit: params.unitName,
    sourcePath: params.sourcePath,
    symbol,
    size,
    fuzzy,
    kind: "function",
    ...(unverified ? { verification: "unverified_match" as const } : {}),
  };
}
