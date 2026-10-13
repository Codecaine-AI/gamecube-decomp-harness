import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gameKnowledgeRoot } from "../../knowledge/paths.js";
import { configuredSourcePath, loadGameSources } from "../ingest/source-config.js";
import { createEmptyPrArchive, createPastPrsArchive, type PrArchive } from "./pr-archive.js";

/**
 * The past-PR archive of one game: its enabled `pr` source's capture root and
 * upstream, resolved beside the game's knowledge root (as `kg2-index` does).
 * A game without a PR source, or whose descriptor cannot be read, gets an
 * empty archive, never another game's discussion.
 */
export function createGamePastPrsArchive(gameId = "melee"): PrArchive {
  const gameRoot = dirname(resolve(gameKnowledgeRoot(gameId)));
  if (!existsSync(resolve(gameRoot, "game.json"))) return createEmptyPrArchive();
  try {
    const prSource = loadGameSources(gameRoot, gameId)
      .find((source) => source.identity.kind === "pr" && source.configuration.enabled);
    return prSource
      ? createPastPrsArchive(configuredSourcePath(gameRoot, prSource, "capture_root"), prSource.identity.upstream)
      : createEmptyPrArchive();
  } catch {
    return createEmptyPrArchive();
  }
}
