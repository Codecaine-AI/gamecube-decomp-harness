import { describe, expect, test } from "bun:test";
import { workerTtlSeconds } from "./worker-ttl.js";

describe("worker ttl", () => {
  test("uses agent timeout as the worker hard cap", () => {
    expect(workerTtlSeconds({ agentTimeoutSeconds: 1800 }, new Map())).toBe(1800);
  });

  test("rejects the removed ttl flag", () => {
    expect(() => workerTtlSeconds({ agentTimeoutSeconds: 1800 }, new Map([["--ttl-seconds", "900"]]))).toThrow("--ttl-seconds");
  });

  test("requires an agent timeout", () => {
    expect(() => workerTtlSeconds({}, new Map())).toThrow("--agent-timeout-seconds");
  });
});
