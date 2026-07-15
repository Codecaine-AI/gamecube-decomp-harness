import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { createPrWorktreeService, type CliResult } from "@server/core/session-runtime/phases/pr/pr-worktrees.js";
import type { RegressionReport } from "@server/core/validation/objdiff/report.js";
import { verifyShipSet } from "./verify-ship-set.js";

const cleanupPaths: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(path);
  return path;
}

function cleanReport(): RegressionReport {
  return {
    regressions: [],
    progressions: [],
    newMatches: [
      {
        unitName: "GALE01/src/melee/test",
        itemName: "test_match",
        sourcePath: "src/melee/test.c",
        size: 16,
        fromPercent: 0,
        toPercent: 100,
        bytesDelta: 16,
      },
    ],
    brokenMatches: [],
    improvements: [],
    fuzzyRegressions: [],
    renames: [],
    summary: {
      matchedCodePercentFrom: 0,
      matchedCodePercentTo: 1,
      matchedCodePercentDelta: 1,
      matchedCodeBytesFrom: 0,
      matchedCodeBytesTo: 16,
      matchedCodeBytesDelta: 16,
      matchedDataPercentFrom: 0,
      matchedDataPercentTo: 0,
      matchedDataPercentDelta: 0,
      matchedDataBytesFrom: 0,
      matchedDataBytesTo: 0,
      matchedDataBytesDelta: 0,
    },
    promotion: {
      status: "pr_ready",
      label: "PR ready",
      reasons: [],
      blockers: [],
      evidence: {
        newMatches: 1,
        matchedCodeBytesDelta: 16,
        matchedDataBytesDelta: 0,
        unmatchedImprovementBytes: 0,
        significantUnmatchedImprovements: 0,
        brokenMatches: 0,
        fuzzyRegressions: 0,
        metricRegressions: 0,
      },
      policy: {
        minNewMatches: 1,
        minMatchedCodeBytesDelta: 1,
        minMatchedDataBytesDelta: 1,
        minUnmatchedImprovementBytes: 0,
      },
    },
    markdown: "",
  };
}

function fixture(): {
  args: Map<string, string | true>;
  baseSha: string;
  globals: GlobalArgs;
  sourceSha: string;
  worktreeDir: string;
} {
  const root = tempDir("verify-ship-set-test-");
  const repoRoot = resolve(root, "repo");
  const stateDir = resolve(root, "state");
  const runId = "run-1";
  const baseSha = `base-${randomUUID()}`;
  const sourceSha = `source-${randomUUID()}`;
  const worktreeDir = resolve(tmpdir(), `melee-baseline-${baseSha}`);
  cleanupPaths.push(worktreeDir);
  mkdirSync(resolve(worktreeDir, "build/GALE01"), { recursive: true });
  writeFileSync(resolve(worktreeDir, "build/GALE01/baseline.json"), "{}\n");
  mkdirSync(repoRoot, { recursive: true });
  const planDir = resolve(stateDir, "pr_handoff", runId, "split_plans", "20260715T120000Z");
  mkdirSync(planDir, { recursive: true });
  writeFileSync(
    resolve(planDir, "summary.json"),
    JSON.stringify({
      status: "passed",
      slices: [
        { lane: "match", pathspecs: ["src/melee/test.c"] },
        { lane: "local", pathspecs: ["src/melee/local.c"] },
      ],
    }),
  );
  return {
    args: new Map([
      ["--run-id", runId],
      ["--base-ref", "origin/master"],
      ["--source-ref", "HEAD"],
    ]),
    baseSha,
    globals: {
      repoRoot,
      stateDir,
      dryRunAgents: false,
      provider: "test",
      model: "test",
      thinkingLevel: "low",
    },
    sourceSha,
    worktreeDir,
  };
}

function successResult(stdout = ""): CliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

afterEach(() => {
  for (const path of cleanupPaths.reverse()) rmSync(path, { force: true, recursive: true });
  cleanupPaths.length = 0;
});

describe("verifyShipSet", () => {
  test("publishes both stamps with one base SHA only after the real ship-set checks pass", async () => {
    const { args, baseSha, globals, sourceSha } = fixture();
    const commands: string[][] = [];
    const originalLog = console.log;
    console.log = () => {};
    try {
      await verifyShipSet(globals, args, {
        codeIssuesChecker: async () => ({ status: "clean", output: "", files: [] }),
        readRegressionReport: async () => cleanReport(),
        runCli: async (command) => {
          commands.push(command);
          if (command[0] === "git" && command[1] === "rev-parse") {
            return successResult(command.at(-1)?.startsWith("origin/master") ? `${baseSha}\n` : `${sourceSha}\n`);
          }
          if (command[0] === "git" && command[1] === "diff") return successResult("binary patch\n");
          return successResult();
        },
        trace: () => {},
      });
    } finally {
      console.log = originalLog;
    }

    const baselinePath = resolve(globals.stateDir, "pr_handoff/baseline_status.json");
    const shipPath = resolve(globals.stateDir, "pr_handoff/ship_status.json");
    const patchPath = resolve(globals.stateDir, "pr_handoff/ship_set.patch");
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<string, unknown>;
    const ship = JSON.parse(readFileSync(shipPath, "utf8")) as Record<string, unknown>;
    expect(baseline.baseSha).toBe(baseSha);
    expect(ship.baseSha).toBe(baseSha);
    expect(ship.sourceSha).toBe(sourceSha);
    expect(ship.patchPath).toBe(patchPath);
    expect(readFileSync(patchPath, "utf8")).toBe("binary patch\n");
    expect(commands).toContainEqual(["git", "fetch", "--prune", "origin"]);
    expect(commands).toContainEqual(["git", "diff", "--binary", baseSha, sourceSha, "--", "src/melee/test.c"]);
    expect(commands).toContainEqual(["ninja", "changes_all"]);
  });

  test("leaves all live handoff artifacts absent when verification fails", async () => {
    const { args, baseSha, globals, sourceSha } = fixture();
    await expect(
      verifyShipSet(globals, args, {
        codeIssuesChecker: async () => ({ status: "clean", output: "", files: [] }),
        readRegressionReport: async () => cleanReport(),
        runCli: async (command) => {
          if (command[0] === "git" && command[1] === "rev-parse") {
            return successResult(command.at(-1)?.startsWith("origin/master") ? `${baseSha}\n` : `${sourceSha}\n`);
          }
          if (command[0] === "git" && command[1] === "diff") return successResult("binary patch\n");
          if (command[0] === "ninja" && command[1] === "changes_all") return { exitCode: 2, stdout: "", stderr: "compile failed" };
          return successResult();
        },
        trace: () => {},
      }),
    ).rejects.toThrow("Ship-set build failed (2)");

    expect(existsSync(resolve(globals.stateDir, "pr_handoff/baseline_status.json"))).toBe(false);
    expect(existsSync(resolve(globals.stateDir, "pr_handoff/ship_status.json"))).toBe(false);
    expect(existsSync(resolve(globals.stateDir, "pr_handoff/ship_set.patch"))).toBe(false);
  });

  test("keeps the prepare-handoff verifier's original working-tree diff command when no source ref is supplied", async () => {
    const root = tempDir("verify-ship-set-legacy-");
    const repoRoot = resolve(root, "repo");
    const stateDir = resolve(root, "state");
    const worktreeDir = resolve(root, "baseline-worktree");
    mkdirSync(worktreeDir, { recursive: true });
    const commands: string[][] = [];
    const service = createPrWorktreeService({
      appendLog: () => {},
      branchExists: () => false,
      codeIssuesChecker: async () => ({ status: "clean" as const, output: "", files: [] }),
      isLocalBranchPrRecord: () => false,
      localBranchDiffBase: () => "",
      outputTail: (value: string) => value,
      prBranchPathSlug: (value: string) => value,
      prWorkspacePath: () => "",
      readRegressionReport: async () => cleanReport(),
      runCli: async (command: string[]) => {
        commands.push(command);
        return successResult(command[1] === "diff" ? "patch\n" : "");
      },
      runGit: async () => successResult(),
      updatePrRecord: () => null,
    });

    const ship = await service.verifyShipSet(
      { project: null, repoRoot, stateDir },
      { baseSha: "base-sha", worktreeDir },
      ["src/melee/test.c"],
    );

    expect(ship.status).toBe("pr_ready");
    expect(commands).toContainEqual(["git", "diff", "--binary", "base-sha", "--", "src/melee/test.c"]);
  });
});
