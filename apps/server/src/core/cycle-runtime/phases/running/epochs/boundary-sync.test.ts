import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  BOUNDARY_OVERRIDE_VERDICT,
  detectBoundaryDisplacements,
  planBoundarySync,
  runBoundarySync,
  type BoundaryGitRunner,
  type BoundarySyncHooks,
} from "./boundary-sync.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function fixtureRepo(): { repo: string; anchor: string; upstreamHead: string } {
  const root = mkdtempSync(join(tmpdir(), "boundary-sync-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const repo = join(root, "cycle");
  git(root, ["init", "--bare", remote]);
  git(root, ["init", "-b", "master", seed]);
  git(seed, ["config", "user.email", "test@example.com"]);
  git(seed, ["config", "user.name", "Boundary Test"]);
  mkdirSync(join(seed, "src", "melee", "ty"), { recursive: true });
  writeFileSync(join(seed, "src", "melee", "ty", "toy.c"), "int same(void) { return 0; }\n");
  writeFileSync(join(seed, "upstream.c"), "int upstream(void) { return 0; }\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "anchor"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "-u", "origin", "master"]);
  const anchor = git(seed, ["rev-parse", "HEAD"]);
  git(root, ["clone", remote, repo]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Boundary Test"]);
  writeFileSync(join(repo, "src", "melee", "ty", "toy.c"), "int same(void) { return 1; }\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "worker-integration(job-7b7c): main/melee/ty/toy::Toy_80310324 [checkpoint 77e0e849]"]);
  writeFileSync(join(seed, "src", "melee", "ty", "toy.c"), "int same(void) { return 2; }\n");
  writeFileSync(join(seed, "upstream.c"), "int upstream(void) { return 2; }\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "upstream wins"]);
  git(seed, ["push", "origin", "master"]);
  return { repo, anchor, upstreamHead: git(seed, ["rev-parse", "HEAD"]) };
}

describe("boundary sync", () => {
  test("maps only targets whose locally changed files upstream took", () => {
    expect(detectBoundaryDisplacements({
      upstreamTakenFiles: ["src/a.c"],
      upstreamHeadSha: "upstream-sha",
      targets: [
        { targetKey: "a", sourcePath: "src/a.c", unit: "a", symbol: "func_a", priorKind: "match", priorScore: 100 },
        { targetKey: "b", sourcePath: "src/b.c", priorKind: "improvement", priorScore: 72 },
      ],
    })).toEqual([{
      epochTargetId: null,
      targetKey: "a",
      sourcePath: "src/a.c",
      unit: "a",
      symbol: "func_a",
      priorKind: "match",
      priorScore: 100,
      upstreamLandedSha: "upstream-sha",
      verdict: BOUNDARY_OVERRIDE_VERDICT,
    }]);
  });

  test("dry-run fetches and returns a complete plan without changing HEAD", async () => {
    const fixture = fixtureRepo();
    const before = git(fixture.repo, ["rev-parse", "HEAD"]);
    const plan = await planBoundarySync({
      repoRoot: fixture.repo,
      anchorSha: fixture.anchor,
      dryRun: true,
      targets: [{ targetKey: "main/melee/ty/toy::Toy_80310324", sourcePath: "src/melee/ty/toy.c", priorKind: "match", priorScore: 100 }],
    });
    expect(plan).toMatchObject({
      schemaVersion: 1,
      dryRun: true,
      anchorSha: fixture.anchor,
      localHeadSha: before,
      upstreamHeadSha: fixture.upstreamHead,
      drifted: true,
      upstreamTakenFiles: ["src/melee/ty/toy.c"],
      targetsToRequeue: [{ targetKey: "main/melee/ty/toy::Toy_80310324", priorKind: "match", priorScore: 100, verdict: BOUNDARY_OVERRIDE_VERDICT }],
      ledgerNotes: [{ targetKey: "main/melee/ty/toy::Toy_80310324", verdict: BOUNDARY_OVERRIDE_VERDICT }],
    });
    expect(plan.upstreamChangedFiles).toEqual(["src/melee/ty/toy.c", "upstream.c"]);
    expect(git(fixture.repo, ["rev-parse", "HEAD"])).toBe(before);
    expect(git(fixture.repo, ["status", "--porcelain"])).toBe("");
  });

  test("discovers a displaced integration from branch history without run state", async () => {
    const fixture = fixtureRepo();
    const plan = await planBoundarySync({
      repoRoot: fixture.repo,
      anchorSha: fixture.anchor,
      dryRun: true,
      targets: [],
    });

    expect(plan.targetsToRequeue).toEqual([expect.objectContaining({
      targetKey: "main/melee/ty/toy::Toy_80310324",
      sourcePath: "src/melee/ty/toy.c",
      priorKind: null,
      priorScore: null,
      upstreamLandedSha: fixture.upstreamHead,
      verdict: BOUNDARY_OVERRIDE_VERDICT,
    })]);
  });

  test("merges with upstream precedence, writes typed save point, and advances anchor and head", async () => {
    const fixture = fixtureRepo();
    const calls: Array<[string, unknown]> = [];
    const hooks: BoundarySyncHooks = {
      ingestMergedUpstream: async (value) => { calls.push(["ingest", value]); },
      appendOverrideNote: (value) => { calls.push(["note", value]); },
      requeueTarget: (value) => { calls.push(["requeue", value]); },
      rebuildKnowledgeGraph: async () => { calls.push(["kg", null]); },
      recomputeReport: async () => {
        calls.push(["report", null]);
        return {
          matchedCodePercent: 91.2,
          matchedDataPercent: 84.5,
          measures: { matched_code_percent: 91.2, matched_data_percent: 84.5 },
          sectionMeasures: { ".data": { sizeBytes: 8, fuzzyMatchPercent: 84.5, exactRows: 0, totalRows: 1 } },
        };
      },
      writePrSyncSavePoint: (value) => { calls.push(["save", value]); },
      advanceAnchor: (value) => { calls.push(["anchor", value]); },
      advanceCycleHead: (value) => { calls.push(["head", value]); },
    };
    const result = await runBoundarySync({
      repoRoot: fixture.repo,
      anchorSha: fixture.anchor,
      targets: [{ targetKey: "main/melee/ty/toy::Toy_80310324", sourcePath: "src/melee/ty/toy.c", priorKind: "improvement", priorScore: 80 }],
      hooks,
    });
    expect(result.changed).toBe(true);
    await expect(Bun.file(join(fixture.repo, "src", "melee", "ty", "toy.c")).text()).resolves.toContain("return 2");
    expect(calls.map(([name]) => name)).toEqual(["ingest", "note", "requeue", "report", "kg", "save", "anchor", "head"]);
    expect(calls.find(([name]) => name === "save")?.[1]).toMatchObject({
      kind: "pr_sync",
      anchorSha: fixture.anchor,
      upstreamHeadSha: fixture.upstreamHead,
      commitSha: result.headSha,
      matchedCodePercent: 91.2,
      matchedDataPercent: 84.5,
      sectionMeasures: { ".data": { sizeBytes: 8, fuzzyMatchPercent: 84.5, exactRows: 0, totalRows: 1 } },
    });
    expect(calls.find(([name]) => name === "anchor")?.[1]).toEqual({
      previousAnchorSha: fixture.anchor,
      upstreamHeadSha: fixture.upstreamHead,
    });
    expect(calls.find(([name]) => name === "head")?.[1]).toMatchObject({ headSha: result.headSha });
  });

  test("runs the fixer with extracted errors and upstream range, retries, and commits its diff", async () => {
    const fixture = fixtureRepo();
    let reportRuns = 0;
    let fixerPrompt = "";
    let advancedHead = "";
    const result = await runBoundarySync({
      repoRoot: fixture.repo,
      anchorSha: fixture.anchor,
      targets: [],
      runBuildFixer: async (input) => {
        fixerPrompt = input.prompt;
        writeFileSync(join(fixture.repo, "src", "melee", "ty", "toy.c"), "int same(void) { return 2; }\n/* fixed */\n");
        return { exitCode: 0, timedOut: false, output: "edited" };
      },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {},
        rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => {
          reportRuns += 1;
          if (reportRuns === 1) throw new Error([
            "irrelevant setup noise",
            "FAILED: build/GALE01/src/melee/ty/toy.o",
            "### mwcceppc.exe Compiler:",
            "src/melee/ty/toy.c:12: error: cur redefined",
            ...Array.from({ length: 45 }, (_, index) => `error: unrelated diagnostic ${index}`),
            "FAILED: build/GALE01/src/melee/ft/second.o",
            "### mwcceppc.exe Compiler:",
            "src/melee/ft/second.c:8: error: signature mismatch",
            "ninja: build stopped: cannot make progress due to previous errors.",
          ].join("\n"));
          return { matchedCodePercent: 100 };
        },
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {},
        advanceCycleHead: ({ headSha }) => { advancedHead = headSha; },
      },
    });

    expect(reportRuns).toBe(2);
    expect(fixerPrompt).toContain(`The merged upstream commit range is ${fixture.anchor}..${fixture.upstreamHead}.`);
    expect(fixerPrompt).toContain(`git show ${fixture.upstreamHead}:<path>`);
    expect(fixerPrompt).toContain("src/melee/ty/toy.c:12: error: cur redefined");
    expect(fixerPrompt).toContain("FAILED: build/GALE01/src/melee/ft/second.o");
    expect(fixerPrompt).toContain("src/melee/ft/second.c:8: error: signature mismatch");
    expect(fixerPrompt).not.toContain("irrelevant setup noise");
    expect(fixerPrompt).toContain("Edit only. Do not build or commit.");
    expect(git(fixture.repo, ["log", "-1", "--format=%s"])).toBe("boundary sync build-fixer: src/melee/ty/toy.c");
    expect(git(fixture.repo, ["log", "-2", "--format=%s"]).split("\n")[1]).toStartWith("Merge commit '");
    expect(result.headSha).toBe(git(fixture.repo, ["rev-parse", "HEAD"]));
    expect(advancedHead).toBe(result.headSha);
  });

  test("fails the sync without retrying when the fixer fails", async () => {
    const fixture = fixtureRepo();
    let reportRuns = 0;
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [],
      runBuildFixer: async () => {
        writeFileSync(join(fixture.repo, "src", "melee", "ty", "toy.c"), "int same(void) { return 3; }\n");
        writeFileSync(join(fixture.repo, "new-fixer-file.c"), "int dirty;\n");
        return { exitCode: 1, timedOut: false, output: "failed" };
      },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => { reportRuns += 1; throw new Error("error: gobj redefined"); },
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceCycleHead: () => {},
      },
    })).rejects.toThrow("gobj redefined");
    expect(reportRuns).toBe(1);
    expect(git(fixture.repo, ["log", "-1", "--format=%s"])).toStartWith("Merge commit '");
    expect(git(fixture.repo, ["status", "--porcelain"])).toBe("");
  });

  test("failed report retry discards the successful fixer's edits", async () => {
    const fixture = fixtureRepo();
    let reportRuns = 0;
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [],
      runBuildFixer: async () => {
        writeFileSync(join(fixture.repo, "src", "melee", "ty", "toy.c"), "int same(void) { return 3; }\n");
        return { exitCode: 0, timedOut: false, output: "edited" };
      },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => { reportRuns += 1; throw new Error(reportRuns === 1 ? "first TU failed" : "second TU failed"); },
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceCycleHead: () => {},
      },
    })).rejects.toThrow("second TU failed");
    expect(reportRuns).toBe(2);
    expect(git(fixture.repo, ["status", "--porcelain"])).toBe("");
    expect(git(fixture.repo, ["show", "HEAD:src/melee/ty/toy.c"])).toContain("return 2");
  });

  test("does not invoke the fixer when the flag is off", async () => {
    const fixture = fixtureRepo();
    let fixerRuns = 0;
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [], buildFixerEnabled: false,
      runBuildFixer: async () => { fixerRuns += 1; return { exitCode: 0, timedOut: false, output: "" }; },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => { throw new Error("error: removed function call"); },
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceCycleHead: () => {},
      },
    })).rejects.toThrow("removed function call");
    expect(fixerRuns).toBe(0);
  });

  test("raises a loud error when fetch fails", async () => {
    const runGit: BoundaryGitRunner = async () => ({ exitCode: 1, stdout: "", stderr: "network unavailable" });
    expect(planBoundarySync({ repoRoot: "/fixture", anchorSha: "a", targets: [], runGit })).rejects.toThrow(
      "boundary sync fetch failed: network unavailable",
    );
  });
});
