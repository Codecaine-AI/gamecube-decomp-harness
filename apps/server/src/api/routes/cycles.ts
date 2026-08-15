type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

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
  calculateBaselineForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
  indexPrsForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
  gameDefaults: (game: unknown) => unknown;
  gameToSummary: (game: unknown) => unknown;
  requestPaths: (url: URL, options: { useDefaultGame?: boolean }) => { game?: unknown; stateDir: string };
  runDashboard: (paths: unknown) => Promise<unknown>;
  runDetails: (stateDir: string, runId: string, game: unknown) => unknown;
  workerStateTrace: (stateDir: string, runId: string, workerStateId: string) => unknown;
  syncGitForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
}

async function requestBody(req: Request): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
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
  if (isPreparationPath(url.pathname, "sync-git") && req.method === "POST") {
    return redirectPreparationSyncToOperatorStart(url);
  }
  if (isPreparationPath(url.pathname, "pr-index") && req.method === "POST") {
    return redirectPreparationSyncToOperatorStart(url);
  }
  if (isPreparationPath(url.pathname, "baseline") && req.method === "POST") {
    return deps.json(await deps.calculateBaselineForPrepare(await requestBody(req)));
  }
  return null;
}
