import { randomUUID } from "node:crypto";
import type { WorkerReportType } from "../types/index.js";
import { immediateTransaction, now, type StateStore } from "./db.js";
import { workerWakeEvent } from "./events.js";

function releasedLeaseStatus(reportType: WorkerReportType): string {
  if (reportType === "progress" || reportType === "score_candidate") return "released_complete";
  if (reportType === "needs_fact") return "released_needs_fact";
  return "released_stalled";
}

export function recordWorkerReport(params: {
  store: StateStore;
  runId: string;
  leaseId: string;
  reportType: WorkerReportType;
  summaryPath: string;
  factsPath?: string;
  blockerPath?: string;
  patchPath?: string;
  payload: Record<string, unknown>;
}): { reportId: string; eventId: string } {
  const reportId = randomUUID();
  const eventId = randomUUID();
  const reportCreatedAt = now();
  const leaseStatus = releasedLeaseStatus(params.reportType);
  const eventType = workerWakeEvent(params.reportType);
  immediateTransaction(params.store.db, () => {
    params.store.db
      .query(
        "INSERT INTO worker_reports (id, lease_id, report_type, summary_path, facts_path, blocker_path, patch_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        reportId,
        params.leaseId,
        params.reportType,
        params.summaryPath,
        params.factsPath ?? null,
        params.blockerPath ?? null,
        params.patchPath ?? null,
        reportCreatedAt,
      );

    params.store.db.query("UPDATE leases SET status = ? WHERE id = ?").run(leaseStatus, params.leaseId);
    params.store.db.query("DELETE FROM file_locks WHERE lease_id = ?").run(params.leaseId);
    params.store.db
      .query(
        `
          UPDATE queue
          SET status = ?
          WHERE id = (SELECT queue_id FROM leases WHERE id = ?)
        `,
      )
      .run(params.reportType === "stalled_no_useful_guess" ? "stalled" : "reported", params.leaseId);
    params.store.db
      .query(
        `
          UPDATE targets
          SET status = ?
          WHERE id = (
            SELECT queue.target_id
            FROM queue
            JOIN leases ON leases.queue_id = queue.id
            WHERE leases.id = ?
          )
        `,
      )
      .run(params.reportType === "stalled_no_useful_guess" ? "stalled" : "reported", params.leaseId);

    params.store.db
      .query("INSERT INTO events (id, run_id, event_type, producer, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(eventId, params.runId, eventType, "worker", JSON.stringify(params.payload), now());
  });
  return { reportId, eventId };
}
