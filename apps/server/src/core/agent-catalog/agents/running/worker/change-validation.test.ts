import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { QaScanFinding, QaScanInvocation, QaScanResult, RunQaScanDiffOptions } from "@server/core/validation/qa";
import {
  applyQaLintToValidation,
  captureWorkerChangeBaseline,
  compareWorkerUnitSnapshots,
  effectiveQaLint,
  extendWorkerChangeBaselineSourceSnapshot,
  failForPendingAdvisories,
  QA_LINT_ADVISORY_REPAIR_INSTRUCTION_ENFORCE,
  QA_LINT_REPAIR_INSTRUCTION,
  qaLintAdvisoryPartition,
  qaLintFromInvocation,
  qaLintRepairReasons,
  rewriteNoIndexDiffPaths,
  validateWorkerChange,
  type WorkerChangeBaseline,
  type WorkerChangeValidation,
  type WorkerQaLint,
  type WorkerUnitScoreSnapshot,
} from "./change-validation.js";
import type { WorkerRunnerValidation } from "./runner-validation.js";
import type { WorkspaceExec, WorkspaceExecOptions } from "@server/infrastructure/shell";

function fakeWorkspaceExec(exec: WorkspaceExec["exec"] = async () => ({ exitCode: 0, stdout: "", stderr: "" })): WorkspaceExec {
  return { exec } as WorkspaceExec;
}

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
    base: null,
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

function passedValidation(): WorkerRunnerValidation {
  return {
    status: "passed",
    reasons: [],
    target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", before: 62.5, after: 99.999999, improved: true, exact: true },
    regressions: [],
    improvements: [{ kind: "function", unit: "melee/ft/ftcoll.c", item: "ftCo_800C8E5C", before: 62.5, after: 99.999999 }],
  };
}

function scoreSnapshot(score: number): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-06-30T00:00:00.000Z",
    unit: "main/melee/gm/gm_1601",
    symbol: "gm_8016247C",
    sourcePath: "src/melee/gm/gm_1601.c",
    objectTarget: "build/GALE01/src/melee/gm/gm_1601.o",
    metrics: [{ name: "main/melee/gm/gm_1601", score }],
    functions: [{ name: "gm_8016247C", score }],
    sections: [],
    targetScore: score,
  };
}

function sectionScoreSnapshot(params: {
  sectionScore: number;
  functions?: WorkerUnitScoreSnapshot["functions"];
  metrics?: WorkerUnitScoreSnapshot["metrics"];
}): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-06-30T00:00:00.000Z",
    unit: "main/melee/test/data",
    symbol: ".sdata2",
    sourcePath: "src/melee/test/data.c",
    objectTarget: "build/GALE01/src/melee/test/data.o",
    metrics: params.metrics ?? [],
    functions: params.functions ?? [],
    sections: [{ name: ".sdata2", score: params.sectionScore, size: 32 }],
    targetScore: params.sectionScore,
  };
}

describe("rewriteNoIndexDiffPaths", () => {
  test("rewrites absolute --no-index headers to repo-relative a/ b/ paths", () => {
    const diff = [
      "diff --git a/Users/x/state/pre_worker_source/src/melee/ft/ftcoll.c b/Users/x/repo/src/melee/ft/ftcoll.c",
      "index 1111111..2222222 100644",
      "--- a/Users/x/state/pre_worker_source/src/melee/ft/ftcoll.c",
      "+++ b/Users/x/repo/src/melee/ft/ftcoll.c",
      "@@ -1,2 +1,3 @@",
      " int a;",
      "+extern const f32 lbl_804DA60C;",
      " int b;",
      "",
    ].join("\n");
    const rewritten = rewriteNoIndexDiffPaths(diff, "src/melee/ft/ftcoll.c");
    const lines = rewritten.split("\n");
    expect(lines[0]).toBe("diff --git a/src/melee/ft/ftcoll.c b/src/melee/ft/ftcoll.c");
    expect(lines[1]).toBe("--- a/src/melee/ft/ftcoll.c");
    expect(lines[2]).toBe("+++ b/src/melee/ft/ftcoll.c");
    expect(lines[3]).toBe("@@ -1,2 +1,3 @@");
    expect(rewritten).toContain("+extern const f32 lbl_804DA60C;");
    expect(rewritten).not.toContain("Users/x");
  });

  test("returns empty string when the diff has no hunks (identical or binary)", () => {
    expect(rewriteNoIndexDiffPaths("", "src/melee/ft/ftcoll.c")).toBe("");
    expect(rewriteNoIndexDiffPaths("Binary files a/x and b/x differ\n", "src/melee/ft/ftcoll.c")).toBe("");
  });
});

describe("compareWorkerUnitSnapshots", () => {
  test("accepts an exact target that was already exact in the pre-worker snapshot", () => {
    const validation = compareWorkerUnitSnapshots({
      before: scoreSnapshot(100),
      after: scoreSnapshot(100),
      claimedExact: true,
    });

    expect(validation.status).toBe("passed");
    expect(validation.reasons).toEqual([]);
    expect(validation.target).toMatchObject({ before: 100, after: 100, improved: false, exact: true });
  });

  test("accepts an improving section target without marking it exact", () => {
    const validation = compareWorkerUnitSnapshots({
      before: sectionScoreSnapshot({ sectionScore: 89 }),
      after: sectionScoreSnapshot({ sectionScore: 95 }),
      claimedExact: false,
    });

    expect(validation.status).toBe("passed");
    expect(validation.target).toMatchObject({ before: 89, after: 95, improved: true, exact: false });
  });

  test("marks a section target exact at this file's exact-score threshold", () => {
    const validation = compareWorkerUnitSnapshots({
      before: sectionScoreSnapshot({ sectionScore: 95 }),
      after: sectionScoreSnapshot({ sectionScore: 99.99999 }),
      claimedExact: true,
    });

    expect(validation.status).toBe("passed");
    expect(validation.target).toMatchObject({ improved: true, exact: true });
  });

  test("allows a non-exact same-unit function to dip for a section target", () => {
    const validation = compareWorkerUnitSnapshots({
      before: sectionScoreSnapshot({ sectionScore: 89, functions: [{ name: "fuzzy", score: 97 }] }),
      after: sectionScoreSnapshot({ sectionScore: 95, functions: [{ name: "fuzzy", score: 96.5 }] }),
      claimedExact: false,
    });

    expect(validation.status).toBe("passed");
    expect(validation.regressions).toEqual([]);
  });

  test("protects an exact same-unit function for a section target", () => {
    const validation = compareWorkerUnitSnapshots({
      before: sectionScoreSnapshot({ sectionScore: 89, functions: [{ name: "exact", score: 100 }] }),
      after: sectionScoreSnapshot({ sectionScore: 95, functions: [{ name: "exact", score: 99 }] }),
      claimedExact: false,
    });

    expect(validation.status).toBe("same_unit_regression");
    expect(validation.regressions).toContainEqual({ kind: "function", unit: "main/melee/test/data", item: "exact", before: 100, after: 99 });
  });

  test("still rejects a non-exact sibling function dip for a function target", () => {
    const before = scoreSnapshot(80);
    const after = scoreSnapshot(90);
    before.functions.push({ name: "sibling", score: 97 });
    after.functions.push({ name: "sibling", score: 96.5 });

    const validation = compareWorkerUnitSnapshots({ before, after, claimedExact: false });

    expect(validation.status).toBe("same_unit_regression");
  });

  test("keeps a missing function target at no official score change", () => {
    const before = { ...scoreSnapshot(80), symbol: "missing", targetScore: null };
    const after = { ...scoreSnapshot(90), symbol: "missing", targetScore: null };

    const validation = compareWorkerUnitSnapshots({ before, after, claimedExact: false });

    expect(validation.status).toBe("no_official_score_change");
  });

  test("ignores matched data percent regression only for section targets", () => {
    const validation = compareWorkerUnitSnapshots({
      before: sectionScoreSnapshot({ sectionScore: 89, metrics: [{ name: "matched_data_percent", score: 50 }] }),
      after: sectionScoreSnapshot({ sectionScore: 95, metrics: [{ name: "matched_data_percent", score: 25 }] }),
      claimedExact: false,
    });

    expect(validation.status).toBe("passed");
    expect(validation.regressions).toEqual([]);
  });
});

describe("qaLintFromInvocation", () => {
  test("exit 0 with no findings is clean", () => {
    const qaLint = qaLintFromInvocation(invocation(), "/tmp/scan.patch");
    expect(qaLint.status).toBe("clean");
    expect(qaLint.exitCode).toBe(0);
    expect(qaLint.findings).toEqual([]);
    expect(qaLint.scanPath).toBe("/tmp/scan.patch");
    expect(qaLint.toolError).toBeNull();
  });

  test("exit 2 with warning findings is warnings", () => {
    const warn = finding({ severity: "warning" });
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 2, result: scanResult([warn], "warned") }), "/tmp/scan.patch");
    expect(qaLint.status).toBe("warnings");
    expect(qaLint.findings).toHaveLength(1);
  });

  test("exit 1 is violations", () => {
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 1, result: scanResult([finding()], "failed") }), "/tmp/scan.patch");
    expect(qaLint.status).toBe("violations");
    expect(qaLint.exitCode).toBe(1);
  });

  test("severity-error findings force violations even with a non-1 exit code", () => {
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 2, result: scanResult([finding()], "warned") }), "/tmp/scan.patch");
    expect(qaLint.status).toBe("violations");
  });

  test("toolError is tool_unavailable regardless of exit code", () => {
    const qaLint = qaLintFromInvocation(
      invocation({ exitCode: -1, result: null, stdout: "", toolError: "scan_diff.py not found at /nope" }),
      null,
    );
    expect(qaLint.status).toBe("tool_unavailable");
    expect(qaLint.toolError).toContain("scan_diff.py not found");
    expect(qaLint.findings).toEqual([]);
  });
});

describe("applyQaLintToValidation", () => {
  test("violations demote a passed (score-improving) validation to failed", () => {
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 1, result: scanResult([finding()], "failed") }), "/tmp/scan.patch");
    const validation = applyQaLintToValidation(passedValidation(), qaLint);
    expect(validation.status).toBe("failed");
    expect(validation.qaLint?.status).toBe("violations");
    expect(validation.reasons.some((reason) => reason.includes("QA finding(s) requiring repair"))).toBe(true);
    // The score evidence stays truthful — only the verdict changes.
    expect(validation.target?.improved).toBe(true);
    expect(validation.improvements).toHaveLength(1);
  });

  test("violations keep a non-passed status but append the qa reason", () => {
    const base: WorkerRunnerValidation = { status: "no_official_score_change", reasons: ["target did not improve"] };
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 1, result: scanResult([finding()], "failed") }), "/tmp/scan.patch");
    const validation = applyQaLintToValidation(base, qaLint);
    expect(validation.status).toBe("no_official_score_change");
    expect(validation.reasons).toHaveLength(2);
  });

  test("clean leaves the verdict untouched", () => {
    const qaLint = qaLintFromInvocation(invocation(), "/tmp/scan.patch");
    const validation = applyQaLintToValidation(passedValidation(), qaLint);
    expect(validation.status).toBe("passed");
    expect(validation.qaLint).toEqual(qaLint);
  });

  test("warnings demote a passed validation to failed so the worker repairs them", () => {
    const warn = finding({ severity: "warning" });
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 2, result: scanResult([warn], "warned") }), "/tmp/scan.patch");
    const validation = applyQaLintToValidation(passedValidation(), qaLint);
    expect(validation.status).toBe("failed");
    expect(validation.qaLint?.status).toBe("warnings");
    expect(validation.reasons.some((reason) => reason.includes("QA finding(s) requiring repair"))).toBe(true);
  });

  test("tool_unavailable fails open: a passed attempt stays passed but records the failure", () => {
    const qaLint = qaLintFromInvocation(invocation({ exitCode: -1, result: null, toolError: "python3 crashed" }), null);
    const validation = applyQaLintToValidation(passedValidation(), qaLint);
    expect(validation.status).toBe("passed");
    expect(validation.qaLint?.status).toBe("tool_unavailable");
    expect(validation.qaLint?.toolError).toBe("python3 crashed");
  });

  test("null qaLint attaches null and changes nothing", () => {
    const validation = applyQaLintToValidation(passedValidation(), null);
    expect(validation.status).toBe("passed");
    expect(validation.qaLint).toBeNull();
  });
});

describe("qaLintRepairReasons", () => {
  test("formats one verbatim reason per finding plus the standing instruction", () => {
    const qaLint = qaLintFromInvocation(
      invocation({
        exitCode: 1,
        result: scanResult([finding(), finding({ rule_id: "unrolled_assert", file: "src/melee/gr/ground.c", line: 99, message: "open-coded assert", standard_id: "global_standard:assert-report-macros", excerpt: "__assert(...)" })], "failed"),
      }),
      "/tmp/scan.patch",
    );
    const reasons = qaLintRepairReasons(qaLint);
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toBe(
      "qa_lint_finding: error extern_in_c at src/melee/ft/ftcoll.c:42 — extern-for-literal anchor referencing TU-owned data [standard: global_standard:literals-and-data-ownership] excerpt: extern const f32 lbl_804DA60C;",
    );
    expect(reasons[1]).toBe(
      "qa_lint_finding: error unrolled_assert at src/melee/gr/ground.c:99 — open-coded assert [standard: global_standard:assert-report-macros] excerpt: __assert(...)",
    );
    expect(reasons[2]).toBe(QA_LINT_REPAIR_INSTRUCTION);
    // The standing instruction must not recommend cross-file idioms the worker
    // cannot ship: edits outside the one-file write set are dropped at patch
    // capture, so the compliant path for e.g. an owning-header declaration is a
    // blocker note, not a source-local shim.
    expect(QA_LINT_REPAIR_INSTRUCTION).not.toContain("owning-header declarations,");
    expect(QA_LINT_REPAIR_INSTRUCTION).toContain("inside your claimed write set");
    expect(QA_LINT_REPAIR_INSTRUCTION).toContain("dropped at patch capture");
    expect(QA_LINT_REPAIR_INSTRUCTION).toContain('state "exact requires cross-file edit to <path>" in your note\'s blockers');
  });

  test("formats warning findings as repair reasons", () => {
    const warn = finding({ severity: "warning", rule_id: "type_erasing_cast", message: "Added type-erasing cast.", excerpt: "(u8*) obj" });
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 2, result: scanResult([warn], "warned") }), "/tmp/scan.patch");
    const reasons = qaLintRepairReasons(qaLint);
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toBe(
      "qa_lint_finding: warning type_erasing_cast at src/melee/ft/ftcoll.c:42 — Added type-erasing cast. [standard: global_standard:literals-and-data-ownership] excerpt: (u8*) obj",
    );
    expect(reasons[1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
  });

  test("includes structured repair hints and suggested data-ordering tools", () => {
    const lintFinding = finding({
      rule_id: "numeric_literal_to_symbol",
      message: "Numeric literal replaced by address-style data symbol `ftCo_804D8840`.",
      excerpt: "return ftCo_804D8840;",
      detail: {
        repair_hint: "Restore the numeric literal in ordinary logic.",
        data_ordering_repair: {
          kind: "sdata2_order_helper",
          when: "after restoring inline numeric literals",
          tool: "review_lint_sdata2_order_helper",
          command: "python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/sdata2_order_helper.py --repo-root <melee-root> --source src/melee/ft/ftcoll.c --apply --validate --json",
        },
      },
    });
    const qaLint = qaLintFromInvocation(invocation({ exitCode: 1, result: scanResult([lintFinding], "failed") }), "/tmp/scan.patch");
    const reasons = qaLintRepairReasons(qaLint);

    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toContain("repair_hint: Restore the numeric literal in ordinary logic.");
    expect(reasons[0]).toContain("tool=review_lint_sdata2_order_helper");
    expect(reasons[0]).toContain("--apply --validate --json");
    expect(reasons[1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
  });

  test("violations without parseable findings still produce a reason plus the instruction", () => {
    const qaLint: WorkerQaLint = { status: "violations", exitCode: 1, findings: [], scanPath: "/tmp/scan.patch", toolError: null };
    const reasons = qaLintRepairReasons(qaLint);
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toContain("qa_lint_finding: scan_diff gate failed (exit 1)");
    expect(reasons[1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
  });

  test("non-finding statuses produce no repair reasons", () => {
    for (const status of ["clean", "tool_unavailable", "skipped"] as const) {
      expect(qaLintRepairReasons({ status, exitCode: 0, findings: [], scanPath: null, toolError: null })).toEqual([]);
    }
    expect(qaLintRepairReasons(null)).toEqual([]);
  });
});

describe("captureWorkerChangeBaseline source snapshot", () => {
  test("captures and caps function-level first-diff rows from objdiff JSON", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "first-diff-baseline-"));
    const symbol = "ftCo_800C8E5C";
    const instructionRows = (side: "left" | "right") => Array.from({ length: 21 }, (_, index) => ({
      diff_kind: side === "right" && index === 20 ? "DIFF_INSERT" : "DIFF_ARG_MISMATCH",
      instruction: {
        address: 8272 + index * 4,
        formatted: index === 0 ? "lfs f3, lbl_804DA824@sda21" : `mr r${index}, r3`,
      },
    }));
    const firstDiffReport = JSON.stringify({
      left: { symbols: [{ name: symbol, match_percent: 91.25, instructions: instructionRows("left") }] },
      right: { symbols: [{ name: symbol, match_percent: 91.25, instructions: instructionRows("right") }] },
    });
    const unitReport = JSON.stringify({
      left: { sections: [], symbols: [{ name: symbol, match_percent: 91.25, size: 84, instructions: [] }] },
    });
    const calls: string[][] = [];
    const workspaceExec = fakeWorkspaceExec(async (command) => {
      calls.push(command);
      if (command[0] === "cat") {
        return {
          exitCode: 0,
          stdout: command[1] === "build.ninja"
            ? "objdiff_report_args = --config functionRelocDiffs=data_value\n"
            : "int source;\n",
          stderr: "",
        };
      }
      if (command[0] === "build/tools/objdiff-cli") {
        return { exitCode: 0, stdout: command.includes(symbol) ? firstDiffReport : unitReport, stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const baseline = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/first-diff",
      outputDir,
      target: { unit: "melee/ft/ftcoll.c", symbol, source_path: "src/melee/ft/ftcoll.c" },
      workspaceExec,
    });

    expect(baseline.status).toBe("available");
    expect(baseline.firstDiff).toEqual({
      status: "available",
      score: 91.25,
      rows: expect.any(Array),
      row_counts_by_kind: { DIFF_ARG_MISMATCH: 41, DIFF_INSERT: 1 },
      truncated: true,
    });
    expect(baseline.firstDiff?.rows).toHaveLength(40);
    expect(baseline.firstDiff?.rows[0]).toEqual({
      side: "left",
      address: "8272",
      kind: "DIFF_ARG_MISMATCH",
      text: "lfs f3, lbl_804DA824@sda21",
    });
    expect(calls.find((command) => command[0] === "build/tools/objdiff-cli" && command.includes(symbol))).toEqual([
      "build/tools/objdiff-cli",
      "diff",
      "-p",
      ".",
      "-u",
      "melee/ft/ftcoll.c",
      "--config",
      "functionRelocDiffs=data_value",
      symbol,
      "--format",
      "json-pretty",
      "-o",
      "/dev/stdout",
    ]);
    expect(JSON.parse(await readFile(resolve(outputDir, "pre_worker_first_diff.json"), "utf8"))).toEqual(baseline.firstDiff);
  });

  test("keeps the baseline available when the function-level first diff is unavailable", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "unavailable-first-diff-"));
    const symbol = "ftCo_800C8E5C";
    const unitReport = JSON.stringify({
      left: { sections: [], symbols: [{ name: symbol, match_percent: 75, size: 16, instructions: [] }] },
    });
    const workspaceExec = fakeWorkspaceExec(async (command) => {
      if (command[0] === "cat") {
        return { exitCode: 0, stdout: command[1] === "build.ninja" ? "" : "int source;\n", stderr: "" };
      }
      if (command[0] === "build/tools/objdiff-cli") {
        return command.includes(symbol)
          ? { exitCode: 2, stdout: "", stderr: "target symbol unavailable" }
          : { exitCode: 0, stdout: unitReport, stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const baseline = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/unavailable-first-diff",
      outputDir,
      target: { unit: "melee/ft/ftcoll.c", symbol, source_path: "src/melee/ft/ftcoll.c" },
      workspaceExec,
    });

    expect(baseline.status).toBe("available");
    expect(baseline.firstDiff).toEqual({
      status: "unavailable",
      reason: "pre-worker first diff exited 2: target symbol unavailable",
      score: null,
      rows: [],
      row_counts_by_kind: {},
      truncated: false,
    });
    expect(JSON.parse(await readFile(resolve(outputDir, "pre_worker_first_diff.json"), "utf8"))).toEqual(baseline.firstDiff);
  });

  test("marks dry-run and build-failed first diffs unavailable without invoking objdiff", async () => {
    const dryRunOutputDir = await mkdtemp(join(tmpdir(), "dry-run-first-diff-"));
    const dryRun = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/dry-run-first-diff",
      outputDir: dryRunOutputDir,
      target: { unit: "melee/test/test.c", symbol: "test_fn", source_path: "src/melee/test/test.c" },
      dryRun: true,
      workspaceExec: fakeWorkspaceExec(async () => { throw new Error("dry run executed a command"); }),
    });
    expect(dryRun.firstDiff?.status).toBe("unavailable");
    expect(dryRun.firstDiff?.reason).toContain("dry-run agents");

    const buildFailedOutputDir = await mkdtemp(join(tmpdir(), "build-failed-first-diff-"));
    const commands: string[][] = [];
    const buildFailed = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/build-failed-first-diff",
      outputDir: buildFailedOutputDir,
      target: { unit: "melee/test/test.c", symbol: "test_fn", source_path: "src/melee/test/test.c" },
      workspaceExec: fakeWorkspaceExec(async (command) => {
        commands.push(command);
        if (command[0] === "cat") return { exitCode: 0, stdout: "int source;\n", stderr: "" };
        return { exitCode: 1, stdout: "", stderr: "compile failed" };
      }),
    });
    expect(buildFailed.status).toBe("build_failed");
    expect(buildFailed.firstDiff?.status).toBe("unavailable");
    expect(buildFailed.firstDiff?.reason).toBe("pre-worker object build exited 1");
    expect(commands.some((command) => command[0] === "build/tools/objdiff-cli")).toBe(false);
  });

  test.each([
    [undefined, "build/GALE01/src/MarioUtil/DrawUtil.o"],
    [{ reportPath: "build/GMSJ01/report.json" }, "build/GMSJ01/src/MarioUtil/DrawUtil.o"],
  ] as const)("builds the object target from the game report layout", async (validation, expectedTarget) => {
    const outputDir = await mkdtemp(join(tmpdir(), "game-layout-baseline-"));
    const commands: string[][] = [];
    const baseline = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/game",
      outputDir,
      target: { unit: "MarioUtil/DrawUtil.cpp", symbol: "DrawUtil", source_path: "src/MarioUtil/DrawUtil.cpp" },
      validation,
      workspaceExec: fakeWorkspaceExec(async (command) => {
        commands.push(command);
        if (command[0] === "cat") return { exitCode: 0, stdout: "int source;\n", stderr: "" };
        return { exitCode: 1, stdout: "", stderr: "stop after recording the build target" };
      }),
    });

    expect(baseline.status).toBe("build_failed");
    expect(commands.find((command) => command[0] === "ninja")).toEqual(["ninja", expectedTarget]);
  });

  test("routes sandbox build and objdiff through WorkspaceExec without worker ninja slots", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "sandbox-change-baseline-"));
    const calls: Array<{ command: string[]; options?: WorkspaceExecOptions }> = [];
    const report = JSON.stringify({
      left: {
        sections: [],
        symbols: [{ name: "ftCo_800C8E5C", match_percent: 75, size: 16, instructions: [] }],
      },
    });
    const workspaceExec = fakeWorkspaceExec(
      async (command, options) => {
        calls.push({ command, options });
        if (command[0] === "cat") {
          if (command[1] === "src/melee/ft/ftcoll.c") {
            return { exitCode: 0, stdout: "int sandbox_source;\n", stderr: "" };
          }
          if (command[1] === "src/melee/gr/ground.c") {
            return { exitCode: 0, stdout: "int sandbox_extra;\n", stderr: "" };
          }
          if (command[1] === "src/missing.c") {
            return { exitCode: 1, stdout: "", stderr: "missing" };
          }
          return { exitCode: 0, stdout: "objdiff_report_args = --config functionRelocDiffs=data_value\n", stderr: "" };
        }
        if (command[0] === "build/tools/objdiff-cli") {
          return { exitCode: 0, stdout: report, stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    );

    const baseline = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/melee",
      outputDir,
      target: {
        unit: "melee/ft/ftcoll.c",
        symbol: "ftCo_800C8E5C",
        source_path: "src/melee/ft/ftcoll.c",
      },
      extraPaths: ["src/melee/gr/ground.c", "src/missing.c", "../escape.c"],
      workspaceExec,
    });

    expect(baseline.status).toBe("available");
    expect(baseline.snapshot?.targetScore).toBe(75);
    expect(calls[0]?.command).toEqual(["cat", "src/melee/ft/ftcoll.c"]);
    expect(baseline.sourceSnapshotPaths?.sort()).toEqual(["src/melee/ft/ftcoll.c", "src/melee/gr/ground.c"]);
    expect(calls[3]).toEqual({
      command: ["ninja", "build/GALE01/src/melee/ft/ftcoll.o"],
      options: undefined,
    });
    expect(calls[4]?.command).toEqual(["cat", "build.ninja"]);
    expect(calls[5]?.command).toContain("/dev/stdout");
    expect(calls[5]?.options).toBeUndefined();
    expect(await readFile(resolve(outputDir, "pre_worker_source/src/melee/ft/ftcoll.c"), "utf8")).toBe("int sandbox_source;\n");
    expect(await readFile(resolve(outputDir, "pre_worker_source/src/melee/gr/ground.c"), "utf8")).toBe("int sandbox_extra;\n");
    expect(await readFile(resolve(outputDir, "pre_worker_unit_diff.json"), "utf8")).toBe(report);
  });

  test("resolves a section target score from objdiff section rows", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "section-change-baseline-"));
    const report = JSON.stringify({
      left: {
        sections: [{ name: ".sdata2", match_percent: 89, size: 32 }],
        symbols: [{ name: "fuzzy", match_percent: 97, size: 16, instructions: [] }],
      },
    });
    const workspaceExec = fakeWorkspaceExec(async (command) => {
      if (command[0] === "cat") {
        return { exitCode: 0, stdout: command[1] === "build.ninja" ? "" : "int data;\n", stderr: "" };
      }
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const baseline = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/section-target",
      outputDir,
      target: { unit: "melee/test/data.c", symbol: ".sdata2", source_path: "src/melee/test/data.c" },
      workspaceExec,
    });

    expect(baseline.status).toBe("available");
    expect(baseline.snapshot?.targetScore).toBe(89);
  });

  test("prefers section match percent over fuzzy match percent", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "section-score-measure-"));
    const report = JSON.stringify({
      left: {
        sections: [{ name: ".bss", match_percent: 100, fuzzy_match_percent: 0, size: 32 }],
        symbols: [],
      },
    });
    const workspaceExec = fakeWorkspaceExec(async (command) => {
      if (command[0] === "cat") {
        return { exitCode: 0, stdout: command[1] === "build.ninja" ? "" : "int data;\n", stderr: "" };
      }
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const baseline = await captureWorkerChangeBaseline({
      repoRoot: "/workspace/section-target",
      outputDir,
      target: { unit: "main/melee/gm/gmclassic", symbol: ".bss", source_path: "src/melee/gm/gmclassic.c" },
      workspaceExec,
    });

    expect(baseline.status).toBe("available");
    expect(baseline.snapshot?.targetScore).toBe(100);
  });

  test("captures undefined symbols only when requested", async () => {
    const report = JSON.stringify({
      left: {
        sections: [],
        symbols: [{ name: "ftCo_800C8E5C", match_percent: 75, size: 16, instructions: [] }],
      },
    });

    for (const captureUndefinedSymbols of [true, false]) {
      const outputDir = await mkdtemp(join(tmpdir(), `undefined-baseline-${captureUndefinedSymbols}-`));
      const calls: string[][] = [];
      const workspaceExec = fakeWorkspaceExec(async (command) => {
        calls.push(command);
        if (command[0] === "cat") {
          return { exitCode: 0, stdout: command[1] === "build.ninja" ? "" : "int source;\n", stderr: "" };
        }
        if (command[0] === "python3") {
          return { exitCode: 0, stdout: "lbl_missing\nHSD_Randi\n", stderr: "" };
        }
        if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
        return { exitCode: 0, stdout: "", stderr: "" };
      });

      const baseline = await captureWorkerChangeBaseline({
        repoRoot: `/workspace/undefined-${captureUndefinedSymbols}`,
        outputDir,
        target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
        captureUndefinedSymbols,
        workspaceExec,
      });

      expect(baseline.status).toBe("available");
      expect(baseline.undefinedSymbols ?? null).toEqual(captureUndefinedSymbols ? ["HSD_Randi", "lbl_missing"] : null);
      expect(calls.some((command) => command[0] === "python3")).toBe(captureUndefinedSymbols);
    }
  });
});

describe("extendWorkerChangeBaselineSourceSnapshot", () => {
  test("a baseline without a snapshot dir (dry run) is a no-op", async () => {
    const baseline: WorkerChangeBaseline = { status: "snapshot_unavailable", reasons: [], snapshot: null, firstDiff: null };
    expect(await extendWorkerChangeBaselineSourceSnapshot({
      repoRoot: "/workspace/melee",
      baseline,
      extraPaths: ["src/a.h"],
      workspaceExec: fakeWorkspaceExec(),
    })).toEqual([]);
    expect(baseline.sourceSnapshotPaths).toBeUndefined();
  });

  test("reads pre-worker HEAD content through the sandbox command seam", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "qa-l1-extend-sandbox-"));
    const sourceSnapshotDir = join(outputDir, "pre_worker_source");
    await mkdir(sourceSnapshotDir, { recursive: true });
    const baseline: WorkerChangeBaseline = {
      status: "snapshot_unavailable",
      reasons: [],
      snapshot: null,
      firstDiff: null,
      sourceSnapshotDir,
      sourceSnapshotPaths: [],
    };
    const calls: string[][] = [];
    const workspaceExec = fakeWorkspaceExec(
      async (command) => {
        calls.push(command);
        return { exitCode: 0, stdout: "void SandboxHeader(void);\n", stderr: "" };
      },
    );

    expect(await extendWorkerChangeBaselineSourceSnapshot({
      repoRoot: "/workspace/melee",
      baseline,
      extraPaths: ["include/melee/sandbox.h"],
      workspaceExec,
    })).toEqual(["include/melee/sandbox.h"]);
    expect(calls).toEqual([["git", "show", "HEAD:include/melee/sandbox.h"]]);
    expect(await readFile(resolve(sourceSnapshotDir, "include/melee/sandbox.h"), "utf8")).toBe("void SandboxHeader(void);\n");
  });

  test("the extended snapshot feeds the QA lint diff with the out-of-write-set edit", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "qa-l1-extend-sandbox-diff-"));
    const sourceSnapshotDir = join(outputDir, "pre_worker_source");
    await mkdir(join(sourceSnapshotDir, "src/melee/ft"), { recursive: true });
    await writeFile(join(sourceSnapshotDir, "src/melee/ft/ftcoll.c"), "int unchanged;\n");
    const baseline: WorkerChangeBaseline = {
      status: "snapshot_unavailable",
      reasons: [],
      snapshot: null,
      firstDiff: null,
      sourceSnapshotDir,
      sourceSnapshotPaths: ["src/melee/ft/ftcoll.c"],
    };
    const workspaceExec = fakeWorkspaceExec(async (command) => {
      if (command.join(" ") === "git show HEAD:src/melee/ft/ftcoll.h") {
        return { exitCode: 0, stdout: "void ftCo_800C8E5C(void);\n", stderr: "" };
      }
      if (command.join(" ") === "cat src/melee/ft/ftcoll.h") {
        return { exitCode: 0, stdout: "void ftCo_800C8E5C(void);\nvoid ftCo_NewProto(void);\n", stderr: "" };
      }
      if (command.join(" ") === "cat src/melee/ft/ftcoll.c") {
        return { exitCode: 0, stdout: "int unchanged;\n", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unexpected command" };
    });
    await extendWorkerChangeBaselineSourceSnapshot({
      repoRoot: "/workspace/melee",
      baseline,
      extraPaths: ["src/melee/ft/ftcoll.h"],
      workspaceExec,
    });
    const seenOptions: RunQaScanDiffOptions[] = [];
    const validation = await validateWorkerChange({
      repoRoot: "/workspace/melee",
      hostRepoRoot: "/host/checkout/melee",
      outputDir,
      attemptIndex: 0,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      workspaceExec,
      qaScanRunner: async (options: RunQaScanDiffOptions): Promise<QaScanInvocation> => {
        seenOptions.push(options);
        return invocation();
      },
    });
    expect(seenOptions).toHaveLength(1);
    const patch = await readFile(seenOptions[0].diffFile ?? "", "utf8");
    expect(patch).toContain("diff --git a/src/melee/ft/ftcoll.h b/src/melee/ft/ftcoll.h");
    expect(patch).toContain("+void ftCo_NewProto(void);");
    expect(validation.qaLint?.status).toBe("clean");
  });
});

describe("validateWorkerChange QA lint integration", () => {
  const hostRepoRoot = "/host/checkout/melee";

  async function setupAttempt(currentSource = "int a;\nextern const f32 lbl_804DA60C;\nint b;\n"): Promise<{
    repoRoot: string;
    outputDir: string;
    baseline: WorkerChangeBaseline;
    workspaceExec: WorkspaceExec;
  }> {
    const repoRoot = "/workspace/melee";
    const outputDir = await mkdtemp(join(tmpdir(), "qa-l1-validate-sandbox-"));
    const sourceSnapshotDir = join(outputDir, "pre_worker_source");
    await mkdir(join(sourceSnapshotDir, "src/melee/ft"), { recursive: true });
    await writeFile(join(sourceSnapshotDir, "src/melee/ft/ftcoll.c"), "int a;\nint b;\n");
    const baseline: WorkerChangeBaseline = {
      status: "snapshot_unavailable",
      reasons: ["pre-worker unit diff exited 1"],
      snapshot: null,
      firstDiff: null,
      objectTarget: "build/GALE01/src/melee/ft/ftcoll.o",
      sourceSnapshotDir,
      sourceSnapshotPaths: ["src/melee/ft/ftcoll.c"],
    };
    const workspaceExec = fakeWorkspaceExec(async (command) => command.join(" ") === "cat src/melee/ft/ftcoll.c"
      ? { exitCode: 0, stdout: currentSource, stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "unexpected command" });
    return { repoRoot, outputDir, baseline, workspaceExec };
  }

  test("uses the host checkout for QA lint policy while scanning the sandbox diff", async () => {
    const { repoRoot, outputDir, baseline, workspaceExec } = await setupAttempt();
    const seenOptions: RunQaScanDiffOptions[] = [];
    const fakeRunner = async (options: RunQaScanDiffOptions): Promise<QaScanInvocation> => {
      seenOptions.push(options);
      return invocation({ exitCode: 1, result: scanResult([finding()], "failed") });
    };

    const validation = await validateWorkerChange({
      repoRoot,
      hostRepoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      workspaceExec,
      qaScanRunner: fakeRunner,
    });

    expect(validation.qaLint?.status).toBe("violations");
    expect(validation.status).not.toBe("passed");
    expect(validation.reasons.some((reason) => reason.includes("QA finding(s) requiring repair"))).toBe(true);

    expect(seenOptions).toHaveLength(1);
    expect(seenOptions[0].repoRoot).toBe(hostRepoRoot);
    expect(seenOptions[0].repoRoot).not.toBe(repoRoot);
    expect(seenOptions[0].orchestratorRoot).toBe("/tmp/orchestrator");
    expect(seenOptions[0].surface).toBe("worker");
    const scanPath = seenOptions[0].diffFile ?? "";
    expect(scanPath).toBe(resolve(outputDir, "attempt-0.qa_diff.patch"));
    expect(validation.qaLint?.scanPath).toBe(scanPath);

    const patch = await readFile(scanPath, "utf8");
    expect(patch).toContain("diff --git a/src/melee/ft/ftcoll.c b/src/melee/ft/ftcoll.c");
    expect(patch).toContain("--- a/src/melee/ft/ftcoll.c");
    expect(patch).toContain("+++ b/src/melee/ft/ftcoll.c");
    expect(patch).toContain("+extern const f32 lbl_804DA60C;");
    expect(patch).not.toContain(repoRoot);

    const summary = JSON.parse(await readFile(resolve(outputDir, "attempt-0.runner_validation.summary.json"), "utf8")) as Record<string, unknown>;
    expect((summary.qaLint as Record<string, unknown>).status).toBe("violations");
  });

  test("fetches the sandbox current source before building the host QA diff", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "qa-l1-sandbox-current-"));
    const sourceSnapshotDir = join(outputDir, "pre_worker_source");
    await mkdir(join(sourceSnapshotDir, "src/melee/ft"), { recursive: true });
    await writeFile(join(sourceSnapshotDir, "src/melee/ft/ftcoll.c"), "int before;\n");
    const baseline: WorkerChangeBaseline = {
      status: "snapshot_unavailable",
      reasons: ["pre-worker unit diff exited 1"],
      snapshot: null,
      firstDiff: null,
      sourceSnapshotDir,
      sourceSnapshotPaths: ["src/melee/ft/ftcoll.c"],
    };
    const commands: string[][] = [];
    const workspaceExec = fakeWorkspaceExec(
      async (command) => {
        commands.push(command);
        return { exitCode: 0, stdout: "int before;\nextern int sandbox_edit;\n", stderr: "" };
      },
    );
    const seenOptions: RunQaScanDiffOptions[] = [];

    const validation = await validateWorkerChange({
      repoRoot: "/workspace/melee",
      hostRepoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      workspaceExec,
      qaScanRunner: async (options) => {
        seenOptions.push(options);
        return invocation();
      },
    });

    expect(commands).toEqual([["cat", "src/melee/ft/ftcoll.c"]]);
    expect(await readFile(resolve(outputDir, "attempt-0.qa_current/src/melee/ft/ftcoll.c"), "utf8")).toContain("sandbox_edit");
    expect(await readFile(seenOptions[0]?.diffFile ?? "", "utf8")).toContain("+extern int sandbox_edit;");
    expect(validation.qaLint?.status).toBe("clean");
  });

  test("an unchanged source file skips the scanner and reports clean", async () => {
    const { repoRoot, outputDir, baseline, workspaceExec } = await setupAttempt("int a;\nint b;\n");
    let calls = 0;
    const validation = await validateWorkerChange({
      repoRoot,
      hostRepoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      workspaceExec,
      qaScanRunner: async () => {
        calls += 1;
        return invocation();
      },
    });
    expect(calls).toBe(0);
    expect(validation.qaLint?.status).toBe("clean");
    expect(validation.qaLint?.scanPath).toBeNull();
  });

  test("a scanner tool failure records tool_unavailable without inventing violations", async () => {
    const { repoRoot, outputDir, baseline, workspaceExec } = await setupAttempt();
    const validation = await validateWorkerChange({
      repoRoot,
      hostRepoRoot,
      outputDir,
      attemptIndex: 1,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      workspaceExec,
      qaScanRunner: async () => invocation({ exitCode: -1, result: null, stdout: "", toolError: "scan_diff.py not found" }),
    });
    expect(validation.qaLint?.status).toBe("tool_unavailable");
    expect(validation.qaLint?.toolError).toContain("scan_diff.py not found");
    expect(qaLintRepairReasons(validation.qaLint)).toEqual([]);
  });

  test("dry-run and gate-skipped attempts never invoke the scanner", async () => {
    const { repoRoot, outputDir, baseline, workspaceExec } = await setupAttempt();
    let calls = 0;
    const runner = async (): Promise<QaScanInvocation> => {
      calls += 1;
      return invocation();
    };
    const target = { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" };
    const dryRun = await validateWorkerChange({
      repoRoot,
      hostRepoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target,
      dryRun: true,
      shouldRun: true,
      claimedExact: false,
      workspaceExec,
      qaScanRunner: runner,
    });
    const gateSkipped = await validateWorkerChange({
      repoRoot,
      hostRepoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target,
      dryRun: false,
      shouldRun: false,
      claimedExact: false,
      workspaceExec,
      qaScanRunner: runner,
    });
    expect(calls).toBe(0);
    expect(dryRun.status).toBe("skipped");
    expect(dryRun.qaLint).toBeNull();
    expect(gateSkipped.status).toBe("skipped");
    expect(gateSkipped.qaLint).toBeNull();
    expect(existsSync(resolve(outputDir, "attempt-0.qa_diff.patch"))).toBe(false);
  });
});

describe("validateWorkerChange micro-gate integration", () => {
  const target = { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" };

  function baselineWithDataSection(): WorkerChangeBaseline {
    return {
      status: "available",
      reasons: [],
      objectTarget: "build/GALE01/src/melee/ft/ftcoll.o",
      firstDiff: null,
      snapshot: {
        schemaVersion: 1,
        capturedAt: "2026-06-30T00:00:00.000Z",
        unit: target.unit,
        symbol: target.symbol,
        sourcePath: target.source_path,
        objectTarget: "build/GALE01/src/melee/ft/ftcoll.o",
        metrics: [],
        functions: [{ name: target.symbol, score: 50, size: 16 }],
        sections: [{ name: ".data", score: 100, size: 53200 }],
        targetScore: 50,
      },
    };
  }

  function scoreWorkspaceExec(dataScore = 100): WorkspaceExec {
    const report = JSON.stringify({
      left: {
        sections: [{ name: ".data", match_percent: dataScore, size: 53200 }],
        symbols: [{ name: target.symbol, match_percent: 75, size: 16, instructions: [] }],
      },
    });
    return fakeWorkspaceExec(async (command) => {
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      if (command[0] === "cat") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });
  }

  test("fails an improving attempt when an exact non-code section regresses and persists micro-gates", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "micro-section-validation-"));
    const validation = await validateWorkerChange({
      repoRoot: "/workspace/micro-section",
      hostRepoRoot: "/host/melee",
      outputDir,
      attemptIndex: 0,
      baseline: baselineWithDataSection(),
      target,
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      microGateFlags: { sectionParity: true, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false },
      workspaceExec: scoreWorkspaceExec(99.77),
    });

    expect(validation.status).not.toBe("passed");
    expect(validation.status).toBe("same_unit_regression");
    expect(validation.microGates?.status).toBe("failed");
    expect(validation.reasons.some((reason) => reason.includes("micro_gate:section_parity"))).toBe(true);
    const summary = JSON.parse(await readFile(validation.summaryPath ?? "", "utf8")) as Record<string, unknown>;
    expect((summary.microGates as Record<string, unknown>).status).toBe("failed");
  });

  test("all-disabled micro-gates are skipped without changing a passing score outcome", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "micro-disabled-validation-"));
    const validation = await validateWorkerChange({
      repoRoot: "/workspace/micro-disabled",
      hostRepoRoot: "/host/melee",
      outputDir,
      attemptIndex: 0,
      baseline: baselineWithDataSection(),
      target,
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      microGateFlags: { sectionParity: false, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false },
      workspaceExec: scoreWorkspaceExec(100),
    });

    expect(validation.status).toBe("passed");
    expect(validation.microGates?.status).toBe("skipped");
  });

  test("uses the game layout for post-attempt object and symbol checks", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "micro-game-layout-validation-"));
    const commands: string[][] = [];
    const report = JSON.stringify({
      left: {
        sections: [{ name: ".data", match_percent: 100, size: 53200 }],
        symbols: [{ name: target.symbol, match_percent: 75, size: 16, instructions: [] }],
      },
    });
    const baseline = { ...baselineWithDataSection(), objectTarget: undefined };
    const validation = await validateWorkerChange({
      repoRoot: "/workspace/micro-game-layout",
      hostRepoRoot: "/host/sms",
      outputDir,
      attemptIndex: 0,
      baseline,
      target,
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      validation: { reportPath: "build/GMSJ01/report.json" },
      microGateFlags: { sectionParity: false, undefinedSymbols: true, bannedIdioms: false, formatting: false, symbolValidation: false },
      workspaceExec: fakeWorkspaceExec(async (command) => {
        commands.push(command);
        if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
        if (command[0] === "python3") return { exitCode: 0, stdout: "KnownSymbol\n", stderr: "" };
        if (command[0] === "cat" && command[1] === "config/GMSJ01/symbols.txt") {
          return { exitCode: 0, stdout: "KnownSymbol = .text:0x80000000;", stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    });

    expect(validation.status).toBe("passed");
    expect(commands).toContainEqual(["ninja", "build/GMSJ01/src/melee/ft/ftcoll.o"]);
    expect(commands).toContainEqual(["cat", "config/GMSJ01/symbols.txt"]);
  });

  test("an added bare short fails the banned-idiom micro-gate", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "micro-idiom-validation-"));
    const validation = await validateWorkerChange({
      repoRoot: "/workspace/micro-idiom",
      hostRepoRoot: "/host/melee",
      outputDir,
      attemptIndex: 0,
      baseline: baselineWithDataSection(),
      target,
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      microGateFlags: { sectionParity: false, undefinedSymbols: false, bannedIdioms: true, formatting: false, symbolValidation: false },
      postAttemptDiffText: [
        "diff --git a/src/melee/mn/mninfo.c b/src/melee/mn/mninfo.c",
        "+    short foo;",
      ].join("\n"),
      workspaceExec: scoreWorkspaceExec(100),
    });

    expect(validation.status).toBe("failed");
    expect(validation.reasons.some((reason) => reason.includes("micro_gate:banned_idioms"))).toBe(true);
  });

  test("routes a shared-global qualifier change through the banned-idiom micro-gate", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "micro-shared-global-validation-"));
    const snapshotDir = await mkdtemp(join(tmpdir(), "micro-shared-global-snapshot-"));
    const sourcePath = target.source_path;
    await mkdir(resolve(snapshotDir, sourcePath, ".."), { recursive: true });
    await writeFile(resolve(snapshotDir, sourcePath), `char shared[1] = "";\nvoid ${target.symbol}(void) { (void) shared[0]; }\nvoid reader(void) { (void) shared[0]; }\n`);
    const afterSource = `volatile char shared[1] = "";\nvoid ${target.symbol}(void) { (void) shared[0]; }\nvoid reader(void) { (void) shared[0]; }\n`;
    const baseline = {
      ...baselineWithDataSection(),
      sourceSnapshotDir: snapshotDir,
      sourceSnapshotPaths: [sourcePath],
    };
    const baseExec = scoreWorkspaceExec(100);
    const commands: string[][] = [];
    const workspaceExec = fakeWorkspaceExec(async (command, options) => {
      commands.push(command);
      if (command[0] === "cat" && command[1] === sourcePath) return { exitCode: 0, stdout: afterSource, stderr: "" };
      return baseExec.exec(command, options);
    });
    const validation = await validateWorkerChange({
      repoRoot: "/workspace/micro-shared-global",
      hostRepoRoot: "/host/melee",
      outputDir,
      attemptIndex: 0,
      baseline,
      target,
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      validation: { reportPath: "build/GMSJ01/report.json" },
      microGateFlags: { sectionParity: false, undefinedSymbols: false, bannedIdioms: true, formatting: false, symbolValidation: false },
      postAttemptDiffText: `diff --git a/${sourcePath} b/${sourcePath}\n-char shared[1] = "";\n+volatile char shared[1] = "";`,
      workspaceExec,
    });

    expect(validation.status).toBe("failed");
    expect(validation.reasons).toContainEqual(expect.stringContaining("micro_gate:banned_idioms: qualifier_changed_on_shared_global"));
    expect(commands).toContainEqual(["cat", "config/GMSJ01/symbols.txt"]);
  });
});

describe("advisory adjudication modes", () => {
  const target = { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" };
  const allMicroGatesOff = { sectionParity: false, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false };

  function advisory(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
    return finding({
      rule_id: "type_erasing_cast",
      severity: "warning",
      message: "Added type-erasing cast.",
      excerpt: "u8* p = (u8*) obj;",
      standard_id: "global_standard:type-erasing-casts",
      detail: { llm_review: true, cast: "u8*" },
      ...overrides,
    });
  }

  // The scanner's exit-code contract: 1 = hard-fail findings, 2 = warnings only, 0 = clean.
  function scan(findings: QaScanFinding[]): QaScanInvocation {
    const exitCode = findings.some((entry) => entry.severity === "error") ? 1 : findings.some((entry) => entry.severity === "warning") ? 2 : 0;
    return invocation({ exitCode, result: scanResult(findings, exitCode === 1 ? "failed" : exitCode === 2 ? "warned" : "passed") });
  }

  /** One attempt whose source changed (so the QA scan runs) and whose target scored `targetAfter` against a baseline of 50. */
  async function runAttempt(outputDir: string, options: {
    findings: QaScanFinding[];
    targetAfter?: number;
    /** Added write-set diff lines; when set, the banned-idiom micro-gate runs on them. */
    bannedIdiomDiff?: string;
    retainPreQa?: boolean;
    deferAdvisories?: boolean;
  }): Promise<WorkerChangeValidation> {
    const sourceSnapshotDir = join(outputDir, "pre_worker_source");
    await mkdir(join(sourceSnapshotDir, "src/melee/ft"), { recursive: true });
    await writeFile(join(sourceSnapshotDir, target.source_path), "int a;\n");
    const baseline: WorkerChangeBaseline = {
      status: "available",
      reasons: [],
      objectTarget: "build/GALE01/src/melee/ft/ftcoll.o",
      firstDiff: null,
      sourceSnapshotDir,
      sourceSnapshotPaths: [target.source_path],
      snapshot: {
        schemaVersion: 1,
        capturedAt: "2026-06-30T00:00:00.000Z",
        unit: target.unit,
        symbol: target.symbol,
        sourcePath: target.source_path,
        objectTarget: "build/GALE01/src/melee/ft/ftcoll.o",
        metrics: [],
        functions: [{ name: target.symbol, score: 50, size: 16 }],
        sections: [],
        targetScore: 50,
      },
    };
    const report = JSON.stringify({
      left: { sections: [], symbols: [{ name: target.symbol, match_percent: options.targetAfter ?? 75, size: 16, instructions: [] }] },
    });
    return validateWorkerChange({
      repoRoot: "/workspace/advisory-modes",
      hostRepoRoot: "/host/melee",
      outputDir,
      attemptIndex: 0,
      baseline,
      target,
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      microGateFlags: options.bannedIdiomDiff ? { ...allMicroGatesOff, bannedIdioms: true } : allMicroGatesOff,
      postAttemptDiffText: options.bannedIdiomDiff,
      retainPreQa: options.retainPreQa,
      deferAdvisories: options.deferAdvisories,
      qaScanRunner: async () => scan(options.findings),
      workspaceExec: fakeWorkspaceExec(async (command) => {
        if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
        if (command.join(" ") === `cat ${target.source_path}`) return { exitCode: 0, stdout: "int a;\nu8* p = (u8*) obj;\n", stderr: "" };
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    });
  }

  async function summaryOf(validation: WorkerChangeValidation): Promise<unknown> {
    return JSON.parse(await readFile(validation.summaryPath ?? "", "utf8"));
  }

  /** The validation minus every field the adjudication modes may add. */
  function withoutAdjudicationData(validation: WorkerChangeValidation): WorkerChangeValidation {
    const { preQa: _preQa, advisoryGate: _advisoryGate, ...rest } = validation;
    if (!rest.qaLint) return rest;
    const { advisory: _advisory, ...qaLint } = rest.qaLint;
    return { ...rest, qaLint };
  }

  test("partition marks advisory-only scans; info advisories never count as deterministic warnings", () => {
    const warn = advisory();
    const infoAdvisory = advisory({ severity: "info", rule_id: "authored_style", line: 50 });
    const suppressed = finding({ severity: "info", rule_id: "extern_in_c", line: 60, disposition: "suppressed" });
    const deterministicWarning = finding({ severity: "warning", rule_id: "unrolled_assert", line: 70 });
    const advisoryError = advisory({ severity: "error", line: 80 });
    const partition = (findings: QaScanFinding[]) => qaLintAdvisoryPartition(qaLintFromInvocation(scan(findings), "/tmp/scan.patch"));

    expect(partition([warn, infoAdvisory])).toEqual({ findings: [warn, infoAdvisory], deterministic: [], advisoryOnly: true });
    expect(partition([warn, suppressed])).toEqual({ findings: [warn], deterministic: [suppressed], advisoryOnly: true });
    // An info advisory alone never makes the scan advisory-only: nothing blocks.
    expect(partition([infoAdvisory]).advisoryOnly).toBe(false);
    expect(partition([warn, deterministicWarning])).toEqual({ findings: [warn], deterministic: [deterministicWarning], advisoryOnly: false });
    // An llm_review error is a hard failure, never an advisory.
    expect(partition([advisoryError])).toEqual({ findings: [], deterministic: [advisoryError], advisoryOnly: false });
  });

  test("retainPreQa adds preQa and changes nothing else", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "advisory-retain-preqa-"));
    const findings = [advisory()];

    const off = await runAttempt(outputDir, { findings });
    // `off` stays byte-identical to the pre-adjudication output, on disk too.
    expect(await summaryOf(off)).toEqual(JSON.parse(JSON.stringify(off)));
    expect(Object.keys(off)).not.toContain("preQa");
    expect(Object.keys(off)).not.toContain("advisoryGate");
    expect(Object.keys(off.qaLint ?? {})).not.toContain("advisory");

    const shadow = await runAttempt(outputDir, { findings, retainPreQa: true });
    expect(shadow.status).toBe("failed");
    expect(shadow.preQa).toEqual({ status: "passed", reasons: [] });
    expect(shadow.qaLint?.advisory?.advisoryOnly).toBe(true);
    expect(withoutAdjudicationData(shadow)).toEqual(off);
    expect(await summaryOf(shadow)).toEqual(JSON.parse(JSON.stringify(shadow)));

    const skipped = await validateWorkerChange({
      repoRoot: "/workspace/advisory-modes",
      hostRepoRoot: "/host/melee",
      outputDir,
      attemptIndex: 1,
      baseline: { status: "snapshot_unavailable", reasons: [], snapshot: null, firstDiff: null },
      target,
      dryRun: true,
      shouldRun: true,
      claimedExact: false,
      retainPreQa: true,
      workspaceExec: fakeWorkspaceExec(),
    });
    expect(skipped.preQa).toEqual({ status: "skipped", reasons: skipped.reasons });
  });

  test("deferAdvisories keeps status passed only for advisory-only scans", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "advisory-defer-"));
    const enforce = await runAttempt(outputDir, { findings: [advisory(), advisory({ severity: "info", rule_id: "authored_style", line: 50 })], deferAdvisories: true });
    expect(enforce.status).toBe("passed");
    expect(enforce.advisoryGate).toBe("pending");
    expect(enforce.qaLint?.status).toBe("warnings");
    expect(enforce.reasons.some((reason) => reason.includes("QA finding(s) requiring repair"))).toBe(false);
    expect(await summaryOf(enforce)).toMatchObject({ status: "passed", advisoryGate: "pending" });

    const notDeferred: Array<{ name: string; findings: QaScanFinding[]; targetAfter?: number; bannedIdiomDiff?: string }> = [
      { name: "advisory plus deterministic warning", findings: [advisory(), finding({ severity: "warning", rule_id: "unrolled_assert", line: 70 })] },
      { name: "deterministic error", findings: [finding()] },
      { name: "llm_review error", findings: [advisory({ severity: "error" })] },
      { name: "advisory-only on an attempt that already failed", findings: [advisory()], targetAfter: 50 },
      {
        name: "advisory-only on an improving attempt a micro-gate fails",
        findings: [advisory()],
        bannedIdiomDiff: "diff --git a/src/melee/ft/ftcoll.c b/src/melee/ft/ftcoll.c\n+    short foo;",
      },
    ];
    for (const entry of notDeferred) {
      const attempt = { findings: entry.findings, targetAfter: entry.targetAfter, bannedIdiomDiff: entry.bannedIdiomDiff };
      const off = await runAttempt(outputDir, attempt);
      const deferred = await runAttempt(outputDir, { ...attempt, deferAdvisories: true });
      expect({ name: entry.name, advisoryGate: deferred.advisoryGate }).toEqual({ name: entry.name, advisoryGate: undefined });
      expect(deferred.status).not.toBe("passed");
      expect(withoutAdjudicationData(deferred)).toEqual(off);
    }
  });

  test("failForPendingAdvisories reproduces today's flip exactly", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "advisory-fail-pending-"));
    const findings = [advisory()];
    const off = await runAttempt(outputDir, { findings });
    const pending = await runAttempt(outputDir, { findings, deferAdvisories: true });

    const failed = failForPendingAdvisories(pending);
    expect(failed.status).toBe("failed");
    expect(failed.reasons.at(-1)).toBe("qa lint found 1 QA finding(s) requiring repair (gate exit 2)");
    expect(failed.advisoryGate).toBe("failed");
    expect(withoutAdjudicationData(failed)).toEqual(off);

    const verdict = "advisory type_erasing_cast at src/melee/ft/ftcoll.c:42 rejected: judged unjustified (p=0.12)";
    expect(failForPendingAdvisories(pending, [verdict]).reasons).toEqual([...off.reasons, verdict]);

    // A pending verdict that a later check already failed keeps that status, as today.
    const laterFailure = failForPendingAdvisories({ ...pending, status: "failed", reasons: [...pending.reasons, "strict-object mismatch"] });
    expect(laterFailure.status).toBe("failed");
    expect(laterFailure.reasons).toEqual([...pending.reasons, "strict-object mismatch", "qa lint found 1 QA finding(s) requiring repair (gate exit 2)"]);

    expect(failForPendingAdvisories(off)).toBe(off);
  });

  test("effectiveQaLint feeds back only the advisories adjudication left blocking", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "advisory-effective-"));
    const first = advisory({ line: 42 });
    const second = advisory({ line: 43, excerpt: "s16* q = (s16*) obj;" });
    const info = advisory({ severity: "info", rule_id: "authored_style", line: 50 });
    const suppressed = finding({ severity: "info", rule_id: "extern_in_c", line: 60, disposition: "suppressed" });
    const pending = await runAttempt(outputDir, { findings: [first, second, info, suppressed], deferAdvisories: true });

    // Every advisory accepted: no QA rejection feedback, raw evidence kept, and
    // a deterministic finding the resolution left out is never dropped.
    const accepted: WorkerChangeValidation = { ...pending, advisoryResolution: { acceptedFingerprints: ["af2:first", "af2:second"], remaining: [info] } };
    expect(effectiveQaLint(accepted)).toMatchObject({ status: "clean", exitCode: 0, findings: [info, suppressed] });
    expect(qaLintRepairReasons(effectiveQaLint(accepted))).toEqual([]);
    expect(accepted.qaLint?.status).toBe("warnings");

    // One accepted, one rejected: feedback names only the rejected one, with the enforce instruction.
    const partial = failForPendingAdvisories(
      { ...pending, advisoryResolution: { acceptedFingerprints: ["af2:first"], remaining: [{ ...second }, info] } },
      ["advisory type_erasing_cast at src/melee/ft/ftcoll.c:43 rejected: unclear (p=0.52)"],
    );
    const partialReasons = qaLintRepairReasons(effectiveQaLint(partial));
    expect(effectiveQaLint(partial)?.status).toBe("warnings");
    expect(partialReasons.some((reason) => reason.includes("src/melee/ft/ftcoll.c:43"))).toBe(true);
    expect(partialReasons.some((reason) => reason.includes("src/melee/ft/ftcoll.c:42"))).toBe(false);
    expect(partialReasons.at(-1)).toBe(QA_LINT_ADVISORY_REPAIR_INSTRUCTION_ENFORCE);

    // Nothing accepted (rejection, outage, timeout): every advisory stays, enforce instruction; the raw view is untouched.
    const rejected = failForPendingAdvisories(pending);
    const rejectedReasons = qaLintRepairReasons(effectiveQaLint(rejected));
    expect(rejectedReasons.filter((reason) => reason.startsWith("qa_lint_finding:"))).toHaveLength(4);
    expect(rejectedReasons.at(-1)).toBe(QA_LINT_ADVISORY_REPAIR_INSTRUCTION_ENFORCE);
    expect(qaLintRepairReasons(rejected.qaLint).at(-1)).toBe(QA_LINT_REPAIR_INSTRUCTION);
  });

  test("effectiveQaLint is the raw qaLint without adjudication and for any non-advisory scan", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "advisory-effective-raw-"));
    const off = await runAttempt(outputDir, { findings: [advisory()] });
    expect(effectiveQaLint(off)).toBe(off.qaLint);
    const pending = await runAttempt(outputDir, { findings: [advisory()], deferAdvisories: true });
    expect(effectiveQaLint(pending)).toBe(pending.qaLint);

    // A resolution never exempts anything from a scan with a deterministic error.
    const violations = await runAttempt(outputDir, { findings: [finding(), advisory({ line: 43 })], deferAdvisories: true });
    const resolved: WorkerChangeValidation = { ...violations, advisoryResolution: { acceptedFingerprints: ["af2:x"], remaining: [] } };
    expect(effectiveQaLint(resolved)).toBe(violations.qaLint);
  });
});
