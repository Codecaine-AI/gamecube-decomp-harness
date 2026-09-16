import { withBusyRetry, type StateStore } from "@server/core/orchestrator-state";
import { activeWorkerCount } from "./worker-state.js";

function scalar(store: StateStore, sql: string, runId: string): number {
  const row = withBusyRetry(() => store.db.query(sql).get(runId) as Record<string, unknown>);
  return Number(row.count ?? 0);
}

export function admittedTargetCount(store: StateStore, runId: string): number {
  return scalar(
    store,
    `
      SELECT COUNT(*) AS count
      FROM epoch_targets
      JOIN epochs ON epochs.id = epoch_targets.epoch_id
      WHERE epoch_targets.run_id = ?
        AND epochs.status = 'active'
        AND epoch_targets.status = 'admitted'
    `,
    runId,
  );
}

export const schedulableTargetCount = admittedTargetCount;

export function unhandledEventCount(store: StateStore, runId: string): number {
  return scalar(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND handled_at IS NULL", runId);
}

export function unhandledPoolEventCount(store: StateStore, runId: string): number {
  return scalar(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'pool_below_target' AND handled_at IS NULL", runId);
}

export function targetPressureSnapshot(store: StateStore, runId: string): {
  activeWorkers: number;
  admittedTargets: number;
  schedulableTargets: number;
  unhandledEvents: number;
} {
  return {
    activeWorkers: activeWorkerCount(store, runId),
    admittedTargets: admittedTargetCount(store, runId),
    schedulableTargets: schedulableTargetCount(store, runId),
    unhandledEvents: unhandledEventCount(store, runId),
  };
}
