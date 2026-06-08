export type SourceKind = "code_graph" | "pr_corpus" | "document" | "csv_corpus" | "external_mirror" | "tool_output";

export type TrustTier = "canonical" | "local" | "reference" | "historical" | "external_hint" | "tool_evidence";

export interface SourceDescriptor {
  id: string;
  kind: SourceKind;
  title: string;
  trust_tier: TrustTier;
  freshness: "current_checkout" | "generated" | "snapshot" | "refreshable" | "live";
  data_paths: string[];
  index_outputs: string[];
  commands: Record<string, string>;
  capabilities?: string[];
  description?: string;
}

export interface ToolDescriptor {
  id: string;
  title: string;
  trust_tier: TrustTier;
  commands: Record<string, string>;
  capabilities?: string[];
  description?: string;
}

export interface GraphEntity {
  id: string;
  entityType: string;
  stableKey: string;
  payload: Record<string, unknown>;
  replace?: boolean;
}

export interface GraphFact {
  id: string;
  entityId: string;
  factType: string;
  payload: Record<string, unknown>;
  confidence: number;
  trustTier: TrustTier;
  evidenceRef: string;
  sourceVersionId: string;
  status?: string;
}

export interface GraphEdge {
  id: string;
  fromEntityId: string;
  edgeType: string;
  toEntityId: string;
  weight: number;
  evidenceRef: string;
  sourceVersionId: string;
  status?: string;
}

export interface SearchChunk {
  id: string;
  sourceVersionId: string;
  sourceId: string;
  entityId?: string;
  title: string;
  text: string;
  evidenceRef: string;
  payload: Record<string, unknown>;
}

export interface GraphRecords {
  sourceVersion: {
    id: string;
    sourceId: string;
    contentHash: string;
    sourcePaths: string[];
  };
  entities: GraphEntity[];
  facts: GraphFact[];
  edges: GraphEdge[];
  chunks: SearchChunk[];
}

export interface FileGraphCard {
  entity_id: string;
  source_path: string;
  editability: {
    mode: "editable" | "read_only_complete" | "locked" | "blocked" | "unknown";
    reason: string;
  };
  match_status: Record<string, unknown>;
  units: Array<Record<string, unknown>>;
  functions: Array<Record<string, unknown>>;
  pr_history: {
    touching_prs: Array<Record<string, unknown>>;
    review_risks: Array<Record<string, unknown>>;
    tactics: Array<Record<string, unknown>>;
  };
  resource_hits: Array<Record<string, unknown>>;
  tool_hits: Array<Record<string, unknown>>;
  scheduling_signals: GraphRankFeature;
}

export interface GraphRankFeature {
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
  tool_finding_count: number;
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

export interface SearchResult {
  source_id: string;
  result_id: string;
  title: string;
  snippet: string;
  evidence_ref: string;
  entity_id?: string;
  confidence: number;
  trust_tier: TrustTier;
}
