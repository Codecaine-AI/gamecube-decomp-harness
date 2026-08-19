import { describe, expect, test } from "bun:test";
import { FakeSandboxProvider } from "@server/core/job-queue/sandbox.js";
import {
  MWCC_DEBUG_COMPILER_PROBE_COMMAND,
  MWCC_DEBUG_COMPILER_PROBE_TIMEOUT_MS,
  probeMwccDebugCompilerProvisioned,
} from "./worker-cycle.js";

describe("worker sandbox capability probes", () => {
  test("issues one bounded MWCC-debug probe and accepts a matching compiler", async () => {
    const provider = new FakeSandboxProvider().scriptExec({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    const handle = await provider.create({
      snapshot: "test",
      labels: {},
      resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
      ttlMinutes: 5,
    });

    expect(await probeMwccDebugCompilerProvisioned(handle, "/workspace/melee")).toBeTrue();
    expect(provider.execCalls).toEqual([{
      sandboxId: handle.sandboxId,
      command: [...MWCC_DEBUG_COMPILER_PROBE_COMMAND],
      opts: {
        cwd: "/workspace/melee",
        env: undefined,
        timeoutMs: MWCC_DEBUG_COMPILER_PROBE_TIMEOUT_MS,
      },
    }]);
  });

  test("treats a missing compiler or failed sandbox exec as unavailable", async () => {
    const provider = new FakeSandboxProvider().scriptExec({ exitCode: 1, stdout: "", stderr: "" });
    const handle = await provider.create({
      snapshot: "test",
      labels: {},
      resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
      ttlMinutes: 5,
    });

    expect(await probeMwccDebugCompilerProvisioned(handle, "/workspace/melee")).toBeFalse();
    expect(provider.execCalls).toHaveLength(1);

    const failedProvider = new FakeSandboxProvider().scriptExec(new Error("sandbox unavailable"));
    const failedHandle = await failedProvider.create({
      snapshot: "test",
      labels: {},
      resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
      ttlMinutes: 5,
    });
    expect(await probeMwccDebugCompilerProvisioned(failedHandle, "/workspace/melee")).toBeFalse();
    expect(failedProvider.execCalls).toHaveLength(1);
  });
});
