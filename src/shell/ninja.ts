import { runCommand, type CommandResult } from "./run-command.js";

export async function runNinja(repoRoot: string, target: string): Promise<CommandResult> {
  return runCommand(repoRoot, ["ninja", target]);
}
