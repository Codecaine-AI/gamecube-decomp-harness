import type { Database } from "bun:sqlite";
import type { StorageMigration } from "./types.js";

const LEGACY_TABLES = [
  "sync_publication_intents",
  "sync_invalidations",
  "knowledge_revisions",
  "sync_knowledge_jobs",
] as const;

function tableExists(db: Database, table: string): boolean {
  return Boolean(db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table));
}

export const dropLegacySyncKnowledgeTablesMigration: StorageMigration = {
  version: 5,
  name: "drop_legacy_sync_knowledge_tables",
  up(db) {
    if (tableExists(db, "jobs")) {
      db.query("DELETE FROM jobs WHERE kind = 'sync_publication'").run();
    }
    for (const table of LEGACY_TABLES) {
      if (!tableExists(db, table)) continue;
      db.exec(`DROP TABLE "${table}"`);
    }
  },
};
