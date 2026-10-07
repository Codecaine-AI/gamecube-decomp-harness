import { DEFAULT_CHECKPOINT_KNOWLEDGE_CAP } from "@server/core/game-registry/runtime-options.js";
import { enqueueJob } from "@server/core/job-queue/kernel.js";
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

/**
 * Enqueue `checkpoint_knowledge` for applied integrations of every epoch
 * settled since the kind was enabled, in any run (§6.8 rule 2: closed as
 * `completed` with its `epoch-save-point-<id>` row). Exact matches first,
 * then score gain, until the epoch holds `cap` jobs. `epochId` narrows the
 * scan to one epoch (the post-boundary trigger). Confirmed-good evaluation
 * is the handler's job. Returns the number of jobs enqueued.
 */
export function catchUpKnowledge(
  store: StateStore,
  options: CatchUpOptions & { epochId?: string; cap?: number } = {},
): number {
  const enabledSince = modelNodeLaneEnabledSince(store, "checkpoint_knowledge");
  if (enabledSince === null) return 0;
  const epochId = options.epochId ?? null;
  const cap = Math.max(0, Math.floor(options.cap ?? DEFAULT_CHECKPOINT_KNOWLEDGE_CAP));
  if (cap === 0) return 0;
  return scanInBatches((limit) => immediateTransaction(store.db, () => {
    const epochs = store.db
      .query<SettledEpochRow, [string, string | null, number, number]>(`
        SELECT e.id, COALESCE(r.game_id, 'melee') AS game_id, r.trace_id,
          (SELECT COUNT(*) FROM jobs j
            WHERE j.kind = 'checkpoint_knowledge' AND json_extract(j.payload_json, '$.epochId') = e.id) AS queued
        FROM epochs e
        LEFT JOIN runs r ON r.id = e.run_id
        WHERE e.status = 'completed' AND e.closed_at IS NOT NULL AND e.closed_at >= ?1
          AND (?2 IS NULL OR e.id = ?2)
          AND EXISTS (SELECT 1 FROM save_points sp WHERE sp.id = 'epoch-save-point-' || e.id)
          AND EXISTS (
            SELECT 1 FROM integration_outcomes io
            WHERE io.epoch_id = e.id AND io.status IN ('applied', 'resolved')
              AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.kind = 'checkpoint_knowledge' AND j.dedupe_key = io.worker_checkpoint_id)
          )
          AND queued < ?3
        ORDER BY e.closed_at, e.id
        LIMIT ?4`)
      .all(enabledSince, epochId, cap, limit);
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
}
