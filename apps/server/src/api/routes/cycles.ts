import { BOUNDARY_STEP_KEYS } from "../../application/dashboard/boundary-view.js";

type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

const BOUNDARY_DETAIL_NOT_FOUND = new Set(["epoch", "attempt", "step"]);

export interface CyclesApiRouteDeps {
  availableGames: () => unknown[];
  dashboardEvents: (url: URL) => Response;
  dashboardStreamIntervalMs: number;
  defaultGame: () => unknown;
  defaultGameId: (game: unknown) => string;
  defaultGraphDbPath: (game: unknown) => string;
  defaultRepoRoot: string;
  defaultStateDir: string;
  hotReloadEnabled: boolean;
  hotReloadEvents: () => Response;
  json: JsonResponder;
  packageRoot: string;
  port: number;
  indexPrsForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
  gameDefaults: (game: unknown) => unknown;
  gameToSummary: (game: unknown) => unknown;
  requestPaths: (url: URL, options: { useDefaultGame?: boolean }) => { game?: unknown; stateDir: string };
  runDashboard: (paths: unknown) => Promise<unknown>;
  runDetails: (stateDir: string, runId: string, game: unknown) => unknown;
  boundaryStepDetail: (stateDir: string, runId: string, query: { epochId: string; attempt: number; step: string }) => unknown;
  workerStateTrace: (stateDir: string, runId: string, workerStateId: string) => unknown;
  syncGitForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
}

function redirectPreparationSyncToOperatorStart(url: URL): Response {
  const location = new URL(url);
  location.pathname = "/api/sync/start";
  return new Response(null, {
    status: 307,
    headers: { location: location.toString() },
  });
}

function isPreparationPath(pathname: string, action: string): boolean {
  return pathname === `/api/cycle/preparing/${action}`;
}

function isBoundaryDetailNotFound(detail: unknown): boolean {
  if (detail === null || typeof detail !== "object" || !("notFound" in detail)) return false;
  return BOUNDARY_DETAIL_NOT_FOUND.has((detail as { notFound?: unknown }).notFound as string);
}

export async function handleCyclesApiRoute(req: Request, url: URL, deps: CyclesApiRouteDeps): Promise<Response | null> {
  if (url.pathname === "/api/config") {
    const selectedGame = deps.defaultGame();
    const games = deps.availableGames();
    return deps.json({
      packageRoot: deps.packageRoot,
      defaultRepoRoot: selectedGame ? ((selectedGame as { repoRoot?: string }).repoRoot ?? deps.defaultRepoRoot) : deps.defaultRepoRoot,
      defaultStateDir: selectedGame ? ((selectedGame as { stateDir?: string }).stateDir ?? deps.defaultStateDir) : deps.defaultStateDir,
      defaultGraphDbPath: deps.defaultGraphDbPath(selectedGame),
      defaultGameId: deps.defaultGameId(selectedGame),
      selectedGame: selectedGame ? deps.gameToSummary(selectedGame) : null,
      availableGames: games,
      gameDefaults: deps.gameDefaults(selectedGame),
      port: deps.port,
      hotReload: deps.hotReloadEnabled,
      dashboardStreamIntervalMs: deps.dashboardStreamIntervalMs,
    });
  }
  if (url.pathname === "/api/dev-events") return deps.hotReloadEvents();
  if (url.pathname === "/api/dashboard/events") return deps.dashboardEvents(url);
  if (url.pathname === "/api/dashboard") {
    const paths = deps.requestPaths(url, { useDefaultGame: true });
    return deps.json(await deps.runDashboard(paths));
  }
  if (url.pathname === "/api/run/details") {
    const paths = deps.requestPaths(url, { useDefaultGame: true });
    return deps.json(deps.runDetails(paths.stateDir, url.searchParams.get("runId") || "", paths.game ?? null));
  }
  if (url.pathname === "/api/run/worker-state-trace") {
    const paths = deps.requestPaths(url, { useDefaultGame: true });
    return deps.json(deps.workerStateTrace(paths.stateDir, url.searchParams.get("runId") || "", url.searchParams.get("workerStateId") || ""));
  }
  if (url.pathname === "/api/run/boundary-step-detail") {
    const runId = url.searchParams.get("runId") || "";
    const epochId = url.searchParams.get("epochId") || "";
    const attemptParam = url.searchParams.get("attempt") || "";
    const step = url.searchParams.get("step") || "";
    const attempt = Number(attemptParam);
    const validStep = BOUNDARY_STEP_KEYS.includes(step as typeof BOUNDARY_STEP_KEYS[number]);
    if (!runId || !epochId || !validStep || !/^[1-9]\d*$/.test(attemptParam) || !Number.isSafeInteger(attempt)) {
      return deps.json({ error: "Boundary step detail requires runId, epochId, a positive integer attempt, and step." }, { status: 400 });
    }
    try {
      const paths = deps.requestPaths(url, { useDefaultGame: true });
      const detail = deps.boundaryStepDetail(paths.stateDir, runId, { epochId, attempt, step });
      const status = isBoundaryDetailNotFound(detail) ? 404 : 200;
      return deps.json(detail, { status });
    } catch (error) {
      console.error("Boundary step detail failed", error);
      return deps.json({ error: "boundary step detail failed" }, { status: 500 });
    }
  }
  if (isPreparationPath(url.pathname, "sync-git") && req.method === "POST") {
    return redirectPreparationSyncToOperatorStart(url);
  }
  if (isPreparationPath(url.pathname, "pr-index") && req.method === "POST") {
    return redirectPreparationSyncToOperatorStart(url);
  }
  return null;
}
