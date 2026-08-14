import { createHash, randomBytes } from "node:crypto";
import type { Database } from "bun:sqlite";
import { immediateTransaction, now as currentTime, type StateStore } from "@server/core/orchestrator-state";
import {
  appendProjectEvent,
  eventSpan,
  newSpanId,
  type JsonObject,
  type JsonValue,
  type ProjectEventInput,
} from "./events.js";
import type {
  BeginDrainInput,
  Blocker,
  CancelDispatchRequestInput,
  DispatchLease,
  DispatchRecoveryResult,
  DispatchHandoffRequest,
  HeartbeatDispatchInput,
  InitializeProjectStateInput,
  ProjectState,
  QueuedDispatchRequest,
  RecoverDispatchInput,
  ReleaseDispatchInput,
  ReleaseDispatchResult,
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

/** Dispatch heartbeats older than this require operator-confirmed recovery. */
export const STALE_DISPATCH_LEASE_MS = 15 * 60 * 1000;

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

function contextValues(state: ProjectState, context: TransitionContext, at: string, traceId: string) {
  return {
    correlationId: context.correlationId,
    ...eventSpan(context.spanId),
    occurredAt: at,
    projectId: state.project_id,
    traceId,
    actor: context.actor,
  } as const;
}

function appendEvent(
  store: StateStore,
  state: ProjectState,
  context: TransitionContext,
  at: string,
  traceId: string,
  event: Pick<ProjectEventInput, "eventType" | "subjectKind" | "subjectId" | "payload"> & {
    causationId?: string;
  },
) {
  return appendProjectEvent(store.db, {
    ...contextValues(state, context, at, traceId),
    eventType: event.eventType,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId,
    causationId: event.causationId ?? context.causationId ?? context.commandId,
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

type DispatchRequestProvenance = Pick<
  QueuedDispatchRequest,
  "requested_by" | "request_command_id" | "request_root_span_id" | "request_event_id"
>;

const REQUEST_PROVENANCE_FIELDS = [
  "requested_by",
  "request_command_id",
  "request_root_span_id",
  "request_event_id",
] as const;

function requireRequestProvenance(
  request: Partial<DispatchRequestProvenance>,
  label: string,
): DispatchRequestProvenance {
  for (const field of REQUEST_PROVENANCE_FIELDS) {
    if (typeof request[field] !== "string" || request[field]!.trim() === "") {
      throw new Error(`${label} is missing accepted request provenance field ${field}`);
    }
  }
  return request as DispatchRequestProvenance;
}

function assertDurableRequestProvenance(
  store: StateStore,
  state: ProjectState,
  request: QueuedDispatchRequest,
): void {
  const provenance = requireRequestProvenance(request, `Queued dispatch ${request.kind}:${request.workflow_id}`);
  const row = store.db
    .query(
      `SELECT event_type, project_id, subject_kind, subject_id, correlation_id,
              actor, parent_span_id, payload_json
       FROM project_events WHERE event_id = ?`,
    )
    .get(provenance.request_event_id) as {
      event_type: string;
      project_id: string;
      subject_kind: string;
      subject_id: string;
      correlation_id: string;
      actor: string;
      parent_span_id: string | null;
      payload_json: string;
    } | null;
  if (!row) {
    throw new Error(
      `Queued dispatch ${request.kind}:${request.workflow_id} request event ${provenance.request_event_id} was not found`,
    );
  }
  const payload = parseJson<JsonObject>(row.payload_json, {}, "dispatch request event payload");
  const mismatches = [
    row.event_type !== "project.dispatch_requested" ? "event_type" : null,
    row.project_id !== state.project_id ? "project_id" : null,
    row.subject_kind !== "project" || row.subject_id !== state.project_id ? "subject" : null,
    row.correlation_id !== request.workflow_id ? "correlation_id" : null,
    row.actor !== provenance.requested_by ? "actor" : null,
    row.parent_span_id !== provenance.request_root_span_id ? "request_root_span_id" : null,
    payload.requested_kind !== request.kind ? "requested_kind" : null,
    payload.workflow_id !== request.workflow_id ? "workflow_id" : null,
    payload.reason !== request.reason ? "reason" : null,
  ].filter((field): field is string => field !== null);
  if (mismatches.length > 0) {
    throw new Error(
      `Queued dispatch ${request.kind}:${request.workflow_id} request provenance does not match durable event ${provenance.request_event_id}: ${mismatches.join(", ")}`,
    );
  }
}

function matchingQueuedHandoff(
  store: StateStore,
  state: ProjectState,
  handoff: DispatchHandoffRequest,
): QueuedDispatchRequest {
  const queued = state.queued_dispatch_requests.find(
    (request) => request.kind === handoff.target_kind && request.workflow_id === handoff.target_workflow_id,
  );
  if (!queued) {
    throw new Error(`Dispatch handoff target ${handoff.target_kind}:${handoff.target_workflow_id} is not queued`);
  }
  const queuedProvenance = requireRequestProvenance(
    queued,
    `Queued dispatch ${queued.kind}:${queued.workflow_id}`,
  );
  const handoffProvenance = requireRequestProvenance(
    handoff,
    `Dispatch handoff ${handoff.target_kind}:${handoff.target_workflow_id}`,
  );
  const mismatches = [
    queued.reason !== handoff.reason ? "reason" : null,
    queued.requested_at !== handoff.requested_at ? "requested_at" : null,
    ...REQUEST_PROVENANCE_FIELDS.map((field) =>
      queuedProvenance[field] !== handoffProvenance[field] ? field : null
    ),
  ].filter((field): field is string => field !== null);
  if (mismatches.length > 0) {
    throw new Error(
      `Dispatch handoff ${handoff.target_kind}:${handoff.target_workflow_id} does not match its queued request: ${mismatches.join(", ")}`,
    );
  }
  assertDurableRequestProvenance(store, state, queued);
  return queued;
}

function terminalPrDispatchTarget(db: Database, request: DispatchLease["requested_handoff"]): boolean {
  if (request?.target_kind !== "pr") return false;
  const table = db
    .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pr_campaigns'")
    .get();
  if (!table) return false;
  const campaign = db
    .query("SELECT status FROM pr_campaigns WHERE campaign_id = ?")
    .get(request.target_workflow_id) as { status: string } | null;
  return campaign?.status === "completed" || campaign?.status === "abandoned";
}

function workflowSubjectKind(kind: DispatchLease["kind"]): "run" | "pr_campaign" | "sync_workflow" {
  if (kind === "pr") return "pr_campaign";
  return kind === "sync" ? "sync_workflow" : "run";
}

function assertWorkflowCorrelation(context: TransitionContext, workflowId: string): void {
  if (context.correlationId !== workflowId) {
    throw new Error(`Dispatch correlation_id must equal workflow id ${workflowId}`);
  }
}

type DurableWorkflowTraceRow = {
  workflow_id: string;
  project_id: string | null;
  trace_id: string | null;
};

function durableWorkflowTrace(
  db: Database,
  state: ProjectState,
  kind: DispatchLease["kind"],
  workflowId: string,
): string {
  const row = (kind === "run"
    ? db.query("SELECT id AS workflow_id, project_id, trace_id FROM runs WHERE id = ?").get(workflowId)
    : kind === "sync"
      ? db.query("SELECT sync_id AS workflow_id, project_id, trace_id FROM sync_state WHERE sync_id = ?").get(workflowId)
      : db.query("SELECT campaign_id AS workflow_id, project_id, trace_id FROM pr_campaigns WHERE campaign_id = ?").get(workflowId)
  ) as DurableWorkflowTraceRow | null;
  const label = kind === "pr" ? "PR campaign" : kind;
  if (!row) throw new Error(`Durable ${label} workflow ${workflowId} was not found for dispatch`);
  if (row.workflow_id !== workflowId) {
    throw new Error(`Durable ${label} workflow identity ${row.workflow_id} does not match dispatch workflow ${workflowId}`);
  }
  if (row.project_id !== state.project_id) {
    throw new Error(
      `Durable ${label} workflow ${workflowId} belongs to project ${row.project_id ?? "(missing)"}, not ${state.project_id}`,
    );
  }
  if (typeof row.trace_id !== "string" || row.trace_id.trim() === "") {
    throw new Error(`Durable ${label} workflow ${workflowId} is missing its dispatch trace_id`);
  }
  return row.trace_id;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
}

interface HandoffSnapshot {
  contentHash: string;
  contentJson: string;
  oldLeaseHolder: JsonObject;
  projectId: string;
  requestedHandoff: JsonObject;
  snapshotId: string;
  terminalProjectRevision: number;
}

function handoffSnapshot(
  state: ProjectState,
  lease: DispatchLease,
  handoff: NonNullable<DispatchLease["requested_handoff"]>,
  requestedSnapshotId?: string,
): HandoffSnapshot {
  const oldLeaseHolder: JsonObject = {
    kind: lease.kind,
    workflow_id: lease.workflow_id,
    lease_id: lease.lease_id,
  };
  const requestedHandoff: JsonObject = {
    target_kind: handoff.target_kind,
    target_workflow_id: handoff.target_workflow_id,
    reason: handoff.reason,
    requested_at: handoff.requested_at,
    requested_by: handoff.requested_by,
    request_command_id: handoff.request_command_id,
    request_root_span_id: handoff.request_root_span_id,
    request_event_id: handoff.request_event_id,
  };
  const terminalProjectRevision = state.revision + 1;
  const contentJson = canonicalJson({
    schema_version: 1,
    project_id: state.project_id,
    old_lease_holder: oldLeaseHolder,
    requested_handoff: requestedHandoff,
    terminal_project_revision: terminalProjectRevision,
  });
  const contentHash = createHash("sha256").update(contentJson).digest("hex");
  return {
    contentHash,
    contentJson,
    oldLeaseHolder,
    projectId: state.project_id,
    requestedHandoff,
    snapshotId: requestedSnapshotId ?? `handoff-snapshot-${contentHash}`,
    terminalProjectRevision,
  };
}

function insertHandoffSnapshot(
  store: StateStore,
  snapshot: HandoffSnapshot,
  releaseEventId: string,
  acquisitionEventId: string | null,
  createdAt: string,
): void {
  const inserted = store.db.query(`
    INSERT INTO dispatch_handoff_snapshots (
      snapshot_id, project_id, content_json, content_hash,
      old_lease_holder_json, requested_handoff_json, terminal_project_revision,
      release_event_id, acquisition_event_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.snapshotId,
    snapshot.projectId,
    snapshot.contentJson,
    snapshot.contentHash,
    JSON.stringify(snapshot.oldLeaseHolder),
    JSON.stringify(snapshot.requestedHandoff),
    snapshot.terminalProjectRevision,
    releaseEventId,
    acquisitionEventId,
    createdAt,
  );
  if (inserted.changes !== 1) throw new Error(`Dispatch handoff snapshot ${snapshot.snapshotId} was not persisted`);
}

export function requestDispatch(store: StateStore, input: RequestDispatchInput): RequestDispatchDecision {
  return immediateTransaction(store.db, () => {
    assertWorkflowCorrelation(input, input.workflowId);
    const context = { ...input, spanId: input.spanId ?? newSpanId() };
    let state = requireState(store, input.projectId);
    assertProject(state, input.projectId);
    const workflowTraceId = durableWorkflowTrace(store.db, state, input.kind, input.workflowId);
    const at = input.now ?? currentTime();

    if (state.active_workflow) {
      const holder = state.active_workflow;
      durableWorkflowTrace(store.db, state, holder.kind, holder.workflow_id);
      const alreadyQueued = state.queued_dispatch_requests.some(
        (request) => request.kind === input.kind && request.workflow_id === input.workflowId,
      );
      const requested = appendEvent(store, state, context, at, workflowTraceId, {
        eventType: "project.dispatch_requested",
        subjectKind: "project",
        subjectId: state.project_id,
        payload: requestedPayload(input, holder),
      });
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
              request_command_id: input.commandId,
              request_root_span_id: context.spanId,
              request_event_id: requested.eventId,
            },
          ];
      state = updateRevision(store, state, requested.eventId, at, {
        activeWorkflow: holder,
        queuedRequests,
      });
      return { queued: true, blockedBy: holder, state };
    }

    const mintedLeaseId = leaseId();
    const queuedRequests = state.queued_dispatch_requests.filter(
      (request) => !(request.kind === input.kind && request.workflow_id === input.workflowId),
    );
    const acquiring: DispatchLease = {
      kind: input.kind,
      workflow_id: input.workflowId,
      lease_id: mintedLeaseId,
      status: "acquiring",
      acquired_at: at,
      heartbeat_at: at,
      blockers: [],
    };
    const requested = appendEvent(store, state, context, at, workflowTraceId, {
      eventType: "project.dispatch_requested",
      subjectKind: "project",
      subjectId: state.project_id,
      payload: requestedPayload(input, null),
    });
    state = updateRevision(store, state, requested.eventId, at, { activeWorkflow: acquiring, queuedRequests });

    const active: DispatchLease = { ...acquiring, status: "active" };
    const acquired = appendEvent(store, state, context, at, workflowTraceId, {
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
    return { queued: false, leaseId: mintedLeaseId, acquiredEventId: acquired.eventId, state };
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
    const context = { ...input, spanId: input.spanId ?? newSpanId() };
    const { state, lease } = requireCurrentLease(store, input.leaseId, input.projectId);
    assertWorkflowCorrelation(input, lease.workflow_id);
    const holderTraceId = durableWorkflowTrace(store.db, state, lease.kind, lease.workflow_id);
    if ((input.targetKind === undefined) !== (input.targetWorkflowId === undefined)) {
      throw new Error("Dispatch drain must provide both targetKind and targetWorkflowId, or neither");
    }
    let targetRequest: QueuedDispatchRequest | undefined;
    if (input.targetKind && input.targetWorkflowId) {
      durableWorkflowTrace(store.db, state, input.targetKind, input.targetWorkflowId);
      targetRequest = state.queued_dispatch_requests.find(
        (request) => request.kind === input.targetKind && request.workflow_id === input.targetWorkflowId,
      );
      if (!targetRequest) {
        throw new Error(`Dispatch handoff target ${input.targetKind}:${input.targetWorkflowId} is not queued`);
      }
      assertDurableRequestProvenance(store, state, targetRequest);
    }
    const at = input.now ?? currentTime();
    const draining: DispatchLease = {
      ...lease,
      status: "draining",
      ...(targetRequest
        ? {
            requested_handoff: {
              target_kind: targetRequest.kind,
              target_workflow_id: targetRequest.workflow_id,
              reason: targetRequest.reason,
              requested_at: targetRequest.requested_at,
              requested_by: targetRequest.requested_by,
              request_command_id: targetRequest.request_command_id,
              request_root_span_id: targetRequest.request_root_span_id,
              request_event_id: targetRequest.request_event_id,
            },
          }
        : { requested_handoff: undefined }),
    };
    const event = appendEvent(store, state, context, at, holderTraceId, {
      eventType: "project.dispatch_drain_started",
      subjectKind: workflowSubjectKind(lease.kind),
      subjectId: lease.workflow_id,
      payload: {
        lease_id: lease.lease_id,
        target_kind: input.targetKind ?? "none",
        open_obligations: lease.blockers.map((blocker) => ({
          code: blocker.code,
          source_kind: blocker.source_kind,
          source_id: blocker.source_id,
        })),
      },
    });
    return updateRevision(store, state, event.eventId, at, { activeWorkflow: draining });
  });
}

/**
 * Removes a queued workflow that the operator cancelled before it acquired
 * authority. A run already draining for that handoff remains draining, but
 * settles without promoting the cancelled target.
 */
export function cancelDispatchRequest(store: StateStore, input: CancelDispatchRequestInput): ProjectState {
  return immediateTransaction(store.db, () => {
    assertWorkflowCorrelation(input, input.workflowId);
    const context = { ...input, spanId: input.spanId ?? newSpanId() };
    const state = requireState(store, input.projectId);
    assertProject(state, input.projectId);
    const workflowTraceId = durableWorkflowTrace(store.db, state, input.kind, input.workflowId);
    const queuedRequests = state.queued_dispatch_requests.filter(
      (request) => !(request.kind === input.kind && request.workflow_id === input.workflowId),
    );
    const handoffMatches = state.active_workflow?.requested_handoff?.target_kind === input.kind &&
      state.active_workflow.requested_handoff.target_workflow_id === input.workflowId;
    if (queuedRequests.length === state.queued_dispatch_requests.length && !handoffMatches) return state;
    const activeWorkflow = handoffMatches && state.active_workflow
      ? { ...state.active_workflow, requested_handoff: undefined }
      : state.active_workflow;
    const at = input.now ?? currentTime();
    const event = appendEvent(store, state, context, at, workflowTraceId, {
      eventType: "project.dispatch_request_cancelled",
      subjectKind: workflowSubjectKind(input.kind),
      subjectId: input.workflowId,
      payload: {
        kind: input.kind,
        workflow_id: input.workflowId,
        reason: input.reason,
        cleared_handoff: handoffMatches,
      },
    });
    return updateRevision(store, state, event.eventId, at, { activeWorkflow, queuedRequests });
  });
}

export function releaseDispatchDetailed(store: StateStore, input: ReleaseDispatchInput): ReleaseDispatchResult {
  return immediateTransaction(store.db, () => {
    const context = { ...input, spanId: input.spanId ?? newSpanId() };
    let { state, lease } = requireCurrentLease(store, input.leaseId, input.projectId);
    assertWorkflowCorrelation(input, lease.workflow_id);
    const holderTraceId = durableWorkflowTrace(store.db, state, lease.kind, lease.workflow_id);
    const at = input.now ?? currentTime();

    if (lease.blockers.length > 0) {
      if (lease.status === "blocked") return { state };
      const blocked: DispatchLease = { ...lease, status: "blocked" };
      const blockedEvent = appendEvent(store, state, context, at, holderTraceId, {
        eventType: "project.dispatch_blocked",
        subjectKind: workflowSubjectKind(lease.kind),
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
      return { state: updateRevision(store, state, blockedEvent.eventId, at, { activeWorkflow: blocked }) };
    }

    const handoff = lease.requested_handoff;
    if (handoff) matchingQueuedHandoff(store, state, handoff);
    const successorTraceId = handoff
      ? durableWorkflowTrace(store.db, state, handoff.target_kind, handoff.target_workflow_id)
      : null;
    const handoffTargetTerminal = terminalPrDispatchTarget(store.db, handoff);
    const queuedAfterRelease = handoffTargetTerminal && handoff
      ? state.queued_dispatch_requests.filter(
          (request) => !(request.kind === handoff.target_kind && request.workflow_id === handoff.target_workflow_id),
        )
      : state.queued_dispatch_requests;
    const snapshot = handoff ? handoffSnapshot(state, lease, handoff, input.handoffSnapshotId) : null;
    // `releasing` is the in-command release phase while evidence is appended.
    // It is not a separately accepted durable revision: the one durable release
    // transition below moves canonical state to null and is caused by the one
    // project.dispatch_released event in this transaction.
    lease = { ...lease, status: "releasing" };
    const released = appendEvent(store, state, context, at, holderTraceId, {
      eventType: "project.dispatch_released",
      subjectKind: "project",
      subjectId: state.project_id,
      payload: {
        old_lease_holder: snapshot?.oldLeaseHolder ?? {
          kind: lease.kind,
          workflow_id: lease.workflow_id,
          lease_id: lease.lease_id,
        },
        handoff_snapshot_id: snapshot?.snapshotId ?? null,
        handoff_snapshot_content_hash: snapshot?.contentHash ?? null,
        terminal_revision: snapshot?.terminalProjectRevision ?? state.revision + 1,
        requested_handoff: snapshot?.requestedHandoff ?? null,
        handoff_result: handoffTargetTerminal ? "terminal_target_cancelled" : handoff ? "promoted" : "none",
      },
    });
    state = updateRevision(store, state, released.eventId, at, {
      activeWorkflow: null,
      queuedRequests: queuedAfterRelease,
    });

    if (!handoff || handoffTargetTerminal) {
      if (snapshot) insertHandoffSnapshot(store, snapshot, released.eventId, null, at);
      return { state, releasedEventId: released.eventId };
    }
    if (!snapshot) throw new Error("Dispatch handoff snapshot was not prepared");
    if (!successorTraceId) throw new Error("Dispatch handoff successor trace was not resolved");

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
    const successorContext = {
      actor: handoff.requested_by,
      commandId: handoff.request_command_id,
      correlationId: handoff.target_workflow_id,
      causationId: released.eventId,
      spanId: handoff.request_root_span_id,
    };
    const acquired = appendEvent(
      store,
      state,
      successorContext,
      at,
      successorTraceId,
      {
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
          handoff_snapshot_id: snapshot.snapshotId,
          handoff_snapshot_content_hash: snapshot.contentHash,
          handoff_release_event_id: released.eventId,
        },
      },
    );
    state = updateRevision(store, state, acquired.eventId, at, {
      activeWorkflow: active,
      queuedRequests,
    });
    insertHandoffSnapshot(store, snapshot, released.eventId, acquired.eventId, at);
    return {
      state,
      releasedEventId: released.eventId,
      acquiredEventId: acquired.eventId,
      successorActivation: {
        ...successorContext,
        causationId: acquired.eventId,
        kind: handoff.target_kind,
        workflowId: handoff.target_workflow_id,
        leaseId: handoffLeaseId,
      },
    };
  });
}

export function releaseDispatch(store: StateStore, input: ReleaseDispatchInput): ProjectState {
  return releaseDispatchDetailed(store, input).state;
}

export function recoverDispatch(store: StateStore, input: RecoverDispatchInput): DispatchRecoveryResult {
  if (input.actor !== "operator") throw new Error("Dispatch recovery is operator-only");
  return immediateTransaction(store.db, () => {
    const context = { ...input, spanId: input.spanId ?? newSpanId() };
    const { state, lease } = requireCurrentLease(store, input.leaseId, input.projectId);
    assertWorkflowCorrelation(input, lease.workflow_id);
    const holderTraceId = durableWorkflowTrace(store.db, state, lease.kind, lease.workflow_id);
    const at = input.now ?? currentTime();
    const released = appendEvent(store, state, context, at, holderTraceId, {
      eventType: "project.dispatch_released",
      subjectKind: "project",
      subjectId: state.project_id,
      payload: {
        old_lease_holder: { kind: lease.kind, workflow_id: lease.workflow_id, lease_id: lease.lease_id },
        handoff_snapshot_id: null,
        handoff_snapshot_content_hash: null,
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
