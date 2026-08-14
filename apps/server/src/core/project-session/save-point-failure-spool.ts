import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import { appendProjectEvent, eventSpan, spanIdFromSeed, type EventActor } from "@server/core/project-state/events.js";

export interface SavePointFailureSpoolRecord {
  version: 1;
  event_type: "session.save_point_failed";
  spool_id: string;
  occurred_at: string;
  project_id: string | null;
  session_uuid: string | null;
  trigger_kind: string;
  source_kind: string;
  source_id: string;
  message: string;
  command_id: string;
  causation_id: string | null;
  correlation_id: string | null;
  span_id: string | null;
  actor: EventActor;
  replayed_at: string | null;
  replay_event_id: string | null;
}

const SPOOL_DIR = "save_point_failures";
const SPAN_ID_PATTERN = /^span-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isActor(value: unknown): value is EventActor {
  return value === "operator" || value === "runner" || value === "agent" || value === "guardian" || value === "external_observer";
}

function isSavePointFailureActor(value: EventActor): value is "operator" | "runner" | "guardian" {
  return value === "operator" || value === "runner" || value === "guardian";
}

function stableSpoolId(record: Record<string, unknown>): string {
  const identity = [
    record.occurred_at,
    record.project_id,
    record.session_uuid,
    record.trigger_kind,
    record.source_kind,
    record.source_id,
    record.message,
    record.command_id,
  ].map((value) => String(value ?? "")).join("\0");
  return `save-point-failure-${createHash("sha256").update(identity).digest("hex")}`;
}

function requiredText(value: unknown, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new Error(`${label} is required for save-point failure spool replay`);
  return normalized;
}

function savePointReplayKey(sessionUuid: string, anchoredCommit: string, triggerKind: string): string {
  const digest = createHash("sha256")
    .update(`${sessionUuid}\0${anchoredCommit}\0${triggerKind}`)
    .digest("hex")
    .slice(0, 24);
  return `save-point-${digest}`;
}

function replayRootSpanId(
  record: SavePointFailureSpoolRecord,
  sessionUuid: string,
  replayKey: string,
  causationId: string,
): string {
  if (record.span_id) {
    if (!SPAN_ID_PATTERN.test(record.span_id)) {
      throw new Error(`Invalid save-point failure spool span_id: ${record.span_id}`);
    }
    return record.span_id;
  }
  return spanIdFromSeed(
    `save-point-spool:${sessionUuid}:${replayKey}:${causationId}:${record.occurred_at}`,
  );
}

function parseRecord(value: unknown): SavePointFailureSpoolRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.event_type !== "session.save_point_failed" ||
    !optionalText(record.occurred_at) ||
    !optionalText(record.trigger_kind) ||
    !optionalText(record.source_kind) ||
    !optionalText(record.source_id) ||
    !optionalText(record.message) ||
    !optionalText(record.command_id) ||
    !isActor(record.actor)
  ) {
    return null;
  }
  return {
    version: 1,
    event_type: "session.save_point_failed",
    spool_id: optionalText(record.spool_id) ?? stableSpoolId(record),
    occurred_at: String(record.occurred_at),
    project_id: optionalText(record.project_id),
    session_uuid: optionalText(record.session_uuid),
    trigger_kind: String(record.trigger_kind),
    source_kind: String(record.source_kind),
    source_id: String(record.source_id),
    message: String(record.message),
    command_id: String(record.command_id),
    causation_id: optionalText(record.causation_id),
    correlation_id: optionalText(record.correlation_id),
    span_id: optionalText(record.span_id),
    actor: record.actor,
    replayed_at: optionalText(record.replayed_at),
    replay_event_id: optionalText(record.replay_event_id),
  };
}

function listSpoolFileNames(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function readSpoolRecord(path: string): SavePointFailureSpoolRecord {
  const source = readFileSync(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Malformed save-point failure spool JSON at ${path}${detail}`);
  }
  const record = parseRecord(value);
  if (!record) throw new Error(`Invalid SavePointFailureSpoolRecord schema at ${path}`);
  return record;
}

export function spoolSavePointFailure(
  stateDir: string,
  input: Omit<SavePointFailureSpoolRecord, "version" | "event_type" | "spool_id" | "replayed_at" | "replay_event_id">,
): { path: string; record: SavePointFailureSpoolRecord } {
  const record: SavePointFailureSpoolRecord = {
    version: 1,
    event_type: "session.save_point_failed",
    spool_id: `save-point-failure-${randomUUID()}`,
    replayed_at: null,
    replay_event_id: null,
    ...input,
  };
  const dir = resolve(stateDir, SPOOL_DIR);
  mkdirSync(dir, { recursive: true });
  const timestamp = record.occurred_at.replaceAll(":", "-").replaceAll(".", "-");
  const path = resolve(dir, `${timestamp}-${randomUUID()}.json`);
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  renameSync(temporaryPath, path);
  return { path, record };
}

export function listSavePointFailureSpool(stateDir: string): SavePointFailureSpoolRecord[] {
  const dir = resolve(stateDir, SPOOL_DIR);
  return listSpoolFileNames(dir).map((name) => readSpoolRecord(resolve(dir, name)));
}

function writeReplayed(path: string, record: SavePointFailureSpoolRecord, eventId: string, replayedAt: string): void {
  const replayed: SavePointFailureSpoolRecord = {
    ...record,
    replayed_at: replayedAt,
    replay_event_id: eventId,
  };
  const temporaryPath = `${path}.${randomUUID()}.replay.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(replayed, null, 2)}\n`, { flag: "wx" });
  renameSync(temporaryPath, path);
}

/** Replays pending failure evidence after storage migrations complete. */
export function replaySavePointFailureSpool(db: Database, stateDir: string): number {
  const dir = resolve(stateDir, SPOOL_DIR);
  const pending = listSpoolFileNames(dir).map((name) => {
    const path = resolve(dir, name);
    return { path, record: readSpoolRecord(path) };
  });
  let replayedCount = 0;
  for (const { path, record } of pending) {
    if (record.replayed_at) continue;
    const replayedAt = new Date().toISOString();
    const replay = db.transaction(() => {
      const sessions = (record!.session_uuid
        ? db.query("SELECT * FROM project_sessions WHERE session_uuid = ?").all(record!.session_uuid)
        : record!.project_id
          ? db.query(
              `SELECT * FROM project_sessions
               WHERE project_id = ? AND status IN ('active', 'blocked', 'closing')
               ORDER BY created_at DESC LIMIT 2`,
            ).all(record!.project_id)
          : []) as Array<Record<string, unknown>>;
      if (sessions.length !== 1) return null;
      const current = sessions[0]!;
      const projectId = requiredText(current.project_id, "canonical session project_id");
      const sessionUuid = requiredText(current.session_uuid, "canonical session session_uuid");
      if (record!.project_id && projectId !== record!.project_id) {
        throw new Error(
          `Save-point failure spool project mismatch: record ${record!.project_id}, session ${projectId}`,
        );
      }
      const correlationId = requiredText(record!.correlation_id, "correlation_id");
      if (correlationId !== sessionUuid) {
        throw new Error(
          `Save-point failure spool correlation_id must equal session UUID ${sessionUuid}; received ${correlationId}`,
        );
      }
      if (!isSavePointFailureActor(record!.actor)) {
        throw new Error(`session.save_point_failed does not allow actor ${record!.actor}`);
      }
      const anchoredCommit = requiredText(current.head_revision, "canonical session head_revision");
      const causationId = requiredText(record!.causation_id ?? record!.command_id, "causation_id or command_id");
      const traceId = optionalText(current.trace_id) ?? `trace-session-${sessionUuid}`;
      const replayKey = savePointReplayKey(sessionUuid, anchoredCommit, record!.trigger_kind);
      const rootSpanId = replayRootSpanId(record!, sessionUuid, replayKey, causationId);
      const existing = db.query(
        `SELECT event_id FROM project_events
         WHERE event_type = 'session.save_point_failed'
           AND schema_version = 1
           AND project_id = ?
           AND subject_kind = 'session' AND subject_id = ?
           AND correlation_id = ? AND causation_id = ?
           AND trace_id = ? AND parent_span_id = ?
           AND actor = ? AND occurred_at = ?
           AND json_extract(payload_json, '$.replay_key') = ?
         LIMIT 1`,
      ).get(
        projectId,
        sessionUuid,
        correlationId,
        causationId,
        traceId,
        rootSpanId,
        record!.actor,
        record!.occurred_at,
        replayKey,
      ) as { event_id: string } | null;
      if (existing) return existing.event_id;
      const blockers = (() => {
        try {
          const parsed: unknown = JSON.parse(String(current.blockers_json ?? "[]"));
          return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [];
        } catch {
          throw new Error(`Invalid blockers_json for project session ${String(current.session_uuid)}`);
        }
      })();
      const blocker = {
        code: "save_point_failed",
        message: record!.message,
        source_kind: record!.source_kind,
        source_id: record!.source_id,
        recoverable: true,
        severity: "error",
      };
      const nextBlockers = [
        ...blockers.filter((existingBlocker) =>
          existingBlocker.code !== blocker.code ||
          existingBlocker.source_kind !== blocker.source_kind ||
          existingBlocker.source_id !== blocker.source_id),
        blocker,
      ];
      const event = appendProjectEvent(db, {
        actor: record!.actor,
        causationId,
        correlationId,
        eventType: "session.save_point_failed",
        occurredAt: record!.occurred_at,
        payload: {
          anchored_commit: anchoredCommit,
          trigger_kind: record!.trigger_kind,
          failed_or_missing_artifact_classes: [record!.source_kind],
          blocker_code: "save_point_failed",
          staleness_flag_raised: true,
          replay_key: replayKey,
          replayed_from_spool: true,
        },
        projectId,
        ...eventSpan(rootSpanId),
        subjectKind: "session",
        subjectId: sessionUuid,
        traceId,
      });
      const updated = db.query(
        `UPDATE project_sessions
         SET blockers_json = ?, save_point_stale = 1, revision = revision + 1,
             caused_by_event_id = ?, updated_at = ?
         WHERE session_uuid = ? AND revision = ?`,
      ).run(
        JSON.stringify(nextBlockers),
        event.eventId,
        record!.occurred_at,
        sessionUuid,
        Number(current.revision),
      );
      if (updated.changes !== 1) {
        throw new Error(`Stale project session revision during save-point spool replay: ${sessionUuid}`);
      }
      return event.eventId;
    });
    const eventId = replay.immediate();
    if (!eventId) continue;
    writeReplayed(path, record, eventId, replayedAt);
    replayedCount += 1;
  }
  return replayedCount;
}
