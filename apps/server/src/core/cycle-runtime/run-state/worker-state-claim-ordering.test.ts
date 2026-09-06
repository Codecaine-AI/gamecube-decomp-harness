import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  closeWorkerState,
  createRun,
  recordWorkerCheckpoint,
  startSchedulerEpoch,
} from "./index.js";
import type { ClaimedTarget } from "./worker-state.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempState(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "worker-state-claim-ordering-"));
  tempDirs.push(dir);
  return openState(dir);
}

function candidate(index: number, sourcePath: string): TargetCandidate {
  return {
    kind: "function",
    unit: `unit_${index}`,
    symbol: `fn_${index}`,
    sourcePath,
    size: 64 + index,
    fuzzy: 99 - index / 100,
  };
}

function setupEpoch(store: StateStore, candidates: TargetCandidate[]) {
  const run = createRun(store, "matched_code_percent", 100, candidates.length, { gameId: "test" }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: candidates.length });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates,
    workerPoolSize: candidates.length,
  });
  return run;
}

function claim(store: StateStore, runId: string, workerId: string) {
  return claimNextEpochTarget({ store, runId, workerId, baseRev: "base", ttlSeconds: 1_800 });
}

function checkpoint(store: StateStore, claimed: ClaimedTarget, newScore = 100) {
  return recordWorkerCheckpoint(store, {
    workerStateId: claimed.workerStateId,
    runId: claimed.runId,
    epochId: claimed.epochId,
    epochTargetId: claimed.epochTargetId,
    targetClaimId: claimed.claimId,
    attemptIndex: newScore === 100 ? 2 : 1,
    oldScore: Number(claimed.target.fuzzy),
    newScore,
    exactMatch: newScore === 100,
    hardGatesPassed: true,
    validationStatus: "passed",
    authority: { host: "worker-state-claim-ordering-test" },
  });
}

function recordAppliedOutcome(store: StateStore, claimed: ClaimedTarget, checkpointId: string) {
  store.db.query(`
    INSERT INTO integration_outcomes (
      id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id,
      worker_checkpoint_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', datetime('now'), datetime('now'))
  `).run(`applied-${checkpointId}`, claimed.runId, claimed.epochId, claimed.epochTargetId,
    claimed.claimId, claimed.workerStateId, checkpointId);
}

function readmitClosedClaim(store: StateStore, claimed: ClaimedTarget) {
  closeWorkerState(store, {
    workerStateId: claimed.workerStateId,
    authority: { host: "worker-state-claim-ordering-test" },
    lifecycleStatus: "error",
    errorSummary: "provider error",
    summary: { source: "original-worker" },
  });
  // Reproduce rows written by the old infrastructure-failure close path.
  store.db.query("UPDATE epoch_targets SET status = 'admitted', claimed_at = NULL, finished_at = NULL WHERE id = ?")
    .run(claimed.epochTargetId);
}

describe("worker target claim ordering", () => {
  test("skips a re-admitted target with selectable evidence and claims the next target in the same call", () => {
    const store = tempState();
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const run = setupEpoch(store, [candidate(1, "src/first.c"), candidate(2, "src/second.c")]);
      const first = claim(store, run.id, "worker-1")!;
      checkpoint(store, first);
      readmitClosedClaim(store, first);

      expect(claim(store, run.id, "worker-2")?.target.symbol).toBe("fn_2");
      expect(claim(store, run.id, "worker-3")).toBeNull();
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls[0]?.[0]).toContain(first.epochTargetId);
    } finally {
      warning.mockRestore();
      store.db.close();
    }
  });

  test("self-heals a skipped target to finished with its best checkpoint selected and applied evidence preserved", () => {
    const store = tempState();
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const run = setupEpoch(store, [candidate(1, "src/first.c")]);
      const first = claim(store, run.id, "worker-1")!;
      checkpoint(store, first, 99.5);
      const best = checkpoint(store, first);
      recordAppliedOutcome(store, first, best.id);
      readmitClosedClaim(store, first);
      store.db.query("UPDATE worker_checkpoints SET selected = 0 WHERE worker_state_id = ?").run(first.workerStateId);
      store.db.query("UPDATE worker_state SET best_checkpoint_id = NULL WHERE id = ?").run(first.workerStateId);

      expect(claim(store, run.id, "worker-2")).toBeNull();
      expect(store.db.query("SELECT status, finished_at FROM epoch_targets WHERE id = ?").get(first.epochTargetId))
        .toMatchObject({ status: "finished", finished_at: expect.any(String) });
      expect(store.db.query("SELECT best_checkpoint_id, best_score, exact, error_summary, summary_json FROM worker_state WHERE id = ?")
        .get(first.workerStateId)).toEqual({
          best_checkpoint_id: best.id, best_score: 100, exact: 1,
          error_summary: "provider error", summary_json: '{"source":"original-worker"}',
        });
      expect(store.db.query("SELECT id FROM worker_checkpoints WHERE worker_state_id = ? AND selected = 1").all(first.workerStateId))
        .toEqual([{ id: best.id }]);
      expect(store.db.query("SELECT status FROM integration_outcomes WHERE worker_checkpoint_id = ?").get(best.id))
        .toEqual({ status: "applied" });
      expect(store.db.query("SELECT status FROM target_claims WHERE id = ?").get(first.claimId)).toEqual({ status: "closed" });
      expect(store.db.query("SELECT finished_count FROM epochs WHERE id = ?").get(first.epochId)).toEqual({ finished_count: 1 });
    } finally {
      warning.mockRestore();
      store.db.close();
    }
  });

  test("recycles a closed claim without execution evidence using the same unique claim and worker state", () => {
    const store = tempState();
    try {
      const run = setupEpoch(store, [candidate(1, "src/first.c"), candidate(2, "src/second.c")]);
      const first = claim(store, run.id, "worker-1")!;
      closeWorkerState(store, {
        workerStateId: first.workerStateId,
        authority: { host: "worker-state-claim-ordering-test" },
        lifecycleStatus: "error",
        infrastructureFailure: { reason: "server_is_overloaded" },
      });
      expect(store.db.query("SELECT status FROM epoch_targets WHERE id = ?").get(first.epochTargetId))
        .toEqual({ status: "admitted" });

      expect(claim(store, run.id, "worker-2")).toMatchObject({
        claimId: first.claimId, workerStateId: first.workerStateId,
        epochTargetId: first.epochTargetId, workerId: "worker-2",
      });
      expect(store.db.query("SELECT COUNT(*) AS count FROM target_claims WHERE epoch_target_id = ?").get(first.epochTargetId))
        .toEqual({ count: 1 });
    } finally {
      store.db.close();
    }
  });

  test("infrastructure failure finishes a target with selectable evidence instead of re-admitting it", () => {
    const store = tempState();
    try {
      const run = setupEpoch(store, [candidate(1, "src/first.c")]);
      const first = claim(store, run.id, "worker-1")!;
      const best = checkpoint(store, first);
      recordAppliedOutcome(store, first, best.id);
      store.db.query("UPDATE worker_checkpoints SET selected = 0 WHERE id = ?").run(best.id);

      closeWorkerState(store, {
        workerStateId: first.workerStateId,
        authority: { host: "worker-state-claim-ordering-test" },
        lifecycleStatus: "error",
        epochTargetStatus: "admitted",
        infrastructureFailure: { reason: "server_is_overloaded" },
      });

      expect(store.db.query("SELECT status, infra_failure_count FROM epoch_targets WHERE id = ?").get(first.epochTargetId))
        .toEqual({ status: "finished", infra_failure_count: 1 });
      expect(store.db.query("SELECT selected FROM worker_checkpoints WHERE id = ?").get(best.id)).toEqual({ selected: 1 });
      expect(store.db.query("SELECT best_checkpoint_id FROM worker_state WHERE id = ?").get(first.workerStateId))
        .toEqual({ best_checkpoint_id: best.id });
      expect(store.db.query("SELECT status FROM integration_outcomes WHERE worker_checkpoint_id = ?").get(best.id))
        .toEqual({ status: "applied" });
      expect(store.db.query("SELECT status FROM target_claims WHERE id = ?").get(first.claimId)).toEqual({ status: "closed" });
      expect(store.db.query("SELECT finished_count FROM epochs WHERE id = ?").get(first.epochId)).toEqual({ finished_count: 1 });
      expect(claim(store, run.id, "worker-2")).toBeNull();
    } finally {
      store.db.close();
    }
  });

  test("recycling a claim preserves non-selectable checkpoints referenced by integration outcomes", () => {
    const store = tempState();
    try {
      const run = setupEpoch(store, [candidate(1, "src/first.c")]);
      const first = claim(store, run.id, "worker-1")!;
      const integrated = checkpoint(store, first);
      recordAppliedOutcome(store, first, integrated.id);
      store.db.query("UPDATE worker_checkpoints SET selectable = 0 WHERE id = ?").run(integrated.id);
      const discarded = checkpoint(store, first, 98);
      readmitClosedClaim(store, first);

      expect(claim(store, run.id, "worker-2")?.claimId).toBe(first.claimId);
      expect(store.db.query("SELECT id FROM worker_checkpoints WHERE worker_state_id = ?").all(first.workerStateId))
        .toEqual([{ id: integrated.id }]);
      expect(store.db.query("SELECT id FROM worker_checkpoints WHERE id = ?").get(discarded.id)).toBeNull();
      expect(store.db.query("SELECT status FROM integration_outcomes WHERE worker_checkpoint_id = ?").get(integrated.id))
        .toEqual({ status: "applied" });
    } finally {
      store.db.close();
    }
  });

  test("excludes an active same-file target until its claim closes", () => {
    const store = tempState();
    try {
      const run = setupEpoch(store, [
        candidate(1, "src/shared.c"),
        candidate(2, "src/shared.c"),
        candidate(3, "src/other.c"),
      ]);

      const first = claim(store, run.id, "worker-1");
      const differentFile = claim(store, run.id, "worker-2");
      const blocked = claim(store, run.id, "worker-3");

      expect(first?.target.symbol).toBe("fn_1");
      expect(differentFile?.target.symbol).toBe("fn_3");
      expect(blocked).toBeNull();

      closeWorkerState(store, {
        workerStateId: first?.workerStateId ?? "",
        authority: { host: "worker-state-claim-ordering-test" },
        lifecycleStatus: "finished",
      });

      expect(claim(store, run.id, "worker-4")?.target.symbol).toBe("fn_2");
    } finally {
      store.db.close();
    }
  });

  test("orders distinct files by admission index instead of priority", () => {
    const store = tempState();
    try {
      const run = setupEpoch(store, [candidate(1, "src/first.c"), candidate(2, "src/second.c")]);
      store.db.query("UPDATE epoch_targets SET priority = 1 WHERE symbol = 'fn_1'").run();
      store.db.query("UPDATE epoch_targets SET priority = 999 WHERE symbol = 'fn_2'").run();

      expect(claim(store, run.id, "worker-1")?.target.symbol).toBe("fn_1");
      expect(claim(store, run.id, "worker-2")?.target.symbol).toBe("fn_2");
    } finally {
      store.db.close();
    }
  });

  test("does not treat a TTL-expired claim as an active file lock", () => {
    const store = tempState();
    try {
      const run = setupEpoch(store, [candidate(1, "src/shared.c"), candidate(2, "src/shared.c")]);
      const first = claim(store, run.id, "worker-1");
      expect(first?.target.symbol).toBe("fn_1");

      store.db
        .query("UPDATE target_claims SET ttl = '2000-01-01T00:00:00.000Z' WHERE id = ?")
        .run(first?.claimId ?? "");

      expect(claim(store, run.id, "worker-2")?.target.symbol).toBe("fn_2");
    } finally {
      store.db.close();
    }
  });
});
