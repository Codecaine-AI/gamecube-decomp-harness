import { immediateTransaction, withBusyRetry, writeSetHash, now, type StateStore } from "./db.js";
import { randomUUID } from "node:crypto";

export interface LeasedTarget {
  leaseId: string;
  queueId: string;
  workerId: string;
  targetId: string;
  target: Record<string, unknown>;
  writeSet: string[];
  ttl: string;
}

export interface ActiveLeaseRecord {
  leaseId: string;
  queueId: string;
  workerId: string;
  baseRev: string;
  ttl: string;
  heartbeatAt: string;
  targetId: string;
  target: Record<string, unknown>;
  writeSet: string[];
}

export function activeWorkerCount(store: StateStore, runId: string): number {
  const row = withBusyRetry(
    () =>
      store.db
        .query("SELECT COUNT(*) AS count FROM leases JOIN queue ON leases.queue_id = queue.id WHERE queue.run_id = ? AND leases.status = 'active'")
        .get(runId) as Record<string, unknown>,
  );
  return Number(row.count ?? 0);
}

export function activeLeasesForRun(store: StateStore, runId: string): ActiveLeaseRecord[] {
  const rows = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT
              leases.id AS lease_id,
              leases.queue_id,
              leases.worker_id,
              leases.base_rev,
              leases.ttl,
              leases.heartbeat_at,
              targets.id AS target_id,
              targets.unit,
              targets.symbol,
              targets.source_path,
              targets.size,
              targets.fuzzy,
              targets.matched,
              targets.complete,
              targets.risk,
              targets.status AS target_status,
              targets.priority,
              targets.reason
            FROM leases
            JOIN queue ON queue.id = leases.queue_id
            JOIN targets ON targets.id = queue.target_id
            WHERE queue.run_id = ?
              AND leases.status = 'active'
            ORDER BY leases.heartbeat_at ASC
          `,
        )
        .all(runId) as Record<string, unknown>[],
  );

  return rows.map((row) => ({
    leaseId: String(row.lease_id),
    queueId: String(row.queue_id),
    workerId: String(row.worker_id),
    baseRev: String(row.base_rev ?? "unknown"),
    ttl: String(row.ttl),
    heartbeatAt: String(row.heartbeat_at),
    targetId: String(row.target_id),
    target: {
      target_id: String(row.target_id),
      unit: String(row.unit),
      symbol: String(row.symbol),
      source_path: String(row.source_path),
      size: Number(row.size),
      fuzzy: Number(row.fuzzy),
      matched: row.matched == null ? null : Number(row.matched),
      complete: row.complete == null ? null : Number(row.complete),
      risk: row.risk == null ? null : String(row.risk),
      target_status: String(row.target_status),
      priority: Number(row.priority),
      reason: String(row.reason ?? ""),
    },
    writeSet: [String(row.source_path)],
  }));
}

export function leaseNextQueuedTarget(params: {
  store: StateStore;
  runId: string;
  workerId: string;
  baseRev?: string;
  ttlSeconds?: number;
}): LeasedTarget | null {
  return immediateTransaction(params.store.db, () => {
    const target = params.store.db
      .query(
        `
          SELECT
            queue.id AS queue_id,
            targets.id AS target_id,
            targets.unit,
            targets.symbol,
            targets.source_path,
            targets.size,
            targets.fuzzy,
            targets.matched,
            targets.complete,
            targets.risk,
            targets.status AS target_status,
            targets.priority,
            targets.reason
          FROM queue
          JOIN targets ON targets.id = queue.target_id
          WHERE queue.run_id = ?
            AND queue.status = 'queued'
            AND NOT EXISTS (
              SELECT 1
              FROM file_locks
              JOIN leases AS lock_leases ON lock_leases.id = file_locks.lease_id
              WHERE file_locks.path = targets.source_path
                AND lock_leases.status = 'active'
            )
          ORDER BY queue.priority DESC, queue.created_at ASC
          LIMIT 1
        `,
      )
      .get(params.runId) as Record<string, unknown> | undefined;
    if (!target) return null;

    const sourcePath = String(target.source_path ?? "").trim();
    if (!sourcePath) throw new Error(`Cannot lease target ${String(target.target_id)} without a source_path`);

    const writeSet = [sourcePath];
    const queueId = String(target.queue_id);
    const targetId = String(target.target_id);
    const leaseId = randomUUID();
    const ttl = new Date(Date.now() + (params.ttlSeconds ?? 60 * 60) * 1000).toISOString();
    const createdAt = now();

    params.store.db
      .query(
        "INSERT INTO leases (id, queue_id, worker_id, base_rev, write_set_hash, worktree_path, ttl, heartbeat_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(leaseId, queueId, params.workerId, params.baseRev ?? "unknown", writeSetHash(writeSet), null, ttl, createdAt, "active");

    const insertLock = params.store.db.query("INSERT OR REPLACE INTO file_locks (path, lease_id, lock_mode, expires_at) VALUES (?, ?, ?, ?)");
    for (const path of writeSet) insertLock.run(path, leaseId, "write", ttl);

    params.store.db.query("UPDATE queue SET status = 'leased', leased_at = ? WHERE id = ?").run(createdAt, queueId);
    params.store.db.query("UPDATE targets SET status = 'leased' WHERE id = ?").run(targetId);

    return {
      leaseId,
      queueId,
      workerId: params.workerId,
      targetId,
      target,
      writeSet,
      ttl,
    };
  });
}
