import { and, eq, inArray, or } from "drizzle-orm";
import { functionEntityId } from "../builders/code-graph.js";
import type { KnowledgeGraphStore } from "../db.js";
import { graphFactPayload, graphPayload } from "../payloads.js";
import { graphEdges, graphEntities, graphFacts } from "../storage/schema.js";
import type { RelatedFunctionsQuery, RelatedFunctionsResult } from "../types.js";
import { arrayValue, objectValue, stringValue } from "../util.js";

interface FunctionEvidence {
  entity_id: string;
  function: Record<string, unknown>;
  opseq_analogs: Array<Record<string, unknown>>;
  callers: Array<Record<string, unknown>>;
  callees: Array<Record<string, unknown>>;
  data_references: Array<Record<string, unknown>>;
  learnings: Array<Record<string, unknown>>;
}

/** Resolve one or more functions and return their graph-owned analog and call relationships. */
export function relatedFunctions(store: KnowledgeGraphStore, query: RelatedFunctionsQuery): RelatedFunctionsResult {
  const limit = Math.max(1, Math.min(25, Math.trunc(query.limit ?? 10)));
  const entityIds = resolveFunctionEntityIds(store, query).slice(0, limit);
  const evidence = functionRelationshipEvidence(store, entityIds, limit);
  return {
    query: {
      source_path: clean(query.sourcePath) || undefined,
      unit: clean(query.unit) || undefined,
      symbol: clean(query.symbol) || undefined,
      entity_id: clean(query.entityId) || undefined,
      limit,
    },
    resolved_function_count: evidence.length,
    functions: evidence,
  };
}

/** Return relationship evidence for known function entity ids. Used by file cards and direct graph queries. */
export function functionRelationshipEvidence(
  store: KnowledgeGraphStore,
  entityIds: string[],
  limit = 12,
): FunctionEvidence[] {
  const uniqueIds = [...new Set(entityIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
  const entities = store.orm
    .select({ id: graphEntities.id, payload: graphEntities.payloadJson })
    .from(graphEntities)
    .where(and(eq(graphEntities.entityType, "function"), inArray(graphEntities.id, uniqueIds)))
    .all();
  const entityPayloads = new Map(entities.map((row) => [row.id, graphPayload(row.payload)]));
  const facts = store.orm
    .select({ entityId: graphFacts.entityId, factType: graphFacts.factType, payload: graphFacts.payloadJson, evidenceRef: graphFacts.evidenceRef })
    .from(graphFacts)
    .where(
      and(
        inArray(graphFacts.entityId, uniqueIds),
        inArray(graphFacts.factType, ["opseq_analog_profile", "call_graph_profile"]),
        eq(graphFacts.status, "accepted"),
      ),
    )
    .all();
  const edges = relationshipEdges(store, uniqueIds);
  const factsByEntity = new Map<string, Map<string, (typeof facts)[number]>>();
  for (const fact of facts) {
    const byType = factsByEntity.get(fact.entityId) ?? new Map();
    byType.set(fact.factType, fact);
    factsByEntity.set(fact.entityId, byType);
  }
  const analogEntityIds = facts
    .filter((fact) => fact.factType === "opseq_analog_profile")
    .flatMap((fact) => arrayValue(objectValue(graphFactPayload(fact.factType, fact.payload)).top_analogs).map(objectValue).map(peerEntityId))
    .filter((entityId): entityId is string => Boolean(entityId));
  const learningsByEntity = learningProfilesByEntity(store, [...new Set([...uniqueIds, ...analogEntityIds])]);

  return uniqueIds
    .filter((entityId) => entityPayloads.has(entityId) || factsByEntity.has(entityId))
    .map((entityId) => {
      const byType = factsByEntity.get(entityId);
      const opseqFact = byType?.get("opseq_analog_profile");
      const callFact = byType?.get("call_graph_profile");
      const opseq = opseqFact ? objectValue(graphFactPayload(opseqFact.factType, opseqFact.payload)) : {};
      const callGraph = callFact ? objectValue(graphFactPayload(callFact.factType, callFact.payload)) : {};
      const entity = entityPayloads.get(entityId) ?? sourcePayload(opseq, callGraph);
      return {
        entity_id: entityId,
        function: normalizedFunction(entityId, entity),
        opseq_analogs: arrayValue(opseq.top_analogs)
          .map(objectValue)
          .slice(0, boundedLimit)
          .map((analog) => {
            const analogId = peerEntityId(analog);
            return {
              entity_id: analogId,
              unit: stringValue(analog.unit) || null,
              symbol: stringValue(analog.symbol),
              source_path: stringValue(analog.source_path) || null,
              score: analog.score ?? null,
              exact_match: booleanValue(analog.exact_match),
              matched: booleanValue(analog.matched),
              method: stringValue(analog.method) || null,
              evidence_ref: stringValue(analog.evidence_ref, stringValue(opseqFact?.evidenceRef)),
              learnings: (analogId && learningsByEntity.get(analogId)) || [],
            };
          }),
        callers: relationPeers(entityId, "caller", callGraph, callFact?.evidenceRef, edges, boundedLimit),
        callees: relationPeers(entityId, "callee", callGraph, callFact?.evidenceRef, edges, boundedLimit),
        data_references: dataReferences(entityId, callGraph, callFact?.evidenceRef, edges, boundedLimit),
        learnings: learningsByEntity.get(entityId) ?? [],
      };
    });
}

/** Knowledge-ledger learnings anchored on the given entities, top 5 per entity by confidence so payloads stay bounded. */
export function learningProfilesByEntity(
  store: KnowledgeGraphStore,
  entityIds: string[],
  perEntityLimit = 5,
): Map<string, Array<Record<string, unknown>>> {
  const byEntity = new Map<string, Array<Record<string, unknown>>>();
  const uniqueIds = [...new Set(entityIds.filter(Boolean))];
  if (uniqueIds.length === 0) return byEntity;
  const rows = store.orm
    .select({
      entityId: graphFacts.entityId,
      factType: graphFacts.factType,
      payload: graphFacts.payloadJson,
      confidence: graphFacts.confidence,
      evidenceRef: graphFacts.evidenceRef,
    })
    .from(graphFacts)
    .where(
      and(
        inArray(graphFacts.entityId, uniqueIds),
        eq(graphFacts.factType, "learning_profile"),
        eq(graphFacts.status, "accepted"),
      ),
    )
    .all();
  for (const row of rows) {
    const payload = objectValue(graphFactPayload(row.factType, row.payload));
    const entries = byEntity.get(row.entityId) ?? [];
    entries.push({
      learning_id: stringValue(payload.learning_id) || null,
      statement: stringValue(payload.statement),
      origin: stringValue(payload.origin) || null,
      status: stringValue(payload.status) || null,
      confidence: typeof payload.confidence === "number" ? payload.confidence : row.confidence,
      evidence_ref: stringValue(row.evidenceRef),
    });
    byEntity.set(row.entityId, entries);
  }
  for (const [entityId, entries] of byEntity) {
    byEntity.set(
      entityId,
      entries.sort((left, right) => Number(right.confidence ?? 0) - Number(left.confidence ?? 0)).slice(0, perEntityLimit),
    );
  }
  return byEntity;
}

function resolveFunctionEntityIds(store: KnowledgeGraphStore, query: RelatedFunctionsQuery): string[] {
  const sourcePath = clean(query.sourcePath);
  const unit = clean(query.unit);
  const symbol = clean(query.symbol);
  const requestedEntityId = clean(query.entityId);
  if (sourcePath) {
    const row = store.orm
      .select({ payload: graphFacts.payloadJson, factType: graphFacts.factType })
      .from(graphFacts)
      .where(
        and(
          eq(graphFacts.entityId, `file:${sourcePath}`),
          eq(graphFacts.factType, "file_match_status"),
          eq(graphFacts.status, "accepted"),
        ),
      )
      .limit(1)
      .get();
    if (!row) return [];
    return arrayValue(graphFactPayload(row.factType, row.payload).functions)
      .map(objectValue)
      .filter((fn) => (!unit || stringValue(fn.unit) === unit) && (!symbol || stringValue(fn.symbol) === symbol))
      .map((fn) => functionEntityId(stringValue(fn.unit), stringValue(fn.symbol)))
      .filter((entityId) => !requestedEntityId || entityId === requestedEntityId);
  }
  if (requestedEntityId) return [requestedEntityId];
  if (unit && symbol) return [functionEntityId(unit, symbol)];
  return [];
}

interface RelationshipEdge {
  from: string;
  to: string;
  type: string;
  weight: number;
  evidenceRef: string;
  fromPayload?: Record<string, unknown>;
  toPayload?: Record<string, unknown>;
}

function relationshipEdges(store: KnowledgeGraphStore, entityIds: string[]): RelationshipEdge[] {
  const rows = store.orm
    .select({
      from: graphEdges.fromEntityId,
      to: graphEdges.toEntityId,
      type: graphEdges.edgeType,
      weight: graphEdges.weight,
      evidenceRef: graphEdges.evidenceRef,
    })
    .from(graphEdges)
    .where(
      and(
        inArray(graphEdges.edgeType, ["CALLS", "REFERENCES_DATA"]),
        eq(graphEdges.status, "accepted"),
        or(inArray(graphEdges.fromEntityId, entityIds), inArray(graphEdges.toEntityId, entityIds)),
      ),
    )
    .all();
  const peerIds = [...new Set(rows.flatMap((row) => [row.from, row.to]))];
  const peers = peerIds.length
    ? store.orm
        .select({ id: graphEntities.id, payload: graphEntities.payloadJson })
        .from(graphEntities)
        .where(inArray(graphEntities.id, peerIds))
        .all()
    : [];
  const payloadById = new Map(peers.map((row) => [row.id, graphPayload(row.payload)]));
  return rows.map((row) => ({ ...row, fromPayload: payloadById.get(row.from), toPayload: payloadById.get(row.to) }));
}

function relationPeers(
  entityId: string,
  direction: "caller" | "callee",
  payload: Record<string, unknown>,
  fallbackEvidenceRef: string | undefined,
  edges: RelationshipEdge[],
  limit: number,
): Array<Record<string, unknown>> {
  const key = direction === "caller" ? "top_callers" : "top_callees";
  const profilePeers = arrayValue(payload[key])
    .map(objectValue)
    .map((peer) => {
      const peerId = peerEntityId(peer);
      const edge = edges.find((candidate) =>
        candidate.type === "CALLS" &&
        (direction === "caller" ? candidate.from === peerId && candidate.to === entityId : candidate.from === entityId && candidate.to === peerId));
      return {
        entity_id: peerId,
        unit: stringValue(peer.unit) || null,
        symbol: stringValue(peer.symbol),
        source_path: stringValue(peer.source_path) || null,
        count: peer.count ?? null,
        resolved: Boolean(peer.resolved),
        weight: edge?.weight ?? null,
        evidence_ref: edge?.evidenceRef ?? fallbackEvidenceRef ?? "",
      };
    });
  const edgePeers = edges
    .filter((edge) => edge.type === "CALLS" && (direction === "caller" ? edge.to === entityId : edge.from === entityId))
    .map((edge) => {
      const peerId = direction === "caller" ? edge.from : edge.to;
      const peer = direction === "caller" ? edge.fromPayload : edge.toPayload;
      return {
        entity_id: peerId,
        unit: stringValue(peer?.unit) || null,
        symbol: stringValue(peer?.symbol),
        source_path: stringValue(peer?.source_path, stringValue(peer?.sourcePath)) || null,
        count: null,
        resolved: true,
        weight: edge.weight,
        evidence_ref: edge.evidenceRef,
      };
    });
  return uniqueRelationships([...profilePeers, ...edgePeers]).slice(0, limit);
}

function dataReferences(
  entityId: string,
  payload: Record<string, unknown>,
  fallbackEvidenceRef: string | undefined,
  edges: RelationshipEdge[],
  limit: number,
): Array<Record<string, unknown>> {
  const profileRefs = arrayValue(payload.top_data_refs)
    .map(objectValue)
    .map((ref) => {
      const symbol = stringValue(ref.symbol);
      const edge = edges.find(
        (candidate) => candidate.type === "REFERENCES_DATA" && candidate.from === entityId && stringValue(candidate.toPayload?.symbol) === symbol,
      );
      return {
        entity_id: edge?.to ?? null,
        symbol,
        ref_kind: stringValue(ref.ref_kind, "data"),
        count: ref.count ?? null,
        weight: edge?.weight ?? null,
        evidence_ref: edge?.evidenceRef ?? fallbackEvidenceRef ?? "",
      };
    });
  const edgeRefs = edges
    .filter((edge) => edge.type === "REFERENCES_DATA" && edge.from === entityId)
    .map((edge) => ({
      entity_id: edge.to,
      symbol: stringValue(edge.toPayload?.symbol),
      ref_kind: "function_pointer",
      count: null,
      weight: edge.weight,
      evidence_ref: edge.evidenceRef,
    }));
  return uniqueRelationships([...profileRefs, ...edgeRefs]).slice(0, limit);
}

function uniqueRelationships(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const unique = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = stringValue(row.entity_id) || `${stringValue(row.symbol)}\u0000${stringValue(row.ref_kind)}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

function sourcePayload(opseq: Record<string, unknown>, callGraph: Record<string, unknown>): Record<string, unknown> {
  const opseqSource = objectValue(opseq.source);
  if (Object.keys(opseqSource).length > 0) return opseqSource;
  return objectValue(callGraph.source);
}

function normalizedFunction(entityId: string, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    entity_id: entityId,
    unit: stringValue(payload.unit) || null,
    symbol: stringValue(payload.symbol),
    source_path: stringValue(payload.source_path, stringValue(payload.sourcePath)) || null,
    address: stringValue(payload.address) || null,
    fuzzy: payload.fuzzy ?? null,
    status: stringValue(payload.status) || null,
  };
}

function peerEntityId(peer: Record<string, unknown>): string | null {
  const unit = stringValue(peer.unit);
  const symbol = stringValue(peer.symbol);
  return unit && symbol ? functionEntityId(unit, symbol) : null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return typeof value === "string" && /^(?:true|yes|1)$/i.test(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
