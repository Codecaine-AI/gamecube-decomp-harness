import type { Database } from "bun:sqlite";
import { SYNC_PUBLICATION_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

function hasColumn(db: Database, table: string, column: string): boolean {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((candidate) => candidate.name === column);
}

export const syncPublicationMigration: StorageMigration = {
  version: 12,
  name: "sync_publication",
  up(db) {
    if (!hasColumn(db, "runs", "remote_application_ids_json")) {
      db.exec("ALTER TABLE runs ADD COLUMN remote_application_ids_json TEXT NOT NULL DEFAULT '[]'");
    }
    db.exec(SYNC_PUBLICATION_DDL);
  },
};
