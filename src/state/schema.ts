import type { Database } from "bun:sqlite";

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
  `);
}
