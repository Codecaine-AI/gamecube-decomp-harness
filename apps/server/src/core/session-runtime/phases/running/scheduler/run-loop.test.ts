import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activeClaimsForSession,
  addEvent,
  admitEpochTargets,
  claimNextEpochTarget,
  closeSchedulerEpoch,
  closeWorkerState,
  createRun,
  openState,
  schedulerEpochProgress,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import {
  epochBoundaryWorkPending,
  evaluateFastKnowledgeMaintenanceDecision,
  forceFinishActiveEpoch,
  integrationResolverLockPaths,
  selectIntegrationResolverBatch,
} from "./run-loop.js";

const tempDirs: string[] = [];

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "run-loop-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("evaluateFastKnowledgeMaintenanceDecision", () => {
  test("does nothing before interval or report count triggers are due", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 1_000,
        nowMs: 120_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 4,
        running: false,
      }),
    ).toMatchObject({ action: "none", reportDue: false, timeDue: false });
  });

  test("skips due fast refreshes when no worker states changed", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 0,
        nowMs: 180_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 0,
        running: false,
      }),
    ).toMatchObject({ action: "skip_no_new_reports", reason: "no_new_reports", reportDue: false, timeDue: true });
  });

  test("starts on coalesced report count even before the interval", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 0,
        nowMs: 60_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 16,
        running: false,
      }),
    ).toMatchObject({ action: "start", reason: "report_count", reportDue: true, timeDue: false });
  });

  test("defers due fast refreshes while one is already running", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 0,
        nowMs: 180_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 20,
        running: true,
      }),
    ).toMatchObject({ action: "defer", reason: "report_count", reportDue: true, timeDue: true });
  });
});

describe("epochBoundaryWorkPending", () => {
  test("treats a drained active epoch as boundary work that outranks KG maintenance", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 });
      expect(epochBoundaryWorkPending(store, run.id)).toBe(false);

      closeWorkerState(store, {
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

  test("treats a drained failed boundary as retry work", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 });
      closeWorkerState(store, {
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "timeout",
        epochTargetStatus: "finished",
        summary: { test: true },
        timeoutSummary: "test finished",
      });
      closeSchedulerEpoch(store, epoch.id, { status: "error", boundaryStatus: "error" });

      expect(epochBoundaryWorkPending(store, run.id)).toBe(true);
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

describe("forceFinishActiveEpoch", () => {
  test("marks active claims and admitted epoch targets finished", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 3);
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 3 },
        workerPoolSize: 3,
        candidateWindow: 3,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          { unit: "unit", symbol: "claimed_fn", sourcePath: "src/claimed.c", size: 64, fuzzy: 91, priority: 3, reason: "test" },
          { unit: "unit", symbol: "queued_a", sourcePath: "src/a.c", size: 64, fuzzy: 90, priority: 2, reason: "test" },
          { unit: "unit", symbol: "queued_b", sourcePath: "src/b.c", size: 64, fuzzy: 89, priority: 1, reason: "test" },
        ],
        size: { mode: "fixed", value: 3 },
        workerPoolSize: 3,
      });
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 });
      expect(claim).not.toBeNull();
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 2, claimed: 1, finished: 0, remaining: 3 });

      const eventId = addEvent(store, run.id, "epoch_force_finish_requested", "dashboard", { epoch_id: epoch.id, ordinal: epoch.ordinal });
      const result = forceFinishActiveEpoch(store, run.id, { id: eventId, payload: { epoch_id: epoch.id, ordinal: epoch.ordinal } });

      expect(result).toMatchObject({ epochId: epoch.id, ordinal: epoch.ordinal, activeClaimsClosed: 1, openTargetsFinished: 2 });
      expect(activeClaimsForSession(store, run.id)).toHaveLength(0);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 0, claimed: 0, finished: 3, remaining: 0 });

      const requestEvent = store.db.query("SELECT handled_at FROM events WHERE id = ?").get(eventId) as Record<string, unknown>;
      expect(requestEvent.handled_at).not.toBeNull();
      const finishedEvents = store.db
        .query("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'epoch_force_finished'")
        .get(run.id) as Record<string, unknown>;
      expect(Number(finishedEvents.count ?? 0)).toBe(1);
      const worker = store.db.query("SELECT lifecycle_status, error_summary FROM worker_state WHERE id = ?").get(claim?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(worker?.lifecycle_status).toBe("cancelled");
      expect(String(worker?.error_summary ?? "")).toContain("Manual epoch finish requested");
    } finally {
      store.db.close();
    }
  });

  test("does not apply a stale finish request to the next active epoch", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      const firstEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      closeSchedulerEpoch(store, firstEpoch.id, { status: "completed" });
      const secondEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: secondEpoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "new_epoch_fn", sourcePath: "src/new.c", size: 64, fuzzy: 91, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });

      const eventId = addEvent(store, run.id, "epoch_force_finish_requested", "dashboard", { epoch_id: firstEpoch.id, ordinal: firstEpoch.ordinal });
      const result = forceFinishActiveEpoch(store, run.id, { id: eventId, payload: { epoch_id: firstEpoch.id, ordinal: firstEpoch.ordinal } });

      expect(result.epochId).toBeNull();
      expect(schedulerEpochProgress(store, secondEpoch.id)).toMatchObject({ available: 1, claimed: 0, finished: 0, remaining: 1 });
      const requestEvent = store.db.query("SELECT handled_at FROM events WHERE id = ?").get(eventId) as Record<string, unknown>;
      expect(requestEvent.handled_at).not.toBeNull();
    } finally {
      store.db.close();
    }
  });
});
