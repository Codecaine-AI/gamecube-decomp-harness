import { describe, expect, mock, test } from "bun:test";
import type { AgentToolRuntimeContext } from "../types.js";

mock.module("../runtime/execution.js", () => ({
  runKnowledgeToolApiForContext: async () => ({}),
}));

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
});
