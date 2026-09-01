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
    kind: "backfill-librarian-context",
    ref: "backfill-librarian-context",
    label: "backfill-librarian-context",
  },
] as const satisfies readonly LoaderDeclaration[];

export interface BackfillLibrarianPromptOptions {
  task: unknown;
  fillOutSubjects: unknown;
  supportingSubjects: unknown;
  decompStandards: unknown;
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const BACKFILL_LIBRARIAN_TURN_PROMPT = [
  "Use the injected backfill librarian context packet.",
  "Work the fill-out subjects one at a time — linked entities first, the target last — researching each across every resource before devising its facts, then return exactly one librarian_pass_v1 proposal JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, BACKFILL_LIBRARIAN_TURN_PROMPT),
);

const BACKFILL_LIBRARIAN_CONTEXT_TEMPLATE = `<task>
The task names one target and the entities directly linked to it. Fill out each of their knowledge records against the current library state, never from scratch.

\`\`\`json
{{TASK_JSON}}
\`\`\`
</task>

<fill_out_subjects>
The ordered fill-out loop: work these one at a time, in the order given — linked entities first, the target last. Each entry carries its current knowledge record; the translation unit entry carries its members and recent pull requests as material, and the target entry carries its full ledger and status. Every fill-out subject is owed research and, where the evidence supports it, facts.

\`\`\`json
{{FILL_OUT_SUBJECTS_JSON}}
\`\`\`
</fill_out_subjects>

<supporting_subjects>
Connected game concepts and patterns: context to read, not owed facts, though you may improve them when the evidence warrants.

\`\`\`json
{{SUPPORTING_SUBJECTS_JSON}}
\`\`\`
</supporting_subjects>

<decomp_standards>
House decompilation standards, injected for awareness only. These are QA-owned, deliberately authored rules — part of the harness, not knowledge about the game. They are shown so you recognize standard-mandated code shapes and do not mistake them for developer conventions: never propose a standard, or a restatement of one, as a pattern or fact; never cite a standard as evidence; never propose new standards. Standards are enforced at the ship gate, outside your output entirely.

\`\`\`json
{{DECOMP_STANDARDS_JSON}}
\`\`\`
</decomp_standards>

<output_contract>
\`\`\`json
{{BACKFILL_LIBRARIAN_OUTPUT_SCHEMA_JSON}}
\`\`\`
</output_contract>`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

export function buildBackfillLibrarianKernelContext(
  options: BackfillLibrarianPromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    TASK_JSON: stableJson(options.task),
    FILL_OUT_SUBJECTS_JSON: stableJson(options.fillOutSubjects),
    SUPPORTING_SUBJECTS_JSON: stableJson(options.supportingSubjects),
    DECOMP_STANDARDS_JSON: stableJson(options.decompStandards ?? "No standards supplied."),
    BACKFILL_LIBRARIAN_OUTPUT_SCHEMA_JSON: stableJson(
      JSON.parse(readFileSync(schemaPath(), "utf8")),
    ),
  } as unknown as PromptTemplateValues;
  const renderedContext = renderTemplate(BACKFILL_LIBRARIAN_CONTEXT_TEMPLATE, values);
  return {
    turnPrompt: BACKFILL_LIBRARIAN_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "backfill-librarian-context",
        inputRef: "backfill-librarian-context",
        content: renderedContext,
      },
    ],
  };
}

export default context;
