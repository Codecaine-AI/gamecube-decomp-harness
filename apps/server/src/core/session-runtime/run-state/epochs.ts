import { randomUUID } from "node:crypto";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";

export type EpochSizeMode = "fixed" | "full";
export type EpochStatus = "active" | "completed" | "error" | "exhausted" | "paused";

export interface EpochSizeSpec {
  mode: EpochSizeMode;
  value: number | null;
}

export interface SchedulerEpochConfig {
  size: EpochSizeSpec;
  workerPoolSize: number;
  candidateWindow: number;
}

export interface SchedulerEpochRecord {
  id: string;
  sessionId: string;
  ordinal: number;
  size: EpochSizeSpec;
  workerPoolSize: number;
  candidateWindow: number;
  status: string;
  admittedCount: number;
  finishedCount: number;
  fastRefreshCount: number;
  boundaryStatus: string | null;
  routingSummary: Record<string, unknown>;
  createdAt: string;
  closedAt: string | null;
}

export interface SchedulerEpochCloseResult {
  epochId: string;
  status: string;
  finishedCount: number;
  closedAt: string;
}

export interface EpochAdmissionResult {
  epochId: string;
  candidateCount: number;
  admitted: number;
  skippedExisting: number;
  skippedMissingSource: number;
  size: EpochSizeSpec;
}

export interface ExistingEpochAdmissionResult {
  epochId: string;
  admitted: number;
  limit: number;
}

export interface EpochAvailabilityRefreshResult {
  epochId: string;
  availableBefore: number;
  availableAfter: number;
  inserted: number;
  workerPoolSize: number;
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
  workerPoolSize: number;
  candidateWindow: number;
  admitted: number;
  available: number;
  claimed: number;
  finished: number;
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

function existingTargetKeys(
  store: StateStore,
  sessionId: string,
  params: { epochId: string; allowPreviouslyFinished?: boolean },
): Set<string> {
  const rows = params.allowPreviouslyFinished
    ? (store.db
        .query(
          `
            SELECT target_key
            FROM epoch_targets
            WHERE session_id = ?
              AND (status != 'finished' OR epoch_id = ?)
          `,
        )
        .all(sessionId, params.epochId) as Record<string, unknown>[])
    : (store.db
        .query(
          `
            SELECT target_key
            FROM epoch_targets
            WHERE epoch_id = ?
            UNION
            SELECT epoch_targets.target_key
            FROM epoch_targets
            JOIN epochs ON epochs.id = epoch_targets.epoch_id
            WHERE epoch_targets.session_id = ?
              AND epochs.ordinal = (
                SELECT MAX(previous.ordinal)
                FROM epochs AS previous
                JOIN epochs AS current
                  ON current.session_id = previous.session_id
                WHERE current.id = ?
                  AND previous.ordinal < current.ordinal
              )
          `,
        )
        .all(params.epochId, sessionId, params.epochId) as Record<string, unknown>[]);
  return new Set(rows.map((row) => String(row.target_key)));
}

export function selectEpochAdmissionCandidates(params: {
  candidates: TargetCandidate[];
  existingKeys?: Set<string>;
  size: EpochSizeSpec;
}): {
  selected: TargetCandidate[];
  skippedExisting: number;
  skippedMissingSource: number;
} {
  const existingKeys = params.existingKeys ?? new Set<string>();
  const limit = params.size.mode === "full" ? Number.POSITIVE_INFINITY : Math.max(0, params.size.value ?? 0);
  const eligible: AdmissionCandidate[] = [];
  let skippedExisting = 0;
  let skippedMissingSource = 0;
  const seenKeys = new Set<string>();
  const bySource = new Map<string, AdmissionCandidate[]>();

  for (const candidate of params.candidates) {
    const sourcePath = candidate.sourcePath.trim();
    if (!sourcePath) {
      skippedMissingSource += 1;
      continue;
    }
    const key = targetKey(candidate.unit, candidate.symbol);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    seenKeys.add(key);
    const entry = { candidate, key, sourcePath };
    eligible.push(entry);
    const sourceEntries = bySource.get(sourcePath);
    if (sourceEntries) sourceEntries.push(entry);
    else bySource.set(sourcePath, [entry]);
  }

  const selected: AdmissionCandidate[] = [];
  while (selected.length < limit && selected.length < eligible.length) {
    let added = false;
    for (const sourceEntries of bySource.values()) {
      const next = sourceEntries.shift();
      if (!next) continue;
      selected.push(next);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }

  return { selected: selected.map((entry) => entry.candidate), skippedExisting, skippedMissingSource };
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
    sessionId: String(row.session_id),
    ordinal: Number(row.ordinal),
    size: { mode: sizeMode, value: sizeMode === "full" ? null : Number(row.size_value ?? 0) },
    workerPoolSize: Number(row.worker_pool_size),
    candidateWindow: Number(row.candidate_window),
    status: String(row.status),
    admittedCount: Number(row.admitted_count ?? 0),
    finishedCount: Number(row.finished_count ?? 0),
    fastRefreshCount: Number(row.fast_refresh_count ?? 0),
    boundaryStatus: row.boundary_status == null ? null : String(row.boundary_status),
    routingSummary,
    createdAt: String(row.created_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
  };
}

function nextEpochOrdinal(store: StateStore, sessionId: string): number {
  const row = store.db.query("SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal FROM epochs WHERE session_id = ?").get(sessionId) as
    | Record<string, unknown>
    | undefined;
  return Number(row?.ordinal ?? 1);
}

export function activeSchedulerEpoch(store: StateStore, sessionId: string): SchedulerEpochRecord | null {
  const row = store.db
    .query("SELECT * FROM epochs WHERE session_id = ? AND status = 'active' ORDER BY ordinal DESC LIMIT 1")
    .get(sessionId) as Record<string, unknown> | undefined;
  return row ? rowToEpoch(row) : null;
}

export function startSchedulerEpoch(store: StateStore, sessionId: string, config: SchedulerEpochConfig): SchedulerEpochRecord {
  const id = randomUUID();
  const createdAt = now();
  const workerPoolSize = normalizePositiveInt(config.workerPoolSize, config.size.value ?? 1);
  const candidateWindow = normalizePositiveInt(config.candidateWindow, workerPoolSize);
  return immediateTransaction(store.db, () => {
    const active = activeSchedulerEpoch(store, sessionId);
    if (active) return active;
    const ordinal = nextEpochOrdinal(store, sessionId);
    store.db
      .query(
        `
          INSERT INTO epochs (
            id, session_id, ordinal, size_mode, size_value, worker_pool_size,
            candidate_window, status, routing_summary_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', '{}', ?)
        `,
      )
      .run(id, sessionId, ordinal, config.size.mode, config.size.value, workerPoolSize, candidateWindow, createdAt);
    const row = store.db.query("SELECT * FROM epochs WHERE id = ?").get(id) as Record<string, unknown>;
    return rowToEpoch(row);
  });
}

export function closeSchedulerEpoch(
  store: StateStore,
  epochId: string,
  params: {
    status: EpochStatus;
    boundaryStatus?: string | null;
    routingSummary?: Record<string, unknown>;
  },
): SchedulerEpochCloseResult {
  const closedAt = now();
  return immediateTransaction(store.db, () => {
    const row = store.db.query("SELECT id FROM epochs WHERE id = ?").get(epochId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Epoch not found: ${epochId}`);
    store.db
      .query(
        `
          UPDATE epochs
          SET status = ?,
              finished_count = (
                SELECT COUNT(*)
                FROM epoch_targets
                WHERE epoch_targets.epoch_id = epochs.id
                  AND epoch_targets.status = 'finished'
              ),
              boundary_status = ?,
              routing_summary_json = ?,
              closed_at = ?
          WHERE id = ?
        `,
      )
      .run(params.status, params.boundaryStatus ?? params.status, JSON.stringify(params.routingSummary ?? {}), closedAt, epochId);
    const updated = store.db.query("SELECT finished_count, status FROM epochs WHERE id = ?").get(epochId) as Record<string, unknown>;
    return {
      epochId,
      status: String(updated.status),
      finishedCount: Number(updated.finished_count ?? 0),
      closedAt,
    };
  });
}

export function admitEpochTargets(
  store: StateStore,
  params: {
    epochId: string;
    runId: string;
    candidates: TargetCandidate[];
    size: EpochSizeSpec;
    workerPoolSize: number;
    allowPreviouslyFinished?: boolean;
  },
): EpochAdmissionResult {
  const insertTarget = store.db.query(
    `
      INSERT INTO epoch_targets (
        id, epoch_id, session_id, target_key, unit, symbol, source_path, size,
        baseline_score, priority, reason, admission_index, status, admitted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', ?)
    `,
  );

  return immediateTransaction(store.db, () => {
    const epoch = store.db.query("SELECT session_id FROM epochs WHERE id = ?").get(params.epochId) as Record<string, unknown> | undefined;
    if (!epoch) throw new Error(`Epoch not found: ${params.epochId}`);
    const sessionId = String(epoch.session_id);
    const startIndexRow = store.db
      .query("SELECT COALESCE(MAX(admission_index), -1) + 1 AS start_index FROM epoch_targets WHERE epoch_id = ?")
      .get(params.epochId) as Record<string, unknown> | undefined;
    const startIndex = Number(startIndexRow?.start_index ?? 0);
    const selected = selectEpochAdmissionCandidates({
      candidates: params.candidates,
      existingKeys: existingTargetKeys(store, sessionId, {
        epochId: params.epochId,
        allowPreviouslyFinished: params.allowPreviouslyFinished,
      }),
      size: params.size,
    });
    const admittedAt = now();
    selected.selected.forEach((candidate, index) => {
      const key = targetKey(candidate.unit, candidate.symbol);
      insertTarget.run(
        randomUUID(),
        params.epochId,
        sessionId,
        key,
        candidate.unit,
        candidate.symbol,
        candidate.sourcePath,
        candidate.size,
        candidate.fuzzy,
        candidate.priority,
        candidate.reason,
        startIndex + index,
        admittedAt,
      );
    });
    store.db.query("UPDATE epochs SET admitted_count = admitted_count + ? WHERE id = ?").run(selected.selected.length, params.epochId);
    return {
      epochId: params.epochId,
      candidateCount: params.candidates.length,
      admitted: selected.selected.length,
      skippedExisting: selected.skippedExisting,
      skippedMissingSource: selected.skippedMissingSource,
      size: params.size,
    };
  });
}

export function admitExistingEpochTargets(
  _store: StateStore,
  params: { epochId: string; runId: string; limit: number },
): ExistingEpochAdmissionResult {
  return { epochId: params.epochId, admitted: 0, limit: Math.max(0, Math.floor(params.limit)) };
}

export function refreshEpochTargetPriorities(
  store: StateStore,
  params: { epochId: string; runId: string; candidates: TargetCandidate[] },
): EpochPriorityRefreshResult {
  const selectTarget = store.db.query(`
    SELECT id, source_path, size, baseline_score, priority, reason
    FROM epoch_targets
    WHERE epoch_id = ?
      AND status = 'admitted'
      AND unit = ?
      AND symbol = ?
    LIMIT 1
  `);
  const updateTarget = store.db.query("UPDATE epoch_targets SET source_path = ?, size = ?, baseline_score = ?, priority = ?, reason = ? WHERE id = ?");

  return immediateTransaction(store.db, () => {
    let refreshed = 0;
    for (const candidate of params.candidates) {
      const row = selectTarget.get(params.epochId, candidate.unit, candidate.symbol) as Record<string, unknown> | undefined;
      if (!row) continue;
      const same =
        String(row.source_path ?? "") === candidate.sourcePath &&
        Number(row.size) === candidate.size &&
        Number(row.baseline_score) === candidate.fuzzy &&
        Number(row.priority) === candidate.priority &&
        String(row.reason ?? "") === candidate.reason;
      if (same) continue;
      updateTarget.run(candidate.sourcePath, candidate.size, candidate.fuzzy, candidate.priority, candidate.reason, String(row.id));
      refreshed += 1;
    }
    return { epochId: params.epochId, candidateCount: params.candidates.length, refreshed };
  });
}

export function recordSchedulerEpochFastRefresh(store: StateStore, epochId: string): number {
  store.db.query("UPDATE epochs SET fast_refresh_count = fast_refresh_count + 1 WHERE id = ?").run(epochId);
  const row = store.db.query("SELECT fast_refresh_count FROM epochs WHERE id = ?").get(epochId) as Record<string, unknown> | undefined;
  return Number(row?.fast_refresh_count ?? 0);
}

export function refreshEpochTargetAvailability(store: StateStore, epochId: string): EpochAvailabilityRefreshResult {
  const before = availableCountForEpoch(store, epochId);
  return {
    epochId,
    availableBefore: before,
    availableAfter: before,
    inserted: 0,
    workerPoolSize: before,
    skippedLockedSource: 0,
  };
}

function availableCountForEpoch(store: StateStore, epochId: string): number {
  const row = store.db
    .query("SELECT COUNT(*) AS count FROM epoch_targets WHERE epoch_id = ? AND status = 'admitted'")
    .get(epochId) as Record<string, unknown> | undefined;
  return Number(row?.count ?? 0);
}

export function schedulerEpochProgress(store: StateStore, epochId: string): EpochProgressSummary {
  const epoch = store.db.query("SELECT * FROM epochs WHERE id = ?").get(epochId) as Record<string, unknown> | undefined;
  if (!epoch) throw new Error(`Epoch not found: ${epochId}`);
  const counts = store.db
    .query(
      `
        SELECT status, COUNT(*) AS count
        FROM epoch_targets
        WHERE epoch_id = ?
        GROUP BY status
      `,
    )
    .all(epochId) as Record<string, unknown>[];
  const byStatus = new Map(counts.map((row) => [String(row.status), Number(row.count)]));
  const record = rowToEpoch(epoch);
  const admitted = Number(epoch.admitted_count ?? 0);
  const available = byStatus.get("admitted") ?? 0;
  const claimed = byStatus.get("claimed") ?? 0;
  const finished = byStatus.get("finished") ?? 0;
  return {
    epochId,
    ordinal: record.ordinal,
    size: record.size,
    workerPoolSize: record.workerPoolSize,
    candidateWindow: record.candidateWindow,
    admitted,
    available,
    claimed,
    finished,
    remaining: Math.max(0, admitted - finished),
    fastRefreshCount: record.fastRefreshCount,
    boundaryStatus: record.boundaryStatus,
    routingSummary: record.routingSummary,
  };
}
