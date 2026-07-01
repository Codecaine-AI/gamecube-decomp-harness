import { and, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { resourceGraphDbPath } from "../../paths.js";
import { fileEntityId, functionEntityId } from "../builders/code-graph.js";
import { graphDbExists, openKnowledgeGraph, type KnowledgeGraphStore } from "../db.js";
import { graphFactPayload, type GraphEdgeType } from "../payloads.js";
import { graphEdges, graphFacts, searchChunks } from "../storage/schema.js";
import type { GraphRankFeature } from "../types.js";
import { arrayValue, numberValue, objectValue, stringValue } from "../util.js";

const RESOURCE_EDGE_TYPES: GraphEdgeType[] = [
  "HAS_PATH_FACT",
  "HAS_DATA_SHEET_REFERENCE",
  "HAS_POWERPC_REFERENCE",
  "HAS_EXTERNAL_MIRROR_REFERENCE",
  "HAS_DECOMP_STANDARD",
  "HAS_DOCUMENT_REFERENCE",
  "HAS_RESOURCE_EVIDENCE",
  "HAS_MISMATCH_PATTERN",
  "HAS_MISMATCH_PATTERN_EVIDENCE",
];
const HISTORICAL_EDGE_TYPES: GraphEdgeType[] = ["HAS_HISTORICAL_FUNCTION_HINT", "HAS_HISTORICAL_TOOL_LESSON", "MENTIONED_IN_HISTORICAL_TOOL_ISSUE"];
const CURATED_EDGE_TYPES: GraphEdgeType[] = ["HAS_CURATED_WORKER_LESSON", "HAS_CURATED_PR_LESSON", "HAS_SOURCE_UPDATE_PROPOSAL", "HAS_CURATED_KNOWLEDGE"];

interface OpseqAnalogStats {
  bestScore: number;
  bestMatchedScore: number;
  analogCount: number;
  exactAnalogCount: number;
  matchedAnalogCount: number;
}

export function rankFeatureForSourcePath(store: KnowledgeGraphStore, sourcePath: string, target?: GraphRankFeature["target"]): GraphRankFeature {
  const entityId = fileEntityId(sourcePath);
  const functionEntity =
    target?.unit && target.symbol ? functionEntityId(target.unit, target.symbol) : undefined;
  const targetIds = [entityId, functionEntity].filter((id): id is string => Boolean(id));
  const editability = editabilityFor(store, entityId);

  const matchStatus = factPayload(store, entityId, "file_match_status");
  const functions = arrayValue(matchStatus.functions).map(objectValue);
  const unmatchedFunctions = arrayValue(matchStatus.unmatched_functions).map(objectValue);
  const targetSymbol = target?.symbol ?? "";
  const connectedIncompleteFunctionCount = unmatchedFunctions.filter((fn) => stringValue(fn.symbol) !== targetSymbol).length;
  const matchedSiblingCount = functions.filter((fn) => numberValue(fn.fuzzy, 100) >= 100).length;

  const graphDegree = edgeDegree(store, [entityId]);
  const functionGraphDegree = functionEntity ? edgeDegree(store, [functionEntity]) : 0;
  const relevantPrCount = edgeTypeCount(store, [entityId], ["TOUCHED_BY_PR"]);
  const duplicateReferenceCount = edgeTypeCount(store, targetIds, ["ANALOGOUS_TO"]);
  const opseqAnalogStats = opseqAnalogStatsFor(store, targetIds);
  const acceptedEdgeCount = statusEdgeCount(store, targetIds, "accepted");
  const pathFactCount = edgeTypeCount(store, [entityId], ["HAS_PATH_FACT"]);
  const resourceEvidenceCount = Math.max(
    edgeTypeCount(store, targetIds, RESOURCE_EDGE_TYPES),
    nonCodeSearchChunkCount(store, targetIds),
  );
  const historicalLessonCount = edgeTypeCount(store, targetIds, HISTORICAL_EDGE_TYPES);
  const curatedSignalCount = edgeTypeCount(store, targetIds, CURATED_EDGE_TYPES);
  const proposalFactCount = statusFactCount(store, targetIds, "proposal") + statusEdgeCount(store, targetIds, "proposal");
  const staleFactCount = statusFactCount(store, targetIds, "stale") + statusEdgeCount(store, targetIds, "stale");
  const reviewRiskCount = reviewRiskCountFor(store, targetIds, matchStatus);
  const connectedMatchedReferenceCount = matchedSiblingCount + duplicateReferenceCount;
  const linkedUnlockPotential = Math.min(1, (connectedIncompleteFunctionCount + duplicateReferenceCount + relevantPrCount / 4) / 12);

  const informationGainScore = roundScore(
    Math.min(26, graphDegree * 0.35 + functionGraphDegree * 0.6) +
      Math.min(28, resourceEvidenceCount * 2.5 + pathFactCount * 2) +
      Math.min(34, historicalLessonCount * 5 + curatedSignalCount * 5 + proposalFactCount * 4 + staleFactCount * 3),
  );
  const unlockScore = roundScore(
    Math.min(30, connectedIncompleteFunctionCount * 3) +
      Math.min(20, duplicateReferenceCount * 5) +
      Math.min(14, relevantPrCount * 1.1) +
      linkedUnlockPotential * 10,
  );
  const contextQualityScore = roundScore(
    Math.min(20, connectedMatchedReferenceCount * 2) +
      Math.min(18, relevantPrCount * 1.3) +
      Math.min(22, pathFactCount * 4 + historicalLessonCount * 2) +
      Math.min(8, opseqAnalogStats.bestMatchedScore * 4 + opseqAnalogStats.bestScore + opseqAnalogStats.matchedAnalogCount * 1.5),
  );
  const completionReadinessScore = roundScore(
    Math.min(32, pathFactCount * 3 + historicalLessonCount * 4 + curatedSignalCount * 4 + proposalFactCount * 2) +
      Math.min(24, duplicateReferenceCount * 6 + connectedMatchedReferenceCount * 2.5) +
      Math.min(10, opseqAnalogStats.exactAnalogCount * 2 + opseqAnalogStats.matchedAnalogCount * 1.5) +
      Math.min(14, relevantPrCount * 1.4) +
      Math.min(8, functionGraphDegree * 0.25),
  );
  const informationValueScore = roundScore(informationGainScore * 1.15 + unlockScore * 1.35);
  const riskPenalty = roundScore(reviewRiskCount * 2.25 + dataRiskPenalty(sourcePath));
  const priorityBonus = roundScore(
    informationGainScore * 1.35 + unlockScore * 1.25 + completionReadinessScore * 1.15 + contextQualityScore * 0.4 - riskPenalty,
  );
  const explanation = compactExplanation([
    `graph_degree=${graphDegree}`,
    functionGraphDegree ? `function_graph_degree=${functionGraphDegree}` : "",
    relevantPrCount ? `relevant_pr_count=${relevantPrCount}` : "",
    resourceEvidenceCount ? `resource_evidence=${resourceEvidenceCount}` : "",
    pathFactCount ? `path_facts=${pathFactCount}` : "",
    historicalLessonCount ? `historical_lessons=${historicalLessonCount}` : "",
    curatedSignalCount ? `curated_signals=${curatedSignalCount}` : "",
    opseqAnalogStats.analogCount ? `opseq_analogs=${opseqAnalogStats.analogCount}` : "",
    opseqAnalogStats.bestScore ? `opseq_best=${opseqAnalogStats.bestScore.toFixed(3)}` : "",
    opseqAnalogStats.bestMatchedScore ? `opseq_best_matched=${opseqAnalogStats.bestMatchedScore.toFixed(3)}` : "",
    opseqAnalogStats.exactAnalogCount ? `opseq_exact=${opseqAnalogStats.exactAnalogCount}` : "",
    opseqAnalogStats.matchedAnalogCount ? `opseq_matched=${opseqAnalogStats.matchedAnalogCount}` : "",
    connectedIncompleteFunctionCount ? `linked_incomplete_functions=${connectedIncompleteFunctionCount}` : "",
    connectedMatchedReferenceCount ? `matched_references=${connectedMatchedReferenceCount}` : "",
    proposalFactCount ? `proposal_facts=${proposalFactCount}` : "",
    staleFactCount ? `stale_facts=${staleFactCount}` : "",
    reviewRiskCount ? `review_risk_count=${reviewRiskCount}` : "",
    completionReadinessScore ? `completion_readiness=${completionReadinessScore}` : "",
    informationValueScore ? `information_value=${informationValueScore}` : "",
  ]);
  if (editability !== "editable") explanation.push(`editability=${editability}`);
  return {
    target,
    source_path: sourcePath,
    editability,
    graph_degree: graphDegree,
    function_graph_degree: functionGraphDegree,
    fresh_edges_since_last_attempt: acceptedEdgeCount,
    relevant_pr_count: relevantPrCount,
    review_risk_count: reviewRiskCount,
    duplicate_reference_count: duplicateReferenceCount,
    opseq_best_analog_score: opseqAnalogStats.bestScore,
    opseq_best_matched_analog_score: opseqAnalogStats.bestMatchedScore,
    opseq_analog_count: opseqAnalogStats.analogCount,
    opseq_exact_analog_count: opseqAnalogStats.exactAnalogCount,
    opseq_matched_analog_count: opseqAnalogStats.matchedAnalogCount,
    linked_unlock_potential: linkedUnlockPotential,
    connected_incomplete_function_count: connectedIncompleteFunctionCount,
    connected_matched_reference_count: connectedMatchedReferenceCount,
    resource_evidence_count: resourceEvidenceCount,
    path_fact_count: pathFactCount,
    historical_lesson_count: historicalLessonCount,
    curated_signal_count: curatedSignalCount,
    proposal_fact_count: proposalFactCount,
    stale_fact_count: staleFactCount,
    information_gain_score: informationGainScore,
    unlock_score: unlockScore,
    context_quality_score: contextQualityScore,
    completion_readiness_score: completionReadinessScore,
    information_value_score: informationValueScore,
    risk_penalty: riskPenalty,
    priority_bonus: priorityBonus,
    explanation,
  };
}

export function rankFeatureMapForCandidates(
  candidates: Array<{ sourcePath: string; unit?: string; symbol?: string }>,
  dbPath = resourceGraphDbPath(),
): Map<string, GraphRankFeature> {
  if (!graphDbExists(dbPath)) return new Map();
  const store = openKnowledgeGraph(dbPath);
  try {
    const features = new Map<string, GraphRankFeature>();
    for (const candidate of candidates) {
      if (!candidate.sourcePath) continue;
      const feature = rankFeatureForSourcePath(store, candidate.sourcePath, {
        source_path: candidate.sourcePath,
        unit: candidate.unit,
        symbol: candidate.symbol,
      });
      features.set(`${candidate.sourcePath}:${candidate.unit ?? ""}:${candidate.symbol ?? ""}`, feature);
    }
    return features;
  } finally {
    store.db.close();
  }
}

export function withRankFeatureProvider<T>(
  dbPath: string,
  callback: (provider: (candidate: { sourcePath: string; unit?: string; symbol?: string }) => GraphRankFeature | null) => T,
): T {
  if (!graphDbExists(dbPath)) return callback(() => null);
  const store = openKnowledgeGraph(dbPath);
  try {
    return callback((candidate) =>
      rankFeatureForSourcePath(store, candidate.sourcePath, {
        source_path: candidate.sourcePath,
        unit: candidate.unit,
        symbol: candidate.symbol,
      }),
    );
  } finally {
    store.db.close();
  }
}

function editabilityFor(store: KnowledgeGraphStore, entityId: string): GraphRankFeature["editability"] {
  const row = store.orm
    .select({ payload: graphFacts.payloadJson, factType: graphFacts.factType })
    .from(graphFacts)
    .where(and(eq(graphFacts.entityId, entityId), eq(graphFacts.factType, "editability"), eq(graphFacts.status, "accepted")))
    .limit(1)
    .get();
  if (!row) return "unknown";
  const payload = objectValue(graphFactPayload(row.factType, row.payload));
  const mode = stringValue(payload.mode, "unknown");
  if (mode === "editable" || mode === "read_only_complete" || mode === "locked" || mode === "blocked") return mode;
  return "unknown";
}

function edgeDegree(store: KnowledgeGraphStore, entityIds: string[]): number {
  if (entityIds.length === 0) return 0;
  return countRows(
    store,
    graphEdges,
    and(eq(graphEdges.status, "accepted"), or(inArray(graphEdges.fromEntityId, entityIds), inArray(graphEdges.toEntityId, entityIds))),
  );
}

function edgeTypeCount(store: KnowledgeGraphStore, entityIds: string[], edgeTypes: GraphEdgeType[]): number {
  if (entityIds.length === 0 || edgeTypes.length === 0) return 0;
  return countRows(
    store,
    graphEdges,
    and(
      eq(graphEdges.status, "accepted"),
      inArray(graphEdges.edgeType, edgeTypes),
      or(inArray(graphEdges.fromEntityId, entityIds), inArray(graphEdges.toEntityId, entityIds)),
    ),
  );
}

function statusFactCount(store: KnowledgeGraphStore, entityIds: string[], status: string): number {
  if (entityIds.length === 0) return 0;
  return countRows(store, graphFacts, and(eq(graphFacts.status, status), inArray(graphFacts.entityId, entityIds)));
}

function statusEdgeCount(store: KnowledgeGraphStore, entityIds: string[], status: string): number {
  if (entityIds.length === 0) return 0;
  return countRows(
    store,
    graphEdges,
    and(eq(graphEdges.status, status), or(inArray(graphEdges.fromEntityId, entityIds), inArray(graphEdges.toEntityId, entityIds))),
  );
}

function nonCodeSearchChunkCount(store: KnowledgeGraphStore, entityIds: string[]): number {
  if (entityIds.length === 0) return 0;
  return countRows(store, searchChunks, and(sql`${searchChunks.sourceId} != ${"code_graph"}`, inArray(searchChunks.entityId, entityIds)));
}

function opseqAnalogStatsFor(store: KnowledgeGraphStore, entityIds: string[]): OpseqAnalogStats {
  const empty = { bestScore: 0, bestMatchedScore: 0, analogCount: 0, exactAnalogCount: 0, matchedAnalogCount: 0 };
  if (entityIds.length === 0) return empty;
  const rows = store.orm
    .select({ payload: graphFacts.payloadJson, factType: graphFacts.factType })
    .from(graphFacts)
    .where(and(eq(graphFacts.status, "accepted"), eq(graphFacts.factType, "opseq_analog_profile"), inArray(graphFacts.entityId, entityIds)))
    .all();
  if (rows.length === 0) return empty;

  let bestScore = 0;
  let bestMatchedScore = 0;
  let analogCount = 0;
  let exactAnalogCount = 0;
  let matchedAnalogCount = 0;
  const seenAnalogs = new Set<string>();
  for (const row of rows) {
    const payload = objectValue(graphFactPayload(row.factType, row.payload));
    bestScore = Math.max(bestScore, numberValue(payload.best_score));
    bestMatchedScore = Math.max(bestMatchedScore, numberValue(payload.best_matched_score, numberValue(payload.best_matched_analog_score)));
    const payloadAnalogCount = numberValue(payload.analog_count, Number.NaN);
    if (Number.isFinite(payloadAnalogCount)) analogCount += payloadAnalogCount;
    const payloadExactCount = numberValue(payload.exact_analog_count, Number.NaN);
    if (Number.isFinite(payloadExactCount)) exactAnalogCount += payloadExactCount;
    const payloadMatchedCount = numberValue(payload.matched_analog_count, Number.NaN);
    if (Number.isFinite(payloadMatchedCount)) matchedAnalogCount += payloadMatchedCount;

    for (const analog of arrayValue(payload.top_analogs).map(objectValue)) {
      const identity = analogIdentity(analog);
      if (identity) seenAnalogs.add(identity);
      const analogScore = numberValue(analog.score);
      bestScore = Math.max(bestScore, analogScore);
      if (!Number.isFinite(payloadExactCount) && booleanValue(analog.exact_match)) exactAnalogCount += 1;
      if (booleanValue(analog.matched)) {
        bestMatchedScore = Math.max(bestMatchedScore, analogScore);
        if (!Number.isFinite(payloadMatchedCount)) matchedAnalogCount += 1;
      }
    }
  }

  return {
    bestScore: roundScore(bestScore),
    bestMatchedScore: roundScore(bestMatchedScore),
    analogCount: Math.max(analogCount, seenAnalogs.size),
    exactAnalogCount,
    matchedAnalogCount,
  };
}

function reviewRiskCountFor(store: KnowledgeGraphStore, entityIds: string[], matchStatus: Record<string, unknown>): number {
  if (entityIds.length === 0) return 0;
  const typedFacts = countRows(store, graphFacts, and(inArray(graphFacts.entityId, entityIds), like(graphFacts.factType, "%review%")));
  const rollupRisks = arrayValue(factPayload(store, entityIds[0], "past_pr_file_rollup").review_risks).length;
  const matchStatusRisks = arrayValue(matchStatus.review_risks).length;
  return typedFacts + rollupRisks + matchStatusRisks;
}

function factPayload(store: KnowledgeGraphStore, entityId: string, factType: string): Record<string, unknown> {
  const row = store.orm
    .select({ payload: graphFacts.payloadJson, factType: graphFacts.factType })
    .from(graphFacts)
    .where(and(eq(graphFacts.entityId, entityId), eq(graphFacts.factType, factType), eq(graphFacts.status, "accepted")))
    .limit(1)
    .get();
  if (!row) return {};
  return objectValue(graphFactPayload(row.factType, row.payload));
}

function countRows(
  store: KnowledgeGraphStore,
  table: typeof graphFacts | typeof graphEdges | typeof searchChunks,
  where: SQL | undefined,
): number {
  const row = store.orm.select({ count: sql<number>`COUNT(*)` }).from(table).where(where).get();
  return Number(row?.count ?? 0);
}

function dataRiskPenalty(sourcePath: string): number {
  if (sourcePath.endsWith(".h") || sourcePath.includes("/include/")) return 4;
  if (/(?:^|\/)(?:data|rodata|sdata|bss)(?:\/|$)/.test(sourcePath)) return 6;
  if (sourcePath.includes(".static.")) return 3;
  return 0;
}

function compactExplanation(values: string[]): string[] {
  return values.filter((value) => value.length > 0);
}

function analogIdentity(analog: Record<string, unknown>): string {
  const entityId = stringValue(analog.entity_id);
  if (entityId) return entityId;
  const unit = stringValue(analog.unit);
  const symbol = stringValue(analog.symbol);
  return unit && symbol ? `${unit}:${symbol}` : "";
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return typeof value === "string" && /^(?:true|yes|1)$/i.test(value);
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}
