import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { immediateTransaction, now as currentTime, type StateStore } from "@server/core/orchestrator-state";
import { appendProjectEvent, type JsonObject, type ProjectEventInput } from "./events.js";
import type {
  BeginDrainInput,
  Blocker,
  DispatchLease,
  DispatchRecoveryResult,
  HeartbeatDispatchInput,
  InitializeProjectStateInput,
  ProjectState,
  QueuedDispatchRequest,
  RecoverDispatchInput,
  ReleaseDispatchInput,
  RequestDispatchDecision,
  RequestDispatchInput,
  TransitionContext,
} from "./types.js";

type ProjectStateRow = {
  project_id: string;
  revision: number;
  active_workflow_json: string | null;
  queued_requests_json: string;
  blockers_json: string;
  trace_id: string;
  caused_by_event_id: string | null;
  created_at: string;
  updated_at: string;
};

type StatePatch = {
  activeWorkflow: DispatchLease | null;
  queuedRequests?: QueuedDispatchRequest[];
};

export class StaleLeaseError extends Error {
  readonly requestedLeaseId: string;
  readonly currentLeaseId: string | null;

  constructor(requestedLeaseId: string, currentLeaseId: string | null) {
    super(
      currentLeaseId
        ? `Dispatch lease ${requestedLeaseId} is stale; current lease is ${currentLeaseId}`
        : `Dispatch lease ${requestedLeaseId} is stale; no dispatch lease is active`,
    );
    this.name = "StaleLeaseError";
    this.requestedLeaseId = requestedLeaseId;
    this.currentLeaseId = currentLeaseId;
  }
}

export class DispatchLeaseNotActiveError extends Error {
  readonly leaseId: string;
  readonly status: DispatchLease["status"];

  constructor(lease: DispatchLease) {
    super(`Dispatch lease ${lease.lease_id} is ${lease.status}; new work requires an active dispatch lease`);
    this.name = "DispatchLeaseNotActiveError";
    this.leaseId = lease.lease_id;
    this.status = lease.status;
  }
}

function parseJson<T>(value: string | null, fallback: T, label: string): T {
  if (value === null || value.trim() === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON in project_state`, { cause: error });
  }
}

function rowToProjectState(row: ProjectStateRow): ProjectState {
  return {
    project_id: row.project_id,
    revision: Number(row.revision),
    active_workflow: parseJson<DispatchLease | null>(row.active_workflow_json, null, "active_workflow"),
    queued_dispatch_requests: parseJson<QueuedDispatchRequest[]>(row.queued_requests_json, [], "queued_requests"),
    blockers: parseJson<Blocker[]>(row.blockers_json, [], "blockers"),
    trace_id: row.trace_id,
    caused_by_event_id: row.caused_by_event_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function selectRows(db: Database, projectId?: string): ProjectStateRow[] {
  const rows = (projectId
    ? db.query("SELECT * FROM project_state WHERE project_id = ?").all(projectId)
    : db.query("SELECT * FROM project_state ORDER BY project_id ASC LIMIT 2").all()) as ProjectStateRow[];
  return rows;
}

function requireState(store: StateStore, projectId?: string): ProjectState {
  const rows = selectRows(store.db, projectId);
  if (rows.length === 0) {
    throw new Error(projectId ? `Project state is not initialized for ${projectId}` : "Project state is not initialized");
  }
  if (!projectId && rows.length > 1) {
    throw new Error("Project id is required when a state database contains more than one project");
  }
  return rowToProjectState(rows[0]!);
}

export function getProjectState(store: StateStore, projectId?: string): ProjectState | null {
  const rows = selectRows(store.db, projectId);
  if (rows.length === 0) return null;
  if (!projectId && rows.length > 1) {
    throw new Error("Project id is required when a state database contains more than one project");
  }
  return rowToProjectState(rows[0]!);
}

export function initializeProjectState(store: StateStore, input: InitializeProjectStateInput): ProjectState {
  const at = input.now ?? currentTime();
  store.db
    .query(
      `
        INSERT INTO project_state (
          project_id, revision, active_workflow_json, queued_requests_json,
          blockers_json, trace_id, caused_by_event_id, created_at, updated_at
        )
        VALUES (?, 0, NULL, '[]', '[]', ?, NULL, ?, ?)
        ON CONFLICT(project_id) DO NOTHING
      `,
    )
    .run(input.projectId, input.traceId, at, at);
  return requireState(store, input.projectId);
}

export const initProjectState = initializeProjectState;

function leaseId(): string {
  return `lease-${randomBytes(16).toString("hex")}`;
}

function contextValues(state: ProjectState, context: TransitionContext, at: string) {
  return {
    correlationId: context.correlationId ?? context.commandId,
    spanId: context.spanId ?? `span-${randomUUID()}`,
    occurredAt: at,
    projectId: state.project_id,
    traceId: state.trace_id,
    actor: context.actor,
  } as const;
}

function appendEvent(
  store: StateStore,
  state: ProjectState,
  context: TransitionContext,
  at: string,
  event: Pick<ProjectEventInput, "eventType" | "subjectKind" | "subjectId" | "payload"> & {
    causationId?: string;
  },
) {
  return appendProjectEvent(store.db, {
    ...contextValues(state, context, at),
    eventType: event.eventType,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId,
    causationId: event.causationId ?? context.commandId,
    payload: event.payload,
  });
}

function updateRevision(
  store: StateStore,
  state: ProjectState,
  eventId: string,
  at: string,
  patch: StatePatch,
): ProjectState {
  const result = store.db
    .query(
      `
        UPDATE project_state
        SET revision = ?, active_workflow_json = ?, queued_requests_json = ?,
            caused_by_event_id = ?, updated_at = ?
        WHERE project_id = ? AND revision = ?
      `,
    )
    .run(
      state.revision + 1,
      patch.activeWorkflow === null ? null : JSON.stringify(patch.activeWorkflow),
      JSON.stringify(patch.queuedRequests ?? state.queued_dispatch_requests),
      eventId,
      at,
      state.project_id,
      state.revision,
    );
  if (result.changes !== 1) {
    throw new Error(`Stale project_state revision ${state.revision} for ${state.project_id}`);
  }
  return requireState(store, state.project_id);
}

function assertProject(state: ProjectState, requestedProjectId: string | undefined): void {
  if (requestedProjectId && state.project_id !== requestedProjectId) {
    throw new Error(`Project state ${state.project_id} does not match requested project ${requestedProjectId}`);
  }
}

function requestedPayload(input: RequestDispatchInput, holder: DispatchLease | null): JsonObject {
  return {
    requested_kind: input.kind,
    workflow_id: input.workflowId,
    current_lease_holder: holder
      ? { kind: holder.kind, workflow_id: holder.workflow_id, lease_id: holder.lease_id }
      : null,
    reason: input.reason,
  };
}

export function requestDispatch(store: StateStore, input: RequestDispatchInput): RequestDispatchDecision {
  return immediateTransaction(store.db, () => {
    let state = requireState(store, input.projectId);
    assertProject(state, input.projectId);
    const at = input.now ?? currentTime();

    if (state.active_workflow) {
      const holder = state.active_workflow;
      const alreadyQueued = state.queued_dispatch_requests.some(
        (request) => request.kind === input.kind && request.workflow_id === input.workflowId,
      );
      const queuedRequests = alreadyQueued
        ? state.queued_dispatch_requests
        : [
            ...state.queued_dispatch_requests,
            {
              kind: input.kind,
              workflow_id: input.workflowId,
              reason: input.reason,
              requested_at: at,
              requested_by: input.actor,
            },
          ];
      const requested = appendEvent(store, state, input, at, {
        eventType: "project.dispatch_requested",
        subjectKind: "project",
        subjectId: state.project_id,
        payload: { ...requestedPayload(input, holder), queued: true, duplicate: alreadyQueued },
      });
      state = updateRevision(store, state, requested.eventId, at, {
        activeWorkflow: holder,
        queuedRequests,
      });
      return { queued: true, blockedBy: holder, state };
    }

    const mintedLeaseId = leaseId();
    const acquiring: DispatchLease = {
      kind: input.kind,
      workflow_id: input.workflowId,
      lease_id: mintedLeaseId,
      status: "acquiring",
      acquired_at: at,
      heartbeat_at: at,
      blockers: [],
    };
    const requested = appendEvent(store, state, input, at, {
      eventType: "project.dispatch_requested",
      subjectKind: "project",
      subjectId: state.project_id,
      payload: { ...requestedPayload(input, null), queued: false },
    });
    state = updateRevision(store, state, requested.eventId, at, { activeWorkflow: acquiring });

    const active: DispatchLease = { ...acquiring, status: "active" };
    const acquired = appendEvent(store, state, input, at, {
      eventType: "project.dispatch_acquired",
      subjectKind: "project",
      subjectId: state.project_id,
      causationId: requested.eventId,
      payload: {
        kind: input.kind,
        workflow_id: input.workflowId,
        lease_id: mintedLeaseId,
        state_revision: state.revision + 1,
      },
    });
    state = updateRevision(store, state, acquired.eventId, at, { activeWorkflow: active });
    return { queued: false, leaseId: mintedLeaseId, state };
  });
}

function requireCurrentLease(store: StateStore, requestedLeaseId: string, projectId?: string) {
  const state = requireState(store, projectId);
  const lease = state.active_workflow;
  if (!lease || lease.lease_id !== requestedLeaseId) {
    throw new StaleLeaseError(requestedLeaseId, lease?.lease_id ?? null);
  }
  return { state, lease };
}

export function checkLease(store: StateStore, leaseIdToCheck: string, projectId?: string): DispatchLease {
  return requireCurrentLease(store, leaseIdToCheck, projectId).lease;
}

export function requireLease(store: StateStore, leaseIdToRequire: string, projectId?: string): DispatchLease {
  return requireCurrentLease(store, leaseIdToRequire, projectId).lease;
}

export function requireActiveLease(store: StateStore, leaseIdToRequire: string, projectId?: string): DispatchLease {
  const lease = requireCurrentLease(store, leaseIdToRequire, projectId).lease;
  if (lease.status !== "active") throw new DispatchLeaseNotActiveError(lease);
  return lease;
}

export function heartbeatDispatch(store: StateStore, input: HeartbeatDispatchInput): DispatchLease {
  return immediateTransaction(store.db, () => {
    const { state, lease } = requireCurrentLease(store, input.leaseId, input.projectId);
    const heartbeat = { ...lease, heartbeat_at: input.now ?? currentTime() };
    // A heartbeat refresh is fenced liveness evidence, not an accepted workflow
    // transition. It intentionally leaves revision and caused_by_event_id alone.
    const result = store.db
      .query("UPDATE project_state SET active_workflow_json = ?, updated_at = ? WHERE project_id = ? AND revision = ?")
      .run(JSON.stringify(heartbeat), heartbeat.heartbeat_at, state.project_id, state.revision);
    if (result.changes !== 1) {
      throw new Error(`Stale project_state revision ${state.revision} for ${state.project_id}`);
    }
    return heartbeat;
  });
}

export function beginDrain(store: StateStore, input: BeginDrainInput): ProjectState {
  return immediateTransaction(store.db, () => {
    const { state, lease } = requireCurrentLease(store, input.leaseId, input.projectId);
    const targetIsQueued = state.queued_dispatch_requests.some(
      (request) => request.kind === input.targetKind && request.workflow_id === input.targetWorkflowId,
    );
    if (!targetIsQueued) {
      throw new Error(`Dispatch handoff target ${input.targetKind}:${input.targetWorkflowId} is not queued`);
    }
    const at = input.now ?? currentTime();
    const draining: DispatchLease = {
      ...lease,
      status: "draining",
      requested_handoff: {
        target_kind: input.targetKind,
        target_workflow_id: input.targetWorkflowId,
        reason: input.reason,
        requested_at: at,
      },
    };
    const event = appendEvent(store, state, input, at, {
      eventType: "project.dispatch_drain_started",
      subjectKind: lease.kind,
      subjectId: lease.workflow_id,
      payload: {
        lease_id: lease.lease_id,
        target_kind: input.targetKind,
        target_workflow_id: input.targetWorkflowId,
        reason: input.reason,
        open_obligations: lease.blockers.map((blocker) => ({ code: blocker.code, source_kind: blocker.source_kind, source_id: blocker.source_id })),
      },
    });
    return updateRevision(store, state, event.eventId, at, { activeWorkflow: draining });
  });
}

export function releaseDispatch(store: StateStore, input: ReleaseDispatchInput): ProjectState {
  return immediateTransaction(store.db, () => {
    let { state, lease } = requireCurrentLease(store, input.leaseId, input.projectId);
    const at = input.now ?? currentTime();

    if (lease.blockers.length > 0) {
      const blocked: DispatchLease = { ...lease, status: "blocked" };
      const blockedEvent = appendEvent(store, state, input, at, {
        eventType: "project.dispatch_blocked",
        subjectKind: lease.kind,
        subjectId: lease.workflow_id,
        payload: {
          lease_id: lease.lease_id,
          blocker_codes: lease.blockers.map((blocker) => blocker.code),
          source_identities: lease.blockers.map((blocker) => ({
            source_kind: blocker.source_kind,
            source_id: blocker.source_id,
          })),
          recovery_choices: ["settle_obligations", "recover_dispatch"],
        },
      });
      return updateRevision(store, state, blockedEvent.eventId, at, { activeWorkflow: blocked });
    }

    const handoff = lease.requested_handoff;
    // `releasing` is the in-command release phase while evidence is appended.
    // It is not a separately accepted durable revision: the one durable release
    // transition below moves canonical state to null and is caused by the one
    // project.dispatch_released event in this transaction.
    lease = { ...lease, status: "releasing" };
    const released = appendEvent(store, state, input, at, {
      eventType: "project.dispatch_released",
      subjectKind: "project",
      subjectId: state.project_id,
      payload: {
        old_lease_holder: { kind: lease.kind, workflow_id: lease.workflow_id, lease_id: lease.lease_id },
        handoff_snapshot_id: input.handoffSnapshotId ?? null,
        terminal_revision: state.revision + 1,
        requested_handoff: handoff
          ? { target_kind: handoff.target_kind, target_workflow_id: handoff.target_workflow_id }
          : null,
      },
    });
    state = updateRevision(store, state, released.eventId, at, { activeWorkflow: null });

    if (!handoff) return state;

    const handoffLeaseId = leaseId();
    const active: DispatchLease = {
      kind: handoff.target_kind,
      workflow_id: handoff.target_workflow_id,
      lease_id: handoffLeaseId,
      status: "active",
      acquired_at: at,
      heartbeat_at: at,
      blockers: [],
    };
    const queuedRequests = state.queued_dispatch_requests.filter(
      (request) => !(request.kind === handoff.target_kind && request.workflow_id === handoff.target_workflow_id),
    );
    const acquired = appendEvent(store, state, input, at, {
      eventType: "project.dispatch_acquired",
      subjectKind: "project",
      subjectId: state.project_id,
      causationId: released.eventId,
      payload: {
        kind: handoff.target_kind,
        workflow_id: handoff.target_workflow_id,
        lease_id: handoffLeaseId,
        state_revision: state.revision + 1,
        handoff_from_lease_id: lease.lease_id,
      },
    });
    return updateRevision(store, state, acquired.eventId, at, {
      activeWorkflow: active,
      queuedRequests,
    });
  });
}

export function recoverDispatch(store: StateStore, input: RecoverDispatchInput): DispatchRecoveryResult {
  if (input.actor !== "operator") throw new Error("Dispatch recovery is operator-only");
  return immediateTransaction(store.db, () => {
    const { state, lease } = requireCurrentLease(store, input.leaseId, input.projectId);
    const at = input.now ?? currentTime();
    const released = appendEvent(store, state, input, at, {
      eventType: "project.dispatch_released",
      subjectKind: "project",
      subjectId: state.project_id,
      payload: {
        old_lease_holder: { kind: lease.kind, workflow_id: lease.workflow_id, lease_id: lease.lease_id },
        handoff_snapshot_id: null,
        terminal_revision: state.revision + 1,
        recovery: true,
        recovery_reason: input.recoveryReason,
        cancelled_subject_ids: input.cancelledSubjectIds,
      },
    });
    const next = updateRevision(store, state, released.eventId, at, { activeWorkflow: null });
    return { recovered: true, cancelledSubjectIds: [...input.cancelledSubjectIds], state: next };
  });
}
