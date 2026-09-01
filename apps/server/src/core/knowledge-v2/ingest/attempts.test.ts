import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLocator, parseLocator, type AttemptLocator } from "../locator.js";
import { insertEntitiesIfMissing, insertTargets } from "../records/index.js";
import { openKnowledgeStore } from "../storage/store.js";
import { importAttempts } from "./attempts.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(dir: string): string {
  const path = join(dir, "orchestrator.sqlite");
  const db = new Database(path);
  db.run(`CREATE TABLE worker_state (
    id TEXT PRIMARY KEY, run_id TEXT, epoch_id TEXT, target_claim_id TEXT, worker_id TEXT,
    target_key TEXT, lifecycle_status TEXT, started_at TEXT, ended_at TEXT, baseline_score REAL,
    timeout_summary TEXT, error_summary TEXT)`);
  db.run(`CREATE TABLE worker_checkpoints (
    id TEXT PRIMARY KEY, worker_state_id TEXT, attempt_index INTEGER, validation_time TEXT,
    new_score REAL, exact_match INTEGER, metadata_json TEXT)`);
  db.run(`CREATE TABLE checkpoint_items (
    id TEXT PRIMARY KEY, worker_checkpoint_id TEXT, target_claim_id TEXT,
    disposition TEXT, item_status TEXT)`);
  const state = db.query(`INSERT INTO worker_state VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  state.run("improve", "source-run", "epoch-a", "claim-a", "worker-a", "unit::Func", "completed", "2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z", 10, null, null);
  state.run("exact", "source-exact", "epoch-b", "claim-b", "worker-b", "unit::Exact", "completed", "2026-01-02T00:00:00Z", "2026-01-02T00:01:00Z", 50, null, null);
  state.run("timeout", "source-timeout", "epoch-c", "claim-c", "worker-c", "unit::Func", "timed_out", "2026-01-03T00:00:00Z", null, null, "deadline", null);
  state.run("unmapped", "source-u", "epoch-d", "claim-d", "worker-d", "unit::Missing", "completed", "2026-01-04T00:00:00Z", "2026-01-04T00:01:00Z", 1, null, null);
  state.run("silent", "source-s", "epoch-e", "claim-e", "worker-e", "unit::Func", "completed", "2026-01-05T00:00:00Z", "2026-01-05T00:01:00Z", 1, null, null);
  const checkpoint = db.query(`INSERT INTO worker_checkpoints VALUES (?, ?, ?, ?, ?, ?, ?)`);
  checkpoint.run("cp-2", "improve", 2, "2026-01-01T00:00:20Z", 20, 0, JSON.stringify({ note: "kept" }));
  checkpoint.run("cp-1", "improve", 1, "2026-01-01T00:00:10Z", 12, 0, null);
  checkpoint.run("cp-exact", "exact", 1, "2026-01-02T00:00:10Z", 100, 1, null);
  checkpoint.run("cp-unmapped", "unmapped", 1, "2026-01-04T00:00:10Z", 2, 0, null);
  db.run("INSERT INTO checkpoint_items VALUES ('item-a', 'cp-2', 'claim-a', 'merged', 'done')");
  db.close();
  return path;
}

function seedTargets(store: ReturnType<typeof openKnowledgeStore>): void {
  insertEntitiesIfMissing(store, [
    { id: "translation_unit:src/unit.c", kind: "translation_unit", locator: "src/unit.c" },
  ]);
  insertTargets(store, [
    { id: "target:function:unit:Func", kind: "function", unit: "unit", unitEntityId: "translation_unit:src/unit.c", symbol: "Func", stableKey: "unit:Func", address: "0x80000000", identityStatus: "current", reportRevision: "r1" },
    { id: "target:function:unit:Exact", kind: "function", unit: "unit", unitEntityId: "translation_unit:src/unit.c", symbol: "Exact", stableKey: "unit:Exact", address: "0x80000004", identityStatus: "current", reportRevision: "r1" },
  ]);
}

describe("importAttempts", () => {
  test("generates ids that round-trip through attempt locators", () => {
    const dir = mkdtempSync(join(tmpdir(), "knowledge-attempt-locators-"));
    dirs.push(dir);
    const sourcePath = fixture(dir);
    const store = openKnowledgeStore({ knowledgeRoot: join(dir, "knowledge") });
    seedTargets(store);
    importAttempts(store, { orchestratorDbPath: sourcePath });
    const rows = store.db.query<{ id: string }, []>("SELECT id FROM worker_run ORDER BY id").all();

    expect(rows.length).toBeGreaterThan(0);
    for (const { id } of rows) {
      const locator = `attempt://run/${id}`;
      const parsed = parseLocator(locator, "attempt") as AttemptLocator;
      expect(parsed.runId).toBe(id);
      expect(formatLocator(parsed)).toBe(locator);
    }

    store.close();
  });

  test("imports terminal attempts mechanically, stays idempotent, and never changes the source", () => {
    const dir = mkdtempSync(join(tmpdir(), "knowledge-attempts-"));
    dirs.push(dir);
    const sourcePath = fixture(dir);
    const before = readFileSync(sourcePath);
    const store = openKnowledgeStore({ knowledgeRoot: join(dir, "knowledge") });
    seedTargets(store);

    const result = importAttempts(store, { orchestratorDbPath: sourcePath, now: () => "2026-02-01T00:00:00Z" });
    expect(result).toEqual({ inserted: 6, skipped: 2, tasksEnqueued: 0, runs: 3, submissions: 3, skippedNoTarget: 1, skippedNoSignal: 1, watermark: '{"last_worker_state_id":"timeout"}' });
    const runs = store.db.query("SELECT * FROM worker_run ORDER BY worker_state_id").all() as Record<string, unknown>[];
    expect(runs.map((row) => [row.id, row.worker_state_id, row.run_id, row.final_outcome, row.error_type, row.integration, row.baseline])).toEqual([
      ["run:exact", "exact", "source-exact", "match", null, null, '{"score":50}'],
      ["run:improve", "improve", "source-run", "improvement", null, "integrated", '{"score":10}'],
      ["run:timeout", "timeout", "source-timeout", "error", "timeout", null, '{"score":null}'],
    ]);
    expect(runs.find((row) => row.worker_state_id === "timeout")?.closed_at).toBe("2026-02-01T00:00:00Z");
    const submissions = store.db.query("SELECT id, seq, description, hypothesis, score, runtime_ref FROM submission ORDER BY id").all();
    expect(submissions).toEqual([
      { id: "run:exact:sub:1", seq: 1, description: "checkpoint 1 scored 100", hypothesis: null, score: 100, runtime_ref: "cp-exact" },
      { id: "run:improve:sub:1", seq: 1, description: "checkpoint 1 scored 12", hypothesis: null, score: 12, runtime_ref: "cp-1" },
      { id: "run:improve:sub:2", seq: 2, description: "checkpoint 2 scored 20: kept", hypothesis: null, score: 20, runtime_ref: "cp-2" },
    ]);
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM index_task").get()?.count).toBe(0);
    expect(importAttempts(store, { orchestratorDbPath: sourcePath })).toMatchObject({ inserted: 0, runs: 0, submissions: 0 });
    expect(readFileSync(sourcePath)).toEqual(before);
    store.close();
  });

  test("dry run returns counts without writing runs or a watermark", () => {
    const dir = mkdtempSync(join(tmpdir(), "knowledge-attempts-dry-"));
    dirs.push(dir);
    const sourcePath = fixture(dir);
    const store = openKnowledgeStore({ knowledgeRoot: join(dir, "knowledge") });
    seedTargets(store);
    expect(importAttempts(store, { orchestratorDbPath: sourcePath, dryRun: true })).toMatchObject({ inserted: 6, runs: 3, submissions: 3 });
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM worker_run").get()?.count).toBe(0);
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM source_watermark").get()?.count).toBe(0);
    store.close();
  });
});
