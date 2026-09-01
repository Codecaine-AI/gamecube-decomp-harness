import type { Database } from "bun:sqlite";

export function configureConnection(db: Database): void {
  db.run("PRAGMA busy_timeout = 30000");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA temp_store = MEMORY");
  db.run("PRAGMA wal_autocheckpoint = 1000");
}

export const KNOWLEDGE_SCHEMA_DDL = `
  CREATE TABLE target (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('function', 'data')),
    unit TEXT NOT NULL,
    unit_entity_id TEXT NOT NULL REFERENCES entity(id),
    symbol TEXT,
    stable_key TEXT NOT NULL,
    address TEXT,
    identity_status TEXT NOT NULL CHECK (identity_status IN ('current', 'moved', 'unresolved', 'retired')),
    report_revision TEXT NOT NULL,
    CHECK (symbol IS NOT NULL AND address IS NOT NULL AND unit_entity_id IS NOT NULL)
  );
  CREATE UNIQUE INDEX target_current_stable_key ON target(stable_key) WHERE identity_status = 'current';
  CREATE INDEX target_unit_entity_id ON target(unit_entity_id);

  CREATE TABLE target_status (
    target_id TEXT PRIMARY KEY REFERENCES target(id),
    match_pct REAL NOT NULL CHECK (match_pct >= 0 AND match_pct <= 100),
    linked INTEGER NOT NULL,
    size INTEGER,
    content_hash TEXT,
    report_revision TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE entity (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('translation_unit', 'struct', 'struct_field', 'parameter', 'game_concept', 'pattern')),
    locator TEXT NOT NULL,
    parent_entity_id TEXT REFERENCES entity(id),
    identity_status TEXT NOT NULL CHECK (identity_status IN ('active', 'merged', 'retired')),
    merged_into_id TEXT REFERENCES entity(id),
    CHECK ((identity_status = 'merged') = (merged_into_id IS NOT NULL)),
    UNIQUE (kind, locator)
  );

  CREATE TABLE link (
    id TEXT PRIMARY KEY,
    from_target_id TEXT REFERENCES target(id),
    from_entity_id TEXT REFERENCES entity(id),
    to_target_id TEXT REFERENCES target(id),
    to_entity_id TEXT REFERENCES entity(id),
    role TEXT NOT NULL,
    why TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pr', 'discord', 'attempt', 'wiki', 'code')),
    locator TEXT NOT NULL,
    digest TEXT,
    CHECK ((from_target_id IS NULL) <> (from_entity_id IS NULL)),
    CHECK ((to_target_id IS NULL) <> (to_entity_id IS NULL)),
    CHECK ((kind = 'code') = (digest IS NOT NULL))
  );
  CREATE INDEX link_from_target_id ON link(from_target_id);
  CREATE INDEX link_from_entity_id ON link(from_entity_id);
  CREATE INDEX link_to_target_id ON link(to_target_id);
  CREATE INDEX link_to_entity_id ON link(to_entity_id);

  CREATE TABLE fact (
    id TEXT PRIMARY KEY,
    target_id TEXT REFERENCES target(id),
    entity_id TEXT REFERENCES entity(id),
    type TEXT NOT NULL CHECK (type IN ('purpose', 'inferred_name', 'inferred_type', 'data_flow', 'state_behavior', 'game_mapping')),
    value TEXT NOT NULL,
    rationale TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    updated_at TEXT NOT NULL,
    CHECK ((target_id IS NULL) <> (entity_id IS NULL))
  );
  CREATE UNIQUE INDEX fact_target_type ON fact(target_id, type) WHERE target_id IS NOT NULL;
  CREATE UNIQUE INDEX fact_entity_type ON fact(entity_id, type) WHERE entity_id IS NOT NULL;

  CREATE TABLE evidence (
    id TEXT PRIMARY KEY,
    fact_id TEXT NOT NULL REFERENCES fact(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('pr', 'discord', 'attempt', 'wiki', 'code')),
    locator TEXT NOT NULL,
    digest TEXT,
    why TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    CHECK ((kind = 'code') = (digest IS NOT NULL))
  );
  CREATE INDEX evidence_kind_locator ON evidence(kind, locator);

  CREATE TABLE worker_run (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL REFERENCES target(id),
    goal TEXT NOT NULL,
    baseline TEXT NOT NULL,
    run_id TEXT,
    worker_state_id TEXT,
    final_outcome TEXT NOT NULL CHECK (final_outcome IN ('match', 'improvement', 'no_change', 'error')),
    error_type TEXT CHECK (error_type IN ('build_failure', 'tool_failure', 'timeout', 'worker_crash')),
    integration TEXT CHECK (integration IN ('integrated', 'conflicted')),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    closed_at TEXT NOT NULL,
    CHECK ((final_outcome = 'error') = (error_type IS NOT NULL))
  );
  CREATE INDEX worker_run_target_id ON worker_run(target_id);

  CREATE TABLE submission (
    id TEXT PRIMARY KEY,
    worker_run_id TEXT NOT NULL REFERENCES worker_run(id),
    seq INTEGER NOT NULL,
    description TEXT NOT NULL,
    hypothesis TEXT,
    score REAL NOT NULL,
    submitted_at TEXT NOT NULL,
    runtime_ref TEXT,
    UNIQUE (worker_run_id, seq)
  );

  CREATE TABLE pull_request (
    id TEXT PRIMARY KEY,
    target_id TEXT REFERENCES target(id),
    entity_id TEXT REFERENCES entity(id),
    pr_ref TEXT NOT NULL,
    summary TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('match', 'improvement', 'no_change', 'error')),
    merged_at TEXT NOT NULL,
    CHECK ((target_id IS NULL) <> (entity_id IS NULL))
  );
  CREATE INDEX pull_request_target_id ON pull_request(target_id);
  CREATE INDEX pull_request_entity_id ON pull_request(entity_id);

  CREATE TABLE event (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL REFERENCES target(id),
    kind TEXT NOT NULL CHECK (kind IN ('regression', 'note')),
    cause TEXT CHECK (cause IN ('merge_conflict', 'upstream_change')),
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK ((kind = 'regression') = (cause IS NOT NULL))
  );
  CREATE INDEX event_target_id ON event(target_id);

  CREATE TABLE event_ref (
    event_id TEXT NOT NULL REFERENCES event(id),
    ref_kind TEXT NOT NULL CHECK (ref_kind IN ('worker_run', 'epoch', 'pr', 'commit')),
    ref_id TEXT NOT NULL,
    PRIMARY KEY (event_id, ref_kind, ref_id)
  );

  CREATE TABLE discord_message (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    author TEXT NOT NULL,
    posted_at TEXT NOT NULL,
    content TEXT NOT NULL,
    thread_id TEXT,
    ingested_at TEXT NOT NULL
  );

  CREATE TABLE wiki_section (
    id TEXT PRIMARY KEY,
    page TEXT NOT NULL,
    section TEXT NOT NULL,
    mirror_revision TEXT NOT NULL,
    content TEXT NOT NULL,
    ingested_at TEXT NOT NULL,
    UNIQUE (page, section, mirror_revision)
  );

  CREATE TABLE source_watermark (
    source TEXT PRIMARY KEY CHECK (source IN ('pr', 'discord', 'wiki', 'attempt')),
    position TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE index_task (
    id TEXT PRIMARY KEY,
    pathway TEXT NOT NULL CHECK (pathway IN ('run_closed', 'pr_imported', 'regression', 'archival_ingest', 'drift_recheck')),
    payload TEXT NOT NULL,
    enqueued_at TEXT NOT NULL,
    started_at TEXT,
    done_at TEXT
  );

  CREATE TABLE subject_index_state (
    target_id TEXT REFERENCES target(id),
    entity_id TEXT REFERENCES entity(id),
    indexed_at TEXT NOT NULL,
    CHECK ((target_id IS NULL) <> (entity_id IS NULL))
  );
  CREATE UNIQUE INDEX subject_index_state_target_id ON subject_index_state(target_id) WHERE target_id IS NOT NULL;
  CREATE UNIQUE INDEX subject_index_state_entity_id ON subject_index_state(entity_id) WHERE entity_id IS NOT NULL;
`;

export const FINAL_SCHEMA_DDL = KNOWLEDGE_SCHEMA_DDL;
export const FULL_SCHEMA_DDL = KNOWLEDGE_SCHEMA_DDL;
