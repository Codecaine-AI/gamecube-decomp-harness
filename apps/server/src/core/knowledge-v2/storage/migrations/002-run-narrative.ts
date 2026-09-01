import type { KnowledgeStorageMigration } from "./types.js";

export const runNarrativeMigration: KnowledgeStorageMigration = {
  version: 2,
  name: "run-narrative",
  up(db) {
    db.exec(`
      CREATE TABLE run_narrative (
        worker_run_id TEXT PRIMARY KEY REFERENCES worker_run(id),
        summary TEXT NOT NULL,
        notable_observations TEXT NOT NULL,
        narrative TEXT NOT NULL,
        produced_by TEXT NOT NULL CHECK (produced_by IN ('live', 'backfill')),
        created_at TEXT NOT NULL
      )
    `);
  },
};
