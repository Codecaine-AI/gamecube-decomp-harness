import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createCycle } from "@server/core/cycle/store.js";
import { recordSavePointAnchor } from "@server/core/cycle/timeline.js";
import { initializeHarnessState } from "@server/core/harness-state";
import { eventsForSubject } from "@server/core/harness-state/events.js";
import { observePrSeriesRemote } from "./observation.js";

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
  createCycle(store.db, {
    actor: "operator",
    baseSha: "cycle-head",
    id: "cycle:cycle-1",
    gameId: "melee",
    cycleUuid: "cycle-1",
  });
  initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
  store.db.query("INSERT INTO campaigns (id, game_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
    .run("legacy", "melee", "origin/master", "2026-08-13T10:00:00.000Z");
  store.db.query(
    `INSERT INTO save_points (
       id, campaign_id, trigger_kind, label, commit_sha, worktree_dirty,
       committed, payload_json, created_at
     ) VALUES ('save-1', 'legacy', 'manual', 'stable', 'cycle-head', 0, 1, '{}', '2026-08-13T10:01:00.000Z')`,
  ).run();
  recordSavePointAnchor(store, {
    actor: "operator",
    commandId: "anchor",
    correlationId: "cycle-1",
    commitSha: "cycle-head",
    gameId: "melee",
    savePointId: "save-1",
    triggerKind: "manual",
  });
  return store;
}

function createPublishedSeries(store: StateStore, campaignId: string, seriesId: string, prNumber: number) {
  const traceId = `trace-${campaignId}`;
  store.db.query(
    `INSERT INTO pr_campaigns (
       campaign_id, game_id, cycle_uuid, revision, status, trace_id,
       caused_by_event_id, blockers_json, created_at, closed_at,
       latest_event_sequence, source_anchor_json, publication_policy_json
     ) VALUES (?, 'melee', 'cycle-1', 0, 'working', ?, ?, '[]', ?, NULL, 0, ?, '{"batch_size":4}')`,
  ).run(
    campaignId,
    traceId,
    `fixture-event-${campaignId}`,
    "2026-08-13T10:00:00.000Z",
    JSON.stringify({ save_point_id: "save-1", source_revision: "cycle-head" }),
  );
  store.db.query(
    `INSERT INTO pr_series (
       series_id, campaign_id, revision, batch_index, status, branch,
       upstream_pr_number, target_units_json, last_validation_json,
       trace_id, caused_by_event_id, blockers_json, updated_at
     ) VALUES (?, ?, 1, 0, 'published', 'codex/split-01-reused', ?, '["src/reused.c"]', NULL, ?, ?, '[]', ?)`,
  ).run(seriesId, campaignId, prNumber, traceId, `fixture-event-${seriesId}`, "2026-08-13T10:00:00.000Z");
  return { campaign_id: campaignId };
}

describe("remote PR observation identity", () => {
  test("a reused branch targets the open campaign series by upstream PR number", () => {
    const store = setup();
    const oldCampaign = createPublishedSeries(store, "campaign-old", "series-old", 2700);
    store.db.query("UPDATE pr_campaigns SET status = 'completed', closed_at = ? WHERE campaign_id = ?")
      .run("2026-08-13T11:00:00.000Z", oldCampaign.campaign_id);
    createPublishedSeries(store, "campaign-open", "series-open", 2850);

    expect(() => observePrSeriesRemote(store, {
      branch: "codex/split-01-reused",
      commandId: "observe-missing-approval-evidence",
      correlationId: "campaign-open",
      reviewDecision: "APPROVED",
      state: "OPEN",
      upstreamPrNumber: 2850,
    })).toThrow("Approved PR observation requires approvalSourceIdentity");

    const result = observePrSeriesRemote(store, {
      approvalSourceIdentity: "github-review:PRR_open",
      approvedRevision: "head-open",
      approvingActor: "octocat",
      branch: "codex/split-01-reused",
      commandId: "observe-open",
      correlationId: "campaign-open",
      reviewDecision: "APPROVED",
      state: "OPEN",
      upstreamPrNumber: 2850,
    });

    expect(result).toMatchObject({ ignored: false, series: { series_id: "series-open", status: "approved" } });
    expect(store.db.query("SELECT status FROM pr_series WHERE series_id = 'series-old'").get()).toEqual({ status: "published" });
    expect(eventsForSubject(store.db, "pr_series", "series-open").at(-1)).toMatchObject({
      actor: "external_observer",
      eventType: "pr.series_approved",
      payload: {
        approval_source_identity: "github-review:PRR_open",
        approved_revision: "head-open",
        approving_actor: "octocat",
        from_status: "published",
        to_status: "approved",
      },
    });
    expect(() => observePrSeriesRemote(store, {
      branch: "codex/split-01-reused",
      commandId: "observe-wrong-campaign",
      correlationId: "campaign-old",
      state: "OPEN",
      upstreamPrNumber: 2850,
    })).toThrow("correlation_id must equal campaign id campaign-open");
  });
});
