import { recordReportRunDashboardArtifacts, type ReportRunResult } from "@server/core/validation/report";
import { openState } from "@server/core/cycle-runtime/run-state";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import {
  outputTail,
  type JsonObject,
  type PreparingRuntimeDeps,
} from "../runtime-shared.js";

export interface PrepareReportArtifactContext {
  stateDir: string;
  runId?: string | null;
  gameId?: string | null;
  cycleUuid?: string | null;
  boardKey?: string;
  trustedReportKey?: string;
  reportRunKey?: string;
}

export function compactReportRunResult(result: ReportRunResult): JsonObject {
  return {
    baselinePath: result.baselinePath,
    reportChangesPath: result.reportChangesPath,
    reportPath: result.reportPath,
    resetBaseline: result.resetBaseline,
    summary: result.summary ?? null,
    timestamps: result.timestamps,
    steps: result.steps.map((step) => ({
      name: step.name,
      command: step.command,
      exitCode: step.exitCode,
      stdout: outputTail(step.stdout, 1000),
      stderr: outputTail(step.stderr, 1000),
    })),
  };
}

export async function resetReportBaselineForPrepare(
  deps: PreparingRuntimeDeps,
  runReport: NonNullable<PreparingRuntimeDeps["runReport"]>,
  repoRoot: string,
  artifactContext?: PrepareReportArtifactContext,
): Promise<JsonObject> {
  deps.operationStep("reset report baseline");
  uiLog("ui", "fresh report start reset started");
  const rawResult = await runReport(repoRoot, { generateChanges: false, resetBaseline: true });
  await recordPrepareReportArtifacts(rawResult, artifactContext);
  const result = compactReportRunResult(rawResult);
  uiLog("ui", "fresh report start reset complete");
  return result;
}

export async function reportAgainstNewBaselineForPrepare(
  deps: PreparingRuntimeDeps,
  runReport: NonNullable<PreparingRuntimeDeps["runReport"]>,
  repoRoot: string,
  artifactContext?: PrepareReportArtifactContext,
): Promise<JsonObject> {
  deps.operationStep("report against new baseline");
  uiLog("ui", "fresh report changes started");
  const rawResult = await runReport(repoRoot, { resetBaseline: false });
  await recordPrepareReportArtifacts(rawResult, artifactContext);
  const result = compactReportRunResult(rawResult);
  uiLog("ui", "fresh report changes complete");
  return result;
}

async function recordPrepareReportArtifacts(
  result: ReportRunResult,
  context?: PrepareReportArtifactContext,
): Promise<void> {
  if (!context?.stateDir) return;
  const store = openState(context.stateDir);
  try {
    await recordReportRunDashboardArtifacts(store, {
      result,
      runId: context.runId ?? null,
      gameId: context.gameId ?? null,
      cycleUuid: context.cycleUuid ?? null,
      boardKey: context.boardKey,
      trustedReportKey: context.trustedReportKey,
      reportRunKey: context.reportRunKey,
    });
  } finally {
    store.db.close();
  }
}
