import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { initializeHarnessState, requestDispatch } from "@server/core/harness-state";
import { addEvent, createRun, markEventHandled, openState, updateRunStatus, type StateStore } from "@server/core/cycle-runtime/run-state";
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

function activateRun(store: StateStore, runId: string) {
  initializeHarnessState(store, { gameId: "test", traceId: "trace-game-test" });
  const dispatch = requestDispatch(store, {
    actor: "runner",
    commandId: `command-test-activate-${runId}`,
    correlationId: runId,
    kind: "run",
    gameId: "test",
    reason: "scheduler test",
    workflowId: runId,
  });
  if (dispatch.queued) throw new Error("test dispatch unexpectedly queued");
  return updateRunStatus(store, runId, "active", "test");
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("runSchedulerTick", () => {
  test("leaves finish epoch requests for the run-loop force-finish handler", async () => {
    const dir = tempDir();
    const store = openState(dir);
    const ready = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
    const run = activateRun(store, ready.id);
    const runStarted = store.db.query("SELECT id FROM events WHERE run_id = ? AND event_type = 'run_started'").get(run.id) as Record<string, unknown>;
    markEventHandled(store, String(runStarted.id));
    const eventId = addEvent(store, run.id, "epoch_force_finish_requested", "dashboard", { created_by: "test" });
    store.db.close();

    const result = await runSchedulerTick(globalsFor(dir), new Map<string, string | true>([["--run-id", run.id]]));

    const nextStore = openState(dir);
    try {
      const event = nextStore.db.query("SELECT handled_at FROM events WHERE id = ?").get(eventId) as Record<string, unknown>;
      expect(result.status).toBe("force_finish_event_pending");
      expect(event.handled_at).toBeNull();
      expect(nextStore.db.query("SELECT scheduler_condition FROM runs WHERE id = ?").get(run.id)).toEqual({
        scheduler_condition: "idle",
      });
    } finally {
      nextStore.db.close();
    }
  });

  test("handles wake events without starting a new epoch when no-start-epoch is set", async () => {
    const dir = tempDir();
    const store = openState(dir);
    const ready = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
    const run = activateRun(store, ready.id);
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
      const row = nextStore.db.query("SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?").get(run.id) as Record<string, unknown>;
      expect(result.schedulerEpoch).toBeUndefined();
      expect(Number(row.count ?? 0)).toBe(0);
      expect(nextStore.db.query("SELECT scheduler_condition FROM runs WHERE id = ?").get(run.id)).toEqual({
        scheduler_condition: "idle",
      });
    } finally {
      nextStore.db.close();
    }
  });
});
