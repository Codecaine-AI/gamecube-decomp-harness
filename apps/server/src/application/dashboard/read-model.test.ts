import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  admitEpochTargets,
  claimNextEpochTarget as claimNextEpochTargetRaw,
  closeSchedulerEpoch,
  closeWorkerState as closeWorkerStateRaw,
  createRun,
  enqueueWorkerOutputIntegration,
  openState,
  setRunSchedulerCondition,
  startSchedulerEpoch,
  transitionRun,
  updateRunStatus,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { createCycle, recordSavePointAnchor, recordSavePointFailureDurably } from "@server/core/cycle";
import { initializeHarnessState, releaseDispatch, requestDispatch } from "@server/core/harness-state";
import { appendGameEvent, type JsonObject as GameEventJsonObject } from "@server/core/harness-state/events";
import { addSavePoint, ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state";
import { defaultBackfillManifestPath } from "@server/core/knowledge/jobs/librarian-backfill.js";
import {
  appendSyncKnowledgeEventInTransaction,
  getSyncState,
  recordSyncRequested,
  syncActionSpanId,
  transitionSync,
} from "@server/core/cycle-runtime/phases/sync";
import {
  buildHarnessStateReadModel,
  createDashboardReadModel,
  getHarnessStateView,
  gameRunActionState,
  repoSyncProjection,
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

function closeWorkerState(store: StateStore, input: Omit<Parameters<typeof closeWorkerStateRaw>[1], "authority">): void {
  closeWorkerStateRaw(store, { ...input, authority: { host: "dashboard-read-model-test" } });
}

function writeActivityLog(path: string, events: Record<string, unknown>[]): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("dashboard read model", () => {
  test("canonical HarnessStateView projects the 13 retained actions", () => {
    const { store } = tempState();
    try {
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const view = getHarnessStateView(store, "melee");
      expect(view.game_id).toBe("melee");
      expect(view.harness_revision).toBe(0);
      expect(view.run).toBeNull();
      expect(view.pr_work).toEqual([]);
      expect(view.knowledge).toMatchObject({ queued: 0, processing: 0, waiting: 0, failed: 0, active_lease: null });
      expect(view.available_actions).toHaveLength(13);
      expect(view.available_actions.map((action) => action.action_id)).toEqual([
        "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
        "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
        "cycle.save_point", "cycle.close", "knowledge.process",
      ]);
      expect(view.available_actions.every((action) => action.confirmation_required === [
        "run.hard_stop", "run.cancel", "run.recover",
        "sync.publish", "sync.cancel", "sync.recover", "cycle.close",
      ].includes(action.action_id))).toBeTrue();
      expect(view.available_actions.find((action) => action.action_id === "run.start")?.blocked_by).toEqual([
        expect.objectContaining({ code: "run_not_found" }),
      ]);
      expect(view.available_actions.find((action) => action.action_id === "knowledge.process")?.blocked_by).toEqual([
        expect.objectContaining({ code: "knowledge_queue_empty" }),
      ]);
      expect(view.compatibility_actions).toEqual([]);
      expect(view.repo_sync).toEqual({
        cycle_head: null,
        upstream_ref: "origin/master",
        upstream_anchor: null,
        local_upstream_sha: null,
        behind_count: null,
        last_synced_at: null,
        needs_sync: false,
      });
    } finally {
      store.db.close();
    }
  });

  test("repo_sync projects local-only git posture without an active sync workflow", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "dashboard-repo-sync-git-"));
    tempDirs.push(repoRoot);
    const git = (...args: string[]): string => {
      const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
      expect(result.status).toBe(0);
      return result.stdout.trim();
    };
    git("init", "-q");
    git("config", "user.email", "dashboard-read-model-test@example.com");
    git("config", "user.name", "dashboard read model test");
    git("commit", "--allow-empty", "-q", "-m", "cycle head");
    const cycleHead = git("rev-parse", "HEAD");
    git("commit", "--allow-empty", "-q", "-m", "upstream one");
    git("commit", "--allow-empty", "-q", "-m", "upstream two");
    const upstreamSha = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/master", upstreamSha);
    // Leave the checkout behind the upstream ref: HEAD is the observed truth.
    git("reset", "-q", "--hard", cycleHead);

    const { store } = tempState();
    try {
      store.db
        .query(
          `INSERT INTO game_upstream_anchors (
             game_id, cycle_uuid, upstream_revision, sync_id, caused_by_event_id, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("melee", "session-1", upstreamSha, "sync-1", "event-1", "2026-08-19T00:00:00.000Z");
      // The recorded head is deliberately stale: observed checkout HEAD must win.
      const cycle = { head_revision: "feedfacefeedfacefeedfacefeedfacefeedface" } as unknown as Parameters<
        typeof repoSyncProjection
      >[2];
      const gameContext = { game: { baseRef: "origin/master" }, repoRoot } as unknown as Parameters<
        typeof repoSyncProjection
      >[3];
      expect(repoSyncProjection(store, "melee", cycle, gameContext)).toEqual({
        cycle_head: cycleHead,
        upstream_ref: "origin/master",
        upstream_anchor: upstreamSha,
        local_upstream_sha: upstreamSha,
        behind_count: 2,
        last_synced_at: "2026-08-19T00:00:00.000Z",
        needs_sync: true,
      });
      // Git failure degrades soft: unknown checkout produces nulls, never throws.
      expect(repoSyncProjection(store, "melee", null, {
        game: { baseRef: "origin/master" },
        repoRoot: join(repoRoot, "does-not-exist"),
      } as unknown as Parameters<typeof repoSyncProjection>[3])).toEqual({
        cycle_head: null,
        upstream_ref: "origin/master",
        upstream_anchor: upstreamSha,
        local_upstream_sha: null,
        behind_count: null,
        last_synced_at: "2026-08-19T00:00:00.000Z",
        needs_sync: false,
      });
    } finally {
      store.db.close();
    }
  });

  test("projects canonical authority, cycle evidence, queued dispatch, and server-owned actions", () => {
    const { store } = tempState();
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-1",
        id: "cycle:session-1",
        baseSha: "base-sha",
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      recordSyncRequested(store, {
        gameId: "melee",
        cycleUuid: "session-1",
        syncId: "sync-1",
        commandId: "command-sync-requested",
        correlationId: "sync-1",
        actor: "external_observer",
        intake: {
          upstream_from: "base-sha",
          upstream_to: "upstream-next",
          merged_pr_ids: ["101", "102"],
          corpus_batch_ids: ["corpus-a"],
          knowledge_only: false,
        },
      });
      const durableRun = createRun(
        store,
        "matched_code_percent",
        100,
        1,
        { gameId: "melee" },
        { baseRevision: "base-sha", cycleUuid: "session-1" },
      );
      const run = requestDispatch(store, {
        gameId: "melee",
        kind: "run",
        workflowId: durableRun.id,
        reason: "run",
        commandId: "command-run",
        actor: "operator",
        correlationId: durableRun.id,
      });
      expect(run.queued).toBeFalse();
      requestDispatch(store, {
        gameId: "melee",
        kind: "sync",
        workflowId: "sync-1",
        reason: "sync",
        commandId: "command-sync",
        actor: "operator",
        correlationId: "sync-1",
      });
      const campaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
      const savePoint = addSavePoint(store, {
        campaignId: campaign.id,
        triggerKind: "manual",
        label: "operator anchor",
        commitSha: "base-sha",
        matchedCodePercent: 98.5,
      });
      recordSavePointAnchor(store, {
        gameId: "melee",
        savePointId: savePoint.id,
        commitSha: "base-sha",
        triggerKind: "manual",
        headlineScore: 98.5,
        commandId: "command-save",
        correlationId: "session-1",
        actor: "operator",
      });

      const view = buildHarnessStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: false },
      });

      expect(view.revision).toBe(3);
      expect(view.active_workflow).toMatchObject({ kind: "run", workflow_id: durableRun.id, status: "active" });
      expect(view.queued_dispatch_requests).toEqual([
        expect.objectContaining({ kind: "sync", workflow_id: "sync-1" }),
      ]);
      expect(view.cycle).toMatchObject({
        cycle_uuid: "session-1",
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
      expect(view.cycle?.timeline).toHaveLength(1);
      expect(view.latest_event_sequence).toBe(8);
      expect(view.recent_events.map((event) => event.sequence)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
      expect(view.recent_events[0]).toMatchObject({
        event_type: "cycle.save_point_recorded",
        game_id: "melee",
        subject_kind: "cycle",
        subject_id: "session-1",
        payload_summary: {
          anchored_commit: "base-sha",
          trigger_kind: "manual",
        },
      });
      expect(view.sync).toMatchObject({
        workflow_id: "sync-1",
        status: "requested",
        intake: {
          upstream_from: "base-sha",
          upstream_to: "upstream-next",
          merged_pr_count: 2,
          corpus_batches: ["corpus-a"],
          knowledge_only: false,
        },
      });
      expect(view.available_actions.map((action) => action.action_id)).toEqual([
        "run.start",
        "run.resume",
        "run.hard_stop",
        "run.cancel",
        "run.recover",
        "sync.start",
        "sync.resolve_conflict",
        "sync.publish",
        "sync.cancel",
        "sync.recover",
        "cycle.save_point",
        "cycle.close",
      ]);
      expect(view.available_actions.find((action) => action.action_id === "sync.start")).toMatchObject({
        enabled: true,
        blocked_by: [],
        expected_transition: "requested → ingesting after run stops",
        confirmation_required: false,
      });
      expect(view.available_actions.find((action) => action.action_id === "sync.resolve_conflict")?.enabled).toBe(false);
      expect(view.available_actions.find((action) => action.action_id === "sync.publish")?.confirmation_required).toBe(true);
      expect(view.available_actions.find((action) => action.action_id === "sync.cancel")?.confirmation_required).toBe(true);
      expect(view.available_actions.find((action) => action.action_id === "sync.recover")?.confirmation_required).toBe(true);
      expect(view.available_actions.find((action) => action.action_id === "cycle.save_point")).toMatchObject({
        enabled: true,
        blocked_by: [],
        confirmation_required: false,
      });
      expect(view.available_actions.find((action) => action.action_id === "cycle.close")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "dispatch_lease_held" })],
        confirmation_required: true,
      });
    } finally {
      store.db.close();
    }
  });

  test("projects the canonical run summary, action inventory, blockers, and recovery points", () => {
    const { store } = tempState();
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-run",
        id: "cycle:session-run",
        baseSha: "base-sha",
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const ready = createRun(
        store,
        "matched_code_percent",
        100,
        3,
        { gameId: "melee" },
        { baseRevision: "base-sha", cycleUuid: "session-run" },
      );

      const readyState = gameRunActionState(store, "melee", { runId: ready.id });
      expect(readyState.availableActions.map((action) => action.action_id)).toEqual([
        "run.start",
        "run.resume",
        "run.hard_stop",
        "run.cancel",
        "run.recover",
      ]);
      expect(readyState.availableActions.map((action) => action.confirmation_required)).toEqual([
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
        gameId: "melee",
        kind: "run",
        workflowId: ready.id,
        reason: "start run",
        commandId: "command-run-start",
        correlationId: ready.id,
        actor: "operator",
      });
      expect(dispatch.queued).toBeFalse();
      const active = updateRunStatus(store, ready.id, "active", "operator");
      setRunSchedulerCondition(store, active.id, "dispatching");
      const epoch = startSchedulerEpoch(store, active.id, {
        workerPoolSize: 3,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: active.id,
        candidates: [
          { kind: "function", unit: "unit-a", symbol: "fn_a", sourcePath: "src/a.c", size: 64, fuzzy: 80 },
          { kind: "function", unit: "unit-b", symbol: "fn_b", sourcePath: "src/b.c", size: 64, fuzzy: 81 },
          { kind: "function", unit: "unit-c", symbol: "fn_c", sourcePath: "src/c.c", size: 64, fuzzy: 82 },
        ],
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
          .query(
            `INSERT INTO integration_outcomes (
               id, run_id, epoch_id, epoch_target_id, target_claim_id,
               worker_state_id, worker_checkpoint_id, status, metadata_json,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            integration.id,
            active.id,
            epoch.id,
            `target-${index}`,
            `claim-${index}`,
            `worker-state-${index}`,
            `checkpoint-${index}`,
            validationState === "regressed" ? "needs_rework" : "applied",
            JSON.stringify({ confirmation: { validation_state: validationState } }),
            new Date().toISOString(),
            new Date().toISOString(),
          );
      }

      const activeView = buildHarnessStateReadModel(store, "melee", {
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
      expect(activeView.available_actions.find((action) => action.action_id === "run.hard_stop")?.enabled).toBe(true);

      const failed = updateRunStatus(store, active.id, "failed", "runner");
      const failedState = gameRunActionState(store, "melee", { runId: active.id });
      expect(failedState.availableActions.find((action) => action.action_id === "run.recover")?.enabled).toBe(true);
      expect(failedState.availableActions.find((action) => action.action_id === "run.cancel")?.blocked_by).toContainEqual(
        expect.objectContaining({ code: "unsettled_claims" }),
      );

      transitionRun(store, failed.id, {
        actor: "operator",
        commandId: "command-run-recover",
        correlationId: failed.id,
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
      const recoveredView = buildHarnessStateReadModel(store, "melee", {
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
        .query("SELECT active_workflow_json FROM harness_state WHERE game_id = ?")
        .get("melee") as { active_workflow_json: string }).active_workflow_json;
      store.db
        .query("UPDATE harness_state SET active_workflow_json = ? WHERE game_id = ?")
        .run(
          JSON.stringify({
            ...JSON.parse(currentLease),
            heartbeat_at: staleHeartbeat,
          }),
          "melee",
        );
      const terminalState = gameRunActionState(store, "melee", {
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

  test("projects sync staging, conflict, validation, staleness, publication, and shared action decisions", () => {
    const { store } = tempState();
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-sync",
        id: "cycle:session-sync",
        baseSha: "session-head",
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      let sync = recordSyncRequested(store, {
        gameId: "melee",
        cycleUuid: "session-sync",
        syncId: "sync-staged",
        commandId: "command-sync-requested",
        correlationId: "sync-staged",
        actor: "external_observer",
        intake: {
          upstream_from: "upstream-old",
          upstream_to: "upstream-new",
          merged_pr_ids: ["201", "202"],
          corpus_batch_ids: ["corpus-a", "corpus-b"],
          knowledge_only: false,
        },
      });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-sync-dispatch",
        correlationId: sync.sync_id,
        kind: "sync",
        gameId: "melee",
        reason: "test sync projection",
        workflowId: sync.sync_id,
      });
      if (dispatch.queued) throw new Error("test sync lease was unexpectedly queued");
      sync = transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-sync-ingesting",
        correlationId: sync.sync_id,
        expectedRevision: sync.revision,
        patch: { status: "ingesting" },
      });
      const staging = {
        workspace_id: "workspace-sync-staged",
        epochs_total: 4,
        epochs_applied: 2,
        minor_conflicts_resolved: 3,
        conflicts_awaiting_operator: 0,
        session_head_sha: "session-head",
        staging_head_sha: "staging-head",
        validated_upstream: "upstream-new",
      };
      sync = transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-sync-reconciling",
        correlationId: sync.sync_id,
        expectedRevision: sync.revision,
        patch: {
          status: "reconciling",
          staging,
          prReconciliation: [
            { series_id: "series-clean", branch: "series/clean", result: "clean", pushed: false },
            { series_id: "series-conflict", branch: "series/conflict", result: "needs_operator", pushed: false },
          ],
        },
      });
      sync = transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-sync-conflict",
        correlationId: sync.sync_id,
        eventType: "sync.reconciliation_blocked",
        expectedRevision: sync.revision,
        patch: {
          status: "blocked",
          blockers: [{
            code: "conflict_needs_operator",
            message: "Resolve staged conflicts.",
            source_kind: "sync",
            source_id: sync.sync_id,
            recoverable: true,
          }],
          staging: {
            ...staging,
            conflicts_awaiting_operator: 2,
            conflicting_paths: ["src/a.c", "src/b.c"],
          },
        },
        payload: {
          conflict_identities: ["src/a.c", "src/b.c"],
          conflicts_awaiting_operator: 2,
        },
      });

      let view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.sync).toMatchObject({
        status: "blocked",
        staging: {
          epochs_applied: 2,
          epochs_total: 4,
          minor_auto_resolved_count: 3,
          conflicts_awaiting_operator: 2,
          conflicts: ["src/a.c", "src/b.c"],
        },
        pr_reconciliation: {
          total: 2,
          clean: 1,
          auto_resolved: 0,
          needs_operator: 1,
          pushed: 0,
          pending_pushes: 2,
        },
        publish_preview: {
          prior_head: "session-head",
          new_head: "staging-head",
          series_pushes: 2,
        },
      });
      expect(view.available_actions.find((action) => action.action_id === "sync.resolve_conflict")).toMatchObject({
        enabled: true,
        confirmation_required: false,
      });
      expect(view.available_actions.find((action) => action.action_id === "sync.start")?.blocked_by).toContainEqual(
        expect.objectContaining({ code: "sync_staging_awaits_decision" }),
      );
      expect(view.available_actions.find((action) => action.action_id === "sync.recover")?.blocked_by).toContainEqual(
        expect.objectContaining({ code: "sync_conflict_requires_resolution" }),
      );

      sync = transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-sync-resolved",
        correlationId: sync.sync_id,
        expectedRevision: sync.revision,
        patch: {
          status: "reconciling",
          blockers: [],
          staging: { ...staging, epochs_applied: 4 },
          prReconciliation: [
            { series_id: "series-clean", branch: "series/clean", result: "clean", pushed: false },
            { series_id: "series-conflict", branch: "series/conflict", result: "auto_resolved", pushed: false },
          ],
        },
      });
      sync = transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-sync-validating",
        correlationId: sync.sync_id,
        expectedRevision: sync.revision,
        patch: { status: "validating" },
      });
      sync = transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-sync-validated",
        correlationId: sync.sync_id,
        payload: { validation_evidence: { result: "passed" } },
        expectedRevision: sync.revision,
        patch: { status: "validated" },
      });

      view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.available_actions.find((action) => action.action_id === "sync.publish")).toMatchObject({
        enabled: true,
        confirmation_required: true,
      });
      expect(view.available_actions.find((action) => action.action_id === "sync.cancel")).toMatchObject({
        enabled: true,
        confirmation_required: true,
      });

      store.db
        .query("UPDATE sync_state SET staging_json = ? WHERE sync_id = ?")
        .run(JSON.stringify({ ...sync.staging, observed_upstream: "upstream-later" }), sync.sync_id);
      sync = getSyncState(store, sync.sync_id)!;
      view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.sync?.staleness).toMatchObject({
        stale: true,
        validated_upstream: "upstream-new",
        observed_upstream: "upstream-later",
        blocker: null,
      });

      sync = transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-sync-stale",
        correlationId: sync.sync_id,
        expectedRevision: sync.revision,
        patch: {
          status: "blocked",
          blockers: [{
            code: "upstream_moved_after_validation",
            message: "Validated upstream-new, but upstream is now upstream-later.",
            source_kind: "sync",
            source_id: sync.sync_id,
            recoverable: true,
          }],
          staging: { ...sync.staging!, observed_upstream: "upstream-later" },
        },
      });
      view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.sync?.staleness).toMatchObject({
        stale: true,
        validated_upstream: "upstream-new",
        observed_upstream: "upstream-later",
        blocker: { code: "upstream_moved_after_validation" },
        revalidate_action_id: "sync.cancel",
      });
      expect(view.available_actions.find((action) => action.action_id === "sync.publish")?.enabled).toBe(false);
      expect(view.available_actions.find((action) => action.action_id === "sync.recover")?.blocked_by).toContainEqual(
        expect.objectContaining({ code: "sync_cancel_required" }),
      );
      expect(view.available_actions.find((action) => action.action_id === "sync.cancel")?.enabled).toBe(true);

      store.db.query("UPDATE sync_state SET status = 'publishing' WHERE sync_id = ?").run(sync.sync_id);
      view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.available_actions.find((action) => action.action_id === "sync.cancel")?.blocked_by).toContainEqual(
        expect.objectContaining({ code: "sync_publish_committing", recoverable: false }),
      );

      store.db
        .query("UPDATE sync_state SET status = 'published', publication_json = ?, pr_reconciliation_json = ? WHERE sync_id = ?")
        .run(
          JSON.stringify({
            remote_application_id: "remote-sync-staged",
            prior_head: "session-head",
            new_head: "staging-head",
            knowledge_revision: "knowledge-9",
            invalidated_ids: ["target-1"],
          }),
          JSON.stringify([
            { series_id: "series-clean", branch: "series/clean", result: "clean", pushed: true },
            { series_id: "series-conflict", branch: "series/conflict", result: "auto_resolved", pushed: true },
          ]),
          sync.sync_id,
        );
      releaseDispatch(store, {
        actor: "runner",
        commandId: "command-sync-release",
        correlationId: sync.sync_id,
        leaseId: dispatch.leaseId,
        gameId: "melee",
      });
      view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.sync).toMatchObject({
        workflow_id: "sync-staged",
        status: "published",
        pr_reconciliation: { pushed: 2, pending_pushes: 0 },
        publication: {
          remote_application_id: "remote-sync-staged",
          prior_head: "session-head",
          new_head: "staging-head",
          knowledge_revision: "knowledge-9",
          invalidated_ids: ["target-1"],
        },
      });
      expect(view.available_actions.find((action) => action.action_id === "sync.start")).toMatchObject({
        subject_id: "sync:new:melee",
        enabled: true,
      });
    } finally {
      store.db.close();
    }
  });

  test("projects current sync knowledge job progress from durable events", () => {
    const { store } = tempState();
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-sync-knowledge-progress",
        id: "cycle:session-sync-knowledge-progress",
        baseSha: "session-head",
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const sync = recordSyncRequested(store, {
        gameId: "melee",
        cycleUuid: "session-sync-knowledge-progress",
        syncId: "sync-knowledge-progress",
        commandId: "command-sync-knowledge-progress",
        correlationId: "sync-knowledge-progress",
        actor: "external_observer",
        intake: {
          upstream_from: "upstream-old",
          upstream_to: "upstream-new",
          merged_pr_ids: ["301", "302", "303"],
          corpus_batch_ids: ["corpus-progress"],
          knowledge_only: false,
        },
      });

      const appendJobEvent = (
        jobId: string,
        eventType: "knowledge.job_enqueued" | "knowledge.job_processing" | "knowledge.job_succeeded" | "knowledge.job_failed",
      ): void => {
        const commandId = `command-${jobId}-${eventType}`;
        const sourceId = jobId === "knowledge-job-discord" ? "discord-batch-1" : jobId;
        const sourceKind = jobId === "knowledge-job-pr" ? "merged_pr" : "corpus";
        const common = {
          gameId: "melee",
          subjectId: jobId,
          traceId: sync.trace_id,
          actor: "runner" as const,
          causationId: commandId,
          correlationId: sync.sync_id,
          spanId: syncActionSpanId(commandId),
        };
        if (eventType === "knowledge.job_enqueued") {
          appendSyncKnowledgeEventInTransaction(store.db, {
            ...common,
            eventType,
            payload: {
              source_class: "sync_stage",
              provenance: { source_id: sourceId, source_kind: sourceKind },
              execution_class: "sync_stage",
            },
          });
          return;
        }
        const payload = {
          source_class: "sync_stage" as const,
          provenance: { pull_request_id: jobId },
          execution_class: "sync_stage" as const,
          sync_id: sync.sync_id,
          source_id: sourceId,
          source_kind: sourceKind,
          from_status: "processing" as const,
          to_status: eventType.slice("knowledge.job_".length) as "processing" | "succeeded" | "failed",
        };
        if (eventType === "knowledge.job_processing") {
          appendSyncKnowledgeEventInTransaction(store.db, {
            ...common,
            eventType,
            payload: { ...payload, from_status: "queued", to_status: "processing" },
          });
        } else if (eventType === "knowledge.job_succeeded") {
          appendSyncKnowledgeEventInTransaction(store.db, {
            ...common,
            eventType,
            payload: { ...payload, to_status: "succeeded", staged_digest: `sha256:${jobId}` },
          });
        } else {
          appendSyncKnowledgeEventInTransaction(store.db, {
            ...common,
            eventType,
            payload: { ...payload, to_status: "failed", error: "test failure" },
          });
        }
      };

      store.db.exec("BEGIN IMMEDIATE");
      try {
        for (const jobId of ["knowledge-job-pr", "knowledge-job-discord", "knowledge-job-corpus"]) {
          appendJobEvent(jobId, "knowledge.job_enqueued");
          appendJobEvent(jobId, "knowledge.job_processing");
        }
        appendJobEvent("knowledge-job-pr", "knowledge.job_succeeded");
        appendJobEvent("knowledge-job-discord", "knowledge.job_failed");
        store.db.exec("COMMIT");
      } catch (error) {
        store.db.exec("ROLLBACK");
        throw error;
      }

      const view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.sync?.knowledge_jobs).toEqual({
        jobs_total: 3,
        jobs_succeeded: 1,
        jobs_failed: 1,
        jobs_processing: 1,
        prs: {
          jobs_total: 1,
          jobs_succeeded: 1,
          jobs_failed: 0,
          jobs_processing: 0,
        },
        discord: {
          jobs_total: 1,
          jobs_succeeded: 0,
          jobs_failed: 1,
          jobs_processing: 0,
        },
      });
    } finally {
      store.db.close();
    }
  });

  test("projects Discord refresh, staging, and corpus state", () => {
    const { dir, store } = tempState();
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-sync-discord-projection",
        id: "cycle:session-sync-discord-projection",
        baseSha: "session-head",
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });

      const requestSync = (syncId: string) => recordSyncRequested(store, {
        gameId: "melee",
        cycleUuid: "session-sync-discord-projection",
        syncId,
        commandId: `command-${syncId}`,
        correlationId: syncId,
        actor: "external_observer",
        intake: {
          upstream_from: "session-head",
          upstream_to: "session-head",
          merged_pr_ids: [],
          corpus_batch_ids: [],
          knowledge_only: true,
        },
      });
      const appendDiscordEvent = (
        sync: ReturnType<typeof requestSync>,
        eventType: "sync.discord_refresh_requested" | "sync.discord_refresh_completed" | "sync.discord_staged",
        payload: GameEventJsonObject,
        occurredAt: string,
      ) => {
        const causationId = `command-${sync.sync_id}-${eventType}`;
        return appendGameEvent(store.db, {
          eventType,
          gameId: "melee",
          subjectKind: "sync_workflow",
          subjectId: sync.sync_id,
          correlationId: sync.sync_id,
          causationId,
          traceId: sync.trace_id,
          spanId: syncActionSpanId(causationId),
          parentSpanId: null,
          actor: "runner",
          occurredAt,
          payload,
        });
      };

      const legacy = requestSync("sync-discord-legacy");
      expect(buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } }).sync?.discord).toEqual({
        refresh: null,
        staged: null,
        corpus: { batches_done: 0, messages_indexed: 0, through_month: null },
      });

      const manifestPath = defaultBackfillManifestPath(dir, "discord");
      mkdirSync(resolve(manifestPath, ".."), { recursive: true });
      writeFileSync(manifestPath, [
        {
          batch_id: "discord-2026-05",
          source: "discord",
          status: "done",
          attempts: 1,
          updated_at: "2026-08-25T09:00:00.000Z",
          descriptor: { month: "2026-05", message_count: 11 },
        },
        {
          batch_id: "discord-2026-07",
          source: "discord",
          status: "done",
          attempts: 1,
          updated_at: "2026-08-25T09:01:00.000Z",
          descriptor: { month: "2026-07", message_count: 29 },
        },
        {
          batch_id: "discord-2026-08",
          source: "discord",
          status: "failed",
          attempts: 1,
          updated_at: "2026-08-25T09:02:00.000Z",
          descriptor: { month: "2026-08", message_count: 101 },
        },
      ].map((row) => JSON.stringify(row)).join("\n") + "\n");

      const running = legacy;
      appendDiscordEvent(running, "sync.discord_refresh_requested", {}, "2026-08-25T10:00:00.000Z");
      expect(buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } }).sync?.discord).toEqual({
        refresh: { status: "running", detail: null, at: "2026-08-25T10:00:00.000Z", messages_pulled: null },
        staged: null,
        corpus: { batches_done: 2, messages_indexed: 40, through_month: "2026-07" },
      });

      appendDiscordEvent(running, "sync.discord_refresh_completed", {
        ok: true,
        detail: "pulled",
        duration_ms: 25,
        messages_pulled: 17,
      }, "2026-08-25T10:00:01.000Z");
      appendDiscordEvent(running, "sync.discord_staged", {
        batches: 3,
        messages: 17,
        days: 2,
        channels: 4,
        first_message_at: "2026-08-24T10:00:00.000Z",
        last_message_at: "2026-08-25T10:00:00.000Z",
      }, "2026-08-25T10:00:02.000Z");
      expect(buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } }).sync?.discord).toEqual({
        refresh: { status: "ok", detail: "pulled", at: "2026-08-25T10:00:01.000Z", messages_pulled: 17 },
        staged: { batches: 3, messages: 17, days: 2, channels: 4 },
        corpus: { batches_done: 2, messages_indexed: 40, through_month: "2026-07" },
      });

      appendDiscordEvent(running, "sync.discord_refresh_requested", {}, "2026-08-25T11:00:00.000Z");
      appendDiscordEvent(running, "sync.discord_refresh_completed", {
        ok: false,
        detail: "Discord unavailable",
        duration_ms: 10,
        messages_pulled: null,
      }, "2026-08-25T11:00:01.000Z");
      appendDiscordEvent(running, "sync.discord_staged", {
        batches: 0,
        messages: 0,
        days: 0,
        channels: 0,
        first_message_at: null,
        last_message_at: null,
      }, "2026-08-25T11:00:02.000Z");
      expect(buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } }).sync?.discord).toEqual({
        refresh: { status: "failed", detail: "Discord unavailable", at: "2026-08-25T11:00:01.000Z", messages_pulled: null },
        staged: { batches: 0, messages: 0, days: 0, channels: 0 },
        corpus: { batches_done: 2, messages_indexed: 40, through_month: "2026-07" },
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
        { gameId: "melee", repoRoot: dir, stateDir: dir },
        { baseRevision: "base-sha" },
      );
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-stale-run",
        correlationId: run.id,
        kind: "run",
        gameId: "melee",
        reason: "test stale run projection",
        workflowId: run.id,
      });
      if (dispatch.queued) throw new Error("test run lease was unexpectedly queued");
      updateRunStatus(store, run.id, "active", "operator");
      const state = store.db
        .query("SELECT active_workflow_json FROM harness_state WHERE game_id = ?")
        .get("melee") as { active_workflow_json: string };
      store.db
        .query("UPDATE harness_state SET active_workflow_json = ? WHERE game_id = ?")
        .run(
          JSON.stringify({
            ...JSON.parse(state.active_workflow_json),
            heartbeat_at: "2026-08-12T12:00:00.000Z",
          }),
          "melee",
        );
      const now = Date.parse("2026-08-12T12:30:00.000Z");

      const unknown = buildHarnessStateReadModel(store, "melee", {}, { now });
      expect(unknown.available_actions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "process_liveness_unknown" })],
      });

      const notLive = buildHarnessStateReadModel(store, "melee", {}, {
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
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-1",
        id: "cycle:session-1",
        baseSha: "base-sha",
      });
      const campaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
      for (let index = 0; index < 25; index += 1) {
        const savePoint = addSavePoint(store, {
          campaignId: campaign.id,
          triggerKind: "manual",
          label: index === 0 ? "named anchor" : null,
          commitSha: `commit-${index}`,
        });
        recordSavePointAnchor(store, {
          gameId: "melee",
          savePointId: savePoint.id,
          commitSha: `commit-${index}`,
          triggerKind: "manual",
          commandId: `command-save-${index}`,
          correlationId: "session-1",
          actor: "operator",
        });
      }

      const view = buildHarnessStateReadModel(store, "melee", {
        aheadOfBase: 4,
        head: { dirty: false },
      });
      expect(view.cycle?.timeline).toHaveLength(20);
      expect(view.cycle?.save_point_stale).toBe(true);
      expect(view.available_actions.find((action) => action.action_id === "cycle.close")).toMatchObject({
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
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-1",
        id: "cycle:session-1",
        baseSha: "head-1",
      });
      const campaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
      const savePoint = addSavePoint(store, {
        campaignId: campaign.id,
        triggerKind: "manual",
        label: "fresh anchor",
        commitSha: "head-1",
      });
      recordSavePointAnchor(store, {
        gameId: "melee",
        savePointId: savePoint.id,
        commitSha: "head-1",
        triggerKind: "manual",
        commandId: "command-save-fresh",
        correlationId: "session-1",
        actor: "operator",
      });

      const dirty = buildHarnessStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: true },
      });
      expect(dirty.cycle?.save_point_stale).toBe(true);
      expect(dirty.available_actions.find((action) => action.action_id === "cycle.close")?.enabled).toBe(false);

      const clean = buildHarnessStateReadModel(store, "melee", {
        aheadOfBase: 4,
        head: { dirty: false },
      });
      expect(clean.cycle?.save_point_stale).toBe(false);
      expect(clean.available_actions.find((action) => action.action_id === "cycle.close")).toMatchObject({
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
        gameId: "melee",
        triggerKind: "checkpoint",
        sourceKind: "save_point_boundary",
        sourceId: "checkpoint",
        message: "capture unavailable",
        commandId: "command-spooled-failure",
        correlationId: "command-spooled-failure",
        actor: "operator",
      }, store);
      expect(failure.storage).toBe("spool");

      const view = buildHarnessStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: false },
      });
      expect(view.save_point_stale).toBe(true);
      expect(view.cycle_blockers).toContainEqual(expect.objectContaining({ code: "save_point_failed" }));
      expect(view.available_actions.find((action) => action.action_id === "cycle.close")?.blocked_by).toContainEqual(
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
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      runId = run.id;
      const oldEpoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: oldEpoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "old_fn", sourcePath: "src/old.c", size: 64, fuzzy: 91 }],
        workerPoolSize: 1,
      });
      closeSchedulerEpoch(store, oldEpoch.id, { status: "completed" });
      const activeEpoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: activeEpoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "active_fn", sourcePath: "src/active.c", size: 64, fuzzy: 90 }],
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
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          { kind: "function", unit: "unit", symbol: "timeout_fn", sourcePath: "src/timeout.c", size: 64, fuzzy: 91 },
          { kind: "function", unit: "unit", symbol: "recovered_fn", sourcePath: "src/recovered.c", size: 64, fuzzy: 91 },
          { kind: "function", unit: "unit", symbol: "session_failed_fn", sourcePath: "src/session_failed.c", size: 64, fuzzy: 91 },
          { kind: "function", unit: "unit", symbol: "validation_fn", sourcePath: "src/validation.c", size: 64, fuzzy: 91 },
          { kind: "function", unit: "unit", symbol: "tool_fn", sourcePath: "src/tool.c", size: 64, fuzzy: 91 },
          { kind: "function", unit: "unit", symbol: "banked_fn", sourcePath: "src/banked.c", size: 64, fuzzy: 91 },
          { kind: "function", unit: "unit", symbol: "budget_fn", sourcePath: "src/budget.c", size: 64, fuzzy: 91 },
        ],
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

      const budgetClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-budget", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: budgetClaim!.workerStateId,
        lifecycleStatus: "finished",
        summary: {
          continuation_attempts: {
            stop_reason: "attempt_budget_exhausted",
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
    expect(counts.attempt_budget_exhausted).toBe(1);
  });

  test("scopes active claim activity to the current recycled claim window", async () => {
    const { dir, store } = tempState();
    let runId = "";
    let workerStateId = "";
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 91 }],
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

    let syncObservationRefreshes = 0;
    const { runDashboard, workerStateTrace } = createDashboardReadModel({
      buildPrRecordsView: () => ({}),
      campaignStatus: () => ({ baseSha: "observed-head" }),
      processStatus: () => ({}),
      refreshSyncUpstreamObservation: async () => { syncObservationRefreshes += 1; },
    });
    const dashboard = await runDashboard({ game: null, repoRoot: dir, stateDir: dir, graphDbPath: "", usePathOverrides: true });
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
    expect(syncObservationRefreshes).toBe(1);
  });
});
