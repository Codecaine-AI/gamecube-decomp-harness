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
  touchedSubjects: unknown;
  supportingSubjects: unknown;
  decompStandards: unknown;
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const LIBRARIAN_V2_TURN_PROMPT = [
  "Use the injected librarian V2 context packet.",
  "Process the one index task: read the triggering object, work the touched subjects it names, decide per subject whether it reveals something new, confirms what stands, or teaches nothing, then return exactly one librarian_pass_v1 proposal JSON object.",
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

<touched_subjects>
The subjects the triggering object actually touches, ordered: linked entities first, targets last. Each entry carries its current knowledge record and its material — a target entry brings its source span, analogs, grouped ledger, and status; a translation unit entry brings its members and recent pull requests. These are the subjects you judge; each one is owed a decision.

\`\`\`json
{{TOUCHED_SUBJECTS_JSON}}
\`\`\`
</touched_subjects>

<supporting_subjects>
Connected game concepts and patterns: context to read, not owed facts, though you may improve them when the evidence warrants.

\`\`\`json
{{SUPPORTING_SUBJECTS_JSON}}
\`\`\`
</supporting_subjects>

<decomp_standards>
House decompilation standards, injected for awareness only. They are QA-owned harness rules, not knowledge about the game: never propose a standard, or a restatement of one, as a pattern or fact; never cite a standard as evidence; never propose new standards.

\`\`\`json
{{DECOMP_STANDARDS_JSON}}
\`\`\`
</decomp_standards>

<output_contract>
\`\`\`json
{{LIBRARIAN_V2_OUTPUT_SCHEMA_JSON}}
\`\`\`
</output_contract>`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

export function buildLibrarianV2KernelContext(
  options: LibrarianV2PromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    TASK_JSON: stableJson(options.task),
    OBJECT_JSON: stableJson(options.object),
    TOUCHED_SUBJECTS_JSON: stableJson(options.touchedSubjects),
    SUPPORTING_SUBJECTS_JSON: stableJson(options.supportingSubjects),
    DECOMP_STANDARDS_JSON: stableJson(options.decompStandards ?? "No standards supplied."),
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
