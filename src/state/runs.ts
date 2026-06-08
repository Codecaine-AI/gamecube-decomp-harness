import { randomUUID } from "node:crypto";
import type { RunRecord, RunStatus } from "../types/index.js";
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

export function updateRunStatus(store: StateStore, runId: string, status: RunStatus, producer = "operator"): RunRecord {
  const run = getRun(store, runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (run.status === status) return run;
  immediateTransaction(store.db, () => {
    const changedAt = now();
    store.db.query("UPDATE runs SET status = ? WHERE id = ?").run(status, runId);
    store.db
      .query("INSERT INTO events (id, run_id, event_type, producer, payload_json, handled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        randomUUID(),
        runId,
        "run_status_changed",
        producer,
        JSON.stringify({
          previous_status: run.status,
          status,
        }),
        changedAt,
        changedAt,
      );
  });
  return { ...run, status };
}
