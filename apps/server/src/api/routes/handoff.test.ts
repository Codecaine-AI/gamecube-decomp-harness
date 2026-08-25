import { describe, expect, test } from "bun:test";

import { handleHandoffApiRoute, type HandoffApiRouteDeps } from "./handoff.js";

describe("handleHandoffApiRoute", () => {
  test("routes checkpoint requests", async () => {
    const received: Array<Record<string, unknown>> = [];
    const response = await handleHandoffApiRoute(
      new Request("http://localhost/api/run/checkpoint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1", reason: "manual" }),
      }),
      new URL("http://localhost/api/run/checkpoint"),
      {
        json: (data: unknown) => Response.json(data),
        checkpointRun: async (body: Record<string, unknown>) => {
          received.push(body);
          return { checkpointId: "checkpoint-1" };
        },
      } as unknown as HandoffApiRouteDeps,
    );

    expect(received).toEqual([{ runId: "run-1", reason: "manual" }]);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ checkpointId: "checkpoint-1" });
  });

  test("routes save-point requests", async () => {
    const received: Array<Record<string, unknown>> = [];
    const response = await handleHandoffApiRoute(
      new Request("http://localhost/api/save-point", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: "melee", reason: "manual" }),
      }),
      new URL("http://localhost/api/save-point"),
      {
        json: (data: unknown) => Response.json(data),
        createSavePoint: async (body: Record<string, unknown>) => {
          received.push(body);
          return { savePointId: "save-point-1" };
        },
      } as unknown as HandoffApiRouteDeps,
    );

    expect(received).toEqual([{ gameId: "melee", reason: "manual" }]);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ savePointId: "save-point-1" });
  });

  test("does not handle removed campaign routes", async () => {
    const response = await handleHandoffApiRoute(
      new Request("http://localhost/api/pr/qa-repair", { method: "POST" }),
      new URL("http://localhost/api/pr/qa-repair"),
      {} as HandoffApiRouteDeps,
    );

    expect(response).toBeNull();
  });
});
