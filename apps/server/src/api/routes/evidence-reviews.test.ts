import { describe, expect, test } from "bun:test";
import { handleEvidenceReviewsApiRoute, type EvidenceReviewsApiRouteDeps } from "./evidence-reviews.js";

function deps(overrides: Partial<EvidenceReviewsApiRouteDeps> = {}): EvidenceReviewsApiRouteDeps {
  return {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    listReviews: () => [],
    decideReview: async () => ({}),
    ...overrides,
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/evidence-reviews/decision", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function call(req: Request, overrides: Partial<EvidenceReviewsApiRouteDeps> = {}): Promise<Response | null> {
  return handleEvidenceReviewsApiRoute(req, new URL(req.url), deps(overrides));
}

describe("evidence-review routes", () => {
  test("lists a game's requests, open by default", async () => {
    const seen: string[] = [];
    const response = await call(new Request("http://localhost/api/evidence-reviews?gameId=sms"), {
      listReviews: ({ gameId, status }) => {
        seen.push(`${gameId}:${status}`);
        return [{ id: "er-1" }];
      },
    });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ gameId: "sms", reviews: [{ id: "er-1" }] });
    await call(new Request("http://localhost/api/evidence-reviews?gameId=sms&status=all"), {
      listReviews: ({ gameId, status }) => {
        seen.push(`${gameId}:${status}`);
        return [];
      },
    });
    expect(seen).toEqual(["sms:open", "sms:all"]);
    expect((await call(new Request("http://localhost/api/evidence-reviews?gameId=sms&status=pending")))?.status).toBe(400);
    expect((await call(new Request("http://localhost/api/evidence-reviews")))?.status).toBe(400);
  });

  test("a decision needs an id, a known decision and a note", async () => {
    let decided = 0;
    const counting = { decideReview: async () => ({ decided: ++decided }) };
    expect((await call(post({ gameId: "sms", decision: "approved", note: "x" }), counting))?.status).toBe(400);
    expect((await call(post({ gameId: "sms", id: "er-1", decision: "approved", note: "x" }), counting))?.status).toBe(400);
    expect((await call(post({ gameId: "sms", id: "er-1", revision: 3, decision: "maybe", note: "x" }), counting))?.status).toBe(400);
    expect((await call(post({ gameId: "sms", id: "er-1", revision: 3, decision: "approved", note: "   " }), counting))?.status).toBe(400);
    expect(decided).toBe(0);
    const response = await call(post({ gameId: "sms", id: "er-1", revision: 3, decision: "rejected", note: " not original ", decidedBy: "ford" }), {
      decideReview: async (body) => ({ body: { gameId: body.gameId, id: body.id, revision: body.revision, decision: body.decision, note: body.note, decidedBy: body.decidedBy } }),
    });
    expect(await response?.json()).toEqual({ body: { gameId: "sms", id: "er-1", revision: 3, decision: "rejected", note: "not original", decidedBy: "ford" } });
  });

  test("decision errors keep their status", async () => {
    const response = await call(post({ gameId: "sms", id: "er-1", revision: 3, decision: "approved", note: "ok" }), {
      decideReview: async () => {
        throw Object.assign(new Error("evidence review er-1 is already approved"), { status: 409 });
      },
    });
    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({ error: "evidence review er-1 is already approved" });
  });

  test("other paths fall through", async () => {
    expect(await call(new Request("http://localhost/api/other"))).toBeNull();
    expect(await call(new Request("http://localhost/api/evidence-reviews/decision"))).toBeNull();
  });
});
