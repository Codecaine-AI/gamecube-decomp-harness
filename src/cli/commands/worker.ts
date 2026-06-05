import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  isWorkerReportType,
  parseWorkerAgentReport,
  targetPacketTarget,
  workerPacket,
  workerPrompt,
} from "../../agents/worker/index.js";
import { runPiAgent } from "../../agents/runtime/index.js";
import { loadBoardSnapshot } from "../../board/index.js";
import { addPiSession, getLatestRun, getRun, leaseNextQueuedTarget, openState, recordWorkerReport } from "../../state/index.js";
import { numberArg, stringArg, workerReportTypeArg, type GlobalArgs } from "../args.js";
import { assertSchedulableRun } from "./shared.js";

export interface WorkerCycleResult {
  runId: string;
  leaseId: string;
  target: string;
  writeSet: string[];
  workerOutput?: string;
  workerSystemPrompt?: string;
  workerUserPrompt?: string;
  workerReport: string;
  reportId: string;
  wakeEvent: string;
  dryRun: boolean;
  failed?: boolean;
  error?: string;
}

export async function runWorkerCycle(globals: GlobalArgs, args: Map<string, string | true>): Promise<WorkerCycleResult> {
  const store = openState(globals.stateDir);
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "worker");

    const workerId = stringArg(args, "--worker-id", `worker-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`);
    const fallbackReportType = workerReportTypeArg(args, "--report-type", "stalled_no_useful_guess");
    const baseRev = stringArg(args, "--base-rev", "unknown");
    const ttlSeconds = numberArg(args, "--ttl-seconds", 60 * 60);
    const leased = leaseNextQueuedTarget({ store, runId, workerId, baseRev, ttlSeconds });
    if (!leased) throw new Error(`No queued, unlocked targets available for run ${runId}`);

    const snapshot = loadBoardSnapshot(globals.repoRoot, 12);
    const target = targetPacketTarget(leased.target);
    const packet = workerPacket({
      run,
      leased,
      target,
      baselineMeasures: snapshot.measures,
      dryRunAgents: globals.dryRunAgents,
    });
    const outputDir = resolve(globals.stateDir, "runs", runId, "worker_logs", leased.leaseId);
    const initialBoardPath = resolve(globals.stateDir, "runs", runId, "snapshots", "initial_board.json");
    let result: Awaited<ReturnType<typeof runPiAgent>>;
    try {
      result = await runPiAgent({
        role: "worker",
        cwd: globals.repoRoot,
        prompt: workerPrompt({
          packet,
          repoRoot: globals.repoRoot,
          stateDir: globals.stateDir,
          initialBoardPath,
          workerLogDir: outputDir,
        }),
        outputDir,
        dryRun: globals.dryRunAgents,
        provider: globals.provider,
        model: globals.model,
        thinkingLevel: globals.thinkingLevel,
        timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
      });
    } catch (error) {
      const reportDir = resolve(outputDir, "report");
      await mkdir(reportDir, { recursive: true });
      const summaryPath = resolve(reportDir, "worker_report.json");
      const factsPath = resolve(reportDir, "facts.json");
      const blockerPath = resolve(reportDir, "blocker.json");
      const message = error instanceof Error ? error.message : String(error);
      await writeFile(
        summaryPath,
        JSON.stringify(
          {
            run_id: runId,
            lease_id: leased.leaseId,
            worker_id: leased.workerId,
            target,
            write_set: leased.writeSet,
            report_type: "stalled_no_useful_guess",
            summary: `Worker Pi session failed before producing a report: ${message}`,
            created_at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      await writeFile(factsPath, JSON.stringify([], null, 2));
      await writeFile(
        blockerPath,
        JSON.stringify(
          {
            reason: "worker_pi_session_failed",
            note: message,
          },
          null,
          2,
        ),
      );
      const report = recordWorkerReport({
        store,
        runId,
        leaseId: leased.leaseId,
        reportType: "stalled_no_useful_guess",
        summaryPath,
        factsPath,
        blockerPath,
        payload: {
          lease_id: leased.leaseId,
          worker_id: leased.workerId,
          target,
          report_type: "stalled_no_useful_guess",
          summary_path: summaryPath,
          error: message,
        },
      });
      return {
        runId,
        leaseId: leased.leaseId,
        target: leased.targetId,
        writeSet: leased.writeSet,
        workerReport: summaryPath,
        reportId: report.reportId,
        wakeEvent: report.eventId,
        dryRun: globals.dryRunAgents,
        error: message,
      };
    }
    addPiSession({
      store,
      runId,
      leaseId: leased.leaseId,
      role: "worker",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });

    const reportDir = resolve(outputDir, "report");
    await mkdir(reportDir, { recursive: true });
    const summaryPath = resolve(reportDir, "worker_report.json");
    const factsPath = resolve(reportDir, "facts.json");
    const parsedAgentReport =
      result.dryRun || result.failed ? { report: null as Record<string, unknown> | null, error: result.error } : parseWorkerAgentReport(result.rawText);
    const agentReport = parsedAgentReport.report;
    const agentReportType = agentReport ? agentReport.report_type : null;
    const reportType = result.failed ? "stalled_no_useful_guess" : isWorkerReportType(agentReportType) ? agentReportType : fallbackReportType;
    const agentFacts = Array.isArray(agentReport?.facts) ? agentReport.facts : [];
    const agentBlockers = Array.isArray(agentReport?.blockers) ? agentReport.blockers : [];
    const blockerPath =
      reportType === "stalled_no_useful_guess" || reportType === "needs_fact" || parsedAgentReport.error || agentBlockers.length > 0
        ? resolve(reportDir, "blocker.json")
        : undefined;
    const patchPath = typeof agentReport?.patch_path === "string" ? agentReport.patch_path : undefined;
    const reportSummaryText =
      typeof agentReport?.summary === "string"
        ? agentReport.summary
        : result.dryRun && reportType === "stalled_no_useful_guess"
          ? "Dry-run worker preserved the target packet and stopped before unsupported edits."
          : result.dryRun
            ? "Dry-run worker completed the configured report path."
            : result.failed
              ? `Worker Pi session failed before producing a complete report: ${result.error ?? "unknown error"}`
              : "Live worker output was persisted for reducer review.";
    const reportSummary = {
      run_id: runId,
      lease_id: leased.leaseId,
      worker_id: leased.workerId,
      target,
      write_set: leased.writeSet,
      report_type: reportType,
      agent_output_path: result.outputPath,
      summary: reportSummaryText,
      agent_report: agentReport,
      agent_report_parse_error: parsedAgentReport.error ?? null,
      created_at: new Date().toISOString(),
    };
    await writeFile(summaryPath, JSON.stringify(reportSummary, null, 2));
    await writeFile(factsPath, JSON.stringify(agentFacts, null, 2));
    if (blockerPath) {
      await writeFile(
        blockerPath,
        JSON.stringify(
          {
            reason: reportType,
            note: parsedAgentReport.error ?? (result.dryRun ? "Synthetic smoke report." : "Live worker reported blockers."),
            blockers: agentBlockers,
          },
          null,
          2,
        ),
      );
    }

    const report = recordWorkerReport({
      store,
      runId,
      leaseId: leased.leaseId,
      reportType,
      summaryPath,
      factsPath,
      blockerPath,
      patchPath,
      payload: {
        lease_id: leased.leaseId,
        worker_id: leased.workerId,
        target,
        report_type: reportType,
        summary_path: summaryPath,
      },
    });
    return {
      runId,
      leaseId: leased.leaseId,
      target: leased.targetId,
      writeSet: leased.writeSet,
      workerOutput: result.outputPath,
      workerSystemPrompt: result.systemPromptPath,
      workerUserPrompt: result.userPromptPath,
      workerReport: summaryPath,
      reportId: report.reportId,
      wakeEvent: report.eventId,
      dryRun: result.dryRun,
      failed: result.failed ?? false,
    };
  } finally {
    store.db.close();
  }
}

export async function worker(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runWorkerCycle(globals, args), null, 2));
}
