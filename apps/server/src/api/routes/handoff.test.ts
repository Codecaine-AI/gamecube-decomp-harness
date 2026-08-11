import { describe, expect, test } from "bun:test";

import { handleHandoffApiRoute, type HandoffApiRouteDeps } from "./handoff.js";

describe("handleHandoffApiRoute", () => {
  test("routes standalone ship-set verification through the handoff runtime", async () => {
    const received: Array<Record<string, unknown>> = [];
    const response = await handleHandoffApiRoute(
      new Request("http://localhost/api/pr/verify-ship-set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1", sourceRef: "HEAD" }),
      }),
      new URL("http://localhost/api/pr/verify-ship-set"),
      {
        json: (data: unknown) => Response.json(data),
        verifyShipSet: async (body: Record<string, unknown>) => {
          received.push(body);
          return { status: "pr_ready" };
        },
      } as unknown as HandoffApiRouteDeps,
    );

    expect(received).toEqual([{ runId: "run-1", sourceRef: "HEAD" }]);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ status: "pr_ready" });
  });
});
