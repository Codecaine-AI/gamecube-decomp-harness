import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { PiRunOptions } from "@decomp-orchestrator/agents/runtime";
import type { QaScanFinding, QaScanResult } from "@decomp-orchestrator/core/qa";
import type { PiRunResult } from "@decomp-orchestrator/core/types";
import type { GlobalArgs } from "../args.js";
import { runQaRepair } from "./qa-repair.js";

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
    remaining_findings: [],
    risks: [],
  });
}

async function mockRunnerResult(rawText: string, outputDir: string): Promise<PiRunResult> {
  const outputPath = resolve(outputDir, "mock-output.txt");
  const systemPromptPath = resolve(outputDir, "mock.system.md");
  const userPromptPath = resolve(outputDir, "mock.user.md");
  await writeFile(outputPath, rawText);
  await writeFile(systemPromptPath, "mock system prompt");
  await writeFile(userPromptPath, "mock user prompt");
  return {
    sessionId: "mock-session",
    outputPath,
    systemPromptPath,
    userPromptPath,
    rawText,
    dryRun: false,
  };
}

describe("qa-repair CLI command", () => {
  test("writes queue, summary, report, and ship status from saved scan JSON", async () => {
    const root = tempDir("qa-repair-repo-");
    const stateDir = tempDir("qa-repair-state-");
    const outputDir = tempDir("qa-repair-output-");
    const scanPath = await writeScanJson(root, [
      finding(),
      finding({ file: "src/melee/gm/gm_1832.c", rule_id: "new_data_anchor", line: 99 }),
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
    const runner = async (options: PiRunOptions): Promise<PiRunResult> => mockRunnerResult(fixedRepairJson("lower_score"), options.outputDir);

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
    const runner = async (options: PiRunOptions): Promise<PiRunResult> => {
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
});
