import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { projectToolConcurrencyDefaults, toolConcurrencyEnvFromInput } from "./concurrency-config.js";

describe("tool concurrency config", () => {
  test("reads configured project local env values with code defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-concurrency-"));
    const localEnvPath = join(dir, "local.env");
    writeFileSync(
      localEnvPath,
      [
        "ORCH_WORKER_COMPILE_CONCURRENCY=32",
        "ORCH_WORKER_TOOL_CONCURRENCY_MWCC_DEBUG=6",
        "ORCH_WORKER_TOOL_CONCURRENCY_SOURCE_PERMUTER=2",
        "",
      ].join("\n"),
    );

    const config = projectToolConcurrencyDefaults(localEnvPath, {});

    expect(config.configured).toMatchObject({
      checkdiff: 12,
      compile: 32,
      m2cDecomp: 8,
      mwccDebug: 6,
      other: 16,
      sourcePermuter: 2,
      sourcePermuterJobs: 1,
    });
    expect(config.defaults.mwccDebug).toBe(2);
    expect(config.env.sourcePermuter).toBe("ORCH_WORKER_TOOL_CONCURRENCY_SOURCE_PERMUTER");
  });

  test("maps UI input to bounded worker env overrides", () => {
    expect(
      toolConcurrencyEnvFromInput({
        compile: 128,
        mwccDebug: "6",
        sourcePermuter: "2",
        sourcePermuterJobs: 0,
      }),
    ).toEqual({
      ORCH_WORKER_COMPILE_CONCURRENCY: "64",
      ORCH_WORKER_TOOL_CONCURRENCY_MWCC_DEBUG: "6",
      ORCH_WORKER_TOOL_CONCURRENCY_SOURCE_PERMUTER: "2",
      ORCH_SOURCE_PERMUTER_MAX_JOBS: "1",
    });
  });
});
