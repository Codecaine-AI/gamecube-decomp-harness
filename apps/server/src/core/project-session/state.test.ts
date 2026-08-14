import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { openState } from "@server/core/orchestrator-state";
import { projectSessions } from "@server/core/orchestrator-state/storage/schema";
import {
  projectSessionView,
  type ProjectSessionPayloadByEvent,
  type ProjectSessionProgressEventType,
  type ProjectSessionRecord,
  type ProjectSessionStatus,
  type ProjectSessionTransitionInput,
} from "@server/core/project-session";
import { sessionProcessState } from "@server/core/project-session/process-state";
import {
  assertNoTopLevelSubphase,
  createProjectSession,
  getActiveProjectSession,
  getProjectSessionBySelector,
  transitionProjectSession,
  updateProjectSession,
} from "@server/core/project-session/store";
import { ensureSchema } from "@server/core/orchestrator-state/storage/ddl";
import { eventsForSubject, listProjectEvents } from "@server/core/project-state/events.js";

let tempDirs: string[] = [];

function openTestDb(): { db: Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "project-session-state-"));
  tempDirs.push(dir);
  const db = new Database(join(dir, "state.sqlite"));
  ensureSchema(db);
  return { db, dir };
}

function invokeProjectSessionTransition(
  db: Database,
  id: string,
  input: ProjectSessionTransitionInput<string>,
): ProjectSessionRecord {
  return Reflect.apply(transitionProjectSession, undefined, [db, id, input]);
}

function invokeProjectSessionUpdate(
  db: Database,
  id: string,
  patch: Record<string, unknown>,
): ProjectSessionRecord {
  return Reflect.apply(updateProjectSession, undefined, [db, id, patch]);
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("project session durable state", () => {
  test("types PR entry and blocker membership changes as progress", () => {
    const progressEvents: ProjectSessionProgressEventType[] = [
      "session.pr_entered",
      "session.blockers_updated",
    ];
    expect(progressEvents).toEqual([
      "session.pr_entered",
      "session.blockers_updated",
    ]);
  });

  test("excludes process-only idle from the durable session lifecycle", () => {
    const durableStatuses: ProjectSessionStatus[] = [
      "active",
      "blocked",
      "complete",
      "closing",
      "closed",
    ];
    if (false) {
      // @ts-expect-error idle belongs to process telemetry, not durable session state.
      const status: ProjectSessionStatus = "idle";
      void status;
    }
    expect(durableStatuses).not.toContain("idle");
  });

  test("requires an explicit actor at session creation", () => {
    const { db } = openTestDb();
    expect(() => createProjectSession(db, {
      projectId: "melee",
      sessionUuid: "missing-actor",
    } as Parameters<typeof createProjectSession>[1])).toThrow("Session creation requires an explicit actor");
    expect(listProjectEvents(db)).toHaveLength(0);
    db.close();
  });

  test("openState exposes typed Drizzle ORM over the legacy SQLite handle", () => {
    const dir = mkdtempSync(join(tmpdir(), "orchestrator-state-"));
    tempDirs.push(dir);
    const store = openState(dir);
    try {
      const record = createProjectSession(store.db, {
        actor: "operator",
        projectId: "melee",
        sessionUuid: "typed-session",
        id: "project-session:typed-session",
      });
      const row = store.orm
        .select()
        .from(projectSessions)
        .where(eq(projectSessions.id, record.id))
        .get();

      expect(row?.sessionUuid).toBe("typed-session");
      expect(row?.projectId).toBe("melee");
    } finally {
      store.db.close();
    }
  });

  test("creates a canonical row with phase-local subphase storage and derived activeSubphase", () => {
    const { db } = openTestDb();
    const record = createProjectSession(db, {
      actor: "operator",
      projectId: "melee",
      baseRef: "origin/master",
      baseSha: "abc123",
      commandId: "command-open-session",
      openingSyncId: "sync-1",
      now: "2026-06-25T12:00:00.000Z",
      sessionUuid: "session-uuid",
      id: "project-session:session-uuid",
      worktreeIdentity: "/worktrees/session-uuid",
    });

    expect(record.project_id).toBe("melee");
    expect(record.phase).toBe("preparing");
    expect(record.preparing_state_json.subphase).toBe("config");
    expect(record.running_state_json.subphase).toBe("candidate_list");
    expect(record.pr_state_json.subphase).toBe("final_build");
    expect(record.kernel_trace_json?.app_session_id).toBe("project-session:session-uuid");
    expect(record.revision).toBe(0);
    const opened = eventsForSubject(db, "session", "session-uuid");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      eventType: "session.opened",
      correlationId: "session-uuid",
      causationId: "command-open-session",
      payload: {
        baseline_revision: "abc123",
        initial_head_revision: "abc123",
        worktree_identity: "/worktrees/session-uuid",
        opening_sync_id: "sync-1",
        state_revision: 0,
      },
    });
    expect(record.caused_by_event_id).toBe(opened[0]!.eventId);
    expect(projectSessionView(record).activeSubphase).toBe("config");
    expect(() => assertNoTopLevelSubphase(record)).not.toThrow();
    db.close();
  });

  test("enforces one active project session per project", () => {
    const { db } = openTestDb();
    createProjectSession(db, { actor: "operator", projectId: "melee", sessionUuid: "one", id: "project-session:one" });

    expect(() => createProjectSession(db, { actor: "operator", projectId: "melee", sessionUuid: "two", id: "project-session:two" })).toThrow();
    expect(listProjectEvents(db, { projectId: "melee" }).map((event) => event.eventType)).toEqual([
      "session.opened",
    ]);
    expect(() => createProjectSession(db, { actor: "operator", projectId: "other", sessionUuid: "three", id: "project-session:three" })).not.toThrow();
    db.close();
  });

  test("falls back from row id selector to session UUID selector", () => {
    const { db } = openTestDb();
    const record = createProjectSession(db, {
      actor: "operator",
      projectId: "melee",
      sessionUuid: "session-uuid",
      id: "project-session:session-uuid",
    });

    const selected = getProjectSessionBySelector(db, {
      id: "session-uuid",
      sessionUuid: "session-uuid",
      projectId: "melee",
    });

    expect(selected?.id).toBe(record.id);
    db.close();
  });

  test("persists process recovery identity for melee-live", () => {
    const { db } = openTestDb();
    const record = createProjectSession(db, {
      actor: "operator",
      projectId: "melee",
      sessionUuid: "session-uuid",
      id: "project-session:session-uuid",
    });
    const processState = sessionProcessState({
      command: ["bun", "apps/server/src/job-runner.ts", "babysit"],
      graphDbPath: "/tmp/graph.sqlite",
      name: "melee-live",
      pid: 1234,
      processFilePath: "/tmp/melee-live.json",
      projectId: "melee",
      repoRoot: "/repo",
      sessionUuid: record.session_uuid,
      startedAt: "2026-06-25T12:00:00.000Z",
      state: "running",
      stateDir: "/state",
      updatedAt: "2026-06-25T12:00:10.000Z",
    });

    const saved = updateProjectSession(db, record.id, { process_state_json: processState });
    const active = getActiveProjectSession(db, "melee");
    expect(active?.process_state_json?.process_name).toBe("melee-live");
    expect(active?.process_state_json?.project_id).toBe("melee");
    expect(active?.process_state_json?.session_uuid).toBe("session-uuid");
    expect(active?.process_state_json?.process_group).toBe(-1234);
    expect(projectSessionView(saved).process?.process_file_path).toBe("/tmp/melee-live.json");
    expect(saved.revision).toBe(record.revision);
    expect(saved.caused_by_event_id).toBe(record.caused_by_event_id);
    expect(eventsForSubject(db, "session", "session-uuid")).toHaveLength(1);
    expect(() =>
      invokeProjectSessionUpdate(db, record.id, { status: "closed" }),
    ).toThrow("lifecycle fields require transitionProjectSession");
    db.close();
  });

  test("rejects a stale transition without leaving its event behind", () => {
    const { db } = openTestDb();
    const record = createProjectSession(db, {
      actor: "operator",
      projectId: "melee",
      sessionUuid: "session-stale",
      id: "project-session:session-stale",
    });

    expect(() =>
      transitionProjectSession(db, record.id, {
        actor: "runner",
        commandId: "command-wrong-correlation",
        correlationId: "session-other",
        eventType: "session.running_started",
        expectedRevision: record.revision,
        patch: { phase: "running" },
      }),
    ).toThrow("correlation_id must equal session UUID session-stale");

    expect(() =>
      transitionProjectSession(db, record.id, {
        actor: "runner",
        commandId: "command-stale",
        correlationId: "session-stale",
        eventType: "session.running_started",
        expectedRevision: record.revision + 1,
        patch: { phase: "running" },
      }),
    ).toThrow("Stale project session revision");
    expect(getActiveProjectSession(db, "melee")).toMatchObject({ revision: 0, phase: "preparing" });
    expect(listProjectEvents(db, { projectId: "melee" }).map((event) => event.eventType)).toEqual([
      "session.opened",
    ]);
    db.close();
  });

  test("rejects session events whose destination status is incompatible", () => {
    const { db } = openTestDb();
    const record = createProjectSession(db, {
      actor: "operator",
      projectId: "melee",
      sessionUuid: "session-status-gateway",
      id: "project-session:session-status-gateway",
    });
    const beforeEvents = eventsForSubject(db, "session", record.session_uuid).length;

    if (false) {
      transitionProjectSession(db, record.id, {
        actor: "runner",
        commandId: "command-type-mismatch",
        correlationId: record.session_uuid,
        eventType: "session.running_stopped",
        expectedRevision: record.revision,
        // @ts-expect-error session.running_stopped must preserve durable session status.
        patch: { status: "blocked" },
        payload: { stop_reason: "error" },
      });
      transitionProjectSession(db, record.id, {
        actor: "runner",
        commandId: "command-typed-running-blocked",
        correlationId: record.session_uuid,
        // @ts-expect-error session.running_blocked is not a typed gateway event.
        eventType: "session.running_blocked",
        expectedRevision: record.revision,
        patch: { phase: "running" },
      });
      transitionProjectSession(db, record.id, {
        actor: "operator",
        commandId: "command-typed-closing-extra",
        correlationId: record.session_uuid,
        eventType: "session.closing",
        expectedRevision: record.revision,
        patch: { status: "closing" },
        // @ts-expect-error status-transition payloads are derived by the gateway.
        payload: {
          phase: "preparing",
        },
      });
    }

    expect(() =>
      invokeProjectSessionTransition(db, record.id, {
        actor: "runner",
        commandId: "command-semantic-status-mismatch",
        correlationId: record.session_uuid,
        eventType: "session.running_stopped",
        expectedRevision: record.revision,
        patch: { status: "blocked" },
        payload: { stop_reason: "error" },
      }),
    ).toThrow("session.running_stopped must preserve project session status");
    expect(() =>
      invokeProjectSessionTransition(db, record.id, {
        actor: "runner",
        commandId: "command-lifecycle-status-mismatch",
        correlationId: record.session_uuid,
        eventType: "session.blocked",
        expectedRevision: record.revision,
        patch: { status: "complete" },
      }),
    ).toThrow("session.blocked requires destination status blocked; received complete");
    expect(() =>
      invokeProjectSessionTransition(db, record.id, {
        actor: "runner",
        commandId: "command-pr-status-mismatch",
        correlationId: record.session_uuid,
        eventType: "session.pr_entered",
        expectedRevision: record.revision,
        patch: { status: "active", phase: "pr" },
      }),
    ).toThrow("session.pr_entered must preserve project session status");
    expect(() =>
      invokeProjectSessionTransition(db, record.id, {
        actor: "runner",
        commandId: "command-raw-running-blocked",
        correlationId: record.session_uuid,
        eventType: "session.running_blocked",
        expectedRevision: record.revision,
        patch: { phase: "running" },
        payload: { blocker_codes: ["worker_error"] },
      }),
    ).toThrow("Unsupported project session transition event: session.running_blocked");
    expect(getActiveProjectSession(db, "melee")).toMatchObject({
      revision: record.revision,
      status: "active",
    });
    expect(eventsForSubject(db, "session", record.session_uuid)).toHaveLength(beforeEvents);
    db.close();
  });

  test("preserves semantic defaults and exact finalized registry payloads", () => {
    const { db } = openTestDb();
    const blockedSession = createProjectSession(db, {
      actor: "operator",
      projectId: "melee",
      sessionUuid: "session-exact-payload",
      id: "project-session:session-exact-payload",
    });

    const running = transitionProjectSession(db, blockedSession.id, {
      actor: "runner",
      commandId: "command-running-started",
      correlationId: blockedSession.session_uuid,
      eventType: "session.running_started",
      expectedRevision: blockedSession.revision,
      patch: { phase: "running" },
    });
    expect(eventsForSubject(db, "session", blockedSession.session_uuid).at(-1)?.payload).toEqual({
      previous_phase: "preparing",
      previous_status: "active",
      phase: "running",
      status: "active",
    });

    const blockedPayload = {
      from_status: "closed",
      to_status: "blocked",
      prior_status: "active",
      blocker_codes: ["worker_error"],
      source_identities: [{ source_kind: "fabricated", source_id: "fake-source" }],
      recovery_choices: ["fake_recovery"],
      state_revision: 99,
    } satisfies ProjectSessionPayloadByEvent["session.blocked"];
    const blocked = invokeProjectSessionTransition(db, running.id, {
      actor: "guardian",
      commandId: "command-session-blocked",
      correlationId: running.session_uuid,
      eventType: "session.blocked",
      expectedRevision: running.revision,
      patch: {
        status: "blocked",
        blockers_json: [{
          code: "worker_error",
          message: "worker failed",
          source_kind: "run",
          source_id: "run-1",
          recovery_choices: ["retry_workers"],
        }],
      },
      payload: blockedPayload,
    });
    expect(eventsForSubject(db, "session", blockedSession.session_uuid).at(-1)?.payload).toEqual(
      {
        from_status: "active",
        to_status: "blocked",
        prior_status: "active",
        blocker_codes: ["worker_error"],
        source_identities: [{ source_kind: "run", source_id: "run-1" }],
        recovery_choices: ["retry_workers"],
        state_revision: 2,
      },
    );

    const blockersUpdatedPayload = {
      added_blocker_codes: ["supervisor_error"],
      removed_blocker_codes: ["worker_error"],
      blocker_codes: ["supervisor_error"],
      source_identities: [{ source_kind: "run", source_id: "run-2" }],
      recovery_choices: [],
      state_revision: 77,
    };
    transitionProjectSession(db, blocked.id, {
      actor: "guardian",
      commandId: "command-blockers-updated",
      correlationId: blocked.session_uuid,
      eventType: "session.blockers_updated",
      expectedRevision: blocked.revision,
      patch: {
        blockers_json: [{
          code: "supervisor_error",
          message: "supervisor failed",
          source_kind: "run",
          source_id: "run-2",
          recovery_choices: [],
        }],
      },
      payload: blockersUpdatedPayload,
    });
    expect(eventsForSubject(db, "session", blockedSession.session_uuid).at(-1)?.payload).toEqual(
      { ...blockersUpdatedPayload, state_revision: 3 },
    );

    const completingSession = createProjectSession(db, {
      actor: "operator",
      projectId: "other",
      sessionUuid: "session-complete-payload",
      id: "project-session:session-complete-payload",
    });
    const completePayload = { from_status: "blocked", to_status: "complete" } as const;
    const completed = invokeProjectSessionTransition(db, completingSession.id, {
      actor: "operator",
      commandId: "command-session-complete",
      correlationId: completingSession.session_uuid,
      eventType: "session.complete",
      expectedRevision: completingSession.revision,
      patch: { status: "complete" },
      payload: completePayload,
    });
    expect(eventsForSubject(db, "session", completingSession.session_uuid).at(-1)?.payload).toEqual(
      { from_status: "active", to_status: "complete" },
    );

    const closingPayload = { from_status: "active", to_status: "closing" } as const;
    const closing = invokeProjectSessionTransition(db, completingSession.id, {
      actor: "operator",
      commandId: "command-session-closing",
      correlationId: completingSession.session_uuid,
      eventType: "session.closing",
      expectedRevision: completed.revision,
      patch: { status: "closing" },
      payload: closingPayload,
    });
    expect(eventsForSubject(db, "session", completingSession.session_uuid).at(-1)?.payload).toEqual(
      { from_status: "complete", to_status: "closing" },
    );
    expect(eventsForSubject(db, "session", completingSession.session_uuid).at(-1)?.payload).not.toMatchObject({
      previous_phase: expect.anything(),
      phase: expect.anything(),
    });

    const closedPayload = {
      final_head: "fabricated-head",
      shipped_and_unshipped_work_summary: {
        ahead_of_base: 0,
        worktree_dirty_beyond_head: false,
      },
      final_save_point_id: "save-point-1",
      closing_operator: "fabricated-operator",
      state_revision: 999,
    } as const;
    invokeProjectSessionTransition(db, closing.id, {
      actor: "operator",
      commandId: "command-session-closed",
      correlationId: closing.session_uuid,
      eventType: "session.closed",
      expectedRevision: closing.revision,
      patch: { status: "closed" },
      payload: closedPayload,
    });
    expect(eventsForSubject(db, "session", completingSession.session_uuid).at(-1)?.payload).toEqual(
      {
        ...closedPayload,
        final_head: null,
        closing_operator: "operator",
        state_revision: closing.revision + 1,
      },
    );
    expect(eventsForSubject(db, "session", completingSession.session_uuid).at(-1)?.payload).not.toMatchObject({
      previous_phase: expect.anything(),
      previous_status: expect.anything(),
      phase: expect.anything(),
      status: expect.anything(),
      from_status: expect.anything(),
      to_status: expect.anything(),
    });
    db.close();
  });

  test("rolls the transition event back when its state update fails", () => {
    const { db } = openTestDb();
    const record = createProjectSession(db, {
      actor: "operator",
      projectId: "melee",
      sessionUuid: "session-rollback",
      id: "project-session:session-rollback",
    });
    db.exec(`CREATE TRIGGER reject_session_transition
      BEFORE UPDATE ON project_sessions
      BEGIN SELECT RAISE(ABORT, 'reject session transition'); END`);

    expect(() =>
      transitionProjectSession(db, record.id, {
        actor: "runner",
        commandId: "command-rollback",
        correlationId: "session-rollback",
        eventType: "session.running_started",
        expectedRevision: record.revision,
        patch: { phase: "running" },
      }),
    ).toThrow("reject session transition");
    expect(eventsForSubject(db, "session", "session-rollback").map((event) => event.eventType)).toEqual([
      "session.opened",
    ]);
    expect(getActiveProjectSession(db, "melee")).toMatchObject({ revision: 0, phase: "preparing" });
    db.close();
  });
});
