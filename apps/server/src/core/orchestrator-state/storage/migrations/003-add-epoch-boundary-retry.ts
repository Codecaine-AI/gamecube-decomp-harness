import type { Database } from "bun:sqlite";
import type { StorageMigration } from "./types.js";

function columnExists(db: Database, table: string, column: string): boolean {
  return (db.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).some(
    (row) => row.name === column,
  );
}

export const addEpochBoundaryRetryMigration: StorageMigration = {
  version: 3,
  name: "add_epoch_boundary_retry",
  up(db) {
    if (!columnExists(db, "epochs", "boundary_attempt_count")) {
      db.exec("ALTER TABLE epochs ADD COLUMN boundary_attempt_count INTEGER NOT NULL DEFAULT 0");
    }
    if (!columnExists(db, "epochs", "boundary_next_attempt_at")) {
      db.exec("ALTER TABLE epochs ADD COLUMN boundary_next_attempt_at TEXT");
    }
  },
};
