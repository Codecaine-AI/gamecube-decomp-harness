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
    git(fixture.repo, "checkout", "-b", "cycle");
    write(fixture.repo, "cycle.txt", "cycle\n");
    const cycleHead = commitAll(fixture.repo, "cycle work");
    git(fixture.repo, "checkout", "-b", "upstream", fixture.base);
    write(fixture.repo, "upstream.txt", "upstream\n");
    const upstreamHead = commitAll(fixture.repo, "upstream work");
    git(fixture.repo, "checkout", "cycle");

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
    expect(git(fixture.repo, "merge-base", "--is-ancestor", cycleHead, result.head)).toBe("");
    expect(git(fixture.repo, "merge-base", "--is-ancestor", upstreamHead, result.head)).toBe("");
  });

  test("auto-resolves a whitespace-only conflict and commits the merge", async () => {
    const fixture = repoFixture();
    write(fixture.repo, "mechanical.c", "int value = 1;\n");
    const base = commitAll(fixture.repo, "mechanical base");
    git(fixture.repo, "checkout", "-b", "cycle");
    write(fixture.repo, "mechanical.c", "int value=2;\n");
    commitAll(fixture.repo, "cycle formatting");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    write(fixture.repo, "mechanical.c", "int value = 2;\n");
    const upstreamHead = commitAll(fixture.repo, "upstream formatting");
    git(fixture.repo, "checkout", "cycle");

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
    git(fixture.repo, "checkout", "-b", "cycle");
    git(fixture.repo, "mv", "name.txt", "cycle-name.txt");
    commitAll(fixture.repo, "cycle rename");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    git(fixture.repo, "mv", "name.txt", "upstream-name.txt");
    const upstreamHead = commitAll(fixture.repo, "upstream rename");
    git(fixture.repo, "checkout", "cycle");

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

  test("keeps cycle commits when upstream squash-merged their content", async () => {
    const fixture = repoFixture();
    git(fixture.repo, "checkout", "-b", "cycle");
    write(fixture.repo, "one.c", "int one = 1;\n");
    commitAll(fixture.repo, "cycle one");
    write(fixture.repo, "two.c", "int two = 2;\n");
    const cycleHead = commitAll(fixture.repo, "cycle two");

    git(fixture.repo, "checkout", "-b", "upstream", fixture.base);
    git(fixture.repo, "merge", "--squash", cycleHead);
    commitAll(fixture.repo, "squash cycle work upstream");
    write(fixture.repo, "later.c", "int later = 3;\n");
    const upstreamHead = commitAll(fixture.repo, "later upstream change");
    git(fixture.repo, "checkout", "cycle");

    const result = await mergeSyncWorktree({
      worktreePath: fixture.repo,
      newBase: upstreamHead,
      mergePolicy: "theirs",
      revalidateLease: leaseGuard(),
    });

    expect(result.status).toBe("clean");
    expect(git(fixture.repo, "merge-base", "--is-ancestor", cycleHead, result.head)).toBe("");
    expect(git(fixture.repo, "merge-base", "--is-ancestor", upstreamHead, result.head)).toBe("");
    expect(readFileSync(resolve(fixture.repo, "later.c"), "utf8")).toBe("int later = 3;\n");
  });

  test("logs and applies the score policy's per-function choice", async () => {
    const fixture = repoFixture();
    write(fixture.repo, "policy.c", "int target(void)\n{\n    return 0;\n}\n");
    const base = commitAll(fixture.repo, "policy base");
    git(fixture.repo, "checkout", "-b", "cycle");
    write(fixture.repo, "policy.c", "int target(void)\n{\n    return 1;\n}\n");
    commitAll(fixture.repo, "cycle policy work");
    git(fixture.repo, "checkout", "-b", "upstream", base);
    write(fixture.repo, "policy.c", "int target(void)\n{\n    return 2;\n}\n");
    const upstreamHead = commitAll(fixture.repo, "upstream policy work");
    git(fixture.repo, "checkout", "cycle");
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
