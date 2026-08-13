import { describe, expect, test } from "bun:test";
import { handlePrCampaignApiRoute, type PrCampaignApiRouteDeps } from "./pr-campaign.js";

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json" } });
}

function deps(overrides: Partial<PrCampaignApiRouteDeps> = {}): PrCampaignApiRouteDeps {
  return {
    abandonCampaign: async () => ({ status: "abandoned" }),
    action: (_body, actionId) => ({
      action_id: actionId,
      blocked_by: [],
      confirmation_required: actionId === "pr.publish_batch",
      enabled: true,
      expected_transition: "test",
      subject_id: "campaign-1",
      subject_kind: "pr_campaign",
    }),
    activate: async () => ({ status: "working" }),
    adoptLegacy: async () => ({ adopted: [] }),
    claimWorkItems: async () => ({ status: "revising" }),
    closeCampaign: async () => ({ status: "completed" }),
    declineWorkItems: async () => ({ status: "revising" }),
    json,
    openCampaign: async () => ({ status: "preparing" }),
    publishBatch: async () => ({ published: true }),
    recoverCampaign: async () => ({ status: "in_review" }),
    release: async () => ({ status: "in_review" }),
    resolveWorkItems: async () => ({ status: "revising" }),
    reviseWorkItems: async () => ({ status: "published" }),
    ...overrides,
  };
}

describe("PR campaign API", () => {
  test("requires explicit confirmation before batch publication", async () => {
    let calls = 0;
    const request = new Request("http://test/api/pr/publish-batch", {
      body: JSON.stringify({ projectId: "melee" }),
      method: "POST",
    });
    const response = await handlePrCampaignApiRoute(request, new URL(request.url), deps({
      publishBatch: async () => { calls += 1; return {}; },
    }));
    expect(response?.status).toBe(409);
    expect(calls).toBe(0);
    expect(await response?.json()).toMatchObject({
      action_id: "pr.publish_batch",
      confirmation_required: true,
      error: "pr.publish_batch requires operator confirmation",
    });
  });

  test("routes activation, release, publication, and adoption operator commands", async () => {
    const seen: string[] = [];
    const routeDeps = deps({
      activate: async () => { seen.push("activate"); return {}; },
      adoptLegacy: async () => { seen.push("adopt"); return {}; },
      publishBatch: async () => { seen.push("publish"); return {}; },
      release: async () => { seen.push("release"); return {}; },
    });
    for (const [path, confirmed] of [
      ["/api/pr/activate", false],
      ["/api/pr/release", false],
      ["/api/pr/publish-batch", true],
      ["/api/pr/adopt-legacy", false],
    ] as const) {
      const request = new Request(`http://test${path}`, {
        body: JSON.stringify({ confirmed, projectId: "melee" }),
        method: "POST",
      });
      expect((await handlePrCampaignApiRoute(request, new URL(request.url), routeDeps))?.status).toBe(200);
    }
    expect(seen).toEqual(["activate", "release", "publish", "adopt"]);
  });
});
