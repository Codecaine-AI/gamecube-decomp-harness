import { randomUUID } from "node:crypto";
import { handleProjectSessionCommand, type ProjectSessionCommand } from "@server/core/session-runtime";
import { openState } from "@server/core/orchestrator-state";
import { closeProjectSession, type ProjectSessionBlocker } from "@server/core/project-session";
import {
  dashboardAuthorityRepoRoot,
  projectSessionActionState,
  type ActionProjection,
  type JsonObject,
} from "@server/application/dashboard/read-model";
import type { Blocker } from "@server/core/project-state";
import { activeProjectSessionProjection } from "@server/core/project-session/store";
import { statusSnapshot } from "@server/core/session-runtime/run-state";

type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

interface ProjectSessionRoutePaths {
  project?: unknown;
  repoRoot: string;
  stateDir: string;
  usePathOverrides: boolean;
}

type ProjectSessionRouteCommand = ProjectSessionCommand | "close" | "save-point";

export interface ProjectSessionApiRouteDeps {
  baseRefForProject: (project: unknown) => string;
  campaignStatus: (repoRoot: string, stateDir: string, baseRefFallback: string) => JsonObject;
  createSavePoint: (body: JsonObject) => Promise<JsonObject>;
  invalidateCampaignCache: () => void;
  json: JsonResponder;
  projectIdForProject: (project: unknown) => string;
  requestPaths: (url: URL, options: { useDefaultProject?: boolean }) => ProjectSessionRoutePaths;
  submitSessionStartedTrace?: (
    paths: ProjectSessionRoutePaths,
    session: {
      baseRef: string | null;
      baseSha: string | null;
      projectId: string;
      sessionUuid: string;
    },
  ) => Promise<unknown> | unknown;
}

async function requestBody(req: Request): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function routeCommand(method: string, pathname: string): ProjectSessionRouteCommand | null {
  if (pathname === "/api/project-session" && method === "GET") return "read";
  if (pathname === "/api/project-session/new" && method === "POST") return "create";
  if (pathname === "/api/project-session/save-point" && method === "POST") return "save-point";
  if (pathname === "/api/project-session/close" && method === "POST") return "close";
  if (pathname === "/api/project-session/preparing/subphase" && method === "POST") return "update-preparing-subphase";
  if (pathname === "/api/project-session/preparing/complete" && method === "POST") return "mark-preparing-complete";
  if (pathname === "/api/project-session/start-running" && method === "POST") return "start-running";
  if (pathname === "/api/project-session/running/subphase" && method === "POST") return "update-running-subphase";
  if (pathname === "/api/project-session/running/stop" && method === "POST") return "stop-running";
  if ((pathname === "/api/project-session/enter-pr" || pathname === "/api/project-session/force-pr") && method === "POST") return "enter-pr";
  if (pathname === "/api/project-session/pr/final-build" && method === "POST") return "finish-pr-final-build";
  if (pathname === "/api/project-session/pr/subphase" && method === "POST") return "update-pr-subphase";
  if (pathname === "/api/project-session/pr/publish" && method === "POST") return "publish-pr";
  if (pathname === "/api/project-session/pr/complete" && method === "POST") return "mark-pr-complete";
  if (pathname === "/api/project-session/complete" && method === "POST") return "close";
  return null;
}

function projectionBlocker(
  blocker: ProjectSessionBlocker,
  fallback: { sourceKind: string; sourceId: string },
): Blocker {
  return {
    code: blocker.code,
    message: blocker.message,
    source_kind: blocker.source_kind ?? blocker.source ?? fallback.sourceKind,
    source_id: blocker.source_id ?? fallback.sourceId,
    recoverable: blocker.recoverable ?? true,
  };
}

function commandResponse(action: ActionProjection, result: unknown): JsonObject {
  return { ...action, result: result as JsonObject | null };
}

export async function handleProjectSessionApiRoute(req: Request, url: URL, deps: ProjectSessionApiRouteDeps): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/project-session")) return null;

  const paths = deps.requestPaths(url, { useDefaultProject: true });
  const projectId = text(url.searchParams.get("projectId")) || deps.projectIdForProject(paths.project);
  if (!projectId) return deps.json({ error: "Project id is required for project-session state" }, { status: 400 });

  const command = routeCommand(req.method, url.pathname);
  if (!command) return deps.json({ error: "not found" }, { status: 404 });

  const body = await requestBody(req);
  const store = openState(paths.stateDir);
  if (command === "save-point" || command === "close") {
    try {
      if (command === "close") deps.invalidateCampaignCache();
      const projectSession = activeProjectSessionProjection(store.db, projectId) as unknown as JsonObject | null;
      const repoRoot = dashboardAuthorityRepoRoot(paths, projectSession, statusSnapshot(store));
      const campaign = deps.campaignStatus(
        repoRoot,
        paths.stateDir,
        deps.baseRefForProject(paths.project),
      );
      const actionState = projectSessionActionState(store, projectId, campaign);
      const actionId = command === "close" ? "session.close" : "session.save_point";
      const action = actionState.availableActions.find((candidate) => candidate.action_id === actionId);
      if (!action) throw new Error(`Missing ${actionId} action projection`);
      if (!action.enabled) return deps.json(commandResponse(action, null), { status: 409 });

      if (command === "save-point") {
        const label = text(body.label).trim() || `manual-${new Date().toISOString()}`;
        const result = await deps.createSavePoint({
          ...body,
          label,
          projectId,
          repoRoot,
          stateDir: paths.stateDir,
          trigger: "manual",
          usePathOverrides: true,
        });
        return deps.json(commandResponse(action, result));
      }

      const decision = closeProjectSession(store, {
        projectId,
        sessionUuid: action.subject_id,
        commandId: text(body.commandId, text(body.command_id)) || `command-session-close-${randomUUID()}`,
        correlationId: text(body.correlationId, text(body.correlation_id)) || undefined,
        actor: "operator",
        ...actionState.closeInput,
      });
      if (!decision.closed) {
        return deps.json(
          commandResponse(
            {
              ...action,
              enabled: false,
              blocked_by: decision.blockers.map((blocker) =>
                projectionBlocker(blocker, { sourceKind: "session", sourceId: action.subject_id }),
              ),
            },
            null,
          ),
          { status: 409 },
        );
      }
      return deps.json(commandResponse(action, decision));
    } finally {
      store.db.close();
    }
  }

  let result: ReturnType<typeof handleProjectSessionCommand>;
  try {
    result = handleProjectSessionCommand(store.db, command, {
      projectId,
      body:
        command === "create"
          ? {
              ...body,
              worktreeIdentity:
                text(body.worktreeIdentity, text(body.worktree_identity)) || paths.repoRoot,
            }
          : body,
      baseRef: deps.baseRefForProject(paths.project),
      force: url.pathname.endsWith("/force-pr"),
    });
  } finally {
    store.db.close();
  }

  if (command === "create" && !result.status) {
    const session = asObject(asObject(result.payload).projectSession);
    const sessionUuid = text(session.sessionUuid);
    if (sessionUuid) {
      await deps.submitSessionStartedTrace?.(paths, {
        baseRef: text(session.baseRef) || null,
        baseSha: text(session.baseSha) || null,
        projectId,
        sessionUuid,
      });
    }
  }

  return deps.json(result.payload, result.status ? { status: result.status } : undefined);
}
