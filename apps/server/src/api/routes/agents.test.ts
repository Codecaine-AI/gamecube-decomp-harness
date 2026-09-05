import { describe, expect, test } from "bun:test";

import { handleAgentsApiRoute, type AgentsApiRouteDeps } from "./agents.js";

function deps(overrides: Partial<AgentsApiRouteDeps> = {}): AgentsApiRouteDeps {
  return {
    json: (data, init) => Response.json(data, init),
    loadKernelAgentsPayload: () => ({}),
    requestPaths: () => ({ game: "melee" }),
    ...overrides,
  };
}

describe("handleAgentsApiRoute", () => {
  test("threads the selected worker preview target", async () => {
    const received: unknown[] = [];
    const response = await handleAgentsApiRoute(
      new URL("http://localhost/api/kernel/agents?target=main%2Fmelee%2Fmn%2Fmnvibration%3AmnVibration_HandleInput"),
      deps({
        loadKernelAgentsPayload: (paths, options) => {
          received.push({ paths, options });
          return { agents: [] };
        },
      }),
    );

    expect(response?.status).toBe(200);
    expect(received).toEqual([{
      paths: { game: "melee" },
      options: {
        target: {
          unit: "main/melee/mn/mnvibration",
          symbol: "mnVibration_HandleInput",
        },
      },
    }]);
  });

  test("rejects a malformed target selector", async () => {
    let called = false;
    const response = await handleAgentsApiRoute(
      new URL("http://localhost/api/kernel/agents?target=missing-separator"),
      deps({ loadKernelAgentsPayload: () => { called = true; return {}; } }),
    );

    expect(response?.status).toBe(400);
    expect(called).toBeFalse();
    expect(await response?.json()).toEqual({ error: "target must use <unit>:<symbol>" });
  });
});
