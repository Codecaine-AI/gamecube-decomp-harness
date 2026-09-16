import type { Database } from "bun:sqlite";
import { casRunEnvelope, immediateTransaction, now as currentTime, type StateStore } from "../orchestrator-state/index.js";
import { appendGameEvent, eventSpan, newSpanId, type JsonObject, type EventActor } from "./events.js";
import { quietGit } from "../harness-runtime/phases/pr/pr-sync.js";
import { getHarnessState, transitionHarnessState } from "./state.js";

export interface RecordEpochCompletedInput {
  gameId?: string;
  epochId: string;
  runId: string;
  integrationCommit: string;
  commandId: string;
  correlationId: string;
  causationId?: string;
  spanId?: string;
  occurredAt?: string;
  actor: EventActor;
  scoreDelta?: number | null;
  payload?: JsonObject;
}
export interface EpochIntegrationEntry {
  id: number;
  harnessId: string;
  epochId: string;
  occurredAt: string;
  payload: JsonObject;
  caused_by_event_id: string;
}
type EpochBoundaryRunRow = { id: string; game_id: string | null; game_repo_root: string | null; revision: number; trace_id: string | null };
function requiredText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function verifyRunCommitExists(run: EpochBoundaryRunRow, commitSha: string): void {
  if (!run.game_repo_root?.trim()) throw new Error(`Run ${run.id} has no repository for commit verification`);
  if (quietGit(run.game_repo_root, ["cat-file", "-e", `${commitSha}^{commit}`]).exitCode !== 0)
    throw new Error(`Epoch integration commit ${commitSha} does not exist in the repository for run ${run.id}`);
}

export function recordEpochCompletedInTransaction(db: Database, input: RecordEpochCompletedInput): EpochIntegrationEntry {
  if (!db.inTransaction) throw new Error("Epoch acceptance requires an active transaction");
  for (const field of ["runId", "epochId", "integrationCommit", "commandId"] as const) requiredText(input[field], field);
  const run = db.query("SELECT id, game_id, game_repo_root, revision, trace_id FROM runs WHERE id = ?")
    .get(input.runId) as EpochBoundaryRunRow | null;
  if (!run?.game_id) throw new Error(`Run ${input.runId} has no game owner`);
  const harness = getHarnessState(db, run.game_id);
  if (!harness) throw new Error(`Harness is not initialized for ${run.game_id}`);
  if (input.gameId && input.gameId !== run.game_id) throw new Error(`Run ${run.id} does not belong to requested game ${input.gameId}`);
  if (input.correlationId !== run.id) throw new Error(`Event correlation_id must equal workflow identity ${run.id}`);
  const existing = db.query(`SELECT id, occurred_at, event_id, payload_json FROM harness_timeline_entries
    WHERE game_id = ? AND kind = 'epoch_completed' AND json_extract(payload_json, '$.epochId') = ?`)
    .get(run.game_id, input.epochId) as { id: number; occurred_at: string; event_id: string; payload_json: string } | null;
  const payload: JsonObject = { ...(input.payload ?? {}), epoch_id: input.epochId,
    integration_commit: input.integrationCommit, score_delta: input.scoreDelta ?? null, new_head: input.integrationCommit };
  if (existing) {
    const prior = JSON.parse(existing.payload_json);
    if (prior.runId !== run.id || prior.source?.resulting_head !== input.integrationCommit) {
      throw new Error(`Epoch ${input.epochId} already accepted with different run or integration commit`);
    }
    db.query("DELETE FROM pending_integrations WHERE run_id = ? AND epoch_id = ?").run(run.id, input.epochId);
    return { id: existing.id, harnessId: harness.identity.harness_id,
      epochId: input.epochId, occurredAt: existing.occurred_at, payload: prior.evidence, caused_by_event_id: existing.event_id };
  }
  if (harness.history.run_id !== run.id) throw new Error(`Harness does not name active run ${run.id}`);
  const epoch = db.query("SELECT run_id FROM epochs WHERE id = ?").get(input.epochId) as { run_id: string } | null;
  if (!epoch || epoch.run_id !== run.id) throw new Error(`Epoch ${input.epochId} does not belong to run ${run.id}`);
  verifyRunCommitExists(run, input.integrationCommit);
  const occurredAt = input.occurredAt ?? currentTime();
  const event = appendGameEvent(db, {
    actor: input.actor, causationId: input.causationId ?? requiredText(input.commandId, "commandId"),
    correlationId: run.id, occurredAt, gameId: run.game_id,
    ...eventSpan(input.spanId ?? newSpanId()), traceId: requiredText(run.trace_id ?? "", `Run ${run.id} trace_id`),
    eventType: "run.epoch_integrated", subjectKind: "run", subjectId: run.id, payload,
  });
  const accepted = transitionHarnessState(db, {
    gameId: run.game_id, expectedRevision: harness.identity.revision, commandId: input.commandId, now: occurredAt,
    patch: { source: { head: input.integrationCommit }, history: { run_id: run.id, epoch_id: input.epochId } },
    boundary: { eventId: event.eventId, kind: "epoch_completed", outcome: "accepted", runId: run.id,
      epochId: input.epochId, evidence: payload },
  });
  if (!casRunEnvelope(db, { eventId: event.eventId, expectedRevision: Number(run.revision),
    headRevision: input.integrationCommit, runId: run.id })) throw new Error(`Stale run revision ${run.revision} for ${run.id}`);
  db.query("DELETE FROM pending_integrations WHERE run_id = ? AND epoch_id = ?").run(run.id, input.epochId);
  return { id: accepted.history.timeline_cursor, harnessId: harness.identity.harness_id,
    epochId: input.epochId, occurredAt: occurredAt, payload, caused_by_event_id: event.eventId };
}


export function recordEpochCompleted(store: StateStore, input: RecordEpochCompletedInput): EpochIntegrationEntry {
  return immediateTransaction(store.db, () => recordEpochCompletedInTransaction(store.db, input));
}
