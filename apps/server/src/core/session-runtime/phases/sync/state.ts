import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { immediateTransaction, now as currentTime, type StateStore } from "@server/core/orchestrator-state";
import { appendProjectEvent, type AppendedProjectEvent, type JsonObject } from "@server/core/project-state/events.js";
import { getProjectState } from "@server/core/project-state/lease.js";
import { casSyncEnvelope } from "./cas.js";
import {
  SYNC_STATUSES,
  type RecordSyncRequestedInput,
  type SyncIntake,
  type SyncKnowledgeEventInput,
  type SyncPublication,
  type SyncPrReconciliation,
  type SyncStagingProgress,
  type SyncState,
  type SyncStatus,
  type SyncTransitionInput,
  type SyncWorkflowEventType,
} from "./types.js";

type SyncStateRow = {
  sync_id: string;
  project_id: string;
  session_uuid: string;
  revision: number;
  status: string;
  trace_id: string;
  caused_by_event_id: string;
  blockers_json: string;
  created_at: string;
  updated_at: string;
  latest_event_sequence: number;
  intake_json: string;
  staging_json: string | null;
  pr_reconciliation_json: string;
  publication_json: string | null;
};

const TERMINAL_SYNC_STATUSES = new Set<SyncStatus>(["published", "cancelled"]);

const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<SyncStatus, readonly SyncStatus[]>> = {
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

export class StaleSyncRevisionError extends Error {
  readonly syncId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(syncId: string, expectedRevision: number, actualRevision: number) {
    super(`Stale sync revision ${expectedRevision} for ${syncId}; current revision is ${actualRevision}`);
    this.name = "StaleSyncRevisionError";
    this.syncId = syncId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON in sync_state`, { cause: error });
  }
}

function parseObject<T extends object>(value: string, label: string): T {
  const parsed = parseJson(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${label} JSON in sync_state: expected an object`);
  }
  return parsed as T;
}

function parseNullableObject<T extends object>(value: string | null, label: string): T | null {
  if (value === null) return null;
  return parseObject<T>(value, label);
}

function parseArray<T>(value: string, label: string): T[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) throw new Error(`Invalid ${label} JSON in sync_state: expected an array`);
  return parsed as T[];
}

function isSyncStatus(value: string): value is SyncStatus {
  return (SYNC_STATUSES as readonly string[]).includes(value);
}

function rowToSyncState(row: SyncStateRow): SyncState {
  if (!isSyncStatus(row.status)) throw new Error(`Invalid sync status in sync_state: ${row.status}`);
  return {
    sync_id: row.sync_id,
    project_id: row.project_id,
    session_uuid: row.session_uuid,
    revision: Number(row.revision),
    status: row.status,
    trace_id: row.trace_id,
    caused_by_event_id: row.caused_by_event_id,
    blockers: parseArray(row.blockers_json, "blockers"),
    created_at: row.created_at,
    updated_at: row.updated_at,
    latest_event_sequence: Number(row.latest_event_sequence),
    intake: parseObject<SyncIntake>(row.intake_json, "intake"),
    staging: parseNullableObject<SyncStagingProgress>(row.staging_json, "staging"),
    pr_reconciliation: parseArray<SyncPrReconciliation>(row.pr_reconciliation_json, "pr_reconciliation"),
    publication: parseNullableObject<SyncPublication>(row.publication_json, "publication"),
  };
}

function selectSync(db: Database, syncId: string): SyncStateRow | null {
  return (db.query("SELECT * FROM sync_state WHERE sync_id = ?").get(syncId) as SyncStateRow | null) ?? null;
}

export function getSyncState(store: StateStore, syncId: string): SyncState | null {
  const row = selectSync(store.db, syncId);
  return row ? rowToSyncState(row) : null;
}

export function getNonTerminalSyncForProject(store: StateStore, projectId: string): SyncState | null {
  const rows = store.db
    .query(
      `SELECT * FROM sync_state
       WHERE project_id = ? AND status NOT IN ('published', 'cancelled')
       ORDER BY created_at DESC LIMIT 2`,
    )
    .all(projectId) as SyncStateRow[];
  if (rows.length > 1) throw new Error(`Project ${projectId} has multiple non-terminal syncs`);
  return rows[0] ? rowToSyncState(rows[0]) : null;
}

export function isTerminalSyncStatus(status: SyncStatus): boolean {
  return TERMINAL_SYNC_STATUSES.has(status);
}

export function isSyncStatusTransitionAllowed(current: SyncStatus, next: SyncStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[current].includes(next);
}

export function assertSyncStatusTransition(current: SyncStatus, next: SyncStatus): void {
  if (!isSyncStatusTransitionAllowed(current, next)) {
    throw new Error(`Invalid sync status transition ${current} -> ${next}`);
  }
}

export function eventTypeForSyncStatus(status: SyncStatus): SyncWorkflowEventType {
  switch (status) {
    case "requested": return "sync.requested";
    case "published": return "sync.published";
    case "cancelled": return "sync.cancelled";
    default: return `sync.${status}`;
  }
}

function assertEventMatchesTransition(
  current: SyncStatus,
  next: SyncStatus,
  eventType: SyncWorkflowEventType,
): void {
  if (eventType === "sync.recovered") {
    const confirmedOrphanIngest = current === "ingesting" && next === "ingesting";
    if (!confirmedOrphanIngest && (current !== "blocked" || next === "blocked" || next === "published")) {
      throw new Error(`sync.recovered cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "sync.reconciliation_blocked") {
    if (current !== "reconciling" || next !== "blocked") {
      throw new Error(`sync.reconciliation_blocked cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "sync.boundary_published") {
    if (current !== "publishing" || next !== "publishing") {
      throw new Error(`sync.boundary_published cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "sync.published") {
    if (current !== "publishing" || next !== "published") {
      throw new Error(`sync.published cannot record ${current} -> ${next}`);
    }
    return;
  }
  const expected = eventTypeForSyncStatus(next);
  if (eventType !== expected) {
    throw new Error(`Event ${eventType} cannot produce sync status ${next}; expected ${expected}`);
  }
}

function stringifyNullable(value: object | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function canonicalJson(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (!child || typeof child !== "object") return child;
    return Object.fromEntries(
      Object.entries(child as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sort(nested)]),
    );
  };
  return JSON.stringify(sort(value));
}

function payloadObject(payload: JsonObject | undefined, eventType: string): JsonObject {
  if (!payload) throw new Error(`Event ${eventType} requires a payload`);
  return payload;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be an array of nonblank strings`);
  }
  return value as string[];
}

function assertSubmodulePointers(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const paths = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} entries must be objects`);
    const pointer = raw as Record<string, unknown>;
    const path = requiredText(String(pointer.path ?? ""), `${label}.path`);
    requiredText(String(pointer.gitlink_head ?? ""), `${label}.gitlink_head`);
    requiredText(String(pointer.checked_out_head ?? ""), `${label}.checked_out_head`);
    if (paths.has(path)) throw new Error(`${label} contains duplicate path ${path}`);
    paths.add(path);
  }
}

function assertSemanticEventPayload(
  db: Database,
  current: SyncState,
  next: SyncState,
  eventType: SyncWorkflowEventType,
  payload: JsonObject | undefined,
): void {
  if (eventType === "sync.reconciliation_blocked") {
    const value = payloadObject(payload, eventType);
    const identities = stringArray(value.conflict_identities, "conflict_identities");
    if (identities.length === 0) throw new Error("sync.reconciliation_blocked requires conflict identities");
    if (!Number.isInteger(value.conflicts_awaiting_operator) || Number(value.conflicts_awaiting_operator) < 1) {
      throw new Error("sync.reconciliation_blocked requires a positive conflicts_awaiting_operator count");
    }
    if (next.staging?.conflicts_awaiting_operator !== value.conflicts_awaiting_operator) {
      throw new Error("sync.reconciliation_blocked conflict count must match staging state");
    }
    return;
  }
  if (eventType === "sync.recovered") {
    const value = payloadObject(payload, eventType);
    if (current.status === "ingesting" && next.status === "ingesting") {
      if (
        value.recovery_path !== "confirmed_orphan" ||
        value.process_liveness !== "not_live" ||
        value.lease_staleness !== "stale" ||
        value.resume_stage !== "ingesting" ||
        value.staging_preserved !== true ||
        value.staging_discarded !== false
      ) {
        throw new Error("Confirmed orphan ingest recovery requires stale-lease and not-live process evidence");
      }
      requiredText(String(value.recovery_reason ?? ""), "recovery_reason");
      if (canonicalJson(next.staging) !== canonicalJson(current.staging)) {
        throw new Error("Confirmed orphan ingest recovery cannot replace staging state");
      }
      return;
    }
    if (typeof value.staging_preserved !== "boolean" || typeof value.staging_discarded !== "boolean") {
      throw new Error("sync.recovered requires staging_preserved and staging_discarded booleans");
    }
    if (value.staging_preserved === value.staging_discarded) {
      throw new Error("sync.recovered must preserve or discard staging, but not both");
    }
    requiredText(String(value.recovery_reason ?? ""), "recovery_reason");
    if (value.staging_discarded) {
      if (next.status !== "cancelled" || value.resume_stage !== null || next.staging !== null) {
        throw new Error("Discarded sync recovery must cancel with a null resume_stage");
      }
      assertSubmodulePointers(value.untouched_submodule_heads, "untouched_submodule_heads");
    } else {
      if (value.resume_stage !== next.status) {
        throw new Error(`Preserved sync recovery resume_stage must equal ${next.status}`);
      }
      if (canonicalJson(next.staging) !== canonicalJson(current.staging)) {
        throw new Error("Preserved sync recovery cannot replace staging state");
      }
    }
    return;
  }
  if (eventType === "sync.cancelled") {
    const value = payloadObject(payload, eventType);
    if (value.discarded_staging_workspace_id !== null) {
      requiredText(String(value.discarded_staging_workspace_id ?? ""), "discarded_staging_workspace_id");
    }
    if (value.discarded_staging_workspace_id !== (current.staging?.workspace_id ?? null)) {
      throw new Error("sync.cancelled discarded workspace must match current staging state");
    }
    const untouchedHead = requiredText(String(value.untouched_session_head ?? ""), "untouched_session_head");
    assertSubmodulePointers(value.untouched_submodule_heads, "untouched_submodule_heads");
    const session = db
      .query("SELECT head_revision FROM project_sessions WHERE session_uuid = ?")
      .get(current.session_uuid) as { head_revision: string | null } | null;
    if (!session) throw new Error(`Project session not found: ${current.session_uuid}`);
    if (session.head_revision !== untouchedHead) {
      throw new Error(`sync.cancelled untouched_session_head does not match session ${current.session_uuid}`);
    }
    return;
  }
  if (eventType === "sync.boundary_published") {
    const value = payloadObject(payload, eventType);
    requiredText(String(value.upstream_revision ?? ""), "upstream_revision");
    requiredText(String(value.knowledge_revision ?? ""), "knowledge_revision");
    stringArray(value.invalidations, "invalidations");
    if (!value.validation_evidence || typeof value.validation_evidence !== "object" || Array.isArray(value.validation_evidence)) {
      throw new Error("sync.boundary_published requires validation_evidence");
    }
    if (!next.publication) throw new Error("sync.boundary_published requires publication state");
    if (value.upstream_revision !== next.intake.upstream_to) {
      throw new Error("sync.boundary_published upstream revision must match intake");
    }
    if (value.knowledge_revision !== next.publication.knowledge_revision) {
      throw new Error("sync.boundary_published knowledge revision must match publication state");
    }
    if (canonicalJson(value.invalidations) !== canonicalJson(next.publication.invalidated_ids)) {
      throw new Error("sync.boundary_published invalidations must match publication state");
    }
    if (current.publication !== null) {
      throw new Error("sync.boundary_published cannot replace an existing publication state");
    }
    return;
  }
  if (eventType === "sync.published") {
    if (!current.publication || canonicalJson(next.publication) !== canonicalJson(current.publication)) {
      throw new Error("sync.published requires the durable publication state from sync.boundary_published");
    }
    if (next.pr_reconciliation.some((entry) => !entry.pushed)) {
      throw new Error("sync.published requires every reconciled PR series push to be complete");
    }
    const pushRows = db
      .query("SELECT series_id, branch, status FROM sync_push_records WHERE sync_id = ? ORDER BY series_id")
      .all(current.sync_id) as Array<{ series_id: string; branch: string; status: string }>;
    if (pushRows.length !== next.pr_reconciliation.length) {
      throw new Error("sync.published requires one durable push record per reconciled PR series");
    }
    const pushesBySeries = new Map(pushRows.map((row) => [row.series_id, row]));
    for (const reconciliation of next.pr_reconciliation) {
      const push = pushesBySeries.get(reconciliation.series_id);
      if (!push || push.branch !== reconciliation.branch || push.status !== "pushed") {
        throw new Error(`sync.published requires a durable pushed record for ${reconciliation.series_id}`);
      }
    }
  }
}

function assertStateInvariants(current: SyncState, next: SyncState, eventType: SyncWorkflowEventType): void {
  if (
    current.status !== "requested" &&
    canonicalJson(next.intake) !== canonicalJson(current.intake)
  ) {
    throw new Error(`Sync ${current.sync_id} intake is immutable after start`);
  }
  if (next.intake.knowledge_only) {
    if (next.staging !== null) throw new Error(`Knowledge-only sync ${current.sync_id} cannot have staging`);
    if (next.pr_reconciliation.length > 0) {
      throw new Error(`Knowledge-only sync ${current.sync_id} cannot reconcile PR branches`);
    }
    if (current.status === "ingesting" && next.status === "reconciling") {
      throw new Error(`Knowledge-only sync ${current.sync_id} must skip reconciliation`);
    }
  } else {
    if (current.status === "ingesting" && next.status === "validating") {
      throw new Error(`Source-moving sync ${current.sync_id} must reconcile before validation`);
    }
    if (["reconciling", "validating", "validated", "publishing", "published"].includes(next.status) && !next.staging) {
      throw new Error(`Source-moving sync ${current.sync_id} requires staging while ${next.status}`);
    }
  }
  if (next.status === "cancelled" && next.staging !== null) {
    throw new Error(`Cancelled sync ${current.sync_id} must discard staging state`);
  }
  if (next.status === "blocked" && current.staging && next.staging?.workspace_id !== current.staging.workspace_id) {
    throw new Error(`Blocked sync ${current.sync_id} must preserve its staging workspace`);
  }
  if (!["publishing", "blocked", "published"].includes(next.status) && next.publication !== null) {
    throw new Error(`Sync ${current.sync_id} publication is valid only after publishing starts`);
  }
  if (
    current.publication === null &&
    next.publication !== null &&
    eventType !== "sync.boundary_published"
  ) {
    throw new Error(`Sync ${current.sync_id} publication must begin with sync.boundary_published`);
  }
  if (current.publication !== null && canonicalJson(next.publication) !== canonicalJson(current.publication)) {
    throw new Error(`Sync ${current.sync_id} publication is immutable after sync.boundary_published`);
  }
  if (next.status === "published") {
    if (!next.publication) throw new Error(`Published sync ${current.sync_id} requires a publication record`);
    if (next.publication.knowledge_revision.trim() === "") {
      throw new Error(`Published sync ${current.sync_id} requires a knowledge revision`);
    }
    if (next.intake.knowledge_only) {
      if (next.publication.remote_application_id !== undefined) {
        throw new Error(`Knowledge-only sync ${current.sync_id} cannot publish a remote application`);
      }
      if (next.publication.prior_head !== next.publication.new_head) {
        throw new Error(`Knowledge-only sync ${current.sync_id} cannot advance the source head`);
      }
    } else if (!next.publication.remote_application_id?.trim()) {
      throw new Error(`Source-moving sync ${current.sync_id} requires a remote application id`);
    }
  }
  if (current.status === "blocked" && next.status !== "blocked") {
    if (next.blockers.length > 0) throw new Error(`Sync ${current.sync_id} must clear blockers before resuming`);
    if (
      eventType !== "sync.recovered" &&
      eventType !== "sync.cancelled" &&
      !(next.status === "reconciling" && eventType === "sync.reconciling")
    ) {
      throw new Error(`Blocked sync ${current.sync_id} must resume through sync.recovered`);
    }
  }
}

export function getSyncBlockedOriginStatus(db: Database, sync: SyncState): SyncStatus | null {
  if (sync.status !== "blocked") return null;
  const rows = db
    .query(
      `SELECT payload_json FROM project_events
       WHERE subject_kind = 'sync' AND subject_id = ? AND sequence <= ?
       ORDER BY sequence DESC`,
    )
    .all(sync.sync_id, sync.latest_event_sequence) as Array<{ payload_json: string }>;
  for (const row of rows) {
    const payload = parseObject<JsonObject>(row.payload_json, "blocking event payload");
    if (payload.status !== "blocked") continue;
    if (
      typeof payload.previous_status === "string" &&
      isSyncStatus(payload.previous_status) &&
      payload.previous_status !== "blocked"
    ) {
      return payload.previous_status;
    }
  }
  throw new Error(`Sync ${sync.sync_id} has no event recording entry into blocked`);
}

export function transitionSync(store: StateStore, syncId: string, input: SyncTransitionInput): SyncState {
  return immediateTransaction(store.db, () => {
    const currentRow = selectSync(store.db, syncId);
    if (!currentRow) throw new Error(`Sync not found: ${syncId}`);
    const current = rowToSyncState(currentRow);
    if (current.revision !== input.expectedRevision) {
      throw new StaleSyncRevisionError(syncId, input.expectedRevision, current.revision);
    }
    if (isTerminalSyncStatus(current.status)) {
      throw new Error(`Sync ${syncId} is terminal in ${current.status}`);
    }
    const nextStatus = input.patch.status ?? current.status;
    // Observation may refresh a still-requested envelope and a queued request
    // may be cancelled before acquisition. Starting and every mutation after
    // start are fenced by the active sync lease in this same transaction.
    if (nextStatus === "ingesting" || current.status !== "requested") {
      const lease = getProjectState(store, current.project_id)?.active_workflow;
      if (
        !lease ||
        lease.kind !== "sync" ||
        lease.workflow_id !== current.sync_id ||
        lease.status !== "active"
      ) {
        throw new Error(`Sync ${syncId} requires its matching active dispatch lease`);
      }
    }
    if (nextStatus !== current.status) assertSyncStatusTransition(current.status, nextStatus);
    const blockedOrigin = getSyncBlockedOriginStatus(store.db, current);
    if (current.status === "blocked" && nextStatus === "cancelled" && blockedOrigin === "publishing") {
      throw new Error(`Sync ${syncId} cannot be cancelled after publishing has started`);
    }
    const eventType = input.eventType ?? eventTypeForSyncStatus(nextStatus);
    assertEventMatchesTransition(current.status, nextStatus, eventType);
    if (current.status === "requested" && nextStatus === "ingesting" && input.actor !== "operator") {
      throw new Error(`Sync ${syncId} can start only through an operator action`);
    }
    if (
      (eventType === "sync.cancelled" ||
        eventType === "sync.recovered" ||
        (current.status === "validated" && nextStatus === "publishing") ||
        (current.status === "blocked" && nextStatus === "reconciling" && eventType === "sync.reconciling")) &&
      input.actor !== "operator"
    ) {
      throw new Error(`Event ${eventType} is operator-only`);
    }
    const nextBlockers = input.patch.blockers ?? current.blockers;
    if (nextStatus === "blocked" && nextBlockers.length === 0) {
      throw new Error(`Sync ${syncId} cannot enter blocked without a blocker`);
    }
    const next: SyncState = {
      ...current,
      status: nextStatus,
      blockers: nextBlockers,
      intake: input.patch.intake ?? current.intake,
      staging: input.patch.staging === undefined ? current.staging : input.patch.staging,
      pr_reconciliation: input.patch.prReconciliation ?? current.pr_reconciliation,
      publication: input.patch.publication === undefined ? current.publication : input.patch.publication,
    };
    assertIntake(next.intake);
    if (
      eventType === "sync.recovered" &&
      next.status !== "cancelled" &&
      !(current.status === "ingesting" && next.status === "ingesting")
    ) {
      const allowedRecoveryStatus = blockedOrigin === "validated" && next.status === "validating"
        ? "validating"
        : blockedOrigin;
      if (next.status !== allowedRecoveryStatus) {
        throw new Error(
          `Sync ${syncId} must recover to its last durable stage ${blockedOrigin ?? "unknown"}, not ${next.status}`,
        );
      }
    }
    assertStateInvariants(current, next, eventType);
    assertSemanticEventPayload(store.db, current, next, eventType, input.payload);

    const at = input.occurredAt ?? currentTime();
    const event = appendProjectEvent(store.db, {
      eventType,
      projectId: current.project_id,
      subjectKind: "sync",
      subjectId: syncId,
      correlationId: input.correlationId ?? syncId,
      causationId: requiredText(input.commandId, "commandId"),
      traceId: current.trace_id,
      spanId: input.spanId ?? `span-${randomUUID()}`,
      actor: input.actor,
      occurredAt: at,
      payload: {
        ...(input.payload ?? {}),
        previous_status: current.status,
        status: nextStatus,
      },
    });
    const accepted = casSyncEnvelope(store.db, {
      blockersJson: JSON.stringify(nextBlockers),
      eventId: event.eventId,
      eventSequence: event.sequence,
      expectedRevision: current.revision,
      intakeJson: JSON.stringify(next.intake),
      prReconciliationJson: JSON.stringify(next.pr_reconciliation),
      publicationJson: stringifyNullable(next.publication),
      stagingJson: stringifyNullable(next.staging),
      status: nextStatus,
      syncId,
      updatedAt: at,
    });
    if (!accepted) {
      throw new StaleSyncRevisionError(syncId, current.revision, getSyncState(store, syncId)?.revision ?? -1);
    }
    const saved = selectSync(store.db, syncId);
    if (!saved) throw new Error(`Sync disappeared after transition: ${syncId}`);
    return rowToSyncState(saved);
  });
}

function assertIntake(intake: SyncIntake): void {
  requiredText(intake.upstream_from, "intake.upstream_from");
  requiredText(intake.upstream_to, "intake.upstream_to");
  stringArray(intake.merged_pr_ids, "intake.merged_pr_ids");
  stringArray(intake.corpus_batch_ids, "intake.corpus_batch_ids");
  if (typeof intake.knowledge_only !== "boolean") throw new Error("intake.knowledge_only must be boolean");
  const knowledgeOnly = intake.upstream_from === intake.upstream_to;
  if (intake.knowledge_only !== knowledgeOnly) {
    throw new Error("intake.knowledge_only must be true exactly when upstream_from equals upstream_to");
  }
}

function assertOwningSession(db: Database, projectId: string, sessionUuid: string): void {
  const row = db
    .query("SELECT project_id, status, head_revision FROM project_sessions WHERE session_uuid = ?")
    .get(sessionUuid) as { project_id: string; status: string; head_revision: string | null } | null;
  if (!row) throw new Error(`Project session not found: ${sessionUuid}`);
  if (row.project_id !== projectId) {
    throw new Error(`Project session ${sessionUuid} does not belong to ${projectId}`);
  }
  if (!["active", "blocked"].includes(row.status)) {
    throw new Error(`Project session ${sessionUuid} cannot accept a sync request while ${row.status}`);
  }
  if (!row.head_revision?.trim()) {
    throw new Error(`Project session ${sessionUuid} has no canonical head for a sync request`);
  }
}

/** Appends a typed knowledge-stage fact inside the caller's state transaction. */
export function appendSyncKnowledgeEventInTransaction(
  db: Database,
  input: SyncKnowledgeEventInput,
): AppendedProjectEvent {
  if (!db.inTransaction) throw new Error(`${input.eventType} must be appended inside a state transaction`);
  requiredText(input.projectId, "projectId");
  requiredText(input.subjectId, "subjectId");
  requiredText(input.causationId, "causationId");
  requiredText(input.correlationId, "correlationId");
  requiredText(input.traceId, "traceId");
  requiredText(input.spanId, "spanId");
  if (input.eventType === "knowledge.job_enqueued") {
    if (!input.payload.provenance || typeof input.payload.provenance !== "object") {
      throw new Error("knowledge.job_enqueued requires provenance");
    }
  } else if (input.eventType === "knowledge.revision_advanced") {
    requiredText(input.payload.old_revision, "old_revision");
    requiredText(input.payload.new_revision, "new_revision");
    stringArray(input.payload.accepted_job_ids, "accepted_job_ids");
  } else {
    requiredText(input.payload.sync_id, "sync_id");
    requiredText(input.payload.source_id, "source_id");
    if (input.payload.source_kind !== "merged_pr" && input.payload.source_kind !== "corpus") {
      throw new Error(`${input.eventType} requires source_kind merged_pr or corpus`);
    }
    if (input.eventType === "knowledge.job_processing") {
      if (!(["queued", "waiting"] as const).includes(input.payload.previous_status)) {
        throw new Error("knowledge.job_processing requires queued or waiting previous_status");
      }
      if (input.payload.status !== "processing") {
        throw new Error("knowledge.job_processing requires processing status");
      }
    } else if (input.eventType === "knowledge.job_waiting") {
      if (
        !(["processing", "succeeded", "failed"] as const).includes(input.payload.previous_status) ||
        input.payload.status !== "waiting"
      ) {
        throw new Error("knowledge.job_waiting requires processing, succeeded, or failed -> waiting");
      }
      requiredText(input.payload.reason, "reason");
    } else if (input.eventType === "knowledge.job_succeeded") {
      if (input.payload.previous_status !== "processing" || input.payload.status !== "succeeded") {
        throw new Error("knowledge.job_succeeded requires processing -> succeeded");
      }
      requiredText(input.payload.staged_digest, "staged_digest");
    } else if (input.eventType === "knowledge.job_cancelled") {
      if (
        !(["queued", "processing", "waiting", "succeeded", "failed"] as const)
          .includes(input.payload.previous_status) ||
        input.payload.status !== "cancelled"
      ) {
        throw new Error("knowledge.job_cancelled requires a non-cancelled previous_status -> cancelled");
      }
      requiredText(input.payload.reason, "reason");
    } else {
      if (input.payload.previous_status !== "processing" || input.payload.status !== "failed") {
        throw new Error("knowledge.job_failed requires processing -> failed");
      }
      requiredText(input.payload.error, "error");
    }
  }
  return appendProjectEvent(db, {
    eventType: input.eventType,
    projectId: input.projectId,
    subjectKind: input.eventType === "knowledge.revision_advanced" ? "project_knowledge" : "knowledge_job",
    subjectId: input.subjectId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    traceId: input.traceId,
    spanId: input.spanId,
    actor: input.actor,
    occurredAt: input.occurredAt,
    payload: input.payload,
  });
}

function requestedPayload(intake: SyncIntake): JsonObject {
  return {
    upstream_from: intake.upstream_from,
    upstream_to: intake.upstream_to,
    merged_pr_ids: intake.merged_pr_ids,
    corpus_batch_ids: intake.corpus_batch_ids,
    knowledge_only: intake.knowledge_only,
  };
}

/** Records observation only. It deliberately does not request or acquire the dispatch lease. */
export function recordSyncRequested(store: StateStore, input: RecordSyncRequestedInput): SyncState {
  return immediateTransaction(store.db, () => {
    const projectId = requiredText(input.projectId, "projectId");
    const sessionUuid = requiredText(input.sessionUuid, "sessionUuid");
    assertIntake(input.intake);
    assertOwningSession(store.db, projectId, sessionUuid);
    const existing = getNonTerminalSyncForProject(store, projectId);
    if (existing) {
      if (existing.status !== "requested") {
        throw new Error(`Project ${projectId} already has non-terminal sync ${existing.sync_id} in ${existing.status}`);
      }
      if (input.syncId && input.syncId !== existing.sync_id) {
        throw new Error(`Project ${projectId} already has requested sync ${existing.sync_id}`);
      }
      if (existing.session_uuid !== sessionUuid) {
        throw new Error(`Requested sync ${existing.sync_id} belongs to session ${existing.session_uuid}, not ${sessionUuid}`);
      }
      return transitionSync(store, existing.sync_id, {
        actor: input.actor ?? "external_observer",
        commandId: input.commandId ?? `command-sync-observe-${randomUUID()}`,
        correlationId: input.correlationId ?? existing.sync_id,
        eventType: "sync.requested",
        expectedRevision: existing.revision,
        occurredAt: input.occurredAt,
        patch: { intake: input.intake },
        payload: requestedPayload(input.intake),
        spanId: input.spanId,
      });
    }

    const syncId = requiredText(input.syncId ?? `sync-${randomUUID()}`, "syncId");
    const at = input.occurredAt ?? currentTime();
    const traceId = requiredText(input.traceId ?? `trace-sync-${syncId}`, "traceId");
    const event = appendProjectEvent(store.db, {
      eventType: "sync.requested",
      projectId,
      subjectKind: "sync",
      subjectId: syncId,
      correlationId: input.correlationId ?? syncId,
      causationId: input.commandId ?? `command-sync-observe-${syncId}`,
      traceId,
      spanId: input.spanId ?? `span-${randomUUID()}`,
      actor: input.actor ?? "external_observer",
      occurredAt: at,
      payload: requestedPayload(input.intake),
    });
    store.db
      .query(
        `INSERT INTO sync_state (
           sync_id, project_id, session_uuid, revision, status, trace_id,
           caused_by_event_id, blockers_json, created_at, updated_at,
           latest_event_sequence, intake_json, staging_json,
           pr_reconciliation_json, publication_json
         ) VALUES (?, ?, ?, 0, 'requested', ?, ?, '[]', ?, ?, ?, ?, NULL, '[]', NULL)`,
      )
      .run(
        syncId,
        projectId,
        sessionUuid,
        traceId,
        event.eventId,
        at,
        at,
        event.sequence,
        JSON.stringify(input.intake),
      );
    const saved = selectSync(store.db, syncId);
    if (!saved) throw new Error(`Sync was not recorded: ${syncId}`);
    return rowToSyncState(saved);
  });
}
