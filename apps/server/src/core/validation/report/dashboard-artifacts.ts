import {
  recordDashboardArtifact,
  type JsonObject,
  type StateStore,
} from "@server/core/orchestrator-state";
import type { ReportRunResult, ReportRunSummary } from "./run.js";
import { loadTrustedReportFile } from "./trusted-report.js";

export interface RecordReportRunDashboardArtifactsInput {
  result: ReportRunResult;
  runId?: string | null;
  projectId?: string | null;
  sessionUuid?: string | null;
  boardKey?: string;
  trustedReportKey?: string;
  reportChangesSource?: string;
  reportRunKey?: string;
}

function compactSteps(result: ReportRunResult): JsonObject[] {
  return result.steps.map((step) => ({
    name: step.name,
    command: step.command,
    exitCode: step.exitCode,
  }));
}

export function boardMeasuresFromReportSummary(summary: ReportRunSummary | undefined): JsonObject {
  if (!summary) return {};
  return {
    fuzzy_match_percent: summary.fuzzyMatchPercent,
    matched_code_percent: summary.matchedCodePercent,
    complete_code_percent: summary.completeCodePercent,
    matched_functions_percent: summary.matchedFunctionsPercent,
    complete_units: summary.completeUnits,
    total_units: summary.totalUnits,
    unmatched_targets: summary.unmatchedTargets,
  };
}

export async function recordReportRunDashboardArtifacts(
  store: StateStore,
  input: RecordReportRunDashboardArtifactsInput,
): Promise<void> {
  const common = {
    runId: input.runId ?? null,
    projectId: input.projectId ?? null,
    sessionUuid: input.sessionUuid ?? null,
  };
  const reportRunKey = input.reportRunKey ?? (input.result.resetBaseline ? "baseline_reset" : "report");
  recordDashboardArtifact(store, {
    ...common,
    artifactType: "report_run",
    artifactKey: reportRunKey,
    sourcePath: input.result.reportPath,
    sourceLabel: "build/GALE01/report.json",
    payload: {
      baselinePath: input.result.baselinePath,
      reportChangesPath: input.result.reportChangesPath,
      reportPath: input.result.reportPath,
      resetBaseline: input.result.resetBaseline,
      summary: input.result.summary ?? null,
      timestamps: input.result.timestamps,
      steps: compactSteps(input.result),
    },
    createdAt: input.result.timestamps.report ?? undefined,
  });

  const measures = boardMeasuresFromReportSummary(input.result.summary);
  if (Object.keys(measures).length > 0) {
    const boardKey = input.boardKey ?? (input.result.resetBaseline ? "baseline" : "current");
    recordDashboardArtifact(store, {
      ...common,
      artifactType: "board_snapshot",
      artifactKey: boardKey,
      sourcePath: input.result.reportPath,
      sourceLabel: "build/GALE01/report.json",
      payload: {
        generatedAt: input.result.timestamps.report ?? null,
        measures,
        candidates: [],
        reportPath: input.result.reportPath,
        source: input.result.resetBaseline ? "baseline_report" : "report_run",
      },
      createdAt: input.result.timestamps.report ?? undefined,
    });
  }

  if (input.result.timestamps.reportChanges) {
    const source = input.reportChangesSource ?? "build/GALE01/report_changes.json";
    const trustedReport = await loadTrustedReportFile(input.result.reportChangesPath, source, 0);
    if (trustedReport.status === "ready") {
      recordDashboardArtifact(store, {
        ...common,
        artifactType: "trusted_report",
        artifactKey: input.trustedReportKey ?? "current",
        sourcePath: input.result.reportChangesPath,
        sourceLabel: source,
        payload: trustedReport as unknown as JsonObject,
        createdAt: trustedReport.generatedAt ?? undefined,
      });
    }
  }
}
