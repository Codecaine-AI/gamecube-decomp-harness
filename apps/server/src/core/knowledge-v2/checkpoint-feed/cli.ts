// `checkpoint-knowledge backfill --epochs <ids>` (plan §5 M11-B task 3, §6.8
// owner D1): the deliberate way to feed history. Turning the feed on never
// reaches epochs settled before the kind's `enabled_since`; this command
// names epochs explicitly, enqueues their `checkpoint_knowledge` jobs (same
// selection, ordering and per-epoch cap as the lane's catch-up), then runs
// them in this process, one at a time, through the queue's inline consumer
// (claim, heartbeat, lease-loss handling and cleanup as in the lane), unless
// `--enqueue-only` leaves them for the next lane start.
import { checkpointKnowledgeCapArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { openState, type StateStore } from "@server/core/harness-runtime/run-state";
import { startJobConsumer } from "@server/core/job-queue/consumer.js";
import {
  claimJobByDedupeKey,
  completeJob,
  failJob,
  getJob,
  heartbeatJob,
  verifyClaimToken,
} from "@server/core/job-queue/kernel.js";
import type { JobKindDescriptor, JobQueueKernelOps } from "@server/core/job-queue/types.js";
import { catchUpKnowledge } from "@server/core/model-node-work/catch-up.js";
import {
  MODEL_NODE_LANE_DEFAULTS,
  type ModelNodeJobHandler,
  type ModelNodeRetryDecision,
} from "@server/core/model-node-work/lane.js";

import { checkpointKnowledgeRetry, createCheckpointKnowledgeHandler } from "./handler.js";

export const CHECKPOINT_KNOWLEDGE_USAGE =
  "Usage: checkpoint-knowledge backfill --epochs <id>[,<id>...] [--cap <n>] [--enqueue-only]";

export interface CheckpointKnowledgeBackfillOptions {
  epochIds: string[];
  cap: number;
  enqueueOnly: boolean;
}

export type EpochBackfillStatus = "settled" | "not-settled" | "unknown";

export interface CheckpointKnowledgeBackfillReport {
  schema: "checkpoint_knowledge_backfill_v1";
  cap: number;
  enqueue_only: boolean;
  epochs: Array<{ id: string; status: EpochBackfillStatus; jobs: number }>;
  enqueued: number;
  jobs: Array<{
    checkpoint_id: string;
    epoch_id: string;
    job_status: string;
    /** The handler's outcome (`detail.status`) or the error a failed attempt left. */
    outcome: string | null;
  }>;
}

/** How the backfill runs its jobs; the lease is renewed by heartbeat every `intervalMs` while a handler runs. */
export interface BackfillRunOptions {
  leaseMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
}

export const BACKFILL_RUN_DEFAULTS = Object.freeze({
  leaseMs: MODEL_NODE_LANE_DEFAULTS.leaseMs,
  intervalMs: 250,
  maxAttempts: MODEL_NODE_LANE_DEFAULTS.maxAttempts,
});

export interface CheckpointKnowledgeCliDeps {
  openState?: (stateDir: string) => StateStore;
  /** Default: the production `checkpoint_knowledge` handler for `globals`. */
  handler?: ModelNodeJobHandler;
  print?: (report: CheckpointKnowledgeBackfillReport) => void;
  signal?: AbortSignal;
  run?: BackfillRunOptions;
}

/** The subcommand: the first non-flag argument after `checkpoint-knowledge` (when `parse` did not record it as `--subcommand`). */
export function checkpointKnowledgeSubcommand(argv: readonly string[]): string | null {
  const at = argv.indexOf("checkpoint-knowledge");
  const next = at >= 0 ? argv[at + 1] : undefined;
  return next && !next.startsWith("--") ? next : null;
}

export function parseBackfillOptions(args: Map<string, string | true>): CheckpointKnowledgeBackfillOptions {
  const raw = args.get("--epochs");
  const epochIds = typeof raw === "string" ? [...new Set(raw.split(/[\s,]+/).filter(Boolean))] : [];
  if (epochIds.length === 0) throw new Error(`--epochs is required. ${CHECKPOINT_KNOWLEDGE_USAGE}`);
  // `--cap` here, or the run flag's own spelling; both go through the run flag's validation.
  const cap = args.get("--cap");
  const capArgs = cap === undefined ? args : new Map([["--checkpoint-knowledge-cap", cap]]);
  return { epochIds, cap: checkpointKnowledgeCapArg(capArgs), enqueueOnly: args.get("--enqueue-only") === true };
}

function epochStatus(store: StateStore, epochId: string): EpochBackfillStatus {
  const row = store.db.query<{ status: string; closed_at: string | null; saved: number }, [string]>(`
    SELECT e.status, e.closed_at,
      EXISTS (SELECT 1 FROM save_points sp WHERE sp.id = 'epoch-save-point-' || e.id) AS saved
    FROM epochs e WHERE e.id = ?`).get(epochId);
  if (!row) return "unknown";
  return row.status === "completed" && row.closed_at && Number(row.saved) === 1 ? "settled" : "not-settled";
}

interface BackfillJobRow {
  dedupe_key: string;
  epoch_id: string;
  status: string;
}

function backfillJobs(store: StateStore, epochIds: readonly string[]): BackfillJobRow[] {
  return store.db.query<BackfillJobRow, [string]>(`
    SELECT dedupe_key, json_extract(payload_json, '$.epochId') AS epoch_id, status
    FROM jobs
    WHERE kind = 'checkpoint_knowledge'
      AND json_extract(payload_json, '$.epochId') IN (SELECT value FROM json_each(?))
    ORDER BY created_at, dedupe_key`).all(JSON.stringify(epochIds));
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Runs the jobs named by `dedupeKeys`, each claimable one once, through the
 * queue's inline consumer with concurrency 1: the claim is heartbeat while the
 * handler runs, a claim lost to another consumer is dropped with a warning
 * (its late writes fail the claim-token check), and the run continues with
 * the next job. Failures retry like the lane's: the submission schedule for
 * a submission not ingested yet, else terminal after `maxAttempts`. Returns
 * each run job's outcome.
 */
async function runBackfillJobs(
  store: StateStore,
  dedupeKeys: readonly string[],
  handler: ModelNodeJobHandler,
  signal: AbortSignal,
  run: BackfillRunOptions,
): Promise<Map<string, string | null>> {
  const leaseMs = run.leaseMs ?? BACKFILL_RUN_DEFAULTS.leaseMs;
  const intervalMs = run.intervalMs ?? BACKFILL_RUN_DEFAULTS.intervalMs;
  const maxAttempts = run.maxAttempts ?? BACKFILL_RUN_DEFAULTS.maxAttempts;
  const pending = [...dedupeKeys];
  const outcomes = new Map<string, string | null>();
  const retryDecisions = new Map<string, ModelNodeRetryDecision>();
  const ops: JobQueueKernelOps = {
    claimNextJob: (claimStore, input) => {
      while (pending.length > 0 && !signal.aborted) {
        const claimed = claimJobByDedupeKey(claimStore, {
          kind: "checkpoint_knowledge",
          dedupeKey: pending.shift()!,
          leaseMs: input.leaseMs,
          ...(input.at !== undefined ? { at: input.at } : {}),
          ...(input.actor !== undefined ? { actor: input.actor } : {}),
        });
        if (claimed) return claimed;
      }
      return null;
    },
    completeJob,
    failJob: (failStore, token, error, input = {}) => {
      const decision = retryDecisions.get(token.jobId);
      retryDecisions.delete(token.jobId);
      if (decision) {
        return failJob(failStore, token, error, { ...input, backoffMs: decision.backoffMs, terminal: Boolean(input.terminal) || decision.terminal });
      }
      const attempts = getJob(failStore, token.jobId)?.attempts ?? 0;
      return failJob(failStore, token, error, { ...input, terminal: Boolean(input.terminal) || attempts >= maxAttempts });
    },
    markJobRunning: () => { throw new Error("checkpoint_knowledge jobs execute inline"); },
    heartbeatJob,
  };
  const descriptor: JobKindDescriptor = {
    kind: "checkpoint_knowledge",
    concurrencyLimit: 1,
    leaseMs,
    execution: {
      mode: "inline",
      handler: async (job, ctx) => {
        retryDecisions.delete(job.jobId);
        try {
          const result = await handler(job, { ...ctx, signal, ensureClaim: () => { verifyClaimToken(store, ctx.token); } });
          const status = result.detail?.status;
          outcomes.set(job.dedupeKey, typeof status === "string" ? status : null);
          return result;
        } catch (cause) {
          outcomes.set(job.dedupeKey, errorMessage(cause));
          const decision = checkpointKnowledgeRetry(job, cause);
          if (decision) retryDecisions.set(job.jobId, decision);
          throw cause;
        }
      },
    },
  };
  const consumer = startJobConsumer(store, descriptor, ops, {
    intervalMs,
    actor: "operator",
    shouldClaim: () => !signal.aborted,
    // A completion that lost its claim settles as failed: report why.
    onJobSettled: (job, settle) => {
      if (settle.status === "failed" && settle.error) outcomes.set(job.dedupeKey, settle.error);
    },
  });
  try {
    while ((pending.length > 0 && !signal.aborted) || consumer.inFlight() > 0) {
      await new Promise<void>((resolveTick) => setTimeout(resolveTick, intervalMs));
    }
  } finally {
    await consumer.stop();
  }
  return outcomes;
}

/**
 * Enqueues the named epochs' jobs (history included) and, unless
 * `enqueueOnly`, runs every claimable one of them. A job whose attempt throws
 * is left to the queue's backoff (terminal after the lane's attempt limit),
 * exactly as in the lane.
 */
export async function backfillCheckpointKnowledge(
  store: StateStore,
  options: CheckpointKnowledgeBackfillOptions,
  handler: ModelNodeJobHandler,
  signal: AbortSignal = new AbortController().signal,
  run: BackfillRunOptions = {},
): Promise<CheckpointKnowledgeBackfillReport> {
  const statuses = options.epochIds.map((id) => ({ id, status: epochStatus(store, id) }));
  const enqueued = catchUpKnowledge(store, { epochIds: options.epochIds, includeHistory: true, cap: options.cap });
  const runnable = backfillJobs(store, options.epochIds)
    .filter((row) => row.status === "queued" || row.status === "waiting")
    .map((row) => row.dedupe_key);
  const outcomes = options.enqueueOnly || runnable.length === 0
    ? new Map<string, string | null>()
    : await runBackfillJobs(store, runnable, handler, signal, run);
  const jobs = backfillJobs(store, options.epochIds);
  return {
    schema: "checkpoint_knowledge_backfill_v1",
    cap: options.cap,
    enqueue_only: options.enqueueOnly,
    epochs: statuses.map((epoch) => ({ ...epoch, jobs: jobs.filter((job) => job.epoch_id === epoch.id).length })),
    enqueued,
    jobs: jobs.map((job) => ({
      checkpoint_id: job.dedupe_key,
      epoch_id: job.epoch_id,
      job_status: job.status,
      outcome: outcomes.get(job.dedupe_key) ?? null,
    })),
  };
}

/** The `checkpoint-knowledge` server job. */
export async function checkpointKnowledge(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  argv: readonly string[] = process.argv.slice(2),
  deps: CheckpointKnowledgeCliDeps = {},
): Promise<CheckpointKnowledgeBackfillReport> {
  const parsed = args.get("--subcommand");
  const subcommand = typeof parsed === "string" ? parsed : checkpointKnowledgeSubcommand(argv);
  if (subcommand !== "backfill") throw new Error(subcommand ? `Unknown checkpoint-knowledge command: ${subcommand}. ${CHECKPOINT_KNOWLEDGE_USAGE}` : CHECKPOINT_KNOWLEDGE_USAGE);
  const options = parseBackfillOptions(args);
  if (globals.dryRunAgents && !options.enqueueOnly) {
    throw new Error("checkpoint-knowledge backfill makes model calls; drop --dry-run-agents or pass --enqueue-only");
  }
  const store = (deps.openState ?? openState)(globals.stateDir);
  try {
    const handler = deps.handler ?? createCheckpointKnowledgeHandler(globals);
    const report = await backfillCheckpointKnowledge(store, options, handler, deps.signal, deps.run);
    (deps.print ?? ((value) => console.log(JSON.stringify(value, null, 2))))(report);
    return report;
  } finally {
    store.db.close();
  }
}
