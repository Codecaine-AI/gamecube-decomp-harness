import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { refreshDiscordMirror } from "./discord.js";

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

describe("refreshDiscordMirror", () => {
  test("contains startup failures instead of throwing", async () => {
    const root = tempDir();
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = resolve(root, "missing-knowledge");
    const result = await refreshDiscordMirror({ timeoutMs: 100 });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Discord mirror refresh");
  });
});
