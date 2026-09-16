import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPastPrsArchive } from "./pr-archive.js";

test("initial PR archives retain bodies and discussion with repository-qualified references", () => {
  const root = mkdtempSync(join(tmpdir(), "sms-pr-archive-"));
  try {
    mkdirSync(join(root, "prs/pr-7/raw"), { recursive: true });
    mkdirSync(join(root, "aggregate"));
    writeFileSync(join(root, "prs.json"), JSON.stringify([{ number: 7 }]));
    writeFileSync(join(root, "prs/pr-7/raw/pr.json"), JSON.stringify({ title: "Sunshine camera", body: "Initial body" }));
    writeFileSync(join(root, "aggregate/text_corpus.jsonl"), JSON.stringify({ pr: 7, body: "Review evidence" }) + "\n");
    const archive = createPastPrsArchive(root, "doldecomp/sms");
    expect(archive.getPr("doldecomp/sms#7")).toEqual({ title: "Sunshine camera", body: "Initial body" });
    expect(archive.getDiscussionBodies("doldecomp/sms#7")).toEqual(["Review evidence"]);
    expect(archive.getPr("doldecomp/melee#7")).toBeUndefined();
    expect(archive.getDiscussionBodies("melee#7")).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { kg2Index } from "./job.js";
import { openKnowledgeStore } from "../storage/store.js";
import { openKnowledgeIndexDb } from "./db.js";
import type { GlobalArgs } from "../../game-registry/runtime-options.js";

test("index job uses the selected game's configured PR archive in both modes", async () => {
  const game = mkdtempSync(join(tmpdir(), "sms-index-game-"));
  const root = join(game, "knowledge");
  try {
    const archive = join(game, "capture");
    mkdirSync(join(archive, "prs/pr-7/raw"), { recursive: true });
    mkdirSync(join(archive, "aggregate"));
    writeFileSync(join(game, "game.json"), JSON.stringify({ id: "sms", sources: [{
      identity: { game_id: "sms", source_id: "upstream-prs", kind: "pr", upstream: "doldecomp/sms" },
      configuration: { enabled: true, adapter: "github-prs", adapter_version: "1", credential_ref: null,
        refresh: "explicit", required_stage: "search_index", scope: { capture_root: "capture" } },
    }] }));
    writeFileSync(join(archive, "prs.json"), JSON.stringify([{ number: 7 }]));
    writeFileSync(join(archive, "prs/pr-7/raw/pr.json"), JSON.stringify({ title: "Sunshine title", body: "Sunshine body" }));
    writeFileSync(join(archive, "aggregate/text_corpus.jsonl"), JSON.stringify({ pr: 7, body: "Sunshine review" }) + "\n");
    const store = openKnowledgeStore({ knowledgeRoot: root });
    store.db.run("INSERT INTO entity (id,kind,locator,identity_status) VALUES ('u','translation_unit','src/Game.cpp','active')");
    store.db.run("INSERT INTO pull_request (id,entity_id,pr_ref,outcome,summary,merged_at) VALUES ('p','u','doldecomp/sms#7','no_change','fallback','2026-09-01T00:00:00Z')");
    store.close();
    for (const rebuild of [false, true]) {
      const args = new Map<string, string | true>([["--knowledge-root", root], ["--fts", true], ["--source", "pr"]]);
      if (rebuild) args.set("--rebuild", true);
      await kg2Index({ gameId: "sms" } as GlobalArgs, args);
      const index = openKnowledgeIndexDb({ knowledgeRoot: root });
      try { expect(index.db.query("SELECT title,body,discussion FROM pr_fts").get()).toEqual({ title: "Sunshine title", body: "Sunshine body", discussion: "Sunshine review" }); }
      finally { index.close(); }
    }
  } finally { rmSync(game, { recursive: true, force: true }); }
});
