import { startSchedulerEpoch, activeSchedulerEpoch } from "./epochs.js";
import { updatePreparedRunConfiguration } from "./runs.js";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { casRunEnvelope } from "@server/core/orchestrator-state";
import { seedRunHarness } from "./test-harness.js";
import { eventsForSubject, getHarnessState, getHarnessTimeline, transitionHarnessState } from "@server/core/harness-state";
import { getDispatchState, initializeDispatchState, releaseDispatch, requestDispatch } from "@server/core/harness-state";
import type { RunInputs } from "@server/core/shared/types";
import {
  createRun,
  getRun,
  openState,
  policyRevisionForConfiguration,
  readRunBoundarySyncHold,
  readRunDesiredWorkers,
  setRunBoundarySyncHoldLive,
  setRunDesiredWorkers,
  setRunDesiredWorkersLive,
  setRunSchedulerCondition,
  StaleRunRevisionError,
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
  seedRunHarness(store, "melee", "base-abc");
  return createRun(
    store,
    "matched_code_percent",
    100,
    4,
    { gameId: "melee", graphDbPath },
    {
      baseRevision: "base-abc",
      configurationSnapshot: { desired_workers: 4, nested: { beta: 2, alpha: 1 } },
      requireReady: true,
    },
  );
}

function acquireRunLease(store: StateStore, runId: string): void {
  initializeDispatchState(store, { gameId: "melee", traceId: "trace-game-melee" });
  const decision = requestDispatch(store, {
    actor: "operator",
    commandId: `command-lease-${runId}`,
    correlationId: runId,
    kind: "run",
    gameId: "melee",
    reason: "test activation",
    workflowId: runId,
  });
  if (decision.queued) throw new Error("test dispatch unexpectedly queued");
}

function pausedLeaseFreeRun(store: StateStore) {
  const ready = readyRun(store);
  acquireRunLease(store, ready.id);
  const leaseId = getDispatchState(store, "melee")?.active_workflow?.lease_id;
  if (!leaseId) throw new Error("test run has no dispatch lease");
  const active = updateRunStatus(store, ready.id, "active", "operator");
  const paused = updateRunStatus(store, active.id, "paused", "operator");
  releaseDispatch(store, {
    actor: "operator",
    commandId: `release-${paused.id}`,
    correlationId: paused.id,
    gameId: "melee",
    leaseId,
  });
  return paused;
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

    expect(() => updateRunStatus(store, ready.id, "active", "operator")).toThrow("active game dispatch lease");
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

  test("derives deterministic policy revisions from canonical inputs", () => {
    const { store } = testStore();
    seedRunHarness(store, "melee", "base-abc");
    const configuration = { zeta: 2, alpha: { delta: 4, beta: 3 } };
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      4,
      { gameId: "melee" },
      { baseRevision: "base-abc", configurationSnapshot: configuration, requireReady: true },
    );

    expect(run.inputs).toMatchObject({
      starting_knowledge_revision: "base-abc",
      policy_revision: policyRevisionForConfiguration(configuration),
    });
    expect(policyRevisionForConfiguration({ alpha: { beta: 3, delta: 4 }, zeta: 2 })).toBe(
      policyRevisionForConfiguration(configuration),
    );
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

  test("records desired-worker changes only in the game log and maps dashboard work to runner", () => {
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

describe("harness run ownership", () => {
  test("rejects run creation without a harness even with an explicit base", () => {
    const { store } = testStore();
    expect(() => createRun(store, "matched_code_percent", 100, 4, { gameId: "melee" }, { baseRevision: "base" })).toThrow("initialized harness");
    expect(store.db.query("SELECT count(*) AS n FROM runs").get()).toEqual({ n: 0 });
  });
  test("rejects a requested base that differs from the accepted harness head", () => {
    const { store } = testStore();
    seedRunHarness(store, "melee", "accepted");
    expect(() => createRun(store, "matched_code_percent", 100, 4, { gameId: "melee" }, { baseRevision: "stale" })).toThrow("accepted harness head");
    expect(store.db.query("SELECT count(*) AS n FROM runs").get()).toEqual({ n: 0 });
  });
  test("uses accepted worktree and head instead of an obsolete game path and attaches one harness run", async () => {
    const { getHarnessState, initializeHarnessState, transitionHarnessState } = await import("@server/core/harness-state");
    const { store } = testStore();
    initializeHarnessState(store.db, { gameId: "melee", commandId: "initialize", worktree: "/canonical/checkout", configurationRevision: "config" });
    transitionHarnessState(store.db, { gameId: "melee", commandId: "accept", expectedRevision: 0, patch: { source: { head: "accepted" } } });
    const run = createRun(store, "matched_code_percent", 100, 4, { gameId: "melee", repoRoot: "/obsolete/checkout" }, { commandId: "create" });
    expect(run.game?.repoRoot).toBe("/canonical/checkout");
    expect(run.headRevision).toBe("accepted");
    expect(run.inputs?.base_revision).toBe("accepted");
    expect(run.inputs?.starting_knowledge_revision).toBe("accepted");
    expect(getHarnessState(store.db, "melee")?.history.run_id).toBe(run.id);
    expect(createRun(store, "matched_code_percent", 100, 4, { gameId: "melee" }).id).toBe(run.id);
    expect(store.db.query("SELECT count(*) AS n FROM runs").get()).toEqual({ n: 1 });
    expect(() => createRun(store, "matched_code_percent", 100, 4)).toThrow("explicit game id");
  });
  test("rejects unaccepted initial source without writing a run or falling back to an explicit base", async () => {
    const { initializeHarnessState } = await import("@server/core/harness-state");
    const { store } = testStore();
    initializeHarnessState(store.db, { gameId: "other", commandId: "initialize", worktree: "/other/checkout", configurationRevision: "config" });
    expect(() => createRun(store, "matched_code_percent", 100, 4, { gameId: "other" })).toThrow("Initial Sync");
    expect(store.db.query("SELECT count(*) AS n FROM runs").get()).toEqual({ n: 0 });
  });
});

 test("prepared settings persist without activation and stale edits fail", () => {
   const { store } = testStore();
   const run = readyRun(store);
   const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 4 });
   const updated = updatePreparedRunConfiguration(store, run.id, run.revision, { desired_workers: 64, model: "gpt-5.6-terra", agent_timeout_seconds: 900 }, "save-settings");
   expect(activeSchedulerEpoch(store, run.id)?.id).toBe(epoch.id);
   expect(activeSchedulerEpoch(store, run.id)?.workerPoolSize).toBe(64);
   expect(updated.status).toBe("ready");
   expect(updated.desiredWorkers).toBe(64);
   expect(updated.inputs?.configuration_snapshot.model).toBe("gpt-5.6-terra");
   expect(updated.inputs?.policy_revision).not.toBe(run.inputs?.policy_revision);
   expect(() => updatePreparedRunConfiguration(store, run.id, run.revision, { desired_workers: 32 }, "stale-settings")).toThrow();
   expect(() => updatePreparedRunConfiguration(store, run.id, updated.revision, { base_revision: "bad" }, "bad-settings")).toThrow();
   acquireRunLease(store, run.id);
   expect(() => updatePreparedRunConfiguration(store, run.id, updated.revision, { model: "other" }, "leased-settings")).toThrow();
 });

 test("updates worker settings on a paused lease-free run with a dead scheduler", () => {
   const { store } = testStore();
   const paused = pausedLeaseFreeRun(store);
   const epoch = startSchedulerEpoch(store, paused.id, { workerPoolSize: 4 });

   const updated = updatePreparedRunConfiguration(
     store,
     paused.id,
     paused.revision,
     { desired_workers: 64, agent_timeout_seconds: 900 },
     "save-paused-settings",
     { hasActiveProcess: () => ({ active: false }) },
   );

   expect(updated.status).toBe("paused");
   expect(updated.desiredWorkers).toBe(64);
   expect(updated.inputs?.configuration_snapshot).toMatchObject({ desired_workers: 64, agent_timeout_seconds: 900 });
   expect(updated.inputs?.policy_revision).not.toBe(paused.inputs?.policy_revision);
   expect(activeSchedulerEpoch(store, paused.id)).toMatchObject({ id: epoch.id, workerPoolSize: 64 });
   expect(eventsForSubject(store.db, "run", paused.id).at(-1)).toMatchObject({
     eventType: "run.configured",
     payload: {
       old_values: { desired_workers: 4 },
       new_values: { desired_workers: 64, agent_timeout_seconds: 900 },
     },
   });
 });

 test("reconciles stale active harness execution before updating a paused lease-free run", () => {
   const { store } = testStore();
   const paused = pausedLeaseFreeRun(store);
   let harness = getHarnessState(store.db, "melee")!;
   harness = transitionHarnessState(store.db, {
     gameId: "melee",
     expectedRevision: harness.identity.revision,
     commandId: "prepare-stale-harness",
     patch: {
       execution: { desired: "run" },
       readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" },
     },
   });
   harness = transitionHarnessState(store.db, {
     gameId: "melee",
     expectedRevision: harness.identity.revision,
     commandId: "activate-stale-harness",
     patch: { execution: { workflow: "run", status: "active" } },
   });
   transitionHarnessState(store.db, {
     gameId: "melee",
     expectedRevision: harness.identity.revision,
     commandId: "pause-stale-harness",
     patch: { execution: { desired: "paused" } },
   });

   const updated = updatePreparedRunConfiguration(
     store,
     paused.id,
     paused.revision,
     { desired_workers: 64 },
     "save-stale-paused-settings",
     { hasActiveProcess: () => ({ active: false }) },
   );

   expect(updated).toMatchObject({ status: "paused", desiredWorkers: 64 });
   expect(getHarnessState(store.db, "melee")).toMatchObject({
     execution: { desired: "paused", workflow: "none", status: "paused", blockers: [] },
     readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" },
   });
   expect(getHarnessTimeline(store.db, "melee", { order: "desc", limit: 1 })[0]).toMatchObject({
     kind: "recovered",
     outcome: "hard_stopped",
     runId: paused.id,
     evidence: { run_id: paused.id, cancelled_claim_ids: [] },
   });
 });

 test("refuses paused settings while a dispatch lease is live", () => {
   const { store } = testStore();
   const ready = readyRun(store);
   acquireRunLease(store, ready.id);
   const active = updateRunStatus(store, ready.id, "active", "operator");
   const paused = updateRunStatus(store, active.id, "paused", "operator");

   expect(() => updatePreparedRunConfiguration(
     store,
     paused.id,
     paused.revision,
     { desired_workers: 64 },
     "leased-paused-settings",
     { hasActiveProcess: () => ({ active: false }) },
   )).toThrow("Settings can only change");
 });

 test("refuses worker policy changes on a paused run", () => {
   const { store } = testStore();
   const paused = pausedLeaseFreeRun(store);

   expect(() => updatePreparedRunConfiguration(
     store,
     paused.id,
     paused.revision,
     { model: "gpt-5.5" },
     "paused-model-settings",
     { hasActiveProcess: () => ({ active: false }) },
   )).toThrow("model changes worker policy mid-run");
   expect(getRun(store, paused.id)?.revision).toBe(paused.revision);
 });

 test("refuses paused settings when scheduler liveness is unknown", () => {
   const { store } = testStore();
   const paused = pausedLeaseFreeRun(store);

   expect(() => updatePreparedRunConfiguration(
     store,
     paused.id,
     paused.revision,
     { desired_workers: 64 },
     "unknown-liveness-settings",
   )).toThrow("process liveness could not be determined");
 });

describe("live desired workers", () => {
  test("changes only the worker count on an active run and keeps it for a restart", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    acquireRunLease(store, ready.id);
    const active = updateRunStatus(store, ready.id, "active", "operator");
    const epoch = startSchedulerEpoch(store, active.id, { workerPoolSize: 4 });

    const raised = setRunDesiredWorkersLive(store, active.id, 120, { commandId: "live-raise" });

    expect(raised.previousDesiredWorkers).toBe(4);
    expect(raised.run).toMatchObject({ status: "active", desiredWorkers: 120, revision: active.revision + 1 });
    expect(raised.run.inputs?.configuration_snapshot).toEqual({ desired_workers: 120, nested: { beta: 2, alpha: 1 } });
    expect(raised.run.inputs?.base_revision).toBe(active.inputs?.base_revision);
    expect(raised.run.inputs?.policy_revision).toBe(policyRevisionForConfiguration({ desired_workers: 120, nested: { beta: 2, alpha: 1 } }));
    expect(readRunDesiredWorkers(store, active.id)).toBe(120);
    expect(activeSchedulerEpoch(store, active.id)).toMatchObject({ id: epoch.id, workerPoolSize: 120 });
    expect(eventsForSubject(store.db, "run", active.id).at(-1)).toMatchObject({
      eventType: "run.configured",
      causationId: "live-raise",
      payload: { old_values: { desired_workers: 4 }, new_values: { desired_workers: 120 } },
    });

    const lowered = setRunDesiredWorkersLive(store, active.id, 8);
    expect(lowered).toMatchObject({ previousDesiredWorkers: 120, run: { desiredWorkers: 8, revision: active.revision + 2 } });
    expect(setRunDesiredWorkersLive(store, active.id, 8).run.revision).toBe(active.revision + 2);
  });

  test("changes a paused run while its dispatch lease is still held", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    acquireRunLease(store, ready.id);
    const paused = updateRunStatus(store, updateRunStatus(store, ready.id, "active", "operator").id, "paused", "operator");

    expect(setRunDesiredWorkersLive(store, paused.id, 64).run).toMatchObject({ status: "paused", desiredWorkers: 64 });
  });

  test("refuses counts outside 1..256 and finished runs", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    for (const workers of [0, 257, 1.5, Number.NaN]) {
      expect(() => setRunDesiredWorkersLive(store, ready.id, workers)).toThrow("from 1 to 256");
    }
    expect(setRunDesiredWorkersLive(store, ready.id, 256).run.desiredWorkers).toBe(256);
    acquireRunLease(store, ready.id);
    const completed = updateRunStatus(store, updateRunStatus(store, ready.id, "active", "operator").id, "completed", "operator");

    expect(() => setRunDesiredWorkersLive(store, completed.id, 12)).toThrow("is completed");
    expect(getRun(store, completed.id)?.desiredWorkers).toBe(256);
  });
});

describe("live boundary Sync hold", () => {
  test("turns on and off an active run's hold, keeps it in the snapshot, and skips no-op writes", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    acquireRunLease(store, ready.id);
    const active = updateRunStatus(store, ready.id, "active", "operator");
    expect(readRunBoundarySyncHold(store, active.id)).toBe(false);
    expect(setRunBoundarySyncHoldLive(store, active.id, false).run.revision).toBe(active.revision);

    const held = setRunBoundarySyncHoldLive(store, active.id, true, { commandId: "hold-on" });
    expect(held.previousHold).toBe(false);
    expect(held.run).toMatchObject({ status: "active", desiredWorkers: 4, revision: active.revision + 1 });
    expect(held.run.inputs?.configuration_snapshot).toEqual({ desired_workers: 4, nested: { beta: 2, alpha: 1 }, boundary_sync_hold: true });
    expect(readRunBoundarySyncHold(store, active.id)).toBe(true);
    expect(eventsForSubject(store.db, "run", active.id).at(-1)).toMatchObject({
      eventType: "run.configured",
      causationId: "hold-on",
      payload: { old_values: { boundary_sync_hold: false }, new_values: { boundary_sync_hold: true } },
    });
    expect(setRunBoundarySyncHoldLive(store, active.id, true).run.revision).toBe(active.revision + 1);

    const cleared = setRunBoundarySyncHoldLive(store, active.id, false);
    expect(cleared).toMatchObject({ previousHold: true, run: { revision: active.revision + 2 } });
    expect(readRunBoundarySyncHold(store, active.id)).toBe(false);
  });

  test("refuses finished runs", () => {
    const { store } = testStore();
    const ready = readyRun(store);
    acquireRunLease(store, ready.id);
    const completed = updateRunStatus(store, updateRunStatus(store, ready.id, "active", "operator").id, "completed", "operator");

    expect(() => setRunBoundarySyncHoldLive(store, completed.id, true)).toThrow("is completed");
    expect(readRunBoundarySyncHold(store, completed.id)).toBe(false);
  });
});
