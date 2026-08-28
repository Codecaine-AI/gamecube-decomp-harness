import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initializeHarnessState, listGameEvents, releaseDispatch, requestDispatch, StaleLeaseError } from "@server/core/harness-state";
import { startJobConsumer } from "@server/core/job-queue/consumer.js";
import { attachJobPayload, getJob, getJobByDedupeKey } from "@server/core/job-queue/kernel.js";
import { reconcileSandboxes } from "@server/core/job-queue/sandbox-lifecycle.js";
import { FakeSandboxProvider, type SandboxProvider } from "@server/core/job-queue/sandbox.js";
import type { TaskHandle, TaskSpec, WorkerExecutor } from "@server/core/job-queue/types.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  enqueueBackgroundKnowledgeForWorker,
  startBackgroundKnowledgeProcessor,
} from "@server/core/knowledge/background/index.js";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  createRun,
  startSchedulerEpoch,
  updateRunStatus,
} from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import {
  buildWorkerTask,
  onWorkerJobComplete,
  reapWorkerJobs,
  workerJobDescriptor,
  workerKernelOps,
  type WorkerJobRunContext,
} from "./worker-job.js";
import { runWorkerCycleFromTask, type WorkerCycleResult } from "./worker-cycle.js";

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
    workerPoolSize: 1,
  });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 90, priority: 10, reason: "test" }],
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
    ttlSeconds: 1800, sandboxSleep: true, sandboxSleepDebounceMs: 1_000,
    concurrencyLimit: 1, thinkingLevel: "medium",
    postReturnCheckCommand: "check", workerConfigureCommand: "configure", graphDbPath: resolve(stateDir, "graph.db"),
    writeSetFlags: { writeSetWidening: "off" }, workerIdPrefix: "test",
  };
  const epochTargetId = String((store.db.query("SELECT id FROM epoch_targets WHERE epoch_id = ?").get(epoch.id) as { id: string }).id);
  return { store, stateDir, ctx, run, epochTargetId };
}

function claim(f: ReturnType<typeof fixture>) {
  const result = workerKernelOps(f.ctx).claimNextJob(f.store, { kind: "worker", concurrencyLimit: 1, leaseMs: 1_800_000 });
  if (!result) throw new Error("Expected worker job claim");
  return result;
}

function claimSandboxJob(f: ReturnType<typeof fixture>) {
  const queued = getJobByDedupeKey(f.store, "worker", f.epochTargetId);
  if (!queued) throw new Error("Expected queued worker job");
  f.store.db.query("UPDATE jobs SET execution_class = 'sandbox' WHERE job_id = ?").run(queued.jobId);
  return claim(f);
}

function configureSandbox(f: ReturnType<typeof fixture>): void {
  f.ctx.globals.game = {
    sandbox: {
      resource_class: { cpu: 4, memory_gib: 8, disk_gib: 20 },
      snapshot_name: "melee-snapshot",
      snapshot_baked_rev: "baked-test",
      workspace_root: "/opt/melee-test",
    },
  } as NonNullable<GlobalArgs["game"]>;
}

async function until(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for condition");
    await Bun.sleep(1);
  }
}

async function sandboxClaim(f: ReturnType<typeof fixture>, provider: FakeSandboxProvider) {
  f.store.db.query("UPDATE jobs SET execution_class = 'sandbox' WHERE kind = 'worker' AND dedupe_key = ?").run(f.epochTargetId);
  const result = claim(f);
  const claimId = String(result.job.payload.target_claim_id);
  const workerStateId = String(result.job.payload.worker_state_id);
  const sandbox = await provider.create({
    snapshot: "test-snapshot",
    labels: {
      game_id: result.job.gameId,
      run_id: f.run.id,
      claim_id: claimId,
      job_id: result.job.jobId,
      job_lease_id: result.token.leaseId,
      dispatch_lease_id: f.ctx.dispatchLeaseId,
      worker_state_id: workerStateId,
      trace_id: result.job.traceId ?? `trace-job-${result.job.jobId}`,
    },
    resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
    ttlMinutes: 60,
  });
  attachJobPayload(f.store, result.token, { sandbox_id: sandbox.sandboxId });
  return { ...result, claimedJob: result.job, job: getJob(f.store, result.job.jobId)!, sandbox };
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

  test("builds a provisioned sandbox task file with claim linkage", async () => {
    const f = fixture();
    try {
      configureSandbox(f);
      const result = claimSandboxJob(f);
      const provider = new FakeSandboxProvider();
      const calls: unknown[] = [];
      const task = await buildWorkerTask(f.ctx, {
        sandboxProvider: provider,
        provisionSandbox: async (input) => {
          calls.push(input);
          return { sandboxId: "sandbox-worker-claim", workspaceRoot: input.workspaceRoot };
        },
      })(result.job, { store: f.store, token: result.token });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        provider,
        sourceRepoRoot: f.ctx.globals.repoRoot,
        baseRev: "base-test",
        workspaceRoot: "/opt/melee-test",
      });
      const taskFile = task.command.at(-1)!;
      expect(task.command.slice(-3)).toEqual(["worker-task", "--task-file", taskFile]);
      const spec = JSON.parse(readFileSync(taskFile, "utf8"));
      expect(spec.claim_token).toEqual(result.token);
      expect(spec.target_claim_id).toBe(result.job.payload.target_claim_id);
      expect(spec.worker_state_id).toBe(result.job.payload.worker_state_id);
      expect(spec).toMatchObject({
        execution_class: "sandbox",
        sandbox_id: "sandbox-worker-claim",
        workspace_root: "/opt/melee-test",
        sandbox_sleep: true,
        sandbox_sleep_debounce_ms: 1_000,
      });
      expect(spec.worktree_path).toBeUndefined();
    } finally { f.store.db.close(); }
  });

  test("builds a sandbox task with lease labels and durable sandbox linkage", async () => {
    const f = fixture();
    try {
      configureSandbox(f);
      const result = claimSandboxJob(f);
      const provider = new FakeSandboxProvider();
      const calls: unknown[] = [];
      const task = await buildWorkerTask(f.ctx, {
        sandboxProvider: provider,
        provisionSandbox: async (input) => {
          calls.push(input);
          return { sandboxId: "sandbox-worker-1", workspaceRoot: input.workspaceRoot };
        },
      })(result.job, { store: f.store, token: result.token });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        provider,
        sourceRepoRoot: f.ctx.globals.repoRoot,
        baseRev: "base-test",
        snapshotBakedRev: "baked-test",
        workspaceRoot: "/opt/melee-test",
        snapshot: "melee-snapshot",
        resources: { cpu: 4, memoryGiB: 8, diskGiB: 20 },
        ttlSeconds: 1800,
        labels: {
          game_id: "test",
          run_id: f.run.id,
          claim_id: result.job.payload.target_claim_id,
          job_id: result.job.jobId,
          job_lease_id: result.token.leaseId,
          dispatch_lease_id: f.ctx.dispatchLeaseId,
          worker_state_id: result.job.payload.worker_state_id,
          trace_id: result.job.traceId,
        },
        event: {
          context: {
            gameId: "test",
            correlationId: result.job.jobId,
            causationId: result.job.causedByEventId,
            traceId: result.job.traceId,
            jobId: result.job.jobId,
            claimId: result.job.payload.target_claim_id,
            workerStateId: result.job.payload.worker_state_id,
          },
        },
      });
      const taskFile = task.command.at(-1)!;
      const spec = JSON.parse(readFileSync(taskFile, "utf8"));
      expect(spec).toMatchObject({
        workspace_root: "/opt/melee-test",
        sandbox_id: "sandbox-worker-1",
        execution_class: "sandbox",
      });
      expect(spec.worktree_path).toBeUndefined();
      expect(getJob(f.store, result.job.jobId)?.payload.sandbox_id).toBe("sandbox-worker-1");
      expect(f.store.db.query("SELECT worktree_path FROM target_claims WHERE id = ?").get(String(result.job.payload.target_claim_id))).toEqual({ worktree_path: "/opt/melee-test" });
      expect(f.store.db.query("SELECT worktree_path FROM worker_state WHERE id = ?").get(String(result.job.payload.worker_state_id))).toEqual({ worktree_path: "/opt/melee-test" });
    } finally { f.store.db.close(); }
  });

  test("deletes the prior sandbox before recording a retry replacement", async () => {
    const f = fixture();
    try {
      configureSandbox(f);
      const result = claimSandboxJob(f);
      const provider = new FakeSandboxProvider();
      const prior = await provider.create({
        snapshot: "old",
        labels: {},
        resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
        ttlMinutes: 90,
      });
      attachJobPayload(f.store, result.token, { sandbox_id: prior.sandboxId });
      f.store.db.query("UPDATE jobs SET attempts = 2 WHERE job_id = ?").run(result.job.jobId);
      const retryJob = getJob(f.store, result.job.jobId)!;
      let sandboxIdDuringDelete: unknown;
      const deletingProvider: SandboxProvider = {
        create: (params) => provider.create(params),
        get: (sandboxId) => provider.get(sandboxId),
        listByLabels: (labels) => provider.listByLabels(labels),
        delete: async (sandboxId, reason) => {
          sandboxIdDuringDelete = getJob(f.store, result.job.jobId)?.payload.sandbox_id;
          await provider.delete(sandboxId, reason);
        },
      };

      await buildWorkerTask(f.ctx, {
        sandboxProvider: deletingProvider,
        provisionSandbox: async (input) => ({ sandboxId: "sandbox-new", workspaceRoot: input.workspaceRoot }),
      })(retryJob, { store: f.store, token: result.token });

      expect(sandboxIdDuringDelete).toBe(prior.sandboxId);
      expect(provider.deletedSandboxes).toEqual([
        expect.objectContaining({ sandboxId: prior.sandboxId, reason: "retry_reprovision" }),
      ]);
      expect(getJob(f.store, result.job.jobId)?.payload).toMatchObject({
        sandbox_id: "sandbox-new",
        sandbox_reprovisions: [{
          attempt: 2,
          previous_sandbox_id: prior.sandboxId,
          sandbox_id: "sandbox-new",
          previous_delete_reason: "retry_reprovision",
          previous_delete_status: "deleted",
        }],
      });
    } finally { f.store.db.close(); }
  });

  test("records a retry replacement when prior sandbox deletion fails", async () => {
    const f = fixture();
    try {
      configureSandbox(f);
      const result = claimSandboxJob(f);
      attachJobPayload(f.store, result.token, { sandbox_id: "sandbox-old" });
      f.store.db.query("UPDATE jobs SET attempts = 2 WHERE job_id = ?").run(result.job.jobId);
      const warnings: string[] = [];
      const provider = new FakeSandboxProvider();
      const failingProvider: SandboxProvider = {
        create: (params) => provider.create(params),
        get: (sandboxId) => provider.get(sandboxId),
        listByLabels: (labels) => provider.listByLabels(labels),
        delete: async () => { throw new Error("Daytona unavailable"); },
      };

      await buildWorkerTask(f.ctx, {
        sandboxProvider: failingProvider,
        warn: (message) => warnings.push(message),
        provisionSandbox: async (input) => ({ sandboxId: "sandbox-new", workspaceRoot: input.workspaceRoot }),
      })(getJob(f.store, result.job.jobId)!, { store: f.store, token: result.token });

      expect(getJob(f.store, result.job.jobId)?.payload).toMatchObject({
        sandbox_id: "sandbox-new",
        sandbox_reprovisions: [{
          previous_sandbox_id: "sandbox-old",
          previous_delete_status: "failed",
        }],
      });
      expect(warnings).toEqual([
        expect.stringContaining("failed to delete sandbox-old (retry_reprovision)"),
      ]);
    } finally { f.store.db.close(); }
  });

  test("does not delete a sandbox while provisioning the first attempt", async () => {
    const f = fixture();
    try {
      configureSandbox(f);
      const result = claimSandboxJob(f);
      let deletes = 0;
      const provider = new FakeSandboxProvider();
      const countingProvider: SandboxProvider = {
        create: (params) => provider.create(params),
        get: (sandboxId) => provider.get(sandboxId),
        listByLabels: (labels) => provider.listByLabels(labels),
        delete: async () => { deletes += 1; },
      };

      await buildWorkerTask(f.ctx, {
        sandboxProvider: countingProvider,
        provisionSandbox: async (input) => ({ sandboxId: "sandbox-first", workspaceRoot: input.workspaceRoot }),
      })(result.job, { store: f.store, token: result.token });

      expect(deletes).toBe(0);
      expect(getJob(f.store, result.job.jobId)?.payload).toMatchObject({ sandbox_id: "sandbox-first" });
      expect(getJob(f.store, result.job.jobId)?.payload.sandbox_reprovisions).toBeUndefined();
    } finally { f.store.db.close(); }
  });

  test("routes dry-run sandbox jobs through FakeSandboxProvider without SDK access", async () => {
    const f = fixture();
    try {
      configureSandbox(f);
      f.ctx.globals.game!.sandbox.snapshot_baked_rev = f.ctx.baseRev;
      const result = claimSandboxJob(f);
      const task = await buildWorkerTask(f.ctx)(result.job, { store: f.store, token: result.token });
      const spec = JSON.parse(readFileSync(task.command.at(-1)!, "utf8"));
      expect(spec).toMatchObject({
        execution_class: "sandbox",
        sandbox_id: "sandbox-1",
        workspace_root: "/opt/melee-test",
      });
      expect(spec.worktree_path).toBeUndefined();
      expect(listGameEvents(f.store.db).some((event) => event.eventType === "sandbox.created" && event.subjectId === "sandbox-1")).toBeTrue();
    } finally { f.store.db.close(); }
  });

  test("runs one dry-run sandbox worker through provisioning, child execution, settlement, and empty sweeps", async () => {
    const f = fixture();
    const provider = new FakeSandboxProvider();
    const trackedDeletions: Promise<void>[] = [];
    const previousKnowledgeRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    let consumer: ReturnType<typeof startJobConsumer> | undefined;
    try {
      configureSandbox(f);
      f.ctx.globals.game!.sandbox.snapshot_baked_rev = f.ctx.baseRev;
      f.store.db.query("UPDATE jobs SET execution_class = 'sandbox' WHERE kind = 'worker' AND dedupe_key = ?").run(f.epochTargetId);
      updateRunStatus(f.store, f.run.id, "active", "operator");

      const knowledgeRoot = resolve(f.stateDir, "knowledge");
      const functionsIndex = resolve(knowledgeRoot, "sources", "code_graph", "indexes", "functions.jsonl");
      mkdirSync(resolve(functionsIndex, ".."), { recursive: true });
      writeFileSync(functionsIndex, `${JSON.stringify({
        unit: "unit",
        symbol: "fn",
        sourcePath: "src/a.c",
        size: 64,
        fuzzy: 90,
      })}\n`);
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;

      let capturedTask: TaskSpec | undefined;
      let childResult: WorkerCycleResult | undefined;
      let childError = "";
      let childDone = false;
      let childRun: Promise<void> | undefined;
      const handle: TaskHandle = { executorId: "in-process-worker-task", handleId: "sandbox-gate" };
      const executor: WorkerExecutor = {
        submit: async (task) => {
          capturedTask = task;
          const taskFile = task.command.at(-1);
          if (!taskFile) throw new Error("sandbox gate task is missing task_spec path");
          childRun = runWorkerCycleFromTask(
            f.ctx.globals,
            new Map([["--task-file", taskFile]]),
            { sandboxProvider: provider },
          ).then((result) => {
            childResult = result;
          }).catch((error) => {
            childError = error instanceof Error ? error.stack ?? error.message : String(error);
          }).finally(() => {
            childDone = true;
          });
          return handle;
        },
        poll: async () => ({ state: childDone ? "exited" : "running" }),
        collect: async () => {
          await childRun;
          return {
            exitCode: childError ? 1 : 0,
            signal: null,
            stdout: childResult ? JSON.stringify(childResult) : "",
            stderr: childError,
            timedOut: false,
            startedAt: "2026-08-18T00:00:00.000Z",
            endedAt: "2026-08-18T00:00:01.000Z",
          };
        },
        cancel: async () => undefined,
      };
      const settled = new Promise<{ status: "succeeded" | "failed"; error?: string }>((resolveSettled) => {
        const descriptor = workerJobDescriptor(f.ctx, {
          sandboxProvider: provider,
          executor,
          trackSandboxDeletion: (deletion) => trackedDeletions.push(deletion),
        });
        consumer = startJobConsumer(f.store, descriptor, workerKernelOps(f.ctx), {
          intervalMs: 1,
          onJobSettled: (_job, result) => resolveSettled(result),
        });
      });
      const settlement = await Promise.race([
        settled,
        Bun.sleep(10_000).then(() => { throw new Error("timed out waiting for sandbox gate settlement"); }),
      ]);
      await consumer?.stop();
      await Promise.all(trackedDeletions);

      expect(settlement.status).toBe("succeeded");
      expect(childError).toBe("");
      expect(childResult?.dryRun).toBeTrue();
      expect(childResult?.sandboxSleep).toMatchObject({ enabled: true, debounceMs: 1_000 });
      expect(capturedTask?.command).toContain("--dry-run-agents");
      const taskFile = capturedTask?.command.at(-1);
      if (!taskFile) throw new Error("sandbox gate did not capture task_spec path");
      const spec = JSON.parse(readFileSync(taskFile, "utf8"));
      expect(spec).toMatchObject({
        execution_class: "sandbox",
        sandbox_id: "sandbox-1",
        workspace_root: "/opt/melee-test",
        sandbox_sleep: true,
        sandbox_sleep_debounce_ms: 1_000,
      });
      expect(JSON.parse(readFileSync(resolve(String(spec.artifact_dir), "sandbox_sleep_stats.json"), "utf8")))
        .toMatchObject({
          stopCount: expect.any(Number),
          startCount: expect.any(Number),
          stoppedMs: expect.any(Number),
          stopFailures: 0,
          startFailures: 0,
        });
      expect(spec.worktree_path).toBeUndefined();

      const job = getJobByDedupeKey(f.store, "worker", f.epochTargetId)!;
      expect(job).toMatchObject({ status: "succeeded", attempts: 1, payload: { sandbox_id: "sandbox-1" } });
      expect(provider.createdSandboxes).toHaveLength(1);
      expect(provider.createdSandboxes[0]?.labels).toEqual({
        game_id: "test",
        run_id: f.run.id,
        claim_id: spec.target_claim_id,
        job_id: job.jobId,
        job_lease_id: spec.claim_token.leaseId,
        dispatch_lease_id: f.ctx.dispatchLeaseId,
        worker_state_id: spec.worker_state_id,
        trace_id: job.traceId ?? `trace-job-${job.jobId}`,
      });
      expect(f.store.db.query("SELECT status, worktree_path FROM target_claims WHERE id = ?").get(spec.target_claim_id)).toEqual({
        status: "closed",
        worktree_path: "/opt/melee-test",
      });
      expect(f.store.db.query("SELECT ended_at IS NOT NULL AS ended, worktree_path FROM worker_state WHERE id = ?").get(spec.worker_state_id)).toEqual({
        ended: 1,
        worktree_path: "/opt/melee-test",
      });
      expect(provider.deletedSandboxes).toHaveLength(1);
      expect(provider.deletedSandboxes[0]).toMatchObject({ sandboxId: "sandbox-1", reason: "settlement" });

      expect(await reapWorkerJobs(f.store, f.ctx, { sandboxProvider: provider })).toEqual({
        reaped: [],
        recovered: 0,
        expiredClaimsRecovered: 0,
      });
      expect(await reconcileSandboxes(f.store, { gameId: "test" }, { sandboxProvider: provider })).toEqual({
        scanned: 0,
        kept: 0,
        deleted: 0,
        failed: 0,
      });
      expect(listGameEvents(f.store.db)
        .filter((event) => event.eventType === "sandbox.created" || event.eventType === "sandbox.deleted")
        .map((event) => ({ type: event.eventType, subject: event.subjectId, reason: event.payload.reason ?? null })))
        .toEqual([
          { type: "sandbox.created", subject: "sandbox-1", reason: null },
          { type: "sandbox.deleted", subject: "sandbox-1", reason: "settlement" },
        ]);
    } finally {
      await consumer?.stop();
      if (previousKnowledgeRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previousKnowledgeRoot;
      f.store.db.close();
    }
  }, 15_000);

  test("completion enqueues knowledge only after close and requeues a released slot", () => {
    const open = fixture();
    try {
      const result = claim(open);
      onWorkerJobComplete(result.job, {}, open.ctx);
      expect(open.store.db.query("SELECT COUNT(*) count FROM jobs WHERE kind = 'knowledge_absorption' AND dedupe_key = ?").get(String(result.job.payload.worker_state_id))).toEqual({ count: 0 });
      open.store.db.query("UPDATE worker_state SET ended_at = datetime('now') WHERE id = ?").run(String(result.job.payload.worker_state_id));
      open.store.db.query("UPDATE epoch_targets SET status = 'admitted' WHERE id = ?").run(open.epochTargetId);
      open.store.db.query("UPDATE jobs SET status = 'succeeded', completed_at = datetime('now') WHERE job_id = ?").run(result.job.jobId);
      onWorkerJobComplete(getJob(open.store, result.job.jobId)!, {}, open.ctx);
      expect(open.store.db.query("SELECT COUNT(*) count FROM jobs WHERE kind = 'knowledge_absorption' AND dedupe_key = ?").get(String(result.job.payload.worker_state_id))).toEqual({ count: 1 });
      expect(getJob(open.store, result.job.jobId)?.status).toBe("queued");
    } finally { open.store.db.close(); }
  });

  test("hung background knowledge does not block worker settlement", async () => {
    const f = fixture();
    let stopBackgroundKnowledge: ((options?: { maxWaitMs?: number }) => Promise<void>) | undefined;
    try {
      f.store.db
        .query(
          `INSERT INTO worker_state (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id,
            target_key, lifecycle_status, started_at, ended_at, summary_json)
          VALUES ('knowledge-source', ?, 'past-epoch', 'past-target', 'past-claim', 'past-worker',
            'past::symbol', 'finished', '2026-08-19T00:00:00.000Z', '2026-08-19T00:01:00.000Z', '{}')`,
        )
        .run(f.run.id);
      enqueueBackgroundKnowledgeForWorker(f.store, "knowledge-source");
      let knowledgeEntered = false;
      stopBackgroundKnowledge = startBackgroundKnowledgeProcessor(
        f.store,
        async () => {
          knowledgeEntered = true;
          await new Promise<never>(() => {});
        },
        { intervalMs: 1 },
      );
      await until(() => knowledgeEntered);

      const result = claim(f);
      f.store.db.query("UPDATE worker_state SET ended_at = datetime('now') WHERE id = ?").run(String(result.job.payload.worker_state_id));
      f.store.db.query("UPDATE target_claims SET status = 'closed' WHERE id = ?").run(String(result.job.payload.target_claim_id));
      f.store.db.query("UPDATE epoch_targets SET status = 'finished' WHERE id = ?").run(f.epochTargetId);
      const descriptor = workerJobDescriptor(f.ctx);
      workerKernelOps(f.ctx).completeJob(f.store, result.token, {}, { onComplete: descriptor.onComplete });

      expect(getJob(f.store, result.job.jobId)?.status).toBe("succeeded");
    } finally {
      await stopBackgroundKnowledge?.({ maxWaitMs: 50 });
      f.store.db.close();
    }
  });

  test("deletes a settled sandbox job exactly once and emits sandbox.deleted", async () => {
    const f = fixture();
    try {
      const provider = new FakeSandboxProvider();
      const result = await sandboxClaim(f, provider);
      f.store.db.query("UPDATE worker_state SET ended_at = datetime('now') WHERE id = ?").run(String(result.job.payload.worker_state_id));
      f.store.db.query("UPDATE target_claims SET status = 'closed' WHERE id = ?").run(String(result.job.payload.target_claim_id));
      f.store.db.query("UPDATE epoch_targets SET status = 'finished' WHERE id = ?").run(f.epochTargetId);
      const tracked: Promise<void>[] = [];
      const descriptor = workerJobDescriptor(f.ctx, {
        sandboxProvider: provider,
        trackSandboxDeletion: (deletion) => tracked.push(deletion),
      });

      workerKernelOps(f.ctx).completeJob(f.store, result.token, {}, { onComplete: descriptor.onComplete });
      expect(tracked).toHaveLength(1);
      await tracked[0];
      expect(provider.deletedSandboxes).toHaveLength(1);
      expect(provider.deletedSandboxes[0]).toMatchObject({
        sandboxId: result.sandbox.sandboxId,
        reason: "settlement",
      });
      expect(listGameEvents(f.store.db).filter((event) => event.eventType === "sandbox.deleted").map((event) => event.payload)).toEqual([{
        sandbox_id: result.sandbox.sandboxId,
        reason: "settlement",
        job_id: result.job.jobId,
        claim_id: result.job.payload.target_claim_id,
      }]);

      expect(() => workerKernelOps(f.ctx).completeJob(f.store, result.token, {}, { onComplete: descriptor.onComplete })).toThrow("stale claim token");
      expect(provider.deletedSandboxes).toHaveLength(1);
    } finally { f.store.db.close(); }
  });

  test("deletes a sandbox on the poll after its worker state and claim close", async () => {
    const f = fixture();
    try {
      const provider = new FakeSandboxProvider();
      const result = await sandboxClaim(f, provider);
      const tracked: Promise<void>[] = [];
      const descriptor = workerJobDescriptor(f.ctx, {
        sandboxProvider: provider,
        trackSandboxDeletion: (deletion) => tracked.push(deletion),
      });
      if (!descriptor.onPoll) throw new Error("Expected worker poll watcher");
      expect(result.claimedJob.payload.sandbox_id).toBeUndefined();

      f.store.db.query("UPDATE worker_state SET ended_at = datetime('now') WHERE id = ?").run(String(result.job.payload.worker_state_id));
      f.store.db.query("UPDATE target_claims SET status = 'closed' WHERE id = ?").run(String(result.job.payload.target_claim_id));
      descriptor.onPoll(result.claimedJob, { store: f.store });
      expect(tracked).toHaveLength(1);
      await tracked[0];

      expect(getJob(f.store, result.job.jobId)?.status).toBe("claimed");
      expect(provider.deletedSandboxes).toHaveLength(1);
      expect(provider.deletedSandboxes[0]).toMatchObject({
        sandboxId: result.sandbox.sandboxId,
        reason: "settlement",
      });

      f.store.db.query("UPDATE epoch_targets SET status = 'finished' WHERE id = ?").run(f.epochTargetId);
      workerKernelOps(f.ctx).completeJob(f.store, result.token, {}, { onComplete: descriptor.onComplete });
      await Promise.all(tracked);

      expect(provider.deletedSandboxes).toHaveLength(1);
      expect(listGameEvents(f.store.db).filter((event) => event.eventType === "sandbox.deleted")).toHaveLength(1);
    } finally { f.store.db.close(); }
  });

  test("poll watcher retries sandbox deletion after a provider failure", async () => {
    const f = fixture();
    try {
      const backingProvider = new FakeSandboxProvider();
      const result = await sandboxClaim(f, backingProvider);
      let attempts = 0;
      const provider: SandboxProvider = {
        create: (params) => backingProvider.create(params),
        get: (sandboxId) => backingProvider.get(sandboxId),
        listByLabels: (labels) => backingProvider.listByLabels(labels),
        delete: async (sandboxId, reason) => {
          attempts += 1;
          if (attempts === 1) throw new Error("provider unavailable");
          await backingProvider.delete(sandboxId, reason);
        },
      };
      const tracked: Promise<void>[] = [];
      const descriptor = workerJobDescriptor(f.ctx, {
        sandboxProvider: provider,
        trackSandboxDeletion: (deletion) => tracked.push(deletion),
      });
      if (!descriptor.onPoll) throw new Error("Expected worker poll watcher");
      f.store.db.query("UPDATE worker_state SET ended_at = datetime('now') WHERE id = ?").run(String(result.job.payload.worker_state_id));
      f.store.db.query("UPDATE target_claims SET status = 'closed' WHERE id = ?").run(String(result.job.payload.target_claim_id));

      descriptor.onPoll(result.job, { store: f.store });
      await tracked[0];
      descriptor.onPoll(result.job, { store: f.store });
      await tracked[1];

      expect(attempts).toBe(2);
      expect(backingProvider.deletedSandboxes).toHaveLength(1);
    } finally { f.store.db.close(); }
  });

  test("poll watcher keeps an active sandbox while its worker state is open", async () => {
    const f = fixture();
    try {
      const provider = new FakeSandboxProvider();
      const result = await sandboxClaim(f, provider);
      const tracked: Promise<void>[] = [];
      const descriptor = workerJobDescriptor(f.ctx, {
        sandboxProvider: provider,
        trackSandboxDeletion: (deletion) => tracked.push(deletion),
      });
      if (!descriptor.onPoll) throw new Error("Expected worker poll watcher");

      descriptor.onPoll(result.job, { store: f.store });
      await Bun.sleep(0);

      expect(tracked).toHaveLength(0);
      expect(provider.deletedSandboxes).toHaveLength(0);
      expect(listGameEvents(f.store.db).filter((event) => event.eventType === "sandbox.deleted")).toHaveLength(0);
      expect(f.store.db.query("SELECT ended_at FROM worker_state WHERE id = ?").get(String(result.job.payload.worker_state_id))).toEqual({ ended_at: null });
      expect(f.store.db.query("SELECT status FROM target_claims WHERE id = ?").get(String(result.job.payload.target_claim_id))).toEqual({ status: "active" });
    } finally { f.store.db.close(); }
  });

  test("does not delete a sandbox until its domain claim is closed", async () => {
    const f = fixture();
    try {
      const provider = new FakeSandboxProvider();
      const result = await sandboxClaim(f, provider);
      f.store.db.query("UPDATE worker_state SET ended_at = datetime('now') WHERE id = ?").run(String(result.job.payload.worker_state_id));

      expect(onWorkerJobComplete(result.job, {}, f.ctx, { sandboxProvider: provider })).toBeUndefined();
      expect(provider.deletedSandboxes).toHaveLength(0);
      expect(listGameEvents(f.store.db).filter((event) => event.eventType === "sandbox.deleted")).toHaveLength(0);
    } finally { f.store.db.close(); }
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
      expect(outcome.expiredClaimsRecovered).toBe(0);
      expect(calls[0]).toMatchObject({ claimIdFilter: result.job.payload.target_claim_id, force: true, leaseId: f.ctx.dispatchLeaseId, processIntegrations: false });
      expect(calls).toHaveLength(1);
      expect(getJob(f.store, result.job.jobId)?.status).toBe("waiting");
    } finally { f.store.db.close(); }
  });

  test("reaps a sandbox before returning without delaying claim recovery", async () => {
    const f = fixture();
    try {
      const provider = new FakeSandboxProvider();
      const result = await sandboxClaim(f, provider);
      f.store.db.query("UPDATE jobs SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE job_id = ?").run(result.job.jobId);
      let releaseDeletion: (() => void) | undefined;
      const delayedProvider: SandboxProvider = {
        create: provider.create.bind(provider),
        get: provider.get.bind(provider),
        listByLabels: provider.listByLabels.bind(provider),
        delete: async (sandboxId, reason) => {
          await new Promise<void>((resolve) => { releaseDeletion = resolve; });
          await provider.delete(sandboxId, reason);
        },
      };
      let recoverySawLiveSandbox = false;
      const outcome = await reapWorkerJobs(f.store, f.ctx, {
        sandboxProvider: delayedProvider,
        recover: async () => {
          recoverySawLiveSandbox = await provider.get(result.sandbox.sandboxId) !== null;
          releaseDeletion?.();
          return { runId: f.run.id, force: true, scannedActiveClaims: 1, recoveredClaims: 1, recovered: [], workerOutputIntegration: null, blockers: [], skippedActiveClaims: [] };
        },
      });
      expect(outcome.recovered).toBe(1);
      expect(recoverySawLiveSandbox).toBeTrue();
      expect(provider.deletedSandboxes).toHaveLength(1);
      expect(provider.deletedSandboxes[0]).toMatchObject({ sandboxId: result.sandbox.sandboxId, reason: "reap" });
      expect(listGameEvents(f.store.db).filter((event) => event.eventType === "sandbox.deleted")).toHaveLength(1);

      const second = await reapWorkerJobs(f.store, f.ctx, { sandboxProvider: provider });
      expect(second.reaped).toHaveLength(0);
      expect(provider.deletedSandboxes).toHaveLength(1);
    } finally { f.store.db.close(); }
  });

  test("recovers a reaped claim when sandbox deletion fails", async () => {
    const f = fixture();
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const fake = new FakeSandboxProvider();
      const result = await sandboxClaim(f, fake);
      f.store.db.query("UPDATE jobs SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE job_id = ?").run(result.job.jobId);
      const failingProvider: SandboxProvider = {
        create: fake.create.bind(fake),
        get: fake.get.bind(fake),
        listByLabels: fake.listByLabels.bind(fake),
        delete: async () => { throw new Error("Daytona unavailable"); },
      };
      let recoveries = 0;
      const outcome = await reapWorkerJobs(f.store, f.ctx, {
        sandboxProvider: failingProvider,
        recover: async () => {
          recoveries += 1;
          return { runId: f.run.id, force: true, scannedActiveClaims: 1, recoveredClaims: 1, recovered: [], workerOutputIntegration: null, blockers: [], skippedActiveClaims: [] };
        },
      });
      expect(outcome.recovered).toBe(1);
      expect(recoveries).toBe(1);
      expect(warn.mock.calls.some(([message]) => String(message).includes("failed to delete"))).toBeTrue();
      expect(listGameEvents(f.store.db).filter((event) => event.eventType === "sandbox.deleted")).toHaveLength(0);
    } finally {
      warn.mockRestore();
      f.store.db.close();
    }
  });

  test("sweeps an expired domain claim without a matching claimed job", async () => {
    const f = fixture();
    try {
      const result = claim(f);
      f.store.db.query("UPDATE jobs SET status = 'waiting', lease_id = NULL, lease_expires_at = NULL WHERE job_id = ?").run(result.job.jobId);
      f.store.db.query("UPDATE target_claims SET ttl = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(String(result.job.payload.target_claim_id));
      const calls: unknown[] = [];
      const outcome = await reapWorkerJobs(f.store, f.ctx, { recover: async (input) => {
        calls.push(input);
        return { runId: f.run.id, force: false, scannedActiveClaims: 1, recoveredClaims: 1, recovered: [], workerOutputIntegration: null, blockers: [], skippedActiveClaims: [] };
      } });
      expect(outcome).toMatchObject({ reaped: [], recovered: 0, expiredClaimsRecovered: 1 });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ force: false, leaseId: f.ctx.dispatchLeaseId, processIntegrations: false });
    } finally { f.store.db.close(); }
  });

  test("does not sweep domain claims when none are expired", async () => {
    const f = fixture();
    try {
      claim(f);
      const calls: unknown[] = [];
      const outcome = await reapWorkerJobs(f.store, f.ctx, { recover: async (input) => {
        calls.push(input);
        return { runId: f.run.id, force: false, scannedActiveClaims: 0, recoveredClaims: 0, recovered: [], workerOutputIntegration: null, blockers: [], skippedActiveClaims: [] };
      } });
      expect(outcome.expiredClaimsRecovered).toBe(0);
      expect(calls).toHaveLength(0);
    } finally { f.store.db.close(); }
  });
});
