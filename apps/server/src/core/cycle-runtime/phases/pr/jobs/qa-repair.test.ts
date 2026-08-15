import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { MeleeKernelPiRunOptions } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import type { QaScanFinding, QaScanResult } from "@server/core/validation/qa";
import type { UnitMatchSnapshot } from "@server/core/validation/qa/repair-checks";
import {
  applyQaRepairValidation,
  buildQaRepairQueue,
  type QaRepairAttempt,
  type QaRepairValidationResult,
} from "@server/core/validation/qa/repair-lane";
import type { PiRunResult } from "@server/core/shared/types";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { mergeProcessedItem, processQueueItem, runQaRepair, type QaRepairAttemptWithEnforcedChecks } from "./qa-repair.js";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function run(cwd: string, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = spawnSync(command[0] ?? "", command.slice(1), { cwd, encoding: "utf8" });
  return { exitCode: result.status ?? 1, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? result.error?.message ?? "") };
}

async function git(repoRoot: string, args: string[]): Promise<string> {
  const result = await run(repoRoot, ["git", ...args]);
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function currentHead(repoRoot: string): Promise<string> {
  return (await readFile(resolve(repoRoot, ".git/refs/heads/main"), "utf8")).trim();
}

async function cleanRepo(): Promise<{ repoRoot: string; baseSha: string }> {
  const repoRoot = tempDir("qa-repair-live-repo-");
  await git(repoRoot, ["init", "-q", "-b", "main"]);
  await git(repoRoot, ["config", "user.email", "test@example.com"]);
  await git(repoRoot, ["config", "user.name", "QA Repair Test"]);
  await mkdir(resolve(repoRoot, "src/melee/gr"), { recursive: true });
  await writeFile(resolve(repoRoot, "src/melee/gr/grsmoke.c"), "int grSmoke(void) { return 0; }\n");
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-q", "-m", "base"]);
  return { repoRoot, baseSha: await currentHead(repoRoot) };
}

async function repoWithCommittedQaViolation(): Promise<{ repoRoot: string; baseSha: string }> {
  const { repoRoot, baseSha } = await cleanRepo();
  await writeFile(resolve(repoRoot, "src/melee/gr/grsmoke.c"), "int grSmoke(void) { register int bad = 1; return bad; }\n");
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-q", "-m", "introduce qa violation"]);
  return { repoRoot, baseSha };
}

function globals(repoRoot: string, stateDir: string, dryRunAgents = false): GlobalArgs {
  return {
    repoRoot,
    stateDir,
    dryRunAgents,
    provider: "codex-lb",
    model: "gpt-5.5",
    thinkingLevel: "medium",
  };
}

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "m2c_residue_names",
    severity: "error",
    file: "src/melee/gr/grsmoke.c",
    line: 23,
    excerpt: "s32 temp_r30 = var_r4 + phi_f1;",
    message: "Generated m2c local name remains in source.",
    standard_id: "global_standard:conservative-naming",
    ...overrides,
  };
}

function scanResult(findings: QaScanFinding[]): QaScanResult {
  const errors = findings.filter((entry) => entry.severity === "error").length;
  const warnings = findings.filter((entry) => entry.severity === "warning").length;
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: errors > 0 ? "failed" : warnings > 0 ? "warned" : "passed",
    repo: "/repo",
    base: "origin/master",
    findings,
    counts: { errors, warnings },
  };
}

async function writeScanJson(dir: string, findings: QaScanFinding[]): Promise<string> {
  const path = resolve(dir, "scan.json");
  await writeFile(path, `${JSON.stringify(scanResult(findings), null, 2)}\n`);
  return path;
}

function fixedRepairJson(scoreImpact: "same_match" | "lower_score" = "same_match"): string {
  return JSON.stringify({
    schema_version: "melee_qa_repair_result_v1",
    item_id: "src-melee-gr-grsmoke",
    source_path: "src/melee/gr/grsmoke.c",
    outcome: "fixed",
    score_impact: scoreImpact,
    summary: "Removed the QA violation with a minimal source edit.",
    edits: ["src/melee/gr/grsmoke.c"],
	    validation: [
	      {
	        command: "review_lint scan_diff --gate",
	        status: "passed",
	        artifact_path: null,
	        notes: "Runner revalidates this claim.",
	      },
	    ],
	    finding_dispositions: [
	      {
	        rule_id: "m2c_residue_names",
	        line: 23,
	        disposition: "fixed_source",
	        evidence: "Removed the mocked QA violation with a minimal source edit.",
	      },
	    ],
	    remaining_findings: [],
    risks: [],
  });
}

function unitSnapshot(functionScore = 100): UnitMatchSnapshot {
  return {
    sourcePath: "src/melee/gr/grsmoke.c",
    objectPath: "build/GALE01/src/melee/gr/grsmoke.o",
    functions: [{ name: "grSmoke", fuzzyMatchPercent: functionScore, size: 16 }],
    sections: [{ name: ".text", fuzzyMatchPercent: 100 }],
  };
}

async function mockRunnerResult(rawText: string, outputDir: string): Promise<PiRunResult> {
  const outputPath = resolve(outputDir, "mock-output.txt");
  const systemPromptPath = resolve(outputDir, "mock.system.md");
  const userPromptPath = resolve(outputDir, "mock.user.md");
  await writeFile(outputPath, rawText);
  await writeFile(systemPromptPath, "mock system prompt");
  await writeFile(userPromptPath, "mock user prompt");
  return {
    sessionId: "mock-cycle",
    outputPath,
    systemPromptPath,
    userPromptPath,
    rawText,
    dryRun: false,
  };
}

describe("qa-repair server job", () => {
  test("writes queue, summary, report, and ship status from saved scan JSON", async () => {
    const root = tempDir("qa-repair-repo-");
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const scanPath = await writeScanJson(root, [
      finding(),
      finding({ file: "src/melee/gm/gm_1832.c", rule_id: "extern_in_c", line: 99 }),
      finding({ file: "src/melee/gm/gm_1832.c", rule_id: "novel_pragma", severity: "warning", line: 100 }),
    ]);

    const result = await runQaRepair(
      globals(root, stateDir),
      new Map<string, string | true>([
        ["--run-id", "test-run"],
        ["--scan-json", scanPath],
        ["--all-scan-files", true],
        ["--output-dir", outputDir],
      ]),
    );

    expect(existsSync(result.artifacts.queuePath)).toBe(true);
    expect(existsSync(result.artifacts.summaryPath)).toBe(true);
    expect(existsSync(result.artifacts.reportPath)).toBe(true);
    expect(existsSync(result.artifacts.shipStatusPath)).toBe(true);
    expect(result.queue.items).toHaveLength(2);
    const summary = JSON.parse(await readFile(result.artifacts.summaryPath, "utf8")) as Record<string, any>;
    expect(summary.counts.files_with_errors).toBe(2);
    expect(summary.counts.by_rule.m2c_residue_names).toBe(1);
    const report = await readFile(result.artifacts.reportPath, "utf8");
    expect(report).toContain("src/melee/gr/grsmoke.c");
    expect(report).toContain("src/melee/gm/gm_1832.c");
  });

  test("dry-run agents write prompt artifacts without marking the item clean", async () => {
    const root = tempDir("qa-repair-repo-");
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const scanPath = await writeScanJson(root, [finding()]);

    const result = await runQaRepair(
      globals(root, stateDir, true),
      new Map<string, string | true>([
        ["--run-id", "test-run"],
        ["--scan-json", scanPath],
        ["--all-scan-files", true],
        ["--run-agents", true],
        ["--output-dir", outputDir],
      ]),
    );

    const item = result.queue.items[0];
    expect(item?.status).toBe("queued");
    expect(item?.attempts[0]?.status).toBe("dry_run");
    expect(item?.attempts[0]?.systemPromptPath && existsSync(item.attempts[0].systemPromptPath)).toBe(true);
    expect(item?.attempts[0]?.userPromptPath && existsSync(item.attempts[0].userPromptPath)).toBe(true);
    const userPrompt = await readFile(String(item?.attempts[0]?.userPromptPath), "utf8");
    expect(userPrompt).toContain("<qa_repair_item>");
    expect(userPrompt).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  test("per-item agent overrides take precedence in runner options", async () => {
    const root = tempDir("qa-repair-repo-");
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot: root,
      scanResult: scanResult([finding()]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
      dryRun: true,
    });
    let runnerOptions: MeleeKernelPiRunOptions | undefined;
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      runnerOptions = options;
      return { ...(await mockRunnerResult("", options.outputDir)), dryRun: true };
    };

    await processQueueItem({
      globals: globals(root, stateDir, true),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: null,
      validationCommands: {},
      runner,
      agentOverrides: {
        provider: "override-provider",
        model: "override-model",
        thinkingLevel: "high",
      },
    });

    expect(runnerOptions?.provider).toBe("override-provider");
    expect(runnerOptions?.model).toBe("override-model");
    expect(runnerOptions?.thinkingLevel).toBe("high");
  });

  test("mergeProcessedItem matches the legacy whole-queue update", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([
        finding(),
        finding({ file: "src/melee/gm/gm_1832.c", rule_id: "extern_in_c", line: 99 }),
      ]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    const target = queue.items[0]!;
    const attempt: QaRepairAttempt = {
      id: "repair-cycle",
      status: "validated",
      createdAt: "2026-07-14T00:01:00.000Z",
      outputDir: "/artifacts/repair-cycle",
      summary: "post-repair QA scan is clean for the item",
    };
    const validation: QaRepairValidationResult = {
      itemId: target.id,
      sourcePath: target.source_path,
      status: "clean_same_match",
      reasons: ["post-repair QA scan is clean for the item"],
      remainingFindings: [],
      validationArtifacts: {},
    };
    const legacyQueue = applyQaRepairValidation(queue, validation, attempt);
    const processedItem = legacyQueue.items.find((item) => item.id === target.id)!;

    expect(mergeProcessedItem(queue, { item: processedItem })).toEqual(legacyQueue);
    expect(queue.items[0]?.status).toBe("queued");
    expect(queue.items[1]).toBe(legacyQueue.items[1]);
  });

  test("item id limits live resolution to one queued repair item", async () => {
    const root = tempDir("qa-repair-repo-");
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const scanPath = await writeScanJson(root, [
      finding(),
      finding({ file: "src/melee/gm/gm_1832.c", rule_id: "extern_in_c", line: 99 }),
    ]);
    const resolvedItems: string[] = [];
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      resolvedItems.push(String(options.kernelContext?.metadata?.itemId ?? ""));
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await runQaRepair(
      globals(root, stateDir),
      new Map<string, string | true>([
        ["--run-id", "test-run"],
        ["--scan-json", scanPath],
        ["--all-scan-files", true],
        ["--run-agents", true],
        ["--item-id", "src-melee-gr-grsmoke"],
        ["--output-dir", outputDir],
      ]),
      runner,
      { enforcedChecks: false },
    );

    expect(resolvedItems).toEqual(["src-melee-gr-grsmoke"]);
    const byId = new Map(result.queue.items.map((item) => [item.id, item]));
    expect(byId.get("src-melee-gr-grsmoke")?.attempts).toHaveLength(1);
    expect(byId.get("src-melee-gm-gm-1832")?.attempts).toHaveLength(0);
  });

  test("queue scan requests uncommitted worktree collection", async () => {
    const { repoRoot, baseSha } = await cleanRepo();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    await writeFile(resolve(repoRoot, "src/melee/gr/grsmoke.c"), "int grSmoke(void) { register int bad = 1; return bad; }\n");

    await runQaRepair(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--run-id", "test-run"],
        ["--base-ref", baseSha],
        ["--candidate-files", "src/melee/gr/grsmoke.c"],
        ["--output-dir", outputDir],
      ]),
    );

    const preScan = JSON.parse(await readFile(resolve(outputDir, "pre_scan.json"), "utf8")) as Record<string, any>;
    expect(preScan.command).toContain("--include-worktree");
    expect(preScan.command).not.toContain("--gate");
  });

  test("live agents run score, build, and regression validation commands before marking clean", async () => {
    const { repoRoot, baseSha } = await cleanRepo();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const scanPath = await writeScanJson(repoRoot, [finding()]);
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => mockRunnerResult(fixedRepairJson("lower_score"), options.outputDir);

    const result = await runQaRepair(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--run-id", "test-run"],
        ["--base-ref", baseSha],
        ["--scan-json", scanPath],
        ["--all-scan-files", true],
        ["--run-agents", true],
        ["--score-check-command", 'printf \'{"preTargetScore":100,"postTargetScore":97}\'; exit 0'],
        ["--build-check-command", "printf build-ok; exit 0"],
        ["--regression-check-command", "printf regression-ok; exit 0"],
        ["--output-dir", outputDir],
      ]),
      runner,
      { enforcedChecks: false },
    );

    const item = result.queue.items[0];
    expect(item?.status).toBe("clean_lower_score");
    const attempt = item?.attempts[0];
    expect(attempt?.status).toBe("validated");
    expect(attempt?.scoreCheckPath && existsSync(attempt.scoreCheckPath)).toBe(true);
    expect(attempt?.buildCheckPath && existsSync(attempt.buildCheckPath)).toBe(true);
    expect(attempt?.regressionCheckPath && existsSync(attempt.regressionCheckPath)).toBe(true);
    expect(attempt?.validationPath && existsSync(attempt.validationPath)).toBe(true);
    const validation = JSON.parse(await readFile(String(attempt?.validationPath), "utf8")) as Record<string, any>;
    expect(validation.status).toBe("clean_lower_score");
    expect(validation.validationArtifacts.score_check).toBe(attempt?.scoreCheckPath);
    const shipStatus = JSON.parse(await readFile(result.artifacts.shipStatusPath, "utf8")) as Record<string, any>;
    expect(shipStatus.cleanLowerScoreFiles).toEqual(["src/melee/gr/grsmoke.c"]);
    expect(shipStatus.droppedFiles["src/melee/gr/grsmoke.c"][0]).toContain("lowered match score");
  });

  test("post-repair validation scans uncommitted live agent edits", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const scanPath = await writeScanJson(repoRoot, [finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]);
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(resolve(repoRoot, "src/melee/gr/grsmoke.c"), "int grSmoke(void) { int value = 1; return value; }\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await runQaRepair(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--run-id", "test-run"],
        ["--base-ref", baseSha],
        ["--scan-json", scanPath],
        ["--all-scan-files", true],
        ["--run-agents", true],
        ["--output-dir", outputDir],
      ]),
      runner,
      { enforcedChecks: false },
    );

    const item = result.queue.items[0];
    expect(item?.status).toBe("clean_same_match");
    const attempt = item?.attempts[0];
    expect(attempt?.status).toBe("validated");
    const postScan = JSON.parse(await readFile(String(attempt?.postScanPath), "utf8")) as Record<string, any>;
    const postScanResult = postScan.result ?? postScan;
    expect(postScanResult.counts.errors).toBe(0);
    expect(postScanResult.findings).toEqual([]);
  });

  test("enforced object build failure restores the source and leaves the item unresolved", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    const preContent = await readFile(sourcePath, "utf8");
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    let buildCalls = 0;
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, "int grSmoke(void) { int value = 1; return value; }\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await processQueueItem({
      globals: globals(repoRoot, stateDir),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: baseSha,
      validationCommands: {},
      runner,
      repairChecks: {
        captureUnitMatchSnapshot: async () => null,
        objdiffUnitPresence: async () => "present",
        waitForSnapshotRetry: async (delayMs) => expect(delayMs).toBe(10_000),
        buildObjectForSource: async () => {
          buildCalls += 1;
          return buildCalls === 1 ? { ok: false, log: "mock compile error" } : { ok: true, log: "restored object built" };
        },
      },
    });

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("needs_rework");
    expect(await readFile(sourcePath, "utf8")).toBe(preContent);
    expect(buildCalls).toBe(2);
    expect(attempt.status).toBe("validation_failed");
    expect(attempt.validation.build_check).toBe("failed");
    expect(attempt.validation.match_check).toBe("unavailable");
    expect(attempt.validation.check_result!.buildOk).toBe(false);
    expect(attempt.validation.check_result!.buildLog).toContain("mock compile error");
    expect(attempt.validation.reverted).toBe(true);
    expect(attempt.validation.restored_build).toEqual({ ok: true, log: "restored object built" });
  });

  test("unavailable pre-repair match snapshot retries, restores the source, and needs rework", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    const preContent = await readFile(sourcePath, "utf8");
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    let snapshotCalls = 0;
    let buildCalls = 0;
    const retryDelays: number[] = [];
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, "int grSmoke(void) { int value = 1; return value; }\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await processQueueItem({
      globals: globals(repoRoot, stateDir),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: baseSha,
      validationCommands: {},
      runner,
      repairChecks: {
        objdiffUnitPresence: async () => "present",
        captureUnitMatchSnapshot: async () => {
          snapshotCalls += 1;
          return null;
        },
        waitForSnapshotRetry: async (delayMs) => {
          retryDelays.push(delayMs);
        },
        buildObjectForSource: async () => {
          buildCalls += 1;
          return { ok: true, log: "object built" };
        },
      },
    });

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("needs_rework");
    expect(item.routing_reason).toContain("match verification unavailable");
    expect(await readFile(sourcePath, "utf8")).toBe(preContent);
    expect(snapshotCalls).toBe(2);
    expect(retryDelays).toEqual([10_000]);
    expect(buildCalls).toBe(2);
    expect(attempt.status).toBe("validation_failed");
    expect(attempt.validation.match_check).toBe("unavailable");
    expect(attempt.validation.check_result?.ok).toBe(false);
    expect(attempt.validation.reverted).toBe(true);
  });

  test("unavailable post-repair match snapshot retries, restores the source, and needs rework", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    const preContent = await readFile(sourcePath, "utf8");
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    let snapshotCalls = 0;
    const retryDelays: number[] = [];
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, "int grSmoke(void) { int value = 1; return value; }\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await processQueueItem({
      globals: globals(repoRoot, stateDir),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: baseSha,
      validationCommands: {},
      runner,
      repairChecks: {
        objdiffUnitPresence: async () => "present",
        captureUnitMatchSnapshot: async () => {
          snapshotCalls += 1;
          return snapshotCalls === 1 ? unitSnapshot(100) : null;
        },
        waitForSnapshotRetry: async (delayMs) => {
          retryDelays.push(delayMs);
        },
        buildObjectForSource: async () => ({ ok: true, log: "object built" }),
      },
    });

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("needs_rework");
    expect(item.routing_reason).toContain("match verification unavailable");
    expect(await readFile(sourcePath, "utf8")).toBe(preContent);
    expect(snapshotCalls).toBe(3);
    expect(retryDelays).toEqual([10_000]);
    expect(attempt.validation.match_check).toBe("unavailable");
    expect(attempt.validation.reverted).toBe(true);
  });

  test("source without an objdiff unit proceeds with an explicit match-check note", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    await writeFile(resolve(repoRoot, "objdiff.json"), '{"units":[]}\n');
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, "int grSmoke(void) { int value = 1; return value; }\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await processQueueItem({
      globals: globals(repoRoot, stateDir),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: baseSha,
      validationCommands: {},
      runner,
      repairChecks: {
        captureUnitMatchSnapshot: async () => {
          throw new Error("snapshot capture must not run without an objdiff unit");
        },
        buildObjectForSource: async () => ({ ok: true, log: "object built" }),
      },
    });

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("clean_same_match");
    expect(await readFile(sourcePath, "utf8")).toBe("int grSmoke(void) { int value = 1; return value; }\n");
    expect(attempt.status).toBe("validated");
    expect(attempt.validation.match_check).toBe("skipped");
    expect(attempt.validation.match_note).toBe("objdiff unit absent; match verification skipped");
    expect(attempt.validation.reverted).toBe(false);
  });

  test("exact-function regression restores the source even when the object builds", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    const preContent = await readFile(sourcePath, "utf8");
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    let snapshots = 0;
    let buildCalls = 0;
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, "int grSmoke(void) { int value = 1; return value; }\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await processQueueItem({
      globals: globals(repoRoot, stateDir),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: baseSha,
      validationCommands: {},
      runner,
      repairChecks: {
        captureUnitMatchSnapshot: async () => (snapshots++ === 0 ? unitSnapshot(100) : unitSnapshot(98.5)),
        objdiffUnitPresence: async () => "present",
        buildObjectForSource: async () => {
          buildCalls += 1;
          return { ok: true, log: "object built" };
        },
      },
    });

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("needs_rework");
    expect(await readFile(sourcePath, "utf8")).toBe(preContent);
    expect(buildCalls).toBe(2);
    expect(attempt.validation.build_check).toBe("passed");
    expect(attempt.validation.match_check).toBe("failed");
    expect(attempt.validation.check_result!.exactRegressions).toEqual([{ name: "grSmoke", before: 100, after: 98.5 }]);
    expect(attempt.validation.reverted).toBe(true);
    expect(attempt.validation.restored_build!.ok).toBe(true);
  });

  test("reverts header edits but keeps an independently valid target repair", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    const headerPath = resolve(repoRoot, "src/melee/gr/grsmoke.h");
    const unrelatedHeaderPath = resolve(repoRoot, "src/melee/gr/unrelated.h");
    await writeFile(headerPath, "int grSmoke(void);\n");
    await writeFile(unrelatedHeaderPath, "#define UNRELATED 1\n");
    await git(repoRoot, ["add", "src/melee/gr/grsmoke.h", "src/melee/gr/unrelated.h"]);
    await git(repoRoot, ["commit", "-q", "-m", "add smoke headers"]);
    await writeFile(unrelatedHeaderPath, "#define UNRELATED 2\n");
    const repairedContent = "int grSmoke(void) { int value = 1; return value; }\n";
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    let buildCalls = 0;
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, repairedContent);
      await writeFile(headerPath, "int grSmoke(int changed);\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await processQueueItem({
      globals: globals(repoRoot, stateDir),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: baseSha,
      validationCommands: {},
      runner,
      repairChecks: {
        captureUnitMatchSnapshot: async () => null,
        objdiffUnitPresence: async () => "absent",
        buildObjectForSource: async () => {
          buildCalls += 1;
          expect(await readFile(sourcePath, "utf8")).toBe(repairedContent);
          expect(await readFile(headerPath, "utf8")).toBe("int grSmoke(void);\n");
          return { ok: true, log: "repaired object built" };
        },
      },
    });

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("clean_same_match");
    expect(item.routing_reason).toContain("unauthorized header edit(s) reverted: src/melee/gr/grsmoke.h");
    expect(item.routing_reason).toContain("target repair validated independently");
    expect(item.required_cross_file_paths).toBeUndefined();
    expect(await readFile(sourcePath, "utf8")).toBe(repairedContent);
    expect(await readFile(headerPath, "utf8")).toBe("int grSmoke(void);\n");
    expect(await readFile(unrelatedHeaderPath, "utf8")).toBe("#define UNRELATED 2\n");
    expect(buildCalls).toBe(1);
    expect(attempt.header_edit_reverted).toBe(true);
    expect(attempt.header_edit_paths).toEqual(["src/melee/gr/grsmoke.h"]);
    expect(attempt.validation.reverted).toBe(false);
    expect(attempt.validation.restored_build).toBeUndefined();
    const validation = JSON.parse(await readFile(String(attempt.validationPath), "utf8")) as Record<string, any>;
    expect(validation.status).toBe("clean_same_match");
    expect(validation.reasons).toContain(
      "unauthorized header edit(s) reverted: src/melee/gr/grsmoke.h; target repair validated independently",
    );
    expect(validation.required_cross_file_paths).toBeUndefined();
  });

  test("restores target and reports blocked_needs_cross_file when repair fails after header revert", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    const headerPath = resolve(repoRoot, "src/melee/gr/grsmoke.h");
    await writeFile(headerPath, "int grSmoke(void);\n");
    await git(repoRoot, ["add", "src/melee/gr/grsmoke.h"]);
    await git(repoRoot, ["commit", "-q", "-m", "add smoke header"]);
    const preContent = await readFile(sourcePath, "utf8");
    const repairedContent = "int grSmoke(void) { int value = 1; return value; }\n";
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    const builtStates: Array<{ source: string; header: string }> = [];
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, repairedContent);
      await writeFile(headerPath, "int grSmoke(int changed);\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await processQueueItem({
      globals: globals(repoRoot, stateDir),
      runId: "manual",
      queue,
      item: queue.items[0]!,
      outputDir,
      baseRef: baseSha,
      validationCommands: {
        regression: "grep -q 'int value = 1' {source_path}",
      },
      runner,
      repairChecks: {
        captureUnitMatchSnapshot: async () => null,
        objdiffUnitPresence: async () => "absent",
        buildObjectForSource: async () => {
          const state = {
            source: await readFile(sourcePath, "utf8"),
            header: await readFile(headerPath, "utf8"),
          };
          builtStates.push(state);
          return builtStates.length === 1
            ? { ok: false, log: "repair requires header" }
            : { ok: state.source === preContent, log: "restored object built" };
        },
      },
    });

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("blocked_needs_cross_file");
    expect(item.required_cross_file_paths).toEqual(["src/melee/gr/grsmoke.h"]);
    expect(item.routing_reason).toContain("the correct fix requires widening the write set");
    expect(await readFile(sourcePath, "utf8")).toBe(preContent);
    expect(await readFile(headerPath, "utf8")).toBe("int grSmoke(void);\n");
    expect(builtStates).toEqual([
      { source: repairedContent, header: "int grSmoke(void);\n" },
      { source: preContent, header: "int grSmoke(void);\n" },
    ]);
    expect(attempt.status).toBe("validation_failed");
    expect(attempt.validation.reverted).toBe(true);
    expect(attempt.validation.restored_build).toEqual({ ok: true, log: "restored object built" });
    const commandSummary = JSON.parse(await readFile(String(attempt.regressionCheckPath), "utf8")) as Record<string, any>;
    expect(commandSummary.status).toBe("passed");
    const validation = JSON.parse(await readFile(String(attempt.validationPath), "utf8")) as Record<string, any>;
    expect(validation.status).toBe("blocked_needs_cross_file");
    expect(validation.required_cross_file_paths).toEqual(["src/melee/gr/grsmoke.h"]);
    expect(validation.reasons[0]).toContain("repair validated only with unauthorized cross-file edit(s): src/melee/gr/grsmoke.h");
    expect(validation.remainingFindings).toEqual(item.findings);
    expect(validation.enforced_checks.restored_build).toEqual({ ok: true, log: "restored object built" });
  });

  test("header revert failure still restores target and needs rework", async () => {
    const { repoRoot, baseSha } = await repoWithCommittedQaViolation();
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const sourcePath = resolve(repoRoot, "src/melee/gr/grsmoke.c");
    const headerPath = resolve(repoRoot, "src/melee/gr/grsmoke.h");
    await writeFile(headerPath, "int grSmoke(void);\n");
    await git(repoRoot, ["add", "src/melee/gr/grsmoke.h"]);
    await git(repoRoot, ["commit", "-q", "-m", "add smoke header"]);
    const preContent = await readFile(sourcePath, "utf8");
    const indexLockPath = resolve(repoRoot, ".git/index.lock");
    const queue = buildQaRepairQueue({
      runId: "manual",
      repoRoot,
      baseRef: baseSha,
      scanResult: scanResult([finding({ rule_id: "register_keyword", excerpt: "register int bad = 1;" })]),
      includeAllScanFilesWhenNoCandidates: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    const runner = async (options: MeleeKernelPiRunOptions): Promise<PiRunResult> => {
      await writeFile(sourcePath, "int grSmoke(void) { int value = 1; return value; }\n");
      await writeFile(headerPath, "int grSmoke(int changed);\n");
      await writeFile(indexLockPath, "force checkout failure\n");
      return mockRunnerResult(fixedRepairJson(), options.outputDir);
    };

    const result = await (async () => {
      try {
        return await processQueueItem({
          globals: globals(repoRoot, stateDir),
          runId: "manual",
          queue,
          item: queue.items[0]!,
          outputDir,
          baseRef: baseSha,
          validationCommands: {},
          runner,
          repairChecks: {
            captureUnitMatchSnapshot: async () => null,
            objdiffUnitPresence: async () => "absent",
            buildObjectForSource: async () => ({ ok: true, log: "restored object built" }),
          },
        });
      } finally {
        rmSync(indexLockPath, { force: true });
      }
    })();

    const item = result.items[0]!;
    const attempt = item.attempts[0] as QaRepairAttemptWithEnforcedChecks;
    expect(item.status).toBe("needs_rework");
    expect(item.required_cross_file_paths).toBeUndefined();
    expect(item.routing_reason).toContain("failed to restore header files: src/melee/gr/grsmoke.h");
    expect(await readFile(sourcePath, "utf8")).toBe(preContent);
    expect(attempt.header_edit_reverted).toBe(false);
    expect(attempt.header_edit_paths).toEqual(["src/melee/gr/grsmoke.h"]);
    expect(attempt.header_revert_failures).toEqual(["src/melee/gr/grsmoke.h"]);
    expect(attempt.validation.reverted).toBe(true);
  });
});
