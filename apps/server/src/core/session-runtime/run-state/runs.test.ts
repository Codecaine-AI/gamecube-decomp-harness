import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { casRunEnvelope } from "@server/core/orchestrator-state";
import { eventsForSubject } from "@server/core/project-state";
import { initializeProjectState, requestDispatch } from "@server/core/project-state";
import type { RunInputs } from "@server/core/shared/types";
import {
  createRun,
  getRun,
  openState,
  policyRevisionForConfiguration,
  setRunDesiredWorkers,
  setRunSchedulerCondition,
  StaleRunRevisionError,
  startingKnowledgeRevision,
  transitionRun,
  updateRunStatus,
  type StateStore,
} from "./index.js";

const stores: StateStore[] = [];
const tempDirs: string[] = [];

function testStore(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "run-state-contract-"));
  tempDirs.push(dir);
  const store = openState(dir);
  stores.push(store);
  return { dir, store };
}

function readyRun(store: StateStore, graphDbPath?: string) {
  return createRun(
    store,
    "matched_code_percent",
    100,
    4,
    { projectId: "melee", graphDbPath },
    {
      baseRevision: "base-abc",
      configurationSnapshot: { desired_workers: 4, nested: { beta: 2, alpha: 1 } },
      requireReady: true,
    },
  );
}

function acquireRunLease(store: StateStore, runId: string): void {
  initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
  const decision = requestDispatch(store, {
    actor: "operator",
    commandId: `command-lease-${runId}`,
    correlationId: runId,
    kind: "run",
    projectId: "melee",
    reason: "test activation",
    workflowId: runId,
  });
  if (decision.queued) throw new Error("test dispatch unexpectedly queued");
}

function invokeRunTransition(
  store: StateStore,
  runId: string,
  input: Record<string, unknown>,
) {
  return Reflect.apply(transitionRun, undefined, [store, runId, input]);
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("run state contract", () => {
  test("creates draft then accepts ready, and activates through one-event CAS transitions", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    const creationEvents = eventsForSubject(store.db, "run", ready.id);

    expect(ready).toMatchObject({ status: "ready", revision: 1, inputs: { base_revision: "base-abc" } });
    expect(creationEvents.map((event) => event.eventType)).toEqual(["run.drafted", "run.readied"]);
    expect(ready.causedByEventId).toBe(creationEvents[1]?.eventId);
    expect(creationEvents[1]?.causationId).toBe(creationEvents[0]?.eventId);
    expect(creationEvents[0]?.correlationId).toBe(ready.id);
    expect(creationEvents[1]?.correlationId).toBe(ready.id);
    expect(creationEvents[0]?.parentSpanId).toBe(creationEvents[1]?.parentSpanId);
    expect(creationEvents[0]?.spanId).not.toBe(creationEvents[1]?.spanId);
    expect(creationEvents.every((event) => /^span-[0-9a-f-]{36}$/.test(event.spanId))).toBe(true);
    expect(creationEvents[1]?.payload).toMatchObject({
      from_status: "draft",
      to_status: "ready",
    });

    expect(() => updateRunStatus(store, ready.id, "active", "operator")).toThrow("active project dispatch lease");
    expect(eventsForSubject(store.db, "run", ready.id)).toHaveLength(2);
    acquireRunLease(store, ready.id);
    const active = updateRunStatus(store, ready.id, "active", "operator");
    const acceptedEvents = eventsForSubject(store.db, "run", ready.id);
    expect(active).toMatchObject({ status: "active", revision: 2 });
    expect(acceptedEvents).toHaveLength(3);
    expect(acceptedEvents[2]?.eventType).toBe("run.activated");
    expect(acceptedEvents[2]?.payload).toMatchObject({
      from_status: "ready",
      to_status: "active",
    });
    expect(active.causedByEventId).toBe(acceptedEvents[2]?.eventId);

    expect(() =>
      transitionRun(store, ready.id, {
        actor: "operator",
        commandId: "command-stale-pause",
        correlationId: ready.id,
        eventType: "run.paused",
        expectedRevision: ready.revision,
        patch: { status: "paused" },
        payload: {},
      }),
    ).toThrow(StaleRunRevisionError);
    expect(eventsForSubject(store.db, "run", ready.id)).toHaveLength(3);

    invokeRunTransition(store, ready.id, {
      actor: "operator",
      commandId: "command-spoofed-pause",
      correlationId: ready.id,
      eventType: "run.paused",
      expectedRevision: active.revision,
      patch: { status: "paused" },
      payload: { from_status: "draft", to_status: "completed" },
    });
    expect(eventsForSubject(store.db, "run", ready.id).at(-1)?.payload).toEqual({
      from_status: "active",
      to_status: "paused",
    });
  });

  test("rejects run events whose destination status is incompatible", () => {
    const { store } = testStore();
    const ready = readyRun(store);

    if (false) {
      transitionRun(store, ready.id, {
        actor: "operator",
        commandId: "command-type-mismatch",
        correlationId: ready.id,
        eventType: "run.paused",
        expectedRevision: ready.revision,
        // @ts-expect-error run.paused can only commit a paused destination.
        patch: { status: "active" },
        payload: {},
      });
      transitionRun(store, ready.id, {
        actor: "operator",
        commandId: "command-type-reason-extra",
        correlationId: ready.id,
        eventType: "run.paused",
        expectedRevision: ready.revision,
        patch: { status: "paused" },
        payload: {
          // @ts-expect-error run.paused has no generic reason extra.
          reason: "forbidden",
        },
      });
    }

    expect(() =>
      invokeRunTransition(store, ready.id, {
        actor: "operator",
        commandId: "command-status-mismatch",
        correlationId: ready.id,
        eventType: "run.paused",
        expectedRevision: ready.revision,
        patch: { status: "active" },
        payload: {},
      }),
    ).toThrow("run.paused is incompatible with destination status active");
    expect(() =>
      invokeRunTransition(store, ready.id, {
        actor: "operator",
        commandId: "command-progress-status-mismatch",
        correlationId: ready.id,
        eventType: "run.desired_workers_changed",
        expectedRevision: ready.revision,
        patch: { desiredWorkers: 5, status: "paused" },
        payload: { previous_desired_workers: 4, desired_workers: 5 },
      }),
    ).toThrow("run.desired_workers_changed must preserve run status");
    expect(() =>
      invokeRunTransition(store, ready.id, {
        actor: "guardian",
        commandId: "command-legacy-reconcile",
        correlationId: ready.id,
        eventType: "run.lease_reconciled",
        expectedRevision: ready.revision,
        patch: { status: "paused" },
        payload: {},
      }),
    ).toThrow("Unsupported run transition event: run.lease_reconciled");
    acquireRunLease(store, ready.id);
    const active = updateRunStatus(store, ready.id, "active", "operator");
    const beforeForbiddenPayload = eventsForSubject(store.db, "run", ready.id).length;
    expect(() =>
      invokeRunTransition(store, active.id, {
        actor: "operator",
        commandId: "command-paused-reason",
        correlationId: active.id,
        eventType: "run.paused",
        expectedRevision: active.revision,
        patch: { status: "paused" },
        payload: { reason: "forbidden" },
      }),
    ).toThrow("run.paused payload must not include reason");
    expect(getRun(store, ready.id)).toMatchObject({ revision: active.revision, status: "active" });
    expect(eventsForSubject(store.db, "run", ready.id)).toHaveLength(beforeForbiddenPayload);
  });

  test("rejects changes to every RunInputs field after activation without accepting an event", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    acquireRunLease(store, ready.id);
    const active = updateRunStatus(store, ready.id, "active", "operator");
    const beforeEvents = eventsForSubject(store.db, "run", active.id).length;
    const mutations: Array<[keyof RunInputs, RunInputs]> = [
      ["base_revision", { ...active.inputs!, base_revision: "different-base" }],
      ["policy_revision", { ...active.inputs!, policy_revision: "different-policy" }],
      ["starting_knowledge_revision", { ...active.inputs!, starting_knowledge_revision: "different-knowledge" }],
      [
        "configuration_snapshot",
        {
          ...active.inputs!,
          configuration_snapshot: { ...active.inputs!.configuration_snapshot, nested: { alpha: 1, beta: 99 } },
        },
      ],
    ];

    for (const [field, changedInputs] of mutations) {
      expect(() =>
        transitionRun(store, active.id, {
          actor: "operator",
          commandId: `command-change-${field}`,
          correlationId: active.id,
          eventType: "run.paused",
          expectedRevision: active.revision,
          patch: { inputs: changedInputs, status: "paused" },
          payload: {},
        }),
      ).toThrow("inputs are immutable after activation");
      expect(() =>
        casRunEnvelope(store.db, {
          eventId: active.causedByEventId!,
          expectedRevision: active.revision,
          inputsJson: JSON.stringify(changedInputs),
          runId: active.id,
        }),
      ).toThrow("inputs are immutable after activation");
      expect(getRun(store, active.id)).toMatchObject({ revision: active.revision, inputs: active.inputs });
      expect(eventsForSubject(store.db, "run", active.id)).toHaveLength(beforeEvents);
    }
  });

  test("derives deterministic knowledge and policy revisions from canonical inputs", () => {
    const { dir, store } = testStore();
    const graphDbPath = join(dir, "knowledge.sqlite");
    const emptyGraphDbPath = join(dir, "empty-knowledge.sqlite");
    const emptyGraph = new Database(emptyGraphDbPath);
    emptyGraph.exec("CREATE TABLE resource_versions (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, content_hash TEXT NOT NULL)");
    emptyGraph.close();
    const graph = new Database(graphDbPath);
    graph.exec("CREATE TABLE resource_versions (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, content_hash TEXT NOT NULL)");
    graph.query("INSERT INTO resource_versions VALUES (?, ?, ?)").run("2", "zeta", "hash-z");
    graph.query("INSERT INTO resource_versions VALUES (?, ?, ?)").run("1", "alpha", "hash-a");
    graph.close();

    const expectedKnowledge = `kg-${createHash("sha256").update("alpha:hash-a\nzeta:hash-z").digest("hex")}`;
    const configuration = { zeta: 2, alpha: { delta: 4, beta: 3 } };
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      4,
      { projectId: "melee", graphDbPath },
      { baseRevision: "base-abc", configurationSnapshot: configuration, requireReady: true },
    );

    expect(startingKnowledgeRevision(graphDbPath)).toBe(expectedKnowledge);
    expect(startingKnowledgeRevision(emptyGraphDbPath)).toBe("kg-empty");
    expect(startingKnowledgeRevision(join(dir, "absent.sqlite"))).toBe("kg-empty");
    expect(run.inputs).toMatchObject({
      starting_knowledge_revision: expectedKnowledge,
      policy_revision: policyRevisionForConfiguration(configuration),
    });
    expect(policyRevisionForConfiguration({ alpha: { beta: 3, delta: 4 }, zeta: 2 })).toBe(
      policyRevisionForConfiguration(configuration),
    );
  });

  test("records the latest published knowledge revision for its project", () => {
    const { store } = testStore();
    const insert = store.db.query(
      `INSERT INTO knowledge_revisions (project_id, digest, sync_id, caused_by_event_id, created_at)
       VALUES (?, ?, NULL, ?, ?)`,
    );
    insert.run("melee", "digest-melee-1", "event-melee-1", "2026-08-13T18:00:00.000Z");
    insert.run("other-project", "digest-other", "event-other", "2026-08-13T18:01:00.000Z");
    insert.run("melee", "digest-melee-2", "event-melee-2", "2026-08-13T18:02:00.000Z");

    const run = createRun(
      store,
      "matched_code_percent",
      100,
      4,
      { projectId: "melee" },
      { baseRevision: "base-abc", requireReady: true },
    );

    expect(run.inputs?.starting_knowledge_revision).toBe("knowledge-3");
  });

  test("updates scheduler_condition without changing revision, cause, or event count", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    const beforeEvents = eventsForSubject(store.db, "run", ready.id).length;
    const beforeLegacyEvents = Number((store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ?").get(ready.id) as { count: number }).count);

    const mirrored = setRunSchedulerCondition(store, ready.id, "planning");

    expect(mirrored).toMatchObject({
      schedulerCondition: "planning",
      revision: ready.revision,
      causedByEventId: ready.causedByEventId,
    });
    expect(eventsForSubject(store.db, "run", ready.id)).toHaveLength(beforeEvents);
    expect(Number((store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ?").get(ready.id) as { count: number }).count)).toBe(
      beforeLegacyEvents,
    );
  });

  test("records desired-worker changes only in the project log and maps dashboard work to runner", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    const beforeLegacyEvents = Number(
      (store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ?").get(ready.id) as { count: number }).count,
    );

    const resized = setRunDesiredWorkers(store, ready.id, 7, "dashboard", {
      commandId: "command-dashboard-resize",
      spanId: "span-22222222-2222-4222-8222-222222222222",
    });
    const event = eventsForSubject(store.db, "run", ready.id).at(-1);

    expect(resized).toMatchObject({ desiredWorkers: 7, revision: ready.revision + 1 });
    expect(event).toMatchObject({
      actor: "runner",
      causationId: "command-dashboard-resize",
      correlationId: ready.id,
      eventType: "run.desired_workers_changed",
      payload: { desired_workers: 7, previous_desired_workers: 4 },
    });
    expect(event?.parentSpanId).toBe("span-22222222-2222-4222-8222-222222222222");
    expect(Number((store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ?").get(ready.id) as { count: number }).count)).toBe(
      beforeLegacyEvents,
    );
  });
});
