import { expect, test } from "bun:test";
import { fetchUpstreamAndFindMergedPrs, mergedPullRequestNumbers, parseBaseRef } from "./upstream.js";

test("parses upstream branches and deduplicates merged PR subjects", () => {
  expect(parseBaseRef("upstream/feature/main")).toEqual({ remote: "upstream", branch: "feature/main" });
  expect(parseBaseRef("invalid")).toEqual({ remote: "origin", branch: "master" });
  expect(mergedPullRequestNumbers("Merge pull request #12\nFix function (#3)\nMerge PR #12\nnoise #999")).toEqual([3, 12]);
});

test("uses retained intake revision after a prior fetch without changing checkout", async () => {
  const calls: string[][] = [];
  let revalidated = false;
  const result = await fetchUpstreamAndFindMergedPrs({ runGit: async (cwd, args) => {
    expect(cwd).toBe("/repo");
    calls.push(args);
    if (args[0] === "fetch") expect(revalidated).toBe(true);
    return { exitCode: 0, stdout: args[0] === "rev-parse" ? "new-head\n" : args[0] === "branch" ? "harness\n" : args[0] === "log" ? "Fixed (#42)\n" : "", stderr: "" };
  } }, { repoRoot: "/repo", game: { baseRef: "upstream/main" } }, (() => { revalidated = true; }) as any, { upstreamFrom: "old-head" });
  expect(result).toMatchObject({ beforeRef: "old-head", afterRef: "new-head", branch: "harness", mergedPrs: [42] });
  expect(calls).toEqual([["fetch", "--prune", "upstream"], ["rev-parse", "--verify", "upstream/main"], ["branch", "--show-current"], ["log", "--first-parent", "--format=%s%n%b", "old-head..new-head"]]);
  expect(result.steps[0]?.name).toBe("use_intake_upstream_from");
});

test("unchanged upstream does not inspect a commit range", async () => {
  const calls: string[] = [];
  const result = await fetchUpstreamAndFindMergedPrs({ runGit: async (_cwd, args) => {
    calls.push(args[0]!);
    return { exitCode: 0, stdout: args[0] === "rev-parse" ? "same\n" : "", stderr: "" };
  } }, { repoRoot: "/repo", game: null });
  expect(result.mergedPrs).toEqual([]);
  expect(calls).toEqual(["rev-parse", "fetch", "rev-parse", "branch"]);
});
