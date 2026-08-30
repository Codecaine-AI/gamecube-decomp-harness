import { isStateStoreClosedError, type StateStore } from "@server/core/orchestrator-state";
import type {
  ClaimToken,
  JobActor,
  JobKindDescriptor,
  JobQueueKernelOps,
  JobRecord,
  JobResult,
  TaskHandle,
  TaskOutcome,
} from "./types.js";

export interface JobConsumerOptions {
  intervalMs?: number;
  actor?: JobActor;
  runId?: string;
  now?: () => string;
  shouldClaim?: () => boolean;
  /**
   * Fires after a job is claimed and before its handler runs. Awaited, so an
   * observer can open a trace container the handler's own events belong to;
   * a rejection is logged and the job proceeds regardless.
   */
  onJobClaimed?: (job: JobRecord) => void | Promise<void>;
  onJobSettled?: (
    job: JobRecord,
    settle: { status: "succeeded" | "failed"; error?: string; outcome?: TaskOutcome },
  ) => void | Promise<void>;
  onFatalError?: (cause: unknown, context: { job: JobRecord | null; operation: string }) => void;
  settlementWarningMs?: number;
  settlementDrainTimeoutMs?: number;
}

export interface JobConsumerHandle {
  stop(): Promise<void>;
  inFlight(): number;
  cancelAll(): Promise<void>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function warnStaleWrite(job: JobRecord, operation: string, cause: unknown): void {
  console.warn(`Job consumer dropped ${job.jobId} after ${operation} failed: ${errorMessage(cause)}`);
}

const TASK_FAILURE_OUTPUT_LIMIT = 1_500;

function taskFailureOutput(outcome: TaskOutcome): string {
  const withoutMoltenVkNoise = (output: string): string => output
    .split(/\r?\n/)
    .filter((line) => !/mvk-info|^\s+VK_/.test(line))
    .join("\n")
    .trim();
  const stderr = withoutMoltenVkNoise(outcome.stderr);
  const output = stderr || withoutMoltenVkNoise(outcome.stdout);
  return output.slice(-TASK_FAILURE_OUTPUT_LIMIT);
}

/** Start one serialized claimer which executes up to the descriptor's concurrency limit. */
export function startJobConsumer(
  store: StateStore,
  descriptor: JobKindDescriptor,
  kernel: JobQueueKernelOps,
  options: JobConsumerOptions = {},
): JobConsumerHandle {
  const intervalMs = options.intervalMs ?? 1_000;
  const settlementWarningMs = options.settlementWarningMs ?? 60_000;
  const settlementDrainTimeoutMs = options.settlementDrainTimeoutMs ?? 120_000;
  const actor = options.actor ?? "runner";
  const activeJobs = new Set<string>();
  const executionWork = new Set<Promise<void>>();
  const settlementWork = new Set<Promise<void>>();
  const dispatchedHandles = new Map<string, { handle: TaskHandle; cancel: (handle: TaskHandle) => Promise<void> }>();
  let stopped = false;
  let fatalNotified = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeTick: Promise<void> | null = null;

  const notifyFatal = (cause: unknown, operation: string, job: JobRecord | null = null): void => {
    if (!isStateStoreClosedError(cause)) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    if (fatalNotified) return;
    fatalNotified = true;
    options.onFatalError?.(cause, { job, operation });
  };

  const at = (): string => (options.now ?? (() => new Date().toISOString()))();

  const settled = (
    job: JobRecord,
    settle: { status: "succeeded" | "failed"; error?: string; outcome?: TaskOutcome },
  ): void => {
    if (!options.onJobSettled) return;
    const warning = setTimeout(() => {
      console.warn(`[job-consumer] settlement for ${job.jobId} still running after 60s (step: onJobSettled)`);
    }, settlementWarningMs);
    let work: Promise<void>;
    work = Promise.resolve()
      .then(() => options.onJobSettled?.(job, settle))
      .catch((cause) => {
        notifyFatal(cause, "settlement-hook", job);
        console.warn(`Job consumer ${descriptor.kind} settlement hook failed: ${errorMessage(cause)}`);
      })
      .finally(() => {
        clearTimeout(warning);
        settlementWork.delete(work);
      });
    settlementWork.add(work);
  };

  const drainSettlementWork = async (): Promise<void> => {
    if (settlementWork.size === 0) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...settlementWork]),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, settlementDrainTimeoutMs); }),
    ]);
    if (timeout) clearTimeout(timeout);
  };

  const fail = (job: JobRecord, token: ClaimToken, cause: unknown): void => {
    notifyFatal(cause, "job-handler", job);
    const error = errorMessage(cause);
    try {
      kernel.failJob(store, token, error, {
        backoffMs: descriptor.backoff?.(job.attempts),
        terminal: descriptor.terminalOnFailure?.(job, cause),
        at: at(),
        actor,
      });
      settled(job, { status: "failed", error });
    } catch (writeCause) {
      notifyFatal(writeCause, "fail", job);
      warnStaleWrite(job, "fail", writeCause);
    }
  };

  const complete = (job: JobRecord, token: ClaimToken, result: JobResult, outcome?: TaskOutcome): void => {
    try {
      kernel.completeJob(store, token, result, {
        at: at(),
        actor,
        onComplete: descriptor.onComplete,
      });
      settled(job, { status: "succeeded", ...(outcome ? { outcome } : {}) });
    } catch (cause) {
      notifyFatal(cause, "completion", job);
      warnStaleWrite(job, "completion", cause);
      if (!isStateStoreClosedError(cause)) {
        settled(job, { status: "failed", error: errorMessage(cause), ...(outcome ? { outcome } : {}) });
      }
    }
  };

  const executeInline = async (job: JobRecord, token: ClaimToken): Promise<void> => {
    if (descriptor.execution.mode !== "inline") return;
    const heartbeat = setInterval(() => {
      try {
        kernel.heartbeatJob(store, token, { leaseMs: descriptor.leaseMs, at: at() });
      } catch (cause) {
        notifyFatal(cause, "inline-heartbeat", job);
        // A stale token means another consumer stole the expired lease; let that path proceed.
      }
    }, intervalMs);
    try {
      const result = await descriptor.execution.handler(job, { store, token });
      complete(job, token, result);
    } catch (cause) {
      fail(job, token, cause);
    } finally {
      clearInterval(heartbeat);
    }
  };

  const executeDispatched = async (job: JobRecord, token: ClaimToken): Promise<void> => {
    if (descriptor.execution.mode !== "dispatched") return;
    const execution = descriptor.execution;
    let handle: TaskHandle;
    try {
      const task = await execution.buildTask(job, { store, token });
      handle = await execution.executor.submit(task);
      dispatchedHandles.set(job.jobId, { handle, cancel: execution.executor.cancel.bind(execution.executor) });
    } catch (cause) {
      fail(job, token, cause);
      return;
    }

    try {
      kernel.markJobRunning(store, token, { taskHandle: handle, at: at(), actor });
    } catch (cause) {
      notifyFatal(cause, "mark-running", job);
      warnStaleWrite(job, "mark-running", cause);
      dispatchedHandles.delete(job.jobId);
      return;
    }

    try {
      while (true) {
        const status = await execution.executor.poll(handle);
        if (status.state === "exited") break;
        descriptor.onPoll?.(job, { store });
        try {
          kernel.heartbeatJob(store, token, { leaseMs: descriptor.leaseMs, at: at() });
        } catch (cause) {
          notifyFatal(cause, "heartbeat", job);
          warnStaleWrite(job, "heartbeat", cause);
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      }
      const outcome = await execution.executor.collect(handle);
      if (outcome.exitCode === 0 && !outcome.timedOut) {
        complete(job, token, { resultRef: null }, outcome);
      } else {
        if (descriptor.onTaskFailure) {
          try {
            await descriptor.onTaskFailure(job, outcome);
          } catch (cause) {
            notifyFatal(cause, "task-failure-hook", job);
            console.warn(`Job consumer ${descriptor.kind} task failure hook failed: ${errorMessage(cause)}`);
          }
        }
        const output = taskFailureOutput(outcome);
        fail(
          job,
          token,
          new Error(
            `Task failed: exitCode=${String(outcome.exitCode)} signal=${String(outcome.signal)} timedOut=${String(outcome.timedOut)}`
              + (output ? `\n${output}` : ""),
          ),
        );
      }
    } catch (cause) {
      fail(job, token, cause);
    } finally {
      dispatchedHandles.delete(job.jobId);
    }
  };

  // Observing a claim must never cost the job. A hook that throws or hangs
  // rejects into the same warn-and-continue path a settlement hook does.
  const announceClaim = async (job: JobRecord): Promise<void> => {
    if (!options.onJobClaimed) return;
    try {
      await options.onJobClaimed(job);
    } catch (cause) {
      notifyFatal(cause, "claim-hook", job);
      console.warn(`Job consumer ${descriptor.kind} claim hook failed: ${errorMessage(cause)}`);
    }
  };

  const execute = async (job: JobRecord, token: ClaimToken): Promise<void> => {
    await announceClaim(job);
    return descriptor.execution.mode === "inline"
      ? executeInline(job, token)
      : executeDispatched(job, token);
  };

  const tick = (): void => {
    if (stopped || activeTick) return;
    activeTick = Promise.resolve()
      .then(() => {
        if (options.shouldClaim && !options.shouldClaim()) return;
        while (!stopped && activeJobs.size < descriptor.concurrencyLimit) {
          const claimed = kernel.claimNextJob(store, {
            kind: descriptor.kind,
            concurrencyLimit: descriptor.concurrencyLimit,
            leaseMs: descriptor.leaseMs,
            ...(options.runId !== undefined ? { runId: options.runId } : {}),
            at: at(),
            actor,
          });
          if (!claimed) break;
          activeJobs.add(claimed.job.jobId);
          const execution = execute(claimed.job, claimed.token);
          executionWork.add(execution);
          void execution.finally(() => {
            activeJobs.delete(claimed.job.jobId);
            executionWork.delete(execution);
          });
        }
      })
      .catch((cause) => {
        notifyFatal(cause, "claim-tick");
        console.warn(`Job consumer ${descriptor.kind} tick failed: ${errorMessage(cause)}`);
      })
      .finally(() => {
        activeTick = null;
        if (!stopped) timer = setTimeout(tick, intervalMs);
      });
  };

  tick();
  const stop = async (): Promise<void> => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (activeTick) await activeTick;
    await Promise.allSettled([...executionWork]);
    await drainSettlementWork();
  };
  return {
    stop,
    inFlight: () => activeJobs.size,
    cancelAll: async () => {
      await Promise.allSettled(
        [...dispatchedHandles.values()].map(({ handle, cancel }) => cancel(handle)),
      );
      await Promise.allSettled([...executionWork]);
      await drainSettlementWork();
    },
  };
}
