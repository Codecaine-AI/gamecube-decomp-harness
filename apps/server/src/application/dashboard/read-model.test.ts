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
  enqueueWorkerOutputIntegration,
  openState,
  setRunSchedulerCondition,
  startSchedulerEpoch,
  transitionRun,
  updateRunStatus,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { createProjectSession, recordSavePointAnchor, recordSavePointFailureDurably } from "@server/core/project-session";
import { initializeProjectState, requestDispatch } from "@server/core/project-state";
import { addSavePoint, ensureCampaign } from "@server/core/session-runtime/phases/pr/state";
import {
  buildProjectStateReadModel,
  createDashboardReadModel,
  projectRunActionState,
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

  test("projects the canonical run summary, action inventory, blockers, and recovery points", () => {
    const { store } = tempState();
    try {
      createProjectSession(store.db, {
        projectId: "melee",
        sessionUuid: "session-run",
        id: "project-session:session-run",
        baseSha: "base-sha",
      });
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const ready = createRun(
        store,
        "matched_code_percent",
        100,
        3,
        { projectId: "melee" },
        { baseRevision: "base-sha", sessionUuid: "session-run" },
      );

      const readyState = projectRunActionState(store, "melee", { runId: ready.id });
      expect(readyState.availableActions.map((action) => action.action_id)).toEqual([
        "run.start",
        "run.pause",
        "run.resume",
        "run.hard_stop",
        "run.cancel",
        "run.recover",
      ]);
      expect(readyState.availableActions.map((action) => action.confirmation_required)).toEqual([
        false,
        false,
        false,
        true,
        true,
        true,
      ]);
      expect(readyState.availableActions.find((action) => action.action_id === "run.start")).toMatchObject({
        enabled: true,
        blocked_by: [],
        expected_transition: "ready → active",
      });

      const dispatch = requestDispatch(store, {
        projectId: "melee",
        kind: "run",
        workflowId: ready.id,
        reason: "start run",
        commandId: "command-run-start",
        actor: "operator",
      });
      expect(dispatch.queued).toBeFalse();
      const active = updateRunStatus(store, ready.id, "active", "operator");
      setRunSchedulerCondition(store, active.id, "dispatching");
      const epoch = startSchedulerEpoch(store, active.id, {
        size: { mode: "fixed", value: 3 },
        workerPoolSize: 3,
        candidateWindow: 3,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: active.id,
        candidates: [
          { unit: "unit-a", symbol: "fn_a", sourcePath: "src/a.c", size: 64, fuzzy: 80, priority: 3, reason: "test" },
          { unit: "unit-b", symbol: "fn_b", sourcePath: "src/b.c", size: 64, fuzzy: 81, priority: 2, reason: "test" },
          { unit: "unit-c", symbol: "fn_c", sourcePath: "src/c.c", size: 64, fuzzy: 82, priority: 1, reason: "test" },
        ],
        size: { mode: "fixed", value: 3 },
        workerPoolSize: 3,
      });
      const claim = claimNextEpochTarget({
        store,
        runId: active.id,
        workerId: "worker-active",
        baseRev: "base-sha",
      });
      expect(claim).not.toBeNull();

      recordDashboardArtifact(store, {
        runId: active.id,
        artifactType: "board_snapshot",
        artifactKey: "initial",
        payload: { measures: { matched_code_percent: 72.5 } },
      });
      recordDashboardArtifact(store, {
        runId: active.id,
        artifactType: "board_snapshot",
        artifactKey: "current",
        payload: { measures: { matched_code_percent: 73.25 } },
      });
      for (const [index, validationState] of ["tentative", "confirmed", "regressed"].entries()) {
        const integration = enqueueWorkerOutputIntegration(store, {
          runId: active.id,
          epochId: epoch.id,
          epochTargetId: `target-${index}`,
          targetClaimId: `claim-${index}`,
          workerStateId: `worker-state-${index}`,
          workerCheckpointId: `checkpoint-${index}`,
        });
        store.db
          .query("UPDATE worker_output_integrations SET status = ?, validation_state = ? WHERE id = ?")
          .run(validationState === "regressed" ? "needs_rework" : "applied", validationState, integration.id);
      }

      const activeView = buildProjectStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: false },
      });
      expect(activeView.run).toEqual({
        workflow_id: active.id,
        status: "active",
        scheduler_condition: "dispatching",
        active_epoch: { epoch_id: epoch.id, ordinal: 1 },
        admitted: 3,
        claimed: 1,
        running: 1,
        progress: {
          baseline_score: 72.5,
          confirmed_score: 73.25,
          tentative_changes: 1,
          confirmed_changes: 1,
          regressed_changes: 1,
        },
        recovery_points: [],
      });
      expect(activeView.available_actions.find((action) => action.action_id === "run.pause")?.enabled).toBe(true);
      expect(activeView.available_actions.find((action) => action.action_id === "run.hard_stop")?.enabled).toBe(true);

      const failed = updateRunStatus(store, active.id, "failed", "runner");
      const failedState = projectRunActionState(store, "melee", { runId: active.id });
      expect(failedState.availableActions.find((action) => action.action_id === "run.recover")?.enabled).toBe(true);
      expect(failedState.availableActions.find((action) => action.action_id === "run.pause")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "run_not_active" })],
      });
      expect(failedState.availableActions.find((action) => action.action_id === "run.cancel")?.blocked_by).toContainEqual(
        expect.objectContaining({ code: "unsettled_claims" }),
      );

      transitionRun(store, failed.id, {
        actor: "operator",
        commandId: "command-run-recover",
        eventType: "run.recovered",
        expectedRevision: failed.revision,
        patch: { status: "paused" },
        payload: {
          recovery_reason: "runner crashed",
          cancelled_claim_ids: [claim!.claimId],
          cancelled_operation_ids: ["operation-1"],
          resulting_status: "paused",
        },
      });
      const recoveredView = buildProjectStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: false },
      });
      expect(recoveredView.run?.recovery_points).toEqual([
        expect.objectContaining({
          recovery_reason: "runner crashed",
          cancelled_claim_ids: [claim!.claimId],
          cancelled_operation_ids: ["operation-1"],
          resulting_status: "paused",
        }),
      ]);
      expect(recoveredView.available_actions.find((action) => action.action_id === "run.hard_stop")).toMatchObject({
        enabled: true,
        confirmation_required: true,
      });

      const cancelled = updateRunStatus(store, active.id, "cancelled", "operator");
      const staleHeartbeat = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      const currentLease = (store.db
        .query("SELECT active_workflow_json FROM project_state WHERE project_id = ?")
        .get("melee") as { active_workflow_json: string }).active_workflow_json;
      store.db
        .query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = ?")
        .run(
          JSON.stringify({
            ...JSON.parse(currentLease),
            heartbeat_at: staleHeartbeat,
          }),
          "melee",
        );
      const terminalState = projectRunActionState(store, "melee", {
        runId: cancelled.id,
        hasActiveProcess: () => ({ active: false }),
      });
      expect(terminalState.availableActions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "run_terminal", recoverable: false })],
      });
    } finally {
      store.db.close();
    }
  });

  test("projects unknown process liveness as a recovery blocker for an expired run lease", () => {
    const { dir, store } = tempState();
    try {
      const run = createRun(
        store,
        "matched_code_percent",
        100,
        1,
        { projectId: "melee", repoRoot: dir, stateDir: dir },
        { baseRevision: "base-sha" },
      );
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-stale-run",
        kind: "run",
        projectId: "melee",
        reason: "test stale run projection",
        workflowId: run.id,
      });
      if (dispatch.queued) throw new Error("test run lease was unexpectedly queued");
      updateRunStatus(store, run.id, "active", "operator");
      const state = store.db
        .query("SELECT active_workflow_json FROM project_state WHERE project_id = ?")
        .get("melee") as { active_workflow_json: string };
      store.db
        .query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = ?")
        .run(
          JSON.stringify({
            ...JSON.parse(state.active_workflow_json),
            heartbeat_at: "2026-08-12T12:00:00.000Z",
          }),
          "melee",
        );
      const now = Date.parse("2026-08-12T12:30:00.000Z");

      const unknown = buildProjectStateReadModel(store, "melee", {}, { now });
      expect(unknown.available_actions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "process_liveness_unknown" })],
      });

      const notLive = buildProjectStateReadModel(store, "melee", {}, {
        hasActiveProcess: () => ({ active: false }),
        now,
      });
      expect(notLive.available_actions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: true,
        blocked_by: [],
      });
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
      const run = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
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
      const run = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
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

      const timeoutClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-timeout", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: timeoutClaim!.workerStateId,
        lifecycleStatus: "timeout",
        timeoutSummary: "Worker Pi session timed out after 1800s",
      });

      const recoveredClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-recovered", baseRev: "base" });
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

      const sessionFailedClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-session-failed", baseRev: "base" });
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

      const validationClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-validation", baseRev: "base" });
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

      const toolClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-tool", baseRev: "base" });
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

      const bankedClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-banked", baseRev: "base" });
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
      const run = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
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

      const firstClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-old", baseRev: "base" });
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

      const secondClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-new", baseRev: "base" });
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
