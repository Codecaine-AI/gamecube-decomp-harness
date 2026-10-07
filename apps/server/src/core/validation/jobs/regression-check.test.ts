import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveGame } from "@server/core/game-registry";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { QaScanFinding, QaScanInvocation, QaScanResult } from "@server/core/validation/qa";
import type { AcceptedAdvisoryResolution } from "@server/core/validation/qa/accepted-advisories.js";
import {
  ADVISORY_FILE,
  LONG_CAST_LINE,
  createAcceptedAdvisoryScenario,
  type AcceptedAdvisoryScenario,
  type AdvisoryRepo,
  type WorkerChangeResult,
} from "@server/core/validation/qa/__fixtures__/advisory-repo.js";
import { regressionCheck } from "./regression-check.js";
import { composeHandoffVerdict, evaluateQaGate, type QaGateEvaluation } from "./qa-gate.js";

// regression-check runs ninja and the QA scan locally here; production defaults to Daytona.
let previousBuildMode: string | undefined;
beforeAll(() => {
  previousBuildMode = process.env.ORCH_BUILD_EXECUTION;
  process.env.ORCH_BUILD_EXECUTION = "local";
});
afterAll(() => {
  if (previousBuildMode === undefined) delete process.env.ORCH_BUILD_EXECUTION;
  else process.env.ORCH_BUILD_EXECUTION = previousBuildMode;
});

interface RegressionCheckSummary {
  artifactDir: string;
  buildFailure?: string;
  exitCode: number;
  handoffGateExitCode: number;
  hint: string;
  prPromotion: { status?: string } | null;
  prReportPath: string | null;
  qaGateExitCode: number | null;
  qaGateSkipped: boolean;
  qaFindings: QaScanFinding[] | null;
  qaCounts: { errors: number; warnings: number } | null;
  qaScanPath: string | null;
  qaAcceptedAdvisoryRun?: { runId: string; headRev: string };
  qaEffective?: QaGateEvaluation["effective"];
  qaExemptedAdvisories?: AcceptedAdvisoryResolution["exempt"];
  qaBlockingAdvisories?: AcceptedAdvisoryResolution["blocking"];
  qaOperatorMessage?: string;
  regressionCounts: Record<string, number> | null;
  runId: string;
  status: string;
}

interface RegressionCheckRun {
  processExitCode: number | undefined;
  summary: RegressionCheckSummary;
  /** Everything the command narrated on stderr (ninja output and its trace lines). */
  stderr: string;
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

/** A build.ninja whose `changes_all` runs `ninjaSource`, plus the smoke report it is expected to refresh. */
function writeBuildFixture(repoRoot: string, binDir: string, ninjaSource: string, reportMtime?: Date): void {
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
}

/** Run the real command, capturing its exit status, the summary it wrote, and its stderr narration. */
async function invokeRegressionCheck(globals: GlobalArgs, args: Map<string, string | true>): Promise<RegressionCheckRun> {
  const originalExitCode = process.exitCode;
  const originalConsoleLog = console.log;
  const originalStderrWrite = process.stderr.write;
  const printed: string[] = [];
  const stderr: string[] = [];
  process.exitCode = 0;
  console.log = (...values: unknown[]) => {
    printed.push(values.map(String).join(" "));
  };
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  try {
    await regressionCheck(globals, args);
    const processExitCode = process.exitCode;
    const output = printed.at(-1);
    if (output === undefined) throw new Error("regression-check printed no summary");
    const { summaryPath } = JSON.parse(output) as { summaryPath: string };
    return { processExitCode, summary: JSON.parse(readFileSync(summaryPath, "utf8")) as RegressionCheckSummary, stderr: stderr.join("") };
  } finally {
    process.exitCode = originalExitCode ?? 0;
    console.log = originalConsoleLog;
    process.stderr.write = originalStderrWrite;
  }
}

async function runRegressionCheckFixture(ninjaSource: string, reportMtime?: Date): Promise<{ processExitCode: number | undefined; summary: RegressionCheckSummary }> {
  const root = tempDir();
  const repoRoot = resolve(root, "repo");
  const stateDir = resolve(root, "state");
  writeBuildFixture(repoRoot, resolve(root, "bin"), ninjaSource, reportMtime);
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
  const { processExitCode, summary } = await invokeRegressionCheck(globals, args);
  return { processExitCode, summary };
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

// The command end to end (plan §5 M10, §6.10 L2 run selection): a temp
// harness checkout whose accepted line came through enforce at L1 and one
// integration commit, the real review_lint scan, and the real store.
describe("regressionCheck QA gate with accepted llm_review advisories", () => {
  let scenario: AcceptedAdvisoryScenario | undefined;
  let repo: AdvisoryRepo;
  let accepted: WorkerChangeResult;
  /** A second harness run in the same store, with no acceptances of its own. */
  let runB: string;
  let globals: GlobalArgs;

  beforeAll(async () => {
    scenario = await createAcceptedAdvisoryScenario();
    ({ repo, accepted } = scenario);
    // A harness keeps one current run, so run B is an earlier, completed run whose records share the store.
    runB = "earlier-run-b";
    repo.store.db
      .query("INSERT INTO runs (id, game_id, goal_kind, goal_value, desired_workers, status, created_at) VALUES (?, 'melee', 'matched_code_percent', 100, 1, 'completed', ?)")
      .run(runB, "2026-10-01T00:00:00.000Z");
    writeBuildFixture(repo.repoRoot, resolve(repo.root, "bin"), "#!/bin/sh\nsleep 0.02\ntouch build/GALE01/report_changes.json\nexit 0\n");
    mkdirSync(resolve(repo.repoRoot, ".git/info"), { recursive: true });
    appendFileSync(resolve(repo.repoRoot, ".git/info/exclude"), "/build/\n/build.ninja\n/.ninja_log\n/.ninja_deps\n");
    expect(repo.git("status", "--porcelain", "--untracked-files=all")).toBe("");
    globals = {
      repoRoot: repo.repoRoot,
      stateDir: repo.stateDir,
      gameId: "melee",
      game: resolveGame({ gameId: "melee", explicitOverrides: { repoRoot: repo.repoRoot, stateDir: repo.stateDir } }),
      dryRunAgents: false,
      provider: "test",
      model: "test",
      thinkingLevel: "low",
    };
    // An operator runs L2 on a quiet tree: let the integrated file age past the scan guard's 1 s margin.
    await Bun.sleep(1_100);
  }, 60_000);

  afterAll(() => {
    scenario?.teardown();
  });

  function runCommand(runId?: string): Promise<RegressionCheckRun> {
    const args = new Map<string, string | true>([["--qa-base", repo.baseRev]]);
    if (runId !== undefined) args.set("--run-id", runId);
    return invokeRegressionCheck(globals, args);
  }

  /** The raw scan is kept everywhere: summary fields and qa_scan.json both show the scanner's one warning. */
  function expectRawScanKept(summary: RegressionCheckSummary): QaScanFinding {
    expect(summary.qaGateSkipped).toBe(false);
    expect(summary.qaGateExitCode).toBe(2);
    expect(summary.qaCounts).toEqual({ errors: 0, warnings: 1 });
    const raw = JSON.parse(readFileSync(summary.qaScanPath!, "utf8")) as QaScanResult;
    expect(raw.counts).toEqual({ errors: 0, warnings: 1 });
    expect(summary.qaFindings).toEqual(raw.findings);
    const [cast] = raw.findings;
    expect(cast).toMatchObject({ rule_id: "type_erasing_cast", severity: "warning", file: ADVISORY_FILE, line: 10, excerpt: LONG_CAST_LINE.trim().slice(0, 240) });
    return cast!;
  }

  function expectNoRunHonoured({ processExitCode, summary, stderr }: RegressionCheckRun): void {
    const notice =
      `1 accepted llm_review advisories exist (runs: ${repo.runId}). No harness run was selected, so they are not honoured. ` +
      "Rerun with RUN_ID=<run> make regression-check (or --run-id <run>).";
    expect(processExitCode).toBe(1);
    expect(summary.status).toBe("failed");
    expect(summary.handoffGateExitCode).toBe(1);
    expectRawScanKept(summary);
    expect(summary.qaOperatorMessage).toBe(notice);
    expect(summary.hint).toStartWith("QA gate failed: 1 QA finding(s) detected (0 error, 1 warning)");
    expect(summary.hint).toEndWith(` ${notice}`);
    expect(stderr).toContain(`[regression-check] ${notice}\n`);
    for (const key of ["qaAcceptedAdvisoryRun", "qaEffective", "qaExemptedAdvisories", "qaBlockingAdvisories"]) {
      expect(Object.hasOwn(summary, key)).toBe(false);
    }
  }

  test("regression-check with no run id: today's verdict plus the operator message when accepted rows exist, no message when none exist", async () => {
    const result = await runCommand();
    expect(result.summary.runId).toBe("manual");
    expectNoRunHonoured(result);

    const rows = repo.store.db.query("SELECT * FROM accepted_advisory").all() as Array<Record<string, string | number | null>>;
    repo.store.db.query("DELETE FROM accepted_advisory").run();
    try {
      const none = await runCommand();
      expect(none.processExitCode).toBe(1);
      expectRawScanKept(none.summary);
      expect(none.summary.hint).toBe(
        `QA gate failed: 1 QA finding(s) detected (0 error, 1 warning) (rule_ids: type_erasing_cast at ${ADVISORY_FILE}:10). ` +
          "Each finding cites the violated standard; remove every finding or prove a false positive — a lower match % without it is the correct outcome. " +
          "See qa_scan.json.",
      );
      expect(none.stderr).not.toContain("accepted llm_review");
      for (const key of ["qaOperatorMessage", "qaAcceptedAdvisoryRun", "qaEffective", "qaExemptedAdvisories", "qaBlockingAdvisories"]) {
        expect(Object.hasOwn(none.summary, key)).toBe(false);
      }
    } finally {
      for (const row of rows) {
        const columns = Object.keys(row);
        repo.store.db
          .query(`INSERT INTO accepted_advisory (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
          .run(...columns.map((column) => row[column] ?? null));
      }
    }
  }, 30_000);

  test("regression-check with an unknown run id behaves like no run id", async () => {
    const result = await runCommand("no-such-run");
    expect(result.summary.runId).toBe("no-such-run");
    expectNoRunHonoured(result);
  }, 30_000);

  test("regression-check with an explicit run id uses only that run's records", async () => {
    const runA = await runCommand(repo.runId);
    expect(runA.processExitCode).toBe(0);
    expect(runA.summary.status).toBe("passed");
    const cast = expectRawScanKept(runA.summary);
    expect(runA.summary.qaAcceptedAdvisoryRun).toEqual({ runId: repo.runId, headRev: accepted.integratedRev });
    expect(runA.summary.qaEffective).toEqual({ exitCode: 0, counts: { errors: 0, warnings: 0 }, findings: [] });
    expect(runA.summary.qaExemptedAdvisories).toEqual([{
      fingerprint: accepted.acceptedFingerprints[0]!,
      finding: cast,
      checkpointId: accepted.checkpointId,
      blame: { commit: accepted.integratedRev, origLine: 10 },
    }]);
    expect(runA.summary.qaBlockingAdvisories).toEqual([]);
    expect(Object.hasOwn(runA.summary, "qaOperatorMessage")).toBe(false);
    const exemption =
      `1 accepted llm_review advisory finding(s) exempted: type_erasing_cast at ${ADVISORY_FILE}:10 ` +
      `(fingerprint ${accepted.acceptedFingerprints[0]}, checkpoint ${accepted.checkpointId}).`;
    expect(runA.summary.hint).toStartWith("No regressions were reported");
    expect(runA.summary.hint).toEndWith(` ${exemption}`);
    expect(runA.stderr).toContain(`[regression-check] ${exemption}\n`);

    const other = await runCommand(runB);
    expect(other.processExitCode).toBe(1);
    expect(other.summary.status).toBe("failed");
    const blocked = expectRawScanKept(other.summary);
    expect(other.summary.qaAcceptedAdvisoryRun).toEqual({ runId: runB, headRev: accepted.integratedRev });
    expect(other.summary.qaEffective).toEqual({ exitCode: 2, counts: { errors: 0, warnings: 1 }, findings: [blocked] });
    expect(other.summary.qaExemptedAdvisories).toEqual([]);
    expect(other.summary.qaBlockingAdvisories).toEqual([
      { fingerprint: accepted.acceptedFingerprints[0]!, finding: blocked, reason: "no-accepted-record" },
    ]);
    expect(other.summary.hint).toContain(`1 llm_review advisory finding(s) not exempted: type_erasing_cast at ${ADVISORY_FILE}:10 (no-accepted-record).`);
  }, 30_000);

  test("regression-check forwards its scan guard: an accepted file rewritten just before the scan is not exempt", async () => {
    // Same bytes, so status stays clean and HEAD and blame are unchanged; only the guard's timestamps see the write.
    const path = resolve(repo.repoRoot, ADVISORY_FILE);
    writeFileSync(path, readFileSync(path, "utf8"));
    expect(repo.git("status", "--porcelain", "--untracked-files=all")).toBe("");
    const { processExitCode, summary } = await runCommand(repo.runId);
    expect(processExitCode).toBe(1);
    expectRawScanKept(summary);
    expect(summary.qaExemptedAdvisories).toEqual([]);
    expect(summary.qaBlockingAdvisories?.map(({ fingerprint, reason }) => [fingerprint, reason])).toEqual([
      [accepted.acceptedFingerprints[0]!, "dirty-file"],
    ]);
  }, 30_000);
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

function advisory(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return finding({
    rule_id: "type_erasing_cast",
    severity: "warning",
    line: 7,
    excerpt: "lbSnap_Apply((void*)&fighter->mv, 0x24);",
    message: "New type-erasing pointer cast.",
    standard_id: "global_standard:typed-fields-over-pointer-math",
    detail: { llm_review: true, cast: "void*" },
    ...overrides,
  });
}

/** Six invocations covering every evaluateQaGate branch; recorded before the accepted-advisory change. */
function defaultPathInvocations(): Array<[string, QaScanInvocation | null, boolean]> {
  const many = Array.from({ length: 10 }, (_, index) => finding({ line: 100 + index }));
  return [
    ["clean", invocation(), false],
    ["advisory warning only", invocation({ exitCode: 2, result: scanResult([advisory()], "warned") }), false],
    ["errors past the hint limit plus an advisory", invocation({ exitCode: 1, result: scanResult([...many, advisory()], "failed") }), false],
    ["tool error", invocation({ exitCode: -1, result: null, stdout: "", toolError: "scan_diff.py not found at /nope/scan_diff.py" }), false],
    ["unparseable stdout", invocation({ exitCode: 0, result: null, stdout: "not json", toolError: "scan_diff.py did not return parseable JSON (exit 0)" }), false],
    ["skipped", null, true],
  ];
}

describe("evaluateQaGate default path", () => {
  test("evaluateQaGate without opts is byte-identical to today", () => {
    const evaluations = defaultPathInvocations().map(([name, scan, skip]) =>
      `${name}\n${JSON.stringify(evaluateQaGate(scan, skip), (_key, value: unknown) => (value === undefined ? "<undefined>" : value), 2)}`,
    );
    expect(evaluations.join("\n\n")).toMatchSnapshot();
  });
});

function exemptAll(...findings: QaScanFinding[]): AcceptedAdvisoryResolution {
  return {
    runId: "run-a",
    headRev: "f".repeat(40),
    exempt: findings.map((entry, index) => ({
      fingerprint: `af2:${String(index).repeat(64)}`,
      finding: entry,
      checkpointId: `cp-${index}`,
      blame: { commit: "f".repeat(40), origLine: entry.line },
    })),
    blocking: [],
  };
}

describe("evaluateQaGate with accepted advisories", () => {
  test("tool error still fails closed with exemptions present", () => {
    const accepted = advisory();
    const scan = invocation({ exitCode: -1, result: null, stdout: "", toolError: "scan_diff.py failed with exit 3" });
    const gate = evaluateQaGate(scan, false, { acceptedAdvisories: exemptAll(accepted) });
    expect(gate).toEqual(evaluateQaGate(scan, false));
    expect(gate.qaGatePassed).toBe(false);
    expect(gate.effective).toBeUndefined();
    expect(gate.hint).toContain("fails closed");
  });

  test("deterministic finding still blocks", () => {
    const accepted = advisory();
    const deterministicWarning = finding({ rule_id: "storage_widening", severity: "warning", line: 9 });
    const error = finding({ line: 11 });
    const warningsOnly = invocation({ exitCode: 2, result: scanResult([accepted, deterministicWarning], "warned") });
    // Even a resolution that lists the deterministic warning and an error as exempt cannot remove them.
    const warned = evaluateQaGate(warningsOnly, false, { acceptedAdvisories: exemptAll(accepted, deterministicWarning) });
    expect(warned.qaGatePassed).toBe(false);
    expect(warned.effective).toEqual({ exitCode: 2, counts: { errors: 0, warnings: 1 }, findings: [deterministicWarning] });
    expect(warned.exemptedAdvisories?.map((entry) => entry.finding)).toEqual([accepted]);
    expect(warned.hint).toContain("storage_widening at src/melee/ft/ftcoll.c:9");

    const failed = evaluateQaGate(invocation({ exitCode: 1, result: scanResult([accepted, error], "failed") }), false, {
      acceptedAdvisories: exemptAll(accepted, error),
    });
    expect(failed.qaGatePassed).toBe(false);
    expect(failed.effective).toEqual({ exitCode: 1, counts: { errors: 1, warnings: 0 }, findings: [error] });
  });

  test("effective exit code 0 only when raw exit 2 and effective counts are 0", () => {
    const accepted = advisory();
    const other = advisory({ line: 30, excerpt: "f((void*)q);" });
    const allAccepted = invocation({ exitCode: 2, result: scanResult([accepted], "warned") });
    const passed = evaluateQaGate(allAccepted, false, { acceptedAdvisories: exemptAll(accepted) });
    expect(passed).toMatchObject({
      qaGatePassed: true,
      hint: null,
      effective: { exitCode: 0, counts: { errors: 0, warnings: 0 }, findings: [] },
      // Raw scanner evidence is retained.
      qaGateExitCode: 2,
      qaCounts: { errors: 0, warnings: 1 },
      qaFindings: [accepted],
    });
    expect(allAccepted.result?.findings).toEqual([accepted]);

    const remaining = evaluateQaGate(invocation({ exitCode: 2, result: scanResult([accepted, other], "warned") }), false, {
      acceptedAdvisories: { ...exemptAll(accepted), blocking: [{ fingerprint: null, finding: other, reason: "dirty-file" }] },
    });
    expect(remaining.qaGatePassed).toBe(false);
    expect(remaining.effective?.exitCode).toBe(2);
    expect(remaining.hint).toContain("QA gate failed: 1 QA finding(s) detected (0 error, 1 warning)");
    expect(remaining.hint).toContain("exempted: type_erasing_cast at src/melee/ft/ftcoll.c:7 (fingerprint af2:0000");
    expect(remaining.hint).toContain("checkpoint cp-0)");
    expect(remaining.hint).toContain("not exempted: type_erasing_cast at src/melee/ft/ftcoll.c:30 (dirty-file)");

    const nothingExempted = invocation({ exitCode: 2, result: { ...scanResult([], "warned"), counts: { errors: 0, warnings: 0 } } });
    expect(evaluateQaGate(nothingExempted, false, { acceptedAdvisories: exemptAll() }).effective?.exitCode).toBe(2);

    // A finding object that is not this scan's own, or raw counts that disagree with the findings, exempt nothing.
    const copied = evaluateQaGate(allAccepted, false, { acceptedAdvisories: exemptAll({ ...accepted }) });
    expect(copied.qaGatePassed).toBe(false);
    expect(copied.exemptedAdvisories).toEqual([]);
    const miscounted = invocation({ exitCode: 2, result: { ...scanResult([accepted], "warned"), counts: { errors: 0, warnings: 2 } } });
    expect(evaluateQaGate(miscounted, false, { acceptedAdvisories: exemptAll(accepted) }).effective).toEqual({
      exitCode: 2,
      counts: { errors: 0, warnings: 2 },
      findings: [accepted],
    });
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
