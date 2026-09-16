import { describe, expect, spyOn, test } from "bun:test";
import { handleDashboardApiRoute, type DashboardApiRouteDeps } from "./dashboard.js";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function boundaryDetailDeps(boundaryStepDetail: DashboardApiRouteDeps["boundaryStepDetail"]): DashboardApiRouteDeps {
  return {
    boundaryStepDetail,
    json,
    requestPaths: () => ({ stateDir: "/state" }),
  } as unknown as DashboardApiRouteDeps;
}

function boundaryDetailUrl(query: Record<string, string>): URL {
  const url = new URL("http://localhost/api/run/boundary-step-detail");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

describe("handleDashboardApiRoute retired preparation routes", () => {
  test.each(["sync-git", "pr-index"])("does not redirect %s", async (action) => {
    const url = new URL(`http://localhost/api/cycle/preparing/${action}?gameId=melee`);
    const response = await handleDashboardApiRoute(new Request(url, { method: "POST" }), url, {} as DashboardApiRouteDeps);
    expect(response).toBeNull();
  });
});

describe("handleDashboardApiRoute boundary step detail", () => {
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
    const response = await handleDashboardApiRoute(new Request(url), url, boundaryDetailDeps(() => {
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
    const response = await handleDashboardApiRoute(new Request(url), url, boundaryDetailDeps(() => detail));

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual(detail);
  });

  test("returns a sanitized 500 and logs unexpected failures", async () => {
    const url = boundaryDetailUrl(validQuery);
    const failure = new Error("database path and query details");
    const errorLog = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await handleDashboardApiRoute(new Request(url), url, boundaryDetailDeps(() => {
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

 test("config resolves the explicitly selected game instead of the default", async () => {
   const sms = { gameId: "sms", repoRoot: "/sms", stateDir: "/sms/state" };
   const url = new URL("http://localhost/api/config?gameId=sms");
   const deps = {
     json, defaultGame: () => { throw new Error("must not use Melee default"); },
     requestPaths: (requested: URL) => { expect(requested.searchParams.get("gameId")).toBe("sms"); return { game: sms, stateDir: sms.stateDir }; },
     availableGames: () => [], defaultGameId: (game: typeof sms) => game.gameId,
     defaultGraphDbPath: () => "/sms/graph", gameToSummary: (game: unknown) => game,
     gameDefaults: () => ({ processName: "sms-live" }),
   } as unknown as DashboardApiRouteDeps;
   const response = await handleDashboardApiRoute(new Request(url), url, deps);
   expect(await response!.json()).toMatchObject({ defaultGameId: "sms", defaultRepoRoot: "/sms", defaultStateDir: "/sms/state", selectedGame: sms });
 });
