import { basename, dirname } from "node:path";
import { resolveGame, type ResolvedGame } from "@server/core/game-registry/resolver.js";
import type { RunGameMetadata } from "@server/core/shared/types";

const cache = new Map<string, ResolvedGame | null>();

/**
 * The resolved game for run metadata that only carries the game id and
 * descriptor path, or null when it does not resolve. Resolution mirrors
 * `gameSteeringGate`: a descriptor at `<root>/games/<id>/game.json` resolves
 * against that root; a bare game id resolves against the default root; any
 * other descriptor path is not resolved. Never throws.
 */
export function resolvedRunGame(game?: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null): ResolvedGame | null {
  if (!game?.gameId && !game?.descriptorPath) return null;
  const key = `${game.gameId ?? ""}\0${game.descriptorPath ?? ""}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let resolved: ResolvedGame | null = null;
  try {
    const descriptorPath = game.descriptorPath;
    const gameDir = descriptorPath ? dirname(descriptorPath) : undefined;
    const orchestratorRoot = gameDir && basename(dirname(gameDir)) === "games" ? dirname(dirname(gameDir)) : undefined;
    const gameId = game.gameId ?? (gameDir ? basename(gameDir) : undefined);
    if (gameId && (orchestratorRoot || !descriptorPath)) resolved = resolveGame({ gameId, orchestratorRoot });
  } catch {
    resolved = null;
  }
  cache.set(key, resolved);
  return resolved;
}

/**
 * The game has a code graph with cross-references (`knowledge.gameSources`
 * lists `code_graph`; its build indexes the Ghidra export's xrefs), so the
 * read-only graph tools have something to answer from.
 */
export function gameHasCodeGraph(game?: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null): boolean {
  const resolved = resolvedRunGame(game);
  return Boolean(resolved?.knowledge.gameSources?.includes("code_graph"));
}
