import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { createRun, openState, readRunBoundarySyncHold } from "@server/core/harness-runtime/run-state";
import { activateRun } from "../run-control.js";
import { setBoundarySyncHold } from "./set-boundary-sync-hold.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function activeRun(): { globals: GlobalArgs; runId: string } {
  const dir = mkdtempSync(join(tmpdir(), "set-boundary-sync-hold-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    seedRunHarness(store);
    const run = createRun(store, "matched_code_percent", 100, 64, { gameId: "test", repoRoot: dir, stateDir: dir }, {
      baseRevision: "base-test",
      configurationSnapshot: { desired_workers: 64 },
      requireReady: true,
    });
    activateRun({ reason: "set-boundary-sync-hold test", runId: run.id, store });
    return {
      globals: { dryRunAgents: true, gameId: "test", model: "test", provider: "test", repoRoot: dir, stateDir: dir, thinkingLevel: "low" },
      runId: run.id,
    };
  } finally {
    store.db.close();
  }
}

function storedHold(globals: GlobalArgs, runId: string): boolean {
  const store = openState(globals.stateDir);
  try {
    return readRunBoundarySyncHold(store, runId);
  } finally {
    store.db.close();
  }
}

describe("set-boundary-sync-hold", () => {
  test("turns the game's current Run hold on and off and prints old and new values", async () => {
    const { globals, runId } = activeRun();
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await setBoundarySyncHold(globals, new Map([["--hold", "on"]]));
      await setBoundarySyncHold(globals, new Map([["--run", runId], ["--hold", "OFF"]]));
      expect(log.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
        { runId, status: "active", previousBoundarySyncHold: false, boundarySyncHold: true },
        { runId, status: "active", previousBoundarySyncHold: true, boundarySyncHold: false },
      ]);
    } finally {
      log.mockRestore();
    }
    expect(storedHold(globals, runId)).toBe(false);
  });

  test.each(["", "yes", "true"])("refuses --hold %p", async (hold) => {
    const { globals } = activeRun();
    await expect(setBoundarySyncHold(globals, new Map([["--hold", hold]]))).rejects.toThrow("--hold must be on or off");
  });
});
