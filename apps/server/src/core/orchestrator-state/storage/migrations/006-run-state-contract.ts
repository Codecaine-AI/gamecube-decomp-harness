import type { Database } from "bun:sqlite";
import { RUNS_DDL } from "./ddl.js";
import { rebuildTable } from "./rebuild-table.js";
import type { StorageMigration } from "./types.js";

const RUN_COLUMNS = [
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
] as const;

function columnNames(db: Database, table: string): Set<string> {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function sourceExpression(column: (typeof RUN_COLUMNS)[number], oldColumns: ReadonlySet<string>): string {
  if (oldColumns.has(column)) return column;
  if (column === "revision") return "0";
  if (column === "blockers_json") return "'[]'";
  return "NULL";
}

function copySql(oldColumns: ReadonlySet<string>): string {
  const targetColumns = RUN_COLUMNS.join(", ");
  const sourceColumns = RUN_COLUMNS.map((column) => sourceExpression(column, oldColumns)).join(", ");
  return `INSERT INTO runs (${targetColumns}) SELECT ${sourceColumns} FROM runs__migration_old`;
}

export const runStateContractMigration: StorageMigration = {
  version: 6,
  name: "run_state_contract",
  up(db) {
    const columns = columnNames(db, "runs");
    if (RUN_COLUMNS.some((column) => !columns.has(column))) {
      rebuildTable(db, "runs", RUNS_DDL, copySql(columns));
    }

    // These are the only legacy run statuses. CASE keeps this backfill
    // explicit and makes re-running a partially applied migration harmless.
    db.exec(`
      UPDATE runs
      SET status = CASE status
        WHEN 'active' THEN 'active'
        WHEN 'paused' THEN 'paused'
        WHEN 'failed' THEN 'failed'
        WHEN 'complete' THEN 'completed'
        ELSE status
      END;

      UPDATE runs
      SET trace_id = 'trace-run-' || id
      WHERE trace_id IS NULL;

      UPDATE runs
      SET session_uuid = (
        SELECT project_sessions.session_uuid
        FROM project_sessions
        WHERE project_sessions.active_run_id = runs.id
          AND project_sessions.status IN ('active', 'blocked', 'closing')
        LIMIT 1
      )
      WHERE session_uuid IS NULL
        AND EXISTS (
          SELECT 1
          FROM project_sessions
          WHERE project_sessions.active_run_id = runs.id
            AND project_sessions.status IN ('active', 'blocked', 'closing')
        );

      UPDATE runs
      SET project_id = (
        SELECT project_sessions.project_id
        FROM project_sessions
        WHERE project_sessions.active_run_id = runs.id
          AND project_sessions.status IN ('active', 'blocked', 'closing')
        LIMIT 1
      )
      WHERE project_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM project_sessions
          WHERE project_sessions.active_run_id = runs.id
            AND project_sessions.status IN ('active', 'blocked', 'closing')
        );

      UPDATE runs
      SET head_revision = (
        SELECT project_sessions.head_revision
        FROM project_sessions
        WHERE project_sessions.active_run_id = runs.id
          AND project_sessions.status IN ('active', 'blocked', 'closing')
        LIMIT 1
      )
      WHERE head_revision IS NULL
        AND EXISTS (
          SELECT 1
          FROM project_sessions
          WHERE project_sessions.active_run_id = runs.id
            AND project_sessions.status IN ('active', 'blocked', 'closing')
        );
    `);
  },
};
