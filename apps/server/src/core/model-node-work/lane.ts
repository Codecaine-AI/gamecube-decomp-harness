import { startJobConsumer } from "@server/core/job-queue/consumer.js";
import { claimNextJob, completeJob, failJob, getJob, heartbeatJob, verifyClaimToken } from "@server/core/job-queue/kernel.js";
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
  /**
   * Throws unless this lane still owns the claim (not abandoned at shutdown,
   * lease not lost). Call it right before any domain write, so a handler that
   * outlives its claim writes nothing.
   */
  ensureClaim: () => void;
}

/** Settles an execution the lane gave up on at shutdown; its claim was already released. */
export class ModelNodeLaneAbandonedError extends Error {
  constructor(kind: ModelNodeJobKind, jobId: string) {
    super(`${kind} lane abandoned ${jobId} at shutdown`);
    this.name = "ModelNodeLaneAbandonedError";
  }
}

/**
 * Engine failures are results (complete with `detail.status: "error"`). Throw
 * only for infrastructure failures, so the queue backs off and retries; after
 * `maxAttempts` the job turns terminal with the error, unless the lane's
 * `retry` policy decides otherwise for that error.
 */
export type ModelNodeJobHandler = (job: JobRecord, ctx: ModelNodeHandlerContext) => Promise<JobResult>;

export type ModelNodeFatalErrorHandler = (cause: unknown, context: { job: JobRecord | null; operation: string }) => void;

/** How one failed attempt is retried: `terminal: false` keeps retrying past `maxAttempts`. */
export interface ModelNodeRetryDecision {
  backoffMs: number;
  terminal: boolean;
}

/**
 * A kind's own retry for the errors it recognizes; null leaves the lane's
 * default (the queue's backoff, terminal after `maxAttempts`).
 */
export type ModelNodeRetryPolicy = (job: JobRecord, cause: unknown) => ModelNodeRetryDecision | null;

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
  /** Per-error retry for handler failures; absent or null keeps the default for every error. */
  retry?: ModelNodeRetryPolicy;
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
  /**
   * Stop claiming and wait up to `maxWaitMs` for in-flight handlers. Past the
   * grace: abort them, release their claims (reclaimable at once), and return
   * without waiting; a handler that ignores the abort can no longer write.
   */
  stop(options?: { maxWaitMs?: number }): Promise<void>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * `retryDecisions` holds the retry policy's decision for a handler failure,
 * keyed by job, until the consumer records that failure; every other failure
 * (an abandoned claim included) keeps the default.
 */
function kernelOps(maxAttempts: number, retryDecisions: Map<string, ModelNodeRetryDecision>): JobQueueKernelOps {
  return {
    claimNextJob,
    completeJob,
    failJob: (store, token, error, input = {}) => {
      const decision = retryDecisions.get(token.jobId);
      retryDecisions.delete(token.jobId);
      if (decision) {
        return failJob(store, token, error, { ...input, backoffMs: decision.backoffMs, terminal: Boolean(input.terminal) || decision.terminal });
      }
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
  const retryDecisions = new Map<string, ModelNodeRetryDecision>();
  const ops = kernelOps(options.maxAttempts ?? MODEL_NODE_LANE_DEFAULTS.maxAttempts, retryDecisions);
  // Every running execution, so shutdown can end queue ownership without waiting for the handler.
  const executions = new Map<string, { token: ClaimToken; abandon: (cause: Error) => void }>();
  const abandoned = new Set<string>();

  const execute = (job: JobRecord, ctx: { store: StateStore; token: ClaimToken }): Promise<JobResult> => {
    const ensureClaim = (): void => {
      if (abandoned.has(job.jobId)) throw new ModelNodeLaneAbandonedError(kind, job.jobId);
      verifyClaimToken(store, ctx.token, at());
    };
    retryDecisions.delete(job.jobId);
    return new Promise<JobResult>((resolve, reject) => {
      executions.set(job.jobId, { token: ctx.token, abandon: reject });
      Promise.resolve()
        .then(() => handler!(job, { ...ctx, signal: abort.signal, ensureClaim }))
        .then(resolve, reject);
    }).catch((cause: unknown) => {
      // The consumer records this failure next; an abandoned claim was already released with the default.
      let decision: ModelNodeRetryDecision | null = null;
      try {
        decision = abandoned.has(job.jobId) ? null : options.retry?.(job, cause) ?? null;
      } catch (policyCause) {
        log(`[model-node-lane] ${kind} retry policy failed for ${job.jobId}: ${errorMessage(policyCause)}`);
      }
      if (decision) retryDecisions.set(job.jobId, decision);
      throw cause;
    }).finally(() => { executions.delete(job.jobId); });
  };

  /**
   * Release every running claim through the queue's own failure path (lease
   * cleared, retry due now; terminal only past maxAttempts), then settle the
   * execution so the consumer stops heartbeating. A late result from the
   * handler then fails the claim-token check and writes nothing.
   */
  const abandonExecutions = (): number => {
    const running = [...executions.entries()];
    for (const [jobId, execution] of running) {
      abandoned.add(jobId);
      try {
        ops.failJob(store, execution.token, `abandoned: ${kind} lane stopped before the handler finished`, {
          backoffMs: 0,
          at: at(),
          actor: "runner",
        });
      } catch (cause) {
        log(`[model-node-lane] ${kind} could not release abandoned job ${jobId}: ${errorMessage(cause)}`);
      }
      execution.abandon(new ModelNodeLaneAbandonedError(kind, jobId));
    }
    return running.length;
  };

  catchUp();
  const consumer = handler === null ? null : startJobConsumer(store, {
    kind,
    concurrencyLimit: options.concurrency ?? MODEL_NODE_LANE_DEFAULTS.concurrency,
    leaseMs,
    execution: { mode: "inline", handler: execute },
  } satisfies JobKindDescriptor, ops, {
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
        abort.abort(new Error(`${kind} lane stopped`));
        const released = abandonExecutions();
        log(`[model-node-lane] ${kind} shutdown abandoned ${released} in-flight job(s) after ${maxWaitMs}ms`);
        options.onShutdownAbandoned?.(released);
        // The abandoned executions are settled now, so the consumer drains at once.
        let drainTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          stopping.catch(() => {}),
          new Promise<void>((resolveDrain) => { drainTimer = setTimeout(resolveDrain, 1_000); }),
        ]).finally(() => { if (drainTimer) clearTimeout(drainTimer); });
      }
    },
  };
}
