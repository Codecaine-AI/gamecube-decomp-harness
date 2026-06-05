import { randomUUID } from "node:crypto";
import type { RunRecord } from "../types/index.js";
import { immediateTransaction, now, withBusyRetry, type StateStore } from "./db.js";
import { insertEvent } from "./events.js";

function runFromRow(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    goalKind: String(row.goal_kind),
    goalValue: Number(row.goal_value),
    desiredWorkers: Number(row.desired_workers),
    status: row.status as RunRecord["status"],
    createdAt: String(row.created_at),
  };
}

export function createRun(store: StateStore, goalKind: string, goalValue: number, desiredWorkers: number): RunRecord {
  const run: RunRecord = {
    id: randomUUID(),
    goalKind,
    goalValue,
    desiredWorkers,
    status: "active",
    createdAt: now(),
  };
  immediateTransaction(store.db, () => {
    store.db
      .query("INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(run.id, run.goalKind, run.goalValue, run.desiredWorkers, run.status, run.createdAt);
    insertEvent(store, run.id, "run_started", "runner", {
      desired_workers: desiredWorkers,
      goal_kind: goalKind,
      goal_value: goalValue,
    });
  });
  return run;
}

export function getLatestRun(store: StateStore): RunRecord | null {
  const row = withBusyRetry(
    () =>
      store.db
        .query("SELECT id, goal_kind, goal_value, desired_workers, status, created_at FROM runs ORDER BY created_at DESC LIMIT 1")
        .get() as Record<string, unknown> | undefined,
  );
  if (!row) return null;
  return runFromRow(row);
}

export function getRun(store: StateStore, runId: string): RunRecord | null {
  const row = withBusyRetry(
    () =>
      store.db
        .query("SELECT id, goal_kind, goal_value, desired_workers, status, created_at FROM runs WHERE id = ?")
        .get(runId) as Record<string, unknown> | undefined,
  );
  return row ? runFromRow(row) : null;
}
