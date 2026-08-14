import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { casRunEnvelope, immediateTransaction, now as currentTime, openState, type StateStore } from "@server/core/orchestrator-state";
import { appendProjectEvent, eventSpan, newSpanId, type JsonObject } from "@server/core/project-state/events.js";
import { quietGit } from "@server/core/session-runtime/phases/pr/pr-sync.js";
import { getProjectSessionByUuid } from "./store.js";
import { listSavePointFailureSpool, spoolSavePointFailure, type SavePointFailureSpoolRecord } from "./save-point-failure-spool.js";
import type {
  CloseProjectSessionDecision,
  CloseProjectSessionBlocked,
  CloseProjectSessionInput,
  ProjectSessionBlocker,
  ProjectSessionRecord,
  RecordEpochCompletedInput,
  RecordRemoteApplicationInput,
  RecordSavePointAnchorInput,
  RecordSavePointFailureInput,
  SessionTimelineEntry,
} from "./types.js";

type SessionEnvelopeRow = {
  id: string;
  project_id: string;
  session_uuid: string;
  status: string;
  active_run_id: string | null;
  revision: number;
  head_revision: string | null;
  trace_id: string | null;
  blockers_json: string;
  save_point_stale: number | boolean;
};

type EpochBoundaryRunRow = {
  id: string;
  project_id: string | null;
  project_repo_root: string | null;
  session_uuid: string | null;
  revision: number;
  trace_id: string | null;
};

type RemoteApplicationRunRow = EpochBoundaryRunRow & {
  remote_application_ids_json: string;
  trace_id: string | null;
};

type BoundaryEventRow = {
  event_id: string;
  event_type: string;
  project_id: string;
  subject_kind: string;
  subject_id: string;
  correlation_id: string;
  trace_id: string;
};

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function verifyRunCommitExists(run: EpochBoundaryRunRow, commitSha: string): void {
  const repoRoot = run.project_repo_root?.trim();
  const runId = run.id;
  if (!repoRoot) throw new Error(`Run ${runId} has no project repository for commit verification`);
  const result = quietGit(repoRoot, ["cat-file", "-e", `${commitSha}^{commit}`]);
  if (result.exitCode !== 0) {
    throw new Error(`Epoch integration commit ${commitSha} does not exist in the repository for run ${runId}`);
  }
}

function verifyRemoteApplicationCommit(repoRoot: string | null | undefined, commitSha: string): void {
  const normalizedRoot = repoRoot?.trim();
  if (!normalizedRoot) throw new Error("repositoryRoot is required for remote-application commit verification");
  const result = quietGit(normalizedRoot, ["cat-file", "-e", `${commitSha}^{commit}`]);
  if (result.exitCode !== 0) {
    throw new Error(`Remote-application commit ${commitSha} does not exist in ${normalizedRoot}`);
  }
}

function stringListJson(value: string, label: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid ${label}`, { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`Invalid ${label}`);
  }
  return parsed;
}

/** Resolve an epoch boundary through its run before any durable write occurs. */
function resolveEpochBoundary(
  db: Database,
  input: Pick<RecordEpochCompletedInput, "projectId" | "runId" | "sessionUuid">,
): { run: EpochBoundaryRunRow; session: SessionEnvelopeRow } {
  const run = db
    .query(
      `SELECT id, project_id, project_repo_root, session_uuid, revision
              , trace_id
       FROM runs
       WHERE id = ?`,
    )
    .get(input.runId) as EpochBoundaryRunRow | null;
  if (!run) throw new Error(`Run ${input.runId} does not exist for epoch integration`);
  if (!run.project_id) throw new Error(`Run ${run.id} has no project id for epoch integration`);

  let sessions: SessionEnvelopeRow[];
  if (run.session_uuid) {
    sessions = db
      .query("SELECT * FROM project_sessions WHERE session_uuid = ?")
      .all(run.session_uuid) as SessionEnvelopeRow[];
  } else {
    sessions = db
      .query(
        `SELECT * FROM project_sessions
         WHERE active_run_id = ? AND status IN ('active', 'blocked', 'closing')
         ORDER BY created_at DESC LIMIT 2`,
      )
      .all(run.id) as SessionEnvelopeRow[];
  }
  if (sessions.length !== 1) {
    throw new Error(
      `Run ${run.id} must resolve to exactly one project session; found ${sessions.length}`,
    );
  }
  const session = sessions[0]!;
  if (session.active_run_id !== run.id) {
    throw new Error(
      `Run/session mismatch for epoch integration: session ${session.session_uuid} names active run ${session.active_run_id ?? "none"}, not ${run.id}`,
    );
  }
  if (session.project_id !== run.project_id) {
    throw new Error(
      `Run/session project mismatch for epoch integration: run ${run.id} belongs to ${run.project_id}, session ${session.session_uuid} belongs to ${session.project_id}`,
    );
  }
  if (input.projectId && input.projectId !== run.project_id) {
    throw new Error(`Run ${run.id} does not belong to requested project ${input.projectId}`);
  }
  if (input.sessionUuid && input.sessionUuid !== session.session_uuid) {
    throw new Error(`Run ${run.id} does not belong to requested session ${input.sessionUuid}`);
  }
  if (session.status !== "active" && session.status !== "blocked") {
    throw new Error(`Project session ${session.session_uuid} cannot accept an epoch while ${session.status}`);
  }
  return { run, session };
}

function parseBlockers(value: string): ProjectSessionBlocker[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ProjectSessionBlocker[]) : [];
  } catch (error) {
    throw new Error("Invalid blockers_json in project_sessions", { cause: error });
  }
}

const CLOSE_SESSION_RECOVERY_CHOICE_BY_BLOCKER = {
  dispatch_lease_held: "release_dispatch",
  unshipped_work: "record_save_point",
} as const satisfies Record<CloseProjectSessionBlocked["blockers"][number]["code"], string>;

function closeSessionSourceIdentities(
  blockers: CloseProjectSessionBlocked["blockers"],
): Array<{ source_kind: string; source_id: string }> {
  return blockers.map((blocker) => ({
    source_kind: blocker.source_kind,
    source_id: blocker.source_id,
  }));
}

function closeSessionRecoveryChoices(blockers: CloseProjectSessionBlocked["blockers"]): string[] {
  return [...new Set(
    blockers
      .filter((blocker) => blocker.recoverable)
      .map((blocker) => CLOSE_SESSION_RECOVERY_CHOICE_BY_BLOCKER[blocker.code]),
  )];
}

function savePointReplayKey(sessionUuid: string, anchoredCommit: string, triggerKind: string): string {
  const digest = createHash("sha256")
    .update(`${sessionUuid}\0${anchoredCommit}\0${triggerKind}`)
    .digest("hex")
    .slice(0, 24);
  return `save-point-${digest}`;
}

function latestSavePointFailureEventId(db: Database, sessionUuid: string): string | null {
  const row = db
    .query(
      `SELECT event_id
       FROM project_events
       WHERE event_type = 'session.save_point_failed'
         AND subject_kind = 'session'
         AND subject_id = ?
       ORDER BY sequence DESC
       LIMIT 1`,
    )
    .get(sessionUuid) as { event_id: string } | null;
  return row?.event_id ?? null;
}

function selectSession(
  db: Database,
  selector: { projectId?: string; sessionUuid?: string },
): SessionEnvelopeRow {
  const rows = (selector.sessionUuid
    ? db.query("SELECT * FROM project_sessions WHERE session_uuid = ?").all(selector.sessionUuid)
    : selector.projectId
      ? db
          .query(
            `SELECT * FROM project_sessions
             WHERE project_id = ? AND status IN ('active', 'blocked', 'closing')
             ORDER BY created_at DESC LIMIT 2`,
          )
          .all(selector.projectId)
      : db
          .query(
            `SELECT * FROM project_sessions
             WHERE status IN ('active', 'blocked', 'closing')
             ORDER BY created_at DESC LIMIT 2`,
          )
          .all()) as SessionEnvelopeRow[];
  if (rows.length === 0) throw new Error("No project session matches the requested transition");
  if (rows.length > 1) throw new Error("Project id or session UUID is required when multiple sessions are active");
  const session = rows[0]!;
  if (selector.projectId && session.project_id !== selector.projectId) {
    throw new Error(`Project session ${session.session_uuid} does not belong to ${selector.projectId}`);
  }
  return session;
}

function eventContext(
  session: SessionEnvelopeRow,
  input: {
    commandId: string;
    causationId?: string;
    actor: RecordEpochCompletedInput["actor"];
    correlationId: string;
    spanId?: string;
    occurredAt?: string;
  },
  correlationId: string,
) {
  if (input.correlationId !== correlationId) {
    throw new Error(`Event correlation_id must equal workflow identity ${correlationId}`);
  }
  return {
    actor: input.actor,
    causationId: input.causationId
      ? requiredText(input.causationId, "causationId")
      : requiredText(input.commandId, "commandId"),
    correlationId,
    occurredAt: input.occurredAt ?? currentTime(),
    projectId: session.project_id,
    ...eventSpan(input.spanId ?? newSpanId()),
    traceId: session.trace_id ?? `trace-session-${session.session_uuid}`,
  } as const;
}

function insertTimelineEntry(
  db: Database,
  input: {
    sessionUuid: string;
    entryKind: SessionTimelineEntry["entry_kind"];
    entryId: string;
    occurredAt: string;
    payload: JsonObject;
    eventId: string;
  },
): SessionTimelineEntry {
  const result = db
    .query(
      `INSERT INTO session_timeline_entries (
         session_uuid, entry_kind, entry_id, occurred_at, payload_json, caused_by_event_id
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.sessionUuid,
      input.entryKind,
      input.entryId,
      input.occurredAt,
      JSON.stringify(input.payload),
      input.eventId,
    );
  return {
    id: Number(result.lastInsertRowid),
    session_uuid: input.sessionUuid,
    entry_kind: input.entryKind,
    entry_id: input.entryId,
    occurred_at: input.occurredAt,
    payload: input.payload,
    caused_by_event_id: input.eventId,
  };
}

function updateEnvelope(
  db: Database,
  session: SessionEnvelopeRow,
  eventId: string,
  occurredAt: string,
  setSql: string,
  bindings: Array<number | string | null>,
): void {
  const result = db
    .query(
      `UPDATE project_sessions
       SET ${setSql}, revision = ?, caused_by_event_id = ?, updated_at = ?
       WHERE session_uuid = ? AND revision = ?`,
    )
    .run(...bindings, session.revision + 1, eventId, occurredAt, session.session_uuid, session.revision);
  if (result.changes !== 1) {
    throw new Error(`Stale project session revision ${session.revision} for ${session.session_uuid}`);
  }
}

/**
 * Records the durable epoch boundary while the caller's SQLite transaction is
 * still open. The caller must invoke this only after the integration commit is
 * known to exist and in the same transaction that accepts the epoch result.
 */
export function recordEpochCompletedInTransaction(
  db: Database,
  input: RecordEpochCompletedInput,
): SessionTimelineEntry {
  const integrationCommit = requiredText(input.integrationCommit, "integrationCommit");
  const epochId = requiredText(input.epochId, "epochId");
  const runId = requiredText(input.runId, "runId");
  const { run, session } = resolveEpochBoundary(db, { ...input, runId });
  verifyRunCommitExists(run, integrationCommit);
  const context = {
    ...eventContext(session, input, runId),
    traceId: requiredText(run.trace_id ?? "", `Run ${runId} trace_id`),
  };
  const payload: JsonObject = {
    ...(input.payload ?? {}),
    epoch_id: epochId,
    integration_commit: integrationCommit,
    score_delta: input.scoreDelta ?? null,
    new_head: integrationCommit,
  };
  const event = appendProjectEvent(db, {
    ...context,
    eventType: "run.epoch_integrated",
    subjectKind: "run",
    subjectId: runId,
    payload,
  });
  const entry = insertTimelineEntry(db, {
    sessionUuid: session.session_uuid,
    entryKind: "epoch_completed",
    entryId: epochId,
    occurredAt: context.occurredAt,
    payload,
    eventId: event.eventId,
  });
  updateEnvelope(db, session, event.eventId, context.occurredAt, "head_revision = ?", [integrationCommit]);
  const accepted = casRunEnvelope(db, {
    eventId: event.eventId,
    expectedRevision: Number(run.revision),
    headRevision: integrationCommit,
    runId,
  });
  if (!accepted) throw new Error(`Stale run revision ${run.revision} for ${runId}`);
  // This delete is deliberately part of the lineage transaction. A crash
  // cannot leave a completed epoch and a prepare record that startup would
  // try to reconcile a second time.
  db.query("DELETE FROM pending_integrations WHERE run_id = ? AND epoch_id = ?").run(runId, epochId);
  return entry;
}

export function recordEpochCompleted(store: StateStore, input: RecordEpochCompletedInput): SessionTimelineEntry {
  return immediateTransaction(store.db, () => recordEpochCompletedInTransaction(store.db, input));
}

/**
 * Records a published remote application inside the caller's publication
 * transaction. The existing sync.boundary_published event advances the
 * session envelope and causes the timeline entry. When a run is attached,
 * this writer appends one run.remote_applied event and uses it for the run CAS.
 */
export function recordRemoteApplicationInTransaction(
  db: Database,
  input: RecordRemoteApplicationInput,
): SessionTimelineEntry {
  if (!db.inTransaction) {
    throw new Error("recordRemoteApplicationInTransaction requires an active transaction");
  }
  const remoteApplicationId = requiredText(input.remoteApplicationId, "remoteApplicationId");
  const boundaryEventId = requiredText(input.boundaryEventId, "boundaryEventId");
  const syncId = requiredText(input.syncId, "syncId");
  const priorHead = requiredText(input.priorHead, "priorHead");
  const newHead = requiredText(input.newHead, "newHead");
  const session = selectSession(db, input);
  if (session.status !== "active" && session.status !== "blocked") {
    throw new Error(`Project session ${session.session_uuid} cannot accept a remote application while ${session.status}`);
  }
  if (session.head_revision !== priorHead) {
    throw new Error(
      `Remote-application prior head mismatch for ${session.session_uuid}: expected ${session.head_revision ?? "none"}, received ${priorHead}`,
    );
  }
  const boundary = db
    .query(
      `SELECT event_id, event_type, project_id, subject_kind, subject_id, correlation_id, trace_id
       FROM project_events WHERE event_id = ?`,
    )
    .get(boundaryEventId) as BoundaryEventRow | null;
  if (!boundary) throw new Error(`Boundary event ${boundaryEventId} does not exist`);
  if (
    boundary.event_type !== "sync.boundary_published" ||
    boundary.project_id !== session.project_id ||
    boundary.subject_kind !== "sync_workflow" ||
    boundary.subject_id !== syncId
  ) {
    throw new Error(`Boundary event ${boundaryEventId} does not match sync ${syncId} for ${session.project_id}`);
  }

  const activeRunId = session.active_run_id;
  if (input.runId !== undefined && input.runId !== activeRunId) {
    throw new Error(
      `Remote-application run mismatch for ${session.session_uuid}: expected ${activeRunId ?? "none"}, received ${input.runId ?? "none"}`,
    );
  }
  const run = activeRunId
    ? (db
        .query(
          `SELECT id, project_id, project_repo_root, session_uuid, revision, remote_application_ids_json, trace_id
           FROM runs WHERE id = ?`,
        )
        .get(activeRunId) as RemoteApplicationRunRow | null)
    : null;
  if (activeRunId && !run) throw new Error(`Active run ${activeRunId} does not exist for remote application`);
  if (run && (run.project_id !== session.project_id || run.session_uuid !== session.session_uuid)) {
    throw new Error(`Run/session mismatch for remote application: ${run.id} does not belong to ${session.session_uuid}`);
  }
  const repositoryRoot = input.repositoryRoot?.trim() || run?.project_repo_root;
  verifyRemoteApplicationCommit(repositoryRoot, newHead);

  const resolvedConflicts = input.resolvedConflicts.map((path) => requiredText(path, "resolved conflict path"));
  const occurredAt = input.occurredAt ?? currentTime();
  const eventPayload: JsonObject = {
    remote_application_id: remoteApplicationId,
    prior_head: priorHead,
    new_head: newHead,
    resolved_conflicts: resolvedConflicts,
    score_delta: input.scoreDelta ?? null,
  };
  const timelinePayload: JsonObject = {
    ...(input.payload ?? {}),
    ...eventPayload,
    sync_id: syncId,
  };
  const entry = insertTimelineEntry(db, {
    sessionUuid: session.session_uuid,
    entryKind: "remote_application",
    entryId: remoteApplicationId,
    occurredAt,
    payload: timelinePayload,
    eventId: boundaryEventId,
  });
  updateEnvelope(db, session, boundaryEventId, occurredAt, "head_revision = ?, save_point_stale = 1", [newHead]);

  if (run) {
    const remoteApplicationIds = stringListJson(
      run.remote_application_ids_json,
      `remote_application_ids_json for run ${run.id}`,
    );
    if (remoteApplicationIds.includes(remoteApplicationId)) {
      throw new Error(`Run ${run.id} already references remote application ${remoteApplicationId}`);
    }
    const runEvent = appendProjectEvent(db, {
      actor: input.actor,
      causationId: boundaryEventId,
      correlationId: run.id,
      eventType: "run.remote_applied",
      occurredAt,
      payload: eventPayload,
      projectId: session.project_id,
      ...eventSpan(input.spanId ?? newSpanId()),
      subjectId: run.id,
      subjectKind: "run",
      traceId: run.trace_id?.trim() || session.trace_id || boundary.trace_id,
    });
    const accepted = casRunEnvelope(db, {
      eventId: runEvent.eventId,
      expectedRevision: Number(run.revision),
      headRevision: newHead,
      remoteApplicationIdsJson: JSON.stringify([...remoteApplicationIds, remoteApplicationId]),
      runId: run.id,
    });
    if (!accepted) throw new Error(`Stale run revision ${run.revision} for ${run.id}`);
  }
  return entry;
}

export function recordRemoteApplication(
  store: StateStore,
  input: RecordRemoteApplicationInput,
): SessionTimelineEntry {
  return immediateTransaction(store.db, () => recordRemoteApplicationInTransaction(store.db, input));
}

export function recordSavePointAnchor(
  store: StateStore,
  input: RecordSavePointAnchorInput,
): SessionTimelineEntry {
  return immediateTransaction(store.db, () => {
    const commitSha = requiredText(input.commitSha, "commitSha");
    const savePointId = requiredText(input.savePointId, "savePointId");
    const session = selectSession(store.db, input);
    if (session.status !== "active" && session.status !== "blocked") {
      throw new Error(`Project session ${session.session_uuid} cannot accept a save point while ${session.status}`);
    }
    const context = eventContext(session, input, session.session_uuid);
    const triggerKind = requiredText(input.triggerKind, "triggerKind");
    const blockers = parseBlockers(session.blockers_json);
    const replayedFailureEventId = session.save_point_stale || blockers.some((blocker) => blocker.code === "save_point_failed")
      ? latestSavePointFailureEventId(store.db, session.session_uuid)
      : null;
    const eventPayload: JsonObject = {
      anchored_commit: commitSha,
      trigger_kind: triggerKind,
      headline_score: input.headlineScore ?? null,
      artifact_paths: input.artifactPaths ?? [],
      replay_key: savePointReplayKey(session.session_uuid, commitSha, triggerKind),
      replayed_failure_event_id: replayedFailureEventId,
    };
    const event = appendProjectEvent(store.db, {
      ...context,
      eventType: "session.save_point_recorded",
      subjectKind: "session",
      subjectId: session.session_uuid,
      payload: eventPayload,
    });
    const timelinePayload = { ...(input.payload ?? {}), ...eventPayload };
    const entry = insertTimelineEntry(store.db, {
      sessionUuid: session.session_uuid,
      entryKind: "save_point",
      entryId: savePointId,
      occurredAt: context.occurredAt,
      payload: timelinePayload,
      eventId: event.eventId,
    });
    const remainingBlockers = blockers.filter((blocker) => blocker.code !== "save_point_failed");
    updateEnvelope(
      store.db,
      session,
      event.eventId,
      context.occurredAt,
      "blockers_json = ?, save_point_stale = 0",
      [JSON.stringify(remainingBlockers)],
    );
    return entry;
  });
}

export function recordSavePointFailure(
  store: StateStore,
  input: RecordSavePointFailureInput,
): ProjectSessionRecord {
  return immediateTransaction(store.db, () => {
    const session = selectSession(store.db, input);
    if (session.status !== "active" && session.status !== "blocked") {
      throw new Error(`Project session ${session.session_uuid} cannot record save-point failure while ${session.status}`);
    }
    const context = eventContext(session, input, session.session_uuid);
    const anchoredCommit = requiredText(session.head_revision ?? "", "session head revision");
    const triggerKind = requiredText(input.triggerKind, "triggerKind");
    const blocker: ProjectSessionBlocker = {
      code: "save_point_failed",
      message: requiredText(input.message, "message"),
      source_kind: requiredText(input.sourceKind, "sourceKind"),
      source_id: requiredText(input.sourceId, "sourceId"),
      recoverable: true,
      severity: "error",
    };
    const blockers = [
      ...parseBlockers(session.blockers_json).filter(
        (existing) =>
          existing.code !== blocker.code ||
          existing.source_kind !== blocker.source_kind ||
          existing.source_id !== blocker.source_id,
      ),
      blocker,
    ];
    const event = appendProjectEvent(store.db, {
      ...context,
      eventType: "session.save_point_failed",
      subjectKind: "session",
      subjectId: session.session_uuid,
      payload: {
        anchored_commit: anchoredCommit,
        trigger_kind: triggerKind,
        failed_or_missing_artifact_classes: [blocker.source_kind!],
        blocker_code: blocker.code,
        staleness_flag_raised: true,
        replay_key: savePointReplayKey(session.session_uuid, anchoredCommit, triggerKind),
      },
    });
    updateEnvelope(
      store.db,
      session,
      event.eventId,
      context.occurredAt,
      "blockers_json = ?, save_point_stale = 1",
      [JSON.stringify(blockers)],
    );
    const saved = getProjectSessionByUuid(store.db, session.session_uuid);
    if (!saved) throw new Error(`Project session disappeared after save-point failure: ${session.session_uuid}`);
    return saved;
  });
}

export interface DurableSavePointFailureResult {
  blockerRaised: boolean;
  storage: "sqlite" | "spool" | "unavailable";
  spoolPath?: string;
  error?: string;
}

/** Persists a save-point failure to SQLite, or atomically spools it when SQLite/session state is unavailable. */
export function recordSavePointFailureDurably(
  stateDir: string,
  input: RecordSavePointFailureInput,
  existingStore?: StateStore,
): DurableSavePointFailureResult {
  let ownedStore: StateStore | null = null;
  let sqliteError: unknown = null;
  try {
    const store = existingStore ?? (ownedStore = openState(stateDir));
    recordSavePointFailure(store, input);
    return { blockerRaised: true, storage: "sqlite" };
  } catch (error) {
    sqliteError = error;
  } finally {
    ownedStore?.db.close();
  }

  try {
    const occurredAt = input.occurredAt ?? currentTime();
    const spooled = spoolSavePointFailure(stateDir, {
      occurred_at: occurredAt,
      project_id: input.projectId?.trim() || null,
      session_uuid: input.sessionUuid?.trim() || null,
      trigger_kind: requiredText(input.triggerKind, "triggerKind"),
      source_kind: requiredText(input.sourceKind, "sourceKind"),
      source_id: requiredText(input.sourceId, "sourceId"),
      message: requiredText(input.message, "message"),
      command_id: requiredText(input.commandId, "commandId"),
      causation_id: input.causationId?.trim() || null,
      correlation_id: requiredText(input.correlationId, "correlationId"),
      span_id: input.spanId?.trim() || null,
      actor: input.actor,
    });
    return { blockerRaised: true, storage: "spool", spoolPath: spooled.path };
  } catch (spoolError) {
    return {
      blockerRaised: false,
      storage: "unavailable",
      error: `sqlite: ${sqliteError instanceof Error ? sqliteError.message : String(sqliteError)}; spool: ${spoolError instanceof Error ? spoolError.message : String(spoolError)}`,
    };
  }
}

export function unresolvedSavePointFailures(
  store: StateStore,
  input: { projectId: string; sessionUuid?: string | null },
): SavePointFailureSpoolRecord[] {
  const latestAnchor = input.sessionUuid
    ? (store.db
        .query(
          `SELECT occurred_at FROM session_timeline_entries
           WHERE session_uuid = ? AND entry_kind = 'save_point'
           ORDER BY id DESC LIMIT 1`,
        )
        .get(input.sessionUuid) as { occurred_at: string } | undefined)
    : undefined;
  return listSavePointFailureSpool(store.stateDir).filter((record) => {
    if (record.replayed_at) return false;
    if (record.project_id && record.project_id !== input.projectId) return false;
    if (record.session_uuid && record.session_uuid !== input.sessionUuid) return false;
    return !latestAnchor || record.occurred_at >= latestAnchor.occurred_at;
  });
}

export function recordDeferredSavePointEvidenceDurably(
  store: StateStore,
  evidence: import("./types.js").DeferredSavePointEvidence,
  context: Pick<RecordSavePointFailureInput, "actor" | "causationId" | "commandId" | "correlationId" | "projectId" | "sessionUuid" | "spanId">,
): DurableSavePointFailureResult {
  if (evidence.status === "recorded") {
    try {
      recordSavePointAnchor(store, { ...evidence, ...context });
      return { blockerRaised: false, storage: "sqlite" };
    } catch (error) {
      return recordSavePointFailureDurably(store.stateDir, {
        ...context,
        triggerKind: evidence.triggerKind,
        sourceKind: "save_point",
        sourceId: evidence.savePointId,
        message: `save-point anchor persistence failed: ${error instanceof Error ? error.message : String(error)}`,
      }, store);
    }
  }
  return recordSavePointFailureDurably(store.stateDir, { ...evidence, ...context }, store);
}

function hasNamedSavePoint(db: Database, session: SessionEnvelopeRow, savePointId: string | null | undefined): boolean {
  if (!savePointId || !session.head_revision?.trim()) return false;
  return Boolean(
    db
      .query(
        `SELECT 1
         FROM save_points
         JOIN campaigns ON campaigns.id = save_points.campaign_id
         JOIN session_timeline_entries
           ON session_timeline_entries.entry_kind = 'save_point'
          AND session_timeline_entries.entry_id = save_points.id
         WHERE save_points.id = ?
           AND campaigns.project_id = ?
           AND session_timeline_entries.session_uuid = ?
           AND LENGTH(TRIM(COALESCE(save_points.label, ''))) > 0
           AND save_points.commit_sha = ?`,
      )
      .get(savePointId, session.project_id, session.session_uuid, session.head_revision),
  );
}

function latestSavePointIsAtHead(db: Database, session: SessionEnvelopeRow): boolean {
  if (!session.head_revision?.trim()) return false;
  const latest = db
    .query(
      `SELECT save_points.commit_sha
       FROM session_timeline_entries
       LEFT JOIN save_points ON save_points.id = session_timeline_entries.entry_id
       WHERE session_timeline_entries.session_uuid = ?
         AND session_timeline_entries.entry_kind = 'save_point'
       ORDER BY session_timeline_entries.id DESC LIMIT 1`,
    )
    .get(session.session_uuid) as { commit_sha: string | null } | undefined;
  return latest?.commit_sha === session.head_revision;
}

export function closeProjectSession(
  store: StateStore,
  input: CloseProjectSessionInput,
): CloseProjectSessionDecision {
  if (input.actor !== "operator") throw new Error("Session close is operator-only");
  return immediateTransaction(store.db, () => {
    const session = selectSession(store.db, input);
    if (session.status === "closed") {
      throw new Error(`Project session ${session.session_uuid} is already closed`);
    }
    const leaseRow = store.db
      .query("SELECT active_workflow_json FROM project_state WHERE project_id = ?")
      .get(session.project_id) as { active_workflow_json: string | null } | undefined;
    const blockers: CloseProjectSessionBlocked["blockers"] = [];
    if (leaseRow?.active_workflow_json) {
      blockers.push({
        code: "dispatch_lease_held",
        message: "A workflow still holds the dispatch lease.",
        source_kind: "project",
        source_id: session.project_id,
        recoverable: true,
      });
    }
    const namedSavePoint = hasNamedSavePoint(store.db, session, input.namedSavePointId);
    const unresolvedFailures = unresolvedSavePointFailures(store, {
      projectId: session.project_id,
      sessionUuid: session.session_uuid,
    });
    const latestAnchorAtHead = latestSavePointIsAtHead(store.db, session);
    if (
      input.worktreeDirtyBeyondHead ||
      session.save_point_stale ||
      unresolvedFailures.length > 0 ||
      !latestAnchorAtHead ||
      !namedSavePoint
    ) {
      blockers.push({
        code: "unshipped_work",
        message: input.worktreeDirtyBeyondHead
          ? "The worktree contains changes beyond the session head."
          : session.save_point_stale || unresolvedFailures.length > 0
            ? "Save-point capture evidence is stale after a failure."
            : !latestAnchorAtHead
              ? "The latest save point is not anchored at the current session head."
              : "A named save point at the current session head is required.",
        source_kind: "session",
        source_id: session.session_uuid,
        recoverable: true,
      });
    }
    const actionSpanId = input.spanId ?? newSpanId();
    if (input.correlationId !== session.session_uuid) {
      throw new Error(`Session event correlation_id must equal session UUID ${session.session_uuid}`);
    }
    if (blockers.length > 0) {
      const currentBlockers = parseBlockers(session.blockers_json);
      if (session.status !== "blocked" || JSON.stringify(currentBlockers) !== JSON.stringify(blockers)) {
        const blockedAt = input.occurredAt ?? currentTime();
        const enteringBlocked = session.status !== "blocked";
        const currentBlockerCodes = currentBlockers.map((blocker) => blocker.code);
        const blockerCodes = blockers.map((blocker) => blocker.code);
        const currentBlockerCodeSet = new Set(currentBlockerCodes);
        const stateRevision = session.revision + 1;
        const blocked = appendProjectEvent(store.db, {
          actor: input.actor,
          causationId: requiredText(input.commandId, "commandId"),
          correlationId: session.session_uuid,
          eventType: enteringBlocked ? "session.blocked" : "session.blockers_updated",
          occurredAt: blockedAt,
          payload: enteringBlocked
            ? {
                from_status: session.status,
                to_status: "blocked",
                prior_status: session.status,
                blocker_codes: blockerCodes,
                source_identities: closeSessionSourceIdentities(blockers),
                recovery_choices: closeSessionRecoveryChoices(blockers),
                state_revision: stateRevision,
              }
            : {
                added_blocker_codes: blockerCodes.filter((code) => !currentBlockerCodeSet.has(code)),
                removed_blocker_codes: currentBlockerCodes.filter(
                  (code) => !blockers.some((blocker) => blocker.code === code),
                ),
                blocker_codes: blockerCodes,
                source_identities: closeSessionSourceIdentities(blockers),
                recovery_choices: closeSessionRecoveryChoices(blockers),
                state_revision: stateRevision,
              },
          projectId: session.project_id,
          ...eventSpan(actionSpanId),
          subjectKind: "session",
          subjectId: session.session_uuid,
          traceId: session.trace_id ?? `trace-session-${session.session_uuid}`,
        });
        updateEnvelope(
          store.db,
          session,
          blocked.eventId,
          blockedAt,
          "status = 'blocked', blockers_json = ?",
          [JSON.stringify(blockers)],
        );
      }
      return { closed: false, blockers };
    }

    let current = session;
    let closingCause = requiredText(input.commandId, "commandId");
    const occurredAt = input.occurredAt ?? currentTime();
    if (current.status !== "closing") {
      const closing = appendProjectEvent(store.db, {
        actor: input.actor,
        causationId: closingCause,
        correlationId: current.session_uuid,
        eventType: "session.closing",
        occurredAt,
        payload: { from_status: current.status, to_status: "closing" },
        projectId: current.project_id,
        ...eventSpan(actionSpanId),
        subjectKind: "session",
        subjectId: current.session_uuid,
        traceId: current.trace_id ?? `trace-session-${current.session_uuid}`,
      });
      updateEnvelope(
        store.db,
        current,
        closing.eventId,
        occurredAt,
        "status = 'closing', blockers_json = '[]'",
        [],
      );
      closingCause = closing.eventId;
      current = selectSession(store.db, { sessionUuid: current.session_uuid });
    }
    const event = appendProjectEvent(store.db, {
      actor: input.actor,
      causationId: closingCause,
      correlationId: current.session_uuid,
      eventType: "session.closed",
      occurredAt,
      projectId: current.project_id,
      ...eventSpan(actionSpanId),
      subjectKind: "session",
      subjectId: current.session_uuid,
      traceId: current.trace_id ?? `trace-session-${current.session_uuid}`,
      payload: {
        final_head: current.head_revision,
        shipped_and_unshipped_work_summary: {
          ahead_of_base: input.aheadOfBase,
          worktree_dirty_beyond_head: input.worktreeDirtyBeyondHead,
        },
        final_save_point_id: namedSavePoint ? (input.namedSavePointId ?? null) : null,
        closing_operator: input.actor,
        state_revision: current.revision + 1,
      },
    });
    updateEnvelope(
      store.db,
      current,
      event.eventId,
      occurredAt,
      "status = 'closed', closed_at = ?",
      [occurredAt],
    );
    const saved = getProjectSessionByUuid(store.db, current.session_uuid);
    if (!saved) throw new Error(`Project session disappeared after close: ${current.session_uuid}`);
    return { closed: true, session: saved };
  });
}

export function listSessionTimeline(
  db: Database,
  sessionUuid: string,
  limit = 50,
): SessionTimelineEntry[] {
  const rows = db
    .query(
      `SELECT id, session_uuid, entry_kind, entry_id, occurred_at, payload_json, caused_by_event_id
       FROM session_timeline_entries
       WHERE session_uuid = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(sessionUuid, Math.max(1, Math.trunc(limit))) as Array<{
    id: number;
    session_uuid: string;
    entry_kind: SessionTimelineEntry["entry_kind"];
    entry_id: string;
    occurred_at: string;
    payload_json: string;
    caused_by_event_id: string | null;
  }>;
  return rows.map((row) => ({
    id: Number(row.id),
    session_uuid: row.session_uuid,
    entry_kind: row.entry_kind,
    entry_id: row.entry_id,
    occurred_at: row.occurred_at,
    payload: JSON.parse(row.payload_json) as JsonObject,
    caused_by_event_id: row.caused_by_event_id,
  }));
}
