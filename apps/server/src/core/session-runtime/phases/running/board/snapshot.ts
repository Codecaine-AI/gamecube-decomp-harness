import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { BoardMeasures, BoardRankBreakdown, BoardSnapshot, TargetCandidate } from "@server/core/shared/types/index.js";
import { candidateFromReportFunction, closenessPriority, closenessScore, objdiffSourceMap } from "./candidates.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";

const HIGH_ACCURACY_BONUS_WEIGHT = 0.4;
const ACCURACY_READINESS_READINESS_WEIGHT = 0.35;
const ACCURACY_READINESS_INFORMATION_WEIGHT = 0.1;
const MAX_ACCURACY_READINESS_BONUS = 18;
const MAX_CLOSENESS_FALLBACK_SCORE = 3;

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

export interface LoadBoardSnapshotOptions {
  codeGraphFunctionsIndexPath?: string;
  rankFeatureProvider?: BoardRankFeatureProvider;
}

export type BoardRankFeatureProvider = (candidate: TargetCandidate) => BoardRankFeature | null | undefined;

export interface BoardRankFeature {
  target?: {
    source_path: string;
    unit?: string;
    symbol?: string;
  };
  source_path: string;
  editability: "editable" | "read_only_complete" | "locked" | "blocked" | "unknown";
  graph_degree: number;
  function_graph_degree: number;
  fresh_edges_since_last_attempt: number;
  relevant_pr_count: number;
  review_risk_count: number;
  duplicate_reference_count: number;
  linked_unlock_potential: number;
  connected_incomplete_function_count: number;
  connected_matched_reference_count: number;
  resource_evidence_count: number;
  path_fact_count: number;
  historical_lesson_count: number;
  curated_signal_count: number;
  proposal_fact_count: number;
  stale_fact_count: number;
  information_gain_score: number;
  unlock_score: number;
  context_quality_score: number;
  completion_readiness_score: number;
  information_value_score: number;
  risk_penalty: number;
  priority_bonus: number;
  explanation: string[];
}

function sessionBaselineRepoRoot(repoRoot: string): string | null {
  const worktreeName = basename(repoRoot);
  if (worktreeName !== "current" && worktreeName !== "source") return null;
  const sessionRoot = dirname(repoRoot);
  const sessionsRoot = dirname(sessionRoot);
  if (basename(sessionsRoot) !== "sessions") return null;
  return resolve(dirname(sessionsRoot), "upstream-current");
}

export function loadBoardSnapshot(repoRoot: string, limit: number, options: LoadBoardSnapshotOptions = {}): BoardSnapshot {
  let reportPath = resolve(repoRoot, "build/GALE01/report.json");
  let objdiffPath = resolve(repoRoot, "objdiff.json");
  if (!existsSync(reportPath) || !existsSync(objdiffPath)) {
    const baselineRoot = sessionBaselineRepoRoot(repoRoot);
    const baselineReportPath = baselineRoot ? resolve(baselineRoot, "build/GALE01/report.json") : "";
    const baselineObjdiffPath = baselineRoot ? resolve(baselineRoot, "objdiff.json") : "";
    if (baselineReportPath && existsSync(baselineReportPath) && existsSync(baselineObjdiffPath)) {
      reportPath = baselineReportPath;
      objdiffPath = baselineObjdiffPath;
    } else {
      return loadBoardSnapshotFromCodeGraphIndex(limit, reportPath, objdiffPath, options);
    }
  }

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

  rankBoardCandidates(candidates, options.rankFeatureProvider);
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

function loadBoardSnapshotFromCodeGraphIndex(
  limit: number,
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
      priority: closenessPriority(size, fuzzy),
      reason: `code_graph index finish candidate: ${size} bytes at ${fuzzy.toFixed(5)}% fuzzy, ${Math.max(0, 100 - fuzzy).toFixed(
        5,
      )}% gap to exact`,
    });
  }

  rankBoardCandidates(candidates, options.rankFeatureProvider);
  candidates.sort((left, right) => right.priority - left.priority);
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

function rankBoardCandidates(candidates: TargetCandidate[], rankFeatureProvider?: BoardRankFeatureProvider): void {
  if (!rankFeatureProvider || candidates.length === 0) {
    for (const candidate of candidates) applyCandidateRank(candidate);
    return;
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const feature = rankFeatureProvider(candidate);
    if (!feature) {
      applyCandidateRank(candidate);
      continue;
    }
    if (feature.editability === "read_only_complete" || feature.editability === "locked" || feature.editability === "blocked") {
      candidates.splice(index, 1);
      continue;
    }
    applyCandidateRank(candidate, feature);
  }
}

function applyCandidateRank(candidate: TargetCandidate, graph?: BoardRankFeature): void {
  const rawCloseness = closenessPriority(candidate.size, candidate.fuzzy);
  const localClosenessScore = closenessScore(candidate.size, candidate.fuzzy);
  const graphScore = graph?.priority_bonus ?? 0;
  const hasInformationSignals =
    graph &&
    (graphScore > 0 ||
      (graph.information_gain_score ?? 0) > 0 ||
      (graph.unlock_score ?? 0) > 0 ||
      (graph.context_quality_score ?? 0) > 0 ||
      (graph.completion_readiness_score ?? 0) > 0);
  const highAccuracyBonus = graph && hasInformationSignals ? roundScore(localClosenessScore * HIGH_ACCURACY_BONUS_WEIGHT) : graph ? 0 : localClosenessScore;
  const closenessFallbackScore = graph && !hasInformationSignals ? fallbackClosenessScore(candidate, rawCloseness) : 0;
  const accuracyReadinessBonus = graph
    ? roundScore(
        Math.min(
          MAX_ACCURACY_READINESS_BONUS,
          (localClosenessScore / 30) *
            ((graph.completion_readiness_score ?? 0) * ACCURACY_READINESS_READINESS_WEIGHT +
              (graph.information_gain_score ?? 0) * ACCURACY_READINESS_INFORMATION_WEIGHT),
        ),
      )
    : 0;
  const rank: BoardRankBreakdown = {
    raw_finishability_priority: roundScore(rawCloseness),
    finishability_score: localClosenessScore,
    closeness_score: localClosenessScore,
    information_gain_score: graph?.information_gain_score ?? 0,
    unlock_score: graph?.unlock_score ?? 0,
    context_quality_score: graph?.context_quality_score ?? 0,
    completion_readiness_score: graph?.completion_readiness_score ?? 0,
    information_value_score: graph?.information_value_score ?? 0,
    information_priority_score: graphScore,
    high_accuracy_bonus: highAccuracyBonus,
    accuracy_readiness_bonus: accuracyReadinessBonus,
    closeness_fallback_score: closenessFallbackScore,
    risk_penalty: graph?.risk_penalty ?? 0,
    graph_score: graphScore,
    total_priority: roundScore(graphScore + highAccuracyBonus + accuracyReadinessBonus + closenessFallbackScore),
    explanation: graph ? [...graph.explanation, hasInformationSignals ? "information_signals=present" : "information_signals=absent"] : ["graph_db=unavailable"],
  };
  candidate.priority = rank.total_priority;
  candidate.rank = rank;
  candidate.reason = `${candidate.reason}; board rank ${rank.total_priority.toFixed(2)} = information priority ${rank.information_priority_score.toFixed(
    2,
  )} + high-accuracy bonus ${rank.high_accuracy_bonus.toFixed(2)} + accuracy/readiness bonus ${rank.accuracy_readiness_bonus.toFixed(
    2,
  )} + closeness fallback ${rank.closeness_fallback_score.toFixed(
    2,
  )}; signals: closeness ${rank.closeness_score.toFixed(2)}, information gain ${rank.information_gain_score.toFixed(
    2,
  )}, unlock ${rank.unlock_score.toFixed(2)}, readiness ${rank.completion_readiness_score.toFixed(
    2,
  )}, context ${rank.context_quality_score.toFixed(2)}, risk ${rank.risk_penalty.toFixed(2)}`;
}

function fallbackClosenessScore(candidate: TargetCandidate, rawCloseness: number): number {
  const gap = Math.max(0, 100 - candidate.fuzzy);
  const fuzzyComponent = Math.exp(-gap / 0.08);
  const rawComponent = clamp((Math.log1p(Math.max(0, rawCloseness)) - 6) / 6);
  const sizeComponent = clamp(Math.log1p(Math.max(0, candidate.size)) / Math.log1p(4096));
  return roundScore(Math.min(MAX_CLOSENESS_FALLBACK_SCORE, 0.2 + fuzzyComponent * 1.8 + rawComponent * 0.7 + sizeComponent * 0.3));
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}
