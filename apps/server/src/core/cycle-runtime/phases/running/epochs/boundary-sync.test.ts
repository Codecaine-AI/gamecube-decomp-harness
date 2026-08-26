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
      recomputeReport: async () => ({ matchedCodePercent: 91.2, measures: { matched_code_percent: 91.2 } }),
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
    expect(calls.map(([name]) => name)).toEqual(["ingest", "note", "requeue", "kg", "save", "anchor", "head"]);
    expect(calls.find(([name]) => name === "save")?.[1]).toMatchObject({
      kind: "pr_sync",
      anchorSha: fixture.anchor,
      upstreamHeadSha: fixture.upstreamHead,
      commitSha: result.headSha,
      matchedCodePercent: 91.2,
    });
    expect(calls.find(([name]) => name === "anchor")?.[1]).toEqual({
      previousAnchorSha: fixture.anchor,
      upstreamHeadSha: fixture.upstreamHead,
    });
    expect(calls.find(([name]) => name === "head")?.[1]).toMatchObject({ headSha: result.headSha });
  });

  test("raises a loud error when fetch fails", async () => {
    const runGit: BoundaryGitRunner = async () => ({ exitCode: 1, stdout: "", stderr: "network unavailable" });
    expect(planBoundarySync({ repoRoot: "/fixture", anchorSha: "a", targets: [], runGit })).rejects.toThrow(
      "boundary sync fetch failed: network unavailable",
    );
  });
});
