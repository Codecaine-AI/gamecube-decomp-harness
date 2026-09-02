import type { KnowledgeStorageMigration } from "./types.js";

export const targetMovedToIdMigration: KnowledgeStorageMigration = {
  version: 5,
  name: "target-moved-to-id",
  up(db) {
    const columns = db.query<{ name: string }, []>("PRAGMA table_info('target')").all();
    if (columns.some(({ name }) => name === "moved_to_id")) return;
    db.exec("ALTER TABLE target ADD COLUMN moved_to_id TEXT REFERENCES target(id)");
  },
};
