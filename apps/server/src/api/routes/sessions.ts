type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface SessionsApiRouteDeps {
  availableProjects: () => unknown[];
  dashboardEvents: (url: URL) => Response;
  dashboardStreamIntervalMs: number;
  defaultGraphDbPath: (project: unknown) => string;
  defaultProject: () => unknown;
  defaultProjectId: (project: unknown) => string;
  defaultRepoRoot: string;
  defaultStateDir: string;
  hotReloadEnabled: boolean;
  hotReloadEvents: () => Response;
  json: JsonResponder;
  packageRoot: string;
  port: number;
  calculateBaselineForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
  indexPrsForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
  projectDefaults: (project: unknown) => unknown;
  projectToSummary: (project: unknown) => unknown;
  requestPaths: (url: URL, options: { useDefaultProject?: boolean }) => { project?: unknown; stateDir: string };
  runDashboard: (paths: unknown) => Promise<unknown>;
  runDetails: (stateDir: string, runId: string, project: unknown) => unknown;
  workerStateTrace: (stateDir: string, runId: string, workerStateId: string) => unknown;
  syncGitForPrepare: (body: Record<string, unknown>) => Promise<unknown>;
  syncProjectIntake: (body: Record<string, unknown>) => Promise<unknown>;
}

async function requestBody(req: Request): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function handleSessionsApiRoute(req: Request, url: URL, deps: SessionsApiRouteDeps): Promise<Response | null> {
  if (url.pathname === "/api/config") {
    const selectedProject = deps.defaultProject();
    const projects = deps.availableProjects();
    return deps.json({
      packageRoot: deps.packageRoot,
      defaultRepoRoot: selectedProject ? ((selectedProject as { repoRoot?: string }).repoRoot ?? deps.defaultRepoRoot) : deps.defaultRepoRoot,
      defaultStateDir: selectedProject ? ((selectedProject as { stateDir?: string }).stateDir ?? deps.defaultStateDir) : deps.defaultStateDir,
      defaultGraphDbPath: deps.defaultGraphDbPath(selectedProject),
      defaultProjectId: deps.defaultProjectId(selectedProject),
      selectedProject: selectedProject ? deps.projectToSummary(selectedProject) : null,
      availableProjects: projects,
      projectDefaults: deps.projectDefaults(selectedProject),
      port: deps.port,
      hotReload: deps.hotReloadEnabled,
      dashboardStreamIntervalMs: deps.dashboardStreamIntervalMs,
    });
  }
  if (url.pathname === "/api/dev-events") return deps.hotReloadEvents();
  if (url.pathname === "/api/dashboard/events") return deps.dashboardEvents(url);
  if (url.pathname === "/api/dashboard") {
    const paths = deps.requestPaths(url, { useDefaultProject: true });
    return deps.json(await deps.runDashboard(paths));
  }
  if (url.pathname === "/api/run/details") {
    const paths = deps.requestPaths(url, { useDefaultProject: true });
    return deps.json(deps.runDetails(paths.stateDir, url.searchParams.get("runId") || "", paths.project ?? null));
  }
  if (url.pathname === "/api/run/worker-state-trace") {
    const paths = deps.requestPaths(url, { useDefaultProject: true });
    return deps.json(deps.workerStateTrace(paths.stateDir, url.searchParams.get("runId") || "", url.searchParams.get("workerStateId") || ""));
  }
  if (url.pathname === "/api/project/sync" && req.method === "POST") {
    return deps.json(await deps.syncProjectIntake(await requestBody(req)));
  }
  if (url.pathname === "/api/project-session/preparing/sync-git" && req.method === "POST") {
    return deps.json(await deps.syncGitForPrepare(await requestBody(req)));
  }
  if (url.pathname === "/api/project-session/preparing/pr-index" && req.method === "POST") {
    return deps.json(await deps.indexPrsForPrepare(await requestBody(req)));
  }
  if (url.pathname === "/api/project-session/preparing/baseline" && req.method === "POST") {
    return deps.json(await deps.calculateBaselineForPrepare(await requestBody(req)));
  }
  return null;
}
