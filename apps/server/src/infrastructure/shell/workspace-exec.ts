import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { SandboxHandle } from "@server/core/job-queue/sandbox";
import type { CommandResult, RunCommandOptions } from "./run-command.js";

export const DEFAULT_SANDBOX_WORKSPACE_TIMEOUT_MS = 30 * 60_000;

export type WorkspaceExecOptions = RunCommandOptions;

export interface WorkspaceExec {
  exec(command: string[], options?: WorkspaceExecOptions): Promise<CommandResult>;
  captureGitDiff(paths: string[], outputPath: string): Promise<CommandResult>;
}

export interface SandboxWorkspaceExecOptions {
  defaultTimeoutMs?: number;
}

function sandboxEnv(env: RunCommandOptions["env"]): Record<string, string> | undefined {
  if (!env) return undefined;
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function positiveTimeout(timeoutMs: number | undefined, fallback: number): number {
  return timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : fallback;
}

export function sandboxWorkspaceExec(
  handle: SandboxHandle,
  workspaceRoot: string,
  options: SandboxWorkspaceExecOptions = {},
): WorkspaceExec {
  const defaultTimeoutMs = positiveTimeout(
    options.defaultTimeoutMs,
    DEFAULT_SANDBOX_WORKSPACE_TIMEOUT_MS,
  );
  const exec = async (command: string[], commandOptions: WorkspaceExecOptions = {}) => {
    return handle.exec(command, {
      cwd: workspaceRoot,
      env: sandboxEnv(commandOptions.env),
      timeoutMs: positiveTimeout(commandOptions.timeoutMs, defaultTimeoutMs),
    });
  };
  return {
    exec,
    captureGitDiff: async (paths, outputPath) => {
      const remotePath = `/tmp/decomp-orchestrator-evidence-${randomUUID()}.diff`;
      await handle.writeFile(remotePath, "");
      try {
        const result = paths.length > 0
          ? await exec(["git", "diff", `--output=${remotePath}`, "--", ...paths])
          : { exitCode: 0, stdout: "", stderr: "" };
        await handle.downloadFile(remotePath, outputPath);
        return { ...result, stdout: await readFile(outputPath, "utf8") };
      } finally {
        await exec(["rm", "-f", remotePath], { timeoutMs: 30_000 }).catch(() => undefined);
      }
    },
  };
}

export async function captureWorkspaceGitDiff(
  workspaceExec: WorkspaceExec,
  paths: string[],
  outputPath: string,
): Promise<CommandResult> {
  return workspaceExec.captureGitDiff(paths, outputPath);
}
