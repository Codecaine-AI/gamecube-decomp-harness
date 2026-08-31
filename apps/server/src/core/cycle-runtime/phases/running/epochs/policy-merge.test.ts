import { describe, expect, test } from "bun:test";
import { parse, syncMergePolicyArg } from "@server/core/game-registry/runtime-options.js";
import {
  functionScoresForSourcePath,
  functionScoresForUnit,
  mergeCFileByPolicy,
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
      reason: "function_alignment",
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
      reason: "function_alignment",
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
      reason: "no_functions",
      contestedVotes: { ours: 1, upstream: 0 },
    }));
  });

  test("uses a whole-file vote when split function owners disagree on helper text", () => {
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

    expect(result.strategy).toBe("majority_fallback");
    expect(result.text).toBe(file("upstream", 2, 2));
    expect(result.fallback).toEqual(expect.objectContaining({
      side: "upstream",
      reason: "context_ownership",
      contestedVotes: { ours: 1, upstream: 1 },
    }));
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
    expect(result.fallback).toEqual(expect.objectContaining({ reason: "c_parse" }));
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
