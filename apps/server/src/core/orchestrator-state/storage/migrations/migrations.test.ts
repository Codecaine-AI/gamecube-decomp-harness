import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { configureConnection, ensureLegacySchema } from "../ddl.js";
import { openState, type StateStore } from "../store.js";
import { immediateTransaction } from "../transaction.js";
import { PENDING_INTEGRATIONS_DDL, PROJECT_EVENTS_DDL } from "./ddl.js";
import { rebuildTable } from "./rebuild-table.js";

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
    sql: row.sql?.replace(/\s+/g, " ").trim() ?? null,
  }));
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
    ]);
    expect(runColumns.find((column) => column.name === "revision")?.dflt_value).toBe("0");
    expect(runColumns.find((column) => column.name === "blockers_json")?.dflt_value).toBe("'[]'");

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
    expect(reopened.db.query("SELECT count(*) AS count FROM schema_migrations").get()).toEqual({ count: 10 });
    expect(schemaSnapshot(reopened.db)).toEqual(firstSnapshot);
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
                  terminal_reason, scheduler_condition
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
    expect(reopened.db.query("SELECT count(*) AS count FROM schema_migrations").get()).toEqual({ count: 10 });
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
