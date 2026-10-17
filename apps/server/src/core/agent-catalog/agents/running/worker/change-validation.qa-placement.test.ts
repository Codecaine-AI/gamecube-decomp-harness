import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { QA_LINT_PLACEMENT_ENV, SANDBOX_QA_STAMP_PATH, sandboxQaWorkDir } from "@server/core/validation/qa/sandbox-scan.js";
import { runQaScanDiff } from "@server/core/validation/qa/scan-diff.js";
import * as shell from "@server/infrastructure/shell";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { captureWorkerChangeBaseline, validateWorkerChange, type WorkerChangeBaseline } from "./change-validation.js";

const orchestratorRoot = resolve(import.meta.dir, "../../../../../../../..");
const sandboxScript = "/opt/toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py";
const sourcePath = "src/melee/ft/ftcoll.c";
const target = { unit: "melee/ft/ftcoll.c", symbol: "ftCo_800C8E5C", source_path: sourcePath };
const game = { gameId: "melee" };

/**
 * A "worker sandbox" that is a local git checkout: commands really run in it,
 * except the QA asset probe (answered by `ready`), the toolchain (absent) and
 * the sandbox scanner, which is mapped back to the host scanner so both
 * placements are judged by the same rules.
 */
function localSandbox(repo: string, ready: boolean, commands: string[][]): WorkspaceExec {
  const exec: WorkspaceExec["exec"] = async (command, options) => {
    commands.push(command);
    if (command[0] === "test" && command.includes(SANDBOX_QA_STAMP_PATH)) return { exitCode: ready ? 0 : 1, stdout: "", stderr: "" };
    if (command[0] === "python3" && command[1] === sandboxScript) {
      const diffFile = command[command.indexOf("--diff-file") + 1];
      const invocation = await runQaScanDiff({ repoRoot: repo, orchestratorRoot, game, diffFile, surface: "worker" });
      return { exitCode: invocation.exitCode, stdout: invocation.stdout, stderr: invocation.stderr };
    }
    if (!["cat", "python3", "git", "test"].includes(command[0])) return { exitCode: 127, stdout: "", stderr: "not in this sandbox" };
    const result = Bun.spawnSync(command, { cwd: repo, env: { ...process.env, ...options?.env }, stdout: "pipe", stderr: "pipe" });
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
  return { exec } as WorkspaceExec;
}

async function fixture(ready: boolean, options: { dirtyAtCapture?: boolean } = {}) {
  const repo = await mkdtemp(join(tmpdir(), "qa-l1-fixture-repo-"));
  const outputDir = await mkdtemp(join(tmpdir(), "qa-l1-fixture-out-"));
  await mkdir(join(repo, "src/melee/ft"), { recursive: true });
  await writeFile(join(repo, sourcePath), "int a;\nint b;\n");
  for (const args of [["init", "-q"], ["add", "."], ["-c", "user.email=qa@example.test", "-c", "user.name=QA", "commit", "-qm", "base"]]) {
    expect(Bun.spawnSync(["git", ...args], { cwd: repo }).exitCode).toBe(0);
  }
  // A pre-attempt edit that is not in git: no commit can reproduce this snapshot.
  if (options.dirtyAtCapture) await writeFile(join(repo, sourcePath), "int a;\nint pre;\nint b;\n");
  const commands: string[][] = [];
  const workspaceExec = localSandbox(repo, ready, commands);
  const baseline = await captureWorkerChangeBaseline({ repoRoot: repo, outputDir, target, workspaceExec });
  // The worker's edit.
  await writeFile(join(repo, sourcePath), "int a;\nextern const f32 lbl_804DA60C;\nstatic float lbl_8040000C = 1.0f;\nint b;\n");
  commands.length = 0;
  const validate = (attemptIndex: number, extra: Partial<Parameters<typeof validateWorkerChange>[0]> = {}, attemptBaseline: WorkerChangeBaseline = baseline) => validateWorkerChange({
    repoRoot: repo,
    hostRepoRoot: repo,
    outputDir,
    attemptIndex,
    baseline: attemptBaseline,
    target,
    dryRun: false,
    shouldRun: true,
    claimedExact: false,
    orchestratorRoot,
    game,
    workspaceExec,
    ...extra,
  });
  return { repo, outputDir, baseline, commands, validate };
}

describe("validateWorkerChange QA lint placement (default runner)", () => {
  const savedPlacement = process.env[QA_LINT_PLACEMENT_ENV];
  const savedBuild = process.env.ORCH_BUILD_EXECUTION;
  // The host reference scan runs locally, never in a Daytona build sandbox.
  beforeAll(() => { process.env.ORCH_BUILD_EXECUTION = "local"; });
  afterAll(() => {
    if (savedBuild === undefined) delete process.env.ORCH_BUILD_EXECUTION;
    else process.env.ORCH_BUILD_EXECUTION = savedBuild;
  });
  afterEach(() => {
    if (savedPlacement === undefined) delete process.env[QA_LINT_PLACEMENT_ENV];
    else process.env[QA_LINT_PLACEMENT_ENV] = savedPlacement;
  });

  test("auto diffs and scans in the worker sandbox with today's patch and findings", async () => {
    delete process.env[QA_LINT_PLACEMENT_ENV];
    const { repo, outputDir, baseline, commands, validate } = await fixture(true);
    const workDir = sandboxQaWorkDir(outputDir);
    expect(baseline.sandboxQaSnapshotDir).toBe(`${workDir}/pre_worker_source`);
    expect(baseline.sandboxQaSnapshotPaths).toEqual([sourcePath]);

    const sandbox = await validate(0);
    const sandboxCommands = [...commands];
    // Today's host path, as the build placement still runs it.
    const host = await validate(1, { qaScanRunner: (options) => runQaScanDiff(options) });

    expect(sandbox.qaLint?.executionSurface).toBe("worker_sandbox");
    expect(sandbox.qaLint?.status).toBe("violations");
    expect(sandbox.qaLint?.findings.map((finding) => finding.rule_id)).toEqual(["extern_in_c", "address_named_static_data", "unused_static_data"]);
    expect(sandbox.qaLint?.findings).toEqual(host.qaLint?.findings ?? []);
    expect(sandbox.qaLint?.exitCode).toBe(host.qaLint?.exitCode ?? null);
    expect(await readFile(resolve(outputDir, "attempt-0.qa_diff.patch"), "utf8")).toBe(await readFile(resolve(outputDir, "attempt-1.qa_diff.patch"), "utf8"));
    expect(sandbox.qaLint?.scanPath).toBe(resolve(outputDir, "attempt-0.qa_diff.patch"));

    // No host diff: no host scratch, no read-back of the current source, no upload.
    expect(existsSync(resolve(outputDir, "attempt-0.qa_diff.raw.patch"))).toBe(false);
    expect(existsSync(resolve(outputDir, "attempt-0.qa_current"))).toBe(false);
    expect(sandboxCommands.some((command) => command.join(" ") === `cat ${sourcePath}`)).toBe(false);
    expect(sandboxCommands.some((command) => command[0] === "python3" && command[4] === "wb")).toBe(false);
    const diff = sandboxCommands.find((command) => command[0] === "python3" && command[2]?.includes("'git', 'diff', '--no-index'"));
    expect(diff?.slice(3)).toEqual([`${workDir}/pre_worker_source`, `${workDir}/attempt-0.qa_scratch`, `${repo}/${workDir}/attempt-0.qa_diff.patch`, JSON.stringify([sourcePath])]);
    const scan = sandboxCommands.find((command) => command[1] === sandboxScript);
    expect(scan).toEqual(["python3", sandboxScript, "--repo", repo, "--json", "--gate", "--diff-file", `${repo}/${workDir}/attempt-0.qa_diff.patch`, "--surface", "worker"]);
    const summary = JSON.parse(await readFile(resolve(outputDir, "attempt-0.runner_validation.summary.json"), "utf8")) as { qaLint: Record<string, unknown> };
    expect(summary.qaLint.executionSurface).toBe("worker_sandbox");
  });

  test("an unchanged attempt is clean without a scan", async () => {
    const { repo, commands, validate } = await fixture(true);
    await writeFile(join(repo, sourcePath), "int a;\nint b;\n");
    const validation = await validate(0);
    expect(validation.qaLint).toMatchObject({ status: "clean", exitCode: null, findings: [], scanPath: null, toolError: null });
    expect(commands.some((command) => command[1] === sandboxScript)).toBe(false);
  });

  /** Host `git` processes spawned through runCommand (the host QA diff); the build-placement test proves the spy sees them. */
  function hostGitSpy() {
    const spy = spyOn(shell, "runCommand");
    return { calls: () => spy.mock.calls.filter((call) => call[1]?.[0] === "git").length, restore: () => spy.mockRestore() };
  }

  function dropTwin(repo: string, baseline: WorkerChangeBaseline, keepRevs: boolean): WorkerChangeBaseline {
    rmSync(join(repo, baseline.sandboxQaSnapshotDir!), { recursive: true, force: true });
    return { ...baseline, sandboxQaSnapshotPaths: [], sandboxQaSnapshotRevs: keepRevs ? baseline.sandboxQaSnapshotRevs : {} };
  }

  test("a lost twin copy proven clean at capture is rebuilt from git in the sandbox", async () => {
    const { repo, outputDir, baseline, commands, validate } = await fixture(true);
    const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repo }).stdout.toString().trim();
    expect(baseline.sandboxQaSnapshotRevs).toEqual({ [sourcePath]: head });
    const git = hostGitSpy();
    try {
      const validation = await validate(0, {}, dropTwin(repo, baseline, true));
      expect(validation.qaLint?.executionSurface).toBe("worker_sandbox");
      expect(validation.qaLint?.findings.map((finding) => finding.rule_id)).toEqual(["extern_in_c", "address_named_static_data", "unused_static_data"]);
      expect(git.calls()).toBe(0);
    } finally {
      git.restore();
    }
    expect(existsSync(resolve(outputDir, "attempt-0.qa_diff.raw.patch"))).toBe(false);
    const restore = commands.find((command) => command[0] === "python3" && command[2]?.includes("'restored'"));
    expect(JSON.parse(restore?.[4] ?? "[]")).toEqual([{ path: sourcePath, rev: head }]);
  });

  test("an incomplete twin git cannot reproduce is tool_unavailable and never reaches host git", async () => {
    // Dirty at capture: the pre-attempt bytes match no commit, so no rev is recorded.
    const dirty = await fixture(true, { dirtyAtCapture: true });
    expect(dirty.baseline.sandboxQaSnapshotRevs).toEqual({});
    // Clean at capture, but the evidence is gone too.
    const clean = await fixture(true);
    const git = hostGitSpy();
    try {
      for (const { repo, outputDir, baseline, commands, validate } of [dirty, clean]) {
        const validation = await validate(0, {}, dropTwin(repo, baseline, false));
        expect(validation.qaLint).toMatchObject({ status: "tool_unavailable", executionSurface: "worker_sandbox", findings: [] });
        expect(validation.qaLint?.toolError).toBe(`pre-attempt sandbox snapshot is incomplete and cannot be rebuilt from git: ${sourcePath}`);
        expect(commands.some((command) => command[1] === sandboxScript)).toBe(false);
        expect(existsSync(resolve(outputDir, "attempt-0.qa_diff.raw.patch"))).toBe(false);
      }
      expect(git.calls()).toBe(0);
    } finally {
      git.restore();
    }
  });

  test("only the explicit build placement builds the diff with host git", async () => {
    process.env[QA_LINT_PLACEMENT_ENV] = "build";
    const { outputDir, validate } = await fixture(true);
    const git = hostGitSpy();
    try {
      const validation = await validate(0);
      expect(git.calls()).toBeGreaterThan(0);
      expect(validation.qaLint?.executionSurface).toBe("host");
      expect(validation.qaLint?.findings).toHaveLength(3);
    } finally {
      git.restore();
    }
    expect(existsSync(resolve(outputDir, "attempt-0.qa_diff.raw.patch"))).toBe(true);
  });

  test("sandbox placement without provisioned QA assets reports tool_unavailable and builds no diff", async () => {
    process.env[QA_LINT_PLACEMENT_ENV] = "sandbox";
    const { outputDir, commands, validate } = await fixture(false);
    const validation = await validate(0);
    expect(validation.qaLint?.status).toBe("tool_unavailable");
    expect(validation.qaLint?.executionSurface).toBe("worker_sandbox");
    expect(validation.qaLint?.toolError).toContain("no QA assets");
    expect(commands.some((command) => command[1] === sandboxScript)).toBe(false);
    expect(existsSync(resolve(outputDir, "attempt-0.qa_diff.raw.patch"))).toBe(false);
  });
});
