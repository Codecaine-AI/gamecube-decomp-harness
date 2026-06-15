/**
 * Public entry point for agent Pi tool composition.
 *
 * Consumers should resolve profiles through this module instead of importing
 * individual tool files directly. That leaves room for project-local overrides,
 * role-specific bundles, and future Pi extension packaging.
 */
export { agentToolRegistry, agentToolSummary, createAgentTools, type AgentToolId } from "./registry.js";
export {
  agentToolProfileSummary,
  availableToolsPromptXml,
  buildAgentTools,
  defaultAgentToolProfiles,
  defaultKnowledgeCuratorToolProfile,
  defaultPrReviewToolProfile,
  defaultQaRepairToolProfile,
  defaultReconcileToolProfile,
  defaultWorkerToolProfile,
  resolveAgentToolIds,
} from "./profiles.js";
export type { AgentToolProfileInput, AgentToolRegistration, AgentToolRuntimeContext, PiToolDefinition, PiToolResult } from "./types.js";
