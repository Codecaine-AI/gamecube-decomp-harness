type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface HandoffApiRouteDeps {
  checkpointRun: (body: JsonObject) => Promise<unknown>;
  createSavePoint: (body: JsonObject) => Promise<unknown>;
  json: JsonResponder;
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

export async function handleHandoffApiRoute(req: Request, url: URL, deps: HandoffApiRouteDeps): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const body = () => requestBody(req);
  if (url.pathname === "/api/run/checkpoint") return deps.json(await deps.checkpointRun(await body()));
  if (url.pathname === "/api/save-point") return deps.json(await deps.createSavePoint(await body()));
  return null;
}
