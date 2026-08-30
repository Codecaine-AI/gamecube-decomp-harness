import { describe, expect, spyOn, test } from "bun:test";
import { handleCyclesApiRoute, type CyclesApiRouteDeps } from "./cycles.js";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function boundaryDetailDeps(boundaryStepDetail: CyclesApiRouteDeps["boundaryStepDetail"]): CyclesApiRouteDeps {
  return {
    boundaryStepDetail,
    json,
    requestPaths: () => ({ stateDir: "/state" }),
  } as unknown as CyclesApiRouteDeps;
}

function boundaryDetailUrl(query: Record<string, string>): URL {
  const url = new URL("http://localhost/api/run/boundary-step-detail");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

describe("handleCyclesApiRoute preparation sync", () => {
  test.each([
    ["/api/cycle/preparing/sync-git", "gameId"],
    ["/api/cycle/preparing/pr-index", "gameId"],
  ])("redirects POST %s to operator sync.start without invoking preparation", async (pathname, idParam) => {
    let preparationCalls = 0;
    const deps = {
      indexPrsForPrepare: async () => {
        preparationCalls += 1;
        return {};
      },
      syncGitForPrepare: async () => {
        preparationCalls += 1;
        return {};
      },
    } as unknown as CyclesApiRouteDeps;
    const url = new URL(`http://localhost${pathname}?${idParam}=melee`);
    const response = await handleCyclesApiRoute(
      new Request(url, {
        body: JSON.stringify({ gameId: "melee" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      url,
      deps,
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/api/sync/start?gameId=melee");
    expect(preparationCalls).toBe(0);
  });
});

describe("handleCyclesApiRoute boundary step detail", () => {
  const validQuery = {
    runId: "run-1",
    epochId: "epoch-1",
    attempt: "1",
    step: "boundary_sync",
  };

  test.each([
    ["unknown step", { ...validQuery, step: "not-a-boundary-step" }],
    ["unsafe attempt", { ...validQuery, attempt: "9007199254740992" }],
  ])("returns 400 for %s", async (_label, query) => {
    let detailCalls = 0;
    const url = boundaryDetailUrl(query);
    const response = await handleCyclesApiRoute(new Request(url), url, boundaryDetailDeps(() => {
      detailCalls += 1;
      return {};
    }));

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      error: "Boundary step detail requires runId, epochId, a positive integer attempt, and step.",
    });
    expect(detailCalls).toBe(0);
  });

  test.each(["epoch", "attempt", "step"] as const)("returns 404 for typed %s misses", async (notFound) => {
    const url = boundaryDetailUrl(validQuery);
    const detail = { error: `${notFound} missing`, notFound };
    const response = await handleCyclesApiRoute(new Request(url), url, boundaryDetailDeps(() => detail));

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual(detail);
  });

  test("returns a sanitized 500 and logs unexpected failures", async () => {
    const url = boundaryDetailUrl(validQuery);
    const failure = new Error("database path and query details");
    const errorLog = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await handleCyclesApiRoute(new Request(url), url, boundaryDetailDeps(() => {
        throw failure;
      }));

      expect(response?.status).toBe(500);
      expect(await response?.json()).toEqual({ error: "boundary step detail failed" });
      expect(errorLog).toHaveBeenCalledWith("Boundary step detail failed", failure);
    } finally {
      errorLog.mockRestore();
    }
  });
});
