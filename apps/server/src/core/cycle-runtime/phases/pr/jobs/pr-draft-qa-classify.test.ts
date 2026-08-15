import { describe, expect, test } from "bun:test";
import type { QaScanFinding } from "@server/core/validation/qa";
import { deriveStatus, isLlmReviewFinding, type DeriveStatusParams } from "./pr-draft-qa-classify.js";

function baseParams(overrides: Partial<DeriveStatusParams> = {}): DeriveStatusParams {
  return {
    scanToolError: null,
    allowLowerScoreRepairs: false,
    qaErrors: 0,
    qaWarningsLlmReview: 0,
    qaWarningsOther: 0,
    preshipRejects: 0,
    preshipWarnings: 0,
    repairUnresolved: 0,
    repairLowerScore: 0,
    repairFalsePositive: 0,
    comments: [],
    ci: { status: "skipped" },
    localCheck: { status: "skipped" },
    ...overrides,
  };
}

function warning(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "type_erasing_cast",
    severity: "warning",
    file: "src/melee/gr/grsmoke.c",
    line: 10,
    excerpt: "(u8*) data",
    message: "cast",
    standard_id: null,
    ...overrides,
  };
}

describe("isLlmReviewFinding", () => {
  test("true only when detail.llm_review === true", () => {
    expect(isLlmReviewFinding(warning({ detail: { llm_review: true } }))).toBe(true);
    expect(isLlmReviewFinding(warning({ detail: { llm_review: false } }))).toBe(false);
    expect(isLlmReviewFinding(warning({ detail: {} }))).toBe(false);
    expect(isLlmReviewFinding(warning())).toBe(false);
  });
});

describe("deriveStatus warnings state", () => {
  test("clean run is ready_for_human_review", () => {
    const result = deriveStatus(baseParams());
    expect(result.status).toBe("ready_for_human_review");
    expect(result.readyForHumanReview).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("only-llm_review warnings reach ready_for_human_review_with_warnings", () => {
    const result = deriveStatus(baseParams({ qaWarningsLlmReview: 2 }));
    expect(result.status).toBe("ready_for_human_review_with_warnings");
    expect(result.readyForHumanReview).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("a non-llm_review warning blocks the warnings state and routes to needs_repair", () => {
    const result = deriveStatus(baseParams({ qaWarningsOther: 1, qaWarningsLlmReview: 3 }));
    expect(result.status).toBe("needs_repair");
    expect(result.readyForHumanReview).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  test("a fully-commented non-llm_review warning routes to manual_review_required (stricter status)", () => {
    const result = deriveStatus(
      baseParams({ qaWarningsOther: 1, comments: [{ status: "posted_top_level" }] }),
    );
    expect(result.status).toBe("manual_review_required");
    expect(result.readyForHumanReview).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("preship warnings are never llm_review and block the warnings state", () => {
    const result = deriveStatus(baseParams({ preshipWarnings: 1, qaWarningsLlmReview: 1 }));
    expect(result.status).toBe("needs_repair");
  });

  test("qa errors always take precedence over any warnings state", () => {
    const result = deriveStatus(baseParams({ qaErrors: 1, qaWarningsLlmReview: 5 }));
    expect(result.status).toBe("needs_repair");
  });

  test("tool error / failed checks block regardless of llm_review warnings", () => {
    expect(deriveStatus(baseParams({ scanToolError: "boom", qaWarningsLlmReview: 1 })).status).toBe("blocked");
    expect(deriveStatus(baseParams({ ci: { status: "failed" }, qaWarningsLlmReview: 1 })).status).toBe("blocked");
    expect(deriveStatus(baseParams({ localCheck: { status: "failed" } })).status).toBe("blocked");
  });

  test("clean_lower_score repairs (allowed) still surface as warnings state", () => {
    const result = deriveStatus(baseParams({ repairLowerScore: 1, allowLowerScoreRepairs: true }));
    expect(result.status).toBe("ready_for_human_review_with_warnings");
  });
});
