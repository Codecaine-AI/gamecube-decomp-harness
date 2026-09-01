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
    kind: "worker-summarizer-context",
    ref: "worker-summarizer-context",
    label: "worker-summarizer-context",
  },
] as const satisfies readonly LoaderDeclaration[];

export interface WorkerSummarizerPromptOptions {
  transcript: unknown;
  checkpointSubmissionDigest: unknown;
  targetCardReference: unknown;
  repoRoot?: string;
  stateDir?: string;
  game?: RunGameMetadata;
}

export const WORKER_SUMMARIZER_TURN_PROMPT = [
  "Use the injected worker summarizer context packet.",
  "Narrate the run, each submission, and the reusable observations, then return exactly one narrative-only JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, WORKER_SUMMARIZER_TURN_PROMPT),
);

const WORKER_SUMMARIZER_CONTEXT_TEMPLATE = `<task>
Summarize this closed worker run from its digest and transcript.
</task>

<target_reference>
\`\`\`json
{{TARGET_CARD_REFERENCE_JSON}}
\`\`\`
</target_reference>

<checkpoint_submission_digest>
\`\`\`json
{{CHECKPOINT_SUBMISSION_DIGEST_JSON}}
\`\`\`
</checkpoint_submission_digest>

<worker_transcript>
\`\`\`json
{{TRANSCRIPT_JSON}}
\`\`\`
</worker_transcript>

<output_contract>
\`\`\`json
{{WORKER_SUMMARIZER_OUTPUT_SCHEMA_JSON}}
\`\`\`
</output_contract>`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

export function buildWorkerSummarizerKernelContext(
  options: WorkerSummarizerPromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    TARGET_CARD_REFERENCE_JSON: stableJson(options.targetCardReference),
    CHECKPOINT_SUBMISSION_DIGEST_JSON: stableJson(options.checkpointSubmissionDigest),
    TRANSCRIPT_JSON: stableJson(options.transcript),
    WORKER_SUMMARIZER_OUTPUT_SCHEMA_JSON: stableJson(
      JSON.parse(readFileSync(schemaPath(), "utf8")),
    ),
  } as unknown as PromptTemplateValues;
  const renderedContext = renderTemplate(WORKER_SUMMARIZER_CONTEXT_TEMPLATE, values);
  return {
    turnPrompt: WORKER_SUMMARIZER_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "worker-summarizer-context",
        inputRef: "worker-summarizer-context",
        content: renderedContext,
      },
    ],
  };
}

export default context;
