/**
 * Agent tool profiles and override resolution.
 *
 * Defaults live here, while project or run configuration can pass enable,
 * disable, or replace overrides through the runtime without changing prompt
 * templates. This keeps agent/tool composition explicit and testable.
 */
import type { RuntimeAgentRole } from "@server/core/shared/types";
import { agentToolSummary, createAgentTools } from "../runtime/registry.js";
import type {
  AgentToolProfileInput,
  AgentToolPromptMetadata,
  AgentToolRuntimeContext,
  PiToolDefinition,
} from "../types.js";
import { capabilityToolPromptMetadata } from "../metadata/capabilities.js";
import { knowledgeToolPromptMetadata } from "../metadata/knowledge.js";
import {
  defaultIntegrationResolverToolProfile,
  defaultKnowledgeCuratorToolProfile,
  defaultPrFixerToolProfile,
  defaultPrIndexerToolProfile,
  defaultPrSplitterToolProfile,
  defaultQaRepairToolProfile,
  defaultReconcileToolProfile,
  defaultWorkerToolProfile,
} from "./defaults.js";

export {
  defaultIntegrationResolverToolProfile,
  defaultKnowledgeCuratorToolProfile,
  defaultPrFixerToolProfile,
  defaultPrIndexerToolProfile,
  defaultPrSplitterToolProfile,
  defaultQaRepairToolProfile,
  defaultReconcileToolProfile,
  defaultWorkerToolProfile,
} from "./defaults.js";

const agentToolPromptMetadata: Record<string, AgentToolPromptMetadata> = {
  ...knowledgeToolPromptMetadata,
  ...capabilityToolPromptMetadata,
};

export const defaultAgentToolProfiles: Record<RuntimeAgentRole, string[]> = {
  worker: [...defaultWorkerToolProfile],
  "integration-resolver": [...defaultIntegrationResolverToolProfile],
  "pr-indexer": [...defaultPrIndexerToolProfile],
  "pr-reviewer": [],
  "pr-fixer": [...defaultPrFixerToolProfile],
  "pr-splitter": [...defaultPrSplitterToolProfile],
  "knowledge-curator": [...defaultKnowledgeCuratorToolProfile],
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

/** Build concrete Pi custom tools for the role and runtime context. */
export function buildAgentTools(
  context: AgentToolRuntimeContext,
  profile?: AgentToolProfileInput,
): PiToolDefinition[] {
  return createAgentTools(resolveAgentToolIds(context.role, profile), context);
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
