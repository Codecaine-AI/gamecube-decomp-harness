import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { enqueueIndexTask } from "../../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../store.js";
import { runKnowledgeStorageMigrations } from "./index.js";
import { workerRunIntegrationDetailMigration } from "./004-worker-run-integration-detail.js";
import { targetMovedToIdMigration } from "./005-target-moved-to-id.js";
import { eventNoteCauseMigration } from "./006-event-note-cause.js";
import { checkpointConfirmedPathwayMigration } from "./007-checkpoint-confirmed-pathway.js";

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
      db.exec("DELETE FROM schema_migrations WHERE version = 7");

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

  test("migration 007 widens the CHECK on an old store, is a no-op on a fresh one, adds the runtime_ref index", () => {
    const tableSql = (store: KnowledgeStore): string =>
      store.db.query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'index_task'",
      ).get()!.sql;
    const schemaVersion = (store: KnowledgeStore): number =>
      store.db.query<{ schema_version: number }, []>("PRAGMA schema_version").get()!.schema_version;
    const runtimeRefPlan = (store: KnowledgeStore): string =>
      store.db.query<{ detail: string }, []>(
        "EXPLAIN QUERY PLAN SELECT worker_run_id, seq, id FROM submission WHERE runtime_ref = 'checkpoint-1'",
      ).all().map(({ detail }) => detail).join("\n");
    const indexTaskRows = (store: KnowledgeStore) =>
      store.db.query("SELECT id, pathway, payload, enqueued_at, started_at, done_at FROM index_task ORDER BY id").all();
    const oldRows = [
      { id: "task:a", pathway: "run_closed", payload: "attempt://run/run:a", enqueued_at: "2026-09-01T00:00:00.000Z", started_at: null, done_at: null },
      { id: "task:b", pathway: "pr_imported", payload: "[\"pr-1\"]", enqueued_at: "2026-09-02T00:00:00.000Z", started_at: "2026-09-02T01:00:00.000Z", done_at: null },
      { id: "task:c", pathway: "drift_recheck", payload: "{\"target_id\":\"t\"}", enqueued_at: "2026-09-03T00:00:00.000Z", started_at: "2026-09-03T01:00:00.000Z", done_at: "2026-09-03T02:00:00.000Z" },
    ];

    // An old store: the shared per-game store as the previous build left it, at migration 006.
    const oldRoot = makeTempDir();
    const seeded = openKnowledgeStore({ knowledgeRoot: oldRoot });
    seeded.db.exec(`
      DROP INDEX submission_runtime_ref;
      DROP TABLE index_task;
      CREATE TABLE index_task (
        id TEXT PRIMARY KEY,
        pathway TEXT NOT NULL CHECK (pathway IN ('run_closed', 'pr_imported', 'regression', 'archival_ingest', 'drift_recheck')),
        payload TEXT NOT NULL,
        enqueued_at TEXT NOT NULL,
        started_at TEXT,
        done_at TEXT
      );
      DELETE FROM schema_migrations WHERE version = 7;
    `);
    const insertOld = seeded.db.query("INSERT INTO index_task VALUES (?, ?, ?, ?, ?, ?)");
    for (const row of oldRows) {
      insertOld.run(row.id, row.pathway, row.payload, row.enqueued_at, row.started_at, row.done_at);
    }
    expect(() => insertOld.run("task:early", "checkpoint_confirmed", "{}", "2026-09-04T00:00:00.000Z", null, null)).toThrow();
    expect(runtimeRefPlan(seeded)).not.toContain("submission_runtime_ref");
    seeded.close();

    const migrated = openKnowledgeStore({ knowledgeRoot: oldRoot });
    stores.push(migrated);
    expect(migrated.db.query("SELECT version, name FROM schema_migrations WHERE version = 7").get()).toEqual({
      version: 7,
      name: "checkpoint-confirmed-pathway",
    });
    expect(tableSql(migrated)).toContain("'checkpoint_confirmed'");
    expect(indexTaskRows(migrated)).toEqual(oldRows);
    expect(migrated.db.query("SELECT name FROM sqlite_master WHERE name LIKE 'index_task_%'").all()).toEqual([]);
    enqueueIndexTask(migrated, {
      id: "task:checkpoint_confirmed:checkpoint-1",
      pathway: "checkpoint_confirmed",
      payload: "{}",
      enqueuedAt: "2026-09-04T00:00:00.000Z",
    });
    expect(() => migrated.db.query("INSERT INTO index_task VALUES ('task:bad', 'bogus', '{}', '2026-09-04', NULL, NULL)").run()).toThrow();
    expect(runtimeRefPlan(migrated)).toContain("USING INDEX submission_runtime_ref");

    // A fresh store already carries the widened CHECK and the index; 007 changes nothing.
    const fresh = openKnowledgeStore({ knowledgeRoot: makeTempDir() });
    stores.push(fresh);
    expect(tableSql(fresh)).toContain("'checkpoint_confirmed'");
    expect(runtimeRefPlan(fresh)).toContain("USING INDEX submission_runtime_ref");
    enqueueIndexTask(fresh, { id: "task:fresh", pathway: "checkpoint_confirmed", payload: "{}", enqueuedAt: "2026-09-04T00:00:00.000Z" });
    const freshSql = tableSql(fresh);
    const freshVersion = schemaVersion(fresh);

    checkpointConfirmedPathwayMigration.up(fresh.db);
    checkpointConfirmedPathwayMigration.up(migrated.db);

    expect(schemaVersion(fresh)).toBe(freshVersion);
    expect(tableSql(fresh)).toBe(freshSql);
    expect(fresh.db.query("SELECT id FROM index_task").all()).toEqual([{ id: "task:fresh" }]);
    expect(indexTaskRows(migrated)).toHaveLength(oldRows.length + 1);
  });
});
