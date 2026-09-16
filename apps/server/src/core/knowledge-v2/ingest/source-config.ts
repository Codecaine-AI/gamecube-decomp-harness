import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { validateSourceDefinitions, type SourceDefinition } from "./source-pipeline.js";

/** All references are relative to the game root, including config/sources files. */
export function sourceConfigPath(gameRoot: string, path: string): string {
  if (isAbsolute(path)) throw new Error("Source paths must be relative to their game root");
  const resolved = resolve(gameRoot, path);
  const local = relative(resolve(gameRoot), resolved);
  if (local === ".." || local.startsWith("../")) throw new Error("Source path escapes its game root");
  return resolved;
}
export function loadGameSources(gameRoot: string, gameId: string): SourceDefinition[] {
  const descriptor = JSON.parse(readFileSync(resolve(gameRoot, "game.json"), "utf8"));
  if ((descriptor.id ?? descriptor.game_id) !== gameId) throw new Error("Game descriptor identity does not match source owner");
  const entries = descriptor.sources ?? descriptor.config?.sources;
  if (!Array.isArray(entries)) throw new Error(`Game ${gameId} must explicitly declare sources, including an empty array when none are configured`);
  const sources = entries.flatMap((entry: unknown) => {
    const value = typeof entry === "string" ? JSON.parse(readFileSync(sourceConfigPath(gameRoot, entry), "utf8")) : entry;
    return Array.isArray(value) ? value : [value];
  }) as SourceDefinition[];
  validateSourceDefinitions(gameId, sources);
  return sources;
}
export function configuredSourcePath(gameRoot: string, source: SourceDefinition, key: string): string {
  const path = source.configuration.scope[key];
  if (typeof path !== "string" || !path.trim()) throw new Error(`Source ${source.identity.source_id} requires scope.${key}`);
  return sourceConfigPath(gameRoot, path);
}
