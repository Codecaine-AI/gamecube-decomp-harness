/**
 * Pure verdict logic for the L2 QA ship gate in regression-check.
 *
 * Kept free of subprocess work so the gate semantics are unit-testable: the
 * caller runs `runQaScanDiff()` (or skips it) and hands the invocation here.
 * Fail-closed is deliberate — a scanner that cannot run must block handoff,
 * because the patterns it detects are exactly the ones that inflate the score
 * metrics every other gate trusts.
 */
import { qaGatePassed, type QaScanFinding, type QaScanInvocation } from "@decomp-orchestrator/core/qa";

export interface QaGateEvaluation {
  qaGatePassed: boolean;
  qaGateSkipped: boolean;
  /** scan_diff.py exit code; null when the gate was skipped. */
  qaGateExitCode: number | null;
  qaFindings: QaScanFinding[] | null;
  qaCounts: { errors: number; warnings: number } | null;
  /** Operator-facing hint fragment; non-null only when the gate failed. */
  hint: string | null;
}

const MAX_HINT_FINDINGS = 8;

function findingsHintList(findings: QaScanFinding[]): string {
  const errors = findings.filter((finding) => finding.severity === "error");
  const relevant = errors.length > 0 ? errors : findings;
  const parts = relevant.slice(0, MAX_HINT_FINDINGS).map((finding) => `${finding.rule_id} at ${finding.file}:${finding.line}`);
  if (relevant.length > MAX_HINT_FINDINGS) parts.push(`+${relevant.length - MAX_HINT_FINDINGS} more`);
  return parts.join(", ");
}

export function evaluateQaGate(invocation: QaScanInvocation | null, skip: boolean): QaGateEvaluation {
  if (skip || invocation === null) {
    return { qaGatePassed: true, qaGateSkipped: true, qaGateExitCode: null, qaFindings: null, qaCounts: null, hint: null };
  }
  const qaFindings = invocation.result?.findings ?? null;
  const qaCounts = invocation.result?.counts ?? null;
  if (invocation.toolError !== null) {
    return {
      qaGatePassed: false,
      qaGateSkipped: false,
      qaGateExitCode: invocation.exitCode,
      qaFindings,
      qaCounts,
      hint:
        `QA gate could not run and fails closed: ${invocation.toolError}. ` +
        "Fix the scanner (tools/source_editing/review_lint/api/scan_diff.py) or, in an emergency only, rerun with --skip-qa-gate.",
    };
  }
  if (qaGatePassed(invocation)) {
    return { qaGatePassed: true, qaGateSkipped: false, qaGateExitCode: invocation.exitCode, qaFindings, qaCounts, hint: null };
  }
  const errorCount = qaCounts?.errors ?? (qaFindings ? qaFindings.filter((finding) => finding.severity === "error").length : 0);
  const warningCount = qaCounts?.warnings ?? (qaFindings ? qaFindings.filter((finding) => finding.severity === "warning").length : 0);
  const findingCount = errorCount + warningCount;
  const located = qaFindings && qaFindings.length > 0 ? ` (rule_ids: ${findingsHintList(qaFindings)})` : "";
  return {
    qaGatePassed: false,
    qaGateSkipped: false,
    qaGateExitCode: invocation.exitCode,
    qaFindings,
    qaCounts,
    hint:
      `QA gate failed: ${findingCount} QA finding(s) detected (${errorCount} error, ${warningCount} warning)${located}. ` +
      "Each finding cites the violated standard; remove every finding or prove a false positive — a lower match % without it is the correct outcome. " +
      "See qa_scan.json.",
  };
}

/**
 * The handoff verdict is the conjunction of all three gates. Factored out so
 * tests can prove the QA gate actually participates in `passed`.
 */
export function composeHandoffVerdict(gates: { regressionGatePassed: boolean; promotionBlocked: boolean; qaGatePassed: boolean }): {
  passed: boolean;
  status: "passed" | "failed";
} {
  const passed = gates.regressionGatePassed && !gates.promotionBlocked && gates.qaGatePassed;
  return { passed, status: passed ? "passed" : "failed" };
}
