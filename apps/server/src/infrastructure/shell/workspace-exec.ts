import type { SandboxHandle } from "@server/core/job-queue/sandbox";
import { withGlobalCompileJobserverSlot } from "./global-compile-jobserver.js";
import { runCommand, type CommandResult, type RunCommandOptions } from "./run-command.js";

export const DEFAULT_SANDBOX_WORKSPACE_TIMEOUT_MS = 30 * 60_000;

export interface WorkspaceExecOptions extends RunCommandOptions {
  compile?: boolean;
}

export interface WorkspaceExec {
  readonly executionClass: "local" | "sandbox";
  exec(command: string[], options?: WorkspaceExecOptions): Promise<CommandResult>;
}

export interface SandboxWorkspaceExecOptions {
  defaultTimeoutMs?: number;
  withCompileSlot?: <T>(run: () => Promise<T>) => Promise<T>;
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

export function localWorkspaceExec(repoRoot: string): WorkspaceExec {
  return {
    executionClass: "local",
    exec: (command, options = {}) => runCommand(repoRoot, command, options),
  };
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
  const withCompileSlot = options.withCompileSlot ?? withGlobalCompileJobserverSlot;
  return {
    executionClass: "sandbox",
    exec: async (command, commandOptions = {}) => {
      const run = () => handle.exec(command, {
        cwd: workspaceRoot,
        env: sandboxEnv(commandOptions.env),
        timeoutMs: positiveTimeout(commandOptions.timeoutMs, defaultTimeoutMs),
      });
      return commandOptions.compile ? withCompileSlot(run) : run();
    },
  };
}
