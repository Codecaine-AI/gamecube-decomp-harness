import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { addEvent, createRun, openState } from "@server/core/session-runtime/run-state";
import { runSchedulerTick } from "./tick.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "scheduler-tick-state-"));
  tempDirs.push(dir);
  return dir;
}

function globalsFor(dir: string): GlobalArgs {
  return {
    repoRoot: dir,
    stateDir: dir,
    dryRunAgents: true,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("runSchedulerTick", () => {
  test("handles wake events without starting a new epoch when no-start-epoch is set", async () => {
    const dir = tempDir();
    const store = openState(dir);
    const run = createRun(store, "matched_code_percent", 100, 1);
    addEvent(store, run.id, "worker_finished", "test", { created_by: "test" });
    store.db.close();

    const result = await runSchedulerTick(
      globalsFor(dir),
      new Map<string, string | true>([
        ["--run-id", run.id],
        ["--no-start-epoch", true],
      ]),
    );

    const nextStore = openState(dir);
    try {
      const row = nextStore.db.query("SELECT COUNT(*) AS count FROM epochs WHERE session_id = ?").get(run.id) as Record<string, unknown>;
      expect(result.schedulerEpoch).toBeUndefined();
      expect(Number(row.count ?? 0)).toBe(0);
    } finally {
      nextStore.db.close();
    }
  });
});
