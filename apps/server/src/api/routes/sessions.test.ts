import { describe, expect, test } from "bun:test";
import { handleSessionsApiRoute, type SessionsApiRouteDeps } from "./sessions.js";

describe("handleSessionsApiRoute preparation sync compatibility", () => {
  test.each([
    "/api/project-session/preparing/sync-git",
    "/api/project-session/preparing/pr-index",
  ])("redirects POST %s to operator sync.start without invoking legacy preparation", async (pathname) => {
    let legacyCalls = 0;
    const deps = {
      indexPrsForPrepare: async () => {
        legacyCalls += 1;
        return {};
      },
      syncGitForPrepare: async () => {
        legacyCalls += 1;
        return {};
      },
    } as unknown as SessionsApiRouteDeps;
    const url = new URL(`http://localhost${pathname}?projectId=melee`);
    const response = await handleSessionsApiRoute(
      new Request(url, {
        body: JSON.stringify({ projectId: "melee" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      url,
      deps,
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/api/sync/start?projectId=melee");
    expect(legacyCalls).toBe(0);
  });
});
