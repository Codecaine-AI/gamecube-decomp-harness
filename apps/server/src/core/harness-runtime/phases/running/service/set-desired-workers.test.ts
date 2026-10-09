import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { createRun, getRun, openState } from "@server/core/harness-runtime/run-state";
import { activateRun } from "../run-control.js";
import { setDesiredWorkers } from "./set-desired-workers.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function activeRun(): { globals: GlobalArgs; runId: string } {
  const dir = mkdtempSync(join(tmpdir(), "set-desired-workers-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    seedRunHarness(store);
    const run = createRun(store, "matched_code_percent", 100, 64, { gameId: "test", repoRoot: dir, stateDir: dir }, {
      baseRevision: "base-test",
      configurationSnapshot: { desired_workers: 64 },
      requireReady: true,
    });
    activateRun({ reason: "set-desired-workers test", runId: run.id, store });
    return {
      globals: { dryRunAgents: true, gameId: "test", model: "test", provider: "test", repoRoot: dir, stateDir: dir, thinkingLevel: "low" },
      runId: run.id,
    };
  } finally {
    store.db.close();
  }
}

describe("set-desired-workers", () => {
  test("changes the game's current active Run and prints old and new values", async () => {
    const { globals, runId } = activeRun();
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await setDesiredWorkers(globals, new Map([["--workers", "120"]]));
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ runId, status: "active", previousDesiredWorkers: 64, desiredWorkers: 120 });
    } finally {
      log.mockRestore();
    }
    const store = openState(globals.stateDir);
    try {
      expect(getRun(store, runId)?.inputs?.configuration_snapshot.desired_workers).toBe(120);
    } finally {
      store.db.close();
    }
  });

  test.each(["0", "257", "1.5", "many"])("refuses --workers %s", async (workers) => {
    const { globals } = activeRun();
    await expect(setDesiredWorkers(globals, new Map([["--workers", workers]]))).rejects.toThrow("from 1 to 256");
  });
});
