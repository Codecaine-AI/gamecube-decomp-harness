import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyLedger } from "./ledger-classification.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("classifyLedger", () => {
  test("classifies every JSONL line by fixed first-match precedence and writes a report", () => {
    const dir = mkdtempSync(join(tmpdir(), "knowledge-ledger-"));
    dirs.push(dir);
    const ledgerPath = join(dir, "learnings.jsonl");
    const outPath = join(dir, "report.json");
    const rows = [
      { origin: "human_extracted", statement: "lineage", evidence: [{ type: "boundary_sync" }] },
      { origin: "worker_attempt", statement: "attempt", evidence: [] },
      { origin: "human_extracted", statement: "operational", produced_by: "run_operator" },
      { origin: "analysis", statement: "semantic", evidence: [] },
    ];
    writeFileSync(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n{malformed\n`);

    const report = classifyLedger({ ledgerPath, outPath });

    expect(report).toEqual({
      total: 5,
      counts: { semantic_candidate: 1, attempt: 1, operational: 1, lineage: 1, quarantine: 1 },
    });
    expect(JSON.parse(readFileSync(outPath, "utf8"))).toEqual(report);
  });
});
