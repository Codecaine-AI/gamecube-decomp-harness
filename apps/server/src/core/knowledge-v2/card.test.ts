import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  insertEvent,
  insertWorkerRun,
  openKnowledgeStore,
  writeFactWithEvidence,
  type KnowledgeStore,
} from "./index.js";
import { buildV2TargetCard, loadV2TargetCard, targetKnowledgeCardV2Xml } from "./card.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): KnowledgeStore {
  const root = mkdtempSync(join(tmpdir(), "knowledge-v2-card-"));
  tempDirs.push(root);
  const store = openKnowledgeStore({ knowledgeRoot: root });
  stores.push(store);
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES ('unit', 'translation_unit', 'src/test.c', 'active')`).run();
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES ('target', 'function', 'GALE01:test', 'unit', 'test_symbol',
      'GALE01:test:test_symbol', '0x80000000', 'current', 'rev')`).run();
  return store;
}

function addFact(store: KnowledgeStore, targetId = "target", type: "purpose" | "inferred_name" = "purpose", value = "Does work", confidence = 0.8) {
  writeFactWithEvidence(store, {
    id: `fact-${targetId}-${type}`,
    targetId,
    type,
    value,
    rationale: "Fixture evidence",
    confidence,
  }, []);
}

function addRun(store: KnowledgeStore, index: number) {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  insertWorkerRun(store, {
    id: `run-${index}`,
    targetId: "target",
    goal: "Improve",
    baseline: "{}",
    finalOutcome: index % 2 ? "improvement" : "no_change",
    integration: index % 2 ? "integrated" : null,
    startedAt: timestamp,
    closedAt: timestamp,
  }, [{ id: `submission-${index}`, seq: 1, description: `Try ${index}`, score: index, submittedAt: timestamp }]);
}

function addLinks(store: KnowledgeStore, count: number) {
  const insertEntity = store.db.query("INSERT INTO entity (id, kind, locator, identity_status) VALUES (?, 'game_concept', ?, 'active')");
  const insertLink = store.db.query(`INSERT INTO link
    (id, from_target_id, to_entity_id, role, why, kind, locator, digest)
    VALUES (?, 'target', ?, 'related', 'Fixture link', 'code', ?, 'sha256:fixture')`);
  for (let index = 0; index < count; index += 1) {
    const id = `entity-${index}`;
    insertEntity.run(id, `concept://${index}`);
    insertLink.run(`link-${String(index).padStart(2, "0")}`, id, `code://link/${index}`);
    writeFactWithEvidence(store, {
      id: `linked-fact-${index}`,
      entityId: id,
      type: index === 0 ? "inferred_name" : "purpose",
      value: index === 0 ? "LinkedGuess" : `Linked fact ${index}`,
      rationale: "Linked rationale",
      confidence: 0.5,
    }, []);
  }
}

describe("knowledge-v2 target cards", () => {
  test("keeps card and XML section order and marks inferred names as guesses", () => {
    const store = fixture();
    addFact(store, "target", "inferred_name", "SomeName", 0.6);
    addLinks(store, 1);

    const card = buildV2TargetCard(store, "GALE01:test:test_symbol", "full");
    expect(card).not.toBeNull();
    expect(Object.keys(card!)).toEqual(["stable_key", "target", "context_budget", "ledger", "status", "facts", "links"]);
    expect(card!.facts.naming_note).toContain("target.symbol column is the only name");
    expect(card!.target.source_path).toBe("src/test.c");
    expect(card!.facts.by_type.inferred_name?.value).toBe("guess: SomeName (confidence 0.6)");
    expect(typeof card!.facts.by_type.inferred_name?.confidence).toBe("number");
    expect(card!.links[0]?.facts[0]).toMatchObject({ value: "guess: LinkedGuess (confidence 0.5)", confidence: 0.5 });

    const xml = targetKnowledgeCardV2Xml(card!);
    const ledger = xml.indexOf('"ledger"');
    expect(ledger).toBeLessThan(xml.indexOf('"status"'));
    expect(ledger).toBeLessThan(xml.indexOf('"facts"'));
    expect(ledger).toBeLessThan(xml.indexOf('"links"'));
  });

  test("caps ledger entries, links, and linked facts by budget", () => {
    const store = fixture();
    addFact(store);
    for (let index = 0; index < 22; index += 1) addRun(store, index);
    addLinks(store, 10);

    const full = buildV2TargetCard(store, "GALE01:test:test_symbol", "full")!;
    const compact = buildV2TargetCard(store, "GALE01:test:test_symbol", "compact")!;
    const minimal = buildV2TargetCard(store, "GALE01:test:test_symbol", "minimal")!;
    expect([full.ledger.entries.length, compact.ledger.entries.length, minimal.ledger.entries.length]).toEqual([20, 8, 3]);
    expect([full.links.length, compact.links.length, minimal.links.length]).toEqual([8, 4, 2]);
    expect(full.links.every((link) => link.facts.length <= 3)).toBe(true);
    expect(compact.links.every((link) => link.facts.length <= 1)).toBe(true);
    expect(minimal.links.every((link) => link.facts.length === 0)).toBe(true);
    for (const fact of Object.values(full.facts.by_type)) expect(typeof fact?.confidence).toBe("number");
    for (const link of full.links) for (const fact of link.facts) expect(typeof fact.confidence).toBe("number");
  });

  test("summarizes runs and flags regression events", () => {
    const store = fixture();
    addRun(store, 1);
    insertEvent(store, {
      id: "regression", targetId: "target", kind: "regression", cause: "upstream_change",
      summary: "Match dropped", createdAt: "2026-02-01T00:00:00.000Z",
    }, []);
    const card = buildV2TargetCard(store, "GALE01:test:test_symbol", "full")!;
    expect(card.ledger.regression_count).toBeGreaterThanOrEqual(1);
    expect(card.ledger.entries[0]).toMatchObject({ type: "event", regression: true });
    expect(card.ledger.runs).toEqual([{ final_outcome: "improvement", integration: "integrated", submission_count: 1, best_score: 1 }]);
  });

  test("includes at most ten conflict paths for conflicted submissions", () => {
    const store = fixture();
    addRun(store, 1);
    const conflictPaths = Array.from({ length: 12 }, (_, index) => `src/conflict-${index}.c`);
    store.db.query("UPDATE worker_run SET integration = 'conflicted', integration_detail = ? WHERE id = 'run-1'").run(JSON.stringify({
      status: "resolved",
      disposition: "conflict",
      conflict_paths: conflictPaths,
      failure_reasons: [],
      resolved_at: "2026-01-01T00:02:00.000Z",
    }));

    const card = buildV2TargetCard(store, "GALE01:test:test_symbol", "full")!;

    expect(card.ledger.entries).toContainEqual({
      type: "submission",
      seq: 1,
      description: "Try 1",
      score: 1,
      run_outcome: "improvement",
      integration: "conflicted",
      conflict_paths: conflictPaths.slice(0, 10),
    });
  });

  test("labels translation-unit pull requests as unit-attributed", () => {
    const store = fixture();
    store.db.query(`INSERT INTO pull_request
      (id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('unit-pr', 'unit', '#812', 'Touched the translation unit', 'improvement',
        '2026-02-02T00:00:00.000Z')`).run();

    const card = buildV2TargetCard(store, "GALE01:test:test_symbol", "full")!;
    expect(card.ledger.entries).toContainEqual({
      type: "pull_request",
      pr_ref: "#812",
      outcome: "improvement",
      attribution: "unit",
      summary: "Touched the translation unit",
    });
  });

  test("gates cards on facts or ledger rows", () => {
    const store = fixture();
    addLinks(store, 1);
    expect(buildV2TargetCard(store, "missing", "full")).toBeNull();
    expect(buildV2TargetCard(store, "GALE01:test:test_symbol", "full")).toBeNull();
    addFact(store);
    expect(buildV2TargetCard(store, "GALE01:test:test_symbol", "full")).not.toBeNull();
  });

  test("loads existing databases without creating missing files and absorbs corrupt databases", () => {
    const previous = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    const emptyRoot = mkdtempSync(join(tmpdir(), "knowledge-v2-card-empty-"));
    tempDirs.push(emptyRoot);
    try {
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = emptyRoot;
      const missingPath = resolve(emptyRoot, "knowledge.sqlite");
      expect(loadV2TargetCard({ unit: "GALE01:test", symbol: "test_symbol", budget: "full" })).toBeNull();
      expect(existsSync(missingPath)).toBe(false);

      const store = fixture();
      addFact(store);
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = resolve(store.path, "..");
      expect(loadV2TargetCard({ unit: "GALE01:test", symbol: "test_symbol", budget: "full" })?.stable_key).toBe("GALE01:test:test_symbol");

      const corruptRoot = mkdtempSync(join(tmpdir(), "knowledge-v2-card-corrupt-"));
      tempDirs.push(corruptRoot);
      writeFileSync(resolve(corruptRoot, "knowledge.sqlite"), "not sqlite");
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = corruptRoot;
      expect(() => loadV2TargetCard({ unit: "GALE01:test", budget: "full" })).not.toThrow();
      expect(loadV2TargetCard({ unit: "GALE01:test", budget: "full" })).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previous;
    }
  });
});
