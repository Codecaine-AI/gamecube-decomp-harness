import { randomUUID } from "node:crypto";
import { immediateTransaction, now, type StateStore } from "./db.js";

export function addDirectorCycle(params: {
  store: StateStore;
  runId: string;
  triggerEvent: string;
  activeWorkers: number;
  summaryPath?: string;
  decisionPath?: string;
}): string {
  const id = randomUUID();
  immediateTransaction(params.store.db, () => {
    params.store.db
      .query(
        "INSERT INTO director_cycles (id, run_id, trigger_event, active_workers, summary_path, decision_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, params.runId, params.triggerEvent, params.activeWorkers, params.summaryPath ?? null, params.decisionPath ?? null, now());
  });
  return id;
}
