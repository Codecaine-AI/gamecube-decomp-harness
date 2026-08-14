import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import {
  projectSessionView,
  type CreateProjectSessionInput,
  type ManualStopMode,
  type PreparingPhaseState,
  type PrPhaseState,
  type ProjectSessionBlocker,
  type ProjectSessionDerivedStatusTransitionInput,
  type ProjectSessionPatch,
  type ProjectSessionRecord,
  type ProjectSessionRuntimeBlocker,
  type ProjectSessionStatusPreservingEventType,
  type ProjectSessionStatusPreservingTransitionInput,
  type ProjectSessionStatusTransitionEventType,
  type ProjectSessionView,
  type RunningPhaseState,
  type RunningStopReason,
} from "@server/core/project-session";
import type { EventActor, JsonObject } from "@server/core/project-state/events.js";
import {
  activeProjectSessionProjection,
  createProjectSession,
  getActiveProjectSession,
  getOrCreateActiveProjectSession,
  getProjectSessionBySelector,
  listProjectSessions,
  transitionProjectSession,
} from "@server/core/project-session/store";
import { now as currentTime } from "@server/core/orchestrator-state";
import { completePreparing, setPreparingSubphase, startRunningFromPreparing } from "./phases/preparing/index.js";
import { completeSession } from "./phases/complete/index.js";
import { completeFinalBuild, completePr, enterPrPhase, setPrSubphase } from "./phases/pr/index.js";
import { blockRunning, setRunningSubphase, stopRunning, unblockStoppedRunning } from "./phases/running/index.js";

export interface ProjectSessionSelector {
  id?: string | null;
  sessionUuid?: string | null;
  projectId?: string | null;
}

export interface ProjectSessionRuntimeResult {
  record: ProjectSessionRecord;
  view: ProjectSessionView;
}

export type ProjectSessionCommand =
  | "create"
  | "enter-pr"
  | "finish-pr-final-build"
  | "mark-pr-complete"
  | "mark-preparing-complete"
  | "publish-pr"
  | "read"
  | "start-running"
  | "stop-running"
  | "update-pr-subphase"
  | "update-preparing-subphase"
  | "update-running-subphase";

export interface ProjectSessionCommandInput {
  baseRef?: string | null;
  body?: Record<string, unknown>;
  force?: boolean;
  projectId: string;
}

export interface ProjectSessionCommandResponse {
  payload: Record<string, unknown>;
  status?: number;
}

export interface SessionRuntimeTransitionOptions {
  actor?: EventActor;
  causationId?: string;
  commandId?: string;
  correlationId: string;
  now?: string;
  spanId?: string;
}

function requireSession(db: Database, selector: ProjectSessionSelector): ProjectSessionRecord {
  const record = getProjectSessionBySelector(db, selector);
  if (!record) throw new Error("No matching active project session");
  return record;
}

function result(record: ProjectSessionRecord): ProjectSessionRuntimeResult {
  return {
    record,
    view: projectSessionView(record),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function requireBlockerSourceValue(
  blocker: ProjectSessionBlocker,
  index: number,
  field: "source_kind" | "source_id",
): string {
  const value = typeof blocker[field] === "string" ? blocker[field].trim() : "";
  if (!value) {
    throw new Error(`blockers[${index}] must include ${field}`);
  }
  return value;
}

function normalizeRuntimeBlockers(
  blockers: readonly ProjectSessionBlocker[],
): ProjectSessionBlocker[] {
  return blockers.map((blocker, index) => {
    const sourceKind = requireBlockerSourceValue(blocker, index, "source_kind");
    const sourceId = requireBlockerSourceValue(blocker, index, "source_id");
    if (!Array.isArray(blocker.recovery_choices)) {
      throw new Error(`blockers[${index}] must include explicit recovery_choices`);
    }
    const recoveryChoices = blocker.recovery_choices.map((choice, choiceIndex) => {
      if (typeof choice !== "string" || choice.trim() === "") {
        throw new Error(`blockers[${index}].recovery_choices[${choiceIndex}] must be a nonblank string`);
      }
      return choice.trim();
    });
    return {
      ...blocker,
      source_kind: sourceKind,
      source_id: sourceId,
      recovery_choices: uniqueStrings(recoveryChoices),
    };
  });
}

function progressPayload(
  record: ProjectSessionRecord,
  patch: ProjectSessionPatch,
  payload: JsonObject,
): JsonObject {
  return {
    previous_phase: record.phase,
    previous_status: record.status,
    phase: patch.phase ?? record.phase,
    status: patch.status ?? record.status,
    ...payload,
  };
}

const SESSION_RUNTIME_STATUS_DESTINATIONS = {
  "session.running_unblocked": "active",
  "session.blocked": "blocked",
  "session.complete": "complete",
} as const satisfies Partial<
  Record<ProjectSessionStatusTransitionEventType, ProjectSessionRecord["status"]>
>;

type SessionRuntimeStatusEventType = keyof typeof SESSION_RUNTIME_STATUS_DESTINATIONS;

function commitStatusPreservingTransition<
  const TEvent extends ProjectSessionStatusPreservingEventType,
>(
  db: Database,
  record: ProjectSessionRecord,
  patch: ProjectSessionStatusPreservingTransitionInput<TEvent>["patch"],
  eventType: TEvent,
  options: SessionRuntimeTransitionOptions,
  payload: JsonObject = {},
): ProjectSessionRuntimeResult {
  const at = options.now ?? currentTime();
  if (options.correlationId !== record.session_uuid) {
    throw new Error(`Session event correlation_id must equal session UUID ${record.session_uuid}`);
  }
  const input: ProjectSessionStatusPreservingTransitionInput<TEvent> = {
    actor: options.actor ?? "runner",
    commandId: options.commandId ?? `command-${eventType.replaceAll(".", "-")}-${randomUUID()}`,
    correlationId: record.session_uuid,
    causationId: options.causationId,
    eventType,
    expectedRevision: record.revision,
    occurredAt: at,
    patch,
    payload: progressPayload(record, patch, payload),
    projectId: record.project_id,
    sessionUuid: record.session_uuid,
    spanId: options.spanId,
  };
  return result(transitionProjectSession(db, record.id, input));
}

function commitStatusTransition<const TEvent extends SessionRuntimeStatusEventType>(
  db: Database,
  record: ProjectSessionRecord,
  patch: ProjectSessionDerivedStatusTransitionInput<TEvent>["patch"],
  eventType: TEvent,
  options: SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const at = options.now ?? currentTime();
  if (options.correlationId !== record.session_uuid) {
    throw new Error(`Session event correlation_id must equal session UUID ${record.session_uuid}`);
  }
  const input: ProjectSessionDerivedStatusTransitionInput<TEvent> = {
    actor: options.actor ?? "runner",
    commandId: options.commandId ?? `command-${eventType.replaceAll(".", "-")}-${randomUUID()}`,
    correlationId: record.session_uuid,
    causationId: options.causationId,
    eventType,
    expectedRevision: record.revision,
    occurredAt: at,
    patch,
    projectId: record.project_id,
    sessionUuid: record.session_uuid,
    spanId: options.spanId,
  };
  return result(transitionProjectSession(db, record.id, input));
}

function acceptStatusPreservingTransition(
  db: Database,
  record: ProjectSessionRecord,
  patch: ProjectSessionPatch,
  eventType: ProjectSessionStatusPreservingEventType,
  options: SessionRuntimeTransitionOptions,
  payload: JsonObject = {},
): ProjectSessionRuntimeResult {
  if (patch.status !== undefined) {
    throw new Error(`${eventType} must preserve project session status`);
  }
  return commitStatusPreservingTransition(
    db,
    record,
    withoutStatus(patch),
    eventType,
    options,
    payload,
  );
}

function acceptStatusTransition<TEvent extends SessionRuntimeStatusEventType>(
  db: Database,
  record: ProjectSessionRecord,
  patch: ProjectSessionPatch,
  eventType: TEvent,
  options: SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const destination = SESSION_RUNTIME_STATUS_DESTINATIONS[eventType];
  if (!isSessionRuntimeStatusPatch(patch, eventType)) {
    throw new Error(`${eventType} requires destination status ${destination}`);
  }
  return commitStatusTransition(
    db,
    record,
    patch,
    eventType,
    options,
  );
}

function isSessionRuntimeStatusPatch<TEvent extends SessionRuntimeStatusEventType>(
  patch: ProjectSessionPatch,
  eventType: TEvent,
): patch is ProjectSessionDerivedStatusTransitionInput<TEvent>["patch"] {
  return patch.status === SESSION_RUNTIME_STATUS_DESTINATIONS[eventType];
}

function withoutStatus(
  patch: ProjectSessionPatch,
): Omit<ProjectSessionPatch, "status"> & { status?: never } {
  const { status: _status, ...preservingPatch } = patch;
  return preservingPatch;
}

function acceptBlockedOrSemanticTransition(
  db: Database,
  record: ProjectSessionRecord,
  patch: ProjectSessionPatch,
  options: SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  if (patch.status !== "blocked") {
    throw new Error("blocked path requires destination status blocked");
  }
  const nextBlockers = normalizeRuntimeBlockers(patch.blockers_json ?? []);
  if (nextBlockers.length === 0) {
    throw new Error("blocked path requires at least one blocker");
  }
  const blockersChanged =
    JSON.stringify(nextBlockers) !== JSON.stringify(record.blockers_json);
  const blockedPatch = {
    ...patch,
    blockers_json: nextBlockers,
  } satisfies ProjectSessionPatch;
  if (record.status !== "blocked") {
    return acceptStatusTransition(
      db,
      record,
      blockedPatch,
      "session.blocked",
      options,
    );
  }
  if (blockersChanged) {
    return acceptStatusPreservingTransition(
      db,
      record,
      withoutStatus(blockedPatch),
      "session.blockers_updated",
      options,
    );
  }
  return result(record);
}

export function ensureProjectSession(db: Database, input: CreateProjectSessionInput): ProjectSessionRuntimeResult {
  return result(getOrCreateActiveProjectSession(db, input));
}

export function createNewProjectSession(db: Database, input: CreateProjectSessionInput): ProjectSessionRuntimeResult {
  return result(createProjectSession(db, input));
}

export function updatePreparingSubphase(
  db: Database,
  selector: ProjectSessionSelector,
  subphase: PreparingPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PreparingPhaseState> } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, setPreparingSubphase(record, at, subphase, options), "session.preparing_subphase_updated", { ...options, now: at }, { subphase });
}

export function markPreparingComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: { activeRunId?: string | null; completion?: Record<string, unknown> } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  const patch = completePreparing(record, at, options.completion);
  if (options.activeRunId !== undefined) patch.active_run_id = options.activeRunId || null;
  return acceptStatusPreservingTransition(db, record, patch, "session.preparing_completed", { ...options, now: at });
}

export function startRunning(db: Database, selector: ProjectSessionSelector, options: SessionRuntimeTransitionOptions): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, startRunningFromPreparing(record, at), "session.running_started", { ...options, now: at });
}

export function updateRunningSubphase(
  db: Database,
  selector: ProjectSessionSelector,
  subphase: RunningPhaseState["subphase"],
  options: { detail?: string; data?: Partial<RunningPhaseState> } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, setRunningSubphase(record, at, subphase, options), "session.running_subphase_updated", { ...options, now: at }, { subphase });
}

export function stopProjectSessionRun(
  db: Database,
  selector: ProjectSessionSelector,
  stopReason: RunningStopReason,
  options: { manualStopMode?: ManualStopMode; blockers?: ProjectSessionRuntimeBlocker[] } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  const patch = stopRunning(record, at, stopReason, options);
  if (patch.status === "blocked") {
    return acceptBlockedOrSemanticTransition(db, record, patch, { ...options, now: at });
  }
  return acceptStatusPreservingTransition(db, record, withoutStatus(patch), "session.running_stopped", { ...options, now: at }, { stop_reason: stopReason });
}

export function unblockProjectSessionRun(db: Database, selector: ProjectSessionSelector, options: SessionRuntimeTransitionOptions): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusTransition(db, record, unblockStoppedRunning(record, at), "session.running_unblocked", { ...options, now: at });
}

export function blockProjectSessionRun(
  db: Database,
  selector: ProjectSessionSelector,
  blockers: ProjectSessionRuntimeBlocker[],
  options: SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptBlockedOrSemanticTransition(db, record, blockRunning(record, blockers), { ...options, now: at });
}

export function enterPr(db: Database, selector: ProjectSessionSelector, options: { force?: boolean } & SessionRuntimeTransitionOptions): ProjectSessionRuntimeResult {
  let record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  const transitionOptions = {
    ...options,
    commandId: options.commandId ?? `command-session-enter-pr-${randomUUID()}`,
    now: at,
    spanId: options.spanId ?? `span-${randomUUID()}`,
  };
  let causationId = options.causationId;
  if (record.status === "blocked") {
    if (!options.force) {
      throw new Error("Cannot enter PR while the session remains blocked");
    }
    const unblocked = acceptStatusTransition(
      db,
      record,
      unblockStoppedRunning(record, at),
      "session.running_unblocked",
      transitionOptions,
    );
    record = unblocked.record;
    causationId = unblocked.record.caused_by_event_id ?? options.causationId;
  }
  if (record.status !== "active") {
    throw new Error(`session.pr_entered requires active session status; received ${record.status}`);
  }
  return acceptStatusPreservingTransition(
    db,
    record,
    enterPrPhase(record, at, options),
    "session.pr_entered",
    { ...transitionOptions, causationId },
    { forced: options.force ?? false },
  );
}

export function finishPrFinalBuild(
  db: Database,
  selector: ProjectSessionSelector,
  options: { finalBuild?: Record<string, unknown> } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, completeFinalBuild(record, at, options.finalBuild), "session.pr_final_build_completed", { ...options, now: at });
}

export function updatePrSubphase(
  db: Database,
  selector: ProjectSessionSelector,
  subphase: PrPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PrPhaseState> } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, setPrSubphase(record, at, subphase, options), "session.pr_subphase_updated", { ...options, now: at }, { subphase });
}

export function markPrComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: { completion?: Record<string, unknown> } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, completePr(record, at, options.completion), "session.pr_completed", { ...options, now: at });
}

export function markSessionComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: {
    completedBy?: string;
    completedReason?: string;
    finalSavePoint?: Record<string, unknown>;
    settledPrCounts?: Record<string, unknown>;
  } & SessionRuntimeTransitionOptions,
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusTransition(
    db,
    record,
    completeSession(record, at, options),
    "session.complete",
    { ...options, now: at },
  );
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function commandSelector(body: Record<string, unknown>, projectId: string): ProjectSessionSelector {
  const explicitId = text(body.id);
  const sessionId = text(body.sessionId);
  const sessionIdLooksLikeRowId = sessionId.startsWith("project-session:");
  return {
    id: explicitId || (sessionIdLooksLikeRowId ? sessionId : ""),
    sessionUuid: text(body.sessionUuid, text(body.session_uuid, sessionIdLooksLikeRowId ? "" : sessionId)),
    projectId,
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function responsePayload(view: unknown, history: unknown[] = []): Record<string, unknown> {
  return {
    projectSession: view,
    history,
  };
}

function commandResult(db: Database, projectId: string, runtimeResult: ProjectSessionRuntimeResult): ProjectSessionCommandResponse {
  return {
    payload: responsePayload(runtimeResult.view, listProjectSessions(db, projectId)),
  };
}

export function handleProjectSessionCommand(
  db: Database,
  command: ProjectSessionCommand,
  input: ProjectSessionCommandInput,
): ProjectSessionCommandResponse {
  const body = input.body ?? {};
  const projectId = input.projectId;
  const selector = commandSelector(body, projectId);
  const actor = "operator" as const;
  const commandId = text(body.commandId, text(body.command_id)) || `command-session-${command}-${randomUUID()}`;
  const spanId = text(body.spanId, text(body.span_id)) || undefined;
  if (command === "read") {
    return {
      payload: responsePayload(activeProjectSessionProjection(db, projectId), listProjectSessions(db, projectId)),
    };
  }
  if (command === "create") {
    if (getActiveProjectSession(db, projectId)) {
      return {
        payload: {
          error: "An active project session already exists",
          projectSession: activeProjectSessionProjection(db, projectId),
        },
        status: 409,
      };
    }
    return commandResult(
      db,
      projectId,
      createNewProjectSession(db, {
        projectId,
        baseRef: text(body.baseRef, input.baseRef ?? "") || null,
        baseSha: text(body.baseSha) || null,
        activeRunId: text(body.activeRunId, text(body.runId)) || null,
        actor,
        commandId,
        spanId,
        worktreeIdentity: text(body.worktreeIdentity, text(body.worktree_identity)) || undefined,
        openingSyncId: text(body.openingSyncId, text(body.opening_sync_id)) || null,
      }),
    );
  }
  const suppliedCorrelationId = text(body.correlationId, text(body.correlation_id)).trim();
  const actionSession = requireSession(db, selector);
  if (suppliedCorrelationId && suppliedCorrelationId !== actionSession.session_uuid) {
    throw new Error(`Session event correlation_id must equal session UUID ${actionSession.session_uuid}`);
  }
  const transitionContext = {
    actor,
    commandId,
    correlationId: actionSession.session_uuid,
    spanId,
  };

  switch (command) {
    case "update-preparing-subphase":
      return commandResult(
        db,
        projectId,
        updatePreparingSubphase(db, selector, text(body.subphase) as PreparingPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
          ...transitionContext,
        }),
      );
    case "mark-preparing-complete":
      return commandResult(
        db,
        projectId,
        markPreparingComplete(db, selector, {
          activeRunId: text(body.activeRunId, text(body.active_run_id)) || undefined,
          completion: objectValue(body.completion),
          ...transitionContext,
        }),
      );
    case "start-running":
      return commandResult(db, projectId, startRunning(db, selector, transitionContext));
    case "update-running-subphase":
      return commandResult(
        db,
        projectId,
        updateRunningSubphase(db, selector, text(body.subphase) as RunningPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
          data: objectValue(body.data) as Partial<RunningPhaseState>,
          ...transitionContext,
        }),
      );
    case "stop-running":
      return commandResult(
        db,
        projectId,
        stopProjectSessionRun(db, selector, text(body.stopReason, text(body.stop_reason, "manual_stop")) as RunningStopReason, {
          manualStopMode: text(body.manualStopMode, text(body.manual_stop_mode)) as ManualStopMode,
          ...transitionContext,
        }),
      );
    case "enter-pr":
      return commandResult(db, projectId, enterPr(db, selector, { force: input.force || body.force === true, ...transitionContext }));
    case "finish-pr-final-build":
      return commandResult(db, projectId, finishPrFinalBuild(db, selector, { finalBuild: objectValue(body.finalBuild), ...transitionContext }));
    case "update-pr-subphase":
      return commandResult(
        db,
        projectId,
        updatePrSubphase(db, selector, text(body.subphase) as PrPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
          ...transitionContext,
        }),
      );
    case "publish-pr":
      return commandResult(db, projectId, updatePrSubphase(db, selector, "publish", transitionContext));
    case "mark-pr-complete":
      return commandResult(db, projectId, markPrComplete(db, selector, { completion: objectValue(body.completion), ...transitionContext }));
  }
}
