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
  initializeProjectState,
  releaseDispatch,
  requestDispatch,
} from "@server/core/project-state";
import { appendProjectEvent, eventSpan, eventsForSubject, listProjectEvents, newSpanId } from "@server/core/project-state/events.js";
import { closeSchedulerEpochWithEvidence, startSchedulerEpoch } from "@server/core/session-runtime/run-state";
import { createProjectSession, getProjectSessionByUuid } from "./store.js";
import { listPendingIntegrations, preparePendingIntegration } from "./pending-integrations.js";
import { listSavePointFailureSpool, spoolSavePointFailure } from "./save-point-failure-spool.js";
import {
  closeProjectSession,
  listSessionTimeline,
  recordEpochCompletedInTransaction,
  recordRemoteApplicationInTransaction,
  recordSavePointAnchor,
  recordSavePointFailure,
} from "./timeline.js";

const stores: StateStore[] = [];
const tempDirs: string[] = [];

function openTestStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "project-session-timeline-"));
  tempDirs.push(dir);
  const store = openState(dir);
  stores.push(store);
  return store;
}

function createSession(store: StateStore): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "project-session-timeline-repo-"));
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
         project_id, project_repo_root, session_uuid, head_revision, trace_id
       ) VALUES (
         'run-1', 'matched_code_percent', 100, 1, 'active', '2026-08-12T12:00:00.000Z',
         'melee', ?, 'session-1', 'base-sha', 'trace-run-1'
       )`,
    )
    .run(repoRoot);
  createProjectSession(store.db, {
    actor: "operator",
    projectId: "melee",
    sessionUuid: "session-1",
    id: "project-session:session-1",
    baseSha: "base-sha",
    activeRunId: "run-1",
    commandId: "command-session-open",
    openingSyncId: "sync-open-1",
    traceId: "trace-session-1",
    worktreeIdentity: repoRoot,
    now: "2026-08-12T12:00:00.000Z",
  });
  return commitSha;
}

function commitInRunRepository(store: StateStore, message: string): { priorHead: string; newHead: string; repoRoot: string } {
  const run = store.db
    .query("SELECT project_repo_root FROM runs WHERE id = 'run-1'")
    .get() as { project_repo_root: string };
  const prior = Bun.spawnSync(["git", "-C", run.project_repo_root, "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (prior.exitCode !== 0) throw new Error(new TextDecoder().decode(prior.stderr));
  const priorHead = new TextDecoder().decode(prior.stdout).trim();
  const committed = Bun.spawnSync(
    [
      "git",
      "-C",
      run.project_repo_root,
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
  const next = Bun.spawnSync(["git", "-C", run.project_repo_root, "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (next.exitCode !== 0) throw new Error(new TextDecoder().decode(next.stderr));
  return {
    priorHead,
    newHead: new TextDecoder().decode(next.stdout).trim(),
    repoRoot: run.project_repo_root,
  };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("project session timeline", () => {
  test("replays a spooled save-point failure exactly once across concurrent and repeated opens", async () => {
    const store = openTestStore();
    createSession(store);
    spoolSavePointFailure(store.stateDir, {
      occurred_at: "2026-08-13T12:00:00.000Z",
      project_id: "melee",
      session_uuid: "session-1",
      trigger_kind: "epoch",
      source_kind: "run",
      source_id: "run-1",
      message: "save-point write failed",
      command_id: "command-save-point-failed",
      causation_id: null,
      correlation_id: "session-1",
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
    const firstEvents = eventsForSubject(replayed.db, "session", "session-1");
    expect(firstEvents.map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.save_point_failed",
    ]);
    expect(firstEvents[1]).toMatchObject({
      actor: "runner",
      causationId: "command-save-point-failed",
      correlationId: "session-1",
      payload: { replayed_from_spool: true, staleness_flag_raised: true },
    });
    expect(listSavePointFailureSpool(store.stateDir)[0]).toMatchObject({
      replay_event_id: firstEvents[1]!.eventId,
      replayed_at: expect.any(String),
    });
    expect(getProjectSessionByUuid(replayed.db, "session-1")).toMatchObject({
      revision: 1,
      save_point_stale: true,
    });

    replayed.db.close();
    stores.splice(stores.indexOf(replayed), 1);
    const reopened = openState(store.stateDir);
    stores.push(reopened);
    expect(eventsForSubject(reopened.db, "session", "session-1")).toHaveLength(2);
  });

  test("records a remote application, session head, and active-run reference atomically", () => {
    const store = openTestStore();
    createSession(store);
    const commits = commitInRunRepository(store, "published sync boundary");
    store.db.query("UPDATE project_sessions SET head_revision = ? WHERE session_uuid = 'session-1'").run(commits.priorHead);
    store.db.query("UPDATE runs SET head_revision = ? WHERE id = 'run-1'").run(commits.priorHead);
    recordSavePointAnchor(store, {
      actor: "runner",
      commandId: "command-prior-save-point",
      correlationId: "session-1",
      commitSha: commits.priorHead,
      projectId: "melee",
      savePointId: "save-point-before-sync",
      sessionUuid: "session-1",
      triggerKind: "epoch",
    });

    const entry = immediateTransaction(store.db, () => {
      const boundary = appendProjectEvent(store.db, {
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
        projectId: "melee",
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
        projectId: "melee",
        remoteApplicationId: "remote-application-1",
        resolvedConflicts: ["src/fighter.c"],
        runId: "run-1",
        scoreDelta: 0.125,
        sessionUuid: "session-1",
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
    expect(getProjectSessionByUuid(store.db, "session-1")).toMatchObject({
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
    createSession(store);
    const commits = commitInRunRepository(store, "rolled back sync boundary");
    store.db.query("UPDATE project_sessions SET head_revision = ? WHERE session_uuid = 'session-1'").run(commits.priorHead);
    store.db.query("UPDATE runs SET head_revision = ? WHERE id = 'run-1'").run(commits.priorHead);
    const boundary = immediateTransaction(store.db, () =>
      appendProjectEvent(store.db, {
        actor: "operator",
        causationId: "command-publish-outside",
        correlationId: "sync-outside",
        eventType: "sync.boundary_published",
        projectId: "melee",
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
        projectId: "melee",
        remoteApplicationId: "remote-outside",
        resolvedConflicts: [],
        syncId: "sync-outside",
      }),
    ).toThrow("requires an active transaction");

    expect(() =>
      immediateTransaction(store.db, () => {
        const rolledBackBoundary = appendProjectEvent(store.db, {
          actor: "operator",
          causationId: "command-publish-rollback",
          correlationId: "sync-rollback",
          eventType: "sync.boundary_published",
          projectId: "melee",
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
          projectId: "melee",
          remoteApplicationId: "remote-rollback",
          resolvedConflicts: [],
          syncId: "sync-rollback",
        });
        throw new Error("fail durable publication");
      }),
    ).toThrow("fail durable publication");

    expect(listSessionTimeline(store.db, "session-1")).toEqual([]);
    expect(getProjectSessionByUuid(store.db, "session-1")).toMatchObject({
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

  test("records the session boundary without a run when no run is active", () => {
    const store = openTestStore();
    createSession(store);
    const commits = commitInRunRepository(store, "session-only sync boundary");
    store.db
      .query("UPDATE project_sessions SET head_revision = ?, active_run_id = NULL WHERE session_uuid = 'session-1'")
      .run(commits.priorHead);

    immediateTransaction(store.db, () => {
      const boundary = appendProjectEvent(store.db, {
        actor: "operator",
        causationId: "command-session-only",
        correlationId: "sync-session-only",
        eventType: "sync.boundary_published",
        projectId: "melee",
        ...eventSpan(newSpanId()),
        payload: { upstream_revision: commits.newHead, knowledge_revision: "knowledge-1", invalidations: [], validation_evidence: { result: "passed" } },
        subjectId: "sync-session-only",
        subjectKind: "sync_workflow",
        traceId: "trace-sync-session-only",
      });
      recordRemoteApplicationInTransaction(store.db, {
        actor: "operator",
        boundaryEventId: boundary.eventId,
        commandId: "command-session-only",
        newHead: commits.newHead,
        priorHead: commits.priorHead,
        projectId: "melee",
        remoteApplicationId: "remote-session-only",
        repositoryRoot: commits.repoRoot,
        resolvedConflicts: [],
        runId: null,
        syncId: "sync-session-only",
      });
    });

    expect(getProjectSessionByUuid(store.db, "session-1")).toMatchObject({ head_revision: commits.newHead, revision: 1 });
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([]);
    expect(store.db.query("SELECT revision, remote_application_ids_json FROM runs WHERE id = 'run-1'").get()).toEqual({
      revision: 0,
      remote_application_ids_json: "[]",
    });
  });

  test("records epoch integration result, timeline, head, and event atomically", () => {
    const store = openTestStore();
    const commitSha = createSession(store);

    immediateTransaction(store.db, () => {
      store.db
        .query("INSERT INTO integrations (id, status, integrated_rev) VALUES (?, 'integrated', ?)")
        .run("integration-1", commitSha);
      recordEpochCompletedInTransaction(store.db, {
        projectId: "melee",
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
    const first = listSessionTimeline(store.db, "session-1");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      entry_kind: "epoch_completed",
      entry_id: "epoch-1",
      payload: { integration_commit: commitSha, new_head: commitSha, score_delta: 0.25 },
    });
    const saved = getProjectSessionByUuid(store.db, "session-1");
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
          projectId: "melee",
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
    expect(listSessionTimeline(store.db, "session-1")).toHaveLength(1);
    expect(eventsForSubject(store.db, "run", "run-1")).toHaveLength(1);
    expect(getProjectSessionByUuid(store.db, "session-1")?.head_revision).toBe(commitSha);
  });

  test("reconstructs one run workflow timeline in project-event order", () => {
    const store = openTestStore();
    const commitSha = createSession(store);
    initializeProjectState(store, {
      projectId: "melee",
      traceId: "trace-project-melee",
      now: "2026-08-12T12:00:01.000Z",
    });
    const dispatch = requestDispatch(store, {
      projectId: "melee",
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
      size: { mode: "fixed", value: 1 },
      workerPoolSize: 1,
      candidateWindow: 1,
    });
    closeSchedulerEpochWithEvidence(store, epoch.id, {
      status: "completed",
      boundaryStatus: "success",
      integration: {
        projectId: "melee",
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
    releaseDispatch(store, {
      projectId: "melee",
      leaseId: dispatch.leaseId,
      commandId: "command-run-release",
      correlationId: "run-1",
      actor: "runner",
      now: "2026-08-12T12:02:00.000Z",
    });

    const lifecycleTypes = new Set([
      "project.dispatch_acquired",
      "run.epoch_integrated",
      "project.dispatch_released",
    ]);
    const lifecycle = listProjectEvents(store.db, { projectId: "melee" }).filter(
      (event) => event.correlationId === "run-1" && lifecycleTypes.has(event.eventType),
    );
    expect(lifecycle.map((event) => event.eventType)).toEqual([
      "project.dispatch_acquired",
      "run.epoch_integrated",
      "project.dispatch_released",
    ]);
    expect(lifecycle.every((event) => event.spanId.trim().length > 0)).toBe(true);
    expect(lifecycle[1]?.spanId).not.toBe(lifecycle[2]?.spanId);
    const sessionLifecycle = listProjectEvents(store.db, { projectId: "melee" }).filter(
      (event) => event.correlationId === "session-1",
    );
    expect(sessionLifecycle.map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.save_point_recorded",
    ]);
    expect(sessionLifecycle[1]).toMatchObject({
      actor: "runner",
      causationId: lifecycle[1]!.eventId,
      parentSpanId: lifecycle[1]!.parentSpanId,
    });
    expect(sessionLifecycle[1]!.spanId).not.toBe(lifecycle[1]!.spanId);
    expect(sessionLifecycle[0]?.payload).toMatchObject({
      baseline_revision: "base-sha",
      opening_sync_id: "sync-open-1",
    });
  });

  test("rejects a missing epoch commit without a partial write", () => {
    const store = openTestStore();
    createSession(store);

    expect(() =>
      immediateTransaction(store.db, () => {
        store.db
          .query("INSERT INTO integrations (id, status, integrated_rev) VALUES (?, 'integrated', ?)")
          .run("integration-missing", "missing-commit");
        recordEpochCompletedInTransaction(store.db, {
          projectId: "melee",
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
    expect(listSessionTimeline(store.db, "session-1")).toEqual([]);
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([]);
    expect(getProjectSessionByUuid(store.db, "session-1")).toMatchObject({ head_revision: "base-sha", revision: 0 });
  });

  test("rejects an old run after a newer session becomes active and rolls back the whole boundary", () => {
    const store = openTestStore();
    const commitSha = createSession(store);
    const repoRoot = String(
      (store.db.query("SELECT project_repo_root FROM runs WHERE id = 'run-1'").get() as Record<string, unknown>)
        .project_repo_root,
    );
    const branchResult = Bun.spawnSync(["git", "-C", repoRoot, "branch", "--show-current"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const branch = new TextDecoder().decode(branchResult.stdout).trim();
    store.db
      .query("UPDATE project_sessions SET status = 'completed', closed_at = ? WHERE session_uuid = 'session-1'")
      .run("2026-08-12T12:02:00.000Z");
    store.db.query("UPDATE runs SET session_uuid = NULL WHERE id = 'run-1'").run();
    store.db
      .query(
        `INSERT INTO runs (
           id, goal_kind, goal_value, desired_workers, status, created_at,
           project_id, project_repo_root, session_uuid, head_revision
         ) VALUES (
           'run-2', 'matched_code_percent', 100, 1, 'active', '2026-08-12T12:03:00.000Z',
           'melee', ?, 'session-2', 'newer-base'
         )`,
      )
      .run(repoRoot);
    createProjectSession(store.db, {
      actor: "operator",
      projectId: "melee",
      sessionUuid: "session-2",
      id: "project-session:session-2",
      baseSha: "newer-base",
      activeRunId: "run-2",
      commandId: "command-session-2-open",
      openingSyncId: "sync-open-2",
      traceId: "trace-session-2",
      worktreeIdentity: repoRoot,
      now: "2026-08-12T12:03:00.000Z",
    });
    preparePendingIntegration(store, {
      runId: "run-1",
      epochId: "epoch-old",
      branch,
      parentSha: commitSha,
    });
    const beforeSession2 = getProjectSessionByUuid(store.db, "session-2");
    const beforeRun1 = store.db
      .query("SELECT revision, head_revision, caused_by_event_id FROM runs WHERE id = 'run-1'")
      .get();

    expect(() =>
      immediateTransaction(store.db, () => {
        store.db
          .query("INSERT INTO integrations (id, status, integrated_rev) VALUES ('integration-old', 'integrated', ?)")
          .run(commitSha);
        recordEpochCompletedInTransaction(store.db, {
          projectId: "melee",
          epochId: "epoch-old",
          runId: "run-1",
          integrationCommit: commitSha,
          commandId: "command-epoch-old",
          correlationId: "run-1",
          actor: "runner",
        });
      }),
    ).toThrow("must resolve to exactly one project session");

    expect(store.db.query("SELECT 1 FROM integrations WHERE id = 'integration-old'").get()).toBeNull();
    expect(listSessionTimeline(store.db, "session-1")).toEqual([]);
    expect(listSessionTimeline(store.db, "session-2")).toEqual([]);
    expect(eventsForSubject(store.db, "run", "run-1")).toEqual([]);
    expect(getProjectSessionByUuid(store.db, "session-2")).toEqual(beforeSession2);
    expect(
      store.db.query("SELECT revision, head_revision, caused_by_event_id FROM runs WHERE id = 'run-1'").get(),
    ).toEqual(beforeRun1);
    expect(listPendingIntegrations(store).map((pending) => pending.epochId)).toEqual(["epoch-old"]);
  });

  test("resolves a null run session only through active_run_id and always advances the run CAS", () => {
    const store = openTestStore();
    const commitSha = createSession(store);
    store.db.query("UPDATE runs SET session_uuid = NULL WHERE id = 'run-1'").run();

    immediateTransaction(store.db, () => {
      recordEpochCompletedInTransaction(store.db, {
        projectId: "melee",
        sessionUuid: "session-1",
        epochId: "epoch-null-session",
        runId: "run-1",
        integrationCommit: commitSha,
        commandId: "command-epoch-null-session",
        correlationId: "run-1",
        actor: "runner",
      });
    });

    const entry = listSessionTimeline(store.db, "session-1")[0];
    expect(getProjectSessionByUuid(store.db, "session-1")).toMatchObject({ revision: 1, head_revision: commitSha });
    expect(store.db.query("SELECT revision, head_revision, caused_by_event_id FROM runs WHERE id = 'run-1'").get()).toEqual({
      revision: 1,
      head_revision: commitSha,
      caused_by_event_id: entry?.caused_by_event_id,
    });
  });

  test("save-point transitions write one same-transaction event and maintain blocker staleness", () => {
    const store = openTestStore();
    createSession(store);

    const failed = recordSavePointFailure(store, {
      projectId: "melee",
      triggerKind: "epoch",
      sourceKind: "epoch",
      sourceId: "epoch-1",
      message: "artifact copy failed",
      commandId: "command-save-failed",
      correlationId: "session-1",
      actor: "runner",
      occurredAt: "2026-08-12T12:02:00.000Z",
    });
    expect(failed.save_point_stale).toBe(true);
    expect(failed.blockers_json).toContainEqual(
      expect.objectContaining({ code: "save_point_failed", source_kind: "epoch", source_id: "epoch-1" }),
    );
    expect(eventsForSubject(store.db, "session", "session-1").map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.save_point_failed",
    ]);

    const anchor = recordSavePointAnchor(store, {
      projectId: "melee",
      savePointId: "save-point-1",
      commitSha: "commit-1",
      triggerKind: "epoch",
      headlineScore: 98.5,
      commandId: "command-save-recorded",
      correlationId: "session-1",
      actor: "runner",
      occurredAt: "2026-08-12T12:03:00.000Z",
    });
    const saved = getProjectSessionByUuid(store.db, "session-1");
    expect(saved?.save_point_stale).toBe(false);
    expect(saved?.blockers_json).toEqual([]);
    expect(saved?.caused_by_event_id).toBe(anchor.caused_by_event_id);
    expect(eventsForSubject(store.db, "session", "session-1").map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.save_point_failed",
      "session.save_point_recorded",
    ]);
  });
});

describe("session close", () => {
  test("is gated by the lease and orphanable unshipped work", () => {
    const store = openTestStore();
    createSession(store);
    initializeProjectState(store, {
      projectId: "melee",
      traceId: "trace-project-melee",
      now: "2026-08-12T12:00:00.000Z",
    });
    const dispatch = requestDispatch(store, {
      projectId: "melee",
      kind: "run",
      workflowId: "run-1",
      reason: "test",
      commandId: "command-dispatch",
      correlationId: "run-1",
      actor: "operator",
    });
    if (dispatch.queued) throw new Error("expected a free dispatch lease");

    const blockedByLease = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-lease",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
    });
    expect(blockedByLease).toMatchObject({
      closed: false,
      blockers: expect.arrayContaining([expect.objectContaining({ code: "dispatch_lease_held" })]),
    });
    expect(eventsForSubject(store.db, "session", "session-1").map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.blocked",
    ]);

    releaseDispatch(store, {
      projectId: "melee",
      leaseId: dispatch.leaseId,
      commandId: "command-release",
      correlationId: "run-1",
      actor: "operator",
    });
    const blockedByDirty = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-dirty",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: true,
      aheadOfBase: 0,
    });
    expect(blockedByDirty).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    const blockedByAhead = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-ahead",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 1,
    });
    expect(blockedByAhead).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });
    expect(getProjectSessionByUuid(store.db, "session-1")?.revision).toBe(3);
    const sessionEvents = eventsForSubject(store.db, "session", "session-1");
    expect(sessionEvents.map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.blocked",
      "session.blockers_updated",
      "session.blockers_updated",
    ]);
    expect(sessionEvents.slice(1).map((event) => event.payload)).toEqual([
      {
        from_status: "active",
        to_status: "blocked",
        prior_status: "active",
        blocker_codes: ["dispatch_lease_held", "unshipped_work"],
        source_identities: [
          { source_kind: "project", source_id: "melee" },
          { source_kind: "session", source_id: "session-1" },
        ],
        recovery_choices: ["release_dispatch", "record_save_point"],
        state_revision: 1,
      },
      {
        added_blocker_codes: [],
        removed_blocker_codes: ["dispatch_lease_held"],
        blocker_codes: ["unshipped_work"],
        source_identities: [{ source_kind: "session", source_id: "session-1" }],
        recovery_choices: ["record_save_point"],
        state_revision: 2,
      },
      {
        added_blocker_codes: [],
        removed_blocker_codes: [],
        blocker_codes: ["unshipped_work"],
        source_identities: [{ source_kind: "session", source_id: "session-1" }],
        recovery_choices: ["record_save_point"],
        state_revision: 3,
      },
    ]);
  });

  test("rejects non-operator session close without accepting an event", () => {
    const store = openTestStore();
    createSession(store);
    expect(() => closeProjectSession(store, {
      actor: "runner",
      aheadOfBase: 0,
      commandId: "command-runner-close",
      correlationId: "session-1",
      projectId: "melee",
      worktreeDirtyBeyondHead: false,
    })).toThrow("Session close is operator-only");
    expect(eventsForSubject(store.db, "session", "session-1").map((event) => event.eventType)).toEqual([
      "session.opened",
    ]);
  });

  test("closes against a named save point with exactly one event", () => {
    const store = openTestStore();
    createSession(store);
    initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
    store.db
      .query("INSERT INTO campaigns (id, project_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
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
          `SELECT save_points.id, campaigns.project_id, save_points.label, save_points.commit_sha
           FROM save_points JOIN campaigns ON campaigns.id = save_points.campaign_id`,
        )
        .all(),
    ).toEqual([
      { id: "save-point-named", project_id: "melee", label: "before close", commit_sha: "base-sha" },
    ]);
    recordSavePointAnchor(store, {
      projectId: "melee",
      savePointId: "save-point-named",
      commitSha: "base-sha",
      triggerKind: "manual",
      commandId: "command-save-before-close",
      correlationId: "session-1",
      actor: "operator",
      occurredAt: "2026-08-12T12:01:00.000Z",
    });

    const decision = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 3,
      namedSavePointId: "save-point-named",
      occurredAt: "2026-08-12T12:02:00.000Z",
    });
    expect(decision).toMatchObject({
      closed: true,
      session: { status: "closed", revision: 3, closed_at: "2026-08-12T12:02:00.000Z" },
    });
    const events = eventsForSubject(store.db, "session", "session-1");
    expect(events.map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.save_point_recorded",
      "session.closing",
      "session.closed",
    ]);
    if (!decision.closed) throw new Error("session close unexpectedly blocked");
    expect(events[2]?.payload).toEqual({ from_status: "active", to_status: "closing" });
    expect(decision.session.caused_by_event_id).toBe(events[3]?.eventId);
  });

  test("refuses stale, dirty, unnamed, and capture-failed close evidence without a close event", () => {
    const store = openTestStore();
    createSession(store);
    initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
    store.db
      .query("INSERT INTO campaigns (id, project_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
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
        projectId: "melee",
        savePointId: id,
        commitSha,
        triggerKind: "manual",
        commandId: `command-${id}`,
        correlationId: "session-1",
        actor: "operator",
        occurredAt: at,
      });
    };

    addAnchor("save-drift", "named drift", "commit-a", "2026-08-12T12:01:00.000Z");
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-drift",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-drift",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    addAnchor("save-unnamed", null, "base-sha", "2026-08-12T12:02:00.000Z");
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-unnamed",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-unnamed",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    addAnchor("save-fresh", "fresh", "base-sha", "2026-08-12T12:03:00.000Z");
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-dirty",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: true,
      aheadOfBase: 0,
      namedSavePointId: "save-fresh",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    recordSavePointFailure(store, {
      projectId: "melee",
      triggerKind: "manual",
      sourceKind: "save_point_boundary",
      sourceId: "manual",
      message: "capture failed",
      commandId: "command-capture-failed",
      correlationId: "session-1",
      actor: "operator",
      occurredAt: "2026-08-12T12:04:00.000Z",
    });
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-capture-failed",
      correlationId: "session-1",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-fresh",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    expect(eventsForSubject(store.db, "session", "session-1").some((event) => event.eventType === "session.closed")).toBe(false);
    expect(getProjectSessionByUuid(store.db, "session-1")?.status).toBe("blocked");
  });
});
