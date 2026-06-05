import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { targetPacketTarget } from "../../agents/worker/index.js";
import { activeLeasesForRun, getLatestRun, getRun, openState, recordWorkerReport } from "../../state/index.js";
import { booleanArg, stringArg, type GlobalArgs } from "../args.js";

function leaseExpired(ttl: string): boolean {
  const ttlMs = Date.parse(ttl);
  return Number.isFinite(ttlMs) && ttlMs <= Date.now();
}

export async function recoverLeases(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
  if (!runId) throw new Error("No run found. Run init-run first.");
  const run = getRun(store, runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  const force = booleanArg(args, "--force");
  const leaseIdFilter = stringArg(args, "--lease-id", "");
  const reason = stringArg(args, "--reason", force ? "forced lease recovery after interrupted worker process" : "expired lease recovery");
  const activeLeases = activeLeasesForRun(store, runId);
  const selectedLeases = activeLeases.filter((lease) => {
    if (leaseIdFilter && lease.leaseId !== leaseIdFilter) return false;
    return force || leaseExpired(lease.ttl);
  });
  const skippedLeases = activeLeases.filter((lease) => !selectedLeases.some((selected) => selected.leaseId === lease.leaseId));
  const recovered: Record<string, unknown>[] = [];

  for (const lease of selectedLeases) {
    const target = targetPacketTarget(lease.target);
    const reportDir = resolve(globals.stateDir, "runs", runId, "worker_logs", lease.leaseId, "report");
    await mkdir(reportDir, { recursive: true });
    const summaryPath = resolve(reportDir, "worker_report.json");
    const factsPath = resolve(reportDir, "facts.json");
    const blockerPath = resolve(reportDir, "blocker.json");
    const summary = {
      run_id: runId,
      lease_id: lease.leaseId,
      worker_id: lease.workerId,
      target,
      write_set: lease.writeSet,
      report_type: "stalled_no_useful_guess",
      summary: `Recovered interrupted active lease: ${reason}`,
      recovered_by: "recover-leases",
      recovered_at: new Date().toISOString(),
    };
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));
    await writeFile(factsPath, JSON.stringify([], null, 2));
    await writeFile(
      blockerPath,
      JSON.stringify(
        {
          reason: "lease_recovered",
          note: reason,
          ttl: lease.ttl,
          heartbeat_at: lease.heartbeatAt,
        },
        null,
        2,
      ),
    );

    const report = recordWorkerReport({
      store,
      runId,
      leaseId: lease.leaseId,
      reportType: "stalled_no_useful_guess",
      summaryPath,
      factsPath,
      blockerPath,
      payload: {
        lease_id: lease.leaseId,
        worker_id: lease.workerId,
        target,
        report_type: "stalled_no_useful_guess",
        summary_path: summaryPath,
        recovered_by: "recover-leases",
        reason,
      },
    });
    recovered.push({
      leaseId: lease.leaseId,
      workerId: lease.workerId,
      target,
      writeSet: lease.writeSet,
      reportId: report.reportId,
      wakeEvent: report.eventId,
      workerReport: summaryPath,
    });
  }

  console.log(
    JSON.stringify(
      {
        runId,
        force,
        scannedActiveLeases: activeLeases.length,
        recoveredLeases: recovered.length,
        recovered,
        skippedActiveLeases: skippedLeases.map((lease) => ({
          leaseId: lease.leaseId,
          workerId: lease.workerId,
          ttl: lease.ttl,
          target: targetPacketTarget(lease.target),
          reason: force ? "lease_id_filter" : "not_expired_without_force",
        })),
      },
      null,
      2,
    ),
  );
}
