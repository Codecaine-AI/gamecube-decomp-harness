import type { KnowledgeStoreHandle, SubjectRef } from "../records/index.js";
import type { EntityIdentityStatus, EntityKind, FactType, SourceKind, TargetIdentityStatus, TargetKind } from "../storage/schema.js";

export interface KnowledgeEvidence {
  id: string;
  kind: SourceKind;
  locator: string;
  digest: string | null;
  why: string;
  capturedAt: string;
}

export interface KnowledgeFact {
  id: string;
  type: FactType;
  value: string;
  rationale: string;
  confidence: number;
  updatedAt: string;
  evidence: KnowledgeEvidence[];
}

export type SubjectIdentity =
  | { subjectKind: "target"; id: string; kind: TargetKind; stableKey: string; unit: string; symbol: string | null; address: string | null; identityStatus: TargetIdentityStatus }
  | { subjectKind: "entity"; id: string; kind: EntityKind; locator: string; identityStatus: EntityIdentityStatus };

export interface KnowledgeLink {
  id: string;
  direction: "outgoing" | "incoming";
  role: string;
  why: string;
  kind: SourceKind;
  locator: string;
  digest: string | null;
  other: SubjectIdentity;
}

export interface KnowledgeRecord {
  subject: SubjectIdentity | null;
  facts: Partial<Record<FactType, KnowledgeFact>>;
  links: KnowledgeLink[];
}

interface FactEvidenceRow {
  fact_id: string;
  type: FactType;
  value: string;
  rationale: string;
  confidence: number;
  updated_at: string;
  evidence_id: string | null;
  evidence_kind: SourceKind | null;
  evidence_locator: string | null;
  evidence_digest: string | null;
  evidence_why: string | null;
  evidence_captured_at: string | null;
}

interface LinkRow {
  id: string;
  direction: "outgoing" | "incoming";
  role: string;
  why: string;
  source_kind: SourceKind;
  source_locator: string;
  digest: string | null;
  other_target_id: string | null;
  target_kind: TargetKind | null;
  stable_key: string | null;
  unit: string | null;
  symbol: string | null;
  address: string | null;
  target_identity_status: TargetIdentityStatus | null;
  other_entity_id: string | null;
  entity_kind: EntityKind | null;
  entity_locator: string | null;
  entity_identity_status: EntityIdentityStatus | null;
}

export function knowledgeRecord(store: KnowledgeStoreHandle, subjectRef: SubjectRef): KnowledgeRecord {
  const column = subjectRef.targetId !== undefined ? "target_id" : "entity_id";
  const id = subjectRef.targetId ?? subjectRef.entityId!;
  const facts: Partial<Record<FactType, KnowledgeFact>> = {};
  const factRows = store.db.query<FactEvidenceRow, [string]>(`
    SELECT f.id AS fact_id, f.type, f.value, f.rationale, f.confidence, f.updated_at,
      e.id AS evidence_id, e.kind AS evidence_kind, e.locator AS evidence_locator,
      e.digest AS evidence_digest, e.why AS evidence_why, e.captured_at AS evidence_captured_at
    FROM fact f LEFT JOIN evidence e ON e.fact_id = f.id
    WHERE f.${column} = ? ORDER BY f.type, e.captured_at, e.id
  `).all(id);
  for (const row of factRows) {
    const fact = facts[row.type] ??= {
      id: row.fact_id, type: row.type, value: row.value, rationale: row.rationale,
      confidence: row.confidence, updatedAt: row.updated_at, evidence: [],
    };
    if (row.evidence_id !== null) fact.evidence.push({
      id: row.evidence_id, kind: row.evidence_kind!, locator: row.evidence_locator!,
      digest: row.evidence_digest, why: row.evidence_why!, capturedAt: row.evidence_captured_at!,
    });
  }

  return { subject: readSubject(store, subjectRef), facts, links: readLinks(store, subjectRef) };
}

function readSubject(store: KnowledgeStoreHandle, subject: SubjectRef): SubjectIdentity | null {
  if (subject.targetId !== undefined) {
    const row = store.db.query<any, [string]>("SELECT * FROM target WHERE id = ?").get(subject.targetId);
    return row ? { subjectKind: "target", id: row.id, kind: row.kind, stableKey: row.stable_key, unit: row.unit, symbol: row.symbol, address: row.address, identityStatus: row.identity_status } : null;
  }
  const row = store.db.query<any, [string]>("SELECT * FROM entity WHERE id = ?").get(subject.entityId);
  return row ? { subjectKind: "entity", id: row.id, kind: row.kind, locator: row.locator, identityStatus: row.identity_status } : null;
}

function readLinks(store: KnowledgeStoreHandle, subject: SubjectRef): KnowledgeLink[] {
  const isTarget = subject.targetId !== undefined;
  const id = subject.targetId ?? subject.entityId!;
  const fromColumn = isTarget ? "from_target_id" : "from_entity_id";
  const toColumn = isTarget ? "to_target_id" : "to_entity_id";
  const rows = store.db.query<LinkRow, [string, string, string, string, string, string, string]>(`
    SELECT l.id, CASE WHEN l.${fromColumn} = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
      l.role, l.why, l.kind AS source_kind, l.locator AS source_locator, l.digest,
      CASE WHEN l.${fromColumn} = ? THEN l.to_target_id ELSE l.from_target_id END AS other_target_id,
      CASE WHEN l.${fromColumn} = ? THEN l.to_entity_id ELSE l.from_entity_id END AS other_entity_id,
      t.kind AS target_kind, t.stable_key, t.unit, t.symbol, t.address,
      t.identity_status AS target_identity_status,
      e.kind AS entity_kind, e.locator AS entity_locator, e.identity_status AS entity_identity_status
    FROM link l
    LEFT JOIN target t ON t.id = CASE WHEN l.${fromColumn} = ? THEN l.to_target_id ELSE l.from_target_id END
    LEFT JOIN entity e ON e.id = CASE WHEN l.${fromColumn} = ? THEN l.to_entity_id ELSE l.from_entity_id END
    WHERE l.${fromColumn} = ? OR l.${toColumn} = ?
    ORDER BY l.id
  `).all(id, id, id, id, id, id, id);
  return rows.map((row) => ({
    id: row.id, direction: row.direction, role: row.role, why: row.why,
    kind: row.source_kind, locator: row.source_locator, digest: row.digest,
    other: row.other_target_id !== null
      ? { subjectKind: "target", id: row.other_target_id, kind: row.target_kind!, stableKey: row.stable_key!, unit: row.unit!, symbol: row.symbol, address: row.address, identityStatus: row.target_identity_status! }
      : { subjectKind: "entity", id: row.other_entity_id!, kind: row.entity_kind!, locator: row.entity_locator!, identityStatus: row.entity_identity_status! },
  }));
}
