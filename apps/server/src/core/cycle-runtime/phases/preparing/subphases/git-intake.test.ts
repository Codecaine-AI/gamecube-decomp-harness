import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PreparingRuntimeDeps, PreparingRuntimeGameContext } from "../runtime-shared.js";
import { syncGameGitAndFindMergedPrs } from "./git-intake.js";

let tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepare-git-intake-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("prepare git intake", () => {
  test("fetches upstream and prepares worktrees without rebasing the control checkout", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "checkout");
    const gameDir = root;
    const calls: string[][] = [];
    let revParseCount = 0;
    const deps = {
      runGit: async (_repoRoot: string, args: string[]) => {
        calls.push(args);
        if (args[0] === "rev-parse" && args.at(-1) === "origin/master") {
          revParseCount += 1;
          return { exitCode: 0, stdout: `${revParseCount === 1 ? "aaaaaaaaaa" : "bbbbbbbbbb"}\n`, stderr: "" };
        }
        if (args[0] === "worktree" && args[1] === "list") return { exitCode: 0, stdout: "", stderr: "" };
        if (args[0] === "show-ref") return { exitCode: 1, stdout: "", stderr: "" };
        if (args[0] === "branch") return { exitCode: 0, stdout: "pr-2731\n", stderr: "" };
        if (args[0] === "log") return { exitCode: 0, stdout: "Merge pull request #2731 from doldecomp/example\n", stderr: "" };
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    } as unknown as PreparingRuntimeDeps;
    const paths = {
      game: { baseRef: "origin/master", gameDir },
      repoRoot,
      stateDir: resolve(root, "state"),
      graphDbPath: resolve(root, "graph.sqlite"),
    } as unknown as PreparingRuntimeGameContext;

    const result = await syncGameGitAndFindMergedPrs(deps, paths, "cycle-uuid");

    expect(calls.map((args) => args[0])).toContain("fetch");
    expect(calls.some((args) => args[0] === "pull")).toBe(false);
    expect(calls.some((args) => args[0] === "rebase")).toBe(false);
    expect(calls.some((args) => args.join(" ") === `worktree add --detach ${resolve(gameDir, "worktrees/upstream-current")} bbbbbbbbbb`)).toBe(true);
    expect(calls.some((args) => args.join(" ") === `worktree add -b orchestrator/cycle/cycle-uuid ${resolve(gameDir, "worktrees/cycles/cycle-uuid/current")} bbbbbbbbbb`)).toBe(true);
    expect(result.upstreamWorktreePath).toBe(resolve(gameDir, "worktrees/upstream-current"));
    expect(result.cycleCurrentWorktreePath).toBe(resolve(gameDir, "worktrees/cycles/cycle-uuid/current"));
    expect(result.cycleWorktreePath).toBe(resolve(gameDir, "worktrees/cycles/cycle-uuid/current"));
    expect(result.mergedPrs).toEqual([2731]);
  });
});
