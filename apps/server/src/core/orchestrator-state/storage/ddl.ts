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

    CREATE TABLE IF NOT EXISTS epochs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      size_mode TEXT NOT NULL,
      size_value INTEGER,
      worker_pool_size INTEGER NOT NULL,
      candidate_window INTEGER NOT NULL,
      status TEXT NOT NULL,
      admitted_count INTEGER NOT NULL DEFAULT 0,
      finished_count INTEGER NOT NULL DEFAULT 0,
      fast_refresh_count INTEGER NOT NULL DEFAULT 0,
      boundary_status TEXT,
      routing_summary_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS epochs_session_status
      ON epochs (session_id, status, ordinal);

    CREATE TABLE IF NOT EXISTS epoch_targets (
      id TEXT PRIMARY KEY,
      epoch_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      target_key TEXT NOT NULL,
      unit TEXT NOT NULL,
      symbol TEXT NOT NULL,
      source_path TEXT NOT NULL,
      size INTEGER NOT NULL,
      baseline_score REAL NOT NULL,
      priority REAL NOT NULL,
      reason TEXT,
      admission_index INTEGER NOT NULL,
      status TEXT NOT NULL,
      admitted_at TEXT NOT NULL,
      claimed_at TEXT,
      finished_at TEXT,
      UNIQUE(epoch_id, target_key)
    );

    CREATE INDEX IF NOT EXISTS epoch_targets_epoch_status
      ON epoch_targets (epoch_id, status, admission_index);

    CREATE INDEX IF NOT EXISTS epoch_targets_session_status
      ON epoch_targets (session_id, status);

    CREATE TABLE IF NOT EXISTS target_claims (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      epoch_id TEXT NOT NULL,
      epoch_target_id TEXT NOT NULL UNIQUE,
      worker_id TEXT NOT NULL,
      base_rev TEXT,
      write_set_json TEXT NOT NULL DEFAULT '[]',
      write_set_entries_json TEXT NOT NULL DEFAULT '[]',
      write_set_hash TEXT,
      worktree_path TEXT,
      ttl TEXT,
      heartbeat_at TEXT,
      status TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      closed_at TEXT,
      close_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS target_claims_session_status
      ON target_claims (session_id, status);

    CREATE TABLE IF NOT EXISTS worker_state (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      epoch_id TEXT NOT NULL,
      epoch_target_id TEXT NOT NULL,
      target_claim_id TEXT NOT NULL UNIQUE,
      worker_id TEXT NOT NULL,
      target_key TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      write_set_json TEXT NOT NULL DEFAULT '[]',
      write_set_entries_json TEXT NOT NULL DEFAULT '[]',
      worker_session_ids_json TEXT NOT NULL DEFAULT '[]',
      artifact_dir TEXT,
      worktree_path TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      baseline_score REAL,
      best_checkpoint_id TEXT,
      best_score REAL,
      exact INTEGER NOT NULL DEFAULT 0,
      timeout_summary TEXT,
      error_summary TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS worker_state_session_status
      ON worker_state (session_id, lifecycle_status);

    CREATE TABLE IF NOT EXISTS worker_checkpoints (
      id TEXT PRIMARY KEY,
      worker_state_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      epoch_id TEXT NOT NULL,
      epoch_target_id TEXT NOT NULL,
      target_claim_id TEXT NOT NULL,
      attempt_index INTEGER NOT NULL,
      validation_time TEXT NOT NULL,
      old_score REAL,
      new_score REAL,
      delta REAL,
      exact_match INTEGER NOT NULL DEFAULT 0,
      hard_gates_passed INTEGER NOT NULL DEFAULT 0,
      improved_over_baseline INTEGER NOT NULL DEFAULT 0,
      selectable INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 0,
      build_status TEXT,
      qa_status TEXT,
      objdiff_status TEXT,
      validation_status TEXT NOT NULL,
      validation_state TEXT NOT NULL DEFAULT 'tentative',
      artifact_path TEXT,
      patch_path TEXT,
      diff_path TEXT,
      write_set_json TEXT NOT NULL DEFAULT '[]',
      failure_reasons_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS worker_checkpoints_state_selectable
      ON worker_checkpoints (worker_state_id, selectable, exact_match, new_score, validation_time);

    CREATE INDEX IF NOT EXISTS worker_checkpoints_epoch_target
      ON worker_checkpoints (epoch_id, epoch_target_id);

    CREATE TABLE IF NOT EXISTS write_set_widenings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      epoch_id TEXT NOT NULL,
      target_claim_id TEXT NOT NULL,
      worker_state_id TEXT NOT NULL,
      attempt_index INTEGER NOT NULL,
      category TEXT NOT NULL,
      rung INTEGER NOT NULL,
      requested_paths_json TEXT NOT NULL DEFAULT '[]',
      approved_paths_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      decided_by TEXT,
      decision_reason TEXT,
      validation_tier INTEGER,
      validation_evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      decided_at TEXT,
      validated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS write_set_widenings_session
      ON write_set_widenings (session_id, status, created_at);

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

    CREATE TABLE IF NOT EXISTS worker_output_integrations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      epoch_id TEXT NOT NULL,
      epoch_target_id TEXT NOT NULL,
      target_claim_id TEXT NOT NULL,
      worker_state_id TEXT NOT NULL,
      worker_checkpoint_id TEXT,
      status TEXT NOT NULL,
      disposition TEXT,
      target_key TEXT,
      patch_path TEXT,
      diff_path TEXT,
      item_path TEXT,
      summary_path TEXT,
      check_stdout_path TEXT,
      check_stderr_path TEXT,
      apply_stdout_path TEXT,
      apply_stderr_path TEXT,
      write_set_json TEXT NOT NULL DEFAULT '[]',
      validation_state TEXT NOT NULL DEFAULT 'tentative',
      conflict_paths_json TEXT NOT NULL DEFAULT '[]',
      failure_reasons_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      UNIQUE(worker_checkpoint_id)
    );

    CREATE INDEX IF NOT EXISTS worker_output_integrations_session_status
      ON worker_output_integrations (session_id, status, created_at);

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
