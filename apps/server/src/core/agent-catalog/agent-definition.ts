import {
  defineAgent as defineKernelAgent,
  type AgentManifest,
  type AgentPrivateTools,
  type NormalizedAgentManifest,
} from "@agent-kernel/kernel/agent-definition";
import type { AgentContextResolver } from "@agent-kernel/kernel/context";
import type { PromptDocument } from "@codecaine-ai/prompt-kit";

export interface HarnessAgentSidecars<TRuntime = unknown> {
  prompt: PromptDocument | string;
  context: AgentContextResolver | null;
  tools: AgentPrivateTools<TRuntime> | null;
  canSpawnSubagent: false;
}

export type HarnessAgentDefinition<TRuntime = unknown> =
  NormalizedAgentManifest & HarnessAgentSidecars<TRuntime>;

export type HarnessAgentConfig<TRuntime = unknown> =
  AgentManifest & HarnessAgentSidecars<TRuntime>;

/**
 * Validate the live kernel's pure manifest, then retain the harness-owned
 * prompt/context/tools sidecars used by the in-process catalog conversion.
 */
export function defineHarnessAgent<TRuntime = unknown>(
  config: HarnessAgentConfig<TRuntime>,
): HarnessAgentDefinition<TRuntime> {
  const { prompt, context, tools, canSpawnSubagent, ...manifest } = config;
  if (canSpawnSubagent !== false) {
    throw new Error("Harness catalog agents cannot spawn subagents");
  }

  return {
    ...defineKernelAgent(manifest),
    prompt,
    context,
    tools,
    canSpawnSubagent: false,
  };
}
