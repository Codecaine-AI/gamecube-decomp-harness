import type { StateStore } from "@server/core/orchestrator-state";

export interface BackgroundKnowledgeSummary {
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
  return {
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
