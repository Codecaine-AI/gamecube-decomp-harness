import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FakeSandboxProvider,
  type SandboxCreateParams,
  type SandboxHandle,
} from "@server/core/job-queue/sandbox";
import {
  DEFAULT_SANDBOX_WORKSPACE_TIMEOUT_MS,
  captureWorkspaceGitDiff,
  sandboxWorkspaceExec,
} from "./workspace-exec.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

const createParams: SandboxCreateParams = {
  snapshot: "melee-worker-v1",
  labels: { game_id: "melee", job_id: "job-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

describe("WorkspaceExec", () => {
  test("maps sandbox cwd, env, and explicit or default timeouts", async () => {
    const provider = new FakeSandboxProvider().scriptExec(
      { exitCode: 0, stdout: "first", stderr: "" },
      { exitCode: 3, stdout: "second", stderr: "failed" },
      { exitCode: 0, stdout: "third", stderr: "" },
    );
    const handle = await provider.create(createParams);
    const workspaceExec = sandboxWorkspaceExec(handle, "/workspace/melee");

    expect(await workspaceExec.exec(["git", "status"], {
      env: { PRESENT: "yes", OMITTED: undefined },
    })).toEqual({ exitCode: 0, stdout: "first", stderr: "" });
    expect(await workspaceExec.exec(["objdiff-cli", "report"], { timeoutMs: 45_000 })).toEqual({
      exitCode: 3,
      stdout: "second",
      stderr: "failed",
    });
    await workspaceExec.exec(["git", "diff"], { timeoutMs: 0 });

    expect(provider.execCalls.map((call) => call.opts)).toEqual([
      {
        cwd: "/workspace/melee",
        env: { PRESENT: "yes" },
        timeoutMs: DEFAULT_SANDBOX_WORKSPACE_TIMEOUT_MS,
      },
      {
        cwd: "/workspace/melee",
        env: undefined,
        timeoutMs: 45_000,
      },
      {
        cwd: "/workspace/melee",
        env: undefined,
        timeoutMs: DEFAULT_SANDBOX_WORKSPACE_TIMEOUT_MS,
      },
    ]);
  });

  test("downloads sandbox git-diff evidence byte-identically to the host artifact path", async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "workspace-evidence-"));
    roots.push(artifactDir);
    const outputPath = join(artifactDir, "runner_validation", "attempt-0.write_set.diff");
    mkdirSync(join(artifactDir, "runner_validation"));
    const patch = [
      "diff --git a/src/a.c b/src/a.c\n",
      "index 1111111..2222222 100644\n",
      "--- a/src/a.c\n",
      "+++ b/src/a.c\n",
      "@@ -1 +1 @@\n",
      "-int value = 0;\n",
      "+int value = 1;\n",
    ].join("");
    writeFileSync(outputPath, "");
    let handle: SandboxHandle;
    const provider = new FakeSandboxProvider().scriptExec(
      async (call) => {
        const remotePath = call.command[2]?.replace("--output=", "");
        if (!remotePath) throw new Error("missing remote git diff output path");
        await handle.writeFile(remotePath, patch);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      { exitCode: 0, stdout: "", stderr: "" },
    );
    handle = await provider.create(createParams);
    writeFileSync(outputPath, "stale host bytes");
    const sandbox = await captureWorkspaceGitDiff(
      sandboxWorkspaceExec(handle, "/workspace/melee"),
      ["src/a.c"],
      outputPath,
    );

    expect(readFileSync(outputPath)).toEqual(Buffer.from(patch));
    expect(sandbox).toEqual({ exitCode: 0, stdout: patch, stderr: "" });
    expect(provider.execCalls[0]?.command).toEqual([
      "git",
      "diff",
      expect.stringMatching(/^--output=\/tmp\/decomp-orchestrator-evidence-.+\.diff$/),
      "--",
      "src/a.c",
    ]);
    expect(provider.downloadCalls).toEqual([{
      sandboxId: handle.sandboxId,
      remotePath: provider.execCalls[0]!.command[2]!.replace("--output=", ""),
      localPath: outputPath,
    }]);
  });

  test("persists each sandbox attempt before the next and survives sandbox loss", async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "workspace-attempt-evidence-"));
    roots.push(artifactDir);
    const validationDir = join(artifactDir, "runner_validation");
    mkdirSync(validationDir);
    const firstPath = join(validationDir, "attempt-0.write_set.diff");
    const secondPath = join(validationDir, "attempt-1.write_set.diff");
    const firstPatch = "diff --git a/src/a.c b/src/a.c\n+int first;\n";
    const secondPatch = "diff --git a/src/a.c b/src/a.c\n+int second;\n";
    let handle: SandboxHandle;
    const writeRemoteDiff = async (call: { command: string[] }, content: string) => {
      const remotePath = call.command[2]?.replace("--output=", "");
      if (!remotePath) throw new Error("missing remote git diff output path");
      await handle.writeFile(remotePath, content);
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const provider = new FakeSandboxProvider().scriptExec(
      (call) => writeRemoteDiff(call, firstPatch),
      { exitCode: 0, stdout: "", stderr: "" },
      (call) => {
        expect(readFileSync(firstPath)).toEqual(Buffer.from(firstPatch));
        return writeRemoteDiff(call, secondPatch);
      },
      { exitCode: 0, stdout: "", stderr: "" },
    );
    handle = await provider.create(createParams);
    const workspaceExec = sandboxWorkspaceExec(handle, "/workspace/melee");

    await captureWorkspaceGitDiff(workspaceExec, ["src/a.c"], firstPath);
    await captureWorkspaceGitDiff(workspaceExec, ["src/a.c"], secondPath);
    await provider.delete(handle.sandboxId, "settlement");

    expect(readFileSync(firstPath)).toEqual(Buffer.from(firstPatch));
    expect(readFileSync(secondPath)).toEqual(Buffer.from(secondPatch));
    expect(provider.downloadCalls.map(({ localPath }) => localPath)).toEqual([
      firstPath,
      secondPath,
    ]);
  });
});
