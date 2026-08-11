/**
 * Shared types for composing Pi custom tools from reusable agent capabilities.
 *
 * The orchestrator keeps this interface intentionally small instead of tying
 * every caller to Pi SDK internals. The objects still match the SDK's custom
 * tool shape at runtime, while agent code can resolve tools by id, role, and
 * project context.
 */
import type { RunProjectMetadata, RuntimeAgentRole } from "@server/core/shared/types";
import type { ToolPlatform } from "./platform.js";

export interface AgentToolRuntimeContext {
  role: RuntimeAgentRole;
  cwd: string;
  repoRoot: string;
  stateDir?: string;
  project?: RunProjectMetadata;
  toolPlatform?: ToolPlatform;
  worktreeId?: string;
  packet?: Record<string, unknown>;
  initialBoardPath?: string;
  workerLogDir?: string;
  /** Authoritative target claim id; stamped into tool telemetry, never model-authored. */
  claimId?: string;
  /** Worker repair-loop attempt index for tool telemetry. */
  attemptIndex?: number;
}

export interface PiToolTextContent {
  type: "text";
  text: string;
}

export interface PiToolResult {
  content: PiToolTextContent[];
  details?: unknown;
}

export interface PiToolDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: Record<string, unknown>;
  executionMode?: "parallel" | "sequential";
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: unknown,
  ): Promise<PiToolResult>;
}

export interface AgentToolRegistration {
  id: string;
  purpose: string;
  allowedRoles?: RuntimeAgentRole[];
  capabilities: string[];
  create(context: AgentToolRuntimeContext): PiToolDefinition;
}

export interface AgentToolProfileInput {
  replace?: string[];
  enable?: string[];
  disable?: string[];
}

export interface AgentToolPromptMetadata {
  provider: string;
  type: string;
  useWhen: string;
}
