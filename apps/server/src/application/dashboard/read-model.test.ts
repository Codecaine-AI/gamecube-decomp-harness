import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
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
} from "@server/core/harness-runtime/run-state";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
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
