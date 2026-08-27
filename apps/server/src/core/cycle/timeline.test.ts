import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  immediateTransaction,
  openState,
  type StateStore,
} from "@server/core/orchestrator-state";
import {
  initializeHarnessState,
  releaseDispatch,
  requestDispatch,
} from "@server/core/harness-state";
import { appendGameEvent, eventSpan, eventsForSubject, listGameEvents, newSpanId } from "@server/core/harness-state/events.js";
import { closeSchedulerEpochWithEvidence, startSchedulerEpoch } from "@server/core/cycle-runtime/run-state";
import { createCycle, getCycleByUuid } from "./store.js";
import { listPendingIntegrations, preparePendingIntegration } from "./pending-integrations.js";
import { listSavePointFailureSpool, spoolSavePointFailure } from "./save-point-failure-spool.js";
import {
  closeCycle,
  listCycleTimeline,
  recordEpochCompletedInTransaction,
  recordRemoteApplicationInTransaction,
  recordSavePointAnchor,
  recordSavePointFailure,
} from "./timeline.js";

const stores: StateStore[] = [];
const tempDirs: string[] = [];

function openTestStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "cycle-timeline-"));
  tempDirs.push(dir);
  const store = openState(dir);
  stores.push(store);
  return store;
}

function setupCycleFixture(store: StateStore): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "cycle-timeline-repo-"));
  tempDirs.push(repoRoot);
  for (const args of [
    ["init", "-q"],
    ["-c", "user.name=Timeline Test", "-c", "user.email=timeline@example.invalid", "commit", "--allow-empty", "-qm", "fixture"],
  ]) {
    const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  }
  const head = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  if (head.exitCode !== 0) throw new Error(new TextDecoder().decode(head.stderr));
  const commitSha = new TextDecoder().decode(head.stdout).trim();
  store.db
    .query(
      `INSERT INTO runs (
         id, goal_kind, goal_value, desired_workers, status, created_at,
         game_id, game_repo_root, cycle_uuid, head_revision, trace_id
       ) VALUES (
         'run-1', 'matched_code_percent', 100, 1, 'active', '2026-08-12T12:00:00.000Z',
         'melee', ?, 'cycle-1', 'base-sha', 'trace-run-1'
       )`,
    )
    .run(repoRoot);
  createCycle(store.db, {
    actor: "operator",
    gameId: "melee",
    cycleUuid: "cycle-1",
    id: "cycle:cycle-1",
    baseSha: "base-sha",
    activeRunId: "run-1",
    commandId: "command-cycle-open",
    openingSyncId: "sync-open-1",
    traceId: "trace-cycle-1",
    worktreeIdentity: repoRoot,
    now: "2026-08-12T12:00:00.000Z",
  });
  return commitSha;
}

function commitInRunRepository(store: StateStore, message: string): { priorHead: string; newHead: string; repoRoot: string } {
  const run = store.db
    .query("SELECT game_repo_root FROM runs WHERE id = 'run-1'")
    .get() as { game_repo_root: string };
  const prior = Bun.spawnSync(["git", "-C", run.game_repo_root, "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (prior.exitCode !== 0) throw new Error(new TextDecoder().decode(prior.stderr));
  const priorHead = new TextDecoder().decode(prior.stdout).trim();
  const committed = Bun.spawnSync(
    [
      "git",
      "-C",
      run.game_repo_root,
      "-c",
      "user.name=Timeline Test",
      "-c",
      "user.email=timeline@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      message,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (committed.exitCode !== 0) throw new Error(new TextDecoder().decode(committed.stderr));
  const next = Bun.spawnSync(["git", "-C", run.game_repo_root, "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (next.exitCode !== 0) throw new Error(new TextDecoder().decode(next.stderr));
  return {
    priorHead,
    newHead: new TextDecoder().decode(next.stdout).trim(),
    repoRoot: run.game_repo_root,
  };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("game cycle timeline", () => {
  test("replays a spooled save-point failure exactly once across concurrent and repeated opens", async () => {
    const store = openTestStore();
    setupCycleFixture(store);
    spoolSavePointFailure(store.stateDir, {
      occurred_at: "2026-08-13T12:00:00.000Z",
      game_id: "melee",
      cycle_uuid: "cycle-1",
      trigger_kind: "epoch",
      source_kind: "run",
      source_id: "run-1",
      message: "save-point write failed",
      command_id: "command-save-point-failed",
      causation_id: null,
      correlation_id: "cycle-1",
      span_id: null,
      actor: "runner",
    });
    store.db.close();
    stores.splice(stores.indexOf(store), 1);

    const openStateModule = pathToFileURL(join(import.meta.dir, "../orchestrator-state/index.ts")).href;
    const openInChild = () => Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        'const { openState } = await import(process.env.SLICE5_OPEN_STATE_MODULE); const store = openState(process.env.SLICE5_STATE_DIR); store.db.close();',
      ],
      cwd: process.cwd(),
      env: { ...process.env, SLICE5_OPEN_STATE_MODULE: openStateModule, SLICE5_STATE_DIR: store.stateDir },
      stdout: "pipe",
      stderr: "pipe",
    });
    const children = [openInChild(), openInChild()];
    expect(await Promise.all(children.map((child) => child.exited))).toEqual([0, 0]);

    const replayed = openState(store.stateDir);
    stores.push(replayed);
    const firstEvents = eventsForSubject(replayed.db, "cycle", "cycle-1");
    expect(firstEvents.map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.save_point_failed",
    ]);
    expect(firstEvents[1]).toMatchObject({
      actor: "runner",
      causationId: "command-save-point-failed",
      correlationId: "cycle-1",
      payload: { replayed_from_spool: true, staleness_flag_raised: true },
    });
    expect(listSavePointFailureSpool(store.stateDir)[0]).toMatchObject({
      replay_event_id: firstEvents[1]!.eventId,
      replayed_at: expect.any(String),
    });
    expect(getCycleByUuid(replayed.db, "cycle-1")).toMatchObject({
      revision: 1,
      save_point_stale: true,
    });

    replayed.db.close();
    stores.splice(stores.indexOf(replayed), 1);
    const reopened = openState(store.stateDir);
    stores.push(reopened);
    expect(eventsForSubject(reopened.db, "cycle", "cycle-1")).toHaveLength(2);
  });

  test("records a remote application, cycle head, and active-run reference atomically", () => {
    const store = openTestStore();
    setupCycleFixture(store);
    const commits = commitInRunRepository(store, "published sync boundary");
    store.db.query("UPDATE cycles SET head_revision = ? WHERE cycle_uuid = 'cycle-1'").run(commits.priorHead);
    store.db.query("UPDATE runs SET head_revision = ? WHERE id = 'run-1'").run(commits.priorHead);
    recordSavePointAnchor(store, {
      actor: "runner",
      commandId: "command-prior-save-point",
      correlationId: "cycle-1",
      commitSha: commits.priorHead,
      gameId: "melee",
      savePointId: "save-point-before-sync",
      cycleUuid: "cycle-1",
      triggerKind: "epoch",
    });

    const entry = immediateTransaction(store.db, () => {
      const boundary = appendGameEvent(store.db, {
        actor: "operator",
        causationId: "command-publish-1",
        correlationId: "sync-1",
        eventType: "sync.boundary_published",
        occurredAt: "2026-08-13T12:00:00.000Z",
        payload: {
          upstream_revision: commits.newHead,
          knowledge_revision: "knowledge-1",
          invalidations: ["target-1"],
          validation_evidence: { result: "passed" },
        },
        gameId: "melee",
        ...eventSpan(newSpanId()),
        subjectId: "sync-1",
        subjectKind: "sync_workflow",
        traceId: "trace-sync-1",
      });
      return recordRemoteApplicationInTransaction(store.db, {
        actor: "operator",
        boundaryEventId: boundary.eventId,
        commandId: "command-publish-1",
        newHead: commits.newHead,
        occurredAt: "2026-08-13T12:00:00.000Z",
        priorHead: commits.priorHead,
        gameId: "melee",
        remoteApplicationId: "remote-application-1",
        resolvedConflicts: ["src/fighter.c"],
        runId: "run-1",
        scoreDelta: 0.125,
        cycleUuid: "cycle-1",
        syncId: "sync-1",
      });
    });

    expect(entry).toMatchObject({
      entry_kind: "remote_application",
      entry_id: "remote-application-1",
      payload: {
        prior_head: commits.priorHead,
        new_head: commits.newHead,
        resolved_conflicts: ["src/fighter.c"],
        score_delta: 0.125,
      },
    });
    expect(getCycleByUuid(store.db, "cycle-1")).toMatchObject({
      head_revision: commits.newHead,
      revision: 2,
      caused_by_event_id: entry.caused_by_event_id,
      save_point_stale: true,
    });
    const run = store.db
      .query("SELECT head_revision, revision, caused_by_event_id, remote_application_ids_json FROM runs WHERE id = 'run-1'")
      .get() as Record<string, unknown>;
    expect(run).toMatchObject({
      head_revision: commits.newHead,
      revision: 1,
      remote_application_ids_json: '["remote-application-1"]',
    });
    const runEvents = eventsForSubject(store.db, "run", "run-1");
    expect(runEvents.map((event) => event.eventType)).toEqual(["run.remote_applied"]);
    expect(run.caused_by_event_id).toBe(runEvents[0]?.eventId);
    expect(runEvents[0]?.causationId).toBe(String(entry.caused_by_event_id));
  });

  test("requires the publication transaction and rolls the complete boundary back loudly", () => {
    const store = openTestStore();
    setupCycleFixture(store);
    const commits = commitInRunRepository(store, "rolled back sync boundary");
    store.db.query("UPDATE cycles SET head_revision = ? WHERE cycle_uuid = 'cycle-1'").run(commits.priorHead);
    store.db.query("UPDATE runs SET head_revision = ? WHERE id = 'run-1'").run(commits.priorHead);
    const boundary = immediateTransaction(store.db, () =>
      appendGameEvent(store.db, {
        actor: "operator",
        causationId: "command-publish-outside",
        correlationId: "sync-outside",
        eventType: "sync.boundary_published",
        gameId: "melee",
        ...eventSpan(newSpanId()),
        payload: { upstream_revision: commits.newHead, knowledge_revision: "knowledge-1", invalidations: [], validation_evidence: { result: "passed" } },
        subjectId: "sync-outside",
        subjectKind: "sync_workflow",
        traceId: "trace-sync-outside",
      }),
    );
    expect(() =>
      recordRemoteApplicationInTransaction(store.db, {
        actor: "operator",
        boundaryEventId: boundary.eventId,
        commandId: "command-publish-outside",
        newHead: commits.newHead,
        priorHead: commits.priorHead,
        gameId: "melee",
        remoteApplicationId: "remote-outside",
        resolvedConflicts: [],
        syncId: "sync-outside",
      }),
    ).toThrow("requires an active transaction");

    expect(() =>
      immediateTransaction(store.db, () => {
        const rolledBackBoundary = appendGameEvent(store.db, {
          actor: "operator",
          causationId: "command-publish-rollback",
          correlationId: "sync-rollback",
          eventType: "sync.boundary_published",
          gameId: "melee",
          ...eventSpan(newSpanId()),
          payload: { upstream_revision: commits.newHead, knowledge_revision: "knowledge-1", invalidations: [], validation_evidence: { result: "passed" } },
          subjectId: "sync-rollback",
          subjectKind: "sync_workflow",
          traceId: "trace-sync-rollback",
        });
        recordRemoteApplicationInTransaction(store.db, {
          actor: "operator",
          boundaryEventId: rolledBackBoundary.eventId,
          commandId: "command-publish-rollback",
          newHead: commits.newHead,
          priorHead: commits.priorHead,
          gameId: "melee",
          remoteApplicationId: "remote-rollback",
          resolvedConflicts: [],
          syncId: "sync-rollback",
        });
        throw new Error("fail durable publication");
      }),
    ).toThrow("fail durable publication");

    expect(listCycleTimeline(store.db, "cycle-1")).toEqual([]);
    expect(getCycleByUuid(store.db, "cycle-1")).toMatchObject({
      head_revision: commits.priorHead,
      revision: 0,
    });
    expect(store.db.query("SELECT head_revision, revision, remote_application_ids_json FROM runs WHERE id = 'run-1'").get()).toEqual({
      head_revision: commits.priorHead,
      revision: 0,
      remote_application_ids_json: "[]",
    });
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([]);
    expect(eventsForSubject(store.db, "sync_workflow", "sync-rollback")).toEqual([]);
  });

  test("records the cycle boundary without a run when no run is active", () => {
    const store = openTestStore();
    setupCycleFixture(store);
    const commits = commitInRunRepository(store, "cycle-only sync boundary");
    store.db
      .query("UPDATE cycles SET head_revision = ?, active_run_id = NULL WHERE cycle_uuid = 'cycle-1'")
      .run(commits.priorHead);

    immediateTransaction(store.db, () => {
      const boundary = appendGameEvent(store.db, {
        actor: "operator",
        causationId: "command-cycle-only",
        correlationId: "sync-cycle-only",
        eventType: "sync.boundary_published",
        gameId: "melee",
        ...eventSpan(newSpanId()),
        payload: { upstream_revision: commits.newHead, knowledge_revision: "knowledge-1", invalidations: [], validation_evidence: { result: "passed" } },
        subjectId: "sync-cycle-only",
        subjectKind: "sync_workflow",
        traceId: "trace-sync-cycle-only",
      });
      recordRemoteApplicationInTransaction(store.db, {
        actor: "operator",
        boundaryEventId: boundary.eventId,
        commandId: "command-cycle-only",
        newHead: commits.newHead,
        priorHead: commits.priorHead,
        gameId: "melee",
        remoteApplicationId: "remote-cycle-only",
        repositoryRoot: commits.repoRoot,
        resolvedConflicts: [],
        runId: null,
        syncId: "sync-cycle-only",
      });
    });

    expect(getCycleByUuid(store.db, "cycle-1")).toMatchObject({ head_revision: commits.newHead, revision: 1 });
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([]);
    expect(store.db.query("SELECT revision, remote_application_ids_json FROM runs WHERE id = 'run-1'").get()).toEqual({
      revision: 0,
      remote_application_ids_json: "[]",
    });
  });

  test("records epoch integration result, timeline, head, and event atomically", () => {
    const store = openTestStore();
    const commitSha = setupCycleFixture(store);

    immediateTransaction(store.db, () => {
      store.db
        .query("INSERT INTO integrations (id, status, integrated_rev) VALUES (?, 'integrated', ?)")
        .run("integration-1", commitSha);
      recordEpochCompletedInTransaction(store.db, {
        gameId: "melee",
        epochId: "epoch-1",
        runId: "run-1",
        integrationCommit: commitSha,
        scoreDelta: 0.25,
        commandId: "command-epoch-1",
        correlationId: "run-1",
        actor: "runner",
        occurredAt: "2026-08-12T12:01:00.000Z",
      });
    });

    expect(store.db.query("SELECT integrated_rev FROM integrations WHERE id = 'integration-1'").get()).toEqual({
      integrated_rev: commitSha,
    });
    const first = listCycleTimeline(store.db, "cycle-1");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      entry_kind: "epoch_completed",
      entry_id: "epoch-1",
      payload: { integration_commit: commitSha, new_head: commitSha, score_delta: 0.25 },
    });
    const saved = getCycleByUuid(store.db, "cycle-1");
    expect(saved).toMatchObject({ head_revision: commitSha, revision: 1 });
    expect(saved?.caused_by_event_id).toBe(first[0]?.caused_by_event_id);
    expect(store.db.query("SELECT head_revision, revision, caused_by_event_id FROM runs WHERE id = 'run-1'").get()).toEqual({
      head_revision: commitSha,
      revision: 1,
      caused_by_event_id: first[0]?.caused_by_event_id,
    });
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([
      expect.objectContaining({
        correlationId: "run-1",
        traceId: "trace-run-1",
      }),
    ]);

    expect(() =>
      immediateTransaction(store.db, () => {
        store.db
          .query("INSERT INTO integrations (id, status, integrated_rev) VALUES (?, 'integrated', ?)")
          .run("integration-rollback", commitSha);
        recordEpochCompletedInTransaction(store.db, {
          gameId: "melee",
          epochId: "epoch-rollback",
          runId: "run-1",
          integrationCommit: commitSha,
          commandId: "command-epoch-rollback",
          correlationId: "run-1",
          actor: "runner",
        });
        throw new Error("fail the boundary");
      }),
    ).toThrow("fail the boundary");

    expect(store.db.query("SELECT 1 FROM integrations WHERE id = 'integration-rollback'").get()).toBeNull();
    expect(listCycleTimeline(store.db, "cycle-1")).toHaveLength(1);
    expect(eventsForSubject(store.db, "run", "run-1")).toHaveLength(1);
    expect(getCycleByUuid(store.db, "cycle-1")?.head_revision).toBe(commitSha);
  });

  test("reconstructs one run workflow timeline in game-event order", () => {
    const store = openTestStore();
    const commitSha = setupCycleFixture(store);
    initializeHarnessState(store, {
      gameId: "melee",
      traceId: "trace-game-melee",
      now: "2026-08-12T12:00:01.000Z",
    });
    const dispatch = requestDispatch(store, {
      gameId: "melee",
      kind: "run",
      workflowId: "run-1",
      reason: "timeline reconstruction",
      commandId: "command-run-dispatch",
      correlationId: "run-1",
      actor: "operator",
      now: "2026-08-12T12:00:02.000Z",
    });
    if (dispatch.queued) throw new Error("expected a free dispatch lease");
    const epoch = startSchedulerEpoch(store, "run-1", {
      workerPoolSize: 1,
    });
    closeSchedulerEpochWithEvidence(store, epoch.id, {
      status: "completed",
      boundaryStatus: "success",
      integration: {
        gameId: "melee",
        runId: "run-1",
        integrationCommit: commitSha,
        commandId: "command-epoch-integrated",
        correlationId: "run-1",
        occurredAt: "2026-08-12T12:01:00.000Z",
      },
      savePointEvidence: {
        status: "recorded",
        savePointId: "save-point-1",
        commitSha,
        triggerKind: "epoch",
        payload: { epoch_id: epoch.id, run_id: "run-1" },
      },
    });
    const closedEpoch = store.db.query("SELECT status FROM epochs WHERE id = ?").get(epoch.id) as { status: string };
    expect(closedEpoch.status).toBe("completed");
    releaseDispatch(store, {
      gameId: "melee",
      leaseId: dispatch.leaseId,
      commandId: "command-run-release",
      correlationId: "run-1",
      actor: "runner",
      now: "2026-08-12T12:02:00.000Z",
    });

    const lifecycleTypes = new Set([
      "game.dispatch_acquired",
      "run.epoch_integrated",
      "game.dispatch_released",
    ]);
    const lifecycle = listGameEvents(store.db, { gameId: "melee" }).filter(
      (event) => event.correlationId === "run-1" && lifecycleTypes.has(event.eventType),
    );
    expect(lifecycle.map((event) => event.eventType)).toEqual([
      "game.dispatch_acquired",
      "run.epoch_integrated",
      "game.dispatch_released",
    ]);
    expect(lifecycle.every((event) => event.spanId.trim().length > 0)).toBe(true);
    expect(lifecycle[1]?.spanId).not.toBe(lifecycle[2]?.spanId);
    const cycleLifecycle = listGameEvents(store.db, { gameId: "melee" }).filter(
      (event) => event.correlationId === "cycle-1",
    );
    expect(cycleLifecycle.map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.save_point_recorded",
    ]);
    expect(cycleLifecycle[1]).toMatchObject({
      actor: "runner",
      causationId: lifecycle[1]!.eventId,
      parentSpanId: lifecycle[1]!.parentSpanId,
    });
    expect(cycleLifecycle[1]!.spanId).not.toBe(lifecycle[1]!.spanId);
    expect(cycleLifecycle[0]?.payload).toMatchObject({
      baseline_revision: "base-sha",
      opening_sync_id: "sync-open-1",
    });
  });

  test("rejects a missing epoch commit without a partial write", () => {
    const store = openTestStore();
    setupCycleFixture(store);

    expect(() =>
      immediateTransaction(store.db, () => {
        store.db
          .query("INSERT INTO integrations (id, status, integrated_rev) VALUES (?, 'integrated', ?)")
          .run("integration-missing", "missing-commit");
        recordEpochCompletedInTransaction(store.db, {
          gameId: "melee",
          epochId: "epoch-missing",
          runId: "run-1",
          integrationCommit: "missing-commit",
          commandId: "command-epoch-missing",
          correlationId: "run-1",
          actor: "runner",
        });
      }),
    ).toThrow("does not exist in the repository");

    expect(store.db.query("SELECT 1 FROM integrations WHERE id = 'integration-missing'").get()).toBeNull();
    expect(listCycleTimeline(store.db, "cycle-1")).toEqual([]);
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([]);
    expect(getCycleByUuid(store.db, "cycle-1")).toMatchObject({ head_revision: "base-sha", revision: 0 });
  });

  test("rejects an old run after a newer cycle becomes active and rolls back the whole boundary", () => {
    const store = openTestStore();
    const commitSha = setupCycleFixture(store);
    const repoRoot = String(
      (store.db.query("SELECT game_repo_root FROM runs WHERE id = 'run-1'").get() as Record<string, unknown>)
        .game_repo_root,
    );
    const branchResult = Bun.spawnSync(["git", "-C", repoRoot, "branch", "--show-current"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const branch = new TextDecoder().decode(branchResult.stdout).trim();
    store.db
      .query("UPDATE cycles SET status = 'completed', closed_at = ? WHERE cycle_uuid = 'cycle-1'")
      .run("2026-08-12T12:02:00.000Z");
    store.db.query("UPDATE runs SET cycle_uuid = NULL WHERE id = 'run-1'").run();
    store.db
      .query(
        `INSERT INTO runs (
           id, goal_kind, goal_value, desired_workers, status, created_at,
           game_id, game_repo_root, cycle_uuid, head_revision
         ) VALUES (
           'run-2', 'matched_code_percent', 100, 1, 'active', '2026-08-12T12:03:00.000Z',
           'melee', ?, 'cycle-2', 'newer-base'
         )`,
      )
      .run(repoRoot);
    createCycle(store.db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-2",
      id: "cycle:cycle-2",
      baseSha: "newer-base",
      activeRunId: "run-2",
      commandId: "command-cycle-2-open",
      openingSyncId: "sync-open-2",
      traceId: "trace-cycle-2",
      worktreeIdentity: repoRoot,
      now: "2026-08-12T12:03:00.000Z",
    });
    preparePendingIntegration(store, {
      runId: "run-1",
      epochId: "epoch-old",
      branch,
      parentSha: commitSha,
    });
    const beforeCycle2 = getCycleByUuid(store.db, "cycle-2");
    const beforeRun1 = store.db
      .query("SELECT revision, head_revision, caused_by_event_id FROM runs WHERE id = 'run-1'")
      .get();

    expect(() =>
      immediateTransaction(store.db, () => {
        store.db
          .query("INSERT INTO integrations (id, status, integrated_rev) VALUES ('integration-old', 'integrated', ?)")
          .run(commitSha);
        recordEpochCompletedInTransaction(store.db, {
          gameId: "melee",
          epochId: "epoch-old",
          runId: "run-1",
          integrationCommit: commitSha,
          commandId: "command-epoch-old",
          correlationId: "run-1",
          actor: "runner",
        });
      }),
    ).toThrow("must resolve to exactly one game cycle");

    expect(store.db.query("SELECT 1 FROM integrations WHERE id = 'integration-old'").get()).toBeNull();
    expect(listCycleTimeline(store.db, "cycle-1")).toEqual([]);
    expect(listCycleTimeline(store.db, "cycle-2")).toEqual([]);
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([]);
    expect(getCycleByUuid(store.db, "cycle-2")).toEqual(beforeCycle2);
    expect(
      store.db.query("SELECT revision, head_revision, caused_by_event_id FROM runs WHERE id = 'run-1'").get(),
    ).toEqual(beforeRun1);
    expect(listPendingIntegrations(store).map((pending) => pending.epochId)).toEqual(["epoch-old"]);
  });

  test("resolves a null run cycle only through active_run_id and always advances the run CAS", () => {
    const store = openTestStore();
    const commitSha = setupCycleFixture(store);
    store.db.query("UPDATE runs SET cycle_uuid = NULL WHERE id = 'run-1'").run();

    immediateTransaction(store.db, () => {
      recordEpochCompletedInTransaction(store.db, {
        gameId: "melee",
        cycleUuid: "cycle-1",
        epochId: "epoch-null-cycle",
        runId: "run-1",
        integrationCommit: commitSha,
        commandId: "command-epoch-null-cycle",
        correlationId: "run-1",
        actor: "runner",
      });
    });

    const entry = listCycleTimeline(store.db, "cycle-1")[0];
    expect(getCycleByUuid(store.db, "cycle-1")).toMatchObject({ revision: 1, head_revision: commitSha });
    expect(store.db.query("SELECT revision, head_revision, caused_by_event_id FROM runs WHERE id = 'run-1'").get()).toEqual({
      revision: 1,
      head_revision: commitSha,
      caused_by_event_id: entry?.caused_by_event_id,
    });
  });

  test("save-point transitions write one same-transaction event and maintain blocker staleness", () => {
    const store = openTestStore();
    setupCycleFixture(store);

    const failed = recordSavePointFailure(store, {
      gameId: "melee",
      triggerKind: "epoch",
      sourceKind: "epoch",
      sourceId: "epoch-1",
      message: "artifact copy failed",
      commandId: "command-save-failed",
      correlationId: "cycle-1",
      actor: "runner",
      occurredAt: "2026-08-12T12:02:00.000Z",
    });
    expect(failed.save_point_stale).toBe(true);
    expect(failed.blockers_json).toContainEqual(
      expect.objectContaining({ code: "save_point_failed", source_kind: "epoch", source_id: "epoch-1" }),
    );
    expect(eventsForSubject(store.db, "cycle", "cycle-1").map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.save_point_failed",
    ]);

    const anchor = recordSavePointAnchor(store, {
      gameId: "melee",
      savePointId: "save-point-1",
      commitSha: "commit-1",
      triggerKind: "epoch",
      headlineScore: 98.5,
      commandId: "command-save-recorded",
      correlationId: "cycle-1",
      actor: "runner",
      occurredAt: "2026-08-12T12:03:00.000Z",
    });
    const saved = getCycleByUuid(store.db, "cycle-1");
    expect(saved?.save_point_stale).toBe(false);
    expect(saved?.blockers_json).toEqual([]);
    expect(saved?.caused_by_event_id).toBe(anchor.caused_by_event_id);
    expect(eventsForSubject(store.db, "cycle", "cycle-1").map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.save_point_failed",
      "cycle.save_point_recorded",
    ]);
  });
});

describe("cycle close", () => {
  test("is gated by the lease and orphanable unshipped work", () => {
    const store = openTestStore();
    setupCycleFixture(store);
    initializeHarnessState(store, {
      gameId: "melee",
      traceId: "trace-game-melee",
      now: "2026-08-12T12:00:00.000Z",
    });
    const dispatch = requestDispatch(store, {
      gameId: "melee",
      kind: "run",
      workflowId: "run-1",
      reason: "test",
      commandId: "command-dispatch",
      correlationId: "run-1",
      actor: "operator",
    });
    if (dispatch.queued) throw new Error("expected a free dispatch lease");

    const blockedByLease = closeCycle(store, {
      gameId: "melee",
      commandId: "command-close-lease",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
    });
    expect(blockedByLease).toMatchObject({
      closed: false,
      blockers: expect.arrayContaining([expect.objectContaining({ code: "dispatch_lease_held" })]),
    });
    expect(eventsForSubject(store.db, "cycle", "cycle-1").map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.blocked",
    ]);

    releaseDispatch(store, {
      gameId: "melee",
      leaseId: dispatch.leaseId,
      commandId: "command-release",
      correlationId: "run-1",
      actor: "operator",
    });
    const blockedByDirty = closeCycle(store, {
      gameId: "melee",
      commandId: "command-close-dirty",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: true,
      aheadOfBase: 0,
    });
    expect(blockedByDirty).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    const blockedByAhead = closeCycle(store, {
      gameId: "melee",
      commandId: "command-close-ahead",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 1,
    });
    expect(blockedByAhead).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });
    expect(getCycleByUuid(store.db, "cycle-1")?.revision).toBe(3);
    const cycleEvents = eventsForSubject(store.db, "cycle", "cycle-1");
    expect(cycleEvents.map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.blocked",
      "cycle.blockers_updated",
      "cycle.blockers_updated",
    ]);
    expect(cycleEvents.slice(1).map((event) => event.payload)).toEqual([
      {
        from_status: "active",
        to_status: "blocked",
        prior_status: "active",
        blocker_codes: ["dispatch_lease_held", "unshipped_work"],
        source_identities: [
          { source_kind: "game", source_id: "melee" },
          { source_kind: "cycle", source_id: "cycle-1" },
        ],
        recovery_choices: ["release_dispatch", "record_save_point"],
        state_revision: 1,
      },
      {
        added_blocker_codes: [],
        removed_blocker_codes: ["dispatch_lease_held"],
        blocker_codes: ["unshipped_work"],
        source_identities: [{ source_kind: "cycle", source_id: "cycle-1" }],
        recovery_choices: ["record_save_point"],
        state_revision: 2,
      },
      {
        added_blocker_codes: [],
        removed_blocker_codes: [],
        blocker_codes: ["unshipped_work"],
        source_identities: [{ source_kind: "cycle", source_id: "cycle-1" }],
        recovery_choices: ["record_save_point"],
        state_revision: 3,
      },
    ]);
  });

  test("rejects non-operator cycle close without accepting an event", () => {
    const store = openTestStore();
    setupCycleFixture(store);
    expect(() => closeCycle(store, {
      actor: "runner",
      aheadOfBase: 0,
      commandId: "command-runner-close",
      correlationId: "cycle-1",
      gameId: "melee",
      worktreeDirtyBeyondHead: false,
    })).toThrow("Cycle close is operator-only");
    expect(eventsForSubject(store.db, "cycle", "cycle-1").map((event) => event.eventType)).toEqual([
      "cycle.opened",
    ]);
  });

  test("closes against a named save point with exactly one event", () => {
    const store = openTestStore();
    setupCycleFixture(store);
    initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
    store.db
      .query("INSERT INTO campaigns (id, game_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
      .run("campaign-1", "melee", "origin/master", "2026-08-12T12:00:00.000Z");
    store.db
      .query(
        `INSERT INTO save_points (
           id, campaign_id, trigger_kind, label, commit_sha,
           worktree_dirty, committed, payload_json, created_at
         ) VALUES (?, ?, 'manual', ?, ?, 0, 0, '{}', ?)`,
      )
      .run("save-point-named", "campaign-1", "before close", "base-sha", "2026-08-12T12:01:00.000Z");
    expect(
      store.db
        .query(
          `SELECT save_points.id, campaigns.game_id, save_points.label, save_points.commit_sha
           FROM save_points JOIN campaigns ON campaigns.id = save_points.campaign_id`,
        )
        .all(),
    ).toEqual([
      { id: "save-point-named", game_id: "melee", label: "before close", commit_sha: "base-sha" },
    ]);
    recordSavePointAnchor(store, {
      gameId: "melee",
      savePointId: "save-point-named",
      commitSha: "base-sha",
      triggerKind: "manual",
      commandId: "command-save-before-close",
      correlationId: "cycle-1",
      actor: "operator",
      occurredAt: "2026-08-12T12:01:00.000Z",
    });

    const decision = closeCycle(store, {
      gameId: "melee",
      commandId: "command-close",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 3,
      namedSavePointId: "save-point-named",
      occurredAt: "2026-08-12T12:02:00.000Z",
    });
    expect(decision).toMatchObject({
      closed: true,
      cycle: { status: "closed", revision: 3, closed_at: "2026-08-12T12:02:00.000Z" },
    });
    const events = eventsForSubject(store.db, "cycle", "cycle-1");
    expect(events.map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.save_point_recorded",
      "cycle.closing",
      "cycle.closed",
    ]);
    if (!decision.closed) throw new Error("cycle close unexpectedly blocked");
    expect(events[2]?.payload).toEqual({ from_status: "active", to_status: "closing" });
    expect(decision.cycle.caused_by_event_id).toBe(events[3]?.eventId);
  });

  test("refuses stale, dirty, unnamed, and capture-failed close evidence without a close event", () => {
    const store = openTestStore();
    setupCycleFixture(store);
    initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
    store.db
      .query("INSERT INTO campaigns (id, game_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
      .run("campaign-close-gates", "melee", "origin/master", "2026-08-12T12:00:00.000Z");
    const addAnchor = (id: string, label: string | null, commitSha: string, at: string): void => {
      store.db
        .query(
          `INSERT INTO save_points (
             id, campaign_id, trigger_kind, label, commit_sha,
             worktree_dirty, committed, payload_json, created_at
           ) VALUES (?, 'campaign-close-gates', 'manual', ?, ?, 0, 0, '{}', ?)`,
        )
        .run(id, label, commitSha, at);
      recordSavePointAnchor(store, {
        gameId: "melee",
        savePointId: id,
        commitSha,
        triggerKind: "manual",
        commandId: `command-${id}`,
        correlationId: "cycle-1",
        actor: "operator",
        occurredAt: at,
      });
    };

    addAnchor("save-drift", "named drift", "commit-a", "2026-08-12T12:01:00.000Z");
    expect(closeCycle(store, {
      gameId: "melee",
      commandId: "command-close-drift",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-drift",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    addAnchor("save-unnamed", null, "base-sha", "2026-08-12T12:02:00.000Z");
    expect(closeCycle(store, {
      gameId: "melee",
      commandId: "command-close-unnamed",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-unnamed",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    addAnchor("save-fresh", "fresh", "base-sha", "2026-08-12T12:03:00.000Z");
    expect(closeCycle(store, {
      gameId: "melee",
      commandId: "command-close-dirty",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: true,
      aheadOfBase: 0,
      namedSavePointId: "save-fresh",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    recordSavePointFailure(store, {
      gameId: "melee",
      triggerKind: "manual",
      sourceKind: "save_point_boundary",
      sourceId: "manual",
      message: "capture failed",
      commandId: "command-capture-failed",
      correlationId: "cycle-1",
      actor: "operator",
      occurredAt: "2026-08-12T12:04:00.000Z",
    });
    expect(closeCycle(store, {
      gameId: "melee",
      commandId: "command-close-capture-failed",
      correlationId: "cycle-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-fresh",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    expect(eventsForSubject(store.db, "cycle", "cycle-1").some((event) => event.eventType === "cycle.closed")).toBe(false);
    expect(getCycleByUuid(store.db, "cycle-1")?.status).toBe("blocked");
  });
});
