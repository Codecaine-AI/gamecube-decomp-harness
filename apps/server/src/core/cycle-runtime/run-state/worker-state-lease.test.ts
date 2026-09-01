import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  closeWorkerState,
  createRun,
  openState,
  startSchedulerEpoch,
} from "./index.js";

describe("worker state transaction fencing", () => {
  test("rolls back a close when its transaction cannot update the epoch rollup", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "worker-state-close-rollback-"));
    const store = openState(stateDir);
    try {
      const run = createRun(
        store,
        "matched_code_percent",
        100,
        1,
        { gameId: "melee", stateDir },
        { baseRevision: "base-test" },
      );
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          {
            kind: "function",
            unit: "unit",
            symbol: "fn",
            sourcePath: "src/fn.c",
            size: 64,
            fuzzy: 90,
          },
        ],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({
        store,
        runId: run.id,
        workerId: "worker-current",
        baseRev: "base",
        ttlSeconds: 1_800,
      });
      if (!claim) throw new Error("Expected a worker claim");

      store.db.exec(
        "CREATE TRIGGER fail_epoch_rollup BEFORE UPDATE ON epochs BEGIN SELECT RAISE(ABORT, 'epoch rollup blocked'); END",
      );
      expect(() =>
        closeWorkerState(store, {
          workerStateId: claim.workerStateId,
          authority: { host: "worker-state-close-rollback-test" },
          lifecycleStatus: "finished",
        }),
      ).toThrow();
      expect(
        store.db.query("SELECT lifecycle_status, ended_at FROM worker_state WHERE id = ?").get(claim.workerStateId),
      ).toEqual({ lifecycle_status: "running", ended_at: null });
      expect(
        store.db.query("SELECT status, closed_at FROM target_claims WHERE id = ?").get(claim.claimId),
      ).toEqual({ status: "active", closed_at: null });
    } finally {
      store.db.close();
    }
  });
});
