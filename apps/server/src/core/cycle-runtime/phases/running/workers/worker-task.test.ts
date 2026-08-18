import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initializeHarnessState, requestDispatch } from "@server/core/harness-state";
import { cancelJob } from "@server/core/job-queue/kernel.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { admitEpochTargets, createRun, startSchedulerEpoch } from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { workerKernelOps, type WorkerJobRunContext } from "./worker-job.js";
import {
  readWorkerTaskFile,
  reconstructClaimedWorkerTask,
  runWorkerCycleFromTask,
} from "./worker-cycle.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function fixture(): {
  store: StateStore;
  globals: GlobalArgs;
  ctx: WorkerJobRunContext;
  task: Record<string, unknown>;
} {
  const stateDir = tempDir("worker-task-");
  const worktreePath = resolve(stateDir, "worktree");
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
    kind: "run", workflowId: run.id, reason: "worker task test", commandId: `command-${run.id}`,
    correlationId: run.id, actor: "operator", gameId: "test",
  });
  if (dispatch.queued) throw new Error("Expected test dispatch lease");
  const ctx: WorkerJobRunContext = {
    store, globals, runId: run.id, dispatchLeaseId: dispatch.leaseId, baseRev: "base-test",
    ttlSeconds: 1800, concurrencyLimit: 1, thinkingLevel: "medium",
    postReturnCheckCommand: "check", workerConfigureCommand: "configure", graphDbPath: resolve(stateDir, "graph.db"),
    writeSetFlags: { mergeOnFinish: false, writeSetWidening: "off", confirmationPass: false }, workerIdPrefix: "test",
  };
  const claimed = workerKernelOps(ctx).claimNextJob(store, { kind: "worker", concurrencyLimit: 1, leaseMs: 1_800_000 });
  if (!claimed) throw new Error("Expected worker job claim");
  const targetClaimId = String(claimed.job.payload.target_claim_id);
  const workerStateId = String(claimed.job.payload.worker_state_id);
  const workerId = String((store.db.query("SELECT worker_id FROM target_claims WHERE id = ?").get(targetClaimId) as { worker_id: string }).worker_id);
  const task = {
    version: 1,
    run_id: run.id,
    worker_id: workerId,
    job_id: claimed.job.jobId,
    claim_token: claimed.token,
    target_claim_id: targetClaimId,
    worker_state_id: workerStateId,
    base_rev: "base-test",
    worktree_path: worktreePath,
    artifact_dir: resolve(stateDir, "artifacts"),
    ttl_seconds: 1800,
    thinking_level: "medium",
    post_return_check_command: "check",
    worker_configure_command: "configure",
    graph_db_path: resolve(stateDir, "graph.db"),
    write_set_flags: ctx.writeSetFlags,
    execution_class: "local",
  };
  return { store, globals, ctx, task };
}

describe("worker task file", () => {
  test("requires --task-file", async () => {
    await expect(readWorkerTaskFile(new Map())).rejects.toThrow("worker-task requires --task-file");
  });

  test("rejects an unsupported version", async () => {
    const path = join(tempDir("worker-task-file-"), "task_spec.json");
    writeFileSync(path, JSON.stringify({ version: 2 }));
    await expect(readWorkerTaskFile(new Map([["--task-file", path]]))).rejects.toThrow("Unsupported worker task version: 2");
  });

  test("requires claim_token", async () => {
    const path = join(tempDir("worker-task-file-"), "task_spec.json");
    writeFileSync(path, JSON.stringify({ version: 1 }));
    await expect(readWorkerTaskFile(new Map([["--task-file", path]]))).rejects.toThrow("Worker task is missing claim_token");
  });
});

describe("claimed worker task reconstruction", () => {
  test("reconstructs the active target claim and normalized write set", () => {
    const f = fixture();
    try {
      const claimed = reconstructClaimedWorkerTask(f.store, f.task as unknown as Awaited<ReturnType<typeof readWorkerTaskFile>>);
      expect(claimed).toMatchObject({
        claimId: f.task.target_claim_id,
        workerStateId: f.task.worker_state_id,
        workerId: f.task.worker_id,
        target: { symbol: "fn", source_path: "src/a.c" },
        writeSet: ["src/a.c"],
        worktreePath: f.task.worktree_path,
      });
    } finally {
      f.store.db.close();
    }
  });

  test("rejects a stale token before reconstruction or execution", async () => {
    const f = fixture();
    const taskPath = join(f.globals.stateDir, "task_spec.json");
    try {
      writeFileSync(taskPath, JSON.stringify(f.task));
      cancelJob(f.store, { jobId: String(f.task.job_id), reason: "test cancellation" });
    } finally {
      f.store.db.close();
    }
    await expect(runWorkerCycleFromTask(f.globals, new Map([["--task-file", taskPath]]))).rejects.toThrow("stale claim token");
  });
});
