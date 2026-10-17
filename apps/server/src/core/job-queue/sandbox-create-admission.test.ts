import { describe, expect, test } from "bun:test";
import {
  SandboxCreateAdmission,
  SandboxCreateTimeoutError,
  classifyCreateRefusal,
  sandboxCreateAdmissionOptionsFromEnv,
  type SandboxCreateAdmissionOptions,
} from "./sandbox-create-admission.js";

function admission(overrides: Partial<SandboxCreateAdmissionOptions> = {}, deps: ConstructorParameters<typeof SandboxCreateAdmission>[1] = {}) {
  const options = { ...sandboxCreateAdmissionOptionsFromEnv({}), retryBaseMs: 1, retryMaxMs: 4, ...overrides };
  return new SandboxCreateAdmission(() => options, deps);
}

const quotaError = () => Object.assign(new Error("Total CPU quota exceeded. Maximum allowed: 2"), { statusCode: 403 });
const rateError = (headers?: Record<string, string>) => Object.assign(new Error("Too Many Requests"), { statusCode: 429, ...(headers ? { headers } : {}) });

describe("classifyCreateRefusal", () => {
  test("separates quota refusals, rate limits and real failures", () => {
    expect(classifyCreateRefusal(quotaError())).toEqual({ kind: "quota", retryAfterMs: null });
    expect(classifyCreateRefusal(new Error("Request failed with status code 429: Total CPU quota exceeded: 30 sandboxes"))?.kind).toBe("quota");
    expect(classifyCreateRefusal(rateError({ "retry-after": "3" }))).toEqual({ kind: "rate", retryAfterMs: 3_000 });
    expect(classifyCreateRefusal(Object.assign(new Error("slow down"), { name: "DaytonaRateLimitError" }))?.kind).toBe("rate");
    expect(classifyCreateRefusal(new Error("Request failed with status code 502"))).toBeNull();
    expect(classifyCreateRefusal(new Error("snapshot sms-worker not found"))).toBeNull();
  });
});

describe("sandboxCreateAdmissionOptionsFromEnv", () => {
  test("reads env overrides and ignores invalid values", () => {
    const options = sandboxCreateAdmissionOptionsFromEnv({
      ORCH_SANDBOX_CREATE_CONCURRENCY: "4",
      ORCH_SANDBOX_MAX_ALIVE: "150",
      ORCH_SANDBOX_CREATE_MAX_WAIT_MS: "nope",
      ORCH_SANDBOX_CREATE_RETRY_BASE_MS: "-5",
    });
    expect(options.maxConcurrentCreates).toBe(4);
    expect(options.maxAlive).toBe(150);
    expect(options.maxWaitMs).toBe(30 * 60_000);
    expect(options.retryBaseMs).toBe(1_000);
  });
});

describe("SandboxCreateAdmission", () => {
  test("bounds in-flight creates and the alive cap; untracked sandboxes do not hold a slot", async () => {
    const gate = admission({ maxConcurrentCreates: 2, maxAlive: 3 });
    let inFlight = 0;
    let peak = 0;
    let next = 0;
    const create = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Bun.sleep(5);
      inFlight -= 1;
      return { sandboxId: `s-${next++}` };
    };
    await gate.run(create, { track: false });
    expect(gate.snapshot().alive).toBe(0);
    const created = await Promise.all([gate.run(create), gate.run(create), gate.run(create)]);
    expect(peak).toBe(2);
    expect(gate.snapshot().alive).toBe(3);
    let fourth = false;
    const queued = gate.run(create).then((value) => { fourth = true; return value; });
    await Bun.sleep(30);
    expect(fourth).toBe(false);
    expect(gate.snapshot().queued).toBe(1);
    gate.deleted(created[0]!.sandboxId);
    await queued;
    expect(fourth).toBe(true);
    expect(gate.stats.maxQueued).toBeGreaterThanOrEqual(1);
  });

  test("a quota refusal teaches a cap that holds until a delete or the probe interval", async () => {
    let now = 0;
    const gate = admission({ quotaProbeMs: 1_000 }, { now: () => now, sleep: async () => undefined });
    const held = await gate.run(async () => ({ sandboxId: "held" }));
    let refusals = 1;
    let attempts = 0;
    const second = gate.run(async () => {
      attempts += 1;
      if (refusals-- > 0) throw quotaError();
      return { sandboxId: "second" };
    });
    await Bun.sleep(20);
    expect(attempts).toBe(1);
    expect(gate.snapshot().learnedCap).toBe(1);
    gate.deleted(held.sandboxId);
    expect((await second).sandboxId).toBe("second");
    expect(attempts).toBe(2);
    expect(gate.stats.quotaRefusals).toBe(1);

    // With nothing of ours alive the cap is zero: creates wait for the probe interval.
    let probed = false;
    const blocked = gate.run(async () => {
      if (!probed) { probed = true; throw quotaError(); }
      return { sandboxId: "after-probe" };
    });
    gate.deleted("second");
    await Bun.sleep(20);
    expect(gate.snapshot().learnedCap).toBe(0);
    now += 1_001;
    expect((await blocked).sandboxId).toBe("after-probe");
  });

  test("backs off with jitter, honours retry-after and bounds rate-limit retries", async () => {
    const sleeps: number[] = [];
    const gate = admission({ maxRateRetries: 2, retryBaseMs: 100, retryMaxMs: 300 }, { random: () => 1, sleep: async (ms) => { sleeps.push(ms); } });
    let calls = 0;
    await expect(gate.run(async () => { calls += 1; throw rateError(); })).rejects.toThrow("Too Many Requests");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([100, 200]);
    sleeps.length = 0;
    await gate.run(async () => {
      if (sleeps.length === 0) throw rateError({ "retry-after": "2" });
      return { sandboxId: "ok" };
    });
    expect(sleeps).toEqual([2_000]);
    expect(admission({ retryBaseMs: 1_000, retryMaxMs: 8_000 }, { random: () => 0 }).backoffMs(10, { kind: "rate", retryAfterMs: null })).toBe(4_000);
  });

  test("gives up past the overall deadline and passes other errors straight through", async () => {
    let now = 0;
    const gate = admission({ maxWaitMs: 10, retryBaseMs: 4, retryMaxMs: 4, quotaProbeMs: 0 }, { now: () => now, random: () => 1, sleep: async (ms) => { now += ms; } });
    await expect(gate.run(async () => { throw quotaError(); })).rejects.toBeInstanceOf(SandboxCreateTimeoutError);
    await expect(gate.run(async () => { throw new Error("snapshot missing"); })).rejects.toThrow("snapshot missing");
    expect(gate.snapshot().creating).toBe(0);
  });
});
