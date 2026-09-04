import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createNewCycle } from "@server/core/cycle-runtime";
import { openState } from "@server/core/orchestrator-state";
import type {
  PreparingRuntimeDeps,
  PreparingRuntimeGameContext,
} from "../runtime-shared.js";
import { bootstrapCycleWorktrees } from "./bootstrap.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cycle-bootstrap-"));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }
  return stdout.trim();
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs.length = 0;
});

describe("cycle worktree bootstrap", () => {
  test("creates both worktrees and records the canonical cycle baseline", async () => {
    const root = tempDir();
    const gameDir = resolve(root, "game");
    const origin = resolve(root, "origin.git");
    const seed = resolve(root, "seed");
    const repoRoot = resolve(gameDir, "checkout");
    const stateDir = resolve(root, "state");
    const cycleUuid = "bootstrap-cycle-uuid";
    const now = "2026-09-03T12:00:00.000Z";

    Bun.spawnSync(["git", "init", "--bare", origin], { stdout: "pipe", stderr: "pipe" });
    Bun.spawnSync(["git", "init", "-b", "master", seed], { stdout: "pipe", stderr: "pipe" });
    git(seed, ["config", "user.email", "bootstrap@example.com"]);
    git(seed, ["config", "user.name", "Bootstrap Test"]);
    writeFileSync(resolve(seed, "README.md"), "bootstrap fixture\n");
    git(seed, ["add", "README.md"]);
    git(seed, ["commit", "-m", "initial"]);
    git(seed, ["remote", "add", "origin", origin]);
    git(seed, ["push", "-u", "origin", "master"]);
    Bun.spawnSync(["git", "clone", origin, repoRoot], { stdout: "pipe", stderr: "pipe" });
    const baseSha = git(repoRoot, ["rev-parse", "origin/master"]);

    const store = openState(stateDir);
    try {
      const cycle = createNewCycle(store.db, {
        actor: "operator",
        gameId: "melee",
        cycleUuid,
        id: `cycle:${cycleUuid}`,
        baseRef: "origin/master",
      }).record;
      const paths = {
        game: { baseRef: "origin/master", gameDir, gameId: "melee" },
        repoRoot,
        stateDir,
        graphDbPath: resolve(root, "graph.sqlite"),
      } as unknown as PreparingRuntimeGameContext;
      const deps = {
        runGit: async (cwd: string, args: string[]) => {
          const result = Bun.spawnSync(["git", "-C", cwd, ...args], {
            stdout: "pipe",
            stderr: "pipe",
          });
          return {
            exitCode: result.exitCode,
            stdout: result.stdout.toString(),
            stderr: result.stderr.toString(),
          };
        },
      } satisfies Pick<PreparingRuntimeDeps, "runGit">;

      const result = await bootstrapCycleWorktrees(store, paths, cycle, deps, {
        commandId: "command-bootstrap-test",
        now,
      });

      const upstreamPath = resolve(gameDir, "worktrees/upstream-current");
      const cyclePath = resolve(gameDir, "worktrees/cycles", cycleUuid, "current");
      expect(existsSync(resolve(upstreamPath, ".git"))).toBe(true);
      expect(existsSync(resolve(cyclePath, ".git"))).toBe(true);
      expect(git(upstreamPath, ["rev-parse", "HEAD"])).toBe(baseSha);
      expect(git(cyclePath, ["rev-parse", "HEAD"])).toBe(baseSha);
      expect(git(cyclePath, ["branch", "--show-current"])).toBe(`orchestrator/cycle/${cycleUuid}`);
      expect(result.baseSha).toBe(baseSha);

      const saved = store.db.query(
        "SELECT base_sha, head_revision, preparing_state_json, caused_by_event_id FROM cycles WHERE cycle_uuid = ?",
      ).get(cycleUuid) as {
        base_sha: string;
        head_revision: string;
        preparing_state_json: string;
        caused_by_event_id: string;
      };
      expect(saved.base_sha).toBe(baseSha);
      expect(saved.head_revision).toBe(baseSha);
      const preparing = JSON.parse(saved.preparing_state_json) as {
        sync: Record<string, unknown>;
      };
      expect(preparing.sync).toMatchObject({
        status: "complete",
        cycleCurrentWorktreePath: cyclePath,
        cycleWorktreePath: cyclePath,
        upstreamWorktreePath: upstreamPath,
      });

      const anchor = store.db.query(
        "SELECT cycle_uuid, upstream_revision, sync_id, caused_by_event_id FROM game_upstream_anchors WHERE game_id = ?",
      ).get("melee") as {
        cycle_uuid: string;
        upstream_revision: string;
        sync_id: string;
        caused_by_event_id: string;
      };
      expect(anchor).toEqual({
        cycle_uuid: cycleUuid,
        upstream_revision: baseSha,
        sync_id: `bootstrap:${cycleUuid}`,
        caused_by_event_id: saved.caused_by_event_id,
      });
    } finally {
      store.db.close();
    }
  });
});
