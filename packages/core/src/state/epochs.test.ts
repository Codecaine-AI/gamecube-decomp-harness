import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TargetCandidate } from "../types/index.js";
import { openState, type StateStore } from "./db.js";
import {
  admitExistingQueuedEpochTargets,
  admitEpochTargets,
  closeSchedulerEpoch,
  parseEpochSize,
  refillEpochReadyQueue,
  schedulerEpochProgress,
  selectEpochAdmissionCandidates,
  startSchedulerEpoch,
} from "./epochs.js";
import { leaseNextQueuedTarget } from "./leases.js";
import { recordWorkerReport } from "./reports.js";
import { createRun } from "./runs.js";
import { refillQueuedTargets } from "./targets.js";

const tempDirs: string[] = [];

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "scheduler-epoch-state-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function candidate(index: number, sourcePath: string, priority = 100 - index): TargetCandidate {
  return {
    unit: `unit_${index}`,
    symbol: `fn_${index}`,
    sourcePath,
    size: 64 + index,
    fuzzy: 99 - index / 100,
    priority,
    reason: `candidate ${index}`,
  };
}

describe("epoch size parsing", () => {
  test("parses fixed and full epoch sizes", () => {
    expect(parseEpochSize("32")).toEqual({ mode: "fixed", value: 32 });
    expect(parseEpochSize(64)).toEqual({ mode: "fixed", value: 64 });
    expect(parseEpochSize("Full")).toEqual({ mode: "full", value: null });
  });

  test("rejects invalid epoch sizes", () => {
    expect(() => parseEpochSize("0")).toThrow();
    expect(() => parseEpochSize("-1")).toThrow();
    expect(() => parseEpochSize("half")).toThrow();
  });
});

describe("epoch admission selection", () => {
  test("selects distinct source paths before repeated paths", () => {
    const selected = selectEpochAdmissionCandidates({
      candidates: [
        candidate(1, "src/a.c", 500),
        candidate(2, "src/a.c", 499),
        candidate(3, "src/b.c", 498),
        candidate(4, "src/c.c", 497),
      ],
      size: { mode: "fixed", value: 3 },
    });

    expect(selected.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_3", "fn_4"]);
  });

  test("excludes missing, locked, and existing candidates", () => {
    const selected = selectEpochAdmissionCandidates({
      candidates: [
        candidate(1, "src/a.c"),
        candidate(2, ""),
        candidate(3, "src/locked.c"),
        candidate(4, "src/existing.c"),
        candidate(5, "src/b.c"),
      ],
      existingKeys: new Set(["unit_4::fn_4"]),
      lockedSources: new Set(["src/locked.c"]),
      size: { mode: "fixed", value: 5 },
    });

    expect(selected.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_5"]);
    expect(selected.skippedMissingSource).toBe(1);
    expect(selected.skippedLockedSource).toBe(1);
    expect(selected.skippedExisting).toBe(1);
  });

  test("full mode admits every eligible board candidate without spinning on an empty board", () => {
    const full = selectEpochAdmissionCandidates({
      candidates: [candidate(1, "src/a.c"), candidate(2, "src/a.c"), candidate(3, "src/b.c")],
      size: { mode: "full", value: null },
    });
    expect(full.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_3", "fn_2"]);

    const empty = selectEpochAdmissionCandidates({ candidates: [], size: { mode: "full", value: null } });
    expect(empty.selected).toEqual([]);
  });
});

describe("scheduler epoch state", () => {
  test("persists fixed admission and refills ready queue from the admitted set", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 2);
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 4 },
        readyQueueSize: 2,
        candidateWindow: 16,
      });
      const admission = admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c"), candidate(2, "src/b.c"), candidate(3, "src/c.c"), candidate(4, "src/d.c"), candidate(5, "src/e.c")],
        size: { mode: "fixed", value: 4 },
        readyQueueSize: 2,
      });

      expect(admission.admitted).toBe(4);
      expect(admission.queued).toBe(2);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 4, readyQueued: 2, leased: 0, completed: 0, remaining: 4 });

      const leased = leaseNextQueuedTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(leased).not.toBeNull();
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ readyQueued: 1, leased: 1, completed: 0 });

      recordWorkerReport({
        store,
        runId: run.id,
        leaseId: leased?.leaseId ?? "",
        reportType: "progress",
        summaryPath: "/tmp/summary.json",
        payload: { worker_id: "worker-1" },
      });
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ readyQueued: 1, leased: 0, completed: 1, remaining: 3 });

      const refill = refillEpochReadyQueue(store, epoch.id);
      expect(refill.inserted).toBe(1);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ readyQueued: 2, completed: 1, remaining: 3 });
    } finally {
      store.db.close();
    }
  });

  test("provider errors return leased epoch targets to the ready queue", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        readyQueueSize: 1,
        candidateWindow: 4,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c")],
        size: { mode: "fixed", value: 1 },
        readyQueueSize: 1,
      });
      const leased = leaseNextQueuedTarget({ store, runId: run.id, workerId: "worker-provider", baseRev: "base" });
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ readyQueued: 0, leased: 1 });

      recordWorkerReport({
        store,
        runId: run.id,
        leaseId: leased?.leaseId ?? "",
        reportType: "provider_error",
        summaryPath: "/tmp/provider.json",
        payload: { worker_id: "worker-provider" },
      });

      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ readyQueued: 1, leased: 0, completed: 0, remaining: 1 });
    } finally {
      store.db.close();
    }
  });

  test("adopts existing queued targets into a new scheduler epoch", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      refillQueuedTargets(store, run.id, [candidate(1, "src/a.c")], { targetSize: 1 });
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 2 },
        readyQueueSize: 1,
        candidateWindow: 4,
      });
      const adopted = admitExistingQueuedEpochTargets(store, { epochId: epoch.id, runId: run.id, limit: 2 });
      expect(adopted.admitted).toBe(1);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 1, readyQueued: 1, remaining: 1 });
      const closed = closeSchedulerEpoch(store, epoch.id, { status: "completed", boundaryStatus: "dry_run" });
      expect(closed).toMatchObject({ epochId: epoch.id, status: "completed" });
    } finally {
      store.db.close();
    }
  });

  test("adopts queued targets from a closed scheduler epoch into the next epoch", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      const firstEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        readyQueueSize: 1,
        candidateWindow: 4,
      });
      admitEpochTargets(store, {
        epochId: firstEpoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c", 500)],
        size: { mode: "fixed", value: 1 },
        readyQueueSize: 1,
      });
      closeSchedulerEpoch(store, firstEpoch.id, { status: "paused", boundaryStatus: "regression_pause" });

      const nextEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        readyQueueSize: 1,
        candidateWindow: 4,
      });
      const adopted = admitExistingQueuedEpochTargets(store, { epochId: nextEpoch.id, runId: run.id, limit: 1 });

      expect(adopted.admitted).toBe(1);
      expect(schedulerEpochProgress(store, nextEpoch.id)).toMatchObject({ admitted: 1, readyQueued: 1, remaining: 1 });
    } finally {
      store.db.close();
    }
  });
});
