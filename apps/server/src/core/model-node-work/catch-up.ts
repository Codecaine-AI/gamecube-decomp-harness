import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";

import { DEFAULT_CHECKPOINT_KNOWLEDGE_CAP } from "@server/core/game-registry/runtime-options.js";
import { enqueueJob, getJobByDedupeKey, requeueJob } from "@server/core/job-queue/kernel.js";
import { gameKnowledgeRoot, knowledgeStorePath } from "@server/core/knowledge/paths.js";
import { immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";

export const MODEL_NODE_JOB_KINDS = ["checkpoint_adjudication", "checkpoint_knowledge"] as const;
export type ModelNodeJobKind = (typeof MODEL_NODE_JOB_KINDS)[number];

export const CATCH_UP_BATCH_SIZE = 50;
/** Enqueue is SQL only; one scan stops starting new batches after this budget. */
export const DEFAULT_CATCH_UP_BUDGET_MS = 1_000;

export interface CatchUpOptions {
  at?: string;
  batchSize?: number;
  budgetMs?: number;
}

/**
 * Record the first time a lane kind started in this state directory
 * (insert-or-ignore) and return the stored time. Catch-up never reaches
 * items older than it, so enabling a kind never backfills history.
 */
export function ensureModelNodeLaneState(store: StateStore, kind: ModelNodeJobKind, at: string = now()): string {
  return immediateTransaction(store.db, () => {
    store.db
      .query("INSERT INTO model_node_lane_state (kind, enabled_since) VALUES (?, ?) ON CONFLICT(kind) DO NOTHING")
      .run(kind, at);
    return modelNodeLaneEnabledSince(store, kind)!;
  });
}

/** The kind's first-enabled time, or null when it never started in this state directory. */
export function modelNodeLaneEnabledSince(store: StateStore, kind: ModelNodeJobKind): string | null {
  const row = store.db
    .query<{ enabled_since: string }, [string]>("SELECT enabled_since FROM model_node_lane_state WHERE kind = ?")
    .get(kind);
  return row?.enabled_since ?? null;
}

interface BatchResult {
  scanned: number;
  enqueued: number;
}

/** Repeat full batches until one comes back short or the time budget is spent. */
function scanInBatches(batch: (limit: number) => BatchResult, options: CatchUpOptions): number {
  const batchSize = options.batchSize ?? CATCH_UP_BATCH_SIZE;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_CATCH_UP_BUDGET_MS);
  let enqueued = 0;
  for (;;) {
    const result = batch(batchSize);
    enqueued += result.enqueued;
    if (result.scanned < batchSize || Date.now() >= deadline) return enqueued;
  }
}

interface AdjudicationCandidateRow {
  id: string;
  run_id: string;
  game_id: string;
  trace_id: string | null;
}

/**
 * Enqueue `checkpoint_adjudication` for every eligible shadow candidate
 * recorded since the kind was enabled, in any run, that has no job yet
 * (§6.4). `workerStateId` narrows the scan to one worker's checkpoints (the
 * post-worker trigger). Returns the number of jobs enqueued.
 */
export function catchUpAdjudication(
  store: StateStore,
  options: CatchUpOptions & { workerStateId?: string } = {},
): number {
  const enabledSince = modelNodeLaneEnabledSince(store, "checkpoint_adjudication");
  if (enabledSince === null) return 0;
  const workerStateId = options.workerStateId ?? null;
  return scanInBatches((limit) => immediateTransaction(store.db, () => {
    const rows = store.db
      .query<AdjudicationCandidateRow, [string, string | null, number]>(`
        SELECT c.id, c.run_id, COALESCE(r.game_id, 'melee') AS game_id, r.trace_id
        FROM worker_checkpoints c
        LEFT JOIN runs r ON r.id = c.run_id
        WHERE c.validation_time >= ?1 AND c.qa_status = 'warnings'
          AND CASE WHEN json_valid(c.metadata_json)
                THEN json_extract(c.metadata_json, '$.llm_review_candidate.eligible') = 1
                 AND json_extract(c.metadata_json, '$.llm_review_candidate.mode') = 'shadow'
                ELSE 0 END
          AND (?2 IS NULL OR c.worker_state_id = ?2)
          AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.kind = 'checkpoint_adjudication' AND j.dedupe_key = c.id)
        ORDER BY c.validation_time, c.id
        LIMIT ?3`)
      .all(enabledSince, workerStateId, limit);
    const at = options.at ?? now();
    for (const row of rows) {
      enqueueJob(store, {
        kind: "checkpoint_adjudication",
        dedupeKey: row.id,
        gameId: row.game_id,
        runId: row.run_id,
        payload: { checkpointId: row.id },
        ...(row.trace_id ? { traceId: row.trace_id } : {}),
        executionClass: "local",
        actor: "runner",
        at,
      });
    }
    return { scanned: rows.length, enqueued: rows.length };
  }), options);
}

interface SettledEpochRow {
  id: string;
  game_id: string;
  trace_id: string | null;
  queued: number;
}

interface KnowledgeCandidateRow {
  integration_id: string;
  checkpoint_id: string;
  run_id: string;
}

export interface KnowledgeCatchUpOptions extends CatchUpOptions {
  /** Narrows the scan to one epoch (the post-boundary trigger). */
  epochId?: string;
  /** Narrows the scan to these epochs (`checkpoint-knowledge backfill`); empty enqueues nothing. */
  epochIds?: readonly string[];
  /** Most `checkpoint_knowledge` jobs per epoch (default 50). */
  cap?: number;
  /**
   * Also reach epochs settled before the kind's `enabled_since`, and scan
   * without lane state. Honoured only together with `epochIds`, so history
   * is reached only by naming it (the deliberate backfill, §6.8), never by
   * turning the feed on.
   */
  includeHistory?: boolean;
  /**
   * Of these checkpoints of one game, the ones whose knowledge submission
   * exists. Default: the game's knowledge store, read-only.
   */
  ingestedSubmissions?: IngestedSubmissions;
  log?: (message: string) => void;
}

/** The error prefix of a `checkpoint_knowledge` attempt whose submission was not ingested yet. */
export const SUBMISSION_NOT_FOUND = "submission-not-found";
/** Most terminal submission-not-found jobs one scan looks at; the next scan continues after them. */
export const STRANDED_SCAN_LIMIT = 1_000;

interface StrandedCursor {
  completedAt: string;
  dedupeKey: string;
}

/**
 * Where the next stranded-job scan of a store resumes, per scan scope. Each
 * scan examines the next STRANDED_SCAN_LIMIT candidates in (completed_at,
 * dedupe_key) order and wraps to the oldest after a short batch, so every
 * candidate is examined within a bounded number of scans however many stay
 * missing. Kept per process: a restart begins a new rotation.
 */
const strandedCursors = new WeakMap<object, Map<string, StrandedCursor>>();

export type IngestedSubmissions = (gameId: string, checkpointIds: readonly string[]) => ReadonlySet<string>;

function isUnderTestRunner(): boolean {
  return process.env.NODE_ENV === "test"
    || process.env.BUN_TEST !== undefined
    || (typeof Bun !== "undefined" && Bun.env.NODE_ENV === "test");
}

/** Checkpoint ids among `checkpointIds` that a submission of the game's knowledge store records (`runtime_ref`). */
export function knowledgeStoreSubmissions(gameId: string, checkpointIds: readonly string[]): ReadonlySet<string> {
  if (isUnderTestRunner()) {
    throw new Error("knowledge catch-up refuses the default knowledge store under a test runner; pass ingestedSubmissions");
  }
  const path = knowledgeStorePath(gameKnowledgeRoot(gameId));
  if (!existsSync(path)) return new Set();
  const db = new Database(path, { readonly: true });
  try {
    return new Set(db
      .query<{ runtime_ref: string }, [string]>("SELECT runtime_ref FROM submission WHERE runtime_ref IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(checkpointIds))
      .map((row) => row.runtime_ref));
  } finally {
    db.close();
  }
}

function jobErrorMessage(errorJson: string | null): string {
  if (!errorJson) return "";
  try {
    const value = JSON.parse(errorJson) as unknown;
    if (typeof value === "string") return value;
    const message = typeof value === "object" && value !== null ? (value as { message?: unknown }).message : undefined;
    return typeof message === "string" ? message : errorJson;
  } catch {
    return errorJson;
  }
}

/**
 * Re-enqueue every `checkpoint_knowledge` job that ended terminal because its
 * submission was not ingested in time, once the submission exists. Any other
 * terminal outcome stays as it is; a requeued job is queued, so a second scan
 * finds nothing.
 */
function requeueIngestedSubmissions(store: StateStore, options: KnowledgeCatchUpOptions, epochFilter: string | null): number {
  const cursors = strandedCursors.get(store.db) ?? new Map<string, StrandedCursor>();
  strandedCursors.set(store.db, cursors);
  const scope = epochFilter ?? "*";
  const cursor = cursors.get(scope) ?? null;
  const batch = store.db
    .query<{ dedupe_key: string; game_id: string; error_json: string | null; completed_at: string }, [string | null, string | null, string | null, number]>(`
      SELECT dedupe_key, game_id, error_json, completed_at FROM jobs
      WHERE kind = 'checkpoint_knowledge' AND status = 'failed' AND completed_at IS NOT NULL
        AND error_json LIKE '%${SUBMISSION_NOT_FOUND}%'
        AND (?1 IS NULL OR json_extract(payload_json, '$.epochId') IN (SELECT value FROM json_each(?1)))
        AND (?2 IS NULL OR completed_at > ?2 OR (completed_at = ?2 AND dedupe_key > ?3))
      ORDER BY completed_at, dedupe_key
      LIMIT ?4`)
    .all(epochFilter, cursor?.completedAt ?? null, cursor?.dedupeKey ?? null, STRANDED_SCAN_LIMIT);
  const last = batch.at(-1);
  // A full batch continues after its last row next time; a short one has reached the end and wraps.
  if (batch.length === STRANDED_SCAN_LIMIT && last) cursors.set(scope, { completedAt: last.completed_at, dedupeKey: last.dedupe_key });
  else cursors.delete(scope);
  const rows = batch.filter((row) => jobErrorMessage(row.error_json).startsWith(SUBMISSION_NOT_FOUND));
  if (rows.length === 0) return 0;
  const byGame = new Map<string, string[]>();
  for (const row of rows) byGame.set(row.game_id, [...(byGame.get(row.game_id) ?? []), row.dedupe_key]);
  const lookup = options.ingestedSubmissions ?? knowledgeStoreSubmissions;
  const log = options.log ?? ((message: string) => console.warn(message));
  const at = options.at ?? now();
  let requeued = 0;
  for (const [gameId, checkpointIds] of byGame) {
    let ingested: ReadonlySet<string>;
    try {
      ingested = lookup(gameId, checkpointIds);
    } catch (cause) {
      log(`[model-node-lanes] checkpoint_knowledge submission lookup failed for ${gameId}: ${cause instanceof Error ? cause.message : String(cause)}`);
      continue;
    }
    for (const checkpointId of checkpointIds) {
      if (!ingested.has(checkpointId)) continue;
      immediateTransaction(store.db, () => {
        const job = getJobByDedupeKey(store, "checkpoint_knowledge", checkpointId);
        if (job?.status !== "failed" || job.completedAt === null) return;
        requeueJob(store, { kind: "checkpoint_knowledge", dedupeKey: checkpointId, actor: "runner", at });
        requeued += 1;
      });
    }
  }
  return requeued;
}

/**
 * Enqueue `checkpoint_knowledge` for applied integrations of every epoch
 * settled since the kind was enabled, in any run (§6.3, §6.8 rule 2: closed
 * as `completed` with its `epoch-save-point-<id>` row). The scan reads the
 * stored rows only, so fresh and reconciled settlements are covered alike, a
 * crash between settlement and enqueue is recovered by the next scan in the
 * state directory, and Sync is never consulted. Exact matches first, then
 * score gain, until the epoch holds `cap` jobs. Confirmed-good evaluation is
 * the handler's job. A job that ended terminal with `submission-not-found` is
 * re-enqueued once its submission exists. Returns the number of jobs enqueued
 * or re-enqueued.
 */
export function catchUpKnowledge(store: StateStore, options: KnowledgeCatchUpOptions = {}): number {
  const named = options.epochIds !== undefined
    ? [...new Set(options.epochIds)]
    : options.epochId !== undefined ? [options.epochId] : null;
  if (named !== null && named.length === 0) return 0;
  const history = options.includeHistory === true && options.epochIds !== undefined;
  const enabledSince = history ? null : modelNodeLaneEnabledSince(store, "checkpoint_knowledge");
  if (!history && enabledSince === null) return 0;
  const epochFilter = named === null ? null : JSON.stringify(named);
  const cap = Math.max(0, Math.floor(options.cap ?? DEFAULT_CHECKPOINT_KNOWLEDGE_CAP));
  if (cap === 0) return 0;
  const enqueued = scanInBatches((limit) => immediateTransaction(store.db, () => {
    const epochs = store.db
      .query<SettledEpochRow, [string | null, string | null, number, number]>(`
        SELECT e.id, COALESCE(r.game_id, 'melee') AS game_id, r.trace_id,
          (SELECT COUNT(*) FROM jobs j
            WHERE j.kind = 'checkpoint_knowledge' AND json_extract(j.payload_json, '$.epochId') = e.id) AS queued
        FROM epochs e
        LEFT JOIN runs r ON r.id = e.run_id
        WHERE e.status = 'completed' AND e.closed_at IS NOT NULL
          AND (?1 IS NULL OR e.closed_at >= ?1)
          AND (?2 IS NULL OR e.id IN (SELECT value FROM json_each(?2)))
          AND EXISTS (SELECT 1 FROM save_points sp WHERE sp.id = 'epoch-save-point-' || e.id)
          AND EXISTS (
            SELECT 1 FROM integration_outcomes io
            WHERE io.epoch_id = e.id AND io.status IN ('applied', 'resolved')
              AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.kind = 'checkpoint_knowledge' AND j.dedupe_key = io.worker_checkpoint_id)
          )
          AND queued < ?3
        ORDER BY e.closed_at, e.id
        LIMIT ?4`)
      .all(enabledSince, epochFilter, cap, limit);
    const at = options.at ?? now();
    let enqueued = 0;
    for (const epoch of epochs) {
      const candidates = store.db
        .query<KnowledgeCandidateRow, [string, number]>(`
          SELECT io.id AS integration_id, io.worker_checkpoint_id AS checkpoint_id, io.run_id
          FROM integration_outcomes io
          LEFT JOIN worker_checkpoints c ON c.id = io.worker_checkpoint_id
          WHERE io.epoch_id = ? AND io.status IN ('applied', 'resolved')
            AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.kind = 'checkpoint_knowledge' AND j.dedupe_key = io.worker_checkpoint_id)
          ORDER BY COALESCE(c.exact_match, 0) DESC, (c.delta IS NULL), c.delta DESC, io.created_at, io.id
          LIMIT ?`)
        .all(epoch.id, cap - Number(epoch.queued));
      for (const candidate of candidates) {
        enqueueJob(store, {
          kind: "checkpoint_knowledge",
          dedupeKey: candidate.checkpoint_id,
          gameId: epoch.game_id,
          runId: candidate.run_id,
          payload: { checkpointId: candidate.checkpoint_id, epochId: epoch.id, integrationId: candidate.integration_id },
          ...(epoch.trace_id ? { traceId: epoch.trace_id } : {}),
          executionClass: "local",
          actor: "runner",
          at,
        });
        enqueued += 1;
      }
    }
    return { scanned: epochs.length, enqueued };
  }), options);
  return enqueued + requeueIngestedSubmissions(store, options, epochFilter);
}
