import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { configureConnection, ensureLegacySchema } from "../ddl.js";
import { openState, type StateStore } from "../store.js";
import { immediateTransaction } from "../transaction.js";
import {
  PENDING_INTEGRATIONS_DDL,
  PR_BATCH_PUBLICATION_RESERVATIONS_DDL,
  PROJECT_EVENTS_DDL,
  SYNC_PUBLICATION_DDL,
  SYNC_PUBLICATION_INTENTS_DDL,
  SYNC_STATE_DDL,
} from "./ddl.js";
import { runStorageMigrations } from "./index.js";
import { rebuildTable } from "./rebuild-table.js";
import { eventConventionsMigration } from "./016-event-conventions.js";

const tempDirs: string[] = [];
const openStores: StateStore[] = [];
const openDatabases: Database[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function trackStore(store: StateStore): StateStore {
  openStores.push(store);
  return store;
}

function trackDatabase(db: Database): Database {
  openDatabases.push(db);
  return db;
}

function closeStore(store: StateStore): void {
  store.db.close();
  openStores.splice(openStores.indexOf(store), 1);
}

function closeDatabase(db: Database): void {
  db.close();
  openDatabases.splice(openDatabases.indexOf(db), 1);
}

interface SchemaObjectRow {
  type: string;
  name: string;
  sql: string | null;
}

// Frozen at storage migration 004. Keep this literal independent of current
// bootstrap DDL so it catches pre-migration compatibility regressions.
const FROZEN_PRE_RENAME_LEGACY_DDL = `
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

ALTER TABLE project_sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_sessions ADD COLUMN head_revision TEXT;
ALTER TABLE project_sessions ADD COLUMN trace_id TEXT;
ALTER TABLE project_sessions ADD COLUMN blockers_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project_sessions ADD COLUMN save_point_stale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_sessions ADD COLUMN caused_by_event_id TEXT;
ALTER TABLE project_sessions ADD COLUMN closed_at TEXT;

DROP INDEX project_sessions_one_active_project;
CREATE UNIQUE INDEX IF NOT EXISTS project_sessions_one_active_project
  ON project_sessions (project_id)
  WHERE status IN ('active', 'blocked', 'closing');

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

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

INSERT INTO schema_migrations (version, name, applied_at) VALUES
  (1, 'baseline', '2026-08-12T00:00:00.000Z'),
  (2, 'project_events', '2026-08-12T00:00:00.000Z'),
  (3, 'project_state', '2026-08-12T00:00:00.000Z'),
  (4, 'project_session_container', '2026-08-12T00:00:00.000Z');
`;


function schemaSnapshot(db: Database): SchemaObjectRow[] {
  return db
    .query(
      `SELECT type, name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all() as SchemaObjectRow[];
}

function normalizedSchemaSnapshot(db: Database): SchemaObjectRow[] {
  return schemaSnapshot(db).map((row) => ({
    ...row,
    sql: row.sql
      ?.replace(/,\s*UNIQUE\s*\([^)]*\)/gi, "")
      .replace(/\bUNIQUE\b(?=\s*[,\)])/gi, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([(),])\s*/g, "$1")
      .trim() ?? null,
  }));
}

// Frozen at storage migration 010, immediately before the slice-3 sync schema.
// Keep this literal independent of current bootstrap and migration DDL.
const FROZEN_PRE_SLICE_3_DDL = `
CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      branch TEXT,
      base_ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

CREATE TABLE checkpoint_items (
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

CREATE TABLE dashboard_artifacts (
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

CREATE TABLE director_cycles (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      active_workers INTEGER NOT NULL DEFAULT 0,
      summary_path TEXT,
      decision_path TEXT,
      created_at TEXT NOT NULL
    );

CREATE TABLE epoch_targets (
        id TEXT PRIMARY KEY,
        epoch_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
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
        finished_at TEXT
      );

CREATE TABLE epochs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
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

CREATE TABLE events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      producer TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      handled_at TEXT,
      created_at TEXT NOT NULL
    );

CREATE TABLE facts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      fact_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      evidence_path TEXT,
      confidence REAL,
      status TEXT NOT NULL
    );

CREATE TABLE integrations (
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

CREATE TABLE pending_integrations (
    epoch_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    parent_sha TEXT NOT NULL,
    message_marker TEXT NOT NULL,
    created_at TEXT NOT NULL
  , attempt INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'prepared', failure_reason TEXT, failed_at TEXT);

CREATE TABLE pi_sessions (
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

CREATE TABLE project_events (
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

CREATE TABLE project_sessions (
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
    , revision INTEGER NOT NULL DEFAULT 0, head_revision TEXT, trace_id TEXT, blockers_json TEXT NOT NULL DEFAULT '[]', save_point_stale INTEGER NOT NULL DEFAULT 0, caused_by_event_id TEXT, closed_at TEXT);

CREATE TABLE project_state (
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

CREATE TABLE run_checkpoints (
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

CREATE TABLE run_recovery_journal (
    recovery_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    action TEXT NOT NULL,
    command_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    recovery_reason TEXT NOT NULL,
    expected_run_revision INTEGER NOT NULL,
    cancelled_claim_ids_json TEXT NOT NULL DEFAULT '[]',
    cancelled_operation_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'prepared' CONSTRAINT run_recovery_journal_status_check CHECK (
      status IN ('prepared', 'completed')
    ),
    caused_by_event_id TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    goal_kind TEXT NOT NULL,
    goal_value REAL NOT NULL,
    baseline_report_sha TEXT,
    current_report_sha TEXT,
    desired_workers INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    project_id TEXT,
    project_kind TEXT,
    project_repo_root TEXT,
    project_state_dir TEXT,
    project_graph_db TEXT,
    project_descriptor_path TEXT,
    project_local_override_path TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    trace_id TEXT,
    caused_by_event_id TEXT,
    blockers_json TEXT NOT NULL DEFAULT '[]',
    head_revision TEXT,
    session_uuid TEXT,
    inputs_json TEXT,
    stop_request_json TEXT,
    terminal_reason TEXT,
    scheduler_condition TEXT,
    remote_application_ids_json TEXT NOT NULL DEFAULT '[]'
  );

CREATE TABLE save_points (
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

CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);

CREATE TABLE session_timeline_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT NOT NULL,
    entry_kind TEXT NOT NULL CONSTRAINT session_timeline_entries_kind_check CHECK (
      entry_kind IN ('epoch_completed', 'remote_application', 'pr_phase', 'save_point')
    ),
    entry_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    caused_by_event_id TEXT
  );

CREATE TABLE target_claims (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
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

CREATE TABLE targets (
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

CREATE TABLE worker_checkpoints (
        id TEXT PRIMARY KEY,
        worker_state_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
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

CREATE TABLE worker_output_integrations (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
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
        resolved_at TEXT
      );

CREATE TABLE worker_state (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
        target_claim_id TEXT NOT NULL,
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

CREATE TABLE write_set_widenings (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
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

CREATE INDEX checkpoint_items_checkpoint
      ON checkpoint_items (checkpoint_id);

CREATE INDEX checkpoint_items_run_disposition
      ON checkpoint_items (run_id, disposition, item_status);

CREATE INDEX dashboard_artifacts_project_type
      ON dashboard_artifacts (project_id, artifact_type, artifact_key, created_at);

CREATE INDEX dashboard_artifacts_run_type
      ON dashboard_artifacts (run_id, artifact_type, artifact_key, created_at);

CREATE INDEX dashboard_artifacts_session_type
      ON dashboard_artifacts (session_uuid, artifact_type, artifact_key, created_at);

CREATE UNIQUE INDEX epoch_targets_epoch_key
        ON epoch_targets (epoch_id, target_key);

CREATE INDEX epoch_targets_epoch_status
        ON epoch_targets (epoch_id, status, admission_index);

CREATE INDEX epoch_targets_run_status
        ON epoch_targets (run_id, status);

CREATE INDEX epochs_run_status
        ON epochs (run_id, status, ordinal);

CREATE INDEX pending_integrations_run_created
    ON pending_integrations (run_id, created_at);

CREATE INDEX project_events_correlation_sequence
    ON project_events (correlation_id, sequence);

CREATE INDEX project_events_subject_sequence
    ON project_events (subject_kind, subject_id, sequence);

CREATE INDEX project_events_type_sequence
    ON project_events (event_type, sequence);

CREATE UNIQUE INDEX project_sessions_one_active_project
        ON project_sessions (project_id)
        WHERE status IN ('active', 'blocked', 'closing');

CREATE INDEX project_sessions_project_updated
      ON project_sessions (project_id, updated_at);

CREATE UNIQUE INDEX run_recovery_journal_one_prepared_run
    ON run_recovery_journal (run_id) WHERE status = 'prepared';

CREATE INDEX run_recovery_journal_run_created
    ON run_recovery_journal (run_id, created_at);

CREATE INDEX save_points_campaign
      ON save_points (campaign_id, created_at);

CREATE UNIQUE INDEX session_timeline_entries_session_kind_entry
    ON session_timeline_entries (session_uuid, entry_kind, entry_id);

CREATE INDEX session_timeline_entries_session_order
    ON session_timeline_entries (session_uuid, id);

CREATE UNIQUE INDEX target_claims_epoch_target
        ON target_claims (epoch_target_id);

CREATE INDEX target_claims_run_status
        ON target_claims (run_id, status);

CREATE INDEX worker_checkpoints_epoch_target
        ON worker_checkpoints (epoch_id, epoch_target_id);

CREATE INDEX worker_checkpoints_state_selectable
        ON worker_checkpoints (worker_state_id, selectable, exact_match, new_score, validation_time);

CREATE UNIQUE INDEX worker_output_integrations_checkpoint
        ON worker_output_integrations (worker_checkpoint_id);

CREATE INDEX worker_output_integrations_run_status
        ON worker_output_integrations (run_id, status, created_at);

CREATE INDEX worker_state_run_status
        ON worker_state (run_id, lifecycle_status);

CREATE UNIQUE INDEX worker_state_target_claim
        ON worker_state (target_claim_id);

CREATE INDEX write_set_widenings_run
        ON write_set_widenings (run_id, status, created_at);


INSERT INTO schema_migrations (version, name, applied_at) VALUES
  (1, 'baseline', '2026-08-13T00:00:00.000Z'),
  (2, 'project_events', '2026-08-13T00:00:00.000Z'),
  (3, 'project_state', '2026-08-13T00:00:00.000Z'),
  (4, 'project_session_container', '2026-08-13T00:00:00.000Z'),
  (5, 'run_scoped_run_id', '2026-08-13T00:00:00.000Z'),
  (6, 'run_state_contract', '2026-08-13T00:00:00.000Z'),
  (7, 'pending_integrations', '2026-08-13T00:00:00.000Z'),
  (8, 'run_recovery_journal', '2026-08-13T00:00:00.000Z'),
  (9, 'pending_integration_attempts', '2026-08-13T00:00:00.000Z'),
  (10, 'run_scoped_index_names', '2026-08-13T00:00:00.000Z');
`;

// Frozen at storage migration 015. This literal extends only the frozen v010
// fixture above; it deliberately imports no current bootstrap or migration DDL.
// Dispatch handoff snapshot storage does not exist until migration 016.
const FROZEN_SCHEMA_15_DDL = `
CREATE TABLE sync_state (
  sync_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_uuid TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CONSTRAINT sync_state_status_check CHECK (
    status IN (
      'requested', 'ingesting', 'reconciling', 'validating', 'validated',
      'publishing', 'published', 'blocked', 'cancelled'
    )
  ),
  trace_id TEXT NOT NULL,
  caused_by_event_id TEXT NOT NULL,
  blockers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  latest_event_sequence INTEGER NOT NULL DEFAULT 0,
  intake_json TEXT NOT NULL DEFAULT '{}',
  staging_json TEXT,
  pr_reconciliation_json TEXT NOT NULL DEFAULT '[]',
  publication_json TEXT
);

CREATE UNIQUE INDEX sync_state_one_non_terminal_project
  ON sync_state (project_id)
  WHERE status NOT IN ('published', 'cancelled');

CREATE TABLE project_upstream_anchors (
  project_id TEXT PRIMARY KEY,
  session_uuid TEXT NOT NULL,
  upstream_revision TEXT NOT NULL,
  sync_id TEXT NOT NULL,
  caused_by_event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX project_upstream_anchors_session
  ON project_upstream_anchors (session_uuid);

CREATE TABLE sync_push_records (
  push_id TEXT PRIMARY KEY,
  sync_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  remote_name TEXT NOT NULL,
  expected_remote_head TEXT,
  new_head TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT sync_push_records_status_check CHECK (
    status IN ('pending', 'pushing', 'pushed', 'failed')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  caused_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pushed_at TEXT
);

CREATE UNIQUE INDEX sync_push_records_sync_series
  ON sync_push_records (sync_id, series_id);

CREATE INDEX sync_push_records_sync_status
  ON sync_push_records (sync_id, status);

CREATE TABLE sync_invalidations (
  invalidation_id TEXT PRIMARY KEY,
  sync_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_uuid TEXT NOT NULL,
  subject_kind TEXT NOT NULL CONSTRAINT sync_invalidations_subject_kind_check CHECK (
    subject_kind IN ('target', 'checkpoint', 'pr_snapshot')
  ),
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  caused_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX sync_invalidations_sync_subject
  ON sync_invalidations (sync_id, subject_kind, subject_id);

CREATE INDEX sync_invalidations_project_subject
  ON sync_invalidations (project_id, subject_kind, subject_id);

CREATE TABLE knowledge_revisions (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  sync_id TEXT,
  caused_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX knowledge_revisions_project_revision
  ON knowledge_revisions (project_id, revision);

CREATE TABLE sync_knowledge_jobs (
  job_id TEXT PRIMARY KEY,
  sync_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CONSTRAINT sync_knowledge_jobs_source_kind_check CHECK (
    source_kind IN ('merged_pr', 'corpus')
  ),
  source_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CONSTRAINT sync_knowledge_jobs_status_check CHECK (
    status IN ('queued', 'processing', 'waiting', 'succeeded', 'failed', 'cancelled')
  ),
  provenance_json TEXT NOT NULL DEFAULT '{}',
  staged_artifact_path TEXT,
  staged_digest TEXT,
  caused_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX sync_knowledge_jobs_sync_source
  ON sync_knowledge_jobs (sync_id, source_kind, source_id);

CREATE INDEX sync_knowledge_jobs_sync_status
  ON sync_knowledge_jobs (sync_id, status);

CREATE TABLE sync_publication_intents (
  sync_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_uuid TEXT NOT NULL,
  session_worktree_path TEXT NOT NULL,
  prior_head TEXT NOT NULL,
  new_head TEXT NOT NULL,
  worktree_state_json TEXT NOT NULL,
  boundary_plan_json TEXT NOT NULL,
  publishing_event_id TEXT NOT NULL,
  boundary_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX sync_publication_intents_project
  ON sync_publication_intents (project_id, created_at);

CREATE TABLE pr_campaigns (
  campaign_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_uuid TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CONSTRAINT pr_campaigns_status_check CHECK (
    status IN ('preparing', 'in_review', 'working', 'completed', 'abandoned')
  ),
  trace_id TEXT NOT NULL,
  caused_by_event_id TEXT NOT NULL,
  blockers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  closed_at TEXT,
  latest_event_sequence INTEGER NOT NULL DEFAULT 0,
  source_anchor_json TEXT NOT NULL,
  publication_policy_json TEXT NOT NULL DEFAULT '{"batch_size":4}'
);

CREATE TABLE pr_series (
  series_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES pr_campaigns(campaign_id),
  revision INTEGER NOT NULL DEFAULT 0,
  batch_index INTEGER NOT NULL,
  status TEXT NOT NULL CONSTRAINT pr_series_status_check CHECK (
    status IN ('prepared', 'published', 'changes_requested', 'revising', 'approved', 'merged', 'closed')
  ),
  branch TEXT NOT NULL,
  upstream_pr_number INTEGER,
  target_units_json TEXT NOT NULL DEFAULT '[]',
  last_validation_json TEXT,
  trace_id TEXT NOT NULL,
  caused_by_event_id TEXT NOT NULL,
  blockers_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE pr_work_items (
  item_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES pr_series(series_id),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CONSTRAINT pr_work_items_status_check CHECK (
    status IN ('pending', 'in_progress', 'resolved', 'declined')
  ),
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE UNIQUE INDEX pr_campaigns_one_open_project
  ON pr_campaigns (project_id)
  WHERE status NOT IN ('completed', 'abandoned');

CREATE TABLE pr_batch_publications (
  publication_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES pr_campaigns(campaign_id),
  batch_index INTEGER NOT NULL,
  series_ids_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT pr_batch_publications_status_check CHECK (
    status IN ('reserved', 'publishing', 'completed')
  ),
  owner_token TEXT,
  batch_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE pr_batch_publication_series (
  publication_id TEXT NOT NULL REFERENCES pr_batch_publications(publication_id),
  series_id TEXT NOT NULL REFERENCES pr_series(series_id),
  ordinal INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT pr_batch_publication_series_status_check CHECK (
    status IN ('pending', 'publishing', 'published')
  ),
  owner_token TEXT,
  reserved_series_revision INTEGER,
  validation_timestamp TEXT,
  invalidation_watermark TEXT,
  upstream_pr_number INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (publication_id, series_id)
);

CREATE UNIQUE INDEX pr_batch_publications_campaign_batch
  ON pr_batch_publications (campaign_id, batch_index);

CREATE UNIQUE INDEX pr_batch_publications_one_incomplete_campaign
  ON pr_batch_publications (campaign_id)
  WHERE status != 'completed';

CREATE UNIQUE INDEX pr_batch_publication_series_ordinal
  ON pr_batch_publication_series (publication_id, ordinal);

INSERT INTO schema_migrations (version, name, applied_at) VALUES
  (11, 'sync_state', '2026-08-13T00:00:00.000Z'),
  (12, 'sync_publication', '2026-08-13T00:00:00.000Z'),
  (13, 'sync_publication_intents', '2026-08-13T00:00:00.000Z'),
  (14, 'pr_campaign', '2026-08-13T00:00:00.000Z'),
  (15, 'pr_batch_publication_reservations', '2026-08-13T00:00:00.000Z');
`;

function loadFrozenSchema15(db: Database): void {
  db.exec(FROZEN_PRE_SLICE_3_DDL);
  db.exec(FROZEN_SCHEMA_15_DDL);
}

function insertFrozenProjectEvent(
  db: Database,
  input: {
    eventId: string;
    eventType: "project.dispatch_released" | "project.dispatch_acquired";
    projectId: string;
    causationId: string;
    payload: Record<string, unknown>;
  },
): void {
  db.query(`
    INSERT INTO project_events (
      event_id, event_type, schema_version, project_id, subject_kind, subject_id,
      correlation_id, causation_id, trace_id, span_id, actor, occurred_at, payload_json
    ) VALUES (?, ?, 1, ?, 'project', ?, ?, ?, ?, ?, 'runner', ?, ?)
  `).run(
    input.eventId,
    input.eventType,
    input.projectId,
    input.projectId,
    `correlation-${input.eventId}`,
    input.causationId,
    `trace-${input.projectId}`,
    `span-${input.eventId}`,
    "2026-08-13T12:00:00.000Z",
    JSON.stringify(input.payload),
  );
}

function createLegacyHandoffSnapshotStorage(db: Database): void {
  db.exec(`
    CREATE TABLE dispatch_handoff_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      old_lease_holder_json TEXT NOT NULL,
      requested_handoff_json TEXT,
      terminal_project_revision INTEGER NOT NULL,
      release_event_id TEXT UNIQUE,
      acquisition_event_id TEXT UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TRIGGER dispatch_handoff_snapshots_immutable_update
      BEFORE UPDATE ON dispatch_handoff_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'dispatch handoff snapshots are immutable');
      END;

    CREATE TRIGGER dispatch_handoff_snapshots_immutable_delete
      BEFORE DELETE ON dispatch_handoff_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'dispatch handoff snapshots are immutable');
      END;
  `);
}

afterEach(() => {
  for (const store of openStores.splice(0)) store.db.close();
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("orchestrator storage migrations", () => {
  test("a fresh state database applies numbered migrations exactly once", () => {
    const stateDir = createTempDir("orchestrator-migrations-fresh-");
    const store = trackStore(openState(stateDir));

    expect(store.db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "project_events" },
      { version: 3, name: "project_state" },
      { version: 4, name: "project_session_container" },
      { version: 5, name: "run_scoped_run_id" },
      { version: 6, name: "run_state_contract" },
      { version: 7, name: "pending_integrations" },
      { version: 8, name: "run_recovery_journal" },
      { version: 9, name: "pending_integration_attempts" },
      { version: 10, name: "run_scoped_index_names" },
      { version: 11, name: "sync_state" },
      { version: 12, name: "sync_publication" },
      { version: 13, name: "sync_publication_intents" },
      { version: 14, name: "pr_campaign" },
      { version: 15, name: "pr_batch_publication_reservations" },
      { version: 16, name: "event_conventions" },
    ]);
    expect(
      store.db
        .query(
          `SELECT name FROM sqlite_master
           WHERE type = 'index'
             AND name IN (
               'epoch_targets_epoch_key', 'target_claims_epoch_target',
               'worker_state_target_claim', 'worker_output_integrations_checkpoint',
               'session_timeline_entries_session_kind_entry',
               'sync_push_records_sync_series', 'sync_invalidations_sync_subject',
               'sync_knowledge_jobs_sync_source', 'pr_campaigns_one_open_project'
             )
           ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: "epoch_targets_epoch_key" },
      { name: "pr_campaigns_one_open_project" },
      { name: "session_timeline_entries_session_kind_entry" },
      { name: "sync_invalidations_sync_subject" },
      { name: "sync_knowledge_jobs_sync_source" },
      { name: "sync_push_records_sync_series" },
      { name: "target_claims_epoch_target" },
      { name: "worker_output_integrations_checkpoint" },
      { name: "worker_state_target_claim" },
    ]);
    expect(
      store.db
        .query(
          `SELECT name FROM sqlite_master
           WHERE type = 'index'
             AND name IN (
               'epochs_run_status', 'epoch_targets_run_status', 'target_claims_run_status',
               'worker_state_run_status', 'write_set_widenings_run', 'worker_output_integrations_run_status'
             )
           ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: "epoch_targets_run_status" },
      { name: "epochs_run_status" },
      { name: "target_claims_run_status" },
      { name: "worker_output_integrations_run_status" },
      { name: "worker_state_run_status" },
      { name: "write_set_widenings_run" },
    ]);

    const runColumns = store.db.query("PRAGMA table_info(runs)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(runColumns.map((column) => column.name)).toEqual([
      "id",
      "goal_kind",
      "goal_value",
      "baseline_report_sha",
      "current_report_sha",
      "desired_workers",
      "status",
      "created_at",
      "project_id",
      "project_kind",
      "project_repo_root",
      "project_state_dir",
      "project_graph_db",
      "project_descriptor_path",
      "project_local_override_path",
      "revision",
      "trace_id",
      "caused_by_event_id",
      "blockers_json",
      "head_revision",
      "session_uuid",
      "inputs_json",
      "stop_request_json",
      "terminal_reason",
      "scheduler_condition",
      "remote_application_ids_json",
    ]);
    expect(runColumns.find((column) => column.name === "revision")?.dflt_value).toBe("0");
    expect(runColumns.find((column) => column.name === "blockers_json")?.dflt_value).toBe("'[]'");

    expect(
      (store.db.query("PRAGMA table_info(project_events)").all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    ).toContain("parent_span_id");

    const projectStateColumns = store.db.query("PRAGMA table_info(project_state)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(projectStateColumns.map((column) => column.name)).toEqual([
      "project_id",
      "revision",
      "active_workflow_json",
      "queued_requests_json",
      "blockers_json",
      "trace_id",
      "caused_by_event_id",
      "created_at",
      "updated_at",
    ]);
    expect(projectStateColumns.find((column) => column.name === "queued_requests_json")?.dflt_value).toBe("'[]'");

    const syncStateColumns = store.db.query("PRAGMA table_info(sync_state)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(syncStateColumns.map((column) => column.name)).toEqual([
      "sync_id",
      "project_id",
      "session_uuid",
      "revision",
      "status",
      "trace_id",
      "caused_by_event_id",
      "blockers_json",
      "created_at",
      "updated_at",
      "latest_event_sequence",
      "intake_json",
      "staging_json",
      "pr_reconciliation_json",
      "publication_json",
      "blocked_origin_status",
      "validation_evidence_json",
      "resolved_conflict_paths_json",
    ]);
    expect(syncStateColumns.find((column) => column.name === "revision")?.dflt_value).toBe("0");
    expect(syncStateColumns.find((column) => column.name === "blockers_json")?.dflt_value).toBe("'[]'");
    expect(syncStateColumns.find((column) => column.name === "pr_reconciliation_json")?.dflt_value).toBe("'[]'");
    expect(syncStateColumns.find((column) => column.name === "resolved_conflict_paths_json")?.dflt_value).toBe("'[]'");
    expect(
      store.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_handoff_snapshots'").get(),
    ).toEqual({ name: "dispatch_handoff_snapshots" });
    expect(
      store.db
        .query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sync_state_one_non_terminal_project'")
        .get(),
    ).toEqual({ name: "sync_state_one_non_terminal_project" });

    expect(
      store.db
        .query(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name IN (
               'project_upstream_anchors', 'sync_push_records', 'sync_invalidations',
               'knowledge_revisions', 'sync_knowledge_jobs'
             )
           ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: "knowledge_revisions" },
      { name: "project_upstream_anchors" },
      { name: "sync_invalidations" },
      { name: "sync_knowledge_jobs" },
      { name: "sync_push_records" },
    ]);
    expect(store.db.query("PRAGMA table_info(sync_push_records)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "push_id", pk: 1 }),
      expect.objectContaining({ name: "revision", notnull: 1, dflt_value: "0" }),
      expect.objectContaining({ name: "status", notnull: 1, dflt_value: "'pending'" }),
      expect.objectContaining({ name: "attempt_count", notnull: 1, dflt_value: "0" }),
      expect.objectContaining({ name: "caused_by_event_id", notnull: 1 }),
    ]));
    expect(store.db.query("PRAGMA table_info(knowledge_revisions)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "revision", pk: 1 }),
      expect.objectContaining({ name: "project_id", notnull: 1 }),
      expect.objectContaining({ name: "digest", notnull: 1 }),
      expect.objectContaining({ name: "sync_id", notnull: 0 }),
      expect.objectContaining({ name: "caused_by_event_id", notnull: 1 }),
    ]));
    expect(store.db.query("PRAGMA table_info(sync_knowledge_jobs)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "job_id", pk: 1 }),
      expect.objectContaining({ name: "source_kind", notnull: 1 }),
      expect.objectContaining({ name: "revision", notnull: 1, dflt_value: "0" }),
      expect.objectContaining({ name: "status", notnull: 1, dflt_value: "'queued'" }),
      expect.objectContaining({ name: "provenance_json", notnull: 1, dflt_value: "'{}'" }),
    ]));
    expect(store.db.query("PRAGMA table_info(sync_publication_intents)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "sync_id", pk: 1 }),
      expect.objectContaining({ name: "session_worktree_path", notnull: 1 }),
      expect.objectContaining({ name: "prior_head", notnull: 1 }),
      expect.objectContaining({ name: "new_head", notnull: 1 }),
      expect.objectContaining({ name: "worktree_state_json", notnull: 1 }),
      expect.objectContaining({ name: "boundary_plan_json", notnull: 1 }),
      expect.objectContaining({ name: "publishing_event_id", notnull: 1 }),
      expect.objectContaining({ name: "boundary_event_id", notnull: 0 }),
    ]));

    const projectSessionColumns = store.db.query("PRAGMA table_info(project_sessions)").all() as Array<{
      name: string;
    }>;
    expect(projectSessionColumns.map((column) => column.name)).toEqual([
      "id",
      "project_id",
      "session_uuid",
      "status",
      "phase",
      "active_run_id",
      "base_ref",
      "base_sha",
      "preparing_state_json",
      "running_state_json",
      "pr_state_json",
      "complete_state_json",
      "process_state_json",
      "kernel_trace_json",
      "created_at",
      "updated_at",
      "completed_at",
      "revision",
      "head_revision",
      "trace_id",
      "blockers_json",
      "save_point_stale",
      "caused_by_event_id",
      "closed_at",
    ]);
    expect(
      store.db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'session_timeline_entries'").get(),
    ).not.toBeNull();
    expect(store.db.query("PRAGMA table_info(pending_integrations)").all()).toMatchObject([
      { name: "epoch_id", notnull: 0, pk: 1 },
      { name: "run_id", notnull: 1, pk: 0 },
      { name: "branch", notnull: 1, pk: 0 },
      { name: "parent_sha", notnull: 1, pk: 0 },
      { name: "message_marker", notnull: 1, pk: 0 },
      { name: "created_at", notnull: 1, pk: 0 },
      { name: "attempt", notnull: 1, pk: 0, dflt_value: "1" },
      { name: "status", notnull: 1, pk: 0, dflt_value: "'prepared'" },
      { name: "failure_reason", notnull: 0, pk: 0 },
      { name: "failed_at", notnull: 0, pk: 0 },
    ]);
    expect(store.db.query("PRAGMA table_info(run_recovery_journal)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "recovery_id", pk: 1 }),
      expect.objectContaining({ name: "run_id", notnull: 1 }),
      expect.objectContaining({ name: "action", notnull: 1 }),
      expect.objectContaining({ name: "cancelled_claim_ids_json", notnull: 1, dflt_value: "'[]'" }),
      expect.objectContaining({ name: "cancelled_operation_ids_json", notnull: 1, dflt_value: "'[]'" }),
      expect.objectContaining({ name: "status", notnull: 1, dflt_value: "'prepared'" }),
    ]));

    for (const table of [
      "epochs",
      "epoch_targets",
      "target_claims",
      "worker_state",
      "worker_checkpoints",
      "write_set_widenings",
      "worker_output_integrations",
    ]) {
      const names = (store.db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (column) => column.name,
      );
      expect(names).toContain("run_id");
      expect(names).not.toContain("session_id");
    }

    expect(
      store.db
        .query("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'project_events_%' ORDER BY name")
        .all(),
    ).toEqual([
      { name: "project_events_correlation_sequence" },
      { name: "project_events_subject_sequence" },
      { name: "project_events_type_sequence" },
    ]);

    const firstSnapshot = schemaSnapshot(store.db);
    closeStore(store);

    const reopened = trackStore(openState(stateDir));
    expect(reopened.db.query("SELECT count(*) AS count FROM schema_migrations").get()).toEqual({ count: 16 });
    expect(schemaSnapshot(reopened.db)).toEqual(firstSnapshot);
  });

  test("openState converges a frozen version-10 pre-slice-3 database", () => {
    const stateDir = createTempDir("orchestrator-migrations-pre-slice-3-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const legacyDb = trackDatabase(new Database(dbPath));
    configureConnection(legacyDb);
    legacyDb.exec(FROZEN_PRE_SLICE_3_DDL);
    closeDatabase(legacyDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 16 });
    expect(
      migrated.db
        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sync_state', 'pr_campaigns') ORDER BY name")
        .all(),
    ).toEqual([{ name: "pr_campaigns" }, { name: "sync_state" }]);

    const fresh = trackStore(openState(createTempDir("orchestrator-migrations-pre-slice-3-fresh-")));
    expect(normalizedSchemaSnapshot(migrated.db)).toEqual(normalizedSchemaSnapshot(fresh.db));
  });

  test("openState migrates a frozen version-4 session_id database twice", () => {
    const stateDir = createTempDir("orchestrator-migrations-legacy-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const legacyDb = trackDatabase(new Database(dbPath));
    configureConnection(legacyDb);
    legacyDb.exec(FROZEN_PRE_RENAME_LEGACY_DDL);
    legacyDb.exec(`
      INSERT INTO epochs (
        id, session_id, ordinal, size_mode, worker_pool_size, candidate_window,
        status, routing_summary_json, created_at
      ) VALUES (
        'epoch-legacy', 'run-legacy', 3, 'fixed', 4, 8,
        'active', '{"route":"legacy"}', '2026-08-12T00:01:00.000Z'
      );

      INSERT INTO epoch_targets (
        id, epoch_id, session_id, target_key, unit, symbol, source_path,
        size, baseline_score, priority, reason, admission_index, status, admitted_at
      ) VALUES (
        'epoch-target-legacy', 'epoch-legacy', 'run-legacy', 'target-legacy',
        'unit.c', 'func', 'src/unit.c', 12, 34.5, 9.5, 'legacy-reason', 2,
        'claimed', '2026-08-12T00:02:00.000Z'
      );

      INSERT INTO target_claims (
        id, session_id, epoch_id, epoch_target_id, worker_id, base_rev,
        status, claimed_at
      ) VALUES (
        'claim-legacy', 'run-legacy', 'epoch-legacy', 'epoch-target-legacy',
        'worker-legacy', 'base-legacy', 'active', '2026-08-12T00:03:00.000Z'
      );

      INSERT INTO worker_state (
        id, session_id, epoch_id, epoch_target_id, target_claim_id, worker_id,
        target_key, lifecycle_status, started_at, baseline_score
      ) VALUES (
        'worker-state-legacy', 'run-legacy', 'epoch-legacy', 'epoch-target-legacy',
        'claim-legacy', 'worker-legacy', 'target-legacy', 'running',
        '2026-08-12T00:04:00.000Z', 34.5
      );

      INSERT INTO worker_checkpoints (
        id, worker_state_id, session_id, epoch_id, epoch_target_id,
        target_claim_id, attempt_index, validation_time, new_score, validation_status
      ) VALUES (
        'checkpoint-legacy', 'worker-state-legacy', 'run-legacy', 'epoch-legacy',
        'epoch-target-legacy', 'claim-legacy', 5, '2026-08-12T00:05:00.000Z',
        36.25, 'passed'
      );

      INSERT INTO write_set_widenings (
        id, session_id, epoch_id, target_claim_id, worker_state_id, attempt_index,
        category, rung, status, decision_reason, created_at
      ) VALUES (
        'widening-legacy', 'run-legacy', 'epoch-legacy', 'claim-legacy',
        'worker-state-legacy', 5, 'include', 2, 'approved', 'legacy-decision',
        '2026-08-12T00:06:00.000Z'
      );

      INSERT INTO worker_output_integrations (
        id, session_id, epoch_id, epoch_target_id, target_claim_id,
        worker_state_id, worker_checkpoint_id, status, disposition,
        created_at, updated_at
      ) VALUES (
        'integration-legacy', 'run-legacy', 'epoch-legacy', 'epoch-target-legacy',
        'claim-legacy', 'worker-state-legacy', 'checkpoint-legacy', 'pending',
        'integrate', '2026-08-12T00:07:00.000Z', '2026-08-12T00:08:00.000Z'
      );
    `);
    legacyDb.query(
      `INSERT INTO runs (
         id, goal_kind, goal_value, desired_workers, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("run-legacy", "matched_code_percent", 100, 4, "complete", "2026-08-12T00:00:00.000Z");
    legacyDb
      .query(
        `INSERT INTO project_sessions (
           id, project_id, session_uuid, status, phase, active_run_id, base_sha, head_revision, trace_id,
           preparing_state_json, running_state_json, pr_state_json,
           complete_state_json, process_state_json, kernel_trace_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, 'active', 'preparing', ?, ?, ?, ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?)`,
      )
      .run(
        "project-session:legacy",
        "melee",
        "legacy",
        "run-legacy",
        "base-legacy",
        "base-legacy",
        "trace-session-legacy",
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:00.000Z",
      );
    expect(
      legacyDb.query("SELECT MAX(version) AS version FROM schema_migrations").get(),
    ).toEqual({ version: 4 });
    closeDatabase(legacyDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT id, project_id FROM runs WHERE id = ?").get("run-legacy")).toEqual({
      id: "run-legacy",
      project_id: "melee",
    });
    expect(migrated.db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "project_events" },
      { version: 3, name: "project_state" },
      { version: 4, name: "project_session_container" },
      { version: 5, name: "run_scoped_run_id" },
      { version: 6, name: "run_state_contract" },
      { version: 7, name: "pending_integrations" },
      { version: 8, name: "run_recovery_journal" },
      { version: 9, name: "pending_integration_attempts" },
      { version: 10, name: "run_scoped_index_names" },
      { version: 11, name: "sync_state" },
      { version: 12, name: "sync_publication" },
      { version: 13, name: "sync_publication_intents" },
      { version: 14, name: "pr_campaign" },
      { version: 15, name: "pr_batch_publication_reservations" },
      { version: 16, name: "event_conventions" },
    ]);
    expect(
      migrated.db
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('project_events', 'project_state', 'session_timeline_entries') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "project_events" }, { name: "project_state" }, { name: "session_timeline_entries" }]);
    expect(
      migrated.db
        .query("SELECT head_revision, trace_id FROM project_sessions WHERE session_uuid = 'legacy'")
        .get(),
    ).toEqual({ head_revision: "base-legacy", trace_id: "trace-session-legacy" });
    expect(
      migrated.db
        .query(
          `SELECT status, revision, trace_id, caused_by_event_id, blockers_json,
                  head_revision, session_uuid, inputs_json, stop_request_json,
                  terminal_reason, scheduler_condition, remote_application_ids_json
           FROM runs WHERE id = 'run-legacy'`,
        )
        .get(),
    ).toEqual({
      status: "completed",
      revision: 0,
      trace_id: "trace-run-run-legacy",
      caused_by_event_id: null,
      blockers_json: "[]",
      head_revision: "base-legacy",
      session_uuid: "legacy",
      inputs_json: null,
      stop_request_json: null,
      terminal_reason: null,
      scheduler_condition: null,
      remote_application_ids_json: "[]",
    });
    expect(migrated.db.query("SELECT id, run_id, ordinal FROM epochs").get()).toEqual({
      id: "epoch-legacy",
      run_id: "run-legacy",
      ordinal: 3,
    });
    expect(migrated.db.query("SELECT id, run_id, reason FROM epoch_targets").get()).toEqual({
      id: "epoch-target-legacy",
      run_id: "run-legacy",
      reason: "legacy-reason",
    });
    expect(migrated.db.query("SELECT id, run_id, base_rev FROM target_claims").get()).toEqual({
      id: "claim-legacy",
      run_id: "run-legacy",
      base_rev: "base-legacy",
    });
    expect(migrated.db.query("SELECT id, run_id, baseline_score FROM worker_state").get()).toEqual({
      id: "worker-state-legacy",
      run_id: "run-legacy",
      baseline_score: 34.5,
    });
    expect(migrated.db.query("SELECT id, run_id, new_score FROM worker_checkpoints").get()).toEqual({
      id: "checkpoint-legacy",
      run_id: "run-legacy",
      new_score: 36.25,
    });
    expect(migrated.db.query("SELECT id, run_id, decision_reason FROM write_set_widenings").get()).toEqual({
      id: "widening-legacy",
      run_id: "run-legacy",
      decision_reason: "legacy-decision",
    });
    expect(migrated.db.query("SELECT id, run_id, disposition FROM worker_output_integrations").get()).toEqual({
      id: "integration-legacy",
      run_id: "run-legacy",
      disposition: "integrate",
    });

    const migratedSnapshot = schemaSnapshot(migrated.db);
    closeStore(migrated);

    const reopened = trackStore(openState(stateDir));
    expect(reopened.db.query("SELECT count(*) AS count FROM schema_migrations").get()).toEqual({ count: 16 });
    expect(schemaSnapshot(reopened.db)).toEqual(migratedSnapshot);
    expect(reopened.db.query("SELECT id, run_id FROM epochs").get()).toEqual({
      id: "epoch-legacy",
      run_id: "run-legacy",
    });

    const freshStateDir = createTempDir("orchestrator-migrations-convergence-");
    const fresh = trackStore(openState(freshStateDir));
    expect(normalizedSchemaSnapshot(reopened.db)).toEqual(normalizedSchemaSnapshot(fresh.db));
  });

  test("converges when migration 002 tables exist without a migration record", () => {
    const stateDir = createTempDir("orchestrator-migrations-partial-002-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const partialDb = trackDatabase(new Database(dbPath));
    configureConnection(partialDb);
    ensureLegacySchema(partialDb);
    partialDb.exec(PROJECT_EVENTS_DDL);
    closeDatabase(partialDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "project_events" },
      { version: 3, name: "project_state" },
      { version: 4, name: "project_session_container" },
      { version: 5, name: "run_scoped_run_id" },
      { version: 6, name: "run_state_contract" },
      { version: 7, name: "pending_integrations" },
      { version: 8, name: "run_recovery_journal" },
      { version: 9, name: "pending_integration_attempts" },
      { version: 10, name: "run_scoped_index_names" },
      { version: 11, name: "sync_state" },
      { version: 12, name: "sync_publication" },
      { version: 13, name: "sync_publication_intents" },
      { version: 14, name: "pr_campaign" },
      { version: 15, name: "pr_batch_publication_reservations" },
      { version: 16, name: "event_conventions" },
    ]);
    expect(
      migrated.db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_events'").get(),
    ).not.toBeNull();
  });

  test("converges when the migration 007 table exists without a migration record", () => {
    const stateDir = createTempDir("orchestrator-migrations-partial-007-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const partialDb = trackDatabase(new Database(dbPath));
    configureConnection(partialDb);
    ensureLegacySchema(partialDb);
    partialDb.exec(PENDING_INTEGRATIONS_DDL);
    partialDb
      .query(
        `INSERT INTO pending_integrations (
           epoch_id, run_id, branch, parent_sha, message_marker, created_at
         ) VALUES ('epoch-old', 'run-old', 'main', ?, 'Epoch-Integration: epoch-old', ?)`,
      )
      .run("a".repeat(40), "2026-08-12T00:00:00.000Z");
    closeDatabase(partialDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toContainEqual({
      version: 7,
      name: "pending_integrations",
    });
    expect(
      migrated.db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pending_integrations'").get(),
    ).not.toBeNull();
    expect(
      migrated.db
        .query(
          `SELECT epoch_id, run_id, attempt, status, failure_reason, failed_at
           FROM pending_integrations WHERE epoch_id = 'epoch-old'`,
        )
        .get(),
    ).toEqual({
      epoch_id: "epoch-old",
      run_id: "run-old",
      attempt: 1,
      status: "prepared",
      failure_reason: null,
      failed_at: null,
    });
  });

  test("converges when the migration 011 table exists without a migration record", () => {
    const stateDir = createTempDir("orchestrator-migrations-partial-011-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const partialDb = trackDatabase(new Database(dbPath));
    configureConnection(partialDb);
    ensureLegacySchema(partialDb);
    partialDb.exec(SYNC_STATE_DDL);
    closeDatabase(partialDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT version, name FROM schema_migrations WHERE version = 11").get()).toEqual({
      version: 11,
      name: "sync_state",
    });
    expect(
      migrated.db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_state'").get(),
    ).not.toBeNull();
    expect(
      migrated.db
        .query("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'sync_state_one_non_terminal_project'")
        .get(),
    ).not.toBeNull();
  });

  test("migration 011 enforces exactly the nine SyncState statuses", () => {
    const store = trackStore(openState(createTempDir("orchestrator-migrations-sync-statuses-")));
    const statuses = [
      "requested",
      "ingesting",
      "reconciling",
      "validating",
      "validated",
      "publishing",
      "published",
      "blocked",
      "cancelled",
    ];
    const insert = store.db.query(
      `INSERT INTO sync_state (
         sync_id, project_id, session_uuid, status, trace_id,
         caused_by_event_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [index, status] of statuses.entries()) {
      expect(() =>
        insert.run(
          `sync-${index}`,
          `project-${index}`,
          `session-${index}`,
          status,
          `trace-sync-${index}`,
          `event-${index}`,
          "2026-08-13T12:00:00.000Z",
          "2026-08-13T12:00:00.000Z",
        ),
      ).not.toThrow();
    }
    expect(() =>
      insert.run(
        "sync-invalid",
        "project-invalid",
        "session-invalid",
        "complete",
        "trace-sync-invalid",
        "event-invalid",
        "2026-08-13T12:00:00.000Z",
        "2026-08-13T12:00:00.000Z",
      ),
    ).toThrow();
  });

  test("converges when migration 012 storage exists without a migration record", () => {
    const stateDir = createTempDir("orchestrator-migrations-partial-012-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const partialDb = trackDatabase(new Database(dbPath));
    configureConnection(partialDb);
    ensureLegacySchema(partialDb);
    partialDb.exec("ALTER TABLE runs DROP COLUMN remote_application_ids_json");
    partialDb.exec(SYNC_PUBLICATION_DDL);
    closeDatabase(partialDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT version, name FROM schema_migrations WHERE version = 12").get()).toEqual({
      version: 12,
      name: "sync_publication",
    });
    expect(
      migrated.db
        .query(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('project_upstream_anchors', 'sync_push_records', 'sync_invalidations', 'knowledge_revisions', 'sync_knowledge_jobs')
           ORDER BY name`,
        )
        .all(),
    ).toHaveLength(5);
    expect(
      (migrated.db.query("PRAGMA table_info(runs)").all() as Array<{ name: string }>).map((column) => column.name),
    ).toContain("remote_application_ids_json");
  });

  test("migration 012 enforces publication identities and status vocabularies", () => {
    const store = trackStore(openState(createTempDir("orchestrator-migrations-sync-publication-")));
    const now = "2026-08-13T12:00:00.000Z";
    store.db
      .query(
        `INSERT INTO sync_push_records (
           push_id, sync_id, series_id, branch, remote_name, new_head,
           caused_by_event_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("push-1", "sync-1", "series-1", "series/one", "origin", "head-1", "event-1", now, now);
    expect(() =>
      store.db
        .query(
          `INSERT INTO sync_push_records (
             push_id, sync_id, series_id, branch, remote_name, new_head, status,
             caused_by_event_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("push-2", "sync-2", "series-2", "series/two", "origin", "head-2", "complete", "event-2", now, now),
    ).toThrow();
    expect(() =>
      store.db
        .query(
          `INSERT INTO sync_push_records (
             push_id, sync_id, series_id, branch, remote_name, new_head,
             caused_by_event_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("push-duplicate", "sync-1", "series-1", "other", "origin", "head-2", "event-2", now, now),
    ).toThrow();

    const insertJob = store.db.query(
      `INSERT INTO sync_knowledge_jobs (
         job_id, sync_id, project_id, source_kind, source_id, status,
         caused_by_event_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    expect(() => insertJob.run("job-1", "sync-1", "melee", "corpus", "batch-1", "queued", "event-1", now, now)).not.toThrow();
    expect(() => insertJob.run("job-invalid", "sync-1", "melee", "worker", "worker-1", "queued", "event-1", now, now)).toThrow();
    expect(() => insertJob.run("job-invalid-status", "sync-1", "melee", "merged_pr", "pr-1", "complete", "event-1", now, now)).toThrow();

    const insertKnowledge = store.db.query(
      `INSERT INTO knowledge_revisions (project_id, digest, sync_id, caused_by_event_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insertKnowledge.run("melee", "digest-1", "sync-1", "event-1", now);
    insertKnowledge.run("melee", "digest-2", "sync-2", "event-2", now);
    expect(store.db.query("SELECT revision, digest FROM knowledge_revisions ORDER BY revision").all()).toEqual([
      { revision: 1, digest: "digest-1" },
      { revision: 2, digest: "digest-2" },
    ]);
    expect(() => insertKnowledge.run("melee", "digest-1", "sync-3", "event-3", now)).not.toThrow();
    expect(store.db.query("SELECT revision, digest FROM knowledge_revisions ORDER BY revision").all()).toEqual([
      { revision: 1, digest: "digest-1" },
      { revision: 2, digest: "digest-2" },
      { revision: 3, digest: "digest-1" },
    ]);
  });

  test("converges when migration 013 storage exists without a migration record", () => {
    const stateDir = createTempDir("orchestrator-migrations-partial-013-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const partialDb = trackDatabase(new Database(dbPath));
    configureConnection(partialDb);
    ensureLegacySchema(partialDb);
    partialDb.exec(SYNC_PUBLICATION_INTENTS_DDL);
    closeDatabase(partialDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT version, name FROM schema_migrations WHERE version = 13").get()).toEqual({
      version: 13,
      name: "sync_publication_intents",
    });
    expect(
      migrated.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_publication_intents'").get(),
    ).toEqual({ name: "sync_publication_intents" });
    expect(
      migrated.db.query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sync_publication_intents_project'").get(),
    ).toEqual({ name: "sync_publication_intents_project" });
  });

  test("converges when migration 015 storage exists without a migration record", () => {
    const stateDir = createTempDir("orchestrator-migrations-partial-015-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const partialDb = trackDatabase(new Database(dbPath));
    configureConnection(partialDb);
    ensureLegacySchema(partialDb);
    partialDb.exec(PR_BATCH_PUBLICATION_RESERVATIONS_DDL);
    closeDatabase(partialDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT version, name FROM schema_migrations WHERE version = 15").get()).toEqual({
      version: 15,
      name: "pr_batch_publication_reservations",
    });
    expect(
      migrated.db
        .query(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('pr_batch_publications', 'pr_batch_publication_series')
           ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: "pr_batch_publication_series" },
      { name: "pr_batch_publications" },
    ]);

    const fresh = trackStore(openState(createTempDir("orchestrator-migrations-partial-015-fresh-")));
    expect(normalizedSchemaSnapshot(migrated.db)).toEqual(normalizedSchemaSnapshot(fresh.db));
  });

  test("openState migrates the literal frozen schema 015 through event conventions and reopens idempotently", () => {
    const stateDir = createTempDir("orchestrator-migrations-frozen-015-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const frozen = trackDatabase(new Database(dbPath));
    configureConnection(frozen);
    loadFrozenSchema15(frozen);

    insertFrozenProjectEvent(frozen, {
      eventId: "release-bad-hash-fixture",
      eventType: "project.dispatch_released",
      projectId: "melee",
      causationId: "command-bad-hash",
      payload: { handoff_snapshot_id: "snapshot-bad-hash-fixture" },
    });
    frozen.exec(`
      INSERT INTO sync_state (
        sync_id, project_id, session_uuid, status, trace_id, caused_by_event_id,
        created_at, updated_at, staging_json
      ) VALUES (
        'sync-legacy-fixture', 'melee', 'session-legacy-fixture', 'blocked',
        'trace-sync-legacy-fixture', 'event-sync-legacy-blocked',
        '2026-08-13T12:02:00.000Z', '2026-08-13T12:03:00.000Z',
        '{"conflicting_paths":["still-legacy.c"]}'
      );
      INSERT INTO project_events (
        event_id, event_type, schema_version, project_id, subject_kind, subject_id,
        correlation_id, causation_id, trace_id, span_id, actor, occurred_at, payload_json
      ) VALUES
        (
          'event-sync-legacy-blocked', 'sync.blocked', 1, 'melee', 'sync', 'sync-legacy-fixture',
          'sync-legacy-fixture', 'command-sync-legacy', 'trace-sync-legacy-fixture',
          'span-sync-legacy-blocked', 'runner', '2026-08-13T12:02:00.000Z',
          '{"previous_status":"validating"}'
        ),
        (
          'event-sync-legacy-validated', 'sync.validated', 1, 'melee', 'sync', 'sync-legacy-fixture',
          'sync-legacy-fixture', 'event-sync-legacy-blocked', 'trace-sync-legacy-fixture',
          'span-sync-legacy-validated', 'runner', '2026-08-13T12:02:30.000Z',
          '{"validation_evidence":{"report":"legacy-event"}}'
        ),
        (
          'event-sync-legacy-conflicts', 'sync.reconciliation_blocked', 1, 'melee', 'sync',
          'sync-legacy-fixture', 'sync-legacy-fixture', 'event-sync-legacy-validated',
          'trace-sync-legacy-fixture', 'span-sync-legacy-conflicts', 'runner',
          '2026-08-13T12:03:00.000Z',
          '{"conflict_identities":["fixed-legacy.c","still-legacy.c"]}'
        );
    `);
    const expectedLegacySyncEvents = [
      {
        event_id: "event-sync-legacy-blocked",
        event_type: "sync.blocked",
        subject_kind: "sync",
        subject_id: "sync-legacy-fixture",
        payload_json: '{"previous_status":"validating"}',
      },
      {
        event_id: "event-sync-legacy-validated",
        event_type: "sync.validated",
        subject_kind: "sync",
        subject_id: "sync-legacy-fixture",
        payload_json: '{"validation_evidence":{"report":"legacy-event"}}',
      },
      {
        event_id: "event-sync-legacy-conflicts",
        event_type: "sync.reconciliation_blocked",
        subject_kind: "sync",
        subject_id: "sync-legacy-fixture",
        payload_json: '{"conflict_identities":["fixed-legacy.c","still-legacy.c"]}',
      },
    ];
    const expectedLegacySyncState = {
      sync_id: "sync-legacy-fixture",
      status: "blocked",
      blocked_origin_status: "validating",
      validation_evidence_json: '{"report":"legacy-event"}',
      resolved_conflict_paths_json: '["fixed-legacy.c"]',
    };
    expect(frozen.query("SELECT MAX(version) AS version, COUNT(*) AS count FROM schema_migrations").get())
      .toEqual({ version: 15, count: 15 });
    expect(frozen.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_handoff_snapshots'",
    ).get()).toBeNull();
    closeDatabase(frozen);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query(`
      SELECT snapshot_id, project_id, content_json, content_hash, release_event_id, acquisition_event_id
      FROM dispatch_handoff_snapshots
    `).all()).toEqual([]);
    expect(migrated.db.query("SELECT MAX(version) AS version, COUNT(*) AS count FROM schema_migrations").get())
      .toEqual({ version: 16, count: 16 });
    expect(migrated.db.query(`
      SELECT sync_id, status, blocked_origin_status, validation_evidence_json, resolved_conflict_paths_json
      FROM sync_state WHERE sync_id = 'sync-legacy-fixture'
    `).get()).toEqual(expectedLegacySyncState);
    expect(migrated.db.query(`
      SELECT event_id, event_type, subject_kind, subject_id, payload_json
      FROM project_events
      WHERE subject_kind = 'sync' AND subject_id = 'sync-legacy-fixture'
      ORDER BY sequence
    `).all()).toEqual(expectedLegacySyncEvents);
    expect(
      (migrated.db.query("PRAGMA table_info(project_events)").all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    ).toContain("parent_span_id");
    const syncColumns = migrated.db.query("PRAGMA table_info(sync_state)").all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    expect(syncColumns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "blocked_origin_status" }),
      expect.objectContaining({ name: "validation_evidence_json" }),
      expect.objectContaining({ name: "resolved_conflict_paths_json", notnull: 1, dflt_value: "'[]'" }),
    ]));
    const snapshotColumns = migrated.db.query("PRAGMA table_info(dispatch_handoff_snapshots)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(snapshotColumns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "content_json", notnull: 1 }),
      expect.objectContaining({ name: "content_hash", notnull: 1 }),
      expect.objectContaining({ name: "release_event_id", notnull: 1 }),
      expect.objectContaining({ name: "acquisition_event_id", notnull: 0 }),
    ]));
    expect(
      (migrated.db.query("PRAGMA foreign_key_list(dispatch_handoff_snapshots)").all() as Array<{
        table: string;
        from: string;
        to: string;
      }>).map(({ table, from, to }) => ({ table, from, to })).sort((a, b) => a.from.localeCompare(b.from)),
    ).toEqual([
      { table: "project_events", from: "acquisition_event_id", to: "event_id" },
      { table: "project_events", from: "release_event_id", to: "event_id" },
    ]);
    const uniqueSnapshotColumns = (migrated.db.query("PRAGMA index_list(dispatch_handoff_snapshots)").all() as Array<{
      name: string;
      unique: number;
    }>).filter((index) => index.unique === 1).flatMap((index) =>
      (migrated.db.query(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string }>).map(
        (column) => column.name,
      )
    );
    expect(uniqueSnapshotColumns).toEqual(expect.arrayContaining([
      "snapshot_id", "content_hash", "release_event_id", "acquisition_event_id",
    ]));
    const snapshotSql = (migrated.db.query(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_handoff_snapshots'",
    ).get() as { sql: string }).sql;
    expect(snapshotSql).toContain("dispatch_handoff_snapshots_content_json_check");
    expect(snapshotSql).toContain("dispatch_handoff_snapshots_content_hash_check");
    expect(migrated.db.query(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'dispatch_handoff_snapshots_project_created'",
    ).get()).toEqual({ name: "dispatch_handoff_snapshots_project_created" });
    expect(migrated.db.query(`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger' AND name LIKE 'dispatch_handoff_snapshots_immutable_%'
      ORDER BY name
    `).all()).toEqual([
      { name: "dispatch_handoff_snapshots_immutable_delete" },
      { name: "dispatch_handoff_snapshots_immutable_update" },
    ]);
    expect(migrated.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => migrated.db.query(`
      INSERT INTO dispatch_handoff_snapshots (
        snapshot_id, project_id, content_json, content_hash,
        old_lease_holder_json, requested_handoff_json, terminal_project_revision,
        release_event_id, acquisition_event_id, created_at
      ) VALUES (?, ?, '{}', 'bad', '{}', NULL, 1, ?, NULL, ?)
    `).run(
      "snapshot-bad-hash-fixture",
      "melee",
      "release-bad-hash-fixture",
      "2026-08-13T12:01:00.000Z",
    )).toThrow("dispatch_handoff_snapshots_content_hash_check");

    const firstSnapshot = schemaSnapshot(migrated.db);
    closeStore(migrated);
    const reopened = trackStore(openState(stateDir));
    expect(reopened.db.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 16").get())
      .toEqual({ count: 1 });
    expect(reopened.db.query(`
      SELECT snapshot_id, project_id, content_json, content_hash, release_event_id, acquisition_event_id
      FROM dispatch_handoff_snapshots
    `).all()).toEqual([]);
    expect(reopened.db.query(`
      SELECT sync_id, status, blocked_origin_status, validation_evidence_json, resolved_conflict_paths_json
      FROM sync_state WHERE sync_id = 'sync-legacy-fixture'
    `).get()).toEqual(expectedLegacySyncState);
    expect(reopened.db.query(`
      SELECT event_id, event_type, subject_kind, subject_id, payload_json
      FROM project_events
      WHERE subject_kind = 'sync' AND subject_id = 'sync-legacy-fixture'
      ORDER BY sequence
    `).all()).toEqual(expectedLegacySyncEvents);
    expect(schemaSnapshot(reopened.db)).toEqual(firstSnapshot);

    const fresh = trackStore(openState(createTempDir("orchestrator-migrations-frozen-015-fresh-")));
    expect(normalizedSchemaSnapshot(reopened.db)).toEqual(normalizedSchemaSnapshot(fresh.db));
  });

  test("migration 016 converges after partial column application and remains idempotent", () => {
    const db = trackDatabase(new Database(":memory:"));
    db.exec(`
      CREATE TABLE project_events (event_id TEXT PRIMARY KEY, parent_span_id TEXT);
      CREATE TABLE sync_state (sync_id TEXT PRIMARY KEY, blocked_origin_status TEXT);
    `);

    eventConventionsMigration.up(db);
    eventConventionsMigration.up(db);

    expect((db.query("PRAGMA table_info(project_events)").all() as Array<{ name: string }>).map((column) => column.name)).toEqual([
      "event_id",
      "parent_span_id",
    ]);
    expect((db.query("PRAGMA table_info(sync_state)").all() as Array<{ name: string }>).map((column) => column.name)).toEqual([
      "sync_id",
      "blocked_origin_status",
      "validation_evidence_json",
      "resolved_conflict_paths_json",
    ]);
    expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_handoff_snapshots'").get())
      .toEqual({ name: "dispatch_handoff_snapshots" });
    expect(db.query("PRAGMA table_info(dispatch_handoff_snapshots)").all()).toEqual([
      expect.objectContaining({ name: "snapshot_id", pk: 1 }),
      expect.objectContaining({ name: "project_id", notnull: 1 }),
      expect.objectContaining({ name: "content_json", notnull: 1 }),
      expect.objectContaining({ name: "content_hash", notnull: 1 }),
      expect.objectContaining({ name: "old_lease_holder_json", notnull: 1 }),
      expect.objectContaining({ name: "requested_handoff_json", notnull: 0 }),
      expect.objectContaining({ name: "terminal_project_revision", notnull: 1 }),
      expect.objectContaining({ name: "release_event_id", notnull: 1 }),
      expect.objectContaining({ name: "acquisition_event_id", notnull: 0 }),
      expect.objectContaining({ name: "created_at", notnull: 1 }),
    ]);
    expect(db.query(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name LIKE 'dispatch_handoff_snapshots_immutable_%'
       ORDER BY name`,
    ).all()).toEqual([
      { name: "dispatch_handoff_snapshots_immutable_delete" },
      { name: "dispatch_handoff_snapshots_immutable_update" },
    ]);
  });

  test("migration 016 reruns a nonempty immutable partial table and links a late acquisition", () => {
    const db = trackDatabase(new Database(":memory:"));
    db.exec(`
      CREATE TABLE project_events (
        sequence INTEGER PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        subject_kind TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        causation_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE sync_state (sync_id TEXT PRIMARY KEY, status TEXT NOT NULL, staging_json TEXT);
      CREATE TABLE snapshot_insert_audit (snapshot_id TEXT NOT NULL);
      CREATE TABLE dispatch_handoff_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        old_lease_holder_json TEXT NOT NULL,
        requested_handoff_json TEXT,
        terminal_project_revision INTEGER NOT NULL,
        release_event_id TEXT UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TRIGGER dispatch_handoff_snapshots_immutable_update
        BEFORE UPDATE ON dispatch_handoff_snapshots
        BEGIN
          SELECT RAISE(ABORT, 'dispatch handoff snapshots are immutable');
        END;
      CREATE TRIGGER dispatch_handoff_snapshots_immutable_delete
        BEFORE DELETE ON dispatch_handoff_snapshots
        BEGIN
          SELECT RAISE(ABORT, 'dispatch handoff snapshots are immutable');
        END;
      CREATE TRIGGER dispatch_handoff_snapshots_audit_insert
        AFTER INSERT ON dispatch_handoff_snapshots
        BEGIN
          INSERT INTO snapshot_insert_audit (snapshot_id) VALUES (NEW.snapshot_id);
        END;
      INSERT INTO project_events (
        sequence, event_id, event_type, project_id, subject_kind, subject_id, causation_id, payload_json
      ) VALUES (
        1, 'release-partial', 'project.dispatch_released', 'melee', 'project', 'melee', 'command-partial',
        '{"handoff_snapshot_id":"snapshot-partial"}'
      );
      INSERT INTO dispatch_handoff_snapshots (
        snapshot_id, project_id, old_lease_holder_json, requested_handoff_json,
        terminal_project_revision, release_event_id, created_at
      ) VALUES (
        'snapshot-partial', 'melee',
        '{"kind":"run","workflow_id":"run-partial","lease_id":"lease-partial"}',
        '{"target_kind":"sync","target_workflow_id":"sync-partial","reason":"sync","requested_at":"2026-08-13T12:00:00.000Z"}',
        22, NULL, '2026-08-13T12:01:00.000Z'
      );
    `);

    const expectedContent = '{"old_lease_holder":{"kind":"run","lease_id":"lease-partial","workflow_id":"run-partial"},"project_id":"melee","requested_handoff":{"reason":"sync","requested_at":"2026-08-13T12:00:00.000Z","target_kind":"sync","target_workflow_id":"sync-partial"},"schema_version":1,"terminal_project_revision":22}';
    const expectedHash = createHash("sha256").update(expectedContent).digest("hex");
    immediateTransaction(db, () => eventConventionsMigration.up(db));
    expect(db.query(`
      SELECT content_json, content_hash, release_event_id, acquisition_event_id
      FROM dispatch_handoff_snapshots
    `).get()).toEqual({
      content_json: expectedContent,
      content_hash: expectedHash,
      release_event_id: "release-partial",
      acquisition_event_id: null,
    });
    expect(() => db.query(
      "UPDATE dispatch_handoff_snapshots SET content_hash = ? WHERE snapshot_id = ?",
    ).run("0".repeat(64), "snapshot-partial")).toThrow("dispatch handoff snapshots are immutable");

    db.query(`
      INSERT INTO project_events (
        sequence, event_id, event_type, project_id, subject_kind, subject_id, causation_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2,
      "acquire-late",
      "project.dispatch_acquired",
      "melee",
      "project",
      "melee",
      "release-partial",
      JSON.stringify({
        handoff_snapshot_id: "snapshot-partial",
        handoff_snapshot_content_hash: expectedHash,
      }),
    );
    immediateTransaction(db, () => eventConventionsMigration.up(db));

    expect(db.query(
      "SELECT release_event_id, acquisition_event_id FROM dispatch_handoff_snapshots",
    ).get()).toEqual({ release_event_id: "release-partial", acquisition_event_id: "acquire-late" });
    expect(db.query(`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger' AND name LIKE 'dispatch_handoff_snapshots_%'
      ORDER BY name
    `).all()).toEqual([
      { name: "dispatch_handoff_snapshots_audit_insert" },
      { name: "dispatch_handoff_snapshots_immutable_delete" },
      { name: "dispatch_handoff_snapshots_immutable_update" },
    ]);
    expect(db.query("SELECT snapshot_id FROM snapshot_insert_audit").all()).toEqual([
      { snapshot_id: "snapshot-partial" },
    ]);
    expect(() => db.query(
      "DELETE FROM dispatch_handoff_snapshots WHERE snapshot_id = ?",
    ).run("snapshot-partial")).toThrow("dispatch handoff snapshots are immutable");
  });

  test("migration 016 rejects an authoritative cross-project release link despite one valid alternate", () => {
    const stateDir = createTempDir("orchestrator-migrations-016-release-rollback-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const db = trackDatabase(new Database(dbPath));
    configureConnection(db);
    loadFrozenSchema15(db);
    createLegacyHandoffSnapshotStorage(db);
    const content = '{"old_lease_holder":{"kind":"run","lease_id":"lease-corrupt","workflow_id":"run-corrupt"},"project_id":"melee","requested_handoff":null,"schema_version":1,"terminal_project_revision":31}';
    const contentHash = createHash("sha256").update(content).digest("hex");
    insertFrozenProjectEvent(db, {
      eventId: "release-cross-corrupt",
      eventType: "project.dispatch_released",
      projectId: "other-project",
      causationId: "command-cross-corrupt",
      payload: {
        handoff_snapshot_id: "snapshot-corrupt-release",
        handoff_snapshot_content_hash: contentHash,
      },
    });
    insertFrozenProjectEvent(db, {
      eventId: "release-valid-alternate",
      eventType: "project.dispatch_released",
      projectId: "melee",
      causationId: "command-valid-alternate",
      payload: {
        handoff_snapshot_id: "snapshot-corrupt-release",
        handoff_snapshot_content_hash: contentHash,
      },
    });
    db.query(`
      INSERT INTO dispatch_handoff_snapshots (
        snapshot_id, project_id, old_lease_holder_json, requested_handoff_json,
        terminal_project_revision, release_event_id, acquisition_event_id, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)
    `).run(
      "snapshot-corrupt-release",
      "melee",
      '{"workflow_id":"run-corrupt","lease_id":"lease-corrupt","kind":"run"}',
      31,
      "release-cross-corrupt",
      "2026-08-13T13:00:00.000Z",
    );
    const beforeTableSql = db.query(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_handoff_snapshots'",
    ).get();
    const beforeRow = db.query("SELECT * FROM dispatch_handoff_snapshots").get();

    expect(() => runStorageMigrations(db)).toThrow(
      "Cannot validate dispatch handoff snapshot snapshot-corrupt-release release_event_id release-cross-corrupt",
    );
    expect(db.query("SELECT MAX(version) AS version, COUNT(*) AS count FROM schema_migrations").get())
      .toEqual({ version: 15, count: 15 });
    expect(
      (db.query("PRAGMA table_info(project_events)").all() as Array<{ name: string }>).map((column) => column.name),
    ).not.toContain("parent_span_id");
    expect(
      (db.query("PRAGMA table_info(sync_state)").all() as Array<{ name: string }>).map((column) => column.name),
    ).not.toEqual(expect.arrayContaining([
      "blocked_origin_status", "validation_evidence_json", "resolved_conflict_paths_json",
    ]));
    expect(db.query("PRAGMA table_info(dispatch_handoff_snapshots)").all()).toEqual([
      expect.objectContaining({ name: "snapshot_id" }),
      expect.objectContaining({ name: "project_id" }),
      expect.objectContaining({ name: "old_lease_holder_json" }),
      expect.objectContaining({ name: "requested_handoff_json" }),
      expect.objectContaining({ name: "terminal_project_revision" }),
      expect.objectContaining({ name: "release_event_id" }),
      expect.objectContaining({ name: "acquisition_event_id" }),
      expect.objectContaining({ name: "created_at" }),
    ]);
    expect(db.query(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_handoff_snapshots'",
    ).get()).toEqual(beforeTableSql);
    expect(db.query("SELECT * FROM dispatch_handoff_snapshots").get()).toEqual(beforeRow);
    expect(db.query(`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger' AND name LIKE 'dispatch_handoff_snapshots_immutable_%'
      ORDER BY name
    `).all()).toEqual([
      { name: "dispatch_handoff_snapshots_immutable_delete" },
      { name: "dispatch_handoff_snapshots_immutable_update" },
    ]);
    expect(db.query(`
      SELECT name FROM sqlite_master
      WHERE name IN (
        'dispatch_handoff_snapshots__migration_old',
        'dispatch_handoff_snapshots_project_created'
      )
    `).all()).toEqual([]);
    expect(() => db.query(
      "UPDATE dispatch_handoff_snapshots SET project_id = ? WHERE snapshot_id = ?",
    ).run("changed", "snapshot-corrupt-release")).toThrow("dispatch handoff snapshots are immutable");
    closeDatabase(db);

    const reopened = trackDatabase(new Database(dbPath));
    configureConnection(reopened);
    expect(reopened.query("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 15 });
    expect(reopened.query("SELECT * FROM dispatch_handoff_snapshots").get()).toEqual(beforeRow);
  });

  test("migration 016 rejects an authoritative wrong-causation acquisition link despite one valid alternate", () => {
    const db = trackDatabase(new Database(":memory:"));
    loadFrozenSchema15(db);
    createLegacyHandoffSnapshotStorage(db);
    const content = '{"old_lease_holder":{"kind":"run","lease_id":"lease-ambiguous","workflow_id":"run-ambiguous"},"project_id":"melee","requested_handoff":null,"schema_version":1,"terminal_project_revision":32}';
    const contentHash = createHash("sha256").update(content).digest("hex");
    insertFrozenProjectEvent(db, {
      eventId: "release-ambiguous",
      eventType: "project.dispatch_released",
      projectId: "melee",
      causationId: "command-ambiguous",
      payload: {
        handoff_snapshot_id: "snapshot-ambiguous-acquire",
        handoff_snapshot_content_hash: contentHash,
      },
    });
    insertFrozenProjectEvent(db, {
      eventId: "acquire-invalid-link",
      eventType: "project.dispatch_acquired",
      projectId: "melee",
      causationId: "unrelated-release",
      payload: {
        handoff_snapshot_id: "snapshot-ambiguous-acquire",
        handoff_snapshot_content_hash: contentHash,
      },
    });
    insertFrozenProjectEvent(db, {
      eventId: "acquire-valid-alternate",
      eventType: "project.dispatch_acquired",
      projectId: "melee",
      causationId: "release-ambiguous",
      payload: {
        handoff_snapshot_id: "snapshot-ambiguous-acquire",
        handoff_snapshot_content_hash: contentHash,
      },
    });
    db.query(`
      INSERT INTO dispatch_handoff_snapshots (
        snapshot_id, project_id, old_lease_holder_json, requested_handoff_json,
        terminal_project_revision, release_event_id, acquisition_event_id, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
    `).run(
      "snapshot-ambiguous-acquire",
      "melee",
      '{"workflow_id":"run-ambiguous","lease_id":"lease-ambiguous","kind":"run"}',
      32,
      "release-ambiguous",
      "acquire-invalid-link",
      "2026-08-13T13:01:00.000Z",
    );
    const beforeSchema = schemaSnapshot(db);
    const beforeRow = db.query("SELECT * FROM dispatch_handoff_snapshots").get();

    expect(() => runStorageMigrations(db)).toThrow(
      "Cannot validate dispatch handoff snapshot snapshot-ambiguous-acquire " +
      "acquisition_event_id acquire-invalid-link",
    );
    expect(db.query("SELECT MAX(version) AS version, COUNT(*) AS count FROM schema_migrations").get())
      .toEqual({ version: 15, count: 15 });
    expect(schemaSnapshot(db)).toEqual(beforeSchema);
    expect(db.query("SELECT * FROM dispatch_handoff_snapshots").get()).toEqual(beforeRow);
    expect(
      (db.query("PRAGMA table_info(dispatch_handoff_snapshots)").all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    ).not.toEqual(expect.arrayContaining(["content_json", "content_hash"]));
    expect(db.query(
      "SELECT name FROM sqlite_master WHERE name = 'dispatch_handoff_snapshots__migration_old'",
    ).get()).toBeNull();
    expect(() => db.query(
      "DELETE FROM dispatch_handoff_snapshots WHERE snapshot_id = ?",
    ).run("snapshot-ambiguous-acquire")).toThrow("dispatch handoff snapshots are immutable");

    const ambiguousDb = trackDatabase(new Database(":memory:"));
    loadFrozenSchema15(ambiguousDb);
    createLegacyHandoffSnapshotStorage(ambiguousDb);
    insertFrozenProjectEvent(ambiguousDb, {
      eventId: "release-null-ambiguous",
      eventType: "project.dispatch_released",
      projectId: "melee",
      causationId: "command-null-ambiguous",
      payload: {
        handoff_snapshot_id: "snapshot-null-ambiguous",
        handoff_snapshot_content_hash: contentHash,
      },
    });
    for (const eventId of ["acquire-null-ambiguous-a", "acquire-null-ambiguous-b"]) {
      insertFrozenProjectEvent(ambiguousDb, {
        eventId,
        eventType: "project.dispatch_acquired",
        projectId: "melee",
        causationId: "release-null-ambiguous",
        payload: {
          handoff_snapshot_id: "snapshot-null-ambiguous",
          handoff_snapshot_content_hash: contentHash,
        },
      });
    }
    ambiguousDb.query(`
      INSERT INTO dispatch_handoff_snapshots (
        snapshot_id, project_id, old_lease_holder_json, requested_handoff_json,
        terminal_project_revision, release_event_id, acquisition_event_id, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)
    `).run(
      "snapshot-null-ambiguous",
      "melee",
      '{"workflow_id":"run-ambiguous","lease_id":"lease-ambiguous","kind":"run"}',
      32,
      "release-null-ambiguous",
      "2026-08-13T13:02:00.000Z",
    );
    const beforeAmbiguousSchema = schemaSnapshot(ambiguousDb);
    const beforeAmbiguousRow = ambiguousDb.query("SELECT * FROM dispatch_handoff_snapshots").get();

    expect(() => runStorageMigrations(ambiguousDb)).toThrow(
      "Cannot validate dispatch handoff snapshot snapshot-null-ambiguous acquisition event: " +
      "expected at most one valid same-project candidate, found 2",
    );
    expect(ambiguousDb.query(
      "SELECT MAX(version) AS version, COUNT(*) AS count FROM schema_migrations",
    ).get()).toEqual({ version: 15, count: 15 });
    expect(schemaSnapshot(ambiguousDb)).toEqual(beforeAmbiguousSchema);
    expect(ambiguousDb.query("SELECT * FROM dispatch_handoff_snapshots").get()).toEqual(beforeAmbiguousRow);
  });

  test("migration 016 backfills sync facts before event payloads stop serving as state", () => {
    const db = trackDatabase(new Database(":memory:"));
    db.exec(`
      CREATE TABLE project_events (
        sequence INTEGER PRIMARY KEY,
        event_type TEXT NOT NULL,
        subject_kind TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE sync_state (
        sync_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        staging_json TEXT NOT NULL
      );
      INSERT INTO sync_state (sync_id, status, staging_json)
      VALUES
        ('sync-event', 'blocked', '{"conflicting_paths":["still.c"]}'),
        ('sync-canonical', 'blocked', '{"conflicting_paths":["still-canonical.c"]}'),
        ('sync-staging', 'validated', '{"validation_evidence":{"report":"staged"},"auto_resolved_paths":["auto.c"]}');
      INSERT INTO project_events (sequence, event_type, subject_kind, subject_id, payload_json)
      VALUES
        (1, 'sync.blocked', 'sync', 'sync-event', '{"previous_status":"validating"}'),
        (2, 'sync.validated', 'sync', 'sync-event', '{"validation_evidence":{"report":"event"}}'),
        (3, 'sync.reconciliation_blocked', 'sync', 'sync-event', '{"conflict_identities":["fixed.c","still.c"]}'),
        (4, 'sync.blocked', 'sync_workflow', 'sync-canonical', '{"previous_status":"reconciling"}'),
        (5, 'sync.validated', 'sync_workflow', 'sync-canonical', '{"validation_evidence":{"report":"canonical"}}'),
        (6, 'sync.reconciliation_blocked', 'sync_workflow', 'sync-canonical', '{"conflict_identities":["fixed-canonical.c","still-canonical.c"]}');
    `);

    eventConventionsMigration.up(db);
    eventConventionsMigration.up(db);

    expect(db.query(
      `SELECT sync_id, blocked_origin_status, validation_evidence_json, resolved_conflict_paths_json
       FROM sync_state ORDER BY sync_id`,
    ).all()).toEqual([
      {
        sync_id: "sync-canonical",
        blocked_origin_status: "reconciling",
        validation_evidence_json: '{"report":"canonical"}',
        resolved_conflict_paths_json: '["fixed-canonical.c"]',
      },
      {
        sync_id: "sync-event",
        blocked_origin_status: "validating",
        validation_evidence_json: '{"report":"event"}',
        resolved_conflict_paths_json: '["fixed.c"]',
      },
      {
        sync_id: "sync-staging",
        blocked_origin_status: null,
        validation_evidence_json: '{"report":"staged"}',
        resolved_conflict_paths_json: '["auto.c"]',
      },
    ]);
  });

  test("migration 016 backfills legacy handoff hashes and event links across reopen", () => {
    const stateDir = createTempDir("orchestrator-migrations-handoff-016-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const db = trackDatabase(new Database(dbPath));
    configureConnection(db);
    const expectedContent = '{"old_lease_holder":{"kind":"run","lease_id":"lease-1","workflow_id":"run-1"},"project_id":"melee","requested_handoff":{"reason":"sync","requested_at":"2026-08-12T10:03:00.000Z","target_kind":"sync","target_workflow_id":"sync-1"},"schema_version":1,"terminal_project_revision":8}';
    const expectedHash = createHash("sha256").update(expectedContent).digest("hex");
    db.exec(`
      CREATE TABLE project_events (
        sequence INTEGER PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        subject_kind TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        causation_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE sync_state (
        sync_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        staging_json TEXT
      );
      CREATE TABLE dispatch_handoff_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        old_lease_holder_json TEXT NOT NULL,
        requested_handoff_json TEXT,
        terminal_project_revision INTEGER NOT NULL,
        release_event_id TEXT UNIQUE,
        created_at TEXT NOT NULL
      );
      INSERT INTO project_events (
        sequence, event_id, event_type, project_id, subject_kind, subject_id, causation_id, payload_json
      ) VALUES
        (1, 'event-release', 'project.dispatch_released', 'melee', 'project', 'melee', 'command-release',
         '{"handoff_snapshot_id":"snapshot-legacy"}'),
        (2, 'event-acquire', 'project.dispatch_acquired', 'melee', 'project', 'melee', 'event-release',
         '{"handoff_snapshot_id":"snapshot-legacy","handoff_snapshot_content_hash":"${expectedHash}"}');
      INSERT INTO dispatch_handoff_snapshots (
        snapshot_id, project_id, old_lease_holder_json, requested_handoff_json,
        terminal_project_revision, release_event_id, created_at
      ) VALUES (
        'snapshot-legacy', 'melee',
        '{"workflow_id":"run-1","lease_id":"lease-1","kind":"run"}',
        '{"requested_at":"2026-08-12T10:03:00.000Z","reason":"sync","target_workflow_id":"sync-1","target_kind":"sync"}',
        8, NULL, '2026-08-12T10:04:00.000Z'
      );
    `);

    immediateTransaction(db, () => eventConventionsMigration.up(db));
    const expectedRow = {
      snapshot_id: "snapshot-legacy",
      content_json: expectedContent,
      content_hash: expectedHash,
      release_event_id: "event-release",
      acquisition_event_id: "event-acquire",
    };
    expect(db.query(`
      SELECT snapshot_id, content_json, content_hash, release_event_id, acquisition_event_id
      FROM dispatch_handoff_snapshots
    `).get()).toEqual(expectedRow);
    closeDatabase(db);

    const reopened = trackDatabase(new Database(dbPath));
    configureConnection(reopened);
    immediateTransaction(reopened, () => eventConventionsMigration.up(reopened));
    expect(reopened.query(`
      SELECT snapshot_id, content_json, content_hash, release_event_id, acquisition_event_id
      FROM dispatch_handoff_snapshots
    `).get()).toEqual(expectedRow);
    expect(() => reopened.query(
      "UPDATE dispatch_handoff_snapshots SET content_hash = ? WHERE snapshot_id = ?",
    ).run("0".repeat(64), "snapshot-legacy")).toThrow("dispatch handoff snapshots are immutable");
  });

  test("rebuildTable replaces a table and copies its rows inside a transaction", () => {
    const stateDir = createTempDir("orchestrator-migrations-rebuild-");
    const db = trackDatabase(new Database(join(stateDir, "rebuild.sqlite")));
    db.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
    db.query("INSERT INTO widgets (id, label) VALUES (?, ?)").run(7, "kept");

    immediateTransaction(db, () => {
      rebuildTable(
        db,
        "widgets",
        "CREATE TABLE widgets (id INTEGER PRIMARY KEY, label TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)",
        "INSERT INTO widgets (id, label) SELECT id, label FROM widgets__migration_old",
      );
    });

    expect(db.query("SELECT id, label, revision FROM widgets").all()).toEqual([
      { id: 7, label: "kept", revision: 0 },
    ]);
    expect(
      db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'widgets__migration_old'").get(),
    ).toBeNull();
  });
});
