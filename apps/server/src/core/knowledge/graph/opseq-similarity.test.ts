import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { insertGraphRecords, openKnowledgeGraph } from "./db.js";
import { buildOpseqSimilarityGraphRecords } from "./opseq-similarity.js";
import { fileGraphCard } from "./queries/file-card.js";
import { rankFeatureForSourcePath } from "./queries/rank.js";
import { fileEntityId, functionEntityId, unitEntityId } from "./builders/code-graph.js";
import type { GraphRecords } from "./types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("opseq similarity graph records", () => {
  test("builds ANALOGOUS_TO edges and analog profile facts from neighbor indexes", () => {
    const { repoRoot, indexesRoot } = opseqFixture();

    const records = buildOpseqSimilarityGraphRecords(repoRoot, { indexesRoot });

    expect(records).not.toBeNull();
    expect(records?.entities).toHaveLength(0);
    expect(records?.edges).toHaveLength(1);
    expect(records?.edges[0]).toMatchObject({
      edgeType: "ANALOGOUS_TO",
      weight: 0.97,
      status: "accepted",
    });
    expect(new Set([records?.edges[0]?.fromEntityId, records?.edges[0]?.toEntityId])).toEqual(
      new Set([functionEntityId("unit/a", "TargetFn"), functionEntityId("unit/b", "RefFn")]),
    );

    const targetFact = records?.facts.find((fact) => fact.entityId === functionEntityId("unit/a", "TargetFn"));
    expect(targetFact?.factType).toBe("opseq_analog_profile");
    expect(targetFact?.payload).toMatchObject({
      analog_count: 1,
      best_score: 0.97,
      best_matched_score: 0.97,
      exact_analog_count: 1,
      matched_analog_count: 1,
    });
    expect((targetFact?.payload.top_analogs as Array<Record<string, unknown>>)[0]).toMatchObject({
      symbol: "RefFn",
      score: 0.97,
      exact_match: true,
      matched: true,
    });
    expect(records?.chunks.some((chunk) => chunk.entityId === functionEntityId("unit/a", "TargetFn"))).toBe(true);
  });

  test("returns null when neighbor artifacts are absent", () => {
    const repoRoot = tempDir("opseq-repo-empty-");
    const indexesRoot = tempDir("opseq-index-empty-");
    writeReport(repoRoot);

    expect(buildOpseqSimilarityGraphRecords(repoRoot, { indexesRoot })).toBeNull();
  });

  test("rank features and file cards expose opseq analog evidence", () => {
    const { repoRoot, indexesRoot } = opseqFixture();
    const opseqRecords = buildOpseqSimilarityGraphRecords(repoRoot, { indexesRoot });
    expect(opseqRecords).not.toBeNull();

    const dbDir = tempDir("opseq-graph-db-");
    const store = openKnowledgeGraph(join(dbDir, "kg.sqlite"));
    try {
      insertGraphRecords(store, codeGraphFixtureRecords());
      insertGraphRecords(store, opseqRecords as GraphRecords);

      const feature = rankFeatureForSourcePath(store, "src/a.c", {
        source_path: "src/a.c",
        unit: "unit/a",
        symbol: "TargetFn",
      });
      expect(feature.duplicate_reference_count).toBe(1);
      expect(feature.opseq_best_analog_score).toBe(0.97);
      expect(feature.opseq_best_matched_analog_score).toBe(0.97);
      expect(feature.opseq_analog_count).toBe(1);
      expect(feature.opseq_exact_analog_count).toBe(1);
      expect(feature.opseq_matched_analog_count).toBe(1);
      expect(feature.explanation).toContain("opseq_analogs=1");
      expect(feature.explanation).toContain("opseq_best=0.970");
      expect(feature.explanation).toContain("opseq_best_matched=0.970");

      const card = fileGraphCard(store, "src/a.c");
      expect(card.tool_hits).toHaveLength(1);
      expect(card.tool_hits[0]).toMatchObject({
        tool_id: "opseq",
        source_id: "opseq_similarity",
        symbol: "TargetFn",
        analog_symbol: "RefFn",
        score: 0.97,
        exact_match: true,
        matched: true,
      });
    } finally {
      store.db.close();
    }
  });
});

function opseqFixture(): { repoRoot: string; indexesRoot: string } {
  const repoRoot = tempDir("opseq-repo-");
  const indexesRoot = tempDir("opseq-index-");
  writeReport(repoRoot);
  writeJsonl(join(indexesRoot, "function_shapes.jsonl"), [
    {
      id: "function_shape:unit/a:TargetFn",
      unit: "unit/a",
      source_path: "src/a.c",
      symbol: "TargetFn",
      address: "0x80001000",
    },
    {
      id: "function_shape:unit/b:RefFn",
      unit: "unit/b",
      source_path: "src/b.c",
      symbol: "RefFn",
      address: "0x80002000",
    },
  ]);
  writeJsonl(join(indexesRoot, "opcode_neighbors.jsonl"), [
    {
      source_id: "function_shape:unit/a:TargetFn",
      neighbors: [
        {
          id: "function_shape:unit/b:RefFn",
          score: 0.97,
          exact_match: true,
          method: "opcode_prefix",
          evidence_ref: "opseq:test#TargetFn",
        },
        {
          unit: "missing/unit",
          symbol: "StaleFn",
          score: 0.99,
        },
      ],
    },
  ]);
  return { repoRoot, indexesRoot };
}

function writeReport(repoRoot: string): void {
  mkdirSync(join(repoRoot, "build/GALE01"), { recursive: true });
  writeFileSync(
    join(repoRoot, "build/GALE01/report.json"),
    `${JSON.stringify({
      units: [
        {
          name: "unit/a",
          metadata: { source_path: "src/a.c" },
          functions: [
            {
              name: "TargetFn",
              size: 64,
              fuzzy_match_percent: 83.25,
              metadata: { virtual_address: 0x80001000 },
            },
          ],
        },
        {
          name: "unit/b",
          metadata: { source_path: "src/b.c" },
          functions: [
            {
              name: "RefFn",
              size: 64,
              fuzzy_match_percent: 100,
              metadata: { virtual_address: 0x80002000 },
            },
          ],
        },
      ],
    })}\n`,
  );
}

function codeGraphFixtureRecords(): GraphRecords {
  const sourceVersionId = "source-version:code_graph:test";
  const fileA = fileEntityId("src/a.c");
  const fileB = fileEntityId("src/b.c");
  const unitA = unitEntityId("unit/a");
  const unitB = unitEntityId("unit/b");
  const targetFn = functionEntityId("unit/a", "TargetFn");
  const refFn = functionEntityId("unit/b", "RefFn");
  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: "code_graph",
      contentHash: "test",
      sourcePaths: ["fixture/report.json"],
    },
    entities: [
      {
        id: fileA,
        entityType: "source_file",
        stableKey: "src/a.c",
        payload: {
          source_path: "src/a.c",
          units: ["unit/a"],
          function_count: 1,
          unmatched_function_count: 1,
          matched_function_count: 0,
          editability: { mode: "editable", reason: "fixture" },
        },
      },
      {
        id: fileB,
        entityType: "source_file",
        stableKey: "src/b.c",
        payload: {
          source_path: "src/b.c",
          units: ["unit/b"],
          function_count: 1,
          unmatched_function_count: 0,
          matched_function_count: 1,
          editability: { mode: "read_only_complete", reason: "fixture" },
        },
      },
      { id: unitA, entityType: "object_unit", stableKey: "unit/a", payload: { unit: "unit/a", source_path: "src/a.c" } },
      { id: unitB, entityType: "object_unit", stableKey: "unit/b", payload: { unit: "unit/b", source_path: "src/b.c" } },
      {
        id: targetFn,
        entityType: "function",
        stableKey: "unit/a:TargetFn",
        payload: { unit: "unit/a", sourcePath: "src/a.c", symbol: "TargetFn", fuzzy: 83.25, address: "0x80001000" },
      },
      {
        id: refFn,
        entityType: "function",
        stableKey: "unit/b:RefFn",
        payload: { unit: "unit/b", sourcePath: "src/b.c", symbol: "RefFn", fuzzy: 100, address: "0x80002000" },
      },
    ],
    facts: [
      {
        id: "fact:file_status:a",
        entityId: fileA,
        factType: "file_match_status",
        payload: {
          source_path: "src/a.c",
          units: ["unit/a"],
          function_count: 1,
          unmatched_function_count: 1,
          matched_function_count: 0,
          unmatched_functions: [{ unit: "unit/a", symbol: "TargetFn", fuzzy: 83.25, address: "0x80001000" }],
          functions: [{ unit: "unit/a", symbol: "TargetFn", fuzzy: 83.25, address: "0x80001000" }],
        },
        confidence: 1,
        trustTier: "canonical",
        evidenceRef: "fixture/report.json",
        sourceVersionId,
      },
      {
        id: "fact:file_status:b",
        entityId: fileB,
        factType: "file_match_status",
        payload: {
          source_path: "src/b.c",
          units: ["unit/b"],
          function_count: 1,
          unmatched_function_count: 0,
          matched_function_count: 1,
          unmatched_functions: [],
          functions: [{ unit: "unit/b", symbol: "RefFn", fuzzy: 100, address: "0x80002000" }],
        },
        confidence: 1,
        trustTier: "canonical",
        evidenceRef: "fixture/report.json",
        sourceVersionId,
      },
      {
        id: "fact:editability:a",
        entityId: fileA,
        factType: "editability",
        payload: { mode: "editable", reason: "fixture" },
        confidence: 1,
        trustTier: "canonical",
        evidenceRef: "fixture/report.json",
        sourceVersionId,
      },
    ],
    edges: [
      {
        id: "edge:compile:a",
        fromEntityId: fileA,
        edgeType: "COMPILES_TO",
        toEntityId: unitA,
        weight: 1,
        evidenceRef: "fixture/report.json",
        sourceVersionId,
      },
      {
        id: "edge:contains:a",
        fromEntityId: unitA,
        edgeType: "CONTAINS",
        toEntityId: targetFn,
        weight: 1,
        evidenceRef: "fixture/report.json",
        sourceVersionId,
      },
      {
        id: "edge:compile:b",
        fromEntityId: fileB,
        edgeType: "COMPILES_TO",
        toEntityId: unitB,
        weight: 1,
        evidenceRef: "fixture/report.json",
        sourceVersionId,
      },
      {
        id: "edge:contains:b",
        fromEntityId: unitB,
        edgeType: "CONTAINS",
        toEntityId: refFn,
        weight: 1,
        evidenceRef: "fixture/report.json",
        sourceVersionId,
      },
    ],
    chunks: [],
  };
}

function writeJsonl(path: string, rows: Array<Record<string, unknown>>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
