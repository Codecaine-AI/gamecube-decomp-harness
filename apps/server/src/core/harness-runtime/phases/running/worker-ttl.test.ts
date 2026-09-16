import { describe, expect, test } from "bun:test";
import { CLAIM_TTL_GRACE_SECONDS, workerTtlSeconds } from "./worker-ttl.js";

describe("worker ttl", () => {
  test("adds claim grace to the agent timeout", () => {
    expect(workerTtlSeconds({ agentTimeoutSeconds: 1800 }, new Map())).toBe(1800 + CLAIM_TTL_GRACE_SECONDS);
  });

  test("rejects the removed ttl flag", () => {
    expect(() => workerTtlSeconds({ agentTimeoutSeconds: 1800 }, new Map([["--ttl-seconds", "900"]]))).toThrow("--ttl-seconds");
  });

  test("requires an agent timeout", () => {
    expect(() => workerTtlSeconds({}, new Map())).toThrow("--agent-timeout-seconds");
  });
});
