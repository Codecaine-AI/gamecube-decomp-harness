/**
 * Pure verdict logic for the L2 QA ship gate in regression-check.
 *
 * Kept free of subprocess work so the gate semantics are unit-testable: the
 * caller runs `runQaScanDiff()` (or skips it) and hands the invocation here.
 * Fail-closed is deliberate — a scanner that cannot run must block handoff,
 * because the patterns it detects are exactly the ones that inflate the score
 * metrics every other gate trusts.
 *
 * Accepted `llm_review` advisories (enforce mode, plan §6.10) only change the
 * verdict through `opts.acceptedAdvisories`, resolved for an explicitly
 * selected harness run. The raw fields always keep the scanner's own values.
 */
import { qaGatePassed, type QaScanFinding, type QaScanInvocation } from "@server/core/validation/qa";
import type { AcceptedAdvisoryResolution } from "@server/core/validation/qa/accepted-advisories.js";
import { effectiveQaVerdict } from "@server/core/validation/qa/scan-diff.js";

export interface QaGateEvaluation {
  qaGatePassed: boolean;
  qaGateSkipped: boolean;
  /** scan_diff.py exit code; null when the gate was skipped. */
  qaGateExitCode: number | null;
  qaFindings: QaScanFinding[] | null;
  qaCounts: { errors: number; warnings: number } | null;
  /** Operator-facing hint fragment; non-null only when the gate failed. */
  hint: string | null;
  /** The verdict after accepted-advisory exemptions; present only when a resolution was applied. */
  effective?: { exitCode: number; counts: { errors: number; warnings: number }; findings: QaScanFinding[] };
  exemptedAdvisories?: AcceptedAdvisoryResolution["exempt"];
  blockingAdvisories?: AcceptedAdvisoryResolution["blocking"];
  /** The no-run-selected notice (or why a selected run's acceptances were not honoured). */
  operatorMessage?: string;
}

export interface QaGateOptions {
  acceptedAdvisories?: AcceptedAdvisoryResolution;
  operatorMessage?: string;
}

const MAX_HINT_FINDINGS = 8;

function findingsHintList(findings: QaScanFinding[]): string {
  const errors = findings.filter((finding) => finding.severity === "error");
  const relevant = errors.length > 0 ? errors : findings;
  const parts = relevant.slice(0, MAX_HINT_FINDINGS).map((finding) => `${finding.rule_id} at ${finding.file}:${finding.line}`);
  if (relevant.length > MAX_HINT_FINDINGS) parts.push(`+${relevant.length - MAX_HINT_FINDINGS} more`);
  return parts.join(", ");
}

function limitedList(parts: string[]): string {
  const shown = parts.slice(0, MAX_HINT_FINDINGS);
  if (parts.length > MAX_HINT_FINDINGS) shown.push(`+${parts.length - MAX_HINT_FINDINGS} more`);
  return shown.join("; ");
}

/** Names each exempted advisory with its fingerprint and accepting checkpoint; null when nothing was exempted. */
export function exemptedAdvisoriesNote(evaluation: Pick<QaGateEvaluation, "exemptedAdvisories">): string | null {
  const exempted = evaluation.exemptedAdvisories ?? [];
  if (exempted.length === 0) return null;
  const parts = exempted.map(
    (entry) => `${entry.finding.rule_id} at ${entry.finding.file}:${entry.finding.line} (fingerprint ${entry.fingerprint}, checkpoint ${entry.checkpointId})`,
  );
  return `${exempted.length} accepted llm_review advisory finding(s) exempted: ${limitedList(parts)}.`;
}

function blockingAdvisoriesNote(blocking: AcceptedAdvisoryResolution["blocking"]): string | null {
  if (blocking.length === 0) return null;
  const parts = blocking.map((entry) => `${entry.finding.rule_id} at ${entry.finding.file}:${entry.finding.line} (${entry.reason})`);
  return `${blocking.length} llm_review advisory finding(s) not exempted: ${limitedList(parts)}.`;
}

function failedGateHint(errorCount: number, warningCount: number, findings: QaScanFinding[] | null, notes: string[]): string {
  const findingCount = errorCount + warningCount;
  const located = findings && findings.length > 0 ? ` (rule_ids: ${findingsHintList(findings)})` : "";
  return (
    `QA gate failed: ${findingCount} QA finding(s) detected (${errorCount} error, ${warningCount} warning)${located}. ` +
    notes.map((note) => `${note} `).join("") +
    "Each finding cites the violated standard; remove every finding or prove a false positive — a lower match % without it is the correct outcome. " +
    "See qa_scan.json."
  );
}

function rawQaGateEvaluation(invocation: QaScanInvocation | null, skip: boolean): QaGateEvaluation {
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
        "Fix the scanner (toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py) or, in an emergency only, rerun with --skip-qa-gate.",
    };
  }
  if (qaGatePassed(invocation)) {
    return { qaGatePassed: true, qaGateSkipped: false, qaGateExitCode: invocation.exitCode, qaFindings, qaCounts, hint: null };
  }
  const errorCount = qaCounts?.errors ?? (qaFindings ? qaFindings.filter((finding) => finding.severity === "error").length : 0);
  const warningCount = qaCounts?.warnings ?? (qaFindings ? qaFindings.filter((finding) => finding.severity === "warning").length : 0);
  return {
    qaGatePassed: false,
    qaGateSkipped: false,
    qaGateExitCode: invocation.exitCode,
    qaFindings,
    qaCounts,
    hint: failedGateHint(errorCount, warningCount, qaFindings, []),
  };
}

/**
 * Without `opts` the evaluation is byte-identical to the pre-advisory gate.
 * With `opts.acceptedAdvisories`, pass = no tool error, a parsed result, and
 * effective errors, warnings, and exit code all 0; a skipped gate, a tool
 * error, or an unparsed result ignores the resolution and fails closed as
 * before. `opts.operatorMessage` is carried through for the caller to print.
 */
export function evaluateQaGate(invocation: QaScanInvocation | null, skip: boolean, opts?: QaGateOptions): QaGateEvaluation {
  const raw = rawQaGateEvaluation(invocation, skip);
  if (opts === undefined) return raw;
  const operatorMessage = opts.operatorMessage === undefined ? {} : { operatorMessage: opts.operatorMessage };
  const resolution = opts.acceptedAdvisories;
  if (resolution === undefined || raw.qaGateSkipped || invocation === null || invocation.toolError !== null || invocation.result === null) {
    return { ...raw, ...operatorMessage };
  }
  const effective = effectiveQaVerdict(invocation, resolution);
  const rawFindings = invocation.result.findings;
  const exemptedAdvisories = resolution.exempt.filter((entry) => rawFindings.includes(entry.finding) && !effective.findings.includes(entry.finding));
  const blockingAdvisories = resolution.blocking;
  const passed = effective.counts.errors === 0 && effective.counts.warnings === 0 && effective.exitCode === 0;
  const notes = [exemptedAdvisoriesNote({ exemptedAdvisories }), blockingAdvisoriesNote(blockingAdvisories)].filter((note): note is string => note !== null);
  return {
    ...raw,
    qaGatePassed: passed,
    hint: passed ? null : failedGateHint(effective.counts.errors, effective.counts.warnings, effective.findings, notes),
    effective,
    exemptedAdvisories,
    blockingAdvisories,
    ...operatorMessage,
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
