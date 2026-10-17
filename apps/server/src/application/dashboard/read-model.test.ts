import { getHarnessState, initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  recordWorkerCheckpoint,
  setRunSchedulerCondition,
  startSchedulerEpoch,
  transitionRun,
  updateRunStatus,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { addSavePoint, ensureCampaign } from "@server/core/harness-runtime/phases/pr/state";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { recordReadinessArtifact } from "@server/core/harness-runtime/phases/running/scheduler/readiness.js";
import { clearUnverifiedMatch, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { recordSteeringBackfill, recordSteeringCoverage, recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { initializeDispatchState, releaseDispatch, requestDispatch } from "@server/core/harness-state";
import { appendGameEvent, type JsonObject as GameEventJsonObject } from "@server/core/harness-state/events";
import {
  getSyncState,
  recordSyncRequested,
  syncActionSpanId,
  transitionSync,
} from "@server/core/harness-runtime/phases/sync";
import {
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

function seedHarnessState(store: StateStore, gameId: string, input: { head?: string; runId?: string; syncId?: string } = {}): void {
  initializeHarnessState(store.db, {
    gameId, worktree: store.stateDir, configurationRevision: "test-config", commandId: "init-harness",
  });
  transitionHarnessState(store.db, {
    gameId, expectedRevision: 0, commandId: "seed-harness",
    patch: { readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" }, source: { head: input.head ?? "base-sha" }, history: { run_id: input.runId ?? null, sync_id: input.syncId ?? null } },
  });
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

let runEventOrdinal = 0;

function writeRunEvent(
  store: StateStore,
  runId: string,
  eventType: string,
  createdAt: string,
  payload: Record<string, unknown>,
): void {
  runEventOrdinal += 1;
  store.db
    .query(
      `INSERT INTO events (id, run_id, event_type, producer, payload_json, handled_at, created_at)
       VALUES (?, ?, ?, 'run-loop', ?, ?, ?)`,
    )
    .run(`dashboard-run-event-${runEventOrdinal}`, runId, eventType, JSON.stringify(payload), createdAt, createdAt);
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("dashboard read model", () => {
  test("reads harness ownership and no-change boundaries without mutating or mixing games", () => {
    const { store } = tempState();
    try {
      for (const gameId of ["melee", "other"]) {
        initializeHarnessState(store.db, { gameId, worktree: `/games/${gameId}/workspace/checkout`, configurationRevision: "config", commandId: "init" });
        transitionHarnessState(store.db, { gameId, expectedRevision: 0, commandId: "sync", patch: { source: { head: "head" } }, boundary: { eventId: `${gameId}-sync`, kind: "sync_completed", outcome: "no_source_change", evidence: { freshness: "missing" } } });
      }
      const before = store.db.query("SELECT COUNT(*) AS n FROM harness_commands").get();
      const view = getHarnessStateView(store, "melee");
      expect(view.state?.source.worktree).toBe("/games/melee/workspace/checkout");
      expect(view.state?.execution.desired).toBe("paused");
      expect(view.timeline.map((entry) => entry.identity.event_id)).toEqual(["melee-sync"]);
      expect(view.timeline[0]?.outcome).toBe("no_source_change");
      expect(view.timeline[0]?.evidence?.freshness).toBe("missing");
      expect(view.available_actions.some((action) => action.action_id.startsWith("cycle."))).toBe(false);
      expect(store.db.query("SELECT COUNT(*) AS n FROM harness_commands").get()).toEqual(before);
    } finally { store.db.close(); }
  });
  test("gate off (Melee): a current board with no numeric score falls back to the baseline score, as before the gate", () => {
    const { store } = tempState();
    try {
      seedHarnessState(store, "melee");
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee" }, { baseRevision: "base-sha" });
      recordDashboardArtifact(store, { runId: run.id, artifactType: "board_snapshot", artifactKey: "initial", payload: { measures: { matched_code_percent: 72.5 } } });
      recordDashboardArtifact(store, { runId: run.id, artifactType: "board_snapshot", artifactKey: "current", payload: { measures: { complete_units: 3 } } });
      expect(getHarnessStateView(store, "melee").run?.progress).toMatchObject({ baseline_score: 72.5, confirmed_score: 72.5 });
    } finally { store.db.close(); }
  });
  test("canonical HarnessStateView excludes retired cycle controls", () => {
    const { store } = tempState();
    try {
      initializeDispatchState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const view = getHarnessStateView(store, "melee");
      expect(view.game_id).toBe("melee");
      expect(view.harness_revision).toBe(0);
      expect(view.run).toBeNull();
      expect(view).not.toHaveProperty("pr_work");
      expect(view).not.toHaveProperty("cycle");
      expect(view.knowledge).toMatchObject({ queued: 0, processing: 0, waiting: 0, failed: 0, active_lease: null });
      expect(view.available_actions).toHaveLength(11);
      expect(view.available_actions.map((action) => action.action_id)).toEqual([
        "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
        "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
        "knowledge.process",
      ]);
      expect(view.available_actions.every((action) => action.confirmation_required === [
        "run.hard_stop", "run.cancel", "run.recover",
        "sync.publish", "sync.cancel", "sync.recover",
      ].includes(action.action_id))).toBeTrue();
      expect(view.available_actions.find((action) => action.action_id === "run.start")?.blocked_by).toEqual([
        expect.objectContaining({ code: "run_not_found" }),
      ]);
      expect(view.available_actions.find((action) => action.action_id === "knowledge.process")?.blocked_by).toEqual([
        expect.objectContaining({ code: "knowledge_queue_empty" }),
      ]);
      expect(view).not.toHaveProperty("compatibility_actions");
      expect(view.repo_sync).toEqual({
        head: null,
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

  test("selects the harness run reference instead of the newest run", () => {
    const { store } = tempState();
    try {
      seedHarnessState(store, "melee", { head: "selected-head" });
      seedHarnessState(store, "other", { head: "newer-head" });
      const selected = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee" }, { baseRevision: "selected-head" });
      createRun(store, "matched_code_percent", 100, 1, { gameId: "other" }, { baseRevision: "newer-head" });
      expect(getHarnessStateView(store, "melee").run?.workflow_id).toBe(selected.id);
      expect(getHarnessStateView(store, "uninitialized").run).toBeNull();
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
    git("commit", "--allow-empty", "-q", "-m", "checkout head");
    const checkoutHead = git("rev-parse", "HEAD");
    git("commit", "--allow-empty", "-q", "-m", "upstream one");
    git("commit", "--allow-empty", "-q", "-m", "upstream two");
    const upstreamSha = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/master", upstreamSha);
    // Leave the checkout behind the upstream ref: HEAD is the observed truth.
    git("reset", "-q", "--hard", checkoutHead);

    const { store } = tempState();
    try {
      seedHarnessState(store, "melee", { head: "feedfacefeedfacefeedfacefeedfacefeedface" });
      transitionHarnessState(store.db, {
        gameId: "melee", expectedRevision: 1, commandId: "sync-completed", now: "2026-08-19T00:00:00.000Z",
        patch: { source: { worktree: repoRoot, upstream_revision: upstreamSha } },
        boundary: { eventId: "sync-completed", kind: "sync_completed", outcome: "source_updated" },
      });
      const gameContext = { game: { baseRef: "origin/master" }, repoRoot } as unknown as Parameters<
        typeof repoSyncProjection
      >[2];
      expect(repoSyncProjection(store, "melee", gameContext)).toEqual({
        head: checkoutHead,
        upstream_ref: "origin/master",
        upstream_anchor: upstreamSha,
        local_upstream_sha: upstreamSha,
        behind_count: 2,
        last_synced_at: "2026-08-19T00:00:00.000Z",
        needs_sync: true,
      });
      transitionHarnessState(store.db, {
        gameId: "melee", expectedRevision: 2, commandId: "worktree-unavailable",
        patch: { source: { worktree: join(repoRoot, "does-not-exist"), head: null } },
      });
      // Git failure leaves checkout observations unknown.
      expect(repoSyncProjection(store, "melee", {
        game: { baseRef: "origin/master" },
        repoRoot: join(repoRoot, "does-not-exist"),
      } as unknown as Parameters<typeof repoSyncProjection>[2])).toEqual({
        head: null,
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

  test("projects the canonical run summary, action inventory, blockers, and recovery points", () => {
    const { store } = tempState();
    try {
      initializeDispatchState(store, { gameId: "melee", traceId: "trace-game-melee" });
      seedHarnessState(store, "melee");
      const ready = createRun(
        store,
        "matched_code_percent",
        100,
        3,
        { gameId: "melee" },
        { baseRevision: "base-sha" },
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

      const activeView = getHarnessStateView(store, "melee");
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
        provider_circuit: null,
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
      const recoveredView = getHarnessStateView(store, "melee");
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
        .query("SELECT active_workflow_json FROM dispatch_state WHERE game_id = ?")
        .get("melee") as { active_workflow_json: string }).active_workflow_json;
      store.db
        .query("UPDATE dispatch_state SET active_workflow_json = ? WHERE game_id = ?")
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

  test("projects provider circuit open, probe, and closed state in both run summaries", async () => {
    const { dir, store } = tempState();
    let runId = "";
    try {
      seedHarnessState(store, "test", { head: "base-test" });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      runId = run.id;
      writeRunEvent(store, runId, "provider_circuit_opened", "2026-09-15T17:55:00.000Z", {
        state: "open",
        opened_at: "2026-09-15T17:55:00.000Z",
        next_probe_at: "2026-09-15T17:56:00.000Z",
        probe_interval_seconds: 60,
        outage_count: 6,
        provider: "codex-lb",
        model: "gpt-5",
      });
      // Camel-case aliases cover payload evolution without changing the projection.
      writeRunEvent(store, runId, "provider_probe", "2026-09-15T17:56:00.000Z", {
        state: "open",
        openedAt: "2026-09-15T17:55:00.000Z",
        nextProbeAt: "2026-09-15T17:58:00.000Z",
        probeIntervalSeconds: 120,
        outageCount: 6,
        provider: "codex-lb",
        model: "gpt-5",
        probedAt: "2026-09-15T17:56:00.000Z",
        success: false,
        errorMessage: "server_is_overloaded",
      });

      expect(gameRunActionState(store, "test", { runId }).run?.provider_circuit).toEqual({
        state: "open",
        status: "waiting_for_provider",
        opened_at: "2026-09-15T17:55:00.000Z",
        next_probe_at: "2026-09-15T17:58:00.000Z",
        probe_interval_seconds: 120,
        outage_count: 6,
        provider: "codex-lb",
        model: "gpt-5",
        last_probe: {
          at: "2026-09-15T17:56:00.000Z",
          success: false,
          error: "server_is_overloaded",
        },
      });
    } finally {
      store.db.close();
    }

    const { runDashboard } = createDashboardReadModel({
      buildPrRecordsView: () => ({}),
      campaignStatus: () => ({}),
      processStatus: () => ({}),
    });
    const paths = {
      game: { gameId: "test", baseRef: "origin/master" },
      repoRoot: dir,
      stateDir: dir,
      graphDbPath: "",
      usePathOverrides: true,
    } as Parameters<typeof runDashboard>[0];
    const openDashboard = await runDashboard(paths);
    expect((openDashboard.runSummary as JsonObject).providerCircuit).toEqual({
      state: "open",
      status: "waiting_for_provider",
      openedAt: "2026-09-15T17:55:00.000Z",
      nextProbeAt: "2026-09-15T17:58:00.000Z",
      probeIntervalSeconds: 120,
      outageCount: 6,
      provider: "codex-lb",
      model: "gpt-5",
      lastProbe: {
        at: "2026-09-15T17:56:00.000Z",
        success: false,
        error: "server_is_overloaded",
      },
    });

    const reopened = openState(dir);
    try {
      writeRunEvent(reopened, runId, "provider_circuit_closed", "2026-09-15T17:57:00.000Z", {
        state: "closed",
        opened_at: "2026-09-15T17:55:00.000Z",
        next_probe_at: null,
        probe_interval_seconds: 120,
        outage_count: 6,
        provider: "codex-lb",
        model: "gpt-5",
      });
      expect(gameRunActionState(reopened, "test", { runId }).run?.provider_circuit).toMatchObject({
        state: "closed",
        status: "available",
        next_probe_at: null,
        last_probe: { success: false },
      });
    } finally {
      reopened.db.close();
    }

    const closedDashboard = await runDashboard(paths);
    expect(((closedDashboard.runSummary as JsonObject).providerCircuit as JsonObject)).toMatchObject({
      state: "closed",
      status: "available",
      nextProbeAt: null,
      lastProbe: { success: false },
    });
  });

  test("projects sync staging, conflict, validation, staleness, publication, and shared action decisions", () => {
    const { store } = tempState();
    try {
      initializeDispatchState(store, { gameId: "melee", traceId: "trace-game-melee" });
      seedHarnessState(store, "melee", { head: "session-head", syncId: "sync-staged" });
      let sync = recordSyncRequested(store, {
        gameId: "melee",
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
        commits_behind: 4,
        minor_conflicts_resolved: 3,
        conflicts_awaiting_operator: 0,
        harness_head_sha: "session-head",
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

      let view = getHarnessStateView(store, "melee");
      expect(view.sync).toMatchObject({
        status: "blocked",
        staging: {
          commits_behind: 4,
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
          staging: { ...staging, last_durable_stage: "harness_merged" },
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

      view = getHarnessStateView(store, "melee");
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
      view = getHarnessStateView(store, "melee");
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
      view = getHarnessStateView(store, "melee");
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
      view = getHarnessStateView(store, "melee");
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
            knowledge_intake: {
              fetched_prs: [11],
              skipped_prs: [10],
              ingest: {
                reconcile: { renames: { applied: 2 } },
                prs: { tasksEnqueued: 3 },
                discord: { tasksEnqueued: 1 },
                attempts: { tasksEnqueued: 0 },
              },
            },
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
      view = getHarnessStateView(store, "melee");
      expect(view.sync).toMatchObject({
        workflow_id: "sync-staged",
        status: "published",
        pr_reconciliation: { pushed: 2, pending_pushes: 0 },
        publication: {
          remote_application_id: "remote-sync-staged",
          prior_head: "session-head",
          new_head: "staging-head",
          knowledge_intake: {
            fetched_prs: 1,
            skipped_prs: 1,
            renames_applied: 2,
            tasks_enqueued: 4,
            lanes: ["reconcile", "prs", "discord", "attempts"],
          },
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

  test("projects Discord refresh state", () => {
    const { store } = tempState();
    try {
      initializeDispatchState(store, { gameId: "melee", traceId: "trace-game-melee" });

      const requestSync = (syncId: string) => recordSyncRequested(store, {
        gameId: "melee",
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
        eventType: "sync.discord_refresh_requested" | "sync.discord_refresh_completed",
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

      seedHarnessState(store, "melee", { head: "session-head", syncId: "sync-discord-legacy" });
      const legacy = requestSync("sync-discord-legacy");
      expect(getHarnessStateView(store, "melee").sync?.discord).toEqual({
        refresh: null,
      });

      const running = legacy;
      appendDiscordEvent(running, "sync.discord_refresh_requested", {}, "2026-08-25T10:00:00.000Z");
      expect(getHarnessStateView(store, "melee").sync?.discord).toEqual({
        refresh: { status: "running", detail: null, at: "2026-08-25T10:00:00.000Z", messages_pulled: null },
      });

      appendDiscordEvent(running, "sync.discord_refresh_completed", {
        ok: true,
        detail: "pulled",
        duration_ms: 25,
        messages_pulled: 17,
      }, "2026-08-25T10:00:01.000Z");
      expect(getHarnessStateView(store, "melee").sync?.discord).toEqual({
        refresh: { status: "ok", detail: "pulled", at: "2026-08-25T10:00:01.000Z", messages_pulled: 17 },
      });

      appendDiscordEvent(running, "sync.discord_refresh_requested", {}, "2026-08-25T11:00:00.000Z");
      appendDiscordEvent(running, "sync.discord_refresh_completed", {
        ok: false,
        detail: "Discord unavailable",
        duration_ms: 10,
        messages_pulled: null,
      }, "2026-08-25T11:00:01.000Z");
      expect(getHarnessStateView(store, "melee").sync?.discord).toEqual({
        refresh: { status: "failed", detail: "Discord unavailable", at: "2026-08-25T11:00:01.000Z", messages_pulled: null },
      });
    } finally {
      store.db.close();
    }
  });

  test("projects unknown process liveness as a recovery blocker for an expired run lease", () => {
    const { dir, store } = tempState();
    try {
      seedHarnessState(store, "melee");
      const run = createRun(
        store,
        "matched_code_percent",
        100,
        1,
        { gameId: "melee", repoRoot: dir, stateDir: dir },
        { baseRevision: "base-sha" },
      );
      initializeDispatchState(store, { gameId: "melee", traceId: "trace-game-melee" });
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
        .query("SELECT active_workflow_json FROM dispatch_state WHERE game_id = ?")
        .get("melee") as { active_workflow_json: string };
      store.db
        .query("UPDATE dispatch_state SET active_workflow_json = ? WHERE game_id = ?")
        .run(
          JSON.stringify({
            ...JSON.parse(state.active_workflow_json),
            heartbeat_at: "2026-08-12T12:00:00.000Z",
          }),
          "melee",
        );
      const now = Date.parse("2026-08-12T12:30:00.000Z");

      const unknown = getHarnessStateView(store, "melee", { now });
      expect(unknown.available_actions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "process_liveness_unknown" })],
      });

      const notLive = getHarnessStateView(store, "melee", {
        hasActiveProcess: () => ({ active: false }),
        now,
      });
      expect(notLive.available_actions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: true,
        blocked_by: [],
      });

      const live = getHarnessStateView(store, "melee", {
        hasActiveProcess: () => ({ active: true }),
        now,
      });
      expect(live.available_actions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: false,
        blocked_by: [
          expect.objectContaining({ code: "run_not_failed" }),
          expect.objectContaining({ code: "dispatch_lease_not_stale" }),
        ],
      });
    } finally {
      store.db.close();
    }
  });

  test("projects lease-free run recovery from scheduler process liveness", () => {
    const { store } = tempState();
    try {
      seedHarnessState(store, "melee");
      initializeDispatchState(store, { gameId: "melee", traceId: "trace-game-melee" });

      const paused = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee" }, { baseRevision: "base-sha" });
      const pausedDispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-paused-run",
        correlationId: paused.id,
        kind: "run",
        gameId: "melee",
        reason: "test paused lease-free recovery",
        workflowId: paused.id,
      });
      if (pausedDispatch.queued) throw new Error("test paused run lease was unexpectedly queued");
      updateRunStatus(store, paused.id, "active", "operator");
      updateRunStatus(store, paused.id, "paused", "operator");
      releaseDispatch(store, {
        actor: "operator",
        commandId: "command-release-paused-run",
        correlationId: paused.id,
        leaseId: pausedDispatch.leaseId,
        gameId: "melee",
      });
      const pausedState = gameRunActionState(store, "melee", {
        runId: paused.id,
        hasActiveProcess: () => ({ active: false }),
      });
      expect(pausedState.availableActions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: true,
        blocked_by: [],
      });

      const active = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee" }, { baseRevision: "base-sha" });
      const activeDispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-active-run",
        correlationId: active.id,
        kind: "run",
        gameId: "melee",
        reason: "test active lease-free recovery",
        workflowId: active.id,
      });
      if (activeDispatch.queued) throw new Error("test active run lease was unexpectedly queued");
      updateRunStatus(store, active.id, "active", "operator");
      releaseDispatch(store, {
        actor: "operator",
        commandId: "command-release-active-run",
        correlationId: active.id,
        leaseId: activeDispatch.leaseId,
        gameId: "melee",
      });
      const activeState = gameRunActionState(store, "melee", {
        runId: active.id,
        hasActiveProcess: () => ({ active: true }),
      });
      expect(activeState.availableActions.find((action) => action.action_id === "run.recover")).toMatchObject({
        enabled: false,
        blocked_by: [
          expect.objectContaining({
            code: "dispatch_process_alive",
            message: "Run has no dispatch lease but its scheduler process is still live",
          }),
        ],
      });
    } finally {
      store.db.close();
    }
  });



  test("includes epoch status on epoch targets so stale admitted rows can be excluded from the active queue", () => {
    const { dir, store } = tempState();
    let runId = "";
    try {
      seedHarnessState(store, "test", { head: "base-test" });
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
      seedHarnessState(store, "test", { head: "base-test" });
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
          { kind: "function", unit: "unit", symbol: "provider_outage_fn", sourcePath: "src/provider_outage.c", size: 64, fuzzy: 91 },
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

      const providerOutageClaim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-provider-outage", baseRev: "base" });
      closeWorkerState(store, {
        workerStateId: providerOutageClaim!.workerStateId,
        lifecycleStatus: "error",
        errorSummary: "Provider unavailable: no_biscuit_no_service",
        summary: {
          error: {
            kind: "provider_outage",
            summary: "Provider unavailable: no_biscuit_no_service",
            reasons: ["no_biscuit_no_service"],
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
    expect(counts.provider_outage).toBe(1);
    expect(counts.improvement_banked).toBe(1);
    expect(counts.attempt_budget_exhausted).toBe(1);
  });

  test("a steering-rejected attempt outranks its raw exact or improved target score", () => {
    const { dir, store } = tempState();
    let runId = "";
    const artifact = (name: string, body: JsonObject): string => {
      const path = join(dir, `${name}.summary.json`);
      writeFileSync(path, JSON.stringify(body));
      return path;
    };
    const steeringReason = "steering_located: steering located in steered_fn (without steering: 96.5%).";
    try {
      seedHarnessState(store, "sms", { head: "base-sms" });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base-sms" });
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          { kind: "function", unit: "unit", symbol: "steered_fn", sourcePath: "src/steered.c", size: 64, fuzzy: 90 },
          { kind: "function", unit: "unit", symbol: "banked_then_steered_fn", sourcePath: "src/banked.c", size: 64, fuzzy: 90 },
        ],
        workerPoolSize: 1,
      });
      const checkpoint = (claim: NonNullable<ReturnType<typeof claimNextEpochTarget>>, attemptIndex: number, input: {
        newScore: number; exact: boolean; hardGatesPassed: boolean; status: string; reasons?: string[];
      }) => recordWorkerCheckpoint(store, {
        authority: { host: "dashboard-read-model-test" },
        workerStateId: claim.workerStateId,
        runId: run.id,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex,
        oldScore: 90,
        newScore: input.newScore,
        exactMatch: input.exact,
        hardGatesPassed: input.hardGatesPassed,
        buildStatus: "compiled",
        qaStatus: "clean",
        objdiffStatus: "available",
        validationStatus: input.status,
        artifactPath: artifact(`${claim.workerStateId}-${attemptIndex}`, {
          status: input.status,
          reasons: input.reasons ?? [],
          target: { unit: "unit", symbol: claim.targetId, before: 90, after: input.newScore, improved: true, exact: input.exact },
        }),
        patchPath: null,
        diffPath: null,
        writeSet: [],
        failureReasons: input.reasons ?? [],
        metadata: {},
      });

      // Exact target, rejected for steering: nothing was banked.
      const steered = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-steered", baseRev: "base-sms" })!;
      checkpoint(steered, 0, { newScore: 100, exact: true, hardGatesPassed: false, status: "steering_located", reasons: [steeringReason] });
      closeWorkerState(store, {
        workerStateId: steered.workerStateId,
        lifecycleStatus: "finished",
        summary: {
          agent_note: { attempts: [{ old_score: 90, new_score: 100, delta: 10 }] },
          continuation_attempts: { stop_reason: "attempt_budget_exhausted", exhausted: true },
        },
      });

      // An accepted improvement, then an exact attempt rejected for steering.
      const banked = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-banked", baseRev: "base-sms" })!;
      checkpoint(banked, 0, { newScore: 95, exact: false, hardGatesPassed: true, status: "passed" });
      checkpoint(banked, 1, { newScore: 100, exact: true, hardGatesPassed: false, status: "steering_located", reasons: [steeringReason] });
      closeWorkerState(store, {
        workerStateId: banked.workerStateId,
        lifecycleStatus: "finished",
        summary: { continuation_attempts: { stop_reason: "attempt_budget_exhausted", exhausted: true } },
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
    const workerStates = details.workerStates as JsonObject[];
    const bySymbol = (symbol: string) => workerStates.find((state) => (state.target as JsonObject).symbol === symbol)!;
    const steeredState = bySymbol("steered_fn");
    const bankedState = bySymbol("banked_then_steered_fn");
    expect(steeredState.result).toBe("no_progress");
    expect((steeredState.runnerValidation as JsonObject).status).toBe("steering_located");
    expect(bankedState.result).toBe("improved");
    expect((bankedState.selectedCheckpoint as JsonObject).exact).toBe(false);

    const counts = (details.summary as JsonObject).workerStateOutcomeCounts as JsonObject;
    expect(counts.validation_steering_located).toBe(2);
    expect(counts.exact).toBe(0);
    expect(counts.attempt_budget_exhausted).toBe(0);
    expect((details.summary as JsonObject).exactMatches).toBe(0);
    const improvements = details.improvements as JsonObject[];
    expect(improvements.map((row) => row.symbol)).toEqual(["banked_then_steered_fn"]);
    expect(improvements[0]).toMatchObject({ newScore: 95, exactMatches: 0, source: "runner" });
  });

  test("an edit-scope rejection outranks its raw exact target score and has its own outcome", () => {
    const { dir, store } = tempState();
    let runId = "";
    const scopeReason = "edit_scope: TKoopa is declared in include/Enemy/Koopa.hpp but its unit main/Enemy/Koopa is not decompiled.";
    try {
      seedHarnessState(store, "sms", { head: "base-sms" });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base-sms" });
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "unit", symbol: "fenced_fn", sourcePath: "src/fenced.c", size: 64, fuzzy: 90 }],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-fenced", baseRev: "base-sms" })!;
      const artifactPath = join(dir, "fenced.summary.json");
      writeFileSync(artifactPath, JSON.stringify({
        status: "edit_scope_rejected",
        reasons: [scopeReason],
        target: { unit: "unit", symbol: claim.targetId, before: 90, after: 100, improved: true, exact: true },
      }));
      recordWorkerCheckpoint(store, {
        authority: { host: "dashboard-read-model-test" },
        workerStateId: claim.workerStateId,
        runId: run.id,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex: 0,
        oldScore: 90,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: false,
        buildStatus: "compiled",
        qaStatus: "clean",
        objdiffStatus: "available",
        validationStatus: "edit_scope_rejected",
        artifactPath,
        patchPath: null,
        diffPath: null,
        writeSet: [],
        failureReasons: [scopeReason],
        metadata: {},
      });
      closeWorkerState(store, {
        workerStateId: claim.workerStateId,
        lifecycleStatus: "finished",
        summary: { continuation_attempts: { stop_reason: "attempt_budget_exhausted", exhausted: true } },
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
    const state = (details.workerStates as JsonObject[])[0]!;
    expect(state.result).toBe("no_progress");
    const counts = (details.summary as JsonObject).workerStateOutcomeCounts as JsonObject;
    expect(counts.validation_edit_scope_rejected).toBe(1);
    expect(counts.validation_steering_located).toBe(0);
    expect(counts.exact).toBe(0);
    expect(counts.attempt_budget_exhausted).toBe(0);
    expect(details.improvements).toEqual([]);
  });

  test("readiness: work-table rows for blocked and deferred targets carry a waiting-on label", () => {
    const { dir, store } = tempState();
    let runId = "";
    const koopa = { class: "TKoopa", owner_unit: "main/Enemy/Koopa", kind: "construct" };
    try {
      seedHarnessState(store, "sms", { head: "base-sms" });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base-sms" });
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      const deferred = { kind: "function" as const, unit: "main/Map/MapObj", symbol: "spawnKoopa", sourcePath: "src/Map/MapObj.cpp", size: 32, fuzzy: 40,
        readiness: { state: "deferred" as const, unmet: [koopa], unresolved: [] } };
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: "main/Map/MapObj", symbol: "update", sourcePath: "src/Map/MapObj.cpp", size: 32, fuzzy: 40 }, deferred],
        workerPoolSize: 1,
      });
      recordReadinessArtifact(store, {
        runId: run.id,
        gameId: "sms",
        epochId: epoch.id,
        board: {
          generatedAt: "2026-10-15T00:00:00.000Z", reportPath: "", objdiffPath: "", measures: {},
          candidates: [deferred],
          blocked: [{ key: "main/System/MarNameRefGen_Enemy::getNameRef", unit: "main/System/MarNameRefGen_Enemy", symbol: "getNameRef",
            sourcePath: "src/System/MarNameRefGen_Enemy.cpp", size: 64, fuzzy: 10, reason: "not_ready", unmet: [koopa] }],
          deferred: ["main/Map/MapObj::spawnKoopa"],
          readiness: { mode: "enforce", identity: { rev: "rev-1" }, rev: "rev-1", unavailable: null },
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
    expect(details.readiness).toMatchObject({ mode: "enforce", rev: "rev-1", parked: false });
    expect(details.blockedTargets).toEqual([expect.objectContaining({
      symbol: "getNameRef",
      readinessStatus: "blocked",
      blockedReason: "not_ready",
      label: "waiting on: TKoopa (Enemy/Koopa, not decompiled)",
    })]);
    expect(details.deferredTargets).toEqual([expect.objectContaining({ symbol: "spawnKoopa", readinessStatus: "deferred" })]);
    expect(details.wouldBlockTargets).toEqual([]);
    const targets = details.epochTargets as JsonObject[];
    const deferredRow = targets.find((row) => row.symbol === "spawnKoopa")!;
    expect(deferredRow).toMatchObject({ readinessStatus: "deferred", reason: "waiting on: TKoopa (Enemy/Koopa, not decompiled)" });
    expect(targets.find((row) => row.symbol === "update")).not.toHaveProperty("readinessStatus");
  });

  test("readiness: games without ordering get no readiness keys", () => {
    const { dir, store } = tempState();
    let runId = "";
    try {
      seedHarnessState(store, "test", { head: "base-test" });
      runId = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" }).id;
    } finally {
      store.db.close();
    }
    const { runDetails } = createDashboardReadModel({ buildPrRecordsView: () => ({}), campaignStatus: () => ({}), processStatus: () => ({}) });
    const details = runDetails(dir, runId);
    for (const key of ["readiness", "blockedTargets", "deferredTargets", "wouldBlockTargets", "wouldDeferTargets"]) expect(details).not.toHaveProperty(key);
  });

  /** `targetUnit`: the report spelling targets carry; `holdUnit`: the steering spelling the unverified rows carry. */
  function seedUnverifiedRun(gameId: string, targetUnit = "main/Map/MapObj", holdUnit = targetUnit): { dir: string; runId: string } {
    const { dir, store } = tempState();
    try {
      seedHarnessState(store, gameId, { head: `base-${gameId}` });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId }, { baseRevision: `base-${gameId}` });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 2 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          { kind: "function", unit: targetUnit, symbol: "update", sourcePath: "src/Map/MapObj.cpp", size: 32, fuzzy: 100 },
          { kind: "function", unit: targetUnit, symbol: "draw", sourcePath: "src/Map/MapObj.cpp", size: 32, fuzzy: 40 },
        ],
        workerPoolSize: 2,
      });
      // A historical exact attempt on `update` (40 -> 100), before the backfill recorded it unverified.
      const claims = [0, 1].map((index) => claimNextEpochTarget({ store, runId: run.id, workerId: `worker-${index}`, baseRev: `base-${gameId}` })!);
      const claim = claims.find((row) => (store.db.query("SELECT symbol FROM epoch_targets WHERE id = ?").get(row.epochTargetId) as { symbol: string }).symbol === "update")!;
      const artifactPath = join(dir, "update.summary.json");
      writeFileSync(artifactPath, JSON.stringify({
        status: "passed",
        reasons: [],
        target: { unit: targetUnit, symbol: "update", before: 40, after: 100, improved: true, exact: true },
      }));
      recordWorkerCheckpoint(store, {
        authority: { host: "dashboard-read-model-test" },
        workerStateId: claim.workerStateId,
        runId: run.id,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex: 0,
        oldScore: 40,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        buildStatus: "compiled",
        qaStatus: "clean",
        objdiffStatus: "available",
        validationStatus: "passed",
        artifactPath,
        patchPath: null,
        diffPath: null,
        writeSet: [],
        failureReasons: [],
        metadata: {},
      });
      closeWorkerState(store, { workerStateId: claim.workerStateId, lifecycleStatus: "exact", summary: {} });
      for (const symbol of ["update", "outsideRun"]) {
        recordUnverifiedMatch(store, {
          gameId, unit: holdUnit, symbol, analyzedRev: "rev-1",
          match: { base: 40, candidate: 100, real_only: null },
          reasons: ["no steering located", "real-only build regressed", "patch touches inline asm", "fourth reason"],
        });
      }
      return { dir, runId: run.id };
    } finally {
      store.db.close();
    }
  }

  const readModelDeps = { buildPrRecordsView: () => ({}), campaignStatus: () => ({}), processStatus: () => ({}) };

  test("unverified match: steering-gated games annotate target rows and report counts next to done", async () => {
    const { dir, runId } = seedUnverifiedRun("sms");
    const game = { gameId: "sms", baseRef: "origin/master", matching: { stackFramePolicy: "stop_at_frame", steeringGate: "enforce" } };
    const { runDashboard, runDetails } = createDashboardReadModel(readModelDeps);

    const details = runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);
    const targets = details.epochTargets as JsonObject[];
    expect(targets.find((row) => row.symbol === "update")).toMatchObject({
      verification: "unverified_match",
      verification_label: "100% but unverified",
      verification_match: { base: 40, candidate: 100, real_only: null },
      verification_reasons: ["no steering located", "real-only build regressed", "patch touches inline asm"],
    });
    expect(targets.find((row) => row.symbol === "draw")).not.toHaveProperty("verification");
    // The historical exact attempt is not done while `update` is unverified; its score delta still shows.
    expect(details.summary).toMatchObject({ exactMatches: 0, unverified_matches: 2, unverified_run_targets: 1 });
    expect((details.improvements as JsonObject[]).find((row) => row.symbol === "update")).toMatchObject({ exactMatches: 0, newScore: 100, verification: "unverified_match" });
    expect((details.timeline as JsonObject[]).find((row) => row.kind === "worker_state" && row.title === "update")).toMatchObject({ exactMatches: 0 });

    const dashboard = await runDashboard({ game, repoRoot: dir, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]);
    expect((dashboard.epochTargets as JsonObject[]).find((row) => row.symbol === "update")).toMatchObject({ verification: "unverified_match" });
    expect(dashboard.runSummary).toMatchObject({ targetExactMatches: 0, unverified_matches: 2, unverified_run_targets: 1 });
    expect(dashboard.current).toMatchObject({ unverified_matches: 2 });
  });

  test("unverified match: SMS short-unit rows hold the module-prefixed run targets", async () => {
    // Targets carry the report unit `mario/Map/MapObj`; the steering rows carry `Map/MapObj`.
    const { dir, runId } = seedUnverifiedRun("sms", "mario/Map/MapObj", "Map/MapObj");
    const game = { gameId: "sms", baseRef: "origin/master", matching: { stackFramePolicy: "stop_at_frame", steeringGate: "enforce" } };
    const { runDashboard, runDetails } = createDashboardReadModel(readModelDeps);

    const details = runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);
    expect((details.epochTargets as JsonObject[]).find((row) => row.symbol === "update")).toMatchObject({ verification: "unverified_match" });
    expect(details.summary).toMatchObject({ exactMatches: 0, unverified_matches: 2, unverified_run_targets: 1 });
    expect((details.improvements as JsonObject[]).find((row) => row.symbol === "update")).toMatchObject({ exactMatches: 0, verification: "unverified_match" });
    expect((details.timeline as JsonObject[]).find((row) => row.kind === "worker_state" && row.title === "update")).toMatchObject({ exactMatches: 0 });

    const dashboard = await runDashboard({ game, repoRoot: dir, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]);
    expect((dashboard.epochTargets as JsonObject[]).find((row) => row.symbol === "update")).toMatchObject({ verification: "unverified_match" });
    expect(dashboard.runSummary).toMatchObject({ targetExactMatches: 0, unverified_matches: 2, unverified_run_targets: 1 });

    // Cleared at a revision that does not certify the result's: a rollback hold at that revision, still not done.
    const store = openState(dir);
    try {
      expect(clearUnverifiedMatch(store, { gameId: "sms", unit: "Map/MapObj", symbol: "update", clearedBy: "attempt:test", clearedRev: "elsewhere" })).toBe(true);
    } finally {
      store.db.close();
    }
    const held = runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);
    expect(held.summary).toMatchObject({ exactMatches: 0, unverified_matches: 1, unverified_run_targets: 0 });
    expect((held.improvements as JsonObject[]).find((row) => row.symbol === "update")).toMatchObject({ exactMatches: 0, completionHold: "steering_rollback" });
  });

  test("unverified match: without module prefixes (Melee) units compare as written", () => {
    // A gated game without `unitModulePrefixes`: a short row never holds a differently spelled target.
    const { dir, runId } = seedUnverifiedRun("melee", "mario/Map/MapObj", "Map/MapObj");
    const game = { gameId: "melee", baseRef: "origin/master", matching: { stackFramePolicy: "match_frame", steeringGate: "enforce" } };
    const { runDetails } = createDashboardReadModel(readModelDeps);
    const details = runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);
    expect((details.epochTargets as JsonObject[]).find((row) => row.symbol === "update")).not.toHaveProperty("verification");
    expect(details.summary).toMatchObject({ exactMatches: 1, unverified_matches: 2, unverified_run_targets: 0 });
  });

  test("unverified progress: dashboard re-derives every stored view under the current active rows", async () => {
    const { dir, runId } = seedUnverifiedRun("sms");
    const unit = "main/Map/MapObj";
    const game = { gameId: "sms", baseRef: "origin/master", matching: { steeringGate: "enforce" } };
    const baselinePath = join(dir, "baseline.report.json");
    const currentPath = join(dir, "current.report.json");
    const measures = {
      total_code: 64, matched_code: 64, matched_code_percent: 100, fuzzy_match_percent: 100,
      total_functions: 2, matched_functions: 2, matched_functions_percent: 100,
      complete_code: 64, complete_code_percent: 100, total_data: 0, complete_data: 0,
      total_units: 1, complete_units: 1, unmatched_targets: 0,
    };
    const report = (updateScore: number) => {
      const rawMeasures = updateScore === 100 ? measures : {
        ...measures, matched_code: 48, matched_code_percent: 75, fuzzy_match_percent: 85,
        matched_functions: 1, matched_functions_percent: 50,
      };
      return { measures: rawMeasures,
        units: [{ name: unit, measures: rawMeasures, metadata: { source_path: "src/Map/MapObj.cpp", complete: true }, functions: [
          { name: "update", size: 16, fuzzy_match_percent: updateScore },
          { name: "draw", size: 48, fuzzy_match_percent: 100 },
        ] }],
      };
    };
    writeFileSync(baselinePath, JSON.stringify(report(40)));
    writeFileSync(currentPath, JSON.stringify(report(100)));
    // Persisted figures already withheld update. Reading them must re-derive
    // from raw evidence, including when a different row becomes active later.
    const stored = { ...measures, matched_code: 48, matched_code_percent: 75, fuzzy_match_percent: 75,
      matched_functions: 1, matched_functions_percent: 50, complete_units: 0,
      complete_code: 0, complete_code_percent: 0, unmatched_targets: 1,
      unverified_functions: 1, unverified_code: 16 };
    let campaign: JsonObject = {};
    const store = openState(dir);
    try {
      const campaignId = ensureCampaign(store, { gameId: "sms", baseRef: "origin/master" }).id;
      const base = addSavePoint(store, { campaignId, runId, triggerKind: "init", commitSha: "base-sms",
        matchedCodePercent: 75, reportPath: baselinePath, payload: { measures: stored } });
      const point = addSavePoint(store, { campaignId, runId, triggerKind: "epoch_finish", commitSha: "head-sms",
        matchedCodePercent: 75, reportPath: currentPath, payload: { measures: stored } });
      const runCreatedAt = (store.db.query("SELECT created_at FROM runs WHERE id = ?").get(runId) as { created_at: string }).created_at;
      const at = (offset: number) => new Date(Date.parse(runCreatedAt) + offset).toISOString();
      store.db.query("UPDATE save_points SET created_at = ? WHERE id = ?").run(at(-1000), base.id);
      store.db.query("UPDATE save_points SET created_at = ? WHERE id = ?").run(at(2000), point.id);
      for (const saved of [base, point]) {
        const state = getHarnessState(store.db, "sms")!;
        transitionHarnessState(store.db, { gameId: "sms", expectedRevision: state.identity.revision,
          commandId: `point-${saved.id}`, patch: { source: { head: saved.commitSha! }, history: { save_point_id: saved.id }, readiness: { build: "ready", evidence: "ready" } },
          boundary: { eventId: `event-${saved.id}`, kind: "save_point", outcome: "accepted", evidence: { save_point_id: saved.id } } });
      }
      writeRunEvent(store, runId, "epoch_checkpoint_progress", at(1000), { phase: "integration_drain", status: "started" });
      for (const key of ["initial", "current"]) recordDashboardArtifact(store, {
        runId, artifactType: "board_snapshot", artifactKey: key,
        payload: { measures: stored, reportPath: key === "initial" ? baselinePath : currentPath,
          measuredRevision: key === "initial" ? "base-sms" : "head-sms", candidates: [{ unit, symbol: "update" }] },
      });
      recordDashboardArtifact(store, { runId, artifactType: "trusted_report", artifactKey: "current", payload: {
        status: "ready", generatedAt: at(2000),
        counts: { newMatches: 1, brokenMatches: 0, improvements: 0, fuzzyRegressions: 0, metricRegressions: 0, metricProgressions: 1 },
        newMatches: [{ unitName: unit, itemName: "update", sourcePath: "src/Map/MapObj.cpp", size: 16, fromPercent: 40, toPercent: 100, bytesDelta: 9.6 }],
        brokenMatches: [], improvements: [], fuzzyRegressions: [], metricRegressions: [], metricProgressions: [{ unitName: unit }],
        measures: { matchedCodePercentTo: 100 }, promotion: { ready: true },
      } });
      campaign = { head: { sha: "head-sms", dirty: false }, savePoint: point, savePoints: [base, point] };
    } finally {
      store.db.close();
    }
    const { runDashboard, runDetails } = createDashboardReadModel({ ...readModelDeps, campaignStatus: () => campaign });
    const read = () => runDashboard({ game, repoRoot: dir, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]);
    const initial = await read();
    expect(initial.initial).toMatchObject({ measures: { matched_code_percent: 75, fuzzy_match_percent: 75, complete_units: 0 } });
    expect(initial.current).toMatchObject({ measures: { matched_code_percent: 75, fuzzy_match_percent: 75, complete_units: 0, unverified_code: 16 },
      units: [{ name: unit, measures: { matched_code_percent: 75, complete_units: 0 } }] });
    expect(initial.scoreTiers).toMatchObject({ baseline: { score: 75 }, confirmed: { score: 75, matches: [] },
      timeline: [{ score: 75 }, { score: 75 }] });
    expect(initial.epochs).toMatchObject([{ matchedCodePercent: 75, measures: { matched_code_percent: 75, unverified_code: 16 } }]);
    expect(initial.campaign).toMatchObject({ savePoint: { matchedCodePercent: 75, payload: { measures: { matched_code_percent: 75 } } },
      savePoints: [{ matchedCodePercent: 75 }, { matchedCodePercent: 75 }] });
    expect(initial.harnessState).toMatchObject({ run: { progress: { baseline_score: 75, confirmed_score: 75 } } });
    expect(initial.trustedReport).toMatchObject({ newMatches: [], counts: { newMatches: 0 }, measures: null, promotion: null,
      improvements: [{ itemName: "update", verification: "unverified_match", fromPercent: 40, toPercent: 100 }],
      rawEvidence: { newMatches: [{ itemName: "update" }], counts: { newMatches: 1 } } });
    expect(initial.runSummary).toMatchObject({ targetExactMatches: 0, reportNewMatches: 0, totalPositiveDelta: 60, matchedCodeDelta: 0,
      workerStateOutcomeCounts: { exact: 0 } });
    expect(initial.boundary).toMatchObject({ current: { matchedCodePercent: 75 } });
    expect(runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]).boundary).toMatchObject({ current: { matchedCodePercent: 75 } });

    const currentEvidence = readFileSync(currentPath, "utf8");
    rmSync(currentPath);
    try {
      expect((await read()).harnessState).toMatchObject({ run: { progress: { baseline_score: 75, confirmed_score: null } } });
    } finally {
      writeFileSync(currentPath, currentEvidence);
    }

    const changed = openState(dir);
    try {
      clearUnverifiedMatch(changed, { gameId: "sms", unit, symbol: "update", clearedBy: "attempt:certified", clearedRev: "head-sms" });
      recordUnverifiedMatch(changed, { gameId: "sms", unit, symbol: "draw", analyzedRev: "head-sms", match: { base: 40, candidate: 100, real_only: null }, reasons: ["not certified"] });
    } finally {
      changed.db.close();
    }
    const next = await read();
    expect(next.current).toMatchObject({ measures: { matched_code_percent: 25, fuzzy_match_percent: 25, unverified_code: 48 },
      units: [{ name: unit, measures: { matched_code_percent: 25 } }] });
    // The baseline predates update's certifying revision (head-sms): it stays held there, fuzzy share included.
    expect(next.initial).toMatchObject({ measures: { matched_code_percent: 0, fuzzy_match_percent: 0 } });
    expect(next.scoreTiers).toMatchObject({ baseline: { score: 0 }, confirmed: { score: 25 }, timeline: [{ score: 0 }, { score: 25 }] });
    expect(next.epochs).toMatchObject([{ matchedCodePercent: 25 }]);
    expect(next.campaign).toMatchObject({ savePoint: { matchedCodePercent: 25 }, savePoints: [{ matchedCodePercent: 0 }, { matchedCodePercent: 25 }] });
    // The historical attempt measured at base-sms predates the certification at head-sms: not credited.
    expect(next.runSummary).toMatchObject({ targetExactMatches: 0, reportNewMatches: 1, matchedCodeDelta: 25 });

    // Exercise both fallback paths through the API, not a projection helper.
    const fallback = openState(dir);
    try {
      fallback.db.query("DELETE FROM dashboard_artifacts WHERE run_id = ? AND artifact_type = 'board_snapshot' AND artifact_key = 'current'").run(runId);
    } finally {
      fallback.db.close();
    }
    expect((await read()).current).toMatchObject({ source: "initial_board", measures: { matched_code_percent: 0 } });
    const noBoard = openState(dir);
    try {
      noBoard.db.query("DELETE FROM dashboard_artifacts WHERE run_id = ? AND artifact_type = 'board_snapshot'").run(runId);
    } finally {
      noBoard.db.close();
    }
    const saved = await read();
    expect(saved.current).toMatchObject({ source: "save_point", measures: { matched_code_percent: 25 } });
    expect(saved.initial).toMatchObject({ source: "save_point", measures: { matched_code_percent: 25 } });
    // The campaign dependency can cache raw evidence; dashboard reads leave it intact.
    expect(campaign).toMatchObject({ savePoint: { matchedCodePercent: 75, payload: { measures: { unverified_code: 16 } } } });
    rmSync(currentPath);
    const unavailable = await read();
    expect(unavailable.current).toMatchObject({ measures: { unverified_unbounded: true } });
    expect(unavailable.scoreTiers).toMatchObject({ confirmed: { score: null }, timeline: [{ score: 0 }, { score: null }] });
    expect(unavailable.epochs).toMatchObject([{ matchedCodePercent: null, measures: { unverified_unbounded: true } }]);
    expect(unavailable.campaign).toMatchObject({ savePoint: { matchedCodePercent: null } });
  });

  function gitIn(root: string, args: string[]): string {
    const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
    return result.stdout.toString().trim();
  }

  /** A save point the harness accepted: the canonical head moves to it and the score timeline anchors it. */
  function addAcceptedSavePoint(store: StateStore, input: {
    campaignId: string; runId: string; triggerKind: Parameters<typeof addSavePoint>[1]["triggerKind"];
    commitSha: string; matchedCodePercent: number; reportPath: string; measures: JsonObject; createdAt: string;
  }) {
    const point = addSavePoint(store, { campaignId: input.campaignId, runId: input.runId, triggerKind: input.triggerKind,
      commitSha: input.commitSha, matchedCodePercent: input.matchedCodePercent, reportPath: input.reportPath, payload: { measures: input.measures } });
    store.db.query("UPDATE save_points SET created_at = ? WHERE id = ?").run(input.createdAt, point.id);
    const state = getHarnessState(store.db, "sms")!;
    transitionHarnessState(store.db, { gameId: "sms", expectedRevision: state.identity.revision,
      commandId: `point-${point.id}`, patch: { source: { head: input.commitSha }, history: { save_point_id: point.id }, readiness: { build: "ready", evidence: "ready" } },
      boundary: { eventId: `event-${point.id}`, kind: "save_point", outcome: "accepted", evidence: { save_point_id: point.id } } });
    return point;
  }

  /**
   * An enforce-gate SMS run over one unit whose raw report has two exact
   * functions: `verified` (48 bytes, never held) and `held` (16 bytes, a
   * steering rollback and no active `unverified_match` row). A real git repo
   * holds the baseline B, the saved revision S (child of B) and a later C
   * (child of S). Save points at B (init) and S (epoch finish) plus the
   * initial (B) and current (S) boards are stored as the writers left them:
   * `held` already withheld from S's figures.
   */
  function seedRollbackHeldRun(onlyHeld = false) {
    const repo = mkdtempSync(join(tmpdir(), "dashboard-rollback-repo-"));
    tempDirs.push(repo);
    gitIn(repo, ["init", "-q"]);
    gitIn(repo, ["config", "user.email", "fixture@example.com"]);
    gitIn(repo, ["config", "user.name", "Fixture"]);
    gitIn(repo, ["config", "commit.gpgsign", "false"]);
    const commit = (label: string) => {
      writeFileSync(join(repo, "MapObj.cpp"), `// ${label}\n`);
      gitIn(repo, ["add", "."]);
      gitIn(repo, ["commit", "-qm", label]);
      return gitIn(repo, ["rev-parse", "HEAD"]);
    };
    const shas = { base: commit("baseline"), saved: commit("saved"), later: commit("later") };

    const unit = "main/Map/MapObj";
    const exact: JsonObject = {
      total_code: 64, matched_code: 64, matched_code_percent: 100, fuzzy_match_percent: 100,
      total_functions: 2, matched_functions: 2, matched_functions_percent: 100,
      complete_code: 64, complete_code_percent: 100, total_data: 0, complete_data: 0,
      total_units: 1, complete_units: 1, unmatched_targets: 0,
    };
    const partial: JsonObject = { ...exact, matched_code: 0, matched_code_percent: 0, fuzzy_match_percent: 50,
      matched_functions: 0, matched_functions_percent: 0, complete_code: 0, complete_code_percent: 0,
      complete_units: 0, unmatched_targets: 2 };
    // Figures a writer stores with `held` withheld; reads must re-derive from the raw report instead.
    const stored: JsonObject = { ...exact, matched_code: 48, matched_code_percent: 75, fuzzy_match_percent: 75,
      matched_functions: 1, matched_functions_percent: 50, complete_units: 0, complete_code: 0, complete_code_percent: 0,
      unmatched_targets: 1, unverified_functions: 1, unverified_code: 16 };
    const report = (measures: JsonObject, score: number) => ({ measures, units: [{ name: unit, measures,
      metadata: { source_path: "src/Map/MapObj.cpp", complete: score === 100 }, functions: [
        { name: "verified", size: 48, fuzzy_match_percent: score },
        { name: "held", size: 16, fuzzy_match_percent: score },
      ] }] });
    const { dir, store } = tempState();
    const baselinePath = join(dir, "baseline.report.json");
    const currentPath = join(dir, "current.report.json");
    writeFileSync(baselinePath, JSON.stringify(report(partial, 50)));
    writeFileSync(currentPath, JSON.stringify(report(exact, 100)));
    try {
      seedHarnessState(store, "sms", { head: shas.base });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: shas.base });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 2 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ symbol: "verified", size: 48 }, { symbol: "held", size: 16 }]
          .filter(({ symbol }) => !onlyHeld || symbol === "held")
          .map(({ symbol, size }) => ({ kind: "function" as const, unit, symbol, sourcePath: "src/Map/MapObj.cpp", size, fuzzy: 50 })),
        workerPoolSize: 2,
      });
      // A steering-gate --apply rewrote `held` on S; it re-checked pass, but no certificate was recorded after it.
      const rollbackId = recordSteeringRollback(store, {
        gameId: "sms", unit, symbol: "held", analyzedRev: shas.saved, baseRev: shas.base,
        initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
      });
      store.db.query("UPDATE steering_rollbacks SET recorded_at = ?, updated_at = ? WHERE id = ?")
        .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", rollbackId);
      const campaignId = ensureCampaign(store, { gameId: "sms", baseRef: "origin/master" }).id;
      const runCreatedAt = (store.db.query("SELECT created_at FROM runs WHERE id = ?").get(run.id) as { created_at: string }).created_at;
      const at = (offset: number) => new Date(Date.parse(runCreatedAt) + offset).toISOString();
      const base = addAcceptedSavePoint(store, { campaignId, runId: run.id, triggerKind: "init", commitSha: shas.base,
        matchedCodePercent: 0, reportPath: baselinePath, measures: partial, createdAt: at(-1000) });
      const saved = addAcceptedSavePoint(store, { campaignId, runId: run.id, triggerKind: "epoch_finish", commitSha: shas.saved,
        matchedCodePercent: 75, reportPath: currentPath, measures: stored, createdAt: at(2000) });
      writeRunEvent(store, run.id, "epoch_checkpoint_progress", at(1000), { phase: "integration_drain", status: "started" });
      recordDashboardArtifact(store, { runId: run.id, artifactType: "board_snapshot", artifactKey: "initial", createdAt: at(2000),
        payload: { measures: partial, reportPath: baselinePath, savePointSha: shas.base, candidates: [] } });
      recordDashboardArtifact(store, { runId: run.id, artifactType: "board_snapshot", artifactKey: "current", createdAt: at(2000),
        payload: { measures: stored, reportPath: currentPath, savePointSha: shas.saved, candidates: [] } });
      return {
        dir, repo, runId: run.id, campaignId, unit, shas, at, base, saved, stored, currentPath,
        game: { gameId: "sms", baseRef: "origin/master", repoRoot: repo, matching: { steeringGate: "enforce" } },
        campaign: { head: { sha: shas.saved, dirty: false }, savePoint: saved, savePoints: [base, saved] } as JsonObject,
      };
    } finally {
      store.db.close();
    }
  }

  test("rollback holds: every saved view withholds an uncertified rollback at its own revision, and a later certificate credits only its descendants", async () => {
    const seeded = seedRollbackHeldRun();
    const { dir, repo, runId, campaignId, unit, shas, at, base, saved, game } = seeded;
    let campaign = seeded.campaign;
    const { runDashboard, runDetails } = createDashboardReadModel({ ...readModelDeps, campaignStatus: () => campaign });
    const read = () => runDashboard({ game, repoRoot: repo, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]);
    const details = () => runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);
    const symbols = (rows: unknown) => (rows as JsonObject[]).map((row) => row.symbol).sort();
    const epochAt = (view: JsonObject, sha: string) => (view.epochs as JsonObject[]).find((epoch) => epoch.commitSha === sha);

    // Every figure stored at S withholds `held` (16 of 64 bytes): only `verified` is credited, never the raw 100.
    const expectSavedRevisionWithheld = (view: JsonObject) => {
      expect(view.current).toMatchObject({ savePointSha: shas.saved, unverified_matches: 0,
        measures: { matched_code_percent: 75, fuzzy_match_percent: 75, matched_functions_percent: 50, complete_units: 0, unverified_code: 16 },
        units: [{ name: unit, measures: { matched_code_percent: 75, complete_units: 0 } }] });
      // The baseline board at B withholds `held`'s 50% fuzzy share too (raw 50).
      expect(view.initial).toMatchObject({ measures: { matched_code_percent: 0, fuzzy_match_percent: 37.5 } });
      const tiers = view.scoreTiers as unknown as { confirmed: { matches: JsonObject[]; improvements: JsonObject[] } };
      expect(view.scoreTiers).toMatchObject({ baseline: { score: 0, savePointId: base.id },
        confirmed: { score: 75, savePointId: saved.id, delta: 75 },
        timeline: [{ commitSha: shas.base, score: 0 }, { commitSha: shas.saved, score: 75 }] });
      expect(symbols(tiers.confirmed.matches)).toEqual(["verified"]);
      // A rollback hold is withheld, not labelled: no active row backs a "100% but unverified" flag.
      const heldImprovement = tiers.confirmed.improvements.find((row) => row.symbol === "held");
      expect(heldImprovement).toBeDefined();
      expect(heldImprovement).not.toHaveProperty("verification");
      expect(view.epochs).toHaveLength(1);
      expect(epochAt(view, shas.saved)).toMatchObject({ matchedCodePercent: 75, measures: { matched_code_percent: 75, unverified_code: 16 } });
      expect(view.campaign).toMatchObject({
        savePoint: { commitSha: shas.saved, matchedCodePercent: 75, payload: { measures: { matched_code_percent: 75, unverified_code: 16 } } },
        savePoints: [{ commitSha: shas.base, matchedCodePercent: 0 }, { commitSha: shas.saved, matchedCodePercent: 75 }],
      });
      expect(view.harnessState).toMatchObject({ run: { progress: { baseline_score: 0, confirmed_score: 75 } } });
      expect(view.runSummary).toMatchObject({ unverified_matches: 0 });
      expect(view.boundary).toMatchObject({ current: { savePointId: saved.id, matchedCodePercent: 75 } });
      expect(details().boundary).toMatchObject({ current: { savePointId: saved.id, matchedCodePercent: 75 } });
    };

    expectSavedRevisionWithheld(await read());

    // A certified backfill pass with clean unit coverage, recorded after the rollback, at the later revision C.
    const certified = openState(dir);
    try {
      recordSteeringBackfill(certified, { gameId: "sms", unit, symbol: "held", analyzedRev: shas.later, verdict: "pass" });
      recordSteeringCoverage(certified, { gameId: "sms", unit, analyzedRev: shas.later, baselineRev: shas.later, clean: true });
    } finally {
      certified.db.close();
    }
    // C is not an ancestor of S: the certificate does not retroactively credit the source saved at S.
    expectSavedRevisionWithheld(await read());

    // A newer save point at C (its stored figures still withheld) is re-derived under C's holds: `held` is credited.
    const later = (() => {
      const advanced = openState(dir);
      try {
        const point = addAcceptedSavePoint(advanced, { campaignId, runId, triggerKind: "epoch_finish", commitSha: shas.later,
          matchedCodePercent: 75, reportPath: seeded.currentPath, measures: seeded.stored, createdAt: at(3000) });
        recordDashboardArtifact(advanced, { runId, artifactType: "board_snapshot", artifactKey: "current", createdAt: at(3000),
          payload: { measures: seeded.stored, reportPath: seeded.currentPath, savePointSha: shas.later, candidates: [] } });
        return point;
      } finally {
        advanced.db.close();
      }
    })();
    campaign = { head: { sha: shas.later, dirty: false }, savePoint: later, savePoints: [base, saved, later] };
    const next = await read();
    expect(next.current).toMatchObject({ savePointSha: shas.later, unverified_matches: 0,
      measures: { matched_code_percent: 100, fuzzy_match_percent: 100, matched_functions_percent: 100, complete_units: 1 },
      units: [{ name: unit, measures: { matched_code_percent: 100, complete_units: 1 } }] });
    expect(next.initial).toMatchObject({ measures: { matched_code_percent: 0, fuzzy_match_percent: 37.5 } });
    expect(next.scoreTiers).toMatchObject({ baseline: { score: 0 }, confirmed: { score: 100, savePointId: later.id, delta: 100 },
      timeline: [{ commitSha: shas.base, score: 0 }, { commitSha: shas.saved, score: 75 }, { commitSha: shas.later, score: 100 }] });
    expect(symbols((next.scoreTiers as unknown as { confirmed: { matches: JsonObject[] } }).confirmed.matches)).toEqual(["held", "verified"]);
    expect(next.epochs).toHaveLength(2);
    expect(epochAt(next, shas.saved)).toMatchObject({ matchedCodePercent: 75, measures: { matched_code_percent: 75, unverified_code: 16 } });
    expect(epochAt(next, shas.later)).toMatchObject({ matchedCodePercent: 100, measures: { matched_code_percent: 100 } });
    expect(next.campaign).toMatchObject({
      savePoint: { commitSha: shas.later, matchedCodePercent: 100, payload: { measures: { matched_code_percent: 100 } } },
      savePoints: [{ matchedCodePercent: 0 }, { commitSha: shas.saved, matchedCodePercent: 75 }, { commitSha: shas.later, matchedCodePercent: 100 }],
    });
    expect(next.harnessState).toMatchObject({ run: { progress: { baseline_score: 0, confirmed_score: 100 } } });
    expect(next.boundary).toMatchObject({ current: { savePointId: later.id, matchedCodePercent: 100 } });
    expect(details().boundary).toMatchObject({ current: { savePointId: later.id, matchedCodePercent: 100 } });
  });

  test("rollback holds: a steering state read failure publishes unknown completion, never the raw credit", async () => {
    const { dir, repo, game, campaign } = seedRollbackHeldRun();
    // The rollback table loses its columns: the holds SELECT throws after the table-existence guard.
    const broken = openState(dir);
    try {
      broken.db.run("DROP TABLE steering_rollbacks");
      broken.db.run("CREATE TABLE steering_rollbacks (id INTEGER PRIMARY KEY AUTOINCREMENT)");
    } finally {
      broken.db.close();
    }
    const { runDashboard } = createDashboardReadModel({ ...readModelDeps, campaignStatus: () => campaign });
    const view = JSON.parse(JSON.stringify(await runDashboard({ game, repoRoot: repo, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]))) as JsonObject;
    expect(view.current).toMatchObject({ unverified_matches: null,
      measures: { unverified_unbounded: true, matched_code_percent: null, fuzzy_match_percent: null, complete_units: null } });
    expect(view.initial).toMatchObject({ measures: { unverified_unbounded: true, matched_code_percent: null } });
    expect(view.scoreTiers).toMatchObject({ baseline: { score: null }, confirmed: { score: null, matches: [] },
      timeline: [{ score: null }, { score: null }] });
    expect(view.epochs).toMatchObject([{ matchedCodePercent: null, measures: { unverified_unbounded: true } }]);
    expect(view.campaign).toMatchObject({ savePoint: { matchedCodePercent: null }, savePoints: [{ matchedCodePercent: null }, { matchedCodePercent: null }] });
    expect(view.harnessState).toMatchObject({ run: { progress: { baseline_score: null, confirmed_score: null } } });
    expect(view.runSummary).toMatchObject({ unverified_matches: null });
    expect(view.boundary).toMatchObject({ current: { matchedCodePercent: null } });
  });

  test("rollback holds: a worker's exact result is withheld at the revision it measured, and clears only on its own later landing", async () => {
    const seeded = seedRollbackHeldRun(true);
    const { dir, repo, runId, unit, shas, game, campaign } = seeded;
    // A worker took `held` 50 -> 100 from the baseline claim B: before any certificate of the rollback.
    const store = openState(dir);
    let claim!: NonNullable<ReturnType<typeof claimNextEpochTarget>>;
    try {
      claim = claimNextEpochTarget({ store, runId, workerId: "worker-held", baseRev: shas.base })!;
      expect(claim).not.toBeNull();
      const artifactPath = join(dir, "held.summary.json");
      writeFileSync(artifactPath, JSON.stringify({ status: "passed", reasons: [],
        target: { unit, symbol: "held", before: 50, after: 100, improved: true, exact: true } }));
      recordWorkerCheckpoint(store, {
        authority: { host: "dashboard-read-model-test" }, workerStateId: claim.workerStateId, runId, epochId: claim.epochId,
        epochTargetId: claim.epochTargetId, targetClaimId: claim.claimId, attemptIndex: 0, oldScore: 50, newScore: 100,
        exactMatch: true, hardGatesPassed: true, buildStatus: "compiled", qaStatus: "clean", objdiffStatus: "available",
        validationStatus: "passed", artifactPath, patchPath: null, diffPath: null, writeSet: [], failureReasons: [], metadata: {},
      });
      closeWorkerState(store, { workerStateId: claim.workerStateId, lifecycleStatus: "exact", summary: {} });
    } finally {
      store.db.close();
    }
    const { runDashboard, runDetails } = createDashboardReadModel({ ...readModelDeps, campaignStatus: () => campaign });
    const counts = async () => {
      const details = runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);
      const dashboard = await runDashboard({ game, repoRoot: repo, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]);
      return {
        exactMatches: (details.summary as JsonObject).exactMatches,
        exactOutcomes: ((details.summary as JsonObject).workerStateOutcomeCounts as JsonObject).exact,
        timelineExact: (details.timeline as JsonObject[]).find((row) => row.kind === "worker_state" && row.title === "held")?.exactMatches,
        improvementExact: (details.improvements as JsonObject[]).find((row) => row.symbol === "held")?.exactMatches,
        targetExactMatches: (dashboard.runSummary as JsonObject).targetExactMatches,
        dashboardOutcomes: ((dashboard.runSummary as JsonObject).workerStateOutcomeCounts as JsonObject).exact,
      };
    };
    const withheld = { exactMatches: 0, exactOutcomes: 0, timelineExact: 0, improvementExact: 0, targetExactMatches: 0, dashboardOutcomes: 0 };

    // No active row backs the hold: the rollback alone, uncertified at the claim base B, withholds the result.
    expect(await counts()).toEqual(withheld);

    // A certificate at the later C does not credit the historical result measured at B.
    const certified = openState(dir);
    try {
      recordSteeringBackfill(certified, { gameId: "sms", unit, symbol: "held", analyzedRev: shas.later, verdict: "pass" });
      recordSteeringCoverage(certified, { gameId: "sms", unit, analyzedRev: shas.later, baselineRev: shas.later, clean: true });
    } finally {
      certified.db.close();
    }
    expect(await counts()).toEqual(withheld);

    // The result's own durable integration landed at C: measured there, its 100% is done.
    const landed = openState(dir);
    try {
      const now = new Date().toISOString();
      landed.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id,
          worker_checkpoint_id, status, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?)`)
        .run("integration-held", runId, claim.epochId, claim.epochTargetId, claim.claimId, claim.workerStateId,
          (landed.db.query("SELECT id FROM worker_checkpoints WHERE worker_state_id = ?").get(claim.workerStateId) as { id: string }).id,
          JSON.stringify({ integrated_rev: shas.later }), now, now);
    } finally {
      landed.db.close();
    }
    expect(await counts()).toEqual({ exactMatches: 1, exactOutcomes: 1, timelineExact: 1, improvementExact: 1, targetExactMatches: 1, dashboardOutcomes: 1 });
  });

  test("rollback holds: the initial board is judged at the revision it measured, never the run's advancing head", async () => {
    const seeded = seedRollbackHeldRun();
    const { dir, repo, runId, unit, shas, game, campaign, at } = seeded;
    const baselinePath = join(dir, "baseline.report.json");
    const store = openState(dir);
    try {
      recordSteeringBackfill(store, { gameId: "sms", unit, symbol: "held", analyzedRev: shas.later, verdict: "pass" });
      recordSteeringCoverage(store, { gameId: "sms", unit, analyzedRev: shas.later, baselineRev: shas.later, clean: true });
      // The run's head moves on to C, where the rollback is certified.
      store.db.query("UPDATE runs SET head_revision = ? WHERE id = ?").run(shas.later, runId);
    } finally {
      store.db.close();
    }
    const { runDashboard } = createDashboardReadModel({ ...readModelDeps, campaignStatus: () => campaign });
    const initialWith = async (extra: JsonObject, offset: number) => {
      const writer = openState(dir);
      try {
        recordDashboardArtifact(writer, { runId, artifactType: "board_snapshot", artifactKey: "initial", createdAt: at(offset),
          payload: { measures: { matched_code_percent: 0, fuzzy_match_percent: 50 }, reportPath: baselinePath, candidates: [], ...extra } });
      } finally {
        writer.db.close();
      }
      const view = await runDashboard({ game, repoRoot: repo, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]);
      return (view.initial as JsonObject).measures;
    };
    // Raw 50; `held` withheld from B's figures is 37.5. C's certificate never reaches back to B through the run head.
    expect(await initialWith({ measuredRevision: shas.base }, 4000)).toMatchObject({ fuzzy_match_percent: 37.5 });
    // No pinned revision: unknown clears no rollback.
    expect(await initialWith({}, 5000)).toMatchObject({ fuzzy_match_percent: 37.5 });
    // A board measured at C is credited at C.
    expect(await initialWith({ measuredRevision: shas.later }, 6000)).toMatchObject({ fuzzy_match_percent: 50 });
  });

  /** `targetUnit`: the report spelling targets and evidence carry; `gateUnit`: the steering spelling gate rows and unverified rows carry. */
  function certifiedCompletionCase(targetUnit: string, gateUnit: string): void {
    const { dir, store } = tempState();
    let runId = "";
    const unit = gateUnit;
    // An enforced gate run that passes `symbol` with an edit group touching it (and its unit built and compared).
    const passingGate = (symbol: string, artifactPath: string) => ({
      mode: "enforce",
      error: null,
      artifactPath,
      durationMs: 1,
      decision: {
        attempt: "pass",
        reasons: [],
        functions: [{
          unit, name: symbol, decision: "pass", semantic: "clean", analysis: "complete", audit_label: "real",
          match: { base: 100, candidate: 100, real_only: 100 }, groups: ["g1"],
        }],
        removable_noncosmetic: [],
        probes: [],
        units: [{ unit, built: true, compared: true }],
        violations: [],
        unused_checks: [],
        order_checks: [],
      },
    });
    // certified: both runs pass. uncertified: the claim-base run passes but the trusted-base run was skipped;
    // the stale `certified: true` flag must not stand in for the trusted-base result.
    const evidenceFor = (symbol: string) => symbol === "certified"
      ? { steering: passingGate(symbol, "claim-base.json"), unverifiedTarget: { unit: targetUnit, symbol, trustedBaseRev: "trusted-rev", baseline: passingGate(symbol, "trusted-base.json") } }
      : { steering: passingGate(symbol, "claim-base.json"), unverifiedTarget: { unit: targetUnit, symbol, certified: true, trustedBaseRev: "trusted-rev", baseline: null, skipped: "the steering gate budget was spent by the claim-base run" } };
    try {
      seedHarnessState(store, "sms", { head: "base-sms" });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base-sms" });
      runId = run.id;
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 2 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: ["certified", "uncertified"].map((symbol) => ({ kind: "function" as const, unit: targetUnit, symbol, sourcePath: "src/Map/MapObj.cpp", size: 32, fuzzy: 100 })),
        workerPoolSize: 2,
      });
      for (const index of [0, 1]) {
        const claim = claimNextEpochTarget({ store, runId: run.id, workerId: `worker-${index}`, baseRev: "base-sms" })!;
        const symbol = (store.db.query("SELECT symbol FROM epoch_targets WHERE id = ?").get(claim.epochTargetId) as { symbol: string }).symbol;
        const artifactPath = join(dir, `${symbol}.summary.json`);
        writeFileSync(artifactPath, JSON.stringify({
          status: "passed",
          reasons: [],
          target: { unit: targetUnit, symbol, before: 100, after: 100, improved: false, exact: true },
          ...evidenceFor(symbol),
        }));
        recordWorkerCheckpoint(store, {
          authority: { host: "dashboard-read-model-test" },
          workerStateId: claim.workerStateId,
          runId: run.id,
          epochId: claim.epochId,
          epochTargetId: claim.epochTargetId,
          targetClaimId: claim.claimId,
          attemptIndex: 0,
          oldScore: 100,
          newScore: 100,
          exactMatch: true,
          hardGatesPassed: true,
          buildStatus: "compiled",
          qaStatus: "clean",
          objdiffStatus: "available",
          validationStatus: "passed",
          artifactPath,
          patchPath: null,
          diffPath: null,
          writeSet: [],
          failureReasons: [],
          metadata: {},
        });
        closeWorkerState(store, { workerStateId: claim.workerStateId, lifecycleStatus: "exact", summary: {} });
      }
      recordUnverifiedMatch(store, { gameId: "sms", unit, symbol: "certified", analyzedRev: "rev-1", match: { base: 40, candidate: 100, real_only: null }, reasons: ["no steering located"] });
    } finally {
      store.db.close();
    }
    const game = { gameId: "sms", baseRef: "origin/master", matching: { stackFramePolicy: "stop_at_frame", steeringGate: "enforce" } };
    const { runDetails } = createDashboardReadModel(readModelDeps);
    const read = () => runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);

    // Active row (not yet integrated/cleared): withheld.
    expect(read().summary).toMatchObject({ exactMatches: 0, totalPositiveDelta: 0 });

    const reopened = openState(dir);
    try {
      // Certified at the revision the attempt's result measured.
      expect(clearUnverifiedMatch(reopened, { gameId: "sms", unit, symbol: "certified", clearedBy: "attempt:test", clearedRev: "base-sms" })).toBe(true);
    } finally {
      reopened.db.close();
    }
    const cleared = read();
    // Only the certified completion counts; the uncertified 100% -> 100% never does. No score delta is invented.
    expect(cleared.summary).toMatchObject({ exactMatches: 1, totalPositiveDelta: 0 });
    expect((cleared.improvements as JsonObject[]).find((row) => row.symbol === "certified")).toMatchObject({ exactMatches: 1, totalDelta: 0, verifiedCompletion: true });
  }

  test("unverified match: a certified 100% -> 100% attempt is done once the state clears, never while it is active", () => {
    certifiedCompletionCase("main/Map/MapObj", "main/Map/MapObj");
  });

  test("unverified match: SMS certifies a module-prefixed target from short-unit gate rows", () => {
    certifiedCompletionCase("mario/Map/MapObj", "Map/MapObj");
  });

  test("unverified match: games without an active steering gate are unchanged", async () => {
    const { dir, runId } = seedUnverifiedRun("melee");
    const game = { gameId: "melee", baseRef: "origin/master", matching: { stackFramePolicy: "match_frame", steeringGate: "off" } };
    const { runDashboard, runDetails } = createDashboardReadModel(readModelDeps);

    const details = runDetails(dir, runId, game as unknown as Parameters<typeof runDetails>[2]);
    for (const row of details.epochTargets as JsonObject[]) expect(Object.keys(row).some((key) => key.startsWith("verification"))).toBe(false);
    expect(details.summary).not.toHaveProperty("unverified_matches");
    expect(details.summary).not.toHaveProperty("unverified_run_targets");
    // Control: without an active gate the same exact attempt counts.
    expect(details.summary).toMatchObject({ exactMatches: 1 });

    const dashboard = await runDashboard({ game, repoRoot: dir, stateDir: dir, graphDbPath: "", usePathOverrides: true } as unknown as Parameters<typeof runDashboard>[0]);
    for (const row of dashboard.epochTargets as JsonObject[]) expect(Object.keys(row).some((key) => key.startsWith("verification"))).toBe(false);
    expect(dashboard.runSummary).not.toHaveProperty("unverified_matches");
    expect(dashboard.runSummary).toMatchObject({ targetExactMatches: 1 });
    expect(dashboard.current).not.toHaveProperty("unverified_matches");
  });

  test("scopes active claim activity to the current recycled claim window", async () => {
    const { dir, store } = tempState();
    let runId = "";
    let workerStateId = "";
    try {
      seedHarnessState(store, "test", { head: "base-test" });
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
    const dashboard = await runDashboard({ game: { gameId: "test", baseRef: "origin/master" } as Parameters<typeof runDashboard>[0]["game"], repoRoot: dir, stateDir: dir, graphDbPath: "", usePathOverrides: true });
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
