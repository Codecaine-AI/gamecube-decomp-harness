import { describe, expect, test } from "bun:test";
import type {
  PrCampaignActionId,
  PrCampaignActionProjection,
} from "@server/core/cycle-runtime/phases/pr/campaign/runtime.js";
import { handlePrApiRoute, type PrApiRouteDeps } from "./pr.js";

function projection(
  actionId: PrCampaignActionId,
  enabled = true,
): PrCampaignActionProjection {
  return {
    action_id: actionId,
    blocked_by: enabled ? [] : [{
      code: "fixture_blocker",
      message: "fixture blocked",
      source_kind: "pr_campaign",
      source_id: "campaign-1",
      recoverable: true,
    }],
    confirmation_required: [
      "pr.publish_batch",
      "pr.close_campaign",
      "pr.abandon_campaign",
      "pr.campaign_recover",
    ].includes(actionId),
    enabled,
    expected_transition: `${actionId} transition`,
    subject_id: "campaign-1",
    subject_kind: "pr_campaign",
  };
}

function deps(overrides: Partial<PrApiRouteDeps> = {}): PrApiRouteDeps {
  return {
    abandonCampaign: async () => ({ status: "abandoned" }),
    action: (_body, actionId) => projection(actionId),
    activate: async () => ({ status: "working" }),
    adoptLegacy: async () => ({ adopted: [] }),
    claimWorkItems: async () => ({ status: "revising" }),
    closeCampaign: async () => ({ status: "completed" }),
    declineWorkItems: async () => ({ status: "revising" }),
    json: (data, init) => Response.json(data, init),
    openCampaign: async () => ({ status: "preparing" }),
    publishBatch: async () => ({ batch_index: 0 }),
    recoverCampaign: async () => ({ status: "in_review" }),
    release: async () => ({ status: "in_review" }),
    resolveWorkItems: async () => ({ status: "revising" }),
    reviseWorkItems: async () => ({ status: "published" }),
    ...overrides,
  };
}

describe("PR campaign API command routes", () => {
  test.each([
    ["/api/pr/open-campaign", "pr.open_campaign", "openCampaign", false],
    ["/api/pr/activate", "pr.activate", "activate", false],
    ["/api/pr/publish-batch", "pr.publish_batch", "publishBatch", true],
    ["/api/pr/release", "pr.release", "release", false],
    ["/api/pr/close-campaign", "pr.close_campaign", "closeCampaign", true],
    ["/api/pr/abandon-campaign", "pr.abandon_campaign", "abandonCampaign", true],
    ["/api/pr/campaign-recover", "pr.campaign_recover", "recoverCampaign", true],
    ["/api/pr/adopt-legacy", "pr.adopt_legacy", "adoptLegacy", false],
  ] as const)("routes %s through %s with its ActionDecision", async (
    path,
    actionId,
    command,
    confirmed,
  ) => {
    let calls = 0;
    const routeDeps = deps({
      [command]: async () => {
        calls += 1;
        return { command };
      },
    });
    const request = new Request(`http://localhost${path}`, {
      body: JSON.stringify({ ...(confirmed ? { confirmed: true } : {}), gameId: "melee" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await handlePrApiRoute(request, new URL(request.url), routeDeps);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      action_id: actionId,
      confirmation_required: confirmed,
      enabled: true,
      result: { command },
    });
    expect(calls).toBe(1);
  });

  test("returns the blocker decision without executing a disabled command", async () => {
    let executed = false;
    const routeDeps = deps({
      action: (_body, actionId) => projection(actionId, false),
      activate: async () => {
        executed = true;
        return {};
      },
    });
    const request = new Request("http://localhost/api/pr/activate", { method: "POST" });

    const response = await handlePrApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      action_id: "pr.activate",
      blocked_by: [{ code: "fixture_blocker" }],
      enabled: false,
      result: null,
    });
    expect(executed).toBe(false);
  });

  test.each([
    ["/api/pr/publish-batch", "pr.publish_batch"],
    ["/api/pr/close-campaign", "pr.close_campaign"],
    ["/api/pr/abandon-campaign", "pr.abandon_campaign"],
    ["/api/pr/campaign-recover", "pr.campaign_recover"],
  ] as const)("requires explicit confirmation for %s", async (path, actionId) => {
    const request = new Request(`http://localhost${path}`, { method: "POST" });
    const response = await handlePrApiRoute(request, new URL(request.url), deps());

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      action_id: actionId,
      confirmation_required: true,
      error: `${actionId} requires operator confirmation`,
      result: null,
    });
  });

  test("returns a fresh blocker decision when command-time state changes", async () => {
    let projected = 0;
    const routeDeps = deps({
      action: (_body, actionId) => projection(actionId, projected++ === 0),
      openCampaign: async () => {
        throw new Error("another campaign opened first");
      },
    });
    const request = new Request("http://localhost/api/pr/open-campaign", { method: "POST" });

    const response = await handlePrApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      action_id: "pr.open_campaign",
      blocked_by: [{ code: "fixture_blocker" }],
      enabled: false,
      error: "another campaign opened first",
      result: null,
    });
  });

  test.each([
    ["/api/pr/work-items/claim", "claimWorkItems"],
    ["/api/pr/work-items/revise", "reviseWorkItems"],
    ["/api/pr/work-items/resolve", "resolveWorkItems"],
    ["/api/pr/work-items/decline", "declineWorkItems"],
  ] as const)("routes fenced work-item command %s", async (path, command) => {
    const received: Array<Record<string, unknown>> = [];
    const routeDeps = deps({
      [command]: async (body: Record<string, unknown>) => {
        received.push(body);
        return { command };
      },
    });
    const request = new Request(`http://localhost${path}`, {
      body: JSON.stringify({ leaseId: "lease-pr", gameId: "melee", seriesId: "series-1" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await handlePrApiRoute(request, new URL(request.url), routeDeps);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ result: { command } });
    expect(received).toEqual([{ leaseId: "lease-pr", gameId: "melee", seriesId: "series-1" }]);
  });

  test("ignores non-command requests", async () => {
    const get = new Request("http://localhost/api/pr/activate");
    const unknown = new Request("http://localhost/api/pr/unknown", { method: "POST" });

    expect(await handlePrApiRoute(get, new URL(get.url), deps())).toBeNull();
    expect(await handlePrApiRoute(unknown, new URL(unknown.url), deps())).toBeNull();
  });
});
