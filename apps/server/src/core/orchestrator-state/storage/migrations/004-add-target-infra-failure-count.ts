import type { Database } from "bun:sqlite";
import type { StorageMigration } from "./types.js";

function columnExists(db: Database, table: string, column: string): boolean {
  return (db.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).some(
    (row) => row.name === column,
  );
}

export const addTargetInfraFailureCountMigration: StorageMigration = {
  version: 4,
  name: "add_target_infra_failure_count",
  up(db) {
    if (!columnExists(db, "epoch_targets", "infra_failure_count")) {
      db.exec("ALTER TABLE epoch_targets ADD COLUMN infra_failure_count INTEGER NOT NULL DEFAULT 0");
    }
  },
};
