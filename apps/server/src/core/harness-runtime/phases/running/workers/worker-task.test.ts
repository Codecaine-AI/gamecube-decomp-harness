import { createAcceptedRun as createRun } from "../test-fixture.js";
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { initializeDispatchState, requestDispatch } from "@server/core/harness-state";
import { cancelJob } from "@server/core/job-queue/kernel.js";
import { FakeSandboxProvider, type SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { storageMigrations } from "@server/core/orchestrator-state/storage/migrations/index.js";
import {
  admitEpochTargets,
  startSchedulerEpoch,
  updateRunStatus,
} from "@server/core/harness-runtime/run-state";
import type { AdvisoryAdjudicationMode, GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { QaScanFinding, QaScanInvocation } from "@server/core/validation/qa";
import { disableNetwork, fakeFailure, fakeOk } from "@agent-kernel/kernel/model-nodes/testing";
import {
  QA_LINT_ADVISORY_REPAIR_INSTRUCTION_ENFORCE,
  QA_LINT_REPAIR_INSTRUCTION,
} from "@server/core/agent-catalog/agents/running/worker/change-validation";
import {
  adjudicateAdvisories,
  type AdvisoryAdjudicationConfig,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication";
import {
  bool,
  createAdjudicationHarness,
  extractionAnswer,
  type AdjudicationHarness,
  type DecisionScript,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/__fixtures__/adjudication.js";
import { catchUpAdjudication, ensureModelNodeLaneState } from "@server/core/model-node-work";
import { createAdjudicationHandler } from "@server/core/model-node-work/handlers/adjudication.js";
import type { WorkerNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel";
import { workerKernelOps, type WorkerJobRunContext } from "./worker-job.js";
import {
  classifyWorkerError,
  readWorkerTaskFile,
  reconstructClaimedWorkerTask,
  runWorkerCycleFromTask,
  type WorkerCycleResult,
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
    candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 90 }],
    workerPoolSize: 1,
  });
  initializeDispatchState(store, { gameId: "test", traceId: "trace-test" });
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
    writeSetFlags: { writeSetWidening: "off" }, advisoryAdjudication: "shadow", workerIdPrefix: "test",
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
    const requiredVersion = storageMigrations.at(-1)?.version;
    f.store.db.run("DELETE FROM schema_migrations WHERE version > 1");
    f.store.db.close();
    writeFileSync(taskPath, JSON.stringify(f.task));

    await expect(
      runWorkerCycleFromTask(f.globals, new Map([["--task-file", taskPath]])),
    ).rejects.toThrow(`schema is behind this process: applied through v1, this build requires v${requiredVersion}`);

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

  test("closes and re-admits a worker without launching an agent when the baseline build fails", async () => {
    const provider = new FakeSandboxProvider();
    const f = await fixture(provider);
    const taskPath = join(f.globals.stateDir, "task_spec.json");
    const buildStderr = "ninja: error: unknown target 'build/GALE01/src/a.o'\n";
    provider.scriptExec(...Array.from({ length: 12 }, () => (
      call: { command: string[] },
    ) => {
      if (call.command[0] === "ninja") return { exitCode: 1, stdout: "", stderr: buildStderr };
      if (call.command[0] === "cat") return { exitCode: 0, stdout: "int fn(void) { return 0; }\n", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }));
    let runAgentCalls = 0;
    f.globals.dryRunAgents = false;
    try {
      updateRunStatus(f.store, String(f.task.run_id), "active", "operator");
      writeFileSync(taskPath, JSON.stringify(f.task));
    } finally {
      f.store.db.close();
    }

    const result = await runWorkerCycleFromTask(
      f.globals,
      new Map([["--task-file", taskPath]]),
      {
        sandboxProvider: provider,
        runAgent: async () => {
          runAgentCalls += 1;
          throw new Error("agent must not launch after a baseline build failure");
        },
      },
    );

    expect(runAgentCalls).toBe(0);
    expect(result).toMatchObject({
      lifecycleStatus: "error",
      errorKind: "baseline_build_failed",
      failed: true,
      providerFailure: false,
    });
    expect(provider.execCalls.some((call) => call.command[0] === "ninja")).toBeTrue();
    const workerState = JSON.parse(readFileSync(
      resolve(String(f.task.artifact_dir), "state", "worker_state.json"),
      "utf8",
    )) as Record<string, any>;
    expect(workerState).toMatchObject({
      lifecycle_status: "error",
      error: {
        kind: "baseline_build_failed",
        stderr_tail: buildStderr.trim(),
      },
    });
    expect(existsSync(resolve(String(f.task.artifact_dir), "state", "blocker.json"))).toBeTrue();
    const activity = readFileSync(resolve(String(f.task.artifact_dir), "activity.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(activity).toContainEqual(expect.objectContaining({
      phase: "setup",
      event_type: "baseline_validation_failed",
      stderr_tail: buildStderr.trim(),
    }));

    const reopened = openState(f.globals.stateDir);
    try {
      const persistedWorker = reopened.db.query(
        "SELECT lifecycle_status, summary_json FROM worker_state WHERE id = ?",
      ).get(String(f.task.worker_state_id)) as { lifecycle_status: string; summary_json: string };
      expect(persistedWorker.lifecycle_status).toBe("error");
      expect(JSON.parse(persistedWorker.summary_json)).toMatchObject({
        error: { kind: "baseline_build_failed" },
        infrastructure_failure: { classified: true, consecutive_count: 1 },
      });
      expect(reopened.db.query("SELECT status FROM target_claims WHERE id = ?").get(String(f.task.target_claim_id)))
        .toEqual({ status: "closed" });
      expect(reopened.db.query("SELECT status, infra_failure_count FROM epoch_targets WHERE id = ?").get(result.epochTargetId))
        .toEqual({ status: "admitted", infra_failure_count: 1 });
      expect(reopened.db.query(
        "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_error'",
      ).get(String(f.task.run_id))).toEqual({ count: 1 });
    } finally {
      reopened.db.close();
    }
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
      kind: "function",
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
      expect(capturedRunnerOptions?.kernelContext?.metadata?.stateDir).toBe(f.globals.stateDir);
      expect(capturedRunnerOptions?.toolContext).toMatchObject({
        cwd: "/workspace/melee",
        repoRoot: "/workspace/melee",
        sandboxHandle: handle,
        mwccDebugProvisioned: true,
      });
      expect(typeof capturedRunnerOptions?.toolContext?.requestWriteSetWidening).toBe("function");
      expect(provider.execCalls.filter((call) => call.command[2]?.includes("mwcceppc_debug.exe"))).toHaveLength(1);
      expect(capturedRunnerOptions?.prompt.kernelContext?.renderedContext).not.toContain(
        'relative_path="build/tools/dtk"',
      );
      expect(capturedRunnerOptions?.prompt.kernelContext?.renderedContext).not.toContain(
        "Broad find roots",
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

// ── full worker cycles through the advisory adjudication modes ───────────────

const POST_RETURN_COMMAND = "./post-return-check";
const TARGET_SOURCE_BEFORE = "int fn(void) {\n    int a = 0;\n    int b = 0;\n    return a + b;\n}\n";
const TARGET_SOURCE_AFTER = "int fn(void) {\n    int a = (int)(u8)gA;\n    int b = (int)(u8)gB;\n    return a + b;\n}\n";
const TARGET_WRITE_SET_PATCH = [
  "diff --git a/src/a.c b/src/a.c\n",
  "--- a/src/a.c\n",
  "+++ b/src/a.c\n",
  "@@ -1,5 +1,5 @@\n",
  " int fn(void) {\n",
  "-    int a = 0;\n",
  "-    int b = 0;\n",
  "+    int a = (int)(u8)gA;\n",
  "+    int b = (int)(u8)gB;\n",
  "     return a + b;\n",
  " }\n",
].join("");

function advisoryFinding(line: 2 | 3, overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "type_erasing_cast",
    severity: "warning",
    file: "src/a.c",
    line,
    excerpt: line === 2 ? "int a = (int)(u8)gA;" : "int b = (int)(u8)gB;",
    message: "cast erases the declared type",
    standard_id: "global_standard:types",
    detail: { llm_review: true, cast: "(int)(u8)" },
    ...overrides,
  };
}

function deterministicFinding(severity: "error" | "warning"): QaScanFinding {
  return {
    rule_id: "packed_string_blob",
    severity,
    file: "src/a.c",
    line: 3,
    excerpt: "int b = (int)(u8)gB;",
    message: "hand-packed string blob",
    standard_id: "global_standard:literals-and-data-ownership",
  };
}

function qaInvocation(findings: QaScanFinding[]): QaScanInvocation {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const exitCode = errors > 0 ? 1 : warnings > 0 ? 2 : 0;
  return {
    exitCode,
    result: {
      tool: "review_lint",
      operation: "review_lint:scan_diff",
      status: errors > 0 ? "failed" : warnings > 0 ? "warned" : "passed",
      repo: "/workspace/melee",
      base: null,
      findings,
      counts: { errors, warnings },
    },
    stdout: "",
    stderr: "",
    toolError: null,
    command: ["scan_diff.py"],
  };
}

function unitDiffReport(score: number): string {
  return JSON.stringify({
    left: {
      sections: [{ name: ".text", fuzzy_match_percent: score, size: 64 }],
      symbols: [{ name: "fn", fuzzy_match_percent: score, size: 64, instructions: [] }],
    },
  });
}

interface ScriptedCycle {
  mode?: AdvisoryAdjudicationMode;
  findings: QaScanFinding[];
  afterScore?: number;
  postReturnExitCode?: number;
  /** Moves the claim deadline to this many ms from now. */
  claimDeadlineInMs?: number;
  rawText?: string;
  kernelRun?: { runId: string; containerId: string; piSessionId: string } | null;
  nodeKernel?: WorkerTaskRuntimeDeps["nodeKernel"];
  advisoryConfig?: WorkerTaskRuntimeDeps["advisoryConfig"];
}

interface ScriptedCycleOutcome {
  result: WorkerCycleResult;
  stateDir: string;
  artifactDir: string;
  workerStateId: string;
  runId: string;
  postReturnRuns: number;
  qaScans: number;
  checkpoints: Array<Record<string, unknown>>;
  returnGate: Record<string, any>;
  repairRequest: Record<string, any> | null;
  workerState: Record<string, any>;
  acceptedAdvisories: Array<Record<string, unknown>>;
  /** The first attempt's rendered system prompt. */
  systemPrompt: string;
}

/**
 * One validated worker attempt against a scripted sandbox: the agent edits
 * src/a.c, the unit diff measures `afterScore` (baseline 90), the QA scan
 * reports `findings`, and the configured post-return command exits
 * `postReturnExitCode`. A second agent call fails, so the cycle ends after
 * exactly one validated attempt whatever the continuation decision is.
 */
async function runScriptedCycle(scenario: ScriptedCycle): Promise<ScriptedCycleOutcome> {
  const provider = new FakeSandboxProvider();
  const f = await fixture(provider);
  const taskPath = join(f.globals.stateDir, "task_spec.json");
  const artifactDir = String(f.task.artifact_dir);
  const handle = f.sandboxHandle;
  let phase: "pre" | "post" = "pre";
  let postReturnRuns = 0;
  let qaScans = 0;
  let agentCalls = 0;
  let systemPrompt = "";
  const ok = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" });
  provider.scriptExec(...Array.from({ length: 400 }, () => async (call: { command: string[] }) => {
    const [command, ...args] = call.command;
    if (command === "git" && args[0] === "diff" && args[1]?.startsWith("--output=")) {
      await handle.writeFile(args[1].slice("--output=".length), phase === "post" ? TARGET_WRITE_SET_PATCH : "");
      return ok();
    }
    if (command === "git" && args[0] === "diff" && args[1] === "--name-only") return ok(phase === "post" ? "src/a.c\n" : "");
    if (command === "cat") {
      return args[0] === "src/a.c"
        ? ok(phase === "post" ? TARGET_SOURCE_AFTER : TARGET_SOURCE_BEFORE)
        : { exitCode: 1, stdout: "", stderr: `cat: ${args[0]}: No such file` };
    }
    if (command === "build/tools/objdiff-cli") {
      // The symbol-scoped first diff is optional evidence; the unit diff scores the attempt.
      if (args.includes("fn")) return { exitCode: 1, stdout: "", stderr: "first diff unavailable" };
      return ok(unitDiffReport(phase === "post" ? (scenario.afterScore ?? 95) : 90));
    }
    if (command === "/bin/sh" && args[1] === POST_RETURN_COMMAND) {
      postReturnRuns += 1;
      const exitCode = scenario.postReturnExitCode ?? 0;
      return { exitCode, stdout: "", stderr: exitCode === 0 ? "" : "post-return check failed" };
    }
    return ok();
  }));
  f.globals.dryRunAgents = false;
  const task: Record<string, unknown> = {
    ...f.task,
    // A workspace root of its own: change-validation caches build.ninja's objdiff
    // args per root for the process, and other suites script that root differently.
    workspace_root: `/workspace/melee-scripted-${randomUUID()}`,
    post_return_check_command: POST_RETURN_COMMAND,
    ...(scenario.mode === undefined ? {} : { advisory_adjudication: scenario.mode }),
  };
  try {
    updateRunStatus(f.store, String(task.run_id), "active", "operator");
    if (scenario.claimDeadlineInMs !== undefined) {
      f.store.db.run(
        "UPDATE target_claims SET ttl = ? WHERE id = ?",
        [new Date(Date.now() + scenario.claimDeadlineInMs).toISOString(), String(task.target_claim_id)],
      );
    }
    writeFileSync(taskPath, JSON.stringify(task));
  } finally {
    f.store.db.close();
  }
  const knowledgeRoot = resolve(f.globals.stateDir, "knowledge");
  const functionsIndex = resolve(knowledgeRoot, "sources", "code_graph", "indexes", "functions.jsonl");
  mkdirSync(resolve(functionsIndex, ".."), { recursive: true });
  writeFileSync(functionsIndex, `${JSON.stringify({ unit: "unit", kind: "function", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 90 })}\n`);
  const previousKnowledgeRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;
  let result: WorkerCycleResult;
  try {
    result = await runWorkerCycleFromTask(f.globals, new Map([["--task-file", taskPath]]), {
      sandboxProvider: provider,
      ...(scenario.advisoryConfig ? { advisoryConfig: scenario.advisoryConfig } : {}),
      qaScanRunner: async () => {
        qaScans += 1;
        return qaInvocation(scenario.findings);
      },
      nodeKernel: scenario.nodeKernel ?? (async () => {
        throw new Error("the node kernel must not be requested in this mode");
      }),
      runAgent: async (options) => {
        agentCalls += 1;
        const outputPath = resolve(options.outputDir, `scripted-agent-${agentCalls}.txt`);
        const base = {
          sessionId: `scripted-session-${agentCalls}`,
          outputPath,
          systemPromptPath: resolve(options.outputDir, `scripted-agent-${agentCalls}.system.md`),
          userPromptPath: resolve(options.outputDir, `scripted-agent-${agentCalls}.user.md`),
          dryRun: false,
        };
        if (agentCalls > 1) {
          writeFileSync(outputPath, "scripted stop");
          return { ...base, rawText: "scripted stop", failed: true, error: "scripted stop after one attempt" };
        }
        phase = "post";
        systemPrompt = options.prompt.systemPrompt;
        const rawText = scenario.rawText ?? JSON.stringify({ status: "validation_ready", summary: "typed the loads" });
        writeFileSync(outputPath, rawText);
        const kernelRun = scenario.kernelRun === undefined
          ? { runId: "worker-kernel-run", containerId: "worker-kernel-container", piSessionId: "worker-pi-session" }
          : scenario.kernelRun;
        return {
          ...base,
          rawText,
          ...(kernelRun
            ? { kernelRunId: kernelRun.runId, kernelContainerId: kernelRun.containerId, kernelPiSessionId: kernelRun.piSessionId }
            : {}),
        };
      },
    });
  } finally {
    if (previousKnowledgeRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previousKnowledgeRoot;
  }
  const readJson = (path: string) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);
  const reopened = openState(f.globals.stateDir);
  try {
    const checkpoints = (reopened.db.query(
      "SELECT * FROM worker_checkpoints WHERE worker_state_id = ? ORDER BY attempt_index",
    ).all(String(task.worker_state_id)) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      metadata_json: JSON.parse(String(row.metadata_json)),
      failure_reasons_json: JSON.parse(String(row.failure_reasons_json)),
    }));
    const acceptedAdvisories = reopened.db.query("SELECT * FROM accepted_advisory ORDER BY fingerprint").all() as Array<Record<string, unknown>>;
    return {
      result,
      stateDir: f.globals.stateDir,
      artifactDir,
      workerStateId: String(task.worker_state_id),
      runId: String(task.run_id),
      postReturnRuns,
      qaScans,
      checkpoints,
      returnGate: readJson(resolve(artifactDir, "runner_validation", "attempt-0.return_gate.json")),
      repairRequest: readJson(resolve(artifactDir, "runner_validation", "attempt-0.repair_request.json")),
      workerState: readJson(resolve(artifactDir, "state", "worker_state.json")),
      acceptedAdvisories,
      systemPrompt,
    };
  } finally {
    reopened.db.close();
  }
}


/**
 * A checkpoint row as recordWorkerCheckpoint stored it, with the row id, the
 * validation time, and every run-specific id and temp path replaced, so rows
 * of two separate cycles compare equal when their inputs were equal.
 */
function comparableCheckpoint(outcome: ScriptedCycleOutcome, options: { withoutCandidate?: boolean } = {}): Record<string, unknown> {
  expect(outcome.checkpoints).toHaveLength(1);
  const { id: _id, validation_time: _validationTime, metadata_json, ...row } = outcome.checkpoints[0]!;
  const metadata = { ...(metadata_json as Record<string, unknown>) };
  if (options.withoutCandidate) delete metadata.llm_review_candidate;
  let text = JSON.stringify({ ...row, metadata_json: metadata });
  const placeholders: Array<[string, string]> = [
    [outcome.stateDir, "<state-dir>"],
    [outcome.runId, "<run>"],
    [outcome.workerStateId, "<worker-state>"],
    [String(row.epoch_id), "<epoch>"],
    [String(row.epoch_target_id), "<epoch-target>"],
    [String(row.target_claim_id), "<target-claim>"],
  ];
  for (const [value, placeholder] of placeholders) text = text.replaceAll(value, placeholder);
  return JSON.parse(text) as Record<string, unknown>;
}

const SHADOW_PARITY_FIXTURES: Array<[string, Omit<ScriptedCycle, "mode">, { postReturnRuns: number }]> = [
  ["advisory-only pass", { findings: [advisoryFinding(2)] }, { postReturnRuns: 0 }],
  ["mixed advisory and deterministic findings", { findings: [advisoryFinding(2), deterministicFinding("warning")] }, { postReturnRuns: 0 }],
  ["deterministic error", { findings: [deterministicFinding("error")] }, { postReturnRuns: 0 }],
  ["exact match keeping an advisory", { findings: [advisoryFinding(2)], afterScore: 100 }, { postReturnRuns: 0 }],
  ["clean attempt whose configured post-return check fails", { findings: [], postReturnExitCode: 1 }, { postReturnRuns: 1 }],
  ["advisory-only with a failing post-return check configured", { findings: [advisoryFinding(2)], postReturnExitCode: 1 }, { postReturnRuns: 0 }],
  ["advisory-only with the claim deadline 5 s away", { findings: [advisoryFinding(2)], claimDeadlineInMs: 5_000 }, { postReturnRuns: 0 }],
];

describe("advisory adjudication shadow parity (S9)", () => {
  for (const [name, fixture, expected] of SHADOW_PARITY_FIXTURES) {
    test(`off and shadow are identical in the worker: ${name}`, async () => {
      let nodeKernelCalls = 0;
      const nodeKernel = async () => {
        nodeKernelCalls += 1;
        throw new Error("the worker must not request the node kernel outside enforce");
      };
      const off = await runScriptedCycle({ ...fixture, mode: "off", nodeKernel });
      const shadow = await runScriptedCycle({ ...fixture, mode: "shadow", nodeKernel });

      expect(nodeKernelCalls).toBe(0);
      expect(off.postReturnRuns).toBe(expected.postReturnRuns);
      expect(shadow.postReturnRuns).toBe(off.postReturnRuns);
      expect(shadow.qaScans).toBe(off.qaScans);
      expect(comparableCheckpoint(shadow, { withoutCandidate: true })).toEqual(comparableCheckpoint(off));
      expect(off.checkpoints[0]!.metadata_json).not.toHaveProperty("llm_review_candidate");
      expect((shadow.checkpoints[0]!.metadata_json as Record<string, any>).llm_review_candidate).toMatchObject({
        schema: "llm_review_candidate_v1",
        mode: "shadow",
      });
      expect(shadow.returnGate.repair_policy.decision).toEqual(off.returnGate.repair_policy.decision);
      expect(shadow.returnGate.repair_reasons).toEqual(off.returnGate.repair_reasons);
      expect(shadow.result.lifecycleStatus).toBe(off.result.lifecycleStatus);
      expect(shadow.acceptedAdvisories).toEqual([]);
      // The system prompt is the one intended difference: shadow asks for kept_advisories, off stays today's text.
      expect(off.systemPrompt).not.toContain("kept_advisories");
      expect(shadow.systemPrompt).toContain("kept_advisories");
    }, 30_000);
  }
});

// ── enforce: inline adjudication against a temp node kernel ──────────────────

const ENFORCE_JUSTIFICATION =
  "MWCC emits lbz r0,gA@sda21(r13) only through the u8 cast; the plain int read emits lwz and objdiff drops from 100% to 96.4%.";
const KEPT_ADVISORIES_NOTE = JSON.stringify({
  status: "validation_ready",
  summary: "typed the loads through the casts the original binary needs",
  kept_advisories: [
    { rule_id: "type_erasing_cast", file: "src/a.c", line: 2, justification: ENFORCE_JUSTIFICATION },
    { rule_id: "type_erasing_cast", file: "src/a.c", line: 3, justification: ENFORCE_JUSTIFICATION },
  ],
});

/** Thresholds that pass every enforcement bar (§6.9), keyed by the harness's decision model. */
function enforceConfig(harness: AdjudicationHarness, inline: Partial<AdvisoryAdjudicationConfig["inline"]> = {}): AdvisoryAdjudicationConfig {
  return {
    ...harness.config,
    inline: { ...harness.config.inline, ...inline },
    thresholds: {
      [harness.config.model]: {
        passAt: 0.85,
        failAt: 0.15,
        qualification: "enforcement-qualified",
        labelSetHash: "label-set-test",
        splitHash: "split-test",
        heldout: { negatives: 29, positives: 10, falseAccepts: 0, upper95: 0.098 },
        calibratedAt: "2026-10-07T00:00:00.000Z",
      },
    },
  };
}

/** The extraction answer for the two kept casts (finding ids A1 = line 2, A2 = line 3). */
function keptCastsExtraction(justifications: { A1?: string | null; A2?: string | null } = { A1: ENFORCE_JUSTIFICATION, A2: ENFORCE_JUSTIFICATION }) {
  return fakeOk(extractionAnswer({ A1: justifications.A1 ?? null, A2: justifications.A2 ?? null }));
}

/** p(justified) per flagged line of src/a.c. */
function byLine(probabilities: Record<number, number>): DecisionScript {
  return (line) => bool(probabilities[line] ?? 0.5);
}

const harnesses: AdjudicationHarness[] = [];
let restoreNetwork: (() => void) | null = null;

async function enforceHarness(opts: Parameters<typeof createAdjudicationHarness>[0] = {}): Promise<AdjudicationHarness> {
  restoreNetwork ??= disableNetwork();
  const harness = await createAdjudicationHarness({ calls: () => keptCastsExtraction(), ...opts });
  harnesses.push(harness);
  return harness;
}

afterAll(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup();
  restoreNetwork?.();
});

function enforceScenario(harness: AdjudicationHarness, overrides: Partial<ScriptedCycle> & { inline?: Partial<AdvisoryAdjudicationConfig["inline"]> } = {}): ScriptedCycle {
  const { inline, ...rest } = overrides;
  return {
    mode: "enforce",
    findings: [advisoryFinding(2), advisoryFinding(3)],
    rawText: KEPT_ADVISORIES_NOTE,
    kernelRun: { runId: harness.parentRunId, containerId: harness.temp.tempDb.containerId, piSessionId: "worker-pi-session" },
    nodeKernel: async () => harness.temp.kernel,
    advisoryConfig: enforceConfig(harness, inline),
    ...rest,
  };
}

/** What acceptance and the continuation policy decided, independent of the feedback text. */
function acceptanceFields(outcome: ScriptedCycleOutcome) {
  const checkpoint = outcome.checkpoints[0]!;
  const { latestReasons: _reasons, ...decision } = outcome.returnGate.repair_policy.decision as Record<string, unknown>;
  return {
    validation_status: checkpoint.validation_status,
    hard_gates_passed: checkpoint.hard_gates_passed,
    improved_over_baseline: checkpoint.improved_over_baseline,
    selectable: checkpoint.selectable,
    exact_match: checkpoint.exact_match,
    qa_status: checkpoint.qa_status,
    decision,
  };
}

function inlineAdjudication(outcome: ScriptedCycleOutcome): Record<string, any> {
  return (outcome.checkpoints[0]!.metadata_json as Record<string, any>).llm_review_adjudication;
}

describe("advisory adjudication enforce: the post-return check runs only after acceptance", () => {
  const rejections: Array<[string, () => Promise<ScriptedCycle>]> = [
    ["rejection", async () => enforceScenario(await enforceHarness({ decisions: byLine({ 2: 0.05, 3: 0.05 }) }))],
    ["engine outage", async () => enforceScenario(await enforceHarness({ calls: () => fakeFailure({ kind: "http", status: 502 }) }))],
    ["missing TYPESAFE_API_KEY", async () => enforceScenario(await enforceHarness({ classifierConfigured: false }))],
    [
      "timeout",
      async () => enforceScenario(await enforceHarness({ decisions: () => ({ hang: true }) }), { inline: { maxMs: 300, minMs: 100, reserveMs: 0 } }),
    ],
    ["insufficient budget", async () => enforceScenario(await enforceHarness(), { claimDeadlineInMs: 5_000 })],
  ];

  for (const [name, scenario] of rejections) {
    test(`${name}: zero post-return command executions and today's acceptance and continuation`, async () => {
      const enforced = await scenario();
      const enforce = await runScriptedCycle(enforced);
      const off = await runScriptedCycle({ ...enforced, mode: "off", nodeKernel: undefined, advisoryConfig: undefined });

      expect(enforce.postReturnRuns).toBe(0);
      expect(off.postReturnRuns).toBe(0);
      expect(acceptanceFields(enforce)).toEqual(acceptanceFields(off));
      expect(inlineAdjudication(enforce)).toMatchObject({ mode: "enforce", applied: true, accepted_fingerprints: [] });
      expect(inlineAdjudication(enforce).verdict).not.toBe("pass");
      expect(enforce.acceptedAdvisories).toEqual([]);
    }, 30_000);
  }

  test("acceptance: exactly one post-return command execution", async () => {
    const enforce = await runScriptedCycle(enforceScenario(await enforceHarness({ decisions: byLine({ 2: 0.93, 3: 0.93 }) })));
    expect(enforce.postReturnRuns).toBe(1);
    expect(inlineAdjudication(enforce)).toMatchObject({ verdict: "pass", applied: true });
    expect(enforce.checkpoints[0]).toMatchObject({ validation_status: "passed", hard_gates_passed: 1, selectable: 1 });
  }, 30_000);

  test("insufficient budget makes no node call", async () => {
    let nodeKernelCalls = 0;
    const harness = await enforceHarness();
    const enforce = await runScriptedCycle({
      ...enforceScenario(harness, { claimDeadlineInMs: 5_000 }),
      nodeKernel: async () => {
        nodeKernelCalls += 1;
        return harness.temp.kernel;
      },
    });
    expect(nodeKernelCalls).toBe(0);
    expect(harness.callNames()).toEqual([]);
    expect(harness.classifier.calls).toHaveLength(0);
    expect(inlineAdjudication(enforce)).toMatchObject({ verdict: "error", error: "reviewer-unavailable: insufficient-time" });
    expect(enforce.checkpoints[0]!.failure_reasons_json).toContainEqual(expect.stringMatching(/src\/a\.c:2 .*: insufficient time$/));
    expect(enforce.checkpoints[0]!.failure_reasons_json).toContainEqual(expect.stringMatching(/src\/a\.c:3 .*: insufficient time$/));
  }, 30_000);

  test("a hanging engine is cancelled at the budget; the checkpoint and continuation still land", async () => {
    const enforce = await runScriptedCycle(
      enforceScenario(await enforceHarness({ decisions: () => ({ hang: true }) }), { inline: { maxMs: 300, minMs: 100, reserveMs: 0 } }),
    );
    const adjudication = inlineAdjudication(enforce);
    expect(adjudication).toMatchObject({ verdict: "error", budget_ms: 300, error: "reviewer-unavailable: timeout" });
    expect(adjudication.duration_ms).toBeLessThan(300 + 200);
    expect(enforce.checkpoints).toHaveLength(1);
    expect(enforce.returnGate.repair_policy.decision).toMatchObject({ shouldContinue: true, continueReason: "attempt_budget_available" });
  }, 30_000);
});

function kernelChildren(harness: AdjudicationHarness): Array<{ agent_name: string; kind: string; status: string }> {
  const db = new Database(harness.temp.tempDb.path, { readonly: true });
  try {
    return db
      .query<{ agent_name: string; kind: string; status: string }, [string]>(
        `SELECT r.agent_name, s.kind, r.status FROM agent_runs r JOIN pi_agent_sessions s ON s.id = r.pi_session_id
         WHERE r.parent_run_id = ? ORDER BY r.agent_name`,
      )
      .all(harness.parentRunId);
  } finally {
    db.close();
  }
}

function gateVerdicts(harness: AdjudicationHarness): string[] {
  const db = new Database(harness.temp.tempDb.path, { readonly: true });
  try {
    return db
      .query<{ data: string }, [string]>("SELECT event_data AS data FROM trace_events WHERE run_id = ? AND type = 'gate_end'")
      .all(harness.parentRunId)
      .map((row) => (JSON.parse(row.data) as { gate_name: string; verdict: string }))
      .map((gate) => `${gate.gate_name}:${gate.verdict}`);
  } finally {
    db.close();
  }
}

function repairReasonsOf(outcome: ScriptedCycleOutcome): string[] {
  expect(outcome.repairRequest).not.toBeNull();
  return outcome.repairRequest!.reasons as string[];
}

describe("advisory adjudication full worker cycles", () => {
  test("full cycle shadow: the worker makes no node call; the lane later adjudicates", async () => {
    const harness = await enforceHarness({ decisions: byLine({ 2: 0.93, 3: 0.93 }) });
    let nodeKernelCalls = 0;
    const shadow = await runScriptedCycle({
      ...enforceScenario(harness),
      mode: "shadow",
      advisoryConfig: undefined,
      nodeKernel: async () => {
        nodeKernelCalls += 1;
        throw new Error("the shadow worker must not request the node kernel");
      },
    });

    expect(nodeKernelCalls).toBe(0);
    expect(harness.callNames()).toEqual([]);
    expect(kernelChildren(harness)).toEqual([]);
    const checkpoint = shadow.checkpoints[0]!;
    expect(checkpoint).toMatchObject({ qa_status: "warnings", validation_status: "failed", selectable: 0 });
    expect((checkpoint.metadata_json as Record<string, any>).llm_review_candidate).toMatchObject({
      schema: "llm_review_candidate_v1",
      mode: "shadow",
      eligible: true,
      post_return_check: "not-run",
      pre_qa: { status: "passed" },
      kernel: { run_id: harness.parentRunId },
      advisories: [
        { fingerprint: null, finding: { line: 2 } },
        { fingerprint: null, finding: { line: 3 } },
      ],
    });
    expect(checkpoint.metadata_json).not.toHaveProperty("llm_review_adjudication");

    // Later, in the run-loop process: the SQL-only catch-up enqueues the checkpoint and the lane handler adjudicates it.
    const store = openState(shadow.stateDir);
    try {
      ensureModelNodeLaneState(store, "checkpoint_adjudication", "2000-01-01T00:00:00.000Z");
      expect(catchUpAdjudication(store)).toBe(1);
      const handler = createAdjudicationHandler(
        { repoRoot: shadow.stateDir, stateDir: shadow.stateDir, dryRunAgents: false, provider: "test", model: "test", thinkingLevel: "medium" },
        {
          nodeKernel: async () => harness.temp.kernel,
          adjudicate: (params) => adjudicateAdvisories({ ...params, config: harness.config }),
        },
      );
      const job = { jobId: "lane-job", kind: "checkpoint_adjudication", payload: { checkpointId: String(checkpoint.id) } };
      await handler(job as never, { store, token: null as never, signal: new AbortController().signal, ensureClaim: () => {} });
      const row = store.db.query<{ metadata_json: string; selectable: number; qa_status: string }, [string]>(
        "SELECT metadata_json, selectable, qa_status FROM worker_checkpoints WHERE id = ?",
      ).get(String(checkpoint.id))!;
      expect(JSON.parse(row.metadata_json).llm_review_adjudication).toMatchObject({ mode: "shadow", applied: false, verdict: "pass" });
      // Shadow never changes acceptance.
      expect(row).toMatchObject({ selectable: 0, qa_status: "warnings" });
    } finally {
      store.db.close();
    }
    expect(kernelChildren(harness).map((child) => [child.agent_name, child.kind, child.status])).toEqual([
      ["ExtractCheckpointKnowledge", "call", "done"],
      ["JudgeAdvisory:A1", "decision", "done"],
      ["JudgeAdvisory:A2", "decision", "done"],
    ]);
  }, 30_000);

  test("full cycle enforce: an accepted advisory makes the checkpoint selectable; call, gate and decisions nest under the worker run", async () => {
    const harness = await enforceHarness({ decisions: byLine({ 2: 0.93, 3: 0.93 }) });
    const enforce = await runScriptedCycle(enforceScenario(harness, { afterScore: 100 }));

    expect(enforce.result).toMatchObject({ lifecycleStatus: "exact", exact: true, bestCheckpointId: enforce.checkpoints[0]!.id });
    expect(enforce.postReturnRuns).toBe(1);
    const checkpoint = enforce.checkpoints[0]!;
    const metadata = checkpoint.metadata_json as Record<string, any>;
    expect(checkpoint).toMatchObject({ validation_status: "passed", hard_gates_passed: 1, selectable: 1, exact_match: 1, qa_status: "warnings" });
    expect(metadata.qa_status_effective).toBe("clean");
    expect(metadata.llm_review_adjudication).toMatchObject({ mode: "enforce", applied: true, verdict: "pass" });
    expect(metadata.llm_review_candidate).toMatchObject({
      mode: "enforce",
      eligible: true,
      post_return_check: "passed",
      inline_result: { verdict: "pass" },
    });
    const fingerprints = (metadata.llm_review_candidate.advisories as Array<{ fingerprint: string | null }>).map((a) => a.fingerprint);
    expect(fingerprints.every((fingerprint) => typeof fingerprint === "string" && fingerprint.startsWith("af2:"))).toBe(true);
    expect(new Set(metadata.llm_review_adjudication.accepted_fingerprints)).toEqual(new Set(fingerprints));

    expect(enforce.acceptedAdvisories).toHaveLength(2);
    expect(enforce.acceptedAdvisories.map((row) => [row.full_line, row.occurrences]).sort()).toEqual([
      ["int a = (int)(u8)gA;", 1],
      ["int b = (int)(u8)gB;", 1],
    ]);
    for (const row of enforce.acceptedAdvisories) {
      expect(row).toMatchObject({ checkpoint_id: checkpoint.id, run_id: enforce.runId, rule_id: "type_erasing_cast", file: "src/a.c", probability: 0.93 });
      expect(fingerprints).toContain(String(row.fingerprint));
      expect(typeof row.decision_run_id).toBe("string");
      expect(JSON.parse(String(row.thresholds_json))).toEqual({ passAt: 0.85, failAt: 0.15 });
    }

    expect(kernelChildren(harness).map((child) => [child.agent_name, child.kind, child.status])).toEqual([
      ["ExtractCheckpointKnowledge", "call", "done"],
      ["JudgeAdvisory:A1", "decision", "done"],
      ["JudgeAdvisory:A2", "decision", "done"],
    ]);
    expect(gateVerdicts(harness).sort()).toEqual(["advisory-verdict:pass", "llm-review-advisories:pass"]);
    expect((await harness.temp.kernel.doctor()).ok).toBe(true);
  }, 30_000);

  test("full cycle enforce, accepted and non-exact: no rejection feedback", async () => {
    const accepted = await runScriptedCycle(enforceScenario(await enforceHarness({ decisions: byLine({ 2: 0.93, 3: 0.93 }) })));
    const clean = await runScriptedCycle({ ...enforceScenario(await enforceHarness()), findings: [] });

    expect(accepted.postReturnRuns).toBe(1);
    const classification = classifyWorkerError({
      result: { sessionId: "s", outputPath: "o", systemPromptPath: "p", userPromptPath: "u", rawText: KEPT_ADVISORIES_NOTE, dryRun: false },
      agentNote: JSON.parse(KEPT_ADVISORIES_NOTE),
      runnerValidation: accepted.returnGate.runner_validation,
    });
    expect(classification?.kind).not.toBe("runner_validation_qa_lint_failed");
    const reasons = repairReasonsOf(accepted);
    expect(reasons.filter((reason) => reason.startsWith("qa_lint_finding:"))).toEqual([]);
    expect(reasons).not.toContain(QA_LINT_REPAIR_INSTRUCTION);
    expect(reasons).not.toContain(QA_LINT_ADVISORY_REPAIR_INSTRUCTION_ENFORCE);
    expect(accepted.returnGate.repair_policy.decision).toEqual(clean.returnGate.repair_policy.decision);
    expect(accepted.repairRequest!.instruction).toBe(clean.repairRequest!.instruction);
    expect(accepted.checkpoints[0]).toMatchObject({ qa_status: "warnings", selectable: 1 });
    expect((accepted.checkpoints[0]!.metadata_json as Record<string, any>).qa_status_effective).toBe("clean");
  }, 30_000);

  test("full cycle enforce, one advisory accepted and one rejected: feedback names only the rejected one", async () => {
    const harness = await enforceHarness({ decisions: byLine({ 2: 0.93, 3: 0.05 }) });
    const enforce = await runScriptedCycle(enforceScenario(harness));

    expect(enforce.postReturnRuns).toBe(0);
    expect(enforce.acceptedAdvisories).toEqual([]);
    expect(enforce.checkpoints[0]).toMatchObject({ validation_status: "failed", selectable: 0, qa_status: "warnings" });
    const metadata = enforce.checkpoints[0]!.metadata_json as Record<string, any>;
    expect(metadata.qa_status_effective).toBe("warnings");
    expect(metadata.llm_review_adjudication).toMatchObject({ verdict: "fail" });
    expect(metadata.llm_review_adjudication.accepted_fingerprints).toHaveLength(1);

    const reasons = repairReasonsOf(enforce);
    expect(reasons.filter((reason) => reason.startsWith("qa_lint_finding:"))).toEqual([
      expect.stringContaining("type_erasing_cast at src/a.c:3"),
    ]);
    expect(reasons).toContainEqual(expect.stringMatching(/^runner validation: llm_review advisory type_erasing_cast at src\/a\.c:3 .*judged unjustified \(p=0\.05\)$/));
    expect(reasons.some((reason) => reason.includes("src/a.c:2"))).toBe(false);
    expect(reasons.at(-1)).toBe(QA_LINT_ADVISORY_REPAIR_INSTRUCTION_ENFORCE);
    expect(reasons).not.toContain(QA_LINT_REPAIR_INSTRUCTION);
  }, 30_000);

  test("node errors never reach classifyWorkerError", async () => {
    const marker = `NODE_FAILURE_${randomUUID()}`;
    const harness = await enforceHarness();
    const throwing = {
      call: async () => { throw new Error(`${marker} call`); },
      decide: async () => { throw new Error(`${marker} decide`); },
      step: async () => { throw new Error(`${marker} step`); },
      gate: async () => { throw new Error(`${marker} gate`); },
    } as unknown as WorkerNodeKernel;
    for (const nodeKernel of [async () => throwing, async (): Promise<WorkerNodeKernel | null> => { throw new Error(`${marker} kernel`); }]) {
      const enforce = await runScriptedCycle({ ...enforceScenario(harness), nodeKernel });
      const classification = classifyWorkerError({
        result: { sessionId: "s", outputPath: "o", systemPromptPath: "p", userPromptPath: "u", rawText: KEPT_ADVISORIES_NOTE, dryRun: false },
        agentNote: JSON.parse(KEPT_ADVISORIES_NOTE),
        runnerValidation: enforce.returnGate.runner_validation,
      });
      expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
      expect(JSON.stringify(classification)).not.toContain(marker);
      expect(JSON.stringify(enforce.checkpoints[0]!.failure_reasons_json)).not.toContain(marker);
      expect(JSON.stringify(enforce.returnGate)).not.toContain(marker);
      expect(enforce.result.providerOutage).toBe(false);
      expect(enforce.result.providerFailure).toBe(false);
      expect(enforce.postReturnRuns).toBe(0);
      expect(inlineAdjudication(enforce)).toMatchObject({ verdict: "error", accepted_fingerprints: [] });
    }
  }, 30_000);

  test("qualification exploratory downgrades enforce to shadow and records it", async () => {
    let nodeKernelCalls = 0;
    const nodeKernel = async () => {
      nodeKernelCalls += 1;
      throw new Error("a downgraded enforce worker must not request the node kernel");
    };
    const fixture: ScriptedCycle = { findings: [advisoryFinding(2)], rawText: KEPT_ADVISORIES_NOTE, nodeKernel };
    // No advisoryConfig: the shipped config.json, whose thresholds are exploratory.
    const downgraded = await runScriptedCycle({ ...fixture, mode: "enforce" });
    const shadow = await runScriptedCycle({ ...fixture, mode: "shadow" });

    expect(nodeKernelCalls).toBe(0);
    expect(downgraded.postReturnRuns).toBe(shadow.postReturnRuns);
    expect(comparableCheckpoint(downgraded, { withoutCandidate: true })).toEqual(comparableCheckpoint(shadow, { withoutCandidate: true }));
    expect((downgraded.checkpoints[0]!.metadata_json as Record<string, any>).llm_review_candidate).toMatchObject({
      mode: "shadow",
      requested_mode: "enforce",
      downgraded_reason: "not-enforcement-qualified",
      eligible: true,
    });
    expect(downgraded.checkpoints[0]!.metadata_json).not.toHaveProperty("llm_review_adjudication");
    expect(downgraded.systemPrompt).toBe(shadow.systemPrompt);
  }, 30_000);
});
