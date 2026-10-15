/**
 * Agent tool profiles and override resolution.
 *
 * Defaults live here, while game or run configuration can pass enable,
 * disable, or replace overrides through the runtime without changing prompt
 * templates. This keeps agent/tool composition explicit and testable.
 */
import type { RunGameMetadata, RuntimeAgentRole } from "@server/core/shared/types";
import { agentToolSummary, createAgentTools } from "../runtime/registry.js";
import type {
  AgentToolProfileInput,
  AgentToolPromptMetadata,
  AgentToolRuntimeContext,
  PiToolDefinition,
} from "../types.js";
import { capabilityToolPromptMetadata } from "../metadata/capabilities.js";
import { knowledgeToolPromptMetadata } from "../metadata/knowledge.js";
import { knowledgeV2ToolPromptMetadata } from "../metadata/knowledge-v2.js";
import { gameSteeringGate, steeringGateActive } from "../steering-gate.js";
import {
  defaultLibrarianToolProfile,
  defaultPrSplitterToolProfile,
  defaultQaRepairToolProfile,
  defaultReconcileToolProfile,
  defaultWorkerToolProfile,
  steeringGateWorkerToolProfile,
} from "./defaults.js";

export {
  defaultLibrarianToolProfile,
  defaultPrSplitterToolProfile,
  defaultQaRepairToolProfile,
  defaultReconcileToolProfile,
  defaultWorkerToolProfile,
  steeringGateWorkerToolProfile,
} from "./defaults.js";

const agentToolPromptMetadata: Record<string, AgentToolPromptMetadata> = {
  ...knowledgeToolPromptMetadata,
  ...knowledgeV2ToolPromptMetadata,
  ...capabilityToolPromptMetadata,
};

export const defaultAgentToolProfiles: Record<RuntimeAgentRole, string[]> = {
  worker: [...defaultWorkerToolProfile],
  "pr-reviewer": [],
  "pr-splitter": [...defaultPrSplitterToolProfile],
  librarian: [...defaultLibrarianToolProfile],
  summarizer: [],
  reconcile: [...defaultReconcileToolProfile],
  "qa-repair": [...defaultQaRepairToolProfile],
};

/** Resolve built-in defaults plus optional replace/enable/disable overrides. */
export function resolveAgentToolIds(
  role: RuntimeAgentRole,
  profile?: AgentToolProfileInput,
): string[] {
  const base = profile?.replace
    ? [...profile.replace]
    : [...(defaultAgentToolProfiles[role] ?? [])];
  const enabled = [...base, ...(profile?.enable ?? [])];
  const disabled = new Set(profile?.disable ?? []);
  return [...new Set(enabled)].filter((toolId) => !disabled.has(toolId));
}

/**
 * Tool ids a role gains from its game's policy, beyond the static profile.
 * Workers on a game with an active steering gate get the real-code evidence
 * tools; every other game and role gets none, so its tool list is unchanged.
 */
export function gameGatedAgentToolIds(
  role: RuntimeAgentRole,
  game?: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null,
): string[] {
  if (role !== "worker") return [];
  return steeringGateActive(gameSteeringGate(game)) ? [...steeringGateWorkerToolProfile] : [];
}

/** resolveAgentToolIds plus the game-gated tools for the context's game. */
export function resolveAgentToolIdsForContext(
  context: Pick<AgentToolRuntimeContext, "role" | "game">,
  profile?: AgentToolProfileInput,
): string[] {
  const ids = resolveAgentToolIds(context.role, profile);
  const disabled = new Set(profile?.disable ?? []);
  const gated = gameGatedAgentToolIds(context.role, context.game)
    .filter((toolId) => !disabled.has(toolId) && !ids.includes(toolId));
  return [...ids, ...gated];
}

/** Build concrete Pi custom tools for the role and runtime context. */
export function buildAgentTools(
  context: AgentToolRuntimeContext,
  profile?: AgentToolProfileInput,
): PiToolDefinition[] {
  return createAgentTools(resolveAgentToolIdsForContext(context, profile), context);
}

function xmlAttribute(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface AvailableToolRow {
  name: string;
  label: string;
  provider: string;
  type: string;
  useWhen: string;
}

function availableToolRows(
  context: AgentToolRuntimeContext,
  profile?: AgentToolProfileInput,
): AvailableToolRow[] {
  return buildAgentTools(context, profile).map((tool) => {
    const promptInfo = agentToolPromptMetadata[tool.name];
    return {
      name: tool.name,
      label: tool.label,
      provider: promptInfo?.provider ?? "custom",
      type: promptInfo?.type ?? "other",
      useWhen: promptInfo?.useWhen ?? tool.description,
    };
  });
}

/** Render the resolved agent tool profile as a compact prompt block, without grouping. */
export function availableToolsPromptXml(
  context: AgentToolRuntimeContext,
  profile?: AgentToolProfileInput,
): string {
  const tools = availableToolRows(context, profile);

  const lines = ["    <available_tools>"];
  for (const tool of tools) {
    lines.push(
      `        <tool name="${xmlAttribute(tool.name)}" label="${xmlAttribute(tool.label)}" use_when="${xmlAttribute(tool.useWhen)}" provider="${xmlAttribute(tool.provider)}" type="${xmlAttribute(tool.type)}" />`,
    );
  }
  lines.push("    </available_tools>");
  return lines.join("\n");
}

/** Return a compact, prompt-safe summary of tools available to an agent role. */
export function agentToolProfileSummary(
  role: RuntimeAgentRole,
  profile?: AgentToolProfileInput,
): Record<string, unknown>[] {
  return agentToolSummary(resolveAgentToolIds(role, profile), role);
}
