import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LearningRecord } from "../../ledger.js";
import type { GraphRecords } from "../types.js";
import { buildLearningsGraphRecords } from "./learnings.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("knowledge-ledger graph records", () => {
  test("indexes refuted learnings with status in title and payloads", () => {
    const { repoRoot, ledgerPath, functionsIndexPath } = writeLedgerFixture([
      learningFixture({
        id: "learning-refuted",
        status: "refuted",
        statement: "Casting through a union matches the byte pattern.",
        confidence: 0.85,
      }),
    ]);

    const records = requiredRecords(buildLearningsGraphRecords({ repoRoot, ledgerPath, functionsIndexPath }));

    expect(records.entities).toHaveLength(1);
    expect(records.entities[0]?.payload.status).toBe("refuted");
    expect(records.chunks).toHaveLength(1);
    const chunk = records.chunks[0];
    expect(chunk?.title).toBe("learning (refuted) — fn_target");
    expect(chunk?.payload).toEqual({ scope: "symbol", origin: "worker_run", status: "refuted", confidence: 0.85 });
    expect(chunk?.text).toBe("Casting through a union matches the byte pattern.");
    expect(chunk?.evidenceRef).toBe("ledger:learning-refuted");
    expect(records.edges).toHaveLength(1);
    expect(records.facts).toHaveLength(1);
    expect(records.facts[0]?.payload.status).toBe("refuted");
  });

  test("labels corroborated and proposed learnings and keeps fact payload fields", () => {
    const { repoRoot, ledgerPath, functionsIndexPath } = writeLedgerFixture([
      learningFixture({
        id: "learning-corroborated",
        status: "corroborated",
        statement: "Loading the pointer before the loop fixes the regswap.",
        confidence: 0.9,
      }),
      learningFixture({
        id: "learning-proposed",
        status: "proposed",
        statement: "The area uses inline float constants.",
        confidence: 0.4,
        subject: { scope: "general", area: "camera" },
        origin: "human_extracted",
      }),
    ]);

    const records = requiredRecords(buildLearningsGraphRecords({ repoRoot, ledgerPath, functionsIndexPath }));

    const titles = records.chunks.map((chunk) => chunk.title).sort();
    expect(titles).toEqual(["learning (corroborated) — fn_target", "learning (proposed) — camera"]);

    const corroborated = records.chunks.find((chunk) => chunk.evidenceRef === "ledger:learning-corroborated");
    expect(corroborated?.payload).toEqual({
      scope: "symbol",
      origin: "worker_run",
      status: "corroborated",
      confidence: 0.9,
    });

    expect(records.facts).toHaveLength(1);
    expect(records.facts[0]?.payload).toEqual({
      learning_id: "learning-corroborated",
      statement: "Loading the pointer before the loop fixes the regswap.",
      scope: "symbol",
      origin: "worker_run",
      status: "corroborated",
      confidence: 0.9,
      evidence_ref: "ledger:learning-corroborated",
    });
  });

  test("anchors symbol learnings on the function entity", () => {
    const { repoRoot, ledgerPath, functionsIndexPath } = writeLedgerFixture([
      learningFixture({ id: "learning-anchored", status: "corroborated", confidence: 0.8 }),
    ]);

    const records = requiredRecords(buildLearningsGraphRecords({ repoRoot, ledgerPath, functionsIndexPath }));

    expect(records.facts).toHaveLength(1);
    expect(records.facts[0]?.entityId).toBe("function:melee/ft/ft_fixture.c:fn_target");
    expect(records.edges[0]?.fromEntityId).toBe("function:melee/ft/ft_fixture.c:fn_target");
  });

  test("anchors symbol learnings from build/GALE01/report.json when present", () => {
    const repoRoot = tempDir("learnings-report-");
    const reportDir = join(repoRoot, "build/GALE01");
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      join(reportDir, "report.json"),
      JSON.stringify({
        units: [
          {
            name: "main/melee/gr/grzebes",
            functions: [
              {
                name: "fn_target",
                size: 64,
                fuzzy_match_percent: 100,
                metadata: { virtual_address: 2147485696 },
              },
            ],
          },
        ],
      }),
    );
    const ledgerPath = join(repoRoot, "learnings.jsonl");
    writeFileSync(ledgerPath, `${JSON.stringify(learningFixture({ id: "learning-from-report" }))}\n`);

    const records = requiredRecords(buildLearningsGraphRecords({ repoRoot, ledgerPath }));

    expect(records.facts).toHaveLength(1);
    expect(records.facts[0]?.entityId).toBe("function:main/melee/gr/grzebes:fn_target");
    expect(records.edges[0]?.fromEntityId).toBe("function:main/melee/gr/grzebes:fn_target");
    expect(records.chunks[0]?.payload.status).not.toBe("stale");
  });

  test("explicit functionsIndexPath wins over build report", () => {
    const { repoRoot, ledgerPath, functionsIndexPath } = writeLedgerFixture([
      learningFixture({ id: "learning-index-override" }),
    ]);
    const reportDir = join(repoRoot, "build/GALE01");
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      join(reportDir, "report.json"),
      JSON.stringify({ units: [{ name: "main/melee/gr/grzebes", functions: [{ name: "fn_target" }] }] }),
    );

    const records = requiredRecords(buildLearningsGraphRecords({ repoRoot, ledgerPath, functionsIndexPath }));

    expect(records.facts[0]?.entityId).toBe("function:melee/ft/ft_fixture.c:fn_target");
    expect(records.edges[0]?.fromEntityId).toBe("function:melee/ft/ft_fixture.c:fn_target");
  });

  test("marks learnings with missing anchors stale", () => {
    const { repoRoot, ledgerPath, functionsIndexPath } = writeLedgerFixture([
      learningFixture({
        id: "learning-orphan",
        status: "corroborated",
        statement: "The removed helper used a table lookup.",
        confidence: 0.7,
        subject: { scope: "symbol", symbol: "fn_missing" },
      }),
    ]);

    const records = requiredRecords(buildLearningsGraphRecords({ repoRoot, ledgerPath, functionsIndexPath }));

    expect(records.chunks).toHaveLength(1);
    expect(records.chunks[0]?.title).toBe("learning (stale) — fn_missing");
    expect(records.chunks[0]?.payload.status).toBe("stale");
    expect(records.edges).toHaveLength(0);
    expect(records.facts).toHaveLength(0);
  });
});

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(path);
  return path;
}

function learningFixture(overrides: Partial<LearningRecord> & { id: string }): LearningRecord {
  return {
    origin: "worker_run",
    subject: { scope: "symbol", symbol: "fn_target" },
    statement: "fixture statement",
    evidence: [{ type: "run", ref: "run:fixture" }],
    confidence: 0.5,
    status: "proposed",
    created_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as LearningRecord;
}

function writeLedgerFixture(records: LearningRecord[]): { repoRoot: string; ledgerPath: string; functionsIndexPath: string } {
  const repoRoot = tempDir("learnings-graph-");
  const indexDir = join(repoRoot, "knowledge-indexes");
  mkdirSync(indexDir, { recursive: true });
  const functionsIndexPath = join(indexDir, "functions.jsonl");
  writeFileSync(functionsIndexPath, `${JSON.stringify({ unit: "melee/ft/ft_fixture.c", symbol: "fn_target" })}\n`);
  const ledgerPath = join(repoRoot, "learnings.jsonl");
  writeFileSync(ledgerPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  return { repoRoot, ledgerPath, functionsIndexPath };
}

function requiredRecords(records: GraphRecords | null): GraphRecords {
  if (!records) throw new Error("fixture ledger produced no graph records");
  return records;
}
