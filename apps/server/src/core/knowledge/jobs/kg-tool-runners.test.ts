import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRun, openState, startSchedulerEpoch, type StateStore } from "@server/core/cycle-runtime/run-state";
import {
  runEpochBoundary,
  type EpochBoundaryDependencies,
  type EpochBoundaryParams,
} from "@server/core/cycle-runtime/phases/running/scheduler/epoch-boundary";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { readToolRegistry, readToolRegistryEntries } from "@server/core/knowledge/graph/registry/sources";
import { packageRoot } from "@server/core/knowledge/paths";
import { executeToolRunner, knowledgeRunnerPlan } from "./kg.js";

function fakeSpawn(exitCode: number, stdout = "stdout", stderr = ""): typeof Bun.spawn {
  return (() => ({
    stdout: new Blob([stdout]).stream(),
    stderr: new Blob([stderr]).stream(),
    exited: Promise.resolve(exitCode),
    kill: () => {},
  })) as unknown as typeof Bun.spawn;
}

function runnerParams(overrides: Partial<Parameters<typeof executeToolRunner>[0]> = {}): Parameters<typeof executeToolRunner>[0] {
  return {
    toolId: "test_tool",
    command: ["test-command"],
    cwd: packageRoot(),
    env: {},
    repoRoot: "/test/repo",
    blocksOnFailure: false,
    spawn: fakeSpawn(0),
    ...overrides,
  };
}

describe("executeToolRunner", () => {
  test("returns a duration for a successful runner", async () => {
    const summary = await executeToolRunner(runnerParams());

    expect(summary.exit_code).toBe(0);
    expect(summary.duration_ms).toBeNumber();
    expect(summary.failed).toBeUndefined();
  });

  test("returns a failed summary for a non-blocking nonzero exit", async () => {
    const summary = await executeToolRunner(runnerParams({ spawn: fakeSpawn(2, "", "failure") }));

    expect(summary).toMatchObject({
      exit_code: 2,
      failed: true,
      reason: "non_blocking_tool_runner_failed",
      error: "failure",
    });
  });

  test("throws for a blocking nonzero exit", async () => {
    await expect(executeToolRunner(runnerParams({ blocksOnFailure: true, spawn: fakeSpawn(2, "", "failure") }))).rejects.toThrow(
      "Tool runner failed for test_tool",
    );
  });

  test("kills and reports a timed-out non-blocking runner", async () => {
    let killed = false;
    let resolveExit!: (code: number) => void;
    const exited = new Promise<number>((resolvePromise) => {
      resolveExit = resolvePromise;
    });
    const spawn = (() => ({
      stdout: new Blob([""]).stream(),
      stderr: new Blob([""]).stream(),
      exited,
      kill: () => {
        killed = true;
        resolveExit(143);
      },
    })) as unknown as typeof Bun.spawn;

    const summary = await executeToolRunner(runnerParams({ spawn, timeoutMs: 20 }));

    expect(killed).toBe(true);
    expect(summary).toMatchObject({
      exit_code: 143,
      failed: true,
      reason: "tool_runner_timeout",
      error: "timed out after 20ms",
    });
  });
});

test("gamecube registry wires the per-epoch tool index runners", () => {
  const entries = readToolRegistryEntries();
  const tools = readToolRegistry();
  const configured = tools.map((tool, index) => ({ toolId: tool.id, entry: entries[index] }));
  const repoRoot = packageRoot();

  for (const [toolId, script] of [
    ["asm_window_search", "build_asm_window_index.py"],
    ["type_layout_lookup", "build_type_index.py"],
  ] as const) {
    const item = configured.find((candidate) => candidate.toolId === toolId);
    expect(item?.entry.knowledge_runner).toBe(script);
    expect(item?.entry.knowledge_runner_timeout_ms).toBe(120_000);
    expect(knowledgeRunnerPlan()).toContainEqual({ toolId, script, timeoutMs: 120_000 });
    expect(existsSync(resolve(repoRoot, "toolpacks/gamecube-decomp/research", toolId, "runners", script))).toBe(true);
  }
});

const tempDirs: string[] = [];

function boundaryFixture(): { dir: string; store: StateStore; globals: GlobalArgs; runId: string; epochId: string } {
  const dir = mkdtempSync(join(tmpdir(), "kg-tool-runner-boundary-"));
  tempDirs.push(dir);
  const repoRoot = resolve(dir, "repo");
  const stateDir = resolve(dir, "state");
  mkdirSync(resolve(repoRoot, "build/GALE01"), { recursive: true });
  writeFileSync(resolve(repoRoot, "build/GALE01/report.json"), `${JSON.stringify({ measures: { matched_code_percent: 0 }, units: [] })}\n`);
  const store = openState(stateDir);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    workerPoolSize: 1,
  });
  return {
    dir,
    store,
    globals: { repoRoot, stateDir, dryRunAgents: false, provider: "test", model: "test", thinkingLevel: "low" },
    runId: run.id,
    epochId: epoch.id,
  };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

test("epoch boundary refreshes the successful cycle worktree and keeps failed runner summaries non-blocking", async () => {
  const value = boundaryFixture();
  const worktreeDir = resolve(value.dir, "epoch-worktree");
  let maintenanceRepoRoot: string | undefined;
  const callOrder: string[] = [];
  const dependencies = {
    reconcilePendingIntegrationAttempt: () => ({ status: "none" }),
    runEpochCycle: async () => {
      callOrder.push("cycle");
      return {
        artifactDir: resolve(value.dir, "artifacts"),
        buildSteps: [],
        commitSha: null,
        committed: false,
        durationMs: 1,
        label: "epoch-1",
        lockedPathsExcluded: [],
        matchedCodePercent: 0,
        measures: {},
        qaGate: null,
        regressions: { metricRegressions: 0, regressedFunctions: 0, regressedSections: 0 },
        repair: { paused: false, planned: 0, reasons: [], requeued: 0 },
        reportCopiedToRepo: false,
        savePoint: {},
        savePointEvidence: {},
        savePointId: null,
        scoreDelta: 0,
        worktreeDir,
      };
    },
    runKnowledgeMaintenance: async (globals: GlobalArgs) => {
      callOrder.push("maintenance");
      maintenanceRepoRoot = globals.repoRoot;
      return { tool_runners: [{ tool: "asm_window_search", failed: true }] };
    },
    publishCycleDraftPr: async () => ({ status: "skipped" }),
    ensureSchedulerEpochFromBoard: () => ({
      progress: { ordinal: 2, admitted: 1, available: 1, claimed: 0, remaining: 1 },
      epoch: { id: "next-epoch" },
      priorityRefreshes: 0,
      boardExhausted: false,
    }),
  } as unknown as EpochBoundaryDependencies;
  const params: EpochBoundaryParams = {
    store: value.store,
    globals: value.globals,
    args: new Map(),
    runId: value.runId,
    leaseId: `lease-${value.runId}`,
    trigger: "test boundary",
    schedulerEpochId: value.epochId,
    epochOrdinal: 1,
    config: {
      epochConfigureCommand: "true",
      epochLinkPaths: [],
      epochPauseThreshold: 12,
      epochRequeueLimit: 32,
      epochRetryMs: 60_000,
      cycleDraftPrEnabled: false,
      fullKgMaintenanceMode: "full",
      writeSetFlags: { writeSetWidening: "off" },
      schedulerEpochConfig: { workerPoolSize: 1 },
      graphDbPath: resolve(value.dir, "missing-graph.sqlite"),
      epochWorktreeDir: worktreeDir,
    },
    reportKnowledgeProgress: () => () => {},
    dependencies,
  };

  try {
    const outcome = await runEpochBoundary(params);

    expect(callOrder).toEqual(["cycle", "maintenance"]);
    expect(maintenanceRepoRoot).toBe(worktreeDir);
    expect(outcome.ok).toBe(true);
    expect(outcome.knowledgeMaintenanceRun?.tool_runners).toEqual([{ tool: "asm_window_search", failed: true }]);
  } finally {
    value.store.db.close();
  }
});
