import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { immediateTransaction } from "../orchestrator-state/storage/transaction.js";
import type { Blocker } from "./types.js";

export type ReadinessStatus = "pending" | "ready" | "blocked";
/** Non-blocking operator information (upstream drift, ...); never gates admission. */
export interface HarnessNotice {
  code: string;
  message: string;
  source_kind: string;
  source_id: string;
  observed_at: string;
  detail?: Record<string, unknown>;
}
export interface HarnessState {
  identity: { game_id: string; harness_id: string; revision: number };
  source: { worktree: string; head: string | null; upstream_revision: string | null; configuration_revision: string };
  execution: { desired: "run" | "paused"; workflow: "sync" | "run" | "none"; status: "initializing" | "active" | "idle" | "paused" | "blocked"; blockers: Blocker[] };
  readiness: { build: ReadinessStatus; sources: ReadinessStatus; sandbox: ReadinessStatus; evidence: ReadinessStatus };
  history: { run_id: string | null; epoch_id: string | null; sync_id: string | null; timeline_cursor: number; save_point_id: string | null };
  notices: HarnessNotice[];
}
export interface HarnessBoundary {
  eventId: string;
  kind: "sandbox_validated" | "initial_sync_accepted" | "epoch_completed" | "sync_completed" | "remote_application" | "epoch_prepared" | "epoch_admitted" | "pause_requested" | "resumed" | "recovered" | "failed" | "save_point" | "upstream_drift" | "operator" | "legacy";
  outcome: string;
  runId?: string | null;
  epochId?: string | null;
  syncId?: string | null;
  source?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  recovery?: Record<string, unknown> | null;
}
export interface HarnessTimelineEntry extends HarnessBoundary {
  identity: { game_id: string; harness_id: string; event_id: string; order: number; occurred_at: string; command_id: string };
}
export interface InitializeHarnessStateInput {
  gameId: string; harnessId?: string; worktree: string; configurationRevision: string; commandId: string; now?: string;
}
export interface TransitionHarnessStateInput {
  gameId: string; expectedRevision: number; commandId: string; now?: string;
  patch: { source?: Partial<HarnessState["source"]>; execution?: Partial<HarnessState["execution"]>; readiness?: Partial<HarnessState["readiness"]>; history?: Partial<Omit<HarnessState["history"], "timeline_cursor">>; notices?: HarnessNotice[] };
  boundary?: HarnessBoundary;
}
function required(value: string, field: string): string {
  if (!value?.trim()) throw new Error(`${field} is required`);
  return value;
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function requestIdentity(input: object): string {
  const { now: _now, ...request } = input as Record<string, unknown>;
  return canonical(request);
}
function replay(db: Database, gameId: string, commandId: string, request: string): HarnessState | null {
  required(gameId, "gameId"); required(commandId, "commandId");
  const row = db.query("SELECT request_json, result_json FROM harness_commands WHERE game_id = ? AND command_id = ?").get(gameId, commandId) as { request_json: string; result_json: string } | null;
  if (!row) return null;
  if (row.request_json !== request) throw new Error(`Harness command ${commandId} was reused with different input`);
  return JSON.parse(row.result_json);
}
function remember(db: Database, gameId: string, commandId: string, request: string, result: HarnessState): void {
  db.query("INSERT INTO harness_commands VALUES (?, ?, ?, ?)").run(gameId, commandId, request, JSON.stringify(result));
}
export function getHarnessState(db: Database, gameId: string): HarnessState | null {
  required(gameId, "gameId");
  const row = db.query("SELECT state_json FROM harness_state WHERE game_id = ?").get(gameId) as { state_json: string } | null;
  if (!row) return null;
  const state = JSON.parse(row.state_json) as HarnessState;
  // Rows written before notices existed read back with an empty list.
  if (!Array.isArray(state.notices)) state.notices = [];
  return state;
}
export function initializeHarnessState(db: Database, input: InitializeHarnessStateInput): HarnessState {
  return immediateTransaction(db, () => {
    const request = requestIdentity(input);
    const previous = replay(db, input.gameId, input.commandId, request);
    if (previous) return previous;
    if (getHarnessState(db, input.gameId)) throw new Error(`Harness already initialized for ${input.gameId}`);
    const state: HarnessState = {
      identity: { game_id: input.gameId, harness_id: required(input.harnessId ?? randomUUID(), "harnessId"), revision: 0 },
      source: { worktree: required(input.worktree, "worktree"), head: null, upstream_revision: null, configuration_revision: required(input.configurationRevision, "configurationRevision") },
      execution: { desired: "paused", workflow: "none", status: "initializing", blockers: [] },
      readiness: { build: "pending", sources: "pending", sandbox: "pending", evidence: "pending" },
      history: { run_id: null, epoch_id: null, sync_id: null, timeline_cursor: 0, save_point_id: null },
      notices: [],
    };
    const now = input.now ?? new Date().toISOString();
    db.query("INSERT INTO harness_state VALUES (?, ?, ?, ?, ?, ?)").run(input.gameId, state.identity.harness_id, 0, JSON.stringify(state), now, now);
    remember(db, input.gameId, input.commandId, request, state);
    return state;
  });
}
export function transitionHarnessState(db: Database, input: TransitionHarnessStateInput): HarnessState {
  return immediateTransaction(db, () => {
    const request = requestIdentity(input);
    const previous = replay(db, input.gameId, input.commandId, request);
    if (previous) return previous;
    const state = getHarnessState(db, input.gameId);
    if (!state) throw new Error(`Harness is not initialized for ${input.gameId}`);
    if (state.identity.revision !== input.expectedRevision) throw new Error(`Harness revision conflict: expected ${input.expectedRevision}, found ${state.identity.revision}`);
    const wasActiveRun = state.execution.workflow === "run" && state.execution.status === "active";
    const priorHead = state.source.head;
    const priorUpstream = state.source.upstream_revision;
    const priorConfiguration = state.source.configuration_revision;
    if (input.patch.source) Object.assign(state.source, input.patch.source);
    if (state.source.head !== priorHead || state.source.configuration_revision !== priorConfiguration) {
      state.readiness.build = "pending";
      state.readiness.evidence = "pending";
      if (state.source.configuration_revision !== priorConfiguration) {
        state.readiness.sandbox = "pending";
        state.readiness.sources = "pending";
      }
    }
    // A drift notice describes the prior accepted upstream; a new one retires it.
    if (state.source.upstream_revision !== priorUpstream) state.notices = state.notices.filter(notice => notice.code !== "upstream_drift");
    if (input.patch.execution) Object.assign(state.execution, input.patch.execution);
    if (input.patch.readiness) Object.assign(state.readiness, input.patch.readiness);
    if (input.patch.history) Object.assign(state.history, input.patch.history);
    if (input.patch.notices) state.notices = input.patch.notices.map(notice => ({ ...notice }));
    required(state.source.worktree, "worktree"); required(state.source.configuration_revision, "configuration_revision");
    const admittingRun = (!wasActiveRun && state.execution.workflow === "run" && state.execution.status === "active") || input.boundary?.kind === "epoch_admitted";
    if (admittingRun &&
      (!state.source.head || Object.values(state.readiness).some(value => value !== "ready") || state.execution.blockers.length > 0 || state.execution.desired !== "run")) {
      throw new Error("Run admission requires accepted head, ready gates, no blockers, and desired run");
    }
    const now = input.now ?? new Date().toISOString();
    if (input.boundary) {
      required(input.boundary.eventId, "eventId"); required(input.boundary.outcome, "outcome");
      const boundary = { ...input.boundary, source: { prior_head: priorHead, resulting_head: state.source.head, prior_upstream: priorUpstream, accepted_upstream: state.source.upstream_revision, configuration: state.source.configuration_revision, ...input.boundary.source } };
      const inserted = db.query("INSERT INTO harness_timeline_entries(game_id, harness_id, event_id, command_id, kind, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(input.gameId, state.identity.harness_id, boundary.eventId, input.commandId, boundary.kind, now, JSON.stringify(boundary));
      state.history.timeline_cursor = Number(inserted.lastInsertRowid);
    }
    state.identity.revision += 1;
    const result = db.query("UPDATE harness_state SET revision = ?, state_json = ?, updated_at = ? WHERE game_id = ? AND revision = ?")
      .run(state.identity.revision, JSON.stringify(state), now, input.gameId, input.expectedRevision);
    if (result.changes !== 1) throw new Error("Harness revision conflict");
    remember(db, input.gameId, input.commandId, request, state);
    return state;
  });
}
export function getHarnessTimeline(db: Database, gameId: string, options: { after?: number; before?: number; order?: "asc" | "desc"; limit?: number } = {}): HarnessTimelineEntry[] {
  required(gameId, "gameId");
  const rows = db.query(`SELECT * FROM harness_timeline_entries WHERE game_id = ? AND id > ? AND id < ? ORDER BY id ${options.order === "desc" ? "DESC" : "ASC"} LIMIT ?`)
    .all(gameId, options.after ?? 0, options.before ?? Number.MAX_SAFE_INTEGER, Math.min(500, Math.max(1, Math.trunc(options.limit ?? 50)))) as Array<{ id: number; game_id: string; harness_id: string; event_id: string; command_id: string; occurred_at: string; payload_json: string }>;
  return rows.map(row => ({ ...JSON.parse(row.payload_json), identity: { game_id: row.game_id, harness_id: row.harness_id, event_id: row.event_id, order: row.id, occurred_at: row.occurred_at, command_id: row.command_id } }));
}
