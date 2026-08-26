import type { Database } from "bun:sqlite";
import {
  GAME_EVENT_SUBJECT_KINDS,
  type GameEventSubjectKind,
} from "./event-registry.js";
import type { JsonObject, JsonValue, GameEventActor } from "./events.js";
import type { GameEventKernelTraceProjection } from "./kernel-links.js";

export const DEFAULT_EVENT_QUERY_LIMIT = 50;
export const MAX_EVENT_QUERY_LIMIT = 200;
export const PAYLOAD_SUMMARY_MAX_DEPTH = 4;
export const PAYLOAD_SUMMARY_MAX_ENTRIES = 64;
export const PAYLOAD_SUMMARY_MAX_STRING_LENGTH = 256;
export const PAYLOAD_SUMMARY_MAX_SERIALIZED_BYTES = 4_096;

export class GameEventQueryValidationError extends Error {
  readonly code = "GAME_EVENT_QUERY_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "GameEventQueryValidationError";
  }
}

export class GameEventPayloadError extends Error {
  readonly code = "GAME_EVENT_PAYLOAD_INVALID";

  constructor() {
    super("Stored game event payload is invalid");
    this.name = "GameEventPayloadError";
  }
}

export interface GameEventSubjectFilter {
  kind: GameEventSubjectKind;
  id: string;
}

export interface GameEventQueryInput {
  gameId: string;
  correlationId?: string;
  subject?: GameEventSubjectFilter;
  eventTypePrefix?: string;
  fromSequence?: number;
  toSequence?: number;
  afterSequence?: number;
  limit?: number;
}

export interface GameEventDescendingQueryInput {
  gameId: string;
  correlationId?: string;
  subject?: GameEventSubjectFilter;
  eventTypePrefix?: string;
  beforeSequence?: number;
  limit?: number;
}

export interface GameEventReconstructionPageOptions {
  afterSequence?: number;
  limit?: number;
}

export interface GameEventDto {
  event_id: string;
  sequence: number;
  event_type: string;
  schema_version: number;
  game_id: string;
  subject_kind: GameEventSubjectKind;
  subject_id: string;
  correlation_id: string;
  causation_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  actor: GameEventActor;
  occurred_at: string;
  payload_summary: JsonObject;
}

export interface GameEventQueryPage {
  events: GameEventDto[];
  has_more: boolean;
  next_after_sequence: number | null;
}

export interface GameEventDescendingQueryPage {
  events: GameEventDto[];
  has_more: boolean;
  next_before_sequence: number | null;
}

export interface GameEventCorrelationWorkflow {
  kind: "run" | "sync" | "cycle";
  id: string;
}

export interface GameEventCorrelationSummary {
  correlation_id: string;
  event_count: number;
  first_sequence: number;
  last_sequence: number;
  latest_occurred_at: string;
  workflow: GameEventCorrelationWorkflow | null;
}

export interface GameEventCauseEvent {
  kind: "event";
  event_id: string;
  sequence: number;
  event_type: string;
  correlation_id: string;
  subject_kind: GameEventSubjectKind;
  subject_id: string;
}

export interface GameEventCauseCommand {
  kind: "command";
  command_id: string;
}

export type GameEventCause = GameEventCauseEvent | GameEventCauseCommand;

export interface ReconstructedGameEvent extends GameEventDto {
  caused_by: GameEventCause;
}

export interface GameEventReconstruction {
  game_id: string;
  correlation_id: string;
  events: ReconstructedGameEvent[];
  has_more: boolean;
  next_after_sequence: number | null;
  kernel_traces: GameEventKernelTraceProjection[];
}

type SqlBinding = bigint | boolean | null | number | string | Uint8Array;
type GameEventRow = Record<string, unknown>;

const EVENT_COLUMNS = `
  sequence, event_id, event_type, schema_version, game_id,
  subject_kind, subject_id, correlation_id, causation_id,
  trace_id, span_id, parent_span_id, actor, occurred_at, payload_json
`;

const SAFE_SUMMARY_KEYS = new Set([
  "accepted_job_ids", "anchored_commit", "attempt", "batch_index",
  "blocker_code", "blocker_codes", "blockers", "cancellation_reason",
  "claimed_work_item_ids", "cleared_handoff", "closing_actor", "completed",
  "corpus_batch_ids", "count", "counts", "current_lease_holder", "details",
  "desired_workers", "enabled", "execution_class", "failed", "forced",
  "goal_kind", "goal_value", "handoff_snapshot_id", "headline_score", "id",
  "ids", "index", "items", "kind", "knowledge_revision", "label", "lease_id",
  "merged_pr_ids", "message", "metadata", "name", "new_head", "new_revision",
  "old_revision", "open_obligations", "operation_id", "operator", "outcome",
  "pending", "phase", "previous_desired_workers", "previous_phase",
  "previous_status", "progress", "progress_kind", "reason", "remote_name",
  "resolution", "resolved_work_item_ids", "results", "resume_stage",
  "resulting_status", "score", "sequence", "series_count", "series_id",
  "series_ids", "source_class", "source_id", "source_kind", "staging_preserved",
  "status", "summary", "sync_id", "target_kind", "terminal_revision", "total",
  "trigger_kind", "upstream_from", "upstream_pr_number", "upstream_revision",
  "upstream_to", "value", "workflow_id",
]);

const SAFE_SUMMARY_KEY_SUFFIX = /(?:^|_)(?:code|codes|commit|completed|count|enabled|failed|head|id|ids|identifier|identifiers|index|kind|outcome|pending|phase|progress|reason|revision|score|sequence|sha|status|total|value)$/;
const CREDENTIAL_KEY = /(?:accesskey|apikey|auth|bearer|clientsecret|cookie|credential|password|passwd|privatekey|secret|sessionkey|token)/;
const FILESYSTEM_KEY = /(?:checkout|cwd|directory|filepath|graphdb|home|localenv|path|reporoot|statedir|worktree)/;
const CREDENTIAL_VALUE = /(?:\bbearer\s+\S+|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|(?:access[_ -]?key|api[_ -]?key|authorization|credential|password|passwd|secret|token)\s*[:=]\s*\S+)/i;
const FILESYSTEM_VALUE = /(?:^|[\s"'(=])(?:~[\\/]|[A-Za-z]:[\\/]|\\\\|\.\.[\\/]|\/(?!\/)[A-Za-z0-9._~-]+(?:[\\/][^\s"'<>]*)*)/i;
const serializedSizeEncoder = new TextEncoder();

interface SummaryBudget {
  entries: number;
  truncated: boolean;
}

function normalizedSummaryKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function compactKey(key: string): string {
  return normalizedSummaryKey(key).replaceAll("_", "");
}

function summaryKeyAllowed(key: string): boolean {
  const normalized = normalizedSummaryKey(key);
  return SAFE_SUMMARY_KEYS.has(normalized) || SAFE_SUMMARY_KEY_SUFFIX.test(normalized);
}

function summaryEntryPriority([key, value]: [string, JsonValue]): number {
  const normalized = normalizedSummaryKey(key);
  if (/(?:^|_)(?:code|codes|count|head|id|ids|index|kind|progress|revision|score|sequence|status)$/.test(normalized)) {
    return 0;
  }
  return value === null || typeof value !== "object" ? 1 : 2;
}

function redactedString(value: string, budget: SummaryBudget): string {
  if (CREDENTIAL_VALUE.test(value)) return "[REDACTED]";
  if (FILESYSTEM_VALUE.test(value)) return "[REDACTED_PATH]";
  const characters = Array.from(value);
  if (characters.length <= PAYLOAD_SUMMARY_MAX_STRING_LENGTH) return value;
  budget.truncated = true;
  return `${characters.slice(0, PAYLOAD_SUMMARY_MAX_STRING_LENGTH - 1).join("")}…`;
}

function sanitizedSummaryValue(
  value: JsonValue,
  depth: number,
  budget: SummaryBudget,
): JsonValue {
  if (typeof value === "string") return redactedString(value, budget);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (depth >= PAYLOAD_SUMMARY_MAX_DEPTH) {
    budget.truncated = true;
    return "[TRUNCATED]";
  }
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const entry of value) {
      if (budget.entries >= PAYLOAD_SUMMARY_MAX_ENTRIES) {
        budget.truncated = true;
        break;
      }
      budget.entries += 1;
      result.push(sanitizedSummaryValue(entry, depth + 1, budget));
    }
    return result;
  }
  return sanitizedSummaryObject(value, depth + 1, budget);
}

function sanitizedSummaryObject(
  value: JsonObject,
  depth: number,
  budget: SummaryBudget,
): JsonObject {
  const result: JsonObject = {};
  const entries = Object.entries(value).sort(
    (left, right) => summaryEntryPriority(left) - summaryEntryPriority(right),
  );
  for (const [key, entry] of entries) {
    const compact = compactKey(key);
    const credential = CREDENTIAL_KEY.test(compact);
    const filesystem = FILESYSTEM_KEY.test(compact);
    if (!credential && !filesystem && !summaryKeyAllowed(key)) continue;
    if (budget.entries >= PAYLOAD_SUMMARY_MAX_ENTRIES) {
      budget.truncated = true;
      break;
    }
    budget.entries += 1;
    const outputKey = key.length <= 64 ? key : "redacted_field";
    result[outputKey] = credential
      ? "[REDACTED]"
      : filesystem
        ? "[REDACTED_PATH]"
        : sanitizedSummaryValue(entry, depth, budget);
  }
  return result;
}

function serializedBytes(value: JsonObject): number {
  return serializedSizeEncoder.encode(JSON.stringify(value)).byteLength;
}

export function summarizeGameEventPayload(payload: JsonObject): JsonObject {
  const budget: SummaryBudget = { entries: 0, truncated: false };
  const sanitized = sanitizedSummaryObject(payload, 0, budget);
  const result: JsonObject = {};
  const markerReserve = 24;
  for (const [key, value] of Object.entries(sanitized)) {
    const candidate = { ...result, [key]: value };
    if (serializedBytes(candidate) <= PAYLOAD_SUMMARY_MAX_SERIALIZED_BYTES - markerReserve) {
      result[key] = value;
    } else {
      budget.truncated = true;
    }
  }
  if (budget.truncated) result._truncated = true;
  return result;
}

function parsePayload(value: unknown): JsonObject {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GameEventPayloadError();
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new GameEventPayloadError();
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof GameEventPayloadError) throw error;
    throw new GameEventPayloadError();
  }
}

function publicSubjectKind(value: unknown): GameEventSubjectKind {
  return String(value) as GameEventSubjectKind;
}

function rowToDto(row: GameEventRow): GameEventDto {
  const payload = parsePayload(row.payload_json);
  return {
    event_id: String(row.event_id),
    sequence: Number(row.sequence),
    event_type: String(row.event_type),
    schema_version: Number(row.schema_version),
    game_id: String(row.game_id),
    subject_kind: publicSubjectKind(row.subject_kind),
    subject_id: String(row.subject_id),
    correlation_id: String(row.correlation_id),
    causation_id: String(row.causation_id),
    trace_id: String(row.trace_id),
    span_id: String(row.span_id),
    parent_span_id: row.parent_span_id === null || row.parent_span_id === undefined
      ? null
      : String(row.parent_span_id),
    actor: String(row.actor) as GameEventActor,
    occurred_at: String(row.occurred_at),
    payload_summary: summarizeGameEventPayload(payload),
  };
}

function validationError(message: string): never {
  throw new GameEventQueryValidationError(message);
}

function assertSequence(name: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    validationError(`${name} must be a non-negative safe integer`);
  }
}

function validatedLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_EVENT_QUERY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_EVENT_QUERY_LIMIT) {
    validationError(`limit must be an integer between 1 and ${MAX_EVENT_QUERY_LIMIT}`);
  }
  return value;
}

function subjectKindRegistered(value: string): value is GameEventSubjectKind {
  return GAME_EVENT_SUBJECT_KINDS.includes(value as GameEventSubjectKind);
}

function validateQuery(input: GameEventQueryInput): number {
  if (!input.gameId.trim()) validationError("gameId must be a nonblank string");
  if (input.correlationId !== undefined && !input.correlationId.trim()) {
    validationError("correlationId must be a nonblank string");
  }
  if (input.eventTypePrefix !== undefined && !input.eventTypePrefix.trim()) {
    validationError("eventTypePrefix must be a nonblank string");
  }
  if (input.subject) {
    if (!subjectKindRegistered(input.subject.kind)) {
      validationError("subject kind must be a registered game event subject kind");
    }
    if (!input.subject.id.trim()) validationError("subject id must be a nonblank string");
  }
  assertSequence("fromSequence", input.fromSequence);
  assertSequence("toSequence", input.toSequence);
  assertSequence("afterSequence", input.afterSequence);
  if (
    input.fromSequence !== undefined &&
    input.toSequence !== undefined &&
    input.fromSequence > input.toSequence
  ) {
    validationError("fromSequence must be less than or equal to toSequence");
  }
  return validatedLimit(input.limit);
}

function validateDescendingQuery(input: GameEventDescendingQueryInput): number {
  if (!input.gameId.trim()) validationError("gameId must be a nonblank string");
  if (input.correlationId !== undefined && !input.correlationId.trim()) {
    validationError("correlationId must be a nonblank string");
  }
  if (input.eventTypePrefix !== undefined && !input.eventTypePrefix.trim()) {
    validationError("eventTypePrefix must be a nonblank string");
  }
  if (input.subject) {
    if (!subjectKindRegistered(input.subject.kind)) {
      validationError("subject kind must be a registered game event subject kind");
    }
    if (!input.subject.id.trim()) validationError("subject id must be a nonblank string");
  }
  assertSequence("beforeSequence", input.beforeSequence);
  return validatedLimit(input.limit);
}

type FilteredRowsInput = GameEventQueryInput & { beforeSequence?: number };

function subjectClause(
  input: FilteredRowsInput,
  clauses: string[],
  bindings: SqlBinding[],
): void {
  if (!input.subject) return;
  if (input.subject.kind === "game" && input.subject.id === input.gameId) {
    clauses.push(`(
      (subject_kind = ? AND subject_id = ?)
      OR (
        subject_kind IN ('run', 'sync_workflow', 'pr_campaign')
        AND substr(event_type, 1, length('game.dispatch_')) = 'game.dispatch_'
      )
    )`);
    bindings.push(input.subject.kind, input.subject.id);
    return;
  }
  clauses.push("subject_kind = ?", "subject_id = ?");
  bindings.push(input.subject.kind, input.subject.id);
}

function filteredRows(
  db: Database,
  input: FilteredRowsInput,
  order: "ASC" | "DESC",
  limit: number,
): GameEventRow[] {
  const clauses = ["game_id = ?"];
  const bindings: SqlBinding[] = [input.gameId];
  if (input.correlationId !== undefined) {
    clauses.push("correlation_id = ?");
    bindings.push(input.correlationId);
  }
  subjectClause(input, clauses, bindings);
  if (input.eventTypePrefix !== undefined) {
    clauses.push("substr(event_type, 1, length(?)) = ?");
    bindings.push(input.eventTypePrefix, input.eventTypePrefix);
  }
  if (input.fromSequence !== undefined) {
    clauses.push("sequence >= ?");
    bindings.push(input.fromSequence);
  }
  if (input.toSequence !== undefined) {
    clauses.push("sequence <= ?");
    bindings.push(input.toSequence);
  }
  if (input.afterSequence !== undefined) {
    clauses.push("sequence > ?");
    bindings.push(input.afterSequence);
  }
  if (input.beforeSequence !== undefined) {
    clauses.push("sequence < ?");
    bindings.push(input.beforeSequence);
  }
  bindings.push(limit);
  return db.query(`
    SELECT ${EVENT_COLUMNS}
    FROM game_events
    WHERE ${clauses.join(" AND ")}
    ORDER BY sequence ${order}
    LIMIT ?
  `).all(...bindings) as GameEventRow[];
}

export function queryGameEvents(db: Database, input: GameEventQueryInput): GameEventQueryPage {
  const limit = validateQuery(input);
  const rows = filteredRows(db, input, "ASC", limit + 1);
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).map(rowToDto);
  return {
    events,
    has_more: hasMore,
    next_after_sequence: hasMore && events.length > 0 ? events[events.length - 1]!.sequence : null,
  };
}

export function queryGameEventsDescending(
  db: Database,
  input: GameEventDescendingQueryInput,
): GameEventDescendingQueryPage {
  const limit = validateDescendingQuery(input);
  const rows = filteredRows(db, input, "DESC", limit + 1);
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).reverse().map(rowToDto);
  return {
    events,
    has_more: hasMore,
    next_before_sequence: hasMore && events.length > 0 ? events[0]!.sequence : null,
  };
}

export function listGameEventCorrelations(
  db: Database,
  gameId: string,
): GameEventCorrelationSummary[] {
  if (!gameId.trim()) validationError("gameId must be a nonblank string");

  const summaryRows = db.query(`
    SELECT
      grouped.correlation_id,
      grouped.event_count,
      grouped.first_sequence,
      grouped.last_sequence,
      latest.occurred_at AS latest_occurred_at
    FROM (
      SELECT
        correlation_id,
        COUNT(*) AS event_count,
        MIN(sequence) AS first_sequence,
        MAX(sequence) AS last_sequence
      FROM game_events
      WHERE game_id = ?
      GROUP BY correlation_id
    ) AS grouped
    JOIN game_events AS latest
      ON latest.game_id = ?
      AND latest.correlation_id = grouped.correlation_id
      AND latest.sequence = grouped.last_sequence
    ORDER BY grouped.last_sequence DESC
  `).all(gameId, gameId) as GameEventRow[];

  const workflowRows = db.query(`
    SELECT correlation_id, subject_kind, subject_id
    FROM game_events
    WHERE game_id = ?
      AND subject_kind IN ('run', 'sync_workflow', 'cycle')
    GROUP BY correlation_id, subject_kind, subject_id
  `).all(gameId) as GameEventRow[];
  const workflowsByCorrelation = new Map<string, GameEventCorrelationWorkflow[]>();
  for (const row of workflowRows) {
    const correlationId = String(row.correlation_id);
    const subjectKind = String(row.subject_kind);
    const workflow: GameEventCorrelationWorkflow = {
      kind: subjectKind === "sync_workflow"
        ? "sync"
        : subjectKind as "run" | "cycle",
      id: String(row.subject_id),
    };
    const workflows = workflowsByCorrelation.get(correlationId) ?? [];
    workflows.push(workflow);
    workflowsByCorrelation.set(correlationId, workflows);
  }

  return summaryRows.map((row) => {
    const correlationId = String(row.correlation_id);
    const workflows = workflowsByCorrelation.get(correlationId) ?? [];
    return {
      correlation_id: correlationId,
      event_count: Number(row.event_count),
      first_sequence: Number(row.first_sequence),
      last_sequence: Number(row.last_sequence),
      latest_occurred_at: String(row.latest_occurred_at),
      workflow: workflows.length === 1 ? workflows[0]! : null,
    };
  });
}

export function recentGameEvents(db: Database, gameId: string, limit = 20): GameEventDto[] {
  const validated = validatedLimit(limit);
  return filteredRows(db, { gameId }, "DESC", validated).map(rowToDto);
}

function reconstructedCause(row: GameEventRow): GameEventCauseEvent {
  return {
    kind: "event",
    event_id: String(row.event_id),
    sequence: Number(row.sequence),
    event_type: String(row.event_type),
    correlation_id: String(row.correlation_id),
    subject_kind: publicSubjectKind(row.subject_kind),
    subject_id: String(row.subject_id),
  };
}

export function reconstructGameEvents(
  db: Database,
  gameId: string,
  correlationId: string,
  options: GameEventReconstructionPageOptions = {},
): GameEventReconstruction {
  if (!gameId.trim()) validationError("gameId must be a nonblank string");
  if (!correlationId.trim()) validationError("correlationId must be a nonblank string");
  assertSequence("afterSequence", options.afterSequence);
  const limit = validatedLimit(options.limit);
  const clauses = ["game_id = ?", "correlation_id = ?"];
  const bindings: SqlBinding[] = [gameId, correlationId];
  if (options.afterSequence !== undefined) {
    clauses.push("sequence > ?");
    bindings.push(options.afterSequence);
  }
  bindings.push(limit + 1);
  const lifecycleRows = db.query(`
    SELECT ${EVENT_COLUMNS}
    FROM game_events
    WHERE ${clauses.join(" AND ")}
    ORDER BY sequence ASC
    LIMIT ?
  `).all(...bindings) as GameEventRow[];
  const hasMore = lifecycleRows.length > limit;
  const returnedRows = lifecycleRows.slice(0, limit);

  const causeIds = [...new Set(returnedRows.map((row) => String(row.causation_id)))];
  const causeRows = causeIds.length === 0
    ? []
    : db.query(`
        SELECT sequence, event_id, event_type, correlation_id, subject_kind, subject_id
        FROM game_events
        WHERE game_id = ? AND event_id IN (${causeIds.map(() => "?").join(", ")})
      `).all(gameId, ...causeIds) as GameEventRow[];
  const causesById = new Map(
    causeRows.map((row) => [String(row.event_id), reconstructedCause(row)] as const),
  );
  const events = returnedRows.map((row): ReconstructedGameEvent => {
    const event = rowToDto(row);
    return {
      ...event,
      caused_by: causesById.get(event.causation_id) ?? {
        kind: "command",
        command_id: event.causation_id,
      },
    };
  });

  return {
    game_id: gameId,
    correlation_id: correlationId,
    events,
    has_more: hasMore,
    next_after_sequence: hasMore && events.length > 0 ? events[events.length - 1]!.sequence : null,
    kernel_traces: [],
  };
}
