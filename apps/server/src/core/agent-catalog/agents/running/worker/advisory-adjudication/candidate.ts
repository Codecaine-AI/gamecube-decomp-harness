// The worker's data-only review candidate (plan §6.4): built from in-memory
// objects after validation, stored at metadata.llm_review_candidate, and the
// input to adjudication (inline in enforce, by the lane in shadow). Pure: no
// I/O, no await, no node call. In shadow the fingerprints stay null (the lane
// computes af2 from the patch file); in enforce the caller passes the patch
// text it already read.
import type { AdvisoryAdjudicationMode } from "@server/core/game-registry/runtime-options.js";
import type { WorkerChangeValidation } from "@server/core/agent-catalog/agents/running/worker/change-validation.js";
import type { WorkerReviewLint } from "@server/core/agent-catalog/agents/running/worker/review-lint.js";
import {
  advisoryFingerprint,
  fullFlaggedLineFromPatch,
  isAdvisoryFinding,
} from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import type { AdvisoryAdjudication, LlmReviewCandidate, LlmReviewIneligibleReason, LlmReviewKernelRun } from "./types.js";

export interface BuildLlmReviewCandidateInput {
  /** Effective mode (after effectiveMode). */
  mode: "shadow" | "enforce";
  requestedMode: AdvisoryAdjudicationMode;
  downgradedReason?: string;
  /** The attempt's validation (retainPreQa: carries `preQa` and the QA advisory partition). */
  validation: WorkerChangeValidation;
  reviewLint: Pick<WorkerReviewLint, "status"> | null;
  outOfWriteSetChanges: readonly unknown[];
  /** The worker's kernel run; null when the kernel runtime recorded none. */
  kernel: LlmReviewKernelRun | null;
  attemptIndex: number;
  agentOutputPath: string | null;
  /** Enforce: the attempt's qa_diff.patch, for af2 fingerprints. Null in shadow (no I/O in the worker). */
  patchText: string | null;
  /** Enforce: the inline adjudication. */
  inlineResult?: AdvisoryAdjudication;
}

function fingerprintFromPatch(patchText: string | null, finding: QaScanFinding): string | null {
  if (patchText === null) return null;
  const fullLine = fullFlaggedLineFromPatch(patchText, finding.file, finding.line, finding.excerpt);
  return fullLine === null ? null : advisoryFingerprint(finding, fullLine);
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Eligible = advisory-only scan, pre-QA passed, review lint not failed, no
 * out-of-write-set change, and a kernel run to nest under (§6.4); the first
 * condition missed is the recorded reason. A validation without the QA
 * advisory partition is never advisory-only (fail closed).
 */
export function buildLlmReviewCandidate(input: BuildLlmReviewCandidateInput): LlmReviewCandidate {
  const { validation } = input;
  const qaLint = validation.qaLint;
  const advisoryFindings = qaLint?.advisory?.findings ?? qaLint?.findings.filter(isAdvisoryFinding) ?? [];
  const preQa = validation.preQa ?? { status: "unknown", reasons: [] };

  let ineligible: LlmReviewIneligibleReason | undefined;
  if (qaLint?.advisory?.advisoryOnly !== true) ineligible = "not-advisory-only";
  else if (preQa.status !== "passed") ineligible = "pre-qa-failed";
  else if (input.reviewLint?.status === "failed") ineligible = "review-lint-failed";
  else if (input.outOfWriteSetChanges.length > 0) ineligible = "out-of-write-set";
  else if (input.kernel === null || !input.kernel.run_id) ineligible = "no-kernel-run";

  const postReturn = validation.postReturnCheck?.status;
  return {
    schema: "llm_review_candidate_v1",
    mode: input.mode,
    requested_mode: input.requestedMode,
    ...(input.downgradedReason !== undefined && { downgraded_reason: input.downgradedReason }),
    eligible: ineligible === undefined,
    ...(ineligible !== undefined && { ineligible_reason: ineligible }),
    pre_qa: { status: preQa.status, reasons: [...preQa.reasons] },
    post_return_check: postReturn === "passed" || postReturn === "failed" ? postReturn : "not-run",
    advisories: advisoryFindings.map((finding) => ({
      fingerprint: input.mode === "enforce" ? fingerprintFromPatch(input.patchText, finding) : null,
      finding: { ...finding, ...(finding.detail !== undefined && { detail: { ...finding.detail } }) },
    })),
    kernel: input.kernel ? { ...input.kernel } : null,
    attempt_index: input.attemptIndex,
    agent_output_path: input.agentOutputPath,
    scan_path: qaLint?.scanPath ?? null,
    code_facts: {
      exact: validation.target?.exact === true,
      old_score: finiteOrNull(validation.target?.before),
      new_score: finiteOrNull(validation.target?.after),
    },
    ...(input.inlineResult !== undefined && { inline_result: input.inlineResult }),
  };
}
