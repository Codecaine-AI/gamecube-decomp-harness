import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { afterAll, describe, expect, jest, setSystemTime, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activeClaimsForRun,
  admitEpochTargets,
  claimNextEpochTarget,
  closeSchedulerEpoch,
  closeWorkerState,
  createRun,
  getRun,
  openState,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { getDispatchState } from "@server/core/harness-state";
import { activateRun } from "../run-control.js";
import { settleRunOnExit } from "../jobs/settle-supervised-run.js";
import {
  epochBoundaryWorkPending,
  epochOrdinalForBoundary,
  boundaryRetryLogTransition,
  boundaryRetryRest,
  launchBoundaryRetryIfDue,
  createKnowledgeMaintenanceClock,
  createProviderCircuitBreaker,
  providerCircuitConfigFromArgs,
  recordRunLoopFlags,
  sandboxSleepConfigFromArgs,
  selectRunLoopSchedulerCondition,
  startLibrarianConsumerIfEnabled,
  startWorkerSummaryIfEnabled,
  shouldEvaluateEpochBoundary,
  waitForRestingTrigger,
  workerJobClaimRecoveryFilters,
} from "./run-loop.js";
import { resolveBaseRev } from "../workers/worker-cycle.js";
import type { AdvisoryAdjudicationMode, ModelNodeFlags } from "@server/core/game-registry/runtime-options.js";
import {
  shippedAdvisoryAdjudicationConfig,
  type AdvisoryAdjudicationConfig,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/config.js";

describe("provider circuit breaker", () => {
  test("defaults and explicit run-loop flags", () => {
    expect(providerCircuitConfigFromArgs(new Map())).toEqual({ threshold: 6, windowSeconds: 300, probeIntervalSeconds: 60 });
    expect(providerCircuitConfigFromArgs(new Map([
      ["--provider-outage-threshold", "3"],
      ["--provider-outage-window-seconds", "120"],
      ["--provider-probe-interval-seconds", "20"],
    ]))).toEqual({ threshold: 3, windowSeconds: 120, probeIntervalSeconds: 20 });
    expect(() => providerCircuitConfigFromArgs(new Map([["--provider-outage-threshold", "0"]]))).toThrow("positive integer");
    expect(() => providerCircuitConfigFromArgs(new Map([["--provider-outage-window-seconds", "NaN"]]))).toThrow("must be numeric");
  });

  test("opens on outage closures, probes with backoff, and resumes on success", async () => {
    let now = Date.parse("2026-09-15T18:00:00Z");
    const emit = jest.fn();
    const probe = jest.fn().mockResolvedValueOnce({ success: false, error: "HTTP 503" }).mockResolvedValue({ success: true });
    const breaker = createProviderCircuitBreaker(providerCircuitConfigFromArgs(new Map()), { now: () => now, emit, probe, log: () => {} });
    for (let i = 0; i < 5; i++) breaker.recordClosure("provider_outage");
    breaker.recordClosure("infrastructure_failure");
    expect(breaker.isOpen()).toBe(false);
    breaker.recordClosure("provider_outage");
    expect(breaker.isOpen()).toBe(true);
    expect(emit.mock.calls[0]?.[0]).toBe("provider_circuit_opened");
    expect(await breaker.probeIfDue()).toBe(false);
    now += 60_000;
    expect(await breaker.probeIfDue()).toBe(true);
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.snapshot().probe_interval_seconds).toBe(120);
    now += 119_999;
    expect(await breaker.probeIfDue()).toBe(false);
    now += 1;
    await breaker.probeIfDue();
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.snapshot().outage_count).toBe(0);
    expect(emit.mock.calls.map((call) => call[0])).toEqual([
      "provider_circuit_opened", "provider_probe", "provider_probe", "provider_circuit_closed",
    ]);
    breaker.recordClosure("provider_outage");
    expect(breaker.isOpen()).toBe(false);
  });

  test("expires old closures and caps failed-probe backoff at 300 seconds", async () => {
    let now = 0;
    const breaker = createProviderCircuitBreaker({ threshold: 2, windowSeconds: 300, probeIntervalSeconds: 60 }, {
      now: () => now, emit: () => {}, log: () => {}, probe: async () => { throw new Error("ECONNREFUSED"); },
    });
    breaker.recordClosure("provider_outage");
    now += 300_001;
    breaker.recordClosure("provider_outage");
    expect(breaker.isOpen()).toBe(false);
    breaker.recordClosure("provider_outage");
    for (const interval of [120, 240, 300, 300]) {
      now = Date.parse(breaker.snapshot().next_probe_at!);
      await breaker.probeIfDue();
      expect(breaker.isOpen()).toBe(true);
      expect(breaker.snapshot().probe_interval_seconds).toBe(interval);
    }
  });

  test("never launches overlapping probes or resets backoff for in-flight closures", async () => {
    let now = 0;
    let resolveProbe!: (result: { success: boolean }) => void;
    const probe = jest.fn(() => new Promise<{ success: boolean }>((resolve) => { resolveProbe = resolve; }));
    const breaker = createProviderCircuitBreaker({ threshold: 1, windowSeconds: 300, probeIntervalSeconds: 60 }, {
      now: () => now, emit: () => {}, log: () => {}, probe,
    });
    breaker.recordClosure("provider_outage");
    now += 60_000;
    const pending = breaker.probeIfDue();
    breaker.recordClosure("provider_outage");
    expect(await breaker.probeIfDue()).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    resolveProbe({ success: true });
    await pending;
    expect(breaker.isOpen()).toBe(false);
  });
});

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

describe("epochOrdinalForBoundary", () => {
  test("uses the persisted scheduler epoch ordinal and falls back when unavailable", () => {
    const { store } = tempState();
    try {
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      store.db.query("UPDATE epochs SET ordinal = 7 WHERE id = ?").run(epoch.id);

      expect(epochOrdinalForBoundary(store, epoch.id, 1)).toBe(7);
      expect(epochOrdinalForBoundary(store, "missing-epoch", 2)).toBe(2);
      expect(epochOrdinalForBoundary(store, undefined, 3)).toBe(3);
    } finally {
      store.db.close();
    }
  });
});

describe("workerJobClaimRecoveryFilters", () => {
  test("scopes failed-job recovery to both the claim and its worker owner", () => {
    expect(workerJobClaimRecoveryFilters({
      jobId: "job-1",
      payload: { target_claim_id: "claim-1", worker_id: "worker-1" },
    } as never)).toEqual({ claimIdFilter: "claim-1", workerIdFilter: "worker-1" });
  });
});

describe("selectRunLoopSchedulerCondition", () => {
  test("selects blocked and boundary conditions before transient work", () => {
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

describe("startWorkerSummaryIfEnabled", () => {
  test("has zero footprint when the flag is off", () => {
    const start = jest.fn();
    const store = new Proxy({} as StateStore, {
      get() {
        throw new Error("flag-off path accessed the store");
      },
    });

    expect(startWorkerSummaryIfEnabled({
      args: new Map(),
      store,
      runId: "run-off",
      globals: {} as never,
      start,
    })).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  test("records and handles the enabled flag before starting the processor", () => {
    const { store } = tempState();
    try {
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const stop = async () => {};
      const start = jest.fn(() => stop);

      expect(startWorkerSummaryIfEnabled({
        args: new Map([["--worker-summary", true]]),
        store,
        runId: run.id,
        globals: {} as never,
        start,
      })).toBe(stop);
      expect(start).toHaveBeenCalledTimes(1);
      expect(store.db.query<{ event_type: string; handled_at: string | null }, [string]>(
        "SELECT event_type, handled_at FROM events WHERE run_id = ? AND event_type = 'worker_summary_flag_recorded'",
      ).get(run.id)).toMatchObject({
        event_type: "worker_summary_flag_recorded",
        handled_at: expect.any(String),
      });
    } finally {
      store.db.close();
    }
  });
});

describe("startLibrarianConsumerIfEnabled", () => {
  test("has zero footprint when the flag is off", () => {
    const start = jest.fn();
    const store = new Proxy({} as StateStore, {
      get() {
        throw new Error("flag-off path accessed the store");
      },
    });

    expect(startLibrarianConsumerIfEnabled({
      args: new Map(),
      store,
      runId: "run-off",
      globals: {} as never,
      start,
    })).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  test("records and handles the enabled flag before starting the consumer", () => {
    const { store } = tempState();
    try {
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const stop = async () => {};
      const start = jest.fn(() => stop);

      expect(startLibrarianConsumerIfEnabled({
        args: new Map([["--librarian-consumer", true]]),
        store,
        runId: run.id,
        globals: {} as never,
        start,
      })).toBe(stop);
      expect(start).toHaveBeenCalledTimes(1);
      expect(store.db.query<{ event_type: string; handled_at: string | null }, [string]>(
        "SELECT event_type, handled_at FROM events WHERE run_id = ? AND event_type = 'librarian_consumer_flag_recorded'",
      ).get(run.id)).toMatchObject({
        event_type: "librarian_consumer_flag_recorded",
        handled_at: expect.any(String),
      });
    } finally {
      store.db.close();
    }
  });
});

describe("run-loop exit settlement", () => {
  test("pauses the run and releases its dispatch lease", async () => {
    const { dir, store } = tempState();
    seedRunHarness(store);
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
      expect(getDispatchState(settledStore, "test")?.active_workflow).toBeNull();
    } finally {
      settledStore.db.close();
    }
  });

  test("unexpected exit recovers active claims before releasing the dispatch lease", async () => {
    const { dir, store } = tempState();
    seedRunHarness(store);
    const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot: dir, stateDir: dir }, { baseRevision: "base-test" });
    const active = activateRun({ reason: "test run-loop start", runId: run.id, store });
    const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
    admitEpochTargets(store, {
      epochId: epoch.id,
      runId: run.id,
      candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91 }],
      workerPoolSize: 1,
    });
    expect(claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 })).not.toBeNull();
    store.db.close();

    await settleRunOnExit({
      globals: { dryRunAgents: true, model: "test", provider: "test", repoRoot: dir, stateDir: dir, thinkingLevel: "low" },
      args: new Map([["--run-id", run.id]]),
      leaseId: active.leaseId,
      stoppedReason: "error",
    });

    const settledStore = openState(dir);
    try {
      expect(getRun(settledStore, run.id)).toMatchObject({ status: "paused" });
      expect(activeClaimsForRun(settledStore, run.id)).toHaveLength(0);
      expect(getDispatchState(settledStore, "test")?.active_workflow).toBeNull();
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
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91 }],
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
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91 }],
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
      seedRunHarness(store);
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

  test("retries a partial error epoch under desired run after active work drains", () => {
    const { store } = tempState();
    const now = new Date("2026-09-15T12:00:00.000Z");
    const nextAttemptAt = "2026-09-15T12:02:00.000Z";
    try {
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      store.db.query(`UPDATE epochs SET status = 'error', admitted_count = 10, finished_count = 3,
        boundary_status = 'retry_scheduled', boundary_next_attempt_at = ? WHERE id = ?`).run(nextAttemptAt, epoch.id);

      expect(epochBoundaryWorkPending(store, run.id, now, true)).toBe(false);
      expect(boundaryRetryRest(store, run.id, 10 * 60_000, now.getTime(), true)).toEqual({
        ordinal: 1,
        nextAttemptAt,
        sleepMs: 2 * 60_000,
      });

      const launches: Array<{ trigger: string; epochId: string }> = [];
      expect(epochBoundaryWorkPending(store, run.id, new Date(nextAttemptAt), true)).toBe(true);
      expect(launchBoundaryRetryIfDue(
        store,
        run.id,
        (trigger, epochId) => launches.push({ trigger, epochId }),
        Date.parse(nextAttemptAt),
        true,
      )).toBe(true);
      expect(launches).toEqual([{ trigger: "retry scheduler epoch 1 boundary", epochId: epoch.id }]);
    } finally {
      store.db.close();
    }
  });

  test("waits to retry a partial error epoch while worker work remains in flight", () => {
    const { store } = tempState();
    try {
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      store.db.query(`UPDATE epochs SET status = 'error', admitted_count = 10, finished_count = 3,
        boundary_status = 'retry_scheduled', boundary_next_attempt_at = NULL WHERE id = ?`).run(epoch.id);

      const launches: Array<{ trigger: string; epochId: string }> = [];
      expect(epochBoundaryWorkPending(store, run.id, new Date(), false)).toBe(false);
      expect(launchBoundaryRetryIfDue(
        store,
        run.id,
        (trigger, epochId) => launches.push({ trigger, epochId }),
        Date.now(),
        false,
      )).toBe(false);
      expect(launches).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("logs a retry deadline once while waiting and once when due", () => {
    const retry = { ordinal: 3, nextAttemptAt: "2026-08-28T12:02:00.000Z" };
    const waiting = boundaryRetryLogTransition(null, retry, "waiting", 5_000);
    expect(waiting.message).toBe(
      "[run-loop] epoch 3: boundary retry due at 2026-08-28T12:02:00.000Z, sleeping 5000ms",
    );
    expect(boundaryRetryLogTransition(waiting.state, retry, "waiting", 5_000).message).toBeNull();

    const due = boundaryRetryLogTransition(waiting.state, retry, "due");
    expect(due.message).toBe(
      "[run-loop] epoch 3: boundary retry due at 2026-08-28T12:02:00.000Z, retrying now",
    );
    expect(boundaryRetryLogTransition(due.state, retry, "due").message).toBeNull();

    const changed = { ordinal: 3, nextAttemptAt: "2026-08-28T12:04:00.000Z" };
    expect(boundaryRetryLogTransition(due.state, changed, "waiting", 5_000).message).toBe(
      "[run-loop] epoch 3: boundary retry due at 2026-08-28T12:04:00.000Z, sleeping 5000ms",
    );
  });

  test("wakes at a future retry deadline without an activity trigger", async () => {
    const { store } = tempState();
    const startedAt = new Date("2026-08-28T12:00:00.000Z");
    try {
      jest.useFakeTimers({ now: startedAt });
      seedRunHarness(store);
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
      seedRunHarness(store);
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

describe("recordRunLoopFlags", () => {
  const nodeFlags = (advisoryAdjudication: AdvisoryAdjudicationMode): ModelNodeFlags => ({
    advisoryAdjudication,
    checkpointKnowledgeFeed: "on",
    checkpointKnowledgeCap: 50,
  });

  /** The shipped config with its model's thresholds carrying every §6.9 qualification bar. */
  function qualifiedConfig(): AdvisoryAdjudicationConfig {
    const shipped = shippedAdvisoryAdjudicationConfig();
    return {
      ...shipped,
      thresholds: {
        [shipped.model]: {
          passAt: 0.85,
          failAt: 0.15,
          qualification: "enforcement-qualified",
          labelSetHash: "labels",
          splitHash: "split",
          heldout: { negatives: 29, positives: 10, falseAccepts: 0, upper95: 0.0981 },
          calibratedAt: "2026-10-07T00:00:00.000Z",
        },
      },
    };
  }

  function recorded(advisoryAdjudication: AdvisoryAdjudicationMode, advisoryConfig?: AdvisoryAdjudicationConfig) {
    const { store } = tempState();
    try {
      seedRunHarness(store);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const warnings: string[] = [];
      recordRunLoopFlags(
        store,
        run.id,
        { writeSetFlags: { writeSetWidening: "header" }, nodeFlags: nodeFlags(advisoryAdjudication) },
        { ...(advisoryConfig && { advisoryConfig }), warn: (message) => warnings.push(message) },
      );
      const row = store.db.query<{ payload_json: string; handled_at: string | null }, [string]>(
        "SELECT payload_json, handled_at FROM events WHERE run_id = ? AND event_type = 'write_set_integration_flags'",
      ).get(run.id)!;
      expect(row.handled_at).toEqual(expect.any(String));
      return { payload: JSON.parse(row.payload_json) as Record<string, unknown>, warnings };
    } finally {
      store.db.close();
    }
  }

  const unchangedPayload = (advisoryAdjudication: AdvisoryAdjudicationMode) => ({
    write_set_widening: "header",
    advisory_adjudication: advisoryAdjudication,
    checkpoint_knowledge_feed: "on",
    checkpoint_knowledge_cap: 50,
    created_by: "run-loop",
  });

  test("off and shadow record exactly the existing payload and print nothing", () => {
    for (const mode of ["off", "shadow"] as const) {
      const { payload, warnings } = recorded(mode);
      expect(Object.keys(payload)).toEqual(Object.keys(unchangedPayload(mode)));
      expect(payload).toEqual(unchangedPayload(mode));
      expect(warnings).toEqual([]);
    }
  });

  test("enforce with the shipped exploratory thresholds records the shadow downgrade and warns once", () => {
    const { payload, warnings } = recorded("enforce");

    expect(payload).toEqual({
      ...unchangedPayload("enforce"),
      advisory_adjudication_effective: "shadow",
      advisory_adjudication_downgraded_reason: "not-enforcement-qualified",
    });
    expect(warnings).toEqual([
      "[advisory-adjudication] enforce requested; running shadow (not-enforcement-qualified). "
        + "Calibrate and write qualified thresholds to enable enforce.",
    ]);
  });

  test("enforce with enforcement-qualified thresholds records enforce as effective and does not warn", () => {
    const { payload, warnings } = recorded("enforce", qualifiedConfig());

    expect(payload).toEqual({ ...unchangedPayload("enforce"), advisory_adjudication_effective: "enforce" });
    expect(warnings).toEqual([]);
  });
});
