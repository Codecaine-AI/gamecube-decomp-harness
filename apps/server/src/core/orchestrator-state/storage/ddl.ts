import type { Database } from "bun:sqlite";
import { runStorageMigrations } from "./migrations/index.js";
import { RUNS_DDL, RUN_SCOPED_INDEXES_DDL, RUN_SCOPED_TABLES_DDL } from "./migrations/ddl.js";

export {
  PROJECT_EVENTS_DDL,
  PROJECT_STATE_DDL,
  PENDING_INTEGRATIONS_DDL,
  RUN_RECOVERY_JOURNAL_DDL,
  RUNS_DDL,
  RUN_SCOPED_INDEXES_DDL,
  RUN_SCOPED_TABLES_DDL,
  SCHEMA_MIGRATIONS_DDL,
  SESSION_TIMELINE_ENTRIES_DDL,
} from "./migrations/ddl.js";

function columnNames(db: Database, table: string): Set<string> {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
  return new Set(rows.map((row) => String(row.name)));
}

function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  if (columnNames(db, table).has(column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function configureConnection(db: Database): void {
  db.run("PRAGMA busy_timeout = 30000");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA temp_store = MEMORY");
  db.run("PRAGMA wal_autocheckpoint = 1000");
}

export function ensureLegacySchema(db: Database): void {
  db.exec(`
    ${RUNS_DDL}

    CREATE TABLE IF NOT EXISTS director_cycles (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      active_workers INTEGER NOT NULL DEFAULT 0,
      summary_path TEXT,
      decision_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pi_sessions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      target_claim_id TEXT,
      role TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_file TEXT,
      provider TEXT,
      model TEXT,
      thinking_level TEXT,
      status TEXT NOT NULL,
      output_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dashboard_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      project_id TEXT,
      session_uuid TEXT,
      artifact_type TEXT NOT NULL,
      artifact_key TEXT NOT NULL,
      source_path TEXT,
      source_label TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS dashboard_artifacts_run_type
      ON dashboard_artifacts (run_id, artifact_type, artifact_key, created_at);

    CREATE INDEX IF NOT EXISTS dashboard_artifacts_project_type
      ON dashboard_artifacts (project_id, artifact_type, artifact_key, created_at);

    CREATE INDEX IF NOT EXISTS dashboard_artifacts_session_type
      ON dashboard_artifacts (session_uuid, artifact_type, artifact_key, created_at);

    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      unit TEXT NOT NULL,
      symbol TEXT NOT NULL,
      source_path TEXT,
      size INTEGER NOT NULL,
      fuzzy REAL NOT NULL,
      matched REAL,
      complete REAL,
      risk TEXT,
      status TEXT NOT NULL,
      priority REAL NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    ${RUN_SCOPED_TABLES_DDL}

    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      fact_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      evidence_path TEXT,
      confidence REAL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      producer TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      handled_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      attempt_id TEXT,
      base_rev TEXT,
      patch_path TEXT,
      validation_path TEXT,
      old_matched_code_percent REAL,
      new_matched_code_percent REAL,
      status TEXT NOT NULL,
      integrated_rev TEXT
    );

    CREATE TABLE IF NOT EXISTS run_checkpoints (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      checkpoint_type TEXT NOT NULL,
      status TEXT NOT NULL,
      artifact_dir TEXT NOT NULL,
      summary_path TEXT NOT NULL,
      pr_candidates_path TEXT NOT NULL,
      carry_forward_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkpoint_items (
      id TEXT PRIMARY KEY,
      checkpoint_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      worker_checkpoint_id TEXT,
      target_claim_id TEXT,
      target_key TEXT NOT NULL,
      unit TEXT,
      symbol TEXT,
      source_path TEXT,
      lifecycle_status TEXT NOT NULL,
      disposition TEXT NOT NULL,
      item_status TEXT NOT NULL,
      exact_match INTEGER NOT NULL DEFAULT 0,
      pr_candidate INTEGER NOT NULL DEFAULT 0,
      patch_path TEXT,
      summary_path TEXT,
      state_summary TEXT,
      evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS checkpoint_items_run_disposition
      ON checkpoint_items (run_id, disposition, item_status);

    CREATE INDEX IF NOT EXISTS checkpoint_items_checkpoint
      ON checkpoint_items (checkpoint_id);

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      branch TEXT,
      base_ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS save_points (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      run_id TEXT,
      trigger_kind TEXT NOT NULL,
      label TEXT,
      commit_sha TEXT,
      branch TEXT,
      base_ref TEXT,
      base_sha TEXT,
      worktree_dirty INTEGER NOT NULL DEFAULT 0,
      committed INTEGER NOT NULL DEFAULT 0,
      matched_code_percent REAL,
      report_path TEXT,
      report_changes_path TEXT,
      board_snapshot_path TEXT,
      artifact_dir TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS save_points_campaign
      ON save_points (campaign_id, created_at);

    CREATE TABLE IF NOT EXISTS project_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_uuid TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      active_run_id TEXT,
      base_ref TEXT,
      base_sha TEXT,
      preparing_state_json TEXT NOT NULL DEFAULT '{}',
      running_state_json TEXT NOT NULL DEFAULT '{}',
      pr_state_json TEXT NOT NULL DEFAULT '{}',
      complete_state_json TEXT NOT NULL DEFAULT '{}',
      process_state_json TEXT NOT NULL DEFAULT '{}',
      kernel_trace_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS project_sessions_project_updated
      ON project_sessions (project_id, updated_at);

    CREATE UNIQUE INDEX IF NOT EXISTS project_sessions_one_active_project
      ON project_sessions (project_id)
      WHERE status IN ('active', 'blocked');
  `);

  ensureColumn(db, "runs", "project_id", "TEXT");
  ensureColumn(db, "runs", "project_kind", "TEXT");
  ensureColumn(db, "runs", "project_repo_root", "TEXT");
  ensureColumn(db, "runs", "project_state_dir", "TEXT");
  ensureColumn(db, "runs", "project_graph_db", "TEXT");
  ensureColumn(db, "runs", "project_descriptor_path", "TEXT");
  ensureColumn(db, "runs", "project_local_override_path", "TEXT");
  ensureColumn(db, "pi_sessions", "target_claim_id", "TEXT");
  ensureColumn(db, "target_claims", "write_set_entries_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "worker_state", "write_set_entries_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "worker_checkpoints", "write_set_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "worker_checkpoints", "validation_state", "TEXT NOT NULL DEFAULT 'tentative'");
  ensureColumn(db, "worker_output_integrations", "validation_state", "TEXT NOT NULL DEFAULT 'tentative'");
  ensureColumn(db, "project_sessions", "kernel_trace_json", "TEXT NOT NULL DEFAULT '{}'");
}

export function ensureSchema(db: Database): void {
  ensureLegacySchema(db);
  runStorageMigrations(db);
  // These indexes are only safe once migration 005 has converged session_id
  // tables to run_id. Reassert them for already-migrated databases as well.
  db.exec(RUN_SCOPED_INDEXES_DDL);
}
