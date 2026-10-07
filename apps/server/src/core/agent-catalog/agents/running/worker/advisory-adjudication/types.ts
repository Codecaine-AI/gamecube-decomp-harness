// Metadata records of llm_review advisory adjudication (plan §6.4, §6.5):
// the worker's data-only candidate (`metadata.llm_review_candidate`) and the
// adjudication result (`metadata.llm_review_adjudication`, also the candidate's
// `inline_result` in enforce). Both are JSON stored on worker_checkpoints.
import type { AdvisoryAdjudicationMode } from "@server/core/game-registry/runtime-options.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

export type LlmReviewIneligibleReason =
  | "not-advisory-only"
  | "pre-qa-failed"
  | "review-lint-failed"
  | "out-of-write-set"
  | "no-kernel-run";

/** A type alias (not an interface) so it stays assignable to a decision's JSON state. */
export type LlmReviewCodeFacts = {
  exact: boolean;
  old_score: number | null;
  new_score: number | null;
};

/** The worker's kernel run the adjudication nests under. */
export interface LlmReviewKernelRun {
  run_id: string;
  container_id: string;
  pi_session_id: string;
}

export interface LlmReviewCandidate {
  schema: "llm_review_candidate_v1";
  /** Effective mode (after `effectiveMode`). */
  mode: "shadow" | "enforce";
  /** The configured mode; differs from `mode` when enforce was downgraded to shadow. */
  requested_mode?: AdvisoryAdjudicationMode;
  downgraded_reason?: string;
  eligible: boolean;
  ineligible_reason?: LlmReviewIneligibleReason;
  pre_qa: { status: string; reasons: string[] };
  /** Shadow: always "not-run" (today's branch skips it for a QA-failed attempt). */
  post_return_check: "not-run" | "passed" | "failed";
  /** `detail.llm_review` findings, warning and info. Fingerprint null in shadow (the lane computes af2 from the patch). */
  advisories: Array<{ fingerprint: string | null; finding: QaScanFinding }>;
  kernel: LlmReviewKernelRun | null;
  attempt_index: number;
  agent_output_path: string | null;
  /** The attempt's qa_diff.patch. */
  scan_path: string | null;
  code_facts: LlmReviewCodeFacts;
  /** Enforce only. */
  inline_result?: AdvisoryAdjudication;
}

/**
 * pass: every warning accepted. fail: at least one warning rejected.
 * abstain: none rejected, at least one undecided at low confidence.
 * error: none rejected, at least one could not be adjudicated (reviewer
 * unavailable, timeout, missing evidence, insufficient time).
 */
export type AdvisoryVerdict = "pass" | "fail" | "abstain" | "error";

/** "noted" for info advisories, which are recorded from extraction only and never block. */
export type AdvisoryResult = "pass" | "fail" | "abstain" | "noted";

export type AdvisoryFailReason =
  /** The note gives no reason for keeping the flagged code. */
  | "justification-missing"
  /** The decision fell at or below failAt. */
  | "judged-unjustified"
  /** Escalation judge: REJECTED. */
  | "judge-rejected"
  /** The complete flagged line could not be read from the patch, so it has no fingerprint (§6.10). */
  | "evidence-unreadable";

export type AdvisoryAbstainReason =
  /** Between failAt and passAt: the only abstain that is a real "unclear". */
  | "low-confidence"
  | "refusal"
  /** Decision engine failure: missing key (not-configured), timeout, 429, 5xx, malformed answer, too-large. */
  | "engine-error"
  /** The decide check rejected inside the gate (kernel write failure, in flight elsewhere). */
  | "kernel-error"
  /** The signal fired before this advisory was decided. */
  | "aborted"
  /** The gate stopped before this check (after a rejected check). */
  | "skipped"
  /** A pass served by a model whose thresholds were not calibrated, or whose served model is unknown. */
  | "served-model-unverified"
  | "extraction-error"
  | "insufficient-time"
  | "no-kernel-run"
  | "no-node-kernel"
  | "evidence-missing"
  | "ineligible"
  | "no-thresholds"
  | "exception";

export interface AdjudicatedAdvisory {
  /** af2 fingerprint of the complete flagged line; null when that line is unreadable from the patch. */
  fingerprint: string | null;
  rule_id: string;
  standard_id: string | null;
  severity: "warning" | "info";
  file: string;
  line: number;
  excerpt: string;
  /** Bounded hunk kept for the librarian payload (A3-F7). */
  hunk: string | null;
  hunk_sha256: string | null;
  justification: string | null;
  evidence: string[];
  result: AdvisoryResult;
  fail_reason?: AdvisoryFailReason;
  probability?: number;
  abstain_reason?: AdvisoryAbstainReason;
  /** The decision; engine, served model and confidence source are known for answered (done) decisions only. */
  decision?: {
    run_id: string;
    engine?: string;
    served_model?: string;
    confidence_source?: string;
    thresholds: { passAt: number; failAt: number };
  };
  /** Escalation judge (enforce, `escalateLowConfidence`); run_id absent when the call replayed. */
  judge?: { verdict: string; rationale: string; run_id?: string };
}

export interface AdvisoryAdjudication {
  schema: "llm_review_adjudication_v1";
  requested_mode: "shadow" | "enforce";
  mode: "shadow" | "enforce";
  downgraded_reason?: string;
  verdict: AdvisoryVerdict;
  /** True only in enforce. */
  applied: boolean;
  advisories: AdjudicatedAdvisory[];
  /** Warnings accepted on their own (enforce writes accepted_advisory rows only when `verdict` is "pass"). */
  accepted_fingerprints: string[];
  extraction: {
    status: "ok" | "error" | "skipped";
    run_id?: string;
    error_kind?: string;
    structured_field_used?: boolean;
  };
  gate_span_id?: string;
  sources: { note_sha256: string | null; patch_sha256: string | null };
  model: { requested: string; served?: string };
  thresholds: { passAt: number; failAt: number; qualification: string };
  /** Enforce only. */
  budget_ms?: number;
  duration_ms: number;
  /** Exception class and message, or a "reviewer-unavailable: <kind>" / "evidence-missing: <file>" code; never payloads. */
  error?: string;
  /**
   * An infrastructure failure (node kernel missing, kernel write failure,
   * unexpected exception), not an engine result: the shadow lane retries the
   * job; enforce fails closed regardless.
   */
  retryable?: boolean;
}
