/**
 * Shared execution helpers for knowledge-backed Pi tools.
 *
 * These helpers are deliberately operation-oriented: source and tool ids are
 * validated against the orchestrator registries, command execution is limited
 * to known API scripts, and graph operations use in-process APIs where they
 * already exist.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runCommand } from "@server/infrastructure/shell";
import {
  fileGraphCard,
  graphDbExists,
  openKnowledgeGraph,
  packageRoot,
  readSourceRegistry,
  resourceGraphDbPath,
  relatedFunctions,
  searchKnowledgeGraph,
  sourceRoot,
} from "@server/core/knowledge";
import { registeredToolIdsForContext, runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";
import type { AgentToolRuntimeContext } from "../types.js";
import { commandToolPayload } from "./results.js";

/** Determine the graph DB path from game metadata or global defaults. */
export function graphDbForContext(context: AgentToolRuntimeContext): string {
  return context.game?.graphDbPath ?? resourceGraphDbPath();
}

/** Return the set of currently registered knowledge source ids. */
export function registeredSourceIds(): Set<string> {
  return new Set(readSourceRegistry().map((source) => source.id));
}

/** Return the set of currently registered knowledge tool ids. */
export function registeredToolIds(context: ToolRuntimeContext = {}): Set<string> {
  return registeredToolIdsForContext(context);
}

/** Run a source-local API script with fixed arguments. */
export async function runSourceApi(sourceId: string, scriptName: string, args: string[]): Promise<Record<string, unknown>> {
  if (!registeredSourceIds().has(sourceId)) {
    return {
      status: "unknown_source_id",
      source_id: sourceId,
      available_source_ids: [...registeredSourceIds()].sort(),
    };
  }
  const cwd = packageRoot();
  const scriptPath = resolve(sourceRoot(sourceId), "api", scriptName);
  if (!existsSync(scriptPath)) {
    return {
      status: "missing_api_script",
      source_id: sourceId,
      script_path: scriptPath,
    };
  }
  const command = ["python3", scriptPath, ...args];
  const result = await runCommand(cwd, command);
  return commandToolPayload({ operation: `source:${sourceId}:${scriptName}`, command, cwd, ...result });
}

/** Run a registered tool API script with fixed arguments. */
export async function runKnowledgeToolApi(toolId: string, scriptName: string, args: string[]): Promise<Record<string, unknown>> {
  return runKnowledgeToolApiForContext({}, toolId, scriptName, args);
}

/** Run a registered tool API script with game/worktree-scoped runtime context. */
export async function runKnowledgeToolApiForContext(
  context: ToolRuntimeContext,
  toolId: string,
  scriptName: string,
  args: string[],
): Promise<Record<string, unknown>> {
  if (!registeredToolIds(context).has(toolId)) {
    return {
      status: "unknown_tool_id",
      tool_id: toolId,
      available_tool_ids: [...registeredToolIds(context)].sort(),
    };
  }
  return runRegisteredToolApi(context, toolId, scriptName, args);
}

/** Search the SQLite resource graph when it is available. */
export function graphSearch(
  context: AgentToolRuntimeContext,
  query: string,
  sourceId: string | undefined,
  limit: number,
  options: { activeSourcesOnly?: boolean } = {},
): Record<string, unknown> {
  const graphDb = graphDbForContext(context);
  if (!graphDbExists(graphDb)) {
    return {
      status: "graph_missing",
      graph_db: graphDb,
    };
  }
  const store = openKnowledgeGraph(graphDb);
  try {
    return {
      status: "ok",
      graph_db: graphDb,
      query,
      source_id: sourceId || null,
      limit,
      active_sources_only: Boolean(options.activeSourcesOnly),
      results: searchKnowledgeGraph(store, { query, sourceId: sourceId || undefined, limit, activeSourcesOnly: options.activeSourcesOnly }),
    };
  } finally {
    store.db.close();
  }
}

/** Load graph-owned function analogs and call relationships. */
export function graphRelatedFunctions(
  context: AgentToolRuntimeContext,
  query: { sourcePath?: string; unit?: string; symbol?: string; entityId?: string; limit?: number },
): Record<string, unknown> {
  const graphDb = graphDbForContext(context);
  if (!query.sourcePath && !query.entityId && !(query.unit && query.symbol)) {
    return {
      status: "missing_function_selector",
      graph_db: graphDb,
    };
  }
  if (!graphDbExists(graphDb)) {
    return {
      status: "graph_missing",
      graph_db: graphDb,
    };
  }
  const store = openKnowledgeGraph(graphDb);
  try {
    return {
      status: "ok",
      graph_db: graphDb,
      ...relatedFunctions(store, query),
    };
  } finally {
    store.db.close();
  }
}

/** Load a file-card summary from the SQLite resource graph when available. */
export function graphFileCard(context: AgentToolRuntimeContext, sourcePath: string): Record<string, unknown> {
  const graphDb = graphDbForContext(context);
  if (!sourcePath) {
    return {
      status: "missing_source_path",
      graph_db: graphDb,
    };
  }
  if (!graphDbExists(graphDb)) {
    return {
      status: "graph_missing",
      graph_db: graphDb,
      source_path: sourcePath,
    };
  }
  const store = openKnowledgeGraph(graphDb);
  try {
    return {
      status: "ok",
      graph_db: graphDb,
      file_card: fileGraphCard(store, sourcePath),
    };
  } finally {
    store.db.close();
  }
}
