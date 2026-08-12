import type { Database } from "bun:sqlite";
import { SESSION_TIMELINE_ENTRIES_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

function columnNames(db: Database, table: string): Set<string> {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function addColumn(db: Database, columns: Set<string>, name: string, definition: string): void {
  if (columns.has(name)) return;
  db.exec(`ALTER TABLE project_sessions ADD COLUMN ${name} ${definition}`);
  columns.add(name);
}

export const projectSessionContainerMigration: StorageMigration = {
  version: 4,
  name: "project_session_container",
  up(db) {
    const columns = columnNames(db, "project_sessions");
    addColumn(db, columns, "revision", "INTEGER NOT NULL DEFAULT 0");
    addColumn(db, columns, "head_revision", "TEXT");
    addColumn(db, columns, "trace_id", "TEXT");
    addColumn(db, columns, "blockers_json", "TEXT NOT NULL DEFAULT '[]'");
    addColumn(db, columns, "save_point_stale", "INTEGER NOT NULL DEFAULT 0");
    addColumn(db, columns, "caused_by_event_id", "TEXT");
    addColumn(db, columns, "closed_at", "TEXT");

    // Existing rows predate the StateEnvelope. Initialize the canonical head
    // only for the still-active session and give every row a stable trace.
    db.exec(`
      UPDATE project_sessions
      SET head_revision = base_sha
      WHERE status IN ('active', 'blocked')
        AND head_revision IS NULL;

      UPDATE project_sessions
      SET trace_id = 'trace-session-' || session_uuid
      WHERE trace_id IS NULL;

      DROP INDEX IF EXISTS project_sessions_one_active_project;
      CREATE UNIQUE INDEX IF NOT EXISTS project_sessions_one_active_project
        ON project_sessions (project_id)
        WHERE status IN ('active', 'blocked', 'closing');
    `);

    db.exec(SESSION_TIMELINE_ENTRIES_DDL);
  },
};
