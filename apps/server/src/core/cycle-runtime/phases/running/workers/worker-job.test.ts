import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initializeHarnessState, releaseDispatch, requestDispatch, StaleLeaseError } from "@server/core/harness-state";
import { getJob, getJobByDedupeKey } from "@server/core/job-queue/kernel.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  createRun,
  startSchedulerEpoch,
} from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import {
  buildWorkerTask,
  onWorkerJobComplete,
  reapWorkerJobs,
  workerKernelOps,
  type WorkerJobRunContext,
} from "./worker-job.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const stateDir = mkdtempSync(join(tmpdir(), "worker-job-"));
  tempDirs.push(stateDir);
  const store = openState(stateDir);
  const globals: GlobalArgs = {
    repoRoot: resolve(stateDir, "repo"),
    stateDir,
    gameId: "test",
    dryRunAgents: true,
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: "medium",
  };
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", stateDir }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
    candidateWindow: 1,
  });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 90, priority: 10, reason: "test" }],
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
  });
  initializeHarnessState(store, { gameId: "test", traceId: "trace-test" });
  const dispatch = requestDispatch(store, {
    kind: "run", workflowId: run.id, reason: "worker job test", commandId: `command-${run.id}`,
    correlationId: run.id, actor: "operator", gameId: "test",
  });
  if (dispatch.queued) throw new Error("Expected test dispatch lease");
  const ctx: WorkerJobRunContext = {
    store, globals, runId: run.id, dispatchLeaseId: dispatch.leaseId, baseRev: "base-test",
    ttlSeconds: 1800, concurrencyLimit: 1, thinkingLevel: "medium",
    postReturnCheckCommand: "check", workerConfigureCommand: "configure", graphDbPath: resolve(stateDir, "graph.db"),
    writeSetFlags: { mergeOnFinish: false, writeSetWidening: "off", confirmationPass: false }, workerIdPrefix: "test",
  };
  const epochTargetId = String((store.db.query("SELECT id FROM epoch_targets WHERE epoch_id = ?").get(epoch.id) as { id: string }).id);
  return { store, stateDir, ctx, run, epochTargetId };
}

function claim(f: ReturnType<typeof fixture>) {
  const result = workerKernelOps(f.ctx).claimNextJob(f.store, { kind: "worker", concurrencyLimit: 1, leaseMs: 1_800_000 });
  if (!result) throw new Error("Expected worker job claim");
  return result;
}

describe("worker job kind", () => {
  test("atomically claims a job and target and attaches linkage", () => {
    const f = fixture();
    try {
      const result = claim(f);
      expect(result.job.attempts).toBe(1);
      expect(result.job.payload.claimed_epoch_target_id).toBe(f.epochTargetId);
      expect(typeof result.job.payload.target_claim_id).toBe("string");
      expect(typeof result.job.payload.worker_state_id).toBe("string");
      const targetClaim = f.store.db.query("SELECT status FROM target_claims WHERE id = ?").get(String(result.job.payload.target_claim_id));
      expect(targetClaim).toEqual({ status: "active" });
      const worker = f.store.db.query("SELECT artifact_dir FROM worker_state WHERE id = ?").get(String(result.job.payload.worker_state_id)) as { artifact_dir: string };
      expect(worker.artifact_dir).toBe(resolve(f.stateDir, "runs", f.run.id, "worker_state", String(result.job.payload.worker_state_id)));
    } finally { f.store.db.close(); }
  });

  test("rolls back the queue claim and its event when no target is claimable", () => {
    const f = fixture();
    try {
      claimNextEpochTarget({ store: f.store, runId: f.run.id, workerId: "outside", baseRev: "base-test", ttlSeconds: 1800 });
      const before = Number((f.store.db.query("SELECT COUNT(*) count FROM game_events").get() as { count: number }).count);
      expect(workerKernelOps(f.ctx).claimNextJob(f.store, { kind: "worker", concurrencyLimit: 1, leaseMs: 1_800_000 })).toBeNull();
      const job = getJobByDedupeKey(f.store, "worker", f.epochTargetId)!;
      expect({ status: job.status, attempts: job.attempts }).toEqual({ status: "queued", attempts: 0 });
      expect((f.store.db.query("SELECT COUNT(*) count FROM game_events").get() as { count: number }).count).toBe(before);
    } finally { f.store.db.close(); }
  });

  test("enforces the host dispatch lease", () => {
    const f = fixture();
    try {
      expect(() => workerKernelOps({ ...f.ctx, dispatchLeaseId: "bogus" }).claimNextJob(f.store, { kind: "worker", concurrencyLimit: 1, leaseMs: 1_800_000 })).toThrow(StaleLeaseError);
      expect(getJobByDedupeKey(f.store, "worker", f.epochTargetId)?.attempts).toBe(0);
    } finally { f.store.db.close(); }
  });

  test("rejects a released dispatch lease", () => {
    const f = fixture();
    try {
      releaseDispatch(f.store, {
        leaseId: f.ctx.dispatchLeaseId,
        commandId: `command-release-${f.run.id}`,
        correlationId: f.run.id,
        actor: "operator",
        gameId: "test",
      });
      expect(() => workerKernelOps(f.ctx).claimNextJob(f.store, { kind: "worker", concurrencyLimit: 1, leaseMs: 1_800_000 })).toThrow(StaleLeaseError);
      expect(getJobByDedupeKey(f.store, "worker", f.epochTargetId)?.attempts).toBe(0);
    } finally { f.store.db.close(); }
  });

  test("builds a provisioned worker task file with claim linkage", async () => {
    const f = fixture();
    try {
      const result = claim(f);
      const calls: unknown[] = [];
      const task = await buildWorkerTask(f.ctx, { provision: async (input) => { calls.push(input); } })(result.job, { store: f.store, token: result.token });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ sourceRepoRoot: f.ctx.globals.repoRoot, baseRev: "base-test" });
      const taskFile = task.command.at(-1)!;
      expect(task.command.slice(-3)).toEqual(["worker-task", "--task-file", taskFile]);
      const spec = JSON.parse(readFileSync(taskFile, "utf8"));
      expect(spec.claim_token).toEqual(result.token);
      expect(spec.target_claim_id).toBe(result.job.payload.target_claim_id);
      expect(spec.worker_state_id).toBe(result.job.payload.worker_state_id);
      expect(spec.worktree_path).toBe((calls[0] as { workerRepoRoot: string }).workerRepoRoot);
    } finally { f.store.db.close(); }
  });

  test("completion enqueues knowledge only after close and requeues a released slot", () => {
    const open = fixture();
    try {
      const result = claim(open);
      onWorkerJobComplete(result.job, {}, open.ctx);
      expect(open.store.db.query("SELECT COUNT(*) count FROM background_knowledge_jobs").get()).toEqual({ count: 0 });
      open.store.db.query("UPDATE worker_state SET ended_at = datetime('now') WHERE id = ?").run(String(result.job.payload.worker_state_id));
      open.store.db.query("UPDATE epoch_targets SET status = 'admitted' WHERE id = ?").run(open.epochTargetId);
      open.store.db.query("UPDATE jobs SET status = 'succeeded', completed_at = datetime('now') WHERE job_id = ?").run(result.job.jobId);
      onWorkerJobComplete(getJob(open.store, result.job.jobId)!, {}, open.ctx);
      expect(open.store.db.query("SELECT COUNT(*) count FROM background_knowledge_jobs WHERE worker_state_id = ?").get(String(result.job.payload.worker_state_id))).toEqual({ count: 1 });
      expect(getJob(open.store, result.job.jobId)?.status).toBe("queued");
    } finally { open.store.db.close(); }
  });

  test("reaps expired worker jobs and recovers their attached claim", async () => {
    const f = fixture();
    try {
      const result = claim(f);
      f.store.db.query("UPDATE jobs SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE job_id = ?").run(result.job.jobId);
      const calls: unknown[] = [];
      const outcome = await reapWorkerJobs(f.store, f.ctx, { recover: async (input) => {
        calls.push(input);
        return { runId: f.run.id, force: true, scannedActiveClaims: 1, recoveredClaims: 1, recovered: [], workerOutputIntegration: null, blockers: [], skippedActiveClaims: [] };
      } });
      expect(outcome.reaped).toHaveLength(1);
      expect(outcome.recovered).toBe(1);
      expect(calls[0]).toMatchObject({ claimIdFilter: result.job.payload.target_claim_id, force: true, leaseId: f.ctx.dispatchLeaseId, processIntegrations: false });
      expect(getJob(f.store, result.job.jobId)?.status).toBe("waiting");
    } finally { f.store.db.close(); }
  });
});
