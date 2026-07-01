import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import {
  activeClaimsForSession,
  admitEpochTargets,
  claimNextEpochTarget as claimNextEpochTargetRaw,
  createRun,
  openState,
  schedulerEpochProgress,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import { recoverActiveClaims } from "./recover-claims.js";

const tempDirs: string[] = [];
const TEST_WORKER_TIMEOUT_SECONDS = 1800;

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "recover-claims-state-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

function globalsFor(dir: string): GlobalArgs {
  return {
    repoRoot: dir,
    stateDir: dir,
    dryRunAgents: true,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
}

function claimNextEpochTarget(params: Omit<Parameters<typeof claimNextEpochTargetRaw>[0], "ttlSeconds"> & { ttlSeconds?: number }) {
  return claimNextEpochTargetRaw({ ...params, ttlSeconds: params.ttlSeconds ?? TEST_WORKER_TIMEOUT_SECONDS });
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("recoverActiveClaims", () => {
  test("closes a failed worker process claim and re-admits targets without checkpoints", async () => {
    const { dir, store } = tempState();
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
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 99, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();

      const result = await recoverActiveClaims({
        globals: globalsFor(dir),
        store,
        runId: run.id,
        repoRoot: dir,
        force: true,
        workerIdFilter: "worker-1",
        reason: "unit test failed process",
        processIntegrations: false,
      });

      expect(result.recoveredClaims).toBe(1);
      expect(activeClaimsForSession(store, run.id)).toHaveLength(0);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 1, claimed: 0, finished: 0, remaining: 1 });
      const worker = store.db.query("SELECT lifecycle_status FROM worker_state WHERE id = ?").get(claim?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(worker?.lifecycle_status).toBe("error");
    } finally {
      store.db.close();
    }
  });
});
