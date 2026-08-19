import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wrapSandboxHandleWithSleep, type SleepingSandboxHandle } from "./sandbox-sleep.js";
import { FakeSandboxProvider, type SandboxCreateParams, type SandboxHandle } from "./sandbox.js";

const createParams: SandboxCreateParams = {
  snapshot: "melee-worker-v1",
  labels: { game_id: "melee", job_id: "job-sleep" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for sandbox sleep condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fixture(
  provider = new FakeSandboxProvider(),
  options: { debounceMs?: number; now?: () => number; log?: (message: string) => void } = {},
): Promise<{
  provider: FakeSandboxProvider;
  raw: SandboxHandle;
  sleeping: SleepingSandboxHandle;
}> {
  const raw = await provider.create(createParams);
  const sleeping = wrapSandboxHandleWithSleep(raw, {
    debounceMs: options.debounceMs ?? 1_000,
    now: options.now,
    log: options.log,
  });
  return { provider, raw, sleeping };
}

describe("wrapSandboxHandleWithSleep wake and debounce", () => {
  test("wakes on demand and parallel operations share one in-flight start", async () => {
    const startGate = deferred();
    const provider = new FakeSandboxProvider().scriptStart(() => startGate.promise);
    const { sleeping } = await fixture(provider);
    await sleeping.stop();
    provider.operationCalls.length = 0;

    const first = sleeping.exec(["first"], { timeoutMs: 100 });
    const second = sleeping.exec(["second"], { timeoutMs: 200 });
    await waitFor(() => provider.startCalls.length === 1);
    expect(provider.execCalls).toHaveLength(0);

    startGate.resolve();
    await Promise.all([first, second]);
    expect(provider.startCalls).toHaveLength(1);
    expect(provider.operationCalls.map((call) => call.operation)).toEqual(["start", "exec", "exec"]);
    expect(provider.execCalls.map((call) => call.opts.timeoutMs)).toEqual([100, 200]);
    await sleeping.close();
  });

  test("cancels the pending stop when an operation arrives inside the debounce window", async () => {
    const { provider, sleeping } = await fixture(undefined, { debounceMs: 60 });
    await sleeping.exec(["first"], { timeoutMs: 100 });
    await pause(15);
    expect(provider.stopCalls).toHaveLength(0);

    await sleeping.exec(["second"], { timeoutMs: 100 });
    await pause(45);
    expect(provider.stopCalls).toHaveLength(0);
    await waitFor(() => provider.stopCalls.length === 1);
    expect(provider.stopCalls).toHaveLength(1);
    await sleeping.close();
  });

  test("waits for an in-flight stop, then starts before executing", async () => {
    const stopGate = deferred();
    const provider = new FakeSandboxProvider().scriptStop(() => stopGate.promise);
    const { sleeping } = await fixture(provider, { debounceMs: 0 });
    await sleeping.exec(["before-stop"], { timeoutMs: 100 });
    await waitFor(() => provider.stopCalls.length === 1);

    const duringStop = sleeping.exec(["during-stop"], { timeoutMs: 100 });
    await pause(5);
    expect(provider.execCalls).toHaveLength(1);
    stopGate.resolve();
    await duringStop;

    expect(provider.operationCalls.map((call) => call.operation).slice(1, 4)).toEqual([
      "stop",
      "start",
      "exec",
    ]);
    await sleeping.close();
  });

  test("serializes a same-tick explicit stop before a new operation", async () => {
    const stopGate = deferred();
    const provider = new FakeSandboxProvider().scriptStop(() => stopGate.promise);
    const { sleeping } = await fixture(provider);

    const stopping = sleeping.stop();
    const operation = sleeping.exec(["after-stop"], { timeoutMs: 100 });
    await waitFor(() => provider.stopCalls.length === 1);
    await pause(5);
    expect(provider.execCalls).toHaveLength(0);

    stopGate.resolve();
    await Promise.all([stopping, operation]);
    expect(provider.operationCalls.map((call) => call.operation)).toEqual([
      "stop",
      "start",
      "exec",
    ]);
    await sleeping.close();
  });
});

describe("wrapSandboxHandleWithSleep lifecycle and failures", () => {
  test("close cancels debounce, rejects later operations, and leaves a stopped sandbox stopped", async () => {
    const first = await fixture(undefined, { debounceMs: 40 });
    await first.sleeping.exec(["true"], { timeoutMs: 100 });
    await first.sleeping.close();
    await pause(55);
    expect(first.provider.stopCalls).toHaveLength(0);
    await expect(first.sleeping.exec(["after-close"], { timeoutMs: 100 })).rejects.toThrow(
      "sleeping sandbox handle sandbox-1 is closed",
    );

    const second = await fixture();
    await second.sleeping.stop();
    expect(second.provider.sandboxState(second.sleeping.sandboxId)).toBe("stopped");
    await second.sleeping.close();
    expect(second.provider.sandboxState(second.sleeping.sandboxId)).toBe("stopped");
  });

  test("rejects a wake after one retry and records both start failures", async () => {
    const wakeError = new Error("wake unavailable");
    const provider = new FakeSandboxProvider().scriptStart(wakeError, wakeError);
    const { sleeping } = await fixture(provider);
    await sleeping.stop();

    let caught: unknown;
    try {
      await sleeping.exec(["never-runs"], { timeoutMs: 100 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(wakeError);
    expect(provider.startCalls).toHaveLength(2);
    expect(provider.execCalls).toHaveLength(0);
    expect(sleeping.stats()).toMatchObject({ startCount: 0, startFailures: 2 });
    await sleeping.close();
  });

  test("recovers from a failed stop without wedging operations", async () => {
    const logs: string[] = [];
    const provider = new FakeSandboxProvider().scriptStop(new Error("stop unavailable"));
    const { sleeping } = await fixture(provider, { log: (message) => logs.push(message) });
    await sleeping.stop();
    expect(provider.sandboxState(sleeping.sandboxId)).toBe("started");
    expect(sleeping.stats()).toMatchObject({ stopCount: 0, stopFailures: 1 });
    expect(logs[0]).toContain("stop unavailable");
    await sleeping.exec(["still-runs"], { timeoutMs: 100 });
    expect(provider.execCalls).toHaveLength(1);
    await sleeping.close();
  });

  test("counts stopped time only when a stopped interval completes", async () => {
    let now = 100;
    const { sleeping } = await fixture(undefined, { now: () => now });
    await sleeping.stop();
    now = 130;
    expect(sleeping.stats()).toMatchObject({ stoppedMs: 0, stopCount: 1, startCount: 0 });

    now = 175;
    await sleeping.exec(["wake"], { timeoutMs: 100 });
    expect(sleeping.stats()).toMatchObject({ stoppedMs: 75, stopCount: 1, startCount: 1 });
    await sleeping.close();
  });

  test("treats evidence download as an operation that wakes the sandbox", async () => {
    const { provider, raw, sleeping } = await fixture();
    await raw.writeFile("/workspace/evidence.json", "evidence");
    await sleeping.stop();
    provider.operationCalls.length = 0;

    const root = mkdtempSync(join(tmpdir(), "sandbox-sleep-evidence-"));
    roots.push(root);
    await sleeping.downloadFile("/workspace/evidence.json", join(root, "evidence.json"));

    expect(provider.operationCalls.map((call) => call.operation)).toEqual(["start", "downloadFile"]);
    expect(sleeping.stats().startCount).toBe(1);
    await sleeping.close();
  });
});
