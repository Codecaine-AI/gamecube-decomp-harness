import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  LEGACY_REVIEW_LEDGER_SCHEMA_VERSION,
  REVIEW_LEDGER_SCHEMA_VERSION,
  computeLedgerEntryTier,
  findLatestLedger,
  ledgerAnchorsReliable,
  ledgerEntriesForFiles,
  loadReviewLedger,
  type LedgerEntry,
  type ReviewLedger,
} from "./review-ledger.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "review-ledger-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    source: "review_lint",
    severity: "error",
    file: "src/melee/ft/ftcliffcommon.c",
    line: 123,
    ruleId: "review_lint.sample",
    standardId: "global_standard:sample",
    message: "Sample finding",
    suggestedFix: null,
    disposition: "unresolved",
    evidence: null,
    tier: 1,
    match_context: null,
    ...overrides,
  };
}

function ledger(entries: LedgerEntry[] = [entry()]): ReviewLedger {
  return {
    schema_version: REVIEW_LEDGER_SCHEMA_VERSION,
    run_id: "run-123",
    created_at: "2026-07-14T00:00:00.000Z",
    head_sha: "abc123",
    worktree_dirty: true,
    base_ref: "origin/master",
    entries,
    summary: { files_scanned: 1, files_repaired: 0, entries: entries.length, by_severity: { error: entries.length } },
  };
}

function writeLedger(path: string, value: unknown = ledger()): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("loadReviewLedger", () => {
  test("parses a v2 ledger", () => {
    const path = resolve(tempDir(), "ledger.json");
    writeLedger(path);

    expect(loadReviewLedger(path)).toEqual(ledger());
  });

  test("loads a v1 ledger by computing tiers and supplying null match context", () => {
    const path = resolve(tempDir(), "ledger.json");
    const legacyEntry = entry({ standardId: "global_standard:assert_report_macros" });
    delete legacyEntry.tier;
    delete legacyEntry.match_context;
    writeLedger(path, {
      ...ledger([legacyEntry]),
      schema_version: LEGACY_REVIEW_LEDGER_SCHEMA_VERSION,
    });

    const loaded = loadReviewLedger(path);
    expect(loaded.schema_version).toBe(LEGACY_REVIEW_LEDGER_SCHEMA_VERSION);
    expect(loaded.entries[0]).toEqual(expect.objectContaining({ tier: 1, match_context: null }));
  });

  test("rejects an unsupported schema version", () => {
    const path = resolve(tempDir(), "ledger.json");
    writeLedger(path, { ...ledger(), schema_version: "pr_review_ledger_v3" });

    expect(() => loadReviewLedger(path)).toThrow("Unsupported review ledger schema_version pr_review_ledger_v3");
  });
});

describe("computeLedgerEntryTier", () => {
  test("applies source, disposition, allow-list, and vague-standard rulings", () => {
    expect(computeLedgerEntryTier(entry())).toBe(1);
    expect(computeLedgerEntryTier(entry({ source: "llm_qa", standardId: "global_standard:assert_report_macros" }))).toBe(1);
    expect(computeLedgerEntryTier(entry({ disposition: "left_with_evidence" }))).toBe(2);
    expect(computeLedgerEntryTier(entry({ severity: "warning" }))).toBe(3);
    expect(computeLedgerEntryTier(entry({ source: "llm_qa", standardId: "global_standard:unlisted-standard" }))).toBe(3);
    expect(computeLedgerEntryTier(entry({ standardId: "global_standard:matching_tactics_need_evidence" }))).toBe(3);
    expect(computeLedgerEntryTier(entry({ standardId: "global_standard:conservative-naming", disposition: "left_with_evidence" }))).toBe(3);
  });
});

describe("findLatestLedger", () => {
  test("searches stable and per-invocation paths and prefers the newest mtime", () => {
    const stateDir = tempDir();
    const stablePath = resolve(stateDir, "pr_session_review/run-a/ledger.json");
    const artifactPath = resolve(stateDir, "pr_session_review/run-b/2026-07-14T00-00-00/ledger.json");
    writeLedger(stablePath);
    writeLedger(artifactPath);
    utimesSync(stablePath, new Date(1_000), new Date(1_000));
    utimesSync(artifactPath, new Date(2_000), new Date(2_000));

    expect(findLatestLedger(stateDir)).toBe(artifactPath);
  });

  test("prefers a run-level stable pointer when mtimes tie", () => {
    const stateDir = tempDir();
    const stablePath = resolve(stateDir, "pr_session_review/run-a/ledger.json");
    const artifactPath = resolve(stateDir, "pr_session_review/run-a/2026-07-14T00-00-00/ledger.json");
    writeLedger(stablePath);
    writeLedger(artifactPath);
    const tied = new Date(2_000);
    utimesSync(stablePath, tied, tied);
    utimesSync(artifactPath, tied, tied);

    expect(findLatestLedger(stateDir)).toBe(stablePath);
  });

  test("returns null when no ledger exists", () => {
    expect(findLatestLedger(tempDir())).toBeNull();
  });
});

describe("ledgerEntriesForFiles", () => {
  test("matches normalized separators and leading relative markers", () => {
    const matching = entry({ file: ".\\src\\melee\\ft\\ftcliffcommon.c" });
    const other = entry({ file: "src/melee/gm/gmresult.c", message: "Other file" });

    expect(ledgerEntriesForFiles(ledger([matching, other]), ["./src/melee/ft/ftcliffcommon.c"])).toEqual([
      { ...matching, file: "src/melee/ft/ftcliffcommon.c" },
    ]);
  });
});

describe("ledgerAnchorsReliable", () => {
  test("is reliable when the ledger and current session HEAD match", () => {
    expect(ledgerAnchorsReliable(" ABC123 ", "abc123")).toBe(true);
  });

  test("is stale when HEAD differs or either SHA is missing", () => {
    expect(ledgerAnchorsReliable("abc123", "def456")).toBe(false);
    expect(ledgerAnchorsReliable("", "def456")).toBe(false);
    expect(ledgerAnchorsReliable("abc123", "")).toBe(false);
  });
});
