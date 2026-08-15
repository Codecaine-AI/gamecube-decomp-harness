import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { QaRepairQueueItem } from "@server/core/validation/qa/repair-lane";
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
  { kind: "qa-repair-item", ref: "qa-repair-item", label: "qa-repair-item" },
  { kind: "qa-repair-queue-summary", ref: "qa-repair-queue-summary", label: "qa-repair-queue-summary" },
  { kind: "standard-examples", ref: "standard-examples", label: "standard-examples" },
] as const satisfies readonly LoaderDeclaration[];

export interface QaRepairPromptOptions {
  item: QaRepairQueueItem;
  queueSummary?: unknown;
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const QA_REPAIR_TURN_PROMPT = [
  "Use the injected QA repair context packet.",
  "Repair the listed findings, validate what you can, and return exactly one JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, QA_REPAIR_TURN_PROMPT),
);

const QA_REPAIR_ITEM_CONTEXT_TEMPLATE = `<task>
    Repair the QA findings for this candidate file.
    Make minimal edits, validate what you can, and return exactly one JSON object.
</task>

{{AVAILABLE_TOOLS_XML}}

<qa_repair_item>
{{QA_REPAIR_ITEM_JSON}}
</qa_repair_item>

Return exactly one JSON object.`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

function toolContext(options: QaRepairPromptOptions): AgentToolRuntimeContext {
  const repoRoot = options.repoRoot ?? ".";
  return {
    role: "qa-repair",
    cwd: repoRoot,
    repoRoot,
    stateDir: options.stateDir,
    game: options.game,
  };
}

function exampleSelectors(item: QaRepairQueueItem): { standardIds: string[]; qaRuleIds: string[] } {
  const standardIds = new Set<string>();
  const qaRuleIds = new Set<string>();
  for (const finding of [...item.findings, ...item.warnings]) {
    if (finding.standard_id) standardIds.add(finding.standard_id);
    if (finding.rule_id) qaRuleIds.add(finding.rule_id);
  }
  return { standardIds: [...standardIds], qaRuleIds: [...qaRuleIds] };
}

function outputContractXml(): string {
  return [
    "<output_contract>",
    "Use this top-level shape:",
    "",
    stableJson(JSON.parse(readFileSync(schemaPath(), "utf8"))),
    "</output_contract>",
  ].join("\n");
}

export function buildQaRepairKernelContext(options: QaRepairPromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const selectors = exampleSelectors(options.item);
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    QA_REPAIR_ITEM_JSON: stableJson(options.item),
  } as unknown as PromptTemplateValues;
  const qaRepairItemContext = renderTemplate(QA_REPAIR_ITEM_CONTEXT_TEMPLATE, values);
  const queueSummaryContext = `<qa_repair_queue_summary>\n${stableJson(options.queueSummary ?? {})}\n</qa_repair_queue_summary>`;
  const standardExamplesContext = [
    globalStandardsPromptXml(),
    standardExamplesPromptXml({ ...selectors, limit: 8 }),
    outputContractXml(),
  ].join("\n\n");
  const renderedContext = [qaRepairItemContext, queueSummaryContext, standardExamplesContext].join("\n\n");
  return {
    turnPrompt: QA_REPAIR_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "qa-repair-item",
        inputRef: "qa-repair-item",
        content: qaRepairItemContext,
      },
      {
        loaderKind: "qa-repair-queue-summary",
        inputRef: "qa-repair-queue-summary",
        content: queueSummaryContext,
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
