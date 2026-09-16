import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readObject(path: string): Record<string, unknown> {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected JSON object in ${path}`);
  }
  return value;
}

/** Referenced configuration and its relative paths are rooted at the game directory. */
export function readGameDescriptorConfig(path: string): Record<string, unknown> {
  const value = readObject(path);
  const files = value.config;
  if (files === undefined) return value;
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error(`Expected config references in ${path}`);
  }
  const resolved = { ...value };
  for (const [section, reference] of Object.entries(files)) {
    if (!["build", "sandbox", "tools"].includes(section)) continue;
    if (typeof reference !== "string" || !reference.trim()) {
      throw new Error(`Invalid config.${section} reference in ${path}`);
    }
    const key = section === "build" ? "validation" : section;
    const inline = value[key];
    resolved[key] = {
      ...readObject(resolve(dirname(path), reference)),
      ...(inline && typeof inline === "object" && !Array.isArray(inline) ? inline : {}),
    };
  }
  return resolved;
}

/** Game-owned paths always use the configured grouped layout. */
export function gameLayoutPath(gameDir: string, relativePath: string): string {
  return resolve(gameDir, relativePath);
}

export function readGameConfigWithLocal(path: string): Record<string, unknown> {
  const base = readGameDescriptorConfig(path);
  const localPath = gameLayoutPath(dirname(path), "config/local.json");
  if (!existsSync(localPath)) return base;
  const local = readObject(localPath);
  if (local.id !== undefined && local.id !== base.id) throw new Error(`Local game override ${localPath} has a different id`);
  const merged = { ...base, ...local };
  for (const key of ["validation", "tools"]) {
    const first = base[key];
    const second = local[key];
    if (second !== undefined && (!second || typeof second !== "object" || Array.isArray(second))) {
      throw new Error(`Invalid ${key} in ${localPath}`);
    }
    merged[key] = { ...(first && typeof first === "object" ? first : {}), ...(second && typeof second === "object" ? second : {}) };
  }
  return merged;
}
