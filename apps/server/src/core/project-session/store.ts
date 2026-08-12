import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  createProjectSessionRecord,
  defaultKernelTraceState,
  normalizeCompleteState,
  normalizeKernelTraceState,
  normalizePreparingState,
  normalizePrState,
  normalizeProcessState,
  normalizeRunningState,
  projectSessionView,
} from "./state.js";
import type {
  CreateProjectSessionInput,
  ProjectSessionPatch,
  ProjectSessionRecord,
  ProjectSessionTelemetryPatch,
  ProjectSessionTransitionInput,
  ProjectSessionView,
} from "./types.js";
import { newProjectSessionId, newProjectSessionUuid } from "./identity.js";
import { createOrchestratorStateOrm, immediateTransaction, now as currentTime } from "@server/core/orchestrator-state";
import { projectSessions, type ProjectSessionRow } from "@server/core/orchestrator-state/storage/schema";
import { appendProjectEvent } from "@server/core/project-state/events.js";

type Row = ProjectSessionRow;
type SqlValue = string | number | bigint | boolean | null | Uint8Array;

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseJson(value: unknown): unknown {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function rowToProjectSession(row: Row): ProjectSessionRecord {
  const now = stringValue(row.updatedAt, currentTime());
  const projectId = stringValue(row.projectId);
  const sessionUuid = stringValue(row.sessionUuid);
  return {
    id: row.id,
    project_id: projectId,
    session_uuid: sessionUuid,
    status: row.status,
    phase: row.phase,
    active_run_id: nullableString(row.activeRunId),
    base_ref: nullableString(row.baseRef),
    base_sha: nullableString(row.baseSha),
    revision: Number(row.revision ?? 0),
    head_revision: nullableString(row.headRevision),
    trace_id: nullableString(row.traceId) ?? `trace-session-${sessionUuid}`,
    blockers_json: Array.isArray(parseJson(row.blockersJson))
      ? (parseJson(row.blockersJson) as ProjectSessionRecord["blockers_json"])
      : [],
    save_point_stale: Boolean(row.savePointStale),
    caused_by_event_id: nullableString(row.causedByEventId),
    preparing_state_json: normalizePreparingState(parseJson(row.preparingStateJson), now),
    running_state_json: normalizeRunningState(parseJson(row.runningStateJson)),
    pr_state_json: normalizePrState(parseJson(row.prStateJson)),
    complete_state_json: normalizeCompleteState(parseJson(row.completeStateJson)),
    process_state_json: normalizeProcessState(parseJson(row.processStateJson), projectId, sessionUuid, now),
    kernel_trace_json: normalizeKernelTraceState(parseJson(row.kernelTraceJson), sessionUuid),
    created_at: stringValue(row.createdAt, now),
    updated_at: now,
    completed_at: nullableString(row.completedAt),
    closed_at: nullableString(row.closedAt),
  };
}

export function insertProjectSession(db: Database, record: ProjectSessionRecord): ProjectSessionRecord {
  createOrchestratorStateOrm(db)
    .insert(projectSessions)
    .values({
      id: record.id,
      projectId: record.project_id,
      sessionUuid: record.session_uuid,
      status: record.status,
      phase: record.phase,
      activeRunId: record.active_run_id,
      baseRef: record.base_ref,
      baseSha: record.base_sha,
      revision: record.revision,
      headRevision: record.head_revision,
      traceId: record.trace_id,
      blockersJson: record.blockers_json,
      savePointStale: record.save_point_stale,
      causedByEventId: record.caused_by_event_id,
      preparingStateJson: record.preparing_state_json,
      runningStateJson: record.running_state_json,
      prStateJson: record.pr_state_json,
      completeStateJson: record.complete_state_json,
      processStateJson: record.process_state_json ?? {},
      kernelTraceJson: record.kernel_trace_json ?? defaultKernelTraceState(record.session_uuid),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      completedAt: record.completed_at,
      closedAt: record.closed_at,
    })
    .run();
  return record;
}

export function createProjectSession(db: Database, input: CreateProjectSessionInput): ProjectSessionRecord {
  const at = input.now ?? currentTime();
  const sessionUuid = input.sessionUuid ?? newProjectSessionUuid();
  const id = input.id ?? newProjectSessionId(sessionUuid);
  const record = createProjectSessionRecord({
    ...input,
    id,
    now: at,
    sessionUuid,
  });
  return immediateTransaction(db, () => {
    const opened = appendProjectEvent(db, {
      eventType: "session.opened",
      projectId: record.project_id,
      subjectKind: "session",
      subjectId: record.session_uuid,
      correlationId: input.correlationId ?? input.openingSyncId ?? input.activeRunId ?? record.session_uuid,
      causationId: input.commandId ?? `command-session-open-${record.session_uuid}`,
      traceId: record.trace_id,
      spanId: input.spanId ?? `span-${randomUUID()}`,
      actor: input.actor ?? "operator",
      occurredAt: at,
      payload: {
        baseline_revision: record.base_sha,
        worktree_identity:
          input.worktreeIdentity ?? `project-session:${record.project_id}:${record.session_uuid}`,
        opening_sync_id: input.openingSyncId ?? null,
      },
    });
    return insertProjectSession(db, { ...record, caused_by_event_id: opened.eventId });
  });
}

export function getProjectSessionById(db: Database, id: string): ProjectSessionRecord | null {
  const row = createOrchestratorStateOrm(db).select().from(projectSessions).where(eq(projectSessions.id, id)).get();
  return row ? rowToProjectSession(row) : null;
}

export function getProjectSessionByUuid(db: Database, sessionUuid: string): ProjectSessionRecord | null {
  const row = createOrchestratorStateOrm(db).select().from(projectSessions).where(eq(projectSessions.sessionUuid, sessionUuid)).get();
  return row ? rowToProjectSession(row) : null;
}

export function getActiveProjectSession(db: Database, projectId: string): ProjectSessionRecord | null {
  const row = createOrchestratorStateOrm(db)
    .select()
    .from(projectSessions)
    .where(and(eq(projectSessions.projectId, projectId), inArray(projectSessions.status, ["active", "blocked", "closing"])))
    .orderBy(desc(projectSessions.createdAt))
    .limit(1)
    .get();
  return row ? rowToProjectSession(row) : null;
}

export function getOrCreateActiveProjectSession(db: Database, input: CreateProjectSessionInput): ProjectSessionRecord {
  const active = getActiveProjectSession(db, input.projectId);
  if (active) return active;
  return createProjectSession(db, input);
}

export function listProjectSessions(db: Database, projectId: string, limit = 20): ProjectSessionRecord[] {
  return createOrchestratorStateOrm(db)
    .select()
    .from(projectSessions)
    .where(eq(projectSessions.projectId, projectId))
    .orderBy(desc(projectSessions.createdAt))
    .limit(Math.max(1, Math.trunc(limit)))
    .all()
    .map(rowToProjectSession);
}

function patchedProjectSession(
  current: ProjectSessionRecord,
  patch: ProjectSessionPatch,
  at: string,
): ProjectSessionRecord {
  const next: ProjectSessionRecord = {
    ...current,
    status: patch.status ?? current.status,
    phase: patch.phase ?? current.phase,
    active_run_id: patch.active_run_id === undefined ? current.active_run_id : patch.active_run_id,
    base_ref: patch.base_ref === undefined ? current.base_ref : patch.base_ref,
    base_sha: patch.base_sha === undefined ? current.base_sha : patch.base_sha,
    head_revision: patch.head_revision === undefined ? current.head_revision : patch.head_revision,
    trace_id: patch.trace_id ?? current.trace_id,
    blockers_json: patch.blockers_json ?? current.blockers_json,
    save_point_stale: patch.save_point_stale ?? current.save_point_stale,
    caused_by_event_id: patch.caused_by_event_id === undefined ? current.caused_by_event_id : patch.caused_by_event_id,
    preparing_state_json: patch.preparing_state_json ?? current.preparing_state_json,
    running_state_json: patch.running_state_json ?? current.running_state_json,
    pr_state_json: patch.pr_state_json ?? current.pr_state_json,
    complete_state_json: patch.complete_state_json ?? current.complete_state_json,
    process_state_json: patch.process_state_json === undefined ? current.process_state_json : patch.process_state_json,
    kernel_trace_json: patch.kernel_trace_json === undefined ? current.kernel_trace_json : patch.kernel_trace_json,
    completed_at: patch.completed_at === undefined ? current.completed_at : patch.completed_at,
    closed_at: patch.closed_at === undefined ? current.closed_at : patch.closed_at,
    updated_at: at,
  };
  return next;
}

/**
 * Accepts one durable session transition. The semantic event and revision-CAS
 * update share the caller-visible transaction and therefore succeed or roll
 * back as one fact.
 */
export function transitionProjectSession(
  db: Database,
  id: string,
  input: ProjectSessionTransitionInput,
): ProjectSessionRecord {
  return immediateTransaction(db, () => {
    const current = getProjectSessionById(db, id);
    if (!current) throw new Error(`Project session not found: ${id}`);
    if (current.revision !== input.expectedRevision) {
      throw new Error(`Stale project session revision ${input.expectedRevision} for ${current.session_uuid}`);
    }
    if (input.projectId && input.projectId !== current.project_id) {
      throw new Error(`Project session ${current.session_uuid} does not belong to ${input.projectId}`);
    }
    if (input.sessionUuid && input.sessionUuid !== current.session_uuid) {
      throw new Error(`Project session UUID mismatch: ${input.sessionUuid}`);
    }
    const at = input.occurredAt ?? currentTime();
    const event = appendProjectEvent(db, {
      eventType: input.eventType,
      projectId: current.project_id,
      subjectKind: "session",
      subjectId: current.session_uuid,
      correlationId: input.correlationId ?? current.active_run_id ?? current.session_uuid,
      causationId: input.commandId,
      traceId: current.trace_id,
      spanId: input.spanId ?? `span-${randomUUID()}`,
      actor: input.actor,
      occurredAt: at,
      payload: input.payload,
    });
    const next = patchedProjectSession(current, input.patch, at);

    const result = db
      .query(
        `UPDATE project_sessions
         SET status = ?, phase = ?, active_run_id = ?, base_ref = ?, base_sha = ?,
             head_revision = ?, trace_id = ?, blockers_json = ?, save_point_stale = ?,
             revision = ?, caused_by_event_id = ?, preparing_state_json = ?,
             running_state_json = ?, pr_state_json = ?, complete_state_json = ?,
             process_state_json = ?, kernel_trace_json = ?, updated_at = ?,
             completed_at = ?, closed_at = ?
         WHERE id = ? AND revision = ?`,
      )
      .run(
        next.status,
        next.phase,
        next.active_run_id,
        next.base_ref,
        next.base_sha,
        next.head_revision,
        next.trace_id,
        JSON.stringify(next.blockers_json),
        next.save_point_stale ? 1 : 0,
        current.revision + 1,
        event.eventId,
        JSON.stringify(next.preparing_state_json),
        JSON.stringify(next.running_state_json),
        JSON.stringify(next.pr_state_json),
        JSON.stringify(next.complete_state_json),
        JSON.stringify(next.process_state_json ?? {}),
        JSON.stringify(next.kernel_trace_json ?? defaultKernelTraceState(next.session_uuid)),
        next.updated_at,
        next.completed_at,
        next.closed_at,
        next.id,
        current.revision,
      );
    if (result.changes !== 1) {
      throw new Error(`Stale project session revision ${current.revision} for ${current.session_uuid}`);
    }
    const saved = getProjectSessionById(db, id);
    if (!saved) throw new Error(`Project session disappeared after transition: ${id}`);
    return saved;
  });
}

/** Telemetry mirrors do not advance the durable session lifecycle revision. */
export function updateProjectSession(
  db: Database,
  id: string,
  patch: ProjectSessionTelemetryPatch,
  at = currentTime(),
): ProjectSessionRecord {
  const invalid = Object.keys(patch).filter(
    (key) => key !== "process_state_json" && key !== "kernel_trace_json",
  );
  if (invalid.length > 0) {
    throw new Error(`Project session lifecycle fields require transitionProjectSession: ${invalid.join(", ")}`);
  }
  return immediateTransaction(db, () => {
    const current = getProjectSessionById(db, id);
    if (!current) throw new Error(`Project session not found: ${id}`);
    createOrchestratorStateOrm(db)
      .update(projectSessions)
      .set({
        processStateJson:
          patch.process_state_json === undefined
            ? (current.process_state_json ?? {})
            : (patch.process_state_json ?? {}),
        kernelTraceJson:
          patch.kernel_trace_json === undefined
            ? (current.kernel_trace_json ?? defaultKernelTraceState(current.session_uuid))
            : (patch.kernel_trace_json ?? defaultKernelTraceState(current.session_uuid)),
        updatedAt: at,
      })
      .where(eq(projectSessions.id, id))
      .run();
    const saved = getProjectSessionById(db, id);
    if (!saved) throw new Error(`Project session disappeared after telemetry update: ${id}`);
    return saved;
  });
}

export function updateProjectSessionWith(
  db: Database,
  id: string,
  updater: (record: ProjectSessionRecord, now: string) => ProjectSessionTelemetryPatch,
  at = currentTime(),
): ProjectSessionRecord {
  const current = getProjectSessionById(db, id);
  if (!current) throw new Error(`Project session not found: ${id}`);
  return updateProjectSession(db, id, updater(current, at), at);
}

export function projectSessionProjection(record: ProjectSessionRecord | null): ProjectSessionView | null {
  return record ? projectSessionView(record) : null;
}

export function activeProjectSessionProjection(db: Database, projectId: string): ProjectSessionView | null {
  return projectSessionProjection(getActiveProjectSession(db, projectId));
}

export function bindProjectSessionProcess(db: Database, sessionId: string, processState: ProjectSessionPatch["process_state_json"]): ProjectSessionRecord {
  return updateProjectSession(db, sessionId, { process_state_json: processState });
}

export function getProjectSessionBySelector(db: Database, selector: { id?: string | null; sessionUuid?: string | null; projectId?: string | null }): ProjectSessionRecord | null {
  if (selector.id) {
    const byId = getProjectSessionById(db, selector.id);
    if (byId) return byId;
  }
  if (selector.sessionUuid) {
    const byUuid = getProjectSessionByUuid(db, selector.sessionUuid);
    if (byUuid) return byUuid;
  }
  if (selector.projectId) return getActiveProjectSession(db, selector.projectId);
  return null;
}

export function assertNoTopLevelSubphase(row: ProjectSessionRecord | Row): void {
  if ("active_subphase" in row || "subphase" in row) {
    throw new Error("Project session storage must not use a top-level canonical subphase");
  }
}

export function sqlBindings(values: SqlValue[]): SqlValue[] {
  return values;
}
