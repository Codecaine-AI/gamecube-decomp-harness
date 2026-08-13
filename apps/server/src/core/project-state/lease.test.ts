import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { eventsForSubject, listProjectEvents } from "./events.js";
import {
  StaleLeaseError,
  beginDrain,
  cancelDispatchRequest,
  checkLease,
  getProjectState,
  heartbeatDispatch,
  initializeProjectState,
  recoverDispatch,
  releaseDispatch,
  requestDispatch,
  requireLease,
} from "./lease.js";

const PROJECT_ID = "melee";
const TRACE_ID = "trace-project-melee";
const BASE_CONTEXT = {
  projectId: PROJECT_ID,
  actor: "operator" as const,
  correlationId: "correlation-dispatch-test",
  spanId: "span-dispatch-test",
};

let stores: StateStore[] = [];
let tempDirs: string[] = [];

function testStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "project-state-lease-"));
  tempDirs.push(dir);
  const store = openState(dir);
  stores.push(store);
  initializeProjectState(store, {
    projectId: PROJECT_ID,
    traceId: TRACE_ID,
    now: "2026-08-12T10:00:00.000Z",
  });
  return store;
}

afterEach(() => {
  for (const store of stores) store.db.close();
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  stores = [];
  tempDirs = [];
});

describe("project dispatch lease", () => {
  test("initializes project state and acquires a free lease through requested and acquired revisions", () => {
    const store = testStore();
    const initial = getProjectState(store, PROJECT_ID);
    expect(initial).toMatchObject({
      project_id: PROJECT_ID,
      revision: 0,
      active_workflow: null,
      queued_dispatch_requests: [],
      caused_by_event_id: null,
    });

    const decision = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
      now: "2026-08-12T10:01:00.000Z",
    });

    expect(decision.queued).toBeFalse();
    if (decision.queued) throw new Error("expected acquired dispatch decision");
    expect(decision.leaseId).toStartWith("lease-");
    expect(decision.state).toMatchObject({
      revision: 2,
      trace_id: TRACE_ID,
      active_workflow: {
        kind: "run",
        workflow_id: "run-1",
        lease_id: decision.leaseId,
        status: "active",
        acquired_at: "2026-08-12T10:01:00.000Z",
        heartbeat_at: "2026-08-12T10:01:00.000Z",
      },
    });

    const events = eventsForSubject(store.db, "project", PROJECT_ID);
    expect(events.map((event) => event.eventType)).toEqual([
      "project.dispatch_requested",
      "project.dispatch_acquired",
    ]);
    expect(events[0]?.payload).toMatchObject({
      requested_kind: "run",
      workflow_id: "run-1",
      current_lease_holder: null,
      reason: "start run",
      queued: false,
    });
    expect(events[1]?.causationId).toBe(events[0]?.eventId);
    expect(events[1]?.payload.state_revision).toBe(2);
    expect(decision.state.caused_by_event_id).toBe(events[1]?.eventId);
  });

  test("queues occupied requests durably, deduplicates queue entries, and never auto-acquires them", () => {
    const store = testStore();
    const run = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");

    const first = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "sync",
      workflowId: "sync-1",
      reason: "merged upstream work",
      commandId: "command-sync-1",
      now: "2026-08-12T10:02:00.000Z",
    });
    const duplicate = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "sync",
      workflowId: "sync-1",
      reason: "duplicate request",
      commandId: "command-sync-1-duplicate",
      now: "2026-08-12T10:03:00.000Z",
    });

    expect(first.queued).toBeTrue();
    expect(duplicate.queued).toBeTrue();
    if (!first.queued || !duplicate.queued) throw new Error("expected queued decisions");
    expect(first.blockedBy.lease_id).toBe(run.leaseId);
    expect(first.state.revision).toBe(3);
    expect(duplicate.state.revision).toBe(4);
    expect(duplicate.state.queued_dispatch_requests).toEqual([
      {
        kind: "sync",
        workflow_id: "sync-1",
        reason: "merged upstream work",
        requested_at: "2026-08-12T10:02:00.000Z",
        requested_by: "operator",
      },
    ]);
    expect(duplicate.state.active_workflow?.lease_id).toBe(run.leaseId);

    const queuedRow = store.db
      .query("SELECT queued_requests_json FROM project_state WHERE project_id = ?")
      .get(PROJECT_ID) as { queued_requests_json: string };
    expect(JSON.parse(queuedRow.queued_requests_json)).toEqual(duplicate.state.queued_dispatch_requests);

    const released = releaseDispatch(store, {
      ...BASE_CONTEXT,
      leaseId: run.leaseId,
      commandId: "command-release-run-1",
    });
    expect(released.revision).toBe(5);
    expect(released.active_workflow).toBeNull();
    expect(released.queued_dispatch_requests).toHaveLength(1);
    const events = listProjectEvents(store.db);
    expect(events.map((event) => event.eventType)).toEqual([
      "project.dispatch_requested",
      "project.dispatch_acquired",
      "project.dispatch_requested",
      "project.dispatch_requested",
      "project.dispatch_released",
    ]);
    expect(first.state.caused_by_event_id).toBe(events[2]!.eventId);
    expect(duplicate.state.caused_by_event_id).toBe(events[3]!.eventId);
    expect(released.caused_by_event_id).toBe(events[4]!.eventId);
  });

  test("drains and atomically hands off only to the requested target, consuming its queued request", () => {
    const store = testStore();
    const run = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "sync",
      workflowId: "sync-1",
      reason: "upstream PRs merged",
      commandId: "command-sync-1",
    });
    requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "pr",
      workflowId: "pr-1",
      reason: "PR work ready",
      commandId: "command-pr-1",
    });

    const draining = beginDrain(store, {
      ...BASE_CONTEXT,
      leaseId: run.leaseId,
      targetKind: "sync",
      targetWorkflowId: "sync-1",
      reason: "handoff to sync",
      commandId: "command-drain-run-1",
      now: "2026-08-12T10:04:00.000Z",
    });
    expect(draining.revision).toBe(5);
    expect(draining.active_workflow).toMatchObject({
      status: "draining",
      requested_handoff: {
        target_kind: "sync",
        target_workflow_id: "sync-1",
        reason: "handoff to sync",
      },
    });

    const handedOff = releaseDispatch(store, {
      ...BASE_CONTEXT,
      leaseId: run.leaseId,
      handoffSnapshotId: "snapshot-1",
      commandId: "command-release-run-1",
      now: "2026-08-12T10:05:00.000Z",
    });

    expect(handedOff.revision).toBe(7);
    expect(handedOff.active_workflow).toMatchObject({
      kind: "sync",
      workflow_id: "sync-1",
      status: "active",
    });
    expect(handedOff.active_workflow?.lease_id).not.toBe(run.leaseId);
    expect(handedOff.queued_dispatch_requests.map((request) => request.workflow_id)).toEqual(["pr-1"]);
    expect(() => requireLease(store, run.leaseId)).toThrow(StaleLeaseError);
    expect(checkLease(store, handedOff.active_workflow!.lease_id)).toEqual(handedOff.active_workflow!);

    const events = listProjectEvents(store.db);
    expect(events.map((event) => event.eventType)).toEqual([
      "project.dispatch_requested",
      "project.dispatch_acquired",
      "project.dispatch_requested",
      "project.dispatch_requested",
      "project.dispatch_drain_started",
      "project.dispatch_released",
      "project.dispatch_acquired",
    ]);
    expect(events[6]?.causationId).toBe(events[5]?.eventId);
    expect(events[6]?.payload).toMatchObject({
      workflow_id: "sync-1",
      state_revision: 7,
      handoff_from_lease_id: run.leaseId,
    });
    expect(draining.caused_by_event_id).toBe(events[4]!.eventId);
    expect(handedOff.caused_by_event_id).toBe(events[6]?.eventId);
  });

  test("cancels a queued handoff target without releasing the draining run", () => {
    const store = testStore();
    const run = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "sync",
      workflowId: "sync-1",
      reason: "operator started sync",
      commandId: "command-sync-1",
    });
    beginDrain(store, {
      ...BASE_CONTEXT,
      leaseId: run.leaseId,
      targetKind: "sync",
      targetWorkflowId: "sync-1",
      reason: "handoff to sync",
      commandId: "command-drain-run-1",
    });

    const cancelled = cancelDispatchRequest(store, {
      ...BASE_CONTEXT,
      kind: "sync",
      workflowId: "sync-1",
      reason: "operator cancelled sync",
      commandId: "command-cancel-sync-1",
    });

    expect(cancelled.active_workflow).toMatchObject({
      kind: "run",
      workflow_id: "run-1",
      status: "draining",
    });
    expect(cancelled.active_workflow?.requested_handoff).toBeUndefined();
    expect(cancelled.queued_dispatch_requests).toEqual([]);
    expect(listProjectEvents(store.db).at(-1)).toMatchObject({
      eventType: "project.dispatch_request_cancelled",
      subjectKind: "sync",
      subjectId: "sync-1",
      payload: { cleared_handoff: true },
    });
  });

  test("rejects an unqueued handoff target without accepting a revision or event", () => {
    const store = testStore();
    const run = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");

    expect(() =>
      beginDrain(store, {
        ...BASE_CONTEXT,
        leaseId: run.leaseId,
        targetKind: "sync",
        targetWorkflowId: "sync-not-queued",
        reason: "invalid handoff",
        commandId: "command-drain-invalid",
      }),
    ).toThrow("is not queued");
    expect(getProjectState(store)?.revision).toBe(2);
    expect(listProjectEvents(store.db)).toHaveLength(2);
  });

  test("rejects stale fencing tokens and permits only operator recovery", () => {
    const store = testStore();
    const run = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");

    expect(() => checkLease(store, "lease-stale")).toThrow(StaleLeaseError);
    expect(() =>
      recoverDispatch(store, {
        ...BASE_CONTEXT,
        actor: "guardian",
        leaseId: run.leaseId,
        recoveryReason: "runner stopped heartbeating",
        cancelledSubjectIds: ["claim-1"],
        commandId: "command-recover-guardian",
      }),
    ).toThrow("operator-only");
    expect(getProjectState(store)?.revision).toBe(2);
    expect(listProjectEvents(store.db)).toHaveLength(2);

    const result = recoverDispatch(store, {
      ...BASE_CONTEXT,
      leaseId: run.leaseId,
      recoveryReason: "runner stopped heartbeating",
      cancelledSubjectIds: ["claim-1", "operation-1"],
      commandId: "command-recover-operator",
      now: "2026-08-12T10:06:00.000Z",
    });
    expect(result.state.revision).toBe(3);
    expect(result.state.active_workflow).toBeNull();
    expect(result.cancelledSubjectIds).toEqual(["claim-1", "operation-1"]);
    const recoveryEvent = listProjectEvents(store.db).at(-1);
    expect(listProjectEvents(store.db)).toHaveLength(3);
    expect(recoveryEvent?.eventType).toBe("project.dispatch_released");
    expect(recoveryEvent?.payload).toMatchObject({
      recovery: true,
      recovery_reason: "runner stopped heartbeating",
      cancelled_subject_ids: ["claim-1", "operation-1"],
      terminal_revision: 3,
    });
    expect(recoveryEvent).toBeDefined();
    expect(result.state.caused_by_event_id).toBe(recoveryEvent!.eventId);
  });

  test("refreshes heartbeat liveness without accepting a new state transition", () => {
    const store = testStore();
    const run = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
      now: "2026-08-12T10:01:00.000Z",
    });
    if (run.queued) throw new Error("expected acquired run lease");

    expect(() => heartbeatDispatch(store, { leaseId: "lease-stale", projectId: PROJECT_ID })).toThrow(StaleLeaseError);
    const heartbeat = heartbeatDispatch(store, {
      leaseId: run.leaseId,
      projectId: PROJECT_ID,
      now: "2026-08-12T10:05:00.000Z",
    });

    expect(heartbeat.heartbeat_at).toBe("2026-08-12T10:05:00.000Z");
    expect(getProjectState(store, PROJECT_ID)).toMatchObject({
      revision: 2,
      caused_by_event_id: run.state.caused_by_event_id,
      active_workflow: { heartbeat_at: "2026-08-12T10:05:00.000Z" },
    });
    expect(listProjectEvents(store.db)).toHaveLength(2);
  });

  test("records one blocked revision instead of releasing a lease with open obligations", () => {
    const store = testStore();
    const run = requestDispatch(store, {
      ...BASE_CONTEXT,
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    store.db
      .query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = ?")
      .run(
        JSON.stringify({
          ...run.state.active_workflow,
          blockers: [
            {
              code: "active_claims",
              message: "One worker claim must settle before release.",
              source_kind: "claim",
              source_id: "claim-1",
              recoverable: true,
            },
          ],
        }),
        PROJECT_ID,
      );

    const blocked = releaseDispatch(store, {
      ...BASE_CONTEXT,
      leaseId: run.leaseId,
      commandId: "command-release-blocked-run",
      now: "2026-08-12T10:07:00.000Z",
    });

    expect(blocked.revision).toBe(3);
    expect(blocked.active_workflow).toMatchObject({ lease_id: run.leaseId, status: "blocked" });
    const events = listProjectEvents(store.db);
    expect(events).toHaveLength(3);
    expect(events[2]?.eventType).toBe("project.dispatch_blocked");
    expect(events[2]?.payload).toMatchObject({
      lease_id: run.leaseId,
      blocker_codes: ["active_claims"],
      source_identities: [{ source_kind: "claim", source_id: "claim-1" }],
    });
    expect(blocked.caused_by_event_id).toBe(events[2]!.eventId);
  });

  test("rolls an event back when its revision compare cannot update the state row", () => {
    const store = testStore();
    store.db.exec(`
      CREATE TRIGGER reject_project_state_update
      BEFORE UPDATE ON project_state
      BEGIN
        SELECT RAISE(ABORT, 'revision rejected');
      END;
    `);

    expect(() =>
      requestDispatch(store, {
        ...BASE_CONTEXT,
        kind: "run",
        workflowId: "run-1",
        reason: "start run",
        commandId: "command-run-1",
      }),
    ).toThrow("revision rejected");
    expect(getProjectState(store)?.revision).toBe(0);
    expect(listProjectEvents(store.db)).toEqual([]);
  });
});
