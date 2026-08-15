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
} from "@server/core/cycle-runtime/run-state";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { createCycle, recordSavePointAnchor, recordSavePointFailureDurably } from "@server/core/cycle";
import { initializeHarnessState, releaseDispatch, requestDispatch } from "@server/core/harness-state";
import { addSavePoint, ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state";
import {
  activateAcquiredPrCampaign,
  ingestPrFeedback,
  openPrCampaign,
  transitionPrSeries,
} from "@server/core/cycle-runtime/phases/pr/campaign";
import { getSyncState, recordSyncRequested, transitionSync } from "@server/core/cycle-runtime/phases/sync";
import {
  buildHarnessStateReadModel,
  createDashboardReadModel,
  getHarnessStateView,
  gameRunActionState,
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
  test("canonical HarnessStateView always projects the 21 actions and isolates compatibility actions", () => {
    const { store } = tempState();
    try {
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const view = getHarnessStateView(store, "melee");
      expect(view.game_id).toBe("melee");
      expect(view.harness_revision).toBe(0);
      expect(view.run).toBeNull();
      expect(view.pr_work).toEqual([]);
      expect(view.knowledge).toMatchObject({ queued: 0, processing: 0, waiting: 0, failed: 0, active_lease: null });
      expect(view.available_actions).toHaveLength(21);
      expect(view.available_actions.map((action) => action.action_id)).toEqual([
        "run.start", "run.pause", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
        "pr.open_campaign", "pr.activate", "pr.publish_batch", "pr.release", "pr.close_campaign", "pr.abandon_campaign", "pr.campaign_recover",
        "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
        "cycle.save_point", "cycle.close", "knowledge.process",
      ]);
      expect(view.available_actions.every((action) => action.confirmation_required === [
        "run.hard_stop", "run.cancel", "run.recover", "pr.publish_batch", "pr.close_campaign", "pr.abandon_campaign", "pr.campaign_recover",
        "sync.publish", "sync.cancel", "sync.recover", "cycle.close",
      ].includes(action.action_id))).toBeTrue();
      expect(view.available_actions.find((action) => action.action_id === "run.start")?.blocked_by).toEqual([
        expect.objectContaining({ code: "run_not_found" }),
      ]);
      expect(view.available_actions.find((action) => action.action_id === "knowledge.process")?.blocked_by).toEqual([
        expect.objectContaining({ code: "knowledge_queue_empty" }),
      ]);
      expect(view.compatibility_actions).toHaveLength(1);
      expect(view.compatibility_actions[0]?.action_id).toBe("pr.adopt_legacy");
      expect(view.available_actions.some((action) => action.action_id === "pr.adopt_legacy")).toBeFalse();
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
        "run.pause",
        "run.resume",
        "run.hard_stop",
        "run.cancel",
        "run.recover",
        "pr.open_campaign",
        "pr.activate",
        "pr.publish_batch",
        "pr.release",
        "pr.close_campaign",
        "pr.abandon_campaign",
        "pr.campaign_recover",
        "pr.adopt_legacy",
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
        expected_transition: "requested → ingesting after run drains",
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

  test("projects the durable PR campaign, next batch, feedback queue, activation, and canonical actions", () => {
    const { store } = tempState();
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-pr",
        id: "cycle:session-pr",
        baseSha: "source-head",
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const legacyCampaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
      const savePoint = addSavePoint(store, {
        campaignId: legacyCampaign.id,
        triggerKind: "manual",
        label: "campaign source",
        commitSha: "source-head",
      });
      recordSavePointAnchor(store, {
        actor: "operator",
        commandId: "command-pr-anchor",
        correlationId: "session-pr",
        commitSha: "source-head",
        gameId: "melee",
        savePointId: savePoint.id,
        triggerKind: "manual",
      });
      const campaign = openPrCampaign(store, {
        actor: "operator",
        campaignId: "pr-campaign-dashboard",
        commandId: "command-pr-open",
        correlationId: "pr-campaign-dashboard",
        namedSavePointId: savePoint.id,
        gameId: "melee",
        publicationPolicy: { batch_size: 2 },
        series: [
          {
            batchIndex: 0,
            branch: "codex/split-01-alpha",
            seriesId: "series-alpha",
            targetUnits: ["src/alpha.c"],
            lastValidation: {
              result: "clean",
              source_revision: "source-head",
              validated_at: "2026-08-13T12:00:00.000Z",
            },
          },
          {
            batchIndex: 1,
            branch: "codex/split-02-beta",
            seriesId: "series-beta",
            targetUnits: ["src/beta.c"],
            lastValidation: {
              result: "clean",
              source_revision: "source-head",
              validated_at: "2026-08-13T12:01:00.000Z",
            },
          },
          {
            batchIndex: 1,
            branch: "codex/split-03-gamma",
            seriesId: "series-gamma",
            targetUnits: ["src/gamma.c"],
          },
        ],
        cycleUuid: "session-pr",
      });
      const dispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-pr-dispatch",
        correlationId: campaign.campaign_id,
        kind: "pr",
        gameId: "melee",
        reason: "work the campaign",
        workflowId: campaign.campaign_id,
      });
      if (dispatch.queued) throw new Error("test PR lease was unexpectedly queued");
      activateAcquiredPrCampaign({
        campaignId: campaign.campaign_id,
        commandId: "command-pr-activate",
        correlationId: campaign.campaign_id,
        leaseId: dispatch.leaseId,
        gameId: "melee",
        store,
      });
      const published = transitionPrSeries(store, "series-alpha", {
        actor: "operator",
        commandId: "command-publish-alpha",
        correlationId: campaign.campaign_id,
        eventType: "pr.series_published",
        expectedRevision: 0,
        patch: { status: "published", upstreamPrNumber: 2850 },
        payload: {
          upstream_pr_number: 2850,
          branch: "codex/split-01-alpha",
          batch_index: 0,
        },
      });
      expect(published.status).toBe("published");
      const feedback = ingestPrFeedback(store, {
        commandId: "observation-alpha-review",
        correlationId: campaign.campaign_id,
        expectedRevision: published.revision,
        items: [{
          itemId: "work-item-alpha",
          sourceKind: "review_comment",
          sourceId: "review-comment-1",
          summary: "Use the game typedef.",
        }],
        seriesId: published.series_id,
      });
      expect(feedback.series).toMatchObject({
        revision: published.revision + 2,
        status: "changes_requested",
      });

      const view = buildHarnessStateReadModel(store, "melee", {
        aheadOfBase: 0,
        head: { dirty: false },
      });

      expect(view.pr).toMatchObject({
        workflow_id: "pr-campaign-dashboard",
        status: "working",
        source_anchor: {
          save_point_id: savePoint.id,
          source_revision: "source-head",
        },
        publication_policy: { batch_size: 2 },
        activation: {
          active: true,
          queued: false,
          lease_id: dispatch.leaseId,
          status: "active",
        },
        next_batch: {
          batch_index: 1,
          series_ids: ["series-beta", "series-gamma"],
          validation_state: "blocked",
          blockers: [expect.objectContaining({ code: "pr_series_not_validated", source_id: "series-gamma" })],
        },
        pending_work_items: {
          count: 1,
          items: [{
            item_id: "work-item-alpha",
            series_id: "series-alpha",
            series_branch: "codex/split-01-alpha",
            status: "pending",
            summary: "Use the game typedef.",
            source_kind: "review_comment",
            source_id: "review-comment-1",
            resolved_at: null,
            created_at: expect.any(String),
          }],
        },
      });
      expect(view.pr?.series_by_status.changes_requested).toEqual([
        expect.objectContaining({ series_id: "series-alpha", upstream_pr_number: 2850 }),
      ]);
      expect(view.pr?.series_by_status.prepared.map((series) => series.series_id)).toEqual([
        "series-beta",
        "series-gamma",
      ]);
      expect(view.available_actions.find((action) => action.action_id === "pr.open_campaign")).toMatchObject({
        enabled: false,
        confirmation_required: false,
        blocked_by: [expect.objectContaining({ code: "pr_campaign_open" })],
      });
      expect(view.available_actions.find((action) => action.action_id === "pr.activate")).toMatchObject({
        enabled: false,
        confirmation_required: false,
        blocked_by: [expect.objectContaining({ code: "pr_already_active" })],
      });
      expect(view.available_actions.find((action) => action.action_id === "pr.publish_batch")).toMatchObject({
        enabled: false,
        confirmation_required: true,
        blocked_by: [expect.objectContaining({ code: "pr_series_not_validated" })],
      });
      expect(view.available_actions.find((action) => action.action_id === "pr.release")).toMatchObject({
        enabled: true,
        confirmation_required: false,
      });
      expect(view.available_actions.find((action) => action.action_id === "pr.close_campaign")).toMatchObject({
        enabled: false,
        confirmation_required: true,
      });
      expect(
        view.available_actions.find((action) => action.action_id === "pr.close_campaign")?.blocked_by,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ code: "pr_series_not_terminal" })]));
      expect(view.available_actions.find((action) => action.action_id === "pr.abandon_campaign")).toMatchObject({
        enabled: true,
        confirmation_required: true,
      });
      expect(view.available_actions.find((action) => action.action_id === "pr.campaign_recover")).toMatchObject({
        enabled: false,
        confirmation_required: true,
      });
      expect(view.available_actions.find((action) => action.action_id === "pr.adopt_legacy")).toMatchObject({
        enabled: false,
        confirmation_required: false,
      });
    } finally {
      store.db.close();
    }
  });

  test("projects campaign opening, legacy adoption, run-drain activation, and stale activation recovery", () => {
    const { dir, store } = tempState();
    try {
      createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "session-pr-actions",
        id: "cycle:session-pr-actions",
        baseSha: "source-head",
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const legacyCampaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
      const savePoint = addSavePoint(store, {
        campaignId: legacyCampaign.id,
        triggerKind: "manual",
        label: "campaign source",
        commitSha: "source-head",
      });
      recordSavePointAnchor(store, {
        actor: "operator",
        commandId: "command-actions-anchor",
        correlationId: "session-pr-actions",
        commitSha: "source-head",
        gameId: "melee",
        savePointId: savePoint.id,
        triggerKind: "manual",
      });
      writeActivityLog(resolve(dir, "pr_handoff/pr_records.json"), [{
        schemaVersion: "session_pr_records_v2",
        records: [{ branch: "codex/split-01-alpha", prNumber: 2850 }],
      }]);

      let view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.pr).toBeNull();
      expect(view.available_actions.find((action) => action.action_id === "pr.open_campaign")).toMatchObject({
        enabled: true,
        confirmation_required: false,
      });
      expect(view.available_actions.find((action) => action.action_id === "pr.adopt_legacy")).toMatchObject({
        enabled: true,
        confirmation_required: false,
      });

      const campaign = openPrCampaign(store, {
        actor: "operator",
        campaignId: "pr-campaign-actions",
        commandId: "command-actions-open",
        correlationId: "pr-campaign-actions",
        namedSavePointId: savePoint.id,
        gameId: "melee",
        series: [{
          batchIndex: 0,
          branch: "codex/split-01-actions",
          seriesId: "series-actions",
          targetUnits: ["src/actions.c"],
        }],
        cycleUuid: "session-pr-actions",
      });
      const durableRun = createRun(
        store,
        "matched_code_percent",
        100,
        1,
        { gameId: "melee" },
        { baseRevision: "source-head", cycleUuid: "session-pr-actions" },
      );
      const runDispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-actions-run",
        correlationId: durableRun.id,
        kind: "run",
        gameId: "melee",
        reason: "test drain projection",
        workflowId: durableRun.id,
      });
      if (runDispatch.queued) throw new Error("test run lease was unexpectedly queued");
      view = buildHarnessStateReadModel(store, "melee", { aheadOfBase: 0, head: { dirty: false } });
      expect(view.available_actions.find((action) => action.action_id === "pr.activate")).toMatchObject({
        enabled: true,
        expected_transition: "preparing/in_review → working after run drains",
        confirmation_required: false,
      });

      releaseDispatch(store, {
        actor: "operator",
        commandId: "command-actions-run-release",
        correlationId: durableRun.id,
        leaseId: runDispatch.leaseId,
        gameId: "melee",
      });
      const prDispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-actions-pr",
        correlationId: campaign.campaign_id,
        kind: "pr",
        gameId: "melee",
        reason: "test recovery projection",
        workflowId: campaign.campaign_id,
      });
      if (prDispatch.queued) throw new Error("test PR lease was unexpectedly queued");
      activateAcquiredPrCampaign({
        campaignId: campaign.campaign_id,
        commandId: "command-actions-activate",
        correlationId: campaign.campaign_id,
        leaseId: prDispatch.leaseId,
        gameId: "melee",
        store,
      });
      const row = store.db
        .query("SELECT active_workflow_json FROM harness_state WHERE game_id = ?")
        .get("melee") as { active_workflow_json: string };
      store.db
        .query("UPDATE harness_state SET active_workflow_json = ? WHERE game_id = ?")
        .run(
          JSON.stringify({
            ...JSON.parse(row.active_workflow_json),
            heartbeat_at: "2026-08-13T12:00:00.000Z",
          }),
          "melee",
        );
      view = buildHarnessStateReadModel(
        store,
        "melee",
        { aheadOfBase: 0, head: { dirty: false } },
        { now: "2026-08-13T12:30:00.000Z" },
      );
      expect(view.available_actions.find((action) => action.action_id === "pr.campaign_recover")).toMatchObject({
        enabled: true,
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
      expect(activeView.available_actions.find((action) => action.action_id === "run.pause")?.enabled).toBe(true);
      expect(activeView.available_actions.find((action) => action.action_id === "run.hard_stop")?.enabled).toBe(true);

      const failed = updateRunStatus(store, active.id, "failed", "runner");
      const failedState = gameRunActionState(store, "melee", { runId: active.id });
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
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
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
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
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
