import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_STATE_DIR_NAME = "runtime/state";

export interface OrchestratorConfig {
  schemaVersion: 1;
  /** Optional explicit location; relative paths resolve against the orchestrator root. */
  stateDir?: string;
}

export function readOrchestratorConfig(root: string): OrchestratorConfig {
  const path = resolve(root, "config/orchestrator.json");
  if (!existsSync(path)) return { schemaVersion: 1 };
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid orchestrator config: ${path}`);
  }
  const config = value as Record<string, unknown>;
  if (config.schemaVersion !== 1) throw new Error(`Unsupported orchestrator schemaVersion: ${path}`);
  for (const key of Object.keys(config)) {
    if (key !== "schemaVersion" && key !== "stateDir") throw new Error(`Unknown orchestrator config field: ${key}`);
  }
  if (config.stateDir !== undefined && (typeof config.stateDir !== "string" || !config.stateDir.trim())) {
    throw new Error(`Invalid orchestrator stateDir: ${path}`);
  }
  return config as unknown as OrchestratorConfig;
}

export function resolveLocalEnvPath(root: string): string {
  return resolve(root, "config/local.env");
}

/** Resolve without creating directories, opening databases, or migrating data. */
export function resolveOrchestratorLayout(root: string, stateDirOverride?: string) {
  const packageRoot = resolve(root);
  const config = readOrchestratorConfig(packageRoot);
  const canonical = resolve(packageRoot, DEFAULT_STATE_DIR_NAME);
  const explicit = stateDirOverride ?? config.stateDir;
  let stateDir: string;
  if (explicit !== undefined) {
    if (!explicit.trim()) throw new Error("Orchestrator state directory must not be empty");
    stateDir = resolve(packageRoot, explicit);
  } else {
    stateDir = canonical;
  }
  return {
    packageRoot,
    configPath: resolve(packageRoot, "config/orchestrator.json"),
    localEnvPath: resolveLocalEnvPath(packageRoot),
    stateDir,
    // Agent Kernel owns this path independently of orchestrator state migration.
    piSessionsDir: resolve(packageRoot, ".pi-sessions"),
  };
}
