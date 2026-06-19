import { describe, expect, test } from "bun:test";
import type { QaScanFinding, QaScanInvocation, QaScanResult } from "@decomp-orchestrator/core/qa";
import { composeHandoffVerdict, evaluateQaGate } from "./qa-gate.js";

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "extern_literal_anchor",
    severity: "error",
    file: "src/melee/ft/ftcoll.c",
    line: 42,
    excerpt: "extern const f32 lbl_804DA60C;",
    message: "extern-for-literal anchor referencing TU-owned data",
    standard_id: "global_standard:literals-and-data-ownership",
    ...overrides,
  };
}

function scanResult(findings: QaScanFinding[], status: QaScanResult["status"]): QaScanResult {
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status,
    repo: "/tmp/melee",
    base: "origin/master",
    findings,
    counts: {
      errors: findings.filter((entry) => entry.severity === "error").length,
      warnings: findings.filter((entry) => entry.severity === "warning").length,
    },
  };
}

function invocation(overrides: Partial<QaScanInvocation> = {}): QaScanInvocation {
  return {
    exitCode: 0,
    result: scanResult([], "passed"),
    stdout: "{}",
    stderr: "",
    toolError: null,
    command: ["python3", "scan_diff.py", "--gate", "--json"],
    ...overrides,
  };
}

describe("evaluateQaGate", () => {
  test("clean scan (exit 0) passes with zero counts and no hint", () => {
    const gate = evaluateQaGate(invocation(), false);
    expect(gate.qaGatePassed).toBe(true);
    expect(gate.qaGateSkipped).toBe(false);
    expect(gate.qaGateExitCode).toBe(0);
    expect(gate.qaCounts).toEqual({ errors: 0, warnings: 0 });
    expect(gate.qaFindings).toEqual([]);
    expect(gate.hint).toBeNull();
  });

  test("warnings only (exit 2) fails the QA gate and surfaces warning counts and findings", () => {
    const warn = finding({ rule_id: "packed_string_blob", severity: "warning", line: 7 });
    const gate = evaluateQaGate(invocation({ exitCode: 2, result: scanResult([warn], "warned") }), false);
    expect(gate.qaGatePassed).toBe(false);
    expect(gate.qaGateExitCode).toBe(2);
    expect(gate.qaCounts).toEqual({ errors: 0, warnings: 1 });
    expect(gate.qaFindings).toHaveLength(1);
    expect(gate.hint).toContain("0 error, 1 warning");
    expect(gate.hint).toContain("packed_string_blob at src/melee/ft/ftcoll.c:7");
  });

  test("hard fail (exit 1) fails with rule ids and locations in the hint", () => {
    const findings = [
      finding(),
      finding({ rule_id: "unrolled_assert", file: "src/melee/gr/ground.c", line: 99 }),
    ];
    const gate = evaluateQaGate(invocation({ exitCode: 1, result: scanResult(findings, "failed") }), false);
    expect(gate.qaGatePassed).toBe(false);
    expect(gate.qaGateExitCode).toBe(1);
    expect(gate.qaCounts).toEqual({ errors: 2, warnings: 0 });
    expect(gate.hint).toContain("QA gate failed: 2 QA finding(s)");
    expect(gate.hint).toContain("2 error, 0 warning");
    expect(gate.hint).toContain("extern_literal_anchor at src/melee/ft/ftcoll.c:42");
    expect(gate.hint).toContain("unrolled_assert at src/melee/gr/ground.c:99");
    expect(gate.hint).toContain("lower match % without it is the correct outcome");
    expect(gate.hint).toContain("qa_scan.json");
  });

  test("tool error fails closed and the hint explains --skip-qa-gate", () => {
    const gate = evaluateQaGate(
      invocation({ exitCode: -1, result: null, stdout: "", toolError: "scan_diff.py not found at /nope/scan_diff.py" }),
      false,
    );
    expect(gate.qaGatePassed).toBe(false);
    expect(gate.qaGateExitCode).toBe(-1);
    expect(gate.qaFindings).toBeNull();
    expect(gate.qaCounts).toBeNull();
    expect(gate.hint).toContain("fails closed");
    expect(gate.hint).toContain("scan_diff.py not found");
    expect(gate.hint).toContain("--skip-qa-gate");
  });

  test("unparseable stdout with a passing exit code still fails closed", () => {
    const gate = evaluateQaGate(
      invocation({ exitCode: 0, result: null, stdout: "not json", toolError: "scan_diff.py did not return parseable JSON (exit 0)" }),
      false,
    );
    expect(gate.qaGatePassed).toBe(false);
    expect(gate.hint).toContain("--skip-qa-gate");
  });

  test("skipped gate passes with null exit code and null artifacts", () => {
    const gate = evaluateQaGate(null, true);
    expect(gate.qaGatePassed).toBe(true);
    expect(gate.qaGateSkipped).toBe(true);
    expect(gate.qaGateExitCode).toBeNull();
    expect(gate.qaFindings).toBeNull();
    expect(gate.qaCounts).toBeNull();
    expect(gate.hint).toBeNull();
  });

  test("skip wins even when an invocation is supplied", () => {
    const gate = evaluateQaGate(invocation({ exitCode: 1, result: scanResult([finding()], "failed") }), true);
    expect(gate.qaGatePassed).toBe(true);
    expect(gate.qaGateSkipped).toBe(true);
    expect(gate.qaGateExitCode).toBeNull();
  });
});

describe("composeHandoffVerdict", () => {
  test("regression gate passing does not mask a QA failure", () => {
    const verdict = composeHandoffVerdict({ regressionGatePassed: true, promotionBlocked: false, qaGatePassed: false });
    expect(verdict.passed).toBe(false);
    expect(verdict.status).toBe("failed");
  });

  test("all gates passing yields passed", () => {
    const verdict = composeHandoffVerdict({ regressionGatePassed: true, promotionBlocked: false, qaGatePassed: true });
    expect(verdict.passed).toBe(true);
    expect(verdict.status).toBe("passed");
  });

  test("promotion block still fails even with a clean QA gate", () => {
    const verdict = composeHandoffVerdict({ regressionGatePassed: true, promotionBlocked: true, qaGatePassed: true });
    expect(verdict.passed).toBe(false);
    expect(verdict.status).toBe("failed");
  });

  test("stubbed summary: passed stays false when regression passes but QA fails, true when both pass", () => {
    const failingGate = evaluateQaGate(invocation({ exitCode: 1, result: scanResult([finding()], "failed") }), false);
    const failingSummary = {
      regressionGateExitCode: 0,
      ...composeHandoffVerdict({ regressionGatePassed: true, promotionBlocked: false, qaGatePassed: failingGate.qaGatePassed }),
      qaGateExitCode: failingGate.qaGateExitCode,
      qaGateSkipped: failingGate.qaGateSkipped,
      qaFindings: failingGate.qaFindings,
      qaCounts: failingGate.qaCounts,
    };
    expect(failingSummary.passed).toBe(false);
    expect(failingSummary.status).toBe("failed");
    expect(failingSummary.qaGateExitCode).toBe(1);
    expect(failingSummary.qaCounts).toEqual({ errors: 1, warnings: 0 });

    const cleanGate = evaluateQaGate(invocation(), false);
    const cleanSummary = {
      regressionGateExitCode: 0,
      ...composeHandoffVerdict({ regressionGatePassed: true, promotionBlocked: false, qaGatePassed: cleanGate.qaGatePassed }),
      qaGateExitCode: cleanGate.qaGateExitCode,
      qaGateSkipped: cleanGate.qaGateSkipped,
    };
    expect(cleanSummary.passed).toBe(true);
    expect(cleanSummary.status).toBe("passed");
  });
});
