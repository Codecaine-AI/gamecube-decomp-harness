import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initializeHarnessState } from "@server/core/harness-state/state.js";
import { openState } from "@server/core/orchestrator-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";

import { knowledgeHarnessSessionId } from "./harness-session.js";

const tempDirs: string[] = [];

async function tempStateDir(): Promise<string> {
  const stateDir = await mkdtemp(join(tmpdir(), "knowledge-harness-session-"));
  tempDirs.push(stateDir);
  return stateDir;
}

function globalsFor(stateDir: string, gameId: string | undefined = "melee"): GlobalArgs {
  return {
    repoRoot: stateDir,
    stateDir,
    gameId,
    dryRunAgents: false,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("knowledge harness session", () => {
  test("uses an explicit game id when globals has no game", async () => {
    const stateDir = await tempStateDir();
    const store = openState(stateDir);
    try {
      initializeHarnessState(store.db, { gameId: "melee", harnessId: "harness:melee", worktree: stateDir, configurationRevision: "config-1", commandId: "initialize" });
    } finally {
      store.db.close();
    }

    expect(
      knowledgeHarnessSessionId({
        globals: globalsFor(stateDir, undefined),
        gameId: "melee",
        fallback: "sync-0ccce0b7-dead",
      }),
    ).toBe("harness:melee");
  });

  test("uses the globals game id when the explicit game id is empty", async () => {
    const stateDir = await tempStateDir();
    const store = openState(stateDir);
    try {
      initializeHarnessState(store.db, { gameId: "melee", harnessId: "harness:melee", worktree: stateDir, configurationRevision: "config-1", commandId: "initialize" });
    } finally {
      store.db.close();
    }

    expect(
      knowledgeHarnessSessionId({
        globals: globalsFor(stateDir),
        gameId: "   ",
        fallback: "sync-0ccce0b7-dead",
      }),
    ).toBe("harness:melee");
  });

  test("uses the workflow fallback when the game has no initialized harness", async () => {
    const stateDir = await tempStateDir();

    expect(
      knowledgeHarnessSessionId({
        globals: globalsFor(stateDir),
        fallback: "sync-0ccce0b7-dead",
      }),
    ).toBe("sync-0ccce0b7-dead");
  });
});
