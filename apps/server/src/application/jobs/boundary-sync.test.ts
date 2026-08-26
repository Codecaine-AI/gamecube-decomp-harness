import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import { boundarySync, loadBoundarySyncDryRunState } from "./boundary-sync";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options";
import type { BoundarySyncPlan } from "@server/core/cycle-runtime/phases/running/epochs/boundary-sync";

const globals: GlobalArgs = {
  repoRoot: "/fixture/cycle-worktree",
  stateDir: "/fixture/state",
  gameId: "melee",
  dryRunAgents: false,
  provider: "pi",
  model: "test",
  thinkingLevel: "medium",
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createBoundaryState(): string {
  const stateDir = mkdtempSync(join(tmpdir(), "boundary-sync-job-"));
  temporaryDirectories.push(stateDir);
  const db = new Database(join(stateDir, "orchestrator.sqlite"));
  db.run("CREATE TABLE cycles (cycle_uuid TEXT PRIMARY KEY, game_id TEXT, status TEXT, active_run_id TEXT, updated_at TEXT)");
  db.run("CREATE TABLE game_upstream_anchors (cycle_uuid TEXT, upstream_revision TEXT)");
  db.run("CREATE TABLE runs (id TEXT PRIMARY KEY, cycle_uuid TEXT)");
  db.run("CREATE TABLE epoch_targets (id TEXT PRIMARY KEY, run_id TEXT, target_key TEXT, source_path TEXT, unit TEXT, symbol TEXT)");
  db.run("CREATE TABLE worker_state (epoch_target_id TEXT, exact INTEGER, best_score REAL, best_checkpoint_id TEXT, ended_at TEXT, started_at TEXT)");
  db.run("INSERT INTO cycles VALUES ('cycle-1', 'melee', 'active', NULL, '2026-08-26T00:00:00Z')");
  db.run("INSERT INTO game_upstream_anchors VALUES ('cycle-1', 'anchor')");
  db.run("INSERT INTO runs VALUES ('stopped-run', 'cycle-1'), ('other-run', 'cycle-2')");
  db.run("INSERT INTO epoch_targets VALUES ('target-1', 'stopped-run', 'target-a', 'src/a.c', 'a.c', 'func')");
  db.run("INSERT INTO worker_state VALUES ('target-1', 1, 100, 'checkpoint-1', '2026-08-26T00:00:00Z', '2026-08-25T00:00:00Z')");
  db.close();
  return stateDir;
}

describe("boundary-sync job", () => {
  test("requires dry-run at the job-runner boundary", async () => {
    expect(boundarySync(globals, new Map())).rejects.toThrow("boundary-sync --dry-run [--run-id <id>]");
  });

  test("loads enrichment across the cycle without requiring a run", () => {
    const state = loadBoundarySyncDryRunState(createBoundaryState(), "melee");

    expect(state).toEqual({
      anchorSha: "anchor",
      targets: [{
        targetKey: "target-a",
        sourcePath: "src/a.c",
        unit: "a.c",
        symbol: "func",
        priorKind: "match",
        priorScore: 100,
      }],
    });
  });

  test("loads the anchor with no runs or worker state", () => {
    const stateDir = createBoundaryState();
    const db = new Database(join(stateDir, "orchestrator.sqlite"));
    db.run("DELETE FROM worker_state");
    db.run("DELETE FROM epoch_targets");
    db.run("DELETE FROM runs");
    db.close();

    expect(loadBoundarySyncDryRunState(stateDir, "melee")).toEqual({ anchorSha: "anchor", targets: [] });
  });

  test("rejects an explicit run outside the active cycle", () => {
    expect(() => loadBoundarySyncDryRunState(createBoundaryState(), "melee", "other-run"))
      .toThrow("does not belong to active cycle cycle-1");
  });

  test("loads read-only state and prints the complete dry-run plan", async () => {
    const expected = {
      schemaVersion: 1,
      dryRun: true,
      anchorSha: "anchor",
      localHeadSha: "local",
      upstreamHeadSha: "upstream",
      drifted: true,
      upstreamChangedFiles: ["src/a.c"],
      locallyChangedFiles: ["src/a.c"],
      upstreamTakenFiles: ["src/a.c"],
      targetsToRequeue: [],
      ledgerNotes: [],
      actions: ["merge_upstream_theirs"],
    } satisfies BoundarySyncPlan;
    let printed: BoundarySyncPlan | undefined;
    let plannerInput: Parameters<typeof import("@server/core/cycle-runtime/phases/running/epochs/boundary-sync").planBoundarySync>[0] | undefined;
    let loadedRunId: string | undefined;

    await boundarySync(globals, new Map([["--dry-run", true], ["--run-id", "stopped-run"]]), {
      loadState: (_stateDir, _gameId, runId) => {
        loadedRunId = runId;
        return {
          anchorSha: "anchor",
          targets: [{ targetKey: "a", sourcePath: "src/a.c", priorKind: "match", priorScore: 100 }],
        };
      },
      plan: async (input) => {
        plannerInput = input;
        return expected;
      },
      print: (plan) => {
        printed = plan;
      },
    });

    expect(plannerInput).toEqual({
      repoRoot: "/fixture/cycle-worktree",
      anchorSha: "anchor",
      targets: [{ targetKey: "a", sourcePath: "src/a.c", priorKind: "match", priorScore: 100 }],
      dryRun: true,
    });
    expect(loadedRunId).toBe("stopped-run");
    expect(printed).toEqual(expected);
  });
});
