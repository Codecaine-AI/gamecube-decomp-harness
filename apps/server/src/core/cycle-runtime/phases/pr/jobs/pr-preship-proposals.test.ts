import { describe, expect, test } from "bun:test";
import type { PreshipProposedRule } from "@server/core/agent-catalog/agents/pr/reviewer";
import { preshipProposedRuleRecords, PRESHIP_PROPOSAL_CONFIDENCE, PRESHIP_PROPOSAL_SOURCE } from "./pr-preship-proposals.js";

function rule(overrides: Partial<PreshipProposedRule> = {}): PreshipProposedRule {
  return {
    kind: "proposed_lint_rule",
    family: "literals_data_and_externs",
    standard_id: "global_standard:literals-and-data-ownership",
    description: "Flag extern-for-literal anchors that define nothing in the current TU.",
    example_excerpt: "extern const f32 lbl_804DA60C;",
    suggested_detector: "^\\+\\s*extern const f32 lbl_[0-9A-F]{8};",
    ...overrides,
  };
}

describe("preshipProposedRuleRecords", () => {
  test("produces curator-compatible source_update_proposal records the proposals reader will surface", () => {
    const records = preshipProposedRuleRecords({
      proposedRules: [rule()],
      runId: "run-123",
      sliceId: "gm",
      reviewPath: "/state/preship_reviews/run-123/gm/review.json",
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });
    expect(records).toHaveLength(1);
    const record = records[0]!;
    // Shape the decomp_standards proposals.py reader filters on.
    expect(record.kind).toBe("source_update_proposal");
    expect(record.status).toBe("proposal");
    expect(record.payload.target_source_id).toBe("decomp_standards");
    expect(record.payload.update_kind).toBe("global_standard");
    expect(record.payload.mutation_policy).toBe("proposal_only");
    // Provenance tags required by the task.
    expect(record.payload.source).toBe(PRESHIP_PROPOSAL_SOURCE);
    expect(record.payload.run_id).toBe("run-123");
    expect(record.payload.slice_id).toBe("gm");
    // Never auto-appliable.
    expect(record.confidence).toBeLessThanOrEqual(PRESHIP_PROPOSAL_CONFIDENCE);
    expect(record.id.startsWith(`source_update_proposal:${PRESHIP_PROPOSAL_SOURCE}:`)).toBe(true);
    expect(record.created_at).toBe("2026-07-02T00:00:00.000Z");
    // The proposed_rule payload round-trips the reviewer entry.
    expect(record.payload.proposed_rule).toMatchObject({ kind: "proposed_lint_rule", family: "literals_data_and_externs" });
    expect(record.evidence_ref).toBe("/state/preship_reviews/run-123/gm/review.json");
  });

  test("ids are stable per (slice, family, standard, description, excerpt) so re-runs dedupe", () => {
    const a = preshipProposedRuleRecords({ proposedRules: [rule()], runId: "run-1", sliceId: "gm" });
    const b = preshipProposedRuleRecords({ proposedRules: [rule()], runId: "run-2", sliceId: "gm" });
    expect(a[0]!.id).toBe(b[0]!.id);
    const different = preshipProposedRuleRecords({ proposedRules: [rule({ example_excerpt: "different" })], runId: "run-1", sliceId: "gm" });
    expect(different[0]!.id).not.toBe(a[0]!.id);
  });

  test("empty proposed_rules yields no records", () => {
    expect(preshipProposedRuleRecords({ proposedRules: [], runId: "r", sliceId: "gm" })).toEqual([]);
  });

  test("null standard_id and detector are preserved", () => {
    const records = preshipProposedRuleRecords({
      proposedRules: [rule({ standard_id: null, suggested_detector: null })],
      runId: "r",
      sliceId: "gm",
    });
    const proposed = records[0]!.payload.proposed_rule as Record<string, unknown>;
    expect(proposed.standard_id).toBeNull();
    expect(proposed.suggested_detector).toBeNull();
  });
});
