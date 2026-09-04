import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KnowledgeStore } from "../storage/store.js";
import type { AttemptsImportResult, DiscordImportResult, ReconcileResult } from "./types.js";
import type { ImportPrsResult } from "./prs.js";
import type { ReanchorSummary } from "../drift/reanchor.js";
import {
  KNOWLEDGE_INTAKE_SYNC_LANES,
  runKnowledgeIntake,
  type KnowledgeIntakeDependencies,
} from "./harness-intake.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowledge-intake-test-"));
  temporaryRoots.push(root);
  return root;
}

function runGit(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim());
  }
  return result.stdout.toString().trim();
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const reconcileResult: ReconcileResult = {
  reportRevision: "abc1234",
  report_digest: "report-content-hash",
  unitsInserted: 1,
  functionsInserted: 2,
  dataInserted: 0,
  refreshed: 0,
  unresolved: 0,
  statusesUpserted: 2,
  skippedMalformed: 0,
  skippedMalformedSample: [],
  renames: {
    applied: 1,
    ambiguous: [],
    pairs: [{
      from_stable_key: "old:fn",
      to_stable_key: "new:fn",
      from_unit: "old",
      to_unit: "new",
      address: "0x80000000",
      moved_rows: { fact: 1, link: 0, worker_run: 0, pull_request: 1, event: 0, subject_index_state: 0 },
      fact_collisions: 0,
    }],
    moved_units: [],
  },
};

const prsResult: ImportPrsResult = {
  inserted: 2,
  skipped: 0,
  tasksEnqueued: 2,
  prsImported: 2,
  prsSkippedNotMerged: 0,
  prsArchiveSkipped: 0,
  prsWithBotReport: 1,
  targetRowsInserted: 1,
  targetRowsSkippedUnresolved: 0,
  targetRowsSkippedUnresolvedSample: [],
  watermark: "9",
};

const discordResult: DiscordImportResult = {
  inserted: 40,
  skipped: 3,
  tasksEnqueued: 1,
  channels: 1,
  watermark: "fixture-watermark",
};

const attemptsResult: AttemptsImportResult = {
  inserted: 3,
  skipped: 0,
  tasksEnqueued: 0,
  runs: 1,
  submissions: 2,
  skippedNoTarget: 0,
  skippedNoSignal: 0,
  watermark: "fixture-attempt-watermark",
};

const reanchorResult: ReanchorSummary = {
  scanned: 4,
  reanchored: 3,
  original_unreadable: 0,
  reanchored_same_path: 1,
  reanchored_moved_path: 1,
  reanchored_shifted: 1,
  left_for_librarian: { content_changed: 1, path_gone: 0 },
  touched_subjects: 3,
  by_status: {
    before: { unchanged: 1, drifted: 2, unresolvable: 1 },
    after: { unchanged: 4, drifted: 0, unresolvable: 0 },
  },
};

describe("runKnowledgeIntake", () => {
  test("repairs an archived PR from its merge commit before the PR lane runs", async () => {
    const root = temporaryRoot();
    const knowledgeRoot = join(root, "knowledge");
    const checkoutRoot = join(root, "checkout");
    const reportPath = join(checkoutRoot, "build/GALE01/report.json");
    const prRoot = join(knowledgeRoot, "sources/code_context/past_prs/data/prs/pr-42");
    const rawRoot = join(prRoot, "raw");
    mkdirSync(join(checkoutRoot, "src"), { recursive: true });
    mkdirSync(join(reportPath, ".."), { recursive: true });
    mkdirSync(rawRoot, { recursive: true });
    runGit(checkoutRoot, "init");
    runGit(checkoutRoot, "config", "user.name", "Fixture Author");
    runGit(checkoutRoot, "config", "user.email", "fixture@example.com");
    writeFileSync(join(checkoutRoot, "src/fixture.c"), "int first;\nint second;\n");
    runGit(checkoutRoot, "add", "src/fixture.c");
    runGit(checkoutRoot, "commit", "-m", "fixture commit");
    const mergeCommitSha = runGit(checkoutRoot, "rev-parse", "HEAD");
    writeFileSync(reportPath, JSON.stringify({ units: [] }));
    writeFileSync(join(rawRoot, "pr.json"), JSON.stringify({
      number: 42,
      title: "Repair fixture",
      state: "closed",
      merged: true,
      merged_at: "2026-01-02T03:04:05Z",
      merge_commit_sha: mergeCommitSha,
    }));
    writeFileSync(join(rawRoot, "diff.diff"), "");

    const calls: string[] = [];
    const store = { close: () => calls.push("close") } as unknown as KnowledgeStore;
    const result = await runKnowledgeIntake({
      knowledgeRoot,
      checkoutRoot,
      reportPath,
      expectedHead: mergeCommitSha.slice(0, 7),
      prNumbers: [42],
      sourceRoot: join(root, "past_prs"),
      fetch: { enabled: false },
      lanes: ["prs"],
      dryRun: false,
      log: () => undefined,
    }, {
      checkoutHead: async () => mergeCommitSha.slice(0, 7),
      prWatermark: () => null,
      openStore: () => store,
      prs: () => {
        calls.push("prs");
        expect(readFileSync(join(rawRoot, "diff.diff"), "utf8")).toContain("+int first;");
        expect(readFileSync(join(prRoot, "extracted/changed_files.jsonl"), "utf8").trim()).toBe(JSON.stringify({
          pr: 42,
          title: "Repair fixture",
          file: "src/fixture.c",
          added: 2,
          deleted: 0,
          hunks: 1,
        }));
        return prsResult;
      },
    });

    expect(calls).toEqual(["prs", "close"]);
    expect(result.repaired_prs).toEqual([42]);
  });

  test("skips archived PRs, fetches missing PRs, and runs sync lanes in order", async () => {
    const root = temporaryRoot();
    const knowledgeRoot = join(root, "knowledge");
    const checkoutRoot = join(root, "checkout");
    const reportPath = join(checkoutRoot, "build/GALE01/report.json");
    const sourceRoot = join(root, "past_prs");
    mkdirSync(join(knowledgeRoot, "sources/code_context/past_prs/data/prs/pr-7"), { recursive: true });
    mkdirSync(join(reportPath, ".."), { recursive: true });
    writeFileSync(reportPath, JSON.stringify({ units: [] }));

    const calls: string[] = [];
    const logs: string[] = [];
    const commands: string[][] = [];
    const store = { close: () => calls.push("close") } as unknown as KnowledgeStore;
    const dependencies: KnowledgeIntakeDependencies = {
      checkoutHead: async () => "abc1234",
      prWatermark: () => null,
      runFetch: async (command) => {
        calls.push("fetch");
        commands.push([...command]);
      },
      openStore: () => store,
      reconcile: (_store, options) => {
        calls.push("reconcile");
        expect(options).toEqual({ reportPath, headRevision: "abc1234", dryRun: false });
        return reconcileResult;
      },
      reanchor: (_store, options) => {
        calls.push("reanchor");
        expect(options).toEqual({ checkoutRoot, headRevision: "abc1234", dryRun: false });
        return reanchorResult;
      },
      prs: (_store, options) => {
        calls.push("prs");
        expect(options).toEqual({
          prsRoot: join(knowledgeRoot, "sources/code_context/past_prs/data/prs"),
          dryRun: false,
        });
        return prsResult;
      },
      discord: (_store, options) => {
        calls.push("discord");
        expect(options).toEqual({
          rawRoot: join(knowledgeRoot, "sources/rag_search/discord_raw/data/raw"),
          channelsConfigPath: join(knowledgeRoot, "sources/rag_search/discord_raw/config/channels.json"),
          dryRun: false,
        });
        return discordResult;
      },
      attempts: (_store, options) => {
        calls.push("attempts");
        expect(options).toEqual({
          orchestratorDbPath: join(root, "state/orchestrator.sqlite"),
          dryRun: false,
        });
        return attemptsResult;
      },
    };

    const result = await runKnowledgeIntake({
      knowledgeRoot,
      checkoutRoot,
      reportPath,
      expectedHead: "abc1234",
      prNumbers: [9, 7, 8, 9],
      sourceRoot,
      fetch: { enabled: true },
      lanes: KNOWLEDGE_INTAKE_SYNC_LANES,
      dryRun: false,
      log: (message) => logs.push(message),
    }, dependencies);

    expect(commands).toEqual([[
      "python3",
      join(sourceRoot, "commands/fetch_recent_pr_dump.py"),
      "--dump-root",
      join(knowledgeRoot, "sources/code_context/past_prs/data"),
      "--postmortem-mode",
      "off",
      "--fetch-jobs",
      "4",
      "--pr",
      "8",
      "--pr",
      "9",
    ]]);
    expect(calls).toEqual(["fetch", "reconcile", "reanchor", "prs", "discord", "attempts", "close"]);
    expect(logs).toEqual([
      "[knowledge-intake] reconcile: report=abc1234 renames=1",
      "[knowledge-intake] prs: inserted=2 skipped=0 tasks_enqueued=2",
      "[knowledge-intake] discord: inserted=40 skipped=3 tasks_enqueued=1",
      "[knowledge-intake] attempts: inserted=3 skipped=0 tasks_enqueued=0",
    ]);
    expect(result).toEqual({
      fetched_prs: [8, 9],
      skipped_prs: [7],
      repaired_prs: [],
      ingest: {
        reconcile: reconcileResult,
        reanchor: reanchorResult,
        prs: prsResult,
        discord: discordResult,
        attempts: attemptsResult,
      },
    });
  });

  test("rejects a missing report before fetching or opening the store", async () => {
    const root = temporaryRoot();
    const reportPath = join(root, "checkout/build/GALE01/report.json");
    let touched = false;
    const dependencies: Partial<KnowledgeIntakeDependencies> = {
      checkoutHead: async () => "abc1234",
      runFetch: async () => { touched = true; },
      openStore: () => { touched = true; return {} as KnowledgeStore; },
    };

    await expect(runKnowledgeIntake({
      knowledgeRoot: join(root, "knowledge"),
      checkoutRoot: join(root, "checkout"),
      reportPath,
      expectedHead: "abc1234",
      prNumbers: [8],
      sourceRoot: join(root, "past_prs"),
      fetch: { enabled: true },
      lanes: KNOWLEDGE_INTAKE_SYNC_LANES,
      dryRun: false,
      log: () => undefined,
    }, dependencies)).rejects.toThrow(`Knowledge intake report is missing: ${reportPath}`);
    expect(touched).toBe(false);
  });

  test("rejects a report whose expected head differs from the checkout head", async () => {
    const root = temporaryRoot();
    const checkoutRoot = join(root, "checkout");
    const reportPath = join(checkoutRoot, "build/GALE01/report.json");
    mkdirSync(join(reportPath, ".."), { recursive: true });
    writeFileSync(reportPath, JSON.stringify({ units: [] }));
    const dependencies: Partial<KnowledgeIntakeDependencies> = {
      checkoutHead: async () => "def5678",
    };

    await expect(runKnowledgeIntake({
      knowledgeRoot: join(root, "knowledge"),
      checkoutRoot,
      reportPath,
      expectedHead: "abc1234",
      prNumbers: [],
      sourceRoot: join(root, "past_prs"),
      fetch: { enabled: false },
      lanes: KNOWLEDGE_INTAKE_SYNC_LANES,
      dryRun: false,
      log: () => undefined,
    }, dependencies)).rejects.toThrow(
      `Knowledge intake report ${reportPath} was built for abc1234, but checkout ${checkoutRoot} is at def5678. Rebuild the report first.`,
    );
  });
});
