import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLocator, parseLocator, type AttemptLocator } from "../locator.js";
import { insertEntitiesIfMissing, insertTargets } from "../records/index.js";
import { openKnowledgeStore } from "../storage/store.js";
import { deriveWorkerRunIntegration, importAttempts, type AttemptSourceIntegration } from "./attempts.js";

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

function integrationRow(
  overrides: Partial<AttemptSourceIntegration> = {},
): AttemptSourceIntegration {
  return {
    id: "integration-a",
    status: "applied",
    disposition: "landed",
    conflict_paths_json: "[]",
    failure_reasons_json: "[]",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    resolved_at: null,
    ...overrides,
  };
}

describe("deriveWorkerRunIntegration", () => {
  test("returns null detail when no integration row exists", () => {
    expect(deriveWorkerRunIntegration([])).toEqual({ integration: null, detail: null });
  });

  test("classifies a clean applied row as integrated and parses its detail", () => {
    expect(deriveWorkerRunIntegration([integrationRow()])).toEqual({
      integration: "integrated",
      detail: {
        status: "applied",
        disposition: "landed",
        conflict_paths: [],
        failure_reasons: [],
        resolved_at: null,
      },
    });
  });

  test("classifies conflict paths, resolved or dropped status, and failures as conflicted", () => {
    expect(deriveWorkerRunIntegration([
      integrationRow({ conflict_paths_json: '["src/a.c"]' }),
    ])).toMatchObject({ integration: "conflicted", detail: { conflict_paths: ["src/a.c"] } });
    expect(deriveWorkerRunIntegration([
      integrationRow({ status: "resolved", resolved_at: "2026-01-02T00:00:00Z" }),
    ])).toMatchObject({ integration: "conflicted", detail: { status: "resolved" } });
    expect(deriveWorkerRunIntegration([
      integrationRow({ status: "dropped" }),
    ])).toMatchObject({ integration: "conflicted", detail: { status: "dropped" } });
    expect(deriveWorkerRunIntegration([
      integrationRow({ failure_reasons_json: '["apply failed"]' }),
    ])).toMatchObject({ integration: "conflicted", detail: { failure_reasons: ["apply failed"] } });
  });

  test("extracts and deduplicates file paths from git apply failures", () => {
    const failureReasons = [
      "git apply --check exited 1: error: patch failed: src/melee/ft/ftcoll.c:163\nerror: src/melee/ft/ftcoll.c: patch does not apply",
      "error: src/melee/ft/ftcommon.c: patch does not apply",
    ];

    expect(deriveWorkerRunIntegration([
      integrationRow({
        conflict_paths_json: '["patch failed","src/melee/ft/ftcoll.c"]',
        failure_reasons_json: JSON.stringify(failureReasons),
      }),
    ])).toMatchObject({
      integration: "conflicted",
      detail: {
        conflict_paths: ["src/melee/ft/ftcoll.c", "src/melee/ft/ftcommon.c"],
        failure_reasons: failureReasons,
      },
    });
  });

  test("keeps neutral row detail and treats invalid array JSON as empty", () => {
    expect(deriveWorkerRunIntegration([
      integrationRow({ status: "skipped", conflict_paths_json: "bad", failure_reasons_json: '{}' }),
    ])).toEqual({
      integration: null,
      detail: {
        status: "skipped",
        disposition: "landed",
        conflict_paths: [],
        failure_reasons: [],
        resolved_at: null,
      },
    });
  });

  test("chooses by conflict precedence, then updated_at, created_at, and id descending", () => {
    const rows = [
      integrationRow({ id: "neutral-newest", status: "skipped", updated_at: "2026-01-05T00:00:00Z" }),
      integrationRow({ id: "older-update", status: "resolved", disposition: "wrong-updated", updated_at: "2026-01-03T00:00:00Z", created_at: "2026-01-09T00:00:00Z" }),
      integrationRow({ id: "older-created", status: "resolved", disposition: "wrong-created", updated_at: "2026-01-04T00:00:00Z", created_at: "2026-01-02T00:00:00Z" }),
      integrationRow({ id: "a", status: "resolved", disposition: "wrong-id", updated_at: "2026-01-04T00:00:00Z", created_at: "2026-01-03T00:00:00Z" }),
      integrationRow({ id: "z", status: "resolved", disposition: "chosen", updated_at: "2026-01-04T00:00:00Z", created_at: "2026-01-03T00:00:00Z" }),
    ];

    expect(deriveWorkerRunIntegration(rows)).toMatchObject({
      integration: "conflicted",
      detail: { disposition: "chosen" },
    });
    expect(deriveWorkerRunIntegration([...rows].reverse())).toMatchObject({
      integration: "conflicted",
      detail: { disposition: "chosen" },
    });
  });
});

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

  test("backfills integration columns on an existing worker run", () => {
    const dir = mkdtempSync(join(tmpdir(), "knowledge-attempts-backfill-"));
    dirs.push(dir);
    const sourcePath = fixture(dir);
    const store = openKnowledgeStore({ knowledgeRoot: join(dir, "knowledge") });
    seedTargets(store);
    importAttempts(store, { orchestratorDbPath: sourcePath });
    store.db.run("UPDATE worker_run SET integration = NULL, integration_detail = NULL WHERE worker_state_id = 'improve'");

    const source = new Database(sourcePath);
    source.run(`CREATE TABLE worker_output_integrations (
      id TEXT PRIMARY KEY, worker_state_id TEXT NOT NULL, status TEXT NOT NULL,
      disposition TEXT, conflict_paths_json TEXT, failure_reasons_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT)`);
    source.run(`CREATE TABLE integration_outcomes (
      id TEXT PRIMARY KEY, worker_state_id TEXT NOT NULL, status TEXT NOT NULL,
      disposition TEXT, conflict_paths_json TEXT, failure_reasons_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT)`);
    source.run(`INSERT INTO integration_outcomes VALUES
      ('legacy-outcome', 'improve', 'applied', 'landed', '[]', '[]',
       '2026-01-01T00:04:00Z', '2026-01-01T00:04:00Z', NULL)`);
    source.query(`INSERT INTO worker_output_integrations
      (id, worker_state_id, status, disposition, conflict_paths_json, failure_reasons_json, created_at, updated_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "outcome-improve", "improve", "resolved", "resolver-applied", '["src/unit.c"]', "[]",
      "2026-01-01T00:02:00Z", "2026-01-01T00:03:00Z", "2026-01-01T00:03:00Z",
    );
    source.close();

    expect(importAttempts(store, { orchestratorDbPath: sourcePath })).toMatchObject({
      inserted: 0,
      runs: 0,
      submissions: 0,
    });
    const row = store.db.query<{ integration: string | null; integration_detail: string | null }, []>(
      "SELECT integration, integration_detail FROM worker_run WHERE worker_state_id = 'improve'",
    ).get();
    expect(row?.integration).toBe("conflicted");
    expect(JSON.parse(row?.integration_detail ?? "null")).toEqual({
      status: "resolved",
      disposition: "resolver-applied",
      conflict_paths: ["src/unit.c"],
      failure_reasons: [],
      resolved_at: "2026-01-01T00:03:00Z",
    });
    store.close();
  });
});
