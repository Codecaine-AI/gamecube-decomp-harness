import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createNewCycle,
  updatePreparingSubphase,
} from "@server/core/cycle-runtime";
import { createRun, openState } from "@server/core/cycle-runtime/run-state";
import * as dispatchGuard from "@server/core/cycle-runtime/dispatch-guard";
import type {
  PreparingRuntimeDeps,
  PreparingRuntimeGameContext,
} from "./runtime-shared.js";
import { createPreparingRuntime } from "./runtime.js";

let tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepare-runtime-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("preparing runtime baseline", () => {
  test("legacy preparation sync, intake, and Fresh Run fail before side effects", async () => {
    const root = tempDir();
    let dependencyCalls = 0;
    const runtime = createPreparingRuntime(new Proxy({}, {
      get() {
        return () => {
          dependencyCalls += 1;
          throw new Error("legacy dependency should not run");
        };
      },
    }) as unknown as PreparingRuntimeDeps);

    await expect(runtime.syncGitForPrepare({ stateDir: root })).rejects.toThrow("operator sync.start");
    await expect(runtime.indexPrsForPrepare({ stateDir: root })).rejects.toThrow("operator sync.start");
    await expect(runtime.freshRun({ stateDir: root })).rejects.toThrow("Create the cycle, then use the operator sync.start workflow");
    expect(dependencyCalls).toBe(0);
    expect(runtime.state()).toEqual({ freshRunActive: false, gameSyncActive: false });
  });

  test("forwards every process-policy option into init-run snapshot capture", () => {
    const root = tempDir();
    const paths: PreparingRuntimeGameContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      game: {
        gameId: "melee",
        dashboard: {},
      } as PreparingRuntimeGameContext["game"],
      repoRoot: resolve(root, "repo"),
      stateDir: resolve(root, "state"),
    };
    const runtime = createPreparingRuntime({
      resolveDashboardGame: () => paths,
      serverJobPath: resolve(root, "job-runner.ts"),
    } as unknown as PreparingRuntimeDeps);

    const explicitCycleRepoRoot = resolve(root, "explicit-cycle-worktree");
    const { command, repoRoot } = runtime.initRunCommand({
      agentTimeoutSeconds: 2400,
      cycleRepoRoot: explicitCycleRepoRoot,
      dryRunAgents: true,
      epochConfigureCommand: "configure epoch",
      goalKind: "matched_code_percent",
      goalValue: 88,
      maxWorkers: 12,
      model: "gpt-5.5",
      provider: "codex-lb",
      sandboxProfile: "4-core",
      thinkingLevel: "high",
      workerConfigureCommand: "configure worker",
    });
    const option = (flag: string): string | undefined => command[command.indexOf(flag) + 1];

    expect(command).toContain("--dry-run-agents");
    expect(option("--provider")).toBe("codex-lb");
    expect(option("--model")).toBe("gpt-5.5");
    expect(option("--thinking-level")).toBe("high");
    expect(option("--agent-timeout-seconds")).toBe("2400");
    expect(option("--sandbox-profile")).toBe("4-core");
    expect(option("--desired-workers")).toBe("12");
    expect(option("--goal-kind")).toBe("matched_code_percent");
    expect(option("--goal-value")).toBe("88");
    expect(option("--worker-configure-command")).toBe("configure worker");
    expect(option("--epoch-configure-command")).toBe("configure epoch");
    expect(repoRoot).toBe(explicitCycleRepoRoot);
    expect(option("--repo-root")).toBe(explicitCycleRepoRoot);

    const defaults = runtime.initRunCommand({ cycleRepoRoot: explicitCycleRepoRoot }).command;
    const defaultOption = (flag: string): string | undefined => defaults[defaults.indexOf(flag) + 1];
    expect(defaultOption("--model")).toBe("gpt-6-astra");
    expect(defaultOption("--thinking-level")).toBe("medium");
    expect(defaultOption("--desired-workers")).toBe("12");
  });

  test("stages init-run from the active cycle worktree when cycleRepoRoot is empty", () => {
    const root = tempDir();
    const stateDir = resolve(root, "state");
    const cycleCurrentWorktreePath = resolve(root, "worktrees/cycle-current");
    const store = openState(stateDir);
    try {
      const created = createNewCycle(store.db, {
        actor: "operator",
        id: "cycle:cycle-uuid",
        gameId: "melee",
        cycleUuid: "cycle-uuid",
      });
      updatePreparingSubphase(store.db, { id: created.record.id }, "baseline", {
        correlationId: created.record.cycle_uuid,
        data: {
          sync: {
            status: "complete",
            completedAt: "2026-08-26T12:00:00.000Z",
            cycleCurrentWorktreePath,
          },
        },
      });
    } finally {
      store.db.close();
    }

    const paths: PreparingRuntimeGameContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      game: {
        gameId: "melee",
        dashboard: {},
      } as PreparingRuntimeGameContext["game"],
      repoRoot: resolve(root, "repo"),
      stateDir,
    };
    const runtime = createPreparingRuntime({
      resolveDashboardGame: () => paths,
      serverJobPath: resolve(root, "job-runner.ts"),
    } as unknown as PreparingRuntimeDeps);

    for (const cycleRepoRoot of [undefined, ""]) {
      const result = runtime.initRunCommand({ cycleRepoRoot });
      const repoRootFlag = result.command.indexOf("--repo-root");
      expect(result.repoRoot).toBe(cycleCurrentWorktreePath);
      expect(result.command[repoRootFlag + 1]).toBe(cycleCurrentWorktreePath);
    }
  });

  test("leases the created run id before committing the init boundary", async () => {
    const root = tempDir();
    const stateDir = resolve(root, "state");
    const repoRoot = resolve(root, "repo");
    const store = openState(stateDir);
    try {
      createNewCycle(store.db, {
        actor: "operator",
        id: "cycle:cycle-uuid",
        gameId: "melee",
        cycleUuid: "cycle-uuid",
      });
    } finally {
      store.db.close();
    }

    const paths: PreparingRuntimeGameContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      game: {
        gameId: "melee",
        dashboard: {},
      } as PreparingRuntimeGameContext["game"],
      repoRoot,
      stateDir,
    };
    const boundaryCommit = { committed: true, commitSha: "boundary-sha" };
    const savePoint = { id: "save-point-init" };
    const lease = spyOn(dispatchGuard, "withDispatchLease").mockResolvedValue(boundaryCommit as never);
    let createdRunId = "";
    const runtime = createPreparingRuntime({
      boundarySavePoint: async () => savePoint,
      gameToSummary: () => ({ gameId: "melee" }),
      resolveDashboardGame: () => paths,
      runCli: async () => {
        const runStore = openState(stateDir);
        try {
          createdRunId = createRun(
            runStore,
            "matched_code_percent",
            100,
            1,
            { gameId: "melee", repoRoot, stateDir },
            { baseRevision: "base-sha", cycleUuid: "cycle-uuid" },
          ).id;
        } finally {
          runStore.db.close();
        }
        return { exitCode: 0, stdout: JSON.stringify({ initialized: true }), stderr: "" };
      },
      serverJobPath: resolve(root, "job-runner.ts"),
      submitWorkflowEvent: async () => null,
    } as unknown as PreparingRuntimeDeps);

    try {
      const result = await runtime.initRun({});

      expect(lease).toHaveBeenCalledTimes(1);
      expect(lease.mock.calls[0]?.[1]).toMatchObject({
        kind: "run",
        workflowId: createdRunId,
      });
      expect(createdRunId).not.toStartWith("run-init:");
      expect(result).toMatchObject({
        activeRunId: createdRunId,
        boundaryCommit,
        savePoint,
      });
    } finally {
      lease.mockRestore();
    }
  });


});
