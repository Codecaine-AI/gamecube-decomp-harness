import { describe, expect, mock, spyOn, test } from "bun:test";
import type { StateStore } from "@server/core/orchestrator-state";
import { startJobConsumer, type JobConsumerOptions } from "./consumer.js";
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
type OnJobSettled = NonNullable<JobConsumerOptions["onJobSettled"]>;

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
    await stop.stop();
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
    await stop.stop();
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
    await stop.stop();
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
      execution: { mode: "dispatched", buildTask: async (value) => ({
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
    await stop.stop();
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
    await stop.stop();
  });

  test("swallows a stale-token write and continues claiming", async () => {
    const kernel = kernelFor([job("stale"), job("next")]);
    kernel.completeJob.mockImplementationOnce(() => { throw new Error("stale lease"); });
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    const onJobSettled = mock((..._args: Parameters<OnJobSettled>) => undefined);
    const stop = startJobConsumer(store, inlineDescriptor(async () => ({})), kernel, {
      intervalMs: 1,
      onJobSettled,
    });
    await until(() => kernel.completeJob.mock.calls.length === 2);
    expect(warning).toHaveBeenCalled();
    expect(onJobSettled.mock.calls[0]).toEqual([
      expect.objectContaining({ jobId: "stale" }),
      { status: "failed", error: "stale lease" },
    ]);
    await stop.stop();
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
    const stopping = stop.stop().then(() => { stopped = true; });
    await Bun.sleep(2);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(kernel.claimNextJob).toHaveBeenCalledTimes(1);
  });

  test("shouldClaim false skips claim calls until a later tick", async () => {
    const kernel = kernelFor([job("one")]);
    let allowed = false;
    const handler = mock(async () => ({}));
    const consumer = startJobConsumer(store, inlineDescriptor(handler), kernel, {
      intervalMs: 1,
      shouldClaim: () => allowed,
    });
    await Bun.sleep(5);
    expect(kernel.claimNextJob).not.toHaveBeenCalled();
    allowed = true;
    await until(() => handler.mock.calls.length === 1);
    await consumer.stop();
  });

  test("onJobSettled reports succeeded and failed jobs", async () => {
    const kernel = kernelFor([job("ok"), job("bad")]);
    const onJobSettled = mock((..._args: Parameters<OnJobSettled>) => undefined);
    const descriptor = inlineDescriptor(async (value) => {
      if (value.jobId === "bad") throw new Error("broken");
      return {};
    });
    const consumer = startJobConsumer(store, descriptor, kernel, {
      intervalMs: 1,
      onJobSettled,
    });
    await until(() => onJobSettled.mock.calls.length === 2);
    expect(onJobSettled.mock.calls).toEqual([
      [expect.objectContaining({ jobId: "ok" }), { status: "succeeded" }],
      [expect.objectContaining({ jobId: "bad" }), { status: "failed", error: "broken" }],
    ]);
    await consumer.stop();
  });

  test("cancelAll cancels known dispatched handles and waits for settlement", async () => {
    const kernel = kernelFor([job("one")]);
    const handle = { executorId: "memory", handleId: "one" } as TaskHandle;
    let cancelled = false;
    const executor: WorkerExecutor = {
      submit: mock(async () => handle),
      poll: mock(async () => ({ state: cancelled ? "exited" as const : "running" as const })),
      collect: mock(async () => outcome(137)),
      cancel: mock(async () => { cancelled = true; }),
    };
    const descriptor: JobKindDescriptor = {
      kind: "worker", concurrencyLimit: 1, leaseMs: 900,
      execution: { mode: "dispatched", buildTask: (value) => ({
        jobId: value.jobId, kind: value.kind, executionClass: value.executionClass,
        command: ["sleep", "10"], env: {}, cwd: "/tmp", timeoutMs: null,
      }), executor },
    };
    const consumer = startJobConsumer(store, descriptor, kernel, { intervalMs: 1 });
    await until(() => kernel.markJobRunning.mock.calls.length === 1);
    expect(consumer.inFlight()).toBe(1);
    await consumer.cancelAll();
    expect(executor.cancel).toHaveBeenCalledWith(handle);
    expect(kernel.failJob).toHaveBeenCalled();
    expect(consumer.inFlight()).toBe(0);
    await consumer.stop();
  });
});
