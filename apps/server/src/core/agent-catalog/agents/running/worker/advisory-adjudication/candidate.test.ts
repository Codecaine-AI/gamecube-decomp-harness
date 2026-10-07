import { describe, expect, test } from "bun:test";

import type { WorkerChangeValidation } from "@server/core/agent-catalog/agents/running/worker/change-validation.js";
import { advisoryFingerprint, fullFlaggedLineFromPatch } from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { ATTEMPT_PATCH, CAST_A, CAST_B, LOCAL_INFO } from "./__fixtures__/adjudication.js";
import { buildLlmReviewCandidate, type BuildLlmReviewCandidateInput } from "./candidate.js";

const DETERMINISTIC_INFO: QaScanFinding = {
  rule_id: "todo_comment",
  severity: "info",
  file: CAST_A.file,
  line: 1860,
  excerpt: "s32 i;",
  message: "informational",
  standard_id: null,
};

function validation(overrides: Partial<WorkerChangeValidation> = {}): WorkerChangeValidation {
  const findings = [CAST_A, CAST_B, LOCAL_INFO, DETERMINISTIC_INFO];
  return {
    status: "failed",
    reasons: ["qa lint: 2 warnings"],
    target: { unit: "main/melee/gm/gmtoulib", symbol: "gm_801A4B60", before: 98.1, after: 100, improved: true, exact: true },
    qaLint: {
      status: "warnings",
      exitCode: 2,
      findings,
      scanPath: "/state/worker_state/w/attempt-2.qa_diff.patch",
      toolError: null,
      advisory: { findings: [CAST_A, CAST_B, LOCAL_INFO], deterministic: [DETERMINISTIC_INFO], advisoryOnly: true },
    },
    preQa: { status: "passed", reasons: [] },
    ...overrides,
  };
}

const KERNEL = { run_id: "run-1", container_id: "container-1", pi_session_id: "session-1" };

function input(overrides: Partial<BuildLlmReviewCandidateInput> = {}): BuildLlmReviewCandidateInput {
  return {
    mode: "shadow",
    requestedMode: "shadow",
    validation: validation(),
    reviewLint: { status: "passed" },
    outOfWriteSetChanges: [],
    kernel: KERNEL,
    attemptIndex: 2,
    agentOutputPath: "/state/worker_state/w/attempt-2.output.txt",
    patchText: null,
    ...overrides,
  };
}

function fingerprintOf(finding: QaScanFinding): string {
  return advisoryFingerprint(finding, fullFlaggedLineFromPatch(ATTEMPT_PATCH, finding.file, finding.line, finding.excerpt)!);
}

describe("buildLlmReviewCandidate", () => {
  test("shadow: an eligible candidate of llm_review warnings and infos, fingerprints left to the lane", () => {
    const candidate = buildLlmReviewCandidate(input({ patchText: ATTEMPT_PATCH }));

    expect(candidate).toEqual({
      schema: "llm_review_candidate_v1",
      mode: "shadow",
      requested_mode: "shadow",
      eligible: true,
      pre_qa: { status: "passed", reasons: [] },
      post_return_check: "not-run",
      advisories: [CAST_A, CAST_B, LOCAL_INFO].map((finding) => ({ fingerprint: null, finding })),
      kernel: KERNEL,
      attempt_index: 2,
      agent_output_path: "/state/worker_state/w/attempt-2.output.txt",
      scan_path: "/state/worker_state/w/attempt-2.qa_diff.patch",
      code_facts: { exact: true, old_score: 98.1, new_score: 100 },
    });
    expect(JSON.parse(JSON.stringify(candidate))).toEqual(candidate);
  });

  test("enforce: af2 fingerprints from the patch text; an unreadable flagged line stays null", () => {
    const moved = { ...CAST_B, line: 1865 };
    const candidate = buildLlmReviewCandidate(
      input({
        mode: "enforce",
        requestedMode: "enforce",
        patchText: ATTEMPT_PATCH,
        validation: validation({
          qaLint: { ...validation().qaLint!, advisory: { findings: [CAST_A, moved, LOCAL_INFO], deterministic: [], advisoryOnly: true } },
        }),
        inlineResult: { verdict: "pass" } as never,
      }),
    );

    expect(candidate.advisories.map((a) => a.fingerprint)).toEqual([fingerprintOf(CAST_A), null, fingerprintOf(LOCAL_INFO)]);
    expect(candidate.inline_result).toEqual({ verdict: "pass" } as never);
  });

  test("a downgraded enforce records the requested mode and the reason", () => {
    const candidate = buildLlmReviewCandidate(input({ requestedMode: "enforce", downgradedReason: "not-enforcement-qualified" }));
    expect(candidate).toMatchObject({ mode: "shadow", requested_mode: "enforce", downgraded_reason: "not-enforcement-qualified", eligible: true });
  });

  test("eligibility fails on the first unmet condition, in §6.4 order", () => {
    const cases: Array<[Partial<BuildLlmReviewCandidateInput>, string]> = [
      [{ validation: validation({ qaLint: { ...validation().qaLint!, advisory: undefined } }) }, "not-advisory-only"],
      [
        {
          validation: validation({
            qaLint: { ...validation().qaLint!, advisory: { findings: [CAST_A], deterministic: [], advisoryOnly: false } },
            preQa: { status: "failed", reasons: ["regressed"] },
          }),
        },
        "not-advisory-only",
      ],
      [{ validation: validation({ preQa: { status: "failed", reasons: ["regressed"] } }), reviewLint: { status: "failed" } }, "pre-qa-failed"],
      [{ validation: validation({ preQa: undefined }) }, "pre-qa-failed"],
      [{ reviewLint: { status: "failed" }, outOfWriteSetChanges: [{ path: "x.c" }] }, "review-lint-failed"],
      [{ outOfWriteSetChanges: [{ path: "x.c" }], kernel: null }, "out-of-write-set"],
      [{ kernel: null }, "no-kernel-run"],
      [{ kernel: { ...KERNEL, run_id: "" } }, "no-kernel-run"],
    ];
    for (const [overrides, reason] of cases) {
      const candidate = buildLlmReviewCandidate(input(overrides));
      expect({ reason, eligible: candidate.eligible, ineligible_reason: candidate.ineligible_reason }).toEqual({
        reason,
        eligible: false,
        ineligible_reason: reason as never,
      });
    }
    // A skipped review lint and a null one do not block.
    expect(buildLlmReviewCandidate(input({ reviewLint: { status: "skipped" } })).eligible).toBe(true);
    expect(buildLlmReviewCandidate(input({ reviewLint: null })).eligible).toBe(true);
  });

  test("records the post-return check outcome; a skipped or missing check is not-run", () => {
    const withCheck = (status: "passed" | "failed" | "skipped") =>
      buildLlmReviewCandidate(input({ validation: validation({ postReturnCheck: { status, reasons: [] } }) })).post_return_check;
    expect([withCheck("passed"), withCheck("failed"), withCheck("skipped")]).toEqual(["passed", "failed", "not-run"]);
  });

  test("without a QA partition, advisories still list llm_review findings but the candidate is ineligible", () => {
    const candidate = buildLlmReviewCandidate(input({ validation: validation({ qaLint: { ...validation().qaLint!, advisory: undefined } }) }));
    expect(candidate.advisories.map((a) => a.finding.rule_id)).toEqual(["type_erasing_cast", "type_erasing_cast", "stack_local_name"]);
    expect(candidate.eligible).toBe(false);

    const noScan = buildLlmReviewCandidate(input({ validation: validation({ qaLint: null, target: undefined }) }));
    expect(noScan).toMatchObject({ advisories: [], scan_path: null, code_facts: { exact: false, old_score: null, new_score: null } });
  });

  test("is pure: the inputs are not mutated and the candidate shares no objects with them", () => {
    const source = input({ mode: "enforce", requestedMode: "enforce", patchText: ATTEMPT_PATCH });
    const before = JSON.stringify(source);
    const candidate = buildLlmReviewCandidate(source);
    expect(JSON.stringify(source)).toBe(before);
    candidate.advisories[0]!.finding.line = 1;
    candidate.advisories[0]!.finding.detail!.cast = "(int*)";
    candidate.pre_qa.reasons.push("x");
    candidate.kernel!.run_id = "other";
    expect(JSON.stringify(source)).toBe(before);
  });
});
