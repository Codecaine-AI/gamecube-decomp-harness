import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createProjectSession } from "@server/core/project-session/store.js";
import { recordSavePointAnchor } from "@server/core/project-session/timeline.js";
import { initializeProjectState } from "@server/core/project-state";
import { observePrSeriesRemote } from "./observation.js";
import { openPrCampaign, transitionPrCampaign, transitionPrSeries } from "./state.js";

const stores: StateStore[] = [];
const directories: string[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup(): StateStore {
  const directory = mkdtempSync(join(tmpdir(), "pr-observation-"));
  directories.push(directory);
  const store = openState(directory);
  stores.push(store);
  createProjectSession(store.db, {
    baseSha: "session-head",
    id: "project-session:session-1",
    projectId: "melee",
    sessionUuid: "session-1",
  });
  initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
  store.db.query("INSERT INTO campaigns (id, project_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
    .run("legacy", "melee", "origin/master", "2026-08-13T10:00:00.000Z");
  store.db.query(
    `INSERT INTO save_points (
       id, campaign_id, trigger_kind, label, commit_sha, worktree_dirty,
       committed, payload_json, created_at
     ) VALUES ('save-1', 'legacy', 'manual', 'stable', 'session-head', 0, 1, '{}', '2026-08-13T10:01:00.000Z')`,
  ).run();
  recordSavePointAnchor(store, {
    actor: "operator",
    commandId: "anchor",
    commitSha: "session-head",
    projectId: "melee",
    savePointId: "save-1",
    triggerKind: "manual",
  });
  return store;
}

function createPublishedSeries(store: StateStore, campaignId: string, seriesId: string, prNumber: number) {
  let campaign = openPrCampaign(store, {
    actor: "operator",
    campaignId,
    commandId: `open-${campaignId}`,
    namedSavePointId: "save-1",
    projectId: "melee",
    series: [{ batchIndex: 0, branch: "codex/split-01-reused", seriesId, targetUnits: ["src/reused.c"] }],
    sessionUuid: "session-1",
  });
  campaign = transitionPrCampaign(store, campaignId, {
    actor: "operator",
    commandId: `working-${campaignId}`,
    expectedRevision: campaign.revision,
    patch: { status: "working" },
  });
  transitionPrSeries(store, seriesId, {
    actor: "operator",
    commandId: `publish-${seriesId}`,
    expectedRevision: 0,
    patch: { status: "published", upstreamPrNumber: prNumber },
    payload: { upstream_pr_number: prNumber, branch: "codex/split-01-reused", batch_index: 0 },
  });
  return campaign;
}

describe("remote PR observation identity", () => {
  test("a reused branch targets the open campaign series by upstream PR number", () => {
    const store = setup();
    const oldCampaign = createPublishedSeries(store, "campaign-old", "series-old", 2700);
    store.db.query("UPDATE pr_campaigns SET status = 'completed', closed_at = ? WHERE campaign_id = ?")
      .run("2026-08-13T11:00:00.000Z", oldCampaign.campaign_id);
    createPublishedSeries(store, "campaign-open", "series-open", 2850);

    const result = observePrSeriesRemote(store, {
      branch: "codex/split-01-reused",
      commandId: "observe-open",
      reviewDecision: "APPROVED",
      state: "OPEN",
      upstreamPrNumber: 2850,
    });

    expect(result).toMatchObject({ ignored: false, series: { series_id: "series-open", status: "approved" } });
    expect(store.db.query("SELECT status FROM pr_series WHERE series_id = 'series-old'").get()).toEqual({ status: "published" });
  });
});
