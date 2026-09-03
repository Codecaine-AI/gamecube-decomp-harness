import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { openKnowledgeStore } from "../storage/store.js";
import * as entitiesModule from "./entities.js";
import * as prsModule from "./prs.js";
import * as reconcileModule from "./reconcile.js";
import * as wikiModule from "./wiki.js";
import { kg2Ingest, resolveIngestPaths } from "./cli.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "kg2-ingest-cli-test-"));
  temporaryRoots.push(root);
  return root;
}

function createEmptyWikiMirror(knowledgeRoot: string): void {
  const wikiDataRoot = join(knowledgeRoot, "sources/rag_search/smashwiki/data");
  mkdirSync(join(wikiDataRoot, "pages"), { recursive: true });
  writeFileSync(join(wikiDataRoot, "index.jsonl"), "");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("resolveIngestPaths", () => {
  test("derives source and live game paths from the knowledge root", () => {
    const knowledgeRoot = resolve("/fixture/game/knowledge");

    expect(resolveIngestPaths(knowledgeRoot)).toEqual({
      discordRawRoot: resolve(knowledgeRoot, "sources/rag_search/discord_raw/data/raw"),
      discordChannelsConfigPath: resolve(knowledgeRoot, "sources/rag_search/discord_raw/config/channels.json"),
      wikiDataRoot: resolve(knowledgeRoot, "sources/rag_search/smashwiki/data"),
      prsRoot: resolve(knowledgeRoot, "sources/code_context/past_prs/data/prs"),
      ledgerPath: resolve(knowledgeRoot, "deprecated/ledger-v1/learnings.jsonl"),
      reportPath: resolve("/fixture/game/checkout/build/GALE01/report.json"),
      checkoutRoot: resolve("/fixture/game/checkout"),
      orchestratorDbPath: resolve("/fixture/game/state/orchestrator.sqlite"),
    });
  });
});

describe("kg2Ingest", () => {
  test("refuses the default knowledge root under a test runner", async () => {
    await expect(kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map()))
      .rejects.toThrow("kg2-ingest refuses to touch the default knowledge root under a test runner; pass --knowledge-root <temp dir>");
  });

  test("defaults to sync, reconciles before PR import, and skips wiki and entities", async () => {
    const gameRoot = temporaryRoot();
    const knowledgeRoot = join(gameRoot, "knowledge");
    createEmptyWikiMirror(knowledgeRoot);
    const paths = resolveIngestPaths(knowledgeRoot);
    mkdirSync(paths.prsRoot, { recursive: true });
    mkdirSync(resolve(paths.reportPath, ".."), { recursive: true });
    writeFileSync(paths.reportPath, JSON.stringify({ units: [] }));
    const output: string[] = [];
    const errors: string[] = [];
    const calls: string[] = [];
    const log = spyOn(console, "log").mockImplementation((value) => output.push(String(value)));
    const error = spyOn(console, "error").mockImplementation((value) => errors.push(String(value)));
    const reconcile = spyOn(reconcileModule, "reconcileReport").mockImplementation(() => {
      calls.push("reconcile");
      return {} as ReturnType<typeof reconcileModule.reconcileReport>;
    });
    const importPrs = spyOn(prsModule, "importPrs").mockImplementation(() => {
      calls.push("prs");
      return {} as ReturnType<typeof prsModule.importPrs>;
    });
    const importWiki = spyOn(wikiModule, "importWiki");
    const extractEntities = spyOn(entitiesModule, "extractEntities");

    try {
      await kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map([
        ["--knowledge-root", knowledgeRoot],
      ]));
      expect(calls).toEqual(["reconcile", "prs"]);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(importPrs).toHaveBeenCalledTimes(1);
      expect(importWiki).not.toHaveBeenCalled();
      expect(extractEntities).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
      reconcile.mockRestore();
      importPrs.mockRestore();
      importWiki.mockRestore();
      extractEntities.mockRestore();
    }

    expect(JSON.parse(output[0]!)).toMatchObject({ lane: "sync" });
    expect(JSON.parse(output[0]!).results).not.toHaveProperty("wiki");
    expect(errors).toContain("[kg2-ingest] wiki skipped by design; run with --lane wiki to import it");
  });

  test("all does not import wiki", async () => {
    const knowledgeRoot = join(temporaryRoot(), "knowledge");
    createEmptyWikiMirror(knowledgeRoot);
    const output: string[] = [];
    const errors: string[] = [];
    const log = spyOn(console, "log").mockImplementation((value) => output.push(String(value)));
    const error = spyOn(console, "error").mockImplementation((value) => errors.push(String(value)));

    try {
      await kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map([
        ["--lane", "all"],
        ["--knowledge-root", knowledgeRoot],
      ]));
    } finally {
      log.mockRestore();
      error.mockRestore();
    }

    expect(JSON.parse(output[0]!).results).not.toHaveProperty("wiki");
    expect(errors).toContain("[kg2-ingest] wiki skipped by design; run with --lane wiki to import it");
  });

  test("imports wiki only with the wiki lane", async () => {
    const knowledgeRoot = join(temporaryRoot(), "knowledge");
    createEmptyWikiMirror(knowledgeRoot);
    const output: string[] = [];
    const log = spyOn(console, "log").mockImplementation((value) => output.push(String(value)));

    try {
      await kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map([
        ["--lane", "wiki"],
        ["--knowledge-root", knowledgeRoot],
      ]));
    } finally {
      log.mockRestore();
    }

    expect(JSON.parse(output[0]!).results).toHaveProperty("wiki");
  });

  test("resets only wiki archival ingest data before importing wiki", async () => {
    const gameRoot = temporaryRoot();
    const knowledgeRoot = join(gameRoot, "knowledge");
    createEmptyWikiMirror(knowledgeRoot);
    const store = openKnowledgeStore({ knowledgeRoot });
    store.db.run("INSERT INTO wiki_section VALUES (?, ?, ?, ?, ?, ?)", ["old#intro@r1", "Old", "__intro__", "r1", "body", "2026-01-01"]);
    store.db.run("INSERT INTO source_watermark VALUES ('wiki', 'old', '2026-01-01')");
    store.db.run("INSERT INTO discord_message VALUES (?, ?, ?, ?, ?, ?, ?)", ["discord-1", "dev", "author", "2026-01-01", "keep", null, "2026-01-01"]);
    store.db.run("INSERT INTO index_task (id, pathway, payload, enqueued_at) VALUES (?, 'archival_ingest', ?, '2026-01-01')", ["wiki-task", JSON.stringify({ source: "wiki" })]);
    store.db.run("INSERT INTO index_task (id, pathway, payload, enqueued_at) VALUES (?, 'archival_ingest', ?, '2026-01-01')", ["discord-task", JSON.stringify({ source: "discord" })]);
    store.close();
    const output: string[] = [];
    const log = spyOn(console, "log").mockImplementation((value) => output.push(String(value)));

    try {
      await kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map([
        ["--lane", "wiki"],
        ["--reset-source", "wiki"],
        ["--knowledge-root", knowledgeRoot],
      ]));
    } finally {
      log.mockRestore();
    }

    const reopened = openKnowledgeStore({ knowledgeRoot });
    expect(reopened.db.query("SELECT id FROM wiki_section").all()).toEqual([]);
    expect(reopened.db.query("SELECT source FROM source_watermark WHERE source = 'wiki'").all()).toEqual([]);
    expect(reopened.db.query("SELECT id FROM index_task ORDER BY id").all()).toEqual([{ id: "discord-task" }]);
    expect(reopened.db.query("SELECT id FROM discord_message").all()).toEqual([{ id: "discord-1" }]);
    reopened.close();
    expect(JSON.parse(output[0]!)).toMatchObject({
      results: { reset: { source: "wiki", wikiSections: 1, watermarks: 1, indexTasks: 1 } },
    });
  });

  test("rejects unsupported reset sources", async () => {
    const knowledgeRoot = join(temporaryRoot(), "knowledge");
    await expect(kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map([
      ["--lane", "all"],
      ["--reset-source", "discord"],
      ["--knowledge-root", knowledgeRoot],
    ]))).rejects.toThrow("--reset-source must be one of: wiki");
  });

  test("rejects a wiki reset when the wiki lane is not selected", async () => {
    const knowledgeRoot = join(temporaryRoot(), "knowledge");
    await expect(kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map([
      ["--lane", "all"],
      ["--reset-source", "wiki"],
      ["--knowledge-root", knowledgeRoot],
    ]))).rejects.toThrow("--reset-source wiki requires --lane wiki");
  });

  test("rejects PR reattribution when the PR lane is not selected", async () => {
    const knowledgeRoot = join(temporaryRoot(), "knowledge");
    await expect(kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map<string, string | true>([
      ["--lane", "wiki"],
      ["--reattribute", true],
      ["--knowledge-root", knowledgeRoot],
    ]))).rejects.toThrow("--reattribute requires --lane prs, --lane sync, or --lane all");
  });

  test("reports a dry-run wiki reset without deleting rows", async () => {
    const gameRoot = temporaryRoot();
    const knowledgeRoot = join(gameRoot, "knowledge");
    createEmptyWikiMirror(knowledgeRoot);
    const store = openKnowledgeStore({ knowledgeRoot });
    store.db.run("INSERT INTO wiki_section VALUES (?, ?, ?, ?, ?, ?)", ["old#intro@r1", "Old", "__intro__", "r1", "body", "2026-01-01"]);
    store.db.run("INSERT INTO source_watermark VALUES ('wiki', 'old', '2026-01-01')");
    store.db.run("INSERT INTO index_task (id, pathway, payload, enqueued_at) VALUES (?, 'archival_ingest', ?, '2026-01-01')", ["wiki-task", JSON.stringify({ source: "wiki" })]);
    store.close();
    const output: string[] = [];
    const log = spyOn(console, "log").mockImplementation((value) => output.push(String(value)));

    try {
      await kg2Ingest({ gameId: "melee" } as GlobalArgs, new Map<string, string | true>([
        ["--lane", "wiki"],
        ["--reset-source", "wiki"],
        ["--dry-run", true],
        ["--knowledge-root", knowledgeRoot],
      ]));
    } finally {
      log.mockRestore();
    }

    const reopened = openKnowledgeStore({ knowledgeRoot });
    expect(reopened.db.query("SELECT id FROM wiki_section").all()).toEqual([{ id: "old#intro@r1" }]);
    expect(reopened.db.query("SELECT source FROM source_watermark WHERE source = 'wiki'").all()).toEqual([{ source: "wiki" }]);
    expect(reopened.db.query("SELECT id FROM index_task").all()).toEqual([{ id: "wiki-task" }]);
    reopened.close();
    expect(JSON.parse(output[0]!)).toMatchObject({
      dryRun: true,
      results: { reset: { source: "wiki", wikiSections: 1, watermarks: 1, indexTasks: 1 } },
    });
  });

  test("dry-runs reconcile without creating the fixture knowledge database", async () => {
    const gameRoot = temporaryRoot();
    const knowledgeRoot = join(gameRoot, "knowledge");
    const reportPath = join(gameRoot, "fixture-report.json");
    mkdirSync(knowledgeRoot, { recursive: true });
    writeFileSync(reportPath, JSON.stringify({
      units: [{
        name: "main/test",
        metadata: { source_path: "src/test.c", complete: false },
        measures: { fuzzy_match_percent: 50, total_code: "16" },
        functions: [{
          name: "TestFunction",
          size: "16",
          fuzzy_match_percent: 50,
          metadata: { virtual_address: "2147483648" },
        }],
      }],
    }));
    const output: string[] = [];
    const log = spyOn(console, "log").mockImplementation((value) => output.push(String(value)));
    const globals: GlobalArgs = {
      repoRoot: gameRoot,
      stateDir: join(gameRoot, "state"),
      gameId: "melee",
      dryRunAgents: false,
      provider: "test",
      model: "test",
      thinkingLevel: "none",
    };

    try {
      await kg2Ingest(globals, new Map<string, string | true>([
        ["--lane", "reconcile"],
        ["--dry-run", true],
        ["--knowledge-root", knowledgeRoot],
        ["--report", reportPath],
      ]));
    } finally {
      log.mockRestore();
    }

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({
      lane: "reconcile",
      dryRun: true,
      results: {
        reconcile: {
          reportRevision: expect.any(String),
          unitsInserted: 1,
          functionsInserted: 1,
          dataInserted: 0,
          refreshed: 0,
          unresolved: 0,
          statusesUpserted: 1,
          skippedMalformed: 0,
          skippedMalformedSample: [],
        },
      },
    });
    expect(existsSync(join(knowledgeRoot, "knowledge.sqlite"))).toBe(false);
  });
});
