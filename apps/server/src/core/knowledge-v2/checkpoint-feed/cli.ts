// `checkpoint-knowledge backfill --epochs <ids>` (plan §5 M11-B task 3, §6.8
// owner D1): the deliberate way to feed history. Turning the feed on never
// reaches epochs settled before the kind's `enabled_since`; this command
// names epochs explicitly, enqueues their `checkpoint_knowledge` jobs (same
// selection, ordering and per-epoch cap as the lane's catch-up), then runs
// them in this process, one at a time, unless `--enqueue-only` leaves them
// for the next lane start.
import { checkpointKnowledgeCapArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { JsonObject } from "@server/core/harness-state/events.js";
import { openState, type StateStore } from "@server/core/harness-runtime/run-state";
import { claimJobByDedupeKey, completeJob, failJob, verifyClaimToken } from "@server/core/job-queue/kernel.js";
import type { JobRecord } from "@server/core/job-queue/types.js";
import { catchUpKnowledge } from "@server/core/model-node-work/catch-up.js";
import { MODEL_NODE_LANE_DEFAULTS, type ModelNodeJobHandler } from "@server/core/model-node-work/lane.js";

import { createCheckpointKnowledgeHandler } from "./handler.js";

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

export interface CheckpointKnowledgeCliDeps {
  openState?: (stateDir: string) => StateStore;
  /** Default: the production `checkpoint_knowledge` handler for `globals`. */
  handler?: ModelNodeJobHandler;
  print?: (report: CheckpointKnowledgeBackfillReport) => void;
  signal?: AbortSignal;
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

/** Runs one claimable job through the handler with the lane's lease and attempt limit. */
async function runJob(store: StateStore, dedupeKey: string, handler: ModelNodeJobHandler, signal: AbortSignal): Promise<{ job: JobRecord | null; outcome: string | null }> {
  const claimed = claimJobByDedupeKey(store, {
    kind: "checkpoint_knowledge",
    dedupeKey,
    leaseMs: MODEL_NODE_LANE_DEFAULTS.leaseMs,
    actor: "operator",
  });
  if (!claimed) return { job: null, outcome: null };
  try {
    const result = await handler(claimed.job, {
      store,
      token: claimed.token,
      signal,
      ensureClaim: () => { verifyClaimToken(store, claimed.token); },
    });
    const job = completeJob(store, claimed.token, result, { actor: "operator" });
    const status = (result.detail as JsonObject | undefined)?.status;
    return { job, outcome: typeof status === "string" ? status : null };
  } catch (cause) {
    const message = errorMessage(cause);
    const job = failJob(store, claimed.token, message, {
      terminal: claimed.job.attempts >= MODEL_NODE_LANE_DEFAULTS.maxAttempts,
      actor: "operator",
    });
    return { job, outcome: message };
  }
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
): Promise<CheckpointKnowledgeBackfillReport> {
  const statuses = options.epochIds.map((id) => ({ id, status: epochStatus(store, id) }));
  const enqueued = catchUpKnowledge(store, { epochIds: options.epochIds, includeHistory: true, cap: options.cap });
  const outcomes = new Map<string, { status: string; outcome: string | null }>();
  if (!options.enqueueOnly) {
    for (const row of backfillJobs(store, options.epochIds)) {
      if (signal.aborted) break;
      if (row.status !== "queued" && row.status !== "waiting") continue;
      const ran = await runJob(store, row.dedupe_key, handler, signal);
      if (ran.job) outcomes.set(row.dedupe_key, { status: ran.job.status, outcome: ran.outcome });
    }
  }
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
      outcome: outcomes.get(job.dedupe_key)?.outcome ?? null,
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
    const report = await backfillCheckpointKnowledge(store, options, handler, deps.signal);
    (deps.print ?? ((value) => console.log(JSON.stringify(value, null, 2))))(report);
    return report;
  } finally {
    store.db.close();
  }
}
