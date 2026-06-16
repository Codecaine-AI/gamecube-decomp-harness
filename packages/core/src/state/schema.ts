import type { Database } from "bun:sqlite";

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

export function ensureSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      goal_kind TEXT NOT NULL,
      goal_value REAL NOT NULL,
      baseline_report_sha TEXT,
      current_report_sha TEXT,
      desired_workers INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

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
      lease_id TEXT,
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

    CREATE TABLE IF NOT EXISTS scheduler_epochs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      size_mode TEXT NOT NULL,
      size_value INTEGER,
      ready_queue_size INTEGER NOT NULL,
      candidate_window INTEGER NOT NULL,
      status TEXT NOT NULL,
      admitted_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      fast_refresh_count INTEGER NOT NULL DEFAULT 0,
      boundary_status TEXT,
      routing_summary_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS scheduler_epochs_run_status
      ON scheduler_epochs (run_id, status, ordinal);

    CREATE TABLE IF NOT EXISTS scheduler_epoch_targets (
      epoch_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      admission_index INTEGER NOT NULL,
      status TEXT NOT NULL,
      admitted_at TEXT NOT NULL,
      queued_at TEXT,
      leased_at TEXT,
      completed_at TEXT,
      PRIMARY KEY (epoch_id, target_id)
    );

    CREATE INDEX IF NOT EXISTS scheduler_epoch_targets_run_status
      ON scheduler_epoch_targets (run_id, status);

    CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      priority REAL NOT NULL,
      reason TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      leased_at TEXT
    );

    CREATE TABLE IF NOT EXISTS leases (
      id TEXT PRIMARY KEY,
      queue_id TEXT,
      worker_id TEXT,
      base_rev TEXT,
      write_set_hash TEXT,
      worktree_path TEXT,
      ttl TEXT,
      heartbeat_at TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_locks (
      path TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL,
      lock_mode TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS worker_reports (
      id TEXT PRIMARY KEY,
      lease_id TEXT,
      report_type TEXT NOT NULL,
      summary_path TEXT,
      facts_path TEXT,
      blocker_path TEXT,
      patch_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      lease_id TEXT,
      target_id TEXT,
      artifact_path TEXT,
      compiled INTEGER NOT NULL DEFAULT 0,
      old_score REAL,
      new_score REAL,
      delta REAL,
      status TEXT NOT NULL
    );

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
      report_id TEXT,
      lease_id TEXT,
      target_key TEXT NOT NULL,
      unit TEXT,
      symbol TEXT,
      source_path TEXT,
      report_type TEXT NOT NULL,
      disposition TEXT NOT NULL,
      item_status TEXT NOT NULL,
      exact_match INTEGER NOT NULL DEFAULT 0,
      pr_candidate INTEGER NOT NULL DEFAULT 0,
      patch_path TEXT,
      summary_path TEXT,
      report_summary TEXT,
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
  `);

  ensureColumn(db, "attempts", "attempt_index", "INTEGER");
  ensureColumn(db, "attempts", "created_at", "TEXT");
  ensureColumn(db, "runs", "project_id", "TEXT");
  ensureColumn(db, "runs", "project_kind", "TEXT");
  ensureColumn(db, "runs", "project_repo_root", "TEXT");
  ensureColumn(db, "runs", "project_state_dir", "TEXT");
  ensureColumn(db, "runs", "project_graph_db", "TEXT");
  ensureColumn(db, "runs", "project_descriptor_path", "TEXT");
  ensureColumn(db, "runs", "project_local_override_path", "TEXT");
}
