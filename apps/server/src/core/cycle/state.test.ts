import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { openState } from "@server/core/orchestrator-state";
import { cycles } from "@server/core/orchestrator-state/storage/schema";
import {
  cycleView,
  type CyclePayloadByEvent,
  type CycleProgressEventType,
  type CycleRecord,
  type CycleStatus,
  type CycleTransitionInput,
} from "@server/core/cycle";
import { cycleProcessState } from "@server/core/cycle/process-state";
import {
  assertNoTopLevelSubphase,
  createCycle,
  getActiveCycle,
  getCycleBySelector,
  transitionCycle,
  updateCycle,
} from "@server/core/cycle/store";
import { ensureSchema } from "@server/core/orchestrator-state/storage/ddl";
import { eventsForSubject, listGameEvents } from "@server/core/harness-state/events.js";

let tempDirs: string[] = [];

function openTestDb(): { db: Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "cycle-state-"));
  tempDirs.push(dir);
  const db = new Database(join(dir, "state.sqlite"));
  ensureSchema(db);
  return { db, dir };
}

function invokeCycleTransition(
  db: Database,
  id: string,
  input: CycleTransitionInput<string>,
): CycleRecord {
  return Reflect.apply(transitionCycle, undefined, [db, id, input]);
}

function invokeCycleUpdate(
  db: Database,
  id: string,
  patch: Record<string, unknown>,
): CycleRecord {
  return Reflect.apply(updateCycle, undefined, [db, id, patch]);
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("game cycle durable state", () => {
  test("types PR entry and blocker membership changes as progress", () => {
    const progressEvents: CycleProgressEventType[] = [
      "cycle.pr_entered",
      "cycle.blockers_updated",
    ];
    expect(progressEvents).toEqual([
      "cycle.pr_entered",
      "cycle.blockers_updated",
    ]);
  });

  test("excludes process-only idle from the durable cycle lifecycle", () => {
    const durableStatuses: CycleStatus[] = [
      "active",
      "blocked",
      "complete",
      "closing",
      "closed",
    ];
    if (false) {
      // @ts-expect-error idle belongs to process telemetry, not durable cycle state.
      const status: CycleStatus = "idle";
      void status;
    }
    expect(durableStatuses).not.toContain("idle");
  });

  test("requires an explicit actor at cycle creation", () => {
    const { db } = openTestDb();
    expect(() => createCycle(db, {
      gameId: "melee",
      cycleUuid: "missing-actor",
    } as Parameters<typeof createCycle>[1])).toThrow("Cycle creation requires an explicit actor");
    expect(listGameEvents(db)).toHaveLength(0);
    db.close();
  });

  test("openState exposes typed Drizzle ORM over the legacy SQLite handle", () => {
    const dir = mkdtempSync(join(tmpdir(), "orchestrator-state-"));
    tempDirs.push(dir);
    const store = openState(dir);
    try {
      const record = createCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid: "typed-cycle",
        id: "cycle:typed-cycle",
      });
      const row = store.orm
        .select()
        .from(cycles)
        .where(eq(cycles.id, record.id))
        .get();

      expect(row?.cycleUuid).toBe("typed-cycle");
      expect(row?.gameId).toBe("melee");
    } finally {
      store.db.close();
    }
  });

  test("creates a canonical row with phase-local subphase storage and derived activeSubphase", () => {
    const { db } = openTestDb();
    const record = createCycle(db, {
      actor: "operator",
      gameId: "melee",
      baseRef: "origin/master",
      baseSha: "abc123",
      commandId: "command-open-cycle",
      openingSyncId: "sync-1",
      now: "2026-06-25T12:00:00.000Z",
      cycleUuid: "cycle-uuid",
      id: "cycle:cycle-uuid",
      worktreeIdentity: "/worktrees/cycle-uuid",
    });

    expect(record.game_id).toBe("melee");
    expect(record.phase).toBe("preparing");
    expect(record.preparing_state_json.subphase).toBe("config");
    expect(record.running_state_json.subphase).toBe("candidate_list");
    expect(record.pr_state_json.subphase).toBe("final_build");
    expect(record.kernel_trace_json?.app_session_id).toBe("cycle:cycle-uuid");
    expect(record.revision).toBe(0);
    const opened = eventsForSubject(db, "cycle", "cycle-uuid");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      eventType: "cycle.opened",
      correlationId: "cycle-uuid",
      causationId: "command-open-cycle",
      payload: {
        baseline_revision: "abc123",
        initial_head_revision: "abc123",
        worktree_identity: "/worktrees/cycle-uuid",
        opening_sync_id: "sync-1",
        state_revision: 0,
      },
    });
    expect(record.caused_by_event_id).toBe(opened[0]!.eventId);
    expect(cycleView(record).activeSubphase).toBe("config");
    expect(() => assertNoTopLevelSubphase(record)).not.toThrow();
    db.close();
  });

  test("enforces one active game cycle per game", () => {
    const { db } = openTestDb();
    createCycle(db, { actor: "operator", gameId: "melee", cycleUuid: "one", id: "cycle:one" });

    expect(() => createCycle(db, { actor: "operator", gameId: "melee", cycleUuid: "two", id: "cycle:two" })).toThrow();
    expect(listGameEvents(db, { gameId: "melee" }).map((event) => event.eventType)).toEqual([
      "cycle.opened",
    ]);
    expect(() => createCycle(db, { actor: "operator", gameId: "other", cycleUuid: "three", id: "cycle:three" })).not.toThrow();
    db.close();
  });

  test("falls back from row id selector to cycle UUID selector", () => {
    const { db } = openTestDb();
    const record = createCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-uuid",
      id: "cycle:cycle-uuid",
    });

    const selected = getCycleBySelector(db, {
      id: "cycle-uuid",
      cycleUuid: "cycle-uuid",
      gameId: "melee",
    });

    expect(selected?.id).toBe(record.id);
    db.close();
  });

  test("persists process recovery identity for melee-live", () => {
    const { db } = openTestDb();
    const record = createCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-uuid",
      id: "cycle:cycle-uuid",
    });
    const processState = cycleProcessState({
      command: ["bun", "apps/server/src/job-runner.ts", "babysit"],
      graphDbPath: "/tmp/graph.sqlite",
      name: "melee-live",
      pid: 1234,
      processFilePath: "/tmp/melee-live.json",
      gameId: "melee",
      repoRoot: "/repo",
      cycleUuid: record.cycle_uuid,
      startedAt: "2026-06-25T12:00:00.000Z",
      state: "running",
      stateDir: "/state",
      updatedAt: "2026-06-25T12:00:10.000Z",
    });

    const saved = updateCycle(db, record.id, { process_state_json: processState });
    const active = getActiveCycle(db, "melee");
    expect(active?.process_state_json?.process_name).toBe("melee-live");
    expect(active?.process_state_json?.game_id).toBe("melee");
    expect(active?.process_state_json?.cycle_uuid).toBe("cycle-uuid");
    expect(active?.process_state_json?.process_group).toBe(-1234);
    expect(cycleView(saved).process?.process_file_path).toBe("/tmp/melee-live.json");
    expect(saved.revision).toBe(record.revision);
    expect(saved.caused_by_event_id).toBe(record.caused_by_event_id);
    expect(eventsForSubject(db, "cycle", "cycle-uuid")).toHaveLength(1);
    expect(() =>
      invokeCycleUpdate(db, record.id, { status: "closed" }),
    ).toThrow("lifecycle fields require transitionCycle");
    db.close();
  });

  test("rejects a stale transition without leaving its event behind", () => {
    const { db } = openTestDb();
    const record = createCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-stale",
      id: "cycle:cycle-stale",
    });

    expect(() =>
      transitionCycle(db, record.id, {
        actor: "runner",
        commandId: "command-wrong-correlation",
        correlationId: "cycle-other",
        eventType: "cycle.running_started",
        expectedRevision: record.revision,
        patch: { phase: "running" },
      }),
    ).toThrow("correlation_id must equal cycle UUID cycle-stale");

    expect(() =>
      transitionCycle(db, record.id, {
        actor: "runner",
        commandId: "command-stale",
        correlationId: "cycle-stale",
        eventType: "cycle.running_started",
        expectedRevision: record.revision + 1,
        patch: { phase: "running" },
      }),
    ).toThrow("Stale game cycle revision");
    expect(getActiveCycle(db, "melee")).toMatchObject({ revision: 0, phase: "preparing" });
    expect(listGameEvents(db, { gameId: "melee" }).map((event) => event.eventType)).toEqual([
      "cycle.opened",
    ]);
    db.close();
  });

  test("rejects cycle events whose destination status is incompatible", () => {
    const { db } = openTestDb();
    const record = createCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-status-gateway",
      id: "cycle:cycle-status-gateway",
    });
    const beforeEvents = eventsForSubject(db, "cycle", record.cycle_uuid).length;

    if (false) {
      transitionCycle(db, record.id, {
        actor: "runner",
        commandId: "command-type-mismatch",
        correlationId: record.cycle_uuid,
        eventType: "cycle.running_stopped",
        expectedRevision: record.revision,
        // @ts-expect-error cycle.running_stopped must preserve durable cycle status.
        patch: { status: "blocked" },
        payload: { stop_reason: "error" },
      });
      transitionCycle(db, record.id, {
        actor: "runner",
        commandId: "command-typed-running-blocked",
        correlationId: record.cycle_uuid,
        // @ts-expect-error cycle.running_blocked is not a typed gateway event.
        eventType: "cycle.running_blocked",
        expectedRevision: record.revision,
        patch: { phase: "running" },
      });
      transitionCycle(db, record.id, {
        actor: "operator",
        commandId: "command-typed-closing-extra",
        correlationId: record.cycle_uuid,
        eventType: "cycle.closing",
        expectedRevision: record.revision,
        patch: { status: "closing" },
        // @ts-expect-error status-transition payloads are derived by the gateway.
        payload: {
          phase: "preparing",
        },
      });
    }

    expect(() =>
      invokeCycleTransition(db, record.id, {
        actor: "runner",
        commandId: "command-semantic-status-mismatch",
        correlationId: record.cycle_uuid,
        eventType: "cycle.running_stopped",
        expectedRevision: record.revision,
        patch: { status: "blocked" },
        payload: { stop_reason: "error" },
      }),
    ).toThrow("cycle.running_stopped must preserve game cycle status");
    expect(() =>
      invokeCycleTransition(db, record.id, {
        actor: "runner",
        commandId: "command-lifecycle-status-mismatch",
        correlationId: record.cycle_uuid,
        eventType: "cycle.blocked",
        expectedRevision: record.revision,
        patch: { status: "complete" },
      }),
    ).toThrow("cycle.blocked requires destination status blocked; received complete");
    expect(() =>
      invokeCycleTransition(db, record.id, {
        actor: "runner",
        commandId: "command-pr-status-mismatch",
        correlationId: record.cycle_uuid,
        eventType: "cycle.pr_entered",
        expectedRevision: record.revision,
        patch: { status: "active", phase: "pr" },
      }),
    ).toThrow("cycle.pr_entered must preserve game cycle status");
    expect(() =>
      invokeCycleTransition(db, record.id, {
        actor: "runner",
        commandId: "command-raw-running-blocked",
        correlationId: record.cycle_uuid,
        eventType: "cycle.running_blocked",
        expectedRevision: record.revision,
        patch: { phase: "running" },
        payload: { blocker_codes: ["worker_error"] },
      }),
    ).toThrow("Unsupported game cycle transition event: cycle.running_blocked");
    expect(getActiveCycle(db, "melee")).toMatchObject({
      revision: record.revision,
      status: "active",
    });
    expect(eventsForSubject(db, "cycle", record.cycle_uuid)).toHaveLength(beforeEvents);
    db.close();
  });

  test("preserves semantic defaults and exact finalized registry payloads", () => {
    const { db } = openTestDb();
    const blockedCycle = createCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-exact-payload",
      id: "cycle:cycle-exact-payload",
    });

    const running = transitionCycle(db, blockedCycle.id, {
      actor: "runner",
      commandId: "command-running-started",
      correlationId: blockedCycle.cycle_uuid,
      eventType: "cycle.running_started",
      expectedRevision: blockedCycle.revision,
      patch: { phase: "running" },
    });
    expect(eventsForSubject(db, "cycle", blockedCycle.cycle_uuid).at(-1)?.payload).toEqual({
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
    } satisfies CyclePayloadByEvent["cycle.blocked"];
    const blocked = invokeCycleTransition(db, running.id, {
      actor: "guardian",
      commandId: "command-cycle-blocked",
      correlationId: running.cycle_uuid,
      eventType: "cycle.blocked",
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
    expect(eventsForSubject(db, "cycle", blockedCycle.cycle_uuid).at(-1)?.payload).toEqual(
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
    transitionCycle(db, blocked.id, {
      actor: "guardian",
      commandId: "command-blockers-updated",
      correlationId: blocked.cycle_uuid,
      eventType: "cycle.blockers_updated",
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
    expect(eventsForSubject(db, "cycle", blockedCycle.cycle_uuid).at(-1)?.payload).toEqual(
      { ...blockersUpdatedPayload, state_revision: 3 },
    );

    const completingCycle = createCycle(db, {
      actor: "operator",
      gameId: "other",
      cycleUuid: "cycle-complete-payload",
      id: "cycle:cycle-complete-payload",
    });
    const completePayload = { from_status: "blocked", to_status: "complete" } as const;
    const completed = invokeCycleTransition(db, completingCycle.id, {
      actor: "operator",
      commandId: "command-cycle-complete",
      correlationId: completingCycle.cycle_uuid,
      eventType: "cycle.complete",
      expectedRevision: completingCycle.revision,
      patch: { status: "complete" },
      payload: completePayload,
    });
    expect(eventsForSubject(db, "cycle", completingCycle.cycle_uuid).at(-1)?.payload).toEqual(
      { from_status: "active", to_status: "complete" },
    );

    const closingPayload = { from_status: "active", to_status: "closing" } as const;
    const closing = invokeCycleTransition(db, completingCycle.id, {
      actor: "operator",
      commandId: "command-cycle-closing",
      correlationId: completingCycle.cycle_uuid,
      eventType: "cycle.closing",
      expectedRevision: completed.revision,
      patch: { status: "closing" },
      payload: closingPayload,
    });
    expect(eventsForSubject(db, "cycle", completingCycle.cycle_uuid).at(-1)?.payload).toEqual(
      { from_status: "complete", to_status: "closing" },
    );
    expect(eventsForSubject(db, "cycle", completingCycle.cycle_uuid).at(-1)?.payload).not.toMatchObject({
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
    invokeCycleTransition(db, closing.id, {
      actor: "operator",
      commandId: "command-cycle-closed",
      correlationId: closing.cycle_uuid,
      eventType: "cycle.closed",
      expectedRevision: closing.revision,
      patch: { status: "closed" },
      payload: closedPayload,
    });
    expect(eventsForSubject(db, "cycle", completingCycle.cycle_uuid).at(-1)?.payload).toEqual(
      {
        ...closedPayload,
        final_head: null,
        closing_operator: "operator",
        state_revision: closing.revision + 1,
      },
    );
    expect(eventsForSubject(db, "cycle", completingCycle.cycle_uuid).at(-1)?.payload).not.toMatchObject({
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
    const record = createCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-rollback",
      id: "cycle:cycle-rollback",
    });
    db.exec(`CREATE TRIGGER reject_cycle_transition
      BEFORE UPDATE ON cycles
      BEGIN SELECT RAISE(ABORT, 'reject cycle transition'); END`);

    expect(() =>
      transitionCycle(db, record.id, {
        actor: "runner",
        commandId: "command-rollback",
        correlationId: "cycle-rollback",
        eventType: "cycle.running_started",
        expectedRevision: record.revision,
        patch: { phase: "running" },
      }),
    ).toThrow("reject cycle transition");
    expect(eventsForSubject(db, "cycle", "cycle-rollback").map((event) => event.eventType)).toEqual([
      "cycle.opened",
    ]);
    expect(getActiveCycle(db, "melee")).toMatchObject({ revision: 0, phase: "preparing" });
    db.close();
  });
});
