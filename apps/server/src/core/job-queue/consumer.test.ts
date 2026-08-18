import { describe, expect, mock, spyOn, test } from "bun:test";
import type { StateStore } from "@server/core/orchestrator-state";
import { startJobConsumer } from "./consumer.js";
import type {
  ClaimToken,
  JobKindDescriptor,
  JobQueueKernelOps,
  JobRecord,
  TaskHandle,
  TaskOutcome,
  WorkerExecutor,
} from "./types.js";

const store = {} as StateStore;

function job(id: string, attempts = 1): JobRecord {
  return {
    jobId: id, kind: "worker", dedupeKey: id, gameId: "melee", runId: null,
    status: "claimed", revision: 1, priority: 0, concurrencyKey: null,
    executionClass: "local", leaseId: `lease-${id}`, leaseExpiresAt: null,
    attempts, nextAttemptAt: null, payload: {}, resultRef: null, error: null,
    traceId: null, causedByEventId: null, createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", completedAt: null,
  };
}

function token(value: JobRecord): ClaimToken {
  return { jobId: value.jobId, kind: value.kind, leaseId: `lease-${value.jobId}` };
}

function kernelFor(queue: JobRecord[]) {
  return {
    claimNextJob: mock(() => {
      const next = queue.shift();
      return next ? { job: next, token: token(next) } : null;
    }),
    markJobRunning: mock((...args: Parameters<JobQueueKernelOps["markJobRunning"]>) => job(args[1].jobId)),
    heartbeatJob: mock((...args: Parameters<JobQueueKernelOps["heartbeatJob"]>) => job(args[1].jobId)),
    completeJob: mock((...args: Parameters<JobQueueKernelOps["completeJob"]>) => ({ ...job(args[1].jobId), status: "succeeded" as const })),
    failJob: mock((...args: Parameters<JobQueueKernelOps["failJob"]>) => ({ ...job(args[1].jobId), status: "failed" as const })),
  } satisfies JobQueueKernelOps;
}

async function until(check: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("condition timed out");
    await Bun.sleep(1);
  }
}

function inlineDescriptor(handler: JobKindDescriptor["execution"] extends infer _T ? (job: JobRecord) => Promise<{}> : never, limit = 1): JobKindDescriptor {
  return {
    kind: "worker", concurrencyLimit: limit, leaseMs: 1_000,
    execution: { mode: "inline", handler },
  };
}

function outcome(exitCode = 0): TaskOutcome {
  return {
    exitCode, signal: null, stdout: "", stderr: "", timedOut: false,
    startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z",
  };
}

describe("startJobConsumer", () => {
  test("respects the concurrency limit and serializes claim calls", async () => {
    const queue = [job("one"), job("two"), job("three")];
    const kernel = kernelFor(queue);
    const releases: Array<() => void> = [];
    let running = 0;
    let peak = 0;
    const handler = mock(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
      return {};
    });
    const stop = startJobConsumer(store, inlineDescriptor(handler, 2), kernel, { intervalMs: 1 });
    await until(() => handler.mock.calls.length === 2);
    expect(peak).toBe(2);
    expect(kernel.claimNextJob).toHaveBeenCalledTimes(2);
    releases.splice(0).forEach((release) => release());
    await until(() => handler.mock.calls.length === 3);
    releases.splice(0).forEach((release) => release());
    await stop();
  });

  test("completes inline work and threads onComplete through", async () => {
    const kernel = kernelFor([job("one")]);
    const onComplete = mock(() => undefined);
    const descriptor = { ...inlineDescriptor(async () => ({ resultRef: "result" })), onComplete };
    const stop = startJobConsumer(store, descriptor, kernel, { intervalMs: 1 });
    await until(() => kernel.completeJob.mock.calls.length === 1);
    const call = kernel.completeJob.mock.calls[0]!;
    expect(call[2]).toEqual({ resultRef: "result" });
    expect(call[3]?.onComplete).toBe(onComplete);
    await stop();
  });

  test("fails thrown inline work with descriptor backoff", async () => {
    const queued = job("one", 4);
    const kernel = kernelFor([queued]);
    const descriptor = { ...inlineDescriptor(async () => { throw new Error("broken"); }), backoff: mock(() => 42) };
    const stop = startJobConsumer(store, descriptor, kernel, { intervalMs: 1 });
    await until(() => kernel.failJob.mock.calls.length === 1);
    expect(kernel.failJob.mock.calls[0]?.[2]).toBe("broken");
    expect(kernel.failJob.mock.calls[0]?.[3]?.backoffMs).toBe(42);
    expect(descriptor.backoff).toHaveBeenCalledWith(4);
    await stop();
  });

  test("drives a dispatched task through heartbeat, collect, and completion", async () => {
    const kernel = kernelFor([job("one")]);
    const handle = { executorId: "memory", handleId: "one" } as TaskHandle;
    let polls = 0;
    const executor: WorkerExecutor = {
      submit: mock(async () => handle),
      poll: mock(async () => ({ state: ++polls === 1 ? "running" as const : "exited" as const })),
      collect: mock(async () => outcome()),
      cancel: mock(async () => undefined),
    };
    const descriptor: JobKindDescriptor = {
      kind: "worker", concurrencyLimit: 1, leaseMs: 900,
      execution: { mode: "dispatched", buildTask: (value) => ({
        jobId: value.jobId, kind: value.kind, executionClass: value.executionClass,
        command: ["true"], env: {}, cwd: "/tmp", timeoutMs: null,
      }), executor },
    };
    const stop = startJobConsumer(store, descriptor, kernel, { intervalMs: 1 });
    await until(() => kernel.completeJob.mock.calls.length === 1);
    expect(executor.submit).toHaveBeenCalledTimes(1);
    expect(kernel.markJobRunning.mock.calls[0]?.[2]?.taskHandle).toBe(handle);
    expect(kernel.heartbeatJob).toHaveBeenCalled();
    expect(executor.collect).toHaveBeenCalledWith(handle);
    expect(kernel.completeJob.mock.calls[0]?.[2]).toEqual({ resultRef: null });
    await stop();
  });

  test("fails a dispatched task with a nonzero exit", async () => {
    const kernel = kernelFor([job("one")]);
    const executor: WorkerExecutor = {
      submit: mock(async () => ({ executorId: "memory", handleId: "one" })),
      poll: mock(async () => ({ state: "exited" as const })),
      collect: mock(async () => outcome(7)),
      cancel: mock(async () => undefined),
    };
    const descriptor: JobKindDescriptor = {
      kind: "worker", concurrencyLimit: 1, leaseMs: 900,
      execution: { mode: "dispatched", buildTask: (value) => ({ jobId: value.jobId, kind: value.kind,
        executionClass: value.executionClass, command: ["false"], env: {}, cwd: "/tmp", timeoutMs: null }), executor },
    };
    const stop = startJobConsumer(store, descriptor, kernel, { intervalMs: 1 });
    await until(() => kernel.failJob.mock.calls.length === 1);
    expect(kernel.failJob.mock.calls[0]?.[2]).toContain("exitCode=7");
    await stop();
  });

  test("swallows a stale-token write and continues claiming", async () => {
    const kernel = kernelFor([job("stale"), job("next")]);
    kernel.completeJob.mockImplementationOnce(() => { throw new Error("stale lease"); });
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    const stop = startJobConsumer(store, inlineDescriptor(async () => ({})), kernel, { intervalMs: 1 });
    await until(() => kernel.completeJob.mock.calls.length === 2);
    expect(warning).toHaveBeenCalled();
    await stop();
    warning.mockRestore();
  });

  test("stop drains in-flight work and prevents new claims", async () => {
    const kernel = kernelFor([job("one"), job("two")]);
    let release!: () => void;
    const handler = mock(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return {};
    });
    const stop = startJobConsumer(store, inlineDescriptor(handler), kernel, { intervalMs: 1 });
    await until(() => handler.mock.calls.length === 1);
    let stopped = false;
    const stopping = stop().then(() => { stopped = true; });
    await Bun.sleep(2);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(kernel.claimNextJob).toHaveBeenCalledTimes(1);
  });
});
