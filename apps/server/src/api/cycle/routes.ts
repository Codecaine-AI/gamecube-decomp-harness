import { randomUUID } from "node:crypto";
import { handleCycleCommand, type CycleCommand } from "@server/core/cycle-runtime";
import { openState } from "@server/core/orchestrator-state";
import { closeCycle, type CycleBlocker } from "@server/core/cycle";
import {
  dashboardAuthorityRepoRoot,
  cycleActionState,
  type ActionProjection,
  type JsonObject,
} from "@server/application/dashboard/read-model";
import type { Blocker } from "@server/core/harness-state";
import { activeCycleProjection } from "@server/core/cycle/store";
import { statusSnapshot } from "@server/core/cycle-runtime/run-state";

type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

interface CycleRoutePaths {
  game?: unknown;
  repoRoot: string;
  stateDir: string;
  usePathOverrides: boolean;
}

type CycleRouteCommand = CycleCommand | "close" | "save-point";

export interface CycleApiRouteDeps {
  baseRefForGame: (game: unknown) => string;
  campaignStatus: (repoRoot: string, stateDir: string, baseRefFallback: string) => JsonObject;
  createSavePoint: (body: JsonObject) => Promise<JsonObject>;
  invalidateCampaignCache: () => void;
  json: JsonResponder;
  gameIdForGame: (game: unknown) => string;
  requestPaths: (url: URL, options: { useDefaultGame?: boolean }) => CycleRoutePaths;
  submitCycleStartedTrace?: (
    paths: CycleRoutePaths,
    cycle: {
      baseRef: string | null;
      baseSha: string | null;
      gameId: string;
      cycleUuid: string;
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

function routeCommand(method: string, pathname: string): CycleRouteCommand | null {
  if (pathname === "/api/cycle" && method === "GET") return "read";
  if (pathname === "/api/cycle/new" && method === "POST") return "create";
  if (pathname === "/api/cycle/save-point" && method === "POST") return "save-point";
  if (pathname === "/api/cycle/close" && method === "POST") return "close";
  if (pathname === "/api/cycle/preparing/subphase" && method === "POST") return "update-preparing-subphase";
  if (pathname === "/api/cycle/preparing/complete" && method === "POST") return "mark-preparing-complete";
  if (pathname === "/api/cycle/start-running" && method === "POST") return "start-running";
  if (pathname === "/api/cycle/running/subphase" && method === "POST") return "update-running-subphase";
  if (pathname === "/api/cycle/running/stop" && method === "POST") return "stop-running";
  if ((pathname === "/api/cycle/enter-pr" || pathname === "/api/cycle/force-pr") && method === "POST") return "enter-pr";
  if (pathname === "/api/cycle/pr/final-build" && method === "POST") return "finish-pr-final-build";
  if (pathname === "/api/cycle/pr/subphase" && method === "POST") return "update-pr-subphase";
  if (pathname === "/api/cycle/pr/publish" && method === "POST") return "publish-pr";
  if (pathname === "/api/cycle/pr/complete" && method === "POST") return "mark-pr-complete";
  if (pathname === "/api/cycle/complete" && method === "POST") return "close";
  return null;
}

function projectionBlocker(
  blocker: CycleBlocker,
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

function commandResponse(action: ActionProjection, result: unknown, error?: string): JsonObject {
  return {
    ...action,
    ...(error ? { error } : {}),
    result: result as JsonObject | null,
  };
}

export async function handleCycleApiRoute(req: Request, url: URL, deps: CycleApiRouteDeps): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/cycle")) return null;

  const paths = deps.requestPaths(url, { useDefaultGame: true });
  const gameId = text(url.searchParams.get("gameId")) || deps.gameIdForGame(paths.game);
  if (!gameId) return deps.json({ error: "Game id is required for cycle state" }, { status: 400 });

  const command = routeCommand(req.method, url.pathname);
  if (!command) return deps.json({ error: "not found" }, { status: 404 });

  const body = await requestBody(req);
  const store = openState(paths.stateDir);
  if (command === "save-point" || command === "close") {
    try {
      if (command === "close") deps.invalidateCampaignCache();
      const cycle = activeCycleProjection(store.db, gameId) as unknown as JsonObject | null;
      const repoRoot = dashboardAuthorityRepoRoot(paths, cycle, statusSnapshot(store));
      const campaign = deps.campaignStatus(
        repoRoot,
        paths.stateDir,
        deps.baseRefForGame(paths.game),
      );
      const actionState = cycleActionState(store, gameId, campaign);
      const actionId = command === "close" ? "cycle.close" : "cycle.save_point";
      const action = actionState.availableActions.find((candidate) => candidate.action_id === actionId);
      if (!action) throw new Error(`Missing ${actionId} action projection`);
      if (!action.enabled) return deps.json(commandResponse(action, null), { status: 409 });
      if (action.confirmation_required && body.confirmed !== true) {
        return deps.json(
          commandResponse(action, null, `${actionId} requires operator confirmation`),
          { status: 409 },
        );
      }

      if (command === "save-point") {
        const label = text(body.label).trim() || `manual-${new Date().toISOString()}`;
        const result = await deps.createSavePoint({
          ...body,
          label,
          gameId,
          repoRoot,
          cycleUuid: action.subject_id,
          stateDir: paths.stateDir,
          trigger: "manual",
          usePathOverrides: true,
        });
        return deps.json(commandResponse(action, result));
      }

      const suppliedCorrelationId = text(body.correlationId, text(body.correlation_id)).trim();
      if (suppliedCorrelationId && suppliedCorrelationId !== action.subject_id) {
        throw new Error(`Cycle close correlation_id must equal cycle UUID ${action.subject_id}`);
      }
      const decision = closeCycle(store, {
        gameId,
        cycleUuid: action.subject_id,
        commandId: text(body.commandId, text(body.command_id)) || `command-cycle-close-${randomUUID()}`,
        correlationId: action.subject_id,
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
                projectionBlocker(blocker, { sourceKind: "cycle", sourceId: action.subject_id }),
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

  let result: ReturnType<typeof handleCycleCommand>;
  try {
    result = handleCycleCommand(store.db, command, {
      gameId,
      body:
        command === "create"
          ? {
              ...body,
              worktreeIdentity:
                text(body.worktreeIdentity, text(body.worktree_identity)) || paths.repoRoot,
            }
          : body,
      baseRef: deps.baseRefForGame(paths.game),
      force: url.pathname.endsWith("/force-pr"),
    });
  } finally {
    store.db.close();
  }

  if (command === "create" && !result.status) {
    const cycle = asObject(asObject(result.payload).cycle);
    const cycleUuid = text(cycle.cycleUuid);
    if (cycleUuid) {
      await deps.submitCycleStartedTrace?.(paths, {
        baseRef: text(cycle.baseRef) || null,
        baseSha: text(cycle.baseSha) || null,
        gameId,
        cycleUuid,
      });
    }
  }

  return deps.json(result.payload, result.status ? { status: result.status } : undefined);
}
