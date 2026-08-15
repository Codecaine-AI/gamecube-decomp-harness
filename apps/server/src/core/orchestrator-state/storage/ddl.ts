import type { Database } from "bun:sqlite";
import { runStorageMigrations } from "./migrations/index.js";

export { FINAL_SCHEMA_DDL, SCHEMA_MIGRATIONS_DDL } from "./migrations/ddl.js";

export const GAME_EVENTS_DDL = `
  CREATE TABLE IF NOT EXISTS game_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    game_id TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    actor TEXT NOT NULL CONSTRAINT game_events_actor_check CHECK (
      actor IN ('operator', 'runner', 'agent', 'guardian', 'external_observer')
    ),
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    parent_span_id TEXT
  );

  CREATE INDEX IF NOT EXISTS game_events_subject_sequence
    ON game_events (subject_kind, subject_id, sequence);
  CREATE INDEX IF NOT EXISTS game_events_type_sequence
    ON game_events (event_type, sequence);
  CREATE INDEX IF NOT EXISTS game_events_correlation_sequence
    ON game_events (correlation_id, sequence);
`;

export function configureConnection(db: Database): void {
  db.run("PRAGMA busy_timeout = 30000");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA temp_store = MEMORY");
  db.run("PRAGMA wal_autocheckpoint = 1000");
}

export function ensureSchema(db: Database): void {
  runStorageMigrations(db);
}
