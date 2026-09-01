import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openKnowledgeStore, writeFactWithEvidence, type KnowledgeStore } from "@server/core/knowledge-v2/index.js";
import { buildWorkerKnowledgeContext } from "./worker-cycle.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

function addTargetWithFact(root: string): KnowledgeStore {
  const store = openKnowledgeStore({ knowledgeRoot: root });
  stores.push(store);
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES ('unit-entity', 'translation_unit', 'src/test.c', 'active')`).run();
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES ('target', 'function', 'GALE01:test', 'unit-entity', 'test_symbol',
      'GALE01:test:test_symbol', '0x80000000', 'current', 'rev')`).run();
  writeFactWithEvidence(store, {
    id: "fact", targetId: "target", type: "purpose", value: "Fixture purpose",
    rationale: "Fixture rationale", confidence: 0.9,
  }, []);
  return store;
}

describe("buildWorkerKnowledgeContext knowledge-v2 injection", () => {
  test("keeps the graph-missing result byte-identical when no v2 database exists", () => {
    const previous = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    try {
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = tempRoot("worker-knowledge-empty-");
      const graphDb = resolve(tempRoot("worker-knowledge-graph-"), "missing.sqlite");
      const baseline = buildWorkerKnowledgeContext("src/test.c", graphDb);
      const withV2 = buildWorkerKnowledgeContext("src/test.c", graphDb, {
        unit: "GALE01:test", symbol: "test_symbol", gameId: "melee",
      });
      expect(JSON.stringify(withV2)).toBe(JSON.stringify(baseline));
    } finally {
      if (previous === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previous;
    }
  });

  test("adds a v2 card to the graph-missing branch when a fact exists", () => {
    const previous = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    try {
      const root = tempRoot("worker-knowledge-card-");
      addTargetWithFact(root);
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = root;
      const result = buildWorkerKnowledgeContext(
        "src/test.c",
        resolve(tempRoot("worker-knowledge-graph-"), "missing.sqlite"),
        { unit: "GALE01:test", symbol: "test_symbol", gameId: "melee" },
      );
      expect(result.status).toBe("graph_missing");
      expect(result.knowledge_card_v2).toBeDefined();
    } finally {
      if (previous === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previous;
    }
  });
});
