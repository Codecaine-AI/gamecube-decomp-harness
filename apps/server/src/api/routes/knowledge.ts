import type { ActionProjection } from "@server/application/dashboard/read-model";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export type KnowledgeActionProjection = Omit<ActionProjection, "action_id" | "subject_kind" | "confirmation_required"> & {
  action_id: "knowledge.process";
  subject_kind: "game";
  confirmation_required: false;
};

export interface KnowledgeApiRouteDeps {
  action: (body: JsonObject) => KnowledgeActionProjection;
  applyStandardEdit: (edit: unknown, game: unknown) => unknown;
  json: JsonResponder;
  loadStandardsPayload: (game: unknown) => unknown;
  triggerBackgroundKnowledgeProcess: (paths: { game?: unknown; stateDir: string }, body: JsonObject) => Promise<unknown>;
  requestPaths: (url: URL, options: { useDefaultGame?: boolean }) => { game?: unknown; stateDir: string };
}

function commandResponse(action: KnowledgeActionProjection, result: unknown, error?: string): JsonObject {
  return {
    ...action,
    ...(error ? { error } : {}),
    result: result as JsonObject | null,
  };
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

export async function handleKnowledgeApiRoute(req: Request, url: URL, deps: KnowledgeApiRouteDeps): Promise<Response | null> {
  if (url.pathname === "/api/knowledge/process") {
    if (req.method !== "POST") return deps.json({ error: "method not allowed" }, { status: 405 });
    const body = await requestBody(req);
    const action = deps.action(body);
    if (!action.enabled) return deps.json(commandResponse(action, null), { status: 409 });

    const paths = deps.requestPaths(url, { useDefaultGame: true });
    try {
      return deps.json(commandResponse(action, await deps.triggerBackgroundKnowledgeProcess(paths, body)));
    } catch (error) {
      // Queue state can change between projection and claim. Recompute the projection so a
      // lease, retry backoff, or drained queue is returned as the blocker.
      const latest = deps.action(body);
      if (!latest.enabled) {
        return deps.json(
          commandResponse(latest, null, error instanceof Error ? error.message : String(error)),
          { status: 409 },
        );
      }
      throw error;
    }
  }

  if (url.pathname !== "/api/standards") return null;
  const paths = deps.requestPaths(url, { useDefaultGame: true });
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as JsonObject;
    return deps.json(deps.applyStandardEdit((body.edit ?? {}) as unknown, paths.game ?? null));
  }
  return deps.json(deps.loadStandardsPayload(paths.game ?? null));
}
