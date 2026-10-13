import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPrFts } from "../index/fts.js";
import { openKnowledgeIndexDb } from "../index/db.js";
import { createEmptyPrArchive } from "../index/pr-archive.js";
import { openKnowledgeStore } from "../storage/store.js";
import { STACK_POLICY_REDACTION, stackPolicyQuarantinePath } from "../stack-policy-filter.js";
import { applyStackPolicyMarks, renderStackPruneReport, scanStackPolicyStores } from "./index.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function gameFixture(): string {
  const gameRoot = mkdtempSync(join(tmpdir(), "stack-prune-"));
  roots.push(gameRoot);
  const knowledgeRoot = join(gameRoot, "knowledge");
  const store = openKnowledgeStore({ knowledgeRoot });
  try {
    store.db.query(`INSERT INTO entity (id, kind, locator, identity_status) VALUES ('unit', 'translation_unit', 'src/MActor.cpp', 'active')`).run();
    store.db.query(`INSERT INTO target (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
      VALUES ('t', 'function', 'GMSJ01:MActor', 'unit', 'calc', 'GMSJ01:MActor:calc', '0x8', 'current', 'rev')`).run();
    const pr = store.db.query(`INSERT INTO pull_request (id, target_id, pr_ref, summary, outcome, merged_at) VALUES (?, 't', ?, ?, 'match', '2026-09-01')`);
    pr.run("pr-pad", "doldecomp/sms#212", "Matched calc. Added `char trash[0x18];` to fix the stack frame.");
    pr.run("pr-clean", "doldecomp/sms#213", "Matched calc by restoring the getter.");
  } finally {
    store.close();
  }
  const data = join(knowledgeRoot, "sources/code_context/past_prs/data");
  mkdirSync(join(data, "aggregate"), { recursive: true });
  writeFileSync(join(data, "prs.json"), JSON.stringify([
    { number: 195, state: "CLOSED", mergedAt: null },
    { number: 212, state: "MERGED", mergedAt: "2026-09-01T00:00:00Z" },
  ]));
  writeFileSync(join(data, "aggregate/text_corpus.jsonl"), [
    { pr: 195, author: "bot-free", body: "Left as `// TODO`." },
    { pr: 212, author: "reviewer", body: "Looks good, the stack of pending events drains." },
  ].map((row) => JSON.stringify(row)).join("\n"));
  writeFileSync(join(data, "aggregate/diff_lines.jsonl"), [
    { pr: 195, file: "src/MActor.cpp", change: "add", line: "\tchar trash[8];" },
    { pr: 195, file: "src/MActor.cpp", change: "del", line: "\tPAD_STACK(8);" },
    { pr: 212, file: "include/MActor.hpp", change: "add", line: "\tu8 _pad[0x4];" },
  ].map((row) => JSON.stringify(row)).join("\n"));
  return gameRoot;
}

describe("stack-policy prune", () => {
  test("dry run counts flagged items per store and splits PR text by merge state", async () => {
    const gameRoot = gameFixture();
    const reports = await scanStackPolicyStores({ gameRoot });
    const byStore = Object.fromEntries(reports.map((report) => [report.store, report]));
    expect(byStore["knowledge-v2 store"]!.flagged).toBe(1);
    expect(byStore["knowledge-v2 store"]!.items[0]).toMatchObject({ table: "pull_request", id: "pr-pad", note: "accepted_pr" });
    expect(byStore["past_prs text corpus"]!.breakdown).toMatchObject({ "flagged:closed": 1, "scanned:merged": 1 });
    expect(byStore["past_prs added diff lines"]!.flagged).toBe(1);
    expect(byStore["worker checkpoint notes"]!.present).toBe(false);
    const markdown = renderStackPruneReport({ gameId: "sms", gameRoot, reports, generatedAt: new Date(0) });
    expect(markdown).toContain("| knowledge-v2 store |");
    expect(markdown).toContain("## What --apply does");
  });

  test("apply appends idempotent superseded marks and the next FTS rebuild redacts history", async () => {
    const gameRoot = gameFixture();
    const knowledgeRoot = join(gameRoot, "knowledge");
    const reports = await scanStackPolicyStores({ gameRoot, skipDiffLines: true });
    const first = applyStackPolicyMarks(gameRoot, reports, new Date(0));
    expect(first.marked).toBe(2);
    expect(applyStackPolicyMarks(gameRoot, reports).marked).toBe(0);
    const ledger = readFileSync(first.ledgerPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(ledger.map((row) => row.status)).toEqual(["superseded_stack_policy", "superseded_stack_policy"]);

    const store = openKnowledgeStore({ knowledgeRoot });
    const indexDb = openKnowledgeIndexDb({ knowledgeRoot });
    try {
      expect(stackPolicyQuarantinePath(store.path)).toBe(first.ledgerPath);
      buildPrFts(store, indexDb, { prArchive: createEmptyPrArchive() });
      const body = indexDb.db.query<{ body: string }, []>("SELECT body FROM pr_fts WHERE id = 'pr://pr-pad'").get()!.body;
      expect(body).toBe(`Matched calc. ${STACK_POLICY_REDACTION}`);
    } finally {
      indexDb.close();
      store.close();
    }
  });
});
