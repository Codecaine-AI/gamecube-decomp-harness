import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { openState } from "@server/core/harness-runtime/run-state";
import { recordSteeringBackfill, recordSteeringCoverage, recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { latestDashboardArtifactPayload } from "@server/core/orchestrator-state";
import { initRun } from "./init-run.js";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const UNIT = "main/Map/MapObj";

function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

/**
 * A checkout with the baseline B and its child C, and a raw report where
 * `verified` (48 bytes) and `held` (16 bytes) are both exact. `held` has a
 * steering rollback and no active `unverified_match` row; a certified
 * backfill pass at C clears it for C and its descendants only.
 */
function seed(steeringGate: string) {
  const repo = mkdtempSync(join(tmpdir(), "init-run-baseline-repo-"));
  const stateDir = mkdtempSync(join(tmpdir(), "init-run-baseline-state-"));
  tempDirs.push(repo, stateDir);
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "fixture@example.com"]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  const commit = (label: string) => {
    writeFileSync(join(repo, "MapObj.cpp"), `// ${label}\n`);
    git(repo, ["add", "MapObj.cpp"]);
    git(repo, ["commit", "-qm", label]);
    return git(repo, ["rev-parse", "HEAD"]);
  };
  const shas = { base: commit("baseline"), later: commit("later") };
  git(repo, ["checkout", "-q", shas.base]);
  mkdirSync(join(repo, "build"), { recursive: true });
  const measures = {
    total_code: 64, matched_code: 64, matched_code_percent: 100, fuzzy_match_percent: 100,
    total_functions: 2, matched_functions: 2, matched_functions_percent: 100,
    complete_code: 64, complete_code_percent: 100, total_data: 0, complete_data: 0,
    total_units: 1, complete_units: 1,
  };
  writeFileSync(join(repo, "build", "report.json"), JSON.stringify({ measures, units: [{ name: UNIT, measures,
    metadata: { source_path: "src/Map/MapObj.cpp", complete: true },
    functions: [{ name: "verified", size: 48, fuzzy_match_percent: 100 }, { name: "held", size: 16, fuzzy_match_percent: 100 }] }] }));

  const store = openState(stateDir);
  try {
    initializeHarnessState(store.db, { gameId: "sms", worktree: repo, configurationRevision: "test-config", commandId: "init-harness" });
    transitionHarnessState(store.db, {
      gameId: "sms", expectedRevision: 0, commandId: "seed-harness",
      patch: { readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" }, source: { head: shas.base } },
    });
    const rollbackId = recordSteeringRollback(store, {
      gameId: "sms", unit: UNIT, symbol: "held", analyzedRev: shas.base, baseRev: shas.base,
      initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
    });
    store.db.query("UPDATE steering_rollbacks SET recorded_at = ?, updated_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", rollbackId);
    recordSteeringBackfill(store, { gameId: "sms", unit: UNIT, symbol: "held", analyzedRev: shas.later, verdict: "pass" });
    recordSteeringCoverage(store, { gameId: "sms", unit: UNIT, analyzedRev: shas.later, baselineRev: shas.later, clean: true });
  } finally {
    store.db.close();
  }
  const globals = {
    repoRoot: repo, stateDir, gameId: "sms", dryRunAgents: true, provider: "test", model: "test", thinkingLevel: "medium",
    game: { gameId: "sms", repoRoot: repo, stateDir, matching: { steeringGate }, validation: { reportPath: "build/report.json" }, dashboard: {} },
  } as unknown as GlobalArgs;
  return { repo, shas, globals };
}

async function initialBoard(globals: GlobalArgs) {
  const log = console.log;
  console.log = () => {};
  try {
    await initRun(globals, new Map());
  } finally {
    console.log = log;
  }
  const store = openState(globals.stateDir);
  try {
    const run = store.db.query("SELECT id FROM runs ORDER BY created_at DESC LIMIT 1").get() as { id: string };
    return latestDashboardArtifactPayload(store, { runId: run.id, artifactType: "board_snapshot", artifactKey: "initial" });
  } finally {
    store.db.close();
  }
}

describe("initRun: initial board under steering holds", () => {
  test("pins the revision it measured and withholds a rollback not certified there", async () => {
    const { shas, globals } = seed("shadow");
    const board = await initialBoard(globals);
    expect(board.measuredRevision).toBe(shas.base);
    // `held` (16 of 64 bytes) has only a rollback hold: C's certificate is not an ancestor of B.
    expect(board.measures).toMatchObject({ matched_code_percent: 75, matched_functions: 1, unverified_code: 16 });
  });

  test("a checkout measured at the certified revision credits the rolled-back function", async () => {
    const { repo, shas, globals } = seed("shadow");
    git(repo, ["checkout", "-q", shas.later]);
    const board = await initialBoard(globals);
    expect(board.measuredRevision).toBe(shas.later);
    expect(board.measures).toMatchObject({ matched_code_percent: 100, matched_functions: 2 });
  });

  test("games without an active gate (Melee) keep the snapshot shape and raw figures", async () => {
    const { globals } = seed("off");
    const board = await initialBoard(globals);
    expect(board).not.toHaveProperty("measuredRevision");
    expect(board.measures).toMatchObject({ matched_code_percent: 100, matched_functions: 2 });
    expect(board.measures).not.toHaveProperty("unverified_code");
  });
});
