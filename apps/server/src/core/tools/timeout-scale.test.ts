import { afterEach, describe, expect, test } from "bun:test";
import { SANDBOX_CPUS_ENV, sandboxCpuCount, scaleTimeout, TOOL_TIMEOUT_SCALE_ENV, toolTimeoutScale } from "./timeout-scale.js";
import { workspaceToolTimeoutMs } from "./wrappers/workspace-tool-exec.js";

const previous = { [TOOL_TIMEOUT_SCALE_ENV]: process.env[TOOL_TIMEOUT_SCALE_ENV], [SANDBOX_CPUS_ENV]: process.env[SANDBOX_CPUS_ENV] };
afterEach(() => {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("tool timeout scale", () => {
  test("prefers the context, falls back to the worker env, and ignores invalid values", () => {
    delete process.env[TOOL_TIMEOUT_SCALE_ENV];
    expect(toolTimeoutScale()).toBe(1);
    process.env[TOOL_TIMEOUT_SCALE_ENV] = "2.5";
    expect(toolTimeoutScale({})).toBe(2.5);
    expect(toolTimeoutScale({ timeoutScale: 3 })).toBe(3);
    expect(toolTimeoutScale({ timeoutScale: 0 })).toBe(2.5);
    process.env[TOOL_TIMEOUT_SCALE_ENV] = "-1";
    expect(toolTimeoutScale()).toBe(1);
  });

  test("reads the sandbox CPU count as a positive integer, else undefined", () => {
    delete process.env[SANDBOX_CPUS_ENV];
    expect(sandboxCpuCount()).toBeUndefined();
    process.env[SANDBOX_CPUS_ENV] = "1";
    expect(sandboxCpuCount()).toBe(1);
    for (const invalid of ["0", "-2", "1.5", "two", " "]) {
      process.env[SANDBOX_CPUS_ENV] = invalid;
      expect(sandboxCpuCount()).toBeUndefined();
    }
  });

  test("scales defaults without exceeding the cap", () => {
    expect(scaleTimeout(90, 2, 900)).toBe(180);
    expect(scaleTimeout(900, 3, 1_800)).toBe(1_800);
  });

  test("workspace tool exec scales its default and floor but keeps the 30-minute cap", () => {
    expect(workspaceToolTimeoutMs([])).toBe(300_000);
    expect(workspaceToolTimeoutMs([], 2)).toBe(600_000);
    expect(workspaceToolTimeoutMs(["--timeout-seconds", "10"])).toBe(190_000);
    expect(workspaceToolTimeoutMs(["--timeout-seconds", "10"], 2)).toBe(240_000);
    expect(workspaceToolTimeoutMs(["--timeout-seconds", "300"], 2)).toBe(480_000);
    expect(workspaceToolTimeoutMs(["--timeout-seconds", "5000"], 2)).toBe(1_800_000);
    expect(workspaceToolTimeoutMs([], 100)).toBe(1_800_000);
  });
});
