import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHandoffRuntime, type HandoffRuntimeDeps } from "./runtime.js";
import type { RegressionReport } from "@server/core/validation/objdiff/report.js";
import {
  DispatchLeaseUnavailableError,
} from "@server/core/cycle-runtime/dispatch-guard.js";
import { createCycleRecord } from "@server/core/cycle";
import { createCycle } from "@server/core/cycle/store";
import {
  getHarnessState,
  initializeHarnessState,
  listGameEvents,
  recoverDispatch,
  requestDispatch,
  StaleLeaseError,
} from "@server/core/harness-state";
import { openState } from "@server/core/orchestrator-state";
import { settlePausedRun } from "@server/core/cycle-runtime/phases/running/run-control.js";
import { enterPrPhase } from "./index.js";

const cleanupPaths: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(path);
  return path;
}

function seedDurablePrWorkflow(
  stateDir: string,
  workflowId: string,
  gameId = "melee",
  status: "preparing" | "completed" = "preparing",
): void {
  const store = openState(stateDir);
  try {
    store.db.query(`
      INSERT INTO pr_campaigns (
        campaign_id, game_id, cycle_uuid, revision, status, trace_id,
        caused_by_event_id, created_at, source_anchor_json
      ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
      workflowId,
      gameId,
      `cycle-${workflowId}`,
      status,
      `trace-${workflowId}`,
      `event-${workflowId}-opened`,
      "2026-08-13T09:59:00.000Z",
      JSON.stringify({
        save_point_id: `save-point-${workflowId}`,
        source_revision: "fixture-revision",
      }),
    );
  } finally {
    store.db.close();
  }
}

function seedDurableRunWorkflow(
  stateDir: string,
  workflowId: string,
  gameId = "melee",
): void {
  const store = openState(stateDir);
  try {
    store.db.query(`
      INSERT INTO runs (
        id, goal_kind, goal_value, desired_workers, status, created_at,
        game_id, revision, trace_id
      ) VALUES (?, 'matched_code_percent', 100, 1, 'ready', ?, ?, 0, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(
      workflowId,
      "2026-08-13T09:59:00.000Z",
      gameId,
      `trace-${workflowId}`,
    );
  } finally {
    store.db.close();
  }
}

function seedDurableSyncWorkflow(
  stateDir: string,
  workflowId: string,
  gameId = "melee",
): void {
  const store = openState(stateDir);
  try {
    store.db.query(`
      INSERT INTO sync_state (
        sync_id, game_id, cycle_uuid, revision, status, trace_id,
        caused_by_event_id, created_at, updated_at
      ) VALUES (?, ?, ?, 0, 'requested', ?, ?, ?, ?)
    `).run(
      workflowId,
      gameId,
      `cycle-${workflowId}`,
      `trace-${workflowId}`,
      `event-${workflowId}-requested`,
      "2026-08-13T09:59:00.000Z",
      "2026-08-13T09:59:00.000Z",
    );
  } finally {
    store.db.close();
  }
}

function acquirePrWorkflow(
  stateDir: string,
  workflowId: string,
  gameId = "melee",
) {
  seedDurablePrWorkflow(stateDir, workflowId, gameId);
  const store = openState(stateDir);
  try {
    initializeHarnessState(store, {
      gameId,
      traceId: `trace-game-${gameId}`,
    });
    const decision = requestDispatch(store, {
      actor: "operator",
      commandId: `command-${workflowId}`,
      correlationId: workflowId,
      kind: "pr",
      gameId,
      reason: "PR publication trace fixture",
      workflowId,
    });
    if (decision.queued || !decision.state.active_workflow) {
      throw new Error(`expected ${workflowId} lease acquisition`);
    }
    return decision.state.active_workflow;
  } finally {
    store.db.close();
  }
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

test("enterPrPhase preserves durable cycle status while activating PR work", () => {
  const record = createCycleRecord({
    actor: "operator",
    id: "cycle:cycle-pr",
    now: "2026-08-14T10:00:00.000Z",
    gameId: "melee",
    cycleUuid: "cycle-pr",
  });
  const patch = enterPrPhase({
    ...record,
    blockers_json: [{
      code: "worker_error",
      message: "worker process failed",
      recovery_choices: ["retry_workers"],
      source_id: "cycle-pr",
      source_kind: "cycle",
    }],
    phase: "running",
    running_state_json: {
      ...record.running_state_json,
      blockers: [{
        code: "worker_error",
        message: "worker process failed",
        recovery_choices: ["retry_workers"],
        source_id: "cycle-pr",
        source_kind: "cycle",
      }],
      completed_at: null,
      manual_stop_mode: "hard_stop",
      started_at: "2026-08-14T10:01:00.000Z",
      status: "blocked",
      stop_reason: "manual_stop",
      subphase: "draining",
    },
    status: "active",
  }, "2026-08-14T10:02:00.000Z", { force: true });

  expect(patch.status).toBeUndefined();
  expect(patch.phase).toBe("pr");
  expect(patch.running_state_json?.status).toBe("complete");
  expect(patch.pr_state_json?.status).toBe("active");
  expect(patch.pr_state_json?.subphase).toBe("final_build");
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
    existingPr: {
      baseRefName: string;
      headRefName: string;
      headRepositoryOwner: { login: string };
      number: number;
      url: string;
    } | null;
    ghCommands: string[][];
    publish: number;
  } = {
    boundaryOrder: [],
    events: [],
    existingPr: null,
    ghCommands: [],
    merge: 0,
    order: [],
    publish: 0,
  };

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
    gameToSummary: () => ({}),
    resolveDashboardGame: () => ({
      repoRoot,
      stateDir,
      game: {
        gameId: "melee",
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
      if (command[0] === "gh") {
        calls.ghCommands.push(command);
        if (command[2] === "list") {
          return { exitCode: 0, stdout: JSON.stringify(calls.existingPr ? [calls.existingPr] : []), stderr: "" };
        }
        return { exitCode: 0, stdout: "https://example.test/pr/123\n", stderr: "" };
      }
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
  } as unknown as HandoffRuntimeDeps;

  return { branch, calls, runtime: createHandoffRuntime(deps), stateDir };
}

describe("openPrForSlice support manifests", () => {
  test("publishes under an existing campaign lease without acquiring or releasing a legacy lease", async () => {
    const { branch, runtime, stateDir } = runtimeFixture();
    let revalidations = 0;
    const lease = acquirePrWorkflow(stateDir, "campaign-1");
    const before = openState(stateDir);
    const eventCount = listGameEvents(before.db, { gameId: "melee" }).length;
    before.db.close();

    await runtime.openPrForSliceUnderLease(
      { prBranch: branch, postLedgerComments: false },
      () => {
        revalidations += 1;
        return lease;
      },
    );

    expect(revalidations).toBeGreaterThan(3);
    const store = openState(stateDir);
    try {
      expect(getHarnessState(store, "melee")?.active_workflow).toEqual(lease);
      expect(listGameEvents(store.db, { gameId: "melee" })).toHaveLength(eventCount);
    } finally {
      store.db.close();
    }
  });

  test("passes declared support files through local source capture and isolation", async () => {
    const supportFiles = ["include/melee/gr/ground.h"];
    const { branch, calls, runtime, stateDir } = runtimeFixture(supportFiles);
    seedDurablePrWorkflow(stateDir, "pr-publish:run-1");

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
    const { branch, calls, runtime, stateDir } = runtimeFixture();
    seedDurablePrWorkflow(stateDir, "pr-publish:run-1");

    await runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false });

    expect("supportFiles" in calls.ready!).toBe(false);
    expect("supportFiles" in calls.verify!).toBe(false);
    expect(calls.merge).toBe(0);
    for (const event of calls.events) {
      expect("supportFiles" in (event.metadata as Record<string, unknown>)).toBe(false);
    }
  });

  test("links PR publication traces to the persisted dispatch acquisition", async () => {
    const { branch, calls, runtime, stateDir } = runtimeFixture();
    seedDurablePrWorkflow(stateDir, "pr-publish:run-1");

    await runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false });

    const store = openState(stateDir);
    try {
      const events = listGameEvents(store.db, { gameId: "melee" });
      const requested = events.find(
        (event) => event.eventType === "game.dispatch_requested",
      );
      const acquired = events.find(
        (event) => event.eventType === "game.dispatch_acquired",
      );
      expect(requested).toBeDefined();
      expect(acquired).toBeDefined();
      expect(calls.events).toHaveLength(2);
      expect(calls.events).toMatchObject([
        {
          correlationId: "pr-publish:run-1",
          gameEventId: acquired?.eventId,
          causedByEventId: requested?.eventId,
        },
        {
          correlationId: "pr-publish:run-1",
          gameEventId: acquired?.eventId,
          causedByEventId: requested?.eventId,
        },
      ]);
    } finally {
      store.db.close();
    }
  });

  test("rejects PR publication before trace submission when dispatch lineage is absent", async () => {
    const { branch, calls, runtime } = runtimeFixture();

    await expect(runtime.openPrForSliceUnderLease(
      { prBranch: branch, postLedgerComments: false },
      () => ({
        kind: "pr",
        workflow_id: "campaign-1",
        lease_id: "lease-campaign-1",
        status: "active",
        acquired_at: "2026-08-13T10:00:00.000Z",
        heartbeat_at: "2026-08-13T10:00:00.000Z",
        blockers: [],
      }),
    )).rejects.toThrow(
      "PR publication tracing requires durable dispatch lineage for game melee",
    );
    expect(calls.events).toEqual([]);
    expect(calls.publish).toBe(0);
  });

  test("rejects PR publication before trace submission when dispatch correlation is wrong", async () => {
    const { branch, calls, runtime, stateDir } = runtimeFixture();
    const lease = acquirePrWorkflow(stateDir, "campaign-1");
    seedDurablePrWorkflow(stateDir, "other-campaign", "melee", "completed");
    const store = openState(stateDir);
    try {
      const queued = requestDispatch(store, {
        actor: "operator",
        commandId: "command-other-campaign",
        correlationId: "other-campaign",
        kind: "pr",
        gameId: "melee",
        reason: "replace current durable cause",
        workflowId: "other-campaign",
      });
      expect(queued.queued).toBeTrue();
    } finally {
      store.db.close();
    }

    await expect(runtime.openPrForSliceUnderLease(
      { prBranch: branch, postLedgerComments: false },
      () => lease,
    )).rejects.toThrow(
      "Dispatch trace correlation other-campaign does not match campaign-1",
    );
    expect(calls.events).toEqual([]);
    expect(calls.publish).toBe(0);
  });

  test("rejects PR publication before trace submission when dispatch lineage is cross-game", async () => {
    const { branch, calls, runtime, stateDir } = runtimeFixture();
    const lease = acquirePrWorkflow(stateDir, "campaign-1");
    acquirePrWorkflow(stateDir, "other-campaign", "other-game");
    const store = openState(stateDir);
    try {
      const otherEventId = getHarnessState(
        store,
        "other-game",
      )?.caused_by_event_id;
      if (!otherEventId) throw new Error("expected other-game dispatch lineage");
      store.db.query(
        "UPDATE harness_state SET caused_by_event_id = ? WHERE game_id = 'melee'",
      ).run(otherEventId);
    } finally {
      store.db.close();
    }

    await expect(runtime.openPrForSliceUnderLease(
      { prBranch: branch, postLedgerComments: false },
      () => lease,
    )).rejects.toThrow("Game event not found");
    expect(calls.events).toEqual([]);
    expect(calls.publish).toBe(0);
  });

  test("adopts an existing GitHub PR by exact head and base instead of creating a duplicate", async () => {
    const { branch, calls, runtime, stateDir } = runtimeFixture();
    const lease = acquirePrWorkflow(stateDir, "campaign-1");
    calls.existingPr = {
      baseRefName: "master",
      headRefName: branch,
      headRepositoryOwner: { login: "fork-owner" },
      number: 123,
      url: "https://example.test/pr/123",
    };

    const result = await runtime.openPrForSliceUnderLease(
      { prBranch: branch, postLedgerComments: false },
      () => lease,
    );

    expect(result).toMatchObject({ adopted: true, opened: false });
    expect(calls.ghCommands[0]).toEqual(expect.arrayContaining([
      "gh", "pr", "list", "--state", "open",
      "--head", branch, "--base", "master",
      "--json", "number,url,headRefName,headRepositoryOwner,baseRefName", "--limit", "100",
    ]));
    expect(calls.ghCommands.some((command) => command[2] === "create")).toBe(false);
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
    const { branch, calls, runtime, stateDir } = runtimeFixture(supportFiles, [peer]);
    seedDurablePrWorkflow(stateDir, "pr-local:run-1");

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
    const { branch, calls, runtime, stateDir } = runtimeFixture(supportFiles, [publishedPeer], false);
    seedDurablePrWorkflow(stateDir, "pr-publish:run-1");

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
    seedDurablePrWorkflow(stateDir, "pr-handoff:run-1");
    const store = openState(stateDir);
    try {
      store.db.query(
        `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, cycle_uuid)
         VALUES ('run-1', 'matched_code_percent', 100, 1, 'paused', '2026-08-12T12:00:00.000Z', 'melee', 'cycle-1')`,
      ).run();
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-pause-run",
        correlationId: "pr-handoff:run-1",
        kind: "pr",
        gameId: "melee",
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
    seedDurablePrWorkflow(stateDir, "pr-handoff:run-1");
    const store = openState(stateDir);
    try {
      store.db.query(
        `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, cycle_uuid)
         VALUES ('run-1', 'matched_code_percent', 100, 1, 'paused', '2026-08-12T12:00:00.000Z', 'melee', 'cycle-1')`,
      ).run();
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-pause-run-failure",
        correlationId: "pr-handoff:run-1",
        kind: "pr",
        gameId: "melee",
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
    seedDurablePrWorkflow(stateDir, "pr-handoff:run-1");
    const store = openState(stateDir);
    try {
      store.db.query(
        `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, cycle_uuid)
         VALUES ('run-1', 'matched_code_percent', 100, 1, 'paused', '2026-08-12T12:00:00.000Z', 'melee', 'cycle-1')`,
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
    seedDurableRunWorkflow(stateDir, "run-1");
    seedDurablePrWorkflow(stateDir, "pr-local:run-1");
    const store = openState(stateDir);
    try {
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const run = requestDispatch(store, {
        actor: "operator",
        commandId: "command-run-start",
        correlationId: "run-1",
        kind: "run",
        gameId: "melee",
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
      expect(getHarnessState(next, "melee")?.queued_dispatch_requests).toContainEqual(
        expect.objectContaining({ kind: "pr", workflow_id: "pr-local:run-1" }),
      );
    } finally {
      next.db.close();
    }
  });

  test("refuses prepare-local-batch while another workflow holds the lease", async () => {
    const { calls, runtime, stateDir } = runtimeFixture(undefined, [], true, undefined, "not_prepared");
    seedDurableRunWorkflow(stateDir, "run-1");
    seedDurablePrWorkflow(stateDir, "pr-local:run-1");
    const store = openState(stateDir);
    try {
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const run = requestDispatch(store, {
        actor: "operator",
        commandId: "command-run-start",
        correlationId: "run-1",
        kind: "run",
        gameId: "melee",
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
        const current = getHarnessState(store, "melee")?.active_workflow;
        if (!current) throw new Error("expected active PR lease during verification");
        recoverDispatch(store, {
          actor: "operator",
          cancelledSubjectIds: [],
          commandId: "command-recover-stale-pr",
          correlationId: current.workflow_id,
          leaseId: current.lease_id,
          gameId: "melee",
          recoveryReason: "test replacement",
        });
        const replacement = requestDispatch(store, {
          actor: "operator",
          commandId: "command-sync-replacement",
          correlationId: "sync-replacement",
          kind: "sync",
          gameId: "melee",
          reason: "replace stale PR callback",
          workflowId: "sync-replacement",
        });
        if (replacement.queued) throw new Error("expected replacement lease acquisition");
      } finally {
        store.db.close();
      }
    });
    stateDir = fixture.stateDir;
    seedDurablePrWorkflow(stateDir, "pr-local:run-1");
    seedDurableSyncWorkflow(stateDir, "sync-replacement");

    await expect(
      fixture.runtime.prepareLocalPr({ prBranch: fixture.branch, runId: "run-1" }),
    ).rejects.toBeInstanceOf(StaleLeaseError);
    expect(fixture.calls.order).toEqual(["isolate"]);

    const store = openState(stateDir);
    try {
      expect(getHarnessState(store, "melee")?.active_workflow).toMatchObject({
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
    seedDurablePrWorkflow(stateDir, "pr-handoff:run-1");
    const store = openState(stateDir);
    let runLeaseId = "";
    try {
      createCycle(store.db, {
        actor: "operator",
        id: "cycle:cycle-pr-handoff:run-1",
        gameId: "melee",
        cycleUuid: "cycle-pr-handoff:run-1",
      });
      store.db
        .query(
          `INSERT INTO runs (
             id, goal_kind, goal_value, desired_workers, status, created_at,
             game_id, revision, trace_id, blockers_json
           ) VALUES ('run-1', 'matched_code_percent', 100, 1, 'active', ?, 'melee', 0, 'trace-run-1', '[]')`,
        )
        .run("2026-08-12T12:00:00.000Z");
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const run = requestDispatch(store, {
        actor: "operator",
        commandId: "command-run-start",
        correlationId: "run-1",
        kind: "run",
        gameId: "melee",
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
      expect(getHarnessState(drainingStore, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        lease_id: runLeaseId,
        status: "draining",
        requested_handoff: {
          target_kind: "pr",
          target_workflow_id: "pr-handoff:run-1",
        },
      });
      settlePausedRun({
        actor: "operator",
        commandId: "command-run-settled",
        leaseId: runLeaseId,
        reason: "operator settled PR handoff",
        runId: "run-1",
        store: drainingStore,
      });
      const handedOff = getHarnessState(drainingStore, "melee");
      expect(handedOff?.active_workflow).toMatchObject({
        kind: "pr",
        status: "active",
        workflow_id: "pr-handoff:run-1",
      });
      expect(handedOff?.active_workflow?.lease_id).not.toBe(runLeaseId);
      expect(handedOff?.queued_dispatch_requests).toEqual([]);
      expect(listGameEvents(drainingStore.db).map((event) => event.eventType)).toEqual([
        "cycle.opened",
        "game.dispatch_requested",
        "game.dispatch_acquired",
        "game.dispatch_requested",
        "run.draining",
        "game.dispatch_drain_started",
        "game.dispatch_released",
        "game.dispatch_acquired",
        "pr.campaign_working",
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
             game_id, revision, trace_id, blockers_json
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
      expect(getHarnessState(verified, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        status: "active",
        workflow_id: "run-1",
      });
      const events = listGameEvents(verified.db);
      expect(events.map((event) => event.eventType)).toEqual([
        "game.dispatch_requested",
        "game.dispatch_acquired",
        "run.activated",
      ]);
      expect(events.map((event) => event.causationId)).toEqual([
        "command-resume-test",
        events[0]!.eventId,
        events[1]!.eventId,
      ]);
    } finally {
      verified.db.close();
    }
  });
});
