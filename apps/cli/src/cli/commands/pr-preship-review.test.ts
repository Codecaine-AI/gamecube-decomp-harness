import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PiRunOptions } from "@decomp-orchestrator/agents/runtime";
import type { PiRunResult } from "@decomp-orchestrator/core/types";
import {
  aggregatePreshipOutcomes,
  parsePreshipPlan,
  runPreshipReview,
  type PreshipSliceOutcome,
} from "./pr-preship-review.js";

const orchestratorRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
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
  const head = await readFile(resolve(repoRoot, ".git/refs/heads/main"), "utf8");
  return head.trim();
}

/** Tiny synthetic repo: base commit with a clean file, head commit adding the extern-literal dodge. */
async function syntheticRepo(): Promise<{ repoRoot: string; baseSha: string; headSha: string }> {
  const repoRoot = tempDir("preship-repo-");
  await git(repoRoot, ["init", "-q", "-b", "main"]);
  await git(repoRoot, ["config", "user.email", "test@example.com"]);
  await git(repoRoot, ["config", "user.name", "Preship Test"]);
  await mkdir(resolve(repoRoot, "src/melee/gm"), { recursive: true });
  await writeFile(resolve(repoRoot, "src/melee/gm/gm_1832.c"), "int gm_existing(void) { return 0; }\n");
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-q", "-m", "base"]);
  const baseSha = await currentHead(repoRoot);
  await writeFile(
    resolve(repoRoot, "src/melee/gm/gm_1832.c"),
    ["extern const f32 lbl_804DA60C;", "", "int gm_existing(void) { return 0; }", "float gm_new(void) { return lbl_804DA60C; }", ""].join("\n"),
  );
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-q", "-m", "head"]);
  const headSha = await currentHead(repoRoot);
  return { repoRoot, baseSha, headSha };
}

function rejectReviewJson(sliceId: string): string {
  return JSON.stringify({
    schema_version: "melee_pr_preship_review_v1",
    slice_id: sliceId,
    slice_verdict: "reject",
    findings: [
      {
        file: "src/melee/gm/gm_1832.c",
        line: 1,
        standard_id: "global_standard:literals-and-data-ownership",
        verdict: "reject",
        rationale: "extern const f32 lbl_804DA60C; is an extern-for-literal data-ordering dodge.",
        suggested_fix: "Remove the extern and define the constant in binary order.",
      },
    ],
    summary: "Slice carries a known maintainer-rejected pattern.",
    confidence: 0.95,
  });
}

function mockRunnerResult(rawText: string, outputDir: string): PiRunResult {
  return {
    sessionId: "mock-session",
    outputPath: resolve(outputDir, "mock-output.txt"),
    systemPromptPath: resolve(outputDir, "mock.system.md"),
    userPromptPath: resolve(outputDir, "mock.user.md"),
    rawText,
    dryRun: false,
  };
}

describe("aggregatePreshipOutcomes", () => {
  const approve: PreshipSliceOutcome = { id: "ok", verdict: "approve", rejectFindings: 0, warnFindings: 1, reviewPath: "/tmp/r.json" };

  test("all approvals exit 0 with allApproved", () => {
    const { aggregate, exitCode } = aggregatePreshipOutcomes("manual", [approve], false);
    expect(exitCode).toBe(0);
    expect(aggregate.allApproved).toBe(true);
  });

  test("a slice reject exits 1", () => {
    const reject: PreshipSliceOutcome = { id: "bad", verdict: "reject", rejectFindings: 1, warnFindings: 0, reviewPath: "/tmp/r.json" };
    const { aggregate, exitCode } = aggregatePreshipOutcomes("manual", [approve, reject], false);
    expect(exitCode).toBe(1);
    expect(aggregate.allApproved).toBe(false);
  });

  test("a reject finding blocks even when the slice verdict is approve", () => {
    const sneaky: PreshipSliceOutcome = { id: "sneaky", verdict: "approve", rejectFindings: 1, warnFindings: 0, reviewPath: "/tmp/r.json" };
    const { exitCode } = aggregatePreshipOutcomes("manual", [sneaky], false);
    expect(exitCode).toBe(1);
  });

  test("infrastructure errors fail closed", () => {
    const error: PreshipSliceOutcome = { id: "broken", verdict: "error", rejectFindings: 0, warnFindings: 0, reviewPath: null, error: "agent failed" };
    const { exitCode } = aggregatePreshipOutcomes("manual", [error], false);
    expect(exitCode).toBe(1);
  });

  test("skipped local slices do not affect the verdict", () => {
    const skipped: PreshipSliceOutcome = { id: "local-gm", verdict: "skipped_local", rejectFindings: 0, warnFindings: 0, reviewPath: null };
    const { aggregate, exitCode } = aggregatePreshipOutcomes("manual", [approve, skipped], false);
    expect(exitCode).toBe(0);
    expect(aggregate.allApproved).toBe(true);
  });

  test("dry runs exit 0 without claiming approval", () => {
    const dry: PreshipSliceOutcome = { id: "gm", verdict: "dry_run", rejectFindings: 0, warnFindings: 0, reviewPath: null };
    const { aggregate, exitCode } = aggregatePreshipOutcomes("manual", [dry], true);
    expect(exitCode).toBe(0);
    expect(aggregate.allApproved).toBe(false);
    expect(aggregate.dryRun).toBe(true);
  });
});

describe("parsePreshipPlan", () => {
  test("rejects plans without slices or refs", () => {
    expect(() => parsePreshipPlan({}, "plan.json")).toThrow("repoRoot");
    expect(() => parsePreshipPlan({ repoRoot: "/r", baseRef: "a", headRef: "b", slices: [] }, "plan.json")).toThrow("no slices");
    expect(() => parsePreshipPlan({ repoRoot: "/r", baseRef: "a", headRef: "b", slices: [{ id: "gm" }] }, "plan.json")).toThrow("pathspecs");
  });

  test("falls back to file paths when pathspecs are absent", () => {
    const plan = parsePreshipPlan(
      { repoRoot: "/r", baseRef: "a", headRef: "b", slices: [{ id: "gm", lane: "match", files: [{ path: "src/melee/gm/gm_1832.c" }] }] },
      "plan.json",
    );
    expect(plan.slices[0]?.pathspecs).toEqual(["src/melee/gm/gm_1832.c"]);
  });
});

describe("runPreshipReview (canned diff, mocked agent)", () => {
  test("a mocked reject marks the slice rejected and returns exit 1", async () => {
    const { repoRoot, baseSha, headSha } = await syntheticRepo();
    const stateDir = tempDir("preship-state-");
    const seenPrompts: string[] = [];
    const runner = async (options: PiRunOptions): Promise<PiRunResult> => {
      seenPrompts.push(options.prompt.userPrompt);
      return mockRunnerResult(rejectReviewJson("gm"), options.outputDir);
    };
    const { aggregate, exitCode } = await runPreshipReview(
      {
        plan: { repoRoot, baseRef: baseSha, headRef: headSha, slices: [{ id: "gm", lane: "match", pathspecs: ["src/melee/gm/gm_1832.c"] }] },
        selection: { kind: "all" },
        baseRef: baseSha,
        headRef: headSha,
        runId: "test-run",
        stateDir,
        // Point at an empty root so scan_diff.py is "missing": the lint-unavailable
        // path must degrade to a prompt note, not block the review.
        orchestratorRoot: tempDir("preship-no-tools-"),
        dryRun: false,
        provider: "codex-lb",
        model: "gpt-5.5",
        thinkingLevel: "medium",
      },
      runner,
    );

    expect(exitCode).toBe(1);
    expect(aggregate.allApproved).toBe(false);
    expect(aggregate.slices).toHaveLength(1);
    expect(aggregate.slices[0]?.verdict).toBe("reject");
    expect(aggregate.slices[0]?.rejectFindings).toBe(1);

    // The agent saw the actual slice diff and the lint-unavailable note.
    expect(seenPrompts[0]).toContain("extern const f32 lbl_804DA60C;");
    expect(seenPrompts[0]).toContain('"lint_available": false');

    const reviewDir = resolve(stateDir, "preship_reviews", "test-run", "gm");
    expect(existsSync(resolve(reviewDir, "slice.diff"))).toBe(true);
    expect(existsSync(resolve(reviewDir, "prompt_system.md"))).toBe(true);
    expect(existsSync(resolve(reviewDir, "prompt_user.md"))).toBe(true);
    expect(existsSync(resolve(reviewDir, "review.md"))).toBe(true);
    const reviewJson = JSON.parse(await readFile(resolve(reviewDir, "review.json"), "utf8")) as Record<string, any>;
    expect(reviewJson.review.slice_verdict).toBe("reject");
  });

  test("invalid agent output fails closed as an error outcome", async () => {
    const { repoRoot, baseSha, headSha } = await syntheticRepo();
    const stateDir = tempDir("preship-state-");
    const runner = async (options: PiRunOptions): Promise<PiRunResult> =>
      mockRunnerResult('{"schema_version":"melee_pr_preship_review_v1","slice_verdict":"maybe"}', options.outputDir);
    const { aggregate, exitCode } = await runPreshipReview(
      {
        plan: { repoRoot, baseRef: baseSha, headRef: headSha, slices: [{ id: "gm", lane: "match", pathspecs: ["src/melee/gm/gm_1832.c"] }] },
        selection: { kind: "all" },
        baseRef: baseSha,
        headRef: headSha,
        runId: "test-run",
        stateDir,
        orchestratorRoot: tempDir("preship-no-tools-"),
        dryRun: false,
        provider: "codex-lb",
        model: "gpt-5.5",
        thinkingLevel: "medium",
      },
      runner,
    );
    expect(exitCode).toBe(1);
    expect(aggregate.slices[0]?.verdict).toBe("error");
    expect(aggregate.slices[0]?.error).toContain("schema validation");
  });

  test("local-lane slices are skipped under --all and unknown --slice ids throw", async () => {
    const { repoRoot, baseSha, headSha } = await syntheticRepo();
    const stateDir = tempDir("preship-state-");
    let agentCalls = 0;
    const runner = async (options: PiRunOptions): Promise<PiRunResult> => {
      agentCalls += 1;
      return mockRunnerResult(rejectReviewJson("gm"), options.outputDir);
    };
    const baseOptions = {
      plan: {
        repoRoot,
        baseRef: baseSha,
        headRef: headSha,
        slices: [{ id: "local-gm", lane: "local", pathspecs: ["src/melee/gm/gm_1832.c"] }],
      },
      baseRef: baseSha,
      headRef: headSha,
      runId: "test-run",
      stateDir,
      orchestratorRoot: tempDir("preship-no-tools-"),
      dryRun: false,
      provider: "codex-lb",
      model: "gpt-5.5",
      thinkingLevel: "medium",
    };
    const { aggregate, exitCode } = await runPreshipReview({ ...baseOptions, selection: { kind: "all" } }, runner);
    expect(agentCalls).toBe(0);
    expect(exitCode).toBe(0);
    expect(aggregate.slices[0]?.verdict).toBe("skipped_local");
    await expect(runPreshipReview({ ...baseOptions, selection: { kind: "slice", id: "nope" } }, runner)).rejects.toThrow("not in the plan");
  });
});

describe("pr-preship-review CLI --dry-run integration", () => {
  test("writes prompt artifacts for a synthetic plan and exits 0", async () => {
    const { repoRoot, baseSha, headSha } = await syntheticRepo();
    const stateDir = tempDir("preship-cli-state-");
    const planPath = resolve(tempDir("preship-cli-plan-"), "plan.json");
    await writeFile(
      planPath,
      JSON.stringify({
        repoRoot,
        baseRef: baseSha,
        headRef: headSha,
        slices: [{ id: "gm", lane: "match", pathspecs: ["src/melee/gm/gm_1832.c"] }],
      }),
    );

    const result = await run(orchestratorRoot, [
      "bun",
      resolve(orchestratorRoot, "apps/cli/src/bin/decomp-orchestrator.ts"),
      "--repo-root",
      repoRoot,
      "--state-dir",
      stateDir,
      "pr-preship-review",
      "--plan",
      planPath,
      "--all",
      "--dry-run",
    ]);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    if (result.stdout.trim()) {
      const aggregate = JSON.parse(result.stdout) as Record<string, any>;
      expect(aggregate.dryRun).toBe(true);
      expect(aggregate.runId).toBe("manual");
      expect(aggregate.slices[0]?.verdict).toBe("dry_run");
    }

    const reviewDir = resolve(stateDir, "preship_reviews", "manual", "gm");
    expect(existsSync(resolve(reviewDir, "slice.diff"))).toBe(true);
    expect(existsSync(resolve(reviewDir, "prompt_system.md"))).toBe(true);
    const userPrompt = await readFile(resolve(reviewDir, "prompt_user.md"), "utf8");
    expect(userPrompt).toContain("extern const f32 lbl_804DA60C;");
    expect(userPrompt).toContain("<maintainer_rejection_exhibits");
  }, 60_000);
});
