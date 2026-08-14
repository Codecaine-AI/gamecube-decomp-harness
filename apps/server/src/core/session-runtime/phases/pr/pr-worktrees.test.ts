import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  createPrWorktreeService,
  type CliResult,
  type PrWorktreeProjectContext,
  type PrWorktreeServiceDeps,
} from "@server/core/session-runtime/phases/pr/pr-worktrees.js";
import type { RegressionReport } from "@server/core/validation/objdiff/report.js";

const cleanupPaths: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(path);
  return path;
}

function successResult(stdout = ""): CliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function cleanReport(): RegressionReport {
  return {
    regressions: [],
    brokenMatches: [],
    fuzzyRegressions: [],
    newMatches: [],
    summary: { matchedCodeBytesDelta: 0 },
  } as unknown as RegressionReport;
}

function issuesOutput(messages: string[]): string {
  return [
    `Issues: ${messages.length}`,
    `  src/melee/gm/gmtest.c (${messages.length})`,
    ...messages.map((message, index) => `    ${index + 1}:1: ${message}`),
  ].join("\n");
}

function createService(overrides: Partial<PrWorktreeServiceDeps<PrWorktreeProjectContext>> = {}) {
  const deps: PrWorktreeServiceDeps<PrWorktreeProjectContext> = {
    appendLog: () => {},
    branchExists: () => true,
    codeIssuesChecker: async () => ({ status: "clean", output: "", files: [] }),
    isLocalBranchPrRecord: () => true,
    localBranchDiffBase: () => "base-sha",
    outputTail: (value) => value,
    prBranchPathSlug: (branch) => branch.replaceAll("/", "-"),
    prWorkspacePath: (stateDir, _runId, branch) => join(stateDir, branch.replaceAll("/", "-")),
    readRegressionReport: async () => cleanReport(),
    runCli: async () => successResult(),
    runGit: async () => successResult(),
    updatePrRecord: () => null,
    ...overrides,
  };
  return createPrWorktreeService(deps);
}

async function git(repoRoot: string, args: string[]): Promise<CliResult> {
  const process = Bun.spawn(["git", ...args], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

afterEach(() => {
  for (const path of cleanupPaths.reverse()) rmSync(path, { force: true, recursive: true });
  cleanupPaths.length = 0;
});

describe("production baseline tracing", () => {
  test("carries one owning-workflow linkage unchanged into started and completed events", async () => {
    const repoRoot = tempDir("pr-baseline-repo-");
    const stateDir = tempDir("pr-baseline-state-");
    const baseSha = `base-${basename(stateDir)}`;
    const worktreeDir = resolve(tmpdir(), `melee-baseline-${baseSha}`);
    cleanupPaths.push(worktreeDir);
    mkdirSync(resolve(worktreeDir, "build/GALE01"), { recursive: true });
    writeFileSync(resolve(worktreeDir, "build/GALE01/baseline.json"), "{}", "utf8");
    const events: unknown[] = [];
    const service = createService({
      runGit: async () => successResult(`${baseSha}\n`),
      submitWorkflowEvent: async (_paths, input) => {
        events.push(input);
        return null;
      },
    });
    const productionLinkage = {
      workflowId: "pr-handoff:run-1",
      correlationId: "pr-handoff:run-1",
      projectEventId: "project-event-acquired",
      causedByEventId: "project-event-requested",
    };

    await service.rebuildProductionBaseline(
      { project: { baseRef: "origin/main" }, repoRoot, stateDir },
      undefined,
      productionLinkage,
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      operation: "rebuildProductionBaseline",
      status: "started",
      correlationId: productionLinkage.correlationId,
      projectEventId: productionLinkage.projectEventId,
      causedByEventId: productionLinkage.causedByEventId,
    });
    expect(events[1]).toMatchObject({
      operation: "rebuildProductionBaseline",
      status: "completed",
      correlationId: productionLinkage.correlationId,
      projectEventId: productionLinkage.projectEventId,
      causedByEventId: productionLinkage.causedByEventId,
    });
  });

  test("rejects absent or mismatched owning-workflow linkage before baseline side effects", async () => {
    const sideEffects: string[] = [];
    const paths = {
      project: { baseRef: "origin/main" },
      repoRoot: tempDir("pr-baseline-reject-repo-"),
      stateDir: tempDir("pr-baseline-reject-state-"),
    };
    const service = createService({
      appendLog: () => sideEffects.push("log"),
      runCli: async () => {
        sideEffects.push("cli");
        return successResult();
      },
      runGit: async () => {
        sideEffects.push("git");
        return successResult("base-sha\n");
      },
      submitWorkflowEvent: async () => {
        sideEffects.push("event");
        return null;
      },
    });

    await expect(service.rebuildProductionBaseline(paths)).rejects.toThrow(
      "Production baseline tracing requires durable PR dispatch linkage",
    );
    await expect(service.rebuildProductionBaseline(paths, undefined, {
      workflowId: "pr-handoff:run-1",
      correlationId: "pr-handoff:run-2",
      projectEventId: "project-event-acquired",
      causedByEventId: "project-event-requested",
    })).rejects.toThrow(
      "Production baseline trace correlation pr-handoff:run-2 does not match owning PR workflow pr-handoff:run-1",
    );
    expect(sideEffects).toEqual([]);
  });
});

describe("PR support-file worktrees", () => {
  test("readyLocalPrSource accepts declared support files and includes them in the patch diff", async () => {
    const stateDir = tempDir("pr-worktrees-ready-");
    const commands: string[][] = [];
    const service = createService({
      runGit: async (_repoRoot, args) => {
        commands.push(args);
        if (args[0] === "rev-parse") return successResult("head-sha\n");
        if (args[0] === "diff" && args[1] === "--name-only") {
          return successResult("src/melee/gm/gmtest.c\ninclude/melee/gr/ground.h\n");
        }
        if (args[0] === "diff" && args[1] === "--binary") return successResult("binary patch\n");
        return successResult();
      },
    });

    const source = await service.readyLocalPrSource({
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h", "include/melee/gr/ground.h"],
      record: { local: { status: "local_only" } },
      repoRoot: "/repo",
      stateDir,
    });

    expect(source?.commitSha).toBe("head-sha");
    expect(commands).toContainEqual([
      "diff",
      "--binary",
      "base-sha..pr-split/gm",
      "--",
      "src/melee/gm/gmtest.c",
      "include/melee/gr/ground.h",
    ]);
  });

  test("readyLocalPrSource still rejects every undeclared changed file with the correct manifest message", async () => {
    const stateDir = tempDir("pr-worktrees-manifest-");
    let binaryDiffCalls = 0;
    const serviceForChanged = (changedFiles: string) =>
      createService({
        runGit: async (_repoRoot, args) => {
          if (args[0] === "rev-parse") return successResult("head-sha\n");
          if (args[0] === "diff" && args[1] === "--name-only") return successResult(changedFiles);
          if (args[0] === "diff" && args[1] === "--binary") binaryDiffCalls += 1;
          return successResult("binary patch\n");
        },
      });
    const common = {
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files: ["src/melee/gm/gmtest.c"],
      record: { local: { status: "local_only" } },
      repoRoot: "/repo",
      stateDir,
    };

    await expect(
      serviceForChanged("src/melee/gm/gmtest.c\ninclude/melee/gr/ground.h\nconfig/stray.yml\n").readyLocalPrSource({
        ...common,
        supportFiles: ["include/melee/gr/ground.h"],
      }),
    ).rejects.toThrow(
      "Local PR branch pr-split/gm changes file(s) outside the PR manifest (files + declared support files): config/stray.yml. Re-plan or move those edits before opening.",
    );

    await expect(serviceForChanged("src/melee/gm/gmtest.c\nconfig/stray.yml\n").readyLocalPrSource(common)).rejects.toThrow(
      "Local PR branch pr-split/gm changes file(s) outside the PR manifest: config/stray.yml. Re-plan or move those edits before opening.",
    );
    expect(binaryDiffCalls).toBe(0);
  });

  test("a rejected manifest can be explicitly re-planned with the support path", async () => {
    const stateDir = tempDir("pr-worktrees-replan-");
    const service = createService({
      runGit: async (_repoRoot, args) => {
        if (args[0] === "rev-parse") return successResult("head-sha\n");
        if (args[0] === "diff" && args[1] === "--name-only") {
          return successResult("src/melee/gm/gmtest.c\ninclude/melee/gr/ground.h\n");
        }
        return successResult("binary patch\n");
      },
    });
    const common = {
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files: ["src/melee/gm/gmtest.c"],
      record: { local: { status: "local_only" } },
      repoRoot: "/repo",
      stateDir,
    };

    await expect(service.readyLocalPrSource(common)).rejects.toThrow("outside the PR manifest");
    await expect(
      service.readyLocalPrSource({ ...common, supportFiles: ["include/melee/gr/ground.h"] }),
    ).resolves.toMatchObject({ commitSha: "head-sha" });
  });

  test("verifyPrSliceInBaseline applies primary and support files together", async () => {
    const commands: string[][] = [];
    const service = createService({
      runCli: async (command) => {
        commands.push(command);
        return successResult();
      },
    });

    await service.verifyPrSliceInBaseline({
      baseSha: "base-sha",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h"],
      patchPath: "/tmp/slice.patch",
    });

    expect(commands[0]).toEqual([
      "git",
      "apply",
      "--include=src/melee/gm/gmtest.c",
      "--include=include/melee/gr/ground.h",
      "/tmp/slice.patch",
    ]);
  });

  test("check-issues parity accepts only diagnostics already present on pristine master", async () => {
    const checks = [
      { status: "issues" as const, output: issuesOutput(["pre-existing warning"]), files: ["src/melee/gm/gmtest.c"] },
      { status: "issues" as const, output: issuesOutput(["pre-existing warning"]), files: ["src/melee/gm/gmtest.c"] },
    ];
    const service = createService({ codeIssuesChecker: async () => checks.shift()! });

    const result = await service.verifyPrSliceInBaseline({
      baseSha: "0123456789abcdef",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      patchPath: "/tmp/slice.patch",
    });

    expect(result.issues.status).toBe("clean");
    expect(result.issues.output).toContain("master-parity: every reported issue is pre-existing on pristine 0123456789");
  });

  test("check-issues parity rejects a new diagnostic and excess duplicate", async () => {
    const checks = [
      {
        status: "issues" as const,
        output: issuesOutput(["pre-existing warning", "pre-existing warning", "new clang failure"]),
        files: ["src/melee/gm/gmtest.c"],
      },
      { status: "issues" as const, output: issuesOutput(["pre-existing warning"]), files: ["src/melee/gm/gmtest.c"] },
    ];
    const service = createService({ codeIssuesChecker: async () => checks.shift()! });

    const result = await service.verifyPrSliceInBaseline({
      baseSha: "base-sha",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      patchPath: "/tmp/slice.patch",
    });

    expect(result.issues.status).toBe("issues");
    expect(result.issues.output).toContain("new clang failure");
    expect(result.issues.output.match(/pre-existing warning/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("check-issues parity treats an excess duplicate as a new slice issue", async () => {
    const checks = [
      {
        status: "issues" as const,
        output: issuesOutput(["same diagnostic", "same diagnostic"]),
        files: ["src/melee/gm/gmtest.c"],
      },
      { status: "issues" as const, output: issuesOutput(["same diagnostic"]), files: ["src/melee/gm/gmtest.c"] },
    ];
    const service = createService({ codeIssuesChecker: async () => checks.shift()! });

    const result = await service.verifyPrSliceInBaseline({
      baseSha: "base-sha",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      patchPath: "/tmp/slice.patch",
    });

    expect(result.issues.status).toBe("issues");
    expect(result.issues.output).toContain("new vs pristine baseline:\nsrc/melee/gm/gmtest.c :: same diagnostic");
  });

  test("check-issues parity fails closed when diagnostics or pristine cleanup cannot be verified", async () => {
    const unparsable = createService({
      codeIssuesChecker: async () => ({ status: "issues", output: "Issues: 1\nunexpected format", files: [] }),
    });
    await expect(
      unparsable.verifyPrSliceInBaseline({
        baseSha: "base-sha",
        baselineWorktree: "/baseline",
        files: ["src/melee/gm/gmtest.c"],
        patchPath: "/tmp/slice.patch",
      }),
    ).rejects.toThrow("could not be parsed for pristine-master parity");

    const cleanupFailure = createService({
      codeIssuesChecker: async () => ({ status: "clean", output: "", files: [] }),
      runCli: async (command) => command[0] === "git" && command[1] === "reset"
        ? { exitCode: 1, stdout: "", stderr: "reset failed" }
        : successResult(),
    });
    await expect(
      cleanupFailure.verifyPrSliceInBaseline({
        baseSha: "base-sha",
        baselineWorktree: "/baseline",
        files: ["src/melee/gm/gmtest.c"],
        patchPath: "/tmp/slice.patch",
      }),
    ).rejects.toThrow("could not restore pristine baseline");
  });

  test("prepareLocalPrWorkspace and publishPatchToFork apply support files", async () => {
    const stateDir = tempDir("pr-worktrees-include-");
    const commands: string[][] = [];
    const service = createService({
      runCli: async (command) => {
        commands.push(command);
        return successResult();
      },
      runGit: async (_repoRoot, args) => successResult(args[0] === "rev-parse" ? "head-sha\n" : ""),
    });
    const files = ["src/melee/gm/gmtest.c"];
    const supportFiles = ["include/melee/gr/ground.h"];

    await service.prepareLocalPrWorkspace({
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files,
      supportFiles,
      force: false,
      patchPath: "/tmp/slice.patch",
      record: {},
      repoRoot: "/repo",
      runId: "run-1",
      stateDir,
      title: "test",
    });
    await service.publishPatchToFork({
      baseSha: "base-sha",
      branch: "pr-split/gm-test-support",
      files,
      supportFiles,
      patchPath: "/tmp/slice.patch",
      repoRoot: "/repo",
      title: "test",
    });

    const applyCommands = commands.filter((command) => command[0] === "git" && command[1] === "apply");
    expect(applyCommands).toHaveLength(2);
    for (const command of applyCommands) {
      expect(command).toContain("--include=src/melee/gm/gmtest.c");
      expect(command).toContain("--include=include/melee/gr/ground.h");
    }
  });

  test("verifySupportMergeOrder invokes merge-tree in both orders for a clean overlapping pair", async () => {
    const commands: string[][] = [];
    const service = createService({
      runGit: async (_repoRoot, args) => {
        commands.push(args);
        return successResult("0123456789012345678901234567890123456789\n");
      },
    });

    const summary = await service.verifySupportMergeOrder({
      repoRoot: "/repo",
      branch: "pr-split/gm",
      sliceId: "gm",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h"],
      others: [
        {
          branch: "pr-split/gr",
          sliceId: "gr",
          files: ["include/melee/gr/ground.h"],
          supportFiles: [],
        },
      ],
    });

    expect(summary).toEqual({ checkedPairs: 1, conflicts: [], skipped: [] });
    expect(commands).toEqual([
      ["merge-tree", "--write-tree", "--name-only", "pr-split/gm", "pr-split/gr"],
      ["merge-tree", "--write-tree", "--name-only", "pr-split/gr", "pr-split/gm"],
    ]);
  });

  test("verifySupportMergeOrder rejects a conflicting pair with both slice identities and the file", async () => {
    const commands: string[][] = [];
    const service = createService({
      runGit: async (_repoRoot, args) => {
        commands.push(args);
        return {
          exitCode: 1,
          stdout: "0123456789012345678901234567890123456789\ninclude/melee/gr/ground.h\n\nCONFLICT (content): Merge conflict in include/melee/gr/ground.h\n",
          stderr: "",
        };
      },
    });

    await expect(
      service.verifySupportMergeOrder({
        repoRoot: "/repo",
        branch: "pr-split/gm",
        sliceId: "gm",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: ["include/melee/gr/ground.h"],
        others: [
          {
            branch: "pr-split/gr",
            sliceId: "gr",
            files: ["src/melee/gr/ground.c"],
            supportFiles: ["include/melee/gr/ground.h"],
          },
        ],
      }),
    ).rejects.toThrow(
      "Merge-order conflict: slice gm (branch pr-split/gm) and slice gr (branch pr-split/gr) both change include/melee/gr/ground.h with non-identical, overlapping hunks.",
    );
    expect(commands).toHaveLength(2);
  });

  test("verifySupportMergeOrder rejects order-dependent result trees", async () => {
    let calls = 0;
    const service = createService({
      runGit: async () => {
        calls += 1;
        return successResult(calls === 1 ? "1111111111111111111111111111111111111111\n" : "2222222222222222222222222222222222222222\n");
      },
    });

    await expect(
      service.verifySupportMergeOrder({
        repoRoot: "/repo",
        branch: "pr-split/gm",
        sliceId: "gm",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: ["include/melee/gr/ground.h"],
        others: [{
          branch: "pr-split/gr",
          sliceId: "gr",
          files: ["src/melee/gr/ground.c"],
          supportFiles: ["include/melee/gr/ground.h"],
        }],
      }),
    ).rejects.toThrow("slice gm (branch pr-split/gm) and slice gr (branch pr-split/gr) produce different trees");
  });

  test("verifySupportMergeOrder hard-errors when a selected prepared branch is missing", async () => {
    const service = createService({ branchExists: (_repoRoot, branch) => branch !== "pr-split/gr" });

    await expect(
      service.verifySupportMergeOrder({
        repoRoot: "/repo",
        branch: "pr-split/gm",
        sliceId: "gm",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: ["include/melee/gr/ground.h"],
        others: [{
          branch: "pr-split/gr",
          sliceId: "gr",
          files: ["include/melee/gr/ground.h"],
          supportFiles: [],
        }],
      }),
    ).rejects.toThrow("cannot resolve prepared slice gr (branch pr-split/gr)");
  });

  test("real merge-tree accepts mirror and zero-overlap hunks, then names a true conflict", async () => {
    const repoRoot = tempDir("pr-merge-tree-real-");
    mkdirSync(join(repoRoot, "include/melee/gr"), { recursive: true });
    mkdirSync(join(repoRoot, "src/melee/gm"), { recursive: true });
    mkdirSync(join(repoRoot, "src/melee/gr"), { recursive: true });
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "line one\nline two\nline three\n");
    writeFileSync(join(repoRoot, "src/melee/gm/gmtest.c"), "int gm_base;\n");
    writeFileSync(join(repoRoot, "src/melee/gr/ground.c"), "int gr_base;\n");
    await git(repoRoot, ["init", "-q", "-b", "master"]);
    await git(repoRoot, ["config", "user.email", "test@example.com"]);
    await git(repoRoot, ["config", "user.name", "Test"]);
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "base"]);

    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gm"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "mirror declaration\nline one\nline two\nline three\n");
    writeFileSync(join(repoRoot, "src/melee/gm/gmtest.c"), "int gm_match;\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gm"]);

    await git(repoRoot, ["switch", "-q", "master"]);
    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gr-mirror"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "mirror declaration\nline one\nline two\nline three\n");
    writeFileSync(join(repoRoot, "src/melee/gr/ground.c"), "int gr_match;\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gr mirror"]);

    await git(repoRoot, ["switch", "-q", "master"]);
    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gr-disjoint"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "line one\nline two\nline three\ndisjoint declaration\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gr disjoint"]);

    await git(repoRoot, ["switch", "-q", "master"]);
    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gr-conflict"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "conflicting declaration\nline one\nline two\nline three\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gr conflict"]);

    const service = createService({ runGit: git });
    const current = {
      repoRoot,
      branch: "pr-split/gm",
      sliceId: "gm",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h"],
    };
    await expect(service.verifySupportMergeOrder({
      ...current,
      others: [{
        branch: "pr-split/gr-mirror",
        sliceId: "gr-mirror",
        files: ["src/melee/gr/ground.c"],
        supportFiles: ["include/melee/gr/ground.h"],
      }],
    })).resolves.toMatchObject({ checkedPairs: 1 });
    await expect(service.verifySupportMergeOrder({
      ...current,
      others: [{
        branch: "pr-split/gr-disjoint",
        sliceId: "gr-disjoint",
        files: ["include/melee/gr/ground.h"],
        supportFiles: [],
      }],
    })).resolves.toMatchObject({ checkedPairs: 1 });
    await expect(service.verifySupportMergeOrder({
      ...current,
      others: [{
        branch: "pr-split/gr-conflict",
        sliceId: "gr-conflict",
        files: ["include/melee/gr/ground.h"],
        supportFiles: [],
      }],
    })).rejects.toThrow("slice gm (branch pr-split/gm) and slice gr-conflict (branch pr-split/gr-conflict) both change include/melee/gr/ground.h");
  });
});
