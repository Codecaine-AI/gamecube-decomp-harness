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
import { DispatchLeaseUnavailableError } from "@server/core/session-runtime/dispatch-guard.js";
import { getProjectState, initializeProjectState, requestDispatch } from "@server/core/project-state";
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

  test("operator sync activation queues behind the run and begins its handoff drain", async () => {
    const root = tempDir();
    const stateDir = resolve(root, "state");
    const repoRoot = resolve(root, "repo");
    const store = openState(stateDir);
    try {
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const run = requestDispatch(store, {
        actor: "operator",
        commandId: "command-run-start",
        kind: "run",
        projectId: "melee",
        reason: "start run",
        workflowId: "run-1",
      });
      if (run.queued) throw new Error("expected run lease acquisition");
    } finally {
      store.db.close();
    }

    const paths: PreparingRuntimeProjectContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      project: { projectId: "melee" } as PreparingRuntimeProjectContext["project"],
      repoRoot,
      stateDir,
    };
    const runtime = createPreparingRuntime({
      activeSessionPrBlockers: () => [],
      appendLog: () => undefined,
      beginOperation: () => undefined,
      boundarySavePoint: async () => ({ ok: true, savePointId: "save-point-1", blockerRaised: false }),
      endOperation: () => undefined,
      hasActiveProcess: () => ({ active: true, name: "melee-live" }),
      operationStep: () => undefined,
      operationStepDetail: () => undefined,
      packageRoot: root,
      projectToSummary: () => ({}),
      resolveDashboardProject: () => paths,
      runCli: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      runGit: async () => {
        throw new Error("sync git mutation must not start before handoff acquisition");
      },
      runReport: async () => ({}),
      serverJobPath: resolve(root, "job-runner.ts"),
      sourceRoot: () => root,
      submitWorkflowEvent: async () => null,
    } as unknown as PreparingRuntimeDeps);

    await expect(runtime.syncProjectIntake({ projectId: "melee" })).rejects.toBeInstanceOf(
      DispatchLeaseUnavailableError,
    );

    const nextStore = openState(stateDir);
    try {
      expect(getProjectState(nextStore, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        status: "draining",
        requested_handoff: {
          target_kind: "sync",
          target_workflow_id: "sync-intake:melee",
        },
      });
    } finally {
      nextStore.db.close();
    }
  });
});
