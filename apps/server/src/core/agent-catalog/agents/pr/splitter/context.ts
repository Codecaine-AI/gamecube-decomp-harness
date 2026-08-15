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
  { kind: "pr-split-context", ref: "pr-split-context", label: "pr-split-context" },
] as const satisfies readonly LoaderDeclaration[];

export interface PrSplitterPromptOptions {
  splitContext: unknown;
  game?: RunGameMetadata;
  repoRoot?: string;
  stateDir?: string;
}

export const PR_SPLITTER_TURN_PROMPT = [
  "Use the injected PR splitter context packet.",
  "Plan the PR split from the deterministic evidence and return only the JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, PR_SPLITTER_TURN_PROMPT),
);

const PR_SPLITTER_CONTEXT_TEMPLATE = `Plan the PR split from the deterministic evidence below.

{{AVAILABLE_TOOLS_XML}}

<decomp_standards>
{{DECOMP_STANDARDS_XML}}
</decomp_standards>

<split_context>
\`\`\`json
{{PR_SPLITTER_CONTEXT_JSON}}
\`\`\`
</split_context>

<output_contract>
Use this top-level shape:

{{PR_SPLITTER_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return only the JSON object. Do not wrap it in Markdown.`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

function toolContext(options: PrSplitterPromptOptions): AgentToolRuntimeContext {
  const repoRoot = options.repoRoot ?? ".";
  return {
    role: "pr-splitter",
    cwd: repoRoot,
    repoRoot,
    stateDir: options.stateDir,
    game: options.game,
  };
}

function splitterContextPacket(options: PrSplitterPromptOptions): string {
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    PR_SPLITTER_CONTEXT_JSON: stableJson(options.splitContext),
    PR_SPLITTER_OUTPUT_SCHEMA_JSON: stableJson(JSON.parse(readFileSync(schemaPath(), "utf8"))),
  } as unknown as PromptTemplateValues;
  return renderTemplate(PR_SPLITTER_CONTEXT_TEMPLATE, values);
}

export function buildPrSplitterKernelContext(options: PrSplitterPromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const renderedContext = splitterContextPacket(options);
  return {
    turnPrompt: PR_SPLITTER_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "pr-split-context",
        inputRef: "pr-split-context",
        content: renderedContext,
      },
    ],
  };
}

export default context;
