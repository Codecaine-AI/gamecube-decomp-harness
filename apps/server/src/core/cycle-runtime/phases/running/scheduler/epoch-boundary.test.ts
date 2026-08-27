import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  activeSchedulerEpoch,
  closeSchedulerEpochWithEvidence,
  createRun,
  openState,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { createCycle, recordSavePointAnchor } from "@server/core/cycle";
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
    workerPoolSize: 1,
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

function attachCycle(value: ReturnType<typeof fixture>, cycleUuid = "cycle-boundary"): string {
  createCycle(value.store.db, {
    actor: "operator",
    activeRunId: value.runId,
    baseSha: "base-test",
    commandId: "command-cycle-open",
    gameId: "test",
    cycleUuid,
    id: `cycle:${cycleUuid}`,
    traceId: `trace-${cycleUuid}`,
    worktreeIdentity: value.globals.repoRoot,
  });
  value.store.db.query("UPDATE runs SET cycle_uuid = ? WHERE id = ?").run(cycleUuid, value.runId);
  return cycleUuid;
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
      cycleDraftPrEnabled: false,
      ciParityEnabled: false,
      preCommitGateEnabled: false,
      boundarySyncEnabled: false,
      breakageGateEnabled: false,
      fullKgMaintenanceMode: "skip",
      writeSetFlags: { writeSetWidening: "off" },
      schedulerEpochConfig: {
        workerPoolSize: 1,
      },
      graphDbPath: resolve(value.dir, "missing-graph.sqlite"),
      epochWorktreeDir: resolve(value.dir, "epoch-worktree"),
    },
    reportKnowledgeProgress: () => () => {},
    dependencies: overrides.dependencies,
  };
}

function completedBoundary(value: ReturnType<typeof fixture>) {
  return {
    artifactDir: value.dir,
    commitSha: "epoch-head",
    label: "epoch-1",
    matchedCodePercent: 90,
    qaGate: null,
    regressions: { regressedFunctions: 0 },
    repair: { paused: false, requeued: 0, reasons: [] },
    savePointId: null,
    durationMs: 1,
    worktreeDir: value.dir,
  };
}

function git(repoRoot: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("runEpochBoundary", () => {
  test("closes a successful epoch with registered integration payload facts", async () => {
    const value = fixture([]);
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    try {
      git(value.globals.repoRoot, ["init"]);
      git(value.globals.repoRoot, ["config", "user.email", "epoch-boundary@example.invalid"]);
      git(value.globals.repoRoot, ["config", "user.name", "Epoch Boundary Test"]);
      git(value.globals.repoRoot, ["add", "."]);
      git(value.globals.repoRoot, ["commit", "-m", "epoch boundary fixture"]);
      const commitSha = git(value.globals.repoRoot, ["rev-parse", "HEAD"]);
      attachCycle(value);

      const outcome = await runEpochBoundary(params(value, {
        globals: { ...value.globals, dryRunAgents: false, gameId: "test" },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: async () => ({
            ...completedBoundary(value),
            commitSha,
            scoreDelta: 1,
            savePointId: null,
            savePointEvidence: {
              status: "failed",
              triggerKind: "epoch",
              sourceKind: "test",
              sourceId: value.epochId,
              message: "fixture has no save point",
            },
          }) as never,
        },
      }));

      expect(outcome.ok).toBe(true);
      const event = value.store.db.query(
        "SELECT payload_json FROM game_events WHERE event_type = 'run.epoch_integrated' AND subject_id = ?",
      ).get(value.runId) as { payload_json: string };
      expect(JSON.parse(event.payload_json)).toMatchObject({
        ordinal: 1,
        boundary_status: "success",
        save_point_id: null,
      });
    } finally {
      errorLog.mockRestore();
      value.store.db.close();
    }
  });

  test("uses the cycle UUID for the boundary-sync save-point anchor", async () => {
    const value = fixture([]);
    const cycleUuid = attachCycle(value);
    value.store.db.query(`INSERT INTO game_upstream_anchors
      (game_id, cycle_uuid, upstream_revision, sync_id, caused_by_event_id, updated_at)
      VALUES ('test', ?, 'base-test', 'sync-test', 'event-test', '2026-08-26T00:00:00.000Z')`).run(cycleUuid);
    let correlationId: string | undefined;
    let anchorPayload: unknown;
    try {
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false, gameId: "test" },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: async () => ({ commitSha: "epoch-head", label: "epoch-1", matchedCodePercent: 90, qaGate: null, regressions: { regressedFunctions: 0 }, repair: { paused: false, requeued: 0 }, durationMs: 1 }) as never,
          productionRunBoundarySync: async (boundaryInput) => {
            await boundaryInput.hooks?.writePrSyncSavePoint({
              kind: "pr_sync",
              anchorSha: "base-test",
              commitSha: "epoch-head",
              upstreamHeadSha: "upstream-head",
              matchedCodePercent: 90,
              matchedDataPercent: 72.5,
              measures: { matched_data_percent: 72.5 },
              sectionMeasures: { ".data": { sizeBytes: 4, fuzzyMatchPercent: 72.5, exactRows: 0, totalRows: 1 } },
            });
            return { changed: true, headSha: "epoch-head", plan: {} as never };
          },
          recordSavePointAnchor: ((_store: StateStore, anchorInput: Parameters<typeof recordSavePointAnchor>[1]) => {
            correlationId = anchorInput.correlationId;
            anchorPayload = anchorInput.payload;
            return {} as never;
          }) as never,
          closeSchedulerEpochWithEvidence: (() => {}) as never,
          ensureSchedulerEpochFromBoard: (() => ({ epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 }, priorityRefreshes: 0 })) as never,
        },
      });
      input.config.boundarySyncEnabled = true;
      const outcome = await runEpochBoundary(input);
      expect(outcome.ok).toBe(true);
      expect(correlationId).toBe(cycleUuid);
      expect(anchorPayload).toMatchObject({
        matched_data_percent: 72.5,
        section_measures: { ".data": { sizeBytes: 4, fuzzyMatchPercent: 72.5, exactRows: 0, totalRows: 1 } },
      });
      const savePoint = value.store.db.query("SELECT payload_json FROM save_points WHERE trigger_kind = 'pr_sync'").get() as { payload_json: string };
      expect(JSON.parse(savePoint.payload_json)).toMatchObject({
        matched_data_percent: 72.5,
        section_measures: { ".data": { sizeBytes: 4, fuzzyMatchPercent: 72.5, exactRows: 0, totalRows: 1 } },
      });
    } finally { value.store.db.close(); }
  });

  for (const paused of [true, false]) test(`uses the run ID for the ${paused ? "paused" : "successful"} epoch integration record`, async () => {
    const value = fixture([]);
    attachCycle(value, `cycle-${paused ? "paused" : "success"}`);
    let correlationId: string | undefined;
    try {
      const outcome = await runEpochBoundary(params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: async () => ({ commitSha: "epoch-head", label: "epoch-1", savePointId: "save-1", matchedCodePercent: 90, scoreDelta: 1, qaGate: null, regressions: { regressedFunctions: 0 }, repair: { paused, requeued: 0, reasons: [] }, durationMs: 1 }) as never,
          closeSchedulerEpochWithEvidence: ((
            _store: StateStore,
            _epochId: string,
            closeInput: Parameters<typeof closeSchedulerEpochWithEvidence>[2],
          ) => { correlationId = closeInput.integration?.correlationId; }) as never,
          ensureSchedulerEpochFromBoard: (() => ({ epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 }, priorityRefreshes: 0 })) as never,
        },
      }));
      expect(outcome.ok).toBe(true);
      expect(correlationId).toBe(value.runId);
    } finally { value.store.db.close(); }
  });
  test("runs boundary sync after epoch finish and exposes the post-sync head before admission", async () => {
    const value = fixture([]);
    try {
      const order: string[] = [];
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: async () => {
            order.push("epoch_finish");
            return {
              commitSha: "epoch-head",
              label: "epoch-1",
              matchedCodePercent: 90,
              qaGate: null,
              regressions: { regressedFunctions: 0 },
              repair: { paused: false, requeued: 0 },
              durationMs: 1,
            } as never;
          },
          runBoundarySync: async () => {
            order.push("pr_sync");
            return {
              changed: true,
              headSha: "post-sync-head",
              plan: {
                anchorSha: "base-test",
                upstreamHeadSha: "upstream-head",
                drifted: true,
                upstreamTakenFiles: ["src/a.c"],
                targetsToRequeue: [{
                  targetKey: "main/a::fn",
                  unit: "main/a",
                  symbol: "fn",
                  priorKind: "improvement",
                  priorScore: 82,
                  upstreamLandedSha: "upstream-head",
                }],
              } as never,
            };
          },
          publishCycleDraftPr: async (publishInput) => {
            order.push("draft_pr");
            expect(publishInput.commitSha).toBe("post-sync-head");
            expect(publishInput.epochOrdinal).toBe(1);
            return { status: "updated" } as never;
          },
          ensureSchedulerEpochFromBoard: ((input: unknown) => {
            order.push("admission");
            return { epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 }, priorityRefreshes: 0 };
          }) as never,
        },
      });
      input.schedulerEpochId = undefined;
      input.config.boundarySyncEnabled = true;
      input.config.cycleDraftPrEnabled = true;
      const outcome = await runEpochBoundary(input);

      expect(order).toEqual(["epoch_finish", "pr_sync", "draft_pr", "admission"]);
      expect(outcome.boundaryHeadSha).toBe("post-sync-head");
      const syncEvents = value.store.db.query(
        "SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'boundary_sync' ORDER BY created_at",
      ).all(value.runId) as Array<{ payload_json: string }>;
      expect(syncEvents.map((event) => JSON.parse(event.payload_json))).toContainEqual(expect.objectContaining({
        epoch: 1,
        status: "finished",
        anchor_before: "base-test",
        anchor_after: "upstream-head",
        merge_commit_sha: "post-sync-head",
        displaced_count: 1,
      }));
    } finally {
      value.store.db.close();
    }
  });

  test("skips draft PR publication and logs the reason when boundary sync fails", async () => {
    const value = fixture([]);
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    try {
      let publishCalls = 0;
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: async () => ({
            commitSha: "epoch-head",
            label: "epoch-1",
            matchedCodePercent: 90,
            qaGate: null,
            regressions: { regressedFunctions: 0 },
            repair: { paused: false, requeued: 0 },
            durationMs: 1,
          }) as never,
          runBoundarySync: async () => {
            throw new Error("boundary sync fetch failed: network unavailable");
          },
          publishCycleDraftPr: async () => {
            publishCalls += 1;
            return { status: "updated" } as never;
          },
        },
      });
      input.schedulerEpochId = undefined;
      input.config.boundarySyncEnabled = true;
      input.config.cycleDraftPrEnabled = true;

      const outcome = await runEpochBoundary(input);

      expect(outcome).toMatchObject({ ok: false, error: "boundary sync fetch failed: network unavailable" });
      expect(publishCalls).toBe(0);
      expect(errorLog.mock.calls.some(([message]) => String(message).includes("cycle draft PR skipped (boundary_sync_failed)"))).toBe(true);
      const draftEvent = value.store.db
        .query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'draft_pr_publish'")
        .get(value.runId) as { payload_json: string };
      expect(JSON.parse(draftEvent.payload_json)).toMatchObject({ status: "skipped", reason: "sync_failed" });
    } finally {
      errorLog.mockRestore();
      value.store.db.close();
    }
  });

  test("failed CI parity gate records evidence and skips draft PR publication", async () => {
    const value = fixture([]);
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    let publishCalls = 0;
    try {
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: (async () => completedBoundary(value)) as never,
          runCiParityGate: async (gateInput) => {
            expect(gateInput).toEqual({ worktreeDir: value.dir, sha: "epoch-head" });
            return {
              status: "failed",
              modes: ["link", "test"],
              steps: [{ name: "link ninja", command: ["ninja"], exitCode: 1, durationMs: 1, outputTail: "undefined symbol" }],
              reasons: ["link ninja failed"],
            };
          },
          runPreCommitGate: async (gateInput) => {
            expect(gateInput).toEqual({
              worktreeDir: value.dir,
              cacheDir: resolve(value.globals.stateDir, "pre-commit-cache"),
            });
            return { status: "clean", modes: ["pre-commit"], steps: [], reasons: [] };
          },
          publishCycleDraftPr: async () => {
            publishCalls += 1;
            return { status: "updated" } as never;
          },
        },
      });
      input.schedulerEpochId = undefined;
      input.config.cycleDraftPrEnabled = true;
      input.config.ciParityEnabled = true;
      input.config.preCommitGateEnabled = true;

      const outcome = await runEpochBoundary(input);

      expect(outcome.ok).toBe(true);
      expect(publishCalls).toBe(0);
      const event = value.store.db
        .query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'ci_parity_gate'")
        .get(value.runId) as { payload_json: string };
      expect(JSON.parse(event.payload_json)).toMatchObject({
        epoch: 1,
        ci_parity_status: "failed",
        pre_commit_status: "clean",
        reasons: ["link ninja failed"],
        steps: [{ gate: "ci_parity", name: "link ninja", exit_code: 1 }],
      });
      expect(errorLog.mock.calls.some(([message]) => String(message).includes("cycle draft PR skipped (ci_parity_failed: link ninja failed)"))).toBe(true);
    } finally {
      errorLog.mockRestore();
      value.store.db.close();
    }
  });

  test("clean CI parity gates publish the cycle draft PR", async () => {
    const value = fixture([]);
    let publishCalls = 0;
    const order: string[] = [];
    try {
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: (async () => completedBoundary(value)) as never,
          runCiParityGate: async () => {
            order.push("ci_parity");
            return { status: "clean", modes: ["link", "test"], steps: [], reasons: [] };
          },
          runPreCommitGate: async () => {
            order.push("pre_commit");
            return { status: "clean", modes: ["pre-commit"], steps: [], reasons: [] };
          },
          publishCycleDraftPr: async () => {
            order.push("publish");
            publishCalls += 1;
            return { status: "updated" } as never;
          },
        },
      });
      input.schedulerEpochId = undefined;
      input.config.cycleDraftPrEnabled = true;
      input.config.ciParityEnabled = true;
      input.config.preCommitGateEnabled = true;

      const outcome = await runEpochBoundary(input);

      expect(outcome.ok).toBe(true);
      expect(publishCalls).toBe(1);
      expect(order).toEqual(["ci_parity", "pre_commit", "publish"]);
    } finally {
      value.store.db.close();
    }
  });

  test("disabled CI parity gates do not run before draft PR publication", async () => {
    const value = fixture([]);
    let gateCalls = 0;
    let publishCalls = 0;
    try {
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: (async () => completedBoundary(value)) as never,
          runCiParityGate: async () => {
            gateCalls += 1;
            throw new Error("disabled CI parity gate ran");
          },
          runPreCommitGate: async () => {
            gateCalls += 1;
            throw new Error("disabled pre-commit gate ran");
          },
          publishCycleDraftPr: async () => {
            publishCalls += 1;
            return { status: "updated" } as never;
          },
        },
      });
      input.schedulerEpochId = undefined;
      input.config.cycleDraftPrEnabled = true;

      const outcome = await runEpochBoundary(input);

      expect(outcome.ok).toBe(true);
      expect(gateCalls).toBe(0);
      expect(publishCalls).toBe(1);
      expect(value.store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'ci_parity_gate'").get(value.runId)).toEqual({ count: 0 });
    } finally {
      value.store.db.close();
    }
  });

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

      expect(outcome).toMatchObject({ ok: true, reconciled: false, paused: false });
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

  test("master breakage gate pauses the boundary", async () => {
    const value = fixture([]);
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    try {
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: async () => ({
            artifactDir: value.dir,
            commitSha: "epoch-head",
            label: "epoch-1",
            matchedCodePercent: 90,
            qaGate: null,
            regressions: { regressedFunctions: 0 },
            repair: { paused: false, requeued: 0, reasons: [] },
            savePointId: null,
            durationMs: 1,
            worktreeDir: value.dir,
          }) as never,
          runMasterBreakageGate: async () => ({
            status: "breakage",
            baselineKind: "upstream_ci",
            baselineSha: "0123456789abcdef",
            baselineReportPath: resolve(value.dir, "master.json"),
            oursReportPath: resolve(value.dir, "report.json"),
            changesPath: resolve(value.dir, "changes.json"),
            breakages: [{ unitName: "unit", itemName: "fn", kind: "function", fromPercent: 100, toPercent: 96.9, bytesDelta: -3 }],
            moved: [],
            reasons: [],
          }),
          closeSchedulerEpochWithEvidence: (() => {}) as never,
        },
      });
      input.config.breakageGateEnabled = true;

      const outcome = await runEpochBoundary(input);

      expect(outcome).toMatchObject({ ok: true, paused: true });
      expect(outcome.breakageGate?.status).toBe("breakage");
      expect(value.store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'epoch_regression_pause'").get(value.runId)).toEqual({ count: 1 });
      expect(value.store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'boundary_breakage_gate'").get(value.runId)).toEqual({ count: 1 });
    } finally {
      errorLog.mockRestore();
      value.store.db.close();
    }
  });

  test("gate skip does not pause", async () => {
    const value = fixture([]);
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    try {
      const input = params(value, {
        globals: { ...value.globals, dryRunAgents: false },
        dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochCycle: async () => ({
            artifactDir: value.dir,
            commitSha: "epoch-head",
            label: "epoch-1",
            matchedCodePercent: 90,
            qaGate: null,
            regressions: { regressedFunctions: 0 },
            repair: { paused: false, requeued: 0, reasons: [] },
            savePointId: null,
            durationMs: 1,
            worktreeDir: value.dir,
          }) as never,
          runMasterBreakageGate: async () => ({
            status: "skipped",
            baselineKind: null,
            baselineSha: null,
            baselineReportPath: null,
            oursReportPath: null,
            changesPath: null,
            breakages: [],
            moved: [],
            reasons: ["no baseline"],
          }),
          closeSchedulerEpochWithEvidence: (() => {}) as never,
          ensureSchedulerEpochFromBoard: (() => ({ epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 }, priorityRefreshes: 0 })) as never,
        },
      });
      input.config.breakageGateEnabled = true;

      const outcome = await runEpochBoundary(input);

      expect(outcome).toMatchObject({ ok: true, paused: false });
      expect(outcome.breakageGate?.status).toBe("skipped");
      expect(value.store.db.query("SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'epoch_regression_pause'").get(value.runId)).toEqual({ count: 0 });
    } finally {
      errorLog.mockRestore();
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
      expect(outcome).toMatchObject({ ok: true, reconciled: true, paused: false });
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
      const reconciledEvent = value.store.db
        .query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_boundary_reconciled'")
        .get(value.runId) as { payload_json: string };
      expect(JSON.parse(reconciledEvent.payload_json)).toEqual({
        epoch: 1,
        epoch_id: value.epochId,
        commit_sha: "retained-commit",
        skipped_steps: [
          "snapshot_commit", "worktree_prepare", "configure", "report_build", "report_read",
          "confirmation_pass", "qa_scan", "report_publish", "regression_repair", "save_point",
          "boundary_sync", "master_breakage_gate", "ci_parity_gate", "pre_commit_gate", "draft_pr_publish",
        ],
        created_by: "run-loop",
      });
    } finally {
      value.store.db.close();
    }
  });

  test("leaves an empty post-boundary epoch active for the normal boundary flow", async () => {
    const value = fixture([]);
    try {
      const outcome = await runEpochBoundary(params(value));

      expect(outcome).toMatchObject({ ok: true, reconciled: false, paused: false });
      expect(value.store.db.query("SELECT status, boundary_status FROM epochs WHERE id = ?").get(outcome.nextEpoch?.epoch.id ?? "")).toEqual({
        status: "active",
        boundary_status: null,
      });
      expect(activeSchedulerEpoch(value.store, value.runId)?.id).toBe(outcome.nextEpoch?.epoch.id);
    } finally {
      value.store.db.close();
    }
  });
});
