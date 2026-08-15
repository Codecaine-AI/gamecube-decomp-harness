import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PreparingRuntimeDeps, PreparingRuntimeGameContext } from "../runtime-shared.js";
import { ensurePrepareWorktrees } from "./worktrees.js";

let tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepare-worktrees-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

function pathsFor(root: string): PreparingRuntimeGameContext {
  return {
    graphDbPath: resolve(root, "graph.sqlite"),
    game: { gameDir: root, gameId: "melee" },
    repoRoot: resolve(root, "checkout"),
    stateDir: resolve(root, "state"),
  } as unknown as PreparingRuntimeGameContext;
}

describe("prepare worktrees", () => {
  test("reuses an existing checked-out cycle branch worktree", async () => {
    const root = tempDir();
    const paths = pathsFor(root);
    const sha = "7e2e444e18e048ee95e68438926550ef70033c13";
    const cycleUuid = "08bfe41e-1b7c-4685-8646-dff5e02a5dab";
    const legacyCyclePath = resolve(root, "worktrees/cycles", cycleUuid, "source");
    mkdirSync(legacyCyclePath, { recursive: true });
    writeFileSync(resolve(legacyCyclePath, ".git"), "gitdir: test\n");
    const calls: Array<{ cwd: string; args: string[] }> = [];
    const deps = {
      runGit: async (cwd: string, args: string[]) => {
        calls.push({ cwd, args });
        if (args[0] === "worktree" && args[1] === "list") {
          return {
            exitCode: 0,
            stdout: [
              `worktree ${paths.repoRoot}`,
              `HEAD ${sha}`,
              "detached",
              "",
              `worktree ${legacyCyclePath}`,
              `HEAD ${sha}`,
              `branch refs/heads/orchestrator/cycle/${cycleUuid}`,
              "",
            ].join("\n"),
            stderr: "",
          };
        }
        if (cwd === legacyCyclePath && args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" };
        if (cwd === legacyCyclePath && args[0] === "rev-parse") return { exitCode: 0, stdout: `${sha}\n`, stderr: "" };
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    } as unknown as PreparingRuntimeDeps;

    const result = await ensurePrepareWorktrees(deps, paths, sha, cycleUuid);

    expect(result.cycleCurrentWorktreePath).toBe(legacyCyclePath);
    expect(result.cycleWorktreePath).toBe(legacyCyclePath);
    expect(calls.some((call) => call.args.join(" ").includes(`worktree add -b orchestrator/cycle/${cycleUuid}`))).toBe(false);
    expect(calls.some((call) => call.cwd === legacyCyclePath && call.args[0] === "rev-parse")).toBe(true);
  });

  test("attaches an existing unmounted cycle branch instead of recreating it", async () => {
    const root = tempDir();
    const paths = pathsFor(root);
    const sha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const cycleUuid = "cycle-uuid";
    const currentPath = resolve(root, "worktrees/cycles/cycle-uuid/current");
    const calls: Array<{ cwd: string; args: string[] }> = [];
    const deps = {
      runGit: async (cwd: string, args: string[]) => {
        calls.push({ cwd, args });
        if (args[0] === "worktree" && args[1] === "list") return { exitCode: 0, stdout: "", stderr: "" };
        if (args[0] === "show-ref") return { exitCode: 0, stdout: "", stderr: "" };
        if (cwd === paths.repoRoot && args[0] === "rev-parse" && args.at(-1) === `orchestrator/cycle/${cycleUuid}`) {
          return { exitCode: 0, stdout: `${sha}\n`, stderr: "" };
        }
        if (cwd === currentPath && args[0] === "rev-parse") return { exitCode: 0, stdout: `${sha}\n`, stderr: "" };
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    } as unknown as PreparingRuntimeDeps;

    const result = await ensurePrepareWorktrees(deps, paths, sha, cycleUuid);

    expect(result.cycleCurrentWorktreePath).toBe(currentPath);
    expect(calls.some((call) => call.args.join(" ") === `worktree add ${currentPath} orchestrator/cycle/${cycleUuid}`)).toBe(true);
    expect(calls.some((call) => call.args.join(" ").includes(`worktree add -b orchestrator/cycle/${cycleUuid}`))).toBe(false);
  });
});
