import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  continueSyncMergeAfterOperator,
  inspectSyncWorktree,
  mergeSyncWorktree,
} from "./git.js";

const tempDirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? "").trim();
}

function write(repo: string, path: string, content: string): void {
  const absolute = resolve(repo, path);
  mkdirSync(resolve(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function commitAll(repo: string, message: string): string {
  git(repo, "add", "-A");
  git(repo, "commit", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function repoFixture(): { base: string; repo: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "sync-git-"));
  tempDirs.push(root);
  const repo = resolve(root, "repo");
  git(root, "init", repo);
  git(repo, "config", "user.email", "sync-git-test@example.com");
  git(repo, "config", "user.name", "Sync Git Test");
  write(repo, "base.txt", "base\n");
  const base = commitAll(repo, "base");
  return { base, repo, root };
}

function leaseGuard(): () => void {
  return () => {};
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("sync worktree merge", () => {
  test("creates one clean no-ff merge commit", async () => {
    const fixture = repoFixture();
    git(fixture.repo, "checkout", "-b", "harness");
    write(fixture.repo, "harness.txt", "harness\n");
    const harnessHead = commitAll(fixture.repo, "harness work");
    git(fixture.repo, "checkout", "-b", "upstream", fixture.base);
    write(fixture.repo, "upstream.txt", "upstream\n");
    const upstreamHead = commitAll(fixture.repo, "upstream work");
    git(fixture.repo, "checkout", "harness");

    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo,
      newBase: upstreamHead,
      mergePolicy: "theirs",
      revalidateLease: leaseGuard(),
    });

    expect(result).toMatchObject({
      status: "clean",
      minorConflictsResolved: 0,
      autoResolvedPaths: [],
      conflictingPaths: [],
      policyMergeFiles: [],
    });
    expect(git(fixture.repo, "rev-list", "--parents", "-n", "1", result.head).split(" ")).toHaveLength(3);
    expect(git(fixture.repo, "merge-base", "--is-ancestor", harnessHead, result.head)).toBe("");
    expect(git(fixture.repo, "merge-base", "--is-ancestor", upstreamHead, result.head)).toBe("");
  });

  test("auto-resolves a whitespace-only conflict and commits the merge", async () => {
    const fixture = repoFixture();
    write(fixture.repo, "mechanical.c", "int value = 1;\n");
    const base = commitAll(fixture.repo, "mechanical base");
    git(fixture.repo, "checkout", "-b", "harness");
    write(fixture.repo, "mechanical.c", "int value=2;\n");
    commitAll(fixture.repo, "harness formatting");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    write(fixture.repo, "mechanical.c", "int value = 2;\n");
    const upstreamHead = commitAll(fixture.repo, "upstream formatting");
    git(fixture.repo, "checkout", "harness");

    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo,
      newBase: upstreamHead,
      mergePolicy: "score",
      revalidateLease: leaseGuard(),
    });

    expect(result.status).toBe("auto_resolved");
    expect(result.minorConflictsResolved).toBe(1);
    expect(result.autoResolvedPaths).toEqual(["mechanical.c"]);
    expect(result.conflictingPaths).toEqual([]);
    expect(result.policyMergeFiles).toHaveLength(1);
    expect(readFileSync(resolve(fixture.repo, "mechanical.c"), "utf8")).toBe("int value = 2;\n");
    expect((await inspectSyncWorktree({ worktreePath: fixture.repo })).mergeInProgress).toBe(false);
  });

  test("leaves a structural conflict for the operator, then commits their resolution", async () => {
    const fixture = repoFixture();
    write(fixture.repo, "name.txt", "shared\n");
    const base = commitAll(fixture.repo, "rename base");
    git(fixture.repo, "checkout", "-b", "harness");
    git(fixture.repo, "mv", "name.txt", "harness-name.txt");
    commitAll(fixture.repo, "harness rename");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    git(fixture.repo, "mv", "name.txt", "upstream-name.txt");
    const upstreamHead = commitAll(fixture.repo, "upstream rename");
    git(fixture.repo, "checkout", "harness");

    const blocked = await mergeSyncWorktree({
      worktreePath: fixture.repo,
      newBase: upstreamHead,
      mergePolicy: "theirs",
      revalidateLease: leaseGuard(),
    });

    expect(blocked.status).toBe("needs_operator");
    expect(blocked.conflictingPaths.length).toBeGreaterThan(0);
    expect((await inspectSyncWorktree({ worktreePath: fixture.repo })).mergeInProgress).toBe(true);
    const selected = blocked.conflictingPaths[0]!;
    for (const path of blocked.conflictingPaths) {
      const absolute = resolve(fixture.repo, path);
      if (existsSync(absolute)) rmSync(absolute, { force: true });
    }
    write(fixture.repo, selected, "operator resolution\n");

    const resolved = await continueSyncMergeAfterOperator({
      worktreePath: fixture.repo,
      expectedConflictPaths: blocked.conflictingPaths,
      revalidateLease: leaseGuard(),
    });

    expect(resolved).toMatchObject({ status: "clean", conflictingPaths: [] });
    expect(readFileSync(resolve(fixture.repo, selected), "utf8")).toBe("operator resolution\n");
    expect((await inspectSyncWorktree({ worktreePath: fixture.repo })).mergeInProgress).toBe(false);
  });

  test("keeps harness commits when upstream squash-merged their content", async () => {
    const fixture = repoFixture();
    git(fixture.repo, "checkout", "-b", "harness");
    write(fixture.repo, "one.c", "int one = 1;\n");
    commitAll(fixture.repo, "harness one");
    write(fixture.repo, "two.c", "int two = 2;\n");
    const harnessHead = commitAll(fixture.repo, "harness two");

    git(fixture.repo, "checkout", "-b", "upstream", fixture.base);
    git(fixture.repo, "merge", "--squash", harnessHead);
    commitAll(fixture.repo, "squash harness work upstream");
    write(fixture.repo, "later.c", "int later = 3;\n");
    const upstreamHead = commitAll(fixture.repo, "later upstream change");
    git(fixture.repo, "checkout", "harness");

    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo,
      newBase: upstreamHead,
      mergePolicy: "theirs",
      revalidateLease: leaseGuard(),
    });

    expect(result.status).toBe("clean");
    expect(git(fixture.repo, "merge-base", "--is-ancestor", harnessHead, result.head)).toBe("");
    expect(git(fixture.repo, "merge-base", "--is-ancestor", upstreamHead, result.head)).toBe("");
    expect(readFileSync(resolve(fixture.repo, "later.c"), "utf8")).toBe("int later = 3;\n");
  });

  test("logs and applies the score policy's per-function choice", async () => {
    const fixture = repoFixture();
    write(fixture.repo, "policy.c", "int target(void)\n{\n    return 0;\n}\n");
    const base = commitAll(fixture.repo, "policy base");
    git(fixture.repo, "checkout", "-b", "harness");
    write(fixture.repo, "policy.c", "int target(void)\n{\n    return 1;\n}\n");
    commitAll(fixture.repo, "harness policy work");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    write(fixture.repo, "policy.c", "int target(void)\n{\n    return 2;\n}\n");
    const upstreamHead = commitAll(fixture.repo, "upstream policy work");
    git(fixture.repo, "checkout", "harness");
    const report = (score: number) => ({
      units: [{
        name: "main/policy",
        metadata: { source_path: "policy.c" },
        functions: [{ name: "target", fuzzy_match_percent: score }],
      }],
    });

    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo,
      newBase: upstreamHead,
      mergePolicy: "score",
      policyInputs: {
        ours: report(100),
        upstream: report(98),
        scoreMode: "reports",
        upstreamReportFallbackReason: null,
      },
      revalidateLease: leaseGuard(),
    });

    expect(result.status).toBe("auto_resolved");
    expect(result.policyMergeFiles).toHaveLength(1);
    expect(result.policyMergeFiles[0]?.result?.decisions).toEqual([
      expect.objectContaining({ functionName: "target", side: "ours", reason: "ours_exact" }),
    ]);
    expect(result.policyMergeFiles[0]?.message).toContain("ours=[target(ours_exact)]");
    expect(readFileSync(resolve(fixture.repo, "policy.c"), "utf8")).toContain("return 1;");
  });
});

describe("sync worktree merge with the certified conflict rule", () => {
  const cpp = (alpha: number, beta: number, extra = "") =>
    `#include "Foo.hpp"\n\nvoid TFoo::alpha(int a)\n{\n    a = ${alpha};\n}\n\nvoid TFoo::beta(int b)\n{\n    b = ${beta};\n}\n${extra}`;
  const report = (alpha: number, beta: number) => ({ units: [{ name: "mario/Foo/foo", metadata: { source_path: "src/Foo/foo.cpp" }, functions: [
    { name: "alpha__4TFooFi", fuzzy_match_percent: alpha, metadata: { demangled_name: "TFoo::alpha(int)" } },
    { name: "beta__4TFooFi", fuzzy_match_percent: beta, metadata: { demangled_name: "TFoo::beta(int)" } },
  ] }] });
  const certification = ({ symbol }: { symbol: string }) => symbol === "alpha__4TFooFi"
    ? { status: "certified" as const, verdict: "pass" }
    : { status: "uncertified" as const, verdict: "unresolved" };

  function conflicting(oursExtra = "") {
    const fixture = repoFixture();
    write(fixture.repo, "src/Foo/foo.cpp", cpp(0, 0));
    const base = commitAll(fixture.repo, "foo");
    git(fixture.repo, "checkout", "-b", "harness");
    write(fixture.repo, "src/Foo/foo.cpp", cpp(1, 1, oursExtra));
    commitAll(fixture.repo, "ours");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    write(fixture.repo, "src/Foo/foo.cpp", cpp(2, 2));
    const upstreamHead = commitAll(fixture.repo, "upstream");
    git(fixture.repo, "checkout", "harness");
    return { ...fixture, upstreamHead };
  }

  test("resolves a conflicting C++ file function by function instead of leaving it for an operator", async () => {
    const fixture = conflicting();
    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo, newBase: fixture.upstreamHead, mergePolicy: "score", conflictRule: "certified", certification,
      policyInputs: { ours: report(99, 95), upstream: report(90, 80), scoreMode: "reports", upstreamReportFallbackReason: null },
      revalidateLease: leaseGuard(),
    });
    expect(result.status).not.toBe("needs_operator");
    const merged = readFileSync(resolve(fixture.repo, "src/Foo/foo.cpp"), "utf8");
    expect(merged).toContain("a = 1;");
    expect(merged).toContain("b = 2;");
    expect(result.policyMergeFiles[0]?.certified?.decisions.map((decision) => [decision.function, decision.result, decision.reason])).toEqual([
      ["TFoo::alpha(int)", "ours", "certified_ours_higher"],
      ["TFoo::beta(int)", "upstream", "uncertified_ours_displaced"],
    ]);
  });

  test("a header conflict inside an inline member stays for the operator; declaration-only hunks go to upstream", async () => {
    const header = (value: string, field: string) => `class TFoo {\npublic:\n    int get() { return ${value}; }\n    int ${field};\n};\n`;
    for (const [ours, upstream, expected] of [
      [header("1", "a"), header("2", "a"), "needs_operator"],
      [header("0", "b"), header("0", "c"), "auto_resolved"],
    ] as const) {
      const fixture = repoFixture();
      write(fixture.repo, "include/Foo.hpp", header("0", "a"));
      const base = commitAll(fixture.repo, "foo");
      git(fixture.repo, "checkout", "-b", "harness");
      write(fixture.repo, "include/Foo.hpp", ours);
      commitAll(fixture.repo, "ours");
      git(fixture.repo, "checkout", "-b", "upstream", base);
      write(fixture.repo, "include/Foo.hpp", upstream);
      const upstreamHead = commitAll(fixture.repo, "upstream");
      git(fixture.repo, "checkout", "harness");
      const result = await mergeSyncWorktree({
        worktreePath: fixture.repo, newBase: upstreamHead, mergePolicy: "score", conflictRule: "certified", certification,
        policyInputs: { ours: {}, upstream: {}, scoreMode: "reports", upstreamReportFallbackReason: null },
        revalidateLease: leaseGuard(),
      });
      expect(result.status).toBe(expected);
      if (expected === "needs_operator") {
        expect(result.policyMergeFiles[0]?.message).toContain("conflicting header code the rule cannot decide: {class TFoo}");
      } else {
        expect(readFileSync(resolve(fixture.repo, "include/Foo.hpp"), "utf8")).toContain("int c;");
      }
    }
  });

  test("report evidence binds by namespace: certified A::f keeps ours beside B::f; an unsure binding goes to the operator (review H4 #2)", async () => {
    const spaced = (a: number, b: number) => `namespace A {\nvoid f()\n{\n    x = ${a};\n}\n}\n\nnamespace B {\nvoid f()\n{\n    y = ${b};\n}\n}\n`;
    const flat = (a: number) => `void f()\n{\n    x = ${a};\n}\n`;
    const scored = (a: number, b: number) => ({ units: [{ name: "mario/Foo/foo", metadata: { source_path: "src/Foo/foo.cpp" }, functions: [
      { name: "f__1AFv", fuzzy_match_percent: a, metadata: { demangled_name: "A::f()" } },
      { name: "f__1BFv", fuzzy_match_percent: b, metadata: { demangled_name: "B::f()" } },
    ] }] });
    const byNamespace = ({ symbol }: { symbol: string }) => symbol === "f__1AFv"
      ? { status: "certified" as const, verdict: "pass" }
      : { status: "uncertified" as const, verdict: "unresolved" };
    const run = async (base: string, ours: string, upstream: string) => {
      const fixture = repoFixture();
      write(fixture.repo, "src/Foo/foo.cpp", base);
      const baseRev = commitAll(fixture.repo, "foo");
      git(fixture.repo, "checkout", "-b", "harness");
      write(fixture.repo, "src/Foo/foo.cpp", ours);
      commitAll(fixture.repo, "ours");
      git(fixture.repo, "checkout", "-b", "upstream", baseRev);
      write(fixture.repo, "src/Foo/foo.cpp", upstream);
      const upstreamHead = commitAll(fixture.repo, "upstream");
      git(fixture.repo, "checkout", "harness");
      const result = await mergeSyncWorktree({
        worktreePath: fixture.repo, newBase: upstreamHead, mergePolicy: "score", conflictRule: "certified", certification: byNamespace,
        policyInputs: { ours: scored(100, 80), upstream: scored(90, 85), scoreMode: "reports", upstreamReportFallbackReason: null },
        revalidateLease: leaseGuard(),
      });
      return { result, text: readFileSync(resolve(fixture.repo, "src/Foo/foo.cpp"), "utf8") };
    };
    const scopedRun = await run(spaced(0, 0), spaced(1, 1), spaced(2, 2));
    expect(scopedRun.result.status).not.toBe("needs_operator");
    expect(scopedRun.text).toContain("x = 1;");
    expect(scopedRun.text).toContain("y = 2;");
    expect(scopedRun.result.policyMergeFiles[0]?.certified?.decisions.find((decision) => decision.function === "f()@[namespace A]")?.symbols.map((symbol) => symbol.symbol)).toEqual(["f__1AFv"]);
    // `f` written without its namespace (a using directive): A::f and B::f both fit, so nothing is decided.
    const unsure = await run(flat(0), flat(1), flat(2));
    expect(unsure.result.status).toBe("needs_operator");
    expect(unsure.result.policyMergeFiles[0]?.message).toContain("ambiguous report evidence: f() (report functions A::f, B::f all end in f)");
  });

  test("upstream deleting a locally modified C++ file stays for the operator with certification (review H4 #3)", async () => {
    const fixture = repoFixture();
    write(fixture.repo, "src/Foo/foo.cpp", cpp(0, 0));
    const base = commitAll(fixture.repo, "foo");
    git(fixture.repo, "checkout", "-b", "harness");
    write(fixture.repo, "src/Foo/foo.cpp", cpp(1, 1));
    commitAll(fixture.repo, "ours");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    git(fixture.repo, "rm", "-q", "src/Foo/foo.cpp");
    const upstreamHead = commitAll(fixture.repo, "upstream deletes");
    git(fixture.repo, "checkout", "harness");
    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo, newBase: upstreamHead, mergePolicy: "score", conflictRule: "certified", certification,
      policyInputs: { ours: report(99, 95), upstream: { units: [] }, scoreMode: "reports", upstreamReportFallbackReason: null },
      revalidateLease: leaseGuard(),
    });
    expect(result.status).toBe("needs_operator");
    expect(result.conflictingPaths).toEqual(["src/Foo/foo.cpp"]);
    expect(result.policyMergeFiles[0]?.message).toContain("upstream deleted the file while the other side changed it");
    expect(result.policyMergeFiles[0]?.operatorCertification).toBe("TFoo::alpha(int) [certified] ours=99 upstream=-; TFoo::beta(int) [uncertified:unresolved] ours=95 upstream=-");
    expect(existsSync(resolve(fixture.repo, ".git/MERGE_HEAD"))).toBe(true);
  });

  test("an unresolvable file stays for the operator with each function's certification", async () => {
    const fixture = conflicting("void TFoo::broken()\n{\n");
    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo, newBase: fixture.upstreamHead, mergePolicy: "score", conflictRule: "certified", certification,
      policyInputs: { ours: report(99, 95), upstream: report(90, 80), scoreMode: "reports", upstreamReportFallbackReason: null },
      revalidateLease: leaseGuard(),
    });
    expect(result.status).toBe("needs_operator");
    expect(result.conflictingPaths).toEqual(["src/Foo/foo.cpp"]);
    expect(result.policyMergeFiles[0]?.operatorCertification).toBe(
      "TFoo::alpha(int) [certified] ours=99 upstream=90; TFoo::beta(int) [uncertified:unresolved] ours=95 upstream=80",
    );
  });
});
