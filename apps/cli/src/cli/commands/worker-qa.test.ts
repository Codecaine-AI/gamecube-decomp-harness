import { describe, expect, test } from "bun:test";
import type { evaluateWorkerReportAcceptance } from "@decomp-orchestrator/agents/worker";
import { QA_LINT_REPAIR_INSTRUCTION, type WorkerChangeValidation, type WorkerQaLint } from "@decomp-orchestrator/agents/worker/change-validation";
import type { QaScanFinding } from "@decomp-orchestrator/core/qa";
import type { PiRunResult } from "@decomp-orchestrator/core/types";
import { classifyWorkerError, finalWorkerReportType, isPoolFatalErrorKind, isReworkErrorKind, workerAttemptRepairReasons } from "./worker.js";

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "packed_string_blob",
    severity: "error",
    file: "src/melee/mn/mncount.c",
    line: 782,
    excerpt: 'static char lbl_803EE888[0x18] = "a\\0b";',
    message: "hand-packed string blob",
    standard_id: "global_standard:literals-and-data-ownership",
    ...overrides,
  };
}

function violationsQaLint(findings: QaScanFinding[] = [finding()]): WorkerQaLint {
  return { status: "violations", exitCode: 1, findings, scanPath: "/tmp/attempt-0.qa_diff.patch", toolError: null };
}

function warningsQaLint(findings: QaScanFinding[] = [finding({ severity: "warning" })]): WorkerQaLint {
  return { status: "warnings", exitCode: 2, findings, scanPath: "/tmp/attempt-0.qa_diff.patch", toolError: null };
}

function acceptedGate(): ReturnType<typeof evaluateWorkerReportAcceptance> {
  return { intendedReportType: "score_candidate", effectiveReportType: "score_candidate", accepted: true, reasons: [] };
}

function piResult(): PiRunResult {
  return {
    sessionId: "session-1",
    outputPath: "/tmp/worker.out",
    systemPromptPath: "/tmp/worker.system.md",
    userPromptPath: "/tmp/worker.user.md",
    rawText: "{}",
    dryRun: false,
  };
}

function rejectedValidation(qaLint: WorkerQaLint): WorkerChangeValidation {
  // What applyQaLintToValidation produces from a score-improving attempt with violations.
  return {
    status: "failed",
    reasons: [`qa lint found 1 QA finding(s) requiring repair (gate exit ${qaLint.exitCode ?? "unknown"})`],
    target: { unit: "melee/mn/mncount.c", symbol: "mnCount_803EE888", before: 80, after: 99.999999, improved: true, exact: true },
    qaLint,
  };
}

function passedValidation(qaLint: WorkerQaLint | null): WorkerChangeValidation {
  return {
    status: "passed",
    reasons: [],
    target: { unit: "melee/mn/mncount.c", symbol: "mnCount_803EE888", before: 80, after: 99.999999, improved: true, exact: true },
    qaLint,
  };
}

describe("workerAttemptRepairReasons", () => {
  test("violations append one verbatim qa_lint_finding reason per finding plus the instruction", () => {
    const validation = rejectedValidation(violationsQaLint());
    const reasons = workerAttemptRepairReasons({ acceptanceGate: acceptedGate(), writeSetDiffChanged: true, runnerValidation: validation });
    expect(reasons).toContain(
      'qa_lint_finding: error packed_string_blob at src/melee/mn/mncount.c:782 — hand-packed string blob [standard: global_standard:literals-and-data-ownership] excerpt: static char lbl_803EE888[0x18] = "a\\0b";',
    );
    expect(reasons[reasons.length - 1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
    // The runner-validation summary reason also rides along (status is failed).
    expect(reasons.some((reason) => reason.startsWith("runner validation: qa lint found"))).toBe(true);
  });

  test("warnings append repair reasons too", () => {
    const validation = rejectedValidation(warningsQaLint());
    const reasons = workerAttemptRepairReasons({ acceptanceGate: acceptedGate(), writeSetDiffChanged: true, runnerValidation: validation });
    expect(reasons).toContain(
      'qa_lint_finding: warning packed_string_blob at src/melee/mn/mncount.c:782 — hand-packed string blob [standard: global_standard:literals-and-data-ownership] excerpt: static char lbl_803EE888[0x18] = "a\\0b";',
    );
    expect(reasons[reasons.length - 1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
  });

  test("tool_unavailable contributes no rejection reasons: a passed attempt stays accepted", () => {
    const qaLint: WorkerQaLint = { status: "tool_unavailable", exitCode: -1, findings: [], scanPath: null, toolError: "scan_diff.py not found" };
    const reasons = workerAttemptRepairReasons({ acceptanceGate: acceptedGate(), writeSetDiffChanged: true, runnerValidation: passedValidation(qaLint) });
    expect(reasons).toEqual([]);
  });

  test("clean qaLint on a passed attempt yields no repair reasons", () => {
    const qaLint: WorkerQaLint = { status: "clean", exitCode: 0, findings: [], scanPath: null, toolError: null };
    expect(workerAttemptRepairReasons({ acceptanceGate: acceptedGate(), writeSetDiffChanged: true, runnerValidation: passedValidation(qaLint) })).toEqual([]);
  });
});

describe("classifyWorkerError with QA lint violations", () => {
  test("final-attempt violations classify as runner_validation_qa_lint_failed with the finding details", () => {
    const classification = classifyWorkerError({
      result: piResult(),
      agentReport: { report_type: "score_candidate" },
      acceptanceGate: acceptedGate(),
      runnerValidation: rejectedValidation(violationsQaLint()),
    });
    expect(classification).not.toBeNull();
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(classification?.summary).toContain("QA lint rejected the attempt");
    expect(classification?.reasons.some((reason) => reason.startsWith("qa_lint_finding: error packed_string_blob"))).toBe(true);
  });

  test("warning findings also classify as runner_validation_qa_lint_failed", () => {
    const classification = classifyWorkerError({
      result: piResult(),
      agentReport: { report_type: "score_candidate" },
      acceptanceGate: acceptedGate(),
      runnerValidation: rejectedValidation(warningsQaLint()),
    });
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(classification?.summary).toContain("1 QA finding(s) requiring repair");
    expect(classification?.reasons.some((reason) => reason.startsWith("qa_lint_finding: warning packed_string_blob"))).toBe(true);
  });

  test("the kind is a rework kind and routes to needs_rework, never the tool_error quarantine path", () => {
    const classification = classifyWorkerError({
      result: piResult(),
      agentReport: { report_type: "score_candidate" },
      acceptanceGate: acceptedGate(),
      runnerValidation: rejectedValidation(violationsQaLint()),
    });
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(isReworkErrorKind("runner_validation_qa_lint_failed")).toBe(true);

    const reportType = finalWorkerReportType({ errorClassification: classification, repairExhausted: true, acceptanceGate: acceptedGate() });
    expect(reportType).toBe("needs_rework");
    // The pool-fatal `failed` flag in runWorkerCycle only fires for tool_error
    // report types; a QA rejection can never drain the pool regardless of
    // isPoolFatalErrorKind's verdict on the kind itself.
    expect(reportType).not.toBe("tool_error");
    expect(reportType === "tool_error" && isPoolFatalErrorKind("runner_validation_qa_lint_failed")).toBe(false);
  });

  test("tool_unavailable qaLint does not reject an otherwise passed attempt", () => {
    const qaLint: WorkerQaLint = { status: "tool_unavailable", exitCode: -1, findings: [], scanPath: null, toolError: "scan_diff.py not found" };
    const classification = classifyWorkerError({
      result: piResult(),
      agentReport: { report_type: "score_candidate" },
      acceptanceGate: acceptedGate(),
      runnerValidation: passedValidation(qaLint),
    });
    expect(classification).toBeNull();
  });

  test("clean qaLint on a passed attempt produces no error classification", () => {
    const qaLint: WorkerQaLint = { status: "clean", exitCode: 0, findings: [], scanPath: "/tmp/attempt-0.qa_diff.patch", toolError: null };
    const classification = classifyWorkerError({
      result: piResult(),
      agentReport: { report_type: "score_candidate" },
      acceptanceGate: acceptedGate(),
      runnerValidation: passedValidation(qaLint),
    });
    expect(classification).toBeNull();
  });

  test("violations outrank the generic runner_validation_<status> kind", () => {
    const validation: WorkerChangeValidation = {
      status: "no_official_score_change",
      reasons: ["target did not improve", "qa lint found 1 QA finding(s) requiring repair (gate exit 1)"],
      qaLint: violationsQaLint(),
    };
    const classification = classifyWorkerError({
      result: piResult(),
      agentReport: { report_type: "score_candidate" },
      acceptanceGate: acceptedGate(),
      runnerValidation: validation,
    });
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(classification?.reasons).toContain("target did not improve");
  });
});
