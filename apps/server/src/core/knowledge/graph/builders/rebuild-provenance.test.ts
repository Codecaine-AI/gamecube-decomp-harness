import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { openKnowledgeGraph, readReportProvenance } from "../db.js";
import { rebuildKnowledgeGraph } from "./rebuild.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("knowledge graph report provenance", () => {
  test("records the report identity used by a rebuild", () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "kg-report-provenance-"));
    tempDirs.push(repoRoot);
    const reportPath = resolve(repoRoot, "build/CUSTOM/report.json");
    mkdirSync(resolve(repoRoot, "build/CUSTOM"), { recursive: true });
    writeFileSync(reportPath, JSON.stringify({
      measures: { matched_code_percent: 73.25 },
      units: [],
    }));
    writeFileSync(resolve(repoRoot, "objdiff.json"), JSON.stringify({ units: [] }));
    const dbPath = resolve(repoRoot, "graph.sqlite");

    rebuildKnowledgeGraph({ repoRoot, dbPath, reportPath, sources: ["test_none"] });

    const store = openKnowledgeGraph(dbPath);
    try {
      const provenance = readReportProvenance(store);
      expect(provenance?.path).toBe(reportPath);
      expect(provenance?.sha256).toBe(createHash("sha256").update(readFileSync(reportPath)).digest("hex"));
      expect(provenance?.mtimeMs).toBeGreaterThan(0);
      expect(provenance?.matchedCodePercent).toBe(73.25);
      expect(provenance?.revision === null || /^[0-9a-f]{40}$/.test(provenance.revision)).toBe(true);
    } finally {
      store.db.close();
    }
  });

  test("clears old provenance when the next rebuild has no report", () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "kg-report-provenance-missing-"));
    tempDirs.push(repoRoot);
    const reportPath = resolve(repoRoot, "report.json");
    writeFileSync(reportPath, JSON.stringify({ measures: {}, units: [] }));
    writeFileSync(resolve(repoRoot, "objdiff.json"), JSON.stringify({ units: [] }));
    const dbPath = resolve(repoRoot, "graph.sqlite");
    rebuildKnowledgeGraph({ repoRoot, dbPath, reportPath, sources: ["test_none"] });
    rmSync(reportPath);

    rebuildKnowledgeGraph({ repoRoot, dbPath, reportPath, sources: ["test_none"] });

    const store = openKnowledgeGraph(dbPath);
    try {
      expect(readReportProvenance(store)).toBeNull();
    } finally {
      store.db.close();
    }
  });
});
