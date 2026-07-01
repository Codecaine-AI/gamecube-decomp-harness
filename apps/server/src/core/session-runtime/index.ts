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
import {
  activeProjectSessionProjection,
  createProjectSession,
  getActiveProjectSession,
  getOrCreateActiveProjectSession,
  getProjectSessionBySelector,
  listProjectSessions,
  updateProjectSession,
} from "@server/core/project-session/store";
import { now as currentTime } from "@server/core/orchestrator-state";
import { completeSession } from "./phases/complete/index.js";
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
  | "complete"
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
  options: { detail?: string; data?: Partial<PreparingPhaseState>; now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, setPreparingSubphase(record, at, subphase, options), at));
}

export function markPreparingComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: { activeRunId?: string | null; completion?: Record<string, unknown>; now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  const patch = completePreparing(record, at, options.completion);
  if (options.activeRunId !== undefined) patch.active_run_id = options.activeRunId || null;
  return result(updateProjectSession(db, record.id, patch, at));
}

export function startRunning(db: Database, selector: ProjectSessionSelector, options: { now?: string } = {}): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, startRunningFromPreparing(record, at), at));
}

export function updateRunningSubphase(
  db: Database,
  selector: ProjectSessionSelector,
  subphase: RunningPhaseState["subphase"],
  options: { detail?: string; data?: Partial<RunningPhaseState>; now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, setRunningSubphase(record, at, subphase, options), at));
}

export function stopProjectSessionRun(
  db: Database,
  selector: ProjectSessionSelector,
  stopReason: RunningStopReason,
  options: { manualStopMode?: ManualStopMode; blockers?: ProjectSessionBlocker[]; now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, stopRunning(record, at, stopReason, options), at));
}

export function unblockProjectSessionRun(db: Database, selector: ProjectSessionSelector, options: { now?: string } = {}): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, unblockStoppedRunning(record, at), at));
}

export function blockProjectSessionRun(
  db: Database,
  selector: ProjectSessionSelector,
  blockers: ProjectSessionBlocker[],
  options: { now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, blockRunning(record, blockers), at));
}

export function enterPr(db: Database, selector: ProjectSessionSelector, options: { force?: boolean; now?: string } = {}): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, enterPrPhase(record, at, options), at));
}

export function finishPrFinalBuild(
  db: Database,
  selector: ProjectSessionSelector,
  options: { finalBuild?: Record<string, unknown>; now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, completeFinalBuild(record, at, options.finalBuild), at));
}

export function updatePrSubphase(
  db: Database,
  selector: ProjectSessionSelector,
  subphase: PrPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PrPhaseState>; now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, setPrSubphase(record, at, subphase, options), at));
}

export function markPrComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: { completion?: Record<string, unknown>; now?: string } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, completePr(record, at, options.completion), at));
}

export function markSessionComplete(
  db: Database,
  selector: ProjectSessionSelector,
  options: {
    completedBy?: string;
    completedReason?: string;
    finalSavePoint?: Record<string, unknown>;
    settledPrCounts?: Record<string, unknown>;
    now?: string;
  } = {},
): ProjectSessionRuntimeResult {
  const record = requireSession(db, selector);
  const at = options.now ?? currentTime();
  return result(updateProjectSession(db, record.id, completeSession(record, at, options), at));
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
        }),
      );
    }
    case "update-preparing-subphase":
      return commandResult(
        db,
        projectId,
        updatePreparingSubphase(db, selector, text(body.subphase) as PreparingPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
        }),
      );
    case "mark-preparing-complete":
      return commandResult(
        db,
        projectId,
        markPreparingComplete(db, selector, {
          activeRunId: text(body.activeRunId, text(body.active_run_id)) || undefined,
          completion: objectValue(body.completion),
        }),
      );
    case "start-running":
      return commandResult(db, projectId, startRunning(db, selector));
    case "update-running-subphase":
      return commandResult(
        db,
        projectId,
        updateRunningSubphase(db, selector, text(body.subphase) as RunningPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
          data: objectValue(body.data) as Partial<RunningPhaseState>,
        }),
      );
    case "stop-running":
      return commandResult(
        db,
        projectId,
        stopProjectSessionRun(db, selector, text(body.stopReason, text(body.stop_reason, "manual_stop")) as RunningStopReason, {
          manualStopMode: text(body.manualStopMode, text(body.manual_stop_mode)) as ManualStopMode,
        }),
      );
    case "enter-pr":
      return commandResult(db, projectId, enterPr(db, selector, { force: input.force || body.force === true }));
    case "finish-pr-final-build":
      return commandResult(db, projectId, finishPrFinalBuild(db, selector, { finalBuild: objectValue(body.finalBuild) }));
    case "update-pr-subphase":
      return commandResult(
        db,
        projectId,
        updatePrSubphase(db, selector, text(body.subphase) as PrPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
        }),
      );
    case "publish-pr":
      return commandResult(db, projectId, updatePrSubphase(db, selector, "publish"));
    case "mark-pr-complete":
      return commandResult(db, projectId, markPrComplete(db, selector, { completion: objectValue(body.completion) }));
    case "complete":
      return commandResult(
        db,
        projectId,
        markSessionComplete(db, selector, {
          completedBy: text(body.completedBy, text(body.completed_by)) || undefined,
          completedReason: text(body.completedReason, text(body.completed_reason)) || undefined,
        }),
      );
  }
}
