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
  "Explain the run and each submission, then return exactly one narrative-only JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, WORKER_SUMMARIZER_TURN_PROMPT),
);

const WORKER_SUMMARIZER_CONTEXT_TEMPLATE = `<task>
Read the complete worker transcript beside the deterministic checkpoint and submission digest.
Explain the worker's hypotheses, the run's development, each submission's outcome, and reusable observations.
</task>

<target_card_reference>
{{TARGET_CARD_REFERENCE_JSON}}
</target_card_reference>

<checkpoint_submission_digest>
{{CHECKPOINT_SUBMISSION_DIGEST_JSON}}
</checkpoint_submission_digest>

<worker_transcript>
{{TRANSCRIPT_JSON}}
</worker_transcript>

<output_contract>
Return this exact LLM-emitted shape:

{{WORKER_SUMMARIZER_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return exactly one JSON object.`;

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
