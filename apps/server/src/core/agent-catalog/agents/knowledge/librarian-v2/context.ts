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
  /** Short git revision of the checkout head; the only revision a `code://` citation may carry. */
  headRevision?: string;
  /** Present only on the rejection-gate retry turn: the prior proposal and what the apply layer rejected. */
  retry?: {
    previous_proposal: unknown;
    rejections: unknown;
  };
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const LIBRARIAN_V2_TURN_PROMPT = [
  "Use the injected librarian V2 context packet.",
  "Read <pass> for the pathway and head revision, then process the one index task: run the rename and drift audit on the touched subjects, read the triggering object, decide per subject whether it reveals something new, confirms what stands, or teaches nothing, and return exactly one librarian_pass_v1 proposal JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, LIBRARIAN_V2_TURN_PROMPT),
);

const LIBRARIAN_V2_CONTEXT_TEMPLATE = `<pass>
This is a \`{{PATHWAY}}\` pass. {{INSTRUCTION}}

- pathway: \`{{PATHWAY}}\`
- head_revision: \`{{HEAD_REVISION}}\` — the checkout head; the only git revision a \`code://\` citation may carry.
</pass>

<task>
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
The subjects the triggering object actually touches, ordered: linked entities first, targets last. These are the only subjects you may write; each one is owed a decision.

- Each entry carries its current knowledge record and its material — a target entry brings its source span, analogs, grouped ledger, and status; a translation unit entry brings its members and recent pull requests.
- A target entry carries \`renamed_from\`: stable keys of rows that reconciliation marked as moved into it. Non-empty means its facts were written under an old symbol and need the rename audit.
- An entry may carry \`drift\`: the \`code://\` citations on its facts that no longer match the head (\`status: drifted\`) or no longer resolve (\`status: unresolvable\`), each with its \`fact_id\`, \`fact_type\`, \`locator\`, and, when known, \`head_locator\`. The pass is not done while any entry remains.

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
</output_contract>{{RETRY_BLOCK}}`;

const LIBRARIAN_V2_RETRY_TEMPLATE = `

<retry>
This is the one retry turn of the rejection gate. Your previous proposal was validated in dry run and the items below were rejected; nothing was written. Each rejection carries its reason and the fix.

- Reply with the full corrected proposal, not a delta: keep every item that was not rejected, fix or drop each rejected one.
- Do not repeat a rejected item unchanged; whatever is still rejected after this turn is dropped.

Previous proposal:
\`\`\`json
{{PREVIOUS_PROPOSAL_JSON}}
\`\`\`

Rejections:
\`\`\`json
{{REJECTIONS_JSON}}
\`\`\`
</retry>`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildLibrarianV2KernelContext(
  options: LibrarianV2PromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const task = isRecord(options.task) ? options.task : {};
  const values = {
    PATHWAY: typeof task.pathway === "string" ? task.pathway : "unknown",
    INSTRUCTION: typeof task.instruction === "string" ? task.instruction : "",
    HEAD_REVISION: options.headRevision ?? "unknown",
    TASK_JSON: stableJson(options.task),
    OBJECT_JSON: stableJson(options.object),
    TOUCHED_SUBJECTS_JSON: stableJson(options.touchedSubjects),
    SUPPORTING_SUBJECTS_JSON: stableJson(options.supportingSubjects),
    DECOMP_STANDARDS_JSON: stableJson(options.decompStandards ?? "No standards supplied."),
    LIBRARIAN_V2_OUTPUT_SCHEMA_JSON: stableJson(
      JSON.parse(readFileSync(schemaPath(), "utf8")),
    ),
    RETRY_BLOCK: options.retry === undefined
      ? ""
      : renderTemplate(LIBRARIAN_V2_RETRY_TEMPLATE, {
        PREVIOUS_PROPOSAL_JSON: stableJson(options.retry.previous_proposal),
        REJECTIONS_JSON: stableJson(options.retry.rejections),
      } as unknown as PromptTemplateValues),
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
