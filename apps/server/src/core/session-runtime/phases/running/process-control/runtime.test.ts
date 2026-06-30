import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createRun, openState } from "@server/core/session-runtime/run-state";
import type { ResolvedProject } from "@server/core/project-registry";
import type { ManagedProcessController, StartManagedInput } from "@server/infrastructure/process-control/managed-process-controller";
import { createProcessControlRuntime } from "./runtime.js";

describe("process control runtime", () => {
  test("starts a run from the run's recorded session worktree", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    const sessionRepoRoot = "/tmp/melee-session-worktree/source";
    const sessionGraphDb = "/tmp/melee-session-worktree/graph.sqlite";
    const store = openState(stateDir);
    const run = createRun(store, "matched_code_percent", 100, 2, {
      projectId: "melee",
      projectKind: "doldecomp-melee",
      repoRoot: sessionRepoRoot,
      stateDir,
      graphDbPath: sessionGraphDb,
      descriptorPath: "/tmp/melee/project.json",
    });
    store.db.close();

    let spawned: StartManagedInput | null = null;
    const processController = {
      hasActiveProcess: () => ({ active: false }),
      spawn: (input: StartManagedInput) => {
        spawned = input;
      },
    } as unknown as ManagedProcessController;

    const project = {
      projectId: "melee",
      processName: "melee-live",
      dashboard: {},
      repoRoot: "/tmp/melee-default-checkout",
      stateDir,
      graphDbPath: "/tmp/melee-default-graph.sqlite",
    } as unknown as ResolvedProject;

    const runtime = createProcessControlRuntime({
      appendLog: () => undefined,
      json: (data, init) => new Response(JSON.stringify(data), init),
      processController,
      processStatus: () => ({}),
      projectToSummary: () => ({
        id: "melee",
        displayName: "Melee",
        kind: "doldecomp-melee",
        repoRoot: project.repoRoot,
        stateDir,
        graphDbPath: project.graphDbPath,
        processName: "melee-live",
        baseRef: "origin/master",
        descriptorPath: "/tmp/melee/project.json",
        repoRootExists: true,
        stateDirExists: true,
        graphDbExists: true,
      }),
      resolveDashboardProject: () => ({
        project,
        repoRoot: project.repoRoot,
        stateDir,
        graphDbPath: project.graphDbPath,
        usePathOverrides: false,
      }),
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
    });

    const response = await runtime.startManagedProcess({ projectId: "melee", runId: run.id, maxWorkers: 2 });
    const payload = (await response.json()) as { command: string[] };
    const repoRootFlag = payload.command.indexOf("--repo-root");
    const graphDbFlag = payload.command.indexOf("--graph-db");

    expect(response.status).toBe(200);
    expect(payload.command.slice(repoRootFlag, repoRootFlag + 2)).toEqual(["--repo-root", sessionRepoRoot]);
    expect(payload.command.slice(graphDbFlag, graphDbFlag + 2)).toEqual(["--graph-db", sessionGraphDb]);
    expect((spawned as StartManagedInput | null)?.command.slice(repoRootFlag, repoRootFlag + 2)).toEqual(["--repo-root", sessionRepoRoot]);
  });

  test("passes tool concurrency env overrides when starting a managed process", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    let spawned: StartManagedInput | null = null;
    const processController = {
      hasActiveProcess: () => ({ active: false }),
      spawn: (input: StartManagedInput) => {
        spawned = input;
      },
    } as unknown as ManagedProcessController;

    const project = {
      projectId: "melee",
      processName: "melee-live",
      dashboard: {},
      repoRoot: "/tmp/melee-checkout",
      stateDir,
      graphDbPath: "/tmp/melee-graph.sqlite",
    } as unknown as ResolvedProject;

    const runtime = createProcessControlRuntime({
      appendLog: () => undefined,
      json: (data, init) => new Response(JSON.stringify(data), init),
      processController,
      processStatus: () => ({}),
      projectToSummary: () => ({
        id: "melee",
        displayName: "Melee",
        kind: "doldecomp-melee",
        repoRoot: project.repoRoot,
        stateDir,
        graphDbPath: project.graphDbPath,
        processName: "melee-live",
        baseRef: "origin/master",
        descriptorPath: "/tmp/melee/project.json",
        repoRootExists: true,
        stateDirExists: true,
        graphDbExists: true,
      }),
      resolveDashboardProject: () => ({
        project,
        repoRoot: project.repoRoot,
        stateDir,
        graphDbPath: project.graphDbPath,
        usePathOverrides: false,
      }),
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
    });

    const response = await runtime.startManagedProcess({
      projectId: "melee",
      maxWorkers: 16,
      toolConcurrency: {
        mwccDebug: 6,
        sourcePermuter: 2,
        sourcePermuterJobs: 1,
      },
    });

    expect(response.status).toBe(200);
    expect((spawned as StartManagedInput | null)?.env).toEqual({
      ORCH_SOURCE_PERMUTER_MAX_JOBS: "1",
      ORCH_WORKER_TOOL_CONCURRENCY_MWCC_DEBUG: "6",
      ORCH_WORKER_TOOL_CONCURRENCY_SOURCE_PERMUTER: "2",
    });
  });
});
