// requestIds for calibration nodes. The kernel replays a requestId only for the
// same request: it fingerprints a call's function, arguments, model,
// reasoning, prompt hash and parent scope, and a decision's name, state,
// questions with their effective thresholds, model and parent scope; the same
// requestId with a different request is rejected (`invalid-request`). So
// every id here digests everything its fingerprint covers, the parent scope
// included: kernels.ts fixes the parent per command, dataset and engine
// (seededParentIds), and the id carries that parent run id. An unchanged
// request under the same parent keeps its id and replays; an edited prompt,
// question set, model or argument, or another dataset (another parent) in the
// same database, gets a new id and a fresh run.
import type { DecisionQuestion } from "@agent-kernel/kernel/model-nodes";
import { NODE_CALL_MANIFESTS, NODE_CALL_MODEL, type NodeFunctionName } from "@server/infrastructure/kernel/nodes/functions.js";

import { canonicalJson, sha256Hex } from "./store.js";
import type { CalibrationEngine } from "./types.js";

/** Reasoning passed explicitly on calibration calls, so the digest names what the kernel receives. */
export type CallReasoning = "low" | "medium" | "high";

/** Sources that configure clients and code generation, not prompts (as the kernel's bamlPromptHash). */
const NON_PROMPT_SOURCES: ReadonlySet<string> = new Set(["clients.baml", "generators.baml"]);

/** The kernel's BAML prompt hash: "baml1-" + sha256 over the non-client sources, sorted by path. */
export function bamlPromptHash(sources: Record<string, string>): string {
  const entries = Object.entries(sources)
    .filter(([path]) => !NON_PROMPT_SOURCES.has(path.slice(path.lastIndexOf("/") + 1)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `baml1-${sha256Hex(JSON.stringify(entries))}`;
}

let promptHash: Promise<string> | null = null;

/** The committed BAML prompts' hash; the inlined sources load on first use (no generated client). */
export function nodePromptHash(): Promise<string> {
  promptHash ??= import("@server/generated/baml_client/inlinedbaml").then(({ getBamlFiles }) => bamlPromptHash(getBamlFiles()));
  return promptHash;
}

function digest(parts: unknown): string {
  return sha256Hex(canonicalJson(parts)).slice(0, 24);
}

export interface CallRequestParts {
  engine: CalibrationEngine;
  /** The fixed parent run the call nests under (the dataset's namespace). */
  parentRunId: string;
  name: NodeFunctionName;
  args: readonly unknown[];
  reasoning: CallReasoning;
  promptHash: string;
}

/** `<prefix>:<engine>:<label>:<digest of parent run, function, args, manifest model, reasoning, prompt hash>`. */
export function callRequestId(prefix: string, label: string, parts: CallRequestParts): string {
  const model = NODE_CALL_MANIFESTS[parts.name].model ?? NODE_CALL_MODEL;
  return `${prefix}:${parts.engine}:${label}:${digest({
    parent: parts.parentRunId,
    name: parts.name,
    args: parts.args,
    model,
    reasoning: parts.reasoning,
    prompt: parts.promptHash,
  })}`;
}

/** `calibration:<engine>:<model>:<item>:<digest of parent run, decision name, state, question set incl. thresholds>`. */
export function decisionRequestId(parts: {
  engine: CalibrationEngine;
  /** The fixed parent run the decision nests under (the dataset's namespace). */
  parentRunId: string;
  model: string;
  itemId: string;
  name: string;
  state: unknown;
  questions: Record<string, DecisionQuestion>;
}): string {
  return `calibration:${parts.engine}:${parts.model}:${parts.itemId}:${digest({
    parent: parts.parentRunId,
    name: parts.name,
    state: parts.state,
    questions: parts.questions,
  })}`;
}
