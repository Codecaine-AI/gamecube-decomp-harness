import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import {
  createInlineAgentContextResolver,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";
import {
  renderTemplate,
  stableJson,
  type PromptTemplateValues,
} from "@server/infrastructure/agent-runtime/runtime";

const loaders = [
  rootContextLoaderDeclaration,
  {
    kind: "librarian-v2-context",
    ref: "librarian-v2-context",
    label: "librarian-v2-context",
  },
] as const satisfies readonly LoaderDeclaration[];

export interface LibrarianV2PromptOptions {
  task: unknown;
  object: unknown;
  subjectRecords: unknown;
  searchResults: unknown;
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const LIBRARIAN_V2_TURN_PROMPT = [
  "Use the injected librarian V2 context packet.",
  "Process the one index task, assess the current subject records, pre-supplied results, and your own tool results, then return exactly one librarian_pass_v1 proposal envelope.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, LIBRARIAN_V2_TURN_PROMPT),
);

const LIBRARIAN_V2_CONTEXT_TEMPLATE = `<task>
The index_task, including its pathway and payload:
\`\`\`json
{{TASK_JSON}}
\`\`\`
</task>

<object>
The triggering object (run with submissions and proposal, pull_request with archived discussion references, appended source slice, or flagged facts):
\`\`\`json
{{OBJECT_JSON}}
\`\`\`
</object>

<subject_records>
Current live facts, links, and evidence for the subjects in scope (the assembled knowledge-record view):
\`\`\`json
{{SUBJECT_RECORDS_JSON}}
\`\`\`
</subject_records>

<search_results>
Pre-supplied search results, if any. Run your own tool searches on top of them:
\`\`\`json
{{SEARCH_RESULTS_JSON}}
\`\`\`
</search_results>

<output_contract>
Return this exact librarian_pass_v1 LLM-emitted shape:

\`\`\`json
{{LIBRARIAN_V2_OUTPUT_SCHEMA_JSON}}
\`\`\`
</output_contract>

Return exactly one JSON object.`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

export function buildLibrarianV2KernelContext(
  options: LibrarianV2PromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    TASK_JSON: stableJson(options.task),
    OBJECT_JSON: stableJson(options.object),
    SUBJECT_RECORDS_JSON: stableJson(options.subjectRecords),
    SEARCH_RESULTS_JSON: stableJson(
      options.searchResults ?? "No pre-supplied results. Run your own tool searches.",
    ),
    LIBRARIAN_V2_OUTPUT_SCHEMA_JSON: stableJson(
      JSON.parse(readFileSync(schemaPath(), "utf8")),
    ),
  } as unknown as PromptTemplateValues;
  const renderedContext = renderTemplate(LIBRARIAN_V2_CONTEXT_TEMPLATE, values);
  return {
    turnPrompt: LIBRARIAN_V2_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "librarian-v2-context",
        inputRef: "librarian-v2-context",
        content: renderedContext,
      },
    ],
  };
}

export default context;
