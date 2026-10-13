import { afterEach, describe, expect, test } from "bun:test";
import { scaleTimeout, TOOL_TIMEOUT_SCALE_ENV, toolTimeoutScale } from "./timeout-scale.js";
import { workspaceToolTimeoutMs } from "./wrappers/workspace-tool-exec.js";

const previous = process.env[TOOL_TIMEOUT_SCALE_ENV];
afterEach(() => {
  if (previous === undefined) delete process.env[TOOL_TIMEOUT_SCALE_ENV];
  else process.env[TOOL_TIMEOUT_SCALE_ENV] = previous;
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
