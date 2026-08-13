import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGhidraXrefGraphRecords, GHIDRA_XREFS_SOURCE_ID } from "./ghidra-xrefs.js";
import { defaultGraphSources } from "./rebuild.js";
import { functionEntityId } from "./builders/code-graph.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Ghidra xref graph records", () => {
  test("attaches source-scoped call and data evidence to current functions", () => {
    const repoRoot = tempDir("ghidra-repo-");
    const indexesRoot = tempDir("ghidra-indexes-");
    writeReport(repoRoot);
    writeJsonl(join(indexesRoot, "xrefs.jsonl"), [
      {
        id: "xref:0x80001008:0x80002000",
        kind: "ghidra_xref",
        from_address: "0x80001008",
        to_address: "0x80002000",
        ref_type: "UNCONDITIONAL_CALL",
        is_call: true,
        is_data: false,
        from_symbol: "CallerFn",
        to_symbol: "CalleeFn",
        evidence_ref: "ghidra:test#call",
        text: "CallerFn calls CalleeFn",
      },
      {
        id: "xref:0x8000100c:0x80002000",
        kind: "ghidra_xref",
        from_address: "0x8000100c",
        to_address: "0x80002000",
        ref_type: "DATA",
        is_call: false,
        is_data: true,
        from_symbol: "CallerFn",
        to_symbol: "CalleeFn",
        text: "CallerFn references CalleeFn",
      },
      {
        id: "xref:0x80001010:0x80400000",
        kind: "ghidra_xref",
        from_address: "0x80001010",
        to_address: "0x80400000",
        ref_type: "DATA",
        is_call: false,
        is_data: true,
        from_symbol: "CallerFn",
        to_symbol: "global_value",
        text: "CallerFn references global_value",
      },
    ]);

    const records = buildGhidraXrefGraphRecords(repoRoot, { indexesRoot });

    expect(records).not.toBeNull();
    expect(records?.sourceVersion.sourceId).toBe(GHIDRA_XREFS_SOURCE_ID);
    expect(records?.facts).toHaveLength(1);
    expect(records?.facts[0]).toMatchObject({
      entityId: functionEntityId("unit/a", "CallerFn"),
      factType: "ghidra_xref_profile",
      confidence: 0.85,
      evidenceRef: "ghidra:test#call",
    });
    expect(records?.facts[0].payload).toMatchObject({
      xref_count: 3,
      call_count: 1,
      data_ref_count: 2,
      resolved_target_count: 2,
    });
    expect(records?.edges).toHaveLength(2);
    expect(records?.edges.map((edge) => edge.edgeType).sort()).toEqual(["CALLS", "REFERENCES_DATA"]);
    expect(records?.edges.every((edge) => edge.id.startsWith("edge:ghidra_xrefs:"))).toBe(true);
    expect(records?.edges.find((edge) => edge.edgeType === "CALLS")).toMatchObject({
      fromEntityId: functionEntityId("unit/a", "CallerFn"),
      toEntityId: functionEntityId("unit/b", "CalleeFn"),
      evidenceRef: "ghidra:test#call",
    });
    expect(records?.chunks[0]).toMatchObject({
      sourceId: GHIDRA_XREFS_SOURCE_ID,
      entityId: functionEntityId("unit/a", "CallerFn"),
      title: "Ghidra xrefs: CallerFn",
    });
    expect(records?.chunks[0].text).toContain("global_value");
  });

  test("resolves a caller by containing address and preserves generated evidence refs", () => {
    const repoRoot = tempDir("ghidra-address-repo-");
    const indexesRoot = tempDir("ghidra-address-indexes-");
    writeReport(repoRoot);
    const indexPath = join(indexesRoot, "xrefs.jsonl");
    writeJsonl(indexPath, [
      {
        id: "xref:0x8000101c:0x80002000",
        from_address: "0x8000101c",
        to_address: "0x80002000",
        ref_type: "CONDITIONAL_CALL",
        is_call: true,
        is_data: false,
        from_symbol: null,
        to_symbol: null,
        text: "address-only call",
      },
    ]);

    const records = buildGhidraXrefGraphRecords(repoRoot, { indexesRoot });

    expect(records?.edges).toHaveLength(1);
    expect(records?.edges[0].fromEntityId).toBe(functionEntityId("unit/a", "CallerFn"));
    expect(records?.edges[0].toEntityId).toBe(functionEntityId("unit/b", "CalleeFn"));
    expect(records?.edges[0].evidenceRef).toBe(`${indexPath}#xref:0x8000101c:0x80002000`);
  });

  test("is part of a default graph rebuild and skips cleanly without an index", () => {
    const repoRoot = tempDir("ghidra-empty-repo-");
    const indexesRoot = tempDir("ghidra-empty-indexes-");
    writeReport(repoRoot);

    expect(defaultGraphSources()).toContain(GHIDRA_XREFS_SOURCE_ID);
    expect(buildGhidraXrefGraphRecords(repoRoot, { indexesRoot })).toBeNull();
  });
});

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(path);
  return path;
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
          functions: [{ name: "CallerFn", size: 64, fuzzy_match_percent: 80, metadata: { virtual_address: 0x80001000 } }],
        },
        {
          name: "unit/b",
          metadata: { source_path: "src/b.c" },
          functions: [{ name: "CalleeFn", size: 64, fuzzy_match_percent: 100, metadata: { virtual_address: 0x80002000 } }],
        },
      ],
    })}\n`,
  );
}

function writeJsonl(path: string, rows: Array<Record<string, unknown>>): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}
