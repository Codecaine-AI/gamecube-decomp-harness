export const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

export const PROJECT_EVENTS_DDL = `
  CREATE TABLE IF NOT EXISTS project_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    project_id TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    actor TEXT NOT NULL CONSTRAINT project_events_actor_check CHECK (
      actor IN ('operator', 'runner', 'agent', 'guardian', 'external_observer')
    ),
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS project_events_subject_sequence
    ON project_events (subject_kind, subject_id, sequence);

  CREATE INDEX IF NOT EXISTS project_events_type_sequence
    ON project_events (event_type, sequence);

  CREATE INDEX IF NOT EXISTS project_events_correlation_sequence
    ON project_events (correlation_id, sequence);
`;

export const PROJECT_STATE_DDL = `
  CREATE TABLE IF NOT EXISTS project_state (
    project_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0,
    active_workflow_json TEXT,
    queued_requests_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    trace_id TEXT NOT NULL,
    caused_by_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const SESSION_TIMELINE_ENTRIES_DDL = `
  CREATE TABLE IF NOT EXISTS session_timeline_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT NOT NULL,
    entry_kind TEXT NOT NULL CONSTRAINT session_timeline_entries_kind_check CHECK (
      entry_kind IN ('epoch_completed', 'remote_application', 'pr_phase', 'save_point')
    ),
    entry_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    caused_by_event_id TEXT,
    UNIQUE(session_uuid, entry_kind, entry_id)
  );

  CREATE INDEX IF NOT EXISTS session_timeline_entries_session_order
    ON session_timeline_entries (session_uuid, id);
`;
