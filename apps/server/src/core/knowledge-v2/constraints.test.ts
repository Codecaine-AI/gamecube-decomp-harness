import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  advanceWatermark,
  clearFact,
  openKnowledgeStore,
  writeFactWithEvidence,
  type KnowledgeStore,
} from "./index.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openStore(): KnowledgeStore {
  const dir = mkdtempSync(join(tmpdir(), "knowledge-v2-constraints-"));
  tempDirs.push(dir);
  const store = openKnowledgeStore({ knowledgeRoot: dir });
  stores.push(store);
  return store;
}

function seedTranslationUnit(store: KnowledgeStore, id = "translation-unit-1"): void {
  store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, 'translation_unit', ?, NULL, 'active', NULL)`)
    .run(id, `src/${id}.c`);
}

function seedFunction(
  store: KnowledgeStore,
  id = "function-1",
  unitEntityId = "translation-unit-1",
): void {
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', 'unit-1', ?, ?, ?, '0x80001000', 'current', 'rev-1')`)
    .run(id, unitEntityId, id, `unit-1:${id}`);
}

function seedEntity(store: KnowledgeStore, id = "entity-1"): void {
  store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, 'game_concept', ?, NULL, 'active', NULL)`).run(id, `concept://${id}`);
}

function insertFact(store: KnowledgeStore, id: string, targetId: string | null, entityId: string | null, type = "purpose"): void {
  store.db.query(`INSERT INTO fact
    (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
    VALUES (?, ?, ?, ?, 'value', 'reason', 0.8, '2026-01-01T00:00:00.000Z')`)
    .run(id, targetId, entityId, type);
}

describe("knowledge-v2 schema constraints", () => {
  test("fact subject XOR, uniqueness, and overwrite behavior", () => {
    const store = openStore();
    seedTranslationUnit(store);
    seedFunction(store);
    seedEntity(store);

    expect(() => insertFact(store, "fact-both", "function-1", "entity-1")).toThrow();
    expect(() => insertFact(store, "fact-neither", null, null)).toThrow();

    insertFact(store, "fact-1", "function-1", null);
    expect(() => insertFact(store, "fact-2", "function-1", null)).toThrow();
    writeFactWithEvidence(store, {
      id: "ignored-replacement-id",
      targetId: "function-1",
      type: "purpose",
      value: "replacement",
      rationale: "new reason",
      confidence: 0.9,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }, [{
      id: "evidence-new",
      kind: "pr",
      locator: "pr://12",
      why: "documents the replacement",
      capturedAt: "2026-01-02T00:00:00.000Z",
    }]);

    expect(store.db.query("SELECT id, value FROM fact WHERE target_id = 'function-1'").get()).toEqual({
      id: "fact-1",
      value: "replacement",
    });
    expect(store.db.query("SELECT id, fact_id FROM evidence").all()).toEqual([
      { id: "evidence-new", fact_id: "fact-1" },
    ]);
  });

  test("clearing a fact cascades to evidence", () => {
    const store = openStore();
    seedTranslationUnit(store);
    seedFunction(store);
    insertFact(store, "fact-1", "function-1", null);
    store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at)
      VALUES ('evidence-1', 'fact-1', 'wiki', 'wiki://page', NULL, 'source', '2026-01-01T00:00:00.000Z')`).run();

    expect(clearFact(store, { targetId: "function-1" }, "purpose")).toBe(true);
    expect(store.db.query("SELECT id FROM evidence").all()).toEqual([]);
  });

  test("link endpoint XOR and source digest constraints", () => {
    const store = openStore();
    seedTranslationUnit(store);
    seedFunction(store);
    seedEntity(store);
    insertFact(store, "fact-1", "function-1", null);
    const insertLink = store.db.query(`INSERT INTO link
      (id, from_target_id, from_entity_id, to_target_id, to_entity_id, role, why, kind, locator, digest)
      VALUES (?, ?, ?, ?, ?, 'related', 'reason', ?, 'source://1', ?)`);

    expect(() => insertLink.run("from-both", "function-1", "entity-1", "function-1", null, "pr", null)).toThrow();
    expect(() => insertLink.run("from-neither", null, null, "function-1", null, "pr", null)).toThrow();
    expect(() => insertLink.run("to-both", "function-1", null, "function-1", "entity-1", "pr", null)).toThrow();
    expect(() => insertLink.run("to-neither", "function-1", null, null, null, "pr", null)).toThrow();
    expect(() => insertLink.run("code-no-digest", "function-1", null, null, "entity-1", "code", null)).toThrow();
    expect(() => insertLink.run("pr-with-digest", "function-1", null, null, "entity-1", "pr", "sha256:x")).toThrow();
    expect(() => store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at)
      VALUES ('code-no-digest', 'fact-1', 'code', 'code://rev/file.c#L1-L1', NULL, 'reason', '2026-01-01')`).run()).toThrow();
    expect(() => store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at)
      VALUES ('wiki-with-digest', 'fact-1', 'wiki', 'wiki://page', 'sha256:x', 'reason', '2026-01-01')`).run()).toThrow();

    insertLink.run("valid-code", "function-1", null, null, "entity-1", "code", "sha256:x");
    store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at)
      VALUES ('valid-code', 'fact-1', 'code', 'code://rev/file.c#L1-L1', 'sha256:x', 'reason', '2026-01-01')`).run();
  });

  test("event cause is present exactly for regressions", () => {
    const store = openStore();
    seedTranslationUnit(store);
    seedFunction(store);
    const insert = store.db.query(`INSERT INTO event
      (id, target_id, kind, cause, summary, created_at) VALUES (?, 'function-1', ?, ?, 'summary', '2026-01-01')`);

    expect(() => insert.run("regression-no-cause", "regression", null)).toThrow();
    expect(() => insert.run("note-with-cause", "note", "upstream_change")).toThrow();
    insert.run("regression-valid", "regression", "merge_conflict");
    insert.run("note-valid", "note", null);
  });

  test("worker run error fields and integration enum", () => {
    const store = openStore();
    seedTranslationUnit(store);
    seedFunction(store);
    const insert = store.db.query(`INSERT INTO worker_run
      (id, target_id, goal, baseline, final_outcome, error_type, integration, started_at, closed_at)
      VALUES (?, 'function-1', 'goal', '{}', ?, ?, ?, '2026-01-01', '2026-01-02')`);

    expect(() => insert.run("error-no-type", "error", null, null)).toThrow();
    expect(() => insert.run("match-with-type", "match", "timeout", null)).toThrow();
    expect(() => insert.run("bad-integration", "match", null, "pending")).toThrow();
    insert.run("null-integration", "match", null, null);
    insert.run("integrated", "improvement", null, "integrated");
    insert.run("conflicted", "no_change", null, "conflicted");
    insert.run("valid-error", "error", "worker_crash", null);
  });

  test("target kind shapes and target status one-to-one relationship", () => {
    const store = openStore();
    seedTranslationUnit(store);
    const insertTarget = store.db.query(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
      VALUES (?, ?, 'unit-1', ?, ?, ?, ?, 'current', 'rev-1')`);

    expect(() => insertTarget.run("unit-kind", "unit", "translation-unit-1", "symbol", "bad:unit", "0x1")).toThrow();
    expect(() => insertTarget.run("function-no-unit", "function", null, "f1", "bad:f1", "0x1")).toThrow();
    expect(() => insertTarget.run("function-orphan-unit", "function", "missing", "f2", "bad:f2", "0x2")).toThrow();
    expect(() => insertTarget.run("function-no-symbol", "function", "translation-unit-1", null, "bad:f3", "0x3")).toThrow();
    expect(() => insertTarget.run("function-no-address", "function", "translation-unit-1", "f4", "bad:f4", null)).toThrow();
    expect(() => insertTarget.run("data-no-symbol", "data", "translation-unit-1", null, "bad:d1", "0x5")).toThrow();
    expect(() => insertTarget.run("data-no-address", "data", "translation-unit-1", "d2", "bad:d2", null)).toThrow();

    seedFunction(store);
    insertTarget.run("data-1", "data", "translation-unit-1", ".data", "unit-1:.data", "0x80002000");
    const insertStatus = store.db.query(`INSERT INTO target_status
      (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
      VALUES ('function-1', ?, 1, 100, NULL, 'rev-1', '2026-01-01')`);
    insertStatus.run(50);
    expect(() => insertStatus.run(75)).toThrow();
  });

  test("entity kind accepts translation units and rejects files", () => {
    const store = openStore();
    const insert = store.db.query(`INSERT INTO entity
      (id, kind, locator, identity_status) VALUES (?, ?, ?, 'active')`);

    insert.run("translation-unit-1", "translation_unit", "src/melee/ft/ftcommon.c");
    expect(() => insert.run("file-1", "file", "src/melee/ft/ftcommon.c")).toThrow();
  });

  test("pull request subject requires exactly one target or entity", () => {
    const store = openStore();
    seedTranslationUnit(store);
    seedFunction(store);
    const insert = store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES (?, ?, ?, 'pr://42', 'summary', 'improvement', '2026-01-01')`);

    expect(() => insert.run("both-null", null, null)).toThrow();
    expect(() => insert.run("both-set", "function-1", "translation-unit-1")).toThrow();
    insert.run("target-only", "function-1", null);
    insert.run("entity-only", null, "translation-unit-1");

    expect(store.db.query("SELECT id FROM pull_request ORDER BY id").all()).toEqual([
      { id: "entity-only" },
      { id: "target-only" },
    ]);
  });

  test("subject index state XOR, uniqueness, and index task timestamp-only state", () => {
    const store = openStore();
    seedTranslationUnit(store);
    seedFunction(store);
    seedEntity(store);
    const insert = store.db.query(`INSERT INTO subject_index_state
      (target_id, entity_id, indexed_at) VALUES (?, ?, '2026-01-01')`);

    expect(() => insert.run("function-1", "entity-1")).toThrow();
    expect(() => insert.run(null, null)).toThrow();
    insert.run("function-1", null);
    expect(() => insert.run("function-1", null)).toThrow();
    insert.run(null, "entity-1");
    expect(() => insert.run(null, "entity-1")).toThrow();

    const columns = store.db.query<{ name: string }, []>("PRAGMA table_info(index_task)").all().map((column) => column.name);
    expect(columns).not.toContain("status");
    expect(columns).toEqual(["id", "pathway", "payload", "enqueued_at", "started_at", "done_at"]);
  });

  test("wiki revision uniqueness and watermark upsert", () => {
    const store = openStore();
    const insertWiki = store.db.query(`INSERT INTO wiki_section
      (id, page, section, mirror_revision, content, ingested_at)
      VALUES (?, 'Page', 'Intro', 'rev-1', ?, '2026-01-01')`);
    insertWiki.run("wiki-1", "first");
    expect(() => insertWiki.run("wiki-2", "duplicate tuple")).toThrow();

    advanceWatermark(store, "wiki", "rev-1");
    advanceWatermark(store, "wiki", "rev-2");
    expect(store.db.query("SELECT source, position FROM source_watermark").all()).toEqual([
      { source: "wiki", position: "rev-2" },
    ]);
  });
});
