import { afterAll, describe, expect, jest, setSystemTime, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  closeSchedulerEpoch,
  closeWorkerState,
  createRun,
  getRun,
  openState,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import { getHarnessState } from "@server/core/harness-state";
import { activateRun } from "../run-control.js";
import { settleRunOnExit } from "../jobs/settle-supervised-run.js";
import {
  epochBoundaryWorkPending,
  boundaryRetryRest,
  launchBoundaryRetryIfDue,
  createKnowledgeMaintenanceClock,
  integrationResolverLockPaths,
  sandboxSleepConfigFromArgs,
  selectRunLoopSchedulerCondition,
  selectIntegrationResolverBatch,
  shouldEvaluateEpochBoundary,
  waitForRestingTrigger,
} from "./run-loop.js";
import { resolveBaseRev } from "../workers/worker-cycle.js";

describe("createKnowledgeMaintenanceClock", () => {
  test("starts a full interval when a long maintenance pass completes", () => {
    const startedAt = new Date("2026-08-27T23:00:00.000Z");
    const intervalMs = 5 * 60_000;
    try {
      setSystemTime(startedAt);
      const clock = createKnowledgeMaintenanceClock(intervalMs);
      expect(clock.isDue()).toBe(true);

      setSystemTime(startedAt.getTime() + 12 * 60_000);
      clock.markCompleted();
      expect(clock.isDue()).toBe(false);

      setSystemTime(startedAt.getTime() + 17 * 60_000 - 1);
      expect(clock.isDue()).toBe(false);
      setSystemTime(startedAt.getTime() + 17 * 60_000);
      expect(clock.isDue()).toBe(true);
    } finally {
      setSystemTime();
    }
  });
});

describe("sandboxSleepConfigFromArgs", () => {
  test("defaults sleep on at 250ms and accepts the comparison-run switches", () => {
    expect(sandboxSleepConfigFromArgs(new Map())).toEqual({
      sandboxSleep: true,
      sandboxSleepDebounceMs: 250,
    });
    expect(sandboxSleepConfigFromArgs(new Map<string, string | true>([
      ["--no-sandbox-sleep", true],
      ["--sandbox-sleep-debounce-ms", "2750"],
    ]))).toEqual({
      sandboxSleep: false,
      sandboxSleepDebounceMs: 2_750,
    });
  });
});

describe("selectRunLoopSchedulerCondition", () => {
  test("preserves blocked and boundary priority over transient work", () => {
    expect(selectRunLoopSchedulerCondition({ blocked: true, boundary: true, planning: true, fallback: "dispatching" })).toBe("blocked");
    expect(selectRunLoopSchedulerCondition({ blocked: false, boundary: true, planning: true, fallback: "dispatching" })).toBe("boundary");
    expect(selectRunLoopSchedulerCondition({ blocked: false, boundary: false, planning: true, fallback: "waiting" })).toBe("planning");
    expect(selectRunLoopSchedulerCondition({ blocked: false, boundary: false, planning: false, fallback: "waiting" })).toBe("waiting");
  });
});

const tempDirs: string[] = [];

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "run-loop-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("run-loop exit settlement", () => {
  test("pauses the run and releases its dispatch lease", async () => {
    const { dir, store } = tempState();
    const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot: dir, stateDir: dir }, { baseRevision: "base-test" });
    const active = activateRun({ reason: "test run-loop start", runId: run.id, store });
    store.db.close();

    await settleRunOnExit({
      globals: { dryRunAgents: true, model: "test", provider: "test", repoRoot: dir, stateDir: dir, thinkingLevel: "low" },
      args: new Map([["--run-id", run.id]]),
      leaseId: active.leaseId,
      stoppedReason: "signal",
    });

    const settledStore = openState(dir);
    try {
      expect(getRun(settledStore, run.id)).toMatchObject({ status: "paused", stopRequest: null });
      expect(getHarnessState(settledStore, "test")?.active_workflow).toBeNull();
    } finally {
      settledStore.db.close();
    }
  });
});

describe("resolveBaseRev", () => {
  test("resolves unknown to the concrete HEAD commit", () => {
    const repo = mkdtempSync(join(tmpdir(), "resolve-base-rev-"));
    tempDirs.push(repo);
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      return result.stdout.toString().trim();
    };
    git("init");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test User");
    writeFileSync(join(repo, "tracked.txt"), "tracked\n");
    git("add", "tracked.txt");
    git("commit", "-m", "initial");

    expect(resolveBaseRev(repo, "unknown")).toBe(git("rev-parse", "HEAD"));
  });
});

describe("epochBoundaryWorkPending", () => {
  test("treats a drained active epoch as boundary work that outranks KG maintenance", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91, priority: 1, reason: "test" }],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 });
      expect(epochBoundaryWorkPending(store, run.id)).toBe(false);

      closeWorkerState(store, {
        authority: { host: "run-loop-test" },
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "timeout",
        epochTargetStatus: "finished",
        summary: { test: true },
        timeoutSummary: "test finished",
      });

      expect(epochBoundaryWorkPending(store, run.id)).toBe(true);
    } finally {
      store.db.close();
    }
  });

  test("treats a crash-retained integration failure boundary as retry work", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91, priority: 1, reason: "test" }],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 });
      closeWorkerState(store, {
        authority: { host: "run-loop-test" },
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "timeout",
        epochTargetStatus: "finished",
        summary: { test: true },
        timeoutSummary: "test finished",
      });
      closeSchedulerEpoch(store, epoch.id, { status: "error", boundaryStatus: "integration_commit_failed" });

      expect(epochBoundaryWorkPending(store, run.id)).toBe(true);
    } finally {
      store.db.close();
    }
  });

  test("waits for persisted backoff and never retries an exhausted boundary", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      store.db.query(`UPDATE epochs SET status = 'error', admitted_count = 1, finished_count = 1, boundary_status = 'retry_scheduled',
        boundary_attempt_count = 1, boundary_next_attempt_at = '2026-08-27T12:02:00.000Z' WHERE id = ?`).run(epoch.id);

      expect(epochBoundaryWorkPending(store, run.id, new Date("2026-08-27T12:01:59.999Z"))).toBe(false);
      expect(epochBoundaryWorkPending(store, run.id, new Date("2026-08-27T12:02:00.000Z"))).toBe(true);
      store.db.query("UPDATE epochs SET boundary_status = 'retry_exhausted', boundary_next_attempt_at = NULL WHERE id = ?").run(epoch.id);
      expect(epochBoundaryWorkPending(store, run.id, new Date("2026-08-28T12:00:00.000Z"))).toBe(false);
    } finally {
      store.db.close();
    }
  });
});

describe("boundary retry resting wake", () => {
  test("evaluates a failed boundary even when the prior cycle paused", () => {
    expect(shouldEvaluateEpochBoundary({ boundaryError: true, epochPaused: true, runningEpoch: false })).toBe(true);
    expect(shouldEvaluateEpochBoundary({ boundaryError: false, epochPaused: true, runningEpoch: false })).toBe(false);
  });

  test("wakes at a future retry deadline without an activity trigger", async () => {
    const { store } = tempState();
    const startedAt = new Date("2026-08-28T12:00:00.000Z");
    try {
      jest.useFakeTimers({ now: startedAt });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      const nextAttemptAt = new Date(startedAt.getTime() + 2 * 60_000).toISOString();
      store.db.query(`UPDATE epochs SET status = 'error', admitted_count = 1, finished_count = 1,
        boundary_status = 'retry_scheduled', boundary_next_attempt_at = ? WHERE id = ?`).run(nextAttemptAt, epoch.id);

      const rest = boundaryRetryRest(store, run.id, 10 * 60_000);
      expect(rest).toEqual({ ordinal: 1, nextAttemptAt, sleepMs: 2 * 60_000 });
      const waiting = waitForRestingTrigger(rest?.sleepMs ?? 0);
      jest.advanceTimersByTime(2 * 60_000 - 1);
      expect(epochBoundaryWorkPending(store, run.id)).toBe(false);
      jest.advanceTimersByTime(1);
      await waiting;
      expect(epochBoundaryWorkPending(store, run.id)).toBe(true);
      const launches: Array<{ trigger: string; epochId: string }> = [];
      expect(launchBoundaryRetryIfDue(store, run.id, (trigger, epochId) => launches.push({ trigger, epochId }))).toBe(true);
      expect(launches).toEqual([{ trigger: "retry scheduler epoch 1 boundary", epochId: epoch.id }]);
    } finally {
      jest.useRealTimers();
      store.db.close();
    }
  });

  test("a retry without a deadline is due on the next tick", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      store.db.query(`UPDATE epochs SET status = 'error', admitted_count = 1, finished_count = 1,
        boundary_status = 'retry_scheduled', boundary_next_attempt_at = NULL WHERE id = ?`).run(epoch.id);

      expect(boundaryRetryRest(store, run.id, 10 * 60_000)).toBeNull();
      expect(epochBoundaryWorkPending(store, run.id)).toBe(true);
      let launched = false;
      expect(launchBoundaryRetryIfDue(store, run.id, () => { launched = true; })).toBe(true);
      expect(launched).toBe(true);
    } finally {
      store.db.close();
    }
  });
});

describe("integrationResolverLockPaths", () => {
  test("locks on write-set and real conflict paths while ignoring apply noise", () => {
    expect(
      integrationResolverLockPaths({
        id: "item-1",
        targetKey: "unit::fn",
        writeSet: ["src/a.c"],
        conflictPaths: ["patch failed", "src/a.c", "src/b.c"],
      }),
    ).toEqual(["src/a.c", "src/b.c"]);
  });

  test("falls back to target key when no path-like values are available", () => {
    expect(
      integrationResolverLockPaths({
        id: "item-1",
        targetKey: "unit::fn",
        writeSet: [],
        conflictPaths: ["patch failed"],
      }),
    ).toEqual(["unit::fn"]);
  });
});

describe("selectIntegrationResolverBatch", () => {
  const resolverRecord = (id: string, writeSet: string[], conflictPaths: string[] = []) => ({
    id,
    targetKey: `unit::${id}`,
    writeSet,
    conflictPaths,
  });

  test("fills available concurrency slots with different-file conflicts", () => {
    const selected = selectIntegrationResolverBatch({
      candidates: [
        resolverRecord("item-1", ["src/a.c"]),
        resolverRecord("item-2", ["src/b.c"]),
        resolverRecord("item-3", ["src/c.c"]),
        resolverRecord("item-4", ["src/d.c"]),
        resolverRecord("item-5", ["src/e.c"]),
      ],
      concurrency: 4,
    });

    expect(selected.map((item) => item.record.id)).toEqual(["item-1", "item-2", "item-3", "item-4"]);
    expect(selected.map((item) => item.lockPaths)).toEqual([["src/a.c"], ["src/b.c"], ["src/c.c"], ["src/d.c"]]);
  });

  test("skips conflicts that touch already-running lock paths", () => {
    const selected = selectIntegrationResolverBatch({
      candidates: [resolverRecord("item-1", ["src/a.c"]), resolverRecord("item-2", ["src/b.c"]), resolverRecord("item-3", ["src/c.c"])],
      activeLockPaths: ["src/a.c"],
      concurrency: 4,
      runningCount: 1,
    });

    expect(selected.map((item) => item.record.id)).toEqual(["item-2", "item-3"]);
  });

  test("does not launch two resolver agents for the same file in one batch", () => {
    const selected = selectIntegrationResolverBatch({
      candidates: [
        resolverRecord("item-1", ["src/a.c"]),
        resolverRecord("item-2", ["src/a.c"]),
        resolverRecord("item-3", ["src/b.c"]),
        resolverRecord("item-4", ["src/c.c"]),
      ],
      concurrency: 4,
    });

    expect(selected.map((item) => item.record.id)).toEqual(["item-1", "item-3", "item-4"]);
  });
});
