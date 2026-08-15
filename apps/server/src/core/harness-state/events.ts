import { createHash, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { validateRegisteredGameEvent } from "./event-registry.js";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type EventActor = "operator" | "runner" | "agent" | "guardian" | "external_observer";
export type GameEventActor = EventActor;

export interface GameEventEnvelope {
  eventType: string;
  schemaVersion?: number;
  gameId: string;
  subjectKind: string;
  subjectId: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  actor: GameEventActor;
  occurredAt?: string;
  payload?: JsonObject;
}

export type GameEventInput = GameEventEnvelope;

export interface GameEventRecord {
  eventId: string;
  sequence: number;
  eventType: string;
  schemaVersion: number;
  gameId: string;
  subjectKind: string;
  subjectId: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  actor: GameEventActor;
  occurredAt: string;
  payload: JsonObject;
}

export interface AppendedGameEvent {
  eventId: string;
  sequence: number;
}

export interface GameEventListOptions {
  gameId?: string;
  afterSequence?: number;
  limit?: number;
}

type SqlBinding = bigint | boolean | null | number | string | Uint8Array;

function eventId(): string {
  return `event-${randomUUID()}`;
}

export function newSpanId(): string {
  return `span-${randomUUID()}`;
}

/** Produces a stable UUID-shaped span id without reusing a domain identifier as a span. */
export function spanIdFromSeed(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `span-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Every event gets a fresh leaf span; a null parent identifies a root span. */
export function eventSpan(parentSpanId: string | null = newSpanId()): Pick<GameEventEnvelope, "spanId" | "parentSpanId"> {
  return { spanId: newSpanId(), parentSpanId };
}

function assertNonBlankEnvelopeValue(label: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Game event ${label} must be a nonblank string`);
  }
}

function validateGameEventEnvelope(envelope: GameEventEnvelope): void {
  assertNonBlankEnvelopeValue("eventType", envelope.eventType);
  assertNonBlankEnvelopeValue("gameId", envelope.gameId);
  assertNonBlankEnvelopeValue("subjectKind", envelope.subjectKind);
  assertNonBlankEnvelopeValue("subjectId", envelope.subjectId);
  assertNonBlankEnvelopeValue("correlationId", envelope.correlationId);
  assertNonBlankEnvelopeValue("causationId", envelope.causationId);
  assertNonBlankEnvelopeValue("traceId", envelope.traceId);
  assertNonBlankEnvelopeValue("spanId", envelope.spanId);
  const spanPattern = /^span-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!spanPattern.test(envelope.spanId)) {
    throw new Error(`Game event spanId must use the span-<uuid> scheme: ${envelope.spanId}`);
  }
  if (envelope.parentSpanId !== null && !spanPattern.test(envelope.parentSpanId)) {
    throw new Error(`Game event parentSpanId must use the span-<uuid> scheme: ${envelope.parentSpanId}`);
  }
  if (envelope.parentSpanId !== null && envelope.spanId === envelope.parentSpanId) {
    throw new Error("Game event leaf spanId must differ from parentSpanId");
  }
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

function rowToGameEvent(row: Record<string, unknown>): GameEventRecord {
  return {
    eventId: String(row.event_id),
    sequence: Number(row.sequence),
    eventType: String(row.event_type),
    schemaVersion: Number(row.schema_version),
    gameId: String(row.game_id),
    subjectKind: String(row.subject_kind),
    subjectId: String(row.subject_id),
    correlationId: String(row.correlation_id),
    causationId: String(row.causation_id),
    traceId: String(row.trace_id),
    spanId: String(row.span_id),
    parentSpanId: row.parent_span_id === null ? null : String(row.parent_span_id),
    actor: String(row.actor) as GameEventActor,
    occurredAt: String(row.occurred_at),
    payload: parsePayload(row.payload_json),
  };
}

function normalizedLimit(limit: number | undefined): number | undefined {
  if (limit === undefined || !Number.isFinite(limit)) return undefined;
  return Math.max(1, Math.trunc(limit));
}

function queryGameEvents(
  db: Database,
  options: GameEventListOptions,
  subject?: { kind: string; id: string },
): GameEventRecord[] {
  const clauses: string[] = [];
  const bindings: SqlBinding[] = [];
  if (options.gameId !== undefined) {
    clauses.push("game_id = ?");
    bindings.push(options.gameId);
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
          sequence, event_id, event_type, schema_version, game_id,
          subject_kind, subject_id, correlation_id, causation_id,
          trace_id, span_id, parent_span_id, actor, occurred_at, payload_json
        FROM game_events
        ${where}
        ORDER BY sequence ASC
        ${limit === undefined ? "" : "LIMIT ?"}
      `,
    )
    .all(...bindings) as Record<string, unknown>[];
  return rows.map(rowToGameEvent);
}

/**
 * Appends an accepted fact. The caller owns the surrounding transaction so
 * the event and its state transition commit or roll back together.
 */
export function appendGameEvent(db: Database, envelope: GameEventEnvelope): AppendedGameEvent {
  validateGameEventEnvelope(envelope);
  const payload = envelope.payload ?? {};
  const contract = validateRegisteredGameEvent(
    envelope.eventType,
    envelope.subjectKind,
    envelope.actor,
    payload,
    envelope.schemaVersion,
  );
  const id = eventId();
  const result = db
    .query(
      `
        INSERT INTO game_events (
          event_id, event_type, schema_version, game_id,
          subject_kind, subject_id, correlation_id, causation_id,
          trace_id, span_id, parent_span_id, actor, occurred_at, payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      envelope.eventType,
      contract.schemaVersion,
      envelope.gameId,
      envelope.subjectKind,
      envelope.subjectId,
      envelope.correlationId,
      envelope.causationId,
      envelope.traceId,
      envelope.spanId,
      envelope.parentSpanId,
      envelope.actor,
      envelope.occurredAt ?? new Date().toISOString(),
      JSON.stringify(payload),
    );
  return { eventId: id, sequence: Number(result.lastInsertRowid) };
}

export function listGameEvents(db: Database, options: GameEventListOptions = {}): GameEventRecord[] {
  return queryGameEvents(db, options);
}

export function eventsForSubject(
  db: Database,
  subjectKind: string,
  subjectId: string,
  options: GameEventListOptions = {},
): GameEventRecord[] {
  return queryGameEvents(db, options, { kind: subjectKind, id: subjectId });
}

export function latestSequence(db: Database, gameId?: string): number {
  const row = (gameId === undefined
    ? db.query("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM game_events").get()
    : db.query("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM game_events WHERE game_id = ?").get(gameId)) as
    | Record<string, unknown>
    | undefined;
  return Number(row?.sequence ?? 0);
}
