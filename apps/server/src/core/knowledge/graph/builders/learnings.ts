/**
 * Knowledge-ledger graph builder: indexes learnings onto targets.
 *
 * Reads projects/melee/knowledge/ledger/learnings.jsonl (append-only;
 * latest record per id wins), anchors each learning against the current
 * function index / checkout (present-anchoring: a missing anchor marks the
 * learning stale rather than dropping it), and emits:
 *  - one `learning` entity per non-refuted learning,
 *  - a HAS_LEARNING edge from the anchored function/file entity,
 *  - a `learning_profile` fact on the anchor entity,
 *  - a search chunk so learnings surface in graph search.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defaultLedgerPath, type LearningRecord } from "../../ledger.js";
import { fileEntityId, functionEntityId } from "./code-graph.js";
import type { GraphEdge, GraphEntity, GraphFact, GraphRecords, SearchChunk } from "../types.js";
import { filesFingerprint, shortHash } from "../util.js";

export const LEARNINGS_SOURCE_ID = "knowledge_ledger";

interface AnchorIndex {
  symbolToUnit: Map<string, string>;
  checkoutRoot: string;
  repoRoot: string;
}

function buildAnchorIndex(repoRoot: string): AnchorIndex {
  const symbolToUnit = new Map<string, string>();
  const functionsIndex = resolve(
    repoRoot,
    "projects/melee/knowledge/sources/code_context/code_graph/indexes/functions.jsonl",
  );
  if (existsSync(functionsIndex)) {
    for (const line of readFileSync(functionsIndex, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { unit?: string; symbol?: string };
        if (row.symbol && row.unit && !symbolToUnit.has(row.symbol)) symbolToUnit.set(row.symbol, row.unit);
      } catch {
        // tolerate malformed rows
      }
    }
  }
  return { symbolToUnit, checkoutRoot: resolve(repoRoot, "projects/melee/checkout"), repoRoot };
}

function latestLearnings(ledgerPath: string): LearningRecord[] {
  const latest = new Map<string, LearningRecord>();
  if (!existsSync(ledgerPath)) return [];
  for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as LearningRecord;
      if (record?.id) latest.set(record.id, record);
    } catch {
      // tolerate malformed lines
    }
  }
  return [...latest.values()];
}

/** Resolve the anchor entity for a learning; null anchor => area/general (entity + chunk only). */
function anchorEntity(record: LearningRecord, index: AnchorIndex): { entityId: string | null; exists: boolean } {
  const subject = (record.subject ?? {}) as unknown as Record<string, unknown>;
  const scope = String(subject.scope ?? "general");
  if (scope === "symbol") {
    const symbol = String(subject.symbol ?? "");
    const unit = index.symbolToUnit.get(symbol);
    return unit
      ? { entityId: functionEntityId(unit, symbol), exists: true }
      : { entityId: null, exists: false };
  }
  if (scope === "file") {
    const file = String(subject.file ?? "");
    if (!file) return { entityId: null, exists: false };
    const exists = existsSync(resolve(index.checkoutRoot, file)) || existsSync(resolve(index.repoRoot, file));
    return { entityId: fileEntityId(file), exists };
  }
  return { entityId: null, exists: true };
}

export function buildLearningsGraphRecords(options: {
  repoRoot: string;
  ledgerPath?: string;
}): GraphRecords | null {
  const ledgerPath = options.ledgerPath ?? defaultLedgerPath();
  if (!existsSync(ledgerPath)) return null;

  const sourceVersionId = `source-version:${LEARNINGS_SOURCE_ID}:${shortHash(filesFingerprint([ledgerPath]))}`;
  const anchorIndex = buildAnchorIndex(options.repoRoot);
  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const edges: GraphEdge[] = [];
  const chunks: SearchChunk[] = [];

  for (const record of latestLearnings(ledgerPath)) {
    if (record.status === "refuted") continue;
    const subject = (record.subject ?? {}) as unknown as Record<string, unknown>;
    const scope = String(subject.scope ?? "general");
    const anchorLabel = String(subject.symbol ?? subject.file ?? subject.area ?? "general");
    const anchor = anchorEntity(record, anchorIndex);
    const status = anchor.exists ? record.status ?? "proposed" : "stale";
    const learningEntityId = `learning:${shortHash(record.id)}`;

    entities.push({
      id: learningEntityId,
      entityType: "learning",
      stableKey: record.id,
      payload: {
        statement: record.statement,
        scope,
        anchor: anchorLabel,
        origin: record.origin,
        status,
        confidence: record.confidence,
        evidence_count: Array.isArray(record.evidence) ? record.evidence.length : 0,
      } as GraphEntity["payload"],
      replace: true,
    });

    chunks.push({
      id: `chunk:learning:${shortHash(record.id)}`,
      sourceVersionId,
      sourceId: LEARNINGS_SOURCE_ID,
      entityId: learningEntityId,
      title: `learning — ${anchorLabel}`,
      text: record.statement,
      evidenceRef: `ledger:${record.id}`,
      payload: { scope, origin: record.origin, status, confidence: record.confidence },
    });

    if (anchor.entityId) {
      edges.push({
        id: `edge:HAS_LEARNING:${shortHash(`${anchor.entityId}:${record.id}`)}`,
        fromEntityId: anchor.entityId,
        edgeType: "HAS_LEARNING",
        toEntityId: learningEntityId,
        sourceVersionId,
        evidenceRef: `ledger:${record.id}`,
        weight: typeof record.confidence === "number" ? record.confidence : 0.5,
      } as GraphEdge);

      facts.push({
        id: `fact:learning_profile:${shortHash(`${anchor.entityId}:${record.id}`)}`,
        entityId: anchor.entityId,
        factType: "learning_profile",
        payload: {
          learning_id: record.id,
          statement: record.statement,
          origin: record.origin,
          status,
          confidence: record.confidence,
        } as GraphFact["payload"],
        confidence: typeof record.confidence === "number" ? record.confidence : 0.5,
        trustTier: record.origin === "human_extracted" ? "historical" : "tool_evidence",
        evidenceRef: `ledger:${record.id}`,
        sourceVersionId,
      } as GraphFact);
    }
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: LEARNINGS_SOURCE_ID,
      contentHash: shortHash(readFileSync(ledgerPath, "utf8")),
      sourcePaths: [ledgerPath],
    },
    entities,
    facts,
    edges,
    chunks,
  };
}
