import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { initializeDispatchState, requestDispatch } from "@server/core/harness-state";
import { claimNextJob, completeJob } from "@server/core/job-queue/kernel.js";
import {
  activeClaimsForRun,
  admitEpochTargets,
  claimNextEpochTarget as claimNextEpochTargetRaw,
  createRun,
  openState,
  recordWorkerCheckpoint,
  schedulerEpochProgress,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "../../../run-state/test-harness.js";
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

function git(repo: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString());
  return result.stdout.toString().trim();
}

function setupRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "recover-claims-repo-"));
  tempDirs.push(repo);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/a.c"), "int value = 0;\n");
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test User"]);
  git(repo, ["add", "src/a.c"]);
  git(repo, ["commit", "-m", "baseline"]);
  return repo;
}

function writePatch(dir: string): string {
  const patchPath = join(dir, "worker.patch");
  writeFileSync(
    patchPath,
    [
      "diff --git a/src/a.c b/src/a.c",
      "--- a/src/a.c",
      "+++ b/src/a.c",
      "@@ -1 +1 @@",
      "-int value = 0;",
      "+int value = 1;",
      "",
    ].join("\n"),
  );
  return patchPath;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("recoverActiveClaims", () => {
  test("recovers only when the worker id filter matches the current claim owner", async () => {
    const { dir, store } = tempState();
    try {
      seedRunHarness(store, "test", "base-test", dir);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 99 }],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      if (!claim) throw new Error("expected worker claim");

      const mismatched = await recoverActiveClaims({
        globals: globalsFor(dir),
        store,
        runId: run.id,
        repoRoot: dir,
        force: true,
        claimIdFilter: claim.claimId,
        workerIdFilter: "worker-2",
        reason: "stale worker settlement",
        processIntegrations: false,
      });

      expect(mismatched.recoveredClaims).toBe(0);
      expect(activeClaimsForRun(store, run.id)).toEqual([
        expect.objectContaining({ claimId: claim.claimId, workerId: "worker-1" }),
      ]);
      expect(
        store.db.query("SELECT lifecycle_status FROM worker_state WHERE id = ?").get(claim.workerStateId),
      ).toMatchObject({ lifecycle_status: "running" });

      const matched = await recoverActiveClaims({
        globals: globalsFor(dir),
        store,
        runId: run.id,
        repoRoot: dir,
        force: true,
        claimIdFilter: claim.claimId,
        workerIdFilter: "worker-1",
        reason: "current worker settlement",
        processIntegrations: false,
      });

      expect(matched.recoveredClaims).toBe(1);
      expect(activeClaimsForRun(store, run.id)).toHaveLength(0);
    } finally {
      store.db.close();
    }
  });

  test("closes a failed worker process claim and re-admits targets without checkpoints", async () => {
    const { dir, store } = tempState();
    try {
      seedRunHarness(store, "test", "base-test", dir);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 99 }],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
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
      expect(activeClaimsForRun(store, run.id)).toHaveLength(0);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 1, claimed: 0, finished: 0, remaining: 1 });
      const worker = store.db.query("SELECT lifecycle_status FROM worker_state WHERE id = ?").get(claim?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(worker?.lifecycle_status).toBe("error");
    } finally {
      store.db.close();
    }
  });

  test("a recovered worker's queued integration holds its file until the job settles", async () => {
    const { dir, store } = tempState();
    try {
      const patchPath = writePatch(dir);
      seedRunHarness(store, "test", "base-test", dir);
      const run = createRun(store, "matched_code_percent", 100, 3, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 3 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          { kind: "function", unit: "enemy", symbol: "walkTo", sourcePath: "src/enemy.cpp", size: 64, fuzzy: 99 },
          { kind: "function", unit: "enemy", symbol: "zigzag", sourcePath: "src/enemy.cpp", size: 64, fuzzy: 98 },
          { kind: "function", unit: "other", symbol: "other", sourcePath: "src/other.cpp", size: 64, fuzzy: 97 },
        ],
        workerPoolSize: 3,
      });
      const walkTo = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      if (walkTo?.target.symbol !== "walkTo") throw new Error("expected the walkTo claim");
      recordWorkerCheckpoint(store, {
        workerStateId: walkTo.workerStateId,
        authority: { host: "recover-claims-test" },
        runId: run.id,
        epochId: walkTo.epochId,
        epochTargetId: walkTo.epochTargetId,
        targetClaimId: walkTo.claimId,
        attemptIndex: 0,
        oldScore: 99,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        validationStatus: "passed",
        patchPath,
        diffPath: patchPath,
        writeSet: ["src/enemy.cpp"],
      });

      const recovery = await recoverActiveClaims({
        globals: globalsFor(dir),
        store,
        runId: run.id,
        repoRoot: dir,
        force: true,
        claimIdFilter: walkTo.claimId,
        reason: "run-loop recovered failed worker job: Daytona sandbox error",
        processIntegrations: false,
      });
      expect(recovery.workerOutputIntegration?.queued).toHaveLength(1);

      expect(claimNextEpochTarget({ store, runId: run.id, workerId: "worker-2", baseRev: "base" })?.target.symbol).toBe("other");
      expect(claimNextEpochTarget({ store, runId: run.id, workerId: "worker-3", baseRev: "base" })).toBeNull();

      const integration = claimNextJob(store, { kind: "integration", concurrencyLimit: 1, leaseMs: 60_000, runId: run.id });
      if (!integration) throw new Error("expected the recovered integration job");
      completeJob(store, integration.token, { resultRef: "applied" });

      expect(claimNextEpochTarget({ store, runId: run.id, workerId: "worker-3", baseRev: "integrated" })?.target.symbol).toBe("zigzag");
    } finally {
      store.db.close();
    }
  });

  test("leaves checkpoint integration queued when another workflow owns dispatch", async () => {
    const { dir, store } = tempState();
    try {
      const repo = setupRepo();
      const patchPath = writePatch(dir);
      seedRunHarness(store, "test", "base-test", dir);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 99 }],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      if (!claim) throw new Error("expected worker claim");
      recordWorkerCheckpoint(store, {
        workerStateId: claim.workerStateId,
        authority: { host: "recover-claims-test" },
        runId: run.id,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex: 0,
        oldScore: 99,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        validationStatus: "passed",
        patchPath,
        diffPath: patchPath,
        writeSet: ["src/a.c"],
      });
      initializeDispatchState(store, { gameId: "test", traceId: "trace-test" });
      const prDispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-pr-1",
        correlationId: "campaign-recover-claims",
        kind: "pr",
        gameId: "test",
        reason: "PR owns checkout",
        workflowId: "campaign-recover-claims",
      });
      if (prDispatch.queued) throw new Error("expected PR dispatch lease");

      const result = await recoverActiveClaims({
        globals: globalsFor(dir),
        store,
        runId: run.id,
        repoRoot: repo,
        force: true,
        reason: "recover failed run while PR is active",
      });

      const itemId = String(result.recovered[0]?.workerOutputIntegrationItemId ?? "");
      expect(itemId).not.toBe("");
      expect(result.workerOutputIntegration).toEqual({ queued: [itemId], processed: [] });
      expect(result.blockers).toEqual([
        expect.objectContaining({
          code: "worker_output_integration_lease_unavailable",
          message: expect.stringContaining(itemId),
          source_id: itemId,
        }),
      ]);
      expect(
        (store.db.query("SELECT status FROM jobs WHERE job_id = ?").get(itemId) as Record<string, unknown>).status,
      ).toBe("queued");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 0;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(1);
    } finally {
      store.db.close();
    }
  });
});
