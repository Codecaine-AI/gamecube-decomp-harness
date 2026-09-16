import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gameLayoutPath } from "./config.js";
import type { ResolvedGame } from "./resolver.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Pin effective configuration and referenced inputs, excluding filesystem health warnings and credentials. */
export function gameConfigurationRevision(game: ResolvedGame): string {
  const { warnings: _warnings, ...effective } = game;
  const inputs: Record<string, unknown> = {};
  let bindingsRoot: string | undefined;
  const read = (path: string): Record<string, unknown> => {
    if (!existsSync(path)) { inputs[path] = null; return {}; }
    const value = JSON.parse(readFileSync(path, "utf8"));
    inputs[path] = value;
    return value;
  };
  const localPath = game.localOverridePath ?? gameLayoutPath(game.gameDir, "config/local.json");
  for (const path of [game.descriptorPath, localPath]) {
    const value = read(path);
    const config = value.config as Record<string, unknown> | undefined;
    let tools = value.tools as Record<string, unknown> | undefined;
    if (config && typeof config === "object") for (const [section, reference] of Object.entries(config)) {
      for (const item of Array.isArray(reference) ? reference : [reference]) if (typeof item === "string") {
        const contents = read(resolve(game.gameDir, item));
        if (section === "tools") tools = { ...contents, ...tools };
      }
    }
    if (typeof tools?.bindingsRoot === "string") bindingsRoot = resolve(game.gameDir, tools.bindingsRoot);
    if (Array.isArray(value.sources)) for (const source of value.sources) if (typeof source === "string") read(resolve(game.gameDir, source));
  }
  bindingsRoot ??= gameLayoutPath(game.gameDir, "config/tools");
  if (existsSync(bindingsRoot)) for (const entry of readdirSync(bindingsRoot).sort()) {
    if (entry.endsWith(".json")) read(resolve(bindingsRoot, entry));
  }
  return createHash("sha256").update(JSON.stringify(canonical({ effective, inputs }))).digest("hex");
}
