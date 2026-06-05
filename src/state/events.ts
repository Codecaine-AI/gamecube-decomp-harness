import { randomUUID } from "node:crypto";
import type { EventType, WorkerReportType } from "../types/index.js";
import { immediateTransaction, now, withBusyRetry, type StateStore } from "./db.js";

export function workerWakeEvent(reportType: WorkerReportType): EventType {
  if (reportType === "needs_fact") return "needs_fact";
  if (reportType === "score_candidate") return "score_candidate";
  if (reportType === "progress") return "worker_finished";
  return "worker_stalled";
}

export function insertEvent(store: StateStore, runId: string, eventType: EventType, producer: string, payload: unknown): string {
  const id = randomUUID();
  store.db
    .query("INSERT INTO events (id, run_id, event_type, producer, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, runId, eventType, producer, JSON.stringify(payload), now());
  return id;
}

export function addEvent(store: StateStore, runId: string, eventType: EventType, producer: string, payload: unknown): string {
  return immediateTransaction(store.db, () => insertEvent(store, runId, eventType, producer, payload));
}

export function nextUnhandledEvent(store: StateStore, runId: string): Record<string, unknown> | null {
  return (
    withBusyRetry(
      () =>
        store.db
          .query("SELECT * FROM events WHERE run_id = ? AND handled_at IS NULL ORDER BY created_at ASC LIMIT 1")
          .get(runId) as Record<string, unknown> | undefined,
    ) ?? null
  );
}

export function markEventHandled(store: StateStore, eventId: string): void {
  immediateTransaction(store.db, () => {
    store.db.query("UPDATE events SET handled_at = ? WHERE id = ?").run(now(), eventId);
  });
}
