import type { Database } from "bun:sqlite";
import { resourceGraphDbPath } from "../paths.js";
import { fileEntityId, functionEntityId } from "./code-graph.js";
import { graphDbExists, openKnowledgeGraph, type KnowledgeGraphStore } from "./db.js";
import type { GraphRankFeature } from "./types.js";
import { arrayValue, numberValue, objectValue, stringValue } from "./util.js";

const RESOURCE_EDGE_TYPES = [
  "HAS_PATH_FACT",
  "HAS_TOOL_FINDING",
  "HAS_DATA_SHEET_REFERENCE",
  "HAS_POWERPC_REFERENCE",
  "HAS_EXTERNAL_MIRROR_REFERENCE",
  "HAS_DECOMP_STANDARD",
  "HAS_DOCUMENT_REFERENCE",
  "HAS_RESOURCE_EVIDENCE",
];
const TOOL_EDGE_TYPES = ["HAS_TOOL_FINDING"];
const HISTORICAL_EDGE_TYPES = ["HAS_HISTORICAL_FUNCTION_HINT", "HAS_HISTORICAL_TOOL_LESSON", "MENTIONED_IN_HISTORICAL_TOOL_ISSUE"];
const CURATED_EDGE_TYPES = ["HAS_CURATED_WORKER_LESSON", "HAS_CURATED_PR_LESSON", "HAS_SOURCE_UPDATE_PROPOSAL", "HAS_CURATED_KNOWLEDGE"];

export function rankFeatureForSourcePath(store: KnowledgeGraphStore, sourcePath: string, target?: GraphRankFeature["target"]): GraphRankFeature {
  const entityId = fileEntityId(sourcePath);
  const functionEntity =
    target?.unit && target.symbol ? functionEntityId(target.unit, target.symbol) : undefined;
  const targetIds = [entityId, functionEntity].filter((id): id is string => Boolean(id));
  const editability = editabilityFor(store.db, entityId);

  const matchStatus = factPayload(store.db, entityId, "file_match_status");
  const functions = arrayValue(matchStatus.functions).map(objectValue);
  const unmatchedFunctions = arrayValue(matchStatus.unmatched_functions).map(objectValue);
  const targetSymbol = target?.symbol ?? "";
  const connectedIncompleteFunctionCount = unmatchedFunctions.filter((fn) => stringValue(fn.symbol) !== targetSymbol).length;
  const matchedSiblingCount = functions.filter((fn) => numberValue(fn.fuzzy, 100) >= 100).length;

  const graphDegree = edgeDegree(store.db, [entityId]);
  const functionGraphDegree = functionEntity ? edgeDegree(store.db, [functionEntity]) : 0;
  const relevantPrCount = edgeTypeCount(store.db, [entityId], ["TOUCHED_BY_PR"]);
  const duplicateReferenceCount = edgeTypeCount(store.db, targetIds, ["ANALOGOUS_TO"]);
  const acceptedEdgeCount = statusEdgeCount(store.db, targetIds, "accepted");
  const pathFactCount = edgeTypeCount(store.db, [entityId], ["HAS_PATH_FACT"]);
  const toolFindingCount = edgeTypeCount(store.db, targetIds, TOOL_EDGE_TYPES);
  const resourceEvidenceCount = Math.max(
    edgeTypeCount(store.db, targetIds, RESOURCE_EDGE_TYPES),
    nonCodeSearchChunkCount(store.db, targetIds),
  );
  const historicalLessonCount = edgeTypeCount(store.db, targetIds, HISTORICAL_EDGE_TYPES);
  const curatedSignalCount = edgeTypeCount(store.db, targetIds, CURATED_EDGE_TYPES);
  const proposalFactCount = statusFactCount(store.db, targetIds, "proposal") + statusEdgeCount(store.db, targetIds, "proposal");
  const staleFactCount = statusFactCount(store.db, targetIds, "stale") + statusEdgeCount(store.db, targetIds, "stale");
  const reviewRiskCount = reviewRiskCountFor(store.db, targetIds, matchStatus);
  const connectedMatchedReferenceCount = matchedSiblingCount + duplicateReferenceCount;
  const linkedUnlockPotential = Math.min(1, (connectedIncompleteFunctionCount + duplicateReferenceCount + relevantPrCount / 4) / 12);

  const informationGainScore = roundScore(
    Math.min(26, graphDegree * 0.35 + functionGraphDegree * 0.6) +
      Math.min(28, resourceEvidenceCount * 2.5 + pathFactCount * 2 + toolFindingCount * 3) +
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
      Math.min(22, pathFactCount * 4 + toolFindingCount * 3 + historicalLessonCount * 2),
  );
  const completionReadinessScore = roundScore(
    Math.min(32, toolFindingCount * 5 + pathFactCount * 3 + historicalLessonCount * 4 + curatedSignalCount * 4 + proposalFactCount * 2) +
      Math.min(24, duplicateReferenceCount * 6 + connectedMatchedReferenceCount * 2.5) +
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
    toolFindingCount ? `tool_findings=${toolFindingCount}` : "",
    historicalLessonCount ? `historical_lessons=${historicalLessonCount}` : "",
    curatedSignalCount ? `curated_signals=${curatedSignalCount}` : "",
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
    linked_unlock_potential: linkedUnlockPotential,
    connected_incomplete_function_count: connectedIncompleteFunctionCount,
    connected_matched_reference_count: connectedMatchedReferenceCount,
    resource_evidence_count: resourceEvidenceCount,
    tool_finding_count: toolFindingCount,
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

function editabilityFor(db: Database, entityId: string): GraphRankFeature["editability"] {
  const row = db
    .query("SELECT payload_json FROM graph_facts WHERE entity_id = ? AND fact_type = 'editability' AND status = 'accepted' LIMIT 1")
    .get(entityId) as Record<string, unknown> | null;
  if (!row) return "unknown";
  const payload = objectValue(JSON.parse(stringValue(row.payload_json, "{}")));
  const mode = stringValue(payload.mode, "unknown");
  if (mode === "editable" || mode === "read_only_complete" || mode === "locked" || mode === "blocked") return mode;
  return "unknown";
}

function edgeDegree(db: Database, entityIds: string[]): number {
  if (entityIds.length === 0) return 0;
  const placeholders = placeholdersFor(entityIds);
  return count(
    db,
    `
      SELECT COUNT(*) AS count
      FROM graph_edges
      WHERE status = 'accepted'
        AND (from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders}))
    `,
    ...entityIds,
    ...entityIds,
  );
}

function edgeTypeCount(db: Database, entityIds: string[], edgeTypes: string[]): number {
  if (entityIds.length === 0 || edgeTypes.length === 0) return 0;
  const entityPlaceholders = placeholdersFor(entityIds);
  const typePlaceholders = placeholdersFor(edgeTypes);
  return count(
    db,
    `
      SELECT COUNT(*) AS count
      FROM graph_edges
      WHERE status = 'accepted'
        AND edge_type IN (${typePlaceholders})
        AND (from_entity_id IN (${entityPlaceholders}) OR to_entity_id IN (${entityPlaceholders}))
    `,
    ...edgeTypes,
    ...entityIds,
    ...entityIds,
  );
}

function statusFactCount(db: Database, entityIds: string[], status: string): number {
  if (entityIds.length === 0) return 0;
  const placeholders = placeholdersFor(entityIds);
  return count(db, `SELECT COUNT(*) AS count FROM graph_facts WHERE status = ? AND entity_id IN (${placeholders})`, status, ...entityIds);
}

function statusEdgeCount(db: Database, entityIds: string[], status: string): number {
  if (entityIds.length === 0) return 0;
  const placeholders = placeholdersFor(entityIds);
  return count(
    db,
    `
      SELECT COUNT(*) AS count
      FROM graph_edges
      WHERE status = ?
        AND (from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders}))
    `,
    status,
    ...entityIds,
    ...entityIds,
  );
}

function nonCodeSearchChunkCount(db: Database, entityIds: string[]): number {
  if (entityIds.length === 0) return 0;
  const placeholders = placeholdersFor(entityIds);
  return count(db, `SELECT COUNT(*) AS count FROM search_chunks WHERE source_id != 'code_graph' AND entity_id IN (${placeholders})`, ...entityIds);
}

function reviewRiskCountFor(db: Database, entityIds: string[], matchStatus: Record<string, unknown>): number {
  if (entityIds.length === 0) return 0;
  const placeholders = placeholdersFor(entityIds);
  const typedFacts = count(
    db,
    `SELECT COUNT(*) AS count FROM graph_facts WHERE entity_id IN (${placeholders}) AND fact_type LIKE '%review%'`,
    ...entityIds,
  );
  const rollupRisks = arrayValue(factPayload(db, entityIds[0], "past_pr_file_rollup").review_risks).length;
  const matchStatusRisks = arrayValue(matchStatus.review_risks).length;
  return typedFacts + rollupRisks + matchStatusRisks;
}

function factPayload(db: Database, entityId: string, factType: string): Record<string, unknown> {
  const row = db
    .query("SELECT payload_json FROM graph_facts WHERE entity_id = ? AND fact_type = ? AND status = 'accepted' LIMIT 1")
    .get(entityId, factType) as Record<string, unknown> | null;
  if (!row) return {};
  return objectValue(JSON.parse(stringValue(row.payload_json, "{}")));
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

function placeholdersFor(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

function count(db: Database, sql: string, ...params: Array<string | number>): number {
  const row = db.query(sql).get(...params) as Record<string, unknown>;
  return Number(row.count ?? 0);
}
