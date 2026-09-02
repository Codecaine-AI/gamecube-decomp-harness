import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { openKnowledgeStore, type KnowledgeStore } from "../store.js";
import { runKnowledgeStorageMigrations } from "./index.js";
import { workerRunIntegrationDetailMigration } from "./004-worker-run-integration-detail.js";

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
});
