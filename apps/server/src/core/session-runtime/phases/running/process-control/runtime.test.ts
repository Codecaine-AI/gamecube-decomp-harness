import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { eventsForSubject, getProjectState, listProjectEvents } from "@server/core/project-state";
import {
  createProjectSession,
  epochIntegrationCommitMessage,
  listPendingIntegrations,
  listSessionTimeline,
  preparePendingIntegration,
} from "@server/core/project-session";
import { admitEpochTargets, createRun, getRun, openState, startSchedulerEpoch } from "@server/core/session-runtime/run-state";
import type { ResolvedProject } from "@server/core/project-registry";
import type { ManagedProcessController, StartManagedInput } from "@server/infrastructure/process-control/managed-process-controller";
import { createProcessControlRuntime } from "./runtime.js";

describe("process control runtime", () => {
  test("requests active epoch finish by adding a scheduler-owned event", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    const store = openState(stateDir);
    const run = createRun(store, "matched_code_percent", 100, 2, { projectId: "melee" }, { baseRevision: "base-test" });
    const epoch = startSchedulerEpoch(store, run.id, {
      size: { mode: "fixed", value: 2 },
      workerPoolSize: 2,
      candidateWindow: 2,
    });
    admitEpochTargets(store, {
      epochId: epoch.id,
      runId: run.id,
      candidates: [
        { unit: "unit", symbol: "fn_a", sourcePath: "src/a.c", size: 64, fuzzy: 91, priority: 2, reason: "test" },
        { unit: "unit", symbol: "fn_b", sourcePath: "src/b.c", size: 64, fuzzy: 90, priority: 1, reason: "test" },
      ],
      size: { mode: "fixed", value: 2 },
      workerPoolSize: 2,
    });
    store.db.close();

    const logs: string[] = [];
    const project = {
      projectId: "melee",
      processName: "melee-live",
      dashboard: {},
      repoRoot: "/tmp/melee-checkout",
      stateDir,
      graphDbPath: "/tmp/melee-graph.sqlite",
    } as unknown as ResolvedProject;
    const runtime = createProcessControlRuntime({
      appendLog: (_stream, text) => logs.push(text),
      json: (data, init) => new Response(JSON.stringify(data), init),
      processController: {} as ManagedProcessController,
      processStatus: () => ({ state: "running" }),
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

    const result = await runtime.finishEpochNow({ projectId: "melee", runId: run.id, reason: "test_finish_epoch" });

    expect(result).toMatchObject({ requested: true, runId: run.id, epochId: epoch.id, ordinal: epoch.ordinal });
    expect(logs[0]).toContain(`finish epoch requested for epoch ${epoch.ordinal}`);

    const verifyStore = openState(stateDir);
    try {
      const event = verifyStore.db
        .query("SELECT event_type, producer, payload_json, handled_at FROM events WHERE id = ?")
        .get(String(result.eventId)) as Record<string, unknown> | undefined;
      expect(event).toMatchObject({ event_type: "epoch_force_finish_requested", producer: "dashboard", handled_at: null });
      const payload = JSON.parse(String(event?.payload_json ?? "{}")) as Record<string, unknown>;
      expect(payload).toMatchObject({ epoch_id: epoch.id, ordinal: epoch.ordinal, reason: "test_finish_epoch" });
    } finally {
      verifyStore.db.close();
    }
  });

  test("accepts matching start options and builds the command from the stored run snapshot and worktree", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    const sessionRepoRoot = "/tmp/melee-session-worktree/source";
    const sessionGraphDb = "/tmp/melee-session-worktree/graph.sqlite";
    const store = openState(stateDir);
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      2,
      {
        projectId: "melee",
        projectKind: "doldecomp-melee",
        repoRoot: sessionRepoRoot,
        stateDir,
        graphDbPath: sessionGraphDb,
        descriptorPath: "/tmp/melee/project.json",
      },
      { baseRevision: "base-test" },
    );
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

    const response = await runtime.startManagedProcess({
      agentTimeoutSeconds: 1800,
      candidateRerank: "priority",
      candidateWindow: 64,
      epochSize: "64",
      goalValue: 100,
      integrationResolverConcurrency: 4,
      maxWorkers: 2,
      model: "gpt-5.6-sol",
      projectId: "melee",
      provider: "codex-lb",
      runId: run.id,
      thinkingLevel: "xhigh",
    });
    const payload = (await response.json()) as { command: string[]; leaseId: string };
    const repoRootFlag = payload.command.indexOf("--repo-root");
    const graphDbFlag = payload.command.indexOf("--graph-db");
    const leaseFlag = payload.command.indexOf("--lease-id");

    expect(response.status).toBe(200);
    expect(payload.command.slice(repoRootFlag, repoRootFlag + 2)).toEqual(["--repo-root", sessionRepoRoot]);
    expect(payload.command.slice(graphDbFlag, graphDbFlag + 2)).toEqual(["--graph-db", sessionGraphDb]);
    expect(payload.command.slice(payload.command.indexOf("--max-workers"), payload.command.indexOf("--max-workers") + 2)).toEqual(["--max-workers", "2"]);
    expect(payload.command.slice(payload.command.indexOf("--candidate-window"), payload.command.indexOf("--candidate-window") + 2)).toEqual(["--candidate-window", "64"]);
    expect(payload.command.slice(leaseFlag, leaseFlag + 2)).toEqual(["--lease-id", payload.leaseId]);
    expect((spawned as StartManagedInput | null)?.command.slice(repoRootFlag, repoRootFlag + 2)).toEqual(["--repo-root", sessionRepoRoot]);

    const resumedResponse = await runtime.startManagedProcess({ projectId: "melee", runId: run.id, maxWorkers: 2 });
    const resumedPayload = (await resumedResponse.json()) as { leaseId: string };
    expect(resumedResponse.status).toBe(200);
    expect(resumedPayload.leaseId).toBe(payload.leaseId);

    const verifyStore = openState(stateDir);
    try {
      expect(getProjectState(verifyStore, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        workflow_id: run.id,
        lease_id: payload.leaseId,
        status: "active",
      });
      expect(getRun(verifyStore, run.id)).toMatchObject({ status: "active", revision: 2 });
      expect(eventsForSubject(verifyStore.db, "run", run.id).map((event) => event.eventType)).toEqual([
        "run.drafted",
        "run.readied",
        "run.activated",
      ]);
    } finally {
      verifyStore.db.close();
    }
  });

  test("rejects conflicting start options before mutating run or lease state", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    const store = openState(stateDir);
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      2,
      { projectId: "melee", stateDir },
      {
        baseRevision: "base-test",
        configurationSnapshot: {
          agent_timeout_seconds: 2100,
          candidate_rerank: "opseq_hot_lane",
          candidate_window: 96,
          desired_workers: 2,
          dry_run_agents: false,
          epoch_configure_command: "",
          epoch_size: { mode: "fixed", value: 48 },
          goal_kind: "matched_code_percent",
          goal_value: 100,
          integration_resolver_concurrency: 3,
          model: "gpt-5.6-sol",
          provider: "codex-lb",
          thinking_level: "xhigh",
          worker_configure_command: "",
        },
      },
    );
    store.db.close();

    let spawned = false;
    const processController = {
      hasActiveProcess: () => ({ active: false }),
      spawn: () => {
        spawned = true;
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
      projectToSummary: () => ({ id: "melee" }) as never,
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
      runId: run.id,
      maxWorkers: 8,
    });
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      blocker: { code: "run_configuration_conflict", source_id: run.id },
      blocked_by: [{ code: "run_configuration_conflict", source_id: run.id }],
      conflicts: [{ field: "maxWorkers", requested: 8, stored: 2 }],
    });
    expect(spawned).toBe(false);

    const verifyStore = openState(stateDir);
    try {
      expect(getRun(verifyStore, run.id)).toMatchObject({ status: "ready", revision: run.revision });
      expect(getProjectState(verifyStore, "melee")).toBeNull();
      expect(eventsForSubject(verifyStore.db, "run", run.id).map((event) => event.eventType)).toEqual([
        "run.drafted",
        "run.readied",
      ]);
    } finally {
      verifyStore.db.close();
    }
  });

  test("passes tool concurrency env overrides when starting a managed process", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    const store = openState(stateDir);
    const run = createRun(store, "matched_code_percent", 100, 16, { projectId: "melee", stateDir }, { baseRevision: "base-test" });
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
      runId: run.id,
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

  test("keeps the operator actor across start action spawn-failure compensation", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-spawn-failure-"));
    try {
      const store = openState(stateDir);
      const run = createRun(
        store,
        "matched_code_percent",
        100,
        2,
        { projectId: "melee", stateDir },
        { baseRevision: "base-test" },
      );
      const baselineSequence = listProjectEvents(store.db, { projectId: "melee" }).at(-1)!.sequence;
      store.db.close();

      const spawnError = new Error("managed process spawn failed");
      const processController = {
        hasActiveProcess: () => ({ active: false }),
        spawn: () => {
          throw spawnError;
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
        projectToSummary: () => ({ id: "melee" }) as never,
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

      await expect(runtime.startManagedProcess({
        commandId: "command-operator-start",
        maxWorkers: 2,
        projectId: "melee",
        runId: run.id,
      })).rejects.toThrow(spawnError.message);

      const verifyStore = openState(stateDir);
      try {
        const actionEvents = listProjectEvents(verifyStore.db, {
          afterSequence: baselineSequence,
          projectId: "melee",
        });
        expect(actionEvents.map((event) => event.eventType)).toEqual([
          "project.dispatch_requested",
          "project.dispatch_acquired",
          "run.activated",
          "run.failed",
          "project.dispatch_released",
        ]);
        expect(new Set(actionEvents.map((event) => event.actor))).toEqual(new Set(["operator"]));
        expect(new Set(actionEvents.map((event) => event.correlationId))).toEqual(new Set([run.id]));
        expect(new Set(actionEvents.map((event) => event.parentSpanId)).size).toBe(1);
        expect(actionEvents[0]!.causationId).toBe("command-operator-start");
        for (let index = 1; index < actionEvents.length; index += 1) {
          expect(actionEvents[index]!.causationId).toBe(actionEvents[index - 1]!.eventId);
        }
        expect(getRun(verifyStore, run.id)).toMatchObject({ status: "failed", revision: 3 });
        expect(getProjectState(verifyStore, "melee")?.active_workflow).toBeNull();
      } finally {
        verifyStore.db.close();
      }
    } finally {
      rmSync(stateDir, { force: true, recursive: true });
    }
  });

  test("reconciles a committed pending epoch before spawning the managed process", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-reconcile-state-"));
    const repoRoot = mkdtempSync(join(tmpdir(), "process-control-reconcile-repo-"));
    const runGit = (args: string[]): string => {
      const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
      if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr) || new TextDecoder().decode(result.stdout));
      }
      return new TextDecoder().decode(result.stdout).trim();
    };
    try {
      runGit(["init", "-q"]);
      runGit([
        "-c",
        "user.name=Startup Reconciliation Test",
        "-c",
        "user.email=startup-reconcile@example.invalid",
        "commit",
        "--allow-empty",
        "-qm",
        "baseline",
      ]);
      const parentSha = runGit(["rev-parse", "HEAD"]);
      const branch = runGit(["branch", "--show-current"]);
      const store = openState(stateDir);
      const run = createRun(
        store,
        "matched_code_percent",
        100,
        2,
        { projectId: "melee", repoRoot, stateDir },
        { baseRevision: parentSha },
      );
      store.db.query("UPDATE runs SET session_uuid = 'session-startup' WHERE id = ?").run(run.id);
      createProjectSession(store.db, {
        actor: "operator",
        activeRunId: run.id,
        baseSha: parentSha,
        commandId: "command-session-startup",
        id: "project-session:session-startup",
        openingSyncId: "sync-startup",
        projectId: "melee",
        sessionUuid: "session-startup",
        traceId: "trace-session-startup",
        worktreeIdentity: repoRoot,
      });
      store.db
        .query(
          `INSERT INTO epochs (
             id, run_id, ordinal, size_mode, worker_pool_size, candidate_window,
             status, routing_summary_json, created_at
           ) VALUES ('epoch-startup', ?, 1, 'fixed', 2, 2, 'active', '{}', ?)`,
        )
        .run(run.id, new Date().toISOString());
      preparePendingIntegration(store, { branch, epochId: "epoch-startup", parentSha, runId: run.id });
      store.db.close();
      runGit([
        "-c",
        "user.name=Startup Reconciliation Test",
        "-c",
        "user.email=startup-reconcile@example.invalid",
        "commit",
        "--allow-empty",
        "-qm",
        epochIntegrationCommitMessage("epoch startup crash", "epoch-startup"),
      ]);
      const integrationCommit = runGit(["rev-parse", "HEAD"]);

      let reconciledBeforeSpawn = false;
      const processController = {
        hasActiveProcess: () => ({ active: false }),
        spawn: () => {
          const duringSpawn = openState(stateDir);
          try {
            reconciledBeforeSpawn =
              listPendingIntegrations(duringSpawn).length === 0 &&
              listSessionTimeline(duringSpawn.db, "session-startup")[0]?.payload.integration_commit === integrationCommit;
          } finally {
            duringSpawn.db.close();
          }
        },
      } as unknown as ManagedProcessController;
      const project = {
        projectId: "melee",
        processName: "melee-live",
        dashboard: {},
        repoRoot,
        stateDir,
        graphDbPath: join(stateDir, "graph.sqlite"),
      } as unknown as ResolvedProject;
      const runtime = createProcessControlRuntime({
        appendLog: () => undefined,
        json: (data, init) => new Response(JSON.stringify(data), init),
        processController,
        processStatus: () => ({}),
        projectToSummary: () => ({ id: "melee" }) as never,
        resolveDashboardProject: () => ({
          graphDbPath: project.graphDbPath,
          project,
          repoRoot,
          stateDir,
          usePathOverrides: false,
        }),
        runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
      });

      const response = await runtime.startManagedProcess({ projectId: "melee", runId: run.id, maxWorkers: 2 });

      expect(response.status).toBe(200);
      expect(reconciledBeforeSpawn).toBe(true);
    } finally {
      rmSync(stateDir, { force: true, recursive: true });
      rmSync(repoRoot, { force: true, recursive: true });
    }
  });
});
