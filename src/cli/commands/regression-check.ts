import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactTimestamp } from "../../agents/runtime/index.js";
import {
  DEFAULT_PR_PROMOTION_POLICY,
  writePrReport,
  type PrPromotionEvaluation,
  type PrPromotionPolicy,
} from "../../objdiff/report.js";
import { runNinja } from "../../shell/index.js";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "../args.js";

function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function promotionHint(promotion: PrPromotionEvaluation | null, requirePrPromotion: boolean): string {
  if (promotion === null) return "No PR promotion evaluation was produced because the report could not be parsed.";
  if (promotion.status === "pr_ready") {
    return "No regressions were reported and the PR promotion gate found reviewer-worthy evidence. Use pr_report.md as the expected/local run section of the PR description.";
  }
  if (promotion.status === "local_only") {
    return requirePrPromotion
      ? "The regression gate is clean, but the PR promotion gate classified this as local-only evidence. Keep it out of a maintainer PR unless a real match or explicit high-value justification is added."
      : "No regressions were reported, but the PR promotion gate classified this as local-only evidence. Record the win locally; do not treat it as PR-ready by default.";
  }
  return "Fix regressions before PR handoff, then rerun the promotion gate.";
}

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
  const requirePrPromotion = booleanArg(args, "--require-pr-promotion");
  const promotionPolicy: PrPromotionPolicy = {
    minNewMatches: nonNegativeInteger(numberArg(args, "--promotion-min-new-matches", DEFAULT_PR_PROMOTION_POLICY.minNewMatches), "--promotion-min-new-matches"),
    minMatchedCodeBytesDelta: nonNegativeInteger(
      numberArg(args, "--promotion-min-matched-code-bytes", DEFAULT_PR_PROMOTION_POLICY.minMatchedCodeBytesDelta),
      "--promotion-min-matched-code-bytes",
    ),
    minMatchedDataBytesDelta: nonNegativeInteger(
      numberArg(args, "--promotion-min-matched-data-bytes", DEFAULT_PR_PROMOTION_POLICY.minMatchedDataBytesDelta),
      "--promotion-min-matched-data-bytes",
    ),
    minUnmatchedImprovementBytes: nonNegativeInteger(
      numberArg(args, "--promotion-min-unmatched-improvement-bytes", DEFAULT_PR_PROMOTION_POLICY.minUnmatchedImprovementBytes),
      "--promotion-min-unmatched-improvement-bytes",
    ),
  };
  const outputDir = resolve(globals.stateDir, "regression_checks", runId, artifactTimestamp());
  await mkdir(outputDir, { recursive: true });

  const result = await runNinja(globals.repoRoot, target);
  const stdoutPath = resolve(outputDir, "stdout.txt");
  const stderrPath = resolve(outputDir, "stderr.txt");
  const summaryPath = resolve(outputDir, "summary.json");
  const reportChangesPath = resolve(globals.repoRoot, "build/GALE01/report_changes.json");
  const prReportPath = resolve(outputDir, "pr_report.md");
  const prReportErrorPath = resolve(outputDir, "pr_report_error.txt");
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);

  let reportError: string | null = null;
  let regressionCounts: Record<string, number> | null = null;
  let prPromotion: PrPromotionEvaluation | null = null;
  try {
    const report = await writePrReport(reportChangesPath, prReportPath, reportTitle, reportMaxRows, promotionPolicy);
    prPromotion = report.promotion;
    regressionCounts = {
      metricRegressions: report.regressions.length,
      newMatches: report.newMatches.length,
      brokenMatches: report.brokenMatches.length,
      improvements: report.improvements.length,
      fuzzyRegressions: report.fuzzyRegressions.length,
    };
  } catch (error) {
    reportError = errorText(error);
    await writeFile(prReportErrorPath, reportError);
  }

  const hasReportRegressions =
    regressionCounts !== null &&
    (regressionCounts.metricRegressions > 0 ||
      regressionCounts.brokenMatches > 0 ||
      regressionCounts.fuzzyRegressions > 0);
  const regressionGatePassed = result.exitCode === 0 && reportError === null && !hasReportRegressions;
  const promotionBlocked = requirePrPromotion && prPromotion?.status !== "pr_ready";
  const passed = regressionGatePassed && !promotionBlocked;
  const summary = {
    status: passed ? "passed" : "failed",
    exitCode: result.exitCode,
    regressionGateExitCode: regressionGatePassed ? 0 : 1,
    prPromotionGateExitCode: prPromotion?.status === "pr_ready" ? 0 : 1,
    handoffGateExitCode: passed ? 0 : 1,
    command: ["ninja", target],
    repoRoot: globals.repoRoot,
    runId,
    artifactDir: outputDir,
    stdoutPath,
    stderrPath,
    baselinePath: resolve(globals.repoRoot, "build/GALE01/baseline.json"),
    reportChangesPath,
    prReportPath,
    prReportGenerator: "decomp-orchestrator/src/objdiff/report.ts",
    prReportErrorPath: reportError === null ? null : prReportErrorPath,
    regressionCounts,
    prPromotion,
    requirePrPromotion,
    promotionPolicy,
    hint:
      reportError !== null
        ? "Inspect stdout/stderr and pr_report_error.txt. The regression gate could not parse build/GALE01/report_changes.json."
        : hasReportRegressions
          ? "Inspect pr_report.md and build/GALE01/report_changes.json. Broken matches, fuzzy regressions, or metric regressions must be fixed before PR handoff."
          : result.exitCode !== 0
            ? "Inspect stdout/stderr. If the baseline is missing, run ninja baseline on the upstream base before checking the branch."
            : promotionHint(prPromotion, requirePrPromotion),
  };
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
  else if (!passed) process.exitCode = 1;
}
