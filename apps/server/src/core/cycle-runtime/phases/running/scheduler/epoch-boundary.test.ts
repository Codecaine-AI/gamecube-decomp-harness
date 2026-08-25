import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  activeSchedulerEpoch,
  createRun,
  openState,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { runEpochBoundary, type EpochBoundaryParams } from "./epoch-boundary.js";

const tempDirs: string[] = [];

function fixture(units: unknown[]): { dir: string; store: StateStore; globals: GlobalArgs; runId: string; epochId: string } {
  const dir = mkdtempSync(join(tmpdir(), "epoch-boundary-"));
  tempDirs.push(dir);
  const repoRoot = resolve(dir, "repo");
  const stateDir = resolve(dir, "state");
  mkdirSync(resolve(repoRoot, "build/GALE01"), { recursive: true });
  writeFileSync(resolve(repoRoot, "build/GALE01/report.json"), `${JSON.stringify({ measures: { matched_code_percent: 0 }, units })}\n`);
  const store = openState(stateDir);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
    candidateWindow: 1,
  });
  return {
    dir,
    store,
    globals: {
      repoRoot,
      stateDir,
      dryRunAgents: true,
      provider: "test",
      model: "test",
      thinkingLevel: "low",
    },
    runId: run.id,
    epochId: epoch.id,
  };
}

function params(
  value: ReturnType<typeof fixture>,
  overrides: Partial<Pick<EpochBoundaryParams, "globals" | "dependencies">> = {},
): EpochBoundaryParams {
  return {
    store: value.store,
    globals: overrides.globals ?? value.globals,
    args: new Map(),
    runId: value.runId,
    leaseId: `lease-${value.runId}`,
    trigger: "test boundary",
    schedulerEpochId: value.epochId,
    epochOrdinal: 1,
    config: {
      epochConfigureCommand: "true",
      epochLinkPaths: [],
      epochPauseThreshold: 12,
      epochRequeueLimit: 32,
      epochRetryMs: 60_000,
      cycleDraftPrEnabled: false,
      fullKgMaintenanceMode: "skip",
      writeSetFlags: { writeSetWidening: "off" },
      schedulerEpochConfig: {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      },
      graphDbPath: resolve(value.dir, "missing-graph.sqlite"),
      epochWorktreeDir: resolve(value.dir, "epoch-worktree"),
    },
    reportKnowledgeProgress: () => () => {},
    dependencies: overrides.dependencies,
  };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("runEpochBoundary", () => {
  test("dry run closes the completed epoch and deterministically admits the next epoch", async () => {
    const value = fixture([
      {
        name: "unit",
        metadata: { source_path: "src/a.c" },
        functions: [{ name: "fn", size: 1, fuzzy_match_percent: 1 }],
      },
    ]);
    try {
      const outcome = await runEpochBoundary(params(value));

      expect(outcome).toMatchObject({ ok: true, reconciled: false, paused: false, exhausted: false, retryAtMs: null });
      expect(outcome.boundaryResult).toBeUndefined();
      expect(outcome.nextEpoch?.progress).toMatchObject({ ordinal: 2, admitted: 1, available: 1 });
      expect(value.store.db.query("SELECT status, boundary_status FROM epochs WHERE id = ?").get(value.epochId)).toEqual({
        status: "completed",
        boundary_status: "dry_run",
      });
      expect(activeSchedulerEpoch(value.store, value.runId)?.id).toBe(outcome.nextEpoch?.epoch.id);
    } finally {
      value.store.db.close();
    }
  });

  test("reconciled pending integration skips the epoch cycle and continues admission", async () => {
    const value = fixture([
      {
        name: "unit",
        metadata: { source_path: "src/a.c" },
        functions: [{ name: "fn", size: 1, fuzzy_match_percent: 1 }],
      },
    ]);
    try {
      let cycleCalls = 0;
      const outcome = await runEpochBoundary(
        params(value, {
          globals: { ...value.globals, dryRunAgents: false },
          dependencies: {
            reconcilePendingIntegrationAttempt: () => ({
              status: "completed",
              completed: { runId: value.runId, epochId: value.epochId, commitSha: "retained-commit" },
            }),
            runEpochCycle: async () => {
              cycleCalls += 1;
              throw new Error("runEpochCycle must not run after reconciliation");
            },
          },
        }),
      );

      expect(cycleCalls).toBe(0);
      expect(outcome).toMatchObject({ ok: true, reconciled: true, paused: false, exhausted: false });
      expect(outcome.nextEpoch?.progress.ordinal).toBe(2);
      const closed = value.store.db
        .query("SELECT status, boundary_status, routing_summary_json FROM epochs WHERE id = ?")
        .get(value.epochId) as Record<string, unknown>;
      expect(closed.status).toBe("completed");
      expect(closed.boundary_status).toBe("success");
      expect(JSON.parse(String(closed.routing_summary_json))).toMatchObject({
        trigger: "test boundary",
        reconciled: true,
        commitSha: "retained-commit",
      });
    } finally {
      value.store.db.close();
    }
  });

  test("closes an empty post-boundary epoch as board exhausted", async () => {
    const value = fixture([]);
    try {
      const outcome = await runEpochBoundary(params(value));

      expect(outcome).toMatchObject({ ok: true, reconciled: false, paused: false, exhausted: true });
      expect(outcome.retryAtMs).toBeNumber();
      expect(value.store.db.query("SELECT status, boundary_status FROM epochs WHERE id = ?").get(outcome.nextEpoch?.epoch.id ?? "")).toEqual({
        status: "exhausted",
        boundary_status: "board_exhausted",
      });
      expect(activeSchedulerEpoch(value.store, value.runId)).toBeNull();
    } finally {
      value.store.db.close();
    }
  });
});
