import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import type { Database } from "bun:sqlite";
import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import type { EventActor, JsonObject, JsonValue } from "@server/core/harness-state/events.js";
import { requireLease } from "@server/core/harness-state/lease.js";
import { runDispatchLeaseStaleness } from "@server/core/cycle-runtime/phases/running/run-control.js";
import { syncStagingPaths } from "./git.js";
import {
  appendSyncKnowledgeEventInTransaction,
  getSyncState,
  syncActionSpanId,
  transitionSync,
} from "./state.js";
import type { SyncState } from "./types.js";

export const SYNC_KNOWLEDGE_JOB_STATUSES = [
  "queued",
  "processing",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type SyncKnowledgeJobStatus = (typeof SYNC_KNOWLEDGE_JOB_STATUSES)[number];
export type SyncKnowledgeSourceKind = "merged_pr" | "corpus";

export interface SyncKnowledgeJob {
  jobId: string;
  syncId: string;
  gameId: string;
  sourceKind: SyncKnowledgeSourceKind;
  sourceId: string;
  revision: number;
  status: SyncKnowledgeJobStatus;
  provenance: JsonObject;
  stagedArtifactPath: string | null;
  stagedDigest: string | null;
  causedByEventId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueSyncKnowledgeJobsInput {
  syncId: string;
  commandId: string;
  actor?: EventActor;
  spanId?: string;
  occurredAt?: string;
  provenance?: Partial<Record<SyncKnowledgeSourceKind, Record<string, JsonObject>>>;
}

export interface SyncKnowledgeProcessorContext {
  artifactDirectory: string;
  job: SyncKnowledgeJob;
  knowledgeRoot: string;
  syncId: string;
}

/**
 * Adapter boundary for the existing merged-PR and corpus intake machinery.
 * Implementations return JSON instead of writing canonical knowledge. The
 * sync owner persists that JSON below its staging root.
 */
export interface SyncKnowledgeProcessors {
  processMergedPr: (context: SyncKnowledgeProcessorContext) => Promise<JsonValue>;
  processCorpus: (context: SyncKnowledgeProcessorContext) => Promise<JsonValue>;
}

export interface SyncKnowledgeArtifact {
  job_id: string;
  source_kind: SyncKnowledgeSourceKind;
  source_id: string;
  provenance: JsonObject;
  artifact_path: string;
  digest: string;
}

export interface SyncKnowledgeManifest {
  schema_version: 1;
  sync_id: string;
  game_id: string;
  knowledge_only: boolean;
  accepted_job_ids: string[];
  artifacts: SyncKnowledgeArtifact[];
  digest: string;
}

export interface StageSyncKnowledgeInput {
  store: StateStore;
  stateDir: string;
  syncId: string;
  processors: SyncKnowledgeProcessors;
  revalidateOwnership: () => void;
  actor?: EventActor;
  commandId: string;
  spanId?: string;
  now?: () => string;
}

export interface CompleteSyncKnowledgeIngestInput extends StageSyncKnowledgeInput {
  expectedRevision: number;
  commandId: string;
  actor?: EventActor;
  spanId?: string;
  provenance?: EnqueueSyncKnowledgeJobsInput["provenance"];
}

export interface CancelSyncKnowledgeJobsInput {
  syncId: string;
  commandId: string;
  reason: string;
  actor?: EventActor;
  spanId?: string;
  occurredAt?: string;
}

export interface WaitSyncKnowledgeJobsForRecoveryInput {
  syncId: string;
  commandId: string;
  reason: string;
  actor?: EventActor;
  spanId?: string;
  occurredAt?: string;
  requeueSucceeded?: boolean;
}

export interface RecoverConfirmedOrphanKnowledgeIngestInput {
  syncId: string;
  expectedRevision: number;
  leaseId: string;
  commandId: string;
  reason: string;
  stateDir: string;
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  now?: Date | number | string;
  occurredAt?: string;
}

export interface CompletedSyncKnowledgeIngest {
  manifest: SyncKnowledgeManifest;
  sync: SyncState;
}

export interface PublishSyncKnowledgeInput {
  syncId: string;
  gameId: string;
  manifest: SyncKnowledgeManifest;
  actor: EventActor;
  commandId: string;
  correlationId: string;
  traceId: string;
  spanId: string;
  occurredAt?: string;
}

export interface PublishedKnowledgeRevision {
  revision: number;
  revisionId: string;
  oldRevisionId: string;
  digest: string;
  acceptedJobIds: string[];
  causedByEventId: string;
  createdAt: string;
  idempotent: boolean;
}

export interface CanonicalKnowledgeRevision {
  revision: number;
  revisionId: string;
  gameId: string;
  digest: string;
  syncId: string | null;
  causedByEventId: string;
  createdAt: string;
}

export interface CanonicalSyncKnowledgeArtifact {
  revisionId: string;
  syncId: string;
  jobId: string;
  sourceKind: SyncKnowledgeSourceKind;
  sourceId: string;
  provenance: JsonObject;
  digest: string;
  artifactPath: string;
  content: JsonValue;
}

export interface CanonicalSyncKnowledgeSnapshot {
  revision: CanonicalKnowledgeRevision;
  artifacts: CanonicalSyncKnowledgeArtifact[];
}

type SyncKnowledgeJobRow = {
  job_id: string;
  sync_id: string;
  game_id: string;
  source_kind: string;
  source_id: string;
  revision: number;
  status: string;
  provenance_json: string;
  staged_artifact_path: string | null;
  staged_digest: string | null;
  caused_by_event_id: string;
  created_at: string;
  updated_at: string;
};

type KnowledgeRevisionRow = {
  revision: number;
  game_id: string;
  digest: string;
  sync_id: string | null;
  caused_by_event_id: string;
  created_at: string;
};

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isJobStatus(value: string): value is SyncKnowledgeJobStatus {
  return (SYNC_KNOWLEDGE_JOB_STATUSES as readonly string[]).includes(value);
}

function isSourceKind(value: string): value is SyncKnowledgeSourceKind {
  return value === "merged_pr" || value === "corpus";
}

function parsedObject(value: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON`, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${label} JSON: expected an object`);
  }
  return parsed as JsonObject;
}

function rowToJob(row: SyncKnowledgeJobRow): SyncKnowledgeJob {
  if (!isSourceKind(row.source_kind)) {
    throw new Error(`Invalid sync knowledge source kind: ${row.source_kind}`);
  }
  if (!isJobStatus(row.status)) {
    throw new Error(`Invalid sync knowledge job status: ${row.status}`);
  }
  return {
    jobId: row.job_id,
    syncId: row.sync_id,
    gameId: row.game_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    revision: Number(row.revision),
    status: row.status,
    provenance: parsedObject(row.provenance_json, "sync knowledge provenance"),
    stagedArtifactPath: row.staged_artifact_path,
    stagedDigest: row.staged_digest,
    causedByEventId: row.caused_by_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCanonicalRevision(row: KnowledgeRevisionRow): CanonicalKnowledgeRevision {
  return {
    revision: Number(row.revision),
    revisionId: `knowledge-${Number(row.revision)}`,
    gameId: row.game_id,
    digest: row.digest,
    syncId: row.sync_id,
    causedByEventId: row.caused_by_event_id,
    createdAt: row.created_at,
  };
}

/** The canonical knowledge generation visible to new runs and queries. */
export function latestPublishedKnowledgeRevision(
  db: Database,
  gameId: string,
): CanonicalKnowledgeRevision | null {
  const row = db
    .query("SELECT * FROM knowledge_revisions WHERE game_id = ? ORDER BY revision DESC LIMIT 1")
    .get(requiredText(gameId, "gameId")) as KnowledgeRevisionRow | null;
  return row ? rowToCanonicalRevision(row) : null;
}

function canonicalValue(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Staged knowledge cannot contain a non-finite number");
    }
    return value;
  }
  if (!value || typeof value !== "object") {
    throw new Error(`Staged knowledge contains a non-JSON ${typeof value} value`);
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

export function canonicalSyncKnowledgeJson(value: unknown): string {
  return `${JSON.stringify(canonicalValue(value))}\n`;
}

function digestBytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicJobId(syncId: string, sourceKind: SyncKnowledgeSourceKind, sourceId: string): string {
  const suffix = digestBytes(`${syncId}\0${sourceKind}\0${sourceId}`).slice(0, 32);
  return `knowledge-job-${suffix}`;
}

function defaultProvenance(sourceKind: SyncKnowledgeSourceKind, sourceId: string): JsonObject {
  return sourceKind === "merged_pr"
    ? { merged_pr_id: sourceId }
    : { corpus_batch_id: sourceId };
}

function sourceProvenance(
  input: EnqueueSyncKnowledgeJobsInput,
  sourceKind: SyncKnowledgeSourceKind,
  sourceId: string,
): JsonObject {
  return input.provenance?.[sourceKind]?.[sourceId] ?? defaultProvenance(sourceKind, sourceId);
}

function selectJob(db: Database, jobId: string): SyncKnowledgeJob | null {
  const row = db.query("SELECT * FROM sync_knowledge_jobs WHERE job_id = ?").get(jobId) as SyncKnowledgeJobRow | null;
  return row ? rowToJob(row) : null;
}

export function listSyncKnowledgeJobs(db: Database, syncId: string): SyncKnowledgeJob[] {
  const rows = db
    .query(
      `SELECT * FROM sync_knowledge_jobs
       WHERE sync_id = ?
       ORDER BY source_kind, source_id, job_id`,
    )
    .all(requiredText(syncId, "syncId")) as SyncKnowledgeJobRow[];
  return rows.map(rowToJob);
}

/**
 * Durably derives one sync_stage job from each intake source. Every new row
 * and its knowledge.job_enqueued fact commit in the same transaction.
 * Repeating an identical enqueue is idempotent and emits no duplicate event.
 */
export function enqueueSyncKnowledgeJobs(
  store: StateStore,
  input: EnqueueSyncKnowledgeJobsInput,
): SyncKnowledgeJob[] {
  return immediateTransaction(store.db, () => {
    const syncId = requiredText(input.syncId, "syncId");
    const commandId = requiredText(input.commandId, "commandId");
    const sync = getSyncState(store, syncId);
    if (!sync) throw new Error(`Sync not found: ${syncId}`);
    if (sync.status !== "ingesting") {
      throw new Error(`Sync knowledge jobs can be enqueued only while ingesting; ${syncId} is ${sync.status}`);
    }
    const sources = [
      ...sync.intake.merged_pr_ids.map((sourceId) => ({ sourceKind: "merged_pr" as const, sourceId })),
      ...sync.intake.corpus_batch_ids.map((sourceId) => ({ sourceKind: "corpus" as const, sourceId })),
    ].sort((left, right) =>
      left.sourceKind.localeCompare(right.sourceKind) || left.sourceId.localeCompare(right.sourceId),
    );
    const now = input.occurredAt ?? new Date().toISOString();
    for (const source of sources) {
      const sourceId = requiredText(source.sourceId, `${source.sourceKind} source id`);
      const jobId = deterministicJobId(syncId, source.sourceKind, sourceId);
      const provenance = sourceProvenance(input, source.sourceKind, sourceId);
      const existing = selectJob(store.db, jobId);
      if (existing) {
        if (
          existing.syncId !== syncId ||
          existing.gameId !== sync.game_id ||
          existing.sourceKind !== source.sourceKind ||
          existing.sourceId !== sourceId ||
          canonicalSyncKnowledgeJson(existing.provenance) !== canonicalSyncKnowledgeJson(provenance)
        ) {
          throw new Error(`Sync knowledge job identity collision: ${jobId}`);
        }
        continue;
      }
      const event = appendSyncKnowledgeEventInTransaction(store.db, {
        eventType: "knowledge.job_enqueued",
        gameId: sync.game_id,
        subjectId: jobId,
        traceId: sync.trace_id,
        actor: input.actor ?? "runner",
        causationId: commandId,
        correlationId: sync.sync_id,
        spanId: input.spanId ?? syncActionSpanId(commandId),
        occurredAt: now,
        payload: {
          source_class: "sync_stage",
          provenance: {
            ...provenance,
            sync_id: sync.sync_id,
            source_kind: source.sourceKind,
            source_id: sourceId,
          },
          execution_class: "sync_stage",
        },
      });
      store.db.query(
        `INSERT INTO sync_knowledge_jobs (
           job_id, sync_id, game_id, source_kind, source_id, revision, status,
           provenance_json, caused_by_event_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 0, 'queued', ?, ?, ?, ?)`,
      ).run(
        jobId,
        sync.sync_id,
        sync.game_id,
        source.sourceKind,
        sourceId,
        canonicalSyncKnowledgeJson(provenance).trimEnd(),
        event.eventId,
        now,
        now,
      );
    }
    return listSyncKnowledgeJobs(store.db, syncId);
  });
}

export function syncKnowledgeRoot(stateDir: string, syncId: string): string {
  return resolve(syncStagingPaths(stateDir, syncId).root, "knowledge");
}

export function syncKnowledgeManifestPath(stateDir: string, syncId: string): string {
  return resolve(syncKnowledgeRoot(stateDir, syncId), "manifest.json");
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate));
  return child !== "" && !child.startsWith("..") && !child.startsWith("/");
}

function artifactPathForJob(knowledgeRoot: string, job: SyncKnowledgeJob): string {
  return resolve(knowledgeRoot, "artifacts", `${job.sourceKind}-${digestBytes(job.sourceId).slice(0, 24)}.json`);
}

function writeAtomically(path: string, content: string): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${digestBytes(content).slice(0, 16)}`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function transitionJob(input: {
  db: Database;
  sync: SyncState;
  job: SyncKnowledgeJob;
  nextStatus: "processing" | "waiting" | "succeeded" | "failed" | "cancelled";
  eventType: "knowledge.job_processing" | "knowledge.job_waiting" | "knowledge.job_succeeded" | "knowledge.job_failed" | "knowledge.job_cancelled";
  commandId: string;
  correlationId: string;
  spanId: string;
  actor: EventActor;
  occurredAt: string;
  artifactPath?: string | null;
  digest?: string | null;
  error?: string;
  reason?: string;
}): SyncKnowledgeJob {
  const expectedStatuses: SyncKnowledgeJobStatus[] = input.nextStatus === "processing"
    ? ["queued", "waiting"]
    : input.nextStatus === "waiting"
      ? ["processing", "succeeded", "failed"]
    : input.nextStatus === "cancelled"
      ? ["queued", "processing", "waiting", "succeeded", "failed"]
      : ["processing"];
  if (!expectedStatuses.includes(input.job.status)) {
    throw new Error(`Knowledge job ${input.job.jobId} cannot advance ${input.job.status} -> ${input.nextStatus}`);
  }
  const context = {
    gameId: input.sync.game_id,
    subjectId: input.job.jobId,
    traceId: input.sync.trace_id,
    actor: input.actor,
    causationId: input.job.causedByEventId,
    correlationId: input.correlationId,
    spanId: input.spanId,
    occurredAt: input.occurredAt,
  };
  const source = {
    sync_id: input.job.syncId,
    execution_class: "sync_stage" as const,
    source_class: "sync_stage" as const,
    provenance: input.job.provenance,
    source_kind: input.job.sourceKind,
    source_id: input.job.sourceId,
  };
  const event = input.eventType === "knowledge.job_processing"
    ? appendSyncKnowledgeEventInTransaction(input.db, {
        ...context,
        eventType: input.eventType,
        payload: {
          ...source,
          from_status: input.job.status as "queued" | "waiting",
          to_status: "processing",
        },
      })
    : input.eventType === "knowledge.job_waiting"
      ? appendSyncKnowledgeEventInTransaction(input.db, {
          ...context,
          eventType: input.eventType,
          payload: {
            ...source,
            from_status: input.job.status as "processing" | "succeeded" | "failed",
            to_status: "waiting",
            reason: requiredText(input.reason ?? "", "reason"),
          },
        })
    : input.eventType === "knowledge.job_succeeded"
      ? appendSyncKnowledgeEventInTransaction(input.db, {
          ...context,
          eventType: input.eventType,
          payload: {
              ...source,
              from_status: "processing",
              to_status: "succeeded",
            staged_digest: requiredText(input.digest ?? "", "staged_digest"),
          },
        })
      : input.eventType === "knowledge.job_failed"
        ? appendSyncKnowledgeEventInTransaction(input.db, {
            ...context,
            eventType: input.eventType,
            payload: {
              ...source,
              from_status: "processing",
              to_status: "failed",
              error: requiredText(input.error ?? "", "error"),
            },
          })
        : appendSyncKnowledgeEventInTransaction(input.db, {
          ...context,
          eventType: input.eventType,
          payload: {
            ...source,
            from_status: input.job.status as Exclude<SyncKnowledgeJobStatus, "cancelled">,
            to_status: "cancelled",
            reason: requiredText(input.reason ?? "", "reason"),
          },
        });
  const result = input.db.query(
    `UPDATE sync_knowledge_jobs
     SET revision = revision + 1,
         status = ?, staged_artifact_path = ?, staged_digest = ?,
         caused_by_event_id = ?, updated_at = ?
     WHERE job_id = ? AND revision = ? AND status = ?`,
  ).run(
    input.nextStatus,
    input.artifactPath ?? null,
    input.digest ?? null,
    event.eventId,
    input.occurredAt,
    input.job.jobId,
    input.job.revision,
    input.job.status,
  );
  if (result.changes !== 1) {
    const current = selectJob(input.db, input.job.jobId);
    throw new Error(
      `Stale knowledge job revision ${input.job.revision} for ${input.job.jobId}; current revision is ${current?.revision ?? -1}`,
    );
  }
  return selectJob(input.db, input.job.jobId)!;
}

/** Cancels every still-live job before its staging artifacts are discarded. */
export function cancelSyncKnowledgeJobs(
  store: StateStore,
  input: CancelSyncKnowledgeJobsInput,
): SyncKnowledgeJob[] {
  return immediateTransaction(store.db, () => {
    const syncId = requiredText(input.syncId, "syncId");
    const sync = getSyncState(store, syncId);
    if (!sync) throw new Error(`Sync not found: ${syncId}`);
    if (sync.status === "published" || sync.status === "cancelled" || sync.status === "publishing") {
      throw new Error(`Knowledge jobs cannot be cancelled while sync ${syncId} is ${sync.status}`);
    }
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    for (const job of listSyncKnowledgeJobs(store.db, syncId)) {
      if (job.status === "cancelled") continue;
      transitionJob({
        db: store.db,
        sync,
        job,
        nextStatus: "cancelled",
        eventType: "knowledge.job_cancelled",
        commandId: requiredText(input.commandId, "commandId"),
        correlationId: sync.sync_id,
        spanId: input.spanId ?? syncActionSpanId(input.commandId),
        actor: input.actor ?? "operator",
        occurredAt,
        reason: input.reason,
      });
    }
    return listSyncKnowledgeJobs(store.db, syncId);
  });
}

function waitSyncKnowledgeJobsForRecoveryInternal(
  store: StateStore,
  input: WaitSyncKnowledgeJobsForRecoveryInput,
  allowConfirmedOrphanIngest: boolean,
): SyncKnowledgeJob[] {
  return immediateTransaction(store.db, () => {
    const syncId = requiredText(input.syncId, "syncId");
    const sync = getSyncState(store, syncId);
    if (!sync) throw new Error(`Sync not found: ${syncId}`);
    if (sync.status !== "blocked" && !(allowConfirmedOrphanIngest && sync.status === "ingesting")) {
      throw new Error(`Knowledge job recovery requires blocked or confirmed-orphan ingesting sync; ${syncId} is ${sync.status}`);
    }
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    for (const job of listSyncKnowledgeJobs(store.db, syncId)) {
      if (
        job.status !== "processing" &&
        job.status !== "failed" &&
        !(input.requeueSucceeded && job.status === "succeeded")
      ) continue;
      transitionJob({
        db: store.db,
        sync,
        job,
        nextStatus: "waiting",
        eventType: "knowledge.job_waiting",
        commandId: requiredText(input.commandId, "commandId"),
        correlationId: sync.sync_id,
        spanId: input.spanId ?? syncActionSpanId(input.commandId),
        actor: input.actor ?? "operator",
        occurredAt,
        reason: input.reason,
      });
    }
    return listSyncKnowledgeJobs(store.db, syncId);
  });
}

/** Moves interrupted/failed work to a retryable durable state for an already-blocked sync. */
export function waitSyncKnowledgeJobsForRecovery(
  store: StateStore,
  input: WaitSyncKnowledgeJobsForRecoveryInput,
): SyncKnowledgeJob[] {
  return waitSyncKnowledgeJobsForRecoveryInternal(store, input, false);
}

/**
 * Requeues crash-left ingest work and records the safe ingest stage in one
 * transaction, only after the slice-2 three-valued liveness check proves the
 * matching active sync lease stale and its managed process not live.
 */
export function recoverConfirmedOrphanKnowledgeIngest(
  store: StateStore,
  input: RecoverConfirmedOrphanKnowledgeIngestInput,
): SyncState {
  return immediateTransaction(store.db, () => {
    const syncId = requiredText(input.syncId, "syncId");
    const sync = getSyncState(store, syncId);
    if (!sync) throw new Error(`Sync not found: ${syncId}`);
    if (sync.revision !== input.expectedRevision) {
      throw new Error(`Stale sync revision ${input.expectedRevision} for ${syncId}; current revision is ${sync.revision}`);
    }
    if (sync.status !== "ingesting") {
      throw new Error(`Confirmed-orphan knowledge recovery requires ingesting; ${syncId} is ${sync.status}`);
    }
    const lease = requireLease(store, requiredText(input.leaseId, "leaseId"), sync.game_id);
    if (
      lease.kind !== "sync" ||
      lease.workflow_id !== sync.sync_id ||
      lease.status !== "active"
    ) {
      throw new Error(`Confirmed-orphan recovery requires the matching active sync lease for ${sync.sync_id}`);
    }
    const evidence = runDispatchLeaseStaleness({
      hasActiveProcess: input.hasActiveProcess,
      lease,
      now: input.now,
      stateDir: input.stateDir,
    });
    if (evidence === "process_liveness_unknown") {
      throw new Error(`Sync ${sync.sync_id} process liveness could not be determined`);
    }
    if (evidence !== "stale") {
      throw new Error(`Sync ${sync.sync_id} dispatch lease is not stale or its process is still live`);
    }
    if (!listSyncKnowledgeJobs(store.db, sync.sync_id).some((job) => job.status === "processing")) {
      throw new Error(`Sync ${sync.sync_id} has no crash-left processing knowledge job`);
    }
    waitSyncKnowledgeJobsForRecoveryInternal(store, {
      syncId: sync.sync_id,
      commandId: requiredText(input.commandId, "commandId"),
      reason: requiredText(input.reason, "reason"),
      occurredAt: input.occurredAt,
    }, true);
    return transitionSync(store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      eventType: "sync.recovered",
      expectedRevision: sync.revision,
      occurredAt: input.occurredAt,
      patch: { status: "ingesting", blockers: [] },
      payload: {
        staging_preserved: true,
        staging_discarded: false,
        resume_stage: "ingesting",
        recovery_reason: input.reason,
        recovery_path: "confirmed_orphan",
        process_liveness: "not_live",
        lease_staleness: "stale",
      },
    });
  });
}

function verifySucceededArtifact(knowledgeRoot: string, job: SyncKnowledgeJob): SyncKnowledgeArtifact {
  if (!job.stagedArtifactPath || !job.stagedDigest) {
    throw new Error(`Succeeded knowledge job ${job.jobId} has no staged artifact and digest`);
  }
  if (!isWithin(knowledgeRoot, job.stagedArtifactPath)) {
    throw new Error(`Knowledge job ${job.jobId} artifact escapes its sync staging root`);
  }
  if (!existsSync(job.stagedArtifactPath)) {
    throw new Error(`Staged knowledge artifact is missing for ${job.jobId}: ${job.stagedArtifactPath}`);
  }
  const actualDigest = digestBytes(readFileSync(job.stagedArtifactPath));
  if (actualDigest !== job.stagedDigest) {
    throw new Error(`Staged knowledge artifact digest mismatch for ${job.jobId}`);
  }
  return {
    job_id: job.jobId,
    source_kind: job.sourceKind,
    source_id: job.sourceId,
    provenance: job.provenance,
    artifact_path: relative(knowledgeRoot, job.stagedArtifactPath),
    digest: job.stagedDigest,
  };
}

function manifestDigest(input: Omit<SyncKnowledgeManifest, "digest">): string {
  const revisionContent: JsonObject = {
    schema_version: input.schema_version,
    game_id: input.game_id,
    knowledge_only: input.knowledge_only,
    sources: input.artifacts.map((artifact) => ({
      source_kind: artifact.source_kind,
      source_id: artifact.source_id,
      provenance: artifact.provenance,
      artifact_digest: artifact.digest,
    })),
  };
  return digestBytes(canonicalSyncKnowledgeJson(revisionContent));
}

export function readSyncKnowledgeManifest(stateDir: string, syncId: string): SyncKnowledgeManifest {
  const path = syncKnowledgeManifestPath(stateDir, syncId);
  if (!existsSync(path)) throw new Error(`Staged knowledge manifest is missing: ${path}`);
  const parsed = parsedObject(readFileSync(path, "utf8"), "sync knowledge manifest") as unknown as SyncKnowledgeManifest;
  if (
    typeof parsed.game_id !== "string" ||
    typeof parsed.knowledge_only !== "boolean" ||
    !Array.isArray(parsed.accepted_job_ids) ||
    parsed.accepted_job_ids.some((jobId) => typeof jobId !== "string" || !jobId.trim()) ||
    !Array.isArray(parsed.artifacts) ||
    typeof parsed.digest !== "string"
  ) {
    throw new Error(`Staged knowledge manifest has an invalid shape for ${syncId}`);
  }
  const withoutDigest: Omit<SyncKnowledgeManifest, "digest"> = {
    schema_version: parsed.schema_version,
    sync_id: parsed.sync_id,
    game_id: parsed.game_id,
    knowledge_only: parsed.knowledge_only,
    accepted_job_ids: parsed.accepted_job_ids,
    artifacts: parsed.artifacts,
  };
  if (parsed.sync_id !== syncId || parsed.schema_version !== 1) {
    throw new Error(`Staged knowledge manifest does not belong to ${syncId}`);
  }
  if (manifestDigest(withoutDigest) !== parsed.digest) {
    throw new Error(`Staged knowledge manifest digest mismatch for ${syncId}`);
  }
  const knowledgeRoot = syncKnowledgeRoot(stateDir, syncId);
  for (const artifact of parsed.artifacts) {
    if (
      !artifact ||
      typeof artifact !== "object" ||
      typeof artifact.artifact_path !== "string" ||
      typeof artifact.digest !== "string"
    ) {
      throw new Error(`Staged knowledge manifest has an invalid artifact for ${syncId}`);
    }
    const artifactPath = resolve(knowledgeRoot, artifact.artifact_path);
    if (!isWithin(knowledgeRoot, artifactPath) || !existsSync(artifactPath)) {
      throw new Error(`Staged knowledge manifest artifact is missing or escapes staging: ${artifact.artifact_path}`);
    }
    if (digestBytes(readFileSync(artifactPath)) !== artifact.digest) {
      throw new Error(`Staged knowledge manifest artifact digest mismatch: ${artifact.job_id}`);
    }
  }
  return parsed;
}

/**
 * Reads sync-stage knowledge through the latest committed revision pointer.
 * Staging alone is deliberately invisible. Inserting knowledge_revisions and
 * advancing the publication boundary in one transaction activates the exact
 * accepted manifest without a second mutable "active" flag.
 */
export function readCanonicalSyncKnowledge(
  store: StateStore,
  gameId: string,
): CanonicalSyncKnowledgeSnapshot | null {
  const revision = latestPublishedKnowledgeRevision(store.db, gameId);
  if (!revision) return null;
  if (!revision.syncId) return { revision, artifacts: [] };

  const manifest = readSyncKnowledgeManifest(store.stateDir, revision.syncId);
  if (manifest.game_id !== revision.gameId || manifest.digest !== revision.digest) {
    throw new Error(`Canonical knowledge manifest does not match ${revision.revisionId}`);
  }
  const jobs = listSyncKnowledgeJobs(store.db, revision.syncId);
  const jobsById = new Map(jobs.map((job) => [job.jobId, job]));
  const acceptedJobIds = [...manifest.accepted_job_ids].sort();
  if (
    new Set(acceptedJobIds).size !== acceptedJobIds.length ||
    canonicalSyncKnowledgeJson([...jobsById.keys()].sort()) !== canonicalSyncKnowledgeJson(acceptedJobIds)
  ) {
    throw new Error(`Canonical knowledge jobs do not match ${revision.revisionId}`);
  }

  const knowledgeRoot = syncKnowledgeRoot(store.stateDir, revision.syncId);
  const artifacts = [...manifest.artifacts]
    .sort((left, right) =>
      left.source_kind.localeCompare(right.source_kind) ||
      left.source_id.localeCompare(right.source_id) ||
      left.job_id.localeCompare(right.job_id),
    )
    .map((artifact): CanonicalSyncKnowledgeArtifact => {
      const job = jobsById.get(artifact.job_id);
      if (
        !job ||
        job.gameId !== revision.gameId ||
        job.status !== "succeeded" ||
        job.sourceKind !== artifact.source_kind ||
        job.sourceId !== artifact.source_id ||
        canonicalSyncKnowledgeJson(job.provenance) !== canonicalSyncKnowledgeJson(artifact.provenance) ||
        job.stagedDigest !== artifact.digest
      ) {
        throw new Error(`Canonical knowledge artifact is not accepted durable job ${artifact.job_id}`);
      }
      const artifactPath = resolve(knowledgeRoot, artifact.artifact_path);
      if (resolve(job.stagedArtifactPath ?? "") !== artifactPath) {
        throw new Error(`Canonical knowledge artifact path does not match durable job ${artifact.job_id}`);
      }
      let content: unknown;
      try {
        content = JSON.parse(readFileSync(artifactPath, "utf8")) as unknown;
      } catch (error) {
        throw new Error(`Canonical knowledge artifact is invalid JSON: ${artifact.job_id}`, { cause: error });
      }
      return {
        revisionId: revision.revisionId,
        syncId: revision.syncId!,
        jobId: artifact.job_id,
        sourceKind: artifact.source_kind,
        sourceId: artifact.source_id,
        provenance: artifact.provenance,
        digest: artifact.digest,
        artifactPath: artifact.artifact_path,
        content: canonicalValue(content),
      };
    });
  return { revision, artifacts };
}

/** Deterministic text query over the accepted artifacts of the active revision. */
export function queryCanonicalSyncKnowledge(
  store: StateStore,
  input: { gameId: string; query: string; limit?: number },
): CanonicalSyncKnowledgeArtifact[] {
  const query = requiredText(input.query, "query").toLocaleLowerCase();
  const terms = [...new Set(query.split(/[^a-z0-9_]+/u).filter(Boolean))];
  const limit = Math.max(1, Math.trunc(input.limit ?? 10));
  const snapshot = readCanonicalSyncKnowledge(store, input.gameId);
  if (!snapshot) return [];
  return snapshot.artifacts
    .filter((artifact) => {
      const searchable = canonicalSyncKnowledgeJson({
        source_kind: artifact.sourceKind,
        source_id: artifact.sourceId,
        provenance: artifact.provenance,
        content: artifact.content,
      }).toLocaleLowerCase();
      return searchable.includes(query) || terms.every((term) => searchable.includes(term));
    })
    .slice(0, limit);
}

/**
 * Processes queued jobs sequentially under sync ownership. Existing intake
 * code is injected through processors and can only return JSON; canonical
 * knowledge remains unchanged until the publication transaction accepts the
 * manifest digest.
 */
export async function stageSyncKnowledge(input: StageSyncKnowledgeInput): Promise<SyncKnowledgeManifest> {
  const sync = getSyncState(input.store, requiredText(input.syncId, "syncId"));
  if (!sync) throw new Error(`Sync not found: ${input.syncId}`);
  if (sync.status !== "ingesting") {
    throw new Error(`Sync knowledge can be staged only while ingesting; ${sync.sync_id} is ${sync.status}`);
  }
  input.revalidateOwnership();
  const knowledgeRoot = syncKnowledgeRoot(input.stateDir, sync.sync_id);
  mkdirSync(resolve(knowledgeRoot, "artifacts"), { recursive: true });
  const initialJobs = listSyncKnowledgeJobs(input.store.db, sync.sync_id);
  const expectedSources = sync.intake.merged_pr_ids.length + sync.intake.corpus_batch_ids.length;
  if (initialJobs.length !== expectedSources) {
    throw new Error(
      `Sync ${sync.sync_id} has ${initialJobs.length} durable knowledge job(s), expected ${expectedSources}`,
    );
  }

  for (const initial of initialJobs) {
    if (initial.status === "succeeded") {
      verifySucceededArtifact(knowledgeRoot, initial);
      continue;
    }
    if (initial.status === "processing") {
      throw new Error(`Knowledge job ${initial.jobId} was left processing; explicit sync recovery is required`);
    }
    if (initial.status !== "queued" && initial.status !== "waiting") {
      throw new Error(`Knowledge job ${initial.jobId} cannot be staged from ${initial.status}`);
    }
    const updatedAt = input.now?.() ?? new Date().toISOString();
    const commandId = requiredText(input.commandId, "commandId");
    const actor = input.actor ?? "runner";
    const correlationId = sync.sync_id;
    const spanId = input.spanId ?? syncActionSpanId(commandId);
    input.revalidateOwnership();
    const job = immediateTransaction(input.store.db, () =>
      transitionJob({
        db: input.store.db,
        sync,
        job: initial,
        nextStatus: "processing",
        eventType: "knowledge.job_processing",
        commandId,
        correlationId,
        spanId,
        actor,
        occurredAt: updatedAt,
      }));
    const artifactPath = artifactPathForJob(knowledgeRoot, job);
    try {
      const processor = job.sourceKind === "merged_pr"
        ? input.processors.processMergedPr
        : input.processors.processCorpus;
      const artifactDirectory = resolve(knowledgeRoot, "processor", job.jobId);
      mkdirSync(artifactDirectory, { recursive: true });
      const output = await processor({
        artifactDirectory,
        job,
        knowledgeRoot,
        syncId: sync.sync_id,
      });
      input.revalidateOwnership();
      const artifact: JsonObject = {
        schema_version: 1,
        source_class: "sync_stage",
        execution_class: "sync_stage",
        source_kind: job.sourceKind,
        source_id: job.sourceId,
        provenance: job.provenance,
        output,
      };
      const bytes = canonicalSyncKnowledgeJson(artifact);
      writeAtomically(artifactPath, bytes);
      const digest = digestBytes(bytes);
      immediateTransaction(input.store.db, () => {
        transitionJob({
          db: input.store.db,
          sync,
          job,
          nextStatus: "succeeded",
          eventType: "knowledge.job_succeeded",
          commandId,
          correlationId,
          spanId,
          actor,
          occurredAt: input.now?.() ?? new Date().toISOString(),
          artifactPath,
          digest,
        });
      });
    } catch (error) {
      if (existsSync(artifactPath)) rmSync(artifactPath, { force: true });
      immediateTransaction(input.store.db, () => {
        transitionJob({
          db: input.store.db,
          sync,
          job,
          nextStatus: "failed",
          eventType: "knowledge.job_failed",
          commandId,
          correlationId,
          spanId,
          actor,
          occurredAt: input.now?.() ?? new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
      });
      throw error;
    }
  }

  const jobs = listSyncKnowledgeJobs(input.store.db, sync.sync_id);
  const artifacts = jobs.map((job) => {
    if (job.status !== "succeeded") throw new Error(`Knowledge job ${job.jobId} is ${job.status}, not succeeded`);
    return verifySucceededArtifact(knowledgeRoot, job);
  });
  const withoutDigest: Omit<SyncKnowledgeManifest, "digest"> = {
    schema_version: 1,
    sync_id: sync.sync_id,
    game_id: sync.game_id,
    knowledge_only: sync.intake.knowledge_only,
    accepted_job_ids: jobs.map((job) => job.jobId),
    artifacts,
  };
  const manifest: SyncKnowledgeManifest = {
    ...withoutDigest,
    digest: manifestDigest(withoutDigest),
  };
  writeAtomically(syncKnowledgeManifestPath(input.stateDir, sync.sync_id), canonicalSyncKnowledgeJson(manifest));
  input.revalidateOwnership();
  return manifest;
}

/**
 * Owns the complete ingest stage. Moving syncs return still ingesting so the
 * reconciliation engine can perform its ingesting -> reconciling transition.
 * Knowledge-only syncs record two event-backed status transitions and rest at
 * validated with SyncState.staging still null.
 */
export async function completeSyncKnowledgeIngest(
  input: CompleteSyncKnowledgeIngestInput,
): Promise<CompletedSyncKnowledgeIngest> {
  const initial = getSyncState(input.store, requiredText(input.syncId, "syncId"));
  if (!initial) throw new Error(`Sync not found: ${input.syncId}`);
  if (initial.revision !== input.expectedRevision) {
    throw new Error(
      `Stale sync revision ${input.expectedRevision} for ${initial.sync_id}; current revision is ${initial.revision}`,
    );
  }
  if (initial.status !== "ingesting") {
    throw new Error(`Sync knowledge ingest requires ingesting; ${initial.sync_id} is ${initial.status}`);
  }
  input.revalidateOwnership();
  enqueueSyncKnowledgeJobs(input.store, {
    syncId: initial.sync_id,
    commandId: requiredText(input.commandId, "commandId"),
    actor: input.actor ?? "runner",
    spanId: input.spanId ?? syncActionSpanId(input.commandId),
    occurredAt: input.now?.(),
    provenance: input.provenance,
  });
  let manifest: SyncKnowledgeManifest;
  try {
    manifest = await stageSyncKnowledge(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const current = getSyncState(input.store, initial.sync_id);
    try {
      input.revalidateOwnership();
      if (current?.status === "ingesting") {
        transitionSync(input.store, current.sync_id, {
          actor: input.actor ?? "runner",
          commandId: input.commandId,
          correlationId: current.sync_id,
          expectedRevision: current.revision,
          patch: {
            status: "blocked",
            blockers: [{
              code: "knowledge_stage_failed",
              message,
              source_kind: "sync",
              source_id: current.sync_id,
              recoverable: true,
            }],
          },
          payload: { knowledge_stage_error: message },
          spanId: input.spanId,
        });
      }
    } catch (blockError) {
      throw new Error(
        `Sync knowledge ingest failed: ${message}; durable blocker write failed: ${blockError instanceof Error ? blockError.message : String(blockError)}`,
        { cause: error },
      );
    }
    throw new Error(`Sync knowledge ingest failed: ${message}`, { cause: error });
  }
  let sync = getSyncState(input.store, initial.sync_id)!;
  if (!sync.intake.knowledge_only) return { manifest, sync };

  const evidence: JsonObject = {
    result: "passed",
    knowledge_only: true,
    manifest_path: syncKnowledgeManifestPath(input.stateDir, sync.sync_id),
    manifest_digest: manifest.digest,
    accepted_job_ids: manifest.accepted_job_ids,
    artifacts: manifest.artifacts.map((artifact) => ({
      job_id: artifact.job_id,
      source_kind: artifact.source_kind,
      source_id: artifact.source_id,
      digest: artifact.digest,
    })),
    validated_at: input.now?.() ?? new Date().toISOString(),
  };
  input.revalidateOwnership();
  sync = transitionSync(input.store, sync.sync_id, {
    actor: input.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validating", staging: null },
    payload: { knowledge_manifest_digest: manifest.digest, accepted_job_ids: manifest.accepted_job_ids },
    spanId: input.spanId,
  });
  input.revalidateOwnership();
  sync = transitionSync(input.store, sync.sync_id, {
    actor: input.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validated", blockers: [], staging: null },
    payload: { validation_evidence: evidence },
    spanId: input.spanId,
  });
  return { manifest, sync };
}

function rowToPublishedRevision(
  row: KnowledgeRevisionRow,
  oldRevisionId: string,
  acceptedJobIds: string[],
  idempotent: boolean,
): PublishedKnowledgeRevision {
  return {
    revision: Number(row.revision),
    revisionId: `knowledge-${Number(row.revision)}`,
    oldRevisionId,
    digest: row.digest,
    acceptedJobIds,
    causedByEventId: row.caused_by_event_id,
    createdAt: row.created_at,
    idempotent,
  };
}

/**
 * Accepts a verified staging manifest and advances the monotonic canonical
 * knowledge revision. The caller must own the surrounding durable
 * publication transaction; the revision and event cannot commit separately.
 */
export function publishSyncKnowledgeInTransaction(
  db: Database,
  input: PublishSyncKnowledgeInput,
): PublishedKnowledgeRevision {
  if (!db.inTransaction) throw new Error("Knowledge revision publication requires an active state transaction");
  const syncId = requiredText(input.syncId, "syncId");
  const gameId = requiredText(input.gameId, "gameId");
  const sync = db
    .query("SELECT game_id, status FROM sync_state WHERE sync_id = ?")
    .get(syncId) as { game_id: string; status: string } | null;
  if (!sync) throw new Error(`Sync not found: ${syncId}`);
  if (sync.game_id !== gameId) throw new Error(`Sync ${syncId} does not belong to ${gameId}`);
  if (sync.status !== "publishing") {
    throw new Error(`Knowledge revision can be published only while publishing; ${syncId} is ${sync.status}`);
  }
  if (input.manifest.sync_id !== syncId || input.manifest.game_id !== gameId) {
    throw new Error("Knowledge manifest identity does not match the publication command");
  }
  const withoutDigest: Omit<SyncKnowledgeManifest, "digest"> = {
    schema_version: input.manifest.schema_version,
    sync_id: input.manifest.sync_id,
    game_id: input.manifest.game_id,
    knowledge_only: input.manifest.knowledge_only,
    accepted_job_ids: input.manifest.accepted_job_ids,
    artifacts: input.manifest.artifacts,
  };
  if (manifestDigest(withoutDigest) !== input.manifest.digest) {
    throw new Error(`Knowledge manifest digest mismatch for ${syncId}`);
  }
  const jobs = listSyncKnowledgeJobs(db, syncId);
  const acceptedJobIds = [...input.manifest.accepted_job_ids];
  const manifestArtifacts = [...input.manifest.artifacts]
    .sort((left, right) => left.job_id.localeCompare(right.job_id));
  const durableArtifacts = jobs
    .map((job): Omit<SyncKnowledgeArtifact, "artifact_path"> => ({
      job_id: job.jobId,
      source_kind: job.sourceKind,
      source_id: job.sourceId,
      provenance: job.provenance,
      digest: job.stagedDigest ?? "",
    }))
    .sort((left, right) => left.job_id.localeCompare(right.job_id));
  const acceptedArtifacts = manifestArtifacts.map(({ artifact_path: _artifactPath, ...artifact }) => artifact);
  if (
    jobs.some((job) => job.gameId !== gameId || job.status !== "succeeded") ||
    canonicalSyncKnowledgeJson(jobs.map((job) => job.jobId).sort()) !== canonicalSyncKnowledgeJson([...acceptedJobIds].sort()) ||
    canonicalSyncKnowledgeJson(durableArtifacts) !== canonicalSyncKnowledgeJson(acceptedArtifacts)
  ) {
    throw new Error(`Knowledge manifest jobs are not the succeeded durable jobs for ${syncId}`);
  }
  const existingRows = db
    .query("SELECT * FROM knowledge_revisions WHERE sync_id = ? ORDER BY revision")
    .all(syncId) as KnowledgeRevisionRow[];
  const previous = db
    .query("SELECT * FROM knowledge_revisions WHERE game_id = ? ORDER BY revision DESC LIMIT 1")
    .get(gameId) as KnowledgeRevisionRow | null;
  const oldRevisionId = previous ? `knowledge-${Number(previous.revision)}` : "knowledge-0";
  if (existingRows.length > 1) throw new Error(`Sync ${syncId} has multiple knowledge revisions`);
  if (existingRows[0]) {
    const existing = existingRows[0];
    if (existing.game_id !== gameId || existing.digest !== input.manifest.digest) {
      throw new Error(`Sync ${syncId} already published a different knowledge revision`);
    }
    const beforeExisting = db
      .query(
        `SELECT * FROM knowledge_revisions
         WHERE game_id = ? AND revision < ? ORDER BY revision DESC LIMIT 1`,
      )
      .get(gameId, existing.revision) as KnowledgeRevisionRow | null;
    return rowToPublishedRevision(
      existing,
      beforeExisting ? `knowledge-${Number(beforeExisting.revision)}` : "knowledge-0",
      acceptedJobIds,
      true,
    );
  }
  const nextRow = db.query("SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM knowledge_revisions").get() as {
    revision: number;
  };
  const revision = Number(nextRow.revision);
  const revisionId = `knowledge-${revision}`;
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const event = appendSyncKnowledgeEventInTransaction(db, {
    eventType: "knowledge.revision_advanced",
    gameId,
    subjectId: gameId,
    traceId: requiredText(input.traceId, "traceId"),
    actor: input.actor,
    causationId: requiredText(input.commandId, "commandId"),
    correlationId: requiredText(input.correlationId, "correlationId"),
    spanId: requiredText(input.spanId, "spanId"),
    occurredAt,
    payload: {
      old_revision: oldRevisionId,
      new_revision: revisionId,
      accepted_job_ids: acceptedJobIds,
    },
  });
  db.query(
    `INSERT INTO knowledge_revisions (
       revision, game_id, digest, sync_id, caused_by_event_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(revision, gameId, input.manifest.digest, syncId, event.eventId, occurredAt);
  return {
    revision,
    revisionId,
    oldRevisionId,
    digest: input.manifest.digest,
    acceptedJobIds,
    causedByEventId: event.eventId,
    createdAt: occurredAt,
    idempotent: false,
  };
}
