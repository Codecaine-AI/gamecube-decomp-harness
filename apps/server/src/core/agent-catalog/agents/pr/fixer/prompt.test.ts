import { describe, expect, test } from "bun:test";
import {
  PR_FIXER_SCHEMA_VERSION,
  prFixerPrompt,
  validatePrFixerAgentResult,
} from "./prompt.js";

const unresolvedPlaceholderPattern = /\{\{[A-Z0-9_]+\}\}/;

function sampleContext() {
  return {
    pr: {
      number: 2704,
      branch: "ford/melee-demo-pr",
      title: "Match ftDemo sample",
    },
    comments: [
      {
        id: "review-comment-1",
        url: "https://github.com/doldecomp/melee/pull/2704#discussion_r1",
        file: "src/melee/ft/chara/ftDemo.c",
        line: 24,
        body: "Please restore the game assert helper here instead of open-coding this.",
        standard_id: "global_standard:canonical-asserts",
        rule_id: "raw_assert_idiom",
      },
    ],
    findings: [
      {
        source: "pr-reviewer",
        file: "src/melee/ft/chara/ftDemo.c",
        line: 24,
        verdict: "reject",
        suggested_fix: "Use the canonical assert macro from nearby code.",
      },
    ],
    diff_excerpt: "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c",
  };
}

describe("validatePrFixerAgentResult", () => {
  test("accepts a valid pr-fixer result", () => {
    const validated = validatePrFixerAgentResult({
      schema_version: PR_FIXER_SCHEMA_VERSION,
      pr: { number: 2704, branch: "ford/melee-demo-pr", title: "Match ftDemo sample" },
      outcome: "fixed",
      summary: "Restored the assert helper requested in review.",
      edits: ["Replaced the open-coded assert with HSD_ASSERT."],
      validation: [{ command: "review_lint scan_diff", status: "passed", artifact_path: "post_scan.json", notes: "clean" }],
      comment_dispositions: [
        {
          comment_id: "review-comment-1",
          file: "src/melee/ft/chara/ftDemo.c",
          line: 24,
          disposition: "fixed_source",
          evidence: "The line now uses the game assert helper.",
        },
      ],
      remaining_items: [],
      manual_review_notes: [],
      risks: [],
    });

    expect(validated.errors).toEqual([]);
    expect(validated.result?.outcome).toBe("fixed");
  });

  test("rejects results without feedback dispositions", () => {
    const validated = validatePrFixerAgentResult({
      schema_version: PR_FIXER_SCHEMA_VERSION,
      pr: { number: 2704 },
      outcome: "fixed",
      summary: "No changes.",
      edits: [],
      validation: [],
      comment_dispositions: [],
      remaining_items: [],
      manual_review_notes: [],
      risks: [],
    });

    expect(validated.result).toBeNull();
    expect(validated.errors.join("; ")).toContain("comment_dispositions");
  });
});

describe("prFixerPrompt", () => {
  test("renders PR comments, tools, standards, and schema without raw placeholders", () => {
    const bundle = prFixerPrompt({
      fixerContext: sampleContext(),
      repoRoot: "/repo",
      stateDir: "/state",
    });
    const promptOnly = `${bundle.systemPrompt}\n${bundle.userPrompt}`;
    const injectedContext = bundle.kernelContext?.renderedContext ?? "";

    expect(promptOnly).toContain("Resolve maintainer PR comments");
    expect(promptOnly).not.toContain("review-comment-1");
    expect(injectedContext).toContain("review-comment-1");
    expect(injectedContext).toContain("src/melee/ft/chara/ftDemo.c");
    expect(injectedContext).toContain("<available_tools>");
    expect(injectedContext).toContain("<standard_examples");
    expect(injectedContext).toContain(PR_FIXER_SCHEMA_VERSION);
    expect(`${promptOnly}\n${injectedContext}`).not.toMatch(unresolvedPlaceholderPattern);
    expect(bundle.kernelContext?.inputs.map((input) => input.loaderKind)).toEqual([
      "pr-fixer-context",
      "standard-examples",
    ]);
  });
});
