import { randomUUID } from "node:crypto";
import type { BoardSnapshot, TargetCandidate } from "../types/index.js";
import { immediateTransaction, now, type StateStore } from "./db.js";

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

export function prioritizeQueuedTargets(store: StateStore, runId: string, candidates: TargetCandidate[]): number {
  const selectTarget = store.db.query(
    "SELECT id, status FROM targets WHERE run_id = ? AND unit = ? AND symbol = ? ORDER BY created_at ASC LIMIT 1",
  );
  const selectQueue = store.db.query("SELECT id, status, priority FROM queue WHERE run_id = ? AND target_id = ? ORDER BY created_at ASC LIMIT 1");
  const insertTarget = store.db.query(
    "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertQueue = store.db.query(
    "INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const updateTarget = store.db.query("UPDATE targets SET source_path = ?, size = ?, fuzzy = ?, priority = ?, reason = ? WHERE id = ?");
  const updateQueue = store.db.query("UPDATE queue SET priority = ?, reason = ? WHERE id = ? AND status = 'queued'");
  const createdAt = now();

  return immediateTransaction(store.db, () => {
    let count = 0;
    for (const candidate of candidates) {
      const existingTarget = selectTarget.get(runId, candidate.unit, candidate.symbol) as Record<string, unknown> | undefined;
      if (existingTarget) {
        const targetId = String(existingTarget.id);
        const existingQueue = selectQueue.get(runId, targetId) as Record<string, unknown> | undefined;
        const existingPriority = Number(existingQueue?.priority ?? Number.NEGATIVE_INFINITY);
        if (candidate.priority <= existingPriority) continue;

        updateTarget.run(candidate.sourcePath, candidate.size, candidate.fuzzy, candidate.priority, candidate.reason, targetId);
        if (existingQueue?.status === "queued") {
          updateQueue.run(candidate.priority, candidate.reason, String(existingQueue.id));
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
