import type { ReportRunResult } from "./run.js";
type JsonObject = Record<string, unknown>;
const outputTail = (value: string, limit: number) => value.slice(-limit);
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

