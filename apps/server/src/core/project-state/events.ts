import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type EventActor = "operator" | "runner" | "agent" | "guardian" | "external_observer";
export type ProjectEventActor = EventActor;

export interface ProjectEventEnvelope {
  eventType: string;
  schemaVersion?: number;
  projectId: string;
  subjectKind: string;
  subjectId: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  spanId: string;
  actor: ProjectEventActor;
  occurredAt?: string;
  payload?: JsonObject;
}

export type ProjectEventInput = ProjectEventEnvelope;

export interface ProjectEventRecord {
  eventId: string;
  sequence: number;
  eventType: string;
  schemaVersion: number;
  projectId: string;
  subjectKind: string;
  subjectId: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  spanId: string;
  actor: ProjectEventActor;
  occurredAt: string;
  payload: JsonObject;
}

export interface AppendedProjectEvent {
  eventId: string;
  sequence: number;
}

export interface ProjectEventListOptions {
  projectId?: string;
  afterSequence?: number;
  limit?: number;
}

type SqlBinding = bigint | boolean | null | number | string | Uint8Array;

function eventId(): string {
  return `event-${randomUUID()}`;
}

function assertNonBlankEnvelopeValue(label: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Project event ${label} must be a nonblank string`);
  }
}

function validateProjectEventEnvelope(envelope: ProjectEventEnvelope): void {
  assertNonBlankEnvelopeValue("eventType", envelope.eventType);
  assertNonBlankEnvelopeValue("projectId", envelope.projectId);
  assertNonBlankEnvelopeValue("subjectKind", envelope.subjectKind);
  assertNonBlankEnvelopeValue("subjectId", envelope.subjectId);
  assertNonBlankEnvelopeValue("correlationId", envelope.correlationId);
  assertNonBlankEnvelopeValue("causationId", envelope.causationId);
  assertNonBlankEnvelopeValue("traceId", envelope.traceId);
  assertNonBlankEnvelopeValue("spanId", envelope.spanId);
  if (envelope.occurredAt !== undefined) {
    assertNonBlankEnvelopeValue("occurredAt", envelope.occurredAt);
  }
}

function parsePayload(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
}

function rowToProjectEvent(row: Record<string, unknown>): ProjectEventRecord {
  return {
    eventId: String(row.event_id),
    sequence: Number(row.sequence),
    eventType: String(row.event_type),
    schemaVersion: Number(row.schema_version),
    projectId: String(row.project_id),
    subjectKind: String(row.subject_kind),
    subjectId: String(row.subject_id),
    correlationId: String(row.correlation_id),
    causationId: String(row.causation_id),
    traceId: String(row.trace_id),
    spanId: String(row.span_id),
    actor: String(row.actor) as ProjectEventActor,
    occurredAt: String(row.occurred_at),
    payload: parsePayload(row.payload_json),
  };
}

function normalizedLimit(limit: number | undefined): number | undefined {
  if (limit === undefined || !Number.isFinite(limit)) return undefined;
  return Math.max(1, Math.trunc(limit));
}

function queryProjectEvents(
  db: Database,
  options: ProjectEventListOptions,
  subject?: { kind: string; id: string },
): ProjectEventRecord[] {
  const clauses: string[] = [];
  const bindings: SqlBinding[] = [];
  if (options.projectId !== undefined) {
    clauses.push("project_id = ?");
    bindings.push(options.projectId);
  }
  if (subject) {
    clauses.push("subject_kind = ?", "subject_id = ?");
    bindings.push(subject.kind, subject.id);
  }
  if (options.afterSequence !== undefined) {
    clauses.push("sequence > ?");
    bindings.push(Math.max(0, Math.trunc(options.afterSequence)));
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = normalizedLimit(options.limit);
  if (limit !== undefined) bindings.push(limit);
  const rows = db
    .query(
      `
        SELECT
          sequence, event_id, event_type, schema_version, project_id,
          subject_kind, subject_id, correlation_id, causation_id,
          trace_id, span_id, actor, occurred_at, payload_json
        FROM project_events
        ${where}
        ORDER BY sequence ASC
        ${limit === undefined ? "" : "LIMIT ?"}
      `,
    )
    .all(...bindings) as Record<string, unknown>[];
  return rows.map(rowToProjectEvent);
}

/**
 * Appends an accepted fact. The caller owns the surrounding transaction so
 * the event and its state transition commit or roll back together.
 */
export function appendProjectEvent(db: Database, envelope: ProjectEventEnvelope): AppendedProjectEvent {
  validateProjectEventEnvelope(envelope);
  const id = eventId();
  const result = db
    .query(
      `
        INSERT INTO project_events (
          event_id, event_type, schema_version, project_id,
          subject_kind, subject_id, correlation_id, causation_id,
          trace_id, span_id, actor, occurred_at, payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      envelope.eventType,
      envelope.schemaVersion ?? 1,
      envelope.projectId,
      envelope.subjectKind,
      envelope.subjectId,
      envelope.correlationId,
      envelope.causationId,
      envelope.traceId,
      envelope.spanId,
      envelope.actor,
      envelope.occurredAt ?? new Date().toISOString(),
      JSON.stringify(envelope.payload ?? {}),
    );
  return { eventId: id, sequence: Number(result.lastInsertRowid) };
}

export function listProjectEvents(db: Database, options: ProjectEventListOptions = {}): ProjectEventRecord[] {
  return queryProjectEvents(db, options);
}

export function eventsForSubject(
  db: Database,
  subjectKind: string,
  subjectId: string,
  options: ProjectEventListOptions = {},
): ProjectEventRecord[] {
  return queryProjectEvents(db, options, { kind: subjectKind, id: subjectId });
}

export function latestSequence(db: Database, projectId?: string): number {
  const row = (projectId === undefined
    ? db.query("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM project_events").get()
    : db.query("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM project_events WHERE project_id = ?").get(projectId)) as
    | Record<string, unknown>
    | undefined;
  return Number(row?.sequence ?? 0);
}
