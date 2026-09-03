import type { KnowledgeStorageMigration } from "./types.js";

const STRICT_CAUSE_CHECK = "CHECK ((kind = 'regression') = (cause IS NOT NULL))";

export const eventNoteCauseMigration: KnowledgeStorageMigration = {
  version: 6,
  name: "event-note-cause",
  up(db) {
    const row = db.query<{ sql: string | null }, []>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'event'",
    ).get();
    if (!row?.sql?.includes(STRICT_CAUSE_CHECK)) return;

    db.exec(`
      ALTER TABLE event RENAME TO event_strict_cause;
      DROP INDEX event_target_id;

      CREATE TABLE event (
        id TEXT PRIMARY KEY,
        target_id TEXT NOT NULL REFERENCES target(id),
        kind TEXT NOT NULL CHECK (kind IN ('regression', 'note')),
        cause TEXT CHECK (cause IN ('merge_conflict', 'upstream_change')),
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (kind != 'regression' OR cause IS NOT NULL)
      );
      CREATE INDEX event_target_id ON event(target_id);
      INSERT INTO event SELECT * FROM event_strict_cause;

      CREATE TABLE event_ref_relaxed_cause (
        event_id TEXT NOT NULL REFERENCES event(id),
        ref_kind TEXT NOT NULL CHECK (ref_kind IN ('worker_run', 'epoch', 'pr', 'commit')),
        ref_id TEXT NOT NULL,
        PRIMARY KEY (event_id, ref_kind, ref_id)
      );
      INSERT INTO event_ref_relaxed_cause SELECT * FROM event_ref;
      DROP TABLE event_ref;
      DROP TABLE event_strict_cause;
      ALTER TABLE event_ref_relaxed_cause RENAME TO event_ref;
    `);
  },
};
