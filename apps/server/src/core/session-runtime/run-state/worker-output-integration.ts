import { randomUUID } from "node:crypto";
import { immediateTransaction, now, withBusyRetry, type StateStore } from "@server/core/orchestrator-state";

export type WorkerOutputIntegrationStatus =
  | "queued"
  | "applying"
  | "applied"
  | "conflict"
  | "skipped"
  | "failed"
  | "resolved"
  | "needs_rework"
  | "blocked"
  | "rejected"
  | "resolver_failed";

const APPLYING_STALE_MS = 15 * 60 * 1000;

export interface WorkerOutputIntegrationInput {
  sessionId: string;
  epochId: string;
  epochTargetId: string;
  targetClaimId: string;
  workerStateId: string;
  workerCheckpointId: string;
  targetKey?: string | null;
  patchPath?: string | null;
  diffPath?: string | null;
  writeSet?: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkerOutputIntegrationRecord {
  id: string;
  sessionId: string;
  epochId: string;
  epochTargetId: string;
  targetClaimId: string;
  workerStateId: string;
  workerCheckpointId: string | null;
  status: WorkerOutputIntegrationStatus;
  disposition: string | null;
  targetKey: string | null;
  patchPath: string | null;
  diffPath: string | null;
  itemPath: string | null;
  summaryPath: string | null;
  checkStdoutPath: string | null;
  checkStderrPath: string | null;
  applyStdoutPath: string | null;
  applyStderrPath: string | null;
  writeSet: string[];
  conflictPaths: string[];
  failureReasons: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface WorkerOutputIntegrationUpdate {
  status?: WorkerOutputIntegrationStatus;
  disposition?: string | null;
  itemPath?: string | null;
  summaryPath?: string | null;
  checkStdoutPath?: string | null;
  checkStderrPath?: string | null;
  applyStdoutPath?: string | null;
  applyStderrPath?: string | null;
  conflictPaths?: string[];
  failureReasons?: string[];
  metadata?: Record<string, unknown>;
  resolvedAt?: string | null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function encodeArray(value: string[]): string {
  return JSON.stringify(value);
}

function encodeObject(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function integrationFromRow(row: Record<string, unknown>): WorkerOutputIntegrationRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    epochId: String(row.epoch_id),
    epochTargetId: String(row.epoch_target_id),
    targetClaimId: String(row.target_claim_id),
    workerStateId: String(row.worker_state_id),
    workerCheckpointId: row.worker_checkpoint_id == null ? null : String(row.worker_checkpoint_id),
    status: String(row.status) as WorkerOutputIntegrationStatus,
    disposition: row.disposition == null ? null : String(row.disposition),
    targetKey: row.target_key == null ? null : String(row.target_key),
    patchPath: row.patch_path == null ? null : String(row.patch_path),
    diffPath: row.diff_path == null ? null : String(row.diff_path),
    itemPath: row.item_path == null ? null : String(row.item_path),
    summaryPath: row.summary_path == null ? null : String(row.summary_path),
    checkStdoutPath: row.check_stdout_path == null ? null : String(row.check_stdout_path),
    checkStderrPath: row.check_stderr_path == null ? null : String(row.check_stderr_path),
    applyStdoutPath: row.apply_stdout_path == null ? null : String(row.apply_stdout_path),
    applyStderrPath: row.apply_stderr_path == null ? null : String(row.apply_stderr_path),
    writeSet: stringArray(row.write_set_json),
    conflictPaths: stringArray(row.conflict_paths_json),
    failureReasons: stringArray(row.failure_reasons_json),
    metadata: jsonObject(row.metadata_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
  };
}

export function getWorkerOutputIntegration(store: StateStore, id: string): WorkerOutputIntegrationRecord | null {
  const row = withBusyRetry(
    () => store.db.query("SELECT * FROM worker_output_integrations WHERE id = ?").get(id) as Record<string, unknown> | undefined,
  );
  return row ? integrationFromRow(row) : null;
}

export function enqueueWorkerOutputIntegration(store: StateStore, input: WorkerOutputIntegrationInput): WorkerOutputIntegrationRecord {
  return immediateTransaction(store.db, () => {
    const existing = store.db
      .query("SELECT * FROM worker_output_integrations WHERE worker_checkpoint_id = ?")
      .get(input.workerCheckpointId) as Record<string, unknown> | undefined;
    if (existing) return integrationFromRow(existing);

    const id = randomUUID();
    const createdAt = now();
    store.db
      .query(
        `
          INSERT INTO worker_output_integrations (
            id, session_id, epoch_id, epoch_target_id, target_claim_id,
            worker_state_id, worker_checkpoint_id, status, disposition, target_key,
            patch_path, diff_path, write_set_json, conflict_paths_json,
            failure_reasons_json, metadata_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', NULL, ?, ?, ?, ?, '[]', '[]', ?, ?, ?)
        `,
      )
      .run(
        id,
        input.sessionId,
        input.epochId,
        input.epochTargetId,
        input.targetClaimId,
        input.workerStateId,
        input.workerCheckpointId,
        input.targetKey ?? null,
        input.patchPath ?? null,
        input.diffPath ?? null,
        encodeArray(input.writeSet ?? []),
        encodeObject(input.metadata ?? {}),
        createdAt,
        createdAt,
      );

    const row = store.db.query("SELECT * FROM worker_output_integrations WHERE id = ?").get(id) as Record<string, unknown>;
    return integrationFromRow(row);
  });
}

export function claimNextWorkerOutputIntegration(store: StateStore, sessionId: string): WorkerOutputIntegrationRecord | null {
  return immediateTransaction(store.db, () => {
    const updatedAt = now();
    const staleBefore = new Date(Date.now() - APPLYING_STALE_MS).toISOString();
    store.db
      .query(
        `
          UPDATE worker_output_integrations
          SET status = 'queued',
              disposition = 'stale_applying_requeued',
              updated_at = ?
          WHERE session_id = ?
            AND status = 'applying'
            AND updated_at < ?
        `,
      )
      .run(updatedAt, sessionId, staleBefore);

    const active = store.db
      .query("SELECT id FROM worker_output_integrations WHERE session_id = ? AND status = 'applying' LIMIT 1")
      .get(sessionId) as Record<string, unknown> | undefined;
    if (active) return null;

    const row = store.db
      .query(
        `
          SELECT *
          FROM worker_output_integrations
          WHERE session_id = ?
            AND status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
        `,
      )
      .get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;

    store.db.query("UPDATE worker_output_integrations SET status = 'applying', updated_at = ? WHERE id = ?").run(updatedAt, String(row.id));
    const updated = store.db.query("SELECT * FROM worker_output_integrations WHERE id = ?").get(String(row.id)) as Record<string, unknown>;
    return integrationFromRow(updated);
  });
}

export function nextWorkerOutputIntegrationConflictForResolver(
  store: StateStore,
  sessionId: string,
  excludedIds: Iterable<string> = [],
): WorkerOutputIntegrationRecord | null {
  return workerOutputIntegrationConflictsForResolver(store, sessionId, { excludedIds, limit: 1 })[0] ?? null;
}

export function workerOutputIntegrationConflictsForResolver(
  store: StateStore,
  sessionId: string,
  options: { excludedIds?: Iterable<string>; limit?: number } = {},
): WorkerOutputIntegrationRecord[] {
  const excluded = [...new Set([...(options.excludedIds ?? [])].filter(Boolean))];
  const exclusionSql = excluded.length > 0 ? `AND id NOT IN (${excluded.map(() => "?").join(", ")})` : "";
  const limit = Math.max(1, Math.floor(options.limit ?? 16));
  const rows = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT *
            FROM worker_output_integrations
            WHERE session_id = ?
              AND status = 'conflict'
              AND item_path IS NOT NULL
              AND item_path != ''
              ${exclusionSql}
            ORDER BY updated_at ASC, created_at ASC
            LIMIT ?
          `,
        )
        .all(sessionId, ...excluded, limit) as Record<string, unknown>[],
  );
  return rows.map((row) => integrationFromRow(row));
}

export function updateWorkerOutputIntegration(store: StateStore, id: string, patch: WorkerOutputIntegrationUpdate): WorkerOutputIntegrationRecord {
  return immediateTransaction(store.db, () => {
    const current = store.db.query("SELECT * FROM worker_output_integrations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!current) throw new Error(`Worker output integration not found: ${id}`);
    const record = integrationFromRow(current);
    const metadata = patch.metadata ? { ...record.metadata, ...patch.metadata } : record.metadata;
    store.db
      .query(
        `
          UPDATE worker_output_integrations
          SET status = ?,
              disposition = ?,
              item_path = ?,
              summary_path = ?,
              check_stdout_path = ?,
              check_stderr_path = ?,
              apply_stdout_path = ?,
              apply_stderr_path = ?,
              conflict_paths_json = ?,
              failure_reasons_json = ?,
              metadata_json = ?,
              updated_at = ?,
              resolved_at = ?
          WHERE id = ?
        `,
      )
      .run(
        patch.status ?? record.status,
        patch.disposition === undefined ? record.disposition : patch.disposition,
        patch.itemPath === undefined ? record.itemPath : patch.itemPath,
        patch.summaryPath === undefined ? record.summaryPath : patch.summaryPath,
        patch.checkStdoutPath === undefined ? record.checkStdoutPath : patch.checkStdoutPath,
        patch.checkStderrPath === undefined ? record.checkStderrPath : patch.checkStderrPath,
        patch.applyStdoutPath === undefined ? record.applyStdoutPath : patch.applyStdoutPath,
        patch.applyStderrPath === undefined ? record.applyStderrPath : patch.applyStderrPath,
        encodeArray(patch.conflictPaths ?? record.conflictPaths),
        encodeArray(patch.failureReasons ?? record.failureReasons),
        encodeObject(metadata),
        now(),
        patch.resolvedAt === undefined ? record.resolvedAt : patch.resolvedAt,
        id,
      );
    const updated = store.db.query("SELECT * FROM worker_output_integrations WHERE id = ?").get(id) as Record<string, unknown>;
    return integrationFromRow(updated);
  });
}

export function workerOutputIntegrationQueueSummary(store: StateStore, sessionId: string): Record<string, unknown> {
  const rows = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT status, COUNT(*) AS count
            FROM worker_output_integrations
            WHERE session_id = ?
            GROUP BY status
            ORDER BY status ASC
          `,
        )
        .all(sessionId) as Record<string, unknown>[],
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[String(row.status)] = Number(row.count ?? 0);
  const pending = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT id, worker_state_id, worker_checkpoint_id, status, target_key, patch_path, item_path, created_at, updated_at
            FROM worker_output_integrations
            WHERE session_id = ?
              AND status IN ('queued', 'applying', 'conflict', 'failed', 'needs_rework', 'blocked', 'resolver_failed')
            ORDER BY created_at ASC
          `,
        )
        .all(sessionId) as Record<string, unknown>[],
  );
  return {
    schema_version: "worker_output_integration_queue_summary_v1",
    run_id: sessionId,
    counts,
    pending,
  };
}

export function blockingWorkerOutputIntegrationCount(store: StateStore, sessionId: string): number {
  const row = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT COUNT(*) AS count
            FROM worker_output_integrations
            WHERE session_id = ?
              AND status IN ('queued', 'applying', 'conflict', 'failed', 'needs_rework', 'blocked', 'resolver_failed')
          `,
        )
        .get(sessionId) as Record<string, unknown>,
  );
  return Number(row.count ?? 0);
}
