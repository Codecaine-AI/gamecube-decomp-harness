import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { initializeProjectState, requestDispatch } from "@server/core/project-state";
import { addEvent, createRun, markEventHandled, openState, updateRunStatus, type StateStore } from "@server/core/session-runtime/run-state";
import { derivedSchedulerCandidateWindow, schedulerCandidateRerankFromArgs, schedulerEpochConfigFromArgs, runSchedulerTick } from "./tick.js";

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
  initializeProjectState(store, { projectId: "test", traceId: "trace-project-test" });
  const dispatch = requestDispatch(store, {
    actor: "runner",
    commandId: `command-test-activate-${runId}`,
    kind: "run",
    projectId: "test",
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
  test("derives candidate window and rerank from explicit args before project defaults", () => {
    const globals = {
      ...globalsFor("/tmp/scheduler-config"),
      project: {
        dashboard: {
          candidateWindow: 128,
          candidateRerank: "priority",
          epochSize: 64,
        },
      },
    } as GlobalArgs;
    const args = new Map<string, string | true>([
      ["--candidate-window", "256"],
      ["--candidate-rerank", "opseq-hot-lane"],
      ["--epoch-size", "32"],
    ]);

    expect(derivedSchedulerCandidateWindow(globals, args, 20)).toBe(256);
    expect(schedulerCandidateRerankFromArgs(globals, args)).toBe("opseq_hot_lane");
    expect(schedulerEpochConfigFromArgs(globals, args, { candidateWindow: 256, workerPoolSize: 20 })).toMatchObject({
      candidateWindow: 256,
      candidateRerank: "opseq_hot_lane",
      size: { mode: "fixed", value: 32 },
    });
  });

  test("uses project candidate window default before epoch size fallback", () => {
    const globals = {
      ...globalsFor("/tmp/scheduler-config"),
      project: {
        dashboard: {
          candidateWindow: 128,
          candidateRerank: "opseq_hot_lane",
          epochSize: 64,
        },
      },
    } as GlobalArgs;

    expect(derivedSchedulerCandidateWindow(globals, new Map(), 20)).toBe(128);
    expect(schedulerCandidateRerankFromArgs(globals, new Map())).toBe("opseq_hot_lane");
  });

  test("leaves finish epoch requests for the run-loop force-finish handler", async () => {
    const dir = tempDir();
    const store = openState(dir);
    const ready = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
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
    const ready = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
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
