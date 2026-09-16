import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDispatchState, requestDispatch } from "@server/core/harness-state";
import { claimNextJob, completeJob, getJobByDedupeKey, requeueJob } from "@server/core/job-queue/kernel.js";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  closeSchedulerEpoch,
  closeWorkerState,
  createRun,
  openState,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "../../../run-state/test-harness.js";
import { requeueTargetsForRun, targetKeysFromArgv } from "./requeue-targets.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function candidate(): TargetCandidate {
  return {
    unit: "src/unit.c",
    symbol: "provider_outage_target",
    sourcePath: "src/unit.c",
    size: 64,
    fuzzy: 90,
    kind: "function",
  };
}

function fixture(): { epochId: string; runId: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "requeue-targets-state-"));
  tempDirs.push(dir);
  const store = openState(dir);
  seedRunHarness(store, "test", "base-test", dir);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
  admitEpochTargets(store, { epochId: epoch.id, runId: run.id, candidates: [candidate()], workerPoolSize: 1 });
  const job = claimNextJob(store, { kind: "worker", concurrencyLimit: 1, leaseMs: 60_000 });
  if (!job) throw new Error("expected worker job");
  completeJob(store, job.token, {});
  return { epochId: epoch.id, runId: run.id, store };
}

function capTargetWithProviderOutage(store: StateStore, runId: string): string {
  let targetId = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const claim = claimNextEpochTarget({ store, runId, workerId: `worker-${attempt}`, ttlSeconds: 300 });
    if (!claim) throw new Error(`expected claim ${attempt}`);
    targetId = claim.epochTargetId;
    closeWorkerState(store, {
      authority: { host: "requeue-targets-test" },
      workerStateId: claim.workerStateId,
      lifecycleStatus: "error",
      errorSummary: "LLM provider failed: invalid_request_error: no_biscuit_no_service",
      summary: {
        error: {
          kind: "provider_error",
          reasons: ["invalid_request_error: no_biscuit_no_service"],
        },
      },
      infrastructureFailure: { reason: "LLM provider failed: invalid_request_error: no_biscuit_no_service" },
    });
  }
  return targetId;
}

describe("requeue-targets", () => {
  test("reopens active-epoch targets with queued jobs and resets their provider-outage failure count", () => {
    const value = fixture();
    try {
      const targetId = capTargetWithProviderOutage(value.store, value.runId);
      const queuedJob = requeueJob(value.store, { kind: "worker", dedupeKey: targetId });
      const result = requeueTargetsForRun({
        cappedByProviderOutage: true,
        epochId: value.epochId,
        hasActiveLeaseProcess: () => ({ active: false }),
        reason: "requeue targets incorrectly capped during provider outage",
        runId: value.runId,
        stateDir: "unused",
        store: value.store,
        targetKeys: ["src/unit.c::provider_outage_target"],
      });

      expect(result).toMatchObject({
        status: "requeued",
        selected_target_count: 1,
        target_keys: ["src/unit.c::provider_outage_target"],
        requeued: [{
          epoch_target_id: targetId,
          job_id: queuedJob.jobId,
          infra_failure_count_before: 3,
          infra_failure_count_after: 0,
        }],
      });
      expect(value.store.db.query("SELECT status, infra_failure_count FROM epoch_targets WHERE id = ?").get(targetId))
        .toEqual({ status: "admitted", infra_failure_count: 0 });
      expect(getJobByDedupeKey(value.store, "worker", targetId)).toMatchObject({ status: "queued", attempts: 0 });
      expect(value.store.db.query("SELECT COUNT(*) AS count FROM jobs WHERE kind = 'worker' AND dedupe_key = ?").get(targetId))
        .toEqual({ count: 1 });
    } finally {
      value.store.db.close();
    }
  });

  test("leaves selected targets closed when their epoch is no longer active", () => {
    const value = fixture();
    try {
      const targetId = capTargetWithProviderOutage(value.store, value.runId);
      closeSchedulerEpoch(value.store, value.epochId, { status: "completed" });
      const result = requeueTargetsForRun({
        cappedByProviderOutage: true,
        epochId: value.epochId,
        hasActiveLeaseProcess: () => ({ active: false }),
        reason: "defer provider outage cap recovery",
        runId: value.runId,
        stateDir: "unused",
        store: value.store,
        targetKeys: [],
      });

      expect(result).toMatchObject({ status: "deferred", selected_target_count: 1 });
      expect(result.message).toContain("will re-admit at the next board admission");
      expect(value.store.db.query("SELECT status FROM epoch_targets WHERE id = ?").get(targetId)).toEqual({ status: "finished" });
      expect(getJobByDedupeKey(value.store, "worker", targetId)).toMatchObject({ status: "succeeded" });
    } finally {
      value.store.db.close();
    }
  });

  test("refuses while a live scheduler holds the run lease", () => {
    const value = fixture();
    try {
      initializeDispatchState(value.store, { gameId: "test", traceId: "trace-test" });
      const lease = requestDispatch(value.store, {
        actor: "runner",
        commandId: "command-run-live",
        correlationId: value.runId,
        gameId: "test",
        kind: "run",
        reason: "live scheduler",
        workflowId: value.runId,
      });
      if (lease.queued) throw new Error("expected active run lease");

      expect(() => requeueTargetsForRun({
        cappedByProviderOutage: false,
        epochId: value.epochId,
        hasActiveLeaseProcess: (_stateDir, leaseId) => ({ active: leaseId === lease.leaseId }),
        reason: "operator recovery",
        runId: value.runId,
        stateDir: "unused",
        store: value.store,
        targetKeys: [],
      })).toThrow(`Dispatch lease ${lease.leaseId} still has a live scheduler process; target requeue refused`);
    } finally {
      value.store.db.close();
    }
  });

  test("keeps every repeated target-key argument", () => {
    expect(targetKeysFromArgv([
      "requeue-targets", "--target-key", "one::symbol", "--target-key=two::symbol", "--target-key", "three::symbol",
    ])).toEqual(["one::symbol", "two::symbol", "three::symbol"]);
  });
});
