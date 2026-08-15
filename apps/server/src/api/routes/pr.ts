import type {
  PrCampaignActionId,
  PrCampaignActionProjection,
} from "@server/core/cycle-runtime/phases/pr/campaign/runtime.js";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;
type PrCommand = (body: JsonObject) => Promise<unknown>;

export interface PrApiRouteDeps {
  abandonCampaign: PrCommand;
  action: (body: JsonObject, actionId: PrCampaignActionId) => PrCampaignActionProjection;
  activate: PrCommand;
  adoptLegacy: PrCommand;
  closeCampaign: PrCommand;
  claimWorkItems: PrCommand;
  declineWorkItems: PrCommand;
  json: JsonResponder;
  openCampaign: PrCommand;
  publishBatch: PrCommand;
  recoverCampaign: PrCommand;
  release: PrCommand;
  resolveWorkItems: PrCommand;
  reviseWorkItems: PrCommand;
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

function commandResponse(
  action: PrCampaignActionProjection,
  result: unknown,
  error?: string,
): JsonObject {
  return {
    ...action,
    ...(error ? { error } : {}),
    result: result as JsonObject | null,
  };
}

function routeAction(pathname: string): PrCampaignActionId | null {
  if (pathname === "/api/pr/open-campaign") return "pr.open_campaign";
  if (pathname === "/api/pr/activate") return "pr.activate";
  if (pathname === "/api/pr/publish-batch") return "pr.publish_batch";
  if (pathname === "/api/pr/release") return "pr.release";
  if (pathname === "/api/pr/close-campaign") return "pr.close_campaign";
  if (pathname === "/api/pr/abandon-campaign") return "pr.abandon_campaign";
  if (pathname === "/api/pr/campaign-recover") return "pr.campaign_recover";
  if (pathname === "/api/pr/adopt-legacy") return "pr.adopt_legacy";
  return null;
}

function commandFor(actionId: PrCampaignActionId, deps: PrApiRouteDeps): PrCommand {
  switch (actionId) {
    case "pr.open_campaign": return deps.openCampaign;
    case "pr.activate": return deps.activate;
    case "pr.publish_batch": return deps.publishBatch;
    case "pr.release": return deps.release;
    case "pr.close_campaign": return deps.closeCampaign;
    case "pr.abandon_campaign": return deps.abandonCampaign;
    case "pr.campaign_recover": return deps.recoverCampaign;
    case "pr.adopt_legacy": return deps.adoptLegacy;
  }
}

function workItemCommandFor(pathname: string, deps: PrApiRouteDeps): PrCommand | null {
  if (pathname === "/api/pr/work-items/claim") return deps.claimWorkItems;
  if (pathname === "/api/pr/work-items/revise") return deps.reviseWorkItems;
  if (pathname === "/api/pr/work-items/resolve") return deps.resolveWorkItems;
  if (pathname === "/api/pr/work-items/decline") return deps.declineWorkItems;
  return null;
}

export async function handlePrApiRoute(
  req: Request,
  url: URL,
  deps: PrApiRouteDeps,
): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const workItemCommand = workItemCommandFor(url.pathname, deps);
  if (workItemCommand) {
    const body = await requestBody(req);
    return deps.json({ result: await workItemCommand(body) });
  }
  const actionId = routeAction(url.pathname);
  if (!actionId) return null;

  const body = await requestBody(req);
  const action = deps.action(body, actionId);
  if (!action.enabled) {
    return deps.json(commandResponse(action, null), { status: 409 });
  }
  if (action.confirmation_required && body.confirmed !== true) {
    return deps.json(
      commandResponse(action, null, `${actionId} requires operator confirmation`),
      { status: 409 },
    );
  }

  try {
    const result = await commandFor(actionId, deps)(body);
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
