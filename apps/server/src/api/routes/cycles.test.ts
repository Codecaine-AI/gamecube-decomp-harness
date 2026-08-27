import { describe, expect, test } from "bun:test";
import { handleCyclesApiRoute, type CyclesApiRouteDeps } from "./cycles.js";

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
