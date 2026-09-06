import { describe, expect, test } from "bun:test";
import { parse, syncMergePolicyArg } from "@server/core/game-registry/runtime-options.js";
import {
  functionScoresForSourcePath,
  functionScoresForUnit,
  mergeCFileByPolicy,
  policyMergeFileMessage,
  type FunctionScoreMap,
} from "./policy-merge.js";

function cFile(functions: Array<[name: string, value: number]>, tag = "base"): string {
  return [
    `#include "${tag}.h"`,
    "",
    `static int ${tag}_data = ${functions.length};`,
    "",
    ...functions.flatMap(([name, value]) => [
      `int ${name}(void)`,
      "{",
      `    return ${value};`,
      "}",
      "",
    ]),
  ].join("\n");
}

function mergeOne(scores: { ours: FunctionScoreMap; upstream: FunctionScoreMap }) {
  return mergeCFileByPolicy({
    path: "src/synthetic.c",
    baseText: cFile([["target", 0]]),
    oursText: cFile([["target", 1]], "ours"),
    upstreamText: cFile([["target", 2]], "upstream"),
    oursScores: scores.ours,
    upstreamScores: scores.upstream,
  });
}

describe("per-function score policy", () => {
  test("takes upstream text when upstream reports an exact function", () => {
    const result = mergeOne({ ours: { target: 100 }, upstream: { target: 100 } });

    expect(result.strategy).toBe("reconstructed");
    expect(result.decisions).toEqual([
      expect.objectContaining({ functionName: "target", side: "upstream", reason: "upstream_exact" }),
    ]);
    expect(result.text).toContain("return 2;");
    expect(result.text).toContain("upstream_data");
  });

  test("protects our exact function when upstream is not exact", () => {
    const result = mergeOne({ ours: { target: 100 }, upstream: { target: 99.8 } });

    expect(result.decisions[0]).toEqual(expect.objectContaining({
      side: "ours",
      reason: "ours_exact",
    }));
    expect(result.text).toContain("return 1;");
    expect(result.text).toContain("ours_data");
  });

  test("protects our exact function when its upstream score is missing", () => {
    const result = mergeOne({ ours: { target: 99.99999 }, upstream: {} });

    expect(result.decisions[0]).toEqual(expect.objectContaining({
      side: "ours",
      reason: "ours_exact",
      upstreamScore: null,
    }));
    expect(result.strategy).toBe("reconstructed");
  });

  test("takes the higher-scoring text when neither function is exact", () => {
    const result = mergeOne({ ours: { target: 97.5 }, upstream: { target: 99.25 } });

    expect(result.decisions[0]).toEqual(expect.objectContaining({
      side: "upstream",
      reason: "upstream_higher_score",
      oursScore: 97.5,
      upstreamScore: 99.25,
    }));
    expect(result.text).toContain("return 2;");
  });

  test("keeps our text when our non-exact score is higher", () => {
    const result = mergeOne({ ours: { target: 99.25 }, upstream: { target: 97.5 } });

    expect(result.decisions[0]).toEqual(expect.objectContaining({
      side: "ours",
      reason: "ours_higher_score",
      oursScore: 99.25,
      upstreamScore: 97.5,
    }));
    expect(result.text).toContain("return 1;");
  });

  test("takes the only side that touched a file wholesale", () => {
    const baseText = cFile([["target", 0]]);
    const oursOnly = mergeCFileByPolicy({
      path: "src/ours.c",
      baseText,
      oursText: cFile([["target", 1]], "ours"),
      upstreamText: baseText,
    });
    const upstreamOnly = mergeCFileByPolicy({
      path: "src/upstream.c",
      baseText,
      oursText: baseText,
      upstreamText: cFile([["target", 2]], "upstream"),
    });

    expect(oursOnly).toEqual(expect.objectContaining({
      fileTouch: "ours_only",
      strategy: "ours_whole",
      text: cFile([["target", 1]], "ours"),
    }));
    expect(upstreamOnly).toEqual(expect.objectContaining({
      fileTouch: "upstream_only",
      strategy: "upstream_whole",
      text: cFile([["target", 2]], "upstream"),
    }));
  });
});

describe("fallbacks", () => {
  test("chooses upstream when fallback contains an upstream_exact function", () => {
    const oursText = cFile([["one", 1], ["two", 1], ["protected", 1]], "ours");
    const upstreamText = cFile([["protected", 2], ["two", 2], ["one", 2]], "upstream");
    const result = mergeCFileByPolicy({
      path: "src/protected-exact.c",
      baseText: cFile([["one", 0], ["two", 0], ["protected", 0]]),
      oursText,
      upstreamText,
      oursScores: { one: 90, two: 90, protected: 99.97443 },
      upstreamScores: { one: 99, two: 99, protected: 100 },
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(upstreamText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "upstream",
      reason: "majority_fallback_upstream_protected",
      contestedVotes: { ours: 0, upstream: 3 },
    }));
    expect(result.fallback?.detail).toContain("function_alignment");
    expect(result.decisions.find((decision) => decision.functionName === "one")).toEqual(expect.objectContaining({
      side: "upstream", policySide: "upstream", reason: "upstream_higher_score",
    }));
    expect(result.decisions.find((decision) => decision.functionName === "protected")).toEqual(expect.objectContaining({
      side: "upstream", policySide: "upstream", reason: "upstream_exact",
    }));
  });

  test("chooses upstream over an ours majority when report fallback contains an upstream-changed function", () => {
    const upstreamText = cFile([["protected", 2], ["two", 0], ["one", 0]], "upstream");
    const result = mergeCFileByPolicy({
      path: "src/protected-no-report.c",
      baseText: cFile([["one", 0], ["two", 0], ["protected", 0]]),
      oursText: cFile([["one", 0], ["two", 0], ["protected", 0]], "ours"),
      upstreamText,
      scoreMode: "upstream-diff-fallback",
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(upstreamText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "upstream",
      reason: "majority_fallback_upstream_protected",
      contestedVotes: { ours: 0, upstream: 1 },
    }));
    expect(result.decisions.find((decision) => decision.functionName === "protected")?.reason).toBe("upstream_report_fallback_upstream_changed");
  });

  test("protects ours_exact from an upstream fallback majority", () => {
    const oursText = cFile([["protected", 1], ["one", 1], ["two", 1]], "ours");
    const result = mergeCFileByPolicy({
      path: "src/ours-exact.c",
      baseText: cFile([["protected", 0], ["one", 0], ["two", 0]]),
      oursText,
      upstreamText: cFile([["two", 2], ["one", 2], ["protected", 2]], "upstream"),
      oursScores: { protected: 100, one: 90, two: 90 },
      upstreamScores: { protected: 99, one: 99, two: 99 },
    });
    const message = policyMergeFileMessage({
      path: result.path,
      result,
      wholeFileFallbackReason: null,
      upstreamReportFallbackReason: null,
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours",
      reason: "majority_fallback_ours_protected",
      contestedVotes: { ours: 1, upstream: 2 },
    }));
    expect(result.text).toContain("int protected(void)\n{\n    return 1;");
    expect(message).toContain("fallback=majority_fallback_ours_protected:ours");
  });

  test("protects ours_higher_score from an upstream fallback majority", () => {
    const oursText = cFile([["protected", 1], ["one", 1], ["two", 1]], "ours");
    const result = mergeCFileByPolicy({
      path: "src/ours-higher.c",
      baseText: cFile([["protected", 0], ["one", 0], ["two", 0]]),
      oursText,
      upstreamText: cFile([["two", 2], ["one", 2], ["protected", 2]], "upstream"),
      oursScores: { protected: 99.5, one: 90, two: 90 },
      upstreamScores: { protected: 99, one: 99, two: 99 },
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours",
      reason: "majority_fallback_ours_protected",
      contestedVotes: { ours: 1, upstream: 2 },
    }));
    expect(result.decisions.find((decision) => decision.functionName === "protected")).toEqual(expect.objectContaining({
      side: "ours", policySide: "ours", reason: "ours_higher_score",
    }));
  });

  test("splices both protected sides using upstream context on a tie", () => {
    const file = (
      tag: string,
      oursType: string,
      oursValue: number,
      upstreamType: string,
      upstreamValue: number,
    ) => [
      `#include "${tag}.h"`,
      `#define CONTEXT_OWNER_${tag.toUpperCase()} 1`,
      `/* ${tag} context */`,
      oursType,
      "ours_protected(void)",
      "{",
      `    return ${oursValue};`,
      "}",
      `static int ${tag}_data = 2;`,
      upstreamType,
      "upstream_protected(void)",
      "{",
      `    return ${upstreamValue};`,
      "}",
      "",
    ].join("\n");
    const oursText = file("ours", "static int", 1, "int", 1);
    const upstreamText = file("upstream", "long", 2, "short", 2);
    const result = mergeCFileByPolicy({
      path: "src/both-protected.c",
      baseText: file("base", "int", 0, "int", 0),
      oursText,
      upstreamText,
      oursScores: { ours_protected: 100, upstream_protected: 90 },
      upstreamScores: { ours_protected: 90, upstream_protected: 100 },
    });

    expect(result.strategy).toBe("reconstructed");
    expect(result.fallback).toBeNull();
    expect(result.text).toContain('#include "upstream.h"');
    expect(result.text).toContain("#define CONTEXT_OWNER_UPSTREAM 1");
    expect(result.text).toContain("/* upstream context */");
    expect(result.text).toContain("static int upstream_data = 2;");
    expect(result.text).toContain("static int\nours_protected(void)\n{\n    return 1;");
    expect(result.text).toContain("short\nupstream_protected(void)\n{\n    return 2;");
    expect(result.text).not.toContain("long\nours_protected");
  });

  test("uses ours context when more report-fallback functions protect ours", () => {
    const result = mergeCFileByPolicy({
      path: "src/report-fallback-both-protected.c",
      baseText: cFile([["local_one", 0], ["local_two", 0], ["upstream_changed", 0]]),
      oursText: cFile([["local_one", 1], ["local_two", 1], ["upstream_changed", 0]], "ours"),
      upstreamText: cFile([["local_one", 0], ["local_two", 0], ["upstream_changed", 2]], "upstream"),
      scoreMode: "upstream-diff-fallback",
    });

    expect(result.strategy).toBe("reconstructed");
    expect(result.text).toContain('#include "ours.h"');
    expect(result.text).toContain("static int ours_data = 3;");
    expect(result.text).toContain("int local_one(void)\n{\n    return 1;");
    expect(result.text).toContain("int local_two(void)\n{\n    return 1;");
    expect(result.text).toContain("int upstream_changed(void)\n{\n    return 2;");
    expect(result.decisions.find((decision) => decision.functionName === "local_one")).toEqual(expect.objectContaining({
      side: "ours", reason: "upstream_report_fallback_keep_ours", oursChanged: true,
    }));
  });

  test("does not count changed first-function context as a protected function", () => {
    const file = (tag: string, local: number, upstreamChanged: number) => [
      `#include "${tag}.h"`,
      "int unchanged(void) { return 0; }",
      `int local(void) { return ${local}; }`,
      `int upstream_changed(void) { return ${upstreamChanged}; }`,
      "",
    ].join("\n");
    const result = mergeCFileByPolicy({
      path: "src/report-fallback-context-count.c",
      baseText: file("base", 0, 0),
      oursText: file("ours", 1, 0),
      upstreamText: file("base", 0, 2),
      scoreMode: "upstream-diff-fallback",
    });

    expect(result.strategy).toBe("reconstructed");
    expect(result.text).toContain('#include "base.h"');
    expect(result.text).toContain("int local(void) { return 1; }");
    expect(result.text).toContain("int upstream_changed(void) { return 2; }");
    expect(result.decisions.find((decision) => decision.functionName === "unchanged")).toEqual(expect.objectContaining({
      reason: "upstream_report_fallback_keep_ours", oursChanged: false,
    }));
  });

  test("reports protected functions lost when both protected sides cannot be spliced", () => {
    const oursText = cFile([["ours_one", 1], ["ours_two", 1], ["missing_upstream", 1]], "ours");
    const result = mergeCFileByPolicy({
      path: "src/conflicting-protected.c",
      baseText: cFile([["ours_one", 0], ["ours_two", 0], ["missing_upstream", 0]]),
      oursText,
      upstreamText: cFile([["ours_one", 2], ["ours_two", 2]], "upstream"),
      oursScores: { ours_one: 100, ours_two: 100, missing_upstream: 90 },
      upstreamScores: { ours_one: 90, ours_two: 90, missing_upstream: 100 },
    });
    const message = policyMergeFileMessage({
      path: result.path,
      result,
      wholeFileFallbackReason: null,
      upstreamReportFallbackReason: null,
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours",
      reason: "majority_fallback_conflicting_protected",
      lostProtectedFunctions: ["missing_upstream"],
    }));
    expect(message).toContain("fallback=majority_fallback_conflicting_protected:ours");
    expect(message).toContain("lost-protected=[missing_upstream]");
  });

  test("does not report a duplicated protected function from the selected side as lost", () => {
    const fn = (name: string, value: number) => `int ${name}(void) { return ${value}; }`;
    const oursText = [
      fn("ours_one", 1),
      fn("ours_one", 2),
      fn("ours_two", 1),
      fn("upstream_protected", 1),
      "",
    ].join("\n");
    const result = mergeCFileByPolicy({
      path: "src/duplicate-protected.c",
      baseText: [fn("ours_one", 0), fn("ours_two", 0), fn("upstream_protected", 0), ""].join("\n"),
      oursText,
      upstreamText: [fn("ours_one", 3), fn("ours_two", 3), fn("upstream_protected", 2), ""].join("\n"),
      oursScores: { ours_one: 100, ours_two: 100, upstream_protected: 90 },
      upstreamScores: { ours_one: 90, ours_two: 90, upstream_protected: 100 },
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours",
      reason: "majority_fallback_conflicting_protected",
      lostProtectedFunctions: ["upstream_protected"],
    }));
  });

  test("keeps majority fallback when all function decisions prefer ours", () => {
    const oursText = cFile([["one", 1], ["two", 1]], "ours");
    const result = mergeCFileByPolicy({
      path: "src/ours-majority.c",
      baseText: cFile([["one", 0], ["two", 0]]),
      oursText,
      upstreamText: cFile([["two", 2], ["one", 2]], "upstream"),
      oursScores: { one: 99, two: 100 },
      upstreamScores: { one: 90, two: 90 },
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours", reason: "majority_fallback_ours_protected", contestedVotes: { ours: 2, upstream: 0 },
    }));
  });

  test("splices an upstream-protected function by name alongside functions present on only one side", () => {
    const file = (functions: Array<[string, number]>) => [
      "static int shared_data = 0;",
      ...functions.map(([name, value]) => `int ${name}(void) { return ${value}; }`),
      "",
    ].join("\n");
    const result = mergeCFileByPolicy({
      path: "src/spliced.c",
      baseText: file([["one", 0], ["protected", 0], ["two", 0]]),
      oursText: file([["one", 1], ["ours_added", 3], ["protected", 1], ["two", 1]]),
      upstreamText: file([["one", 0], ["protected", 2], ["upstream_added", 4], ["two", 0]]),
      scoreMode: "upstream-diff-fallback",
    });

    expect(result.strategy).toBe("reconstructed");
    expect(result.fallback).toBeNull();
    expect(result.text).toBe([
      "static int shared_data = 0;",
      "int one(void) { return 1; }",
      "",
      "int ours_added(void) { return 3; }",
      "",
      "int protected(void) { return 2; }",
      "",
      "int upstream_added(void) { return 4; }",
      "",
      "int two(void) { return 1; }",
      "",
    ].join("\n"));
    expect(result.decisions.find((decision) => decision.functionName === "protected")).toEqual(expect.objectContaining({
      side: "upstream", reason: "upstream_report_fallback_upstream_changed",
    }));
  });

  test("logs the upstream-protected fallback reason", () => {
    const result = mergeCFileByPolicy({
      path: "src/protected-log.c",
      baseText: cFile([["one", 0], ["protected", 0]]),
      oursText: cFile([["one", 1], ["protected", 1]]) + "/* unterminated",
      upstreamText: cFile([["one", 2], ["protected", 2]]),
      oursScores: { one: 90, protected: 99 },
      upstreamScores: { one: 99, protected: 100 },
    });
    const message = policyMergeFileMessage({
      path: result.path,
      result,
      wholeFileFallbackReason: null,
      upstreamReportFallbackReason: null,
    });

    expect(result.fallback?.detail).toContain("c_parse");
    expect(message).toContain("strategy=majority_fallback fallback=majority_fallback_upstream_protected:upstream");
    expect(message).toContain("upstream=[one(upstream_higher_score), protected(upstream_exact)]");
  });

  test("uses upstream-touched functions when the upstream report is absent", () => {
    const baseText = cFile([["local_only", 0], ["upstream_changed", 10]]);
    const result = mergeCFileByPolicy({
      path: "src/no-report.c",
      baseText,
      oursText: cFile([["local_only", 1], ["upstream_changed", 10]]),
      upstreamText: cFile([["local_only", 0], ["upstream_changed", 11]]),
      scoreMode: "upstream-diff-fallback",
    });

    expect(result.strategy).toBe("reconstructed");
    expect(result.decisions).toEqual([
      expect.objectContaining({
        functionName: "local_only",
        side: "ours",
        reason: "upstream_report_fallback_keep_ours",
        upstreamReportFallback: true,
      }),
      expect.objectContaining({
        functionName: "upstream_changed",
        side: "upstream",
        reason: "upstream_report_fallback_upstream_changed",
        upstreamReportFallback: true,
      }),
    ]);
    expect(result.text).toContain("return 1;");
    expect(result.text).toContain("return 11;");
  });

  test("falls back to the whole side favored by contested functions when alignment is ambiguous", () => {
    const baseText = cFile([["one", 0], ["two", 0], ["three", 0]]);
    const oursText = cFile([["one", 1], ["two", 1], ["three", 1]], "ours"),
      upstreamText = cFile([["three", 2], ["two", 2], ["one", 2]], "upstream");
    const result = mergeCFileByPolicy({
      path: "src/reordered.c",
      baseText,
      oursText,
      upstreamText,
      oursScores: { one: 99, two: 99, three: 90 },
      upstreamScores: { one: 90, two: 90, three: 99 },
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours",
      reason: "majority_fallback_ours_protected",
      contestedVotes: { ours: 2, upstream: 1 },
    }));
    expect(result.decisions.every((decision) => decision.side === "ours")).toBe(true);
    expect(result.decisions.find((decision) => decision.functionName === "three")?.policySide).toBe("upstream");
  });

  test("counts an exact added function when an alignment fallback chooses a whole side", () => {
    const baseText = cFile([["one", 0]]);
    const oursText = cFile([["one", 1], ["ours_added", 2]], "ours");
    const upstreamText = cFile([["one", 2]], "upstream");
    const result = mergeCFileByPolicy({
      path: "src/added.c",
      baseText,
      oursText,
      upstreamText,
      oursScores: { one: 99, ours_added: 100 },
      upstreamScores: { one: 90 },
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours",
      reason: "majority_fallback_ours_protected",
      contestedVotes: { ours: 2, upstream: 0 },
    }));
    expect(result.decisions.find((decision) => decision.functionName === "ours_added")).toEqual(expect.objectContaining({
      side: "ours",
      policySide: "ours",
      reason: "ours_exact",
    }));
  });

  test("keeps our exact file when upstream deleted it", () => {
    const baseText = cFile([["target", 0]]);
    const oursText = cFile([["target", 1]], "ours");
    const result = mergeCFileByPolicy({
      path: "src/deleted-upstream.c",
      baseText,
      oursText,
      upstreamText: "",
      oursScores: { target: 100 },
      upstreamScores: {},
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(oursText);
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "ours",
      reason: "majority_fallback_ours_protected",
      contestedVotes: { ours: 1, upstream: 0 },
    }));
  });

  test("uses upstream context when protected function owners disagree on helper text", () => {
    const file = (tag: string, one: number, two: number) => [
      `#include "${tag}.h"`,
      `int one(void) { return ${one}; }`,
      `static int ${tag}_helper = ${one + two};`,
      `int two(void) { return ${two}; }`,
      "",
    ].join("\n");
    const result = mergeCFileByPolicy({
      path: "src/context.c",
      baseText: file("base", 0, 0),
      oursText: file("ours", 1, 1),
      upstreamText: file("upstream", 2, 2),
      oursScores: { one: 100, two: 90 },
      upstreamScores: { one: 90, two: 100 },
    });

    expect(result.strategy).toBe("reconstructed");
    expect(result.fallback).toBeNull();
    expect(result.text).toBe([
      '#include "upstream.h"',
      "int one(void) { return 1; }",
      "static int upstream_helper = 4;",
      "int two(void) { return 2; }",
      "",
    ].join("\n"));
  });

  test("marks an unsupported top-level function signature as ambiguous", () => {
    const file = (value: number) => [
      `int known(void) { return ${value}; }`,
      `int attributed(void) __attribute__((noinline)) { return ${value}; }`,
      "",
    ].join("\n");
    const result = mergeCFileByPolicy({
      path: "src/attributed.c",
      baseText: file(0),
      oursText: file(1),
      upstreamText: file(2),
      oursScores: { known: 100, attributed: 100 },
      upstreamScores: { known: 90, attributed: 90 },
    });

    expect(result.strategy).toBe("majority_fallback");
    expect(result.fallback).toEqual(expect.objectContaining({ reason: "majority_fallback_ours_protected" }));
    expect(result.fallback?.detail).toContain("unrecognized top-level definition");
  });
});

test("extracts objdiff function scores for one unit", () => {
  expect(functionScoresForUnit({
    units: [
      { name: "main/a", functions: [{ name: "exact", fuzzy_match_percent: 100 }] },
      { name: "main/b", functions: [{ name: "fuzzy", fuzzy_match_percent: 98.5 }] },
    ],
  }, "main/b")).toEqual({ fuzzy: 98.5 });
});

test("extracts numeric-string scores by normalized source path", () => {
  const report = {
    units: [
      {
        name: "renamed/upstream-unit",
        metadata: { source_path: "./src/melee/ft/target.c" },
        functions: [{ name: "metadata_match", match_percent: "99.99999", fuzzy_match_percent: "12" }],
      },
      {
        name: "main/melee/gm/derived",
        functions: [{ name: "derived_match", fuzzy_match_percent: "98.75" }],
      },
    ],
  };

  expect(functionScoresForSourcePath(report, "src/melee/ft/target.c")).toEqual({ metadata_match: 99.99999 });
  expect(functionScoresForSourcePath(report, "./src/melee/gm/derived.c")).toEqual({ derived_match: 98.75 });
});

test("sync merge policy defaults to score and accepts the theirs escape hatch", () => {
  expect(syncMergePolicyArg(parse(["run-loop"]).args)).toBe("score");
  expect(syncMergePolicyArg(parse(["run-loop", "--sync-merge-policy=theirs"]).args)).toBe("theirs");
  expect(syncMergePolicyArg(parse(["run-loop", "--sync-merge-policy", "THEIRS"]).args)).toBe("theirs");
  expect(() => syncMergePolicyArg(parse(["run-loop", "--sync-merge-policy=hybrid"]).args)).toThrow("score, theirs");
});
