import type { StateStore } from "@server/core/orchestrator-state";
import type {
  ClaimToken,
  JobActor,
  JobKindDescriptor,
  JobQueueKernelOps,
  JobRecord,
  JobResult,
  TaskHandle,
} from "./types.js";

export interface JobConsumerOptions {
  intervalMs?: number;
  actor?: JobActor;
  now?: () => string;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function warnStaleWrite(job: JobRecord, operation: string, cause: unknown): void {
  console.warn(`Job consumer dropped ${job.jobId} after ${operation} failed: ${errorMessage(cause)}`);
}

/** Start one serialized claimer which executes up to the descriptor's concurrency limit. */
export function startJobConsumer(
  store: StateStore,
  descriptor: JobKindDescriptor,
  kernel: JobQueueKernelOps,
  options: JobConsumerOptions = {},
): () => Promise<void> {
  const intervalMs = options.intervalMs ?? 1_000;
  const actor = options.actor ?? "runner";
  const inFlight = new Set<Promise<void>>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeTick: Promise<void> | null = null;

  const at = (): string => (options.now ?? (() => new Date().toISOString()))();

  const fail = (job: JobRecord, token: ClaimToken, cause: unknown): void => {
    try {
      kernel.failJob(store, token, errorMessage(cause), {
        backoffMs: descriptor.backoff?.(job.attempts),
        at: at(),
        actor,
      });
    } catch (writeCause) {
      warnStaleWrite(job, "fail", writeCause);
    }
  };

  const complete = (job: JobRecord, token: ClaimToken, result: JobResult): void => {
    try {
      kernel.completeJob(store, token, result, {
        at: at(),
        actor,
        onComplete: descriptor.onComplete,
      });
    } catch (cause) {
      warnStaleWrite(job, "completion", cause);
    }
  };

  const executeInline = async (job: JobRecord, token: ClaimToken): Promise<void> => {
    if (descriptor.execution.mode !== "inline") return;
    try {
      const result = await descriptor.execution.handler(job, { store, token });
      complete(job, token, result);
    } catch (cause) {
      fail(job, token, cause);
    }
  };

  const executeDispatched = async (job: JobRecord, token: ClaimToken): Promise<void> => {
    if (descriptor.execution.mode !== "dispatched") return;
    const execution = descriptor.execution;
    let handle: TaskHandle;
    try {
      const task = execution.buildTask(job, { store, token });
      handle = await execution.executor.submit(task);
    } catch (cause) {
      fail(job, token, cause);
      return;
    }

    try {
      kernel.markJobRunning(store, token, { taskHandle: handle, at: at(), actor });
    } catch (cause) {
      warnStaleWrite(job, "mark-running", cause);
      return;
    }

    try {
      while (true) {
        const status = await execution.executor.poll(handle);
        if (status.state === "exited") break;
        try {
          kernel.heartbeatJob(store, token, { leaseMs: descriptor.leaseMs, at: at() });
        } catch (cause) {
          warnStaleWrite(job, "heartbeat", cause);
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      }
      const outcome = await execution.executor.collect(handle);
      if (outcome.exitCode === 0 && !outcome.timedOut) {
        complete(job, token, { resultRef: null });
      } else {
        fail(
          job,
          token,
          new Error(
            `Task failed: exitCode=${String(outcome.exitCode)} signal=${String(outcome.signal)} timedOut=${String(outcome.timedOut)}`,
          ),
        );
      }
    } catch (cause) {
      fail(job, token, cause);
    }
  };

  const execute = (job: JobRecord, token: ClaimToken): Promise<void> =>
    descriptor.execution.mode === "inline"
      ? executeInline(job, token)
      : executeDispatched(job, token);

  const tick = (): void => {
    if (stopped || activeTick) return;
    activeTick = Promise.resolve()
      .then(() => {
        while (!stopped && inFlight.size < descriptor.concurrencyLimit) {
          const claimed = kernel.claimNextJob(store, {
            kind: descriptor.kind,
            concurrencyLimit: descriptor.concurrencyLimit,
            leaseMs: descriptor.leaseMs,
            at: at(),
            actor,
          });
          if (!claimed) break;
          const execution = execute(claimed.job, claimed.token);
          inFlight.add(execution);
          void execution.finally(() => inFlight.delete(execution));
        }
      })
      .catch((cause) => console.warn(`Job consumer ${descriptor.kind} tick failed: ${errorMessage(cause)}`))
      .finally(() => {
        activeTick = null;
        if (!stopped) timer = setTimeout(tick, intervalMs);
      });
  };

  tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (activeTick) await activeTick;
    await Promise.allSettled([...inFlight]);
  };
}
