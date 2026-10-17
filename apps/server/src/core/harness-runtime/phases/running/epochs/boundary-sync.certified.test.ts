import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { runBoundarySync, type BoundaryDisplacement, type BoundarySyncInput } from "./boundary-sync.js";
import type { SyncCertificationLookup } from "./certified-merge.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

const SOURCE = "src/Foo/foo.cpp";
const UNIT = "mario/Foo/foo";
const REPORT = "build/GMSJ01/report.json";

function source(values: { alpha: number; beta: number; gamma: number }): string {
  return [
    "#include \"Foo.hpp\"",
    "",
    `void TFoo::alpha(int a)\n{\n    a = ${values.alpha};\n}\n`,
    `void TFoo::beta(int b)\n{\n    b = ${values.beta};\n}\n`,
    `void TFoo::gamma()\n{\n    int g = ${values.gamma};\n}\n`,
  ].join("\n");
}

function report(scores: { alpha: number; beta: number; gamma: number }) {
  return {
    units: [{
      name: UNIT,
      metadata: { source_path: SOURCE },
      functions: [
        { name: "alpha__4TFooFi", fuzzy_match_percent: scores.alpha, metadata: { demangled_name: "TFoo::alpha(int)" } },
        { name: "beta__4TFooFi", fuzzy_match_percent: scores.beta, metadata: { demangled_name: "TFoo::beta(int)" } },
        { name: "gamma__4TFooFv", fuzzy_match_percent: scores.gamma, metadata: { demangled_name: "TFoo::gamma()" } },
      ],
    }],
  };
}

/** Ours and upstream both rewrote alpha, beta and gamma on the same lines. */
function fixture(): { repo: string; anchor: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "boundary-certified-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const repo = join(root, "cycle");
  git(root, ["init", "--bare", remote]);
  git(root, ["init", "-b", "master", seed]);
  for (const dir of [seed]) {
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Boundary Test"]);
  }
  mkdirSync(join(seed, "src/Foo"), { recursive: true });
  writeFileSync(join(seed, SOURCE), source({ alpha: 0, beta: 0, gamma: 0 }));
  writeFileSync(join(seed, ".gitignore"), "build/\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "anchor"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "-u", "origin", "master"]);
  const anchor = git(seed, ["rev-parse", "HEAD"]);
  git(root, ["clone", remote, repo]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Boundary Test"]);
  writeFileSync(join(repo, SOURCE), source({ alpha: 1, beta: 1, gamma: 1 }));
  git(repo, ["commit", "-am", "ours"]);
  writeFileSync(join(seed, SOURCE), source({ alpha: 2, beta: 2, gamma: 2 }));
  git(seed, ["commit", "-am", "upstream"]);
  git(seed, ["push", "origin", "master"]);
  mkdirSync(dirname(join(repo, REPORT)), { recursive: true });
  // Ours scores higher on alpha and beta; gamma is a tie.
  writeFileSync(join(repo, REPORT), JSON.stringify(report({ alpha: 99, beta: 95, gamma: 50 })));
  const stateDir = join(root, "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "upstream-report.json"), JSON.stringify(report({ alpha: 90, beta: 80, gamma: 50 })));
  return { repo, anchor, stateDir };
}

/** alpha is gate-certified; beta has an active unverified match; gamma was never gated. */
const certification: SyncCertificationLookup = ({ symbol }) =>
  symbol === "alpha__4TFooFi" ? { status: "certified", verdict: "pass" }
    : symbol === "beta__4TFooFi" ? { status: "unverified", verdict: "unverified_match" }
      : { status: "never_gated", verdict: null };

function input(fx: ReturnType<typeof fixture>, extra: Partial<BoundarySyncInput>, requeued: BoundaryDisplacement[]): BoundarySyncInput {
  return {
    repoRoot: fx.repo,
    anchorSha: fx.anchor,
    stateDir: fx.stateDir,
    reportRelPath: REPORT,
    targets: [],
    buildFixerEnabled: false,
    fetchUpstreamReport: async () => ({ path: join(fx.stateDir, "upstream-report.json") }),
    hooks: {
      ingestMergedUpstream: async () => {},
      appendOverrideNote: () => {},
      requeueTarget: (item) => { requeued.push(item); },
      rebuildKnowledgeGraph: async () => {},
      // The merged tree measures ours' alpha and upstream's beta and gamma.
      recomputeReport: async () => {
        writeFileSync(join(fx.repo, REPORT), JSON.stringify(report({ alpha: 99, beta: 80, gamma: 50 })));
        return { matchedCodePercent: 70 };
      },
      writePrSyncSavePoint: () => {},
      advanceAnchor: () => {},
      advanceHarnessHead: () => {},
    },
    ...extra,
  };
}

describe("boundary sync with the certified conflict rule (SMS)", () => {
  test("keeps certified-higher ours, gives uncertified-higher ours and ties to upstream, requeues and records the decisions", async () => {
    const fx = fixture();
    const requeued: BoundaryDisplacement[] = [];
    const result = await runBoundarySync(input(fx, { conflictRule: "certified", loadCertification: async () => certification }, requeued));

    expect(result.plan.actions[0]).toBe("merge_upstream_certified");
    const merged = readFileSync(join(fx.repo, SOURCE), "utf8");
    expect(merged).toContain("a = 1;");
    expect(merged).toContain("b = 2;");
    expect(merged).toContain("int g = 2;");
    expect(git(fx.repo, ["status", "--porcelain"])).toBe("");
    expect(git(fx.repo, ["log", "-1", "--format=%P"]).split(" ")).toHaveLength(2);

    const byFunction = new Map(result.functionDecisions!.map((decision) => [decision.function, decision]));
    expect(byFunction.get("TFoo::alpha(int)")).toMatchObject({ result: "ours", reason: "certified_ours_higher" });
    expect(byFunction.get("TFoo::beta(int)")).toMatchObject({ result: "upstream", reason: "uncertified_ours_displaced", displaced: true });
    expect(byFunction.get("TFoo::gamma()")).toMatchObject({ result: "upstream", reason: "upstream_not_lower", displaced: false });

    // The uncertified, higher beta is an open target with the rule's reason; the kept alpha is not requeued.
    expect(requeued.map((item) => item.targetKey)).toEqual([`${UNIT}::beta__4TFooFi`]);
    expect(requeued[0]).toMatchObject({ reason: "uncertified ours displaced by upstream", priorScore: 95, afterScore: 80 });

    // The auditable record, with the merged scores of the recomputed report.
    expect(result.decisionRecordPath).toBeTruthy();
    const rows = readFileSync(result.decisionRecordPath!, "utf8").trim().split("\n").map((row) => row.split("\t"));
    expect(rows[0]).toEqual(["file", "function", "category", "result", "reason", "ours", "upstream", "merged", "gate", "symbol", "in_conflict", "note"]);
    expect(rows).toContainEqual([SOURCE, "TFoo::alpha(int)", "both_changed", "ours", "certified_ours_higher", "99", "90", "99", "certified:pass", "alpha__4TFooFi", "1", ""]);
    expect(rows).toContainEqual([SOURCE, "TFoo::beta(int)", "both_changed", "upstream", "uncertified_ours_displaced", "95", "80", "80", "unverified:unverified_match", "beta__4TFooFi", "1", "uncertified ours displaced by upstream"]);
    const record = JSON.parse(readFileSync(result.decisionRecordPath!.replace(/\.tsv$/, ".json"), "utf8"));
    expect(record).toMatchObject({ schema: "boundary-sync-function-decisions-v1", merged_scores: true, post_merge: { build_fixer: null } });
  });

  test("a retry after a failed report rebuild keeps the decisions, the displacement reason and the record (review H1 #5)", async () => {
    const fx = fixture();
    const requeued: BoundaryDisplacement[] = [];
    const first = input(fx, { conflictRule: "certified", loadCertification: async () => certification }, requeued);
    let failRebuild = true;
    const recompute = first.hooks!.recomputeReport;
    first.hooks!.recomputeReport = async () => {
      if (failRebuild) throw new Error("report build failed");
      return recompute();
    };
    await expect(runBoundarySync(first)).rejects.toThrow("report build failed");
    expect(JSON.parse(readFileSync(join(fx.stateDir, "boundary_recovery/pending.json"), "utf8")).functionDecisions).toHaveLength(3);
    failRebuild = false;
    // The retry finds upstream already merged: nothing is re-decided, everything is reloaded.
    const retried = await runBoundarySync({ ...first, loadCertification: async () => { throw new Error("certification is not re-read on retry"); } });
    expect(retried.functionDecisions?.map((decision) => decision.function)).toEqual(["TFoo::alpha(int)", "TFoo::beta(int)", "TFoo::gamma()"]);
    expect(requeued).toEqual([expect.objectContaining({ targetKey: `${UNIT}::beta__4TFooFi`, reason: "uncertified ours displaced by upstream" })]);
    const rows = readFileSync(retried.decisionRecordPath!, "utf8").trim().split("\n").map((row) => row.split("\t"));
    expect(rows.find((row) => row[1] === "TFoo::beta(int)")?.[7]).toBe("80");
  });

  test("a retry after a post-fixer failure still records the build fixer's commit (review H4 #4)", async () => {
    const fx = fixture();
    const requeued: BoundaryDisplacement[] = [];
    const run = input(fx, { conflictRule: "certified", loadCertification: async () => certification, buildFixerEnabled: true }, requeued);
    let rebuilds = 0;
    const recompute = run.hooks!.recomputeReport;
    run.hooks!.recomputeReport = async () => {
      rebuilds += 1;
      if (rebuilds === 1) throw new Error("report build failed");
      return recompute();
    };
    run.runBuildFixer = async ({ worktreeDir }) => {
      writeFileSync(join(worktreeDir, SOURCE), `${readFileSync(join(worktreeDir, SOURCE), "utf8")}// fixed\n`);
      return { exitCode: 0, timedOut: false, output: "fixed" };
    };
    let ingestFails = true;
    run.hooks!.ingestMergedUpstream = async () => {
      if (ingestFails) throw new Error("knowledge intake failed");
    };
    await expect(runBoundarySync(run)).rejects.toThrow("knowledge intake failed");
    const fixerCommit = git(fx.repo, ["rev-parse", "HEAD"]);
    expect(git(fx.repo, ["log", "-1", "--format=%s"])).toBe(`boundary sync build-fixer: ${SOURCE}`);
    expect(JSON.parse(readFileSync(join(fx.stateDir, "boundary_recovery/pending.json"), "utf8")).buildFixer).toEqual({ files: [SOURCE], commit: fixerCommit });
    ingestFails = false;
    // The retry's report rebuild succeeds without the fixer; the record still names the fixer's commit.
    const retried = await runBoundarySync(run);
    expect(rebuilds).toBe(3);
    const record = JSON.parse(readFileSync(retried.decisionRecordPath!.replace(/\.tsv$/, ".json"), "utf8"));
    expect(record.post_merge).toEqual({ build_fixer: { files: [SOURCE], commit: fixerCommit } });
  });

  test("without certification evidence every conflicting function goes to upstream", async () => {
    const fx = fixture();
    const requeued: BoundaryDisplacement[] = [];
    const result = await runBoundarySync(input(fx, { conflictRule: "certified" }, requeued));
    const merged = readFileSync(join(fx.repo, SOURCE), "utf8");
    expect(merged).toContain("a = 2;");
    expect(merged).toContain("b = 2;");
    expect(result.functionDecisions!.filter((decision) => decision.displaced).map((decision) => decision.function).sort()).toEqual(["TFoo::alpha(int)", "TFoo::beta(int)"]);
  });

  test("Melee pin: the score rule (default) is unchanged and stops at a conflicting C++ file for an operator", async () => {
    for (const conflictRule of [undefined, "score"] as const) {
      const fx = fixture();
      const head = git(fx.repo, ["rev-parse", "HEAD"]);
      await expect(runBoundarySync(input(fx, { conflictRule, loadCertification: async () => certification }, [])))
        .rejects.toThrow(`policy merge stopped at contested file ${SOURCE}`);
      expect(git(fx.repo, ["rev-parse", "HEAD"])).toBe(head);
      expect(git(fx.repo, ["status", "--porcelain"])).toBe("");
      expect(existsSync(join(fx.stateDir, "boundary_sync"))).toBe(false);
    }
  });
});
