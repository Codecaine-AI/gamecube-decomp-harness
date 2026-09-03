import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { openKnowledgeStore, type KnowledgeStore } from "../store.js";
import { runKnowledgeStorageMigrations } from "./index.js";
import { workerRunIntegrationDetailMigration } from "./004-worker-run-integration-detail.js";
import { targetMovedToIdMigration } from "./005-target-moved-to-id.js";
import { eventNoteCauseMigration } from "./006-event-note-cause.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "knowledge-v2-migrations-"));
  tempDirs.push(dir);
  return dir;
}

describe("knowledge-v2 storage migrations", () => {
  test("opened stores index evidence by fact_id", () => {
    const store = openKnowledgeStore({ knowledgeRoot: makeTempDir() });
    stores.push(store);

    const indexes = store.db.query("PRAGMA index_list('evidence')").all() as Array<{ name: string }>;

    expect(indexes.map(({ name }) => name)).toContain("evidence_fact_id");
  });

  test("accepts an evidence fact_id index created before its migration", () => {
    const db = new Database(":memory:");
    try {
      runKnowledgeStorageMigrations(db);
      db.exec("DROP INDEX IF EXISTS evidence_fact_id");
      db.exec("CREATE INDEX evidence_fact_id ON evidence(fact_id)");
      db.exec("DELETE FROM schema_migrations WHERE version = 3");
      db.exec("DELETE FROM schema_migrations WHERE version = 4");
      db.exec("DELETE FROM schema_migrations WHERE version = 5");
      db.exec("DELETE FROM schema_migrations WHERE version = 6");

      expect(() => runKnowledgeStorageMigrations(db)).not.toThrow();
    } finally {
      db.close();
    }
  });

  test("adds worker run integration detail idempotently", () => {
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE worker_run (id TEXT PRIMARY KEY)");

      workerRunIntegrationDetailMigration.up(db);
      workerRunIntegrationDetailMigration.up(db);

      const columns = db.query<{ name: string }, []>("PRAGMA table_info('worker_run')").all();
      expect(columns.filter(({ name }) => name === "integration_detail")).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  test("adds target moved_to_id idempotently", () => {
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE target (id TEXT PRIMARY KEY)");

      targetMovedToIdMigration.up(db);
      targetMovedToIdMigration.up(db);

      const columns = db.query<{ name: string }, []>("PRAGMA table_info('target')").all();
      expect(columns.filter(({ name }) => name === "moved_to_id")).toHaveLength(1);

      const foreignKeys = db
        .query<{ from: string; table: string; to: string }, []>("PRAGMA foreign_key_list('target')")
        .all();
      expect(foreignKeys).toContainEqual(
        expect.objectContaining({ from: "moved_to_id", table: "target", to: "id" }),
      );
    } finally {
      db.close();
    }
  });

  test("allows an upstream cause on note events without losing refs", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE target (id TEXT PRIMARY KEY);
        INSERT INTO target VALUES ('target-1');
        CREATE TABLE event (
          id TEXT PRIMARY KEY,
          target_id TEXT NOT NULL REFERENCES target(id),
          kind TEXT NOT NULL CHECK (kind IN ('regression', 'note')),
          cause TEXT CHECK (cause IN ('merge_conflict', 'upstream_change')),
          summary TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK ((kind = 'regression') = (cause IS NOT NULL))
        );
        CREATE INDEX event_target_id ON event(target_id);
        CREATE TABLE event_ref (
          event_id TEXT NOT NULL REFERENCES event(id),
          ref_kind TEXT NOT NULL CHECK (ref_kind IN ('worker_run', 'epoch', 'pr', 'commit')),
          ref_id TEXT NOT NULL,
          PRIMARY KEY (event_id, ref_kind, ref_id)
        );
        INSERT INTO event VALUES ('existing', 'target-1', 'regression', 'upstream_change', 'existing summary', '2026-01-01');
        INSERT INTO event_ref VALUES ('existing', 'commit', 'abc123');
      `);

      eventNoteCauseMigration.up(db);
      eventNoteCauseMigration.up(db);

      db.query("INSERT INTO event VALUES ('note', 'target-1', 'note', 'upstream_change', 'override', '2026-01-02')").run();
      expect(db.query("SELECT ref_kind, ref_id FROM event_ref WHERE event_id = 'existing'").get()).toEqual({
        ref_kind: "commit",
        ref_id: "abc123",
      });
      expect(() => db.query("INSERT INTO event VALUES ('bad', 'target-1', 'regression', NULL, 'bad', '2026-01-03')").run()).toThrow();
    } finally {
      db.close();
    }
  });
});
