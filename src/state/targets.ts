import { randomUUID } from "node:crypto";
import type { BoardSnapshot, TargetCandidate } from "../types/index.js";
import { immediateTransaction, now, type StateStore } from "./db.js";

export interface QueueRefillResult {
  candidateCount: number;
  inserted: number;
  minSchedulableSources: number;
  queuedAfter: number;
  queuedBefore: number;
  refreshed: number;
  schedulableAfter: number;
  schedulableBefore: number;
  skippedExisting: number;
  skippedLockedSource: number;
  skippedMissingSource: number;
  targetSize: number;
}

interface RefillCandidate {
  candidate: TargetCandidate;
  key: string;
  sourcePath: string;
}

function targetKey(unit: string, symbol: string): string {
  return `${unit}::${symbol}`;
}

function queuedCount(store: StateStore, runId: string): number {
  const row = store.db.query("SELECT COUNT(*) AS count FROM queue WHERE run_id = ? AND status = 'queued'").get(runId) as Record<string, unknown>;
  return Number(row.count ?? 0);
}

function schedulableSourceCount(store: StateStore, runId: string): number {
  const row = store.db
    .query(
      `
        SELECT COUNT(DISTINCT targets.source_path) AS count
        FROM queue
        JOIN targets ON targets.id = queue.target_id
        WHERE queue.run_id = ?
          AND queue.status = 'queued'
          AND targets.source_path IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM file_locks
            JOIN leases AS lock_leases ON lock_leases.id = file_locks.lease_id
            WHERE file_locks.path = targets.source_path
              AND lock_leases.status = 'active'
          )
      `,
    )
    .get(runId) as Record<string, unknown>;
  return Number(row.count ?? 0);
}

function targetKeysForRun(store: StateStore, runId: string): Set<string> {
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

function queuedSchedulableSources(store: StateStore, runId: string): Set<string> {
  const rows = store.db
    .query(
      `
        SELECT DISTINCT targets.source_path
        FROM queue
        JOIN targets ON targets.id = queue.target_id
        WHERE queue.run_id = ?
          AND queue.status = 'queued'
          AND targets.source_path IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM file_locks
            JOIN leases AS lock_leases ON lock_leases.id = file_locks.lease_id
            WHERE file_locks.path = targets.source_path
              AND lock_leases.status = 'active'
          )
      `,
    )
    .all(runId) as Record<string, unknown>[];
  return new Set(rows.map((row) => String(row.source_path)));
}

function selectRefillCandidates(params: {
  candidates: TargetCandidate[];
  existingKeys: Set<string>;
  lockedSources: Set<string>;
  needed: number;
  queuedSources: Set<string>;
}): {
  selected: RefillCandidate[];
  skippedExisting: number;
  skippedLockedSource: number;
  skippedMissingSource: number;
} {
  const eligible: RefillCandidate[] = [];
  let skippedExisting = 0;
  let skippedLockedSource = 0;
  let skippedMissingSource = 0;

  for (const candidate of params.candidates) {
    const sourcePath = candidate.sourcePath.trim();
    if (!sourcePath) {
      skippedMissingSource += 1;
      continue;
    }
    if (params.lockedSources.has(sourcePath)) {
      skippedLockedSource += 1;
      continue;
    }
    const key = targetKey(candidate.unit, candidate.symbol);
    if (params.existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    eligible.push({ candidate, key, sourcePath });
  }

  const selected: RefillCandidate[] = [];
  const selectedKeys = new Set<string>();
  const selectedSources = new Set(params.queuedSources);
  for (const entry of eligible) {
    if (selected.length >= params.needed) break;
    if (selectedSources.has(entry.sourcePath)) continue;
    selected.push(entry);
    selectedKeys.add(entry.key);
    selectedSources.add(entry.sourcePath);
  }
  for (const entry of eligible) {
    if (selected.length >= params.needed) break;
    if (selectedKeys.has(entry.key)) continue;
    selected.push(entry);
    selectedKeys.add(entry.key);
  }

  return { selected, skippedExisting, skippedLockedSource, skippedMissingSource };
}

function refreshQueuedTargetPriorities(store: StateStore, runId: string, candidates: TargetCandidate[]): number {
  const selectQueuedTarget = store.db.query(`
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
    FROM targets
    JOIN queue ON queue.target_id = targets.id
    WHERE targets.run_id = ?
      AND targets.unit = ?
      AND targets.symbol = ?
      AND queue.status = 'queued'
    ORDER BY queue.created_at ASC
    LIMIT 1
  `);
  const updateTarget = store.db.query("UPDATE targets SET source_path = ?, size = ?, fuzzy = ?, priority = ?, reason = ? WHERE id = ?");
  const updateQueue = store.db.query("UPDATE queue SET priority = ?, reason = ? WHERE id = ?");

  let refreshed = 0;
  for (const candidate of candidates) {
    const row = selectQueuedTarget.get(runId, candidate.unit, candidate.symbol) as Record<string, unknown> | undefined;
    if (!row) continue;

    const sameTarget =
      String(row.source_path ?? "") === candidate.sourcePath &&
      Number(row.size) === candidate.size &&
      Number(row.fuzzy) === candidate.fuzzy &&
      Number(row.target_priority) === candidate.priority &&
      String(row.target_reason ?? "") === candidate.reason;
    const sameQueue = Number(row.queue_priority) === candidate.priority && String(row.queue_reason ?? "") === candidate.reason;
    if (sameTarget && sameQueue) continue;

    updateTarget.run(candidate.sourcePath, candidate.size, candidate.fuzzy, candidate.priority, candidate.reason, String(row.target_id));
    updateQueue.run(candidate.priority, candidate.reason, String(row.queue_id));
    refreshed += 1;
  }
  return refreshed;
}

export function addBoardTargets(store: StateStore, runId: string, snapshot: BoardSnapshot): number {
  const insertTarget = store.db.query(
    "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertQueue = store.db.query(
    "INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const createdAt = now();
  return immediateTransaction(store.db, () => {
    let count = 0;
    for (const candidate of snapshot.candidates) {
      const targetId = randomUUID();
      insertTarget.run(
        targetId,
        runId,
        candidate.unit,
        candidate.symbol,
        candidate.sourcePath,
        candidate.size,
        candidate.fuzzy,
        "queued",
        candidate.priority,
        candidate.reason,
        createdAt,
      );
      insertQueue.run(randomUUID(), runId, targetId, candidate.priority, candidate.reason, "queued", createdAt);
      count += 1;
    }
    return count;
  });
}

export function refillQueuedTargets(
  store: StateStore,
  runId: string,
  candidates: TargetCandidate[],
  options: { targetSize: number; minSchedulableSources?: number },
): QueueRefillResult {
  const insertTarget = store.db.query(
    "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertQueue = store.db.query(
    "INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  return immediateTransaction(store.db, () => {
    const targetSize = Math.max(0, Math.floor(options.targetSize));
    const minSchedulableSources = Math.max(0, Math.floor(options.minSchedulableSources ?? 0));
    const queuedBefore = queuedCount(store, runId);
    const schedulableBefore = schedulableSourceCount(store, runId);
    const refreshed = refreshQueuedTargetPriorities(store, runId, candidates);
    const queuedAfterRefresh = queuedCount(store, runId);
    const schedulableAfterRefresh = schedulableSourceCount(store, runId);
    const needed = Math.max(targetSize - queuedAfterRefresh, minSchedulableSources - schedulableAfterRefresh, 0);
    if (needed <= 0) {
      return {
        candidateCount: candidates.length,
        inserted: 0,
        minSchedulableSources,
        queuedAfter: queuedAfterRefresh,
        queuedBefore,
        refreshed,
        schedulableAfter: schedulableAfterRefresh,
        schedulableBefore,
        skippedExisting: 0,
        skippedLockedSource: 0,
        skippedMissingSource: 0,
        targetSize,
      };
    }

    const selected = selectRefillCandidates({
      candidates,
      existingKeys: targetKeysForRun(store, runId),
      lockedSources: activeLockedSources(store),
      needed,
      queuedSources: queuedSchedulableSources(store, runId),
    });
    const createdAt = now();
    for (const entry of selected.selected) {
      const candidate = entry.candidate;
      const targetId = randomUUID();
      insertTarget.run(
        targetId,
        runId,
        candidate.unit,
        candidate.symbol,
        candidate.sourcePath,
        candidate.size,
        candidate.fuzzy,
        "queued",
        candidate.priority,
        `refill: ${candidate.reason}`,
        createdAt,
      );
      insertQueue.run(randomUUID(), runId, targetId, candidate.priority, `refill: ${candidate.reason}`, "queued", createdAt);
    }

    return {
      candidateCount: candidates.length,
      inserted: selected.selected.length,
      minSchedulableSources,
      queuedAfter: queuedCount(store, runId),
      queuedBefore,
      refreshed,
      schedulableAfter: schedulableSourceCount(store, runId),
      schedulableBefore,
      skippedExisting: selected.skippedExisting,
      skippedLockedSource: selected.skippedLockedSource,
      skippedMissingSource: selected.skippedMissingSource,
      targetSize,
    };
  });
}

export function prioritizeQueuedTargets(store: StateStore, runId: string, candidates: TargetCandidate[]): number {
  const selectTarget = store.db.query(
    "SELECT id, status FROM targets WHERE run_id = ? AND unit = ? AND symbol = ? ORDER BY created_at ASC LIMIT 1",
  );
  const selectOpenQueue = store.db.query(
    `
      SELECT id, status, priority
      FROM queue
      WHERE run_id = ?
        AND target_id = ?
        AND status IN ('queued', 'leased')
      ORDER BY
        CASE WHEN status = 'queued' THEN 0 ELSE 1 END,
        priority DESC,
        created_at ASC
      LIMIT 1
    `,
  );
  const insertTarget = store.db.query(
    "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertQueue = store.db.query(
    "INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const updateTarget = store.db.query("UPDATE targets SET source_path = ?, size = ?, fuzzy = ?, priority = ?, reason = ? WHERE id = ?");
  const updateTargetQueued = store.db.query("UPDATE targets SET source_path = ?, size = ?, fuzzy = ?, status = 'queued', priority = ?, reason = ? WHERE id = ?");
  const updateQueue = store.db.query("UPDATE queue SET priority = ?, reason = ? WHERE id = ? AND status = 'queued'");
  const createdAt = now();

  return immediateTransaction(store.db, () => {
    let count = 0;
    for (const candidate of candidates) {
      const existingTarget = selectTarget.get(runId, candidate.unit, candidate.symbol) as Record<string, unknown> | undefined;
      if (existingTarget) {
        const targetId = String(existingTarget.id);
        const existingQueue = selectOpenQueue.get(runId, targetId) as Record<string, unknown> | undefined;
        const existingPriority = Number(existingQueue?.priority ?? Number.NEGATIVE_INFINITY);

        if (existingQueue?.status === "queued") {
          if (candidate.priority <= existingPriority) continue;
          updateTarget.run(candidate.sourcePath, candidate.size, candidate.fuzzy, candidate.priority, candidate.reason, targetId);
          updateQueue.run(candidate.priority, candidate.reason, String(existingQueue.id));
          count += 1;
        } else if (!existingQueue) {
          updateTargetQueued.run(candidate.sourcePath, candidate.size, candidate.fuzzy, candidate.priority, candidate.reason, targetId);
          insertQueue.run(randomUUID(), runId, targetId, candidate.priority, candidate.reason, "queued", createdAt);
          count += 1;
        }
        continue;
      }

      const targetId = randomUUID();
      insertTarget.run(
        targetId,
        runId,
        candidate.unit,
        candidate.symbol,
        candidate.sourcePath,
        candidate.size,
        candidate.fuzzy,
        "queued",
        candidate.priority,
        candidate.reason,
        createdAt,
      );
      insertQueue.run(randomUUID(), runId, targetId, candidate.priority, candidate.reason, "queued", createdAt);
      count += 1;
    }
    return count;
  });
}
