import { describe, expect, test } from "bun:test";
import type { AgentToolRuntimeContext } from "../types.js";

const { sourcePermuterRunArgs } = await import("./capabilities.js");

function context(sandbox: boolean): AgentToolRuntimeContext {
  return {
    repoRoot: "/opt/melee",
    ...(sandbox ? { sandboxHandle: {} as AgentToolRuntimeContext["sandboxHandle"] } : {}),
  } as AgentToolRuntimeContext;
}

function jobsArgs(args: string[] | Record<string, unknown>): string[] {
  if (!Array.isArray(args)) throw new Error("expected argument list");
  const index = args.indexOf("--jobs");
  return index < 0 ? [] : args.slice(index, index + 2);
}

describe("source permuter wrapper arguments", () => {
  test("uses sandbox auto jobs, serial host jobs, and clamps explicit jobs", () => {
    expect(jobsArgs(sourcePermuterRunArgs({ function: "fn" }, context(true)))).toEqual([]);
    expect(jobsArgs(sourcePermuterRunArgs({ function: "fn" }, context(false)))).toEqual(["--jobs", "1"]);
    expect(jobsArgs(sourcePermuterRunArgs({ function: "fn", jobs: 32 }, context(true)))).toEqual(["--jobs", "16"]);
  });

  test("scales the default timeout by the sandbox profile and keeps explicit values clamped", () => {
    const timeout = (args: string[] | Record<string, unknown>) => {
      if (!Array.isArray(args)) throw new Error("expected argument list");
      return args[args.indexOf("--timeout-seconds") + 1];
    };
    expect(timeout(sourcePermuterRunArgs({ function: "fn" }, context(true)))).toBe("90");
    expect(timeout(sourcePermuterRunArgs({ function: "fn" }, { ...context(true), timeoutScale: 2 }))).toBe("180");
    expect(timeout(sourcePermuterRunArgs({ function: "fn" }, { ...context(true), timeoutScale: 20 }))).toBe("900");
    expect(timeout(sourcePermuterRunArgs({ function: "fn", timeout_seconds: 5000 }, { ...context(true), timeoutScale: 2 }))).toBe("900");
  });
});
