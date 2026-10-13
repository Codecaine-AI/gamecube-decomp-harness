import { basename, dirname } from "node:path";
import { readGameDescriptorConfig } from "@server/core/game-registry/config.js";
import {
  resolveGame,
  STACK_FRAME_POLICIES,
  type StackFramePolicy,
} from "@server/core/game-registry/resolver.js";
import type { RunGameMetadata } from "@server/core/shared/types";

/** Env var the Python toolpack reads through `game_policy.stack_frame_policy()`. */
export const STACK_FRAME_POLICY_ENV = "ORCH_STACK_FRAME_POLICY";

function isStackFramePolicy(value: unknown): value is StackFramePolicy {
  return typeof value === "string" && (STACK_FRAME_POLICIES as readonly string[]).includes(value);
}

/**
 * The resolved game's `matching.stackFramePolicy` for run metadata that only
 * carries the game id and descriptor path. A descriptor at
 * `<root>/games/<id>/game.json` resolves through `resolveGame`; anything else
 * falls back to the descriptor's own field, then to `match_frame`.
 */
export function gameStackFramePolicy(
  game?: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null,
): StackFramePolicy {
  if (!game?.gameId && !game?.descriptorPath) return "match_frame";
  const descriptorPath = game.descriptorPath;
  try {
    const gameDir = descriptorPath ? dirname(descriptorPath) : undefined;
    const orchestratorRoot = gameDir && basename(dirname(gameDir)) === "games" ? dirname(dirname(gameDir)) : undefined;
    const gameId = game.gameId ?? (gameDir ? basename(gameDir) : undefined);
    if (gameId && (orchestratorRoot || !descriptorPath)) {
      return resolveGame({ gameId, orchestratorRoot }).matching.stackFramePolicy;
    }
  } catch {
    // Fall through to the descriptor's own field.
  }
  if (!descriptorPath) return "match_frame";
  try {
    const matching = readGameDescriptorConfig(descriptorPath).matching;
    const policy = matching && typeof matching === "object" ? (matching as Record<string, unknown>).stackFramePolicy : undefined;
    return isStackFramePolicy(policy) ? policy : "match_frame";
  } catch {
    return "match_frame";
  }
}
