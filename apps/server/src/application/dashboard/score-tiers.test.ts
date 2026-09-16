import { getHarnessState, initializeHarnessState, transitionHarnessState, type TransitionHarnessStateInput } from "@server/core/harness-state/state.js";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSavePoint, ensureCampaign } from "@server/core/harness-runtime/phases/pr/state";
import { admitEpochTargets, createRun, openState, startSchedulerEpoch } from "@server/core/harness-runtime/run-state";
import { type StateStore } from "@server/core/orchestrator-state";
import { scoreTiersProjection } from "./score-tiers.js";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function transition(store: StateStore, patch: TransitionHarnessStateInput["patch"], savePointId?: string): void {
  const current = getHarnessState(store.db, "melee")!;
  transitionHarnessState(store.db, {
    gameId: "melee", expectedRevision: current.identity.revision, commandId: `command-${current.identity.revision}`,
    patch,
    ...(savePointId ? { boundary: { eventId: `event-${current.identity.revision}`, kind: "save_point" as const, outcome: "accepted", evidence: { save_point_id: savePointId } } } : {}),
  });
}

function addPoint(
  store: StateStore,
  id: string,
  head: string,
  score: number | null,
  at: string,
  reportPath?: string,
  triggerKind: "init" | "sync" | "epoch_finish" = id === "baseline" ? "init" : "epoch_finish",
): void {
  const campaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
  const point = addSavePoint(store, {
    campaignId: campaign.id, triggerKind, commitSha: head,
    matchedCodePercent: score, reportPath, payload: score === null ? {} : { measures: { matched_code_percent: score } },
  });
  store.db.query("UPDATE save_points SET id = ?, created_at = ? WHERE id = ?").run(id, at, point.id);
}

function fixture() {
  const stateDir = mkdtempSync(join(tmpdir(), "score-tiers-"));
  tempDirs.push(stateDir);
  const store = openState(stateDir);
  initializeHarnessState(store.db, { gameId: "melee", worktree: stateDir, configurationRevision: "config", commandId: "init" });
  addPoint(store, "baseline", "upstream", 90.8, "2026-08-26T00:00:00Z");
  transition(store, { source: { upstream_revision: "upstream" } }, "baseline");
  addPoint(store, "confirmed", "head", 91.08, "2026-08-26T01:00:00Z");
  transition(store, { source: { head: "head" }, readiness: { evidence: "ready" }, history: { save_point_id: "confirmed" } }, "confirmed");
  return store;
}

const fresh = { sourceState: { head: "head", dirty: false } };

function writeReport(path: string, matchedCodePercent: number, functions: Array<{ name: string; score: number }>): void {
  writeFileSync(path, JSON.stringify({
    measures: { matched_code_percent: matchedCodePercent },
    units: [{
      name: "main/test", metadata: { source_path: "src/test.c" },
      functions: functions.map(fn => ({ name: fn.name, size: "40", fuzzy_match_percent: fn.score })),
    }],
  }));
}

function addCheckpoint(
  store: StateStore,
  input: {
    id: string;
    runId: string;
    epochId: string;
    epochTargetId: string;
    exact: boolean;
    oldScore: number;
    newScore: number;
    at: string;
  },
): void {
  store.db.query(
    `INSERT INTO worker_checkpoints (
       id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id,
       attempt_index, validation_time, old_score, new_score, delta, exact_match,
       hard_gates_passed, improved_over_baseline, selectable, selected,
       validation_status, validation_state
     ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 1, 1, 1, 1, 'passed', 'tentative')`,
  ).run(
    input.id,
    `worker-${input.id}`,
    input.runId,
    input.epochId,
    input.epochTargetId,
    `claim-${input.id}`,
    input.at,
    input.oldScore,
    input.newScore,
    input.newScore - input.oldScore,
    input.exact ? 1 : 0,
  );
}

describe("score tiers projection", () => {
  test("compares recorded reports from a run's local accepted base even when the worktree is dirty", async () => {
    const store = fixture();
    try {
      const baselineReport = join(store.stateDir, "local-baseline.json");
      const confirmedReport = join(store.stateDir, "local-confirmed.json");
      writeReport(baselineReport, 39.164, [{ name: "Exact", score: 90 }, { name: "Better", score: 50 }, { name: "Broken", score: 100 }]);
      writeReport(confirmedReport, 39.766, [{ name: "Exact", score: 100 }, { name: "Better", score: 75 }, { name: "Broken", score: 80 }]);
      addPoint(store, "local-base", "local-base-sha", 39.164, "2026-08-26T02:00:00Z", join(store.stateDir, "mutable-report.json"));
      transition(store, { source: { head: "local-base-sha" }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" } }, "local-base");
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee" });
      addPoint(store, "local-base-snapshot", "local-base-sha", 39.164, "2026-08-26T02:30:00Z", baselineReport);
      transition(store, {}, "local-base-snapshot");
      addPoint(store, "local-confirmed", "local-confirmed-sha", 39.766, "2026-08-26T03:00:00Z", confirmedReport);
      transition(store, {
        source: { head: "local-confirmed-sha" }, readiness: { evidence: "ready" },
        history: { run_id: run.id, save_point_id: "local-confirmed" },
      }, "local-confirmed");

      const projection = await scoreTiersProjection(store, "melee", { sourceState: { head: "local-confirmed-sha", dirty: true } });
      expect(projection.baseline).toMatchObject({ score: 39.164, anchorRevision: "local-base-sha", savePointId: "local-base" });
      expect(projection.confirmed).toMatchObject({
        score: null, delta: null, savePointId: "local-confirmed", anchorRevision: "local-base-sha", comparisonStatus: "vs_upstream",
      });
      expect(projection.confirmed.matches.map(entry => entry.symbol)).toEqual(["Exact"]);
      expect(projection.confirmed.improvements.map(entry => entry.symbol)).toEqual(["Better"]);
      expect(projection.confirmed.breakages.map(entry => entry.symbol)).toEqual(["Broken"]);
    } finally { store.db.close(); }
  });

  test("keeps the upstream save point as the baseline for the typical Melee case", async () => {
    const store = fixture();
    try {
      const projection = await scoreTiersProjection(store, "melee", fresh);
      expect(projection.baseline).toEqual({
        score: 90.8, measures: { matched_code_percent: 90.8 }, anchorRevision: "upstream", savePointId: "baseline",
      });
    } finally { store.db.close(); }
  });

  test("sync fallback uses the accepted head at run creation instead of any previously accepted head", async () => {
    const store = fixture();
    try {
      addPoint(store, "stale-sync", "stale-head", 80, "2026-08-26T02:00:00Z", undefined, "sync");
      transition(store, { source: { head: "stale-head" } }, "stale-sync");
      addPoint(store, "accepted-sync", "accepted-head", 81, "2026-08-26T03:00:00Z", undefined, "sync");
      transition(store, { source: { head: "accepted-head" }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" } }, "accepted-sync");
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee" });
      store.db.query("UPDATE runs SET inputs_json = ? WHERE id = ?").run(JSON.stringify({ base_revision: "missing-save-point" }), run.id);
      transition(store, { history: { run_id: run.id } });

      expect((await scoreTiersProjection(store, "melee", fresh)).baseline).toMatchObject({
        savePointId: "accepted-sync", anchorRevision: "accepted-head", score: 81,
      });
    } finally { store.db.close(); }
  });

  test("uses stored boundary evidence without claiming an unproven upstream comparison", async () => {
    const store = fixture();
    try {
      const projection = await scoreTiersProjection(store, "melee", fresh);
      expect(projection.baseline).toMatchObject({ score: 90.8, anchorRevision: "upstream", savePointId: "baseline" });
      expect(projection.confirmed).toEqual({
        score: 91.08, measures: { matched_code_percent: 91.08 }, delta: null,
        savePointId: "confirmed", anchorRevision: "upstream", comparisonStatus: "baseline_unavailable",
        matches: [], improvements: [], breakages: [],
      });
      expect(projection.timeline.map(point => [point.savePointId, point.kind])).toEqual([["baseline", "baseline"], ["confirmed", "epoch_finish"]]);
    } finally { store.db.close(); }
  });

  test("hides confirmed evidence for dirty, unknown, drifted, or pending source state", async () => {
    const store = fixture();
    try {
      for (const sourceState of [undefined, { head: "head", dirty: true }, { head: "head", dirty: null }, { head: "changed", dirty: false }]) {
        const projection = await scoreTiersProjection(store, "melee", { sourceState });
        expect(projection.confirmed.score).toBeNull();
        expect(projection.confirmed.measures).toEqual({});
        expect(projection.timeline[1]?.score).toBe(91.08);
      }
      transition(store, { readiness: { evidence: "pending" } });
      expect((await scoreTiersProjection(store, "melee", fresh)).confirmed.score).toBeNull();
      transition(store, { source: { head: "new-head" }, readiness: { evidence: "ready" } });
      expect((await scoreTiersProjection(store, "melee", { sourceState: { head: "new-head", dirty: false } })).confirmed.score).toBeNull();
    } finally { store.db.close(); }
  });

  test("does not hydrate scoreless evidence from a worktree report or an unrelated save point", async () => {
    const store = fixture();
    try {
      mkdirSync(join(store.stateDir, "build/GALE01"), { recursive: true });
      writeFileSync(join(store.stateDir, "build/GALE01/report.json"), JSON.stringify({ measures: { matched_code_percent: 100 } }));
      addPoint(store, "scoreless", "head", null, "2026-08-26T02:00:00Z");
      transition(store, { history: { save_point_id: "scoreless" } }, "scoreless");
      addPoint(store, "unlinked", "head", 99, "2026-08-26T03:00:00Z");
      const projection = await scoreTiersProjection(store, "melee", fresh);
      expect(projection.confirmed).toMatchObject({ savePointId: "scoreless", score: null, measures: {}, delta: null });
      expect(projection.timeline.map(point => point.savePointId)).toEqual(["baseline", "confirmed", "scoreless"]);
      transition(store, { history: { save_point_id: "unlinked" } });
      expect((await scoreTiersProjection(store, "melee", fresh)).confirmed.savePointId).toBeNull();
    } finally { store.db.close(); }
  });

  test("keeps score evidence stable across run changes and dashboard artifacts", async () => {
    const store = fixture();
    try {
      const before = await scoreTiersProjection(store, "melee", fresh);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee" });
      transition(store, { history: { run_id: run.id } });
      const withRun = await scoreTiersProjection(store, "melee", fresh);
      store.db.query(`INSERT INTO dashboard_artifacts
        (id, run_id, game_id, artifact_type, artifact_key, payload_json, created_at)
        VALUES ('artifact', ?, 'melee', 'board_snapshot', 'current', ?, '2026-08-26T03:00:00Z')`)
        .run(run.id, JSON.stringify({ measures: { matched_code_percent: 99 } }));
      expect(withRun.baseline).not.toEqual(before.baseline);
      expect(await scoreTiersProjection(store, "melee", fresh)).toEqual(withRun);
    } finally { store.db.close(); }
  });

  test("projects selected passing checkpoints only for the harness run's open epoch", async () => {
    const store = fixture();
    try {
      const run = createRun(store, "matched_code_percent", 100, 2, { gameId: "melee" });
      store.db.query("UPDATE runs SET status = 'active' WHERE id = ?").run(run.id);
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 2 });
      admitEpochTargets(store, {
        epochId: epoch.id, runId: run.id, workerPoolSize: 2,
        candidates: [
          { kind: "function", unit: "main/test", symbol: "Exact", sourcePath: "src/test.c", size: 32, fuzzy: 98 },
          { kind: "function", unit: "main/test", symbol: "Better", sourcePath: "src/test.c", size: 32, fuzzy: 70 },
        ],
      });
      const targets = store.db.query("SELECT id, symbol FROM epoch_targets WHERE epoch_id = ?").all(epoch.id) as Array<{ id: string; symbol: string }>;
      for (const target of targets) addCheckpoint(store, {
        id: target.symbol, runId: run.id, epochId: epoch.id, epochTargetId: target.id,
        exact: target.symbol === "Exact", oldScore: target.symbol === "Exact" ? 98 : 70,
        newScore: target.symbol === "Exact" ? 100 : 75, at: "2026-08-26T02:00:00Z",
      });
      transition(store, { history: { run_id: run.id, epoch_id: epoch.id } });
      const tentative = (await scoreTiersProjection(store, "melee", fresh)).tentative;
      expect(tentative.matches).toEqual([{ targetKey: "main/test::Exact", unit: "main/test", symbol: "Exact", score: 100, oldScore: 98, newScore: 100, delta: 2, state: "in_branch" }]);
      expect(tentative.improvements).toEqual([{ targetKey: "main/test::Better", unit: "main/test", symbol: "Better", oldScore: 70, newScore: 75, delta: 5, state: "in_branch" }]);
      store.db.query("UPDATE worker_checkpoints SET hard_gates_passed = 0 WHERE id = 'Exact'").run();
      store.db.query("UPDATE worker_checkpoints SET selected = 0 WHERE id = 'Better'").run();
      expect((await scoreTiersProjection(store, "melee", fresh)).tentative).toEqual({ matches: [], improvements: [] });
      store.db.query("UPDATE worker_checkpoints SET hard_gates_passed = 1, selected = 1").run();
      store.db.query("UPDATE epochs SET status = 'completed' WHERE id = ?").run(epoch.id);
      expect((await scoreTiersProjection(store, "melee", fresh)).tentative).toEqual({ matches: [], improvements: [] });
      store.db.query("UPDATE epochs SET status = 'active' WHERE id = ?").run(epoch.id);
      store.db.query("UPDATE runs SET status = 'completed' WHERE id = ?").run(run.id);
      expect((await scoreTiersProjection(store, "melee", fresh)).tentative).toEqual({ matches: [], improvements: [] });
      transition(store, { history: { run_id: null } });
      expect((await scoreTiersProjection(store, "melee", fresh)).tentative).toEqual({ matches: [], improvements: [] });
    } finally { store.db.close(); }
  });

  test("returns empty evidence when the requested game has no harness", async () => {
    const store = fixture();
    try {
      const projection = await scoreTiersProjection(store, "other", fresh);
      expect(projection.baseline.score).toBeNull();
      expect(projection.confirmed.score).toBeNull();
      expect(projection.timeline).toEqual([]);
      expect(projection.tentative).toEqual({ matches: [], improvements: [] });
    } finally { store.db.close(); }
  });
});
