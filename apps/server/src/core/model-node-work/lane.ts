import { startJobConsumer } from "@server/core/job-queue/consumer.js";
import { claimNextJob, completeJob, failJob, getJob, heartbeatJob } from "@server/core/job-queue/kernel.js";
import type {
  ClaimToken,
  JobKindDescriptor,
  JobQueueKernelOps,
  JobRecord,
  JobResult,
} from "@server/core/job-queue/types.js";
import { isStateStoreClosedError, now, type StateStore } from "@server/core/orchestrator-state";
import { ensureModelNodeLaneState, type ModelNodeJobKind } from "./catch-up.js";

export const MODEL_NODE_LANE_DEFAULTS = Object.freeze({
  concurrency: 4,
  leaseMs: 120_000,
  maxAttempts: 5,
  catchUpEveryMs: 30_000,
  intervalMs: 1_000,
  stopMaxWaitMs: 15_000,
});

export interface ModelNodeHandlerContext {
  store: StateStore;
  token: ClaimToken;
  /** Aborted when the lane's shutdown grace runs out; pass it to every node call. */
  signal: AbortSignal;
}

/**
 * Engine failures are results (complete with `detail.status: "error"`). Throw
 * only for infrastructure failures, so the queue backs off and retries; after
 * `maxAttempts` the job turns terminal with the error.
 */
export type ModelNodeJobHandler = (job: JobRecord, ctx: ModelNodeHandlerContext) => Promise<JobResult>;

export type ModelNodeFatalErrorHandler = (cause: unknown, context: { job: JobRecord | null; operation: string }) => void;

export interface ModelNodeLaneOptions {
  store: StateStore;
  kind: ModelNodeJobKind;
  /**
   * Null when the kind has no real handler yet: the lane still enqueues
   * durable jobs but starts no consumer, so they stay queued for a later
   * process that has the handler.
   */
  handler: ModelNodeJobHandler | null;
  /** SQL-only enqueue of items without a job; runs at start and every `catchUpEveryMs`. Returns jobs enqueued. */
  catchUp: () => number;
  concurrency?: number;
  leaseMs?: number;
  maxAttempts?: number;
  catchUpEveryMs?: number;
  intervalMs?: number;
  shouldClaim?: () => boolean;
  now?: () => string;
  onFatalError?: ModelNodeFatalErrorHandler;
  onShutdownAbandoned?: (count: number) => void;
  log?: (message: string) => void;
}

export interface ModelNodeLane {
  readonly kind: ModelNodeJobKind;
  readonly enabledSince: string;
  /** False when the lane only enqueues (no handler). */
  readonly claiming: boolean;
  /** Run one catch-up now; never throws. Returns jobs enqueued (0 on failure). */
  catchUp(): number;
  inFlight(): number;
  /** Stop claiming, wait up to `maxWaitMs` for in-flight handlers, then abort and abandon them. */
  stop(options?: { maxWaitMs?: number }): Promise<void>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function kernelOps(maxAttempts: number): JobQueueKernelOps {
  return {
    claimNextJob,
    completeJob,
    failJob: (store, token, error, input = {}) => {
      const attempts = getJob(store, token.jobId)?.attempts ?? 0;
      return failJob(store, token, error, { ...input, terminal: Boolean(input.terminal) || attempts >= maxAttempts });
    },
    markJobRunning: () => { throw new Error("model-node jobs execute inline"); },
    heartbeatJob,
  };
}

/**
 * One durable out-of-band lane (§6.3): an inline job kind on the existing
 * queue, cloned from the worker summarizer. Claims carry no run filter, so
 * leftover jobs of any run are processed and expired leases are reclaimed.
 * A lane never feeds the provider circuit and never counts toward worker
 * drain, epoch settlement, or idle exit.
 */
export function startModelNodeLane(options: ModelNodeLaneOptions): ModelNodeLane {
  const { store, kind } = options;
  const at = options.now ?? now;
  const log = options.log ?? ((message: string) => console.warn(message));
  const leaseMs = options.leaseMs ?? MODEL_NODE_LANE_DEFAULTS.leaseMs;
  const abort = new AbortController();
  const enabledSince = ensureModelNodeLaneState(store, kind, at());
  let catchUpTimer: ReturnType<typeof setInterval> | null = null;

  const catchUp = (): number => {
    try {
      return options.catchUp();
    } catch (cause) {
      if (isStateStoreClosedError(cause)) {
        if (catchUpTimer) clearInterval(catchUpTimer);
        catchUpTimer = null;
        options.onFatalError?.(cause, { job: null, operation: `${kind}-catch-up` });
      }
      log(`[model-node-lane] ${kind} catch-up failed: ${errorMessage(cause)}`);
      return 0;
    }
  };

  const handler = options.handler;
  catchUp();
  const consumer = handler === null ? null : startJobConsumer(store, {
    kind,
    concurrencyLimit: options.concurrency ?? MODEL_NODE_LANE_DEFAULTS.concurrency,
    leaseMs,
    execution: {
      mode: "inline",
      handler: (job, ctx) => handler(job, { ...ctx, signal: abort.signal }),
    },
  } satisfies JobKindDescriptor, kernelOps(options.maxAttempts ?? MODEL_NODE_LANE_DEFAULTS.maxAttempts), {
    intervalMs: options.intervalMs ?? MODEL_NODE_LANE_DEFAULTS.intervalMs,
    actor: "runner",
    now: at,
    shouldClaim: options.shouldClaim,
    onFatalError: options.onFatalError,
  });
  catchUpTimer = setInterval(catchUp, options.catchUpEveryMs ?? MODEL_NODE_LANE_DEFAULTS.catchUpEveryMs);
  catchUpTimer.unref?.();

  return {
    kind,
    enabledSince,
    claiming: consumer !== null,
    catchUp,
    inFlight: () => consumer?.inFlight() ?? 0,
    stop: async (stopOptions = {}) => {
      if (catchUpTimer) clearInterval(catchUpTimer);
      catchUpTimer = null;
      if (!consumer) return;
      const stopping = consumer.stop();
      const maxWaitMs = stopOptions.maxWaitMs ?? MODEL_NODE_LANE_DEFAULTS.stopMaxWaitMs;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = Symbol("model-node-lane-stop-deadline");
      const outcome = await Promise.race([
        stopping,
        new Promise<typeof deadline>((resolveDeadline) => { timer = setTimeout(() => resolveDeadline(deadline), maxWaitMs); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (outcome === deadline) {
        const abandoned = consumer.inFlight();
        abort.abort(new Error(`${kind} lane stopped`));
        void stopping.catch(() => {});
        log(`[model-node-lane] ${kind} shutdown abandoned ${abandoned} in-flight job(s) after ${maxWaitMs}ms`);
        options.onShutdownAbandoned?.(abandoned);
      }
    },
  };
}
