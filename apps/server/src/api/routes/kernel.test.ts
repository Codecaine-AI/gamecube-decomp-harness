import { describe, expect, test } from "bun:test";

import { handleKernelApiRoute, type KernelApiRouteDeps } from "./kernel.js";

function deps(overrides: Partial<KernelApiRouteDeps> = {}): KernelApiRouteDeps {
  return {
    json: (data, init) => Response.json(data, init),
    kernelReadApiResponse: async () => Response.json({}),
    kernelRuntimeRequired: false,
    kernelStatus: async () => ({ configured: true }),
    kernelWorkerTrace: async () => null,
    ...overrides,
  };
}

describe("handleKernelApiRoute worker trace", () => {
  test("passes an exact worker identity to the direct trace reader", async () => {
    const received: unknown[] = [];
    const url = new URL("http://localhost/api/kernel/worker-trace?gameId=melee&sessionId=cycle-1&runId=run-1&epochId=epoch-7&claimId=claim-1");
    const response = await handleKernelApiRoute(url, deps({
      kernelWorkerTrace: async (input) => {
        received.push(input);
        return { container: { id: "worker-1" }, events: [] };
      },
    }));

    expect(response?.status).toBe(200);
    expect(received).toEqual([{
      claimId: "claim-1",
      epochId: "epoch-7",
      gameId: "melee",
      runId: "run-1",
      sessionId: "cycle-1",
    }]);
    expect(await response?.json()).toEqual({
      trace: { container: { id: "worker-1" }, events: [] },
    });
  });

  test("rejects an incomplete worker identity before reading the kernel", async () => {
    let called = false;
    const response = await handleKernelApiRoute(
      new URL("http://localhost/api/kernel/worker-trace?gameId=melee"),
      deps({ kernelWorkerTrace: async () => { called = true; return null; } }),
    );

    expect(response?.status).toBe(400);
    expect(called).toBe(false);
    expect(await response?.json()).toEqual({ error: "Worker trace requires claimId" });
  });
});
