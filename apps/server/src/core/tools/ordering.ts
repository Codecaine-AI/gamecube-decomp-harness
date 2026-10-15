import { basename, dirname } from "node:path";
import { readGameDescriptorConfig } from "@server/core/game-registry/config.js";
import {
  ORDERING_MODES,
  resolveGame,
  type GameOrderingConfig,
  type OrderingMode,
  type ResolvedGame,
} from "@server/core/game-registry/resolver.js";
import type { RunGameMetadata } from "@server/core/shared/types";

/** Env var the Python toolpack reads for the ordering mode (`off` is never exported). */
export const ORDERING_MODE_ENV = "ORCH_ORDERING_MODE";
/** Env var carrying the ordering policy as JSON: `{"gatedPaths": [...], "scope": {...}}`. */
export const ORDERING_POLICY_ENV = "ORCH_ORDERING_POLICY";

export type GameOrderingSource =
  | Pick<ResolvedGame, "matching" | "ordering">
  | Pick<RunGameMetadata, "gameId" | "descriptorPath">
  | null
  | undefined;

function isOrderingMode(value: unknown): value is OrderingMode {
  return typeof value === "string" && (ORDERING_MODES as readonly string[]).includes(value);
}

function isResolvedGame(game: NonNullable<GameOrderingSource>): game is Pick<ResolvedGame, "matching" | "ordering"> {
  return "matching" in game && Boolean((game as { matching?: unknown }).matching);
}

function descriptorOrdering(descriptorPath: string): GameOrderingConfig | null {
  try {
    const raw = readGameDescriptorConfig(descriptorPath).ordering;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    if (!isOrderingMode(record.mode)) return null;
    const gatedPaths = Array.isArray(record.gatedPaths) ? record.gatedPaths.filter((path): path is string => typeof path === "string") : [];
    return { mode: record.mode, gatedPaths };
  } catch {
    return null;
  }
}

/**
 * The game's `ordering` block, or null when it is not configured. A resolved
 * game answers directly; run metadata (game id + descriptor path) resolves
 * like `gameSteeringGate`: `<root>/games/<id>/game.json` through
 * `resolveGame`, anything else from the descriptor's own field.
 */
export function gameOrdering(game?: GameOrderingSource): GameOrderingConfig | null {
  if (!game) return null;
  if (isResolvedGame(game)) return game.ordering ?? null;
  if (!game.gameId && !game.descriptorPath) return null;
  const descriptorPath = game.descriptorPath;
  try {
    const gameDir = descriptorPath ? dirname(descriptorPath) : undefined;
    const orchestratorRoot = gameDir && basename(dirname(gameDir)) === "games" ? dirname(dirname(gameDir)) : undefined;
    const gameId = game.gameId ?? (gameDir ? basename(gameDir) : undefined);
    if (gameId && (orchestratorRoot || !descriptorPath)) {
      return resolveGame({ gameId, orchestratorRoot }).ordering ?? null;
    }
  } catch {
    // Fall through to the descriptor's own field.
  }
  return descriptorPath ? descriptorOrdering(descriptorPath) : null;
}

/** Readiness is consulted (shadow or enforce). */
export function orderingActive(mode: OrderingMode | string | null | undefined): mode is "shadow" | "enforce" {
  return isOrderingMode(mode) && mode !== "off";
}

/** Readiness changes admission and edit verdicts. */
export function orderingEnforced(mode: OrderingMode | string | null | undefined): mode is "enforce" {
  return mode === "enforce";
}

/** The policy object the Python tools read (`readiness.py --policy-json`, `ORCH_ORDERING_POLICY`). */
export function orderingPolicy(ordering: GameOrderingConfig): { gatedPaths: string[]; scope?: GameOrderingConfig["scope"] } {
  return {
    gatedPaths: [...ordering.gatedPaths],
    ...(ordering.scope ? { scope: { ...ordering.scope } } : {}),
  };
}

export function orderingPolicyJson(ordering: GameOrderingConfig): string {
  return JSON.stringify(orderingPolicy(ordering));
}

/** Tool env for ordering-active games only; games without ordering (Melee) or with `off` get none. */
export function orderingToolEnv(ordering: GameOrderingConfig | null | undefined): Record<string, string> {
  if (!ordering || !orderingActive(ordering.mode)) return {};
  return { [ORDERING_MODE_ENV]: ordering.mode, [ORDERING_POLICY_ENV]: orderingPolicyJson(ordering) };
}

function fnmatchSource(pattern: string): string {
  let out = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === "*") out += ".*";
    else if (char === "?") out += ".";
    else if (char === "[") {
      const close = pattern.indexOf("]", index + 2);
      if (close < 0) {
        out += "\\[";
        continue;
      }
      let body = pattern.slice(index + 1, close);
      if (body.startsWith("!")) body = `^${body.slice(1)}`;
      out += `[${body.replaceAll("\\", "\\\\")}]`;
      index = close;
    } else out += char.replace(/[.+^${}()|\\/]/g, "\\$&");
  }
  return `^${out}$`;
}

/** Python `fnmatch.fnmatchcase` semantics (`*` crosses `/`), so TS and `readiness.gated()` agree. */
export function orderingGatedPath(sourcePath: string, gatedPaths: readonly string[]): boolean {
  const path = sourcePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return gatedPaths.some((pattern) => new RegExp(fnmatchSource(pattern)).test(path));
}
