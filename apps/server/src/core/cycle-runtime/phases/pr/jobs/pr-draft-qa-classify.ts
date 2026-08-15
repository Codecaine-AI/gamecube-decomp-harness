/**
 * Pure draft-QA status classification, extracted so it can be unit-tested
 * without loading the (heavy, currently-flaky) agent kernel that the rest of
 * pr-draft-qa.ts pulls in.
 *
 * Core Phase 4 rule: `ready_for_human_review_with_warnings` is reachable ONLY
 * when every unresolved finding is an `llm_review` advisory (detail.llm_review
 * === true) — a requirement check awaiting reviewer judgment. Any unresolved
 * non-llm_review finding (error or warning) routes to `needs_repair` (or the
 * existing stricter `manual_review_required` when already fully commented).
 */
import type { QaScanFinding } from "@server/core/validation/qa";

export type DraftQaStatus =
  | "ready_for_human_review"
  | "ready_for_human_review_with_warnings"
  | "manual_review_required"
  | "needs_repair"
  | "blocked";

/** Minimal comment shape needed to decide whether every finding was surfaced. */
export interface ClassifyCommentRecord {
  status: "posted_inline" | "posted_top_level" | "already_present" | "dry_run" | "failed";
}

/** Minimal verification shape (CI / local check) needed for the blocked gate. */
export interface ClassifyVerificationResult {
  status: "passed" | "failed" | "skipped";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** A scan finding carries the advisory reviewer-judgment flag iff detail.llm_review === true. */
export function isLlmReviewFinding(finding: QaScanFinding): boolean {
  return isRecord(finding.detail) && finding.detail.llm_review === true;
}

export function allCommented(comments: ClassifyCommentRecord[]): boolean {
  return (
    comments.length > 0 &&
    comments.every(
      (comment) =>
        comment.status === "posted_inline" ||
        comment.status === "posted_top_level" ||
        comment.status === "already_present" ||
        comment.status === "dry_run",
    )
  );
}

export interface DeriveStatusParams {
  scanToolError: string | null;
  allowLowerScoreRepairs: boolean;
  qaErrors: number;
  /** Unresolved warning scan findings that carry detail.llm_review === true. */
  qaWarningsLlmReview: number;
  /** Unresolved warning scan findings that do NOT carry detail.llm_review. */
  qaWarningsOther: number;
  preshipRejects: number;
  preshipWarnings: number;
  repairUnresolved: number;
  repairLowerScore: number;
  repairFalsePositive: number;
  comments: ClassifyCommentRecord[];
  ci: ClassifyVerificationResult;
  localCheck: ClassifyVerificationResult;
}

export function deriveStatus(params: DeriveStatusParams): { status: DraftQaStatus; exitCode: number; readyForHumanReview: boolean } {
  if (params.scanToolError || params.ci.status === "failed" || params.localCheck.status === "failed") {
    return { status: "blocked", exitCode: 1, readyForHumanReview: false };
  }
  if (
    params.qaErrors > 0 ||
    params.repairUnresolved > 0 ||
    params.repairFalsePositive > 0 ||
    (!params.allowLowerScoreRepairs && params.repairLowerScore > 0)
  ) {
    return { status: "needs_repair", exitCode: 1, readyForHumanReview: false };
  }
  if (params.preshipRejects > 0) {
    const commented = allCommented(params.comments);
    return {
      status: commented ? "manual_review_required" : "needs_repair",
      exitCode: commented ? 0 : 1,
      readyForHumanReview: commented,
    };
  }
  // Non-llm_review warnings are strictness violations awaiting a real fix. Preship
  // "warn" findings are never lint llm_review findings, so any preship warning is
  // non-llm_review by construction. These route to needs_repair unless already
  // fully commented (the existing stricter manual_review_required disposition).
  const hasNonLlmReviewWarnings = params.qaWarningsOther > 0 || params.preshipWarnings > 0;
  if (hasNonLlmReviewWarnings) {
    const commented = allCommented(params.comments);
    return {
      status: commented ? "manual_review_required" : "needs_repair",
      exitCode: commented ? 0 : 1,
      readyForHumanReview: commented,
    };
  }
  // Only reachable when every unresolved finding is an llm_review advisory warning
  // (a requirement check the reviewer must still judge), or a clean_lower_score
  // repair disposition carried forward. Nothing here is a plain optional suggestion.
  if (params.qaWarningsLlmReview > 0 || params.repairLowerScore > 0) {
    return { status: "ready_for_human_review_with_warnings", exitCode: 0, readyForHumanReview: true };
  }
  return { status: "ready_for_human_review", exitCode: 0, readyForHumanReview: true };
}
