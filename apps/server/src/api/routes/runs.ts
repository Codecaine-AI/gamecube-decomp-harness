import type { ActionProjection } from "@server/application/dashboard/read-model";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;
type RunActionId = "run.resume" | "run.hard_stop" | "run.cancel" | "run.recover";

export interface RunsApiRouteDeps {
  cancelRun: (body: JsonObject) => unknown;
  completeRun: (body: JsonObject) => Promise<unknown>;
  freshRun: (body: JsonObject) => Promise<unknown>;
  forceReleaseLease: (body: JsonObject) => Promise<unknown> | unknown;
  hardStopRun: (body: JsonObject) => Promise<unknown>;
  initRun: (body: JsonObject) => Promise<unknown>;
  json: JsonResponder;
  recoverRun: (body: JsonObject) => Promise<unknown>;
  resumeRun: (body: JsonObject) => unknown;
  runActionProjection: (body: JsonObject, actionId: RunActionId) => ActionProjection;
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

function commandResponse(action: ActionProjection, result: unknown, error?: string): JsonObject {
  return {
    ...action,
    ...(error ? { error } : {}),
    result: result as JsonObject | null,
  };
}

async function runCommand(
  deps: RunsApiRouteDeps,
  body: JsonObject,
  actionId: RunActionId,
  execute: (body: JsonObject) => Promise<unknown> | unknown,
): Promise<Response> {
  const action = deps.runActionProjection(body, actionId);
  if (!action.enabled) return deps.json(commandResponse(action, null), { status: 409 });
  if (action.confirmation_required && body.confirmed !== true) {
    return deps.json(commandResponse(action, null, `${actionId} requires operator confirmation`), { status: 409 });
  }

  try {
    return deps.json(commandResponse(action, await execute(body)));
  } catch (error) {
    // A command can lose a status or lease race after the initial projection.
    // Re-game so those failures use the same blocker decision as the UI.
    const latest = deps.runActionProjection(body, actionId);
    if (!latest.enabled) {
      return deps.json(
        commandResponse(latest, null, error instanceof Error ? error.message : String(error)),
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function handleRunsApiRoute(req: Request, url: URL, deps: RunsApiRouteDeps): Promise<Response | null> {
  if (req.method !== "POST") return null;
  if (url.pathname === "/api/run/complete") return deps.json(await deps.completeRun(await requestBody(req)));
  if (url.pathname === "/api/run/init") return deps.json(await deps.initRun(await requestBody(req)));
  if (url.pathname === "/api/run/fresh") return deps.json(await deps.freshRun(await requestBody(req)));
  if (url.pathname === "/api/run/force-release-lease") {
    const body = await requestBody(req);
    if (typeof body.gameId !== "string" || !body.gameId.trim()) {
      return deps.json({ error: "run.force_release_lease requires gameId" }, { status: 400 });
    }
    if (body.confirmed !== true) {
      return deps.json({ error: "run.force_release_lease requires operator confirmation" }, { status: 409 });
    }
    try {
      return deps.json(await deps.forceReleaseLease(body));
    } catch (error) {
      return deps.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
    }
  }
  if (url.pathname === "/api/run/resume") {
    const body = await requestBody(req);
    return runCommand(deps, body, "run.resume", deps.resumeRun);
  }
  if (url.pathname === "/api/run/hard-stop") {
    const body = await requestBody(req);
    return runCommand(deps, body, "run.hard_stop", deps.hardStopRun);
  }
  if (url.pathname === "/api/run/cancel") {
    const body = await requestBody(req);
    return runCommand(deps, body, "run.cancel", deps.cancelRun);
  }
  if (url.pathname === "/api/run/recover") {
    const body = await requestBody(req);
    return runCommand(deps, body, "run.recover", deps.recoverRun);
  }
  return null;
}
