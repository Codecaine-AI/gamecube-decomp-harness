import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createProjectSession } from "@server/core/project-session/store.js";
import { eventsForSubject, listProjectEvents } from "@server/core/project-state/events.js";
import { getProjectState, initializeProjectState, requestDispatch } from "@server/core/project-state/lease.js";
import {
  SYNC_EVENT_TYPES,
  SYNC_STATUSES,
  appendSyncKnowledgeEventInTransaction,
  assertSyncStatusTransition,
  isSyncStatusTransitionAllowed,
  recordSyncRequested,
  StaleSyncRevisionError,
  transitionSync,
  type SyncIntake,
  type SyncStatus,
} from "./index.js";

const tempDirs: string[] = [];
const stores: StateStore[] = [];

const MOVING_INTAKE: SyncIntake = {
  upstream_from: "upstream-old",
  upstream_to: "upstream-new",
  merged_pr_ids: ["pr-101"],
  corpus_batch_ids: ["corpus-1"],
  knowledge_only: false,
};

function setup(projectId = "melee"): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "sync-state-"));
  tempDirs.push(dir);
  const store = openState(dir);
  stores.push(store);
  createProjectSession(store.db, {
    baseSha: "session-head",
    id: `project-session:${projectId}`,
    projectId,
    sessionUuid: `session-${projectId}`,
  });
  initializeProjectState(store, { projectId, traceId: `trace-project-${projectId}` });
  return store;
}

function requested(store: StateStore, syncId = "sync-1") {
  const sync = recordSyncRequested(store, {
    projectId: "melee",
    sessionUuid: "session-melee",
    intake: MOVING_INTAKE,
    syncId,
    commandId: `command-request-${syncId}`,
    correlationId: `workflow-${syncId}`,
    occurredAt: "2026-08-13T12:00:00.000Z",
  });
  const lease = requestDispatch(store, {
    actor: "operator",
    commandId: `command-acquire-${syncId}`,
    kind: "sync",
    projectId: sync.project_id,
    reason: "sync state test fixture",
    workflowId: sync.sync_id,
  });
  if (lease.queued) throw new Error(`Expected sync lease for ${syncId}`);
  return sync;
}

function acquireSyncLease(store: StateStore, syncId: string, projectId = "melee"): void {
  const lease = requestDispatch(store, {
    actor: "operator",
    commandId: `command-acquire-${syncId}`,
    kind: "sync",
    projectId,
    reason: "sync state test fixture",
    workflowId: syncId,
  });
  if (lease.queued) throw new Error(`Expected sync lease for ${syncId}`);
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("SyncState", () => {
  test("exports exactly the contract status and event vocabularies", () => {
    expect(SYNC_STATUSES).toEqual([
      "requested",
      "ingesting",
      "reconciling",
      "validating",
      "validated",
      "publishing",
      "published",
      "blocked",
      "cancelled",
    ]);
    expect(SYNC_EVENT_TYPES).toEqual([
      "sync.requested",
      "sync.ingesting",
      "sync.reconciling",
      "sync.validating",
      "sync.validated",
      "sync.publishing",
      "sync.blocked",
      "sync.reconciliation_blocked",
      "sync.recovered",
      "sync.cancelled",
      "sync.boundary_published",
      "sync.published",
      "knowledge.job_enqueued",
      "knowledge.job_processing",
      "knowledge.job_waiting",
      "knowledge.job_succeeded",
      "knowledge.job_failed",
      "knowledge.job_cancelled",
      "knowledge.revision_advanced",
    ]);
  });

  test("enforces the documented status graph", () => {
    const allowed: Readonly<Record<SyncStatus, readonly SyncStatus[]>> = {
      requested: ["ingesting", "cancelled"],
      ingesting: ["reconciling", "validating", "blocked", "cancelled"],
      reconciling: ["validating", "blocked", "cancelled"],
      validating: ["validated", "blocked", "cancelled"],
      validated: ["validating", "publishing", "blocked", "cancelled"],
      publishing: ["published", "blocked"],
      published: [],
      blocked: ["ingesting", "reconciling", "validating", "validated", "publishing", "cancelled"],
      cancelled: [],
    };

    for (const current of SYNC_STATUSES) {
      for (const next of SYNC_STATUSES) {
        expect(isSyncStatusTransitionAllowed(current, next)).toBe(allowed[current].includes(next));
      }
    }
    expect(() => assertSyncStatusTransition("validated", "published")).toThrow(
      "Invalid sync status transition validated -> published",
    );
    expect(() => assertSyncStatusTransition("published", "ingesting")).toThrow(
      "Invalid sync status transition published -> ingesting",
    );
  });

  test("records sync.requested as state and one event without touching the dispatch lease", () => {
    const store = setup();
    const projectBefore = getProjectState(store, "melee");

    const sync = recordSyncRequested(store, {
      projectId: "melee",
      sessionUuid: "session-melee",
      intake: MOVING_INTAKE,
      syncId: "sync-1",
      commandId: "command-request-sync-1",
      correlationId: "workflow-sync-1",
      occurredAt: "2026-08-13T12:00:00.000Z",
    });

    expect(sync).toMatchObject({
      sync_id: "sync-1",
      project_id: "melee",
      session_uuid: "session-melee",
      revision: 0,
      status: "requested",
      intake: MOVING_INTAKE,
      staging: null,
      pr_reconciliation: [],
      publication: null,
      blockers: [],
    });
    const events = eventsForSubject(store.db, "sync", "sync-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "sync.requested",
      actor: "external_observer",
      correlationId: "workflow-sync-1",
      causationId: "command-request-sync-1",
      payload: MOVING_INTAKE,
    });
    expect(sync.caused_by_event_id).toBe(events[0]!.eventId);
    expect(sync.latest_event_sequence).toBe(events[0]!.sequence);
    expect(getProjectState(store, "melee")).toEqual(projectBefore);
    expect(
      listProjectEvents(store.db, { projectId: "melee" }).filter((event) =>
        event.eventType.startsWith("project.dispatch_"),
      ),
    ).toEqual([]);
  });

  test("accepts each CAS transition with exactly one same-transaction event", () => {
    const store = setup();
    let sync = requested(store);
    const before = eventsForSubject(store.db, "sync", sync.sync_id).length;

    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-sync-start",
      expectedRevision: sync.revision,
      patch: { status: "ingesting" },
    });

    const events = eventsForSubject(store.db, "sync", sync.sync_id);
    expect(events).toHaveLength(before + 1);
    expect(events.at(-1)).toMatchObject({
      eventType: "sync.ingesting",
      payload: { previous_status: "requested", status: "ingesting" },
    });
    expect(sync).toMatchObject({
      revision: 1,
      status: "ingesting",
      caused_by_event_id: events.at(-1)!.eventId,
      latest_event_sequence: events.at(-1)!.sequence,
    });
  });

  test("rejects lease-free ingest even when the operator requests it", () => {
    const store = setup();
    const sync = recordSyncRequested(store, {
      projectId: "melee",
      sessionUuid: "session-melee",
      intake: MOVING_INTAKE,
      syncId: "sync-lease-free",
    });
    const eventCount = eventsForSubject(store.db, "sync", sync.sync_id).length;

    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-lease-free-sync-start",
        expectedRevision: sync.revision,
        patch: { status: "ingesting" },
      }),
    ).toThrow("requires its matching active dispatch lease");
    expect(eventsForSubject(store.db, "sync", sync.sync_id)).toHaveLength(eventCount);
    expect(getProjectState(store, "melee")?.active_workflow).toBeNull();
  });

  test("knowledge-only sync skips reconciliation and source-moving sync cannot", () => {
    const knowledgeStore = setup();
    let knowledgeSync = recordSyncRequested(knowledgeStore, {
      projectId: "melee",
      sessionUuid: "session-melee",
      intake: {
        upstream_from: "upstream-same",
        upstream_to: "upstream-same",
        merged_pr_ids: [],
        corpus_batch_ids: ["corpus-1"],
        knowledge_only: true,
      },
      syncId: "sync-knowledge",
    });
    acquireSyncLease(knowledgeStore, knowledgeSync.sync_id);
    knowledgeSync = transitionSync(knowledgeStore, knowledgeSync.sync_id, {
      actor: "operator",
      commandId: "command-start-knowledge-sync",
      expectedRevision: knowledgeSync.revision,
      patch: { status: "ingesting" },
    });
    expect(() =>
      transitionSync(knowledgeStore, knowledgeSync.sync_id, {
        actor: "runner",
        commandId: "command-reconcile-knowledge-sync",
        expectedRevision: knowledgeSync.revision,
        patch: { status: "reconciling" },
      }),
    ).toThrow("must skip reconciliation");
    knowledgeSync = transitionSync(knowledgeStore, knowledgeSync.sync_id, {
      actor: "runner",
      commandId: "command-validate-knowledge-sync",
      expectedRevision: knowledgeSync.revision,
      patch: { status: "validating" },
    });
    expect(knowledgeSync).toMatchObject({ status: "validating", staging: null });

    const movingStore = setup("other");
    let movingSync = recordSyncRequested(movingStore, {
      projectId: "other",
      sessionUuid: "session-other",
      intake: MOVING_INTAKE,
      syncId: "sync-moving",
    });
    acquireSyncLease(movingStore, movingSync.sync_id, "other");
    movingSync = transitionSync(movingStore, movingSync.sync_id, {
      actor: "operator",
      commandId: "command-start-moving-sync",
      expectedRevision: movingSync.revision,
      patch: { status: "ingesting" },
    });
    expect(() =>
      transitionSync(movingStore, movingSync.sync_id, {
        actor: "runner",
        commandId: "command-skip-moving-reconcile",
        expectedRevision: movingSync.revision,
        patch: { status: "validating" },
      }),
    ).toThrow("must reconcile before validation");
  });

  test("rejects stale CAS without leaving an event behind", () => {
    const store = setup();
    const initial = requested(store);
    const current = transitionSync(store, initial.sync_id, {
      actor: "operator",
      commandId: "command-sync-start",
      expectedRevision: initial.revision,
      patch: { status: "ingesting" },
    });
    const eventCount = eventsForSubject(store.db, "sync", initial.sync_id).length;

    expect(() =>
      transitionSync(store, initial.sync_id, {
        actor: "runner",
        commandId: "command-stale-reconcile",
        expectedRevision: initial.revision,
        patch: { status: "reconciling" },
      }),
    ).toThrow(StaleSyncRevisionError);
    expect(eventsForSubject(store.db, "sync", initial.sync_id)).toHaveLength(eventCount);
    expect(store.db.query("SELECT revision, status FROM sync_state WHERE sync_id = ?").get(initial.sync_id)).toEqual({
      revision: current.revision,
      status: "ingesting",
    });
  });

  test("rolls back the transition event when the envelope update fails", () => {
    const store = setup();
    const sync = requested(store);
    const eventCount = eventsForSubject(store.db, "sync", sync.sync_id).length;
    store.db.exec(`CREATE TRIGGER reject_sync_transition
      BEFORE UPDATE ON sync_state
      BEGIN SELECT RAISE(ABORT, 'reject sync transition'); END`);

    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-rejected-sync-start",
        expectedRevision: sync.revision,
        patch: { status: "ingesting" },
      }),
    ).toThrow("reject sync transition");
    expect(eventsForSubject(store.db, "sync", sync.sync_id)).toHaveLength(eventCount);
    expect(store.db.query("SELECT revision, status FROM sync_state WHERE sync_id = ?").get(sync.sync_id)).toEqual({
      revision: 0,
      status: "requested",
    });
  });

  test("enforces one non-terminal sync per project in SQLite", () => {
    const store = setup();
    let first = requested(store);
    const insertDuplicate = () =>
      store.db
        .query(
          `INSERT INTO sync_state (
             sync_id, project_id, session_uuid, status, trace_id,
             caused_by_event_id, created_at, updated_at, intake_json
           ) VALUES ('sync-duplicate', 'melee', 'session-melee', 'blocked',
                     'trace-sync-duplicate', 'event-duplicate', ?, ?, ?)`,
        )
        .run(
          "2026-08-13T12:01:00.000Z",
          "2026-08-13T12:01:00.000Z",
          JSON.stringify(MOVING_INTAKE),
        );

    expect(insertDuplicate).toThrow();
    first = transitionSync(store, first.sync_id, {
      actor: "operator",
      commandId: "command-cancel-first",
      expectedRevision: first.revision,
      patch: { status: "cancelled" },
      payload: {
        discarded_staging_workspace_id: null,
        untouched_session_head: "session-head",
        untouched_submodule_heads: [],
      },
    });
    expect(first.status).toBe("cancelled");
    expect(() => recordSyncRequested(store, {
      projectId: "melee",
      sessionUuid: "session-melee",
      intake: MOVING_INTAKE,
      syncId: "sync-2",
    })).not.toThrow();
  });

  test("refreshes a requested observation without acquiring a lease", () => {
    const store = setup();
    const first = recordSyncRequested(store, {
      projectId: "melee",
      sessionUuid: "session-melee",
      intake: MOVING_INTAKE,
      syncId: "sync-observed",
    });
    const nextIntake: SyncIntake = {
      ...MOVING_INTAKE,
      upstream_to: "upstream-newer",
      merged_pr_ids: ["pr-101", "pr-102"],
    };

    const refreshed = recordSyncRequested(store, {
      projectId: "melee",
      sessionUuid: "session-melee",
      intake: nextIntake,
      commandId: "command-refresh-sync",
    });

    expect(refreshed).toMatchObject({ sync_id: first.sync_id, revision: 1, status: "requested", intake: nextIntake });
    expect(eventsForSubject(store.db, "sync", first.sync_id).map((event) => event.eventType)).toEqual([
      "sync.requested",
      "sync.requested",
    ]);
    expect(getProjectState(store, "melee")?.active_workflow).toBeNull();
  });

  test("rejects terminal revisions and semantic events without required facts", () => {
    const store = setup();
    let sync = requested(store);
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-invalid-cancel",
        expectedRevision: sync.revision,
        patch: { status: "cancelled" },
      }),
    ).toThrow("sync.cancelled requires a payload");
    expect(eventsForSubject(store.db, "sync", sync.sync_id)).toHaveLength(1);

    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-cancel",
      expectedRevision: sync.revision,
      patch: { status: "cancelled", staging: null },
      payload: {
        discarded_staging_workspace_id: null,
        untouched_session_head: "session-head",
        untouched_submodule_heads: [],
      },
    });
    const eventCount = eventsForSubject(store.db, "sync", sync.sync_id).length;
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-cancel-again",
        expectedRevision: sync.revision,
        patch: {},
        payload: {
          discarded_staging_workspace_id: null,
          untouched_session_head: "session-head",
          untouched_submodule_heads: [],
        },
      }),
    ).toThrow("is terminal in cancelled");
    expect(eventsForSubject(store.db, "sync", sync.sync_id)).toHaveLength(eventCount);
  });

  test("records the reconciliation, conflict, validation, and publication event path", () => {
    const store = setup();
    let sync = requested(store);
    const staging = {
      workspace_id: "staging-sync-1",
      epochs_total: 2,
      epochs_applied: 0,
      minor_conflicts_resolved: 0,
      conflicts_awaiting_operator: 0,
    };
    const advance = (
      status: SyncStatus,
      commandId: string,
      options: Pick<Parameters<typeof transitionSync>[2], "eventType" | "payload"> & {
        patch?: Parameters<typeof transitionSync>[2]["patch"];
      } = {},
    ) => {
      sync = transitionSync(store, sync.sync_id, {
        actor: status === "publishing" ? "operator" : "runner",
        commandId,
        eventType: options.eventType,
        expectedRevision: sync.revision,
        patch: { status, ...options.patch },
        payload: options.payload,
      });
    };

    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-start-full-sync",
      expectedRevision: sync.revision,
      patch: { status: "ingesting" },
    });
    advance("reconciling", "command-reconcile", {
      patch: {
        staging,
        prReconciliation: [{ series_id: "series-1", branch: "series/1", result: "clean", pushed: false }],
      },
    });
    advance("blocked", "command-conflict", {
      eventType: "sync.reconciliation_blocked",
      patch: {
        blockers: [{
          code: "conflict_needs_operator",
          message: "Resolve src/example.c",
          source_kind: "sync",
          source_id: sync.sync_id,
          recoverable: true,
        }],
        staging: { ...staging, conflicts_awaiting_operator: 1 },
      },
      payload: {
        conflict_identities: ["src/example.c"],
        conflicts_awaiting_operator: 1,
      },
    });
    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-conflict-resolved",
      expectedRevision: sync.revision,
      patch: {
        status: "reconciling",
        blockers: [],
        staging: { ...staging, epochs_applied: 2 },
      },
    });
    advance("validating", "command-validate");
    advance("validated", "command-validation-passed", {
      patch: {
        staging: {
          ...staging,
          epochs_applied: 2,
          validation_evidence: { report: "validation.json" },
        },
      },
    });
    advance("publishing", "command-publish");
    sync = transitionSync(store, sync.sync_id, {
      actor: "runner",
      commandId: "command-boundary-published",
      eventType: "sync.boundary_published",
      expectedRevision: sync.revision,
      patch: {
        publication: {
          remote_application_id: "remote-1",
          prior_head: "session-head",
          new_head: "upstream-new",
          knowledge_revision: "knowledge-1",
          invalidated_ids: ["target-1"],
        },
      },
      payload: {
        upstream_revision: "upstream-new",
        knowledge_revision: "knowledge-1",
        invalidations: ["target-1"],
        validation_evidence: { report: "validation.json" },
      },
    });
    expect(sync.status).toBe("publishing");
    const eventCountBeforePush = eventsForSubject(store.db, "sync", sync.sync_id).length;
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-rewrite-boundary",
        expectedRevision: sync.revision,
        patch: { publication: { ...sync.publication!, knowledge_revision: "knowledge-rewritten" } },
      }),
    ).toThrow("publication is immutable after sync.boundary_published");
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-published-before-push",
        expectedRevision: sync.revision,
        patch: { status: "published" },
      }),
    ).toThrow("sync.published requires every reconciled PR series push to be complete");
    expect(eventsForSubject(store.db, "sync", sync.sync_id)).toHaveLength(eventCountBeforePush);
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-forge-pushed-flags",
        expectedRevision: sync.revision,
        patch: {
          status: "published",
          prReconciliation: sync.pr_reconciliation.map((entry) => ({ ...entry, pushed: true })),
        },
      }),
    ).toThrow("sync.published requires one durable push record per reconciled PR series");
    expect(eventsForSubject(store.db, "sync", sync.sync_id)).toHaveLength(eventCountBeforePush);
    store.db.query(
      `INSERT INTO sync_push_records (
         push_id, sync_id, series_id, branch, remote_name, expected_remote_head,
         new_head, revision, status, attempt_count, caused_by_event_id, created_at, updated_at, pushed_at
       ) VALUES (?, ?, 'series-1', 'series/1', 'fork', 'series-old', 'series-new', 2, 'pushed', 1, ?, ?, ?, ?)`,
    ).run(
      "push-series-1",
      sync.sync_id,
      sync.caused_by_event_id,
      "2026-08-13T12:00:00.000Z",
      "2026-08-13T12:00:00.000Z",
      "2026-08-13T12:00:00.000Z",
    );
    sync = transitionSync(store, sync.sync_id, {
      actor: "runner",
      commandId: "command-published",
      expectedRevision: sync.revision,
      patch: {
        status: "published",
        prReconciliation: sync.pr_reconciliation.map((entry) => ({ ...entry, pushed: true })),
      },
    });

    expect(sync).toMatchObject({
      status: "published",
      revision: 9,
      pr_reconciliation: [{ series_id: "series-1", branch: "series/1", result: "clean", pushed: true }],
    });
    expect(eventsForSubject(store.db, "sync", sync.sync_id).map((event) => event.eventType)).toEqual([
      "sync.requested",
      "sync.ingesting",
      "sync.reconciling",
      "sync.reconciliation_blocked",
      "sync.reconciling",
      "sync.validating",
      "sync.validated",
      "sync.publishing",
      "sync.boundary_published",
      "sync.published",
    ]);
  });

  test("records recovery and knowledge-stage events through their typed APIs", () => {
    const store = setup();
    let sync = requested(store);
    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-start-recoverable-sync",
      expectedRevision: sync.revision,
      patch: { status: "ingesting" },
    });
    sync = transitionSync(store, sync.sync_id, {
      actor: "runner",
      commandId: "command-ingest-progress",
      expectedRevision: sync.revision,
      patch: {
        staging: {
          workspace_id: "staging-recovery",
          epochs_total: 1,
          epochs_applied: 0,
          minor_conflicts_resolved: 0,
          conflicts_awaiting_operator: 0,
        },
      },
    });
    sync = transitionSync(store, sync.sync_id, {
      actor: "runner",
      commandId: "command-block-ingest",
      expectedRevision: sync.revision,
      patch: {
        status: "blocked",
        blockers: [{
          code: "recovery_required",
          message: "Ingestion interrupted",
          source_kind: "sync",
          source_id: sync.sync_id,
          recoverable: true,
        }],
      },
    });
    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-recover-ingest",
      eventType: "sync.recovered",
      expectedRevision: sync.revision,
      patch: { status: "ingesting", blockers: [] },
      payload: {
        staging_preserved: true,
        staging_discarded: false,
        resume_stage: "ingesting",
        recovery_reason: "runner process exited",
      },
    });
    expect(sync.status).toBe("ingesting");

    store.db.exec("BEGIN IMMEDIATE");
    try {
      appendSyncKnowledgeEventInTransaction(store.db, {
        eventType: "knowledge.job_enqueued",
        projectId: "melee",
        subjectId: "knowledge-job-1",
        traceId: sync.trace_id,
        actor: "runner",
        causationId: "command-enqueue-knowledge",
        correlationId: sync.sync_id,
        spanId: "span-knowledge-enqueue",
        payload: {
          source_class: "sync_stage",
          provenance: { corpus_batch_id: "corpus-1" },
          execution_class: "sync",
        },
      });
      appendSyncKnowledgeEventInTransaction(store.db, {
        eventType: "knowledge.revision_advanced",
        projectId: "melee",
        subjectId: "melee",
        traceId: sync.trace_id,
        actor: "runner",
        causationId: "command-advance-knowledge",
        correlationId: sync.sync_id,
        spanId: "span-knowledge-advance",
        payload: {
          old_revision: "knowledge-1",
          new_revision: "knowledge-2",
          accepted_job_ids: ["knowledge-job-1"],
        },
      });
      store.db.exec("COMMIT");
    } catch (error) {
      store.db.exec("ROLLBACK");
      throw error;
    }
    expect(listProjectEvents(store.db, { projectId: "melee" }).map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["sync.recovered", "knowledge.job_enqueued", "knowledge.revision_advanced"]),
    );
  });

  test("freezes intake after start", () => {
    const store = setup();
    let sync = requested(store);
    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-start-freeze-test",
      expectedRevision: sync.revision,
      patch: { status: "ingesting" },
    });
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-rewrite-intake",
        expectedRevision: sync.revision,
        patch: { intake: { ...sync.intake, upstream_to: "rewritten" } },
      }),
    ).toThrow("intake is immutable after start");
    expect(eventsForSubject(store.db, "sync", sync.sync_id)).toHaveLength(2);
  });

  test("recovery cannot skip the durable stage that entered blocked", () => {
    const store = setup();
    let sync = requested(store);
    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-start-stage-recovery",
      expectedRevision: sync.revision,
      patch: { status: "ingesting" },
    });
    sync = transitionSync(store, sync.sync_id, {
      actor: "runner",
      commandId: "command-block-stage-recovery",
      expectedRevision: sync.revision,
      patch: {
        status: "blocked",
        blockers: [{
          code: "recovery_required",
          message: "Ingestion interrupted",
          source_kind: "sync",
          source_id: sync.sync_id,
          recoverable: true,
        }],
      },
    });
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-skip-to-publishing",
        eventType: "sync.recovered",
        expectedRevision: sync.revision,
        patch: { status: "publishing", blockers: [] },
        payload: {
          staging_preserved: true,
          staging_discarded: false,
          resume_stage: "publishing",
          recovery_reason: "attempted skip",
        },
      }),
    ).toThrow("must recover to its last durable stage ingesting, not publishing");
  });

  test("conflict resolution is operator-only", () => {
    const store = setup();
    let sync = requested(store);
    sync = transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: "command-start-conflict-test",
      expectedRevision: sync.revision,
      patch: { status: "ingesting" },
    });
    const staging = {
      workspace_id: "staging-conflict-test",
      epochs_total: 1,
      epochs_applied: 0,
      minor_conflicts_resolved: 0,
      conflicts_awaiting_operator: 0,
    };
    sync = transitionSync(store, sync.sync_id, {
      actor: "runner",
      commandId: "command-enter-reconcile",
      expectedRevision: sync.revision,
      patch: { status: "reconciling", staging },
    });
    sync = transitionSync(store, sync.sync_id, {
      actor: "runner",
      commandId: "command-record-conflict",
      eventType: "sync.reconciliation_blocked",
      expectedRevision: sync.revision,
      patch: {
        status: "blocked",
        blockers: [{
          code: "conflict_needs_operator",
          message: "Resolve src/example.c",
          source_kind: "sync",
          source_id: sync.sync_id,
          recoverable: true,
        }],
        staging: { ...staging, conflicts_awaiting_operator: 1 },
      },
      payload: {
        conflict_identities: ["src/example.c"],
        conflicts_awaiting_operator: 1,
      },
    });
    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "runner",
        commandId: "command-automatic-conflict-resolution",
        expectedRevision: sync.revision,
        patch: {
          status: "reconciling",
          blockers: [],
          staging: { ...staging, conflicts_awaiting_operator: 0 },
        },
      }),
    ).toThrow("Event sync.reconciling is operator-only");
  });

  test("cannot cancel a publishing-origin block after blocked progress revisions", () => {
    const store = setup();
    let sync = requested(store);
    const staging = {
      workspace_id: "staging-publish-block",
      epochs_total: 1,
      epochs_applied: 1,
      minor_conflicts_resolved: 0,
      conflicts_awaiting_operator: 0,
      validation_evidence: { report: "validation.json" },
    };
    const transition = (status: SyncStatus, actor: "operator" | "runner", patch = {}) => {
      sync = transitionSync(store, sync.sync_id, {
        actor,
        commandId: `command-publish-block-${status}-${sync.revision}`,
        expectedRevision: sync.revision,
        patch: { status, ...patch },
      });
    };
    transition("ingesting", "operator");
    transition("reconciling", "runner", { staging });
    transition("validating", "runner");
    transition("validated", "runner");
    transition("publishing", "operator");
    const blocker = {
      code: "publish_retry_required",
      message: "Push needs retry",
      source_kind: "sync",
      source_id: sync.sync_id,
      recoverable: true,
    };
    transition("blocked", "runner", { blockers: [blocker] });
    transition("blocked", "runner", { blockers: [blocker] });

    expect(() =>
      transitionSync(store, sync.sync_id, {
        actor: "operator",
        commandId: "command-invalid-post-publish-cancel",
        expectedRevision: sync.revision,
        patch: { status: "cancelled", blockers: [], staging: null },
        payload: {
          discarded_staging_workspace_id: "staging-publish-block",
          untouched_session_head: "session-head",
          untouched_submodule_heads: [],
        },
      }),
    ).toThrow("cannot be cancelled after publishing has started");
  });
});
