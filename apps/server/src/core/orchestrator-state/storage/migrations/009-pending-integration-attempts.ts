import type { Database } from "bun:sqlite";
import type { StorageMigration } from "./types.js";

function columnNames(db: Database): Set<string> {
  return new Set(
    (db.query("PRAGMA table_info(pending_integrations)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
}

export const pendingIntegrationAttemptsMigration: StorageMigration = {
  version: 9,
  name: "pending_integration_attempts",
  up(db) {
    const columns = columnNames(db);
    if (!columns.has("attempt")) {
      db.exec("ALTER TABLE pending_integrations ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1");
    }
    if (!columns.has("status")) {
      db.exec("ALTER TABLE pending_integrations ADD COLUMN status TEXT NOT NULL DEFAULT 'prepared'");
    }
    if (!columns.has("failure_reason")) {
      db.exec("ALTER TABLE pending_integrations ADD COLUMN failure_reason TEXT");
    }
    if (!columns.has("failed_at")) {
      db.exec("ALTER TABLE pending_integrations ADD COLUMN failed_at TEXT");
    }
  },
};
