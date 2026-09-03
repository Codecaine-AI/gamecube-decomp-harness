import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { BoardMeasures, BoardSnapshot, TargetCandidate } from "@server/core/shared/types/index.js";
import { EXACT_SCORE, objdiffRowScore } from "@server/core/validation/objdiff/constants.js";
import { candidateFromReportFunction, objdiffSourceMap } from "./candidates.js";
import { reportBuildIdFromPath } from "@server/core/game-registry/report-build-id.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

export interface LoadBoardSnapshotOptions {
  codeGraphFunctionsIndexPath?: string;
  reportRelPath?: string;
}

function cycleBaselineRepoRoot(repoRoot: string): string | null {
  const worktreeName = basename(repoRoot);
  if (worktreeName !== "current" && worktreeName !== "source") return null;
  const cycleRoot = dirname(repoRoot);
  const cyclesRoot = dirname(cycleRoot);
  if (basename(cyclesRoot) !== "cycles") return null;
  return resolve(dirname(cyclesRoot), "upstream-current");
}

export function loadBoardSnapshot(repoRoot: string, options: LoadBoardSnapshotOptions = {}): BoardSnapshot {
  const buildId = reportBuildIdFromPath(options.reportRelPath);
  let reportPath = resolve(repoRoot, `build/${buildId}/report.json`);
  let objdiffPath = resolve(repoRoot, "objdiff.json");
  if (!existsSync(reportPath)) {
    const baselineRoot = cycleBaselineRepoRoot(repoRoot);
    const baselineReportPath = baselineRoot ? resolve(baselineRoot, `build/${buildId}/report.json`) : "";
    const baselineObjdiffPath = baselineRoot ? resolve(baselineRoot, "objdiff.json") : "";
    if (baselineReportPath && existsSync(baselineReportPath)) {
      reportPath = baselineReportPath;
      objdiffPath = baselineObjdiffPath;
    } else {
      return loadBoardSnapshotFromCodeGraphIndex(reportPath, objdiffPath, options);
    }
  }

  const report = readJson(reportPath);
  const sourceByUnit = existsSync(objdiffPath) ? objdiffSourceMap(readJson(objdiffPath)) : new Map<string, string>();
  const candidates: TargetCandidate[] = [];

  for (const unitValue of asArray(report.units)) {
    const unit = asObject(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName) continue;
    const metadata = asObject(unit.metadata);
    const sourcePath = stringValue(metadata.source_path, sourceByUnit.get(unitName) ?? "");
    for (const fnValue of asArray(unit.functions)) {
      const candidate = candidateFromReportFunction({
        unitName,
        sourcePath,
        fn: asObject(fnValue),
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

  const measures = asObject(report.measures) as BoardMeasures;
  return {
    generatedAt: new Date().toISOString(),
    reportPath,
    objdiffPath,
    measures,
    candidates,
  };
}

export function loadExactTargetKeys(repoRoot: string, reportRelPath?: string): Set<string> {
  const buildId = reportBuildIdFromPath(reportRelPath);
  let reportPath = resolve(repoRoot, `build/${buildId}/report.json`);
  if (!existsSync(reportPath)) {
    const baselineRoot = cycleBaselineRepoRoot(repoRoot);
    const baselineReportPath = baselineRoot ? resolve(baselineRoot, `build/${buildId}/report.json`) : "";
    if (baselineReportPath && existsSync(baselineReportPath)) reportPath = baselineReportPath;
    else return new Set();
  }

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
      if (symbol && fuzzy >= EXACT_SCORE) exactKeys.add(`${unitName}::${symbol}`);
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
    if (fuzzy >= EXACT_SCORE) {
      matchedFunctions += 1;
      matchedBytes += size;
      continue;
    }
    candidates.push({
      unit,
      sourcePath,
      symbol,
      size,
      fuzzy,
      kind: "function",
    });
  }

  const measures: BoardMeasures = {
    matched_functions_percent: percent(matchedFunctions, totalFunctions),
    matched_code_percent: percent(matchedBytes, totalBytes),
    complete_code_percent: percent(matchedBytes, totalBytes),
    unmatched_targets: Math.max(0, totalFunctions - matchedFunctions),
  };
  return {
    generatedAt: new Date().toISOString(),
    reportPath: functionsIndex,
    objdiffPath: "",
    measures,
    candidates,
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
