import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCycle, getActiveCycle } from "@server/core/cycle";
import { addSavePoint, ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state";
import { admitEpochTargets, createRun, openState, startSchedulerEpoch } from "@server/core/cycle-runtime/run-state";
import { recordDashboardArtifact, type StateStore } from "@server/core/orchestrator-state";
import { scoreTiersProjection } from "./score-tiers.js";
import { classifyMasterBreakages } from "@server/core/cycle-runtime/phases/running/epochs/breakage-gate.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function git(repo: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function commit(repo: string, subject: string): string {
  git(repo, "commit", "--allow-empty", "-q", "-m", subject);
  return git(repo, "rev-parse", "HEAD");
}

function addTimelineSavePoint(
  store: StateStore,
  campaignId: string,
  input: { id: string; trigger: "init" | "epoch_finish" | "pr_sync"; commitSha: string; score: number; at: string },
): void {
  const point = addSavePoint(store, {
    campaignId,
    triggerKind: input.trigger,
    label: input.trigger === "init" ? "prepare baseline" : input.trigger === "pr_sync" ? "PR sync" : "epoch 1 finish",
    commitSha: input.commitSha,
    matchedCodePercent: input.score,
    payload: { measures: { matched_code_percent: input.score, matched_functions_percent: input.score - 1 } },
  });
  store.db.query(
    `INSERT INTO cycle_timeline_entries
       (cycle_uuid, entry_kind, entry_id, occurred_at, payload_json)
     VALUES ('cycle-score-tiers', 'save_point', ?, ?, '{}')`,
  ).run(point.id, input.at);
  store.db.query("UPDATE save_points SET id = ?, created_at = ? WHERE id = ?").run(input.id, input.at, point.id);
  store.db.query("UPDATE cycle_timeline_entries SET entry_id = ? WHERE entry_id = ?").run(input.id, point.id);
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

function fixture(): {
  store: StateStore;
  repo: string;
  runOne: string;
  runTwo: string;
  exactTargetId: string;
  improvementTargetId: string;
} {
  const stateDir = mkdtempSync(join(tmpdir(), "score-tiers-state-"));
  const repo = mkdtempSync(join(tmpdir(), "score-tiers-repo-"));
  tempDirs.push(stateDir, repo);
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "score-tiers@example.com");
  git(repo, "config", "user.name", "score tiers fixture");
  const anchor = commit(repo, "upstream anchor");
  commit(repo, "worker-integration(job-exact): main/melee/test::ExactFn [checkpoint exact123]");
  const confirmed = commit(repo, "worker-integration(job-improve): main/melee/test::ImproveFn [checkpoint improve1]");

  const store = openState(stateDir);
  createCycle(store.db, {
    actor: "operator",
    gameId: "melee",
    cycleUuid: "cycle-score-tiers",
    id: "cycle:score-tiers",
    baseSha: anchor,
  });
  store.db.query(
    `INSERT INTO game_upstream_anchors
       (game_id, cycle_uuid, upstream_revision, sync_id, caused_by_event_id, updated_at)
     VALUES ('melee', 'cycle-score-tiers', ?, 'sync-anchor', 'event-anchor', '2026-08-26T00:00:00.000Z')`,
  ).run(anchor);
  store.db.query("UPDATE cycles SET head_revision = ? WHERE cycle_uuid = 'cycle-score-tiers'").run(confirmed);
  const campaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
  addTimelineSavePoint(store, campaign.id, {
    id: "save-baseline", trigger: "init", commitSha: anchor, score: 90.8, at: "2026-08-26T00:01:00.000Z",
  });
  addTimelineSavePoint(store, campaign.id, {
    id: "save-confirmed", trigger: "epoch_finish", commitSha: confirmed, score: 91.08, at: "2026-08-26T01:00:00.000Z",
  });

  const runOne = createRun(store, "matched_code_percent", 100, 2, { gameId: "melee" }, {
    baseRevision: anchor, cycleUuid: "cycle-score-tiers",
  });
  const epoch = startSchedulerEpoch(store, runOne.id, { workerPoolSize: 2 });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: runOne.id,
    workerPoolSize: 2,
    candidates: [
      { kind: "function", unit: "main/melee/test", symbol: "ExactFn", sourcePath: "src/test.c", size: 32, fuzzy: 98 },
      { kind: "function", unit: "main/melee/test", symbol: "ImproveFn", sourcePath: "src/test.c", size: 32, fuzzy: 80 },
    ],
  });
  const targets = store.db.query(
    "SELECT id, symbol FROM epoch_targets WHERE epoch_id = ? ORDER BY symbol",
  ).all(epoch.id) as Array<{ id: string; symbol: string }>;
  const exactTargetId = targets.find((target) => target.symbol === "ExactFn")!.id;
  const improvementTargetId = targets.find((target) => target.symbol === "ImproveFn")!.id;
  addCheckpoint(store, {
    id: "exact123-fixture", runId: runOne.id, epochId: epoch.id, epochTargetId: exactTargetId,
    exact: true, oldScore: 98, newScore: 100, at: "2026-08-26T00:20:00.000Z",
  });
  addCheckpoint(store, {
    id: "improve1-fixture", runId: runOne.id, epochId: epoch.id, epochTargetId: improvementTargetId,
    exact: false, oldScore: 80, newScore: 86.25, at: "2026-08-26T00:30:00.000Z",
  });
  const runTwo = createRun(store, "matched_code_percent", 100, 2, { gameId: "melee" }, {
    baseRevision: confirmed, cycleUuid: "cycle-score-tiers",
  }).id;
  return { store, repo, runOne: runOne.id, runTwo, exactTargetId, improvementTargetId };
}

describe("score tiers projection", () => {
  test("uses anchor/save-point sources and is invariant across run restaging artifacts", async () => {
    const { store, repo, runOne, runTwo } = fixture();
    try {
      store.db.query("UPDATE cycles SET active_run_id = ? WHERE cycle_uuid = 'cycle-score-tiers'").run(runOne);
      recordDashboardArtifact(store, {
        runId: runOne, artifactType: "board_snapshot", artifactKey: "initial", payload: { measures: { matched_code_percent: 12 } },
      });
      const before = await scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo);
      store.db.query("UPDATE cycles SET active_run_id = ? WHERE cycle_uuid = 'cycle-score-tiers'").run(runTwo);
      recordDashboardArtifact(store, {
        runId: runTwo, artifactType: "board_snapshot", artifactKey: "current", payload: { measures: { matched_code_percent: 99 } },
      });
      const after = await scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo);

      expect(after).toEqual(before);
      expect(after.baseline).toMatchObject({ score: 90.8, anchorRevision: expect.any(String), savePointId: "save-baseline" });
      expect(after.confirmed).toMatchObject({ score: 91.08, savePointId: "save-confirmed" });
      expect(after.confirmed.delta).toBeCloseTo(0.28);
      expect(after.confirmed).toMatchObject({ comparisonStatus: "baseline_unavailable", matches: [], improvements: [], breakages: [] });
      expect(after.timeline.map((point) => point.kind)).toEqual(["baseline", "epoch_finish"]);
    } finally {
      store.db.close();
    }
  });

  test("projects only open-epoch checkpoints and returns empty tentative when no run is active", async () => {
    const { store, repo, runTwo } = fixture();
    try {
      store.db.query("UPDATE runs SET status = 'active' WHERE id = ?").run(runTwo);
      const epoch = startSchedulerEpoch(store, runTwo, { workerPoolSize: 1 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: runTwo,
        workerPoolSize: 1,
        candidates: [{ kind: "function", unit: "main/melee/open", symbol: "OpenWin", sourcePath: "src/open.c", size: 16, fuzzy: 70 }],
      });
      const target = store.db.query("SELECT id FROM epoch_targets WHERE epoch_id = ?").get(epoch.id) as { id: string };
      addCheckpoint(store, {
        id: "open-win-checkpoint", runId: runTwo, epochId: epoch.id, epochTargetId: target.id,
        exact: false, oldScore: 70, newScore: 75, at: "2026-08-26T02:00:00.000Z",
      });
      store.db.query("UPDATE cycles SET active_run_id = ? WHERE cycle_uuid = 'cycle-score-tiers'").run(runTwo);
      expect((await scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo)).tentative.improvements).toEqual([
        { targetKey: "main/melee/open::OpenWin", unit: "main/melee/open", symbol: "OpenWin", oldScore: 70, newScore: 75, delta: 5, state: "in_branch" },
      ]);

      store.db.query("UPDATE cycles SET active_run_id = NULL WHERE cycle_uuid = 'cycle-score-tiers'").run();
      expect((await scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo)).tentative).toEqual({
        matches: [], improvements: [],
      });
    } finally {
      store.db.close();
    }
  });

  test("projects ours vs master matches, improvements, and non-moved breakages", async () => {
    const { store, repo } = fixture();
    try {
      const oursPath = join(repo, "ours-report.json");
      const masterPath = join(repo, "master-report.json");
      const changesPath = join(repo, "master-breakage-changes.json");
      const row = (name: string, from: number, to: number, size = 100) => ({
        name, from: { fuzzy_match_percent: from, size }, to: { fuzzy_match_percent: to, size },
      });
      const changes = {
        units: [{
          name: "main/melee/test",
          sections: [row(".data", 80, 100, 20), row(".bss", 40, 60, 10)],
          functions: [row("NewExact", 90, 100), row("Better", 50, 75), row("Broken", 100, 80), row("Moved", 100, 0)],
        }],
      };
      const ours = { units: [
        { name: "main/melee/test", functions: [{ name: "NewExact", fuzzy_match_percent: 100 }, { name: "Better", fuzzy_match_percent: 75 }, { name: "Broken", fuzzy_match_percent: 80 }] },
        { name: "main/melee/moved", functions: [{ name: "Moved", fuzzy_match_percent: 100 }] },
      ] };
      writeFileSync(masterPath, JSON.stringify({ units: [] }));
      writeFileSync(oursPath, JSON.stringify(ours));
      writeFileSync(changesPath, JSON.stringify(changes));
      store.db.query("UPDATE save_points SET report_path = ? WHERE id = 'save-confirmed'").run(oursPath);
      const classified = classifyMasterBreakages(changes, ours);
      const projection = await scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo, {
        runMasterBreakageGate: async () => ({
          status: "breakage", baselineKind: "upstream_ci", baselineSha: "anchor", baselineReportPath: masterPath,
          oursReportPath: oursPath, changesPath, breakages: classified.breakages, moved: classified.moved, reasons: [],
        }),
      });
      expect(projection.confirmed.comparisonStatus).toBe("vs_upstream");
      expect(projection.confirmed.matches.map((item) => [item.symbol, item.oldScore, item.newScore, item.bytesDelta])).toEqual([
        ["NewExact", 90, 100, 10], [".data", 80, 100, 4],
      ]);
      expect(projection.confirmed.improvements.map((item) => [item.symbol, item.oldScore, item.newScore, item.bytesDelta])).toEqual([
        ["Better", 50, 75, 25], [".bss", 40, 60, 2],
      ]);
      expect(projection.confirmed.breakages.map((item) => [item.symbol, item.oldScore, item.newScore, item.bytesDelta])).toEqual([
        ["Broken", 100, 80, -20],
      ]);
      expect(classified.moved.map((item) => item.itemName)).toEqual(["Moved"]);
    } finally {
      store.db.close();
    }
  });
});
