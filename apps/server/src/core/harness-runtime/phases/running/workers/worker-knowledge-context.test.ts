import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openKnowledgeStore, writeFactWithEvidence, type KnowledgeStore } from "@server/core/knowledge-v2/index.js";
import { fileEntityId, functionEntityId } from "@server/core/knowledge/graph/builders/code-graph.js";
import { insertGraphRecords } from "@server/core/knowledge/graph/storage/ingest.js";
import type { GraphRecords } from "@server/core/knowledge/graph/types.js";
import { openKnowledgeGraph } from "@server/core/knowledge/graph/storage/store.js";
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
  test("injects bounded callers, callees, and score-ordered analogs from the legacy graph", () => {
    const root = tempRoot("worker-related-functions-");
    const graphDb = join(root, "graph.sqlite");
    const store = openKnowledgeGraph(graphDb);
    const targetId = functionEntityId("unit/target", "TargetFn");
    const peers = Array.from({ length: 10 }, (_, index) => index);
    const analogs = Array.from({ length: 6 }, (_, index) => ({
      unit: `unit/analog-${index}`,
      symbol: `Analog${index}`,
      fuzzy_match_percent: 70 + index,
      score: 0.99 - index * 0.1,
      exact_match: index === 5,
    }));
    const records: GraphRecords = {
      sourceVersion: { id: "source-version:worker-related", sourceId: "code_graph", contentHash: "fixture", sourcePaths: ["fixture"] },
      entities: [
        { id: fileEntityId("src/test.c"), entityType: "source_file", stableKey: "src/test.c", payload: { source_path: "src/test.c" } },
        { id: targetId, entityType: "function", stableKey: "unit/target:TargetFn", payload: { unit: "unit/target", symbol: "TargetFn", source_path: "src/test.c" } },
      ],
      facts: [
        {
          id: "fact:file:worker-related", entityId: fileEntityId("src/test.c"), factType: "file_match_status",
          payload: { functions: [{ unit: "unit/target", symbol: "TargetFn" }] }, confidence: 1, trustTier: "canonical",
          evidenceRef: "fixture", sourceVersionId: "source-version:worker-related",
        },
        {
          id: "fact:relationships:worker-related", entityId: targetId, factType: "call_graph_profile",
          payload: {
            source: { unit: "unit/target", symbol: "TargetFn" },
            top_callers: peers.map((index) => ({ unit: `unit/caller-${index}`, symbol: `Caller${index}`, resolved: index % 2 === 0 })),
            top_callees: peers.map((index) => ({ unit: `unit/callee-${index}`, symbol: `Callee${index}`, resolved: true })),
          }, confidence: 1, trustTier: "tool_evidence", evidenceRef: "fixture", sourceVersionId: "source-version:worker-related",
        },
        {
          id: "fact:analogs:worker-related", entityId: targetId, factType: "opseq_analog_profile",
          payload: { source: { unit: "unit/target", symbol: "TargetFn" }, top_analogs: analogs },
          confidence: 1, trustTier: "tool_evidence", evidenceRef: "fixture", sourceVersionId: "source-version:worker-related",
        },
      ],
      edges: [],
      chunks: [],
    };
    insertGraphRecords(store, records);
    store.db.close();

    const result = buildWorkerKnowledgeContext("src/test.c", graphDb, { unit: "unit/target", symbol: "TargetFn" });
    const related = result.related_functions as {
      callers: Array<Record<string, unknown>>;
      callees: Array<Record<string, unknown>>;
      analogs: Array<Record<string, unknown>>;
    };
    expect(related.callers).toHaveLength(8);
    expect(related.callers[0]).toEqual({ symbol: "Caller0", unit: "unit/caller-0", matched: true });
    expect(related.callers[1]).toEqual({ symbol: "Caller1", unit: "unit/caller-1", matched: false });
    expect(related.callees).toHaveLength(8);
    expect(related.analogs).toHaveLength(4);
    expect(related.analogs.map((row) => row.symbol)).toEqual(["Analog5", "Analog0", "Analog1", "Analog2"]);
    expect(related.analogs[0]).toEqual({
      symbol: "Analog5", unit: "unit/analog-5", fuzzy_match_percent: 75, score: 0.49, exact_match: true,
    });
  });

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
