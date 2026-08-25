import type { JsonObject } from "@server/core/harness-state/events.js";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
} from "@server/core/job-queue/kernel.js";
import { startJobConsumer } from "@server/core/job-queue/consumer.js";
import type {
  ClaimToken,
  JobActor,
  JobKindDescriptor,
  JobQueueKernelOps,
  JobRecord,
  JobResult,
} from "@server/core/job-queue/types.js";
import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import type { BackgroundKnowledgeTraceHooks } from "./trace.js";

const KIND = "knowledge_absorption" as const;
const CONCURRENCY_LIMIT = 2;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_STOP_MAX_WAIT_MS = 15_000;

export type BackgroundKnowledgeJobStatus =
  | "queued"
  | "processing"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface BackgroundKnowledgeJob {
  jobId: string;
  workerStateId: string;
  gameId: string;
  revision: number;
  status: BackgroundKnowledgeJobStatus;
  attempts: number;
  nextAttemptAt: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
  executionClass: "background_safe" | "sync_stage";
  sourceClass: string;
  sourceKind: string;
  sourceId: string;
  provenance: JsonObject;
  publishedProvenance: JsonObject | null;
  digest: string | null;
  error: string | null;
  traceId: string;
  causedByEventId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundKnowledgeSummary {
  publishedRevision: string | null;
  queued: number;
  processing: number;
  waiting: number;
  failed: number;
  oldestPendingAt: string | null;
  activeLease: { id: string; expiresAt: string } | null;
  retry: { nextAttemptAt: string; attempts: number } | null;
  recentFailures: Array<{
    jobId: string;
    workerStateId: string;
    error: string;
    attempts: number;
    updatedAt: string;
  }>;
}

export interface BackgroundKnowledgePublication {
  digest: string;
  provenance: JsonObject;
}

export type BackgroundKnowledgeProcessor = (
  job: BackgroundKnowledgeJob,
) => Promise<BackgroundKnowledgePublication>;

export interface ProcessBackgroundKnowledgeResult {
  outcome: "empty" | "backoff" | "leased" | "succeeded" | "failed";
  jobId: string | null;
  revision: number | null;
  digest?: string;
  error?: string;
}

function backgroundStatus(status: JobRecord["status"]): BackgroundKnowledgeJobStatus {
  return status === "claimed" || status === "running" ? "processing" : status;
}

function backgroundJob(value: JobRecord): BackgroundKnowledgeJob {
  return {
    jobId: value.jobId,
    workerStateId: value.dedupeKey,
    gameId: value.gameId,
    revision: value.revision,
    status: backgroundStatus(value.status),
    attempts: value.attempts,
    nextAttemptAt: value.nextAttemptAt,
    leaseId: value.leaseId,
    leaseExpiresAt: value.leaseExpiresAt,
    executionClass: "background_safe",
    sourceClass: "worker_result",
    sourceKind: "worker_state",
    sourceId: value.dedupeKey,
    provenance: value.payload,
    publishedProvenance: null,
    digest: value.resultRef,
    error: value.error,
    traceId: value.traceId ?? `trace-knowledge-${value.gameId}`,
    causedByEventId: value.causedByEventId ?? value.jobId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

interface WorkerSource {
  worker_state_id: string;
  run_id: string;
  lifecycle_status: string;
  ended_at: string | null;
  game_id: string | null;
  trace_id: string | null;
  caused_by_event_id: string | null;
}

/** Enqueue completed immutable worker evidence; nested callers participate in their transaction. */
export function enqueueBackgroundKnowledgeForWorker(
  store: StateStore,
  workerStateId: string,
): BackgroundKnowledgeJob {
  return immediateTransaction(store.db, () => {
    const source = store.db
      .query(
        `SELECT ws.id AS worker_state_id, ws.run_id, ws.lifecycle_status, ws.ended_at,
          r.game_id, r.trace_id, r.caused_by_event_id
        FROM worker_state ws JOIN runs r ON r.id = ws.run_id WHERE ws.id = ?`,
      )
      .get(workerStateId) as WorkerSource | null;
    if (!source || source.ended_at === null) {
      throw new Error(`Completed worker state not found: ${workerStateId}`);
    }
    const gameId = source.game_id ?? "melee";
    return backgroundJob(
      enqueueJob(store, {
        kind: KIND,
        dedupeKey: workerStateId,
        gameId,
        runId: source.run_id,
        payload: {
          worker_state_id: workerStateId,
          run_id: source.run_id,
          lifecycle_status: source.lifecycle_status,
        },
        traceId: source.trace_id ?? `trace-knowledge-${gameId}`,
        ...(source.caused_by_event_id
          ? { causedByEventId: source.caused_by_event_id }
          : {}),
        executionClass: "local",
        actor: "runner",
        at: source.ended_at,
      }),
    );
  });
}

/** Idempotently discovers worker states completed before the queue existed. */
export function catchUpBackgroundKnowledge(
  store: StateStore,
  gameId?: string,
): number {
  return immediateTransaction(store.db, () => {
    const rows = store.db
      .query(
        `SELECT ws.id FROM worker_state ws JOIN runs r ON r.id = ws.run_id
        LEFT JOIN jobs j ON j.kind = 'knowledge_absorption' AND j.dedupe_key = ws.id
        WHERE ws.ended_at IS NOT NULL AND j.job_id IS NULL
          AND (? IS NULL OR COALESCE(r.game_id, 'melee') = ?)
        ORDER BY ws.ended_at, ws.id`,
      )
      .all(gameId ?? null, gameId ?? null) as Array<{ id: string }>;
    for (const row of rows) enqueueBackgroundKnowledgeForWorker(store, row.id);
    return rows.length;
  });
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function publicationResult(
  job: JobRecord,
  publication: BackgroundKnowledgePublication,
): JobResult {
  return {
    resultRef: publication.digest,
    detail: { provenance: publication.provenance },
  };
}

async function processClaimedJob(
  job: JobRecord,
  processor: BackgroundKnowledgeProcessor,
): Promise<BackgroundKnowledgePublication> {
  if (job.resultRef) return { digest: job.resultRef, provenance: {} };
  return processor(backgroundJob(job));
}

export async function processBackgroundKnowledge(
  store: StateStore,
  processor: BackgroundKnowledgeProcessor,
  options: { actor?: JobActor; leaseMs?: number } = {},
): Promise<ProcessBackgroundKnowledgeResult> {
  const actor = options.actor ?? "runner";
  const claimed = claimNextJob(store, {
    kind: KIND,
    concurrencyLimit: CONCURRENCY_LIMIT,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    actor,
  });
  if (!claimed) return { outcome: "empty", jobId: null, revision: null };

  let publication: BackgroundKnowledgePublication;
  try {
    publication = await processClaimedJob(claimed.job, processor);
  } catch (cause) {
    const error = message(cause);
    try {
      const waiting = failJob(store, claimed.token, error, { actor });
      return {
        outcome: "failed",
        jobId: waiting.jobId,
        revision: waiting.revision,
        error,
      };
    } catch {
      return {
        outcome: "leased",
        jobId: claimed.job.jobId,
        revision: claimed.job.revision,
        error,
      };
    }
  }

  try {
    const done = completeJob(
      store,
      claimed.token,
      publicationResult(claimed.job, publication),
      { actor },
    );
    return {
      outcome: "succeeded",
      jobId: done.jobId,
      revision: done.revision,
      digest: publication.digest,
    };
  } catch (cause) {
    return {
      outcome: "leased",
      jobId: claimed.job.jobId,
      revision: claimed.job.revision,
      error: message(cause),
    };
  }
}

/** Operator `knowledge.process` entry point; it intentionally shares the automatic claim seam. */
export function triggerBackgroundKnowledgeProcess(
  store: StateStore,
  processor: BackgroundKnowledgeProcessor,
): Promise<ProcessBackgroundKnowledgeResult> {
  return processBackgroundKnowledge(store, processor, { actor: "operator" });
}

export function queryBackgroundKnowledgeSummary(
  store: StateStore,
  gameId: string,
): BackgroundKnowledgeSummary {
  const counts = Object.fromEntries(
    (
      store.db
        .query(
          `SELECT status, COUNT(*) count FROM jobs
          WHERE kind = 'knowledge_absorption' AND game_id = ? GROUP BY status`,
        )
        .all(gameId) as Array<{ status: string; count: number }>
    ).map((row) => [row.status, Number(row.count)]),
  );
  const oldest = store.db
    .query(
      `SELECT MIN(created_at) value FROM jobs
      WHERE kind = 'knowledge_absorption' AND game_id = ?
        AND status IN ('queued','claimed','running','waiting')`,
    )
    .get(gameId) as { value: string | null };
  const lease = store.db
    .query(
      `SELECT lease_id, lease_expires_at FROM jobs
      WHERE kind = 'knowledge_absorption' AND game_id = ?
        AND status IN ('claimed','running') ORDER BY updated_at LIMIT 1`,
    )
    .get(gameId) as { lease_id: string; lease_expires_at: string } | null;
  const retry = store.db
    .query(
      `SELECT next_attempt_at, attempts FROM jobs
      WHERE kind = 'knowledge_absorption' AND game_id = ? AND status = 'waiting'
      ORDER BY next_attempt_at LIMIT 1`,
    )
    .get(gameId) as { next_attempt_at: string; attempts: number } | null;
  const failures = store.db
    .query(
      `SELECT job_id, dedupe_key, error_json, attempts, updated_at FROM jobs
      WHERE kind = 'knowledge_absorption' AND game_id = ? AND error_json IS NOT NULL
      ORDER BY updated_at DESC LIMIT 5`,
    )
    .all(gameId) as Array<{
    job_id: string;
    dedupe_key: string;
    error_json: string;
    attempts: number;
    updated_at: string;
  }>;
  const revision = store.db
    .query(
      "SELECT revision FROM knowledge_revisions WHERE game_id = ? ORDER BY revision DESC LIMIT 1",
    )
    .get(gameId) as { revision: number } | null;
  return {
    publishedRevision: revision
      ? `knowledge-${Number(revision.revision)}`
      : null,
    queued: counts.queued ?? 0,
    processing: (counts.claimed ?? 0) + (counts.running ?? 0),
    waiting: counts.waiting ?? 0,
    failed: counts.failed ?? 0,
    oldestPendingAt: oldest.value,
    activeLease: lease
      ? { id: lease.lease_id, expiresAt: lease.lease_expires_at }
      : null,
    retry: retry
      ? { nextAttemptAt: retry.next_attempt_at, attempts: retry.attempts }
      : null,
    recentFailures: failures.map((row) => {
      let error = row.error_json;
      try {
        const parsed = JSON.parse(row.error_json) as { message?: unknown };
        if (typeof parsed.message === "string") error = parsed.message;
      } catch {
        // Preserve malformed legacy text as-is.
      }
      return {
        jobId: row.job_id,
        workerStateId: row.dedupe_key,
        error,
        attempts: row.attempts,
        updatedAt: row.updated_at,
      };
    }),
  };
}

const kernelOps: JobQueueKernelOps = {
  claimNextJob,
  completeJob,
  failJob,
  // Inline consumers never invoke these operations.
  markJobRunning: () => {
    throw new Error("knowledge absorption jobs execute inline");
  },
  heartbeatJob: () => {
    throw new Error("knowledge absorption jobs execute inline");
  },
};

function descriptor(
  processor: BackgroundKnowledgeProcessor,
  leaseMs: number,
): JobKindDescriptor {
  return {
    kind: KIND,
    concurrencyLimit: CONCURRENCY_LIMIT,
    leaseMs,
    execution: {
      mode: "inline",
      handler: async (value): Promise<JobResult> => {
        const publication = await processClaimedJob(value, processor);
        return publicationResult(value, publication);
      },
    },
  };
}

export function startBackgroundKnowledgeProcessor(
  store: StateStore,
  processor: BackgroundKnowledgeProcessor,
  options: {
    intervalMs?: number;
    leaseMs?: number;
    /**
     * Trace observer for the knowledge lane. Opt-in: callers that want the
     * lane visible pass `createBackgroundKnowledgeTraceHooks(store)`. Left
     * unset, the queue behaves exactly as it did before it could be traced.
     */
    trace?: BackgroundKnowledgeTraceHooks;
  } = {},
): (options?: { maxWaitMs?: number }) => Promise<void> {
  catchUpBackgroundKnowledge(store);
  const consumer = startJobConsumer(
    store,
    descriptor(processor, options.leaseMs ?? DEFAULT_LEASE_MS),
    kernelOps,
    {
      intervalMs: options.intervalMs ?? 1_000,
      actor: "runner",
      ...(options.trace
        ? { onJobClaimed: options.trace.onJobClaimed, onJobSettled: options.trace.onJobSettled }
        : {}),
    },
  );
  return async (stopOptions = {}) => {
    const stopping = consumer.stop();
    const maxWaitMs = stopOptions.maxWaitMs ?? DEFAULT_STOP_MAX_WAIT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Symbol("background-knowledge-stop-deadline");
    const outcome = await Promise.race([
      stopping,
      new Promise<typeof deadline>((resolveDeadline) => {
        timer = setTimeout(() => resolveDeadline(deadline), maxWaitMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    if (outcome === deadline) {
      const abandoned = consumer.inFlight();
      void stopping.catch(() => {});
      console.warn(
        `Background knowledge shutdown abandoned ${abandoned} in-flight job(s) after ${maxWaitMs}ms; lease expiry and catchUpBackgroundKnowledge will recover them on next startup`,
      );
    }
  };
}
