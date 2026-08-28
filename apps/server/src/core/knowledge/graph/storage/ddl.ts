import type { Database } from "bun:sqlite";

export function ensureKnowledgeGraphSqlSchema(db: Database): boolean {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      trust_tier TEXT NOT NULL,
      freshness TEXT NOT NULL,
      descriptor_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_tools (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      trust_tier TEXT NOT NULL,
      descriptor_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resource_versions (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      source_paths_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_graph_metadata (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS graph_entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      stable_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS graph_facts (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      fact_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      confidence REAL NOT NULL,
      trust_tier TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      resource_version_id TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      from_entity_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      weight REAL NOT NULL,
      evidence_ref TEXT NOT NULL,
      resource_version_id TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_version_id TEXT NOT NULL,
      entity_id TEXT,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worker_graph_updates (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      claim_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      symbol TEXT,
      update_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      validation_ref TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merged_pr_updates (
      id TEXT PRIMARY KEY,
      pr INTEGER NOT NULL,
      merged_at TEXT,
      resource_version_id TEXT NOT NULL,
      touched_files_json TEXT NOT NULL,
      graph_delta_json TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS graph_entities_type_idx ON graph_entities(entity_type);
    CREATE INDEX IF NOT EXISTS graph_edges_from_idx ON graph_edges(from_entity_id, edge_type);
    CREATE INDEX IF NOT EXISTS graph_edges_to_idx ON graph_edges(to_entity_id, edge_type);
    CREATE INDEX IF NOT EXISTS graph_edges_from_status_type_idx ON graph_edges(from_entity_id, status, edge_type);
    CREATE INDEX IF NOT EXISTS graph_edges_to_status_type_idx ON graph_edges(to_entity_id, status, edge_type);
    CREATE INDEX IF NOT EXISTS graph_facts_entity_idx ON graph_facts(entity_id, fact_type);
    CREATE INDEX IF NOT EXISTS graph_facts_entity_status_type_idx ON graph_facts(entity_id, status, fact_type);
    CREATE INDEX IF NOT EXISTS search_chunks_source_idx ON search_chunks(source_id);
    CREATE INDEX IF NOT EXISTS search_chunks_entity_source_idx ON search_chunks(entity_id, source_id);
  `);

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_chunks_fts
      USING fts5(id UNINDEXED, source_id UNINDEXED, entity_id UNINDEXED, title, text, evidence_ref UNINDEXED);
    `);
    return true;
  } catch {
    return false;
  }
}
