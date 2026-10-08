import type { KnowledgeStorageMigration } from "./types.js";

const CHECKPOINT_CONFIRMED_PATHWAY = "'checkpoint_confirmed'";

export const checkpointConfirmedPathwayMigration: KnowledgeStorageMigration = {
  version: 7,
  name: "checkpoint-confirmed-pathway",
  up(db) {
    const row = db.query<{ sql: string | null }, []>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'index_task'",
    ).get();
    // index_task has no foreign keys, indexes, or triggers, so a rename-and-copy rebuild keeps every row.
    if (row?.sql && !row.sql.includes(CHECKPOINT_CONFIRMED_PATHWAY)) {
      db.exec(`
        ALTER TABLE index_task RENAME TO index_task_without_checkpoint_confirmed;

        CREATE TABLE index_task (
          id TEXT PRIMARY KEY,
          pathway TEXT NOT NULL CHECK (pathway IN ('run_closed', 'pr_imported', 'regression', 'archival_ingest', 'drift_recheck', 'checkpoint_confirmed')),
          payload TEXT NOT NULL,
          enqueued_at TEXT NOT NULL,
          started_at TEXT,
          done_at TEXT
        );
        INSERT INTO index_task (id, pathway, payload, enqueued_at, started_at, done_at)
          SELECT id, pathway, payload, enqueued_at, started_at, done_at
          FROM index_task_without_checkpoint_confirmed;
        DROP TABLE index_task_without_checkpoint_confirmed;
      `);
    }
    db.exec("CREATE INDEX IF NOT EXISTS submission_runtime_ref ON submission(runtime_ref)");
  },
};
