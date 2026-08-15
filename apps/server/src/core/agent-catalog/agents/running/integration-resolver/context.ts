import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { globalStandardsPromptXml } from "@server/core/knowledge";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "@server/core/tools/index.js";
import { renderTemplate, stableJson, type PromptTemplateValues } from "@server/infrastructure/agent-runtime/runtime";
import {
  createInlineAgentContextResolver,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";

const loaders = [
  rootContextLoaderDeclaration,
  { kind: "integration-conflict-item", ref: "integration-conflict-item", label: "integration-conflict-item" },
  { kind: "integration-queue-summary", ref: "integration-queue-summary", label: "integration-queue-summary" },
] as const satisfies readonly LoaderDeclaration[];

export interface IntegrationResolverPromptOptions {
  integrationItem: unknown;
  queueSummary?: unknown;
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const INTEGRATION_RESOLVER_TURN_PROMPT = [
  "Use the injected integration resolver context packet.",
  "Resolve the running-phase worker-output queue item, validate what you can, and return exactly one JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, INTEGRATION_RESOLVER_TURN_PROMPT),
);

const INTEGRATION_CONFLICT_CONTEXT_TEMPLATE = `<task>
    Resolve this running-phase worker-output integration queue item before PR handoff.
    Make the smallest conflict-resolution edits, validate what you can, and return exactly one JSON object.
</task>

{{AVAILABLE_TOOLS_XML}}

{{DECOMP_STANDARDS_XML}}

<integration_conflict_item>
{{INTEGRATION_CONFLICT_ITEM_JSON}}
</integration_conflict_item>

<output_contract>
Use this top-level shape:

{{INTEGRATION_RESOLVER_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return exactly one JSON object.`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

function toolContext(options: IntegrationResolverPromptOptions): AgentToolRuntimeContext {
  const repoRoot = options.repoRoot ?? ".";
  return {
    role: "integration-resolver",
    cwd: repoRoot,
    repoRoot,
    stateDir: options.stateDir,
    game: options.game,
  };
}

export function buildIntegrationResolverKernelContext(options: IntegrationResolverPromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    INTEGRATION_CONFLICT_ITEM_JSON: stableJson(options.integrationItem),
    INTEGRATION_RESOLVER_OUTPUT_SCHEMA_JSON: stableJson(JSON.parse(readFileSync(schemaPath(), "utf8"))),
  } as unknown as PromptTemplateValues;
  const conflictContext = renderTemplate(INTEGRATION_CONFLICT_CONTEXT_TEMPLATE, values);
  const queueSummaryContext = `<integration_queue_summary>\n${stableJson(options.queueSummary ?? {})}\n</integration_queue_summary>`;
  const renderedContext = [conflictContext, queueSummaryContext].join("\n\n");
  return {
    turnPrompt: INTEGRATION_RESOLVER_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "integration-conflict-item",
        inputRef: "integration-conflict-item",
        content: conflictContext,
      },
      {
        loaderKind: "integration-queue-summary",
        inputRef: "integration-queue-summary",
        content: queueSummaryContext,
      },
    ],
  };
}

export default context;
