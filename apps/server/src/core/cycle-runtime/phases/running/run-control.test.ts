import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import {
  DispatchLeaseNotActiveError,
  eventsForSubject,
  getHarnessState,
  initializeHarnessState,
  listGameEvents,
  newSpanId,
  releaseDispatch,
  requestDispatch,
  STALE_DISPATCH_LEASE_MS,
} from "@server/core/harness-state";
import { recoverActiveClaims } from "@server/core/cycle-runtime/phases/running/jobs/recover-claims.js";
import {
  activeClaimsForRun,
  admitEpochTargets,
  claimNextEpochTarget,
  closeWorkerState,
  createRun,
  getRun,
  openState,
  recordWorkerCheckpoint,
  startSchedulerEpoch,
  updateRunStatus,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import {
  activateRun,
  cancelRun,
  hardStopRun,
  isStaleRunDispatchLease,
  pauseRun,
  reconcileRunLeaseState,
  recoverRun,
  runDispatchLeaseStaleness,
  settlePausedRun,
} from "./run-control.js";

const tempDirs: string[] = [];
const stores: StateStore[] = [];

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "run-control-"));
  tempDirs.push(dir);
  const store = openState(dir);
  stores.push(store);
  return { dir, store };
}

function globalsFor(dir: string): GlobalArgs {
  return {
    dryRunAgents: true,
    model: "test",
    provider: "test",
    repoRoot: dir,
    stateDir: dir,
    thinkingLevel: "low",
  };
}

function activeRun(store: StateStore, dir: string) {
  const run = createRun(
    store,
    "matched_code_percent",
    100,
    1,
    { gameId: "melee", repoRoot: dir, stateDir: dir },
    { baseRevision: "base-test" },
  );
  initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
  const dispatch = requestDispatch(store, {
    actor: "operator",
    commandId: `command-activate-${run.id}`,
    correlationId: run.id,
    kind: "run",
    gameId: "melee",
    reason: "test activation",
    workflowId: run.id,
  });
  if (dispatch.queued) throw new Error("test dispatch was unexpectedly queued");
  return { leaseId: dispatch.leaseId, run: updateRunStatus(store, run.id, "active", "operator") };
}

function orphanedClaim(store: StateStore, runId: string) {
  const epoch = startSchedulerEpoch(store, runId, {
    candidateWindow: 1,
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
  });
  admitEpochTargets(store, {
    candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 99, priority: 1, reason: "test" }],
    epochId: epoch.id,
    runId,
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
  });
  const claim = claimNextEpochTarget({
    baseRev: "base-test",
    runId,
    store,
    ttlSeconds: 1800,
    workerId: "worker-orphaned",
  });
  if (!claim) throw new Error("test target was not claimed");
  return claim;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("run recovery controls", () => {
  test("activation rolls back dispatch acquisition when the run CAS fails", () => {
    const { dir, store } = tempState();
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", repoRoot: dir, stateDir: dir },
      { baseRevision: "base-test" },
    );
    initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
    store.db.exec(`
      CREATE TRIGGER reject_test_activation
      BEFORE UPDATE OF status ON runs
      WHEN NEW.id = '${run.id}' AND NEW.status = 'active'
      BEGIN
        SELECT RAISE(ABORT, 'test activation CAS failure');
      END
    `);

    expect(() =>
      activateRun({ reason: "test activation", runId: run.id, store }),
    ).toThrow("test activation CAS failure");
    expect(getRun(store, run.id)?.status).toBe("ready");
    expect(getHarnessState(store, "melee")?.active_workflow).toBeNull();
  });

  test("activation uses one command, one actor, and a root span with causal leaf events", () => {
    const { dir, store } = tempState();
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", repoRoot: dir, stateDir: dir },
      { baseRevision: "base-test" },
    );
    initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
    const beforeSequence = listGameEvents(store.db).at(-1)?.sequence ?? 0;

    activateRun({
      actor: "operator",
      commandId: "command-run-activate-test",
      reason: "operator activated run",
      runId: run.id,
      store,
    });

    const events = listGameEvents(store.db, { afterSequence: beforeSequence });
    expect(events.map((event) => event.eventType)).toEqual([
      "game.dispatch_requested",
      "game.dispatch_acquired",
      "run.activated",
    ]);
    expect(events.map((event) => event.causationId)).toEqual([
      "command-run-activate-test",
      events[0]?.eventId,
      events[1]?.eventId,
    ]);
    expect(new Set(events.map((event) => event.actor))).toEqual(new Set(["operator"]));
    expect(new Set(events.map((event) => event.correlationId))).toEqual(new Set([run.id]));
    expect(new Set(events.map((event) => event.parentSpanId)).size).toBe(1);
    expect(new Set(events.map((event) => event.spanId)).size).toBe(3);
  });

  test("recovers a failed run in place and names every settled claim", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const claim = orphanedClaim(store, active.run.id);
    const failed = updateRunStatus(store, active.run.id, "failed", "runner");
    releaseDispatch(store, {
      actor: "operator",
      commandId: "command-release-failed-run",
      correlationId: failed.id,
      leaseId: active.leaseId,
      gameId: "melee",
    });
    const recovered = await recoverRun({
      confirmed: true,
      globals: globalsFor(dir),
      processIntegrations: false,
      reason: "recover after worker crash",
      runId: failed.id,
      store,
    });

    expect(recovered).toMatchObject({
      cancelledClaimIds: [claim.claimId],
      cancelledOperationIds: [],
      dispatchLeaseRecovered: true,
      recoveryReason: "recover after worker crash",
      run: { id: failed.id, revision: failed.revision + 1, status: "paused" },
    });
    expect(activeClaimsForRun(store, failed.id)).toHaveLength(0);
    const event = eventsForSubject(store.db, "run", failed.id).at(-1);
    expect(event).toMatchObject({
      eventType: "run.recovered",
      payload: {
        cancelled_claim_ids: [claim.claimId],
        cancelled_operation_ids: [],
        recovery_reason: "recover after worker crash",
        resulting_status: "paused",
      },
    });
    expect(getRun(store, failed.id)?.causedByEventId).toBe(event?.eventId);
  });

  test("failed-run recovery releases its owned lease even when the heartbeat is fresh", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const failed = updateRunStatus(store, active.run.id, "failed", "runner");

    const recovered = await recoverRun({
      confirmed: true,
      globals: globalsFor(dir),
      processIntegrations: false,
      reason: "recover failed run with fresh lease",
      runId: failed.id,
      store,
    });

    expect(recovered).toMatchObject({ dispatchLeaseRecovered: true, run: { status: "paused" } });
    expect(getHarnessState(store, "melee")?.active_workflow).toBeNull();
  });

  test("recovery without the lease persists a blocker naming queued checkpoint work", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const claim = orphanedClaim(store, active.run.id);
    recordWorkerCheckpoint(store, {
      attemptIndex: 0,
      diffPath: join(dir, "orphaned.patch"),
      epochId: claim.epochId,
      epochTargetId: claim.epochTargetId,
      exactMatch: true,
      hardGatesPassed: true,
      newScore: 100,
      oldScore: 99,
      patchPath: join(dir, "orphaned.patch"),
      runId: active.run.id,
      targetClaimId: claim.claimId,
      validationStatus: "passed",
      workerStateId: claim.workerStateId,
      writeSet: ["src/a.c"],
    });
    const failed = updateRunStatus(store, active.run.id, "failed", "runner");
    releaseDispatch(store, {
      actor: "operator",
      commandId: "command-release-failed-for-pr",
      correlationId: failed.id,
      leaseId: active.leaseId,
      gameId: "melee",
    });
    const competingRun = createRun(
      store,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", repoRoot: dir, stateDir: dir },
      { baseRevision: "base-test" },
    );
    const competingDispatch = requestDispatch(store, {
      actor: "operator",
      commandId: "command-competing-run-owns-checkout",
      correlationId: competingRun.id,
      kind: "run",
      gameId: "melee",
      reason: "another run owns checkout during recovery",
      workflowId: competingRun.id,
    });
    if (competingDispatch.queued) throw new Error("test competing run lease was unexpectedly queued");

    const recovered = await recoverRun({
      confirmed: true,
      globals: globalsFor(dir),
      reason: "recover evidence without checkout authority",
      runId: failed.id,
      store,
    });

    const integrationId = String(recovered.run.blockers[0]?.source_id ?? "");
    expect(recovered).toMatchObject({ dispatchLeaseRecovered: false, run: { status: "paused" } });
    expect(recovered.run.blockers).toEqual([
      expect.objectContaining({
        code: "worker_output_integration_lease_unavailable",
        message: expect.stringContaining(integrationId),
        source_id: integrationId,
      }),
    ]);
    expect(integrationId).not.toBe("");
    expect(getHarnessState(store, "melee")).toMatchObject({
      active_workflow: { kind: "run", workflow_id: competingRun.id },
      queued_dispatch_requests: [expect.objectContaining({ kind: "run", workflow_id: failed.id })],
    });
  });

  test("hard stops active work by settling claims, releasing its lease, and pausing through CAS", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const claim = orphanedClaim(store, active.run.id);

    const stopped = await hardStopRun({
      confirmed: true,
      globals: globalsFor(dir),
      processIntegrations: false,
      reason: "operator hard stop",
      runId: active.run.id,
      store,
    });

    expect(stopped).toMatchObject({
      cancelledClaimIds: [claim.claimId],
      cancelledOperationIds: [],
      dispatchLeaseRecovered: true,
      run: { id: active.run.id, revision: active.run.revision + 1, status: "paused" },
    });
    expect(activeClaimsForRun(store, active.run.id)).toHaveLength(0);
    expect(getHarnessState(store, "melee")?.active_workflow).toBeNull();
    const event = eventsForSubject(store.db, "run", active.run.id).at(-1);
    expect(event).toMatchObject({
      eventType: "run.paused",
      payload: {
        cancelled_claim_ids: [claim.claimId],
        from_status: "active",
        to_status: "paused",
      },
    });
    expect(stopped.run.causedByEventId).toBe(event?.eventId ?? null);
  });

  test("pause records draining before settlement and refuses new claims until the supervisor pauses", () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const claim = orphanedClaim(store, active.run.id);

    const draining = pauseRun({ reason: "operator pause", runId: active.run.id, store });

    expect(draining).toMatchObject({ leaseId: active.leaseId, settled: false, run: { status: "draining" } });
    expect(getHarnessState(store, "melee")?.active_workflow).toMatchObject({
      lease_id: active.leaseId,
      status: "draining",
    });
    expect(() =>
      claimNextEpochTarget({
        baseRev: "base-test",
        leaseId: active.leaseId,
        runId: active.run.id,
        store,
        ttlSeconds: 1800,
        workerId: "worker-refused-while-draining",
      }),
    ).toThrow(DispatchLeaseNotActiveError);

    closeWorkerState(store, {
      epochTargetStatus: "finished",
      lifecycleStatus: "finished",
      summary: { settled_for_pause: true },
      workerStateId: claim.workerStateId,
    });
    const beforeSettlement = listGameEvents(store.db).at(-1)?.sequence ?? 0;
    const drainEvent = [...listGameEvents(store.db)].reverse().find(
      (event) => event.eventType === "game.dispatch_drain_started",
    )!;
    const settlementRoot = newSpanId();
    const paused = settlePausedRun({
      commandId: "command-supervisor-settled-test",
      leaseId: active.leaseId,
      reason: "supervisor drained",
      runId: active.run.id,
      spanId: settlementRoot,
      store,
    });

    expect(paused).toMatchObject({
      settled: true,
      run: {
        status: "paused",
        stopRequest: { mode: "pause", reason: "operator pause" },
      },
    });
    expect(getHarnessState(store, "melee")?.active_workflow).toBeNull();
    expect(eventsForSubject(store.db, "run", active.run.id).slice(-3).map((event) => event.eventType)).toEqual([
      "run.draining",
      "game.dispatch_drain_started",
      "run.paused",
    ]);
    const settlementEvents = listGameEvents(store.db, { afterSequence: beforeSettlement });
    expect(settlementEvents.map((event) => event.eventType)).toEqual(["game.dispatch_released", "run.paused"]);
    expect(settlementEvents.map((event) => event.actor)).toEqual(["runner", "runner"]);
    expect(settlementEvents.map((event) => event.correlationId)).toEqual([active.run.id, active.run.id]);
    expect(settlementEvents.map((event) => event.causationId)).toEqual([
      drainEvent.eventId,
      settlementEvents[0]?.eventId,
    ]);
    expect(settlementEvents.map((event) => event.parentSpanId)).toEqual([settlementRoot, settlementRoot]);
    expect(settlementEvents[0]?.spanId).not.toBe(settlementEvents[1]?.spanId);
    expect(settlementEvents[1]?.payload).toEqual({
      from_status: "draining",
      to_status: "paused",
    });
  });

  test("pause rolls the run transition back when the lease cannot enter draining", () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const beforeEvents = eventsForSubject(store.db, "run", active.run.id).length;
    store.db.exec(`
      CREATE TRIGGER reject_test_lease_drain
      BEFORE UPDATE OF active_workflow_json ON harness_state
      WHEN NEW.active_workflow_json LIKE '%"status":"draining"%'
      BEGIN
        SELECT RAISE(ABORT, 'test lease drain failure');
      END
    `);

    expect(() => pauseRun({ reason: "operator pause", runId: active.run.id, store })).toThrow("test lease drain failure");
    expect(getRun(store, active.run.id)).toMatchObject({ revision: active.run.revision, status: "active" });
    expect(getHarnessState(store, "melee")?.active_workflow).toMatchObject({ lease_id: active.leaseId, status: "active" });
    expect(eventsForSubject(store.db, "run", active.run.id)).toHaveLength(beforeEvents);
  });

  test("hard stop is event-free after supervisor settlement already paused the run", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    pauseRun({ reason: "operator pause", runId: active.run.id, store });
    const settled = settlePausedRun({
      actor: "guardian",
      leaseId: active.leaseId,
      reason: "babysit reported settlement",
      runId: active.run.id,
      store,
    });
    const beforeEvents = eventsForSubject(store.db, "run", active.run.id).length;

    const stopped = await hardStopRun({
      confirmed: true,
      globals: globalsFor(dir),
      processIntegrations: false,
      reason: "operator hard stop raced with babysit",
      runId: active.run.id,
      store,
    });

    expect(stopped.run).toEqual(settled.run);
    expect(eventsForSubject(store.db, "run", active.run.id)).toHaveLength(beforeEvents);
  });

  test("startup reconciliation repairs paused-with-lease and active-without-lease crash windows", () => {
    const first = tempState();
    const pausedWithLease = activeRun(first.store, first.dir);
    const paused = updateRunStatus(first.store, pausedWithLease.run.id, "paused", "test");
    const released = reconcileRunLeaseState({
      reason: "startup reconciliation",
      runId: paused.id,
      store: first.store,
    });
    expect(released).toMatchObject({ action: "released_unexpected_lease", run: { revision: paused.revision, status: "paused" } });
    expect(getHarnessState(first.store, "melee")?.active_workflow).toBeNull();

    const second = tempState();
    const leaseFree = activeRun(second.store, second.dir);
    releaseDispatch(second.store, {
      actor: "operator",
      commandId: "command-crash-window-release",
      correlationId: leaseFree.run.id,
      leaseId: leaseFree.leaseId,
      gameId: "melee",
    });
    const repaired = reconcileRunLeaseState({
      reason: "startup reconciliation",
      runId: leaseFree.run.id,
      store: second.store,
    });
    expect(repaired).toMatchObject({
      action: "paused_lease_free_run",
      run: {
        revision: leaseFree.run.revision + 1,
        status: "paused",
        stopRequest: { mode: "pause", reason: "startup reconciliation" },
      },
    });
    expect(eventsForSubject(second.store.db, "run", leaseFree.run.id).at(-1)).toMatchObject({
      eventType: "run.paused",
      payload: { from_status: "active", to_status: "paused" },
    });

    const third = tempState();
    const drainingLease = activeRun(third.store, third.dir);
    const currentState = getHarnessState(third.store, "melee");
    if (!currentState?.active_workflow) throw new Error("test run has no draining lease");
    third.store.db
      .query("UPDATE harness_state SET active_workflow_json = ? WHERE game_id = ?")
      .run(
        JSON.stringify({ ...currentState.active_workflow, status: "draining" }),
        "melee",
      );
    const aligned = reconcileRunLeaseState({
      reason: "startup reconciliation",
      runId: drainingLease.run.id,
      store: third.store,
    });
    expect(aligned).toMatchObject({
      action: "aligned_run_to_draining_lease",
      run: { revision: drainingLease.run.revision + 1, status: "draining" },
    });
    expect(eventsForSubject(third.store.db, "run", drainingLease.run.id).at(-1)).toMatchObject({
      eventType: "run.draining",
      payload: {
        from_status: "active",
        lease_id: drainingLease.leaseId,
        reason: "startup reconciliation",
        to_status: "draining",
      },
    });
    for (const [store, runId] of [
      [first.store, pausedWithLease.run.id],
      [second.store, leaseFree.run.id],
      [third.store, drainingLease.run.id],
    ] as const) {
      expect(eventsForSubject(store.db, "run", runId).map((event) => event.eventType)).not.toContain(
        "run.lease_reconciled",
      );
    }
  });

  test("recovers an active run only when its old lease has no active managed process", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const state = getHarnessState(store, "melee");
    if (!state?.active_workflow) throw new Error("test run has no dispatch lease");
    const now = Date.parse("2026-08-12T12:30:00.000Z");
    store.db
      .query("UPDATE harness_state SET active_workflow_json = ? WHERE game_id = ?")
      .run(
        JSON.stringify({ ...state.active_workflow, heartbeat_at: "2026-08-12T12:00:00.000Z" }),
        "melee",
      );

    await expect(
      recoverRun({
        confirmed: true,
        globals: globalsFor(dir),
        hasActiveProcess: () => ({ active: true }),
        now,
        processIntegrations: false,
        reason: "stale dispatch lease",
        runId: active.run.id,
        store,
      }),
    ).rejects.toThrow("dispatch lease is not stale");

    await expect(
      recoverRun({
        confirmed: true,
        globals: globalsFor(dir),
        now,
        processIntegrations: false,
        reason: "unknown process liveness",
        runId: active.run.id,
        store,
      }),
    ).rejects.toMatchObject({ blockerCodes: ["process_liveness_unknown"] });

    const recovered = await recoverRun({
      confirmed: true,
      globals: globalsFor(dir),
      hasActiveProcess: () => ({ active: false }),
      now,
      processIntegrations: false,
      reason: "stale dispatch lease",
      runId: active.run.id,
      store,
    });

    expect(recovered).toMatchObject({ dispatchLeaseRecovered: true, run: { id: active.run.id, status: "paused" } });
    expect(getHarnessState(store, "melee")?.active_workflow).toBeNull();
    expect(eventsForSubject(store.db, "run", active.run.id).at(-1)).toMatchObject({
      eventType: "run.recovered",
      payload: { recovery_reason: "stale dispatch lease", resulting_status: "paused" },
    });
  });

  test("refuses an unsupported recovery status before touching its dispatch lease", async () => {
    const { dir, store } = tempState();
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", repoRoot: dir, stateDir: dir },
      { baseRevision: "base-test" },
    );
    initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
    const dispatch = requestDispatch(store, {
      actor: "operator",
      commandId: "command-ready-run-lease",
      correlationId: run.id,
      kind: "run",
      gameId: "melee",
      reason: "simulate unsupported ready run with lease",
      workflowId: run.id,
    });
    if (dispatch.queued) throw new Error("test run lease was unexpectedly queued");
    const state = getHarnessState(store, "melee");
    if (!state?.active_workflow) throw new Error("test run has no dispatch lease");
    store.db
      .query("UPDATE harness_state SET active_workflow_json = ? WHERE game_id = ?")
      .run(
        JSON.stringify({ ...state.active_workflow, heartbeat_at: "2026-08-12T12:00:00.000Z" }),
        "melee",
      );
    const before = getHarnessState(store, "melee");

    await expect(
      recoverRun({
        confirmed: true,
        globals: globalsFor(dir),
        hasActiveProcess: () => ({ active: false }),
        now: Date.parse("2026-08-12T12:30:00.000Z"),
        processIntegrations: false,
        reason: "unsupported ready recovery",
        runId: run.id,
        store,
      }),
    ).rejects.toMatchObject({ blockerCodes: ["run_status_not_recoverable"] });

    expect(getHarnessState(store, "melee")).toEqual(before);
    expect(getRun(store, run.id)).toMatchObject({ revision: run.revision, status: "ready" });
    expect(store.db.query("SELECT COUNT(*) AS count FROM run_recovery_journal WHERE run_id = ?").get(run.id)).toEqual({ count: 0 });
  });

  test("recovery rolls lease release back when the failed-to-paused CAS fails", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const failed = updateRunStatus(store, active.run.id, "failed", "runner");
    store.db.exec(`
      CREATE TRIGGER reject_test_recovery
      BEFORE UPDATE OF status ON runs
      WHEN NEW.id = '${failed.id}' AND NEW.status = 'paused'
      BEGIN
        SELECT RAISE(ABORT, 'test recovery CAS failure');
      END
    `);

    await expect(
      recoverRun({
        confirmed: true,
        globals: globalsFor(dir),
        processIntegrations: false,
        reason: "test atomic recovery",
        runId: failed.id,
        store,
      }),
    ).rejects.toThrow("test recovery CAS failure");
    expect(getRun(store, failed.id)?.status).toBe("failed");
    expect(getHarnessState(store, "melee")?.active_workflow).toMatchObject({
      lease_id: active.leaseId,
      workflow_id: failed.id,
    });
  });

  test("recovery retry reports journaled claims after a simulated crash", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const claim = orphanedClaim(store, active.run.id);
    const failed = updateRunStatus(store, active.run.id, "failed", "runner");
    store.db.exec(`
      CREATE TRIGGER reject_test_journaled_recovery
      BEFORE UPDATE OF status ON runs
      WHEN NEW.id = '${failed.id}' AND NEW.status = 'paused'
      BEGIN
        SELECT RAISE(ABORT, 'test journaled recovery crash');
      END
    `);

    await expect(recoverRun({
      confirmed: true,
      globals: globalsFor(dir),
      processIntegrations: false,
      reason: "original journaled recovery",
      runId: failed.id,
      store,
    })).rejects.toThrow("test journaled recovery crash");

    expect(activeClaimsForRun(store, failed.id).map((activeClaim) => activeClaim.claimId)).toEqual([claim.claimId]);
    expect(store.db.query("SELECT lifecycle_status FROM worker_state WHERE id = ?").get(claim.workerStateId)).toEqual({
      lifecycle_status: "running",
    });
    expect(store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_error'").get(failed.id)).toEqual({ count: 0 });
    const prepared = store.db
      .query(
        `SELECT recovery_id, recovery_reason, cancelled_claim_ids_json, cancelled_operation_ids_json, status
         FROM run_recovery_journal WHERE run_id = ?`,
      )
      .get(failed.id) as Record<string, unknown>;
    expect(prepared).toMatchObject({
      recovery_reason: "original journaled recovery",
      cancelled_claim_ids_json: JSON.stringify([claim.claimId]),
      cancelled_operation_ids_json: "[]",
      status: "prepared",
    });

    store.db.exec("DROP TRIGGER reject_test_journaled_recovery");
    store.db.close();
    stores.splice(stores.indexOf(store), 1);
    const reopened = openState(dir);
    stores.push(reopened);
    const recovered = await recoverRun({
      confirmed: true,
      globals: globalsFor(dir),
      processIntegrations: false,
      reason: "retry after process crash",
      runId: failed.id,
      store: reopened,
    });

    expect(recovered).toMatchObject({
      cancelledClaimIds: [claim.claimId],
      cancelledOperationIds: [],
      recoveryReason: "original journaled recovery",
      run: { status: "paused" },
    });
    const recoveryEvents = eventsForSubject(reopened.db, "run", failed.id).filter(
      (event) => event.eventType === "run.recovered",
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0]?.payload).toMatchObject({
      cancelled_claim_ids: [claim.claimId],
      cancelled_operation_ids: [],
      recovery_reason: "original journaled recovery",
    });
    expect(reopened.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_error'").get(failed.id)).toEqual({ count: 1 });
    expect(reopened.db.query("SELECT status, caused_by_event_id FROM run_recovery_journal WHERE recovery_id = ?").get(String(prepared.recovery_id))).toEqual({
      status: "completed",
      caused_by_event_id: recoveryEvents[0]?.eventId,
    });
  });

  test("blocks cancellation on unsettled claims, then allows it after settlement", async () => {
    const { dir, store } = tempState();
    const active = activeRun(store, dir);
    const claim = orphanedClaim(store, active.run.id);
    const paused = updateRunStatus(store, active.run.id, "paused", "operator");

    expect(() =>
      cancelRun({ confirmed: true, reason: "abandon run", runId: paused.id, store }),
    ).toThrow(`Run ${paused.id} has 1 unsettled claim(s): ${claim.claimId}`);
    expect(getRun(store, paused.id)).toMatchObject({ revision: paused.revision, status: "paused" });

    await recoverActiveClaims({
      force: true,
      globals: globalsFor(dir),
      processIntegrations: false,
      reason: "settle before cancellation",
      repoRoot: dir,
      runId: paused.id,
      store,
    });
    const cancelled = cancelRun({ confirmed: true, reason: "abandon run", runId: paused.id, store });

    expect(cancelled).toMatchObject({
      revision: paused.revision + 1,
      status: "cancelled",
      terminalReason: "abandon run",
    });
    expect(eventsForSubject(store.db, "run", paused.id).at(-1)).toMatchObject({
      eventType: "run.cancelled",
      payload: {
        cancellation_reason: "abandon run",
        from_status: "paused",
        to_status: "cancelled",
      },
    });
  });

  test("requires both an expired heartbeat and no active managed process for stale-lease recovery", () => {
    const heartbeatAt = new Date(Date.now() - STALE_DISPATCH_LEASE_MS - 1).toISOString();
    const lease = {
      acquired_at: heartbeatAt,
      blockers: [],
      heartbeat_at: heartbeatAt,
      kind: "run" as const,
      lease_id: "lease-test",
      status: "active" as const,
      workflow_id: "run-test",
    };

    expect(runDispatchLeaseStaleness({ hasActiveProcess: () => ({ active: true }), lease, stateDir: "/tmp/test" })).toBe("not_stale");
    expect(runDispatchLeaseStaleness({ hasActiveProcess: () => ({ active: false }), lease, stateDir: "/tmp/test" })).toBe("stale");
    expect(runDispatchLeaseStaleness({ hasActiveProcess: () => { throw new Error("unreachable"); }, lease, stateDir: "/tmp/test" })).toBe("process_liveness_unknown");
    expect(runDispatchLeaseStaleness({ lease, stateDir: "/tmp/test" })).toBe("process_liveness_unknown");
    expect(isStaleRunDispatchLease({ hasActiveProcess: () => { throw new Error("unreachable"); }, lease, stateDir: "/tmp/test" })).toBe(false);
    expect(isStaleRunDispatchLease({ lease, stateDir: "/tmp/test" })).toBe(false);
  });
});
