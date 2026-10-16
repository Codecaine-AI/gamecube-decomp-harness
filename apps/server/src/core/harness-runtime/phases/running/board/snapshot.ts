import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BoardMeasures, BoardSnapshot, TargetCandidate } from "@server/core/shared/types/index.js";
import { EXACT_SCORE, objdiffRowScore } from "@server/core/validation/objdiff/constants.js";
import { isRecordedStackOnly } from "@server/core/harness-runtime/run-state/stack-only-functions.js";
import { candidateFromReportFunction, isUnverifiedTarget, objdiffSourceMap, rankUnverifiedFirst, type StackOnlyIndex, type UnverifiedIndex } from "./candidates.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";
import { applyReadinessFrontier, type BoardReadinessOptions } from "./readiness.js";
import { withholdUnverifiedMeasures } from "./unverified-measures.js";

/** The central unverified metrics helper; sync publication and settlement import it from here. */
export { withholdUnverifiedMeasures } from "./unverified-measures.js";

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

export interface LoadBoardSnapshotOptions extends BoardReadinessOptions {
  codeGraphFunctionsIndexPath?: string;
  reportPath?: string;
  objdiffPath?: string;
  targetExcludePrefixes?: string[];
  /** stop_at_frame games: functions done up to the stack frame, skipped while still at their recorded score. */
  stackOnly?: StackOnlyIndex;
  /** Steering-gated games: `unverified_match` functions, claimable even at 100% and never retired as done. */
  unverified?: UnverifiedIndex;
}

function excludedSource(sourcePath: string, options: LoadBoardSnapshotOptions): boolean {
  const path = sourcePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return (options.targetExcludePrefixes ?? []).some(prefix => path === prefix.replace(/\/$/, "") || path.startsWith(`${prefix.replace(/\/$/, "")}/`));
}

export function loadBoardSnapshot(repoRoot: string, options: LoadBoardSnapshotOptions = {}): BoardSnapshot {
  const reportPath = resolve(repoRoot, options.reportPath ?? "build/GALE01/report.json");
  const objdiffPath = resolve(repoRoot, options.objdiffPath ?? "objdiff.json");
  if (!existsSync(reportPath)) return loadBoardSnapshotFromCodeGraphIndex(reportPath, objdiffPath, options);

  const report = readJson(reportPath);
  const sourceByUnit = existsSync(objdiffPath) ? objdiffSourceMap(readJson(objdiffPath)) : new Map<string, string>();
  const candidates: TargetCandidate[] = [];

  for (const unitValue of asArray(report.units)) {
    const unit = asObject(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName) continue;
    const metadata = asObject(unit.metadata);
    const sourcePath = stringValue(metadata.source_path, sourceByUnit.get(unitName) ?? "");
    if (excludedSource(sourcePath, options)) continue;
    for (const fnValue of asArray(unit.functions)) {
      const candidate = candidateFromReportFunction({
        unitName,
        sourcePath,
        fn: asObject(fnValue),
        stackOnly: options.stackOnly,
        unverified: options.unverified,
      });
      if (candidate) candidates.push(candidate);
    }
    for (const sectionValue of asArray(unit.sections)) {
      const section = asObject(sectionValue);
      const symbol = stringValue(section.name);
      const size = numberValue(section.size);
      const fuzzy = objdiffRowScore(section, 100);
      if (!symbol || symbol === ".text" || size <= 0 || fuzzy >= EXACT_SCORE) continue;
      candidates.push({
        unit: unitName,
        sourcePath,
        symbol,
        size,
        fuzzy,
        kind: "section",
      });
    }
  }

  const measures = withholdUnverifiedMeasures(report, options.unverified);
  return {
    generatedAt: new Date().toISOString(),
    reportPath,
    objdiffPath,
    measures,
    ...applyReadinessFrontier(rankUnverifiedFirst(candidates), options),
  };
}

/** Exact report functions and sections; an `unverified_match` function is never exact (not done). */
export function loadExactTargetKeys(repoRoot: string, options: LoadBoardSnapshotOptions = {}): Set<string> {
  const reportPath = resolve(repoRoot, options.reportPath ?? "build/GALE01/report.json");
  if (!existsSync(reportPath)) return new Set();

  const report = readJson(reportPath);
  const exactKeys = new Set<string>();
  for (const unitValue of asArray(report.units)) {
    const unit = asObject(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName) continue;
    for (const fnValue of asArray(unit.functions)) {
      const fn = asObject(fnValue);
      const symbol = stringValue(fn.name);
      const fuzzy = numberValue(fn.fuzzy_match_percent, 100);
      if (symbol && fuzzy >= EXACT_SCORE && !isUnverifiedTarget(options.unverified, `${unitName}::${symbol}`)) exactKeys.add(`${unitName}::${symbol}`);
    }
    for (const sectionValue of asArray(unit.sections)) {
      const section = asObject(sectionValue);
      const symbol = stringValue(section.name);
      const fuzzy = objdiffRowScore(section, 100);
      if (symbol && fuzzy >= EXACT_SCORE) exactKeys.add(`${unitName}::${symbol}`);
    }
  }
  return exactKeys;
}

/** Report functions still at the score they were recorded stack-only with; the scheduler retires them like exact ones. */
export function loadStackOnlyTargetKeys(repoRoot: string, options: LoadBoardSnapshotOptions = {}): Set<string> {
  const keys = new Set<string>();
  if (!options.stackOnly || options.stackOnly.size === 0) return keys;
  const reportPath = resolve(repoRoot, options.reportPath ?? "build/GALE01/report.json");
  if (!existsSync(reportPath)) return keys;
  const report = readJson(reportPath);
  for (const unitValue of asArray(report.units)) {
    const unit = asObject(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName) continue;
    for (const fnValue of asArray(unit.functions)) {
      const fn = asObject(fnValue);
      const symbol = stringValue(fn.name);
      const key = `${unitName}::${symbol}`;
      if (symbol && !isUnverifiedTarget(options.unverified, key) && isRecordedStackOnly(options.stackOnly, key, numberValue(fn.fuzzy_match_percent, 100))) keys.add(key);
    }
  }
  return keys;
}

function loadBoardSnapshotFromCodeGraphIndex(
  reportPath: string,
  objdiffPath: string,
  options: LoadBoardSnapshotOptions = {},
): BoardSnapshot {
  const functionsIndex = options.codeGraphFunctionsIndexPath ?? "";
  if (!functionsIndex || !existsSync(functionsIndex)) {
    const missing = [reportPath, objdiffPath, functionsIndex || "code graph functions index path"].filter((path) => !existsSync(path));
    throw new Error(`Missing board snapshot inputs: ${missing.join(", ")}`);
  }

  const rows = readJsonl(functionsIndex);
  const candidates: TargetCandidate[] = [];
  let totalFunctions = 0;
  let matchedFunctions = 0;
  let totalBytes = 0;
  let matchedBytes = 0;
  let unverifiedFunctions = 0;
  let unverifiedBytes = 0;
  let unverifiedTargets = 0;

  // The code-graph index contains functions only, so this fallback cannot emit section targets.
  for (const row of rows) {
    const unit = stringValue(row.unit);
    const sourcePath = stringValue(row.sourcePath, stringValue(row.source_path));
    const symbol = stringValue(row.symbol);
    const size = numberValue(row.size);
    const fuzzy = numberValue(row.fuzzy, numberValue(row.fuzzy_match_percent, 100));
    if (!unit || !sourcePath || !symbol || size <= 0) continue;
    totalFunctions += 1;
    totalBytes += size;
    const unverified = isUnverifiedTarget(options.unverified, `${unit}::${symbol}`);
    if (unverified) {
      unverifiedTargets += 1;
      if (fuzzy >= EXACT_SCORE) {
        unverifiedFunctions += 1;
        unverifiedBytes += size;
      }
    }
    // An exact `unverified_match` function is not done: unmatched, and still a candidate.
    if (fuzzy >= EXACT_SCORE && !unverified) {
      matchedFunctions += 1;
      matchedBytes += size;
      continue;
    }
    if (excludedSource(sourcePath, options)) continue;
    if (!unverified && isRecordedStackOnly(options.stackOnly, `${unit}::${symbol}`, fuzzy)) continue;
    candidates.push({
      unit,
      sourcePath,
      symbol,
      size,
      fuzzy,
      kind: "function",
      ...(unverified ? { verification: "unverified_match" as const } : {}),
    });
  }

  const measures: BoardMeasures = {
    matched_functions_percent: percent(matchedFunctions, totalFunctions),
    matched_code_percent: percent(matchedBytes, totalBytes),
    complete_code_percent: percent(matchedBytes, totalBytes),
    unmatched_targets: Math.max(0, totalFunctions - matchedFunctions),
    // The same "100% unverified" figure the report path stamps (see unverified-measures.ts).
    ...(options.unverified && options.unverified.size > 0
      ? {
          unverified_functions: unverifiedFunctions,
          unverified_code: unverifiedBytes,
          unverified_code_percent: percent(unverifiedBytes, totalBytes),
          unverified_targets: unverifiedTargets,
        }
      : {}),
  };
  return {
    generatedAt: new Date().toISOString(),
    reportPath: functionsIndex,
    objdiffPath: "",
    measures,
    ...applyReadinessFrontier(rankUnverifiedFirst(candidates), options),
  };
}

function readJsonl(path: string): JsonObject[] {
  const rows: JsonObject[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as JsonObject);
  }
  return rows;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Number(((part / whole) * 100).toFixed(5));
}
