import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { appendProjectEvent, eventSpan, type JsonObject } from "@server/core/project-state/events.js";
import { immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";

export type BackgroundKnowledgeJobStatus = "queued" | "processing" | "waiting" | "succeeded" | "failed" | "cancelled";

export interface BackgroundKnowledgeJob {
  jobId: string;
  workerStateId: string;
  projectId: string;
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
  recentFailures: Array<{ jobId: string; workerStateId: string; error: string; attempts: number; updatedAt: string }>;
}

export interface BackgroundKnowledgePublication {
  digest: string;
  provenance: JsonObject;
}

export type BackgroundKnowledgeProcessor = (job: BackgroundKnowledgeJob) => Promise<BackgroundKnowledgePublication>;

export interface ProcessBackgroundKnowledgeResult {
  outcome: "empty" | "backoff" | "leased" | "succeeded" | "failed";
  jobId: string | null;
  revision: number | null;
  digest?: string;
  error?: string;
}

interface JobRow {
  job_id: string; worker_state_id: string; project_id: string; revision: number; status: BackgroundKnowledgeJobStatus;
  attempts: number; next_attempt_at: string | null; lease_id: string | null; lease_expires_at: string | null;
  execution_class: "background_safe" | "sync_stage"; source_kind: string; source_id: string;
  evidence_provenance_json: string; publication_provenance_json: string | null; published_digest: string | null; error_json: string | null;
  trace_id: string; caused_by_event_id: string; created_at: string; updated_at: string;
}

function objectJson(value: string | null): JsonObject | null {
  if (value === null) return null;
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {}; }
  catch { return {}; }
}

function job(row: JobRow): BackgroundKnowledgeJob {
  return {
    jobId: row.job_id, workerStateId: row.worker_state_id, projectId: row.project_id, revision: row.revision,
    status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, leaseId: row.lease_id,
    leaseExpiresAt: row.lease_expires_at, executionClass: row.execution_class, sourceClass: "worker_result",
    sourceKind: row.source_kind, sourceId: row.source_id, provenance: objectJson(row.evidence_provenance_json) ?? {},
    publishedProvenance: objectJson(row.publication_provenance_json), digest: row.published_digest,
    error: (objectJson(row.error_json)?.message as string | undefined) ?? null,
    traceId: row.trace_id, causedByEventId: row.caused_by_event_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function selectJob(db: Database, jobId: string): BackgroundKnowledgeJob | null {
  const row = db.query("SELECT * FROM background_knowledge_jobs WHERE job_id = ?").get(jobId) as JobRow | null;
  return row ? job(row) : null;
}

function lifecyclePayload(value: BackgroundKnowledgeJob, from: string, to: string, extra: JsonObject = {}): JsonObject {
  return {
    from_status: from, to_status: to, sync_id: null, execution_class: value.executionClass,
    source_class: value.sourceClass, provenance: value.provenance, source_kind: value.sourceKind,
    source_id: value.sourceId, ...extra,
  };
}

function transition(store: StateStore, current: BackgroundKnowledgeJob, input: {
  eventType: "knowledge.job_processing" | "knowledge.job_waiting" | "knowledge.job_succeeded" | "knowledge.job_failed";
  to: BackgroundKnowledgeJobStatus; actor: "operator" | "runner"; leaseId?: string | null; leaseExpiresAt?: string | null;
  nextAttemptAt?: string | null; digest?: string | null; error?: string | null; publishedProvenance?: Record<string, unknown> | null;
  extra?: JsonObject;
}): BackgroundKnowledgeJob {
  return immediateTransaction(store.db, () => {
    const fresh = selectJob(store.db, current.jobId);
    if (!fresh || fresh.revision !== current.revision) throw new Error(`Stale background knowledge job revision ${current.revision} for ${current.jobId}`);
    if (fresh.status === "processing" && current.leaseId && fresh.leaseId !== current.leaseId) throw new Error(`Stale background knowledge lease for ${current.jobId}`);
    const occurredAt = now();
    const event = appendProjectEvent(store.db, {
      eventType: input.eventType, projectId: fresh.projectId, subjectKind: "knowledge_job", subjectId: fresh.jobId,
      correlationId: fresh.jobId, causationId: fresh.causedByEventId, traceId: fresh.traceId, ...eventSpan(), actor: input.actor,
      occurredAt, payload: lifecyclePayload(fresh, fresh.status, input.to, input.extra),
    });
    const result = store.db.query(`UPDATE background_knowledge_jobs SET status = ?, revision = revision + 1,
      lease_id = ?, lease_expires_at = ?, next_attempt_at = ?, published_digest = COALESCE(?, published_digest), error_json = ?,
      publication_provenance_json = COALESCE(?, publication_provenance_json), caused_by_event_id = ?, updated_at = ?,
      completed_at = CASE WHEN ? IN ('succeeded','cancelled') THEN ? ELSE completed_at END
      WHERE job_id = ? AND revision = ?`).run(input.to, input.leaseId ?? null, input.leaseExpiresAt ?? null,
      input.nextAttemptAt ?? null, input.digest ?? null, input.error ? JSON.stringify({ message: input.error }) : null,
      input.publishedProvenance ? JSON.stringify(input.publishedProvenance) : null, event.eventId, occurredAt,
      input.to, occurredAt,
      fresh.jobId, fresh.revision);
    if (result.changes !== 1) throw new Error(`Background knowledge CAS failed for ${fresh.jobId}`);
    return selectJob(store.db, fresh.jobId)!;
  });
}

function enqueueWorkerInTransaction(store: StateStore, workerStateId: string): BackgroundKnowledgeJob {
  const existing = store.db.query("SELECT * FROM background_knowledge_jobs WHERE worker_state_id = ?").get(workerStateId) as JobRow | null;
  if (existing) return job(existing);
  const source = store.db.query(`SELECT ws.id AS worker_state_id, ws.run_id, ws.lifecycle_status, ws.ended_at,
    r.project_id, r.trace_id, r.caused_by_event_id FROM worker_state ws JOIN runs r ON r.id = ws.run_id WHERE ws.id = ?`).get(workerStateId) as
    { worker_state_id: string; run_id: string; lifecycle_status: string; ended_at: string | null; project_id: string | null; trace_id: string | null; caused_by_event_id: string | null } | null;
  if (!source || source.ended_at === null) throw new Error(`Completed worker state not found: ${workerStateId}`);
  const projectId = source.project_id ?? "melee";
  const traceId = source.trace_id ?? `trace-knowledge-${projectId}`;
  const createdAt = source.ended_at;
  const id = `knowledge-job-worker-${workerStateId}`;
  const provenance = { worker_state_id: workerStateId, run_id: source.run_id, lifecycle_status: source.lifecycle_status };
  const event = appendProjectEvent(store.db, {
    eventType: "knowledge.job_enqueued", projectId, subjectKind: "knowledge_job", subjectId: id,
    correlationId: id, causationId: source.caused_by_event_id ?? id, traceId, ...eventSpan(), actor: "runner", occurredAt: createdAt,
    payload: { source_class: "worker_result", provenance, execution_class: "background_safe" },
  });
  store.db.query(`INSERT INTO background_knowledge_jobs (job_id, worker_state_id, project_id, run_id, revision, status, attempts,
    next_attempt_at, lease_id, lease_expires_at, execution_class, source_kind, source_id,
    evidence_provenance_json, publication_provenance_json, published_digest, error_json, trace_id, caused_by_event_id,
    blockers_json, created_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, 0, 'queued', 0, NULL, NULL, NULL, 'background_safe', 'worker_state', ?, ?, NULL, NULL, NULL, ?, ?, '[]', ?, ?, NULL)
    ON CONFLICT(worker_state_id) DO NOTHING`).run(id, workerStateId, projectId, source.run_id, workerStateId, JSON.stringify(provenance), traceId, event.eventId, createdAt, createdAt);
  return job((store.db.query("SELECT * FROM background_knowledge_jobs WHERE worker_state_id = ?").get(workerStateId) as JobRow));
}

/** Enqueue completed immutable worker evidence; nested callers participate in their transaction. */
export function enqueueBackgroundKnowledgeForWorker(store: StateStore, workerStateId: string): BackgroundKnowledgeJob {
  return immediateTransaction(store.db, () => enqueueWorkerInTransaction(store, workerStateId));
}

/** Idempotently discovers worker states completed before the queue existed. */
export function catchUpBackgroundKnowledge(store: StateStore, projectId?: string): number {
  return immediateTransaction(store.db, () => {
    const rows = store.db.query(`SELECT ws.id FROM worker_state ws JOIN runs r ON r.id = ws.run_id
      LEFT JOIN background_knowledge_jobs j ON j.worker_state_id = ws.id
      WHERE ws.ended_at IS NOT NULL AND j.job_id IS NULL AND (? IS NULL OR COALESCE(r.project_id, 'melee') = ?)
      ORDER BY ws.ended_at, ws.id`).all(projectId ?? null, projectId ?? null) as Array<{ id: string }>;
    for (const row of rows) enqueueBackgroundKnowledgeForWorker(store, row.id);
    return rows.length;
  });
}

export function claimBackgroundKnowledge(store: StateStore, options: { actor?: "operator" | "runner"; leaseMs?: number; at?: string } = {}): BackgroundKnowledgeJob | null {
  const at = options.at ?? now();
  return immediateTransaction(store.db, () => {
    const row = store.db.query(`SELECT * FROM background_knowledge_jobs WHERE execution_class = 'background_safe'
      AND ((status IN ('queued','waiting') AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
        OR (status = 'processing' AND lease_expires_at <= ?)) ORDER BY created_at, job_id LIMIT 1`).get(at, at) as JobRow | null;
    if (!row) return null;
    let current = job(row);
    if (current.status === "processing") {
      current = transition(store, current, { eventType: "knowledge.job_waiting", to: "waiting", actor: options.actor ?? "runner",
        nextAttemptAt: at, error: "processing lease expired", extra: { reason: "lease_expired" } });
    }
    const leaseId = `lease-${randomUUID()}`;
    const expires = new Date(Date.parse(at) + (options.leaseMs ?? 60_000)).toISOString();
    store.db.query("UPDATE background_knowledge_jobs SET attempts = attempts + 1 WHERE job_id = ? AND revision = ?").run(current.jobId, current.revision);
    return transition(store, current, { eventType: "knowledge.job_processing", to: "processing", actor: options.actor ?? "runner",
      leaseId, leaseExpiresAt: expires, extra: {} });
  });
}

export async function processBackgroundKnowledge(store: StateStore, processor: BackgroundKnowledgeProcessor, options: { actor?: "operator" | "runner"; leaseMs?: number } = {}): Promise<ProcessBackgroundKnowledgeResult> {
  const claimed = claimBackgroundKnowledge(store, options);
  if (!claimed) return { outcome: "empty", jobId: null, revision: null };
  try {
    const publication = claimed.digest && claimed.publishedProvenance ? { digest: claimed.digest, provenance: claimed.publishedProvenance } : await processor(claimed);
    const done = transition(store, claimed, { eventType: "knowledge.job_succeeded", to: "succeeded", actor: options.actor ?? "runner",
      digest: publication.digest, publishedProvenance: publication.provenance, extra: { staged_digest: publication.digest } });
    return { outcome: "succeeded", jobId: done.jobId, revision: done.revision, digest: publication.digest };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const owned = selectJob(store.db, claimed.jobId);
    if (!owned || owned.status !== "processing" || owned.leaseId !== claimed.leaseId) {
      return { outcome: "leased", jobId: claimed.jobId, revision: owned?.revision ?? claimed.revision, error: message };
    }
    const retryAt = new Date(Date.now() + Math.min(300_000, 1_000 * 2 ** Math.min(claimed.attempts, 8))).toISOString();
    const failed = transition(store, claimed, { eventType: "knowledge.job_failed", to: "failed", actor: options.actor ?? "runner", error: message, extra: { error: message } });
    const waiting = transition(store, failed, { eventType: "knowledge.job_waiting", to: "waiting", actor: options.actor ?? "runner", nextAttemptAt: retryAt, error: message, extra: { reason: "retry_backoff" } });
    return { outcome: "failed", jobId: waiting.jobId, revision: waiting.revision, error: message };
  }
}

/** Operator `knowledge.process` entry point; it intentionally shares the automatic claim seam. */
export function triggerBackgroundKnowledgeProcess(store: StateStore, processor: BackgroundKnowledgeProcessor): Promise<ProcessBackgroundKnowledgeResult> {
  return processBackgroundKnowledge(store, processor, { actor: "operator" });
}

export function queryBackgroundKnowledgeSummary(store: StateStore, projectId: string): BackgroundKnowledgeSummary {
  const counts = Object.fromEntries((store.db.query("SELECT status, COUNT(*) count FROM background_knowledge_jobs WHERE project_id = ? GROUP BY status").all(projectId) as Array<{status:string;count:number}>).map(r => [r.status, Number(r.count)]));
  const oldest = store.db.query("SELECT MIN(created_at) value FROM background_knowledge_jobs WHERE project_id = ? AND status IN ('queued','processing','waiting','failed')").get(projectId) as {value:string|null};
  const lease = store.db.query("SELECT lease_id, lease_expires_at FROM background_knowledge_jobs WHERE project_id = ? AND status = 'processing' ORDER BY updated_at LIMIT 1").get(projectId) as {lease_id:string;lease_expires_at:string}|null;
  const retry = store.db.query("SELECT next_attempt_at, attempts FROM background_knowledge_jobs WHERE project_id = ? AND status = 'waiting' ORDER BY next_attempt_at LIMIT 1").get(projectId) as {next_attempt_at:string;attempts:number}|null;
  const failures = store.db.query("SELECT job_id, worker_state_id, error_json, attempts, updated_at FROM background_knowledge_jobs WHERE project_id = ? AND error_json IS NOT NULL ORDER BY updated_at DESC LIMIT 5").all(projectId) as Array<{job_id:string;worker_state_id:string;error_json:string;attempts:number;updated_at:string}>;
  const revision = store.db.query("SELECT revision FROM knowledge_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT 1").get(projectId) as {revision:number}|null;
  return { publishedRevision: revision ? `knowledge-${Number(revision.revision)}` : null, queued: counts.queued ?? 0, processing: counts.processing ?? 0, waiting: counts.waiting ?? 0, failed: counts.failed ?? 0,
    oldestPendingAt: oldest.value, activeLease: lease ? { id: lease.lease_id, expiresAt: lease.lease_expires_at } : null,
    retry: retry ? { nextAttemptAt: retry.next_attempt_at, attempts: retry.attempts } : null,
    recentFailures: failures.map(r => ({jobId:r.job_id,workerStateId:r.worker_state_id,error:(objectJson(r.error_json)?.message as string | undefined) ?? r.error_json,attempts:r.attempts,updatedAt:r.updated_at})) };
}

export function startBackgroundKnowledgeProcessor(store: StateStore, processor: BackgroundKnowledgeProcessor, options: { intervalMs?: number } = {}): () => Promise<void> {
  catchUpBackgroundKnowledge(store);
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null; let active: Promise<void> | null = null;
  const tick = () => { if (stopped || active) return; active = processBackgroundKnowledge(store, processor).then(() => undefined).finally(() => {
    active = null; if (!stopped) timer = setTimeout(tick, options.intervalMs ?? 1_000);
  }); };
  tick();
  return async () => { stopped = true; if (timer) clearTimeout(timer); if (active) await active; };
}
