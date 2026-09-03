const API_ROOT = "/api/knowledge/v2";

export type SubjectIdentity =
  | {
      subjectKind: "target";
      id: string;
      kind: string;
      stableKey: string;
      unit: string;
      symbol: string | null;
      address: string | null;
      identityStatus: string;
    }
  | {
      subjectKind: "entity";
      id: string;
      kind: string;
      locator: string;
      identityStatus: string;
    };

export interface KnowledgeSummary {
  targets: { total: number; stamped: number; with_facts: number };
  entities: { total: number; by_kind: Record<string, number>; stamped: number };
  facts: {
    total: number;
    by_type: Record<string, number>;
    confidence: { mean: number; below_0_7: number; below_0_9: number };
  };
  evidence: { total: number; by_kind: Record<string, number> };
  links: { total: number; by_role: Record<string, number> };
  drift: { warned_tasks: number; released_pending: number };
}

export interface KnowledgeDriftWarning {
  task_id: string;
  pathway: string;
  done_at: string;
  subject: SubjectIdentity;
}

export interface KnowledgeTreeNode {
  name: string;
  path: string;
  kind: "dir" | "unit";
  target_count: number;
  fact_count: number;
  children?: KnowledgeTreeNode[];
}

export interface KnowledgeUnitTarget {
  target_id: string;
  stable_key: string;
  kind: string;
  symbol: string | null;
  address: string | null;
  match_pct: number | null;
  linked: boolean;
  fact_count: number;
  fact_types: string[];
  has_inferred_name: boolean;
  indexed_at: string | null;
}

export interface KnowledgeUnitTargets {
  unit: string;
  unit_entity: { id: string; locator: string; fact_count: number } | null;
  targets: KnowledgeUnitTarget[];
}

export interface KnowledgeEntity {
  id: string;
  kind: string;
  locator: string;
  identity_status: string;
  fact_count: number;
  link_count: number;
}

export interface KnowledgeSearchHit {
  subject: SubjectIdentity;
  fact_type?: string;
  snippet: string;
}

export interface KnowledgeEvidence {
  id: string;
  kind: string;
  locator: string;
  digest: string | null;
  why: string;
  captured_at: string;
}

export interface KnowledgeFact {
  id: string;
  value: string;
  rationale: string;
  confidence: number;
  updated_at: string;
  evidence: KnowledgeEvidence[];
}

export interface KnowledgeLink {
  id: string;
  direction: "incoming" | "outgoing";
  role: string;
  why: string;
  kind: string;
  locator: string;
  other: SubjectIdentity;
}

export type TargetLedgerEntry =
  | { type: "submission"; timestamp: string; id: string; seq: number; description: string; hypothesis: string | null; score: number; runtimeRef: string | null; workerRun: Record<string, unknown>; isRegression: false }
  | { type: "pull_request"; timestamp: string; id: string; prRef: string; summary: string; outcome: string; attribution: "target" | "unit"; isRegression: false }
  | { type: "event"; timestamp: string; id: string; kind: string; cause: string | null; summary: string; refs: Array<{ refKind: string; refId: string }>; isRegression: boolean };

export interface KnowledgeRecordResponse {
  subject: SubjectIdentity;
  facts: Record<string, KnowledgeFact>;
  links: KnowledgeLink[];
  ledger: { entries: TargetLedgerEntry[]; total_count: number };
  target_status: Record<string, unknown> | null;
  indexed_at: string | null;
}

export type KnowledgeRecordSubject =
  | { target_stable_key: string }
  | { entity_locator: string };

async function get<T>(path: string, game?: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const params = new URLSearchParams();
  if (game?.trim()) params.set("game", game.trim());
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const suffix = params.size > 0 ? `?${params}` : "";
  const response = await fetch(`${API_ROOT}${path}${suffix}`);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data;
}

export function fetchKnowledgeSummary(game?: string): Promise<KnowledgeSummary> {
  return get<KnowledgeSummary>("/summary", game);
}

export function fetchKnowledgeDriftWarnings(game?: string, limit = 50): Promise<{ warnings: KnowledgeDriftWarning[] }> {
  return get<{ warnings: KnowledgeDriftWarning[] }>("/drift-warnings", game, { limit });
}

export function fetchKnowledgeTree(game?: string): Promise<{ root: KnowledgeTreeNode }> {
  return get<{ root: KnowledgeTreeNode }>("/tree", game);
}

export function fetchKnowledgeUnitTargets(unit: string, game?: string): Promise<KnowledgeUnitTargets> {
  return get<KnowledgeUnitTargets>(`/units/${encodeURIComponent(unit)}/targets`, game);
}

export function fetchKnowledgeEntities(
  kind: "game_concept" | "pattern" | "translation_unit" | "struct" | "struct_field" | "parameter",
  game?: string,
  options: { q?: string; limit?: number } = {},
): Promise<{ entities: KnowledgeEntity[] }> {
  return get<{ entities: KnowledgeEntity[] }>("/entities", game, { kind, ...options });
}

export function fetchKnowledgeSearch(q: string, game?: string, limit = 100): Promise<{ hits: KnowledgeSearchHit[] }> {
  return get<{ hits: KnowledgeSearchHit[] }>("/search", game, { q, limit });
}

export function fetchKnowledgeRecord(game: string | undefined, subject: KnowledgeRecordSubject): Promise<KnowledgeRecordResponse> {
  return get<KnowledgeRecordResponse>("/record", game, subject);
}
