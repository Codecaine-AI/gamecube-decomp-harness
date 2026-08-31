import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { eventsForSubject, getHarnessState, listGameEvents } from "@server/core/harness-state";
import {
  createCycle,
  epochIntegrationCommitMessage,
  listPendingIntegrations,
  listCycleTimeline,
  preparePendingIntegration,
} from "@server/core/cycle";
import { createRun, getRun, openState } from "@server/core/cycle-runtime/run-state";
import type { ResolvedGame } from "@server/core/game-registry";
import type { ManagedProcessController, StartManagedInput } from "@server/infrastructure/process-control/managed-process-controller";
import { createProcessControlRuntime } from "./runtime.js";

describe("process control runtime", () => {
  test("syncs a staged worker width before resuming and builds the command from the stored run snapshot and worktree", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    const cycleRepoRoot = "/tmp/melee-cycle-worktree/source";
    const cycleGraphDb = "/tmp/melee-cycle-worktree/graph.sqlite";
    const store = openState(stateDir);
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      2,
      {
        gameId: "melee",
        gameKind: "doldecomp-melee",
        repoRoot: cycleRepoRoot,
        stateDir,
        graphDbPath: cycleGraphDb,
        descriptorPath: "/tmp/melee/game.json",
      },
      {
        baseRevision: "base-test",
        configurationSnapshot: {
          agent_timeout_seconds: 1800,
          desired_workers: 4,
          dry_run_agents: false,
          epoch_configure_command: "",
          goal_kind: "matched_code_percent",
          goal_value: 100,
          model: "gpt-5.6-sol",
          provider: "codex-lb",
          sandbox_profile: "",
          thinking_level: "xhigh",
          worker_configure_command: "",
        },
      },
    );
    store.db.close();

    let spawned: StartManagedInput | null = null;
    const processController = {
      hasActiveProcess: () => ({ active: false }),
      spawn: (input: StartManagedInput) => {
        spawned = input;
      },
    } as unknown as ManagedProcessController;

    const game = {
      gameId: "melee",
      processName: "melee-live",
      dashboard: {},
      repoRoot: "/tmp/melee-default-checkout",
      stateDir,
      graphDbPath: "/tmp/melee-default-graph.sqlite",
    } as unknown as ResolvedGame;

    const runtime = createProcessControlRuntime({
      json: (data, init) => new Response(JSON.stringify(data), init),
      processController,
      processStatus: () => ({}),
      gameToSummary: () => ({
        id: "melee",
        displayName: "Melee",
        kind: "doldecomp-melee",
        repoRoot: game.repoRoot,
        stateDir,
        graphDbPath: game.graphDbPath,
        processName: "melee-live",
        baseRef: "origin/master",
        descriptorPath: "/tmp/melee/game.json",
        repoRootExists: true,
        stateDirExists: true,
        graphDbExists: true,
      }),
      resolveDashboardGame: () => ({
        game,
        repoRoot: game.repoRoot,
        stateDir,
        graphDbPath: game.graphDbPath,
        usePathOverrides: false,
      }),
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
    });

    const response = await runtime.startManagedProcess({
      agentTimeoutSeconds: 1800,
      goalValue: 100,
      maxWorkers: 4,
      model: "gpt-5.6-sol",
      gameId: "melee",
      provider: "codex-lb",
      runId: run.id,
      thinkingLevel: "xhigh",
    });
    const payload = (await response.json()) as { command: string[]; leaseId: string };
    const repoRootFlag = payload.command.indexOf("--repo-root");
    const graphDbFlag = payload.command.indexOf("--graph-db");
    const leaseFlag = payload.command.indexOf("--lease-id");

    expect(response.status).toBe(200);
    expect(payload.command.slice(repoRootFlag, repoRootFlag + 2)).toEqual(["--repo-root", cycleRepoRoot]);
    expect(payload.command.slice(graphDbFlag, graphDbFlag + 2)).toEqual(["--graph-db", cycleGraphDb]);
    expect(payload.command.slice(payload.command.indexOf("--max-workers"), payload.command.indexOf("--max-workers") + 2)).toEqual(["--max-workers", "4"]);
    expect(payload.command.slice(leaseFlag, leaseFlag + 2)).toEqual(["--lease-id", payload.leaseId]);
    expect(payload.command).toContain("run-loop");
    expect(payload.command).not.toContain("babysit");
    expect(payload.command).not.toContain("--force-recover-claims");
    expect((spawned as StartManagedInput | null)?.command.slice(repoRootFlag, repoRootFlag + 2)).toEqual(["--repo-root", cycleRepoRoot]);

    const resumedResponse = await runtime.startManagedProcess({ gameId: "melee", runId: run.id, maxWorkers: 4 });
    const resumedPayload = (await resumedResponse.json()) as { leaseId: string };
    expect(resumedResponse.status).toBe(200);
    expect(resumedPayload.leaseId).toBe(payload.leaseId);

    const verifyStore = openState(stateDir);
    try {
      expect(getHarnessState(verifyStore, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        workflow_id: run.id,
        lease_id: payload.leaseId,
        status: "active",
      });
      expect(getRun(verifyStore, run.id)).toMatchObject({ desiredWorkers: 4, status: "active", revision: 3 });
      expect(eventsForSubject(verifyStore.db, "run", run.id).map((event) => event.eventType)).toEqual([
        "run.drafted",
        "run.readied",
        "run.desired_workers_changed",
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
      { gameId: "melee", stateDir },
      {
        baseRevision: "base-test",
        configurationSnapshot: {
          agent_timeout_seconds: 2100,
          desired_workers: 2,
          dry_run_agents: false,
          epoch_configure_command: "",
          goal_kind: "matched_code_percent",
          goal_value: 100,
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
    const game = {
      gameId: "melee",
      processName: "melee-live",
      dashboard: {},
      repoRoot: "/tmp/melee-checkout",
      stateDir,
      graphDbPath: "/tmp/melee-graph.sqlite",
    } as unknown as ResolvedGame;
    const runtime = createProcessControlRuntime({
      json: (data, init) => new Response(JSON.stringify(data), init),
      processController,
      processStatus: () => ({}),
      gameToSummary: () => ({ id: "melee" }) as never,
      resolveDashboardGame: () => ({
        game,
        repoRoot: game.repoRoot,
        stateDir,
        graphDbPath: game.graphDbPath,
        usePathOverrides: false,
      }),
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
    });

    const response = await runtime.startManagedProcess({
      gameId: "melee",
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
      expect(getHarnessState(verifyStore, "melee")).toBeNull();
      expect(eventsForSubject(verifyStore.db, "run", run.id).map((event) => event.eventType)).toEqual([
        "run.drafted",
        "run.readied",
      ]);
    } finally {
      verifyStore.db.close();
    }
  });

  test("starts a managed process with a clean environment", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "process-control-runtime-"));
    const store = openState(stateDir);
    const run = createRun(store, "matched_code_percent", 100, 16, { gameId: "melee", stateDir }, { baseRevision: "base-test" });
    store.db.close();
    let spawned: StartManagedInput | null = null;
    const processController = {
      hasActiveProcess: () => ({ active: false }),
      spawn: (input: StartManagedInput) => {
        spawned = input;
      },
    } as unknown as ManagedProcessController;

    const game = {
      gameId: "melee",
      processName: "melee-live",
      dashboard: {},
      repoRoot: "/tmp/melee-checkout",
      stateDir,
      graphDbPath: "/tmp/melee-graph.sqlite",
    } as unknown as ResolvedGame;

    const runtime = createProcessControlRuntime({
      json: (data, init) => new Response(JSON.stringify(data), init),
      processController,
      processStatus: () => ({}),
      gameToSummary: () => ({
        id: "melee",
        displayName: "Melee",
        kind: "doldecomp-melee",
        repoRoot: game.repoRoot,
        stateDir,
        graphDbPath: game.graphDbPath,
        processName: "melee-live",
        baseRef: "origin/master",
        descriptorPath: "/tmp/melee/game.json",
        repoRootExists: true,
        stateDirExists: true,
        graphDbExists: true,
      }),
      resolveDashboardGame: () => ({
        game,
        repoRoot: game.repoRoot,
        stateDir,
        graphDbPath: game.graphDbPath,
        usePathOverrides: false,
      }),
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
    });

    const response = await runtime.startManagedProcess({
      gameId: "melee",
      runId: run.id,
      maxWorkers: 16,
    });

    expect(response.status).toBe(200);
    expect((spawned as StartManagedInput | null)?.env).toBeUndefined();
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
        { gameId: "melee", stateDir },
        { baseRevision: "base-test" },
      );
      const baselineSequence = listGameEvents(store.db, { gameId: "melee" }).at(-1)!.sequence;
      store.db.close();

      const spawnError = new Error("managed process spawn failed");
      const processController = {
        hasActiveProcess: () => ({ active: false }),
        spawn: () => {
          throw spawnError;
        },
      } as unknown as ManagedProcessController;
      const game = {
        gameId: "melee",
        processName: "melee-live",
        dashboard: {},
        repoRoot: "/tmp/melee-checkout",
        stateDir,
        graphDbPath: "/tmp/melee-graph.sqlite",
      } as unknown as ResolvedGame;
      const runtime = createProcessControlRuntime({
        json: (data, init) => new Response(JSON.stringify(data), init),
        processController,
        processStatus: () => ({}),
        gameToSummary: () => ({ id: "melee" }) as never,
        resolveDashboardGame: () => ({
          game,
          repoRoot: game.repoRoot,
          stateDir,
          graphDbPath: game.graphDbPath,
          usePathOverrides: false,
        }),
        runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
      });

      await expect(runtime.startManagedProcess({
        commandId: "command-operator-start",
        maxWorkers: 2,
        gameId: "melee",
        runId: run.id,
      })).rejects.toThrow(spawnError.message);

      const verifyStore = openState(stateDir);
      try {
        const actionEvents = listGameEvents(verifyStore.db, {
          afterSequence: baselineSequence,
          gameId: "melee",
        });
        expect(actionEvents.map((event) => event.eventType)).toEqual([
          "game.dispatch_requested",
          "game.dispatch_acquired",
          "run.activated",
          "run.failed",
          "game.dispatch_released",
        ]);
        expect(new Set(actionEvents.map((event) => event.actor))).toEqual(new Set(["operator"]));
        expect(new Set(actionEvents.map((event) => event.correlationId))).toEqual(new Set([run.id]));
        expect(new Set(actionEvents.map((event) => event.parentSpanId)).size).toBe(1);
        expect(actionEvents[0]!.causationId).toBe("command-operator-start");
        for (let index = 1; index < actionEvents.length; index += 1) {
          expect(actionEvents[index]!.causationId).toBe(actionEvents[index - 1]!.eventId);
        }
        expect(getRun(verifyStore, run.id)).toMatchObject({ status: "failed", revision: 3 });
        expect(getHarnessState(verifyStore, "melee")?.active_workflow).toBeNull();
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
        { gameId: "melee", repoRoot, stateDir },
        { baseRevision: parentSha },
      );
      store.db.query("UPDATE runs SET cycle_uuid = 'cycle-startup' WHERE id = ?").run(run.id);
      createCycle(store.db, {
        actor: "operator",
        activeRunId: run.id,
        baseSha: parentSha,
        commandId: "command-cycle-startup",
        id: "cycle:cycle-startup",
        openingSyncId: "sync-startup",
        gameId: "melee",
        cycleUuid: "cycle-startup",
        traceId: "trace-cycle-startup",
        worktreeIdentity: repoRoot,
      });
      store.db
        .query(
          `INSERT INTO epochs (
             id, run_id, ordinal, worker_pool_size,
             status, routing_summary_json, created_at
           ) VALUES ('epoch-startup', ?, 1, 2, 'active', '{}', ?)`,
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
              listCycleTimeline(duringSpawn.db, "cycle-startup")[0]?.payload.integration_commit === integrationCommit;
          } finally {
            duringSpawn.db.close();
          }
        },
      } as unknown as ManagedProcessController;
      const game = {
        gameId: "melee",
        processName: "melee-live",
        dashboard: {},
        repoRoot,
        stateDir,
        graphDbPath: join(stateDir, "graph.sqlite"),
      } as unknown as ResolvedGame;
      const runtime = createProcessControlRuntime({
        json: (data, init) => new Response(JSON.stringify(data), init),
        processController,
        processStatus: () => ({}),
        gameToSummary: () => ({ id: "melee" }) as never,
        resolveDashboardGame: () => ({
          graphDbPath: game.graphDbPath,
          game,
          repoRoot,
          stateDir,
          usePathOverrides: false,
        }),
        runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        serverJobPath: "/tmp/orchestrator/apps/server/src/job-runner.ts",
      });

      const response = await runtime.startManagedProcess({ gameId: "melee", runId: run.id, maxWorkers: 2 });

      expect(response.status).toBe(200);
      expect(reconciledBeforeSpawn).toBe(true);
    } finally {
      rmSync(stateDir, { force: true, recursive: true });
      rmSync(repoRoot, { force: true, recursive: true });
    }
  });
});
