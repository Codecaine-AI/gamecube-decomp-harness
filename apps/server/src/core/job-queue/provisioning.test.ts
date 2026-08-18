import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { hostToolPlatform } from "@server/core/tools/platform.js";
import { provisionWorkerWorktree, type ProvisionCommandRunner } from "./provisioning.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("provisionWorkerWorktree", () => {
  test("runs the disposable worktree reset and clean recipe through the injected runner", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-worker-")); roots.push(root);
    const sourceRepoRoot = resolve(root, "source-repo");
    const workerRepoRoot = resolve(root, "worktrees/cycles/c1/epochs/0001/workers/w1/source");
    const outputDir = resolve(root, "output");
    await mkdir(resolve(workerRepoRoot, ".git"), { recursive: true });
    await mkdir(resolve(workerRepoRoot, "build/tools"), { recursive: true });
    await writeFile(resolve(workerRepoRoot, "build/tools/objdiff-cli"), "ready");
    await writeFile(resolve(workerRepoRoot, "build.ninja"), "# configured\n");
    await mkdir(sourceRepoRoot, { recursive: true });
    const calls: Array<{ cwd: string; command: string[] }> = [];
    const runner: ProvisionCommandRunner = async (cwd, command) => { calls.push({ cwd, command }); return { exitCode: 0, stdout: "", stderr: "" }; };

    await provisionWorkerWorktree({ sourceRepoRoot, workerRepoRoot, baseRev: "abc123", outputDir, configureCommand: "", reportArtifactSources: [], toolArtifactSources: [], toolPlatform: hostToolPlatform(), dryRun: false, commandRunner: runner });

    expect(calls).toEqual([
      { cwd: workerRepoRoot, command: ["git", "reset", "--hard", "abc123"] },
      { cwd: workerRepoRoot, command: ["git", "clean", "-fd"] },
    ]);
  });

  test("dry-run links the source tree without invoking commands", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-worker-dry-")); roots.push(root);
    const sourceRepoRoot = resolve(root, "source"); const workerRepoRoot = resolve(root, "dry/worktree/source"); const outputDir = resolve(root, "output");
    await mkdir(sourceRepoRoot, { recursive: true }); await writeFile(resolve(sourceRepoRoot, "file.c"), "x");
    let called = false;
    await provisionWorkerWorktree({ sourceRepoRoot, workerRepoRoot, baseRev: "abc", outputDir, configureCommand: "", reportArtifactSources: [], toolArtifactSources: [], toolPlatform: hostToolPlatform(), dryRun: true, commandRunner: async () => { called = true; return { exitCode: 0, stdout: "", stderr: "" }; } });
    expect(called).toBe(false);
    expect(await Bun.file(resolve(workerRepoRoot, "file.c")).text()).toBe("x");
  });
});
