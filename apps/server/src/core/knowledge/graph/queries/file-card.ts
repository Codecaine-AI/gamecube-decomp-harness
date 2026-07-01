import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { fileEntityId, functionEntityId } from "../builders/code-graph.js";
import type { KnowledgeGraphStore } from "../db.js";
import { graphFactPayload, graphPayload } from "../payloads.js";
import { rankFeatureForSourcePath } from "./rank.js";
import { graphEdges, graphEntities, graphFacts, searchChunks } from "../storage/schema.js";
import type { FileGraphCard } from "../types.js";
import { arrayValue, objectValue, stringValue } from "../util.js";

export function fileGraphCard(store: KnowledgeGraphStore, sourcePath: string): FileGraphCard {
  const entityId = fileEntityId(sourcePath);
  const matchStatus = factPayload(store, entityId, "file_match_status");
  const functionRows = arrayValue(matchStatus.functions).map(objectValue);
  const editabilityPayload = factPayload(store, entityId, "editability");
  const editability = {
    mode: editabilityMode(editabilityPayload.mode),
    reason: stringValue(editabilityPayload.reason, "No editability fact is available for this file."),
  };
  const touchingPrs = store.orm
    .select({ payload: graphEntities.payloadJson })
    .from(graphEdges)
    .innerJoin(graphEntities, eq(graphEntities.id, graphEdges.toEntityId))
    .where(and(eq(graphEdges.fromEntityId, entityId), eq(graphEdges.edgeType, "TOUCHED_BY_PR")))
    .orderBy(desc(graphEntities.stableKey))
    .limit(24)
    .all();
  const rollup = factPayload(store, entityId, "past_pr_file_rollup");
  const resourceHits = store.orm
    .select({
      sourceId: searchChunks.sourceId,
      title: searchChunks.title,
      evidenceRef: searchChunks.evidenceRef,
    })
    .from(searchChunks)
    .where(and(eq(searchChunks.entityId, entityId), ne(searchChunks.sourceId, "mismatch_patterns")))
    .orderBy(searchChunks.sourceId, searchChunks.title)
    .limit(16)
    .all();
  return {
    entity_id: entityId,
    source_path: sourcePath,
    editability,
    match_status: matchStatus,
    units: arrayValue(matchStatus.units).map((unit) => ({ unit: String(unit) })),
    functions: functionRows,
    pr_history: {
      touching_prs: touchingPrs.map((row) => graphPayload(row.payload)),
      review_risks: arrayValue(rollup.review_risks).map((value) => ({ value })),
      tactics: arrayValue(rollup.tactics).map((value) => ({ value })),
    },
    resource_hits: resourceHits.map((row) => ({
      source_id: stringValue(row.sourceId),
      title: stringValue(row.title),
      evidence_ref: stringValue(row.evidenceRef),
    })),
    mismatch_patterns: mismatchPatternsForFile(store, entityId),
    tool_hits: opseqAnalogToolHitsForFile(store, functionRows),
    scheduling_signals: rankFeatureForSourcePath(store, sourcePath),
  };
}

function opseqAnalogToolHitsForFile(store: KnowledgeGraphStore, functions: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const functionIds = functions
    .map((fn) => {
      const unit = stringValue(fn.unit);
      const symbol = stringValue(fn.symbol);
      return unit && symbol ? functionEntityId(unit, symbol) : "";
    })
    .filter(Boolean);
  if (functionIds.length === 0) return [];

  const rows = store.orm
    .select({
      entityId: graphFacts.entityId,
      payload: graphFacts.payloadJson,
      factType: graphFacts.factType,
      evidenceRef: graphFacts.evidenceRef,
    })
    .from(graphFacts)
    .where(and(eq(graphFacts.status, "accepted"), eq(graphFacts.factType, "opseq_analog_profile"), inArray(graphFacts.entityId, functionIds)))
    .all();

  const hits: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const payload = objectValue(graphFactPayload(row.factType, row.payload));
    const source = objectValue(payload.source);
    for (const analog of arrayValue(payload.top_analogs).map(objectValue).slice(0, 5)) {
      hits.push({
        tool_id: "opseq",
        source_id: "opseq_similarity",
        entity_id: row.entityId,
        unit: stringValue(source.unit),
        symbol: stringValue(source.symbol),
        analog_unit: stringValue(analog.unit),
        analog_symbol: stringValue(analog.symbol),
        analog_source_path: stringValue(analog.source_path),
        score: analog.score ?? null,
        exact_match: booleanValue(analog.exact_match),
        matched: booleanValue(analog.matched),
        evidence_ref: stringValue(analog.evidence_ref, stringValue(row.evidenceRef)),
      });
    }
  }
  return hits
    .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0) || stringValue(left.analog_symbol).localeCompare(stringValue(right.analog_symbol)))
    .slice(0, 12);
}

function mismatchPatternsForFile(store: KnowledgeGraphStore, entityId: string): Array<Record<string, unknown>> {
  const patternRows = store.orm
    .select({
      patternEntityId: graphEntities.id,
      patternPayload: graphEntities.payloadJson,
      evidenceRef: graphEdges.evidenceRef,
      weight: graphEdges.weight,
    })
    .from(graphEdges)
    .innerJoin(graphEntities, eq(graphEntities.id, graphEdges.toEntityId))
    .where(
      and(
        eq(graphEdges.fromEntityId, entityId),
        eq(graphEdges.edgeType, "HAS_MISMATCH_PATTERN"),
        eq(graphEdges.status, "accepted"),
        eq(graphEntities.entityType, "mismatch_pattern"),
      ),
    )
    .orderBy(desc(graphEdges.weight), graphEntities.stableKey)
    .limit(48)
    .all();
  const evidenceRows = store.orm
    .select({
      evidencePayload: graphEntities.payloadJson,
      evidenceRef: graphEdges.evidenceRef,
      weight: graphEdges.weight,
    })
    .from(graphEdges)
    .innerJoin(graphEntities, eq(graphEntities.id, graphEdges.toEntityId))
    .where(
      and(
        eq(graphEdges.fromEntityId, entityId),
        eq(graphEdges.edgeType, "HAS_MISMATCH_PATTERN_EVIDENCE"),
        eq(graphEdges.status, "accepted"),
        eq(graphEntities.entityType, "mismatch_pattern_evidence"),
      ),
    )
    .orderBy(desc(graphEdges.weight), graphEdges.evidenceRef)
    .limit(48)
    .all();

  const evidenceByPattern = new Map<string, Array<Record<string, unknown>>>();
  for (const row of evidenceRows) {
    const payload = graphPayload(row.evidencePayload);
    const patternId = stringValue(payload.pattern_id);
    if (!patternId) continue;
    const records = evidenceByPattern.get(patternId) ?? [];
    records.push({
      title: stringValue(payload.title),
      kind: stringValue(payload.kind),
      evidence_ref: stringValue(payload.evidence_ref, stringValue(row.evidenceRef)),
      source_paths: arrayValue(payload.source_paths).map(String),
      unit: stringValue(payload.unit) || null,
      symbol: stringValue(payload.symbol) || null,
      pr: payload.pr ?? null,
    });
    evidenceByPattern.set(patternId, records);
  }

  const byPattern = new Map<string, Record<string, unknown>>();
  for (const row of patternRows) {
    const payload = graphPayload(row.patternPayload);
    const patternId = stringValue(payload.id, stringValue(row.patternEntityId));
    const existing = byPattern.get(patternId);
    const evidenceRefs = new Set(arrayValue(existing?.linked_evidence_refs).map(String));
    evidenceRefs.add(stringValue(row.evidenceRef));
    byPattern.set(patternId, {
      pattern_id: patternId,
      title: stringValue(payload.title),
      category: stringValue(payload.category),
      symptoms: arrayValue(payload.symptoms).map(String),
      tactics: arrayValue(payload.tactics).map(String),
      evidence_count: payload.evidence_count ?? 0,
      linked_evidence_refs: [...evidenceRefs].filter(Boolean),
      linked_evidence: evidenceByPattern.get(patternId) ?? [],
    });
  }
  return [...byPattern.values()].slice(0, 16);
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

function editabilityMode(value: unknown): FileGraphCard["editability"]["mode"] {
  const mode = stringValue(value, "unknown");
  if (mode === "editable" || mode === "read_only_complete" || mode === "locked" || mode === "blocked") return mode;
  return "unknown";
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return typeof value === "string" && /^(?:true|yes|1)$/i.test(value);
}
