import { describe, expect, test } from "bun:test";
import type { AgentToolRuntimeContext } from "../types.js";
import {
  annotateIgnoredDirectCompileUnit,
  directCompileTuArgs,
  promoteSourcePermuterInvocationFailure,
} from "./capabilities.js";

const context = { repoRoot: "/opt/melee" } as AgentToolRuntimeContext;

describe("capability wrapper result normalization", () => {
  test("direct_compile_tu prefers function and reports that unit was ignored", () => {
    const params = { function: "PlayerThink", unit: "melee/player" };

    expect(directCompileTuArgs(params, context)).toEqual([
      "--repo-root",
      "/opt/melee",
      "--function",
      "PlayerThink",
    ]);
    expect(annotateIgnoredDirectCompileUnit({ status: "ok" }, params)).toEqual({
      status: "ok",
      note: "unit was ignored because function implies the unit.",
    });
  });

  test("source_permuter_run promotes function lookup and source parse failures", () => {
    expect(promoteSourcePermuterInvocationFailure({
      status: "ok",
      parsed: {
        status: "failed",
        stderr: "error: function 'MissingFn' not found in /opt/melee/src/melee/player.c",
      },
    })).toMatchObject({
      status: "failed",
      reason: "error: function 'MissingFn' not found in /opt/melee/src/melee/player.c",
    });

    expect(promoteSourcePermuterInvocationFailure({
      status: "ok",
      parsed: {
        status: "failed",
        reason: "parse failure at source path /opt/melee/src/melee/player.c",
      },
    })).toMatchObject({
      status: "failed",
      reason: "parse failure at source path /opt/melee/src/melee/player.c",
    });
  });
});
