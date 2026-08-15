import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knowledgeToolRegistrations } from "../../tools/wrappers/knowledge.js";
import { fileEntityId, functionEntityId, unitEntityId } from "./builders/code-graph.js";
import { insertGraphRecords, openKnowledgeGraph, upsertSourceDescriptor } from "./db.js";
import { fileGraphCard } from "./queries/file-card.js";
import { relatedFunctions } from "./queries/related-functions.js";
import { searchKnowledgeGraph } from "./storage/search.js";
import type { GraphRecords, SourceDescriptor } from "./types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("graph query parity", () => {
  test("file cards and structured queries expose opseq and callgraph relationships", () => {
    const store = fixtureStore();
    try {
      insertGraphRecords(store, codeGraphRecords());
      insertGraphRecords(store, relationshipRecords());

      const card = fileGraphCard(store, "src/target.c");
      expect(card.callers).toEqual([
        expect.objectContaining({ source_symbol: "TargetFn", symbol: "CallerFn", entity_id: functionEntityId("unit/caller", "CallerFn"), count: 2 }),
      ]);
      expect(card.callees).toEqual([
        expect.objectContaining({ source_symbol: "TargetFn", symbol: "ReferenceFn", entity_id: functionEntityId("unit/ref", "ReferenceFn"), count: 3 }),
        expect.objectContaining({ source_symbol: "TargetFn", symbol: "ExternalFn", entity_id: null, resolved: false }),
      ]);
      expect(card.data_references).toEqual([
        expect.objectContaining({ source_symbol: "TargetFn", symbol: "FunctionTableFn", entity_id: functionEntityId("unit/data", "FunctionTableFn") }),
      ]);

      const result = relatedFunctions(store, { sourcePath: "src/target.c", symbol: "TargetFn" });
      expect(result.resolved_function_count).toBe(1);
      expect(result.functions[0]?.opseq_analogs[0]).toMatchObject({
        entity_id: functionEntityId("unit/ref", "ReferenceFn"),
        symbol: "ReferenceFn",
        score: 0.94,
      });
      expect(result.functions[0]?.callers[0]).toMatchObject({ symbol: "CallerFn", weight: 0.75, evidence_ref: "callgraph:calls#caller" });
      expect(result.functions[0]?.callees[0]).toMatchObject({ symbol: "ReferenceFn", weight: 1, evidence_ref: "callgraph:calls#target" });
      expect(result.functions[0]?.data_references[0]).toMatchObject({ symbol: "FunctionTableFn", weight: 0.5, evidence_ref: "callgraph:data#target" });

      const byEntity = relatedFunctions(store, { entityId: functionEntityId("unit/target", "TargetFn") });
      expect(byEntity.functions[0]?.function).toMatchObject({ unit: "unit/target", symbol: "TargetFn", source_path: "src/target.c" });

      const edgeOnly = relatedFunctions(store, { entityId: functionEntityId("unit/ref", "ReferenceFn") });
      expect(edgeOnly.functions[0]?.callers).toEqual([
        expect.objectContaining({ entity_id: functionEntityId("unit/target", "TargetFn"), symbol: "TargetFn", evidence_ref: "callgraph:calls#target" }),
      ]);
    } finally {
      store.db.close();
    }
  });

  test("all-source graph search excludes explicitly inactive sources", async () => {
    const store = fixtureStore();
    const dbPath = store.path;
    try {
      upsertSourceDescriptor(store, sourceDescriptor("active_source", true));
      upsertSourceDescriptor(store, sourceDescriptor("retired_source", false));
      insertGraphRecords(store, searchRecords("active_source", "Active graph evidence for SharedSymbol"));
      insertGraphRecords(store, searchRecords("retired_source", "Retired graph evidence for SharedSymbol"));

      expect(searchKnowledgeGraph(store, { query: "SharedSymbol", limit: 10 }).map((row) => row.source_id).sort()).toEqual([
        "active_source",
        "retired_source",
      ]);
      expect(searchKnowledgeGraph(store, { query: "SharedSymbol", limit: 10, activeSourcesOnly: true }).map((row) => row.source_id)).toEqual([
        "active_source",
      ]);
    } finally {
      store.db.close();
    }

    const registration = knowledgeToolRegistrations.find((tool) => tool.id === "knowledge_graph_search");
    expect(registration).toBeDefined();
    const tool = registration!.create({ role: "worker", cwd: ".", repoRoot: ".", game: { graphDbPath: dbPath } });
    const response = await tool.execute("test", { query: "SharedSymbol", limit: 10 });
    const payload = JSON.parse(response.content[0]!.text) as Record<string, unknown>;
    expect(payload).toMatchObject({ tool: "knowledge_graph_search", status: "ok", source_id: null, active_sources_only: true });
    expect(payload.results).toEqual([expect.objectContaining({ source_id: "active_source" })]);
  });

  test("structured relationship tool validates selectors and resolves unit plus symbol", async () => {
    const store = fixtureStore();
    const dbPath = store.path;
    insertGraphRecords(store, codeGraphRecords());
    insertGraphRecords(store, relationshipRecords());
    store.db.close();

    const registration = knowledgeToolRegistrations.find((tool) => tool.id === "graph_related_functions");
    expect(registration).toBeDefined();
    const tool = registration!.create({ role: "worker", cwd: ".", repoRoot: ".", game: { graphDbPath: dbPath } });
    const missing = JSON.parse((await tool.execute("test", {})).content[0]!.text) as Record<string, unknown>;
    expect(missing.status).toBe("missing_function_selector");

    const response = await tool.execute("test", { unit: "unit/target", symbol: "TargetFn", limit: 4 });
    const payload = JSON.parse(response.content[0]!.text) as Record<string, unknown>;
    expect(payload).toMatchObject({ tool: "graph_related_functions", status: "ok", resolved_function_count: 1 });
  });
});

function fixtureStore() {
  const dir = mkdtempSync(join(tmpdir(), "graph-query-parity-"));
  tempDirs.push(dir);
  return openKnowledgeGraph(join(dir, "graph.sqlite"));
}

function codeGraphRecords(): GraphRecords {
  const sourceVersionId = "source-version:code_graph:test";
  const functions = [
    ["unit/target", "TargetFn", "src/target.c", 82],
    ["unit/ref", "ReferenceFn", "src/ref.c", 100],
    ["unit/caller", "CallerFn", "src/caller.c", 100],
    ["unit/data", "FunctionTableFn", "src/data.c", 100],
  ] as const;
  return {
    sourceVersion: { id: sourceVersionId, sourceId: "code_graph", contentHash: "code", sourcePaths: ["fixture"] },
    entities: [
      {
        id: fileEntityId("src/target.c"),
        entityType: "source_file",
        stableKey: "src/target.c",
        payload: { source_path: "src/target.c", units: ["unit/target"] },
      },
      ...functions.flatMap(([unit, symbol, sourcePath, fuzzy]) => [
        { id: unitEntityId(unit), entityType: "object_unit", stableKey: unit, payload: { unit, source_path: sourcePath } },
        {
          id: functionEntityId(unit, symbol),
          entityType: "function",
          stableKey: `${unit}:${symbol}`,
          payload: { unit, symbol, sourcePath, fuzzy, status: fuzzy === 100 ? "matched" : "unmatched" },
        },
      ]),
    ],
    facts: [
      {
        id: "fact:file:target",
        entityId: fileEntityId("src/target.c"),
        factType: "file_match_status",
        payload: { units: ["unit/target"], functions: [{ unit: "unit/target", symbol: "TargetFn", fuzzy: 82 }] },
        confidence: 1,
        trustTier: "canonical",
        evidenceRef: "fixture",
        sourceVersionId,
      },
      {
        id: "fact:editability:target",
        entityId: fileEntityId("src/target.c"),
        factType: "editability",
        payload: { mode: "editable", reason: "fixture" },
        confidence: 1,
        trustTier: "canonical",
        evidenceRef: "fixture",
        sourceVersionId,
      },
    ],
    edges: [],
    chunks: [],
  };
}

function relationshipRecords(): GraphRecords {
  const sourceVersionId = "source-version:relationships:test";
  const target = functionEntityId("unit/target", "TargetFn");
  const reference = functionEntityId("unit/ref", "ReferenceFn");
  const caller = functionEntityId("unit/caller", "CallerFn");
  const data = functionEntityId("unit/data", "FunctionTableFn");
  return {
    sourceVersion: { id: sourceVersionId, sourceId: "call_graph", contentHash: "relationships", sourcePaths: ["fixture"] },
    entities: [],
    facts: [
      {
        id: "fact:callgraph:target",
        entityId: target,
        factType: "call_graph_profile",
        payload: {
          source: { unit: "unit/target", symbol: "TargetFn", source_path: "src/target.c" },
          top_callers: [{ unit: "unit/caller", symbol: "CallerFn", source_path: "src/caller.c", count: 2, resolved: true }],
          top_callees: [
            { unit: "unit/ref", symbol: "ReferenceFn", source_path: "src/ref.c", count: 3, resolved: true },
            { symbol: "ExternalFn", count: 1, resolved: false },
          ],
          top_data_refs: [{ symbol: "FunctionTableFn", ref_kind: "function_pointer", count: 1 }],
        },
        confidence: 0.9,
        trustTier: "tool_evidence",
        evidenceRef: "callgraph:profile#target",
        sourceVersionId,
      },
      {
        id: "fact:opseq:target",
        entityId: target,
        factType: "opseq_analog_profile",
        payload: {
          source: { unit: "unit/target", symbol: "TargetFn", source_path: "src/target.c" },
          top_analogs: [
            { unit: "unit/ref", symbol: "ReferenceFn", source_path: "src/ref.c", score: 0.94, exact_match: false, matched: true },
          ],
        },
        confidence: 0.94,
        trustTier: "tool_evidence",
        evidenceRef: "opseq:target",
        sourceVersionId,
      },
    ],
    edges: [
      { id: "edge:caller", fromEntityId: caller, edgeType: "CALLS", toEntityId: target, weight: 0.75, evidenceRef: "callgraph:calls#caller", sourceVersionId },
      { id: "edge:callee", fromEntityId: target, edgeType: "CALLS", toEntityId: reference, weight: 1, evidenceRef: "callgraph:calls#target", sourceVersionId },
      { id: "edge:data", fromEntityId: target, edgeType: "REFERENCES_DATA", toEntityId: data, weight: 0.5, evidenceRef: "callgraph:data#target", sourceVersionId },
    ],
    chunks: [],
  };
}

function sourceDescriptor(id: string, active: boolean): SourceDescriptor {
  return {
    id,
    kind: "document",
    title: id,
    trust_tier: "local",
    freshness: "generated",
    active,
    data_paths: [],
    index_outputs: [],
    commands: {},
  };
}

function searchRecords(sourceId: string, text: string): GraphRecords {
  const sourceVersionId = `source-version:${sourceId}:test`;
  return {
    sourceVersion: { id: sourceVersionId, sourceId, contentHash: sourceId, sourcePaths: ["fixture"] },
    entities: [],
    facts: [],
    edges: [],
    chunks: [{ id: `chunk:${sourceId}`, sourceId, sourceVersionId, title: sourceId, text, evidenceRef: "fixture", payload: {} }],
  };
}
