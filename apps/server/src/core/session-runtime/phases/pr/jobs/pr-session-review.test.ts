import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import type { PiRunResult } from "@server/core/shared/types";
import type { QaScanFinding, QaScanInvocation, QaScanResult } from "@server/core/validation/qa";
import {
  confirmTimeoutSecondsArg,
  runSessionReview,
  type SessionReviewDeps,
  type SessionReviewRunOptions,
} from "./pr-session-review.js";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function git(repoRoot: string, args: string[]): Promise<string> {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr ?? result.error?.message ?? "")}`);
  return String(result.stdout ?? "").trim();
}

async function repoWithWorktreeChanges(files: string[]): Promise<{ repoRoot: string; baseSha: string }> {
  const repoRoot = tempDir("pr-session-review-repo-");
  await git(repoRoot, ["init", "-q", "-b", "main"]);
  await git(repoRoot, ["config", "user.email", "test@example.com"]);
  await git(repoRoot, ["config", "user.name", "Session Review Test"]);
  for (const file of files) {
    await mkdir(resolve(repoRoot, file, ".."), { recursive: true });
    await writeFile(resolve(repoRoot, file), `int ${file.replace(/[^A-Za-z0-9]/g, "_")}_base(void) { return 0; }\n`);
  }
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-q", "-m", "base"]);
  const baseSha = await git(repoRoot, ["rev-parse", "HEAD"]);
  for (const [index, file] of files.entries()) {
    await writeFile(resolve(repoRoot, file), `int changed_${index}(void) { return ${index + 1}; }\n`);
  }
  return { repoRoot, baseSha };
}

function globals(repoRoot: string, stateDir: string): GlobalArgs {
  return {
    repoRoot,
    stateDir,
    dryRunAgents: false,
    provider: "codex-lb",
    model: "gpt-5.5",
    thinkingLevel: "medium",
  };
}

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "m2c_residue_names",
    severity: "error",
    file: "src/melee/gm/gmtest.c",
    line: 12,
    excerpt: "s32 temp_r30 = 1;",
    message: "Generated m2c local name remains in source.",
    standard_id: "global_standard:conservative-naming",
    ...overrides,
  };
}

function scanResult(repoRoot: string, baseRef: string, findings: QaScanFinding[]): QaScanResult {
  const errors = findings.filter((entry) => entry.severity === "error").length;
  const warnings = findings.filter((entry) => entry.severity === "warning").length;
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: errors > 0 ? "failed" : warnings > 0 ? "warned" : "passed",
    repo: repoRoot,
    base: baseRef,
    findings,
    counts: { errors, warnings },
  };
}

function scanInvocation(repoRoot: string, baseRef: string, findings: QaScanFinding[]): QaScanInvocation {
  const result = scanResult(repoRoot, baseRef, findings);
  return {
    exitCode: result.counts.errors > 0 ? 1 : result.counts.warnings > 0 ? 2 : 0,
    result,
    stdout: JSON.stringify(result),
    stderr: "",
    toolError: null,
    command: ["python3", "scan_diff.py", "--base", baseRef, "--include-worktree"],
  };
}

function options(params: {
  repoRoot: string;
  stateDir: string;
  outputDir: string;
  baseRef: string;
  candidateFiles: string[];
  runAgents?: boolean;
  concurrency?: number;
  skipLlmQa?: boolean;
  skipConfirm?: boolean;
  skipRepair?: boolean;
  skipBatchGates?: boolean;
  batchGateSize?: number;
  confirmTimeoutSeconds?: number;
}): SessionReviewRunOptions {
  return {
    globals: globals(params.repoRoot, params.stateDir),
    runId: "test-run",
    outputDir: params.outputDir,
    baseRef: params.baseRef,
    candidateFiles: params.candidateFiles,
    concurrency: params.concurrency ?? 2,
    runAgents: params.runAgents ?? true,
    skipLlmQa: params.skipLlmQa ?? false,
    skipConfirm: params.skipConfirm ?? true,
    skipRepair: params.skipRepair ?? false,
    skipBatchGates: params.skipBatchGates ?? true,
    batchGateSize: params.batchGateSize ?? 15,
    maxItems: 20,
    repairWarnings: false,
    reviewProvider: "test-review-provider",
    reviewModel: "test-review-model",
    reviewThinking: "low",
    confirmProvider: "test-confirm-provider",
    confirmModel: "test-confirm-model",
    confirmThinking: "medium",
    confirmTimeoutSeconds: params.confirmTimeoutSeconds ?? 180,
    repairProvider: "test-repair-provider",
    repairModel: "test-repair-model",
    repairThinking: "xhigh",
  };
}

function agentResult(rawText: string): PiRunResult {
  return {
    sessionId: "confirm-session",
    outputPath: "/tmp/confirm-output.json",
    systemPromptPath: "/tmp/confirm-system.md",
    userPromptPath: "/tmp/confirm-user.md",
    rawText,
    dryRun: false,
  };
}

async function writeReview(path: string, params: {
  sliceId: string;
  verdict: "approve" | "reject";
  findings?: Array<{
    file: string;
    line: number | null;
    standard_id: string | null;
    verdict: "reject" | "warn";
    rationale: string;
    suggested_fix: string | null;
  }>;
}): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        review: {
          schema_version: "melee_pr_preship_review_v1",
          slice_id: params.sliceId,
          slice_verdict: params.verdict,
          findings: params.findings ?? [],
          summary: `${params.verdict} from test reviewer`,
          confidence: 0.95,
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function writeSliceReview(
  reviewRoot: string,
  sliceId: string,
  diff: string,
  params: Parameters<typeof writeReview>[1],
): Promise<string> {
  const reviewDir = resolve(reviewRoot, sliceId);
  const reviewPath = resolve(reviewDir, "review.json");
  await writeReview(reviewPath, params);
  await writeFile(resolve(reviewDir, "slice.diff"), diff);
  return reviewPath;
}

describe("pr-session-review server job", () => {
  test("dry mode writes a queue preview and unresolved lint ledger without invoking agents", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let reviewCalls = 0;
    let repairCalls = 0;
    let scanCalls = 0;
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => {
        scanCalls += 1;
        return scanInvocation(repoRoot, baseSha, [finding({ file })]);
      },
      reviewSlice: async () => {
        reviewCalls += 1;
        throw new Error("dry mode must not start per-file review");
      },
      processRepairItem: async () => {
        repairCalls += 1;
        throw new Error("dry mode must not start repair");
      },
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [file], runAgents: false }),
      deps,
    );

    expect(scanCalls).toBe(1);
    expect(reviewCalls).toBe(0);
    expect(repairCalls).toBe(0);
    expect(result.queue.dry_run).toBe(true);
    expect(result.queue.items).toHaveLength(1);
    expect(existsSync(resolve(outputDir, "queue.json"))).toBe(true);
    expect(existsSync(resolve(outputDir, "ledger.json"))).toBe(true);
    const ledger = JSON.parse(await readFile(resolve(outputDir, "ledger.json"), "utf8")) as Record<string, any>;
    expect(ledger.schema_version).toBe("pr_review_ledger_v2");
    expect(ledger.entries).toEqual([
      expect.objectContaining({ source: "review_lint", file, ruleId: "m2c_residue_names", disposition: "unresolved", evidence: null }),
    ]);
    expect(existsSync(resolve(stateDir, "pr_session_review", "test-run", "ledger.json"))).toBe(true);
  });

  test("enriches ledger entries with HEAD function spans, report scores, tiers, and reverted repair context", async () => {
    const file = "src/melee/gm/gmcontext.c";
    const repoRoot = tempDir("pr-session-review-context-repo-");
    await git(repoRoot, ["init", "-q", "-b", "main"]);
    await git(repoRoot, ["config", "user.email", "test@example.com"]);
    await git(repoRoot, ["config", "user.name", "Session Review Test"]);
    await mkdir(resolve(repoRoot, file, ".."), { recursive: true });
    await writeFile(
      resolve(repoRoot, file),
      [
        "int exact_fn(void)",
        "{",
        "    return 1;",
        "}",
        "",
        "int fuzzy_fn(void)",
        "{",
        "    return 2;",
        "}",
        "",
      ].join("\n"),
    );
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "context fixture"]);
    const baseSha = await git(repoRoot, ["rev-parse", "HEAD"]);
    await mkdir(resolve(repoRoot, "build/GALE01"), { recursive: true });
    await writeFile(
      resolve(repoRoot, "build/GALE01/report.json"),
      `${JSON.stringify({
        units: [{
          metadata: { source_path: file },
          functions: [
            { name: "exact_fn", fuzzy_match_percent: 100 },
            { name: "fuzzy_fn", fuzzy_match_percent: 87.5 },
          ],
        }],
      })}\n`,
    );
    const findings = [
      finding({ file, line: 3, rule_id: "exact_rule", standard_id: "global_standard:assert-report-macros" }),
      finding({ file, line: 8, rule_id: "fuzzy_rule", standard_id: "global_standard:header_inlines" }),
    ];
    const stateDir = tempDir("pr-session-review-context-state-");
    const outputDir = tempDir("pr-session-review-context-output-");
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, findings),
      processRepairItem: async (params) => ({
        item: {
          ...params.item,
          status: "blocked",
          attempts: [
            ...params.item.attempts,
            {
              id: "reverted-context-test",
              status: "agent_failed",
              createdAt: "2026-07-14T12:00:00.000Z",
              outputDir: resolve(outputDir, params.item.id),
              error: "repair would break the validated source shape",
            },
          ],
        },
      }),
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [file], skipLlmQa: true }),
      deps,
    );

    expect(result.ledger.schema_version).toBe("pr_review_ledger_v2");
    expect(result.ledger.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: 3,
        tier: 1,
        match_context: {
          function: "exact_fn",
          fuzzy_percent: 100,
          exact: true,
          repair_reverted: "repair would break the validated source shape",
        },
      }),
      expect.objectContaining({
        line: 8,
        tier: 1,
        match_context: {
          function: "fuzzy_fn",
          fuzzy_percent: 87.5,
          exact: false,
          repair_reverted: "repair would break the validated source shape",
        },
      }),
    ]));
  });

  test("ledger preserves left-with-evidence and false-positive dispositions matched by file and rule id", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    const finalFindings = [
      finding({ file, rule_id: "rule_left", standard_id: "global_standard:assert-report-macros", line: 41, message: "Review-sensitive retained shape." }),
      finding({ file, rule_id: "rule_false", standard_id: "global_standard:assert-report-macros", line: 42, message: "Scanner false positive." }),
    ];
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, finalFindings),
      processRepairItem: async (params) => {
        const itemDir = resolve(params.outputDir, params.item.id);
        const parsedOutputPath = resolve(itemDir, "agent_result.json");
        await mkdir(itemDir, { recursive: true });
        await writeFile(
          parsedOutputPath,
          `${JSON.stringify(
            {
              parsed: {
                schema_version: "melee_qa_repair_result_v1",
                item_id: params.item.id,
                source_path: file,
                outcome: "fixed",
                score_impact: "same_match",
                summary: "Retained one reviewed shape and dismissed one false positive.",
                edits: [file],
                validation: [],
                finding_dispositions: [
                  { rule_id: "rule_left", line: 12, disposition: "left_with_evidence", evidence: "Exact-match evidence supports retaining this line." },
                  { rule_id: "rule_false", line: 13, disposition: "false_positive", evidence: "The cast is typed by the enclosing declaration." },
                ],
                remaining_findings: [],
                risks: ["Human reviewer should confirm the retained line."],
              },
              validation_errors: [],
            },
            null,
            2,
          )}\n`,
        );
        return {
          item: {
            ...params.item,
            status: "clean_same_match",
            attempts: [
              ...params.item.attempts,
              {
                id: "repair-test",
                status: "validated",
                createdAt: "2026-07-14T12:00:00.000Z",
                outputDir: itemDir,
                parsedOutputPath,
              },
            ],
          },
        };
      },
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [file], skipLlmQa: true }),
      deps,
    );

    expect(result.ledger.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file, line: 41, ruleId: "rule_left", disposition: "left_with_evidence", evidence: "Exact-match evidence supports retaining this line.", tier: 2 }),
        expect.objectContaining({ file, line: 42, ruleId: "rule_false", disposition: "false_positive", evidence: "The cast is typed by the enclosing declaration.", tier: 3 }),
      ]),
    );
  });

  test("merged scan includes converted per-file preship findings", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let reviewCalls = 0;
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, []),
      reviewSlice: async (slice) => {
        reviewCalls += 1;
        const reviewPath = resolve(outputDir, `review-${reviewCalls}.json`);
        await writeReview(reviewPath, {
          sliceId: slice.id,
          verdict: "reject",
          findings: [
            {
              file,
              line: 7,
              standard_id: "global_standard:typed-access",
              verdict: "reject",
              rationale: "The added access erases the underlying type.",
              suggested_fix: "Use the typed field directly.",
            },
          ],
        });
        return { id: slice.id, verdict: "reject", rejectFindings: 1, warnFindings: 0, reviewPath };
      },
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [file], skipRepair: true }),
      deps,
    );

    expect(reviewCalls).toBeGreaterThanOrEqual(1);
    expect(result.mergedScan.findings).toEqual([
      expect.objectContaining({
        file,
        line: 7,
        severity: "error",
        rule_id: "preship_reject_global_standard_typed_access",
        message: "The added access erases the underlying type.",
        detail: expect.objectContaining({ source: "preship" }),
      }),
    ]);
    const persisted = JSON.parse(await readFile(resolve(outputDir, "merged_scan.json"), "utf8")) as QaScanResult;
    expect(persisted.findings[0]?.rule_id).toBe("preship_reject_global_standard_typed_access");
  });

  test("confirm pass refutes weak LLM rejects into ledger-only warnings", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let confirmCalls = 0;
    let capturedPrompt = "";
    let capturedRole = "";
    let capturedModel = "";
    let capturedTimeoutMs: number | undefined;
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, []),
      reviewSlice: async (slice, reviewOptions) => {
        if (reviewOptions.reviewRootDir !== resolve(outputDir, "llm_qa")) {
          return { id: slice.id, verdict: "approve", rejectFindings: 0, warnFindings: 0, reviewPath: null };
        }
        const reviewPath = await writeSliceReview(
          reviewOptions.reviewRootDir,
          slice.id,
          [
            `diff --git a/${file} b/${file}`,
            `--- a/${file}`,
            `+++ b/${file}`,
            "@@ -1 +1 @@",
            "-int src_melee_gm_gmtest_c_base(void) { return 0; }",
            "+int changed_0(void) { return 1; }",
            "",
          ].join("\n"),
          {
            sliceId: slice.id,
            verdict: "reject",
            findings: [
              {
                file,
                line: 1,
                standard_id: "global_standard:typed-access",
                verdict: "reject",
                rationale: "The new line supposedly erases a type.",
                suggested_fix: "Use a typed field.",
              },
            ],
          },
        );
        return { id: slice.id, verdict: "reject", rejectFindings: 1, warnFindings: 0, reviewPath };
      },
      confirmAgentRunner: async (runOptions) => {
        confirmCalls += 1;
        capturedPrompt = runOptions.prompt.userPrompt;
        capturedRole = runOptions.role;
        capturedModel = runOptions.model ?? "";
        capturedTimeoutMs = runOptions.timeoutMs;
        expect(runOptions.prompt.kernelContext).toBeUndefined();
        expect(runOptions.toolProfile).toEqual({ replace: [] });
        return agentResult(JSON.stringify({ confirmed: false, reason: "The cited line preserves its declared type." }));
      },
    };

    const result = await runSessionReview(
      options({
        repoRoot,
        stateDir,
        outputDir,
        baseRef: baseSha,
        candidateFiles: [file],
        skipConfirm: false,
        skipRepair: true,
      }),
      deps,
    );

    expect(confirmCalls).toBe(1);
    expect(capturedRole).toBe("pr-reviewer");
    expect(capturedModel).toBe("test-confirm-model");
    expect(capturedTimeoutMs).toBe(180_000);
    expect(capturedPrompt).toContain("global_standard:typed-access");
    expect(capturedPrompt).toContain("+int changed_0(void) { return 1; }");
    expect(result.mergedScan.findings).toHaveLength(0);
    expect(result.queue.items).toHaveLength(0);
    expect(result.ledger.entries).toEqual([
      expect.objectContaining({
        source: "llm_qa",
        severity: "warning",
        file,
        disposition: "unresolved",
        evidence: null,
        message: expect.stringContaining("The cited line preserves its declared type."),
      }),
    ]);
    const confirmDirs = await readdir(resolve(outputDir, "confirm"));
    expect(confirmDirs).toHaveLength(1);
    expect(existsSync(resolve(outputDir, "confirm", confirmDirs[0]!, "verdict.json"))).toBe(true);
    const summary = JSON.parse(await readFile(resolve(outputDir, "confirm_summary.json"), "utf8")) as Record<string, any>;
    expect(summary).toEqual(expect.objectContaining({ total: 1, confirmed: 0, refuted: 1 }));
    expect(summary.by_standard["global_standard:typed-access"]).toEqual({ confirmed: 0, refuted: 1 });
  });

  test("confirm pass uses the dedicated timeout override", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let capturedTimeoutMs: number | undefined;
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, []),
      reviewSlice: async (slice, reviewOptions) => {
        if (reviewOptions.reviewRootDir !== resolve(outputDir, "llm_qa")) {
          return { id: slice.id, verdict: "approve", rejectFindings: 0, warnFindings: 0, reviewPath: null };
        }
        const reviewPath = await writeSliceReview(
          reviewOptions.reviewRootDir,
          slice.id,
          [
            `diff --git a/${file} b/${file}`,
            `--- a/${file}`,
            `+++ b/${file}`,
            "@@ -1 +1 @@",
            "-int src_melee_gm_gmtest_c_base(void) { return 0; }",
            "+int changed_0(void) { return 1; }",
            "",
          ].join("\n"),
          {
            sliceId: slice.id,
            verdict: "reject",
            findings: [{
              file,
              line: 1,
              standard_id: "global_standard:typed-access",
              verdict: "reject",
              rationale: "The new line supposedly erases a type.",
              suggested_fix: "Use a typed field.",
            }],
          },
        );
        return { id: slice.id, verdict: "reject", rejectFindings: 1, warnFindings: 0, reviewPath };
      },
      confirmAgentRunner: async (runOptions) => {
        capturedTimeoutMs = runOptions.timeoutMs;
        return agentResult(JSON.stringify({ confirmed: false, reason: "Not a rejection." }));
      },
    };

    await runSessionReview(
      options({
        repoRoot,
        stateDir,
        outputDir,
        baseRef: baseSha,
        candidateFiles: [file],
        skipConfirm: false,
        skipRepair: true,
        confirmTimeoutSeconds: confirmTimeoutSecondsArg(new Map([["--confirm-timeout-seconds", "42"]])),
      }),
      deps,
    );

    expect(capturedTimeoutMs).toBe(42_000);
  });

  test("review_lint findings bypass the confirm pass", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let confirmCalls = 0;
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, [finding({ file, line: 1 })]),
      reviewSlice: async (slice) => ({
        id: slice.id,
        verdict: "approve",
        rejectFindings: 0,
        warnFindings: 0,
        reviewPath: null,
      }),
      confirmAgentRunner: async () => {
        confirmCalls += 1;
        throw new Error("lint findings must never reach confirmation");
      },
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [file], skipConfirm: false, skipRepair: true }),
      deps,
    );

    expect(confirmCalls).toBe(0);
    expect(result.queue.items).toHaveLength(1);
    expect(result.queue.items[0]?.findings[0]?.rule_id).toBe("m2c_residue_names");
    const summary = JSON.parse(await readFile(resolve(outputDir, "confirm_summary.json"), "utf8")) as Record<string, number>;
    expect(summary.total).toBe(0);
  });

  test("unparseable confirm output fails closed and keeps the reject queued", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, []),
      reviewSlice: async (slice, reviewOptions) => {
        if (reviewOptions.reviewRootDir !== resolve(outputDir, "llm_qa")) {
          return { id: slice.id, verdict: "approve", rejectFindings: 0, warnFindings: 0, reviewPath: null };
        }
        const reviewPath = await writeSliceReview(
          reviewOptions.reviewRootDir,
          slice.id,
          [
            `diff --git a/${file} b/${file}`,
            `--- a/${file}`,
            `+++ b/${file}`,
            "@@ -1 +1 @@",
            "-int src_melee_gm_gmtest_c_base(void) { return 0; }",
            "+int changed_0(void) { return 1; }",
            "",
          ].join("\n"),
          {
            sliceId: slice.id,
            verdict: "reject",
            findings: [
              {
                file,
                line: 1,
                standard_id: "global_standard:typed-access",
                verdict: "reject",
                rationale: "The added access erases the type.",
                suggested_fix: null,
              },
            ],
          },
        );
        return { id: slice.id, verdict: "reject", rejectFindings: 1, warnFindings: 0, reviewPath };
      },
      confirmAgentRunner: async () => agentResult("```json\n{\"confirmed\": false, \"reason\": \"weak\"}\n```"),
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [file], skipConfirm: false, skipRepair: true }),
      deps,
    );

    expect(result.mergedScan.findings).toEqual([
      expect.objectContaining({ severity: "error", rule_id: "preship_reject_global_standard_typed_access" }),
    ]);
    expect(result.queue.items).toHaveLength(1);
    const confirmDirs = await readdir(resolve(outputDir, "confirm"));
    const verdict = JSON.parse(
      await readFile(resolve(outputDir, "confirm", confirmDirs[0]!, "verdict.json"), "utf8"),
    ) as Record<string, any>;
    expect(verdict).toEqual(expect.objectContaining({ confirmed: true, fail_closed: true }));
    expect(verdict.reason).toContain("Fail-closed");
  });

  test("header findings stay in the ledger and never enter the repair queue", async () => {
    const header = "src/melee/gm/gmtest.h";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([header]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, [finding({ file: header, line: 1 })]),
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [header], skipLlmQa: true, skipRepair: true }),
      deps,
    );

    expect(result.mergedScan.findings).toHaveLength(1);
    expect(result.queue.items).toHaveLength(0);
    expect(result.ledger.entries).toEqual([
      expect.objectContaining({ source: "review_lint", file: header, severity: "error", disposition: "unresolved" }),
    ]);
  });

  test("header guard reverts repair-side header edits and reports them", async () => {
    const source = "src/melee/gm/gmtest.c";
    const header = "src/melee/gm/gmtest.h";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([source, header]);
    await git(repoRoot, ["checkout", "HEAD", "--", header]);
    const baseHeader = await git(repoRoot, ["show", `HEAD:${header}`]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, [finding({ file: source, line: 1 })]),
      processRepairItem: async (params) => {
        await writeFile(resolve(repoRoot, header), "int repair_agent_touched_header;\n");
        return { item: { ...params.item, status: "clean_same_match" } };
      },
    };

    const result = await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: [source], skipLlmQa: true }),
      deps,
    );

    expect((await readFile(resolve(repoRoot, header), "utf8")).trim()).toBe(baseHeader);
    expect(result.ledger.summary.reverted_headers).toBe(1);
  });

  test("batch gate reverts a failing completed repair item and marks it needs_rework", async () => {
    const file = "src/melee/gm/gmtest.c";
    const { repoRoot, baseSha } = await repoWithWorktreeChanges([file]);
    const baseSource = await git(repoRoot, ["show", `HEAD:${file}`]);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let buildCalls = 0;
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, [finding({ file, line: 1 })]),
      processRepairItem: async (params) => {
        expect((params as typeof params & { enforcedChecks?: boolean }).enforcedChecks).toBe(true);
        await writeFile(resolve(repoRoot, file), "this does not compile\n");
        return { item: { ...params.item, status: "clean_same_match" } };
      },
      batchBuildRunner: async () => {
        buildCalls += 1;
        return buildCalls === 1
          ? { exitCode: 1, stdout: `FAILED: build/GALE01/src/melee/gm/gmtest.o\n`, stderr: "compile failed\n" }
          : { exitCode: 0, stdout: "changes_all passed\n", stderr: "" };
      },
    };

    const result = await runSessionReview(
      options({
        repoRoot,
        stateDir,
        outputDir,
        baseRef: baseSha,
        candidateFiles: [file],
        skipLlmQa: true,
        skipBatchGates: false,
        batchGateSize: 15,
      }),
      deps,
    );

    expect(buildCalls).toBe(2);
    expect((await readFile(resolve(repoRoot, file), "utf8")).trim()).toBe(baseSource);
    expect(result.queue.items[0]).toEqual(
      expect.objectContaining({ status: "needs_rework", routing_reason: "batch_gate_build_failure" }),
    );
    expect(existsSync(resolve(outputDir, "batch_gates", "gate-001", "iteration-01.stdout.txt"))).toBe(true);
  });

  test("batch gates quiesce in-flight repairs and retry manifest-dirty builds once", async () => {
    const files = Array.from({ length: 3 }, (_, index) => `src/melee/gm/gm_gate_${index}.c`);
    const { repoRoot, baseSha } = await repoWithWorktreeChanges(files);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let repairsInFlight = 0;
    let buildCalls = 0;
    const inFlightAtBuild: number[] = [];
    const delays: number[] = [];
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(
        repoRoot,
        baseSha,
        files.map((file, index) => finding({ file, line: index + 1 })),
      ),
      processRepairItem: async (params) => {
        repairsInFlight += 1;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, params.item.source_path.endsWith("_0.c") ? 5 : 20));
        repairsInFlight -= 1;
        return { item: { ...params.item, status: "clean_same_match" } };
      },
      batchBuildRunner: async () => {
        inFlightAtBuild.push(repairsInFlight);
        buildCalls += 1;
        return buildCalls === 1
          ? {
              exitCode: 1,
              stdout: "",
              stderr: "ninja: error: manifest 'build.ninja' still dirty after 100 tries\n",
            }
          : { exitCode: 0, stdout: "changes_all passed\n", stderr: "" };
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    };

    await runSessionReview(
      options({
        repoRoot,
        stateDir,
        outputDir,
        baseRef: baseSha,
        candidateFiles: files,
        concurrency: 2,
        skipLlmQa: true,
        skipBatchGates: false,
        batchGateSize: 1,
      }),
      deps,
    );

    expect(inFlightAtBuild).toEqual([0, 0, 0]);
    expect(buildCalls).toBe(3);
    expect(delays).toEqual([5_000]);
    expect(existsSync(resolve(outputDir, "batch_gates", "gate-001", "iteration-01-manifest-retry.stderr.txt"))).toBe(true);
  });

  test("per-file review and repair pools never exceed the configured concurrency", async () => {
    const files = Array.from({ length: 7 }, (_, index) => `src/melee/gm/gm_${index}.c`);
    const { repoRoot, baseSha } = await repoWithWorktreeChanges(files);
    const stateDir = tempDir("pr-session-review-state-");
    const outputDir = tempDir("pr-session-review-output-");
    let inFlight = 0;
    let peakInFlight = 0;
    let calls = 0;
    let repairsInFlight = 0;
    let peakRepairsInFlight = 0;
    let repairCalls = 0;
    const lintFindings = files.map((file, index) => finding({ file, line: index + 1 }));
    const deps: SessionReviewDeps = {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      scanDiff: async () => scanInvocation(repoRoot, baseSha, lintFindings),
      reviewSlice: async (slice) => {
        calls += 1;
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
        inFlight -= 1;
        return { id: slice.id, verdict: "approve", rejectFindings: 0, warnFindings: 0, reviewPath: null };
      },
      processRepairItem: async (params) => {
        repairCalls += 1;
        repairsInFlight += 1;
        peakRepairsInFlight = Math.max(peakRepairsInFlight, repairsInFlight);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
        repairsInFlight -= 1;
        return { item: { ...params.item, status: "clean_same_match" } };
      },
    };

    await runSessionReview(
      options({ repoRoot, stateDir, outputDir, baseRef: baseSha, candidateFiles: files, concurrency: 2 }),
      deps,
    );

    expect(calls).toBeGreaterThanOrEqual(files.length);
    expect(peakInFlight).toBe(2);
    expect(repairCalls).toBe(files.length);
    expect(peakRepairsInFlight).toBe(2);
  });
});
