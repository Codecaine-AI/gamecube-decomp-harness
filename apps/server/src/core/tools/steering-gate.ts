import { basename, dirname } from "node:path";
import { readGameDescriptorConfig } from "@server/core/game-registry/config.js";
import {
  resolveGame,
  STEERING_GATE_MODES,
  type SteeringGateMode,
} from "@server/core/game-registry/resolver.js";
import type { RunGameMetadata } from "@server/core/shared/types";

/** Env var the Python toolpack reads through `game_policy.steering_gate()`. */
export const STEERING_GATE_ENV = "ORCH_STEERING_GATE";

function isSteeringGateMode(value: unknown): value is SteeringGateMode {
  return typeof value === "string" && (STEERING_GATE_MODES as readonly string[]).includes(value);
}

/**
 * The resolved game's `matching.steeringGate` for run metadata that only
 * carries the game id and descriptor path. Resolution mirrors
 * `gameStackFramePolicy`: a descriptor at `<root>/games/<id>/game.json`
 * resolves through `resolveGame`; anything else falls back to the
 * descriptor's own field, then to `off`.
 */
export function gameSteeringGate(
  game?: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null,
): SteeringGateMode {
  if (!game?.gameId && !game?.descriptorPath) return "off";
  const descriptorPath = game.descriptorPath;
  try {
    const gameDir = descriptorPath ? dirname(descriptorPath) : undefined;
    const orchestratorRoot = gameDir && basename(dirname(gameDir)) === "games" ? dirname(dirname(gameDir)) : undefined;
    const gameId = game.gameId ?? (gameDir ? basename(gameDir) : undefined);
    if (gameId && (orchestratorRoot || !descriptorPath)) {
      return resolveGame({ gameId, orchestratorRoot }).matching.steeringGate;
    }
  } catch {
    // Fall through to the descriptor's own field.
  }
  if (!descriptorPath) return "off";
  try {
    const matching = readGameDescriptorConfig(descriptorPath).matching;
    const mode = matching && typeof matching === "object" ? (matching as Record<string, unknown>).steeringGate : undefined;
    return isSteeringGateMode(mode) ? mode : "off";
  } catch {
    return "off";
  }
}

/** The gate runs (shadow or enforce). */
export function steeringGateActive(mode: SteeringGateMode | string | null | undefined): boolean {
  return isSteeringGateMode(mode) && mode !== "off";
}

/** The gate's verdict changes attempt outcomes. */
export function steeringGateEnforced(mode: SteeringGateMode | string | null | undefined): boolean {
  return mode === "enforce";
}
