import { describe, expect, test } from "bun:test";
import {
  PRESHIP_REVIEW_SCHEMA_VERSION,
  loadPreshipExhibits,
  preshipExhibitsPromptXml,
  validatePreshipReview,
} from "./preship.js";
import { prPreshipReviewPrompt } from "./prompt.js";

function validReview(): Record<string, unknown> {
  return {
    schema_version: PRESHIP_REVIEW_SCHEMA_VERSION,
    slice_id: "gm",
    slice_verdict: "reject",
    findings: [
      {
        file: "src/melee/gm/gm_1832.c",
        line: 1919,
        standard_id: "global_standard:literals-and-data-ownership",
        verdict: "reject",
        rationale: "extern const f32 lbl_804DA60C anchors data ordering instead of defining the data.",
        suggested_fix: "Remove the extern and define the constant in binary order; accept the lower match.",
      },
      {
        file: "src/melee/gm/gm_1832.c",
        line: null,
        standard_id: null,
        verdict: "warn",
        rationale: "Suspicious but not provable from the diff alone.",
        suggested_fix: null,
      },
    ],
    summary: "One data-ordering dodge; slice must not ship with it.",
    confidence: 0.9,
  };
}

describe("validatePreshipReview", () => {
  test("accepts a valid review object", () => {
    const { review, errors } = validatePreshipReview(validReview());
    expect(errors).toEqual([]);
    expect(review).not.toBeNull();
    expect(review?.slice_verdict).toBe("reject");
    expect(review?.findings).toHaveLength(2);
    expect(review?.findings[1]?.line).toBeNull();
  });

  test("accepts an approve verdict with no findings", () => {
    const { review, errors } = validatePreshipReview({
      ...validReview(),
      slice_verdict: "approve",
      findings: [],
    });
    expect(errors).toEqual([]);
    expect(review?.slice_verdict).toBe("approve");
  });

  test("rejects non-objects", () => {
    expect(validatePreshipReview(null).review).toBeNull();
    expect(validatePreshipReview([]).review).toBeNull();
    expect(validatePreshipReview("approve").review).toBeNull();
  });

  test("rejects a wrong schema_version", () => {
    const { review, errors } = validatePreshipReview({ ...validReview(), schema_version: "melee_pr_postmortem_v1" });
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("schema_version");
  });

  test.each(["schema_version", "slice_id", "slice_verdict", "findings", "summary", "confidence"])(
    "rejects when top-level key %s is missing",
    (key) => {
      const broken = validReview();
      delete broken[key];
      const { review, errors } = validatePreshipReview(broken);
      expect(review).toBeNull();
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  test("rejects a bad slice_verdict enum", () => {
    const { review, errors } = validatePreshipReview({ ...validReview(), slice_verdict: "ship-it" });
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("slice_verdict");
  });

  test("rejects a bad finding verdict enum", () => {
    const broken = validReview();
    (broken.findings as Array<Record<string, unknown>>)[0].verdict = "approve";
    const { review, errors } = validatePreshipReview(broken);
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("findings[0].verdict");
  });

  test("rejects findings missing required keys", () => {
    const broken = validReview();
    (broken.findings as Array<Record<string, unknown>>)[0] = { verdict: "reject" };
    const { review, errors } = validatePreshipReview(broken);
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("findings[0].file");
    expect(errors.join(" ")).toContain("findings[0].rationale");
  });

  test("rejects a non-numeric confidence", () => {
    const { review } = validatePreshipReview({ ...validReview(), confidence: "high" });
    expect(review).toBeNull();
  });

  test("omits proposed_rules when the field is absent (legacy artifact)", () => {
    const { review, errors } = validatePreshipReview(validReview());
    expect(errors).toEqual([]);
    expect(review).not.toBeNull();
    expect(review && "proposed_rules" in review).toBe(false);
  });

  test("accepts a valid optional proposed_rules array", () => {
    const { review, errors } = validatePreshipReview({
      ...validReview(),
      proposed_rules: [
        {
          kind: "proposed_lint_rule",
          family: "literals_data_and_externs",
          standard_id: "global_standard:literals-and-data-ownership",
          description: "Flag extern-for-literal anchors that define nothing in the current TU.",
          example_excerpt: "extern const f32 lbl_804DA60C;",
          suggested_detector: "^\\+\\s*extern const f32 lbl_[0-9A-F]{8};",
        },
        {
          kind: "proposed_lint_rule",
          family: "codegen_tactics",
          standard_id: null,
          description: "Detect M2C_FIELD residue that survived into shipped source.",
          example_excerpt: "M2C_FIELD(gp, s32, 0x38)",
          suggested_detector: null,
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(review?.proposed_rules).toHaveLength(2);
    expect(review?.proposed_rules?.[0]?.family).toBe("literals_data_and_externs");
    expect(review?.proposed_rules?.[1]?.standard_id).toBeNull();
  });

  test("rejects a proposed_rule with an unknown family", () => {
    const { review, errors } = validatePreshipReview({
      ...validReview(),
      proposed_rules: [
        {
          kind: "proposed_lint_rule",
          family: "not_a_real_family",
          description: "x",
          example_excerpt: "y",
        },
      ],
    });
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("proposed_rules[0].family");
  });

  test("rejects a proposed_rule missing required description/excerpt", () => {
    const { review, errors } = validatePreshipReview({
      ...validReview(),
      proposed_rules: [{ kind: "proposed_lint_rule", family: "codegen_tactics" }],
    });
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("proposed_rules[0].description");
    expect(errors.join(" ")).toContain("proposed_rules[0].example_excerpt");
  });

  test("rejects proposed_rules when it is present but not an array", () => {
    const { review, errors } = validatePreshipReview({ ...validReview(), proposed_rules: "nope" });
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("proposed_rules must be an array");
  });
});

describe("preship exhibits", () => {
  test("static curated file loads the nine seeded rejections", () => {
    const exhibits = loadPreshipExhibits();
    expect(exhibits).toHaveLength(9);
    expect(exhibits.filter((exhibit) => exhibit.kind === "counter_exhibit")).toHaveLength(1);
    const particle = exhibits.find((exhibit) => exhibit.file === "src/sysdolphin/baselib/particle.c");
    expect(particle?.pr).toBe(2659);
    expect(particle?.comment).toContain("You submitted this change before");
  });

  test("exhibits XML marks the counter-exhibit and carries comments verbatim", () => {
    const xml = preshipExhibitsPromptXml();
    expect(xml).toContain('<maintainer_rejection_exhibits count="9">');
    expect(xml).toContain('kind="counter_exhibit"');
    expect(xml).toContain("Matching because of externs is not correct.");
    expect(xml).toContain("ACCEPTED counter-exhibit");
  });
});

describe("prPreshipReviewPrompt", () => {
  test("renders the diff, lint findings, exhibits, and schema into the bundle", () => {
    const bundle = prPreshipReviewPrompt({
      sliceId: "gm",
      sliceDiff: "+extern const f32 lbl_804DA60C;",
      lintFindings: {
        findings: [
          {
            rule_id: "extern_in_c",
            standard_id: "global_standard:literals-and-data-ownership",
          },
        ],
      },
    });
    const injectedContext = bundle.kernelContext?.renderedContext ?? "";
    expect(bundle.systemPrompt).not.toContain("melee_pr_preship_review_v1");
    expect(bundle.systemPrompt).toContain("find every reason the maintainer");
    expect(bundle.systemPrompt).toContain("clear-cut violations");
    expect(bundle.systemPrompt).toContain("may cite ONLY");
    expect(bundle.systemPrompt.toLowerCase()).toContain("llm_review");
    expect(bundle.systemPrompt).toContain("proposed_rules");
    // The schema.json output contract now advertises the optional proposed_rules shape.
    expect(injectedContext).toContain("proposed_lint_rule");
    expect(bundle.userPrompt).not.toContain("+extern const f32 lbl_804DA60C;");
    expect(injectedContext).toContain("melee_pr_preship_review_v1");
    expect(injectedContext).toContain("slice `gm`");
    expect(injectedContext).toContain("+extern const f32 lbl_804DA60C;");
    expect(injectedContext).toContain("extern_in_c");
    expect(injectedContext).toContain('"lint_available": true');
    expect(injectedContext).toContain("<maintainer_rejection_exhibits");
    expect(injectedContext).toContain("<standard_examples");
    expect(injectedContext).toContain("literal-extern-float-anchor");
    expect(injectedContext).toContain("<decomp_standards>");
    expect(`${bundle.systemPrompt}\n${bundle.userPrompt}\n${injectedContext}`).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  test("limits findings to the owner-approved standards and deterministic lint", () => {
    const systemPrompt = prPreshipReviewPrompt({ sliceId: "gm", sliceDiff: "+int x;" }).systemPrompt;
    const allowedStandards = [
      "literals-and-data-ownership",
      "no-string-literal-symbol-regression",
      "canonical-control-flow-and-macros",
      "assert-report-macros",
      "header-inlines",
      "avoid-pragmas-register-asm",
      "no-define-alias-global-renames",
      "data-sections-and-tu-splits",
      "text-before-data-matching",
    ];

    for (const standardId of allowedStandards) {
      expect(systemPrompt).toContain(`global_standard:${standardId}`);
    }
    expect(systemPrompt).toContain("Confirming or escalating any injected deterministic");
    expect(systemPrompt).toContain("item is always allowed");
    expect(systemPrompt).toContain("No other injected standard or rule family may produce a `reject` or `warn` finding");
    expect(systemPrompt).toContain("Never return a reject verdict with no reject finding");
  });

  test("names retired and repair-only standards as excluded finding sources", () => {
    const systemPrompt = prPreshipReviewPrompt({ sliceId: "gm", sliceDiff: "+int x;" }).systemPrompt;

    expect(systemPrompt).toContain("`matching-tactics-need-evidence` is retired as a reviewer finding source");
    expect(systemPrompt).toContain("Unusual-but-plausible source shapes are NOT findings");
    expect(systemPrompt).toContain("`truthful-headers-and-includes` is CI-owned; never emit a reviewer finding for it");
    for (const standardId of [
      "infer-authored-source-style",
      "typed-fields-over-pointer-math",
      "conservative-naming",
      "natural-loops",
    ]) {
      expect(systemPrompt).toContain(`\`${standardId}\``);
    }
    expect(systemPrompt).toContain("style guidance for repair agents, never reviewer findings");
  });

  test("notes lint unavailability instead of failing", () => {
    const bundle = prPreshipReviewPrompt({
      sliceId: "gm",
      sliceDiff: "+int x;",
      lintUnavailableNote: "scan_diff.py not found",
    });
    const injectedContext = bundle.kernelContext?.renderedContext ?? "";
    expect(injectedContext).toContain('"lint_available": false');
    expect(injectedContext).toContain("scan_diff.py not found");
  });

  test("truncates oversized diffs with an inline note", () => {
    const bundle = prPreshipReviewPrompt({
      sliceId: "gm",
      sliceDiff: "x".repeat(500),
      diffCharLimit: 100,
    });
    const injectedContext = bundle.kernelContext?.renderedContext ?? "";
    expect(injectedContext).toContain("[diff truncated after 100 characters; 400 characters omitted");
    expect(injectedContext).not.toContain("x".repeat(101));
  });
});
