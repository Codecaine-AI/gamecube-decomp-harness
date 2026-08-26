import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCycle, getActiveCycle } from "@server/core/cycle";
import { addSavePoint, ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state";
import { admitEpochTargets, createRun, openState, startSchedulerEpoch } from "@server/core/cycle-runtime/run-state";
import { recordDashboardArtifact, type StateStore } from "@server/core/orchestrator-state";
import { scoreTiersProjection } from "./score-tiers.js";

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
      { unit: "main/melee/test", symbol: "ExactFn", sourcePath: "src/test.c", size: 32, fuzzy: 98, priority: 2 },
      { unit: "main/melee/test", symbol: "ImproveFn", sourcePath: "src/test.c", size: 32, fuzzy: 80, priority: 1 },
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
  test("uses anchor/save-point/branch sources and is invariant across run restaging artifacts", () => {
    const { store, repo, runOne, runTwo } = fixture();
    try {
      store.db.query("UPDATE cycles SET active_run_id = ? WHERE cycle_uuid = 'cycle-score-tiers'").run(runOne);
      recordDashboardArtifact(store, {
        runId: runOne, artifactType: "board_snapshot", artifactKey: "initial", payload: { measures: { matched_code_percent: 12 } },
      });
      const before = scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo);
      store.db.query("UPDATE cycles SET active_run_id = ? WHERE cycle_uuid = 'cycle-score-tiers'").run(runTwo);
      recordDashboardArtifact(store, {
        runId: runTwo, artifactType: "board_snapshot", artifactKey: "current", payload: { measures: { matched_code_percent: 99 } },
      });
      const after = scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo);

      expect(after).toEqual(before);
      expect(after.baseline).toMatchObject({ score: 90.8, anchorRevision: expect.any(String), savePointId: "save-baseline" });
      expect(after.confirmed).toMatchObject({ score: 91.08, savePointId: "save-confirmed" });
      expect(after.confirmed.delta).toBeCloseTo(0.28);
      expect(after.confirmed.matches).toEqual([
        { targetKey: "main/melee/test::ExactFn", unit: "main/melee/test", symbol: "ExactFn", score: 100, state: "in_branch" },
      ]);
      expect(after.confirmed.improvements).toEqual([
        { targetKey: "main/melee/test::ImproveFn", unit: "main/melee/test", symbol: "ImproveFn", delta: 6.25, state: "in_branch" },
      ]);
      expect(after.timeline.map((point) => point.kind)).toEqual(["baseline", "epoch_finish"]);
    } finally {
      store.db.close();
    }
  });

  test("projects only open-epoch checkpoints and returns empty tentative when no run is active", () => {
    const { store, repo, runTwo } = fixture();
    try {
      store.db.query("UPDATE runs SET status = 'active' WHERE id = ?").run(runTwo);
      const epoch = startSchedulerEpoch(store, runTwo, { workerPoolSize: 1 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: runTwo,
        workerPoolSize: 1,
        candidates: [{ unit: "main/melee/open", symbol: "OpenWin", sourcePath: "src/open.c", size: 16, fuzzy: 70, priority: 1 }],
      });
      const target = store.db.query("SELECT id FROM epoch_targets WHERE epoch_id = ?").get(epoch.id) as { id: string };
      addCheckpoint(store, {
        id: "open-win-checkpoint", runId: runTwo, epochId: epoch.id, epochTargetId: target.id,
        exact: false, oldScore: 70, newScore: 75, at: "2026-08-26T02:00:00.000Z",
      });
      store.db.query("UPDATE cycles SET active_run_id = ? WHERE cycle_uuid = 'cycle-score-tiers'").run(runTwo);
      expect(scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo).tentative.improvements).toEqual([
        { targetKey: "main/melee/open::OpenWin", unit: "main/melee/open", symbol: "OpenWin", delta: 5, state: "in_branch" },
      ]);

      store.db.query("UPDATE cycles SET active_run_id = NULL WHERE cycle_uuid = 'cycle-score-tiers'").run();
      expect(scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo).tentative).toEqual({
        matches: [], improvements: [],
      });
    } finally {
      store.db.close();
    }
  });

  test("flags a win in upstream after the anchor advances past its integration commit", () => {
    const { store, repo } = fixture();
    try {
      const foldedAnchor = git(repo, "rev-parse", "HEAD~1");
      store.db.query(
        "UPDATE game_upstream_anchors SET upstream_revision = ? WHERE game_id = 'melee'",
      ).run(foldedAnchor);
      const campaign = store.db.query("SELECT id FROM campaigns LIMIT 1").get() as { id: string };
      addTimelineSavePoint(store, campaign.id, {
        id: "save-pr-sync", trigger: "pr_sync", commitSha: foldedAnchor, score: 90.9, at: "2026-08-26T00:40:00.000Z",
      });

      const projection = scoreTiersProjection(store, "melee", getActiveCycle(store.db, "melee"), repo);
      expect(projection.confirmed.matches[0]?.state).toBe("in_upstream");
      expect(projection.confirmed.improvements[0]?.state).toBe("in_branch");
    } finally {
      store.db.close();
    }
  });
});
