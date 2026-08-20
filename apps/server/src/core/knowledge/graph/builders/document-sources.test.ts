import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertGraphRecords, openKnowledgeGraph, searchKnowledgeGraph, upsertSourceDescriptor } from "../db.js";
import type { GraphRecords, SourceDescriptor } from "../types.js";
import { buildDocumentSourceGraphRecords } from "./document-sources.js";
import { defaultGraphSources, rebuildKnowledgeGraph } from "./rebuild.js";

const tempDirs: string[] = [];
const originalGameKnowledgeRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;

afterEach(() => {
  restoreGameKnowledgeRoot();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("document source graph records", () => {
  test("chunks markdown, text, and data summaries while skipping licenses", () => {
    const sourcesRoot = tempDir("document-sources-");
    const descriptor = writeDocumentFixture(sourcesRoot);

    const records = requiredRecords(buildDocumentSourceGraphRecords(descriptor, { sourcesRoot }));

    expect(records.entities).toHaveLength(5);
    expect(records.facts).toHaveLength(5);
    expect(records.entities.some((entity) => entity.stableKey.includes("LICENSE"))).toBe(false);
    expect(records.chunks.some((chunk) => String(chunk.payload.rel_path).includes("LICENSE"))).toBe(false);

    const titles = records.chunks.map((chunk) => chunk.title);
    expect(titles).toContain("Fixture documents: Register allocation notes");
    expect(titles).toContain("Fixture documents: Register allocation notes > Pass pipeline");
    expect(titles).toContain("Fixture documents: Register allocation notes > Spill cost");

    const jsonlChunks = chunksForPath(records, "data/rows.jsonl");
    const jsonChunks = chunksForPath(records, "data/expected.json");
    expect(jsonlChunks).toHaveLength(1);
    expect(jsonlChunks[0]?.payload.chunk_key).toBe("summary");
    expect(jsonlChunks[0]?.text).toContain("Row count: 3");
    expect(jsonChunks).toHaveLength(1);
    expect(jsonChunks[0]?.payload.chunk_key).toBe("summary");
    expect(jsonChunks[0]?.text).toContain("object");

    const textChunks = chunksForPath(records, "data/names.txt");
    expect(textChunks.length).toBeGreaterThanOrEqual(2);
    expect(textChunks.every((chunk) => String(chunk.payload.chunk_key).startsWith("part-"))).toBe(true);
  });

  test("produces deterministic chunk and record ids", () => {
    const sourcesRoot = tempDir("document-determinism-");
    const descriptor = writeDocumentFixture(sourcesRoot);

    const first = requiredRecords(buildDocumentSourceGraphRecords(descriptor, { sourcesRoot }));
    const second = requiredRecords(buildDocumentSourceGraphRecords(descriptor, { sourcesRoot }));

    expect(second.chunks.map((chunk) => chunk.id)).toEqual(first.chunks.map((chunk) => chunk.id));
    expect(recordIds(second)).toEqual(recordIds(first));
  });

  test("keeps search chunks idempotent and finds document text", () => {
    const sourcesRoot = tempDir("document-search-");
    const descriptor = writeDocumentFixture(sourcesRoot);
    const records = requiredRecords(buildDocumentSourceGraphRecords(descriptor, { sourcesRoot }));
    const store = openKnowledgeGraph(join(sourcesRoot, "graph.sqlite"));

    try {
      upsertSourceDescriptor(store, descriptor);
      insertGraphRecords(store, records);
      const firstCount = store.db.query("SELECT COUNT(*) AS count FROM search_chunks").get();

      insertGraphRecords(store, records);
      const secondCount = store.db.query("SELECT COUNT(*) AS count FROM search_chunks").get();

      expect(secondCount).toEqual(firstCount);
      const hits = searchKnowledgeGraph(store, { query: "spill cost", limit: 5 });
      expect(hits.some((hit) => hit.source_id === "fixture_docs" && hit.snippet.toLowerCase().includes("spill"))).toBe(true);
    } finally {
      store.db.close();
    }
  });

  test("discovers and indexes registry document sources during rebuild", () => {
    const knowledgeRoot = tempDir("document-rebuild-");
    const sourcesRoot = join(knowledgeRoot, "sources");
    const descriptor = writeDocumentFixture(sourcesRoot, true);
    writeFileSync(
      join(sourcesRoot, "registry.json"),
      `${JSON.stringify({
        sections: {
          rag_search: {
            title: "Searchable Knowledge Bases",
            description: "Fixture document sources",
          },
        },
        sources: [
          {
            id: descriptor.id,
            section: "rag_search",
            path: descriptor.path,
          },
        ],
      }, null, 2)}\n`,
    );
    const codeGraphIndexes = join(sourcesRoot, "code_graph", "indexes");
    mkdirSync(codeGraphIndexes, { recursive: true });
    writeFileSync(join(codeGraphIndexes, "files.jsonl"), "");
    writeFileSync(join(codeGraphIndexes, "functions.jsonl"), "");
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;

    const dbPath = join(knowledgeRoot, "graph2.sqlite");
    const defaultDbPath = join(knowledgeRoot, "graph-default.sqlite");
    try {
      expect(defaultGraphSources()).not.toContain("fixture_docs");
      const result = rebuildKnowledgeGraph({
        repoRoot: tempDir("document-rebuild-repo-"),
        dbPath,
        sources: ["fixture_docs"],
      });
      expect(result.indexed_sources).toContain("fixture_docs");

      const store = openKnowledgeGraph(dbPath);
      try {
        const hits = searchKnowledgeGraph(store, { query: "spill cost", limit: 5 });
        expect(hits.some((hit) => hit.source_id === "fixture_docs" && hit.snippet.toLowerCase().includes("spill"))).toBe(true);
      } finally {
        store.db.close();
      }

      const defaultResult = rebuildKnowledgeGraph({
        repoRoot: tempDir("document-default-rebuild-repo-"),
        dbPath: defaultDbPath,
      });
      expect(defaultResult.indexed_sources).not.toContain("fixture_docs");

      const defaultStore = openKnowledgeGraph(defaultDbPath);
      try {
        const hits = searchKnowledgeGraph(defaultStore, { query: "spill cost", limit: 5 });
        expect(hits.some((hit) => hit.source_id === "fixture_docs")).toBe(false);
      } finally {
        defaultStore.db.close();
      }
    } finally {
      restoreGameKnowledgeRoot();
    }
  }, 60_000);
});

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(path);
  return path;
}

function fixtureDescriptor(): SourceDescriptor {
  return {
    id: "fixture_docs",
    kind: "document",
    title: "Fixture documents",
    trust_tier: "reference",
    freshness: "snapshot",
    section: "rag_search",
    access_modes: ["source_search", "topic_lookup"],
    active: true,
    path: "rag_search/fixture_docs",
    data_paths: ["rag_search/fixture_docs/data"],
    index_outputs: [],
    commands: {},
    description: "Documents used to test generic graph indexing.",
  };
}

function writeDocumentFixture(sourcesRoot: string, includeDescriptor = false): SourceDescriptor {
  const descriptor = fixtureDescriptor();
  const sourceRoot = join(sourcesRoot, descriptor.path as string);
  const dataRoot = join(sourceRoot, "data");
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(join(sourceRoot, "README.md"), "# Fixture guide\n\nHow to read the fixture documents.\n");
  writeFileSync(
    join(dataRoot, "notes.md"),
    [
      "# Register allocation notes",
      "",
      "Notes collected from a compiler trace.",
      "",
      "## Pass pipeline",
      "",
      "The allocator simplifies before selection.",
      "",
      "## Spill cost",
      "",
      "The spill cost heuristic favors values used inside loops.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dataRoot, "names.txt"),
    ["alpha ".repeat(220), "bravo ".repeat(220), "charlie ".repeat(220)].join("\n\n"),
  );
  writeFileSync(
    join(dataRoot, "rows.jsonl"),
    [
      { stage_id: 2, stkind: 3 },
      { stage_id: 4, stkind: 5 },
      { stage_id: 6, stkind: 7 },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  writeFileSync(join(dataRoot, "expected.json"), `${JSON.stringify({ stage_id: 2, stkind: 3, name: "test" })}\n`);
  writeFileSync(join(dataRoot, "LICENSE.upstream"), "This file must not be indexed.\n");
  if (includeDescriptor) writeFileSync(join(sourceRoot, "source.json"), `${JSON.stringify(descriptor, null, 2)}\n`);
  return descriptor;
}

function requiredRecords(records: GraphRecords | null): GraphRecords {
  if (!records) throw new Error("fixture document source produced no graph records");
  return records;
}

function chunksForPath(records: GraphRecords, relPath: string): GraphRecords["chunks"] {
  return records.chunks.filter((chunk) => chunk.payload.rel_path === relPath);
}

function recordIds(records: GraphRecords): Record<string, string[]> {
  return {
    sourceVersions: [records.sourceVersion.id],
    entities: records.entities.map((entity) => entity.id),
    facts: records.facts.map((fact) => fact.id),
    edges: records.edges.map((edge) => edge.id),
  };
}

function restoreGameKnowledgeRoot(): void {
  if (originalGameKnowledgeRoot === undefined) {
    delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  } else {
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = originalGameKnowledgeRoot;
  }
}
