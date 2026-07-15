import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import type { QaScanFinding, QaScanInvocation, QaScanResult } from "@server/core/validation/qa";
import { regressionCheck } from "./regression-check.js";
import { composeHandoffVerdict, evaluateQaGate } from "./qa-gate.js";

interface RegressionCheckSummary {
  artifactDir: string;
  buildFailure?: string;
  exitCode: number;
  hint: string;
  prPromotion: { status?: string } | null;
  prReportPath: string | null;
  qaGateExitCode: number | null;
  qaGateSkipped: boolean;
  regressionCounts: Record<string, number> | null;
  status: string;
}

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "regression-check-"));
  tempDirs.push(dir);
  return dir;
}

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

async function runRegressionCheckFixture(ninjaSource: string, reportMtime?: Date): Promise<{ processExitCode: number | undefined; summary: RegressionCheckSummary }> {
  const root = tempDir();
  const repoRoot = resolve(root, "repo");
  const stateDir = resolve(root, "state");
  const binDir = resolve(root, "bin");
  const reportDir = resolve(repoRoot, "build/GALE01");
  const reportChangesPath = resolve(reportDir, "report_changes.json");
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  copyFileSync(resolve(import.meta.dir, "../../../../testdata/smoke_repo/build/GALE01/report_changes.json"), reportChangesPath);
  if (reportMtime) utimesSync(reportChangesPath, reportMtime, reportMtime);
  const buildStepPath = resolve(binDir, "build-step");
  writeExecutable(buildStepPath, ninjaSource);
  writeFileSync(
    resolve(repoRoot, "build.ninja"),
    `rule regression_check_fixture
  command = ${buildStepPath}
  description = regression-check fixture
build build/GALE01/src/melee/ft/ftcoll.o: regression_check_fixture
build changes_all: phony build/GALE01/src/melee/ft/ftcoll.o
`,
  );

  const globals: GlobalArgs = {
    repoRoot,
    stateDir,
    dryRunAgents: false,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
  const args = new Map<string, string | true>([
    ["--run-id", "test"],
    ["--skip-qa-gate", true],
  ]);
  const originalExitCode = process.exitCode;
  const originalConsoleLog = console.log;
  process.exitCode = 0;
  console.log = () => {};
  try {
    await regressionCheck(globals, args);
    const processExitCode = process.exitCode;
    const runRoot = resolve(stateDir, "regression_checks/test");
    const artifactNames = readdirSync(runRoot);
    if (artifactNames.length !== 1) throw new Error(`Expected one regression-check artifact directory, found ${artifactNames.length}`);
    const summary = JSON.parse(readFileSync(resolve(runRoot, artifactNames[0], "summary.json"), "utf8")) as RegressionCheckSummary;
    return { processExitCode, summary };
  } finally {
    process.exitCode = originalExitCode ?? 0;
    console.log = originalConsoleLog;
  }
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs.length = 0;
});

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "extern_in_c",
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

describe("regressionCheck", () => {
  test("fails closed without regression counts when Ninja fails", async () => {
    const { processExitCode, summary } = await runRegressionCheckFixture(`#!/bin/sh
echo "FAILED: build/GALE01/src/melee/ft/ftcoll.o"
i=1
while [ "$i" -le 35 ]; do
  echo "failure-line-$i"
  i=$((i + 1))
done
exit 7
`);

    expect(processExitCode).toBe(7);
    expect(summary.status).toBe("build_failed");
    expect(summary.exitCode).toBe(7);
    expect(summary.regressionCounts).toBeNull();
    expect(summary.prPromotion).toBeNull();
    expect(summary.prReportPath).toBeNull();
    expect(summary.buildFailure?.split("\n")).toHaveLength(30);
    expect(summary.buildFailure).toContain("failure-line-35");
    expect(summary.hint).toContain('Ninja failed at target "build/GALE01/src/melee/ft/ftcoll.o"');
    expect(existsSync(resolve(summary.artifactDir, "pr_report.md"))).toBe(false);
  });

  test("treats an unchanged report_changes.json mtime as build_failed", async () => {
    const { processExitCode, summary } = await runRegressionCheckFixture("#!/bin/sh\nexit 0\n", new Date("2000-01-01T00:00:00.000Z"));

    expect(processExitCode).toBe(1);
    expect(summary.status).toBe("build_failed");
    expect(summary.exitCode).toBe(1);
    expect(summary.regressionCounts).toBeNull();
    expect(summary.prReportPath).toBeNull();
    expect(summary.buildFailure).toContain("report_changes.json is stale");
    expect(summary.buildFailure).toContain("is not newer than the build start");
    expect(summary.hint).toContain("was not refreshed after the build started");
    expect(existsSync(resolve(summary.artifactDir, "pr_report.md"))).toBe(false);
  });

  test("keeps the green report and summary behavior unchanged", async () => {
    const { processExitCode, summary } = await runRegressionCheckFixture(`#!/bin/sh
sleep 0.02
touch build/GALE01/report_changes.json
exit 0
`);

    expect(processExitCode).toBe(0);
    expect(summary.status).toBe("passed");
    expect(summary.exitCode).toBe(0);
    expect(summary.regressionCounts).toEqual({
      metricRegressions: 0,
      newMatches: 1,
      brokenMatches: 0,
      improvements: 1,
      fuzzyRegressions: 0,
    });
    expect(summary.prPromotion?.status).toBe("pr_ready");
    expect(summary.qaGateExitCode).toBeNull();
    expect(summary.qaGateSkipped).toBe(true);
    expect(summary.hint).toBe(
      "No regressions were reported and the PR promotion gate found reviewer-worthy evidence. Use pr_report.md as the expected/local run section of the PR description.",
    );
    expect(Object.hasOwn(summary, "buildFailure")).toBe(false);
    expect(summary.prReportPath && existsSync(summary.prReportPath)).toBe(true);
  });
});

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
    expect(gate.hint).toContain("extern_in_c at src/melee/ft/ftcoll.c:42");
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
