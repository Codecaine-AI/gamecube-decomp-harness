import type { GameRuntimeContext, ResolvedGame } from "@server/core/game-registry";
import { runningScheduling } from "../process-command.js";
type JsonObject = Record<string, unknown>;
const stringValue = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const numberValue = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) && value != null ? Number(value) : fallback;
const boolValue = (value: unknown) => value === true || value === "true";
function serverJobPrefix(paths: GameRuntimeContext, file: string): string[] {
 return ["bun", file, ...(paths.game ? ["--game", paths.game.gameId] : []), "--repo-root", paths.repoRoot, "--state-dir", paths.stateDir];
}
export function initRunCommand(paths: GameRuntimeContext, body: JsonObject, serverJobPath: string, worktree: string): { command: string[]; repoRoot: string; stateDir: string; graphDbPath: string; game: ResolvedGame | null } {
  const { graphDbPath, game, stateDir } = paths;
  const repoRoot = worktree;
  const commandPaths = { ...paths, repoRoot };
  const { maxWorkers } = runningScheduling(body.maxWorkers);
  const sandboxProfile = stringValue(body.sandboxProfile, game?.sandbox?.default_profile ?? "");
  const command = [
    ...serverJobPrefix(commandPaths, serverJobPath),
    ...(boolValue(body.dryRunAgents) ? ["--dry-run-agents"] : []),
    "--provider",
    stringValue(body.provider, "codex-lb"),
    "--model",
    stringValue(body.model, "gpt-6-astra"),
    "--thinking-level",
    stringValue(body.thinkingLevel, "medium"),
    "--agent-timeout-seconds",
    String(numberValue(body.agentTimeoutSeconds, numberValue(game?.dashboard.agentTimeoutSeconds, 1800))),
    ...(sandboxProfile ? ["--sandbox-profile", sandboxProfile] : []),
    "init-run",
    "--desired-workers",
    String(maxWorkers),
    "--goal-kind",
    stringValue(body.goalKind, "matched_code_percent"),
    "--goal-value",
    String(game?.dashboard.goalValue ?? numberValue(body.goalValue, 100)),
    "--graph-db",
    graphDbPath,
  ];
  if (body.epochTargetCap !== undefined && body.epochTargetCap !== null) {
    command.push("--epoch-target-cap", String(Math.max(0, Math.floor(numberValue(body.epochTargetCap, 0)))));
  }
  const workerConfigureCommand = stringValue(body.workerConfigureCommand).trim();
  if (workerConfigureCommand) command.push("--worker-configure-command", workerConfigureCommand);
  const epochConfigureCommand = stringValue(body.epochConfigureCommand).trim();
  if (epochConfigureCommand) command.push("--epoch-configure-command", epochConfigureCommand);
  return { command, repoRoot, stateDir, graphDbPath, game };
}
