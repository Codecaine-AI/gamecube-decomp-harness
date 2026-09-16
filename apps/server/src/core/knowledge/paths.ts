import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gameLayoutPath, readGameConfigWithLocal } from "../game-registry/config.js";

interface SourceRegistryEntry {
  id: string;
  path?: string;
  active?: boolean;
}

interface SourceRegistryFile {
  sources?: Array<string | SourceRegistryEntry>;
}

export function packageRoot(): string {
  return fileURLToPath(new URL("../../../../..", import.meta.url));
}

export function knowledgeRoot(): string {
  return gameKnowledgeRoot();
}

export function gameKnowledgeRoot(gameId = "melee"): string {
  const override = process.env.ORCH_GAME_KNOWLEDGE_ROOT
    ?? process.env.ORCHESTRATOR_GAME_KNOWLEDGE_ROOT;
  if (override) return isAbsolute(override) ? override : resolve(packageRoot(), override);
  return resolve(gameRoot(gameId), "knowledge");
}

export function pastPrsRoot(): string {
  return sourceDataRoot("past_prs");
}

export function sourceDataRoot(sourceId: string): string {
  return resolve(sourceStorageRoot(sourceId), "data");
}

export function knowledgeSourcesRoot(): string {
  return resolve(gameKnowledgeRoot(), "sources");
}

export function sourceRoot(sourceId: string): string {
  return resolve(knowledgeSourcesRoot(), sourceRegistryPath(sourceId));
}

export function sourceStorageRoot(sourceId: string): string {
  return resolve(gameKnowledgeRoot(), "sources", sourceRegistryPath(sourceId));
}

export function codeGraphFunctionsIndexPath(): string {
  return resolve(sourceStorageRoot("code_graph"), "indexes/functions.jsonl");
}

export function knowledgeSourceRegistryPath(): string {
  return resolve(knowledgeSourcesRoot(), "registry.json");
}

export function toolsRoot(): string {
  return toolpackRoot();
}

export function knowledgeToolsRoot(): string {
  return toolsRoot();
}

export function knowledgeToolRegistryPath(): string {
  return toolpackToolRegistryPath();
}

export function toolpacksRoot(): string {
  return resolve(packageRoot(), "toolpacks");
}

export function defaultToolpackId(): string {
  return process.env.ORCH_DEFAULT_TOOLPACK_ID ?? "gamecube-decomp";
}

export function toolpackRoot(toolpackId = defaultToolpackId()): string {
  const override = process.env.ORCH_TOOLPACK_ROOT;
  if (override && toolpackId === defaultToolpackId()) {
    return isAbsolute(override) ? override : resolve(packageRoot(), override);
  }
  return resolve(toolpacksRoot(), toolpackId);
}

export function toolpackRegistryPath(toolpackId = defaultToolpackId()): string {
  return resolve(toolpackRoot(toolpackId), "toolpack.json");
}

export function toolpackToolRegistryPath(toolpackId = defaultToolpackId()): string {
  return resolve(toolpackRoot(toolpackId), "registry.json");
}

export function gameRoot(gameId = "melee"): string {
  return resolve(packageRoot(), "games", gameId);
}

export function gameToolBindingRoot(gameId = "melee"): string {
  return configuredToolPath(gameId, "bindingsRoot") ?? gameLayoutPath(gameRoot(gameId), "config/tools");
}

export function gameSharedToolDataRoot(gameId = "melee"): string {
  return configuredToolPath(gameId, "sharedDataRoot") ?? gameLayoutPath(gameRoot(gameId), "runtime/tool-data");
}

export function gameWorktreeRoot(gameId = "melee", worktreeId = "main"): string {
  return gameLayoutPath(gameRoot(gameId), `workspace/staging/${worktreeId}`);
}

export function gameWorktreeToolCacheRoot(gameId = "melee", worktreeId = "main"): string {
  return configuredToolPath(gameId, "worktreeCacheRoot", worktreeId)
    ?? gameLayoutPath(gameRoot(gameId), `runtime/tool-data/claims/${worktreeId}`);
}

function configuredToolPath(gameId: string, key: string, worktreeId = "main"): string | undefined {
  const root = gameRoot(gameId);
  const descriptorPath = resolve(root, "game.json");
  if (!existsSync(descriptorPath)) return undefined;
  const config = readGameConfigWithLocal(descriptorPath);
  const value = (config.tools as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" && value.trim()
    ? resolve(root, value.replaceAll("{game_id}", gameId).replaceAll("{worktree_id}", worktreeId))
    : undefined;
}

export function resourceGraphRoot(): string {
  return resolve(knowledgeRoot(), "resource_graph");
}

export function resourceGraphEnrichmentsRoot(): string {
  return resolve(resourceGraphRoot(), "enrichments");
}

export function agentSharedStateEnrichmentPath(): string {
  return resolve(resourceGraphEnrichmentsRoot(), "agent_shared_state_lessons.jsonl");
}

export function knowledgeCuratorEnrichmentPath(): string {
  return resolve(resourceGraphEnrichmentsRoot(), "knowledge_curator_updates.jsonl");
}

export function resourceGraphDbPath(): string {
  return resolve(gameRoot("melee"), "graph/graph.sqlite");
}

function sourceRegistryPath(sourceId: string): string {
  const path = knowledgeSourceRegistryPath();
  if (!existsSync(path)) return sourceId;
  const registry = JSON.parse(readFileSync(path, "utf8")) as SourceRegistryFile;
  for (const entry of registry.sources ?? []) {
    const normalized = typeof entry === "string" ? { id: entry, path: entry } : entry;
    if (normalized.id === sourceId) return normalized.path ?? normalized.id;
  }
  return sourceId;
}

/** Knowledge databases live in the canonical game-owned store and index directories. */
export function knowledgeStorePath(root: string): string {
  return gameLayoutPath(root, "store/knowledge.sqlite");
}
export function knowledgeIndexPath(root: string): string {
  return gameLayoutPath(root, "indexes/knowledge-index.sqlite");
}
