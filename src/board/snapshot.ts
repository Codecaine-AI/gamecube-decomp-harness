import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { graphDbExists, knowledgeSourcesRoot, openKnowledgeGraph, rankFeatureForSourcePath, resourceGraphDbPath } from "../knowledge/index.js";
import type { BoardMeasures, BoardSnapshot, TargetCandidate } from "../types/index.js";
import { candidateFromReportFunction, finishabilityPriority, objdiffSourceMap } from "./candidates.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

export function loadBoardSnapshot(repoRoot: string, limit: number): BoardSnapshot {
  const reportPath = resolve(repoRoot, "build/GALE01/report.json");
  const objdiffPath = resolve(repoRoot, "objdiff.json");
  if (!existsSync(reportPath) || !existsSync(objdiffPath)) return loadBoardSnapshotFromCodeGraphIndex(limit, reportPath, objdiffPath);

  const report = readJson(reportPath);
  const objdiff = readJson(objdiffPath);
  const sourceByUnit = objdiffSourceMap(objdiff);
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
  }

  applyGraphFeatures(candidates);
  candidates.sort((left, right) => right.priority - left.priority);
  const measures = asObject(report.measures) as BoardMeasures;
  return {
    generatedAt: new Date().toISOString(),
    reportPath,
    objdiffPath,
    measures,
    candidates: candidates.slice(0, limit),
  };
}

function loadBoardSnapshotFromCodeGraphIndex(limit: number, reportPath: string, objdiffPath: string): BoardSnapshot {
  const functionsIndex = resolve(knowledgeSourcesRoot(), "code_graph/indexes/functions.jsonl");
  if (!existsSync(functionsIndex)) {
    const missing = [reportPath, objdiffPath, functionsIndex].filter((path) => !existsSync(path));
    throw new Error(`Missing board snapshot inputs: ${missing.join(", ")}`);
  }

  const rows = readJsonl(functionsIndex);
  const candidates: TargetCandidate[] = [];
  let totalFunctions = 0;
  let matchedFunctions = 0;
  let totalBytes = 0;
  let matchedBytes = 0;

  for (const row of rows) {
    const unit = stringValue(row.unit);
    const sourcePath = stringValue(row.sourcePath, stringValue(row.source_path));
    const symbol = stringValue(row.symbol);
    const size = numberValue(row.size);
    const fuzzy = numberValue(row.fuzzy, numberValue(row.fuzzy_match_percent, 100));
    if (!unit || !sourcePath || !symbol || size <= 0) continue;
    totalFunctions += 1;
    totalBytes += size;
    if (fuzzy >= 100) {
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
      priority: finishabilityPriority(size, fuzzy),
      reason: `code_graph index finish candidate: ${size} bytes at ${fuzzy.toFixed(5)}% fuzzy, ${Math.max(0, 100 - fuzzy).toFixed(
        5,
      )}% gap to exact`,
    });
  }

  applyGraphFeatures(candidates);
  candidates.sort((left, right) => right.priority - left.priority);
  const measures: BoardMeasures = {
    matched_functions_percent: percent(matchedFunctions, totalFunctions),
    matched_code_percent: percent(matchedBytes, totalBytes),
    complete_code_percent: percent(matchedBytes, totalBytes),
  };
  return {
    generatedAt: new Date().toISOString(),
    reportPath: functionsIndex,
    objdiffPath: "",
    measures,
    candidates: candidates.slice(0, limit),
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

function applyGraphFeatures(candidates: TargetCandidate[]): void {
  const dbPath = resourceGraphDbPath();
  if (!graphDbExists(dbPath) || candidates.length === 0) return;
  const store = openKnowledgeGraph(dbPath);
  try {
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      const feature = rankFeatureForSourcePath(store, candidate.sourcePath, {
        source_path: candidate.sourcePath,
        unit: candidate.unit,
        symbol: candidate.symbol,
      });
      if (feature.editability === "read_only_complete" || feature.editability === "locked" || feature.editability === "blocked") {
        candidates.splice(index, 1);
        continue;
      }
      if (feature.priority_bonus !== 0) {
        candidate.priority += feature.priority_bonus;
        candidate.reason = `${candidate.reason}; graph bonus ${feature.priority_bonus.toFixed(2)} (${feature.explanation.join(", ")})`;
      }
    }
  } finally {
    store.db.close();
  }
}
