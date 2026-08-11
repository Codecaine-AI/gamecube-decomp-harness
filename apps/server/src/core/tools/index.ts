/**
 * Public entry point for agent Pi tool composition.
 *
 * Consumers should resolve profiles through this module instead of importing
 * individual tool files directly. That leaves room for project-local overrides,
 * role-specific bundles, and future Pi extension packaging.
 */
export { agentToolRegistry, agentToolSummary, createAgentTools, type AgentToolId } from "./runtime/registry.js";
export {
  agentToolProfileSummary,
  availableToolsPromptXml,
  buildAgentTools,
  defaultAgentToolProfiles,
  defaultConflictResolverToolProfile,
  defaultIntegrationResolverToolProfile,
  defaultLibrarianToolProfile,
  defaultPrSplitterToolProfile,
  defaultQaRepairToolProfile,
  defaultReconcileToolProfile,
  defaultWorkerToolProfile,
  resolveAgentToolIds,
} from "./profiles/index.js";
export type { AgentToolProfileInput, AgentToolRegistration, AgentToolRuntimeContext, PiToolDefinition, PiToolResult } from "./types.js";
export {
  hostToolPlatform,
  isHostToolPlatform,
  resolveStateToolArtifact,
  resolveToolPlatform,
  stateToolArtifactCandidates,
  TOOL_PLATFORMS,
  type ToolPlatform,
} from "./platform.js";
