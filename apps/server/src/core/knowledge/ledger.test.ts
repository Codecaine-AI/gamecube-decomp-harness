import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendLearnings,
  buildLedgerSearchIndex,
  defaultLedgerPath,
  readLearnings,
  searchLedgerIndex,
  searchLedgerLearnings,
  type LearningRecord,
} from "./ledger.js";

describe("default ledger paths", () => {
  test("places the legacy ledger under the deprecated V1 directory", () => {
    expect(defaultLedgerPath().endsWith("deprecated/ledger-v1/learnings.jsonl")).toBe(true);
  });
});

function learning(id: string, overrides: Partial<LearningRecord> = {}): LearningRecord {
  return {
    id,
    origin: "ai_inferred",
    subject: { scope: "general" },
    statement: `Statement for ${id}`,
    evidence: [],
    confidence: 0.5,
    ...overrides,
  };
}

describe("appendLearnings", () => {
  test("creates parent directories and writes sorted JSONL with accurate counts", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "knowledge-ledger-append-"));
    const ledgerPath = join(fixtureRoot, "nested", "ledger", "learnings.jsonl");
    const result = appendLearnings(ledgerPath, [
      learning("learning:b", { status: "corroborated", created_at: "2026-08-02T00:00:00.000Z" }),
      learning("learning:a", { status: "proposed", created_at: "2026-08-01T00:00:00.000Z" }),
    ]);

    expect(result).toEqual({
      output_path: ledgerPath,
      records_written: 2,
      appended_records: 2,
    });
    expect(existsSync(ledgerPath)).toBe(true);

    const contents = await readFile(ledgerPath, "utf8");
    expect(contents.endsWith("\n")).toBe(true);
    const records = contents
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as LearningRecord);
    expect(records.map((record) => record.id)).toEqual(["learning:a", "learning:b"]);
  });

  test("later records replace matching ids while distinct records and write defaults are preserved", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "knowledge-ledger-dedupe-"));
    const ledgerPath = join(fixtureRoot, "ledger", "learnings.jsonl");
    appendLearnings(ledgerPath, [
      learning("learning:distinct", {
        statement: "Keep this earlier record",
        status: "corroborated",
        created_at: "2026-07-01T00:00:00.000Z",
      }),
      learning("learning:shared", {
        statement: "Old statement",
        status: "refuted",
        created_at: "2026-07-02T00:00:00.000Z",
      }),
    ]);

    const result = appendLearnings(ledgerPath, [learning("learning:shared", { statement: "Replacement statement" })]);
    const records = readLearnings(ledgerPath);

    expect(result).toEqual({
      output_path: ledgerPath,
      records_written: 2,
      appended_records: 1,
    });
    expect(records.map((record) => record.id)).toEqual(["learning:distinct", "learning:shared"]);
    expect(records[0]).toMatchObject({
      statement: "Keep this earlier record",
      status: "corroborated",
      created_at: "2026-07-01T00:00:00.000Z",
    });
    expect(records[1]?.statement).toBe("Replacement statement");
    expect(records[1]?.status).toBe("proposed");
    expect(Number.isNaN(Date.parse(records[1]?.created_at ?? ""))).toBe(false);
  });

  test("skips malformed lines in an existing ledger", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "knowledge-ledger-malformed-"));
    const ledgerPath = join(fixtureRoot, "learnings.jsonl");
    const validExisting = learning("learning:existing", {
      status: "corroborated",
      created_at: "2026-06-01T00:00:00.000Z",
    });
    await writeFile(ledgerPath, `${JSON.stringify(validExisting)}\n{not valid json}\n`, "utf8");

    const result = appendLearnings(ledgerPath, [learning("learning:new")]);

    expect(result.records_written).toBe(2);
    expect(result.appended_records).toBe(1);
    expect(readLearnings(ledgerPath).map((record) => record.id)).toEqual(["learning:existing", "learning:new"]);
  });
});

describe("ledger search index", () => {
  test("indexes statement and subject text and rebuilds without duplicate rows", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "knowledge-ledger-search-"));
    const ledgerPath = join(fixtureRoot, "ledger", "learnings.jsonl");
    const dbPath = join(fixtureRoot, "indexes", "learnings.sqlite");
    appendLearnings(ledgerPath, [
      learning("learning:ledge", {
        subject: { scope: "symbol", symbol: "FighterDamageCallback", file: "src/melee/ft/fighter.c" },
        statement: "Ledgegrab state clears the damage callback.",
        evidence: [{ type: "call_edge", ref: "FighterDamageCallback->ftCommonCliffCatch" }],
      }),
      learning("learning:shield", {
        subject: { scope: "file", file: "src/melee/ft/shield.c" },
        statement: "Shield stun is updated before input processing.",
        evidence: [{ type: "wiki_section", ref: "Shield mechanics" }],
      }),
    ]);

    expect(buildLedgerSearchIndex(dbPath, ledgerPath)).toEqual({ db_path: dbPath, indexed: 2 });
    expect(searchLedgerIndex(dbPath, "Ledgegrab")).toEqual([
      { id: "learning:ledge", statement: "Ledgegrab state clears the damage callback." },
    ]);
    expect(searchLedgerIndex(dbPath, "FighterDamageCallback")).toEqual([
      { id: "learning:ledge", statement: "Ledgegrab state clears the damage callback." },
    ]);

    expect(buildLedgerSearchIndex(dbPath, ledgerPath)).toEqual({ db_path: dbPath, indexed: 2 });
    expect(searchLedgerIndex(dbPath, "Ledgegrab", 20)).toHaveLength(1);
  });

  test("returns ranked ledger hits enriched with their complete learning fields", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "knowledge-ledger-enriched-search-"));
    const ledgerPath = join(fixtureRoot, "ledger", "learnings.jsonl");
    const dbPath = join(fixtureRoot, "indexes", "learnings.sqlite");
    appendLearnings(ledgerPath, [
      learning("learning:ledge", {
        origin: "human_extracted",
        subject: { scope: "symbol", symbol: "FighterDamageCallback", file: "src/melee/ft/fighter.c" },
        statement: "Ledgegrab state clears the damage callback.",
        status: "corroborated",
        confidence: 0.92,
      }),
    ]);
    buildLedgerSearchIndex(dbPath, ledgerPath);

    expect(searchLedgerLearnings({ query: "Ledgegrab", dbPath, ledgerPath })).toEqual({
      status: "ok",
      results: [
        {
          id: "learning:ledge",
          statement: "Ledgegrab state clears the damage callback.",
          subject: { scope: "symbol", symbol: "FighterDamageCallback", file: "src/melee/ft/fighter.c" },
          scope: "symbol",
          origin: "human_extracted",
          status: "corroborated",
          confidence: 0.92,
        },
      ],
    });
  });

  test("filters enriched hits by learning scope after joining the ledger", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "knowledge-ledger-scope-search-"));
    const ledgerPath = join(fixtureRoot, "ledger", "learnings.jsonl");
    const dbPath = join(fixtureRoot, "indexes", "learnings.sqlite");
    appendLearnings(ledgerPath, [
      learning("learning:file", {
        subject: { scope: "file", file: "src/melee/ft/fighter.c" },
        statement: "Damage callback ordering applies across the fighter file.",
      }),
      learning("learning:symbol", {
        subject: { scope: "symbol", symbol: "FighterDamageCallback" },
        statement: "Damage callback ordering applies to this symbol.",
      }),
    ]);
    buildLedgerSearchIndex(dbPath, ledgerPath);

    const result = searchLedgerLearnings({ query: "Damage callback ordering", scope: "file", dbPath, ledgerPath });

    expect(result.status).toBe("ok");
    expect(result.results.map((hit) => hit.id)).toEqual(["learning:file"]);
    expect(result.results[0]?.scope).toBe("file");
  });

  test("returns an index_missing result instead of throwing for a missing database", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "knowledge-ledger-missing-search-"));
    const dbPath = join(fixtureRoot, "missing", "learnings.sqlite");

    const result = searchLedgerLearnings({ query: "ledgegrab", dbPath });

    expect(result.status).toBe("index_missing");
    expect(result.results).toEqual([]);
    expect(result.note).toContain("buildLedgerSearchIndex");
  });
});
