import { describe, expect, test } from "bun:test";
import { LocalProcessExecutor } from "./executor.js";
import type { TaskHandle, TaskSpec } from "./types.js";

function task(command: string[], timeoutMs: number | null = null): TaskSpec {
  return { jobId: "job-1", kind: "worker", executionClass: "local", command, env: { ...process.env } as Record<string, string>, cwd: process.cwd(), timeoutMs };
}

describe("LocalProcessExecutor", () => {
  test("captures a successful process and transitions to exited", async () => {
    const executor = new LocalProcessExecutor();
    const handle = await executor.submit(task(["/bin/sh", "-c", "printf output; printf error >&2; sleep 0.05"]));
    expect(handle.executorId).toBe("local-process");
    expect(await executor.poll(handle)).toEqual({ state: "running" });
    const outcome = await executor.collect(handle);
    expect(outcome).toMatchObject({ exitCode: 0, signal: null, stdout: "output", stderr: "error", timedOut: false });
    expect(await executor.poll(handle)).toEqual({ state: "exited" });
  });

  test("reports a nonzero exit", async () => {
    const executor = new LocalProcessExecutor();
    const outcome = await executor.collect(await executor.submit(task(["/bin/sh", "-c", "exit 7"])));
    expect(outcome.exitCode).toBe(7);
    expect(outcome.timedOut).toBeFalse();
  });

  test("kills a process after timeout", async () => {
    const executor = new LocalProcessExecutor();
    const outcome = await executor.collect(await executor.submit(task(["/bin/sh", "-c", "sleep 1"], 20)));
    expect(outcome.timedOut).toBeTrue();
    expect(outcome.signal).toBe("SIGKILL");
    expect(outcome.exitCode).not.toBe(0);
  });

  test("cancel kills a running process without marking timeout", async () => {
    const executor = new LocalProcessExecutor();
    const handle = await executor.submit(task(["/bin/sh", "-c", "sleep 1"]));
    await executor.cancel(handle);
    const outcome = await executor.collect(handle);
    expect(outcome.timedOut).toBeFalse();
    expect(outcome.signal).toBe("SIGKILL");
    expect(outcome.exitCode).not.toBe(0);
  });

  test("throws for unknown handles", async () => {
    const executor = new LocalProcessExecutor();
    const unknown = { executorId: "local-process", handleId: "missing" } as TaskHandle;
    await expect(executor.poll(unknown)).rejects.toThrow("Unknown local process handle");
    await expect(executor.collect(unknown)).rejects.toThrow("Unknown local process handle");
    await expect(executor.cancel(unknown)).rejects.toThrow("Unknown local process handle");
  });
});
