import { copyFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { runCommand, type CommandResult } from "../shell/index.js";

export interface ReportRunStep extends CommandResult {
  command: string[];
  name: string;
}

export interface ReportRunResult {
  baselinePath: string;
  reportChangesPath: string;
  reportPath: string;
  resetBaseline: boolean;
  steps: ReportRunStep[];
  timestamps: {
    baseline?: string;
    report?: string;
    reportChanges?: string;
  };
}

export interface ReportRunOptions {
  generateChanges?: boolean;
  resetBaseline?: boolean;
}

async function removeIfExists(path: string): Promise<void> {
  await rm(path, { force: true });
}

async function timestamp(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function runStep(repoRoot: string, steps: ReportRunStep[], name: string, command: string[]): Promise<void> {
  const result = await runCommand(repoRoot, command);
  steps.push({ name, command, ...result });
  if (result.exitCode !== 0) {
    const output = result.stderr || result.stdout || "no output";
    throw new Error(`${name} failed (${result.exitCode}): ${output.slice(-2000)}`);
  }
}

export async function forceReportRun(repoRoot: string, options: ReportRunOptions = {}): Promise<ReportRunResult> {
  const buildDir = resolve(repoRoot, "build/GALE01");
  const reportPath = resolve(buildDir, "report.json");
  const baselinePath = resolve(buildDir, "baseline.json");
  const reportChangesPath = resolve(buildDir, "report_changes.json");
  const generateChanges = options.generateChanges !== false;
  const resetBaseline = options.resetBaseline === true;
  const steps: ReportRunStep[] = [];

  await removeIfExists(reportChangesPath);
  await removeIfExists(reportPath);
  await runStep(repoRoot, steps, "generate report", ["ninja", "build/GALE01/report.json"]);

  if (resetBaseline) {
    await copyFile(reportPath, baselinePath);
  }

  if (generateChanges) {
    await runStep(repoRoot, steps, "generate report changes", ["ninja", "changes_all"]);
  }

  return {
    baselinePath,
    reportChangesPath,
    reportPath,
    resetBaseline,
    steps,
    timestamps: {
      baseline: await timestamp(baselinePath),
      report: await timestamp(reportPath),
      reportChanges: await timestamp(reportChangesPath),
    },
  };
}
