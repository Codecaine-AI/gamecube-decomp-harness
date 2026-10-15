import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { resolveGame } from "@server/core/game-registry/resolver.js";
import { recordSteeringBackfillRun } from "@server/core/harness-runtime/run-state/steering.js";
import { createRun } from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { activateRun } from "@server/core/harness-runtime/phases/running/run-control.js";
import { runRunLoop } from "@server/core/harness-runtime/phases/running/scheduler/run-loop.js";
import { assertSteeringGatePreflight } from "./steering-preflight.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "steering-preflight-"));
  dirs.push(dir);
  return dir;
}

function git(repo: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

/** main: c1 -> c2 (HEAD); side branch off c1: s1. */
function repoWithHistory(): { repo: string; c1: string; c2: string; s1: string } {
  const repo = tempDir();
  git(repo, "init", "-q", "-b", "main");
  const commit = (name: string) => {
    writeFileSync(join(repo, name), name);
    git(repo, "add", name);
    git(repo, "commit", "-q", "-m", name);
    return git(repo, "rev-parse", "HEAD");
  };
  const c1 = commit("a");
  git(repo, "checkout", "-q", "-b", "side");
  const s1 = commit("s");
  git(repo, "checkout", "-q", "main");
  const c2 = commit("b");
  return { repo, c1, c2, s1 };
}

const enforced = { gameId: "sms", matching: { stackFramePolicy: "stop_at_frame" as const, steeringGate: "enforce" as const } };

describe("steering gate enforce preflight", () => {
  test("refuses without a clean backfill run and names the backfill command", () => {
    const { repo } = repoWithHistory();
    const store = openState(tempDir());
    try {
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: "deadbeef", clean: false });
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" }))
        .toThrow(/refusing to run run-loop: no clean steering backfill run.*steering-gate --game sms .*--record --apply/);
    } finally {
      store.db.close();
    }
  });

  test("accepts a clean backfill on an ancestor of the integration head, refuses one on a non-descendant branch", () => {
    const { repo, c1, c2, s1 } = repoWithHistory();
    const store = openState(tempDir());
    try {
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: c1, clean: true });
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).not.toThrow();
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: c2, clean: true });
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).not.toThrow();
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: s1, clean: true });
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" }))
        .toThrow(new RegExp(`backfill \\(${s1}\\) is not an ancestor of the integration head HEAD.*steering-gate --game sms`));
    } finally {
      store.db.close();
    }
  });

  test("off and shadow games, including Melee as shipped, are never checked", () => {
    const store = openState(tempDir());
    try {
      for (const game of [resolveGame({ gameId: "melee" }), { gameId: "x", matching: { stackFramePolicy: "match_frame" as const, steeringGate: "shadow" as const } }]) {
        expect(() => assertSteeringGatePreflight(store, { game, repoRoot: "/nonexistent", command: "run-loop", isAncestor: () => { throw new Error("called"); } })).not.toThrow();
      }
      expect(() => assertSteeringGatePreflight(store, { game: null, gameId: "melee", repoRoot: "/nonexistent", command: "run-loop" })).not.toThrow();
    } finally {
      store.db.close();
    }
  });

  test("SMS as shipped is enforce: refused without a clean backfill run, accepted with one on an ancestor of HEAD", () => {
    const { repo, c1 } = repoWithHistory();
    const store = openState(tempDir());
    try {
      const sms = resolveGame({ gameId: "sms" });
      expect(sms.matching.steeringGate).toBe("enforce");
      expect(() => assertSteeringGatePreflight(store, { game: sms, repoRoot: repo, command: "run-loop" }))
        .toThrow(/Steering gate is enforce for sms; refusing to run run-loop: no clean steering backfill run/);
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: c1, clean: false });
      expect(() => assertSteeringGatePreflight(store, { game: sms, repoRoot: repo, command: "run-loop" })).toThrow(/no clean steering backfill run/);
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: c1, clean: true });
      expect(() => assertSteeringGatePreflight(store, { game: sms, repoRoot: repo, command: "run-loop" })).not.toThrow();
    } finally {
      store.db.close();
    }
  });

  test("run-loop refuses to start or resume an enforce run without the backfill", async () => {
    const dir = tempDir();
    const store = openState(dir);
    seedRunHarness(store);
    const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot: dir, stateDir: dir }, { baseRevision: "base-test" });
    const active = activateRun({ reason: "test run-loop start", runId: run.id, store });
    store.db.close();
    const globals = {
      dryRunAgents: true, model: "test", provider: "test", repoRoot: dir, stateDir: dir, thinkingLevel: "low",
      game: { ...resolveGame({ gameId: "melee" }), gameId: "test", matching: { stackFramePolicy: "match_frame", steeringGate: "enforce" } },
    };
    await expect(runRunLoop(globals as never, new Map<string, string | true>([["--run-id", run.id], ["--lease-id", active.leaseId], ["--once", true]])))
      .rejects.toThrow(/Steering gate is enforce for test; refusing to run run-loop: no clean steering backfill/);
  });
});
