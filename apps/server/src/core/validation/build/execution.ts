import type { CommandResult, RunCommandOptions } from "@server/infrastructure/shell/run-command.js";

/** Host game builds use Daytona. Local execution is an explicit development override. */
export function remoteBuildsEnabled(): boolean {
  const mode = process.env.ORCH_BUILD_EXECUTION ?? "daytona";
  if (mode !== "daytona" && mode !== "local") throw new Error(`Invalid ORCH_BUILD_EXECUTION: ${mode}`);
  return mode === "daytona";
}

/** `steering`: one `steering_check.py` call (backfill, sandbox placement) behind the IR-oracle clang probe; see `daytona.ts`. */
export type BuildTaskKind = "report" | "ci" | "precommit" | "autofix" | "object" | "unit-snapshot" | "qa" | "command" | "report-changes" | "format-check" | "format-apply" | "symbol-check" | "steering";
export interface BuildTask { kind: BuildTaskKind; input: Record<string, unknown> }
/** Where a `steering` task's host inputs land in the build sandbox: the game's policy and lessons, and per-call files (`input.uploads`). */
export const REMOTE_STEERING_INPUTS = "/tmp/steering-inputs";

/** `options.signal` aborts the build: it rejects at once and its sandbox is deleted. */
export async function executeBuildTask<T>(repoRoot: string, task: BuildTask, options: { signal?: AbortSignal } = {}): Promise<T> {
  const { executeDaytonaBuild } = await import("./daytona.js");
  return executeDaytonaBuild<T>(repoRoot, task, options.signal ? { signal: options.signal } : {});
}

export async function runBuildCommand(repoRoot: string, command: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  if (remoteBuildsEnabled()) return executeBuildTask(repoRoot, { kind: "command", input: { command, options } });
  const { runCommand } = await import("@server/infrastructure/shell/run-command.js");
  return runCommand(repoRoot, command, options);
}

/** Guard legacy generic runners as well as explicitly routed build operations. */
export function isGameBuildCommand(command: string[]): boolean {
  const executable = command[0]?.split("/").at(-1) ?? "";
  if (/^(ninja|make|cmake|mwcc(?:ppc)?(?:\.exe)?|objdiff-cli|dtk|pre-commit)$/.test(executable)) return true;
  if (/^python[23]?$/.test(executable)) return command.slice(1).some(arg => arg.split("/").at(-1) === "configure.py");
  if (/^(sh|bash|zsh)$/.test(executable) && command.some(arg => /^-[a-z]*c[a-z]*$/.test(arg))) {
    return /(?:^|[\s/;&|])(ninja|make|cmake|objdiff-cli|dtk|pre-commit|configure\.py)(?:\s|$)/.test(command.slice(1).join(" "));
  }
  if (executable === "env") return isGameBuildCommand(command.slice(1).filter(arg => !arg.includes("=")));
  return false;
}
