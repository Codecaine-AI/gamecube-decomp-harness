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
  QA_LINT_REPAIR_INSTRUCTION,
  qaLintFromInvocation,
  qaLintRepairReasons,
  rewriteNoIndexDiffPaths,
  validateWorkerChange,
  type WorkerChangeBaseline,
  type WorkerQaLint,
  type WorkerUnitScoreSnapshot,
} from "./change-validation.js";
import type { WorkerRunnerValidation } from "./runner-validation.js";

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
      "qa_lint_finding: error extern_literal_anchor at src/melee/ft/ftcoll.c:42 — extern-for-literal anchor referencing TU-owned data [standard: global_standard:literals-and-data-ownership] excerpt: extern const f32 lbl_804DA60C;",
    );
    expect(reasons[1]).toBe(
      "qa_lint_finding: error unrolled_assert at src/melee/gr/ground.c:99 — open-coded assert [standard: global_standard:assert-report-macros] excerpt: __assert(...)",
    );
    expect(reasons[2]).toBe(QA_LINT_REPAIR_INSTRUCTION);
    expect(QA_LINT_REPAIR_INSTRUCTION).toBe(
      "Remove every QA lint finding; a lower match % without it is the correct outcome. Do not re-add maintainer-rejected patterns.",
    );
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
  test("copies the target source file and extraPaths into pre_worker_source", async () => {
    const root = await mkdtemp(join(tmpdir(), "qa-l1-baseline-"));
    const repoRoot = join(root, "repo");
    const outputDir = join(root, "validation");
    await mkdir(join(repoRoot, "src/melee/ft"), { recursive: true });
    await mkdir(join(repoRoot, "src/melee/gr"), { recursive: true });
    await writeFile(join(repoRoot, "src/melee/ft/ftcoll.c"), "int a;\n");
    await writeFile(join(repoRoot, "src/melee/gr/ground.c"), "int b;\n");

    const baseline = await captureWorkerChangeBaseline({
      repoRoot,
      outputDir,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      extraPaths: ["src/melee/gr/ground.c", "src/missing.c", "../escape.c"],
    });

    expect(baseline.sourceSnapshotDir).toBe(resolve(outputDir, "pre_worker_source"));
    expect(baseline.sourceSnapshotPaths?.sort()).toEqual(["src/melee/ft/ftcoll.c", "src/melee/gr/ground.c"]);
    expect(await readFile(resolve(outputDir, "pre_worker_source/src/melee/ft/ftcoll.c"), "utf8")).toBe("int a;\n");
    expect(await readFile(resolve(outputDir, "pre_worker_source/src/melee/gr/ground.c"), "utf8")).toBe("int b;\n");
    // No build system in the temp repo, so the objdiff baseline itself fails —
    // the source snapshot must survive that.
    expect(baseline.snapshot).toBeNull();
  });
});

describe("validateWorkerChange QA lint integration", () => {
  async function setupAttempt(): Promise<{
    repoRoot: string;
    outputDir: string;
    baseline: WorkerChangeBaseline;
  }> {
    const root = await mkdtemp(join(tmpdir(), "qa-l1-validate-"));
    const repoRoot = join(root, "repo");
    const outputDir = join(root, "validation");
    const sourceSnapshotDir = join(outputDir, "pre_worker_source");
    await mkdir(join(repoRoot, "src/melee/ft"), { recursive: true });
    await mkdir(join(sourceSnapshotDir, "src/melee/ft"), { recursive: true });
    await writeFile(join(sourceSnapshotDir, "src/melee/ft/ftcoll.c"), "int a;\nint b;\n");
    await writeFile(join(repoRoot, "src/melee/ft/ftcoll.c"), "int a;\nextern const f32 lbl_804DA60C;\nint b;\n");
    const baseline: WorkerChangeBaseline = {
      status: "snapshot_unavailable",
      reasons: ["pre-worker unit diff exited 1"],
      snapshot: null,
      objectTarget: "build/GALE01/src/melee/ft/ftcoll.o",
      sourceSnapshotDir,
      sourceSnapshotPaths: ["src/melee/ft/ftcoll.c"],
    };
    return { repoRoot, outputDir, baseline };
  }

  test("a violating attempt is rejected: qaLint violations, status not passed, patch handed to the scanner", async () => {
    const { repoRoot, outputDir, baseline } = await setupAttempt();
    const seenOptions: RunQaScanDiffOptions[] = [];
    const fakeRunner = async (options: RunQaScanDiffOptions): Promise<QaScanInvocation> => {
      seenOptions.push(options);
      return invocation({ exitCode: 1, result: scanResult([finding()], "failed") });
    };

    const validation = await validateWorkerChange({
      repoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      qaScanRunner: fakeRunner,
    });

    expect(validation.qaLint?.status).toBe("violations");
    expect(validation.status).not.toBe("passed");
    expect(validation.reasons.some((reason) => reason.includes("QA finding(s) requiring repair"))).toBe(true);

    expect(seenOptions).toHaveLength(1);
    expect(seenOptions[0].repoRoot).toBe(repoRoot);
    expect(seenOptions[0].orchestratorRoot).toBe("/tmp/orchestrator");
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

  test("an unchanged source file skips the scanner and reports clean", async () => {
    const { repoRoot, outputDir, baseline } = await setupAttempt();
    await writeFile(join(repoRoot, "src/melee/ft/ftcoll.c"), "int a;\nint b;\n");
    let calls = 0;
    const validation = await validateWorkerChange({
      repoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
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
    const { repoRoot, outputDir, baseline } = await setupAttempt();
    const validation = await validateWorkerChange({
      repoRoot,
      outputDir,
      attemptIndex: 1,
      baseline,
      target: { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" },
      dryRun: false,
      shouldRun: true,
      claimedExact: false,
      orchestratorRoot: "/tmp/orchestrator",
      qaScanRunner: async () => invocation({ exitCode: -1, result: null, stdout: "", toolError: "scan_diff.py not found" }),
    });
    expect(validation.qaLint?.status).toBe("tool_unavailable");
    expect(validation.qaLint?.toolError).toContain("scan_diff.py not found");
    expect(qaLintRepairReasons(validation.qaLint)).toEqual([]);
  });

  test("dry-run and gate-skipped attempts never invoke the scanner", async () => {
    const { repoRoot, outputDir, baseline } = await setupAttempt();
    let calls = 0;
    const runner = async (): Promise<QaScanInvocation> => {
      calls += 1;
      return invocation();
    };
    const target = { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: "src/melee/ft/ftcoll.c" };
    const dryRun = await validateWorkerChange({
      repoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target,
      dryRun: true,
      shouldRun: true,
      claimedExact: false,
      qaScanRunner: runner,
    });
    const gateSkipped = await validateWorkerChange({
      repoRoot,
      outputDir,
      attemptIndex: 0,
      baseline,
      target,
      dryRun: false,
      shouldRun: false,
      claimedExact: false,
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
