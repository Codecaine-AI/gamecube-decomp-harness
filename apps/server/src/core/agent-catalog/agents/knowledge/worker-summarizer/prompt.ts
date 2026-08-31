import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@server/core/agent-catalog/prompt-kit-compat";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildWorkerSummarizerKernelContext,
  WORKER_SUMMARIZER_TURN_PROMPT,
  type WorkerSummarizerPromptOptions,
} from "./context.js";
export { type WorkerSummarizerPromptOptions } from "./context.js";

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

function promptFilePath(): string {
  return fileURLToPath(new URL("./prompt.ts", import.meta.url));
}

export const prompt = definePrompt({
  id: "melee.worker-summarizer.system",
  title: "Melee Worker Summarizer System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Reconstruct the worker's run-level hypothesis and explain how it changed across the complete transcript.",
        "Explain the hypothesis behind each supplied submission and why its deterministic outcome supports, weakens, or falsifies that hypothesis.",
        "Preserve observations that another worker could reuse on this target or a closely related target.",
      ]),
    ]),
    section("context_contract", [
      usesContext("worker-summarizer-context", {
        instructions: [
          "Read the target card reference, checkpoint and submission digest, and full worker transcript together.",
          "Treat checkpoint and submission facts as deterministic. Use the transcript to explain intent and reasoning, never to replace those facts.",
        ],
      }),
    ]),
    section("output_contract", [
      "Return exactly one JSON object with this shape:",
      `{
  "run": {
    "hypothesis": "Narrative statement of the main theory or theories tested during the run.",
    "summary": "Narrative account of the approach, changes in direction, and what the run established."
  },
  "submissions": [
    {
      "hypothesis": "Narrative statement of what this submission tested.",
      "outcome_reasoning": "Narrative explanation of what the deterministic result says about that hypothesis."
    }
  ],
  "notable_observations": [
    {
      "observation": "Reusable fact, tactic, failed path, or constraint grounded in the supplied evidence.",
      "reusable_when": "Narrative description of when the observation applies."
    }
  ]
}`,
      "Emit one `submissions` entry for every submission in the digest, in the same order. The future job joins each narrative entry to deterministic submission data by position.",
    ]),
    section("rules", [
      orderedList([
        "Return JSON only. Do not put Markdown outside the JSON object.",
        "Emit narrative fields only. Do not emit scores, sequence numbers, runtime references, `final_outcome`, or `baseline` anywhere, including inside prose labels or extra fields.",
        "The future job mechanically joins scores, sequence numbers, runtime references, final outcome, and baseline after this output is validated. Do not duplicate or reinterpret that ownership.",
        "Ground every claim in the transcript, digest, or target card. State uncertainty plainly when the worker's intent is not recoverable.",
        "Distinguish what the worker believed from what the deterministic result established. A better result can support a hypothesis without proving the worker's causal explanation.",
        "Summarize submitted attempts individually. Mention unsubmitted exploration only when it explains the run's direction or yields a reusable observation.",
        "Do not invent edits, motives, validation results, target facts, submission boundaries, or causal links.",
        "Keep observations specific enough to guide a later attempt. Omit generic advice and empty restatements of the target card.",
      ]),
    ]),
    section("worked_example", [
      "Input excerpt: the transcript says the worker moved a load before a loop to test register lifetime. The digest contains one submission whose deterministic result improved but remained inexact.",
      "Output:",
      `{
  "run": {
    "hypothesis": "Moving the load before the loop would reproduce the original register lifetime.",
    "summary": "The worker isolated load placement as the likely cause of the remaining mismatch. The submitted rewrite improved the result but did not close the diff, so load placement mattered but was not the whole explanation."
  },
  "submissions": [
    {
      "hypothesis": "Hoisting the load would align register lifetime with the target.",
      "outcome_reasoning": "The improvement supports the register-lifetime theory, while the remaining mismatch shows that another source-shape difference still matters."
    }
  ],
  "notable_observations": [
    {
      "observation": "Load placement changed the generated register lifetime but did not resolve the complete mismatch.",
      "reusable_when": "Use this when a related target diverges around a loop-carried value and a simple hoist improves code generation without reaching exact."
    }
  ]
}`,
    ]),
  ],
});

export function renderSystemPrompt(): string {
  return renderXmlMarkdown(prompt);
}

export function workerSummarizerPrompt(
  options: WorkerSummarizerPromptOptions,
): PiPromptBundle {
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: WORKER_SUMMARIZER_TURN_PROMPT,
    systemTemplatePath: agentFilePath(),
    userTemplatePath: promptFilePath(),
    kernelContext: buildWorkerSummarizerKernelContext(options),
  };
}
