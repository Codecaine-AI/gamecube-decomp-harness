import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLocator, parseLocator, type PullRequestLocator } from "../locator.js";
import { insertEntitiesIfMissing, insertTargets } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { shortHash, slugify, taskId } from "./common.js";
import {
  findBotReportBody,
  importPrs,
  parseBotReportComment,
  resolvePrComment,
} from "./prs.js";

const temporaryDirectories: string[] = [];
const stores: KnowledgeStore[] = [];

function functionRowId(prNumber: number, stableKey: string): string {
  return `pr-${prNumber}--fn--${slugify(stableKey)}--${shortHash(stableKey)}`;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function writePr(
  prsRoot: string,
  number: number,
  counts: Record<string, unknown>,
  changedFiles: Array<Record<string, unknown>>,
  textCorpus: Array<Record<string, unknown>> = [],
  issueComments?: unknown,
): void {
  const directory = join(prsRoot, `pr-${number}`, "extracted");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "..", "counts.json"), JSON.stringify({ number, ...counts }));
  writeFileSync(join(directory, "changed_files.jsonl"), changedFiles.map((row) => JSON.stringify(row)).join("\n"));
  writeFileSync(join(directory, "text_corpus.jsonl"), textCorpus.map((row) => JSON.stringify(row)).join("\n"));
  if (issueComments !== undefined) {
    const rawDirectory = join(directory, "..", "raw");
    mkdirSync(rawDirectory, { recursive: true });
    writeFileSync(join(rawDirectory, "issue_comments.json"), JSON.stringify(issueComments));
  }
}

function botReportComment(body: string, createdAt = "2023-11-03T05:00:00Z") {
  return {
    user: { login: "decomp-dev-bot" },
    body,
    created_at: createdAt,
  };
}

const functionReportBody = `### Report for GALE01 (fixture-a - fixture-b)

<details>
<summary>✅ 1 new match</summary>

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| \`main/melee/lb/lblanguage\` | \`lbLanguageMatch\` | +216 | 0.00% | 100.00% |
</details>

<details>
<summary>📈 1 improvement in an unmatched item:</summary>

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| \`main/melee/lb/lblanguage\` | \`lbLanguageImprove\` | +64 | 40.00% | 60.00% |
</details>

<details>
<summary>📉 2 regressions in unmatched functions</summary>

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| \`main/melee/lb/lblanguage\` | \`lbLanguageRegress\` | -8 | 72.50% | 60.00% |
</details>

<details>
<summary>💔 1 broken match</summary>

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| \`main/melee/lb/lblanguage\` | \`lbLanguageBroken\` | -120 | 100.00% | 0.00% |
</details>`;

function createFixture(issueComments?: unknown) {
  const root = mkdtempSync(join(tmpdir(), "knowledge-v2-prs-"));
  temporaryDirectories.push(root);
  const prsRoot = join(root, "prs");
  const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
  stores.push(store);
  insertEntitiesIfMissing(store, [
    { id: "translation_unit:src/melee/lb/lblanguage.c", kind: "translation_unit", locator: "src/melee/lb/lblanguage.c" },
    { id: "translation_unit:src/melee/ft/ftcommon.c", kind: "translation_unit", locator: "src/melee/ft/ftcommon.c" },
    { id: "translation_unit:src/dolphin/vi/vi.c", kind: "translation_unit", locator: "src/dolphin/vi/vi.c" },
  ]);
  insertTargets(store, [
    { id: "target:data:main/melee/ft/ftcommon:.data", kind: "data", unit: "main/melee/ft/ftcommon", unitEntityId: "translation_unit:src/melee/ft/ftcommon.c", symbol: ".data", stableKey: "main/melee/ft/ftcommon:.data", address: "0x80003000", identityStatus: "current", reportRevision: "fixture-r1" },
    { id: "target:data:main/melee/lb/lblanguage:.data", kind: "data", unit: "main/melee/lb/lblanguage", unitEntityId: "translation_unit:src/melee/lb/lblanguage.c", symbol: ".data", stableKey: "main/melee/lb/lblanguage:.data", address: "0x80003010", identityStatus: "current", reportRevision: "fixture-r1" },
    {
      id: "target:function:main/dolphin/vi/vi:__VIInit",
      kind: "function",
      unit: "main/dolphin/vi/vi",
      unitEntityId: "translation_unit:src/dolphin/vi/vi.c",
      symbol: "__VIInit",
      stableKey: "main/dolphin/vi/vi:__VIInit",
      address: "0x80002000",
      identityStatus: "current",
      reportRevision: "fixture-r1",
    },
    {
      id: "target:function:main/dolphin/vi/vi:VIInit",
      kind: "function",
      unit: "main/dolphin/vi/vi",
      unitEntityId: "translation_unit:src/dolphin/vi/vi.c",
      symbol: "VIInit",
      stableKey: "main/dolphin/vi/vi:VIInit",
      address: "0x80002010",
      identityStatus: "current",
      reportRevision: "fixture-r1",
    },
    {
      id: "target:function:main/melee/lb/lblanguage:lbLanguageMatch",
      kind: "function",
      unit: "main/melee/lb/lblanguage",
      unitEntityId: "translation_unit:src/melee/lb/lblanguage.c",
      symbol: "lbLanguageMatch",
      stableKey: "main/melee/lb/lblanguage:lbLanguageMatch",
      address: "0x80001000",
      identityStatus: "current",
      reportRevision: "fixture-r1",
    },
    {
      id: "target:function:main/melee/lb/lblanguage:lbLanguageImprove",
      kind: "function",
      unit: "main/melee/lb/lblanguage",
      unitEntityId: "translation_unit:src/melee/lb/lblanguage.c",
      symbol: "lbLanguageImprove",
      stableKey: "main/melee/lb/lblanguage:lbLanguageImprove",
      address: "0x80001010",
      identityStatus: "current",
      reportRevision: "fixture-r1",
    },
    {
      id: "target:function:main/melee/lb/lblanguage:lbLanguageRegress",
      kind: "function",
      unit: "main/melee/lb/lblanguage",
      unitEntityId: "translation_unit:src/melee/lb/lblanguage.c",
      symbol: "lbLanguageRegress",
      stableKey: "main/melee/lb/lblanguage:lbLanguageRegress",
      address: "0x80001020",
      identityStatus: "current",
      reportRevision: "fixture-r1",
    },
    {
      id: "target:function:main/melee/lb/lblanguage:lbLanguageBroken",
      kind: "function",
      unit: "main/melee/lb/lblanguage",
      unitEntityId: "translation_unit:src/melee/lb/lblanguage.c",
      symbol: "lbLanguageBroken",
      stableKey: "main/melee/lb/lblanguage:lbLanguageBroken",
      address: "0x80001030",
      identityStatus: "current",
      reportRevision: "fixture-r1",
    },
  ]);

  writePr(prsRoot, 1000, {
    title: "Language and fighter updates",
    state: "MERGED",
    createdAt: "2023-11-01T00:00:00Z",
    mergedAt: "2023-11-03T06:11:16Z",
  }, [
    { pr: 1000, file: "src/melee/lb/lblanguage.c", added: 6, deleted: 0, hunks: 1 },
    { pr: 1000, file: "src/melee/lb/lblanguage.c", added: 2, deleted: 1, hunks: 2 },
    { pr: 1000, file: "src/melee/ft/ftcommon.c", added: 4, deleted: 3, hunks: 2 },
    { pr: 1000, file: "docs/unmapped.md", added: 1, deleted: 0, hunks: 1 },
  ], [
    { pr: 1000, kind: "pr_body", author: "author", created_at: "2023-11-03T09:00:00Z", body: "body" },
    { pr: 1000, kind: "comment", author: "late", created_at: "2023-11-03T08:00:00Z", body: "late comment" },
    { pr: 1000, kind: "review", author: "early", created_at: "2023-11-03T07:00:00Z", body: "early review" },
  ], issueComments);
  writePr(prsRoot, 1001, {
    title: "Unmapped",
    state: "MERGED",
    mergedAt: "2023-11-04T00:00:00Z",
  }, [
    { pr: 1001, file: "docs/only.md", added: 1, deleted: 0, hunks: 1 },
  ]);
  writePr(prsRoot, 1002, {
    title: "Still open",
    state: "OPEN",
    mergedAt: null,
  }, [
    { pr: 1002, file: "src/melee/lb/lblanguage.c", added: 1, deleted: 0, hunks: 1 },
  ]);
  return { prsRoot, store };
}

describe("importPrs", () => {
  test("generates ids that round-trip through PR locators", () => {
    const { prsRoot, store } = createFixture([botReportComment(functionReportBody)]);
    importPrs(store, { prsRoot });
    const rows = store.db.query<{ id: string }, []>("SELECT id FROM pull_request ORDER BY id").all();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(({ id }) => id.includes("--fn--"))).toBe(true);
    for (const { id } of rows) {
      const locator = `pr://${id}`;
      const parsed = parseLocator(locator, "pr") as PullRequestLocator;
      expect(parsed.pullRequestId).toBe(id);
      expect(formatLocator(parsed)).toBe(locator);
    }
  });

  test("keeps function rows whose stable keys have the same slug", () => {
    const { prsRoot, store } = createFixture();
    writePr(prsRoot, 1637, {
      title: "Initialize VI",
      state: "MERGED",
      mergedAt: "2023-11-06T00:00:00Z",
    }, [], [], [botReportComment(`### Report for GALE01

<details>
<summary>✅ 2 new matches</summary>

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| \`main/dolphin/vi/vi\` | \`__VIInit\` | +32 | 0.00% | 100.00% |
| \`main/dolphin/vi/vi\` | \`VIInit\` | +48 | 0.00% | 100.00% |
</details>`)]);

    const result = importPrs(store, { prsRoot });
    const rows = store.db.query<{ id: string; target_id: string }, []>(`SELECT id, target_id
      FROM pull_request WHERE pr_ref = 'melee#1637' ORDER BY target_id`).all();

    expect(result.targetRowsInserted).toBe(2);
    expect(result.skipped).toBe(1);
    expect(rows).toEqual([
      {
        id: functionRowId(1637, "main/dolphin/vi/vi:VIInit"),
        target_id: "target:function:main/dolphin/vi/vi:VIInit",
      },
      {
        id: functionRowId(1637, "main/dolphin/vi/vi:__VIInit"),
        target_id: "target:function:main/dolphin/vi/vi:__VIInit",
      },
    ]);
    expect(new Set(rows.map(({ id }) => id)).size).toBe(2);
    expect(new Set(rows.map(({ target_id }) => target_id)).size).toBe(2);
  });

  test("imports merged PRs by unit and advances the processed watermark", () => {
    const { prsRoot, store } = createFixture();
    const result = importPrs(store, { prsRoot, now: () => "2025-01-02T03:04:05.000Z" });

    expect(result).toEqual({
      inserted: 2,
      skipped: 1,
      tasksEnqueued: 1,
      prsImported: 1,
      prsArchiveSkipped: 1,
      prsWithBotReport: 0,
      targetRowsInserted: 0,
      targetRowsSkippedUnresolved: 0,
      targetRowsSkippedUnresolvedSample: [],
      watermark: "1002",
    });
    const rows = store.db.query(`SELECT id, target_id, entity_id, pr_ref, summary, outcome, merged_at
      FROM pull_request ORDER BY id`).all();
    expect(rows).toEqual([
      {
        id: "pr-1000--main-melee-ft-ftcommon",
        target_id: null,
        entity_id: "translation_unit:src/melee/ft/ftcommon.c",
        pr_ref: "melee#1000",
        summary: "[mechanical] PR #1000 'Language and fighter updates' touched src/melee/ft/ftcommon.c (+4/−3, 2 hunks); narrative pending librarian pass",
        outcome: "no_change",
        merged_at: "2023-11-03T06:11:16Z",
      },
      {
        id: "pr-1000--main-melee-lb-lblanguage",
        target_id: null,
        entity_id: "translation_unit:src/melee/lb/lblanguage.c",
        pr_ref: "melee#1000",
        summary: "[mechanical] PR #1000 'Language and fighter updates' touched src/melee/lb/lblanguage.c (+6/−0, 1 hunks); src/melee/lb/lblanguage.c (+2/−1, 2 hunks); narrative pending librarian pass",
        outcome: "no_change",
        merged_at: "2023-11-03T06:11:16Z",
      },
    ]);
    const payload = JSON.stringify([
      "pr-1000--main-melee-lb-lblanguage",
      "pr-1000--main-melee-ft-ftcommon",
    ]);
    expect(store.db.query("SELECT id, pathway, payload, enqueued_at FROM index_task").get()).toEqual({
      id: taskId("pr_imported", payload),
      pathway: "pr_imported",
      payload,
      enqueued_at: "2025-01-02T03:04:05.000Z",
    });
    expect(store.db.query("SELECT position FROM source_watermark WHERE source = 'pr'").get()).toEqual({ position: "1002" });

    expect(importPrs(store, { prsRoot })).toEqual({
      inserted: 0,
      skipped: 0,
      tasksEnqueued: 0,
      prsImported: 0,
      prsArchiveSkipped: 0,
      prsWithBotReport: 0,
      targetRowsInserted: 0,
      targetRowsSkippedUnresolved: 0,
      targetRowsSkippedUnresolvedSample: [],
      watermark: "1002",
    });
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM pull_request").get()?.count).toBe(2);
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM index_task").get()?.count).toBe(1);
  });

  test("dry run reports counts without writing", () => {
    const { prsRoot, store } = createFixture();
    expect(importPrs(store, { prsRoot, dryRun: true })).toEqual({
      inserted: 2,
      skipped: 1,
      tasksEnqueued: 1,
      prsImported: 1,
      prsArchiveSkipped: 1,
      prsWithBotReport: 0,
      targetRowsInserted: 0,
      targetRowsSkippedUnresolved: 0,
      targetRowsSkippedUnresolvedSample: [],
      watermark: "1002",
    });
    for (const table of ["pull_request", "index_task", "source_watermark"]) {
      expect(store.db.query<{ count: number }, []>(`SELECT count(*) AS count FROM ${table}`).get()?.count).toBe(0);
    }
  });

  test("ignores raw comments that are not decomp-dev CI reports", () => {
    const { prsRoot, store } = createFixture([
      {
        user: { login: "reviewer" },
        body: functionReportBody,
        created_at: "2023-11-03T05:00:00Z",
      },
      {
        user: { login: "decomp-dev-bot" },
        body: "Routine CI note without a report heading",
        created_at: "2023-11-03T06:00:00Z",
      },
    ]);

    const result = importPrs(store, { prsRoot });

    expect(result.prsWithBotReport).toBe(0);
    expect(result.targetRowsInserted).toBe(0);
    expect(store.db.query<{ id: string }, []>("SELECT id FROM pull_request ORDER BY id").all()).toEqual([
      { id: "pr-1000--main-melee-ft-ftcommon" },
      { id: "pr-1000--main-melee-lb-lblanguage" },
    ]);
  });

  test("attributes four CI report sections to current function targets", () => {
    const { prsRoot, store } = createFixture([botReportComment(functionReportBody)]);
    const result = importPrs(store, { prsRoot, now: () => "2025-01-02T03:04:05.000Z" });

    expect(result).toEqual({
      inserted: 6,
      skipped: 1,
      tasksEnqueued: 1,
      prsImported: 1,
      prsArchiveSkipped: 1,
      prsWithBotReport: 1,
      targetRowsInserted: 4,
      targetRowsSkippedUnresolved: 0,
      targetRowsSkippedUnresolvedSample: [],
      watermark: "1002",
    });
    expect(store.db.query(`SELECT id, target_id, pr_ref, summary, outcome, merged_at
      FROM pull_request WHERE id LIKE 'pr-1000--fn--%' ORDER BY rowid`).all()).toEqual([
      {
        id: functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageMatch"),
        target_id: "target:function:main/melee/lb/lblanguage:lbLanguageMatch",
        pr_ref: "melee#1000",
        summary: "[ci] PR #1000 'Language and fighter updates' — main/melee/lb/lblanguage:lbLanguageMatch 0.00% -> 100.00% (+216 bytes), reported by decomp-dev CI as '✅ 1 new match'; narrative pending librarian pass",
        outcome: "match",
        merged_at: "2023-11-03T06:11:16Z",
      },
      {
        id: functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageImprove"),
        target_id: "target:function:main/melee/lb/lblanguage:lbLanguageImprove",
        pr_ref: "melee#1000",
        summary: "[ci] PR #1000 'Language and fighter updates' — main/melee/lb/lblanguage:lbLanguageImprove 40.00% -> 60.00% (+64 bytes), reported by decomp-dev CI as '📈 1 improvement in an unmatched item:'; narrative pending librarian pass",
        outcome: "improvement",
        merged_at: "2023-11-03T06:11:16Z",
      },
      {
        id: functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageRegress"),
        target_id: "target:function:main/melee/lb/lblanguage:lbLanguageRegress",
        pr_ref: "melee#1000",
        summary: "[ci] PR #1000 'Language and fighter updates' — main/melee/lb/lblanguage:lbLanguageRegress 72.50% -> 60.00% (-8 bytes), reported by decomp-dev CI as '📉 2 regressions in unmatched functions'; narrative pending librarian pass",
        outcome: "no_change",
        merged_at: "2023-11-03T06:11:16Z",
      },
      {
        id: functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageBroken"),
        target_id: "target:function:main/melee/lb/lblanguage:lbLanguageBroken",
        pr_ref: "melee#1000",
        summary: "[ci] PR #1000 'Language and fighter updates' — main/melee/lb/lblanguage:lbLanguageBroken 100.00% -> 0.00% (-120 bytes), reported by decomp-dev CI as '💔 1 broken match'; narrative pending librarian pass",
        outcome: "no_change",
        merged_at: "2023-11-03T06:11:16Z",
      },
    ]);
    const payload = JSON.stringify([
      "pr-1000--main-melee-lb-lblanguage",
      "pr-1000--main-melee-ft-ftcommon",
      functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageMatch"),
      functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageImprove"),
      functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageRegress"),
      functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageBroken"),
    ]);
    expect(store.db.query("SELECT id, pathway, payload, enqueued_at FROM index_task").get()).toEqual({
      id: taskId("pr_imported", payload),
      pathway: "pr_imported",
      payload,
      enqueued_at: "2025-01-02T03:04:05.000Z",
    });
  });

  test("counts unresolved function rows without guessing a target", () => {
    const unresolvedBody = `### Report for GALE01

<details>
<summary>📈 1 improvement in an unmatched function</summary>

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| \`main/melee/lb/lblanguage\` | \`lbLanguageMatc\` | +16 | 20.00% | 40.00% |
| \`main/melee/lb/lblanguage\` | \`.data\` | +90 | 0.00% | 51.48% |
</details>`;
    const { prsRoot, store } = createFixture([botReportComment(unresolvedBody)]);

    expect(importPrs(store, { prsRoot })).toEqual({
      inserted: 3,
      skipped: 1,
      tasksEnqueued: 1,
      prsImported: 1,
      prsArchiveSkipped: 1,
      prsWithBotReport: 1,
      targetRowsInserted: 1,
      targetRowsSkippedUnresolved: 1,
      targetRowsSkippedUnresolvedSample: [
        { unit: "main/melee/lb/lblanguage", symbol: "lbLanguageMatc" },
      ],
      watermark: "1002",
    });
    expect(store.db.query<{ count: number }, []>(`SELECT count(*) AS count FROM pull_request
      WHERE target_id = 'target:function:main/melee/lb/lblanguage:lbLanguageMatch'`).get()?.count).toBe(0);
    expect(store.db.query<{ count: number }, [string]>(`SELECT count(*) AS count FROM pull_request
      WHERE id = ?`).get(functionRowId(1000, "main/melee/lb/lblanguage:lbLanguageMatc"))?.count).toBe(0);
    expect(store.db.query(`SELECT target_id, outcome, summary FROM pull_request
      WHERE summary LIKE '%.data%'`).get()).toEqual({
      target_id: "target:data:main/melee/lb/lblanguage:.data",
      outcome: "improvement",
      summary: "[ci] PR #1000 'Language and fighter updates' — main/melee/lb/lblanguage:.data 0.00% -> 51.48% (+90 bytes), reported by decomp-dev CI as '📈 1 improvement in an unmatched function'; narrative pending librarian pass",
    });
  });

  test("reattribution is idempotent", () => {
    const { prsRoot, store } = createFixture([botReportComment(functionReportBody)]);
    importPrs(store, { prsRoot });
    const pullRequestCount = store.db.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM pull_request",
    ).get()?.count;
    const taskCount = store.db.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM index_task",
    ).get()?.count;

    const second = importPrs(store, { prsRoot, reattribute: true });

    expect(second.inserted).toBe(0);
    expect(second.targetRowsInserted).toBe(0);
    expect(second.tasksEnqueued).toBe(0);
    expect(store.db.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM pull_request",
    ).get()?.count).toBe(pullRequestCount);
    expect(store.db.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM index_task",
    ).get()?.count).toBe(taskCount);
  });

  test("reattribution processes reports behind the stored watermark without regressing it", () => {
    const { prsRoot, store } = createFixture();
    importPrs(store, { prsRoot });
    const rawDirectory = join(prsRoot, "pr-1000", "raw");
    mkdirSync(rawDirectory, { recursive: true });
    writeFileSync(
      join(rawDirectory, "issue_comments.json"),
      JSON.stringify([botReportComment(functionReportBody)]),
    );

    const result = importPrs(store, { prsRoot, reattribute: true });

    expect(result.inserted).toBe(4);
    expect(result.targetRowsInserted).toBe(4);
    expect(result.watermark).toBe("1002");
    expect(store.db.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM pull_request",
    ).get()?.count).toBe(6);
  });

  test("imports a PR whose only resolved target comes from the bot report", () => {
    const { prsRoot, store } = createFixture();
    writePr(prsRoot, 1003, {
      title: "Function-only attribution",
      state: "MERGED",
      mergedAt: "2023-11-05T00:00:00Z",
    }, [
      { pr: 1003, file: "docs/unmapped.md", added: 1, deleted: 0, hunks: 1 },
    ], [], [botReportComment(`### Report for GALE01

<details>
<summary>✅ 1 new match</summary>

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| \`main/melee/lb/lblanguage\` | \`lbLanguageMatch\` | +216 | 0.00% | 100.00% |
</details>`)]);

    const result = importPrs(store, { prsRoot });

    expect(result.prsArchiveSkipped).toBe(1);
    expect(result.prsImported).toBe(2);
    expect(result.targetRowsInserted).toBe(1);
    expect(store.db.query("SELECT id, target_id FROM pull_request WHERE pr_ref = 'melee#1003'").all()).toEqual([
      {
        id: functionRowId(1003, "main/melee/lb/lblanguage:lbLanguageMatch"),
        target_id: "target:function:main/melee/lb/lblanguage:lbLanguageMatch",
      },
    ]);
    const payload = JSON.stringify([
      functionRowId(1003, "main/melee/lb/lblanguage:lbLanguageMatch"),
    ]);
    expect(store.db.query("SELECT payload FROM index_task WHERE payload = ?").get(payload)).toEqual({ payload });
  });
});

describe("bot report parsing", () => {
  test("ignores non-bot comments and returns the latest qualifying report", () => {
    const early = "### Report for GALE01\n\nearly";
    const late = "   ### Report for GALE01\n\nlate";
    expect(findBotReportBody([
      null,
      { user: null, body: late, created_at: "2023-11-04T00:00:00Z" },
      { user: { login: "reviewer" }, body: late, created_at: "2023-11-04T00:00:00Z" },
      { user: { login: "decomp-dev-bot" }, body: "ordinary bot note", created_at: "2023-11-05T00:00:00Z" },
      { user: { login: "decomp-dev-bot" }, body: late, created_at: "2023-11-03T00:00:00Z" },
      { user: { login: "decomp-dev" }, body: early, created_at: "2023-11-02T00:00:00Z" },
    ])).toBe(late);
    expect(findBotReportBody([
      { user: { login: "decomp-dev" }, body: late, created_at: "2023-11-04T00:00:00Z" },
      { user: { login: "decomp-dev-bot" }, body: early },
    ])).toBe(early);
    expect(findBotReportBody({ comments: [] })).toBeNull();
  });

  test("parses tolerant table rows and skips non-table details and malformed rows", () => {
    const body = `### Report for GALE01

| Unit | Function | Bytes | Before | After |
| - | - | - | - | - |
| outside/details | ignored | +1 | 0.00% | 1.00% |

<details>
<summary>Empty section</summary>
No table here.
</details>

<details>
<summary>
  📉 1 regression in an unmatched item:
</summary>

| Unit | Function | Bytes | Before | After |
| :--- | ---: | :---: | --- | ---: |
| Unit | NotAFunctionHeader | 4 | 10.00% | 20.00% |
| only | three | cells |
| main/test/unit | TestFunction | -8 | 50.50% | 25.25% |
| main/test/unit | TestFunction | -8 | 50.50% | 20.00% |
| main/test/bad | BadPercent | +4 | unknown | 30.00% |
| main/test/empty | EmptyPercent | +4 | % | 30.00% |
</details>

<details>
<summary>📈 2 improvements in unmatched items</summary>

| Unit | Item | Bytes | Before | After |
| - | - | - | - | - |
| main/test/item | ItemFunction | +12 | 10.00% | 30.00% |
| main/test/item | .data | +4 | 0.00% | 25.00% |
</details>`;

    expect(parseBotReportComment(body)).toEqual([
      {
        unit: "main/test/unit",
        function: "TestFunction",
        bytes: "-8",
        bytesValue: -8,
        before: "50.50",
        after: "20.00",
        beforePct: 50.5,
        afterPct: 20,
        sectionLabel: "📉 1 regression in an unmatched item:",
      },
      {
        unit: "main/test/item",
        function: "ItemFunction",
        bytes: "+12",
        bytesValue: 12,
        before: "10.00",
        after: "30.00",
        beforePct: 10,
        afterPct: 30,
        sectionLabel: "📈 2 improvements in unmatched items",
      },
      {
        unit: "main/test/item",
        function: ".data",
        bytes: "+4",
        bytesValue: 4,
        before: "0.00",
        after: "25.00",
        beforePct: 0,
        afterPct: 25,
        sectionLabel: "📈 2 improvements in unmatched items",
      },
    ]);
  });
});

describe("resolvePrComment", () => {
  test("puts the PR body first and sorts the remaining archive records", () => {
    const { prsRoot } = createFixture();
    expect(resolvePrComment(prsRoot, 1000, 0)).toEqual({
      locator: "pr://1000/comment/0",
      kind: "pr_body",
      author: "author",
      createdAt: "2023-11-03T09:00:00Z",
      body: "body",
    });
    expect(resolvePrComment(prsRoot, 1000, 1)?.body).toBe("early review");
    expect(resolvePrComment(prsRoot, 1000, 2)?.body).toBe("late comment");
    expect(resolvePrComment(prsRoot, 1000, 3)).toBeNull();
    expect(resolvePrComment(prsRoot, 9999, 0)).toBeNull();
  });
});
