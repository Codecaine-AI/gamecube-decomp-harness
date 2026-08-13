import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHandoffRuntime, type HandoffRuntimeDeps } from "./runtime.js";
import type { RegressionReport } from "@server/core/validation/objdiff/report.js";
import {
  DispatchLeaseUnavailableError,
} from "@server/core/session-runtime/dispatch-guard.js";
import {
  getProjectState,
  initializeProjectState,
  listProjectEvents,
  recoverDispatch,
  requestDispatch,
  StaleLeaseError,
} from "@server/core/project-state";
import { openState } from "@server/core/orchestrator-state";
import { settlePausedRun } from "@server/core/session-runtime/phases/running/run-control.js";

const cleanupPaths: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(path);
  return path;
}

function cleanReport(): RegressionReport {
  return {
    regressions: [],
    brokenMatches: [],
    fuzzyRegressions: [],
    newMatches: [{ name: "gmMatch" }],
    summary: { matchedCodeBytesDelta: 16 },
  } as unknown as RegressionReport;
}

afterEach(() => {
  for (const path of cleanupPaths.reverse()) rmSync(path, { recursive: true, force: true });
  cleanupPaths.length = 0;
});

function runtimeFixture(
  supportFiles?: string[],
  peers: Array<Record<string, unknown>> = [],
  hasLocalSource = true,
  onVerify?: () => void | Promise<void>,
  localStatus = "local_only",
  boundaryStatus = "",
  boundaryCommitFails = false,
) {
  const repoRoot = process.cwd();
  const stateDir = tempDir("pr-runtime-state-");
  const baselineWorktree = tempDir("pr-runtime-baseline-");
  mkdirSync(join(baselineWorktree, "build/GALE01"), { recursive: true });
  writeFileSync(join(baselineWorktree, "build/GALE01/baseline.json"), "{}\n");
  mkdirSync(join(stateDir, "pr_handoff"), { recursive: true });
  const shipPatchPath = join(stateDir, "pr_handoff/ship_set.patch");
  writeFileSync(shipPatchPath, "patch\n");
  writeFileSync(join(stateDir, "pr_handoff/ship_status.json"), JSON.stringify({ status: "pr_ready", baseSha: "base-sha", patchPath: shipPatchPath }));
  writeFileSync(join(stateDir, "pr_handoff/baseline_status.json"), JSON.stringify({ baseSha: "base-sha", worktreeDir: baselineWorktree }));
  const files = ["src/melee/gm/gmtest.c"];
  const branch = "pr-split/gm";
  const record = {
    branch,
    sliceId: "gm",
    displayName: "GM",
    title: "Melee decomp: GM",
    runId: "run-1",
    baseSha: "base-sha",
    files,
    ...(supportFiles?.length ? { supportFiles } : {}),
    status: "planned",
    local: { status: localStatus },
  };
  const records = [record, ...peers];
  const calls: {
    ready?: Record<string, unknown>;
    verify?: Record<string, unknown>;
    mergeArgs?: Record<string, unknown>;
    events: Array<Record<string, unknown>>;
    merge: number;
    order: string[];
    boundaryOrder: string[];
    publish: number;
  } = { boundaryOrder: [], events: [], merge: 0, order: [], publish: 0 };

  const deps = {
    appendLog: () => {},
    hasActiveProcess: () => ({ active: false }),
    operationState: {
      failOperationStep: () => {},
      operationNextHint: () => {},
      operationStep: () => {},
      operationStepDetail: () => {},
      withOperation: async (_name: string, _label: string, _steps: string[], fn: () => Promise<unknown>) => fn(),
    },
    outputTail: (value: string) => value,
    prRecords: {
      buildPrRecordsView: () => ({ records }),
      normalizePrRecord: (value: Record<string, unknown>) => value,
      normalizePrRecordsPayload: (value: Record<string, unknown>) => value,
      prHandoffArtifactPath: (_stateDir: string, savedPath: string) => savedPath,
      prRecordContext: () => ({ runId: "run-1", baseSha: "base-sha" }),
      prRecordMatchesRun: (candidate: Record<string, unknown>, runId: string) => candidate.runId === runId,
      readPrRecords: () => ({ records }),
      updatePrRecord: () => record,
      writePrRecords: (_stateDir: string, value: Record<string, unknown>) => value,
    },
    prSync: {
      isLocalBranchPrRecord: () => true,
      syncPrRecords: async () => ({ records: [{ ...record, prNumber: 123, url: "https://example.test/pr/123" }] }),
    },
    prWorktrees: {
      assertSliceVerificationClean: () => {},
      ensureOpenPrBaseline: async () => ({ baseSha: "base-sha", worktreeDir: baselineWorktree }),
      prepareLocalPrWorkspace: async (params: Record<string, unknown>) => {
        calls.order.push("materialize");
        return { ...(params.record as Record<string, unknown>), local: { status: "ready", commitSha: "candidate-sha" } };
      },
      publishPatchToFork: async () => { calls.publish += 1; },
      readyLocalPrSource: async (params: Record<string, unknown>) => {
        calls.ready = params;
        return hasLocalSource
          ? { commitSha: "head-sha", patchPath: "/tmp/local.patch", source: "local_branch", worktreePath: "" }
          : null;
      },
      rebuildProductionBaseline: async () => ({ baseSha: "base-sha" }),
      remoteOwner: () => "fork-owner",
      sliceValidationSummary: () => ({ status: "passed", issuesCheck: "clean", newMatches: 1 }),
      verifyPrSliceInBaseline: async (params: Record<string, unknown>) => {
        calls.order.push("isolate");
        calls.verify = params;
        await onVerify?.();
        return { issues: { status: "clean" as const, output: "", files: [] }, report: cleanReport() };
      },
      verifySupportMergeOrder: async (params: Record<string, unknown>) => {
        calls.order.push("merge-order");
        calls.merge += 1;
        calls.mergeArgs = params;
        return {};
      },
      verifyShipSet: async () => ({ status: "pr_ready", newMatches: 1, files: 1, shippedFiles: ["src/melee/gm/gmtest.c"], droppedFiles: {} }),
    },
    processControl: { drainManaged: async () => ({}) },
    projectToSummary: () => ({}),
    resolveDashboardProject: () => ({
      repoRoot,
      stateDir,
      project: {
        projectId: "melee",
        baseRef: "origin/master",
        validation: { qaTarget: "changes_all" },
        pr: {
          branchPrefix: "pr-split",
          groupMode: "melee-subsystem",
          improvementMinGainPoints: 0,
          improvementMinMatchedBytes: 0,
          maxFilesPerPr: 30,
          splitStrategy: "deterministic",
          titlePrefix: "Melee decomp",
        },
      },
    }),
    runCli: async (command: string[]) => {
      if (command[0] === "gh") return { exitCode: 0, stdout: "https://example.test/pr/123\n", stderr: "" };
      if (command.includes("pr-split-plan")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            slices: [{ id: "gm", lane: "match", pathspecs: ["src/melee/gm/gmtest.c"] }],
          }),
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    runGit: async (_repoRoot: string, args: string[]) => {
      if (args[0] === "status") {
        calls.boundaryOrder.push("status");
        return { exitCode: 0, stdout: boundaryStatus, stderr: "" };
      }
      if (args[0] === "add" || args[0] === "commit" || args[0] === "rev-parse") {
        calls.boundaryOrder.push(args[0]);
      }
      if (args[0] === "commit" && boundaryCommitFails) {
        return { exitCode: 1, stdout: "", stderr: "commit hook rejected" };
      }
      return { exitCode: 0, stdout: args[0] === "rev-parse" ? "head-sha\n" : "", stderr: "" };
    },
    savePoints: {
      boundarySavePoint: async () => {
        calls.boundaryOrder.push("save-point");
        return { ok: true, savePointId: "save-point-1", blockerRaised: false };
      },
      createSavePoint: async () => ({}),
      parseCliJsonOutput: (stdout: string) => stdout.trim() ? JSON.parse(stdout) as Record<string, unknown> : {},
    },
    serverJobPath: "/server-job.ts",
    submitWorkflowEvent: async (_paths: unknown, event: Record<string, unknown>) => {
      calls.events.push(event);
      return null;
    },
    syncMergedPrIntakeForPrepare: async () => ({
      afterRef: "after-sha",
      beforeRef: "before-sha",
      branch: "main",
      mergedPrs: [],
      steps: [],
    }) as never,
  } as unknown as HandoffRuntimeDeps;

  return { branch, calls, runtime: createHandoffRuntime(deps), stateDir };
}

describe("openPrForSlice support manifests", () => {
  test("passes declared support files through local source capture and isolation", async () => {
    const supportFiles = ["include/melee/gr/ground.h"];
    const { branch, calls, runtime } = runtimeFixture(supportFiles);

    await runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false });

    expect(calls.ready?.supportFiles).toEqual(supportFiles);
    expect(calls.verify?.supportFiles).toEqual(supportFiles);
    expect(calls.merge).toBe(0);
    expect(calls.events.map((event) => (event.metadata as Record<string, unknown>).supportFiles)).toEqual([
      supportFiles,
      supportFiles,
    ]);
  });

  test("keeps the legacy call and event shape when no support files are declared", async () => {
    const { branch, calls, runtime } = runtimeFixture();

    await runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false });

    expect("supportFiles" in calls.ready!).toBe(false);
    expect("supportFiles" in calls.verify!).toBe(false);
    expect(calls.merge).toBe(0);
    for (const event of calls.events) {
      expect("supportFiles" in (event.metadata as Record<string, unknown>)).toBe(false);
    }
  });

  test("materializes the current branch before merge-order checking a prepared overlapping peer", async () => {
    const supportFiles = ["include/melee/gr/ground.h"];
    const peer = {
      branch: "pr-split/gr",
      sliceId: "gr",
      runId: "run-1",
      baseSha: "base-sha",
      files: supportFiles,
      status: "planned",
      local: { status: "ready", commitSha: "peer-sha" },
    };
    const { branch, calls, runtime } = runtimeFixture(supportFiles, [peer]);

    await runtime.prepareLocalPr({ prBranch: branch, runId: "run-1" });

    expect(calls.order).toEqual(["isolate", "materialize", "merge-order"]);
    expect(calls.mergeArgs).toMatchObject({
      branch,
      sliceId: "gm",
      supportFiles,
      others: [{ branch: "pr-split/gr", sliceId: "gr", files: supportFiles, supportFiles: [] }],
    });
  });

  test("blocks direct ship-set opening when an already-published peer overlaps support", async () => {
    const supportFiles = ["include/melee/gr/ground.h"];
    const publishedPeer = {
      branch: "pr-split/gr",
      sliceId: "gr",
      runId: "run-1",
      baseSha: "base-sha",
      files: supportFiles,
      status: "draft",
      prNumber: 321,
      local: { status: "not_prepared" },
    };
    const { branch, calls, runtime } = runtimeFixture(supportFiles, [publishedPeer], false);

    await expect(
      runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false }),
    ).rejects.toThrow("requires a materialized local branch before opening because a prepared sibling overlaps its support files");
    expect(calls.verify).toBeUndefined();
    expect(calls.merge).toBe(0);
    expect(calls.publish).toBe(0);
  });
});

describe("PR dispatch lease fencing", () => {
  test("pause commits boundary work before anchoring the resulting HEAD", async () => {
    const { calls, runtime, stateDir } = runtimeFixture(undefined, [], true, undefined, "local_only", " M src/melee/gm/gmtest.c\n");
    const store = openState(stateDir);
    try {
      store.db.query(
        `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, project_id)
         VALUES ('run-1', 'matched_code_percent', 100, 1, 'paused', '2026-08-12T12:00:00.000Z', 'melee')`,
      ).run();
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-pause-run",
        kind: "pr",
        projectId: "melee",
        reason: "pause boundary test",
        workflowId: "pr-handoff:run-1",
      });
      if (dispatch.queued) throw new Error("expected run lease acquisition");
    } finally {
      store.db.close();
    }

    await expect(runtime.pauseRunForPr({ runId: "run-1" })).resolves.toMatchObject({
      paused: true,
      boundaryCommit: { committed: true, headRevision: "head-sha" },
      savePoint: { ok: true },
    });
    expect(calls.boundaryOrder).toEqual(["status", "add", "commit", "rev-parse", "save-point"]);
  });

  test("pause fails loudly and never records an anchor when its boundary commit fails", async () => {
    const { calls, runtime, stateDir } = runtimeFixture(undefined, [], true, undefined, "local_only", " M src/melee/gm/gmtest.c\n", true);
    const store = openState(stateDir);
    try {
      store.db.query(
        `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, project_id)
         VALUES ('run-1', 'matched_code_percent', 100, 1, 'paused', '2026-08-12T12:00:00.000Z', 'melee')`,
      ).run();
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-pause-run-failure",
        kind: "pr",
        projectId: "melee",
        reason: "pause boundary failure test",
        workflowId: "pr-handoff:run-1",
      });
      if (dispatch.queued) throw new Error("expected run lease acquisition");
    } finally {
      store.db.close();
    }

    await expect(runtime.pauseRunForPr({ runId: "run-1" })).rejects.toThrow("boundary git commit failed");
    expect(calls.boundaryOrder).toEqual(["status", "add", "commit"]);
    expect(calls.boundaryOrder).not.toContain("save-point");
  });

  test("ship commits its boundary before recording the ship anchor", async () => {
    const { calls, runtime, stateDir } = runtimeFixture(undefined, [], true, undefined, "local_only", " M src/melee/gm/gmtest.c\n");
    const store = openState(stateDir);
    try {
      store.db.query(
        `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, project_id)
         VALUES ('run-1', 'matched_code_percent', 100, 1, 'paused', '2026-08-12T12:00:00.000Z', 'melee')`,
      ).run();
    } finally {
      store.db.close();
    }

    const result = await runtime.preparePrHandoff({ runId: "run-1", autoReconcile: false });
    expect(result).toMatchObject({
      prepared: true,
      boundaryCommit: { committed: true, headRevision: "head-sha" },
      savePoint: { ok: true },
    });
    expect(calls.boundaryOrder.slice(-5)).toEqual(["status", "add", "commit", "rev-parse", "save-point"]);
  });

  test("refuses prepare-local while another workflow holds the lease", async () => {
    const { branch, calls, runtime, stateDir } = runtimeFixture();
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

    await expect(runtime.prepareLocalPr({ prBranch: branch, runId: "run-1" })).rejects.toBeInstanceOf(
      DispatchLeaseUnavailableError,
    );
    expect(calls.order).toEqual([]);

    const next = openState(stateDir);
    try {
      expect(getProjectState(next, "melee")?.queued_dispatch_requests).toContainEqual(
        expect.objectContaining({ kind: "pr", workflow_id: "pr-local:run-1" }),
      );
    } finally {
      next.db.close();
    }
  });

  test("refuses prepare-local-batch while another workflow holds the lease", async () => {
    const { calls, runtime, stateDir } = runtimeFixture(undefined, [], true, undefined, "not_prepared");
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

    await expect(runtime.prepareLocalPrBatch({ runId: "run-1" })).rejects.toBeInstanceOf(
      DispatchLeaseUnavailableError,
    );
    expect(calls.order).toEqual([]);
  });

  test("aborts before the next mutation when recovery replaces the lease mid-callback", async () => {
    let stateDir = "";
    const fixture = runtimeFixture(undefined, [], true, () => {
      const store = openState(stateDir);
      try {
        const current = getProjectState(store, "melee")?.active_workflow;
        if (!current) throw new Error("expected active PR lease during verification");
        recoverDispatch(store, {
          actor: "operator",
          cancelledSubjectIds: [],
          commandId: "command-recover-stale-pr",
          leaseId: current.lease_id,
          projectId: "melee",
          recoveryReason: "test replacement",
        });
        const replacement = requestDispatch(store, {
          actor: "operator",
          commandId: "command-sync-replacement",
          kind: "sync",
          projectId: "melee",
          reason: "replace stale PR callback",
          workflowId: "sync-replacement",
        });
        if (replacement.queued) throw new Error("expected replacement lease acquisition");
      } finally {
        store.db.close();
      }
    });
    stateDir = fixture.stateDir;

    await expect(
      fixture.runtime.prepareLocalPr({ prBranch: fixture.branch, runId: "run-1" }),
    ).rejects.toBeInstanceOf(StaleLeaseError);
    expect(fixture.calls.order).toEqual(["isolate"]);

    const store = openState(stateDir);
    try {
      expect(getProjectState(store, "melee")?.active_workflow).toMatchObject({
        kind: "sync",
        workflow_id: "sync-replacement",
        status: "active",
      });
    } finally {
      store.db.close();
    }
  });

  test("queues an operator PR activation, drains the run, and hands the lease to PR", async () => {
    const { runtime, stateDir } = runtimeFixture();
    const store = openState(stateDir);
    let runLeaseId = "";
    try {
      store.db
        .query(
          `INSERT INTO runs (
             id, goal_kind, goal_value, desired_workers, status, created_at,
             project_id, revision, trace_id, blockers_json
           ) VALUES ('run-1', 'matched_code_percent', 100, 1, 'active', ?, 'melee', 0, 'trace-run-1', '[]')`,
        )
        .run("2026-08-12T12:00:00.000Z");
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const run = requestDispatch(store, {
        actor: "operator",
        commandId: "command-run-start",
        correlationId: "run-1",
        kind: "run",
        projectId: "melee",
        reason: "start run",
        workflowId: "run-1",
      });
      if (run.queued) throw new Error("expected run lease acquisition");
      runLeaseId = run.leaseId;
    } finally {
      store.db.close();
    }

    await expect(runtime.preparePrHandoff({ runId: "run-1" })).rejects.toBeInstanceOf(
      DispatchLeaseUnavailableError,
    );

    const drainingStore = openState(stateDir);
    try {
      expect(getProjectState(drainingStore, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        lease_id: runLeaseId,
        status: "draining",
        requested_handoff: {
          target_kind: "pr",
          target_workflow_id: "pr-handoff:run-1",
        },
      });
      settlePausedRun({
        actor: "guardian",
        commandId: "command-run-settled",
        correlationId: "run-1",
        leaseId: runLeaseId,
        reason: "supervisor settled PR handoff",
        runId: "run-1",
        store: drainingStore,
      });
      const handedOff = getProjectState(drainingStore, "melee");
      expect(handedOff?.active_workflow).toMatchObject({
        kind: "pr",
        status: "active",
        workflow_id: "pr-handoff:run-1",
      });
      expect(handedOff?.active_workflow?.lease_id).not.toBe(runLeaseId);
      expect(handedOff?.queued_dispatch_requests).toEqual([]);
      expect(listProjectEvents(drainingStore.db).map((event) => event.eventType)).toEqual([
        "project.dispatch_requested",
        "project.dispatch_acquired",
        "project.dispatch_requested",
        "run.draining",
        "project.dispatch_drain_started",
        "project.dispatch_released",
        "project.dispatch_acquired",
        "run.paused",
      ]);
    } finally {
      drainingStore.db.close();
    }
  });

  test("reacquires the run dispatch lease before resuming a paused run", () => {
    const { runtime, stateDir } = runtimeFixture();
    const store = openState(stateDir);
    try {
      store.db
        .query(
          `INSERT INTO runs (
             id, goal_kind, goal_value, desired_workers, status, created_at,
             project_id, revision, trace_id, blockers_json
           ) VALUES ('run-1', 'matched_code_percent', 100, 1, 'paused', ?, 'melee', 0, 'trace-run-1', '[]')`,
        )
        .run("2026-08-12T12:00:00.000Z");
    } finally {
      store.db.close();
    }

    const result = runtime.resumeRunForPr({ runId: "run-1", commandId: "command-resume-test" });
    expect(result).toMatchObject({ resumed: true, run: { id: "run-1", status: "active", revision: 1 } });

    const verified = openState(stateDir);
    try {
      expect(getProjectState(verified, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        status: "active",
        workflow_id: "run-1",
      });
      expect(listProjectEvents(verified.db).map((event) => [event.eventType, event.causationId])).toEqual([
        ["project.dispatch_requested", "command-resume-test"],
        ["project.dispatch_acquired", expect.any(String)],
        ["run.activated", "command-resume-test"],
      ]);
    } finally {
      verified.db.close();
    }
  });
});
