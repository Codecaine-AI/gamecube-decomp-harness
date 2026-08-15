import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { globalStandardsPromptXml, standardExamplesPromptXml } from "@server/core/knowledge";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "@server/core/tools/index.js";
import { renderTemplate, stableJson, type PromptTemplateValues } from "@server/infrastructure/agent-runtime/runtime";
import {
  createInlineAgentContextResolver,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";

const loaders = [
  rootContextLoaderDeclaration,
  { kind: "pr-fixer-context", ref: "pr-fixer-context", label: "pr-fixer-context" },
  { kind: "standard-examples", ref: "standard-examples", label: "standard-examples" },
] as const satisfies readonly LoaderDeclaration[];

export interface PrFixerPromptOptions {
  fixerContext: unknown;
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const PR_FIXER_TURN_PROMPT = [
  "Use the injected PR fixer context packet.",
  "Resolve the supplied PR feedback, validate what you can, and return exactly one JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, PR_FIXER_TURN_PROMPT),
);

const PR_FIXER_CONTEXT_TEMPLATE = `<task>
    Resolve the supplied PR feedback on this branch.
    Make focused edits, validate what you can, and return exactly one JSON object.
</task>

{{AVAILABLE_TOOLS_XML}}

{{DECOMP_STANDARDS_XML}}

<pr_fixer_context>
{{PR_FIXER_CONTEXT_JSON}}
</pr_fixer_context>

<output_contract>
Use this top-level shape:

{{PR_FIXER_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return exactly one JSON object.`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function collectExampleSelectors(value: unknown, selectors: { standardIds: Set<string>; qaRuleIds: Set<string> }, depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectExampleSelectors(item, selectors, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  const standardId = stringValue(value.standard_id ?? value.standardId);
  const ruleId = stringValue(value.rule_id ?? value.ruleId);
  if (standardId) selectors.standardIds.add(standardId);
  if (ruleId) selectors.qaRuleIds.add(ruleId);
  for (const item of Object.values(value)) collectExampleSelectors(item, selectors, depth + 1);
}

function standardExamplesForContext(context: unknown): string {
  const selectors = { standardIds: new Set<string>(), qaRuleIds: new Set<string>() };
  collectExampleSelectors(context, selectors);
  return standardExamplesPromptXml({
    standardIds: selectors.standardIds,
    qaRuleIds: selectors.qaRuleIds,
    limit: selectors.standardIds.size || selectors.qaRuleIds.size ? 8 : 4,
  });
}

function toolContext(options: PrFixerPromptOptions): AgentToolRuntimeContext {
  const repoRoot = options.repoRoot ?? ".";
  return {
    role: "pr-fixer",
    cwd: repoRoot,
    repoRoot,
    stateDir: options.stateDir,
    game: options.game,
  };
}

export function buildPrFixerKernelContext(options: PrFixerPromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    PR_FIXER_CONTEXT_JSON: stableJson(options.fixerContext),
    PR_FIXER_OUTPUT_SCHEMA_JSON: stableJson(JSON.parse(readFileSync(schemaPath(), "utf8"))),
  } as unknown as PromptTemplateValues;
  const fixerContext = renderTemplate(PR_FIXER_CONTEXT_TEMPLATE, values);
  const standardExamplesContext = standardExamplesForContext(options.fixerContext);
  const renderedContext = [fixerContext, standardExamplesContext].join("\n\n");
  return {
    turnPrompt: PR_FIXER_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "pr-fixer-context",
        inputRef: "pr-fixer-context",
        content: fixerContext,
      },
      {
        loaderKind: "standard-examples",
        inputRef: "standard-examples",
        content: standardExamplesContext,
      },
    ],
  };
}

export default context;
