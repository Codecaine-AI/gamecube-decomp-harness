import { describe, expect, jest, test } from "bun:test";
import { probeWorkerProvider } from "./provider-probe.js";

describe("probeWorkerProvider", () => {
  test("uses the worker provider/model and one small tool-free Pi request", async () => {
    const model = { provider: "codex-lb", id: "gpt-5.6-sol" };
    const getModel = jest.fn(() => model);
    const completeSimple = jest.fn(async (..._args: unknown[]) => ({ stopReason: "stop" }));
    const createRuntime = jest.fn(async (..._args: unknown[]) => ({ getModel, completeSimple }));
    expect(await probeWorkerProvider({ provider: model.provider, model: model.id }, { createRuntime: createRuntime as never })).toEqual({ success: true });
    expect(getModel).toHaveBeenCalledWith("codex-lb", "gpt-5.6-sol");
    expect(createRuntime.mock.calls[0]?.[0]).toMatchObject({ allowModelNetwork: false });
    expect(completeSimple.mock.calls[0]?.[0]).toEqual(model);
    expect(completeSimple.mock.calls[0]?.[1]).toMatchObject({ messages: [{ role: "user", content: "Reply OK." }] });
    expect(completeSimple.mock.calls[0]?.[2]).toMatchObject({ maxTokens: 16, maxRetries: 0, timeoutMs: 30_000 });
  });

  test("reports provider errors and missing models as failed probes", async () => {
    for (const runtime of [
      { getModel: () => undefined },
      { getModel: () => ({}), completeSimple: async () => ({ stopReason: "error", errorMessage: "no_biscuit_no_service" }) },
    ]) {
      const result = await probeWorkerProvider({ provider: "codex-lb", model: "gpt-5.6-sol" }, { createRuntime: (async () => runtime) as never });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });

  test("bounds a stalled request and aborts the provider request", async () => {
    let signal: AbortSignal | undefined;
    const result = await probeWorkerProvider({ provider: "codex-lb", model: "gpt-5.6-sol", timeoutMs: 5 }, {
      createRuntime: (async () => ({
        getModel: () => ({}),
        completeSimple: (_model: unknown, _context: unknown, options: { signal: AbortSignal }) => {
          signal = options.signal;
          return new Promise(() => {});
        },
      })) as never,
    });
    expect(result).toEqual({ success: false, error: "Provider probe timed out after 5ms" });
    expect(signal?.aborted).toBe(true);
  });
});
