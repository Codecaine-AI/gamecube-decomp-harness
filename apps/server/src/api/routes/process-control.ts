import type { ActionProjection } from "@server/application/dashboard/read-model";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface ProcessControlApiRouteDeps {
  json: JsonResponder;
  processStatus: (stateDir?: string, game?: unknown) => unknown;
  requestPaths: (url: URL, options: { useDefaultGame?: boolean }) => { game?: unknown; stateDir: string };
  runActionProjection: (body: JsonObject, actionId: "run.start") => ActionProjection;
  startManagedProcess: (body: JsonObject) => Promise<Response>;
  stopManaged: (body: JsonObject) => Promise<unknown>;
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

function commandResponse(action: ActionProjection, result: unknown): JsonObject {
  return { ...action, result: result as JsonObject | null };
}

function blockersFromResult(result: unknown): ActionProjection["blocked_by"] | null {
  if (!result || typeof result !== "object") return null;
  const blockedBy = (result as JsonObject).blocked_by;
  return Array.isArray(blockedBy) ? blockedBy as ActionProjection["blocked_by"] : null;
}

async function startRun(body: JsonObject, deps: ProcessControlApiRouteDeps): Promise<Response> {
  const action = deps.runActionProjection(body, "run.start");
  if (!action.enabled) return deps.json(commandResponse(action, null), { status: 409 });

  const response = await deps.startManagedProcess(body);
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const latest = deps.runActionProjection(body, "run.start");
    const conflicts = blockersFromResult(result);
    const rejected = conflicts && conflicts.length > 0
      ? { ...action, enabled: false, blocked_by: conflicts }
      : (latest.enabled ? action : latest);
    return deps.json(commandResponse(rejected, result), { status: response.status });
  }
  return deps.json(commandResponse(action, result), { status: response.status });
}

export async function handleProcessControlApiRoute(req: Request, url: URL, deps: ProcessControlApiRouteDeps): Promise<Response | null> {
  if (url.pathname === "/api/process") {
    const paths = deps.requestPaths(url, { useDefaultGame: true });
    return deps.json(deps.processStatus(paths.stateDir, paths.game));
  }
  if (req.method !== "POST") return null;
  if (url.pathname === "/api/process/start") return startRun(await requestBody(req), deps);
  if (url.pathname === "/api/process/stop") return deps.json(await deps.stopManaged(await requestBody(req)));
  return null;
}
