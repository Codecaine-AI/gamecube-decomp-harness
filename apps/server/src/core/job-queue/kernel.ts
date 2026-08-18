import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { RegisteredGameEventType } from "@server/core/harness-state/event-registry.js";
import {
  appendGameEvent,
  eventSpan,
  type JsonObject,
} from "@server/core/harness-state/events.js";
import {
  immediateTransaction,
  now,
  type StateStore,
} from "@server/core/orchestrator-state";
import type {
  ClaimToken,
  JobActor,
  JobCompletionContext,
  JobExecutionClass,
  JobKind,
  JobRecord,
  JobResult,
  JobStatus,
  TaskHandle,
} from "./types.js";

interface JobRow {
  job_id: string;
  kind: JobKind;
  dedupe_key: string;
  game_id: string;
  run_id: string | null;
  status: JobStatus;
  revision: number;
  priority: number;
  concurrency_key: string | null;
  execution_class: JobExecutionClass;
  lease_id: string | null;
  lease_expires_at: string | null;
  attempts: number;
  next_attempt_at: string | null;
  payload_json: string;
  result_ref: string | null;
  error_json: string | null;
  trace_id: string | null;
  caused_by_event_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function parseObject(value: string): JsonObject {
  try {
    const v: unknown = JSON.parse(value);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as JsonObject)
      : {};
  } catch {
    return {};
  }
}

function record(r: JobRow): JobRecord {
  return {
    jobId: r.job_id,
    kind: r.kind,
    dedupeKey: r.dedupe_key,
    gameId: r.game_id,
    runId: r.run_id,
    status: r.status,
    revision: r.revision,
    priority: r.priority,
    concurrencyKey: r.concurrency_key,
    executionClass: r.execution_class,
    leaseId: r.lease_id,
    leaseExpiresAt: r.lease_expires_at,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    payload: parseObject(r.payload_json),
    resultRef: r.result_ref,
    error: r.error_json
      ? ((parseObject(r.error_json).message as string) ?? r.error_json)
      : null,
    traceId: r.trace_id,
    causedByEventId: r.caused_by_event_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

function select(
  db: Database,
  sql: string,
  ...args: string[]
): JobRecord | null {
  const r = db.query(sql).get(...args) as JobRow | null;
  return r ? record(r) : null;
}

/** Returns a job by its stable identifier. */
export function getJob(store: StateStore, jobId: string): JobRecord | null {
  return select(store.db, "SELECT * FROM jobs WHERE job_id = ?", jobId);
}

/** Returns the job for a kind and deduplication key. */
export function getJobByDedupeKey(
  store: StateStore,
  kind: JobKind,
  dedupeKey: string,
): JobRecord | null {
  return select(
    store.db,
    "SELECT * FROM jobs WHERE kind = ? AND dedupe_key = ?",
    kind,
    dedupeKey,
  );
}
const isoAdd = (at: string, ms: number) =>
  new Date(Date.parse(at) + ms).toISOString();

const actor = (v?: JobActor): JobActor => v ?? "runner";

function append(
  store: StateStore,
  j: JobRecord,
  eventType: RegisteredGameEventType,
  occurredAt: string,
  eventActor: JobActor,
  payload: JsonObject,
) {
  return appendGameEvent(store.db, {
    eventType,
    gameId: j.gameId,
    subjectKind: "job",
    subjectId: j.jobId,
    correlationId: j.jobId,
    causationId: j.causedByEventId ?? j.jobId,
    traceId: j.traceId ?? `trace-job-${j.jobId}`,
    ...eventSpan(),
    actor: eventActor,
    occurredAt,
    payload,
  });
}

function transition(
  store: StateStore,
  current: JobRecord,
  input: {
    to: JobStatus;
    eventType: RegisteredGameEventType;
    at: string;
    actor: JobActor;
    leaseId?: string | null;
    leaseExpiresAt?: string | null;
    nextAttemptAt?: string | null;
    error?: string | null;
    resultRef?: string | null;
    completedAt?: string | null;
    payload?: JsonObject;
    extra?: JsonObject;
  },
): JobRecord {
  const fresh = getJob(store, current.jobId);
  if (!fresh || fresh.revision !== current.revision)
    throw new Error(`Job CAS failed for ${current.jobId}`);
  const ev = append(store, fresh, input.eventType, input.at, input.actor, {
    from_status: fresh.status,
    to_status: input.to,
    kind: fresh.kind,
    ...input.extra,
  });
  const res = store.db
    .query(
      `UPDATE jobs SET status=?, revision=revision+1, lease_id=?, lease_expires_at=?,
        next_attempt_at=?, error_json=?, result_ref=COALESCE(?,result_ref),
        payload_json=COALESCE(?,payload_json), caused_by_event_id=?, updated_at=?, completed_at=?
        WHERE job_id=? AND revision=?`,
    )
    .run(
      input.to,
      input.leaseId ?? null,
      input.leaseExpiresAt ?? null,
      input.nextAttemptAt ?? null,
      input.error === undefined
        ? fresh.error === null
          ? null
          : JSON.stringify({ message: fresh.error })
        : input.error === null
          ? null
          : JSON.stringify({ message: input.error }),
      input.resultRef ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      ev.eventId,
      input.at,
      input.completedAt ?? null,
      fresh.jobId,
      fresh.revision,
    );
  if (res.changes !== 1) throw new Error(`Job CAS failed for ${fresh.jobId}`);
  return getJob(store, fresh.jobId)!;
}

function owned(store: StateStore, token: ClaimToken, at: string): JobRecord {
  const j = getJob(store, token.jobId);
  if (
    !j ||
    j.kind !== token.kind ||
    j.leaseId !== token.leaseId ||
    !j.leaseExpiresAt ||
    j.leaseExpiresAt <= at
  )
    throw new Error(`stale claim token for ${token.jobId}`);
  return j;
}

/** Verifies that a claim token still owns an unexpired job lease. */
export function verifyClaimToken(
  store: StateStore,
  token: ClaimToken,
  at: string = now(),
): JobRecord {
  return owned(store, token, at);
}

/** Enqueues a job idempotently by kind and deduplication key. */
export function enqueueJob(
  store: StateStore,
  input: {
    kind: JobKind;
    dedupeKey: string;
    gameId: string;
    runId?: string;
    priority?: number;
    concurrencyKey?: string;
    executionClass?: JobExecutionClass;
    payload: JsonObject;
    traceId?: string;
    causedByEventId?: string;
    actor?: JobActor;
    at?: string;
  },
): JobRecord {
  return immediateTransaction(store.db, () => {
    const old = getJobByDedupeKey(store, input.kind, input.dedupeKey);
    if (old) return old;
    const at = input.at ?? now(),
      id = `job-${randomUUID()}`,
      trace = input.traceId ?? `trace-job-${id}`;
    const seed = {
      jobId: id,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      gameId: input.gameId,
      runId: input.runId ?? null,
      status: "queued" as const,
      revision: 0,
      priority: input.priority ?? 0,
      concurrencyKey: input.concurrencyKey ?? null,
      executionClass: input.executionClass ?? ("local" as const),
      leaseId: null,
      leaseExpiresAt: null,
      attempts: 0,
      nextAttemptAt: null,
      payload: input.payload,
      resultRef: null,
      error: null,
      traceId: trace,
      causedByEventId: input.causedByEventId ?? null,
      createdAt: at,
      updatedAt: at,
      completedAt: null,
    };
    const ev = append(store, seed, "job.enqueued", at, actor(input.actor), {
      kind: seed.kind,
      dedupe_key: seed.dedupeKey,
      execution_class: seed.executionClass,
      priority: seed.priority,
    });
    store.db
      .query(
        `INSERT INTO jobs(job_id,kind,dedupe_key,game_id,run_id,status,revision,priority,
          concurrency_key,execution_class,payload_json,trace_id,caused_by_event_id,created_at,updated_at)
          VALUES(?,?,?,?,?,'queued',0,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.kind,
        input.dedupeKey,
        input.gameId,
        input.runId ?? null,
        input.priority ?? 0,
        input.concurrencyKey ?? null,
        input.executionClass ?? "local",
        JSON.stringify(input.payload),
        trace,
        ev.eventId,
        at,
        at,
      );
    return getJob(store, id)!;
  });
}

/** Updates queued dispatch priority without changing job lifecycle state. */
export function reprioritizeJob(
  store: StateStore,
  input: {
    kind: JobKind;
    dedupeKey: string;
    priority: number;
    at?: string;
  },
): JobRecord | null {
  return immediateTransaction(store.db, () => {
    const j = getJobByDedupeKey(store, input.kind, input.dedupeKey);
    if (
      !j ||
      !["queued", "waiting"].includes(j.status) ||
      j.priority === input.priority
    )
      return j;
    const at = input.at ?? now();
    const r = store.db
      .query(
        `UPDATE jobs SET priority=?,revision=revision+1,updated_at=?
          WHERE job_id=? AND revision=?`,
      )
      .run(input.priority, at, j.jobId, j.revision);
    if (r.changes !== 1) throw new Error(`Job CAS failed for ${j.jobId}`);
    /* Priority is dispatch metadata, not a status transition, so no game_event is appended. */
    return getJob(store, j.jobId)!;
  });
}

/** Resets a terminal job to the queued state. */
export function requeueJob(
  store: StateStore,
  input: { kind: JobKind; dedupeKey: string; actor?: JobActor; at?: string },
): JobRecord {
  return immediateTransaction(store.db, () => {
    const j = getJobByDedupeKey(store, input.kind, input.dedupeKey);
    if (!j) throw new Error("Job not found");
    if (!["succeeded", "failed", "cancelled"].includes(j.status))
      throw new Error("Only terminal jobs can be requeued");
    const at = input.at ?? now();
    const ev = append(store, j, "job.enqueued", at, actor(input.actor), {
      kind: j.kind,
      dedupe_key: j.dedupeKey,
      execution_class: j.executionClass,
      priority: j.priority,
      requeue: true,
    });
    const r = store.db
      .query(
        `UPDATE jobs SET status='queued',revision=revision+1,attempts=0,lease_id=NULL,
          lease_expires_at=NULL,error_json=NULL,next_attempt_at=NULL,completed_at=NULL,
          caused_by_event_id=?,updated_at=? WHERE job_id=? AND revision=?`,
      )
      .run(ev.eventId, at, j.jobId, j.revision);
    if (r.changes !== 1) throw new Error("Job CAS failed");
    return getJob(store, j.jobId)!;
  });
}

/** Claims the next eligible job while enforcing queue concurrency limits. */
export function claimNextJob(
  store: StateStore,
  input: {
    kind: JobKind;
    concurrencyLimit: number;
    leaseMs: number;
    runId?: string;
    at?: string;
    actor?: JobActor;
  },
): { job: JobRecord; token: ClaimToken } | null {
  return immediateTransaction(store.db, () => {
    const at = input.at ?? now();
    const runFilter = input.runId === undefined ? "" : " AND run_id=?";
    const runArgs = input.runId === undefined ? [] : [input.runId];
    const active = Number(
      (
        store.db
          .query(
            `SELECT COUNT(*) n FROM jobs
              WHERE kind=? AND status IN ('claimed','running')${runFilter}`,
          )
          .get(input.kind, ...runArgs) as { n: number }
      ).n,
    );
    const rows = store.db
      .query(
        `SELECT * FROM jobs WHERE kind=?
          ${runFilter}
          AND ((status IN ('queued','waiting') AND (next_attempt_at IS NULL OR next_attempt_at<=?))
            OR (status IN ('claimed','running') AND lease_expires_at<=?))
          ORDER BY priority DESC,created_at ASC,job_id ASC`,
      )
      .all(input.kind, ...runArgs, at, at) as JobRow[];
    let j = rows.map(record).find(
      (c) =>
        !c.concurrencyKey ||
        !store.db
          .query(
            `SELECT 1 FROM jobs WHERE concurrency_key=? AND status IN ('claimed','running')
                AND job_id<>? AND lease_expires_at>?${runFilter} LIMIT 1`,
          )
          .get(c.concurrencyKey, c.jobId, at, ...runArgs),
    );
    if (
      !j ||
      (active >= input.concurrencyLimit &&
        j.status !== "claimed" &&
        j.status !== "running")
    )
      return null;
    if (j.status === "claimed" || j.status === "running")
      j = transition(store, j, {
        to: "waiting",
        eventType: "job.waiting",
        at,
        actor: actor(input.actor),
        nextAttemptAt: at,
        extra: { reason: "lease_expired" },
      });
    const leaseId = `lease-${randomUUID()}`;
    store.db
      .query(
        `UPDATE jobs SET attempts=attempts+1
          WHERE job_id=? AND revision=?`,
      )
      .run(j.jobId, j.revision);
    j = getJob(store, j.jobId)!;
    const claimed = transition(store, j, {
      to: "claimed",
      eventType: "job.claimed",
      at,
      actor: actor(input.actor),
      leaseId,
      leaseExpiresAt: isoAdd(at, input.leaseMs),
    });
    return {
      job: claimed,
      token: { jobId: claimed.jobId, kind: claimed.kind, leaseId },
    };
  });
}

/** Marks a claimed job as running. */
export function markJobRunning(
  store: StateStore,
  token: ClaimToken,
  input: { taskHandle?: TaskHandle; at?: string; actor?: JobActor } = {},
): JobRecord {
  return immediateTransaction(store.db, () => {
    const at = input.at ?? now(),
      j = owned(store, token, at);
    if (j.status !== "claimed") throw new Error("Job is not claimed");
    return transition(store, j, {
      to: "running",
      eventType: "job.started",
      at,
      actor: actor(input.actor),
      leaseId: j.leaseId,
      leaseExpiresAt: j.leaseExpiresAt,
      payload: input.taskHandle
        ? { ...j.payload, task_handle: input.taskHandle }
        : undefined,
    });
  });
}
/** Renews an active claim without appending a lifecycle event. */
export function heartbeatJob(
  store: StateStore,
  token: ClaimToken,
  input: { leaseMs?: number; at?: string } = {},
): JobRecord {
  return immediateTransaction(store.db, () => {
    const at = input.at ?? now(),
      j = owned(store, token, at);
    const r = store.db
      .query(
        `UPDATE jobs SET revision=revision+1,lease_expires_at=?,updated_at=?
          WHERE job_id=? AND revision=? AND lease_id=?`,
      )
      .run(
        isoAdd(at, input.leaseMs ?? 60_000),
        at,
        j.jobId,
        j.revision,
        token.leaseId,
      );
    if (r.changes !== 1) throw new Error(`stale claim token for ${j.jobId}`);
    /* Heartbeats renew ownership but are not status transitions, so no game_event is appended. */ return getJob(
      store,
      j.jobId,
    )!;
  });
}

/** Attaches host-side dispatch metadata without appending a lifecycle event. */
export function attachJobPayload(
  store: StateStore,
  token: ClaimToken,
  patch: JsonObject,
  input: { at?: string } = {},
): JobRecord {
  return immediateTransaction(store.db, () => {
    const at = input.at ?? now();
    const j = owned(store, token, at);
    const r = store.db
      .query(
        `UPDATE jobs SET payload_json=?,revision=revision+1,updated_at=?
          WHERE job_id=? AND revision=?`,
      )
      .run(JSON.stringify({ ...j.payload, ...patch }), at, j.jobId, j.revision);
    if (r.changes !== 1) throw new Error(`Job CAS failed for ${j.jobId}`);
    /* Payload linkage is dispatch metadata, like heartbeat, so no game_event is appended. */
    return getJob(store, j.jobId)!;
  });
}
/** Completes an active job and runs its completion callback atomically. */
export function completeJob(
  store: StateStore,
  token: ClaimToken,
  result: JobResult,
  input: {
    at?: string;
    actor?: JobActor;
    onComplete?: (
      job: JobRecord,
      result: JobResult,
      ctx: JobCompletionContext,
    ) => void;
  } = {},
): JobRecord {
  return immediateTransaction(store.db, () => {
    const at = input.at ?? now(),
      j = owned(store, token, at);
    if (!["claimed", "running"].includes(j.status))
      throw new Error("Job is not active");
    const done = transition(store, j, {
      to: "succeeded",
      eventType: "job.succeeded",
      at,
      actor: actor(input.actor),
      error: null,
      // Dispatched workers use their domain row as the evidence pointer. Other
      // job kinds are unaffected when their payload has no worker_state_id.
      resultRef: result.resultRef ?? (typeof j.payload.worker_state_id === "string" ? j.payload.worker_state_id : null),
      completedAt: at,
      extra: { detail: result.detail ?? {} },
    });
    input.onComplete?.(done, result, { store });
    return done;
  });
}
/** Records an active job failure and schedules its retry. */
export function failJob(
  store: StateStore,
  token: ClaimToken,
  error: string,
  input: { backoffMs?: number; at?: string; actor?: JobActor } = {},
): JobRecord {
  return immediateTransaction(store.db, () => {
    const at = input.at ?? now(),
      j = owned(store, token, at);
    if (!["claimed", "running"].includes(j.status))
      throw new Error("Job is not active");
    const failed = transition(store, j, {
      to: "failed",
      eventType: "job.failed",
      at,
      actor: actor(input.actor),
      error,
      extra: { error },
    });
    const ms =
      input.backoffMs ??
      Math.min(300_000, 1_000 * 2 ** Math.min(j.attempts, 8));
    return transition(store, failed, {
      to: "waiting",
      eventType: "job.waiting",
      at,
      actor: actor(input.actor),
      nextAttemptAt: isoAdd(at, ms),
      error,
      extra: { reason: "retry_backoff" },
    });
  });
}
/** Cancels a nonterminal job. */
export function cancelJob(
  store: StateStore,
  input: { jobId: string; actor?: JobActor; reason?: string; at?: string },
): JobRecord {
  return immediateTransaction(store.db, () => {
    const j = getJob(store, input.jobId);
    if (!j) throw new Error("Job not found");
    if (["succeeded", "failed", "cancelled"].includes(j.status)) return j;
    const at = input.at ?? now();
    return transition(store, j, {
      to: "cancelled",
      eventType: "job.cancelled",
      at,
      actor: actor(input.actor),
      completedAt: at,
      extra: { reason: input.reason ?? "cancelled" },
    });
  });
}
/** Moves jobs with expired leases back to the waiting state. */
export function reapExpiredJobs(
  store: StateStore,
  input: { kind?: JobKind; at?: string; actor?: JobActor } = {},
): JobRecord[] {
  return immediateTransaction(store.db, () => {
    const at = input.at ?? now();
    const rows = store.db
      .query(
        `SELECT * FROM jobs WHERE status IN ('claimed','running') AND lease_expires_at<=?
          AND (? IS NULL OR kind=?) ORDER BY job_id`,
      )
      .all(at, input.kind ?? null, input.kind ?? null) as JobRow[];
    return rows.map((r) =>
      transition(store, record(r), {
        to: "waiting",
        eventType: "job.waiting",
        at,
        actor: actor(input.actor),
        nextAttemptAt: at,
        extra: { reason: "lease_expired" },
      }),
    );
  });
}

export interface JobQueueSummary {
  counts: Record<JobStatus, number>;
  oldestPendingAt: string | null;
  activeLeaseCount: number;
  nextRetryAt: string | null;
}

/** Summarizes queue state for a game and optional job kind. */
export function jobQueueSummary(
  store: StateStore,
  input: { gameId: string; kind?: JobKind },
): JobQueueSummary {
  const args = [input.gameId, input.kind ?? null, input.kind ?? null];
  const rows = store.db
    .query(
      `SELECT status,COUNT(*) count FROM jobs
        WHERE game_id=? AND (? IS NULL OR kind=?) GROUP BY status`,
    )
    .all(...args) as { status: JobStatus; count: number }[];
  const counts = Object.fromEntries(
    [
      "queued",
      "claimed",
      "running",
      "waiting",
      "succeeded",
      "failed",
      "cancelled",
    ].map((s) => [s, 0]),
  ) as Record<JobStatus, number>;
  for (const r of rows) counts[r.status] = Number(r.count);
  const x = store.db
    .query(
      `SELECT MIN(CASE WHEN status IN ('queued','claimed','running','waiting') THEN created_at END) oldest,
        SUM(CASE WHEN status IN ('claimed','running') AND lease_id IS NOT NULL THEN 1 ELSE 0 END) active,
        MIN(CASE WHEN status='waiting' THEN next_attempt_at END) retry
        FROM jobs WHERE game_id=? AND (? IS NULL OR kind=?)`,
    )
    .get(...args) as {
    oldest: string | null;
    active: number | null;
    retry: string | null;
  };
  return {
    counts,
    oldestPendingAt: x.oldest,
    activeLeaseCount: Number(x.active ?? 0),
    nextRetryAt: x.retry,
  };
}
