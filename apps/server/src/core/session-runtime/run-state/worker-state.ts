import { randomUUID } from "node:crypto";
import { immediateTransaction, now, withBusyRetry, writeSetHash, type StateStore } from "@server/core/orchestrator-state";

export type EpochTargetStatus = "admitted" | "claimed" | "finished";
export type TargetClaimStatus = "active" | "closed";
export type WorkerLifecycleStatus = "running" | "exact" | "timeout" | "error" | "cancelled" | "finished";

export interface ClaimedTarget {
  claimId: string;
  workerStateId: string;
  epochTargetId: string;
  epochId: string;
  sessionId: string;
  workerId: string;
  targetId: string;
  target: Record<string, unknown>;
  writeSet: string[];
  worktreePath?: string | null;
  ttl: string;
}

export interface ActiveClaimRecord extends ClaimedTarget {
  baseRev: string;
  heartbeatAt: string;
  claimedAt: string;
}

export interface WorkerCheckpointInput {
  workerStateId: string;
  sessionId: string;
  epochId: string;
  epochTargetId: string;
  targetClaimId: string;
  attemptIndex: number;
  oldScore: number | null;
  newScore: number | null;
  exactMatch: boolean;
  hardGatesPassed: boolean;
  buildStatus?: string | null;
  qaStatus?: string | null;
  objdiffStatus?: string | null;
  validationStatus: string;
  artifactPath?: string | null;
  patchPath?: string | null;
  diffPath?: string | null;
  failureReasons?: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkerCheckpointRecord extends WorkerCheckpointInput {
  id: string;
  validationTime: string;
  delta: number | null;
  improvedOverBaseline: boolean;
  selectable: boolean;
  selected: boolean;
}

export interface WorkerStateCloseInput {
  workerStateId: string;
  lifecycleStatus: Exclude<WorkerLifecycleStatus, "running">;
  epochTargetStatus?: Extract<EpochTargetStatus, "admitted" | "finished">;
  summary?: Record<string, unknown>;
  timeoutSummary?: string | null;
  errorSummary?: string | null;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function jsonArray(value: string[]): string {
  return JSON.stringify(value);
}

function jsonObject(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function targetKey(unit: string, symbol: string): string {
  return `${unit}::${symbol}`;
}

function epochTargetToClaim(row: Record<string, unknown>, params: { claimId: string; workerStateId: string; workerId: string; ttl: string }): ClaimedTarget {
  const sourcePath = String(row.source_path ?? "");
  return {
    claimId: params.claimId,
    workerStateId: params.workerStateId,
    epochTargetId: String(row.id),
    epochId: String(row.epoch_id),
    sessionId: String(row.session_id),
    workerId: params.workerId,
    targetId: String(row.id),
    target: {
      target_id: String(row.id),
      epoch_target_id: String(row.id),
      unit: String(row.unit),
      symbol: String(row.symbol),
      source_path: sourcePath,
      size: Number(row.size),
      fuzzy: Number(row.baseline_score),
      matched: null,
      complete: null,
      risk: null,
      target_status: String(row.status),
      priority: Number(row.priority),
      reason: String(row.reason ?? ""),
    },
    writeSet: [sourcePath],
    worktreePath: null,
    ttl: params.ttl,
  };
}

export function activeWorkerCount(store: StateStore, sessionId: string): number {
  const row = withBusyRetry(
    () =>
      store.db
        .query("SELECT COUNT(*) AS count FROM target_claims WHERE session_id = ? AND status = 'active'")
        .get(sessionId) as Record<string, unknown>,
  );
  return Number(row.count ?? 0);
}

export function activeClaimsForSession(store: StateStore, sessionId: string): ActiveClaimRecord[] {
  const rows = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT
              target_claims.id AS claim_id,
              target_claims.worker_id,
              target_claims.base_rev,
              target_claims.worktree_path,
              target_claims.ttl,
              target_claims.heartbeat_at,
              target_claims.claimed_at,
              target_claims.write_set_json,
              worker_state.id AS worker_state_id,
              epoch_targets.id AS epoch_target_id,
              epoch_targets.epoch_id,
              epoch_targets.session_id,
              epoch_targets.unit,
              epoch_targets.symbol,
              epoch_targets.source_path,
              epoch_targets.size,
              epoch_targets.baseline_score,
              epoch_targets.priority,
              epoch_targets.reason,
              epoch_targets.status AS target_status
            FROM target_claims
            JOIN worker_state ON worker_state.target_claim_id = target_claims.id
            JOIN epoch_targets ON epoch_targets.id = target_claims.epoch_target_id
            WHERE target_claims.session_id = ?
              AND target_claims.status = 'active'
            ORDER BY target_claims.heartbeat_at ASC
          `,
        )
        .all(sessionId) as Record<string, unknown>[],
  );

  return rows.map((row) => ({
    claimId: String(row.claim_id),
    workerStateId: String(row.worker_state_id),
    epochTargetId: String(row.epoch_target_id),
    epochId: String(row.epoch_id),
    sessionId: String(row.session_id),
    workerId: String(row.worker_id),
    baseRev: String(row.base_rev ?? "unknown"),
    worktreePath: row.worktree_path == null ? null : String(row.worktree_path),
    ttl: String(row.ttl),
    heartbeatAt: String(row.heartbeat_at),
    claimedAt: String(row.claimed_at),
    targetId: String(row.epoch_target_id),
    target: {
      target_id: String(row.epoch_target_id),
      epoch_target_id: String(row.epoch_target_id),
      unit: String(row.unit),
      symbol: String(row.symbol),
      source_path: String(row.source_path),
      size: Number(row.size),
      fuzzy: Number(row.baseline_score),
      matched: null,
      complete: null,
      risk: null,
      target_status: String(row.target_status),
      priority: Number(row.priority),
      reason: String(row.reason ?? ""),
    },
    writeSet: parseStringArray(row.write_set_json),
  }));
}

export function workerStateHasExecutionEvidence(store: StateStore, workerStateId: string): boolean {
  const row = store.db
    .query("SELECT worker_session_ids_json FROM worker_state WHERE id = ?")
    .get(workerStateId) as Record<string, unknown> | undefined;
  if (parseStringArray(row?.worker_session_ids_json).length > 0) return true;
  const checkpoints = store.db
    .query("SELECT COUNT(*) AS count FROM worker_checkpoints WHERE worker_state_id = ?")
    .get(workerStateId) as Record<string, unknown> | undefined;
  return Number(checkpoints?.count ?? 0) > 0;
}

export function claimNextEpochTarget(params: {
  store: StateStore;
  sessionId: string;
  workerId: string;
  baseRev?: string;
  ttlSeconds: number;
  artifactDir?: string | null;
}): ClaimedTarget | null {
  if (!Number.isFinite(params.ttlSeconds) || params.ttlSeconds <= 0) {
    throw new Error("claimNextEpochTarget requires a positive ttlSeconds value");
  }
  return immediateTransaction(params.store.db, () => {
    const target = params.store.db
      .query(
        `
          SELECT
            epoch_targets.*,
            (
              SELECT COUNT(*)
              FROM epoch_targets AS active_targets
              JOIN target_claims AS active_claims
                ON active_claims.epoch_target_id = active_targets.id
              WHERE active_targets.epoch_id = epoch_targets.epoch_id
                AND active_targets.source_path = epoch_targets.source_path
                AND active_claims.status = 'active'
            ) AS active_source_claims
          FROM epoch_targets
          JOIN epochs ON epochs.id = epoch_targets.epoch_id
          WHERE epoch_targets.session_id = ?
            AND epochs.status = 'active'
            AND epoch_targets.status = 'admitted'
            AND NOT EXISTS (
              SELECT 1
              FROM target_claims
              WHERE target_claims.epoch_target_id = epoch_targets.id
                AND target_claims.status = 'active'
            )
          ORDER BY active_source_claims ASC, epoch_targets.priority DESC, epoch_targets.admission_index ASC
          LIMIT 1
        `,
      )
      .get(params.sessionId) as Record<string, unknown> | undefined;
    if (!target) return null;

    const sourcePath = String(target.source_path ?? "").trim();
    if (!sourcePath) throw new Error(`Cannot claim epoch target ${String(target.id)} without a source_path`);

    const claimId = randomUUID();
    const workerStateId = randomUUID();
    const writeSet = [sourcePath];
    const ttl = new Date(Date.now() + Math.trunc(params.ttlSeconds) * 1000).toISOString();
    const claimedAt = now();
    const key = targetKey(String(target.unit), String(target.symbol));
    const reusable = params.store.db
      .query(
        `
          SELECT target_claims.id AS claim_id, worker_state.id AS worker_state_id
          FROM target_claims
          JOIN worker_state ON worker_state.target_claim_id = target_claims.id
          WHERE target_claims.epoch_target_id = ?
            AND target_claims.status = 'closed'
          LIMIT 1
        `,
      )
      .get(String(target.id)) as Record<string, unknown> | undefined;

    if (reusable) {
      const reusableClaimId = String(reusable.claim_id);
      const reusableWorkerStateId = String(reusable.worker_state_id);
      const hasExecutionEvidence = workerStateHasExecutionEvidence(params.store, reusableWorkerStateId);
      if (hasExecutionEvidence && bestCheckpointForWorkerState(params.store, reusableWorkerStateId)) {
        throw new Error(`Cannot recycle claimed target ${String(target.id)} because worker state ${reusableWorkerStateId} has selectable execution evidence`);
      }
      if (hasExecutionEvidence) {
        params.store.db.query("DELETE FROM worker_checkpoints WHERE worker_state_id = ?").run(reusableWorkerStateId);
      }
      params.store.db
        .query(
          `
            UPDATE target_claims
            SET worker_id = ?,
                base_rev = ?,
                worktree_path = NULL,
                ttl = ?,
                heartbeat_at = ?,
                status = 'active',
                claimed_at = ?,
                closed_at = NULL,
                close_reason = NULL
            WHERE id = ?
          `,
        )
        .run(params.workerId, params.baseRev ?? "unknown", ttl, claimedAt, claimedAt, reusableClaimId);
      params.store.db
        .query(
          `
            UPDATE worker_state
            SET worker_id = ?,
                lifecycle_status = 'running',
                worker_session_ids_json = '[]',
                artifact_dir = ?,
                worktree_path = NULL,
                started_at = ?,
                ended_at = NULL,
                best_checkpoint_id = NULL,
                best_score = ?,
                exact = 0,
                timeout_summary = NULL,
                error_summary = NULL,
                summary_json = '{}'
            WHERE id = ?
          `,
        )
        .run(params.workerId, params.artifactDir ?? null, claimedAt, finiteOrNull(Number(target.baseline_score)), reusableWorkerStateId);
      params.store.db.query("UPDATE epoch_targets SET status = 'claimed', claimed_at = ?, finished_at = NULL WHERE id = ?").run(claimedAt, String(target.id));
      return epochTargetToClaim(target, { claimId: reusableClaimId, workerStateId: reusableWorkerStateId, workerId: params.workerId, ttl });
    }

    params.store.db
      .query(
        `
          INSERT INTO target_claims (
            id, session_id, epoch_id, epoch_target_id, worker_id, base_rev,
            write_set_json, write_set_hash, worktree_path, ttl, heartbeat_at,
            status, claimed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `,
      )
      .run(
        claimId,
        String(target.session_id),
        String(target.epoch_id),
        String(target.id),
        params.workerId,
        params.baseRev ?? "unknown",
        jsonArray(writeSet),
        writeSetHash(writeSet),
        null,
        ttl,
        claimedAt,
        claimedAt,
      );

    params.store.db
      .query(
        `
          INSERT INTO worker_state (
            id, session_id, epoch_id, epoch_target_id, target_claim_id, worker_id,
            target_key, lifecycle_status, write_set_json, worker_session_ids_json,
            artifact_dir, started_at, baseline_score, best_score, exact, summary_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, '[]', ?, ?, ?, ?, 0, '{}')
        `,
      )
      .run(
        workerStateId,
        String(target.session_id),
        String(target.epoch_id),
        String(target.id),
        claimId,
        params.workerId,
        key,
        jsonArray(writeSet),
        params.artifactDir ?? null,
        claimedAt,
        finiteOrNull(Number(target.baseline_score)),
        finiteOrNull(Number(target.baseline_score)),
      );

    params.store.db.query("UPDATE epoch_targets SET status = 'claimed', claimed_at = ? WHERE id = ?").run(claimedAt, String(target.id));
    return epochTargetToClaim(target, { claimId, workerStateId, workerId: params.workerId, ttl });
  });
}

export function setClaimWorktreePath(store: StateStore, claimId: string, workerStateId: string, worktreePath: string): void {
  withBusyRetry(() => {
    store.db.query("UPDATE target_claims SET worktree_path = ? WHERE id = ?").run(worktreePath, claimId);
    store.db.query("UPDATE worker_state SET worktree_path = ? WHERE id = ?").run(worktreePath, workerStateId);
  });
}

export function appendWorkerSessionId(store: StateStore, workerStateId: string, sessionId: string): void {
  immediateTransaction(store.db, () => {
    const row = store.db.query("SELECT worker_session_ids_json FROM worker_state WHERE id = ?").get(workerStateId) as
      | Record<string, unknown>
      | undefined;
    const ids = parseStringArray(row?.worker_session_ids_json);
    if (!ids.includes(sessionId)) ids.push(sessionId);
    store.db.query("UPDATE worker_state SET worker_session_ids_json = ? WHERE id = ?").run(jsonArray(ids), workerStateId);
  });
}

export function updateWorkerStateBaselineScore(store: StateStore, workerStateId: string, score: number | null): void {
  const baseline = finiteOrNull(score);
  if (baseline === null) return;
  withBusyRetry(() => {
    store.db
      .query(
        `
          UPDATE worker_state
          SET baseline_score = ?,
              best_score = CASE WHEN best_checkpoint_id IS NULL THEN ? ELSE best_score END
          WHERE id = ?
        `,
      )
      .run(baseline, baseline, workerStateId);
  });
}

function baselineScore(store: StateStore, workerStateId: string): number | null {
  const row = store.db.query("SELECT baseline_score FROM worker_state WHERE id = ?").get(workerStateId) as Record<string, unknown> | undefined;
  return finiteOrNull(row?.baseline_score);
}

function checkpointFromRow(row: Record<string, unknown>): WorkerCheckpointRecord {
  const oldScore = finiteOrNull(row.old_score);
  const newScore = finiteOrNull(row.new_score);
  return {
    id: String(row.id),
    workerStateId: String(row.worker_state_id),
    sessionId: String(row.session_id),
    epochId: String(row.epoch_id),
    epochTargetId: String(row.epoch_target_id),
    targetClaimId: String(row.target_claim_id),
    attemptIndex: Number(row.attempt_index),
    validationTime: String(row.validation_time),
    oldScore,
    newScore,
    delta: finiteOrNull(row.delta),
    exactMatch: Number(row.exact_match) === 1,
    hardGatesPassed: Number(row.hard_gates_passed) === 1,
    improvedOverBaseline: Number(row.improved_over_baseline) === 1,
    selectable: Number(row.selectable) === 1,
    selected: Number(row.selected) === 1,
    buildStatus: row.build_status == null ? null : String(row.build_status),
    qaStatus: row.qa_status == null ? null : String(row.qa_status),
    objdiffStatus: row.objdiff_status == null ? null : String(row.objdiff_status),
    validationStatus: String(row.validation_status),
    artifactPath: row.artifact_path == null ? null : String(row.artifact_path),
    patchPath: row.patch_path == null ? null : String(row.patch_path),
    diffPath: row.diff_path == null ? null : String(row.diff_path),
    failureReasons: parseStringArray(row.failure_reasons_json),
    metadata: {},
  };
}

export function bestCheckpointForWorkerState(store: StateStore, workerStateId: string): WorkerCheckpointRecord | null {
  const row = store.db
    .query(
      `
        SELECT *
        FROM worker_checkpoints
        WHERE worker_state_id = ?
          AND selectable = 1
        ORDER BY exact_match DESC, new_score DESC, validation_time ASC, attempt_index ASC
        LIMIT 1
      `,
    )
    .get(workerStateId) as Record<string, unknown> | undefined;
  return row ? checkpointFromRow(row) : null;
}

export function workerCheckpointsForWorkerState(store: StateStore, workerStateId: string): WorkerCheckpointRecord[] {
  const rows = store.db
    .query(
      `
        SELECT *
        FROM worker_checkpoints
        WHERE worker_state_id = ?
        ORDER BY attempt_index ASC, validation_time ASC
      `,
    )
    .all(workerStateId) as Record<string, unknown>[];
  return rows.map(checkpointFromRow);
}

export function recordWorkerCheckpoint(store: StateStore, input: WorkerCheckpointInput): WorkerCheckpointRecord {
  const id = randomUUID();
  const validationTime = now();
  const oldScore = finiteOrNull(input.oldScore);
  const newScore = finiteOrNull(input.newScore);
  const baseline = baselineScore(store, input.workerStateId);
  const delta = oldScore !== null && newScore !== null ? newScore - oldScore : null;
  const improvedOverStoredBaseline = baseline !== null && newScore !== null && newScore > baseline;
  const improvedOverValidationBaseline = delta === null ? improvedOverStoredBaseline : delta > 0;
  const exactAgainstStaleBaseline = input.exactMatch && improvedOverStoredBaseline;
  const improvedOverBaseline = improvedOverStoredBaseline && (improvedOverValidationBaseline || exactAgainstStaleBaseline);
  const selectable = input.hardGatesPassed && improvedOverBaseline;

  immediateTransaction(store.db, () => {
    store.db
      .query(
        `
          INSERT INTO worker_checkpoints (
            id, worker_state_id, session_id, epoch_id, epoch_target_id, target_claim_id,
            attempt_index, validation_time, old_score, new_score, delta, exact_match,
            hard_gates_passed, improved_over_baseline, selectable, selected,
            build_status, qa_status, objdiff_status, validation_status, artifact_path,
            patch_path, diff_path, failure_reasons_json, metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        input.workerStateId,
        input.sessionId,
        input.epochId,
        input.epochTargetId,
        input.targetClaimId,
        input.attemptIndex,
        validationTime,
        oldScore,
        newScore,
        delta,
        input.exactMatch ? 1 : 0,
        input.hardGatesPassed ? 1 : 0,
        improvedOverBaseline ? 1 : 0,
        selectable ? 1 : 0,
        input.buildStatus ?? null,
        input.qaStatus ?? null,
        input.objdiffStatus ?? null,
        input.validationStatus,
        input.artifactPath ?? null,
        input.patchPath ?? null,
        input.diffPath ?? null,
        JSON.stringify(input.failureReasons ?? []),
        jsonObject(input.metadata ?? {}),
      );

    const best = bestCheckpointForWorkerState(store, input.workerStateId);
    store.db.query("UPDATE worker_checkpoints SET selected = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE worker_state_id = ?").run(best?.id ?? "", input.workerStateId);
    store.db
      .query("UPDATE worker_state SET best_checkpoint_id = ?, best_score = ?, exact = ? WHERE id = ?")
      .run(best?.id ?? null, best?.newScore ?? baseline, best?.exactMatch ? 1 : 0, input.workerStateId);
  });

  return {
    ...input,
    id,
    validationTime,
    oldScore,
    newScore,
    delta,
    improvedOverBaseline,
    selectable,
    selected: false,
  };
}

export function closeWorkerState(store: StateStore, input: WorkerStateCloseInput): void {
  const endedAt = now();
  const epochTargetStatus = input.epochTargetStatus ?? "finished";
  immediateTransaction(store.db, () => {
    const row = store.db
      .query(
        `
          SELECT target_claim_id, epoch_target_id, epoch_id
          FROM worker_state
          WHERE id = ?
        `,
      )
      .get(input.workerStateId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Worker state not found: ${input.workerStateId}`);

    store.db
      .query(
        `
          UPDATE worker_state
          SET lifecycle_status = ?,
              ended_at = ?,
              timeout_summary = ?,
              error_summary = ?,
              summary_json = ?
          WHERE id = ?
        `,
      )
      .run(
        input.lifecycleStatus,
        endedAt,
        input.timeoutSummary ?? null,
        input.errorSummary ?? null,
        jsonObject(input.summary ?? {}),
        input.workerStateId,
      );
    store.db
      .query("UPDATE target_claims SET status = 'closed', closed_at = ?, close_reason = ? WHERE id = ?")
      .run(endedAt, input.lifecycleStatus, String(row.target_claim_id));
    if (epochTargetStatus === "admitted") {
      store.db.query("UPDATE epoch_targets SET status = 'admitted', claimed_at = NULL, finished_at = NULL WHERE id = ?").run(String(row.epoch_target_id));
    } else {
      store.db.query("UPDATE epoch_targets SET status = 'finished', finished_at = ? WHERE id = ?").run(endedAt, String(row.epoch_target_id));
    }
    store.db
      .query(
        `
          UPDATE epochs
          SET finished_count = (
            SELECT COUNT(*)
            FROM epoch_targets
            WHERE epoch_targets.epoch_id = epochs.id
              AND epoch_targets.status = 'finished'
          )
          WHERE id = ?
        `,
      )
      .run(String(row.epoch_id));
  });
}
