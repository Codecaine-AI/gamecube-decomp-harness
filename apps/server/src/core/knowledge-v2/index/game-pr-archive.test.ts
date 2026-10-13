import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKnowledgeStore } from "../storage/store.js";
import { kv2PrSearch } from "../tools.js";
import { openKnowledgeIndexDb } from "./db.js";
import { buildPrFts } from "./fts.js";
import { createGamePastPrsArchive } from "./game-pr-archive.js";

const roots: string[] = [];
let previousRoot: string | undefined;

afterEach(() => {
  if (previousRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previousRoot;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A game root whose PR source points at its own past_prs capture. */
function smsGame(): string {
  const gameRoot = mkdtempSync(join(tmpdir(), "game-pr-archive-"));
  roots.push(gameRoot);
  writeFileSync(join(gameRoot, "game.json"), JSON.stringify({ id: "sms", config: { sources: ["./config/sources/prs.json"] } }));
  mkdirSync(join(gameRoot, "config/sources"), { recursive: true });
  writeFileSync(join(gameRoot, "config/sources/prs.json"), JSON.stringify({
    identity: { game_id: "sms", source_id: "upstream-prs", kind: "pr", upstream: "doldecomp/sms" },
    configuration: {
      enabled: true,
      adapter: "github-prs",
      adapter_version: "1",
      credential_ref: null,
      refresh: "each_sync",
      required_stage: "search_index",
      scope: { state: "all", capture_root: "./knowledge/sources/code_context/past_prs/data", prs_subdir: "prs" },
    },
  }));
  const data = join(gameRoot, "knowledge/sources/code_context/past_prs/data");
  mkdirSync(join(data, "prs/pr-212/raw"), { recursive: true });
  writeFileSync(join(data, "prs.json"), JSON.stringify([{ number: 212 }]));
  writeFileSync(join(data, "prs/pr-212/raw/pr.json"), JSON.stringify({ title: "Decompile Feetinv", body: "SMS feetinv body" }));
  mkdirSync(join(data, "aggregate"), { recursive: true });
  writeFileSync(join(data, "aggregate/text_corpus.jsonl"), `${JSON.stringify({ pr: 212, body: "SMS reviewer: feetinv vtable order is right" })}\n`);
  previousRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  process.env.ORCH_GAME_KNOWLEDGE_ROOT = join(gameRoot, "knowledge");
  return gameRoot;
}

describe("game-scoped past PR archive", () => {
  test("reads the active game's own capture and upstream", () => {
    smsGame();
    const archive = createGamePastPrsArchive("sms");
    expect(archive.getPr("doldecomp/sms#212")?.body).toBe("SMS feetinv body");
    expect(archive.getDiscussionBodies("doldecomp/sms#212")).toEqual(["SMS reviewer: feetinv vtable order is right"]);
    // A ref from another upstream never resolves to this game's PR of the same number.
    expect(archive.getPr("doldecomp/melee#212")).toBeUndefined();
  });

  test("a game without a readable descriptor gets an empty archive", () => {
    const empty = mkdtempSync(join(tmpdir(), "game-pr-archive-empty-"));
    roots.push(empty);
    previousRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = join(empty, "knowledge");
    expect(createGamePastPrsArchive("sms").getDiscussionBodies("doldecomp/sms#212")).toEqual([]);
  });

  test("kv2PrSearch without an injected archive returns SMS discussion for SMS", async () => {
    const gameRoot = smsGame();
    const knowledgeRoot = join(gameRoot, "knowledge");
    const store = openKnowledgeStore({ knowledgeRoot });
    const indexDb = openKnowledgeIndexDb({ knowledgeRoot });
    try {
      store.db.query(`INSERT INTO entity (id, kind, locator, identity_status) VALUES ('unit', 'translation_unit', 'src/Enemy/feetinv.cpp', 'active')`).run();
      store.db.query(`INSERT INTO pull_request (id, entity_id, pr_ref, summary, outcome, merged_at)
        VALUES ('pr-212', 'unit', 'doldecomp/sms#212', 'PR #212 feetinv', 'match', '2026-09-01')`).run();
      buildPrFts(store, indexDb, { prArchive: createGamePastPrsArchive("sms") });
      const result = await kv2PrSearch({ store, indexDb, gameId: "sms" }, { query: "feetinv" });
      expect(result.status).toBe("ok");
      const hits = (result as { results: Array<{ discussion_snippet: string }> }).results;
      expect(hits[0]!.discussion_snippet).toBe("SMS reviewer: feetinv vtable order is right");
    } finally {
      indexDb.close();
      store.close();
    }
  });
});
