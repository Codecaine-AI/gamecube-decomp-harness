import { afterAll, describe, expect, test } from "bun:test";
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
  startSchedulerEpoch,
} from "./index.js";

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

describe("worker target claim ordering", () => {
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
