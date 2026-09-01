/**
 * Central catalog for reusable Pi custom tools.
 *
 * Agent profiles refer to tools by id so a capability can be shared by worker,
 * PR indexer, curator, or future agents without duplicating prompt text or
 * command recipes.
 */
import type { RuntimeAgentRole } from "@server/core/shared/types";
import { appendWorkerToolEvent, boundedTelemetryValue, type WorkerToolEvent } from "@server/core/agent-catalog/agents/running/worker/telemetry.js";
import { capabilityToolRegistrations } from "../wrappers/capabilities.js";
import { knowledgeToolRegistrations } from "../wrappers/knowledge.js";
import { knowledgeV2ToolRegistrations } from "../wrappers/knowledge-v2.js";
import type { AgentToolRegistration, AgentToolRuntimeContext, PiToolDefinition, PiToolResult } from "../types.js";

const toolRegistrations = [
  ...knowledgeToolRegistrations,
  ...knowledgeV2ToolRegistrations,
  ...capabilityToolRegistrations,
] as const;

/** Complete reusable Pi tool catalog keyed by stable tool id. */
export const agentToolRegistry = Object.fromEntries(toolRegistrations.map((tool) => [tool.id, tool])) as Record<string, AgentToolRegistration>;

export type AgentToolId = keyof typeof agentToolRegistry;

/** Return true when the requested tool is allowed for the runtime role. */
export function toolAllowedForRole(tool: AgentToolRegistration, role: RuntimeAgentRole): boolean {
  return !tool.allowedRoles || tool.allowedRoles.includes(role);
}

function toolResultTelemetry(result: PiToolResult): Pick<WorkerToolEvent, "exit_code" | "error_kind" | "error_summary"> & { status: "ok" | "tool_error" } {
  // jsonToolResult renders the payload as JSON text; parse it back so the
  // telemetry record carries deterministic exit/error facts. Truncated or
  // non-JSON tool output degrades to a bare "ok" record.
  const text = result.content?.[0]?.text ?? "";
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const exitCode = typeof payload.exit_code === "number" ? payload.exit_code : null;
    const isToolError = payload.tool_error === true;
    return {
      status: isToolError ? "tool_error" : "ok",
      exit_code: exitCode,
      error_kind: typeof payload.error_kind === "string" ? payload.error_kind : undefined,
      error_summary: typeof payload.error_summary === "string" ? payload.error_summary : undefined,
    };
  } catch {
    return { status: "ok" };
  }
}

/** Wrap a tool so every invocation appends a deterministic tool_events.jsonl record. */
function withToolTelemetry(tool: PiToolDefinition, context: AgentToolRuntimeContext): PiToolDefinition {
  const workerLogDir = context.workerLogDir;
  if (!workerLogDir) return tool;
  const execute = tool.execute.bind(tool);
  return {
    ...tool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const startedAt = Date.now();
      const base = {
        claim_id: context.claimId,
        attempt_index: context.attemptIndex,
        tool: tool.name,
        params: boundedTelemetryValue(params),
      };
      try {
        const result = await execute(toolCallId, params, signal, onUpdate, ctx);
        appendWorkerToolEvent(workerLogDir, {
          ...base,
          ...toolResultTelemetry(result),
          duration_ms: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        appendWorkerToolEvent(workerLogDir, {
          ...base,
          status: "threw",
          error_summary: error instanceof Error ? error.message : String(error),
          duration_ms: Date.now() - startedAt,
        });
        throw error;
      }
    },
  };
}

/** Build concrete Pi tool definitions for a role after ids have been resolved. */
export function createAgentTools(toolIds: string[], context: AgentToolRuntimeContext): PiToolDefinition[] {
  const tools: PiToolDefinition[] = [];
  const seen = new Set<string>();
  for (const toolId of toolIds) {
    if (seen.has(toolId)) continue;
    seen.add(toolId);
    const registration = agentToolRegistry[toolId as AgentToolId];
    if (!registration || !toolAllowedForRole(registration, context.role)) continue;
    tools.push(withToolTelemetry(registration.create(context), context));
  }
  return tools;
}

/** Summarize a resolved profile for prompt artifacts and dry-run transcripts. */
export function agentToolSummary(toolIds: string[], role: RuntimeAgentRole): Record<string, unknown>[] {
  return toolIds
    .map((toolId) => agentToolRegistry[toolId as AgentToolId])
    .filter((tool): tool is AgentToolRegistration => Boolean(tool) && toolAllowedForRole(tool, role))
    .map((tool) => ({
      id: tool.id,
      purpose: tool.purpose,
      capabilities: tool.capabilities,
    }));
}
