import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

function fixtureRepo(targetSymbol = "Toy_80310324", sourcePath = "src/melee/ty/toy.c", unit = "main/melee/ty/toy"): { repo: string; anchor: string; upstreamHead: string } {
  const root = mkdtempSync(join(tmpdir(), "boundary-sync-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const repo = join(root, "cycle");
  git(root, ["init", "--bare", remote]);
  git(root, ["init", "-b", "master", seed]);
  git(seed, ["config", "user.email", "test@example.com"]);
  git(seed, ["config", "user.name", "Boundary Test"]);
  mkdirSync(dirname(join(seed, sourcePath)), { recursive: true });
  writeFileSync(join(seed, sourcePath), "int same(void) { return 0; }\n");
  writeFileSync(join(seed, "upstream.c"), "int upstream(void) { return 0; }\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "anchor"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "-u", "origin", "master"]);
  const anchor = git(seed, ["rev-parse", "HEAD"]);
  git(root, ["clone", remote, repo]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Boundary Test"]);
  writeFileSync(join(repo, sourcePath), "int same(void) { return 1; }\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", `worker-integration(job-7b7c): ${unit}::${targetSymbol} [checkpoint 77e0e849]`]);
  writeFileSync(join(seed, sourcePath), "int same(void) { return 2; }\n");
  writeFileSync(join(seed, "upstream.c"), "int upstream(void) { return 2; }\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "upstream wins"]);
  git(seed, ["push", "origin", "master"]);
  return { repo, anchor, upstreamHead: git(seed, ["rev-parse", "HEAD"]) };
}

describe("boundary sync", () => {
  test("SMS C++ displacement survives a failed note write and retries from the original report", async () => {
    const sourcePath = "src/Enemy/test.cpp";
    const unit = "mario/Enemy/test";
    const fixture = fixtureRepo("same", sourcePath, unit);
    const beforeHead = git(fixture.repo, ["rev-parse", "HEAD"]);
    const reportRelPath = "build/GMSJ01/report.json";
    const reportPath = join(fixture.repo, reportRelPath);
    mkdirSync(dirname(reportPath), { recursive: true });
    const makeReport = (score: number) => ({ units: [{ name: unit, metadata: { source_path: sourcePath }, functions: [
      { name: "same", fuzzy_match_percent: score }, { name: "collateral", fuzzy_match_percent: score },
    ] }] });
    writeFileSync(reportPath, JSON.stringify(makeReport(100)));
    const notes: unknown[] = [];
    let failNote = true;
    let publications = 0;
    // Both sides rewrote the same line; only the explicit theirs policy may let upstream win it.
    const input = {
      repoRoot: fixture.repo, anchorSha: fixture.anchor, stateDir: join(fixture.repo, ".state"), reportRelPath, mergePolicy: "theirs" as const,
      targets: [{ targetKey: `${unit}::same`, sourcePath, unit, symbol: "same", priorKind: "improvement" as const, priorScore: 12 }],
      buildFixerEnabled: false,
      hooks: {
        ingestMergedUpstream: async () => {},
        appendOverrideNote: (item: unknown) => { if (failNote) throw new Error("knowledge unavailable"); notes.push(item); },
        requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => { writeFileSync(reportPath, JSON.stringify(makeReport(70))); return { matchedCodePercent: 70 }; },
        writePrSyncSavePoint: () => { publications++; }, advanceAnchor: () => {}, advanceHarnessHead: () => {},
      },
    };
    const plan = await planBoundarySync({ ...input, dryRun: true });
    expect(plan.targetsToRequeue).toHaveLength(1);
    expect(plan.targetsToRequeue[0]?.sourcePath).toBe(sourcePath);
    await expect(runBoundarySync(input)).rejects.toThrow("knowledge unavailable");
    expect(publications).toBe(0);
    expect(existsSync(join(input.stateDir, "boundary_recovery/pending.json"))).toBe(true);
    const mergedHead = git(fixture.repo, ["rev-parse", "HEAD"]);
    expect(mergedHead).not.toBe(beforeHead);
    failNote = false;
    const retried = await runBoundarySync(input);
    expect(retried.headSha).toBe(mergedHead);
    expect(notes).toHaveLength(2); // Include collateral loss, not just the worker's primary target.
    expect(notes).toContainEqual(expect.objectContaining({ targetKey: `${unit}::same`, priorScore: 100, afterScore: 70, priorHeadSha: beforeHead }));
    expect(publications).toBe(1);
    expect(existsSync(join(input.stateDir, "boundary_recovery/pending.json"))).toBe(false);
  });

  test("score policy stops instead of taking upstream over a conflicting C++ epoch change", async () => {
    const fixture = fixtureRepo("same", "src/Enemy/test.cpp", "mario/Enemy/test");
    const head = git(fixture.repo, ["rev-parse", "HEAD"]);
    let advanced = false;
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [], buildFixerEnabled: false,
      hooks: { ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {}, recomputeReport: async () => ({}), writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceHarnessHead: () => { advanced = true; } },
    })).rejects.toThrow("policy merge stopped at contested file src/Enemy/test.cpp");
    expect(git(fixture.repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(readFileSync(join(fixture.repo, "src/Enemy/test.cpp"), "utf8")).toBe("int same(void) { return 1; }\n");
    expect(git(fixture.repo, ["status", "--porcelain"])).toBe("");
    expect(advanced).toBe(false);
  });

  test("blocks before a merge when the pre-merge recovery report is missing", async () => {
    const fixture = fixtureRepo();
    const head = git(fixture.repo, ["rev-parse", "HEAD"]);
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, stateDir: join(fixture.repo, ".state"), reportRelPath: "build/GMSJ01/report.json", targets: [],
      hooks: { ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {}, recomputeReport: async () => ({}), writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceHarnessHead: () => {} },
    })).rejects.toThrow();
    expect(git(fixture.repo, ["rev-parse", "HEAD"])).toBe(head);
  });

  test("uses source metadata for renamed C++ units and refuses to silently skip an unresolved integration", async () => {
    const fixture = fixtureRepo("same", "src/renamed.cc", "custom-module/Enemy/test");
    const input = { repoRoot: fixture.repo, anchorSha: fixture.anchor, dryRun: true, targets: [] };
    await expect(planBoundarySync(input)).rejects.toThrow("cannot resolve source");
    const plan = await planBoundarySync({ ...input, targets: [{
      targetKey: "custom-module/Enemy/test::same", sourcePath: "src/renamed.cc", priorScore: 100, priorKind: "match",
    }] });
    expect(plan.targetsToRequeue).toHaveLength(1);
    expect(plan.targetsToRequeue[0]?.sourcePath).toBe("src/renamed.cc");
  });

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
    expect(plan.actions).toEqual([
      "merge_upstream_score",
      "recompute_report",
      "append_override_notes",
      "requeue_displaced_targets",
      "knowledge_intake",
      "rebuild_knowledge_graph",
      "write_pr_sync_save_point",
      "advance_anchor",
      "advance_harness_head",
    ]);
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

  test("uses explicit theirs policy, writes typed save point, and advances anchor and head", async () => {
    const fixture = fixtureRepo();
    const calls: Array<[string, unknown]> = [];
    let reportPreparations = 0;
    let upstreamReportFetches = 0;
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
      advanceHarnessHead: (value) => { calls.push(["head", value]); },
    };
    const result = await runBoundarySync({
      repoRoot: fixture.repo,
      anchorSha: fixture.anchor,
      mergePolicy: "theirs",
      prepareMergeReport: async () => { reportPreparations += 1; },
      fetchUpstreamReport: async () => { upstreamReportFetches += 1; return { path: "/unused" }; },
      targets: [{ targetKey: "main/melee/ty/toy::Toy_80310324", sourcePath: "src/melee/ty/toy.c", priorKind: "improvement", priorScore: 80 }],
      hooks,
    });
    expect(result.changed).toBe(true);
    expect(result.plan.actions[0]).toBe("merge_upstream_theirs");
    expect(result.plan.actions).toEqual([
      "merge_upstream_theirs",
      "recompute_report",
      "append_override_notes",
      "requeue_displaced_targets",
      "knowledge_intake",
      "rebuild_knowledge_graph",
      "write_pr_sync_save_point",
      "advance_anchor",
      "advance_harness_head",
    ]);
    expect(reportPreparations).toBe(0);
    expect(upstreamReportFetches).toBe(0);
    await expect(Bun.file(join(fixture.repo, "src", "melee", "ty", "toy.c")).text()).resolves.toContain("return 2");
    expect(calls.map(([name]) => name)).toEqual(["report", "note", "requeue", "ingest", "kg", "save", "anchor", "head"]);
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

  test("defaults to score policy and protects our exact function", async () => {
    const fixture = fixtureRepo("same");
    const reportPath = join(fixture.repo, "build", "GALE01", "report.json");
    const upstreamReportPath = join(fixture.repo, "upstream-report.json");
    mkdirSync(join(fixture.repo, "build", "GALE01"), { recursive: true });
    writeFileSync(upstreamReportPath, JSON.stringify({
      units: [{
        name: "main/melee/ty/toy",
        metadata: { source_path: "src/melee/ty/toy.c" },
        functions: [{ name: "same", fuzzy_match_percent: 98 }],
      }],
    }));
    let prepared = false;
    let requeues = 0;
    const fetchInputs: Array<{ anchorSha: string; version: string }> = [];
    const policyLogs: string[] = [];
    const result = await runBoundarySync({
      repoRoot: fixture.repo,
      stateDir: join(fixture.repo, ".state"),
      anchorSha: fixture.anchor,
      targets: [],
      prepareMergeReport: async () => {
        prepared = true;
        writeFileSync(reportPath, JSON.stringify({
          units: [{
            name: "main/melee/ty/toy",
            metadata: { source_path: "src/melee/ty/toy.c" },
            functions: [{ name: "same", fuzzy_match_percent: 100 }],
          }],
        }));
      },
      fetchUpstreamReport: async (input) => {
        fetchInputs.push({ anchorSha: input.anchorSha, version: input.version });
        return { path: upstreamReportPath };
      },
      onMergePolicyFile: (entry) => { policyLogs.push(entry.message); },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => { requeues += 1; }, requeueTarget: () => { requeues += 1; },
        rebuildKnowledgeGraph: async () => {}, recomputeReport: async () => ({ matchedCodePercent: 100 }),
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceHarnessHead: () => {},
      },
    });

    expect(prepared).toBe(true);
    expect(result.plan.actions[0]).toBe("merge_upstream_score");
    expect(fetchInputs).toEqual([{ anchorSha: fixture.upstreamHead, version: "GALE01" }]);
    await expect(Bun.file(join(fixture.repo, "src", "melee", "ty", "toy.c")).text()).resolves.toContain("return 1");
    expect(result.policyMergeFiles).toHaveLength(1);
    expect(result.plan.targetsToRequeue).toEqual([]);
    expect(requeues).toBe(0);
    expect(result.policyMergeFiles?.[0]?.result?.decisions).toEqual([
      expect.objectContaining({ functionName: "same", side: "ours", reason: "ours_exact" }),
    ]);
    expect(policyLogs).toEqual([
      expect.stringContaining("ours=[same(ours_exact)] upstream=[] strategy=reconstructed"),
    ]);
  });

  test("uses and logs the upstream-diff fallback when the target report is absent", async () => {
    const fixture = fixtureRepo();
    const reportPath = join(fixture.repo, "build", "GALE01", "report.json");
    mkdirSync(join(fixture.repo, "build", "GALE01"), { recursive: true });
    const policyLogs: string[] = [];
    const result = await runBoundarySync({
      repoRoot: fixture.repo,
      stateDir: join(fixture.repo, ".state"),
      anchorSha: fixture.anchor,
      targets: [],
      prepareMergeReport: async () => {
        writeFileSync(reportPath, JSON.stringify({ units: [] }));
      },
      fetchUpstreamReport: async () => ({ path: null, reason: "artifact missing for target revision" }),
      onMergePolicyFile: (entry) => { policyLogs.push(entry.message); },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {},
        rebuildKnowledgeGraph: async () => {}, recomputeReport: async () => ({ matchedCodePercent: 99 }),
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceHarnessHead: () => {},
      },
    });

    await expect(Bun.file(join(fixture.repo, "src", "melee", "ty", "toy.c")).text()).resolves.toContain("return 2");
    expect(result.policyMergeFiles?.[0]?.result?.scoreMode).toBe("upstream-diff-fallback");
    expect(result.policyMergeFiles?.[0]?.result?.decisions[0]).toEqual(expect.objectContaining({
      side: "upstream",
      reason: "upstream_report_fallback_upstream_changed",
    }));
    expect(policyLogs[0]).toContain("upstream-report-fallback=artifact missing for target revision");
  });

  test.each(["score", "theirs"] as const)("advances a stale anchor without replaying the %s merge", async (mergePolicy) => {
    const fixture = fixtureRepo();
    git(fixture.repo, ["fetch", "origin"]);
    git(fixture.repo, ["merge", "--no-edit", "-X", "theirs", "origin/master"]);
    const before = git(fixture.repo, ["rev-parse", "HEAD"]);
    let reportPreparations = 0;
    let advancedHead = "";
    const gitCalls: string[][] = [];
    const result = await runBoundarySync({
      repoRoot: fixture.repo,
      anchorSha: fixture.anchor,
      mergePolicy,
      runGit: async (repo, args) => {
        gitCalls.push(args);
        const proc = Bun.spawnSync(["git", "-C", repo, ...args]);
        return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
      },
      targets: [],
      prepareMergeReport: async () => { reportPreparations += 1; },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {},
        rebuildKnowledgeGraph: async () => {}, recomputeReport: async () => ({ matchedCodePercent: 100 }),
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {},
        advanceHarnessHead: ({ headSha }) => { advancedHead = headSha; },
      },
    });

    expect(result.changed).toBe(false);
    expect(gitCalls.some((args) => args[0] === "merge")).toBe(false);
    expect(result.headSha).toBe(before);
    expect(advancedHead).toBe(before);
    expect(reportPreparations).toBe(0);
    expect(result.policyMergeFiles).toEqual(mergePolicy === "score" ? [] : undefined);
    expect(result.plan.targetsToRequeue).toEqual([]);
  });

  test("unchanged upstream refreshes evidence and completes without changing source", async () => {
    const fixture = fixtureRepo();
    git(fixture.repo, ["fetch", "origin"]);
    git(fixture.repo, ["merge", "--no-edit", "-X", "theirs", "origin/master"]);
    const before = git(fixture.repo, ["rev-parse", "HEAD"]);
    const calls: string[] = [];
    const result = await runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.upstreamHead, targets: [],
      hooks: {
        recomputeReport: async () => { calls.push("report"); return { matchedCodePercent: 100 }; },
        ingestMergedUpstream: async (value) => {
          expect(value).toEqual({ previousAnchorSha: fixture.upstreamHead, upstreamHeadSha: fixture.upstreamHead });
          calls.push("intake");
        },
        appendOverrideNote: () => { calls.push("note"); },
        requeueTarget: () => { calls.push("requeue"); },
        rebuildKnowledgeGraph: async () => { calls.push("graph"); },
        writePrSyncSavePoint: (value) => {
          expect(value.commitSha).toBe(before);
          calls.push("save");
        },
        advanceAnchor: () => { calls.push("anchor"); },
        advanceHarnessHead: (value) => {
          expect(value).toEqual({ previousHeadSha: before, headSha: before });
          calls.push("head");
        },
      },
    });
    expect(result.changed).toBe(false);
    expect(result.plan.drifted).toBe(false);
    expect(result.headSha).toBe(before);
    expect(git(fixture.repo, ["rev-parse", "HEAD"])).toBe(before);
    expect(calls).toEqual(["report", "intake", "graph", "save", "anchor", "head"]);
    expect(result.plan.actions).toEqual([
      "recompute_report", "knowledge_intake", "rebuild_knowledge_graph",
      "write_pr_sync_save_point", "advance_anchor", "advance_harness_head",
    ]);
  });

  test("unchanged upstream report failure does not run a source fixer or complete sync", async () => {
    const fixture = fixtureRepo();
    const before = git(fixture.repo, ["rev-parse", "HEAD"]);
    const calls: string[] = [];
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.upstreamHead, targets: [],
      runBuildFixer: async () => { calls.push("fixer"); return { exitCode: 0, timedOut: false, output: "" }; },
      hooks: {
        recomputeReport: async () => { throw new Error("report failed"); },
        ingestMergedUpstream: async () => { calls.push("intake"); },
        appendOverrideNote: () => {}, requeueTarget: () => {},
        rebuildKnowledgeGraph: async () => { calls.push("graph"); },
        writePrSyncSavePoint: () => { calls.push("save"); },
        advanceAnchor: () => { calls.push("anchor"); },
        advanceHarnessHead: () => { calls.push("head"); },
      },
    })).rejects.toThrow("report failed");
    expect(calls).toEqual([]);
    expect(git(fixture.repo, ["rev-parse", "HEAD"])).toBe(before);
  });

  test("runs the fixer with extracted errors and upstream range, retries, and commits its diff", async () => {
    const fixture = fixtureRepo();
    let reportRuns = 0;
    let fixerPrompt = "";
    let advancedHead = "";
    const result = await runBoundarySync({
      repoRoot: fixture.repo,
      anchorSha: fixture.anchor,
      mergePolicy: "theirs",
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
        advanceHarnessHead: ({ headSha }) => { advancedHead = headSha; },
      },
    });

    expect(reportRuns).toBe(2);
    expect(fixerPrompt).toContain("in this harness worktree");
    expect(fixerPrompt).not.toContain("cycle worktree");
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
      repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [], mergePolicy: "theirs",
      runBuildFixer: async () => {
        writeFileSync(join(fixture.repo, "src", "melee", "ty", "toy.c"), "int same(void) { return 3; }\n");
        writeFileSync(join(fixture.repo, "new-fixer-file.c"), "int dirty;\n");
        return { exitCode: 1, timedOut: false, output: "failed" };
      },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => { reportRuns += 1; throw new Error("error: gobj redefined"); },
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceHarnessHead: () => {},
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
      repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [], mergePolicy: "theirs",
      runBuildFixer: async () => {
        writeFileSync(join(fixture.repo, "src", "melee", "ty", "toy.c"), "int same(void) { return 3; }\n");
        return { exitCode: 0, timedOut: false, output: "edited" };
      },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => { reportRuns += 1; throw new Error(reportRuns === 1 ? "first TU failed" : "second TU failed"); },
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceHarnessHead: () => {},
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
      repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [], buildFixerEnabled: false, mergePolicy: "theirs",
      runBuildFixer: async () => { fixerRuns += 1; return { exitCode: 0, timedOut: false, output: "" }; },
      hooks: {
        ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {}, rebuildKnowledgeGraph: async () => {},
        recomputeReport: async () => { throw new Error("error: removed function call"); },
        writePrSyncSavePoint: () => {}, advanceAnchor: () => {}, advanceHarnessHead: () => {},
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

describe("boundary sync clang-format step", () => {
  const hooks = (advanced: { head?: string } = {}): BoundarySyncHooks => ({
    ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {},
    rebuildKnowledgeGraph: async () => {}, recomputeReport: async () => ({ matchedCodePercent: 100 }),
    writePrSyncSavePoint: () => {}, advanceAnchor: () => {},
    advanceHarnessHead: ({ headSha }) => { advanced.head = headSha; },
  });

  test("commits the sandbox's formatting diff before the head is accepted", async () => {
    const sourcePath = "src/Enemy/test.cpp";
    const fixture = fixtureRepo("same", sourcePath, "mario/Enemy/test");
    const advanced: { head?: string } = {};
    const events: Array<[string, unknown]> = [];
    const requested: Array<{ repoRoot: string; files: string[] }> = [];
    const result = await runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, mergePolicy: "theirs", targets: [],
      formatting: { clangFormatVersion: "21.1.8" },
      runFormatApply: async (input) => {
        requested.push(input);
        // Stand in for the sandbox: format on disk, capture the diff, restore the tree.
        const file = join(input.repoRoot, sourcePath);
        const original = readFileSync(file, "utf8");
        writeFileSync(file, original.replace("{ return 2; }", "{\n    return 2;\n}"));
        const diff = git(input.repoRoot, ["diff", "--", sourcePath]) + "\n";
        writeFileSync(file, original);
        return { status: "changed", version: "21.1.8", files: input.files, changedFiles: [sourcePath], diff, toolError: null };
      },
      onFormatEvent: (status, detail) => events.push([status, detail]),
      hooks: hooks(advanced),
    });
    expect(requested).toEqual([{ repoRoot: fixture.repo, files: [sourcePath, "upstream.c"] }]);
    expect(git(fixture.repo, ["log", "-1", "--format=%s"])).toBe("boundary sync clang-format: 1 file(s)");
    expect(readFileSync(join(fixture.repo, sourcePath), "utf8")).toContain("{\n    return 2;\n}");
    expect(git(fixture.repo, ["status", "--porcelain"])).toBe("");
    expect(result.headSha).toBe(git(fixture.repo, ["rev-parse", "HEAD"]));
    expect(advanced.head).toBe(result.headSha);
    expect(events.map(([status]) => status)).toEqual(["started", "finished", "propagated"]);
    expect(events[2]?.[1]).toMatchObject({ changedFiles: [sourcePath], commitSha: result.headSha, version: "21.1.8" });
  });

  test("leaves the head alone when formatting changes nothing and skips without config", async () => {
    const fixture = fixtureRepo("same", "src/Enemy/test.cpp", "mario/Enemy/test");
    let applies = 0;
    const unchanged = await runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, mergePolicy: "theirs", targets: [],
      formatting: { clangFormatVersion: "21.1.8" },
      runFormatApply: async (input) => { applies += 1; return { status: "unchanged", version: "21.1.8", files: input.files, changedFiles: [], diff: "", toolError: null }; },
      hooks: hooks(),
    });
    expect(applies).toBe(1);
    expect(git(fixture.repo, ["log", "-1", "--format=%s"])).not.toContain("clang-format");
    expect(unchanged.headSha).toBe(git(fixture.repo, ["rev-parse", "HEAD"]));

    const second = fixtureRepo("same", "src/Enemy/other.cpp", "mario/Enemy/other");
    await runBoundarySync({
      repoRoot: second.repo, anchorSha: second.anchor, mergePolicy: "theirs", targets: [],
      runFormatApply: async () => { throw new Error("must not run without formatting config"); },
      hooks: hooks(),
    });
  });

  test("refuses a sandbox tool whose version differs from the pin", async () => {
    const fixture = fixtureRepo("same", "src/Enemy/test.cpp", "mario/Enemy/test");
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, mergePolicy: "theirs", targets: [],
      formatting: { clangFormatVersion: "21.1.8" },
      runFormatApply: async (input) => ({ status: "changed", version: "22.1.5", files: input.files, changedFiles: input.files, diff: "junk", toolError: null }),
      hooks: hooks(),
    })).rejects.toThrow("does not match the game's pinned 21.1.8");
    expect(git(fixture.repo, ["status", "--porcelain"])).toBe("");
  });
});

describe("boundary sync map-symbol check and upstream drift", () => {
  const symbolCheck = { script: "tools/check-changed-symbol-order.py", map: "orig/GMSJ01/files/mario.MAP" };
  const hooks = (advanced: { head?: string } = {}): BoundarySyncHooks => ({
    ingestMergedUpstream: async () => {}, appendOverrideNote: () => {}, requeueTarget: () => {},
    rebuildKnowledgeGraph: async () => {}, recomputeReport: async () => ({ matchedCodePercent: 100 }),
    writePrSyncSavePoint: () => {}, advanceAnchor: () => {},
    advanceHarnessHead: ({ headSha }) => { advanced.head = headSha; },
  });
  const unit = (status: "passed" | "failed", newLines: string[] = []) => ({
    source: "src/Enemy/local.cpp", unit: "mario/Enemy/local", status, result: status === "failed" ? "FAIL (new symbol-validation errors)" : "PASS",
    newErrors: newLines.length, inheritedErrors: 0, resolvedErrors: 0, newLines, failLines: [], message: null,
  });
  const checkResult = (status: "clean" | "regressions" | "tool_unavailable", files: string[], baselineRevision: string, extra: Record<string, unknown> = {}) => ({
    status, files, units: status === "regressions" ? [unit("failed", ["missing | SMS_isGetShine__FUlUlb"])] : status === "clean" ? [unit("passed")] : [],
    mapPath: symbolCheck.map, validator: { script: symbolCheck.script, revision: "blob" }, baseline: { revision: baselineRevision, dir: "/tmp/symbol-baseline-src", source: "worktree_build" as const },
    driverExitCode: status === "regressions" ? 1 : 0, toolError: null, output: "", ...extra,
  });
  function withLocalUnit(): ReturnType<typeof fixtureRepo> {
    const fixture = fixtureRepo("same", "src/Enemy/test.cpp", "mario/Enemy/test");
    mkdirSync(join(fixture.repo, "src/Enemy"), { recursive: true });
    writeFileSync(join(fixture.repo, "src/Enemy/local.cpp"), "int local(void) { return 1; }\n");
    git(fixture.repo, ["add", "."]);
    git(fixture.repo, ["commit", "-m", "worker-integration(job-1): mario/Enemy/local::local [checkpoint 1]"]);
    return fixture;
  }

  test("refuses the merged head when a changed unit reports new map-symbol errors against the merged upstream", async () => {
    const fixture = withLocalUnit();
    const advanced: { head?: string } = {};
    const requested: Array<{ repoRoot: string; files: string[]; baselineRevision: string }> = [];
    const events: Array<[string, unknown]> = [];
    await expect(runBoundarySync({
      repoRoot: fixture.repo, anchorSha: fixture.anchor, mergePolicy: "theirs", targets: [], symbolCheck,
      runSymbolCheck: async (input) => { requested.push(input); return checkResult("regressions", input.files, input.baselineRevision); },
      onSymbolCheckEvent: (status, detail) => events.push([status, detail]),
      hooks: hooks(advanced),
    })).rejects.toThrow("new map-symbol validation errors against upstream");
    // Only our unit is checked (upstream's own change is not diffed), against the merged upstream head.
    expect(requested).toEqual([{ repoRoot: fixture.repo, files: ["src/Enemy/local.cpp"], baselineRevision: fixture.upstreamHead }]);
    expect(advanced.head).toBeUndefined();
    expect(events.map(([status]) => status)).toEqual(["started", "finished"]);
    expect((events[1]![1] as { reasons: string[] }).reasons[1]).toBe("src/Enemy/local.cpp: [NEW] missing | SMS_isGetShine__FUlUlb");
    expect(git(fixture.repo, ["status", "--porcelain"])).toBe("");
  }, 30_000);

  test("accepts a clean head, throws when the sandbox tool is unavailable, and skips without config or C++ changes", async () => {
    const clean = withLocalUnit();
    const advanced: { head?: string } = {};
    const result = await runBoundarySync({
      repoRoot: clean.repo, anchorSha: clean.anchor, mergePolicy: "theirs", targets: [], symbolCheck,
      runSymbolCheck: async (input) => checkResult("clean", input.files, input.baselineRevision),
      hooks: hooks(advanced),
    });
    expect(advanced.head).toBe(result.headSha);

    const unavailable = withLocalUnit();
    await expect(runBoundarySync({
      repoRoot: unavailable.repo, anchorSha: unavailable.anchor, mergePolicy: "theirs", targets: [], symbolCheck,
      runSymbolCheck: async (input) => checkResult("tool_unavailable", input.files, input.baselineRevision, { toolError: "linker map orig/GMSJ01/files/mario.MAP is missing from the sandbox" }),
      hooks: hooks(),
    })).rejects.toThrow("symbol check could not run: linker map");

    let calls = 0;
    const unconfigured = withLocalUnit();
    await runBoundarySync({ repoRoot: unconfigured.repo, anchorSha: unconfigured.anchor, mergePolicy: "theirs", targets: [], runSymbolCheck: async () => { calls += 1; throw new Error("must not run"); }, hooks: hooks() });
    const cOnly = fixtureRepo("same", "src/melee/ty/toy.c", "main/melee/ty/toy");
    await runBoundarySync({ repoRoot: cOnly.repo, anchorSha: cOnly.anchor, mergePolicy: "theirs", targets: [], symbolCheck, runSymbolCheck: async () => { calls += 1; throw new Error("must not run"); }, hooks: hooks() });
    expect(calls).toBe(0);
  }, 30_000);

  test("plans record how far upstream is ahead of the anchor and the run reports it before merging", async () => {
    const fixture = fixtureRepo();
    const plan = await planBoundarySync({ repoRoot: fixture.repo, anchorSha: fixture.anchor, targets: [] });
    expect(plan.upstreamDrift).toMatchObject({
      upstream_ref: "origin/master", upstream_head: fixture.upstreamHead, accepted_upstream: fixture.anchor, upstream_ahead_by: 1,
      oldest: { sha: fixture.upstreamHead, subject: "upstream wins" }, newest: { sha: fixture.upstreamHead, subject: "upstream wins" },
    });
    const seen: unknown[] = [];
    await runBoundarySync({ repoRoot: fixture.repo, anchorSha: fixture.anchor, mergePolicy: "theirs", targets: [], onUpstreamDrift: (drift) => { seen.push(drift); }, hooks: hooks() });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ upstream_ahead_by: 1 });
    const settled = await planBoundarySync({ repoRoot: fixture.repo, anchorSha: fixture.upstreamHead, targets: [] });
    expect(settled.upstreamDrift).toMatchObject({ upstream_ahead_by: 0, oldest: null, newest: null });
  }, 30_000);
});
