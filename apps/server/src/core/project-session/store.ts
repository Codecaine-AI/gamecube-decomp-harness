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
  ProjectSessionKernelTracePatch,
  ProjectSessionPatch,
  ProjectSessionPayloadByEvent,
  ProjectSessionRecord,
  ProjectSessionDerivedStatusTransitionEventType,
  ProjectSessionDerivedStatusTransitionInput,
  ProjectSessionStatus,
  ProjectSessionStatusPreservingEventType,
  ProjectSessionStatusPreservingTransitionInput,
  ProjectSessionTelemetryPatch,
  ProjectSessionTransitionInput,
  ProjectSessionTransitionEventType,
  ProjectSessionView,
} from "./types.js";
import { newProjectSessionId, newProjectSessionUuid } from "./identity.js";
import { createOrchestratorStateOrm, immediateTransaction, now as currentTime } from "@server/core/orchestrator-state";
import { projectSessions, type ProjectSessionRow } from "@server/core/orchestrator-state/storage/schema";
import {
  appendProjectEvent,
  eventSpan,
  newSpanId,
  type JsonObject,
} from "@server/core/project-state/events.js";

type Row = ProjectSessionRow;
type SqlValue = string | number | bigint | boolean | null | Uint8Array;

type ProjectSessionTransitionRule =
  | { destination: "preserve" }
  | { destination: ProjectSessionStatus; entryOnly?: boolean };

const PROJECT_SESSION_TRANSITION_RULES = {
  "session.preparing_subphase_updated": { destination: "preserve" },
  "session.preparing_completed": { destination: "preserve" },
  "session.running_started": { destination: "preserve" },
  "session.running_subphase_updated": { destination: "preserve" },
  "session.running_stopped": { destination: "preserve" },
  "session.pr_entered": { destination: "preserve" },
  "session.pr_final_build_completed": { destination: "preserve" },
  "session.pr_subphase_updated": { destination: "preserve" },
  "session.pr_completed": { destination: "preserve" },
  "session.running_unblocked": { destination: "active", entryOnly: true },
  "session.blocked": { destination: "blocked", entryOnly: true },
  "session.blockers_updated": { destination: "preserve" },
  "session.complete": { destination: "complete", entryOnly: true },
  "session.closing": { destination: "closing", entryOnly: true },
  "session.closed": { destination: "closed", entryOnly: true },
} as const satisfies Readonly<Record<ProjectSessionTransitionEventType, ProjectSessionTransitionRule>>;

const PROJECT_SESSION_STATUS_TRANSITIONS = {
  active: ["blocked", "complete", "closing"],
  blocked: ["active", "closing"],
  complete: ["closing"],
  closing: ["closed"],
  closed: [],
} as const satisfies Readonly<Record<ProjectSessionStatus, readonly ProjectSessionStatus[]>>;

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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mergeJsonObjects(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const currentValue = merged[key];
    merged[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      currentValue &&
      typeof currentValue === "object" &&
      !Array.isArray(currentValue)
        ? mergeJsonObjects(
            currentValue as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
  }
  return merged;
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
  if (!input.actor) throw new Error("Session creation requires an explicit actor");
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
    const actionSpanId = input.spanId ?? newSpanId();
    const opened = appendProjectEvent(db, {
      eventType: "session.opened",
      projectId: record.project_id,
      subjectKind: "session",
      subjectId: record.session_uuid,
      correlationId: record.session_uuid,
      causationId: input.commandId ?? `command-session-open-${record.session_uuid}`,
      traceId: record.trace_id,
      ...eventSpan(actionSpanId),
      actor: input.actor,
      occurredAt: at,
      payload: {
        baseline_revision: record.base_sha,
        initial_head_revision: record.head_revision,
        worktree_identity:
          input.worktreeIdentity ?? `project-session:${record.project_id}:${record.session_uuid}`,
        opening_sync_id: input.openingSyncId ?? null,
        state_revision: record.revision,
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

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function requiredBlockerString(
  blocker: ProjectSessionRecord["blockers_json"][number],
  index: number,
  field: "code" | "source_kind" | "source_id",
): string {
  const value = typeof blocker[field] === "string" ? blocker[field].trim() : "";
  if (!value) throw new Error(`blockers[${index}] must include ${field}`);
  return value;
}

function blockerPayloadFacts(
  blockers: ProjectSessionRecord["blockers_json"],
): {
  blocker_codes: string[];
  recovery_choices: string[];
  source_identities: Array<{ source_kind: string; source_id: string }>;
} {
  if (blockers.length === 0) {
    throw new Error("A blocked session transition requires at least one blocker");
  }
  const blockerCodes: string[] = [];
  const recoveryChoices: string[] = [];
  const identities = new Map<
    string,
    { source_kind: string; source_id: string }
  >();
  blockers.forEach((blocker, index) => {
    const code = requiredBlockerString(blocker, index, "code");
    const sourceKind = requiredBlockerString(blocker, index, "source_kind");
    const sourceId = requiredBlockerString(blocker, index, "source_id");
    if (!Array.isArray(blocker.recovery_choices)) {
      throw new Error(`blockers[${index}] must include explicit recovery_choices`);
    }
    const choices = blocker.recovery_choices.map((choice, choiceIndex) => {
      const normalized = typeof choice === "string" ? choice.trim() : "";
      if (!normalized) {
        throw new Error(
          `blockers[${index}].recovery_choices[${choiceIndex}] must be a nonblank string`,
        );
      }
      return normalized;
    });
    blockerCodes.push(code);
    recoveryChoices.push(...choices);
    identities.set(`${sourceKind}\0${sourceId}`, {
      source_kind: sourceKind,
      source_id: sourceId,
    });
  });
  return {
    blocker_codes: uniqueStrings(blockerCodes),
    recovery_choices: uniqueStrings(recoveryChoices),
    source_identities: [...identities.values()],
  };
}

function assertProjectSessionTransitionCompatibility(
  current: ProjectSessionRecord,
  input: ProjectSessionTransitionInput<string>,
): void {
  const rule = (
    PROJECT_SESSION_TRANSITION_RULES as Readonly<
      Record<string, ProjectSessionTransitionRule | undefined>
    >
  )[input.eventType];
  if (!rule) {
    throw new Error(`Unsupported project session transition event: ${input.eventType}`);
  }

  const nextStatus = input.patch.status ?? current.status;
  if (rule.destination === "preserve") {
    if (input.patch.status !== undefined) {
      throw new Error(`${input.eventType} must preserve project session status`);
    }
    if (input.eventType === "session.blockers_updated") {
      const blockersChanged =
        JSON.stringify(input.patch.blockers_json ?? current.blockers_json) !==
        JSON.stringify(current.blockers_json);
      if (current.status !== "blocked" || !blockersChanged) {
        throw new Error(
          "session.blockers_updated requires changed blockers while remaining blocked",
        );
      }
    }
    if (
      input.eventType === "session.pr_entered" &&
      (current.status !== "active" || current.phase === "pr" || input.patch.phase !== "pr")
    ) {
      throw new Error(
        "session.pr_entered requires an active session transitioning to phase pr",
      );
    }
    return;
  }
  if (nextStatus !== rule.destination) {
    throw new Error(
      `${input.eventType} requires destination status ${rule.destination}; received ${nextStatus}`,
    );
  }
  if (rule.entryOnly && current.status === rule.destination) {
    throw new Error(`${input.eventType} is valid only on entry to ${rule.destination}`);
  }
  if (
    current.status !== nextStatus &&
    !(PROJECT_SESSION_STATUS_TRANSITIONS[current.status] as readonly ProjectSessionStatus[])
      .includes(nextStatus)
  ) {
    throw new Error(
      `Invalid project session status transition ${current.status} -> ${nextStatus}`,
    );
  }
}

function projectSessionTransitionPayload(
  current: ProjectSessionRecord,
  input: ProjectSessionTransitionInput<string>,
): JsonObject {
  if (input.eventType === "session.blocked") {
    const facts = blockerPayloadFacts(
      input.patch.blockers_json ?? current.blockers_json,
    );
    return {
      from_status: current.status,
      to_status: "blocked",
      prior_status: current.status,
      ...facts,
      state_revision: current.revision + 1,
    };
  }
  if (input.eventType === "session.blockers_updated") {
    const facts = blockerPayloadFacts(
      input.patch.blockers_json ?? current.blockers_json,
    );
    const previousCodes = uniqueStrings(
      current.blockers_json.map((blocker) => blocker.code),
    );
    const previousCodeSet = new Set(previousCodes);
    const nextCodeSet = new Set(facts.blocker_codes);
    return {
      added_blocker_codes: facts.blocker_codes.filter(
        (code) => !previousCodeSet.has(code),
      ),
      removed_blocker_codes: previousCodes.filter(
        (code) => !nextCodeSet.has(code),
      ),
      ...facts,
      state_revision: current.revision + 1,
    };
  }
  if (input.eventType === "session.running_unblocked") {
    return { from_status: current.status, to_status: "active" };
  }
  if (input.eventType === "session.complete") {
    return { from_status: current.status, to_status: "complete" };
  }
  if (input.eventType === "session.closing") {
    return { from_status: current.status, to_status: "closing" };
  }
  if (input.eventType === "session.closed") {
    const supplied = requireSessionClosedPayload(input.payload);
    return {
      final_head: input.patch.head_revision ?? current.head_revision,
      shipped_and_unshipped_work_summary:
        supplied.shipped_and_unshipped_work_summary,
      final_save_point_id: supplied.final_save_point_id,
      closing_operator: input.actor,
      state_revision: current.revision + 1,
    };
  }
  return {
    ...(input.payload ?? {}),
    previous_phase: current.phase,
    previous_status: current.status,
    phase: input.patch.phase ?? current.phase,
    status: input.patch.status ?? current.status,
  };
}

function isJsonObject(value: JsonObject[string] | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireSessionClosedPayload(
  payload: JsonObject | undefined,
): Pick<
  ProjectSessionPayloadByEvent["session.closed"],
  "final_save_point_id" | "shipped_and_unshipped_work_summary"
> {
  const summary = payload?.shipped_and_unshipped_work_summary;
  const finalSavePointId = payload?.final_save_point_id;
  if (
    !isJsonObject(summary) ||
    typeof summary.ahead_of_base !== "number" ||
    typeof summary.worktree_dirty_beyond_head !== "boolean" ||
    (finalSavePointId !== null && typeof finalSavePointId !== "string")
  ) {
    throw new Error("session.closed requires explicit closeout facts");
  }
  return {
    final_save_point_id: finalSavePointId,
    shipped_and_unshipped_work_summary: {
      ahead_of_base: summary.ahead_of_base,
      worktree_dirty_beyond_head: summary.worktree_dirty_beyond_head,
    },
  };
}

/**
 * Accepts one durable session transition. The semantic event and revision-CAS
 * update share the caller-visible transaction and therefore succeed or roll
 * back as one fact.
 */
export function transitionProjectSession<
  const TEvent extends ProjectSessionStatusPreservingEventType,
>(
  db: Database,
  id: string,
  input: ProjectSessionStatusPreservingTransitionInput<TEvent>,
): ProjectSessionRecord;
export function transitionProjectSession<
  const TEvent extends ProjectSessionDerivedStatusTransitionEventType,
>(
  db: Database,
  id: string,
  input: ProjectSessionDerivedStatusTransitionInput<TEvent>,
): ProjectSessionRecord;
export function transitionProjectSession<
  const TEvent extends ProjectSessionTransitionEventType,
>(
  db: Database,
  id: string,
  input: ProjectSessionTransitionInput<TEvent>,
): ProjectSessionRecord;
export function transitionProjectSession(
  db: Database,
  id: string,
  input: ProjectSessionTransitionInput<string>,
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
    if (input.correlationId !== current.session_uuid) {
      throw new Error(`Session event correlation_id must equal session UUID ${current.session_uuid}`);
    }
    assertProjectSessionTransitionCompatibility(current, input);
    const actionSpanId = input.spanId ?? newSpanId();
    const payload = projectSessionTransitionPayload(current, input);
    const event = appendProjectEvent(db, {
      eventType: input.eventType,
      projectId: current.project_id,
      subjectKind: "session",
      subjectId: current.session_uuid,
      correlationId: current.session_uuid,
      causationId: input.causationId ?? input.commandId,
      traceId: current.trace_id,
      ...eventSpan(actionSpanId),
      actor: input.actor,
      occurredAt: at,
      payload,
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
  return immediateTransaction(db, () => {
    const current = getProjectSessionById(db, id);
    if (!current) throw new Error(`Project session not found: ${id}`);
    return updateProjectSession(db, id, updater(current, at), at);
  });
}

/**
 * Losslessly merges kernel telemetry under an immediate lock. The linkage
 * cursor is replaced atomically while unrelated nested metadata survives.
 */
export function mergeProjectSessionKernelTrace(
  db: Database,
  id: string,
  patch: ProjectSessionKernelTracePatch,
  at = currentTime(),
): ProjectSessionRecord {
  return immediateTransaction(db, () => {
    const current = getProjectSessionById(db, id);
    if (!current) throw new Error(`Project session not found: ${id}`);
    const currentTrace = objectValue(
      current.kernel_trace_json ?? defaultKernelTraceState(current.session_uuid),
    );
    const patchObject = objectValue(patch);
    const merged = mergeJsonObjects(currentTrace, patchObject);
    if (Object.prototype.hasOwnProperty.call(patchObject, "last_linkage_cursor")) {
      merged.last_linkage_cursor = patch.last_linkage_cursor ?? null;
    }
    const kernelTrace = normalizeKernelTraceState(
      {
        ...merged,
        session_uuid: current.session_uuid,
      },
      current.session_uuid,
    );
    createOrchestratorStateOrm(db)
      .update(projectSessions)
      .set({ kernelTraceJson: kernelTrace, updatedAt: at })
      .where(eq(projectSessions.id, id))
      .run();
    const saved = getProjectSessionById(db, id);
    if (!saved) {
      throw new Error(`Project session disappeared after kernel trace merge: ${id}`);
    }
    return saved;
  });
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
