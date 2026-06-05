import { withBusyRetry, type StateStore } from "./db.js";
import { activeWorkerCount } from "./leases.js";
import { getLatestRun } from "./runs.js";

export function statusSnapshot(store: StateStore): Record<string, unknown> {
  const run = getLatestRun(store);
  if (!run) return { runs: 0 };
  const scalar = (sql: string, runId: string) => {
    const row = withBusyRetry(() => store.db.query(sql).get(runId) as Record<string, unknown>);
    return Number(row.count ?? 0);
  };
  return {
    run,
    targets: scalar("SELECT COUNT(*) AS count FROM targets WHERE run_id = ?", run.id),
    queued: scalar("SELECT COUNT(*) AS count FROM queue WHERE run_id = ? AND status = 'queued'", run.id),
    unhandledEvents: scalar("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND handled_at IS NULL", run.id),
    piSessions: scalar("SELECT COUNT(*) AS count FROM pi_sessions WHERE run_id = ?", run.id),
    directorCycles: scalar("SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", run.id),
    leases: scalar("SELECT COUNT(*) AS count FROM leases JOIN queue ON leases.queue_id = queue.id WHERE queue.run_id = ?", run.id),
    activeLeases: activeWorkerCount(store, run.id),
    fileLocks: scalar(
      "SELECT COUNT(*) AS count FROM file_locks JOIN leases ON file_locks.lease_id = leases.id JOIN queue ON leases.queue_id = queue.id WHERE queue.run_id = ?",
      run.id,
    ),
    workerReports: scalar(
      "SELECT COUNT(*) AS count FROM worker_reports JOIN leases ON worker_reports.lease_id = leases.id JOIN queue ON leases.queue_id = queue.id WHERE queue.run_id = ?",
      run.id,
    ),
  };
}
