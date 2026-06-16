import { randomUUID } from "node:crypto";
import type { TargetCandidate } from "../types/index.js";
import { immediateTransaction, now, type StateStore } from "./db.js";

export type EpochSizeMode = "fixed" | "full";

export interface EpochSizeSpec {
  mode: EpochSizeMode;
  value: number | null;
}

export interface SchedulerEpochConfig {
  size: EpochSizeSpec;
  readyQueueSize: number;
  candidateWindow: number;
}

export interface SchedulerEpochRecord {
  id: string;
  runId: string;
  ordinal: number;
  size: EpochSizeSpec;
  readyQueueSize: number;
  candidateWindow: number;
  status: string;
  admittedCount: number;
  completedCount: number;
  fastRefreshCount: number;
  boundaryStatus: string | null;
  routingSummary: Record<string, unknown>;
  createdAt: string;
  closedAt: string | null;
}

export interface SchedulerEpochCloseResult {
  epochId: string;
  status: string;
  completedCount: number;
  closedAt: string;
}

export interface EpochAdmissionResult {
  epochId: string;
  candidateCount: number;
  admitted: number;
  queued: number;
  readyQueueSize: number;
  skippedExisting: number;
  skippedLockedSource: number;
  skippedMissingSource: number;
  size: EpochSizeSpec;
}

export interface ExistingEpochAdmissionResult {
  epochId: string;
  admitted: number;
  limit: number;
}

export interface EpochReadyRefillResult {
  epochId: string;
  queuedBefore: number;
  queuedAfter: number;
  inserted: number;
  readyQueueSize: number;
  skippedLockedSource: number;
}

export interface EpochPriorityRefreshResult {
  epochId: string;
  candidateCount: number;
  refreshed: number;
}

export interface EpochProgressSummary {
  epochId: string;
  ordinal: number;
  size: EpochSizeSpec;
  readyQueueSize: number;
  candidateWindow: number;
  admitted: number;
  readyQueued: number;
  leased: number;
  completed: number;
  remaining: number;
  fastRefreshCount: number;
  boundaryStatus: string | null;
  routingSummary: Record<string, unknown>;
}

interface AdmissionCandidate {
  candidate: TargetCandidate;
  key: string;
  sourcePath: string;
}

export function parseEpochSize(value: string | number): EpochSizeSpec {
  if (typeof value === "number") {
    const parsed = Math.floor(value);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid epoch size: ${String(value)}`);
    return { mode: "fixed", value: parsed };
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "full") return { mode: "full", value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) throw new Error(`Invalid epoch size: ${value}`);
  return { mode: "fixed", value: parsed };
}

export function epochSizeLabel(size: EpochSizeSpec): string {
  return size.mode === "full" ? "full" : String(size.value);
}

function targetKey(unit: string, symbol: string): string {
  return `${unit}::${symbol}`;
}

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return Math.max(1, Math.floor(fallback));
  return Math.max(1, Math.floor(value));
}

function existingTargetKeys(store: StateStore, runId: string): Set<string> {
  const rows = store.db.query("SELECT unit, symbol FROM targets WHERE run_id = ?").all(runId) as Record<string, unknown>[];
  return new Set(rows.map((row) => targetKey(String(row.unit), String(row.symbol))));
}

function activeLockedSources(store: StateStore): Set<string> {
  const rows = store.db
    .query(
      `
        SELECT file_locks.path
        FROM file_locks
        JOIN leases ON leases.id = file_locks.lease_id
        WHERE leases.status = 'active'
      `,
    )
    .all() as Record<string, unknown>[];
  return new Set(rows.map((row) => String(row.path)));
}

export function selectEpochAdmissionCandidates(params: {
  candidates: TargetCandidate[];
  existingKeys?: Set<string>;
  lockedSources?: Set<string>;
  size: EpochSizeSpec;
}): {
  selected: TargetCandidate[];
  skippedExisting: number;
  skippedLockedSource: number;
  skippedMissingSource: number;
} {
  const existingKeys = params.existingKeys ?? new Set<string>();
  const lockedSources = params.lockedSources ?? new Set<string>();
  const limit = params.size.mode === "full" ? Number.POSITIVE_INFINITY : Math.max(0, params.size.value ?? 0);
  const eligible: AdmissionCandidate[] = [];
  let skippedExisting = 0;
  let skippedLockedSource = 0;
  let skippedMissingSource = 0;

  for (const candidate of params.candidates) {
    const sourcePath = candidate.sourcePath.trim();
    if (!sourcePath) {
      skippedMissingSource += 1;
      continue;
    }
    if (lockedSources.has(sourcePath)) {
      skippedLockedSource += 1;
      continue;
    }
    const key = targetKey(candidate.unit, candidate.symbol);
    if (existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    eligible.push({ candidate, key, sourcePath });
  }

  const bySource = new Map<string, AdmissionCandidate[]>();
  const seenKeys = new Set<string>();
  for (const entry of eligible) {
    if (seenKeys.has(entry.key)) continue;
    seenKeys.add(entry.key);
    const group = bySource.get(entry.sourcePath);
    if (group) group.push(entry);
    else bySource.set(entry.sourcePath, [entry]);
  }

  const selected: TargetCandidate[] = [];
  const sources = [...bySource.keys()];
  for (let round = 0; selected.length < limit; round += 1) {
    let pickedAny = false;
    for (const source of sources) {
      if (selected.length >= limit) break;
      const entry = bySource.get(source)?.[round];
      if (!entry) continue;
      selected.push(entry.candidate);
      pickedAny = true;
    }
    if (!pickedAny) break;
  }

  return { selected, skippedExisting, skippedLockedSource, skippedMissingSource };
}

function rowToEpoch(row: Record<string, unknown>): SchedulerEpochRecord {
  const sizeMode = String(row.size_mode) === "full" ? "full" : "fixed";
  const routingRaw = String(row.routing_summary_json ?? "{}");
  let routingSummary: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(routingRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) routingSummary = parsed as Record<string, unknown>;
  } catch {
    routingSummary = {};
  }
  return {
    id: String(row.id),
    runId: String(row.run_id),
    ordinal: Number(row.ordinal),
    size: { mode: sizeMode, value: sizeMode === "full" ? null : Number(row.size_value ?? 0) },
    readyQueueSize: Number(row.ready_queue_size),
    candidateWindow: Number(row.candidate_window),
    status: String(row.status),
    admittedCount: Number(row.admitted_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    fastRefreshCount: Number(row.fast_refresh_count ?? 0),
    boundaryStatus: row.boundary_status == null ? null : String(row.boundary_status),
    routingSummary,
    createdAt: String(row.created_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
  };
}

function nextEpochOrdinal(store: StateStore, runId: string): number {
  const row = store.db.query("SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal FROM scheduler_epochs WHERE run_id = ?").get(runId) as
    | Record<string, unknown>
    | undefined;
  return Number(row?.ordinal ?? 1);
}

export function activeSchedulerEpoch(store: StateStore, runId: string): SchedulerEpochRecord | null {
  const row = store.db
    .query("SELECT * FROM scheduler_epochs WHERE run_id = ? AND status = 'active' ORDER BY ordinal DESC LIMIT 1")
    .get(runId) as Record<string, unknown> | undefined;
  return row ? rowToEpoch(row) : null;
}

export function startSchedulerEpoch(store: StateStore, runId: string, config: SchedulerEpochConfig): SchedulerEpochRecord {
  const id = randomUUID();
  const createdAt = now();
  const readyQueueSize = normalizePositiveInt(config.readyQueueSize, config.size.value ?? 1);
  const candidateWindow = normalizePositiveInt(config.candidateWindow, readyQueueSize);
  return immediateTransaction(store.db, () => {
    const active = activeSchedulerEpoch(store, runId);
    if (active) return active;
    const ordinal = nextEpochOrdinal(store, runId);
    store.db
      .query(
        `
          INSERT INTO scheduler_epochs (
            id, run_id, ordinal, size_mode, size_value, ready_queue_size,
            candidate_window, status, routing_summary_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', '{}', ?)
        `,
      )
      .run(id, runId, ordinal, config.size.mode, config.size.value, readyQueueSize, candidateWindow, createdAt);
    const row = store.db.query("SELECT * FROM scheduler_epochs WHERE id = ?").get(id) as Record<string, unknown>;
    return rowToEpoch(row);
  });
}

export function closeSchedulerEpoch(
  store: StateStore,
  epochId: string,
  params: {
    status: "completed" | "error" | "exhausted" | "paused";
    boundaryStatus?: string | null;
    routingSummary?: Record<string, unknown>;
  },
): SchedulerEpochCloseResult {
  const closedAt = now();
  return immediateTransaction(store.db, () => {
    const row = store.db.query("SELECT id FROM scheduler_epochs WHERE id = ?").get(epochId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Scheduler epoch not found: ${epochId}`);
    store.db
      .query(
        `
          UPDATE scheduler_epochs
          SET status = ?,
              completed_count = (
                SELECT COUNT(*)
                FROM scheduler_epoch_targets
                WHERE scheduler_epoch_targets.epoch_id = scheduler_epochs.id
                  AND scheduler_epoch_targets.status = 'completed'
              ),
              boundary_status = ?,
              routing_summary_json = ?,
              closed_at = ?
          WHERE id = ?
        `,
      )
      .run(params.status, params.boundaryStatus ?? params.status, JSON.stringify(params.routingSummary ?? {}), closedAt, epochId);
    const updated = store.db.query("SELECT completed_count, status FROM scheduler_epochs WHERE id = ?").get(epochId) as Record<string, unknown>;
    return {
      epochId,
      status: String(updated.status),
      completedCount: Number(updated.completed_count ?? 0),
      closedAt,
    };
  });
}

function activeQueuedCountForEpoch(store: StateStore, epochId: string): number {
  const row = store.db
    .query(
      `
        SELECT COUNT(*) AS count
        FROM scheduler_epoch_targets
        JOIN queue ON queue.target_id = scheduler_epoch_targets.target_id
        WHERE scheduler_epoch_targets.epoch_id = ?
          AND queue.status = 'queued'
      `,
    )
    .get(epochId) as Record<string, unknown> | undefined;
  return Number(row?.count ?? 0);
}

function queueEpochTarget(store: StateStore, params: { epochId: string; targetId: string; priority: number; reason: string; queuedAt: string }): void {
  store.db
    .query("INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at) SELECT ?, run_id, id, ?, ?, 'queued', ? FROM targets WHERE id = ?")
    .run(randomUUID(), params.priority, params.reason, params.queuedAt, params.targetId);
  store.db.query("UPDATE targets SET status = 'queued' WHERE id = ?").run(params.targetId);
  store.db
    .query("UPDATE scheduler_epoch_targets SET status = 'queued', queued_at = ? WHERE epoch_id = ? AND target_id = ?")
    .run(params.queuedAt, params.epochId, params.targetId);
}

export function admitEpochTargets(
  store: StateStore,
  params: {
    epochId: string;
    runId: string;
    candidates: TargetCandidate[];
    size: EpochSizeSpec;
    readyQueueSize: number;
  },
): EpochAdmissionResult {
  const insertTarget = store.db.query(
    "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertMembership = store.db.query(
    `
      INSERT INTO scheduler_epoch_targets (
        epoch_id, run_id, target_id, admission_index, status, admitted_at, queued_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  );

  return immediateTransaction(store.db, () => {
    const startIndexRow = store.db
      .query("SELECT COALESCE(MAX(admission_index), -1) + 1 AS start_index FROM scheduler_epoch_targets WHERE epoch_id = ?")
      .get(params.epochId) as Record<string, unknown> | undefined;
    const startIndex = Number(startIndexRow?.start_index ?? 0);
    const selected = selectEpochAdmissionCandidates({
      candidates: params.candidates,
      existingKeys: existingTargetKeys(store, params.runId),
      lockedSources: activeLockedSources(store),
      size: params.size,
    });
    const readyQueueSize = normalizePositiveInt(params.readyQueueSize, (params.size.value ?? selected.selected.length) || 1);
    const createdAt = now();
    let queued = 0;
    selected.selected.forEach((candidate, index) => {
      const targetId = randomUUID();
      const shouldQueue = queued < readyQueueSize;
      const status = shouldQueue ? "queued" : "admitted";
      const reason = `epoch ${params.epochId}: ${candidate.reason}`;
      insertTarget.run(
        targetId,
        params.runId,
        candidate.unit,
        candidate.symbol,
        candidate.sourcePath,
        candidate.size,
        candidate.fuzzy,
        status,
        candidate.priority,
        reason,
        createdAt,
      );
      insertMembership.run(params.epochId, params.runId, targetId, startIndex + index, status, createdAt, shouldQueue ? createdAt : null);
      if (shouldQueue) {
        store.db
          .query("INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'queued', ?)")
          .run(randomUUID(), params.runId, targetId, candidate.priority, reason, createdAt);
        queued += 1;
      }
    });
    store.db
      .query("UPDATE scheduler_epochs SET admitted_count = admitted_count + ? WHERE id = ?")
      .run(selected.selected.length, params.epochId);
    return {
      epochId: params.epochId,
      candidateCount: params.candidates.length,
      admitted: selected.selected.length,
      queued,
      readyQueueSize,
      skippedExisting: selected.skippedExisting,
      skippedLockedSource: selected.skippedLockedSource,
      skippedMissingSource: selected.skippedMissingSource,
      size: params.size,
    };
  });
}

export function admitExistingQueuedEpochTargets(
  store: StateStore,
  params: { epochId: string; runId: string; limit: number },
): ExistingEpochAdmissionResult {
  const limit = Math.max(0, Math.floor(params.limit));
  if (limit <= 0) return { epochId: params.epochId, admitted: 0, limit };
  const insertMembership = store.db.query(
    `
      INSERT INTO scheduler_epoch_targets (
        epoch_id, run_id, target_id, admission_index, status, admitted_at, queued_at, leased_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  return immediateTransaction(store.db, () => {
    const startIndexRow = store.db
      .query("SELECT COALESCE(MAX(admission_index), -1) + 1 AS start_index FROM scheduler_epoch_targets WHERE epoch_id = ?")
      .get(params.epochId) as Record<string, unknown> | undefined;
    const startIndex = Number(startIndexRow?.start_index ?? 0);
    const admittedAt = now();
    const rows = store.db
      .query(
        `
          SELECT
            queue.target_id,
            queue.status AS queue_status,
            queue.created_at,
            queue.leased_at
          FROM queue
          WHERE queue.run_id = ?
            AND queue.status IN ('queued', 'leased')
            AND NOT EXISTS (
              SELECT 1
              FROM scheduler_epoch_targets
              WHERE scheduler_epoch_targets.epoch_id = ?
                AND scheduler_epoch_targets.target_id = queue.target_id
            )
          ORDER BY queue.priority DESC, queue.created_at ASC
          LIMIT ?
        `,
      )
      .all(params.runId, params.epochId, limit) as Record<string, unknown>[];
    rows.forEach((row, index) => {
      const status = String(row.queue_status) === "leased" ? "leased" : "queued";
      const queuedAt = row.created_at == null ? admittedAt : String(row.created_at);
      const leasedAt = row.leased_at == null ? null : String(row.leased_at);
      insertMembership.run(params.epochId, params.runId, String(row.target_id), startIndex + index, status, admittedAt, queuedAt, leasedAt);
    });
    store.db
      .query("UPDATE scheduler_epochs SET admitted_count = admitted_count + ? WHERE id = ?")
      .run(rows.length, params.epochId);
    return { epochId: params.epochId, admitted: rows.length, limit };
  });
}


export function refreshEpochQueuedTargetPriorities(
  store: StateStore,
  params: { epochId: string; runId: string; candidates: TargetCandidate[] },
): EpochPriorityRefreshResult {
  const selectQueuedEpochTarget = store.db.query(`
    SELECT
      targets.id AS target_id,
      targets.source_path AS source_path,
      targets.size AS size,
      targets.fuzzy AS fuzzy,
      targets.priority AS target_priority,
      targets.reason AS target_reason,
      queue.id AS queue_id,
      queue.priority AS queue_priority,
      queue.reason AS queue_reason
    FROM scheduler_epoch_targets
    JOIN targets ON targets.id = scheduler_epoch_targets.target_id
    JOIN queue ON queue.target_id = targets.id
    WHERE scheduler_epoch_targets.epoch_id = ?
      AND scheduler_epoch_targets.run_id = ?
      AND scheduler_epoch_targets.status = 'queued'
      AND queue.status = 'queued'
      AND targets.unit = ?
      AND targets.symbol = ?
    ORDER BY queue.created_at ASC
    LIMIT 1
  `);
  const updateTarget = store.db.query("UPDATE targets SET source_path = ?, size = ?, fuzzy = ?, priority = ?, reason = ? WHERE id = ?");
  const updateQueue = store.db.query("UPDATE queue SET priority = ?, reason = ? WHERE id = ?");

  return immediateTransaction(store.db, () => {
    let refreshed = 0;
    for (const candidate of params.candidates) {
      const row = selectQueuedEpochTarget.get(params.epochId, params.runId, candidate.unit, candidate.symbol) as Record<string, unknown> | undefined;
      if (!row) continue;
      const reason = `epoch refresh: ${candidate.reason}`;
      const sameTarget =
        String(row.source_path ?? "") === candidate.sourcePath &&
        Number(row.size) === candidate.size &&
        Number(row.fuzzy) === candidate.fuzzy &&
        Number(row.target_priority) === candidate.priority &&
        String(row.target_reason ?? "") === reason;
      const sameQueue = Number(row.queue_priority) === candidate.priority && String(row.queue_reason ?? "") === reason;
      if (sameTarget && sameQueue) continue;
      updateTarget.run(candidate.sourcePath, candidate.size, candidate.fuzzy, candidate.priority, reason, String(row.target_id));
      updateQueue.run(candidate.priority, reason, String(row.queue_id));
      refreshed += 1;
    }
    return { epochId: params.epochId, candidateCount: params.candidates.length, refreshed };
  });
}

export function recordSchedulerEpochFastRefresh(store: StateStore, epochId: string): number {
  store.db.query("UPDATE scheduler_epochs SET fast_refresh_count = fast_refresh_count + 1 WHERE id = ?").run(epochId);
  const row = store.db.query("SELECT fast_refresh_count FROM scheduler_epochs WHERE id = ?").get(epochId) as Record<string, unknown> | undefined;
  return Number(row?.fast_refresh_count ?? 0);
}

export function refillEpochReadyQueue(store: StateStore, epochId: string): EpochReadyRefillResult {
  return immediateTransaction(store.db, () => {
    const epoch = store.db.query("SELECT * FROM scheduler_epochs WHERE id = ?").get(epochId) as Record<string, unknown> | undefined;
    if (!epoch) throw new Error(`Scheduler epoch not found: ${epochId}`);
    const readyQueueSize = Number(epoch.ready_queue_size);
    const queuedBefore = activeQueuedCountForEpoch(store, epochId);
    const needed = Math.max(0, readyQueueSize - queuedBefore);
    if (needed <= 0) {
      return {
        epochId,
        queuedBefore,
        queuedAfter: queuedBefore,
        inserted: 0,
        readyQueueSize,
        skippedLockedSource: 0,
      };
    }
    const lockedSources = activeLockedSources(store);
    const rows = store.db
      .query(
        `
          SELECT
            scheduler_epoch_targets.target_id,
            targets.source_path,
            targets.priority,
            targets.reason
          FROM scheduler_epoch_targets
          JOIN targets ON targets.id = scheduler_epoch_targets.target_id
          WHERE scheduler_epoch_targets.epoch_id = ?
            AND scheduler_epoch_targets.status = 'admitted'
          ORDER BY scheduler_epoch_targets.admission_index ASC
        `,
      )
      .all(epochId) as Record<string, unknown>[];

    let inserted = 0;
    let skippedLockedSource = 0;
    const queuedAt = now();
    for (const row of rows) {
      if (inserted >= needed) break;
      const sourcePath = String(row.source_path ?? "").trim();
      if (!sourcePath || lockedSources.has(sourcePath)) {
        skippedLockedSource += 1;
        continue;
      }
      queueEpochTarget(store, {
        epochId,
        targetId: String(row.target_id),
        priority: Number(row.priority),
        reason: String(row.reason ?? "epoch ready refill"),
        queuedAt,
      });
      inserted += 1;
    }

    return {
      epochId,
      queuedBefore,
      queuedAfter: activeQueuedCountForEpoch(store, epochId),
      inserted,
      readyQueueSize,
      skippedLockedSource,
    };
  });
}

export function markEpochTargetLeased(store: StateStore, queueId: string, leasedAt = now()): void {
  store.db
    .query(
      `
        UPDATE scheduler_epoch_targets
        SET status = 'leased', leased_at = ?
        WHERE target_id = (SELECT target_id FROM queue WHERE id = ?)
          AND status = 'queued'
      `,
    )
    .run(leasedAt, queueId);
}

export function markEpochTargetCompleted(store: StateStore, leaseId: string, completedAt = now()): void {
  store.db
    .query(
      `
        UPDATE scheduler_epoch_targets
        SET status = 'completed', completed_at = ?
        WHERE target_id = (
          SELECT queue.target_id
          FROM queue
          JOIN leases ON leases.queue_id = queue.id
          WHERE leases.id = ?
        )
          AND status IN ('queued', 'leased')
      `,
    )
    .run(completedAt, leaseId);
  store.db
    .query(
      `
        UPDATE scheduler_epochs
        SET completed_count = (
          SELECT COUNT(*)
          FROM scheduler_epoch_targets
          WHERE scheduler_epoch_targets.epoch_id = scheduler_epochs.id
            AND scheduler_epoch_targets.status = 'completed'
        )
        WHERE id IN (
          SELECT epoch_id
          FROM scheduler_epoch_targets
          WHERE target_id = (
            SELECT queue.target_id
            FROM queue
            JOIN leases ON leases.queue_id = queue.id
            WHERE leases.id = ?
          )
        )
      `,
    )
    .run(leaseId);
}

export function markEpochTargetRequeued(store: StateStore, leaseId: string, queuedAt = now()): void {
  store.db
    .query(
      `
        UPDATE scheduler_epoch_targets
        SET status = 'queued', queued_at = COALESCE(queued_at, ?), leased_at = NULL
        WHERE target_id = (
          SELECT queue.target_id
          FROM queue
          JOIN leases ON leases.queue_id = queue.id
          WHERE leases.id = ?
        )
          AND status = 'leased'
      `,
    )
    .run(queuedAt, leaseId);
}

export function schedulerEpochProgress(store: StateStore, epochId: string): EpochProgressSummary {
  const epoch = store.db.query("SELECT * FROM scheduler_epochs WHERE id = ?").get(epochId) as Record<string, unknown> | undefined;
  if (!epoch) throw new Error(`Scheduler epoch not found: ${epochId}`);
  const counts = store.db
    .query(
      `
        SELECT status, COUNT(*) AS count
        FROM scheduler_epoch_targets
        WHERE epoch_id = ?
        GROUP BY status
      `,
    )
    .all(epochId) as Record<string, unknown>[];
  const byStatus = new Map(counts.map((row) => [String(row.status), Number(row.count)]));
  const record = rowToEpoch(epoch);
  const admitted = Number(epoch.admitted_count ?? 0);
  const readyQueued = byStatus.get("queued") ?? 0;
  const leased = byStatus.get("leased") ?? 0;
  const completed = byStatus.get("completed") ?? 0;
  return {
    epochId,
    ordinal: record.ordinal,
    size: record.size,
    readyQueueSize: record.readyQueueSize,
    candidateWindow: record.candidateWindow,
    admitted,
    readyQueued,
    leased,
    completed,
    remaining: Math.max(0, admitted - completed),
    fastRefreshCount: record.fastRefreshCount,
    boundaryStatus: record.boundaryStatus,
    routingSummary: record.routingSummary,
  };
}
