import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createNewProjectSession,
  updatePreparingSubphase,
} from "@server/core/session-runtime";
import { getActiveProjectSession } from "@server/core/project-session/store";
import { openState } from "@server/core/session-runtime/run-state";
import type { PreparingRuntimeDeps, PreparingRuntimeProjectContext } from "./runtime-shared.js";
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
    await expect(runtime.freshRun({ stateDir: root })).rejects.toThrow("Create the session, then use the operator sync.start workflow");
    expect(dependencyCalls).toBe(0);
    expect(runtime.state()).toEqual({ freshRunActive: false, projectSyncActive: false });
  });

  test("forwards every process-policy option into init-run snapshot capture", () => {
    const root = tempDir();
    const paths: PreparingRuntimeProjectContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      project: {
        projectId: "melee",
        dashboard: {},
      } as PreparingRuntimeProjectContext["project"],
      repoRoot: resolve(root, "repo"),
      stateDir: resolve(root, "state"),
    };
    const runtime = createPreparingRuntime({
      resolveDashboardProject: () => paths,
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
      const created = createNewProjectSession(store.db, {
        id: "project-session:session-uuid",
        projectId: "melee",
        sessionUuid: "session-uuid",
      });
      updatePreparingSubphase(store.db, { id: created.record.id }, "baseline", {
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

    const paths: PreparingRuntimeProjectContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      project: null,
      repoRoot,
      stateDir,
    };
    const runtime = createPreparingRuntime({
      activeSessionPrBlockers: () => [],
      appendLog: () => undefined,
      beginOperation: () => undefined,
      boundarySavePoint: async () => ({ ok: true, savePointId: "save-point-1", blockerRaised: false }),
      endOperation: () => undefined,
      hasActiveProcess: () => ({ active: false }),
      operationStep: () => undefined,
      operationStepDetail: () => undefined,
      packageRoot: root,
      projectToSummary: () => {
        throw new Error("not used");
      },
      resolveDashboardProject: () => paths,
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      runGit: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      runReport: async () => {
        throw new Error("generate report failed (1): missing build.ninja");
      },
      serverJobPath: resolve(root, "job-runner.ts"),
      sourceRoot: () => root,
      submitWorkflowEvent: async () => null,
    } as unknown as PreparingRuntimeDeps);

    await expect(runtime.calculateBaselineForPrepare({ projectId: "melee", sessionUuid: "session-uuid" })).rejects.toThrow("missing build.ninja");

    const nextStore = openState(stateDir);
    try {
      const record = getActiveProjectSession(nextStore.db, "melee");
      expect(record?.preparing_state_json.subphase).toBe("baseline");
      expect(record?.preparing_state_json.baseline?.status).toBe("failed");
      expect(record?.preparing_state_json.baseline?.error).toContain("missing build.ninja");
      expect(record?.preparing_state_json.baseline?.repoRoot).toBe(upstreamWorktreePath);
    } finally {
      nextStore.db.close();
    }
  });

});
