import { librarianSourceContext, type LibrarianSourceContextOptions } from "@server/core/knowledge-v2/source-context.js";
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

export interface BackfillLibrarianPromptOptions extends LibrarianSourceContextOptions {
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
  "Follow <inferred_name_contract>: inferred_name.value is one direct name; put explanation and alternatives in rationale.",
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

<source_reading_view>
The file excerpts below use proposed names to help you understand the surrounding behavior before writing facts. Inspect the whole control flow for missing operations and inconsistent interpretations.

<proposed_name_files read_only="true">
{{SOURCE_READING_VIEWS}}
</proposed_name_files>

Use knowledge_render_file to read current C source or headers with proposed function names and a canonical-symbol footer. Use this view to identify missing or inconsistent behavior, then verify it against canonical source via resolve_locator before citing evidence. A guessed name is not evidence for its own meaning. Use original symbols and paths in subjects and citations. Fields, parameters, and aggregate labels remain unchanged.
</source_reading_view>

<inferred_name_contract>
For an inferred_name write, value contains only one preferred direct name. For example, use "ftLk_SpecialN_RemoveArrow", never "A plausible original-style name is ftLk_SpecialN_RemoveArrow."

- Functions, structs, struct fields, and parameters: one C identifier matching [A-Za-z_][A-Za-z0-9_]*, following the codebase's naming conventions.
- A data target representing one object: one C identifier. A section containing multiple objects: one short aggregate label for the section; do not pack individual symbols or alternatives into its name.
- Translation units: one direct filename or module label. Game concepts and patterns: one short direct label.
- No surrounding quotes/backticks, sentences, prefixes such as "Likely" or "Possible name", signatures, or lists of alternatives in value. The JSON string delimiters are still required.
- Put explanations, uncertainty, and alternative candidates in rationale; use confidence for the strength of the guess and evidence for its support. These are reading names, not proof of original developer spelling or instructions to rename source.
- Prefer one supported name. If none is meaningful, omit the fact; clear an existing unsupported naming fact with op: "clear" and value: "". A name equal to the canonical symbol adds nothing: omit it, or clear the existing redundant inferred_name. Preserve the canonical identity in subject and citations.
</inferred_name_contract>

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
    SOURCE_READING_VIEWS: "<![CDATA[" + librarianSourceContext(options.fillOutSubjects, options).replaceAll("]]>", "]]]]><![CDATA[>") + "]]>",
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
