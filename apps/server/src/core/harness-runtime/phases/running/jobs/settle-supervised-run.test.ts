import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDispatchState } from "@server/core/harness-state";
import { activateRun } from "../run-control.js";
import {
  activeClaimsForRun,
  admitEpochTargets,
  claimNextEpochTarget,
  createRun,
  getRun,
  openState,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { settleRunOnExit } from "./settle-supervised-run.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function fixture(): {
  active: ReturnType<typeof activateRun>;
  claim: NonNullable<ReturnType<typeof claimNextEpochTarget>>;
  dir: string;
  globals: GlobalArgs;
  run: ReturnType<typeof createRun>;
  store: StateStore;
} {
  const dir = mkdtempSync(join(tmpdir(), "settle-supervised-run-"));
  tempDirs.push(dir);
  const store = openState(dir);
  seedRunHarness(store);
  const run = createRun(
    store,
    "matched_code_percent",
    100,
    1,
    { gameId: "test", repoRoot: dir, stateDir: dir },
    { baseRevision: "base-test" },
  );
  const active = activateRun({ reason: "test run-loop start", runId: run.id, store });
  const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91 }],
    workerPoolSize: 1,
  });
  const claim = claimNextEpochTarget({
    baseRev: "base-test",
    runId: run.id,
    store,
    ttlSeconds: 1_800,
    workerId: "worker-1",
  });
  if (!claim) throw new Error("expected active claim");
  const workerJob = store.db
    .query("SELECT job_id FROM jobs WHERE kind = 'worker' AND run_id = ? LIMIT 1")
    .get(run.id) as { job_id: string } | null;
  if (!workerJob) throw new Error("expected worker job");
  store.db
    .query(
      `UPDATE jobs
       SET payload_json = json_set(payload_json, '$.target_claim_id', ?, '$.worker_id', ?)
       WHERE job_id = ?`,
    )
    .run(claim.claimId, claim.workerId, workerJob.job_id);
  const globals: GlobalArgs = {
    dryRunAgents: true,
    model: "test",
    provider: "test",
    repoRoot: dir,
    stateDir: dir,
    thinkingLevel: "low",
  };
  return { active, claim, dir, globals, run, store };
}

describe("settleRunOnExit orphan recovery", () => {
  test("recovers a cancelled worker job's active claim before graceful settlement", async () => {
    const f = fixture();
    f.store.db
      .query("UPDATE jobs SET status = 'cancelled', completed_at = datetime('now') WHERE json_extract(payload_json, '$.target_claim_id') = ?")
      .run(f.claim.claimId);
    f.store.db.close();

    await settleRunOnExit({
      args: new Map([["--run-id", f.run.id]]),
      globals: f.globals,
      leaseId: f.active.leaseId,
      stoppedReason: "signal",
    });

    const settled = openState(f.dir);
    try {
      expect(activeClaimsForRun(settled, f.run.id)).toHaveLength(0);
      expect(getRun(settled, f.run.id)).toMatchObject({ status: "paused" });
      expect(getDispatchState(settled, "test")?.active_workflow).toBeNull();
      expect(settled.db
        .query("SELECT json_extract(summary_json, '$.recovery_reason') AS reason FROM worker_state WHERE id = ?")
        .get(f.claim.workerStateId)).toEqual({
        reason: "run-loop exit: orphaned active claim (worker job cancelled)",
      });
    } finally {
      settled.db.close();
    }
  });

  test("leaves an active claim alone while its worker job is still in flight", async () => {
    const f = fixture();
    f.store.db
      .query("UPDATE jobs SET status = 'running' WHERE json_extract(payload_json, '$.target_claim_id') = ?")
      .run(f.claim.claimId);
    f.store.db.close();

    await expect(settleRunOnExit({
      args: new Map([["--run-id", f.run.id]]),
      globals: f.globals,
      leaseId: f.active.leaseId,
      stoppedReason: "signal",
    })).rejects.toThrow("still has 1 active claim(s)");

    const unsettled = openState(f.dir);
    try {
      expect(activeClaimsForRun(unsettled, f.run.id).map((claim) => claim.claimId)).toEqual([f.claim.claimId]);
      expect(getRun(unsettled, f.run.id)).toMatchObject({ status: "active" });
      expect(getDispatchState(unsettled, "test")?.active_workflow).toMatchObject({
        kind: "run",
        workflow_id: f.run.id,
      });
    } finally {
      unsettled.db.close();
    }
  });
});
