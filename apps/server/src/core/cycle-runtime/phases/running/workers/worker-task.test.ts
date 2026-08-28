import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { initializeHarnessState, requestDispatch } from "@server/core/harness-state";
import { cancelJob } from "@server/core/job-queue/kernel.js";
import { FakeSandboxProvider, type SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  admitEpochTargets,
  createRun,
  startSchedulerEpoch,
  updateRunStatus,
} from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { workerKernelOps, type WorkerJobRunContext } from "./worker-job.js";
import {
  readWorkerTaskFile,
  reconstructClaimedWorkerTask,
  runWorkerCycleFromTask,
  type WorkerTaskRuntimeDeps,
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

async function fixture(sandboxProvider = new FakeSandboxProvider()): Promise<{
  store: StateStore;
  globals: GlobalArgs;
  ctx: WorkerJobRunContext;
  task: Record<string, unknown>;
  sandboxHandle: SandboxHandle;
}> {
  const stateDir = tempDir("worker-task-");
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
    kind: "run", workflowId: run.id, reason: "worker task test", commandId: `command-${run.id}`,
    correlationId: run.id, actor: "operator", gameId: "test",
  });
  if (dispatch.queued) throw new Error("Expected test dispatch lease");
  const ctx: WorkerJobRunContext = {
    store, globals, runId: run.id, dispatchLeaseId: dispatch.leaseId, baseRev: "base-test",
    ttlSeconds: 1800, sandboxSleep: false, sandboxSleepDebounceMs: 1_000,
    concurrencyLimit: 1, thinkingLevel: "medium",
    postReturnCheckCommand: "check", workerConfigureCommand: "configure", graphDbPath: resolve(stateDir, "graph.db"),
    writeSetFlags: { writeSetWidening: "off" }, workerIdPrefix: "test",
  };
  const claimed = workerKernelOps(ctx).claimNextJob(store, { kind: "worker", concurrencyLimit: 1, leaseMs: 1_800_000 });
  if (!claimed) throw new Error("Expected worker job claim");
  const targetClaimId = String(claimed.job.payload.target_claim_id);
  const workerStateId = String(claimed.job.payload.worker_state_id);
  const workerId = String((store.db.query("SELECT worker_id FROM target_claims WHERE id = ?").get(targetClaimId) as { worker_id: string }).worker_id);
  const sandboxHandle = await sandboxProvider.create({
    snapshot: "test",
    labels: { job_id: claimed.job.jobId },
    resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
    ttlMinutes: 30,
  });
  const task = {
    version: 1,
    run_id: run.id,
    worker_id: workerId,
    job_id: claimed.job.jobId,
    claim_token: claimed.token,
    target_claim_id: targetClaimId,
    worker_state_id: workerStateId,
    base_rev: "base-test",
    artifact_dir: resolve(stateDir, "artifacts"),
    ttl_seconds: 1800,
    sandbox_sleep: false,
    sandbox_sleep_debounce_ms: 1_000,
    thinking_level: "medium",
    post_return_check_command: "check",
    worker_configure_command: "configure",
    graph_db_path: resolve(stateDir, "graph.db"),
    write_set_flags: ctx.writeSetFlags,
    execution_class: "sandbox",
    sandbox_id: sandboxHandle.sandboxId,
    workspace_root: "/workspace/melee",
  };
  return { store, globals, ctx, task, sandboxHandle };
}

describe("worker task file", () => {
  test("never applies migrations when the child schema is behind", async () => {
    const f = await fixture();
    const taskPath = join(f.globals.stateDir, "behind_task_spec.json");
    f.store.db.run("DELETE FROM schema_migrations WHERE version > 1");
    f.store.db.close();
    writeFileSync(taskPath, JSON.stringify(f.task));

    await expect(
      runWorkerCycleFromTask(f.globals, new Map([["--task-file", taskPath]])),
    ).rejects.toThrow("schema is behind this process: applied through v1, this build requires v3");

    const db = new Database(join(f.globals.stateDir, "orchestrator.sqlite"));
    try {
      expect(db.query("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
      ]);
    } finally {
      db.close();
    }
  });

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

  test("round-trips a sandbox task file", async () => {
    const f = await fixture();
    const path = join(f.globals.stateDir, "sandbox_task_spec.json");
    try {
      writeFileSync(path, JSON.stringify(f.task));
      await expect(readWorkerTaskFile(new Map([["--task-file", path]]))).resolves.toMatchObject({
        execution_class: "sandbox",
        sandbox_id: f.sandboxHandle.sandboxId,
        workspace_root: "/workspace/melee",
        sandbox_sleep: false,
        sandbox_sleep_debounce_ms: 1_000,
      });
    } finally {
      f.store.db.close();
    }
  });

  test("rejects the removed local execution class", async () => {
    const f = await fixture();
    const path = join(f.globals.stateDir, "invalid_sandbox_task_spec.json");
    try {
      writeFileSync(path, JSON.stringify({ ...f.task, execution_class: "local" }));
      await expect(readWorkerTaskFile(new Map([["--task-file", path]]))).rejects.toThrow(
        "Worker task has invalid execution_class: local",
      );
    } finally {
      f.store.db.close();
    }
  });
});

describe("claimed worker task reconstruction", () => {
  test("reconstructs the active target claim and normalized write set", async () => {
    const f = await fixture();
    try {
      const claimed = reconstructClaimedWorkerTask(f.store, f.task as unknown as Awaited<ReturnType<typeof readWorkerTaskFile>>);
      expect(claimed).toMatchObject({
        claimId: f.task.target_claim_id,
        workerStateId: f.task.worker_state_id,
        workerId: f.task.worker_id,
        target: { symbol: "fn", source_path: "src/a.c" },
        writeSet: ["src/a.c"],
        worktreePath: f.task.workspace_root,
      });
    } finally {
      f.store.db.close();
    }
  });

  test("rejects a stale token before reconstruction or execution", async () => {
    const f = await fixture();
    const taskPath = join(f.globals.stateDir, "task_spec.json");
    try {
      writeFileSync(taskPath, JSON.stringify(f.task));
      cancelJob(f.store, { jobId: String(f.task.job_id), reason: "test cancellation" });
    } finally {
      f.store.db.close();
    }
    await expect(runWorkerCycleFromTask(f.globals, new Map([["--task-file", taskPath]]))).rejects.toThrow("stale claim token");
  });

  test("resolves a sandbox handle once and checks remote workspace liveness", async () => {
    const provider = new FakeSandboxProvider();
    const f = await fixture(provider);
    const taskPath = join(f.globals.stateDir, "task_spec.json");
    provider.scriptExec({ exitCode: 1, stdout: "", stderr: "missing workspace" });
    let getCalls = 0;
    const get = provider.get.bind(provider);
    provider.get = async (sandboxId) => {
      getCalls += 1;
      return get(sandboxId);
    };
    try {
      updateRunStatus(f.store, String(f.task.run_id), "active", "operator");
      writeFileSync(taskPath, JSON.stringify(f.task));
    } finally {
      f.store.db.close();
    }

    await expect(
      runWorkerCycleFromTask(
        f.globals,
        new Map([["--task-file", taskPath]]),
        { sandboxProvider: provider },
      ),
    ).rejects.toThrow("Worker task sandbox workspace does not exist: /workspace/melee: missing workspace");
    expect(getCalls).toBe(1);
    expect(provider.execCalls).toEqual([{
      sandboxId: f.sandboxHandle.sandboxId,
      command: ["test", "-d", "."],
      opts: { cwd: "/workspace/melee", env: undefined, timeoutMs: 30_000 },
    }]);
  });

  test("uses a host-safe sandbox runner cwd while preserving remote tool roots and attempt evidence", async () => {
    const provider = new FakeSandboxProvider();
    const f = await fixture(provider);
    const taskPath = join(f.globals.stateDir, "task_spec.json");
    const attemptPath = resolve(
      String(f.task.artifact_dir),
      "runner_validation",
      "attempt-0.write_set.diff",
    );
    const patch = [
      "diff --git a/src/a.c b/src/a.c\n",
      "index 1111111..2222222 100644\n",
      "--- a/src/a.c\n",
      "+++ b/src/a.c\n",
      "@@ -1 +1 @@\n",
      "-int value = 0;\n",
      "+int value = 1;\n",
    ].join("");
    const handle = f.sandboxHandle;
    let capturedRunnerOptions: Parameters<NonNullable<WorkerTaskRuntimeDeps["runAgent"]>>[0] | undefined;
    let observedBeforeClaimEnd = false;
    const writeRemoteDiff = async (call: { command: string[] }, content: string) => {
      const remotePath = call.command[2]?.replace("--output=", "");
      if (!remotePath) throw new Error("missing remote git diff output path");
      await handle.writeFile(remotePath, content);
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    provider.scriptExec(
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "build/tools/dtk\n", stderr: "" },
      (call) => writeRemoteDiff(call, ""),
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      (call) => writeRemoteDiff(call, patch),
      { exitCode: 0, stdout: "", stderr: "" },
      () => {
        expect(readFileSync(attemptPath)).toEqual(Buffer.from(patch));
        expect(existsSync(resolve(String(f.task.artifact_dir), "state", "worker_state.json"))).toBeFalse();
        observedBeforeClaimEnd = true;
        return { exitCode: 0, stdout: "src/a.c\n", stderr: "" };
      },
    );
    const knowledgeRoot = resolve(f.globals.stateDir, "knowledge");
    const functionsIndex = resolve(knowledgeRoot, "sources", "code_graph", "indexes", "functions.jsonl");
    mkdirSync(resolve(functionsIndex, ".."), { recursive: true });
    writeFileSync(functionsIndex, `${JSON.stringify({
      unit: "unit",
      symbol: "fn",
      sourcePath: "src/a.c",
      size: 64,
      fuzzy: 90,
    })}\n`);
    const previousKnowledgeRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;
    try {
      updateRunStatus(f.store, String(f.task.run_id), "active", "operator");
      writeFileSync(taskPath, JSON.stringify(f.task));
    } finally {
      f.store.db.close();
    }

    try {
      await runWorkerCycleFromTask(
        f.globals,
        new Map([["--task-file", taskPath]]),
        {
          sandboxProvider: provider,
          runAgent: async (options) => {
            capturedRunnerOptions = options;
            const { runMeleeKernelPiAgent } = await import("@server/infrastructure/agent-runtime/kernel-pi-runner");
            return runMeleeKernelPiAgent(options);
          },
        },
      );
    } finally {
      if (previousKnowledgeRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previousKnowledgeRoot;
    }

    const reopened = openState(f.globals.stateDir);
    try {
      const hostCwd = resolve(String(f.task.artifact_dir), "host-cwd");
      expect(existsSync(hostCwd)).toBeTrue();
      expect(capturedRunnerOptions?.cwd).toBe(hostCwd);
      expect(capturedRunnerOptions?.hostCwd).toBeUndefined();
      expect(capturedRunnerOptions?.kernelContext?.workingDir).toBe(hostCwd);
      expect(capturedRunnerOptions?.toolContext).toMatchObject({
        cwd: "/workspace/melee",
        repoRoot: "/workspace/melee",
        sandboxHandle: handle,
        mwccDebugProvisioned: true,
      });
      expect(provider.execCalls.filter((call) => call.command[2]?.includes("mwcceppc_debug.exe"))).toHaveLength(1);
      expect(capturedRunnerOptions?.prompt.kernelContext?.renderedContext).toContain(
        'relative_path="build/tools/dtk" command="dtk" exists="true"',
      );
      expect(capturedRunnerOptions?.prompt.kernelContext?.renderedContext).toContain(
        'relative_path="build/binutils/powerpc-eabi-objdump" command="powerpc-eabi-objdump" exists="false"',
      );
      const checkpoint = reopened.db.query(
        "SELECT patch_path, diff_path FROM worker_checkpoints WHERE worker_state_id = ?",
      ).get(String(f.task.worker_state_id)) as { patch_path: string; diff_path: string };
      expect(observedBeforeClaimEnd).toBeTrue();
      expect(checkpoint).toEqual({ patch_path: attemptPath, diff_path: attemptPath });
      expect(readFileSync(checkpoint.patch_path)).toEqual(Buffer.from(patch));
      expect(provider.downloadCalls.map(({ localPath }) => localPath)).toEqual([
        resolve(String(f.task.artifact_dir), "runner_validation", "pre_worker_write_set.diff"),
        attemptPath,
      ]);
    } finally {
      reopened.db.close();
    }
  }, 15_000);
});
