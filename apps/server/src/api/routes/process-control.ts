type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface ProcessControlApiRouteDeps {
  drainManaged: (body: JsonObject) => Promise<unknown>;
  finishEpochNow: (body: JsonObject) => Promise<unknown>;
  json: JsonResponder;
  processStatus: (stateDir?: string, project?: unknown) => unknown;
  requestPaths: (url: URL, options: { useDefaultProject?: boolean }) => { project?: unknown; stateDir: string };
  startManagedProcess: (body: JsonObject) => Promise<Response>;
  stopManaged: (body: JsonObject) => Promise<unknown>;
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

export async function handleProcessControlApiRoute(req: Request, url: URL, deps: ProcessControlApiRouteDeps): Promise<Response | null> {
  if (url.pathname === "/api/process") {
    const paths = deps.requestPaths(url, { useDefaultProject: true });
    return deps.json(deps.processStatus(paths.stateDir, paths.project));
  }
  if (req.method !== "POST") return null;
  if (url.pathname === "/api/process/start") return deps.startManagedProcess(await requestBody(req));
  if (url.pathname === "/api/process/stop") return deps.json(await deps.stopManaged(await requestBody(req)));
  if (url.pathname === "/api/process/drain") return deps.json(await deps.drainManaged(await requestBody(req)));
  if (url.pathname === "/api/process/finish-epoch") return deps.json(await deps.finishEpochNow(await requestBody(req)));
  return null;
}
