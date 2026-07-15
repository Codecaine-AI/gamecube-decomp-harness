import { describe, expect, test } from "bun:test";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import type { DraftPrMetadata, DraftPrQaDeps } from "./jobs/pr-draft-qa.js";
import {
  commentMarker,
  commentUnresolvedFindings,
  renderMatchContext,
  type CommentableFinding,
} from "./github-comments.js";

function globals(): GlobalArgs {
  return {
    repoRoot: "/tmp/comment-test-repo",
    stateDir: "/tmp/comment-test-state",
    dryRunAgents: false,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
}

function pr(): DraftPrMetadata {
  return {
    number: 2819,
    url: "https://github.com/doldecomp/melee/pull/2819",
    title: "Test PR",
    state: "OPEN",
    isDraft: true,
    baseRefName: "master",
    baseRefOid: "base-sha",
    headRefName: "test-branch",
    headRefOid: "head-sha",
    authorLogin: null,
    headOwnerLogin: null,
  };
}

function finding(overrides: Partial<CommentableFinding> = {}): CommentableFinding {
  return {
    source: "review_lint",
    severity: "error",
    file: "src/melee/gm/gmtest.c",
    line: 10,
    ruleId: "m2c_goto_label",
    standardId: "global_standard:canonical-control-flow-and-macros",
    message: "Replace the generated control-flow shape.",
    suggestedFix: null,
    artifactPath: null,
    tier: 1,
    disposition: "unresolved",
    evidence: null,
    matchContext: {
      function: "gmTest_Run",
      fuzzy_percent: 100,
      exact: true,
      repair_reverted: null,
    },
    ...overrides,
  };
}

describe("tiered GitHub comments", () => {
  test("groups three same-rule entries into one anchored comment with extra lines and every marker", async () => {
    const findings = [
      finding({ line: 30, message: "Third occurrence." }),
      finding({ line: 10, message: "Lead occurrence." }),
      finding({ line: 20, message: "Second occurrence." }),
    ];
    const commands: string[][] = [];
    const deps: DraftPrQaDeps = {
      commandRunner: async (_cwd, command) => {
        commands.push(command);
        return { exitCode: 0, stdout: JSON.stringify({ html_url: "https://example.test/discussion/1" }), stderr: "" };
      },
    };

    const records = await commentUnresolvedFindings({
      globals: globals(),
      deps,
      repo: "doldecomp/melee",
      pr: pr(),
      findings,
      existingComments: [],
      dryRun: false,
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe("posted_inline");
    const inline = commands[0]!;
    expect(inline).toContain("line=10");
    const body = inline.find((part) => part.startsWith("body="))!.slice("body=".length);
    expect(body).toContain("Rule: m2c_goto_label");
    expect(body).toContain("Lead occurrence.");
    expect(body).toContain("Also at lines: 20, 30");
    for (const row of findings) expect(body).toContain(commentMarker(row));
  });

  test("renders exact, fuzzy, and reverted match context", () => {
    expect(renderMatchContext({
      function: "ExactFn",
      fuzzy_percent: 100,
      exact: true,
      repair_reverted: null,
    })).toBe("`ExactFn` — exact match (100%); changing this shape risks the match");

    expect(renderMatchContext({
      function: "FuzzyFn",
      fuzzy_percent: 91.25,
      exact: false,
      repair_reverted: "the exact-match score regressed",
    })).toBe(
      "`FuzzyFn` — improvement-lane (fuzzy 91.25%); safe to change at some score cost; an automated fix attempt was **reverted**: the exact-match score regressed",
    );
  });

  test("posts all tier-2 entries in one collapsed issue comment and skips tier 3", async () => {
    const bodies: string[] = [];
    const deps: DraftPrQaDeps = {
      commandRunner: async (_cwd, command) => {
        bodies.push(command.find((part) => part.startsWith("body="))?.slice("body=".length) ?? "");
        return { exitCode: 0, stdout: JSON.stringify({ html_url: "https://example.test/comment/1" }), stderr: "" };
      },
    };
    const tierTwo = [
      finding({ line: 11, tier: 2, disposition: "left_with_evidence", evidence: "The report remains exact." }),
      finding({ line: 12, tier: 2, disposition: "left_with_evidence", evidence: "The owning header confirms the type." }),
    ];

    const records = await commentUnresolvedFindings({
      globals: globals(),
      deps,
      repo: "doldecomp/melee",
      pr: pr(),
      findings: [...tierTwo, finding({ line: 13, tier: 3 })],
      existingComments: [],
      dryRun: false,
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe("posted_top_level");
    expect(bodies[0]).toContain("<details>");
    expect(bodies[0]).toContain("Already investigated by the repair pipeline — kept as-is with evidence");
    for (const row of tierTwo) expect(bodies[0]).toContain(commentMarker(row));
    expect(bodies[0]).not.toContain(commentMarker(finding({ line: 13, tier: 3 })));
  });

  test("chunks inline failures into at most twelve groups and retries a too-quickly issue comment once", async () => {
    const findings = Array.from({ length: 13 }, (_, index) => finding({
      line: index + 1,
      ruleId: `rule_${index + 1}`,
      message: `Finding ${index + 1}`,
    }));
    const issueBodies: string[] = [];
    const delays: number[] = [];
    let issueCalls = 0;
    const deps: DraftPrQaDeps = {
      commandRunner: async (_cwd, command) => {
        const endpoint = String(command[2]);
        if (endpoint.includes("/pulls/2819/comments")) return { exitCode: 1, stdout: "", stderr: "line is not in the diff" };
        issueCalls += 1;
        issueBodies.push(command.find((part) => part.startsWith("body="))!.slice("body=".length));
        if (issueCalls === 1) return { exitCode: 1, stdout: "", stderr: "You have submitted too quickly" };
        return { exitCode: 0, stdout: JSON.stringify({ html_url: `https://example.test/comment/${issueCalls}` }), stderr: "" };
      },
    };

    const records = await commentUnresolvedFindings({
      globals: globals(),
      deps,
      repo: "doldecomp/melee",
      pr: pr(),
      findings,
      existingComments: [],
      dryRun: false,
      sleep: async (ms) => { delays.push(ms); },
    });

    expect(records).toHaveLength(2);
    expect(records.every((record) => record.status === "posted_top_level")).toBe(true);
    expect(delays).toEqual([90_000]);
    expect(issueBodies).toHaveLength(3);
    expect((issueBodies[0]!.match(/decomp-orchestrator:pr-draft-qa/g) ?? [])).toHaveLength(12);
    expect(issueBodies[1]).toBe(issueBodies[0]);
    expect((issueBodies[2]!.match(/decomp-orchestrator:pr-draft-qa/g) ?? [])).toHaveLength(1);
  });
});
