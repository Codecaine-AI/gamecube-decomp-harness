import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  defaultToolpackId,
  packageRoot,
  gameRoot,
  toolpackRoot,
} from "@server/core/knowledge/paths";
import type { RunGameMetadata } from "@server/core/shared/types";
import { runCommand } from "@server/infrastructure/shell";
import { resolveStateToolArtifact, resolveToolPlatform, type ToolPlatform } from "./platform.js";

export interface ToolRuntimeContext {
  game?: RunGameMetadata;
  repoRoot?: string;
  stateDir?: string;
  toolPlatform?: ToolPlatform;
  worktreeId?: string;
  claimId?: string;
  packet?: Record<string, unknown>;
}

export interface GameToolConfig {
  toolpacks?: string[];
  bindingsRoot?: string;
  sharedDataRoot?: string;
  worktreeCacheRoot?: string;
}

export interface GameToolBinding {
  tool?: string;
  enabled?: boolean;
  implementation?: string;
  sharedDataRoot?: string;
  worktreeCacheRoot?: string;
  overrideToolRoot?: string;
  overrideApiRoot?: string;
  env?: Record<string, string>;
}

export interface ToolpackToolEntry {
  id: string;
  path?: string;
  category?: string;
  process_role?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface ResolvedRegisteredTool {
  toolId: string;
  toolpackId: string;
  toolpackRoot: string;
  packToolRoot: string;
  toolRoot: string;
  apiRoot: string;
  gameId: string;
  gameDir: string;
  gameRepoRoot: string;
  gameStateDir: string;
  worktreeId: string;
  bindingPath: string;
  binding: GameToolBinding;
  enabled: boolean;
  sharedDataRoot: string;
  worktreeCacheRoot: string;
  env: Record<string, string>;
  registryEntry: ToolpackToolEntry;
}

interface ToolRegistryFile {
  tools?: Array<string | ToolpackToolEntry>;
}

interface ToolpackFile {
  tools?: Array<string | ToolpackToolEntry>;
}

interface GameRuntimePaths {
  gameId: string;
  gameDir: string;
  repoRoot: string;
  stateDir: string;
  descriptorPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayField(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.map((item) => stringField(item)).filter((item): item is string => Boolean(item));
  return strings.length ? strings : undefined;
}

function stringMapField(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, item]) => [key, stringField(item)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function gameRuntimePaths(context: ToolRuntimeContext): GameRuntimePaths {
  const gameId = context.game?.gameId ?? "melee";
  const descriptorPath = context.game?.descriptorPath ?? resolve(gameRoot(gameId), "game.json");
  const gameDir = dirname(descriptorPath);
  return {
    gameId,
    gameDir,
    descriptorPath,
    repoRoot: context.repoRoot ?? context.game?.repoRoot ?? resolve(gameDir, "checkout"),
    stateDir: context.stateDir ?? context.game?.stateDir ?? resolve(gameDir, "state"),
  };
}

function gameToolsConfig(paths: GameRuntimePaths): GameToolConfig {
  const raw = readJsonObject(paths.descriptorPath);
  const tools = isRecord(raw?.tools) ? raw.tools : {};
  return {
    toolpacks: stringArrayField(tools.toolpacks),
    bindingsRoot: stringField(tools.bindingsRoot),
    sharedDataRoot: stringField(tools.sharedDataRoot),
    worktreeCacheRoot: stringField(tools.worktreeCacheRoot),
  };
}

function gameWiboPath(stateDir: string, toolPlatform: ToolPlatform): string | null {
  return resolveStateToolArtifact({ stateDir, name: "wibo", platform: toolPlatform });
}

function normalizeToolEntry(entry: string | ToolpackToolEntry): ToolpackToolEntry {
  if (typeof entry === "string") return { id: entry, path: entry };
  return { ...entry, path: entry.path ?? entry.id };
}

export function toolpackIdForContext(context: ToolRuntimeContext = {}): string {
  const paths = gameRuntimePaths(context);
  return gameToolsConfig(paths).toolpacks?.[0] ?? defaultToolpackId();
}

export function readToolpackToolEntries(toolpackId = defaultToolpackId()): ToolpackToolEntry[] {
  const root = toolpackRoot(toolpackId);
  const registryPath = resolve(root, "registry.json");
  const registry = readJsonObject(registryPath) as ToolRegistryFile | null;
  if (registry?.tools?.length) {
    return registry.tools.map(normalizeToolEntry).filter((entry) => entry.active !== false);
  }

  const toolpackPath = resolve(root, "toolpack.json");
  const toolpack = readJsonObject(toolpackPath) as ToolpackFile | null;
  return (toolpack?.tools ?? []).map(normalizeToolEntry).filter((entry) => entry.active !== false);
}

export function registeredToolIdsForContext(context: ToolRuntimeContext = {}): Set<string> {
  return new Set(readToolpackToolEntries(toolpackIdForContext(context)).map((entry) => entry.id));
}

function resolveGamePath(baseDir: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(baseDir, value);
}

function replaceTokens(value: string, tokens: Record<string, string>): string {
  let next = value;
  for (const [key, tokenValue] of Object.entries(tokens)) {
    next = next.replaceAll(`{${key}}`, tokenValue).replaceAll(`{{${key}}}`, tokenValue);
  }
  return next;
}

function specificGamePath(baseDir: string, value: string, tokens: Record<string, string>): string {
  return resolveGamePath(baseDir, replaceTokens(value, tokens));
}

function scopedToolRoot(baseDir: string, value: string, toolId: string, tokens: Record<string, string>): string {
  const rendered = replaceTokens(value, tokens);
  const rooted = resolveGamePath(baseDir, rendered);
  return rendered.includes("{tool_id}") || rendered.includes("{{tool_id}}") || rooted.endsWith(`/${toolId}`)
    ? rooted
    : resolve(rooted, toolId);
}

function bindingForTool(gameDir: string, config: GameToolConfig, toolId: string): { path: string; binding: GameToolBinding } {
  const root = resolveGamePath(gameDir, config.bindingsRoot ?? "./tool-bindings");
  const path = resolve(root, `${toolId}.json`);
  const raw = readJsonObject(path);
  if (!raw) return { path, binding: { tool: toolId, enabled: true, implementation: "default" } };
  return {
    path,
    binding: {
      tool: stringField(raw.tool) ?? toolId,
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
      implementation: stringField(raw.implementation) ?? "default",
      sharedDataRoot: stringField(raw.sharedDataRoot),
      worktreeCacheRoot: stringField(raw.worktreeCacheRoot),
      overrideToolRoot: stringField(raw.overrideToolRoot),
      overrideApiRoot: stringField(raw.overrideApiRoot),
      env: stringMapField(raw.env),
    },
  };
}

function runtimeWorktreeId(context: ToolRuntimeContext): string {
  const packetWorktree = stringField(context.packet?.worktree_id) ?? stringField(context.packet?.worktreeId);
  return context.worktreeId ?? process.env.ORCH_WORKTREE_ID ?? packetWorktree ?? context.claimId ?? "main";
}

function toolRuntimeMetadata(resolved: ResolvedRegisteredTool): Record<string, unknown> {
  return {
    toolpack_id: resolved.toolpackId,
    toolpack_root: resolved.toolpackRoot,
    tool_id: resolved.toolId,
    tool_root: resolved.toolRoot,
    api_root: resolved.apiRoot,
    game_id: resolved.gameId,
    game_dir: resolved.gameDir,
    game_repo_root: resolved.gameRepoRoot,
    game_state_dir: resolved.gameStateDir,
    worktree_id: resolved.worktreeId,
    shared_data_root: resolved.sharedDataRoot,
    worktree_cache_root: resolved.worktreeCacheRoot,
    binding_path: resolved.bindingPath,
    binding_enabled: resolved.enabled,
    registry_path: resolved.registryEntry.path ?? resolved.toolId,
  };
}

export function resolveRegisteredTool(context: ToolRuntimeContext, toolId: string): ResolvedRegisteredTool {
  const paths = gameRuntimePaths(context);
  const config = gameToolsConfig(paths);
  const toolpackId = config.toolpacks?.[0] ?? defaultToolpackId();
  const packRoot = toolpackRoot(toolpackId);
  const registryEntry = readToolpackToolEntries(toolpackId).find((entry) => entry.id === toolId);
  if (!registryEntry) {
    throw new Error(`Unknown tool id ${toolId} in toolpack ${toolpackId}`);
  }

  const { path: bindingPath, binding } = bindingForTool(paths.gameDir, config, toolId);
  const worktreeId = runtimeWorktreeId(context);
  const tokens = {
    game_id: paths.gameId,
    tool_id: toolId,
    toolpack_id: toolpackId,
    worktree_id: worktreeId,
  };
  const packToolRoot = resolve(packRoot, registryEntry.path ?? toolId);
  const toolRoot = binding.overrideToolRoot ? specificGamePath(paths.gameDir, binding.overrideToolRoot, tokens) : packToolRoot;
  const apiRoot = binding.overrideApiRoot ? specificGamePath(paths.gameDir, binding.overrideApiRoot, tokens) : resolve(toolRoot, "api");
  const sharedDataRoot = binding.sharedDataRoot
    ? specificGamePath(paths.gameDir, binding.sharedDataRoot, tokens)
    : scopedToolRoot(paths.gameDir, config.sharedDataRoot ?? "./shared/tool-data", toolId, tokens);
  const worktreeCacheRoot = binding.worktreeCacheRoot
    ? specificGamePath(paths.gameDir, binding.worktreeCacheRoot, tokens)
    : scopedToolRoot(paths.gameDir, config.worktreeCacheRoot ?? "./worktrees/{worktree_id}/tool-cache", toolId, tokens);
  const env: Record<string, string> = {
    ORCH_TOOLPACK_ID: toolpackId,
    ORCH_TOOLPACK_ROOT: packRoot,
    ORCH_TOOL_ID: toolId,
    ORCH_TOOL_ROOT: toolRoot,
    ORCH_TOOL_API_ROOT: apiRoot,
    ORCH_TOOL_SHARED_DATA_ROOT: sharedDataRoot,
    ORCH_TOOL_WORKTREE_CACHE_ROOT: worktreeCacheRoot,
    ORCH_GAME_ID: paths.gameId,
    ORCH_GAME_DIR: paths.gameDir,
    ORCH_GAME_REPO_ROOT: paths.repoRoot,
    ORCH_GAME_STATE_DIR: paths.stateDir,
    ORCH_WORKTREE_ID: worktreeId,
    ORCH_TOOL_BINDING_PATH: bindingPath,
    ORCH_TOOL_IMPL_ROOT: resolve(packRoot, "_impl/gamecube"),
  };
  const toolPlatform = resolveToolPlatform({ targetPlatform: context.toolPlatform });
  const wibo = gameWiboPath(paths.stateDir, toolPlatform);
  if (wibo) env.MWCC_WIBO = wibo;
  for (const [key, value] of Object.entries(binding.env ?? {})) {
    env[key] = replaceTokens(value, tokens);
  }

  return {
    toolId,
    toolpackId,
    toolpackRoot: packRoot,
    packToolRoot,
    toolRoot,
    apiRoot,
    gameId: paths.gameId,
    gameDir: paths.gameDir,
    gameRepoRoot: paths.repoRoot,
    gameStateDir: paths.stateDir,
    worktreeId,
    bindingPath,
    binding,
    enabled: binding.enabled !== false,
    sharedDataRoot,
    worktreeCacheRoot,
    env,
    registryEntry,
  };
}

function commandPayload(params: {
  operation: string;
  command: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): Record<string, unknown> {
  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (params.stdout.trim()) {
    try {
      parsed = JSON.parse(params.stdout);
    } catch (error) {
      parse_error = error instanceof Error ? error.message : String(error);
    }
  }
  const failed = params.exitCode !== 0 || parse_error !== null;
  return {
    operation: params.operation,
    cwd: params.cwd,
    command: params.command,
    exit_code: params.exitCode,
    tool_error: failed ? true : undefined,
    error_kind: failed ? (parse_error ? "tool_output_parse_error" : "command_failed") : undefined,
    error_summary: failed ? parse_error ?? (params.stderr.trim() || `command exited ${params.exitCode}`) : undefined,
    parsed,
    parse_error,
    stdout: parsed == null ? params.stdout : undefined,
    stderr: params.stderr || undefined,
  };
}

export async function runRegisteredToolApi(
  context: ToolRuntimeContext,
  toolId: string,
  scriptName: string,
  args: string[],
): Promise<Record<string, unknown>> {
  const toolpackId = toolpackIdForContext(context);
  const availableToolIds = [...registeredToolIdsForContext(context)].sort();
  if (!availableToolIds.includes(toolId)) {
    return { status: "unknown_tool_id", tool_id: toolId, toolpack_id: toolpackId, available_tool_ids: availableToolIds };
  }

  const resolved = resolveRegisteredTool(context, toolId);
  const resolvedTool = toolRuntimeMetadata(resolved);
  if (!resolved.enabled) {
    return { status: "disabled_tool", tool_id: toolId, resolved_tool: resolvedTool };
  }

  const scriptPath = resolve(resolved.apiRoot, scriptName);
  if (!existsSync(scriptPath)) {
    return { status: "missing_api_script", tool_id: toolId, script_path: scriptPath, resolved_tool: resolvedTool };
  }

  const cwd = packageRoot();
  const command = ["python3", scriptPath, ...args];
  const result = await runCommand(cwd, command, { env: resolved.env });
  return {
    ...commandPayload({ operation: `tool:${toolId}:${scriptName}`, command, cwd, ...result }),
    resolved_tool: resolvedTool,
  };
}

export function resolvedToolRuntimeMetadata(context: ToolRuntimeContext, toolId: string): Record<string, unknown> {
  return toolRuntimeMetadata(resolveRegisteredTool(context, toolId));
}
