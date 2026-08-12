import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import {
  projectSessionView,
  type CreateProjectSessionInput,
  type ManualStopMode,
  type PreparingPhaseState,
  type PrPhaseState,
  type ProjectSessionBlocker,
  type ProjectSessionRecord,
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
  commandId?: string;
  correlationId?: string;
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

function acceptTransition(
  db: Database,
  record: ProjectSessionRecord,
  patch: Parameters<typeof transitionProjectSession>[2]["patch"],
  eventType: string,
  options: SessionRuntimeTransitionOptions,
  payload: JsonObject = {},
): ProjectSessionRuntimeResult {
  const at = options.now ?? currentTime();
  return result(
    transitionProjectSession(db, record.id, {
      actor: options.actor ?? "runner",
      commandId: options.commandId ?? `command-${eventType.replaceAll(".", "-")}-${randomUUID()}`,
      correlationId: options.correlationId ?? patch.active_run_id ?? record.active_run_id ?? undefined,
      eventType,
      expectedRevision: record.revision,
      occurredAt: at,
      patch,
      payload: {
        previous_phase: record.phase,
        previous_status: record.status,
        phase: patch.phase ?? record.phase,
        status: patch.status ?? record.status,
        ...payload,
      },
      projectId: record.project_id,
      sessionUuid: record.session_uuid,
      spanId: options.spanId,
    }),
  );
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
  options: { detail?: string; data?: Partial<PreparingPhaseState> } & SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, setPreparingSubphase(record, at, subphase, options), "session.preparing_subphase_updated", { ...options, now: at }, { subphase });
}

export function markPreparingComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: { activeRunId?: string | null; completion?: Record<string, unknown> } & SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  const patch = completePreparing(record, at, options.completion);
  if (options.activeRunId !== undefined) patch.active_run_id = options.activeRunId || null;
  return acceptTransition(db, record, patch, "session.preparing_completed", { ...options, now: at });
}

export function startRunning(db: Database, selector: ProjectSessionSelector, options: SessionRuntimeTransitionOptions = {}): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, startRunningFromPreparing(record, at), "session.running_started", { ...options, now: at });
}

export function updateRunningSubphase(
  db: Database,
  selector: ProjectSessionSelector,
  subphase: RunningPhaseState["subphase"],
  options: { detail?: string; data?: Partial<RunningPhaseState> } & SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, setRunningSubphase(record, at, subphase, options), "session.running_subphase_updated", { ...options, now: at }, { subphase });
}

export function stopProjectSessionRun(
  db: Database,
  selector: ProjectSessionSelector,
  stopReason: RunningStopReason,
  options: { manualStopMode?: ManualStopMode; blockers?: ProjectSessionBlocker[] } & SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, stopRunning(record, at, stopReason, options), "session.running_stopped", { ...options, now: at }, { stop_reason: stopReason });
}

export function unblockProjectSessionRun(db: Database, selector: ProjectSessionSelector, options: SessionRuntimeTransitionOptions = {}): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, unblockStoppedRunning(record, at), "session.running_unblocked", { ...options, now: at });
}

export function blockProjectSessionRun(
  db: Database,
  selector: ProjectSessionSelector,
  blockers: ProjectSessionBlocker[],
  options: SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, blockRunning(record, blockers), "session.running_blocked", { ...options, now: at }, { blocker_codes: blockers.map((blocker) => blocker.code) });
}

export function enterPr(db: Database, selector: ProjectSessionSelector, options: { force?: boolean } & SessionRuntimeTransitionOptions = {}): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, enterPrPhase(record, at, options), "session.pr_entered", { ...options, now: at }, { forced: options.force ?? false });
}

export function finishPrFinalBuild(
  db: Database,
  selector: ProjectSessionSelector,
  options: { finalBuild?: Record<string, unknown> } & SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, completeFinalBuild(record, at, options.finalBuild), "session.pr_final_build_completed", { ...options, now: at });
}

export function updatePrSubphase(
  db: Database,
  selector: ProjectSessionSelector,
  subphase: PrPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PrPhaseState> } & SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, setPrSubphase(record, at, subphase, options), "session.pr_subphase_updated", { ...options, now: at }, { subphase });
}

export function markPrComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: { completion?: Record<string, unknown> } & SessionRuntimeTransitionOptions = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return acceptTransition(db, record, completePr(record, at, options.completion), "session.pr_completed", { ...options, now: at });
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
  const transitionContext = {
    actor: "operator" as const,
    commandId: text(body.commandId, text(body.command_id)) || `command-session-${command}-${randomUUID()}`,
    correlationId: text(body.correlationId, text(body.correlation_id)) || undefined,
    spanId: text(body.spanId, text(body.span_id)) || undefined,
  };

  switch (command) {
    case "read":
      return {
        payload: responsePayload(activeProjectSessionProjection(db, projectId), listProjectSessions(db, projectId)),
      };
    case "create": {
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
          actor: transitionContext.actor,
          commandId: transitionContext.commandId,
          correlationId: transitionContext.correlationId,
          spanId: transitionContext.spanId,
          worktreeIdentity: text(body.worktreeIdentity, text(body.worktree_identity)) || undefined,
          openingSyncId: text(body.openingSyncId, text(body.opening_sync_id)) || null,
        }),
      );
    }
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
