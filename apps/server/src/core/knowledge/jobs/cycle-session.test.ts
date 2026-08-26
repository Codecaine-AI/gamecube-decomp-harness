import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCycle } from "@server/core/cycle/store.js";
import { openState } from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";

import { knowledgeCycleSessionId } from "./cycle-session.js";

const tempDirs: string[] = [];

async function tempStateDir(): Promise<string> {
  const stateDir = await mkdtemp(join(tmpdir(), "knowledge-cycle-session-"));
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

describe("knowledge cycle session", () => {
  test("uses an explicit game id when globals has no game", async () => {
    const stateDir = await tempStateDir();
    const store = openState(stateDir);
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "cycle-melee-active",
        id: "cycle:cycle-melee-active",
      });
    } finally {
      store.db.close();
    }

    expect(
      knowledgeCycleSessionId({
        globals: globalsFor(stateDir, undefined),
        gameId: "melee",
        fallback: "sync-0ccce0b7-dead",
      }),
    ).toBe("cycle-melee-active");
  });

  test("uses the globals game id when the explicit game id is empty", async () => {
    const stateDir = await tempStateDir();
    const store = openState(stateDir);
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "cycle-melee-active",
        id: "cycle:cycle-melee-active",
      });
    } finally {
      store.db.close();
    }

    expect(
      knowledgeCycleSessionId({
        globals: globalsFor(stateDir),
        gameId: "   ",
        fallback: "sync-0ccce0b7-dead",
      }),
    ).toBe("cycle-melee-active");
  });

  test("uses the workflow fallback when the game has no active cycle", async () => {
    const stateDir = await tempStateDir();

    expect(
      knowledgeCycleSessionId({
        globals: globalsFor(stateDir),
        fallback: "sync-0ccce0b7-dead",
      }),
    ).toBe("sync-0ccce0b7-dead");
  });
});
