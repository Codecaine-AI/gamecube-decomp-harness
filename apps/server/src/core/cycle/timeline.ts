import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { casRunEnvelope, immediateTransaction, now as currentTime, openState, type StateStore } from "@server/core/orchestrator-state";
import { appendGameEvent, eventSpan, newSpanId, type JsonObject } from "@server/core/harness-state/events.js";
import { quietGit } from "@server/core/cycle-runtime/phases/pr/pr-sync.js";
import { getCycleByUuid } from "./store.js";
import { listSavePointFailureSpool, spoolSavePointFailure, type SavePointFailureSpoolRecord } from "./save-point-failure-spool.js";
import type {
  CloseCycleDecision,
  CloseCycleBlocked,
  CloseCycleInput,
  CycleBlocker,
  CycleRecord,
  RecordEpochCompletedInput,
  RecordRemoteApplicationInput,
  RecordSavePointAnchorInput,
  RecordSavePointFailureInput,
  CycleTimelineEntry,
} from "./types.js";

type CycleEnvelopeRow = {
  id: string;
  game_id: string;
  cycle_uuid: string;
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
  game_id: string | null;
  game_repo_root: string | null;
  cycle_uuid: string | null;
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
  game_id: string;
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
  const repoRoot = run.game_repo_root?.trim();
  const runId = run.id;
  if (!repoRoot) throw new Error(`Run ${runId} has no game repository for commit verification`);
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
  input: Pick<RecordEpochCompletedInput, "gameId" | "runId" | "cycleUuid">,
): { run: EpochBoundaryRunRow; cycle: CycleEnvelopeRow } {
  const run = db
    .query(
      `SELECT id, game_id, game_repo_root, cycle_uuid, revision
              , trace_id
       FROM runs
       WHERE id = ?`,
    )
    .get(input.runId) as EpochBoundaryRunRow | null;
  if (!run) throw new Error(`Run ${input.runId} does not exist for epoch integration`);
  if (!run.game_id) throw new Error(`Run ${run.id} has no game id for epoch integration`);

  let cycles: CycleEnvelopeRow[];
  if (run.cycle_uuid) {
    cycles = db
      .query("SELECT * FROM cycles WHERE cycle_uuid = ?")
      .all(run.cycle_uuid) as CycleEnvelopeRow[];
  } else {
    cycles = db
      .query(
        `SELECT * FROM cycles
         WHERE active_run_id = ? AND status IN ('active', 'blocked', 'closing')
         ORDER BY created_at DESC LIMIT 2`,
      )
      .all(run.id) as CycleEnvelopeRow[];
  }
  if (cycles.length !== 1) {
    throw new Error(
      `Run ${run.id} must resolve to exactly one game cycle; found ${cycles.length}`,
    );
  }
  const cycle = cycles[0]!;
  if (cycle.active_run_id !== run.id) {
    throw new Error(
      `Run/cycle mismatch for epoch integration: cycle ${cycle.cycle_uuid} names active run ${cycle.active_run_id ?? "none"}, not ${run.id}`,
    );
  }
  if (cycle.game_id !== run.game_id) {
    throw new Error(
      `Run/cycle game mismatch for epoch integration: run ${run.id} belongs to ${run.game_id}, cycle ${cycle.cycle_uuid} belongs to ${cycle.game_id}`,
    );
  }
  if (input.gameId && input.gameId !== run.game_id) {
    throw new Error(`Run ${run.id} does not belong to requested game ${input.gameId}`);
  }
  if (input.cycleUuid && input.cycleUuid !== cycle.cycle_uuid) {
    throw new Error(`Run ${run.id} does not belong to requested cycle ${input.cycleUuid}`);
  }
  if (cycle.status !== "active" && cycle.status !== "blocked") {
    throw new Error(`Game cycle ${cycle.cycle_uuid} cannot accept an epoch while ${cycle.status}`);
  }
  return { run, cycle };
}

function parseBlockers(value: string): CycleBlocker[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as CycleBlocker[]) : [];
  } catch (error) {
    throw new Error("Invalid blockers_json in cycles", { cause: error });
  }
}

const CLOSE_SESSION_RECOVERY_CHOICE_BY_BLOCKER = {
  dispatch_lease_held: "release_dispatch",
  unshipped_work: "record_save_point",
} as const satisfies Record<CloseCycleBlocked["blockers"][number]["code"], string>;

function closeCycleSourceIdentities(
  blockers: CloseCycleBlocked["blockers"],
): Array<{ source_kind: string; source_id: string }> {
  return blockers.map((blocker) => ({
    source_kind: blocker.source_kind,
    source_id: blocker.source_id,
  }));
}

function closeCycleRecoveryChoices(blockers: CloseCycleBlocked["blockers"]): string[] {
  return [...new Set(
    blockers
      .filter((blocker) => blocker.recoverable)
      .map((blocker) => CLOSE_SESSION_RECOVERY_CHOICE_BY_BLOCKER[blocker.code]),
  )];
}

function savePointReplayKey(cycleUuid: string, anchoredCommit: string, triggerKind: string): string {
  const digest = createHash("sha256")
    .update(`${cycleUuid}\0${anchoredCommit}\0${triggerKind}`)
    .digest("hex")
    .slice(0, 24);
  return `save-point-${digest}`;
}

function latestSavePointFailureEventId(db: Database, cycleUuid: string): string | null {
  const row = db
    .query(
      `SELECT event_id
       FROM game_events
       WHERE event_type = 'cycle.save_point_failed'
         AND subject_kind = 'cycle'
         AND subject_id = ?
       ORDER BY sequence DESC
       LIMIT 1`,
    )
    .get(cycleUuid) as { event_id: string } | null;
  return row?.event_id ?? null;
}

function selectCycle(
  db: Database,
  selector: { gameId?: string; cycleUuid?: string },
): CycleEnvelopeRow {
  const rows = (selector.cycleUuid
    ? db.query("SELECT * FROM cycles WHERE cycle_uuid = ?").all(selector.cycleUuid)
    : selector.gameId
      ? db
          .query(
            `SELECT * FROM cycles
             WHERE game_id = ? AND status IN ('active', 'blocked', 'closing')
             ORDER BY created_at DESC LIMIT 2`,
          )
          .all(selector.gameId)
      : db
          .query(
            `SELECT * FROM cycles
             WHERE status IN ('active', 'blocked', 'closing')
             ORDER BY created_at DESC LIMIT 2`,
          )
          .all()) as CycleEnvelopeRow[];
  if (rows.length === 0) throw new Error("No game cycle matches the requested transition");
  if (rows.length > 1) throw new Error("Game id or cycle UUID is required when multiple cycles are active");
  const cycle = rows[0]!;
  if (selector.gameId && cycle.game_id !== selector.gameId) {
    throw new Error(`Game cycle ${cycle.cycle_uuid} does not belong to ${selector.gameId}`);
  }
  return cycle;
}

function eventContext(
  cycle: CycleEnvelopeRow,
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
    gameId: cycle.game_id,
    ...eventSpan(input.spanId ?? newSpanId()),
    traceId: cycle.trace_id ?? `trace-cycle-${cycle.cycle_uuid}`,
  } as const;
}

function insertTimelineEntry(
  db: Database,
  input: {
    cycleUuid: string;
    entryKind: CycleTimelineEntry["entry_kind"];
    entryId: string;
    occurredAt: string;
    payload: JsonObject;
    eventId: string;
  },
): CycleTimelineEntry {
  const result = db
    .query(
      `INSERT INTO cycle_timeline_entries (
         cycle_uuid, entry_kind, entry_id, occurred_at, payload_json, caused_by_event_id
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (cycle_uuid, entry_kind, entry_id) DO UPDATE SET
         payload_json = excluded.payload_json,
         caused_by_event_id = excluded.caused_by_event_id
       RETURNING id`,
    )
    .get(
      input.cycleUuid,
      input.entryKind,
      input.entryId,
      input.occurredAt,
      JSON.stringify(input.payload),
      input.eventId,
    ) as { id: number };
  return {
    id: result.id,
    cycle_uuid: input.cycleUuid,
    entry_kind: input.entryKind,
    entry_id: input.entryId,
    occurred_at: input.occurredAt,
    payload: input.payload,
    caused_by_event_id: input.eventId,
  };
}

function updateEnvelope(
  db: Database,
  cycle: CycleEnvelopeRow,
  eventId: string,
  occurredAt: string,
  setSql: string,
  bindings: Array<number | string | null>,
): void {
  const result = db
    .query(
      `UPDATE cycles
       SET ${setSql}, revision = ?, caused_by_event_id = ?, updated_at = ?
       WHERE cycle_uuid = ? AND revision = ?`,
    )
    .run(...bindings, cycle.revision + 1, eventId, occurredAt, cycle.cycle_uuid, cycle.revision);
  if (result.changes !== 1) {
    throw new Error(`Stale game cycle revision ${cycle.revision} for ${cycle.cycle_uuid}`);
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
): CycleTimelineEntry {
  const integrationCommit = requiredText(input.integrationCommit, "integrationCommit");
  const epochId = requiredText(input.epochId, "epochId");
  const runId = requiredText(input.runId, "runId");
  const { run, cycle } = resolveEpochBoundary(db, { ...input, runId });
  verifyRunCommitExists(run, integrationCommit);
  const context = {
    ...eventContext(cycle, input, runId),
    traceId: requiredText(run.trace_id ?? "", `Run ${runId} trace_id`),
  };
  const payload: JsonObject = {
    ...(input.payload ?? {}),
    epoch_id: epochId,
    integration_commit: integrationCommit,
    score_delta: input.scoreDelta ?? null,
    new_head: integrationCommit,
  };
  const existing = db
    .query(
      `SELECT id, occurred_at, caused_by_event_id
       FROM cycle_timeline_entries
       WHERE cycle_uuid = ? AND entry_kind = 'epoch_completed' AND entry_id = ?`,
    )
    .get(cycle.cycle_uuid, epochId) as { id: number; occurred_at: string; caused_by_event_id: string | null } | null;
  if (existing?.caused_by_event_id) {
    db.query(
      `UPDATE cycle_timeline_entries
       SET payload_json = ?
       WHERE id = ?`,
    ).run(JSON.stringify(payload), existing.id);
    db.query(
      `UPDATE game_events SET occurred_at = ?, payload_json = ? WHERE event_id = ?`,
    ).run(context.occurredAt, JSON.stringify(payload), existing.caused_by_event_id);
    if (cycle.head_revision !== integrationCommit) {
      updateEnvelope(db, cycle, existing.caused_by_event_id, context.occurredAt, "head_revision = ?", [integrationCommit]);
    }
    if (run.revision === 0 || (db.query("SELECT head_revision FROM runs WHERE id = ?").get(runId) as { head_revision: string | null }).head_revision !== integrationCommit) {
      const accepted = casRunEnvelope(db, {
        eventId: existing.caused_by_event_id,
        expectedRevision: Number(run.revision),
        headRevision: integrationCommit,
        runId,
      });
      if (!accepted) throw new Error(`Stale run revision ${run.revision} for ${runId}`);
    }
    db.query("DELETE FROM pending_integrations WHERE run_id = ? AND epoch_id = ?").run(runId, epochId);
    return {
      id: existing.id,
      cycle_uuid: cycle.cycle_uuid,
      entry_kind: "epoch_completed",
      entry_id: epochId,
      occurred_at: existing.occurred_at,
      payload,
      caused_by_event_id: existing.caused_by_event_id,
    };
  }
  const event = appendGameEvent(db, {
    ...context,
    eventType: "run.epoch_integrated",
    subjectKind: "run",
    subjectId: runId,
    payload,
  });
  const entry = insertTimelineEntry(db, {
    cycleUuid: cycle.cycle_uuid,
    entryKind: "epoch_completed",
    entryId: epochId,
    occurredAt: context.occurredAt,
    payload,
    eventId: event.eventId,
  });
  updateEnvelope(db, cycle, event.eventId, context.occurredAt, "head_revision = ?", [integrationCommit]);
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

export function recordEpochCompleted(store: StateStore, input: RecordEpochCompletedInput): CycleTimelineEntry {
  return immediateTransaction(store.db, () => recordEpochCompletedInTransaction(store.db, input));
}

/**
 * Records a published remote application inside the caller's publication
 * transaction. The existing sync.boundary_published event advances the
 * cycle envelope and causes the timeline entry. When a run is attached,
 * this writer appends one run.remote_applied event and uses it for the run CAS.
 */
export function recordRemoteApplicationInTransaction(
  db: Database,
  input: RecordRemoteApplicationInput,
): CycleTimelineEntry {
  if (!db.inTransaction) {
    throw new Error("recordRemoteApplicationInTransaction requires an active transaction");
  }
  const remoteApplicationId = requiredText(input.remoteApplicationId, "remoteApplicationId");
  const boundaryEventId = requiredText(input.boundaryEventId, "boundaryEventId");
  const syncId = requiredText(input.syncId, "syncId");
  const priorHead = requiredText(input.priorHead, "priorHead");
  const newHead = requiredText(input.newHead, "newHead");
  const cycle = selectCycle(db, input);
  if (cycle.status !== "active" && cycle.status !== "blocked") {
    throw new Error(`Game cycle ${cycle.cycle_uuid} cannot accept a remote application while ${cycle.status}`);
  }
  if (cycle.head_revision !== priorHead) {
    throw new Error(
      `Remote-application prior head mismatch for ${cycle.cycle_uuid}: expected ${cycle.head_revision ?? "none"}, received ${priorHead}`,
    );
  }
  const boundary = db
    .query(
      `SELECT event_id, event_type, game_id, subject_kind, subject_id, correlation_id, trace_id
       FROM game_events WHERE event_id = ?`,
    )
    .get(boundaryEventId) as BoundaryEventRow | null;
  if (!boundary) throw new Error(`Boundary event ${boundaryEventId} does not exist`);
  if (
    boundary.event_type !== "sync.boundary_published" ||
    boundary.game_id !== cycle.game_id ||
    boundary.subject_kind !== "sync_workflow" ||
    boundary.subject_id !== syncId
  ) {
    throw new Error(`Boundary event ${boundaryEventId} does not match sync ${syncId} for ${cycle.game_id}`);
  }

  const activeRunId = cycle.active_run_id;
  if (input.runId !== undefined && input.runId !== activeRunId) {
    throw new Error(
      `Remote-application run mismatch for ${cycle.cycle_uuid}: expected ${activeRunId ?? "none"}, received ${input.runId ?? "none"}`,
    );
  }
  const run = activeRunId
    ? (db
        .query(
          `SELECT id, game_id, game_repo_root, cycle_uuid, revision, remote_application_ids_json, trace_id
           FROM runs WHERE id = ?`,
        )
        .get(activeRunId) as RemoteApplicationRunRow | null)
    : null;
  if (activeRunId && !run) throw new Error(`Active run ${activeRunId} does not exist for remote application`);
  if (run && (run.game_id !== cycle.game_id || run.cycle_uuid !== cycle.cycle_uuid)) {
    throw new Error(`Run/cycle mismatch for remote application: ${run.id} does not belong to ${cycle.cycle_uuid}`);
  }
  const repositoryRoot = input.repositoryRoot?.trim() || run?.game_repo_root;
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
    cycleUuid: cycle.cycle_uuid,
    entryKind: "remote_application",
    entryId: remoteApplicationId,
    occurredAt,
    payload: timelinePayload,
    eventId: boundaryEventId,
  });
  updateEnvelope(db, cycle, boundaryEventId, occurredAt, "head_revision = ?, save_point_stale = 1", [newHead]);

  if (run) {
    const remoteApplicationIds = stringListJson(
      run.remote_application_ids_json,
      `remote_application_ids_json for run ${run.id}`,
    );
    if (remoteApplicationIds.includes(remoteApplicationId)) {
      throw new Error(`Run ${run.id} already references remote application ${remoteApplicationId}`);
    }
    const runEvent = appendGameEvent(db, {
      actor: input.actor,
      causationId: boundaryEventId,
      correlationId: run.id,
      eventType: "run.remote_applied",
      occurredAt,
      payload: eventPayload,
      gameId: cycle.game_id,
      ...eventSpan(input.spanId ?? newSpanId()),
      subjectId: run.id,
      subjectKind: "run",
      traceId: run.trace_id?.trim() || cycle.trace_id || boundary.trace_id,
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
): CycleTimelineEntry {
  return immediateTransaction(store.db, () => recordRemoteApplicationInTransaction(store.db, input));
}

export function recordSavePointAnchor(
  store: StateStore,
  input: RecordSavePointAnchorInput,
): CycleTimelineEntry {
  return immediateTransaction(store.db, () => {
    const commitSha = requiredText(input.commitSha, "commitSha");
    const savePointId = requiredText(input.savePointId, "savePointId");
    const cycle = selectCycle(store.db, input);
    if (cycle.status !== "active" && cycle.status !== "blocked") {
      throw new Error(`Game cycle ${cycle.cycle_uuid} cannot accept a save point while ${cycle.status}`);
    }
    const context = eventContext(cycle, input, cycle.cycle_uuid);
    const triggerKind = requiredText(input.triggerKind, "triggerKind");
    const blockers = parseBlockers(cycle.blockers_json);
    const replayedFailureEventId = cycle.save_point_stale || blockers.some((blocker) => blocker.code === "save_point_failed")
      ? latestSavePointFailureEventId(store.db, cycle.cycle_uuid)
      : null;
    const eventPayload: JsonObject = {
      anchored_commit: commitSha,
      trigger_kind: triggerKind,
      headline_score: input.headlineScore ?? null,
      artifact_paths: input.artifactPaths ?? [],
      replay_key: savePointReplayKey(cycle.cycle_uuid, commitSha, triggerKind),
      replayed_failure_event_id: replayedFailureEventId,
    };
    const timelinePayload = { ...(input.payload ?? {}), ...eventPayload };
    const existing = store.db
      .query(
        `SELECT id, occurred_at, caused_by_event_id
         FROM cycle_timeline_entries
         WHERE cycle_uuid = ? AND entry_kind = 'save_point' AND entry_id = ?`,
      )
      .get(cycle.cycle_uuid, savePointId) as { id: number; occurred_at: string; caused_by_event_id: string | null } | null;
    if (existing?.caused_by_event_id) {
      store.db.query(
        `UPDATE cycle_timeline_entries
         SET payload_json = ?
         WHERE id = ?`,
      ).run(JSON.stringify(timelinePayload), existing.id);
      store.db.query(
        `UPDATE game_events SET occurred_at = ?, payload_json = ? WHERE event_id = ?`,
      ).run(context.occurredAt, JSON.stringify(eventPayload), existing.caused_by_event_id);
      const remainingBlockers = blockers.filter((blocker) => blocker.code !== "save_point_failed");
      if (cycle.save_point_stale || remainingBlockers.length !== blockers.length) {
        updateEnvelope(
          store.db,
          cycle,
          existing.caused_by_event_id,
          context.occurredAt,
          "blockers_json = ?, save_point_stale = 0",
          [JSON.stringify(remainingBlockers)],
        );
      }
      return {
        id: existing.id,
        cycle_uuid: cycle.cycle_uuid,
        entry_kind: "save_point",
        entry_id: savePointId,
        occurred_at: existing.occurred_at,
        payload: timelinePayload,
        caused_by_event_id: existing.caused_by_event_id,
      };
    }
    const event = appendGameEvent(store.db, {
      ...context,
      eventType: "cycle.save_point_recorded",
      subjectKind: "cycle",
      subjectId: cycle.cycle_uuid,
      payload: eventPayload,
    });
    const entry = insertTimelineEntry(store.db, {
      cycleUuid: cycle.cycle_uuid,
      entryKind: "save_point",
      entryId: savePointId,
      occurredAt: context.occurredAt,
      payload: timelinePayload,
      eventId: event.eventId,
    });
    const remainingBlockers = blockers.filter((blocker) => blocker.code !== "save_point_failed");
    updateEnvelope(
      store.db,
      cycle,
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
): CycleRecord {
  return immediateTransaction(store.db, () => {
    const cycle = selectCycle(store.db, input);
    if (cycle.status !== "active" && cycle.status !== "blocked") {
      throw new Error(`Game cycle ${cycle.cycle_uuid} cannot record save-point failure while ${cycle.status}`);
    }
    const context = eventContext(cycle, input, cycle.cycle_uuid);
    const anchoredCommit = requiredText(cycle.head_revision ?? "", "cycle head revision");
    const triggerKind = requiredText(input.triggerKind, "triggerKind");
    const blocker: CycleBlocker = {
      code: "save_point_failed",
      message: requiredText(input.message, "message"),
      source_kind: requiredText(input.sourceKind, "sourceKind"),
      source_id: requiredText(input.sourceId, "sourceId"),
      recoverable: true,
      severity: "error",
    };
    const blockers = [
      ...parseBlockers(cycle.blockers_json).filter(
        (existing) =>
          existing.code !== blocker.code ||
          existing.source_kind !== blocker.source_kind ||
          existing.source_id !== blocker.source_id,
      ),
      blocker,
    ];
    const replayKey = savePointReplayKey(cycle.cycle_uuid, anchoredCommit, triggerKind);
    const eventPayload: JsonObject = {
      anchored_commit: anchoredCommit,
      trigger_kind: triggerKind,
      failed_or_missing_artifact_classes: [blocker.source_kind!],
      blocker_code: blocker.code,
      staleness_flag_raised: true,
      replay_key: replayKey,
    };
    const existing = store.db.query(
      `SELECT event_id FROM game_events
       WHERE event_type = 'cycle.save_point_failed'
         AND subject_kind = 'cycle' AND subject_id = ?
         AND json_extract(payload_json, '$.replay_key') = ?
       ORDER BY sequence DESC LIMIT 1`,
    ).get(cycle.cycle_uuid, replayKey) as { event_id: string } | null;
    if (existing) {
      store.db.query("UPDATE game_events SET occurred_at = ?, payload_json = ? WHERE event_id = ?")
        .run(context.occurredAt, JSON.stringify(eventPayload), existing.event_id);
      const blockersJson = JSON.stringify(blockers);
      if (!cycle.save_point_stale || blockersJson !== cycle.blockers_json) {
        updateEnvelope(
          store.db,
          cycle,
          existing.event_id,
          context.occurredAt,
          "blockers_json = ?, save_point_stale = 1",
          [blockersJson],
        );
      }
      const saved = getCycleByUuid(store.db, cycle.cycle_uuid);
      if (!saved) throw new Error(`Game cycle disappeared after save-point failure: ${cycle.cycle_uuid}`);
      return saved;
    }
    const event = appendGameEvent(store.db, {
      ...context,
      eventType: "cycle.save_point_failed",
      subjectKind: "cycle",
      subjectId: cycle.cycle_uuid,
      payload: eventPayload,
    });
    updateEnvelope(
      store.db,
      cycle,
      event.eventId,
      context.occurredAt,
      "blockers_json = ?, save_point_stale = 1",
      [JSON.stringify(blockers)],
    );
    const saved = getCycleByUuid(store.db, cycle.cycle_uuid);
    if (!saved) throw new Error(`Game cycle disappeared after save-point failure: ${cycle.cycle_uuid}`);
    return saved;
  });
}

export interface DurableSavePointFailureResult {
  blockerRaised: boolean;
  storage: "sqlite" | "spool" | "unavailable";
  spoolPath?: string;
  error?: string;
}

/** Persists a save-point failure to SQLite, or atomically spools it when SQLite/cycle state is unavailable. */
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
      game_id: input.gameId?.trim() || null,
      cycle_uuid: input.cycleUuid?.trim() || null,
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
  input: { gameId: string; cycleUuid?: string | null },
): SavePointFailureSpoolRecord[] {
  const latestAnchor = input.cycleUuid
    ? (store.db
        .query(
          `SELECT occurred_at FROM cycle_timeline_entries
           WHERE cycle_uuid = ? AND entry_kind = 'save_point'
           ORDER BY id DESC LIMIT 1`,
        )
        .get(input.cycleUuid) as { occurred_at: string } | undefined)
    : undefined;
  return listSavePointFailureSpool(store.stateDir).filter((record) => {
    if (record.replayed_at) return false;
    if (record.game_id && record.game_id !== input.gameId) return false;
    if (record.cycle_uuid && record.cycle_uuid !== input.cycleUuid) return false;
    return !latestAnchor || record.occurred_at >= latestAnchor.occurred_at;
  });
}

export function recordDeferredSavePointEvidenceDurably(
  store: StateStore,
  evidence: import("./types.js").DeferredSavePointEvidence,
  context: Pick<RecordSavePointFailureInput, "actor" | "causationId" | "commandId" | "correlationId" | "gameId" | "cycleUuid" | "spanId">,
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

function hasNamedSavePoint(db: Database, cycle: CycleEnvelopeRow, savePointId: string | null | undefined): boolean {
  if (!savePointId || !cycle.head_revision?.trim()) return false;
  return Boolean(
    db
      .query(
        `SELECT 1
         FROM save_points
         JOIN campaigns ON campaigns.id = save_points.campaign_id
         JOIN cycle_timeline_entries
           ON cycle_timeline_entries.entry_kind = 'save_point'
          AND cycle_timeline_entries.entry_id = save_points.id
         WHERE save_points.id = ?
           AND campaigns.game_id = ?
           AND cycle_timeline_entries.cycle_uuid = ?
           AND LENGTH(TRIM(COALESCE(save_points.label, ''))) > 0
           AND save_points.commit_sha = ?`,
      )
      .get(savePointId, cycle.game_id, cycle.cycle_uuid, cycle.head_revision),
  );
}

function latestSavePointIsAtHead(db: Database, cycle: CycleEnvelopeRow): boolean {
  if (!cycle.head_revision?.trim()) return false;
  const latest = db
    .query(
      `SELECT save_points.commit_sha
       FROM cycle_timeline_entries
       LEFT JOIN save_points ON save_points.id = cycle_timeline_entries.entry_id
       WHERE cycle_timeline_entries.cycle_uuid = ?
         AND cycle_timeline_entries.entry_kind = 'save_point'
       ORDER BY cycle_timeline_entries.id DESC LIMIT 1`,
    )
    .get(cycle.cycle_uuid) as { commit_sha: string | null } | undefined;
  return latest?.commit_sha === cycle.head_revision;
}

export function closeCycle(
  store: StateStore,
  input: CloseCycleInput,
): CloseCycleDecision {
  if (input.actor !== "operator") throw new Error("Cycle close is operator-only");
  return immediateTransaction(store.db, () => {
    const cycle = selectCycle(store.db, input);
    if (cycle.status === "closed") {
      throw new Error(`Game cycle ${cycle.cycle_uuid} is already closed`);
    }
    const leaseRow = store.db
      .query("SELECT active_workflow_json FROM harness_state WHERE game_id = ?")
      .get(cycle.game_id) as { active_workflow_json: string | null } | undefined;
    const blockers: CloseCycleBlocked["blockers"] = [];
    if (leaseRow?.active_workflow_json) {
      blockers.push({
        code: "dispatch_lease_held",
        message: "A workflow still holds the dispatch lease.",
        source_kind: "game",
        source_id: cycle.game_id,
        recoverable: true,
      });
    }
    const namedSavePoint = hasNamedSavePoint(store.db, cycle, input.namedSavePointId);
    const unresolvedFailures = unresolvedSavePointFailures(store, {
      gameId: cycle.game_id,
      cycleUuid: cycle.cycle_uuid,
    });
    const latestAnchorAtHead = latestSavePointIsAtHead(store.db, cycle);
    if (
      input.worktreeDirtyBeyondHead ||
      cycle.save_point_stale ||
      unresolvedFailures.length > 0 ||
      !latestAnchorAtHead ||
      !namedSavePoint
    ) {
      blockers.push({
        code: "unshipped_work",
        message: input.worktreeDirtyBeyondHead
          ? "The worktree contains changes beyond the cycle head."
          : cycle.save_point_stale || unresolvedFailures.length > 0
            ? "Save-point capture evidence is stale after a failure."
            : !latestAnchorAtHead
              ? "The latest save point is not anchored at the current cycle head."
              : "A named save point at the current cycle head is required.",
        source_kind: "cycle",
        source_id: cycle.cycle_uuid,
        recoverable: true,
      });
    }
    const actionSpanId = input.spanId ?? newSpanId();
    if (input.correlationId !== cycle.cycle_uuid) {
      throw new Error(`Cycle event correlation_id must equal cycle UUID ${cycle.cycle_uuid}`);
    }
    if (blockers.length > 0) {
      const currentBlockers = parseBlockers(cycle.blockers_json);
      if (cycle.status !== "blocked" || JSON.stringify(currentBlockers) !== JSON.stringify(blockers)) {
        const blockedAt = input.occurredAt ?? currentTime();
        const enteringBlocked = cycle.status !== "blocked";
        const currentBlockerCodes = currentBlockers.map((blocker) => blocker.code);
        const blockerCodes = blockers.map((blocker) => blocker.code);
        const currentBlockerCodeSet = new Set(currentBlockerCodes);
        const stateRevision = cycle.revision + 1;
        const blocked = appendGameEvent(store.db, {
          actor: input.actor,
          causationId: requiredText(input.commandId, "commandId"),
          correlationId: cycle.cycle_uuid,
          eventType: enteringBlocked ? "cycle.blocked" : "cycle.blockers_updated",
          occurredAt: blockedAt,
          payload: enteringBlocked
            ? {
                from_status: cycle.status,
                to_status: "blocked",
                prior_status: cycle.status,
                blocker_codes: blockerCodes,
                source_identities: closeCycleSourceIdentities(blockers),
                recovery_choices: closeCycleRecoveryChoices(blockers),
                state_revision: stateRevision,
              }
            : {
                added_blocker_codes: blockerCodes.filter((code) => !currentBlockerCodeSet.has(code)),
                removed_blocker_codes: currentBlockerCodes.filter(
                  (code) => !blockers.some((blocker) => blocker.code === code),
                ),
                blocker_codes: blockerCodes,
                source_identities: closeCycleSourceIdentities(blockers),
                recovery_choices: closeCycleRecoveryChoices(blockers),
                state_revision: stateRevision,
              },
          gameId: cycle.game_id,
          ...eventSpan(actionSpanId),
          subjectKind: "cycle",
          subjectId: cycle.cycle_uuid,
          traceId: cycle.trace_id ?? `trace-cycle-${cycle.cycle_uuid}`,
        });
        updateEnvelope(
          store.db,
          cycle,
          blocked.eventId,
          blockedAt,
          "status = 'blocked', blockers_json = ?",
          [JSON.stringify(blockers)],
        );
      }
      return { closed: false, blockers };
    }

    let current = cycle;
    let closingCause = requiredText(input.commandId, "commandId");
    const occurredAt = input.occurredAt ?? currentTime();
    if (current.status !== "closing") {
      const closing = appendGameEvent(store.db, {
        actor: input.actor,
        causationId: closingCause,
        correlationId: current.cycle_uuid,
        eventType: "cycle.closing",
        occurredAt,
        payload: { from_status: current.status, to_status: "closing" },
        gameId: current.game_id,
        ...eventSpan(actionSpanId),
        subjectKind: "cycle",
        subjectId: current.cycle_uuid,
        traceId: current.trace_id ?? `trace-cycle-${current.cycle_uuid}`,
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
      current = selectCycle(store.db, { cycleUuid: current.cycle_uuid });
    }
    const event = appendGameEvent(store.db, {
      actor: input.actor,
      causationId: closingCause,
      correlationId: current.cycle_uuid,
      eventType: "cycle.closed",
      occurredAt,
      gameId: current.game_id,
      ...eventSpan(actionSpanId),
      subjectKind: "cycle",
      subjectId: current.cycle_uuid,
      traceId: current.trace_id ?? `trace-cycle-${current.cycle_uuid}`,
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
    const saved = getCycleByUuid(store.db, current.cycle_uuid);
    if (!saved) throw new Error(`Game cycle disappeared after close: ${current.cycle_uuid}`);
    return { closed: true, cycle: saved };
  });
}

export function listCycleTimeline(
  db: Database,
  cycleUuid: string,
  limit = 50,
): CycleTimelineEntry[] {
  const rows = db
    .query(
      `SELECT id, cycle_uuid, entry_kind, entry_id, occurred_at, payload_json, caused_by_event_id
       FROM cycle_timeline_entries
       WHERE cycle_uuid = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(cycleUuid, Math.max(1, Math.trunc(limit))) as Array<{
    id: number;
    cycle_uuid: string;
    entry_kind: CycleTimelineEntry["entry_kind"];
    entry_id: string;
    occurred_at: string;
    payload_json: string;
    caused_by_event_id: string | null;
  }>;
  return rows.map((row) => ({
    id: Number(row.id),
    cycle_uuid: row.cycle_uuid,
    entry_kind: row.entry_kind,
    entry_id: row.entry_id,
    occurred_at: row.occurred_at,
    payload: JSON.parse(row.payload_json) as JsonObject,
    caused_by_event_id: row.caused_by_event_id,
  }));
}
