import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactTimestamp } from "@server/infrastructure/agent-runtime/runtime";
import {
  DEFAULT_PR_PROMOTION_POLICY,
  writePrReport,
  type PrPromotionEvaluation,
  type PrPromotionPolicy,
} from "@server/core/validation/objdiff/report";
import { runQaScanDiff, type QaScanInvocation } from "@server/core/validation/qa";
import { runCommandStreaming } from "@server/infrastructure/shell";
import { packageRoot } from "@server/core/knowledge";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { composeHandoffVerdict, evaluateQaGate } from "./qa-gate.js";

// Progress narration goes to stderr so stdout stays a single JSON document
// for callers like the dashboard server that parse it.
function trace(message: string): void {
  process.stderr.write(`[regression-check] ${message}\n`);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

function outputTail(output: string, maxLines = 30): string {
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  while (lines.at(-1) === "") lines.pop();
  return lines.slice(-maxLines).join("\n");
}

function firstFailedTarget(output: string): string | null {
  const failedLine = output.match(/(?:^|\n)FAILED:\s+([^\r\n]+)/)?.[1]?.trim();
  return failedLine?.replace(/^\[code=[^\]]+\]\s*/, "") ?? null;
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
  const target = stringArg(args, "--target", globals.game?.validation.qaTarget ?? "changes_all");
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
  const skipQaGate = booleanArg(args, "--skip-qa-gate");
  const qaBaseRef = stringArg(args, "--qa-base", globals.game?.baseRef ?? "origin/master");
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

  const buildStartedAtMs = Date.now();
  const buildOutputChunks: string[] = [];
  trace(`full build started: ninja ${target} in ${globals.repoRoot}`);
  const result = await runCommandStreaming(globals.repoRoot, ["ninja", target], (chunk) => {
    buildOutputChunks.push(chunk);
    process.stderr.write(chunk);
  });
  trace(`full build exited ${result.exitCode}`);
  const stdoutPath = resolve(outputDir, "stdout.txt");
  const stderrPath = resolve(outputDir, "stderr.txt");
  const summaryPath = resolve(outputDir, "summary.json");
  const reportChangesPath = resolve(globals.repoRoot, "build/GALE01/report_changes.json");
  const prReportPath = resolve(outputDir, "pr_report.md");
  const prReportErrorPath = resolve(outputDir, "pr_report_error.txt");
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);

  const finishBuildFailure = async (exitCode: number, buildFailure: string, hint: string): Promise<void> => {
    const summary = {
      status: "build_failed",
      exitCode,
      regressionGateExitCode: 1,
      prPromotionGateExitCode: 1,
      handoffGateExitCode: 1,
      command: ["ninja", target],
      repoRoot: globals.repoRoot,
      runId,
      artifactDir: outputDir,
      stdoutPath,
      stderrPath,
      baselinePath: resolve(globals.repoRoot, "build/GALE01/baseline.json"),
      reportChangesPath,
      prReportPath: null,
      prReportGenerator: "decomp-orchestrator/apps/server/src/core/validation/objdiff/report.ts",
      prReportErrorPath: null,
      regressionCounts: null,
      prPromotion: null,
      requirePrPromotion,
      promotionPolicy,
      qaGateExitCode: null,
      qaGateSkipped: false,
      qaFindings: null,
      qaCounts: null,
      qaScanPath: null,
      buildFailure,
      hint,
    };
    trace(`verdict: build_failed (build exit ${exitCode}; regression report was not read)`);
    trace(hint);
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
    process.exitCode = exitCode;
  };

  if (result.exitCode !== 0) {
    const buildOutput = buildOutputChunks.join("");
    const failedTarget = firstFailedTarget(buildOutput);
    const buildFailure = outputTail(buildOutput) || `ninja ${target} exited with code ${result.exitCode} without output`;
    const hint = failedTarget
      ? `Ninja failed at target "${failedTarget}". Inspect stdout/stderr; regression reports were not read because the build did not complete.`
      : `Ninja target "${target}" failed. Inspect stdout/stderr; regression reports were not read because the build did not complete.`;
    await finishBuildFailure(result.exitCode, buildFailure, hint);
    return;
  }

  let reportFreshnessFailure: string | null = null;
  try {
    const reportChangesStat = await stat(reportChangesPath);
    if (reportChangesStat.mtimeMs <= buildStartedAtMs) {
      reportFreshnessFailure =
        `${reportChangesPath} is stale: mtime ${reportChangesStat.mtime.toISOString()} is not newer than ` +
        `the build start ${new Date(buildStartedAtMs).toISOString()}.`;
    }
  } catch (error) {
    reportFreshnessFailure = `${reportChangesPath} was not refreshed by the build and could not be inspected: ${errorText(error)}`;
  }
  if (reportFreshnessFailure !== null) {
    await finishBuildFailure(
      1,
      reportFreshnessFailure,
      "Ninja exited successfully, but build/GALE01/report_changes.json was not refreshed after the build started. Regression reports were not read.",
    );
    return;
  }

  // L2 QA ship gate: deterministic maintainer-rejection scan over the diff
  // against the upstream base. Runs by default; --skip-qa-gate is for
  // emergencies only, and a scanner failure fails the gate (fail-closed).
  const qaScanPath = resolve(outputDir, "qa_scan.json");
  const qaScanTextPath = resolve(outputDir, "qa_scan.txt");
  let qaInvocation: QaScanInvocation | null = null;
  if (skipQaGate) {
    trace("qa gate skipped via --skip-qa-gate");
  } else {
    trace(`qa gate: review_lint scan_diff vs ${qaBaseRef}`);
    qaInvocation = await runQaScanDiff({
      repoRoot: globals.repoRoot,
      orchestratorRoot: packageRoot(),
      game: globals.game,
      stateDir: globals.stateDir,
      baseRef: qaBaseRef,
      includeWorktree: true,
      surface: "pr_gate",
      addressNamedStaticDataAllowlist: globals.game?.validation.addressNamedStaticDataAllowlist,
    });
    await writeFile(qaScanPath, qaInvocation.stdout);
    await writeFile(qaScanTextPath, qaInvocation.stderr);
    trace(`qa gate exited ${qaInvocation.exitCode}${qaInvocation.toolError === null ? "" : ` (tool error: ${qaInvocation.toolError})`}`);
  }
  const qaGate = evaluateQaGate(qaInvocation, skipQaGate);

  let reportError: string | null = null;
  let regressionCounts: Record<string, number> | null = null;
  let prPromotion: PrPromotionEvaluation | null = null;
  trace(`evaluating regression and promotion gates from ${reportChangesPath}`);
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
  const { passed, status } = composeHandoffVerdict({ regressionGatePassed, promotionBlocked, qaGatePassed: qaGate.qaGatePassed });
  const summary = {
    status,
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
    prReportGenerator: "decomp-orchestrator/apps/server/src/core/validation/objdiff/report.ts",
    prReportErrorPath: reportError === null ? null : prReportErrorPath,
    regressionCounts,
    prPromotion,
    requirePrPromotion,
    promotionPolicy,
    qaGateExitCode: qaGate.qaGateExitCode,
    qaGateSkipped: qaGate.qaGateSkipped,
    qaFindings: qaGate.qaFindings,
    qaCounts: qaGate.qaCounts,
    qaScanPath: skipQaGate ? null : qaScanPath,
    hint:
      reportError !== null
        ? "Inspect stdout/stderr and pr_report_error.txt. The regression gate could not parse build/GALE01/report_changes.json."
        : hasReportRegressions
          ? "Inspect pr_report.md and build/GALE01/report_changes.json. Broken matches, fuzzy regressions, or metric regressions must be fixed before PR handoff."
          : result.exitCode !== 0
            ? "Inspect stdout/stderr. If the baseline is missing, run ninja baseline on the upstream base before checking the branch."
            : qaGate.hint !== null
              ? qaGate.hint
              : promotionHint(prPromotion, requirePrPromotion),
  };
  trace(
    `verdict: ${summary.status} (build exit ${result.exitCode}, regression gate ${regressionGatePassed ? "clean" : "dirty"}, ` +
      `qa gate ${qaGate.qaGateSkipped ? "skipped" : qaGate.qaGatePassed ? "clean" : "dirty"}, promotion ${prPromotion?.status ?? "unavailable"})`,
  );
  trace(summary.hint);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
  else if (!passed) process.exitCode = 1;
}
