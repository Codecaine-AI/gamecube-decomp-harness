import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { cancelJob, claimNextJob } from "@server/core/job-queue/kernel.js";
import type { ClaimToken } from "@server/core/job-queue/types.js";
import {
  admitEpochTargets,
  appendWorkerSessionId,
  claimNextEpochTarget,
  closeWorkerState,
  recordWorkerCheckpoint,
  setClaimWorktreePath,
  startSchedulerEpoch,
  updateWorkerStateBaselineScore,
  type ClaimedTarget,
} from "./index.js";
import { widenClaimWriteSet } from "./worker-state.js";
import { createRun } from "./runs.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { store: StateStore; claimed: ClaimedTarget; token: ClaimToken; jobId: string } {
  const dir = mkdtempSync(join(tmpdir(), "worker-state-token-"));
  tempDirs.push(dir);
  const store = openState(dir);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
    candidateWindow: 1,
  });
  const candidate: TargetCandidate = {
    unit: "unit_1",
    symbol: "fn_1",
    sourcePath: "src/a.c",
    size: 64,
    fuzzy: 50,
    priority: 100,
    reason: "token test",
  };
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [candidate],
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
  });
  const jobClaim = claimNextJob(store, { kind: "worker", concurrencyLimit: 1, leaseMs: 60_000 });
  if (!jobClaim) throw new Error("Expected worker job claim");
  const claimed = claimNextEpochTarget({
    store,
    runId: run.id,
    workerId: "worker-1",
    baseRev: "base-test",
    ttlSeconds: 1_800,
  });
  if (!claimed) throw new Error("Expected target claim");
  return { store, claimed, token: jobClaim.token, jobId: jobClaim.job.jobId };
}

type Mode = "valid" | "stale" | "host";

function exercise(name: string, mode: Mode): void {
  const { store, claimed, token, jobId } = fixture();
  try {
    if (mode === "stale") cancelJob(store, { jobId, reason: "token fence test" });
    const authority = mode === "host" ? { host: "worker-state-token-test" } : token;
    switch (name) {
      case "recordWorkerCheckpoint":
        recordWorkerCheckpoint(store, {
          workerStateId: claimed.workerStateId,
          runId: claimed.runId,
          epochId: claimed.epochId,
          epochTargetId: claimed.epochTargetId,
          targetClaimId: claimed.claimId,
          attemptIndex: 0,
          oldScore: 50,
          newScore: 51,
          exactMatch: false,
          hardGatesPassed: true,
          validationStatus: "passed",
          authority,
        });
        break;
      case "closeWorkerState":
        closeWorkerState(store, { workerStateId: claimed.workerStateId, lifecycleStatus: "finished", authority });
        break;
      case "widenClaimWriteSet":
        widenClaimWriteSet(
          store,
          claimed.claimId,
          [{ path: "include/a.h", category: "owning-header", rung: 2, addedBy: "widening", wideningId: "widen-1" }],
          authority,
        );
        break;
      case "setClaimWorktreePath":
        setClaimWorktreePath(store, claimed.claimId, claimed.workerStateId, "/tmp/worker-tree", authority);
        break;
      case "appendWorkerSessionId":
        appendWorkerSessionId(store, claimed.workerStateId, "session-1", authority);
        break;
      case "updateWorkerStateBaselineScore":
        updateWorkerStateBaselineScore(store, claimed.workerStateId, 55, authority);
        break;
      default:
        throw new Error(`Unknown worker-state operation: ${name}`);
    }
  } finally {
    store.db.close();
  }
}

describe("worker-state claim token fencing", () => {
  const functions = [
    "recordWorkerCheckpoint",
    "closeWorkerState",
    "widenClaimWriteSet",
    "setClaimWorktreePath",
    "appendWorkerSessionId",
    "updateWorkerStateBaselineScore",
  ];

  for (const name of functions) {
    test(`${name} accepts a valid token`, () => {
      expect(() => exercise(name, "valid")).not.toThrow();
    });

    test(`${name} rejects a cancelled job token`, () => {
      expect(() => exercise(name, "stale")).toThrow("stale claim token");
    });

    test(`${name} accepts host authority`, () => {
      expect(() => exercise(name, "host")).not.toThrow();
    });
  }
});
