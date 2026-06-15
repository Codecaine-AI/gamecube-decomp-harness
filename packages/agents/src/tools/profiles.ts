/**
 * Agent tool profiles and override resolution.
 *
 * Defaults live here, while project or run configuration can pass enable,
 * disable, or replace overrides through the runtime without changing prompt
 * templates. This keeps agent/tool composition explicit and testable.
 */
import type { RuntimeAgentRole } from "@decomp-orchestrator/core/types";
import { defaultKnowledgeCuratorToolProfile, defaultPrReviewToolProfile, defaultQaRepairToolProfile, defaultReconcileToolProfile, defaultWorkerToolProfile, workerToolPromptInfo } from "./profile-data.js";
import { agentToolSummary, createAgentTools } from "./registry.js";
import type { AgentToolProfileInput, AgentToolRuntimeContext, PiToolDefinition } from "./types.js";

export { defaultKnowledgeCuratorToolProfile, defaultPrReviewToolProfile, defaultQaRepairToolProfile, defaultReconcileToolProfile, defaultWorkerToolProfile } from "./profile-data.js";

export const defaultAgentToolProfiles: Record<RuntimeAgentRole, string[]> = {
  director: [],
  worker: [...defaultWorkerToolProfile],
  "pr-review": [...defaultPrReviewToolProfile],
  "knowledge-curator": [...defaultKnowledgeCuratorToolProfile],
  reconcile: [...defaultReconcileToolProfile],
  "qa-repair": [...defaultQaRepairToolProfile],
};

/** Resolve built-in defaults plus optional replace/enable/disable overrides. */
export function resolveAgentToolIds(role: RuntimeAgentRole, profile?: AgentToolProfileInput): string[] {
  const base = profile?.replace ? [...profile.replace] : [...(defaultAgentToolProfiles[role] ?? [])];
  const enabled = [...base, ...(profile?.enable ?? [])];
  const disabled = new Set(profile?.disable ?? []);
  return [...new Set(enabled)].filter((toolId) => !disabled.has(toolId));
}

/** Build concrete Pi custom tools for the role and runtime context. */
export function buildAgentTools(context: AgentToolRuntimeContext, profile?: AgentToolProfileInput): PiToolDefinition[] {
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

function availableToolRows(context: AgentToolRuntimeContext, profile?: AgentToolProfileInput): AvailableToolRow[] {
  return buildAgentTools(context, profile).map((tool) => {
    const promptInfo = workerToolPromptInfo[tool.name];
    return {
      name: tool.name,
      label: tool.label,
      provider: promptInfo?.provider ?? "custom",
      type: promptInfo?.type ?? "other",
      useWhen: promptInfo?.useWhen ?? tool.description,
    };
  });
}

/** Render the resolved agent tool profile as a compact prompt block. */
export function availableToolsPromptXml(context: AgentToolRuntimeContext, profile?: AgentToolProfileInput): string {
  const groups = new Map<string, { provider: string; type: string; tools: AvailableToolRow[] }>();
  for (const row of availableToolRows(context, profile)) {
    const groupKey = `${row.provider}\0${row.type}`;
    const group = groups.get(groupKey) ?? { provider: row.provider, type: row.type, tools: [] };
    group.tools.push(row);
    groups.set(groupKey, group);
  }

  const lines = ["    <available_tools>"];
  for (const group of groups.values()) {
    lines.push(`        <tool_group provider="${xmlAttribute(group.provider)}" type="${xmlAttribute(group.type)}">`);
    for (const tool of group.tools) {
      lines.push(`            <tool name="${xmlAttribute(tool.name)}" label="${xmlAttribute(tool.label)}" use_when="${xmlAttribute(tool.useWhen)}" />`);
    }
    lines.push("        </tool_group>");
  }
  lines.push("    </available_tools>");
  return lines.join("\n");
}

/** Return a compact, prompt-safe summary of tools available to an agent role. */
export function agentToolProfileSummary(role: RuntimeAgentRole, profile?: AgentToolProfileInput): Record<string, unknown>[] {
  return agentToolSummary(resolveAgentToolIds(role, profile), role);
}
