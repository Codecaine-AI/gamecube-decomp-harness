import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createNewCycle,
  updatePreparingSubphase,
} from "@server/core/cycle-runtime";
import { getActiveCycle } from "@server/core/cycle/store";
import { listGameEvents } from "@server/core/harness-state/events.js";
import { openState } from "@server/core/cycle-runtime/run-state";
import type {
  PreparingRuntimeDeps,
  PreparingRuntimeGameContext,
  PreparingRuntimeWorkflowEventInput,
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

    const { command } = runtime.initRunCommand({
      agentTimeoutSeconds: 2400,
      candidateRerank: "opseq_hot_lane",
      candidateWindow: 96,
      dryRunAgents: true,
      epochConfigureCommand: "configure epoch",
      epochSize: "48",
      goalKind: "matched_code_percent",
      goalValue: 88,
      integrationResolverConcurrency: 3,
      maxWorkers: 12,
      model: "gpt-5.5",
      provider: "codex-lb",
      thinkingLevel: "high",
      workerConfigureCommand: "configure worker",
    });
    const option = (flag: string): string | undefined => command[command.indexOf(flag) + 1];

    expect(command).toContain("--dry-run-agents");
    expect(option("--provider")).toBe("codex-lb");
    expect(option("--model")).toBe("gpt-5.5");
    expect(option("--thinking-level")).toBe("high");
    expect(option("--agent-timeout-seconds")).toBe("2400");
    expect(option("--desired-workers")).toBe("12");
    expect(option("--epoch-size")).toBe("48");
    expect(option("--candidate-window")).toBe("96");
    expect(option("--candidate-rerank")).toBe("opseq_hot_lane");
    expect(option("--integration-resolver-concurrency")).toBe("3");
    expect(option("--goal-kind")).toBe("matched_code_percent");
    expect(option("--goal-value")).toBe("88");
    expect(option("--worker-configure-command")).toBe("configure worker");
    expect(option("--epoch-configure-command")).toBe("configure epoch");
  });

  test("persists failed baseline status when report generation fails", async () => {
    const root = tempDir();
    const stateDir = resolve(root, "state");
    const repoRoot = resolve(root, "repo");
    const upstreamWorktreePath = resolve(root, "worktrees/upstream-current");
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
            completedAt: "2026-06-28T12:00:00.000Z",
            upstreamWorktreePath,
          },
          intake: {
            status: "complete",
            completedAt: "2026-06-28T12:01:00.000Z",
          },
          knowledge: {
            status: "complete",
            completedAt: "2026-06-28T12:02:00.000Z",
          },
        },
      });
    } finally {
      store.db.close();
    }

    const paths: PreparingRuntimeGameContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      game: null,
      repoRoot,
      stateDir,
    };
    const traceInputs: PreparingRuntimeWorkflowEventInput[] = [];
    const runtime = createPreparingRuntime({
      activeCyclePrBlockers: () => [],
      appendLog: () => undefined,
      beginOperation: () => undefined,
      boundarySavePoint: async () => ({ ok: true, savePointId: "save-point-1", blockerRaised: false }),
      endOperation: () => undefined,
      hasActiveProcess: () => ({ active: false }),
      operationStep: () => undefined,
      operationStepDetail: () => undefined,
      packageRoot: root,
      gameToSummary: () => {
        throw new Error("not used");
      },
      resolveDashboardGame: () => paths,
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      runGit: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      runReport: async () => {
        throw new Error("generate report failed (1): missing build.ninja");
      },
      serverJobPath: resolve(root, "job-runner.ts"),
      sourceRoot: () => root,
      submitWorkflowEvent: async (
        _paths: PreparingRuntimeGameContext,
        input: PreparingRuntimeWorkflowEventInput,
      ) => {
        traceInputs.push(input);
        return null;
      },
    } as unknown as PreparingRuntimeDeps);

    await expect(runtime.calculateBaselineForPrepare({ gameId: "melee", cycleUuid: "cycle-uuid" })).rejects.toThrow("missing build.ninja");

    const nextStore = openState(stateDir);
    try {
      const record = getActiveCycle(nextStore.db, "melee");
      expect(record?.preparing_state_json.subphase).toBe("baseline");
      expect(record?.preparing_state_json.baseline?.status).toBe("failed");
      expect(record?.preparing_state_json.baseline?.error).toContain("missing build.ninja");
      expect(record?.preparing_state_json.baseline?.repoRoot).toBe(upstreamWorktreePath);
      const linkedEvents = listGameEvents(nextStore.db, { gameId: "melee" })
        .filter((event) => event.eventType === "cycle.preparing_subphase_updated")
        .slice(-2);
      expect(traceInputs.map((input) => input.gameEventId)).toEqual(
        linkedEvents.map((event) => event.eventId),
      );
      expect(traceInputs.map((input) => input.correlationId)).toEqual([
        "cycle-uuid",
        "cycle-uuid",
      ]);
      expect(traceInputs.map((input) => input.causedByEventId)).toEqual([
        null,
        null,
      ]);
    } finally {
      nextStore.db.close();
    }
  });

});
