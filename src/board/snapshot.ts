import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BoardMeasures, BoardSnapshot, TargetCandidate } from "../types/index.js";
import { candidateFromReportFunction, objdiffSourceMap } from "./candidates.js";
import { asArray, asObject, stringValue, type JsonObject } from "./json.js";

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

export function loadBoardSnapshot(repoRoot: string, limit: number): BoardSnapshot {
  const reportPath = resolve(repoRoot, "build/GALE01/report.json");
  const objdiffPath = resolve(repoRoot, "objdiff.json");
  if (!existsSync(reportPath)) throw new Error(`Missing ${reportPath}`);
  if (!existsSync(objdiffPath)) throw new Error(`Missing ${objdiffPath}`);

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
