import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  admitEpochTargets,
  claimNextEpochTarget as claimNextEpochTargetRaw,
  closeSchedulerEpoch,
  closeWorkerState,
  createRun,
  openState,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import { createProjectSession, recordSavePointAnchor, recordSavePointFailureDurably } from "@server/core/project-session";
import { initializeProjectState, requestDispatch } from "@server/core/project-state";
import { addSavePoint, ensureCampaign } from "@server/core/session-runtime/phases/pr/state";
import {
  buildProjectStateReadModel,
  createDashboardReadModel,
  type JsonObject,
} from "./read-model.js";

const tempDirs: string[] = [];
const TEST_WORKER_TIMEOUT_SECONDS = 1800;

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "dashboard-read-model-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

function claimNextEpochTarget(params: Omit<Parameters<typeof claimNextEpochTargetRaw>[0], "ttlSeconds"> & { ttlSeconds?: number }) {
  return claimNextEpochTargetRaw({ ...params, ttlSeconds: params.ttlSeconds ?? TEST_WORKER_TIMEOUT_SECONDS });
}

function writeActivityLog(path: string, events: Record<string, unknown>[]): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("dashboard read model", () => {
  test("projects canonical authority, session evidence, queued dispatch, and server-owned actions", () => {
    const { store } = tempState();
    try {
      createProjectSession(store.db, {
        projectId: "melee",
        sessionUuid: "session-1",
        id: "project-session:session-1",
        baseSha: "base-sha",
      });
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const run = requestDispatch(store, {
        projectId: "melee",
        kind: "run",
        workflowId: "run-1",
        reason: "run",
        commandId: "command-run",
        actor: "operator",
      });
      expect(run.queued).toBeFalse();
      requestDispatch(store, {
        projectId: "melee",
        kind: "sync",
        workflowId: "sync-1",
        reason: "sync",
        commandId: "command-sync",
        actor: "operator",
      });
      const campaign = ensureCampaign(store, { projectId: "melee", baseRef: "origin/master" });
      const savePoint = addSavePoint(store, {
        campaignId: campaign.id,
        triggerKind: "manual",
        label: "operator anchor",
        commitSha: "base-sha",
        matchedCodePercent: 98.5,
      });
      recordSavePointAnchor(store, {
        projectId: "melee",
        savePointId: savePoint.id,
        commitSha: "base-sha",
        triggerKind: "manual",
        headlineScore: 98.5,
        commandId: "command-save",
        actor: "operator",
      });

      const view = buildProjectStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: false },
      });

      expect(view.revision).toBe(3);
      expect(view.active_workflow).toMatchObject({ kind: "run", workflow_id: "run-1", status: "active" });
      expect(view.queued_dispatch_requests).toEqual([
        expect.objectContaining({ kind: "sync", workflow_id: "sync-1" }),
      ]);
      expect(view.session).toMatchObject({
        session_uuid: "session-1",
        head_revision: "base-sha",
        status: "active",
        save_point_stale: false,
        latest_save_point: {
          id: savePoint.id,
          triggerKind: "manual",
          label: "operator anchor",
          commitSha: "base-sha",
          matchedCodePercent: 98.5,
        },
      });
      expect(view.session?.timeline).toHaveLength(1);
      expect(view.latest_event_sequence).toBe(5);
      expect(view.available_actions).toEqual([
        expect.objectContaining({
          action_id: "session.save_point",
          enabled: true,
          blocked_by: [],
          confirmation_required: false,
        }),
        expect.objectContaining({
          action_id: "session.close",
          enabled: false,
          blocked_by: [expect.objectContaining({ code: "dispatch_lease_held" })],
          confirmation_required: true,
        }),
      ]);
    } finally {
      store.db.close();
    }
  });

  test("marks a named anchor stale after session head drift while limiting the displayed timeline", () => {
    const { store } = tempState();
    try {
      createProjectSession(store.db, {
        projectId: "melee",
        sessionUuid: "session-1",
        id: "project-session:session-1",
        baseSha: "base-sha",
      });
      const campaign = ensureCampaign(store, { projectId: "melee", baseRef: "origin/master" });
      for (let index = 0; index < 25; index += 1) {
        const savePoint = addSavePoint(store, {
          campaignId: campaign.id,
          triggerKind: "manual",
          label: index === 0 ? "named anchor" : null,
          commitSha: `commit-${index}`,
        });
        recordSavePointAnchor(store, {
          projectId: "melee",
          savePointId: savePoint.id,
          commitSha: `commit-${index}`,
          triggerKind: "manual",
          commandId: `command-save-${index}`,
          actor: "operator",
        });
      }

      const view = buildProjectStateReadModel(store, "melee", {
        aheadOfBase: 4,
        head: { dirty: false },
      });
      expect(view.session?.timeline).toHaveLength(20);
      expect(view.session?.save_point_stale).toBe(true);
      expect(view.available_actions.find((action) => action.action_id === "session.close")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "unshipped_work" })],
      });
    } finally {
      store.db.close();
    }
  });

  test("refuses dirty work and accepts a fresh named anchor at the current head", () => {
    const { store } = tempState();
    try {
      createProjectSession(store.db, {
        projectId: "melee",
        sessionUuid: "session-1",
        id: "project-session:session-1",
        baseSha: "head-1",
      });
      const campaign = ensureCampaign(store, { projectId: "melee", baseRef: "origin/master" });
      const savePoint = addSavePoint(store, {
        campaignId: campaign.id,
        triggerKind: "manual",
        label: "fresh anchor",
        commitSha: "head-1",
      });
      recordSavePointAnchor(store, {
        projectId: "melee",
        savePointId: savePoint.id,
        commitSha: "head-1",
        triggerKind: "manual",
        commandId: "command-save-fresh",
        actor: "operator",
      });

      const dirty = buildProjectStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: true },
      });
      expect(dirty.session?.save_point_stale).toBe(true);
      expect(dirty.available_actions.find((action) => action.action_id === "session.close")?.enabled).toBe(false);

      const clean = buildProjectStateReadModel(store, "melee", {
        aheadOfBase: 4,
        head: { dirty: false },
      });
      expect(clean.session?.save_point_stale).toBe(false);
      expect(clean.available_actions.find((action) => action.action_id === "session.close")).toMatchObject({
        enabled: true,
        blocked_by: [],
      });
    } finally {
      store.db.close();
    }
  });

  test("surfaces a sessionless spooled failure as a blocker and stale evidence", () => {
    const { store } = tempState();
    try {
      const failure = recordSavePointFailureDurably(store.stateDir, {
        projectId: "melee",
        triggerKind: "checkpoint",
        sourceKind: "save_point_boundary",
        sourceId: "checkpoint",
        message: "capture unavailable",
        commandId: "command-spooled-failure",
        actor: "runner",
      }, store);
      expect(failure.storage).toBe("spool");

      const view = buildProjectStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: false },
      });
      expect(view.save_point_stale).toBe(true);
      expect(view.session_blockers).toContainEqual(expect.objectContaining({ code: "save_point_failed" }));
      expect(view.available_actions.find((action) => action.action_id === "session.close")?.blocked_by).toContainEqual(
        expect.objectContaining({ code: "save_point_failed" }),
      );
    } finally {
      store.db.close();
    }
  });

  test("includes epoch status on epoch targets so stale admitted rows can be excluded from the active queue", () => {
    const { dir, store } = tempState();
    let runId = "";
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      runId = run.id;
      const oldEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: oldEpoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "old_fn", sourcePath: "src/old.c", size: 64, fuzzy: 91, priority: 2, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      closeSchedulerEpoch(store, oldEpoch.id, { status: "completed" });
      const activeEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: activeEpoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "active_fn", sourcePath: "src/active.c", size: 64, fuzzy: 90, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
    } finally {
      store.db.close();
    }

    const { runDetails } = createDashboardReadModel({
      buildPrRecordsView: () => ({}),
      campaignStatus: () => ({}),
      processStatus: () => ({}),
    });
    const details = runDetails(dir, runId);
    const targets = (details.epochTargets as JsonObject[]).map((target) => ({
      symbol: target.symbol,
      epochStatus: target.epochStatus,
      epochTargetStatus: target.epochTargetStatus,
    }));

    expect(targets).toContainEqual({ symbol: "old_fn", epochStatus: "completed", epochTargetStatus: "admitted" });
    expect(targets).toContainEqual({ symbol: "active_fn", epochStatus: "active", epochTargetStatus: "admitted" });
    expect(targets.filter((target) => target.epochStatus === "active" && target.epochTargetStatus === "admitted")).toEqual([
      { symbol: "active_fn", epochStatus: "active", epochTargetStatus: "admitted" },
    ]);
  });

  test("keeps timeout, recovery, session failure, validation, and tool error outcomes separate", () => {
    const { dir, store } = tempState();
    let runId = "";
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 6 },
        workerPoolSize: 1,
        candidateWindow: 6,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          { unit: "unit", symbol: "timeout_fn", sourcePath: "src/timeout.c", size: 64, fuzzy: 91, priority: 1, reason: "test" },
          { unit: "unit", symbol: "recovered_fn", sourcePath: "src/recovered.c", size: 64, fuzzy: 91, priority: 1, reason: "test" },
          { unit: "unit", symbol: "session_failed_fn", sourcePath: "src/session_failed.c", size: 64, fuzzy: 91, priority: 1, reason: "test" },
          { unit: "unit", symbol: "validation_fn", sourcePath: "src/validation.c", size: 64, fuzzy: 91, priority: 1, reason: "test" },
          { unit: "unit", symbol: "tool_fn", sourcePath: "src/tool.c", size: 64, fuzzy: 91, priority: 1, reason: "test" },
          { unit: "unit", symbol: "banked_fn", sourcePath: "src/banked.c", size: 64, fuzzy: 91, priority: 1, reason: "test" },
        ],
        size: { mode: "fixed", value: 6 },
        workerPoolSize: 1,
      });

      const timeoutClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-timeout", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: timeoutClaim!.workerStateId,
        lifecycleStatus: "timeout",
        timeoutSummary: "Worker Pi session timed out after 1800s",
      });

      const recoveredClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-recovered", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: recoveredClaim!.workerStateId,
        lifecycleStatus: "error",
        errorSummary: "Recovered interrupted active worker: test recovery",
        summary: {
          recovered_by: "recover-claims",
          recovery_reason: "test recovery",
          requeued: true,
        },
      });

      const sessionFailedClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-session-failed", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: sessionFailedClaim!.workerStateId,
        lifecycleStatus: "error",
        errorSummary: "Worker Pi session failed before producing a validation-ready state: process exited",
        summary: {
          error: {
            kind: "worker_session_failed",
            summary: "Worker Pi session failed before producing a validation-ready state: process exited",
            reasons: ["process exited"],
          },
        },
      });

      const validationClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-validation", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: validationClaim!.workerStateId,
        lifecycleStatus: "finished",
        summary: {
          latest_runner_validation: {
            status: "failed",
            reasons: ["hard gate failed"],
          },
        },
      });

      const toolClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-tool", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: toolClaim!.workerStateId,
        lifecycleStatus: "error",
        errorSummary: "Worker note describes a tool/build/validation failure",
        summary: {
          error: {
            kind: "agent_noted_tool_error",
            summary: "Worker note describes a tool/build/validation failure",
            reasons: ["tool failed"],
          },
        },
      });

      const bankedClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-banked", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: bankedClaim!.workerStateId,
        lifecycleStatus: "finished",
        summary: {
          continuation_attempts: {
            stop_reason: "improvement_banked",
          },
        },
      });
    } finally {
      store.db.close();
    }

    const { runDetails } = createDashboardReadModel({
      buildPrRecordsView: () => ({}),
      campaignStatus: () => ({}),
      processStatus: () => ({}),
    });
    const details = runDetails(dir, runId);
    const counts = (details.summary as Record<string, unknown>).workerStateOutcomeCounts as Record<string, unknown>;

    expect(counts.timeout_baseline).toBe(1);
    expect(counts.recovered_requeued).toBe(1);
    expect(counts.worker_session_failed).toBe(1);
    expect(counts.validation_failed).toBe(1);
    expect(counts.agent_tool_error).toBe(1);
    expect(counts.improvement_banked).toBe(1);
  });

  test("scopes active claim activity to the current recycled claim window", async () => {
    const { dir, store } = tempState();
    let runId = "";
    let workerStateId = "";
    try {
      const run = createRun(store, "matched_code_percent", 100, 1);
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 91, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });

      const firstClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-old", baseRev: "base" });
      expect(firstClaim).not.toBeNull();
      workerStateId = firstClaim!.workerStateId;
      const activityPath = resolve(dir, "runs", run.id, "worker_state", firstClaim!.workerStateId, "activity.jsonl");
      const toolEventsPath = resolve(dir, "runs", run.id, "worker_state", firstClaim!.workerStateId, "tool_events.jsonl");
      writeActivityLog(activityPath, [
        {
          created_at: "2000-01-01T00:00:00.000Z",
          attempt_index: 0,
          phase: "attempt",
          event_type: "attempt_started",
          summary: "old attempt 0 started",
        },
        {
          created_at: "2000-01-01T00:01:00.000Z",
          attempt_index: 2,
          phase: "validation",
          event_type: "runner_validation_rejected",
          summary: "old attempt 2 validation",
          score: { before: 88, after: 89, exact: false },
        },
      ]);

      closeWorkerState(store, {
        workerStateId: firstClaim!.workerStateId,
        lifecycleStatus: "error",
        epochTargetStatus: "admitted",
        errorSummary: "interrupted",
      });

      const secondClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-new", baseRev: "base" });
      expect(secondClaim?.workerStateId).toBe(firstClaim!.workerStateId);
      const row = store.db.query("SELECT claimed_at FROM target_claims WHERE id = ?").get(secondClaim!.claimId) as Record<string, unknown>;
      const claimedAt = String(row.claimed_at);
      const currentAt = new Date(Date.parse(claimedAt) + 1).toISOString();
      writeActivityLog(activityPath, [
        {
          created_at: "2000-01-01T00:00:00.000Z",
          attempt_index: 0,
          phase: "attempt",
          event_type: "attempt_started",
          summary: "old attempt 0 started",
        },
        {
          created_at: "2000-01-01T00:01:00.000Z",
          attempt_index: 2,
          phase: "validation",
          event_type: "runner_validation_rejected",
          summary: "old attempt 2 validation",
          score: { before: 88, after: 89, exact: false },
        },
        {
          created_at: currentAt,
          attempt_index: 0,
          phase: "setup",
          event_type: "claim_started",
          summary: "current claim started",
          score: { before: 91, after: null, exact: false },
        },
        {
          created_at: currentAt,
          attempt_index: 0,
          phase: "attempt",
          event_type: "attempt_started",
          summary: "current attempt 0 started",
        },
      ]);
      writeActivityLog(toolEventsPath, [
        {
          created_at: "2000-01-01T00:00:00.000Z",
          attempt_index: 2,
          tool: "old_tool",
          status: "ok",
          duration_ms: 1,
        },
        {
          created_at: currentAt,
          attempt_index: 0,
          tool: "compile",
          status: "ok",
          duration_ms: 25,
          params: { target: "fn" },
        },
      ]);
    } finally {
      store.db.close();
    }

    const { runDashboard, workerStateTrace } = createDashboardReadModel({
      buildPrRecordsView: () => ({}),
      campaignStatus: () => ({}),
      processStatus: () => ({}),
    });
    const dashboard = await runDashboard({ project: null, repoRoot: dir, stateDir: dir, graphDbPath: "", usePathOverrides: true });
    const active = (dashboard.activeFiles as Record<string, unknown>[])[0];
    const activity = active?.activity as Record<string, unknown>;
    const lastEvent = activity.lastEvent as Record<string, unknown>;

    expect(active?.workerStateId).toBeDefined();
    expect(activity.attemptIndex).toBe(0);
    expect(activity.lastScore).toBeNull();
    expect(lastEvent.summary).toBe("current attempt 0 started");
    expect(activity.recentToolEvents).toEqual([]);

    const trace = workerStateTrace(dir, runId, workerStateId);
    expect((trace.recentEvents as Record<string, unknown>[]).map((event) => event.summary)).toEqual([
      "current claim started",
      "current attempt 0 started",
    ]);
    expect((trace.recentToolEvents as Record<string, unknown>[]).map((event) => event.tool)).toEqual(["compile"]);
    expect(trace.toolEventCount).toBe(1);
  });
});
