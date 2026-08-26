import { spawn } from "node:child_process";
import { uiLog } from "@server/infrastructure/logging/ui-log";

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface UiCommandRunner {
  outputTail: (textValue: string, maxLength?: number) => string;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGit: (repoRoot: string, args: string[], options?: { check?: boolean; failureHint?: string }) => Promise<CliResult>;
}

export interface UiCommandRunnerDeps {
  packageRoot: string;
}

export function outputTail(textValue: string, maxLength = 2000): string {
  if (textValue.length <= maxLength) return textValue;
  return `...${textValue.slice(textValue.length - maxLength)}`;
}

export function createUiCommandRunner(deps: UiCommandRunnerDeps): UiCommandRunner {
  async function runCli(command: string[], cwd = deps.packageRoot): Promise<CliResult> {
    const child = spawn(command[0] ?? "bun", command.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      const value = String(chunk);
      stdoutChunks.push(value);
      uiLog("stdout", value);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      const value = String(chunk);
      stderrChunks.push(value);
      uiLog("stderr", value);
    });
    const exitCode = await new Promise<number | null>((resolveExit) => child.on("close", (code) => resolveExit(code)));
    return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
  }

  async function runGit(repoRoot: string, args: string[], options: { check?: boolean; failureHint?: string } = {}): Promise<CliResult> {
    const result = await runCli(["git", ...args], repoRoot);
    if (options.check !== false && result.exitCode !== 0) {
      throw new Error(`${options.failureHint ?? `git ${args.join(" ")} failed`} (${result.exitCode}): ${outputTail(result.stderr || result.stdout, 4000)}`);
    }
    return result;
  }

  return { outputTail, runCli, runGit };
}
