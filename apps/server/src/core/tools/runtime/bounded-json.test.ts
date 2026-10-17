import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { fileGraphCard } from "@server/core/knowledge/graph/file-card.js";
import { relatedFunctions } from "@server/core/knowledge/graph/queries/related-functions.js";
import { knowledgeGraphSchema } from "@server/core/knowledge/graph/storage/schema.js";
import type { KnowledgeGraphStore } from "@server/core/knowledge/graph/db.js";
import { boundToolPayload, type PayloadTruncation } from "./bounded-json.js";
import { jsonToolResult, maxToolOutputCharacters } from "./results.js";

const HINT = "narrow the query";

/** What the worker reads: the payload rendered by jsonToolResult, parsed back. */
function rendered(tool: string, payload: Record<string, unknown>): { text: string; json: Record<string, unknown> } {
  const result = jsonToolResult(tool, payload);
  const text = result.content[0].text;
  expect((result.details as { truncated: boolean }).truncated).toBe(false);
  return { text, json: JSON.parse(text) as Record<string, unknown> };
}

function edge(i: number): Record<string, unknown> {
  return {
    source_entity_id: "function:mario/Enemy/chuuhana:rolling__9TChuuHanaFv",
    source_unit: "mario/Enemy/chuuhana",
    source_symbol: "rolling__9TChuuHanaFv",
    entity_id: `function:mario/Enemy/other:callee_${i}`,
    unit: "mario/Enemy/other",
    symbol: `callee_${i}`,
    source_path: "src/Enemy/other.cpp",
    count: 1,
    resolved: true,
    weight: 1,
    evidence_ref: `ghidra:xrefs.jsonl#rolling__9TChuuHanaFv->callee_${i}`,
  };
}

/** A file card shaped like SMS chuuhana.cpp's, several times the output cap. */
function largeFileCard(): Record<string, unknown> {
  const fn = (i: number) => ({ symbol: `fn_${i}__9TChuuHanaFv`, fuzzy: 50, size: 120, unit: "mario/Enemy/chuuhana", address: `0x8000${i}` });
  return {
    status: "ok",
    graph_db: "/games/sms/knowledge/graph/graph.sqlite",
    file_card: {
      entity_id: "file:src/Enemy/chuuhana.cpp",
      source_path: "src/Enemy/chuuhana.cpp",
      editability: { mode: "editable", reason: "14 unmatched function(s) remain in this source file." },
      match_status: { function_count: 57, functions: Array.from({ length: 57 }, (_, i) => fn(i)) },
      units: [{ unit: "mario/Enemy/chuuhana" }],
      functions: Array.from({ length: 57 }, (_, i) => fn(i)),
      mismatch_patterns: Array.from({ length: 7 }, (_, i) => ({ pattern_id: `p${i}`, title: "x".repeat(3000), linked_evidence: Array.from({ length: 7 }, () => ({ title: "e".repeat(400) })) })),
      callers: Array.from({ length: 10 }, (_, i) => edge(i)),
      callees: Array.from({ length: 300 }, (_, i) => edge(i)),
      data_references: Array.from({ length: 60 }, (_, i) => edge(i)),
    },
  };
}

function expectBounded(json: Record<string, unknown>, text: string): PayloadTruncation {
  expect(json.truncated).toBe(true);
  expect(text.length).toBeLessThan(maxToolOutputCharacters - 2000);
  const truncation = json.truncation as PayloadTruncation;
  expect(truncation.hint).toBe(HINT);
  for (const counts of Object.values(truncation.lists)) expect(counts.shown).toBeLessThan(counts.total);
  return truncation;
}

describe("boundToolPayload", () => {
  test("returns a payload that already fits unchanged", () => {
    const payload = { status: "ok", functions: [{ symbol: "f" }] };
    expect(boundToolPayload("t", payload, HINT)).toBe(payload);
  });

  test("cuts a large file card to valid JSON under the cap, with shown/total per list", () => {
    const { text, json } = rendered("code_graph_file_card", boundToolPayload("code_graph_file_card", largeFileCard(), HINT));
    const truncation = expectBounded(json, text);
    expect(json.status).toBe("ok");
    expect(truncation.lists["file_card.callees"]).toMatchObject({ total: 300 });
    expect(truncation.strings_shortened).toBeGreaterThan(0);
    const card = json.file_card as Record<string, unknown>;
    // Small lists and scalar facts survive; the largest list goes first.
    expect(card.units).toEqual([{ unit: "mario/Enemy/chuuhana" }]);
    expect(card.editability).toEqual({ mode: "editable", reason: "14 unmatched function(s) remain in this source file." });
    expect((card.callers as unknown[]).length).toBeGreaterThan(0);
  });

  test("trims nested per-function lists before dropping functions", () => {
    const payload = {
      status: "ok",
      resolved_function_count: 25,
      functions: Array.from({ length: 25 }, (_, i) => ({
        entity_id: `function:u:f${i}`,
        function: { symbol: `f${i}` },
        opseq_analogs: Array.from({ length: 10 }, (_, j) => edge(j)),
        callers: Array.from({ length: 10 }, (_, j) => edge(j)),
        callees: Array.from({ length: 20 }, (_, j) => edge(j)),
        data_references: Array.from({ length: 5 }, (_, j) => edge(j)),
      })),
    };
    const { text, json } = rendered("graph_related_functions", boundToolPayload("graph_related_functions", payload, HINT));
    const truncation = expectBounded(json, text);
    expect((json.functions as unknown[]).length).toBe(25);
    expect(truncation.lists.functions).toBeUndefined();
    expect(truncation.lists["functions[].callees"]).toMatchObject({ total: 25 * 20 });
  });

  // Read-only check against the real SMS graph (built from its Ghidra export); skipped when absent.
  // A worktree has no games/sms/knowledge/graph: point ORCH_TEST_SMS_GRAPH_DB at the main checkout's graph.
  const realGraph = process.env.ORCH_TEST_SMS_GRAPH_DB ?? resolve(packageRoot(), "games/sms/knowledge/graph/graph.sqlite");
  test.skipIf(!existsSync(realGraph))("bounds SMS chuuhana.cpp's real file card and related functions", () => {
    const db = new Database(`file:${realGraph}?mode=ro&immutable=1`, { readonly: true });
    const store = { path: realGraph, db, orm: drizzle(db, { schema: knowledgeGraphSchema }), hasFts: false } as unknown as KnowledgeGraphStore;
    try {
      const card = { status: "ok", file_card: fileGraphCard(store, "src/Enemy/chuuhana.cpp") };
      expect(JSON.stringify(card, null, 2).length).toBeGreaterThan(maxToolOutputCharacters);
      const bounded = rendered("code_graph_file_card", boundToolPayload("code_graph_file_card", card, HINT));
      expect(expectBounded(bounded.json, bounded.text).lists["file_card.callees"]?.total).toBeGreaterThan(0);

      const related = { status: "ok", ...relatedFunctions(store, { sourcePath: "src/Enemy/chuuhana.cpp", limit: 25 }) };
      const boundedRelated = rendered("graph_related_functions", boundToolPayload("graph_related_functions", related, HINT));
      expectBounded(boundedRelated.json, boundedRelated.text);
      console.log(`chuuhana card ${JSON.stringify(card, null, 2).length} -> ${bounded.text.length} chars; related ${JSON.stringify(related, null, 2).length} -> ${boundedRelated.text.length}`);
    } finally {
      db.close();
    }
  });
});
