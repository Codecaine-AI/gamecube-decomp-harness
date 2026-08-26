import { afterEach, describe, expect, test } from "bun:test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { refreshDiscordMirror, stageDiscordSyncBatches } from "./discord.js";

const tempDirs: string[] = [];
const originalKnowledgeRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;

function tempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "sync-discord-"));
  tempDirs.push(path);
  return path;
}

afterEach(() => {
  if (originalKnowledgeRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  else process.env.ORCH_GAME_KNOWLEDGE_ROOT = originalKnowledgeRoot;
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("stageDiscordSyncBatches", () => {
  test("writes frozen batch payloads and returns their corpus ids", () => {
    const root = tempDir();
    const stateDir = resolve(root, "state");
    const knowledgeRoot = resolve(root, "knowledge");
    const monthFile = resolve(
      knowledgeRoot,
      "sources/discord_raw/data/raw/123/2026-08.jsonl",
    );
    mkdirSync(resolve(monthFile, ".."), { recursive: true });
    writeFileSync(
      monthFile,
      `${JSON.stringify({ id: "m1", channel_id: "123", timestamp: "2026-08-01T23:59:00Z", content: "first" })}\n${JSON.stringify({ id: "m2", channel_id: "123", timestamp: "2026-08-02T00:01:00Z", content: "second" })}\n`,
      "utf8",
    );
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;

    const result = stageDiscordSyncBatches({ stateDir });

    expect(result.staged).toBe(1);
    expect(result.messageCount).toBe(2);
    expect(result).toMatchObject({
      days: 2,
      channels: 1,
      firstMessageAt: "2026-08-01T23:59:00.000Z",
      lastMessageAt: "2026-08-02T00:01:00.000Z",
    });
    expect(result.corpusBatchIds).toHaveLength(1);
    const corpusBatchId = result.corpusBatchIds[0]!;
    expect(corpusBatchId.startsWith("discord-")).toBe(true);
    const stagedPath = resolve(stateDir, "staged_corpora", `${corpusBatchId}.json`);
    const beforeGrowth = readFileSync(stagedPath, "utf8");
    const staged = JSON.parse(beforeGrowth) as {
      batch: { source: string; descriptor: { start_line: number; end_line: number } };
      payload: { kind: string; messages: Array<{ id: string }> };
    };
    expect(staged.batch.source).toBe("discord");
    expect(staged.batch.descriptor).toMatchObject({ start_line: 0, end_line: 2 });
    expect(staged.payload.kind).toBe("discord_backfill");
    expect(staged.payload.messages.map((message) => message.id)).toEqual(["m1", "m2"]);

    appendFileSync(monthFile, `${JSON.stringify({ id: "m3", content: "later" })}\n`, "utf8");
    expect(readFileSync(stagedPath, "utf8")).toBe(beforeGrowth);
  });

  test("returns an empty result when the raw mirror is missing", () => {
    const root = tempDir();
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = resolve(root, "knowledge");

    const result = stageDiscordSyncBatches({ stateDir: resolve(root, "state") });

    expect(result).toEqual({
      corpusBatchIds: [],
      staged: 0,
      messageCount: 0,
      days: 0,
      channels: 0,
      firstMessageAt: null,
      lastMessageAt: null,
    });
    expect(existsSync(resolve(root, "state/staged_corpora"))).toBe(false);
  });
});

describe("refreshDiscordMirror", () => {
  test("contains startup failures instead of throwing", async () => {
    const root = tempDir();
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = resolve(root, "missing-knowledge");
    const result = await refreshDiscordMirror({ timeoutMs: 100 });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Discord mirror refresh");
  });
});
