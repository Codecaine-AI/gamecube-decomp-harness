import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { BoardMeasures, BoardRankBreakdown, BoardSnapshot, CandidateRerankMode, TargetCandidate } from "@server/core/shared/types/index.js";
import type { BoardModelScoring } from "@server/core/shared/types/board.js";
import { candidateFromReportFunction, closenessPriority, closenessScore, objdiffSourceMap } from "./candidates.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";
import { spawnPredictorScorer, type ModelRerankMode, type PredictorScorer } from "./predictor.js";

const HIGH_ACCURACY_BONUS_WEIGHT = 0.4;
const ACCURACY_READINESS_READINESS_WEIGHT = 0.35;
const ACCURACY_READINESS_INFORMATION_WEIGHT = 0.1;
const MAX_ACCURACY_READINESS_BONUS = 18;
const MAX_CLOSENESS_FALLBACK_SCORE = 3;
const MAX_OPSEQ_RERANK_BONUS = 48;

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

export interface LoadBoardSnapshotOptions {
  candidateRerank?: CandidateRerankMode;
  codeGraphFunctionsIndexPath?: string;
  predictorDbPath?: string;
  predictorScorer?: PredictorScorer;
  predictorSessionId?: string;
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
  opseq_best_analog_score: number;
  opseq_best_matched_analog_score: number;
  opseq_analog_count: number;
  opseq_exact_analog_count: number;
  opseq_matched_analog_count: number;
  linked_unlock_potential: number;
  connected_incomplete_function_count: number;
  connected_matched_reference_count: number;
  resource_evidence_count: number;
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
  if (!existsSync(reportPath)) {
    const baselineRoot = sessionBaselineRepoRoot(repoRoot);
    const baselineReportPath = baselineRoot ? resolve(baselineRoot, "build/GALE01/report.json") : "";
    const baselineObjdiffPath = baselineRoot ? resolve(baselineRoot, "objdiff.json") : "";
    if (baselineReportPath && existsSync(baselineReportPath)) {
      reportPath = baselineReportPath;
      objdiffPath = baselineObjdiffPath;
    } else {
      return loadBoardSnapshotFromCodeGraphIndex(limit, reportPath, objdiffPath, options);
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
  }

  rankBoardCandidates(candidates, options.rankFeatureProvider, options.candidateRerank ?? "priority");
  candidates.sort((left, right) => right.priority - left.priority);
  const modelScoring = applyModelRerank(candidates, options);
  const measures = asObject(report.measures) as BoardMeasures;
  return {
    generatedAt: new Date().toISOString(),
    reportPath,
    objdiffPath,
    measures,
    candidates: candidates.slice(0, limit),
    ...(modelScoring ? { modelScoring } : {}),
  };
}

export function loadExactTargetKeys(repoRoot: string): Set<string> {
  let reportPath = resolve(repoRoot, "build/GALE01/report.json");
  if (!existsSync(reportPath)) {
    const baselineRoot = sessionBaselineRepoRoot(repoRoot);
    const baselineReportPath = baselineRoot ? resolve(baselineRoot, "build/GALE01/report.json") : "";
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
      if (symbol && fuzzy >= 100) exactKeys.add(`${unitName}::${symbol}`);
    }
  }
  return exactKeys;
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

  rankBoardCandidates(candidates, options.rankFeatureProvider, options.candidateRerank ?? "priority");
  candidates.sort((left, right) => right.priority - left.priority);
  const modelScoring = applyModelRerank(candidates, options);
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
    ...(modelScoring ? { modelScoring } : {}),
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

export function normalizeCandidateRerankMode(value: unknown): CandidateRerankMode {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "opseq_hot_lane" || normalized === "opsec_hot_lane" || normalized === "opseq_matched" || normalized === "opsec_matched") {
    return "opseq_hot_lane";
  }
  if (normalized === "model_win_95" || normalized === "model_win95") return "model_win_95";
  if (normalized === "model_win_90" || normalized === "model_win90") return "model_win_90";
  if (
    normalized === "model_match_focus" ||
    normalized === "model_matchfocus" ||
    normalized === "model_match" ||
    normalized === "model_match_30" ||
    normalized === "model_match30"
  ) {
    return "model_match_focus";
  }
  return "priority";
}

export function isModelRerankMode(mode: CandidateRerankMode | undefined): mode is ModelRerankMode {
  return mode === "model_win_95" || mode === "model_win_90" || mode === "model_match_focus";
}

export function modelRerankScoreKey(mode: ModelRerankMode): "p_win" | "p_match" {
  return mode === "model_match_focus" ? "p_match" : "p_win";
}

export function modelAdmissionCap(mode: CandidateRerankMode | undefined, candidateCount: number): number | null {
  if (!isModelRerankMode(mode) || candidateCount <= 0) return null;
  const fraction = mode === "model_win_95" ? 0.8785 : mode === "model_win_90" ? 0.811 : 0.3;
  return Math.ceil(fraction * candidateCount);
}

export function refreshBoardRerankMode(mode: CandidateRerankMode | undefined): CandidateRerankMode | undefined {
  return isModelRerankMode(mode) ? "priority" : mode;
}

function applyModelRerank(candidates: TargetCandidate[], options: LoadBoardSnapshotOptions): BoardModelScoring | undefined {
  const mode = options.candidateRerank;
  if (!isModelRerankMode(mode)) return undefined;

  let scores: ReturnType<PredictorScorer>;
  try {
    const scorer =
      options.predictorScorer ??
      spawnPredictorScorer({
        dbPath: options.predictorDbPath,
        sessionId: options.predictorSessionId,
      });
    scores = scorer(candidates, mode);
  } catch (error) {
    const warning = `scorer threw: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[board] model rerank unavailable (${warning}); falling back to priority order`);
    return { mode, applied: false, warning };
  }

  if (!scores || Object.keys(scores).length === 0) {
    const warning = scores ? "scorer returned an empty score map" : "scorer failed";
    console.error(`[board] model rerank unavailable (${warning}); falling back to priority order`);
    return { mode, applied: false, warning };
  }

  const scoreKey = modelRerankScoreKey(mode);
  let scoredCount = 0;
  let missingCount = 0;
  for (const candidate of candidates) {
    const rank = candidate.rank;
    if (!rank) continue;
    const score = scores[`${candidate.unit}::${candidate.symbol}`];
    if (!score) {
      rank.p_win = 0;
      rank.p_match = 0;
      missingCount += 1;
      continue;
    }
    rank.p_win = score.p_win;
    rank.p_match = score.p_match;
    rank.explanation.push(`model_rerank=${mode} p_win=${score.p_win.toFixed(4)} p_match=${score.p_match.toFixed(4)}`);
    scoredCount += 1;
  }

  candidates.sort((left, right) => {
    const scoreDifference = (right.rank?.[scoreKey] ?? 0) - (left.rank?.[scoreKey] ?? 0);
    return scoreDifference || right.priority - left.priority;
  });
  return {
    mode,
    applied: true,
    score_key: scoreKey,
    scored_count: scoredCount,
    missing_count: missingCount,
  };
}

function rankBoardCandidates(candidates: TargetCandidate[], rankFeatureProvider?: BoardRankFeatureProvider, candidateRerank: CandidateRerankMode = "priority"): void {
  if (!rankFeatureProvider || candidates.length === 0) {
    for (const candidate of candidates) applyCandidateRank(candidate, undefined, candidateRerank);
    return;
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const feature = rankFeatureProvider(candidate);
    if (!feature) {
      applyCandidateRank(candidate, undefined, candidateRerank);
      continue;
    }
    if (feature.editability === "read_only_complete" || feature.editability === "locked" || feature.editability === "blocked") {
      candidates.splice(index, 1);
      continue;
    }
    applyCandidateRank(candidate, feature, candidateRerank);
  }
}

function applyCandidateRank(candidate: TargetCandidate, graph?: BoardRankFeature, candidateRerank: CandidateRerankMode = "priority"): void {
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
  const opseqRerankBonus = opseqHotLaneBonus(graph, candidateRerank);
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
    opseq_best_analog_score: graph?.opseq_best_analog_score ?? 0,
    opseq_best_matched_analog_score: graph?.opseq_best_matched_analog_score ?? 0,
    opseq_analog_count: graph?.opseq_analog_count ?? 0,
    opseq_exact_analog_count: graph?.opseq_exact_analog_count ?? 0,
    opseq_matched_analog_count: graph?.opseq_matched_analog_count ?? 0,
    opseq_rerank_bonus: opseqRerankBonus,
    candidate_rerank_mode: candidateRerank,
    high_accuracy_bonus: highAccuracyBonus,
    accuracy_readiness_bonus: accuracyReadinessBonus,
    closeness_fallback_score: closenessFallbackScore,
    risk_penalty: graph?.risk_penalty ?? 0,
    graph_score: graphScore,
    total_priority: roundScore(graphScore + highAccuracyBonus + accuracyReadinessBonus + closenessFallbackScore + opseqRerankBonus),
    explanation: graph
      ? [
          ...graph.explanation,
          hasInformationSignals ? "information_signals=present" : "information_signals=absent",
          candidateRerank !== "priority" ? `candidate_rerank=${candidateRerank}` : "",
          opseqRerankBonus > 0 ? `opseq_rerank_bonus=${opseqRerankBonus.toFixed(2)}` : "",
        ].filter(Boolean)
      : ["graph_db=unavailable"],
  };
  candidate.priority = rank.total_priority;
  candidate.rank = rank;
  candidate.reason = `${candidate.reason}; board rank ${rank.total_priority.toFixed(2)} = information priority ${rank.information_priority_score.toFixed(
    2,
  )} + high-accuracy bonus ${rank.high_accuracy_bonus.toFixed(2)} + accuracy/readiness bonus ${rank.accuracy_readiness_bonus.toFixed(
    2,
  )} + closeness fallback ${rank.closeness_fallback_score.toFixed(2)} + opseq rerank ${rank.opseq_rerank_bonus.toFixed(
    2,
  )}; signals: closeness ${rank.closeness_score.toFixed(2)}, information gain ${rank.information_gain_score.toFixed(
    2,
  )}, unlock ${rank.unlock_score.toFixed(2)}, readiness ${rank.completion_readiness_score.toFixed(
    2,
  )}, context ${rank.context_quality_score.toFixed(2)}, opseq ${rank.opseq_analog_count} analogs best ${rank.opseq_best_analog_score.toFixed(
    3,
  )} matched best ${rank.opseq_best_matched_analog_score.toFixed(
    3,
  )}, risk ${rank.risk_penalty.toFixed(2)}`;
}

function opseqHotLaneBonus(graph: BoardRankFeature | undefined, candidateRerank: CandidateRerankMode): number {
  if (candidateRerank !== "opseq_hot_lane" || !graph) return 0;
  const bestMatched = graph.opseq_best_matched_analog_score ?? 0;
  if (bestMatched <= 0) return 0;
  return roundScore(
    Math.min(
      MAX_OPSEQ_RERANK_BONUS,
      bestMatched * 34 + Math.min(8, (graph.opseq_matched_analog_count ?? 0) * 2) + Math.min(6, (graph.opseq_exact_analog_count ?? 0) * 1.5),
    ),
  );
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
