import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { eventsForSubject, listProjectEvents, newSpanId } from "./events.js";
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
  releaseDispatchDetailed,
  requestDispatch,
  requireLease,
} from "./lease.js";
import type { DispatchKind, RequestDispatchInput } from "./types.js";

const PROJECT_ID = "melee";
const TRACE_ID = "trace-project-melee";
const BASE_CONTEXT = {
  projectId: PROJECT_ID,
  actor: "operator" as const,
  spanId: newSpanId(),
};

function workflowContext(workflowId: string) {
  return { ...BASE_CONTEXT, correlationId: workflowId };
}

function workflowTraceId(workflowId: string): string {
  return `trace-${workflowId}`;
}

function seedWorkflow(
  store: StateStore,
  kind: DispatchKind,
  workflowId: string,
  options: { projectId?: string; traceId?: string | null } = {},
): void {
  const projectId = options.projectId ?? PROJECT_ID;
  const traceId = options.traceId === undefined ? workflowTraceId(workflowId) : options.traceId;
  const at = "2026-08-12T09:59:00.000Z";
  if (kind === "run") {
    store.db.query(`
      INSERT INTO runs (
        id, goal_kind, goal_value, desired_workers, status, created_at,
        project_id, revision, trace_id
      ) VALUES (?, 'match_percent', 100, 1, 'ready', ?, ?, 0, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(workflowId, at, projectId, traceId);
    return;
  }
  if (kind === "sync") {
    store.db.query(`
      INSERT INTO sync_state (
        sync_id, project_id, session_uuid, revision, status, trace_id,
        caused_by_event_id, created_at, updated_at
      ) VALUES (?, ?, ?, 0, 'requested', ?, ?, ?, ?)
      ON CONFLICT(sync_id) DO NOTHING
    `).run(workflowId, projectId, `session-${workflowId}`, traceId, `event-${workflowId}-requested`, at, at);
    return;
  }
  store.db.query(`
    INSERT INTO pr_campaigns (
      campaign_id, project_id, session_uuid, revision, status, trace_id,
      caused_by_event_id, created_at, source_anchor_json
    ) VALUES (?, ?, ?, 0, 'preparing', ?, ?, ?, ?)
    ON CONFLICT(campaign_id) DO NOTHING
  `).run(
    workflowId,
    projectId,
    `session-${workflowId}`,
    traceId,
    `event-${workflowId}-opened`,
    at,
    JSON.stringify({ save_point_id: `save-point-${workflowId}`, source_revision: "fixture-revision" }),
  );
}

function requestWorkflowDispatch(store: StateStore, input: RequestDispatchInput) {
  seedWorkflow(store, input.kind, input.workflowId);
  return requestDispatch(store, input);
}

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

    const decision = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
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
    });
    expect(events[0]).toMatchObject({ correlationId: "run-1", causationId: "command-run-1" });
    expect(events[1]?.correlationId).toBe("run-1");
    expect(events[1]?.causationId).toBe(events[0]?.eventId);
    expect(events.map((event) => event.traceId)).toEqual(["trace-run-1", "trace-run-1"]);
    expect(events[1]?.payload.state_revision).toBe(2);
    expect(decision.state.caused_by_event_id).toBe(events[1]?.eventId);
  });

  test("uses the durable run, sync, and PR campaign trace for free acquisition and release", () => {
    for (const fixture of [
      { kind: "run", workflowId: "run-trace" },
      { kind: "sync", workflowId: "sync-trace" },
      { kind: "pr", workflowId: "campaign-trace" },
    ] as const) {
      const store = testStore();
      const decision = requestWorkflowDispatch(store, {
        ...workflowContext(fixture.workflowId),
        kind: fixture.kind,
        workflowId: fixture.workflowId,
        reason: `acquire ${fixture.kind}`,
        commandId: `command-${fixture.workflowId}`,
      });
      if (decision.queued) throw new Error(`expected acquired ${fixture.kind} lease`);

      const acquiredEvents = listProjectEvents(store.db);
      expect(acquiredEvents.map((event) => event.traceId)).toEqual([
        workflowTraceId(fixture.workflowId),
        workflowTraceId(fixture.workflowId),
      ]);
      expect(acquiredEvents.map((event) => event.correlationId)).toEqual([
        fixture.workflowId,
        fixture.workflowId,
      ]);

      releaseDispatch(store, {
        ...workflowContext(fixture.workflowId),
        leaseId: decision.leaseId,
        commandId: `command-release-${fixture.workflowId}`,
      });
      expect(listProjectEvents(store.db).at(-1)).toMatchObject({
        eventType: "project.dispatch_released",
        correlationId: fixture.workflowId,
        traceId: workflowTraceId(fixture.workflowId),
      });
    }
  });

  test("queues occupied requests durably, deduplicates queue entries, and never auto-acquires them", () => {
    const store = testStore();
    const firstRequestRoot = newSpanId();
    const duplicateRequestRoot = newSpanId();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");

    const first = requestWorkflowDispatch(store, {
      ...workflowContext("sync-1"),
      kind: "sync",
      workflowId: "sync-1",
      reason: "merged upstream work",
      commandId: "command-sync-1",
      spanId: firstRequestRoot,
      now: "2026-08-12T10:02:00.000Z",
    });
    const duplicate = requestWorkflowDispatch(store, {
      ...workflowContext("sync-1"),
      kind: "sync",
      workflowId: "sync-1",
      reason: "duplicate request",
      commandId: "command-sync-1-duplicate",
      spanId: duplicateRequestRoot,
      now: "2026-08-12T10:03:00.000Z",
    });

    expect(first.queued).toBeTrue();
    expect(duplicate.queued).toBeTrue();
    if (!first.queued || !duplicate.queued) throw new Error("expected queued decisions");
    const firstRequestEventId = first.state.caused_by_event_id;
    if (firstRequestEventId === null) throw new Error("expected queued request provenance event");
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
        request_command_id: "command-sync-1",
        request_root_span_id: firstRequestRoot,
        request_event_id: firstRequestEventId,
      },
    ]);
    expect(duplicate.state.active_workflow?.lease_id).toBe(run.leaseId);

    const queuedRow = store.db
      .query("SELECT queued_requests_json FROM project_state WHERE project_id = ?")
      .get(PROJECT_ID) as { queued_requests_json: string };
    expect(JSON.parse(queuedRow.queued_requests_json)).toEqual(duplicate.state.queued_dispatch_requests);

    const released = releaseDispatch(store, {
      ...workflowContext("run-1"),
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
    expect(events.map((event) => event.traceId)).toEqual([
      "trace-run-1",
      "trace-run-1",
      "trace-sync-1",
      "trace-sync-1",
      "trace-run-1",
    ]);
    expect(first.state.caused_by_event_id).toBe(events[2]!.eventId);
    expect(duplicate.state.caused_by_event_id).toBe(events[3]!.eventId);
    expect(duplicate.state.queued_dispatch_requests[0]?.request_event_id).toBe(events[2]!.eventId);
    expect(duplicate.state.queued_dispatch_requests[0]?.request_root_span_id).not.toBe(duplicateRequestRoot);
    expect(released.caused_by_event_id).toBe(events[4]!.eventId);
  });

  test("drains and atomically hands off only to the requested target, consuming its queued request", () => {
    const store = testStore();
    const requestRoot = newSpanId();
    const settlementRoot = newSpanId();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    const queuedSync = requestWorkflowDispatch(store, {
      ...workflowContext("sync-1"),
      kind: "sync",
      workflowId: "sync-1",
      reason: "upstream PRs merged",
      commandId: "command-sync-1",
      spanId: requestRoot,
      now: "2026-08-12T10:02:00.000Z",
    });
    if (!queuedSync.queued) throw new Error("expected queued sync dispatch");
    requestWorkflowDispatch(store, {
      ...workflowContext("pr-1"),
      kind: "pr",
      workflowId: "pr-1",
      reason: "PR work ready",
      commandId: "command-pr-1",
    });

    const draining = beginDrain(store, {
      ...workflowContext("run-1"),
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
        reason: "upstream PRs merged",
        requested_at: "2026-08-12T10:02:00.000Z",
        requested_by: "operator",
        request_command_id: "command-sync-1",
        request_root_span_id: requestRoot,
        request_event_id: queuedSync.state.caused_by_event_id,
      },
    });

    const release = releaseDispatchDetailed(store, {
      ...workflowContext("run-1"),
      actor: "guardian",
      causationId: draining.caused_by_event_id ?? undefined,
      leaseId: run.leaseId,
      handoffSnapshotId: "snapshot-1",
      commandId: "command-settle-run-1",
      spanId: settlementRoot,
      now: "2026-08-12T10:05:00.000Z",
    });
    const handedOff = release.state;

    expect(handedOff.revision).toBe(7);
    const activeSuccessor = handedOff.active_workflow;
    if (activeSuccessor === null) throw new Error("expected active successor workflow");
    expect(activeSuccessor).toMatchObject({
      kind: "sync",
      workflow_id: "sync-1",
      status: "active",
    });
    expect(activeSuccessor.lease_id).not.toBe(run.leaseId);
    expect(handedOff.queued_dispatch_requests.map((request) => request.workflow_id)).toEqual(["pr-1"]);
    expect(() => requireLease(store, run.leaseId)).toThrow(StaleLeaseError);
    expect(checkLease(store, activeSuccessor.lease_id)).toEqual(activeSuccessor);

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
    expect(events.map((event) => event.traceId)).toEqual([
      "trace-run-1",
      "trace-run-1",
      "trace-sync-1",
      "trace-pr-1",
      "trace-run-1",
      "trace-run-1",
      "trace-sync-1",
    ]);
    expect(events[4]).toMatchObject({
      correlationId: "run-1",
      causationId: "command-drain-run-1",
      traceId: "trace-run-1",
    });
    expect(events[5]).toMatchObject({
      actor: "guardian",
      correlationId: "run-1",
      causationId: events[4]?.eventId,
      parentSpanId: settlementRoot,
      traceId: "trace-run-1",
    });
    expect(events[6]).toMatchObject({
      actor: "operator",
      correlationId: "sync-1",
      causationId: events[5]?.eventId,
      parentSpanId: requestRoot,
      traceId: "trace-sync-1",
    });
    expect(release.successorActivation).toEqual({
      actor: "operator",
      commandId: "command-sync-1",
      correlationId: "sync-1",
      causationId: events[6]?.eventId,
      spanId: requestRoot,
      kind: "sync",
      workflowId: "sync-1",
      leaseId: activeSuccessor.lease_id,
    });
    const snapshot = store.db
      .query("SELECT * FROM dispatch_handoff_snapshots WHERE snapshot_id = ?")
      .get("snapshot-1") as Record<string, unknown>;
    const contentJson = String(snapshot.content_json);
    const contentHash = createHash("sha256").update(contentJson).digest("hex");
    expect(snapshot).toMatchObject({
      project_id: PROJECT_ID,
      content_hash: contentHash,
      terminal_project_revision: 6,
      release_event_id: events[5]?.eventId,
      acquisition_event_id: events[6]?.eventId,
    });
    expect(JSON.parse(contentJson)).toEqual({
      schema_version: 1,
      project_id: PROJECT_ID,
      old_lease_holder: { kind: "run", workflow_id: "run-1", lease_id: run.leaseId },
      requested_handoff: {
        target_kind: "sync",
        target_workflow_id: "sync-1",
        reason: "upstream PRs merged",
        requested_at: "2026-08-12T10:02:00.000Z",
        requested_by: "operator",
        request_command_id: "command-sync-1",
        request_root_span_id: requestRoot,
        request_event_id: events[2]?.eventId,
      },
      terminal_project_revision: 6,
    });
    expect(JSON.parse(String(snapshot.old_lease_holder_json))).toEqual({
      kind: "run",
      workflow_id: "run-1",
      lease_id: run.leaseId,
    });
    expect(JSON.parse(String(snapshot.requested_handoff_json))).toMatchObject({
      target_kind: "sync",
      target_workflow_id: "sync-1",
      requested_by: "operator",
      request_command_id: "command-sync-1",
      request_root_span_id: requestRoot,
      request_event_id: events[2]?.eventId,
    });
    expect(events[6]?.payload).toMatchObject({
      workflow_id: "sync-1",
      state_revision: 7,
      handoff_from_lease_id: run.leaseId,
      handoff_snapshot_id: "snapshot-1",
      handoff_snapshot_content_hash: contentHash,
      handoff_release_event_id: events[5]?.eventId,
    });
    expect(events[5]?.payload).toMatchObject({
      handoff_snapshot_id: "snapshot-1",
      handoff_snapshot_content_hash: contentHash,
    });
    expect(() => store.db.query(
      "UPDATE dispatch_handoff_snapshots SET content_json = '{}' WHERE snapshot_id = ?",
    ).run("snapshot-1")).toThrow("dispatch handoff snapshots are immutable");
    expect(() => store.db.query(
      "DELETE FROM dispatch_handoff_snapshots WHERE snapshot_id = ?",
    ).run("snapshot-1")).toThrow("dispatch handoff snapshots are immutable");
    expect(draining.caused_by_event_id).toBe(events[4]!.eventId);
    expect(handedOff.caused_by_event_id).toBe(events[6]?.eventId);
  });

  test("derives snapshot identities and hashes from complete canonical handoff content", () => {
    const releaseStableHandoff = (store: StateStore) => {
      const run = requestWorkflowDispatch(store, {
        ...workflowContext("run-stable"),
        kind: "run",
        workflowId: "run-stable",
        reason: "start stable run",
        commandId: "command-run-stable",
        now: "2026-08-12T10:01:00.000Z",
      });
      if (run.queued) throw new Error("expected acquired run lease");
      const fixedLease = { ...run.state.active_workflow!, lease_id: "lease-stable" };
      store.db.query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = ?")
        .run(JSON.stringify(fixedLease), PROJECT_ID);
      requestWorkflowDispatch(store, {
        ...workflowContext("sync-stable"),
        kind: "sync",
        workflowId: "sync-stable",
        reason: "stable handoff target",
        commandId: "command-sync-stable",
        now: "2026-08-12T10:02:00.000Z",
      });
      beginDrain(store, {
        ...workflowContext("run-stable"),
        leaseId: "lease-stable",
        targetKind: "sync",
        targetWorkflowId: "sync-stable",
        reason: "stable handoff",
        commandId: "command-drain-stable",
        now: "2026-08-12T10:03:00.000Z",
      });
      releaseDispatch(store, {
        ...workflowContext("run-stable"),
        leaseId: "lease-stable",
        commandId: "command-release-stable",
        now: "2026-08-12T10:04:00.000Z",
      });
      return store.db.query(
        "SELECT snapshot_id, content_json, content_hash FROM dispatch_handoff_snapshots",
      ).get() as { snapshot_id: string; content_json: string; content_hash: string };
    };

    const first = releaseStableHandoff(testStore());
    const second = releaseStableHandoff(testStore());
    for (const snapshot of [first, second]) {
      expect(snapshot.snapshot_id).toBe(`handoff-snapshot-${snapshot.content_hash}`);
      expect(createHash("sha256").update(snapshot.content_json).digest("hex")).toBe(snapshot.content_hash);
      expect(JSON.parse(snapshot.content_json).requested_handoff).toMatchObject({
        requested_by: "operator",
        request_command_id: "command-sync-stable",
        request_root_span_id: expect.stringMatching(/^span-/),
        request_event_id: expect.stringMatching(/^event-/),
      });
    }
  });

  test("rejects dispatch correlation mismatches before accepting state or events", () => {
    const store = testStore();
    expect(() => requestWorkflowDispatch(store, {
      ...workflowContext("not-run-1"),
      kind: "run",
      workflowId: "run-1",
      reason: "mismatched request",
      commandId: "command-mismatched-request",
    })).toThrow("Dispatch correlation_id must equal workflow id run-1");
    expect(getProjectState(store)?.revision).toBe(0);
    expect(listProjectEvents(store.db)).toEqual([]);

    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
      kind: "run",
      workflowId: "run-1",
      reason: "matched request",
      commandId: "command-matched-request",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    expect(() => releaseDispatch(store, {
      ...workflowContext("sync-1"),
      leaseId: run.leaseId,
      commandId: "command-mismatched-release",
    })).toThrow("Dispatch correlation_id must equal workflow id run-1");
    expect(getProjectState(store)?.revision).toBe(2);
    expect(listProjectEvents(store.db)).toHaveLength(2);
  });

  test("rejects missing, cross-project, and traceless durable workflows without accepting state or events", () => {
    const store = testStore();
    const initial = getProjectState(store, PROJECT_ID);

    expect(() => requestDispatch(store, {
      ...workflowContext("run-missing"),
      kind: "run",
      workflowId: "run-missing",
      reason: "missing durable run",
      commandId: "command-run-missing",
    })).toThrow("Durable run workflow run-missing was not found for dispatch");

    seedWorkflow(store, "run", "run-other-project", { projectId: "other-project" });
    expect(() => requestDispatch(store, {
      ...workflowContext("run-other-project"),
      kind: "run",
      workflowId: "run-other-project",
      reason: "cross-project durable run",
      commandId: "command-run-other-project",
    })).toThrow("belongs to project other-project, not melee");

    seedWorkflow(store, "run", "run-traceless", { traceId: null });
    expect(() => requestDispatch(store, {
      ...workflowContext("run-traceless"),
      kind: "run",
      workflowId: "run-traceless",
      reason: "traceless durable run",
      commandId: "command-run-traceless",
    })).toThrow("Durable run workflow run-traceless is missing its dispatch trace_id");

    expect(getProjectState(store, PROJECT_ID)).toEqual(initial);
    expect(listProjectEvents(store.db)).toEqual([]);
  });

  test("rejects legacy queued requests without accepted provenance before beginning a handoff", () => {
    const store = testStore();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-legacy-queue"),
      kind: "run",
      workflowId: "run-legacy-queue",
      reason: "start predecessor",
      commandId: "command-run-legacy-queue",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    requestWorkflowDispatch(store, {
      ...workflowContext("sync-legacy-queue"),
      kind: "sync",
      workflowId: "sync-legacy-queue",
      reason: "queue legacy successor",
      commandId: "command-sync-legacy-queue",
    });
    const queued = { ...getProjectState(store, PROJECT_ID)!.queued_dispatch_requests[0]! } as Record<string, unknown>;
    delete queued.request_event_id;
    store.db.query("UPDATE project_state SET queued_requests_json = ? WHERE project_id = ?")
      .run(JSON.stringify([queued]), PROJECT_ID);
    const legacyState = getProjectState(store, PROJECT_ID);
    const eventCount = listProjectEvents(store.db).length;

    expect(() => beginDrain(store, {
      ...workflowContext("run-legacy-queue"),
      leaseId: run.leaseId,
      targetKind: "sync",
      targetWorkflowId: "sync-legacy-queue",
      reason: "attempt legacy handoff",
      commandId: "command-drain-legacy-queue",
    })).toThrow("missing accepted request provenance field request_event_id");
    expect(getProjectState(store, PROJECT_ID)).toEqual(legacyState);
    expect(listProjectEvents(store.db)).toHaveLength(eventCount);
  });

  test("rolls a mismatched requested handoff back before release or successor acquisition", () => {
    const store = testStore();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-mismatched-handoff"),
      kind: "run",
      workflowId: "run-mismatched-handoff",
      reason: "start predecessor",
      commandId: "command-run-mismatched-handoff",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    requestWorkflowDispatch(store, {
      ...workflowContext("sync-mismatched-handoff"),
      kind: "sync",
      workflowId: "sync-mismatched-handoff",
      reason: "queue successor",
      commandId: "command-sync-mismatched-handoff",
    });
    const draining = beginDrain(store, {
      ...workflowContext("run-mismatched-handoff"),
      leaseId: run.leaseId,
      targetKind: "sync",
      targetWorkflowId: "sync-mismatched-handoff",
      reason: "handoff to successor",
      commandId: "command-drain-mismatched-handoff",
    });
    const mismatchedLease = {
      ...draining.active_workflow!,
      requested_handoff: {
        ...draining.active_workflow!.requested_handoff!,
        request_command_id: "command-tampered-handoff",
      },
    };
    store.db.query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = ?")
      .run(JSON.stringify(mismatchedLease), PROJECT_ID);
    const mismatchedState = getProjectState(store, PROJECT_ID);
    const eventCount = listProjectEvents(store.db).length;

    expect(() => releaseDispatchDetailed(store, {
      ...workflowContext("run-mismatched-handoff"),
      actor: "guardian",
      leaseId: run.leaseId,
      commandId: "command-settle-mismatched-handoff",
    })).toThrow("does not match its queued request: request_command_id");
    expect(getProjectState(store, PROJECT_ID)).toEqual(mismatchedState);
    expect(listProjectEvents(store.db)).toHaveLength(eventCount);
    expect(store.db.query("SELECT COUNT(*) AS count FROM dispatch_handoff_snapshots").get()).toEqual({ count: 0 });
  });

  test("rolls handoff back when the successor durable workflow disappears before acquisition", () => {
    const store = testStore();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-missing-successor"),
      kind: "run",
      workflowId: "run-missing-successor",
      reason: "start predecessor",
      commandId: "command-run-missing-successor",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    requestWorkflowDispatch(store, {
      ...workflowContext("sync-missing-successor"),
      kind: "sync",
      workflowId: "sync-missing-successor",
      reason: "queue successor",
      commandId: "command-sync-missing-successor",
    });
    const draining = beginDrain(store, {
      ...workflowContext("run-missing-successor"),
      leaseId: run.leaseId,
      targetKind: "sync",
      targetWorkflowId: "sync-missing-successor",
      reason: "handoff to successor",
      commandId: "command-drain-missing-successor",
    });
    const eventCount = listProjectEvents(store.db).length;
    store.db.query("DELETE FROM sync_state WHERE sync_id = ?").run("sync-missing-successor");

    expect(() => releaseDispatch(store, {
      ...workflowContext("run-missing-successor"),
      leaseId: run.leaseId,
      commandId: "command-release-missing-successor",
    })).toThrow("Durable sync workflow sync-missing-successor was not found for dispatch");
    expect(getProjectState(store, PROJECT_ID)).toEqual(draining);
    expect(listProjectEvents(store.db)).toHaveLength(eventCount);
    expect(store.db.query("SELECT COUNT(*) AS count FROM dispatch_handoff_snapshots").get()).toEqual({ count: 0 });
  });

  test("rolls release, acquisition, and snapshot facts back when snapshot persistence fails", () => {
    const store = testStore();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-rollback"),
      kind: "run",
      workflowId: "run-rollback",
      reason: "start run",
      commandId: "command-run-rollback",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    requestWorkflowDispatch(store, {
      ...workflowContext("sync-rollback"),
      kind: "sync",
      workflowId: "sync-rollback",
      reason: "queue sync",
      commandId: "command-sync-rollback",
    });
    const draining = beginDrain(store, {
      ...workflowContext("run-rollback"),
      leaseId: run.leaseId,
      targetKind: "sync",
      targetWorkflowId: "sync-rollback",
      reason: "handoff",
      commandId: "command-drain-rollback",
    });
    const eventCount = listProjectEvents(store.db).length;
    store.db.exec(`
      CREATE TRIGGER reject_handoff_snapshot
      BEFORE INSERT ON dispatch_handoff_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'snapshot rejected');
      END;
    `);

    expect(() => releaseDispatch(store, {
      ...workflowContext("run-rollback"),
      leaseId: run.leaseId,
      commandId: "command-release-rollback",
    })).toThrow("snapshot rejected");
    expect(getProjectState(store)).toEqual(draining);
    expect(listProjectEvents(store.db)).toHaveLength(eventCount);
    expect(store.db.query("SELECT COUNT(*) AS count FROM dispatch_handoff_snapshots").get()).toEqual({ count: 0 });
  });

  test("cancels a queued handoff target without releasing the draining run", () => {
    const store = testStore();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    requestWorkflowDispatch(store, {
      ...workflowContext("sync-1"),
      kind: "sync",
      workflowId: "sync-1",
      reason: "operator started sync",
      commandId: "command-sync-1",
    });
    beginDrain(store, {
      ...workflowContext("run-1"),
      leaseId: run.leaseId,
      targetKind: "sync",
      targetWorkflowId: "sync-1",
      reason: "handoff to sync",
      commandId: "command-drain-run-1",
    });

    const cancelled = cancelDispatchRequest(store, {
      ...workflowContext("sync-1"),
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
      subjectKind: "sync_workflow",
      subjectId: "sync-1",
      correlationId: "sync-1",
      traceId: "trace-sync-1",
      payload: { cleared_handoff: true },
    });
  });

  test("rejects an unqueued handoff target without accepting a revision or event", () => {
    const store = testStore();
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");
    seedWorkflow(store, "sync", "sync-not-queued");

    expect(() =>
      beginDrain(store, {
        ...workflowContext("run-1"),
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
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
      kind: "run",
      workflowId: "run-1",
      reason: "start run",
      commandId: "command-run-1",
    });
    if (run.queued) throw new Error("expected acquired run lease");

    expect(() => checkLease(store, "lease-stale")).toThrow(StaleLeaseError);
    expect(() =>
      recoverDispatch(store, {
        ...workflowContext("run-1"),
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
      ...workflowContext("run-1"),
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
    expect(recoveryEvent).toMatchObject({ correlationId: "run-1", traceId: "trace-run-1" });
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
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
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
    const run = requestWorkflowDispatch(store, {
      ...workflowContext("run-1"),
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
      ...workflowContext("run-1"),
      leaseId: run.leaseId,
      commandId: "command-release-blocked-run",
      now: "2026-08-12T10:07:00.000Z",
    });

    expect(blocked.revision).toBe(3);
    expect(blocked.active_workflow).toMatchObject({ lease_id: run.leaseId, status: "blocked" });
    const events = listProjectEvents(store.db);
    expect(events).toHaveLength(3);
    expect(events[2]?.eventType).toBe("project.dispatch_blocked");
    expect(events[2]).toMatchObject({ correlationId: "run-1", traceId: "trace-run-1" });
    expect(events[2]?.payload).toMatchObject({
      lease_id: run.leaseId,
      blocker_codes: ["active_claims"],
      source_identities: [{ source_kind: "claim", source_id: "claim-1" }],
    });
    expect(blocked.caused_by_event_id).toBe(events[2]!.eventId);
    const repeated = releaseDispatch(store, {
      ...workflowContext("run-1"),
      leaseId: run.leaseId,
      commandId: "command-release-blocked-run-again",
    });
    expect(repeated.revision).toBe(blocked.revision);
    expect(listProjectEvents(store.db)).toHaveLength(3);
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
      requestWorkflowDispatch(store, {
        ...workflowContext("run-1"),
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
