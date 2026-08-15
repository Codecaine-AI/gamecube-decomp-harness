import type {
  SyncActionId,
  SyncActionProjection,
} from "@server/core/cycle-runtime/phases/sync/runtime.js";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface SyncApiRouteDeps {
  action: (body: JsonObject, actionId: SyncActionId) => SyncActionProjection;
  cancel: (body: JsonObject) => Promise<unknown>;
  json: JsonResponder;
  publish: (body: JsonObject) => Promise<unknown>;
  recover: (body: JsonObject) => Promise<unknown>;
  resolveConflict: (body: JsonObject) => Promise<unknown>;
  start: (body: JsonObject) => Promise<unknown>;
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

function commandResponse(action: SyncActionProjection, result: unknown, error?: string): JsonObject {
  return {
    ...action,
    ...(error ? { error } : {}),
    result: result as JsonObject | null,
  };
}

function routeAction(pathname: string): SyncActionId | null {
  if (
    pathname === "/api/game/sync"
    || pathname === "/api/sync/start"
  ) return "sync.start";
  if (pathname === "/api/sync/resolve-conflict") return "sync.resolve_conflict";
  if (pathname === "/api/sync/publish") return "sync.publish";
  if (pathname === "/api/sync/cancel") return "sync.cancel";
  if (pathname === "/api/sync/recover") return "sync.recover";
  return null;
}

export async function handleSyncApiRoute(
  req: Request,
  url: URL,
  deps: SyncApiRouteDeps,
): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const actionId = routeAction(url.pathname);
  if (!actionId) return null;
  const body = await requestBody(req);
  const action = deps.action(body, actionId);
  if (!action.enabled) return deps.json(commandResponse(action, null), { status: 409 });
  if (action.confirmation_required && body.confirmed !== true) {
    return deps.json(
      commandResponse(action, null, `${actionId} requires operator confirmation`),
      { status: 409 },
    );
  }

  const execute = actionId === "sync.start"
    ? deps.start
    : actionId === "sync.resolve_conflict"
      ? deps.resolveConflict
      : actionId === "sync.publish"
        ? deps.publish
        : actionId === "sync.cancel"
          ? deps.cancel
          : deps.recover;
  try {
    const result = await execute(body);
    const sync = result && typeof result === "object"
      ? ((result as JsonObject).sync ?? result) as JsonObject
      : null;
    if (sync?.status === "blocked") {
      const latest = deps.action(body, actionId);
      return deps.json(commandResponse(latest, result), { status: 409 });
    }
    return deps.json(commandResponse(action, result));
  } catch (error) {
    const latest = deps.action(body, actionId);
    if (!latest.enabled) {
      return deps.json(
        commandResponse(latest, null, error instanceof Error ? error.message : String(error)),
        { status: 409 },
      );
    }
    throw error;
  }
}
