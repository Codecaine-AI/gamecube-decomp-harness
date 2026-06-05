import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactTimestamp } from "../../agents/runtime/index.js";
import { runCommand, runNinja } from "../../shell/index.js";
import { numberArg, stringArg, type GlobalArgs } from "../args.js";

export async function regressionCheck(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const target = stringArg(args, "--target", "changes_all");
  if (!target || target.startsWith("-") || /\s/.test(target)) {
    throw new Error("--target must be one Ninja target name, for example changes_all");
  }
  const runId = stringArg(args, "--run-id", "manual");
  const reportTitle = stringArg(args, "--report-title", "Expected local report for GALE01");
  const reportMaxRows = numberArg(args, "--report-max-rows", 30);
  if (!Number.isInteger(reportMaxRows) || reportMaxRows < 0) {
    throw new Error("--report-max-rows must be a non-negative integer");
  }
  const outputDir = resolve(globals.stateDir, "regression_checks", runId, artifactTimestamp());
  await mkdir(outputDir, { recursive: true });

  const result = await runNinja(globals.repoRoot, target);
  const stdoutPath = resolve(outputDir, "stdout.txt");
  const stderrPath = resolve(outputDir, "stderr.txt");
  const summaryPath = resolve(outputDir, "summary.json");
  const reportChangesPath = resolve(globals.repoRoot, "build/GALE01/report_changes.json");
  const prReportPath = resolve(outputDir, "pr_report.md");
  const prReportStdoutPath = resolve(outputDir, "pr_report_stdout.txt");
  const prReportStderrPath = resolve(outputDir, "pr_report_stderr.txt");
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);

  const prReportCommand = [
    "python3",
    "tools/changes_fmt.py",
    "--pr-report",
    "--max-rows",
    String(reportMaxRows),
    "--report-title",
    reportTitle,
    reportChangesPath,
    "-o",
    prReportPath,
  ];
  const prReportResult = await runCommand(globals.repoRoot, prReportCommand);
  await writeFile(prReportStdoutPath, prReportResult.stdout);
  await writeFile(prReportStderrPath, prReportResult.stderr);

  const passed = result.exitCode === 0 && prReportResult.exitCode === 0;
  const summary = {
    status: passed ? "passed" : "failed",
    exitCode: result.exitCode,
    command: ["ninja", target],
    repoRoot: globals.repoRoot,
    runId,
    artifactDir: outputDir,
    stdoutPath,
    stderrPath,
    baselinePath: resolve(globals.repoRoot, "build/GALE01/baseline.json"),
    reportChangesPath,
    prReportPath,
    prReportCommand,
    prReportExitCode: prReportResult.exitCode,
    prReportStdoutPath,
    prReportStderrPath,
    hint:
      passed
        ? "No regressions were reported by the Ninja target. Use pr_report.md as the expected/local run section of the PR description."
        : prReportResult.exitCode !== 0
          ? "Inspect stdout/stderr and pr_report_stderr.txt. The regression gate or PR report generation failed."
          : "Inspect stdout/stderr and build/GALE01/report_changes.json. If the baseline is missing, run ninja baseline on the upstream base before checking the branch.",
  };
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
  else if (prReportResult.exitCode !== 0) process.exitCode = prReportResult.exitCode;
}
