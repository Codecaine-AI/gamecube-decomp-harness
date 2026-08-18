import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox";
import {
  DEFAULT_SANDBOX_WORKSPACE_TIMEOUT_MS,
  localWorkspaceExec,
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
  test("keeps local commands rooted in the repo with runCommand env behavior", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "local-workspace-exec-"));
    roots.push(repoRoot);
    const workspaceExec = localWorkspaceExec(repoRoot);

    const result = await workspaceExec.exec(
      ["/bin/sh", "-lc", 'printf "%s|%s" "$PWD" "$WORKSPACE_EXEC_VALUE"'],
      { env: { WORKSPACE_EXEC_VALUE: "visible" }, compile: true },
    );

    expect(workspaceExec.executionClass).toBe("local");
    expect(result).toEqual({ exitCode: 0, stdout: `${realpathSync(repoRoot)}|visible`, stderr: "" });
  });

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

    expect(workspaceExec.executionClass).toBe("sandbox");
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

  test("holds host compile admission around sandbox build exec only", async () => {
    const order: string[] = [];
    const provider = new FakeSandboxProvider().scriptExec(
      () => {
        order.push("sandbox build");
        return { exitCode: 0, stdout: "built", stderr: "" };
      },
      () => {
        order.push("sandbox score");
        return { exitCode: 0, stdout: "scored", stderr: "" };
      },
    );
    const handle = await provider.create(createParams);
    const workspaceExec = sandboxWorkspaceExec(handle, "/workspace/melee", {
      withCompileSlot: async (run) => {
        order.push("slot acquired");
        try {
          return await run();
        } finally {
          order.push("slot released");
        }
      },
    });

    await workspaceExec.exec(["ninja", "build/src/foo.o"], { compile: true });
    await workspaceExec.exec(["objdiff-cli", "report"]);

    expect(order).toEqual([
      "slot acquired",
      "sandbox build",
      "slot released",
      "sandbox score",
    ]);
  });
});
