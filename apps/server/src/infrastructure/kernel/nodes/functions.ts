// Call manifests for the generated BAML functions (plan §5 M8-C task 3). The
// kernel's BAML engine checks at construction that every key names a
// generated function; the `satisfies` clause makes a missing manifest a
// compile error.
import type { CallManifest, FnName } from "@agent-kernel/kernel/model-nodes";
import type { b } from "@server/generated/baml_client";

export type NodeFunctionName = FnName<typeof b>;

/** Default model for every node call. */
export const NODE_CALL_MODEL = "codex-lb/gpt-5.6-sol";
/** Calibration label proposals use a stronger model (plan §6.9, D4). */
export const LABEL_ADVISORY_MODEL = "codex-lb/gpt-6.1-sol";
/** Reasoning level M12 passes per call to LabelAdvisoryJustification. */
export const LABEL_ADVISORY_REASONING = "high" as const;

function manifest(name: NodeFunctionName, description: string, model = NODE_CALL_MODEL): CallManifest {
  return { $schema: "agent-kernel/call-v1", name, description, model };
}

export const NODE_CALL_MANIFESTS = {
  ContractProbe: manifest(
    "ContractProbe",
    "Render, parse and live-smoke target for the kernel BAML adapter.",
  ),
  ExtractCheckpointKnowledge: manifest(
    "ExtractCheckpointKnowledge",
    "Maps each llm_review finding of an attempt to the justification its note gives for keeping it.",
  ),
  ExtractConfirmedCheckpointKnowledge: manifest(
    "ExtractConfirmedCheckpointKnowledge",
    "Extracts tactics, codegen quirks, type facts, idioms and kept advisories from a confirmed-good checkpoint for the librarian.",
  ),
  JudgeAdvisoryWithRationale: manifest(
    "JudgeAdvisoryWithRationale",
    "Escalation judge: accepts, rejects or asks for more evidence on one advisory justification, with a rationale.",
  ),
  LabelAdvisoryJustification: manifest(
    "LabelAdvisoryJustification",
    "Proposes a justified, unjustified or unclear label for one historical advisory, for human review.",
    LABEL_ADVISORY_MODEL,
  ),
  SynthesizeJustification: manifest(
    "SynthesizeJustification",
    "Writes one good or bad synthetic justification for a real flagged hunk, for threshold selection only.",
  ),
} satisfies Record<NodeFunctionName, CallManifest>;
