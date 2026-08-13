import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { eventsForSubject, listProjectEvents } from "@server/core/project-state/events.js";
import { closeSchedulerEpochWithEvidence, startSchedulerEpoch } from "@server/core/session-runtime/run-state";
import { createProjectSession, getProjectSessionByUuid } from "./store.js";
import { listPendingIntegrations, preparePendingIntegration } from "./pending-integrations.js";
import {
  closeProjectSession,
  listSessionTimeline,
  recordEpochCompletedInTransaction,
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
         project_id, project_repo_root, session_uuid, head_revision
       ) VALUES (
         'run-1', 'matched_code_percent', 100, 1, 'active', '2026-08-12T12:00:00.000Z',
         'melee', ?, 'session-1', 'base-sha'
       )`,
    )
    .run(repoRoot);
  createProjectSession(store.db, {
    projectId: "melee",
    sessionUuid: "session-1",
    id: "project-session:session-1",
    baseSha: "base-sha",
    activeRunId: "run-1",
    correlationId: "run-1",
    commandId: "command-session-open",
    openingSyncId: "sync-open-1",
    traceId: "trace-session-1",
    worktreeIdentity: repoRoot,
    now: "2026-08-12T12:00:00.000Z",
  });
  return commitSha;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("project session timeline", () => {
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
    expect(eventsForSubject(store.db, "run", "run-1")).toHaveLength(1);

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
      workflowCorrelationId: "run-1",
      integration: {
        projectId: "melee",
        runId: "run-1",
        integrationCommit: commitSha,
        commandId: "command-epoch-integrated",
        correlationId: "epoch-wrong-correlation-is-overridden",
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
      "session.opened",
      "project.dispatch_acquired",
      "run.epoch_integrated",
      "session.save_point_recorded",
      "project.dispatch_released",
    ]);
    const lifecycle = listProjectEvents(store.db, { projectId: "melee" }).filter(
      (event) => event.correlationId === "run-1" && lifecycleTypes.has(event.eventType),
    );
    expect(lifecycle.map((event) => event.eventType)).toEqual([
      "session.opened",
      "project.dispatch_acquired",
      "run.epoch_integrated",
      "session.save_point_recorded",
      "project.dispatch_released",
    ]);
    expect(lifecycle.every((event) => event.spanId.trim().length > 0)).toBe(true);
    expect(lifecycle[2]?.spanId).not.toBe(lifecycle[3]?.spanId);
    expect(lifecycle[0]?.payload).toMatchObject({
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
      projectId: "melee",
      sessionUuid: "session-2",
      id: "project-session:session-2",
      baseSha: "newer-base",
      activeRunId: "run-2",
      correlationId: "run-2",
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
      actor: "operator",
    });
    if (dispatch.queued) throw new Error("expected a free dispatch lease");

    const blockedByLease = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-lease",
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
    ]);

    releaseDispatch(store, {
      projectId: "melee",
      leaseId: dispatch.leaseId,
      commandId: "command-release",
      actor: "operator",
    });
    const blockedByDirty = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-dirty",
      actor: "operator",
      worktreeDirtyBeyondHead: true,
      aheadOfBase: 0,
    });
    expect(blockedByDirty).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    const blockedByAhead = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-ahead",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 1,
    });
    expect(blockedByAhead).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });
    expect(getProjectSessionByUuid(store.db, "session-1")?.revision).toBe(0);
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
      actor: "operator",
      occurredAt: "2026-08-12T12:01:00.000Z",
    });

    const decision = closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 3,
      namedSavePointId: "save-point-named",
      occurredAt: "2026-08-12T12:02:00.000Z",
    });
    expect(decision).toMatchObject({
      closed: true,
      session: { status: "closed", revision: 2, closed_at: "2026-08-12T12:02:00.000Z" },
    });
    const events = eventsForSubject(store.db, "session", "session-1");
    expect(events.map((event) => event.eventType)).toEqual([
      "session.opened",
      "session.save_point_recorded",
      "session.closed",
    ]);
    if (!decision.closed) throw new Error("session close unexpectedly blocked");
    expect(decision.session.caused_by_event_id).toBe(events[2]?.eventId);
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
        actor: "operator",
        occurredAt: at,
      });
    };

    addAnchor("save-drift", "named drift", "commit-a", "2026-08-12T12:01:00.000Z");
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-drift",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-drift",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    addAnchor("save-unnamed", null, "base-sha", "2026-08-12T12:02:00.000Z");
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-unnamed",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-unnamed",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    addAnchor("save-fresh", "fresh", "base-sha", "2026-08-12T12:03:00.000Z");
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-dirty",
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
      actor: "operator",
      occurredAt: "2026-08-12T12:04:00.000Z",
    });
    expect(closeProjectSession(store, {
      projectId: "melee",
      commandId: "command-close-capture-failed",
      actor: "operator",
      worktreeDirtyBeyondHead: false,
      aheadOfBase: 0,
      namedSavePointId: "save-fresh",
    })).toMatchObject({ closed: false, blockers: [{ code: "unshipped_work" }] });

    expect(eventsForSubject(store.db, "session", "session-1").some((event) => event.eventType === "session.closed")).toBe(false);
    expect(getProjectSessionByUuid(store.db, "session-1")?.status).toBe("active");
  });
});
