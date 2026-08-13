import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { prCampaignMigration } from "@server/core/orchestrator-state/storage/migrations/014-pr-campaign.js";
import { createProjectSession } from "@server/core/project-session/store.js";
import { recordSavePointAnchor, recordSavePointFailure } from "@server/core/project-session/timeline.js";
import { eventsForSubject } from "@server/core/project-state/events.js";
import {
  PR_CAMPAIGN_STATUSES,
  PR_DERIVED_STATUS_EVENT_TYPES,
  PR_EVENT_TYPES,
  PR_LIFECYCLE_EVENT_TYPES,
  PR_SERIES_STATUSES,
  PR_WORK_ITEM_STATUSES,
  StalePrSeriesRevisionError,
  isPrCampaignStatusTransitionAllowed,
  isPrSeriesStatusTransitionAllowed,
  openPrCampaign,
  transitionPrCampaign,
  transitionPrSeries,
  type PrCampaignStatus,
  type PrSeriesStatus,
} from "./index.js";

const tempDirs: string[] = [];
const stores: StateStore[] = [];

interface FixtureOptions {
  label?: string | null;
  savePointCommit?: string;
  worktreeDirty?: boolean;
}

function fixture(options: FixtureOptions = {}): StateStore {
  const directory = mkdtempSync(join(tmpdir(), "pr-campaign-state-"));
  tempDirs.push(directory);
  const store = openState(directory);
  stores.push(store);
  prCampaignMigration.up(store.db);
  createProjectSession(store.db, {
    baseSha: "session-head",
    id: "project-session:session-1",
    projectId: "melee",
    sessionUuid: "session-1",
  });
  store.db
    .query("INSERT INTO campaigns (id, project_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
    .run("legacy-campaign", "melee", "origin/master", "2026-08-13T10:00:00.000Z");
  const savePointCommit = options.savePointCommit ?? "session-head";
  store.db
    .query(
      `INSERT INTO save_points (
         id, campaign_id, trigger_kind, label, commit_sha,
         worktree_dirty, committed, payload_json, created_at
       ) VALUES ('save-point-1', 'legacy-campaign', 'manual', ?, ?, ?, 1, '{}', ?)`,
    )
    .run(
      options.label === undefined ? "stable split anchor" : options.label,
      savePointCommit,
      options.worktreeDirty ? 1 : 0,
      "2026-08-13T10:01:00.000Z",
    );
  recordSavePointAnchor(store, {
    actor: "operator",
    commandId: "command-record-anchor",
    commitSha: savePointCommit,
    occurredAt: "2026-08-13T10:01:00.000Z",
    projectId: "melee",
    savePointId: "save-point-1",
    triggerKind: "manual",
  });
  return store;
}

function openCampaign(store: StateStore, campaignId = "pr-campaign-1") {
  return openPrCampaign(store, {
    actor: "operator",
    campaignId,
    commandId: `command-open-${campaignId}`,
    namedSavePointId: "save-point-1",
    occurredAt: "2026-08-13T10:02:00.000Z",
    projectId: "melee",
    publicationPolicy: { batch_size: 4 },
    series: [
      {
        batchIndex: 0,
        branch: "codex/split-01-alpha",
        seriesId: "series-1",
        targetUnits: ["src/alpha.c"],
      },
      {
        batchIndex: 0,
        branch: "codex/split-02-beta",
        seriesId: "series-2",
        targetUnits: ["src/beta.c"],
      },
    ],
    sessionUuid: "session-1",
  });
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("PR campaign and series state", () => {
  test("exports exactly the contract vocabularies", () => {
    expect(PR_CAMPAIGN_STATUSES).toEqual(["preparing", "in_review", "working", "completed", "abandoned"]);
    expect(PR_SERIES_STATUSES).toEqual([
      "prepared",
      "published",
      "changes_requested",
      "revising",
      "approved",
      "merged",
      "closed",
    ]);
    expect(PR_WORK_ITEM_STATUSES).toEqual(["pending", "in_progress", "resolved", "declined"]);
    expect(PR_LIFECYCLE_EVENT_TYPES).toEqual([
      "pr.campaign_opened",
      "pr.batch_published",
      "pr.series_published",
      "pr.feedback_ingested",
      "pr.series_revised",
      "pr.series_merged",
      "pr.series_closed",
      "pr.campaign_recovered",
      "pr.campaign_closed",
    ]);
    expect(PR_DERIVED_STATUS_EVENT_TYPES).toEqual([
      "pr.campaign_in_review",
      "pr.campaign_working",
      "pr.series_prepared",
      "pr.series_changes_requested",
      "pr.series_revising",
      "pr.series_approved",
    ]);
    expect(PR_EVENT_TYPES).toEqual([...PR_LIFECYCLE_EVENT_TYPES, ...PR_DERIVED_STATUS_EVENT_TYPES]);
  });

  test("enforces the documented campaign and series status graphs", () => {
    const campaignAllowed: Readonly<Record<PrCampaignStatus, readonly PrCampaignStatus[]>> = {
      preparing: ["working", "completed", "abandoned"],
      in_review: ["working", "completed", "abandoned"],
      working: ["in_review", "completed", "abandoned"],
      completed: [],
      abandoned: [],
    };
    const seriesAllowed: Readonly<Record<PrSeriesStatus, readonly PrSeriesStatus[]>> = {
      prepared: ["published", "closed"],
      published: ["changes_requested", "approved", "merged", "closed"],
      changes_requested: ["revising", "approved", "merged", "closed"],
      revising: ["published", "changes_requested", "approved", "merged", "closed"],
      approved: ["changes_requested", "merged", "closed"],
      merged: [],
      closed: [],
    };
    for (const current of PR_CAMPAIGN_STATUSES) {
      for (const next of PR_CAMPAIGN_STATUSES) {
        expect(isPrCampaignStatusTransitionAllowed(current, next)).toBe(campaignAllowed[current].includes(next));
      }
    }
    for (const current of PR_SERIES_STATUSES) {
      for (const next of PR_SERIES_STATUSES) {
        expect(isPrSeriesStatusTransitionAllowed(current, next)).toBe(seriesAllowed[current].includes(next));
      }
    }
  });

  test("opens only on a named fresh anchor and records one event per created state object", () => {
    const store = fixture();
    const campaign = openCampaign(store);

    expect(campaign).toMatchObject({
      campaign_id: "pr-campaign-1",
      project_id: "melee",
      session_uuid: "session-1",
      revision: 0,
      status: "preparing",
      source_anchor: { save_point_id: "save-point-1", source_revision: "session-head" },
      publication_policy: { batch_size: 4 },
      series_ids: ["series-1", "series-2"],
    });
    const campaignEvents = eventsForSubject(store.db, "pr_campaign", campaign.campaign_id);
    expect(campaignEvents).toHaveLength(1);
    expect(campaignEvents[0]).toMatchObject({
      eventType: "pr.campaign_opened",
      subjectId: campaign.campaign_id,
      correlationId: campaign.campaign_id,
      payload: {
        source_anchor: { save_point_id: "save-point-1", source_revision: "session-head" },
        series_count: 2,
        publication_batch_size: 4,
      },
    });
    expect(campaign.caused_by_event_id).toBe(campaignEvents[0]!.eventId);
    expect(campaign.latest_event_sequence).toBe(campaignEvents[0]!.sequence);
    for (const seriesId of campaign.series_ids) {
      const events = eventsForSubject(store.db, "pr_series", seriesId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "pr.series_prepared",
        subjectId: seriesId,
        correlationId: campaign.campaign_id,
      });
    }
    expect(() => openCampaign(store, "pr-campaign-2")).toThrow("already has an open PR campaign");
  });

  test("rejects drifted, unnamed, dirty, and capture-failed save-point evidence without a campaign event", () => {
    const drifted = fixture({ savePointCommit: "older-head" });
    expect(() => openCampaign(drifted)).toThrow("Latest save point is not a clean anchor at the current head");
    expect(eventsForSubject(drifted.db, "pr_campaign", "pr-campaign-1")).toHaveLength(0);

    const unnamed = fixture({ label: null });
    expect(() => openCampaign(unnamed)).toThrow("A named save point at the current head is required");
    expect(eventsForSubject(unnamed.db, "pr_campaign", "pr-campaign-1")).toHaveLength(0);

    const dirty = fixture({ worktreeDirty: true });
    expect(() => openCampaign(dirty)).toThrow("Latest save point is not a clean anchor at the current head");
    expect(eventsForSubject(dirty.db, "pr_campaign", "pr-campaign-1")).toHaveLength(0);

    const dirtyAfterClean = fixture();
    dirtyAfterClean.db
      .query(
        `INSERT INTO save_points (
           id, campaign_id, trigger_kind, label, commit_sha,
           worktree_dirty, committed, payload_json, created_at
         ) VALUES ('save-point-dirty-latest', 'legacy-campaign', 'manual', 'dirty latest',
                   'session-head', 1, 1, '{}', '2026-08-13T10:01:30.000Z')`,
      )
      .run();
    recordSavePointAnchor(dirtyAfterClean, {
      actor: "operator",
      commandId: "command-record-dirty-latest",
      commitSha: "session-head",
      occurredAt: "2026-08-13T10:01:30.000Z",
      projectId: "melee",
      savePointId: "save-point-dirty-latest",
      triggerKind: "manual",
    });
    expect(() => openCampaign(dirtyAfterClean)).toThrow("Latest save point is not a clean anchor at the current head");
    expect(eventsForSubject(dirtyAfterClean.db, "pr_campaign", "pr-campaign-1")).toHaveLength(0);

    const failed = fixture();
    recordSavePointFailure(failed, {
      actor: "operator",
      commandId: "command-save-point-failed",
      message: "capture failed",
      occurredAt: "2026-08-13T10:01:30.000Z",
      projectId: "melee",
      sourceId: "manual",
      sourceKind: "save_point_boundary",
      triggerKind: "manual",
    });
    expect(() => openCampaign(failed)).toThrow("save-point evidence is stale");
    expect(eventsForSubject(failed.db, "pr_campaign", "pr-campaign-1")).toHaveLength(0);
  });

  test("campaign and series CAS transitions each append exactly one correlated event", () => {
    const store = fixture();
    let campaign = openCampaign(store);
    const campaignEventCount = eventsForSubject(store.db, "pr_campaign", campaign.campaign_id).length;
    campaign = transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-activate-campaign",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const campaignEvents = eventsForSubject(store.db, "pr_campaign", campaign.campaign_id);
    expect(campaignEvents).toHaveLength(campaignEventCount + 1);
    expect(campaignEvents.at(-1)).toMatchObject({
      eventType: "pr.campaign_working",
      correlationId: campaign.campaign_id,
      payload: { previous_status: "preparing", status: "working" },
    });
    expect(campaign).toMatchObject({ revision: 1, status: "working" });
    expect(campaign.caused_by_event_id).toBe(campaignEvents.at(-1)!.eventId);

    const initialSeries = store.db.query("SELECT revision FROM pr_series WHERE series_id = 'series-1'").get() as { revision: number };
    const series = transitionPrSeries(store, "series-1", {
      actor: "operator",
      commandId: "command-publish-series-1",
      expectedRevision: initialSeries.revision,
      patch: { status: "published", upstreamPrNumber: 2850 },
      payload: { upstream_pr_number: 2850, branch: "codex/split-01-alpha", batch_index: 0 },
    });
    const seriesEvents = eventsForSubject(store.db, "pr_series", "series-1");
    expect(seriesEvents).toHaveLength(2);
    expect(seriesEvents.at(-1)).toMatchObject({
      eventType: "pr.series_published",
      subjectId: "series-1",
      correlationId: campaign.campaign_id,
    });
    expect(series).toMatchObject({ revision: 1, status: "published", upstream_pr_number: 2850 });
    expect(series.caused_by_event_id).toBe(seriesEvents.at(-1)!.eventId);
  });

  test("rejects stale CAS and rolls back an event when the envelope write fails", () => {
    const store = fixture();
    const campaign = openCampaign(store);
    transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-activate-campaign",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const published = transitionPrSeries(store, "series-1", {
      actor: "operator",
      commandId: "command-publish-series-1",
      expectedRevision: 0,
      patch: { status: "published", upstreamPrNumber: 2850 },
      payload: { upstream_pr_number: 2850, branch: "codex/split-01-alpha", batch_index: 0 },
    });
    const beforeStale = eventsForSubject(store.db, "pr_series", "series-1").length;
    expect(() =>
      transitionPrSeries(store, "series-1", {
        actor: "external_observer",
        commandId: "command-stale-approval",
        expectedRevision: 0,
        patch: { status: "approved" },
      }),
    ).toThrow(StalePrSeriesRevisionError);
    expect(eventsForSubject(store.db, "pr_series", "series-1")).toHaveLength(beforeStale);

    store.db.exec(`CREATE TRIGGER reject_pr_series_transition
      BEFORE UPDATE ON pr_series
      BEGIN SELECT RAISE(ABORT, 'reject PR series transition'); END`);
    expect(() =>
      transitionPrSeries(store, "series-1", {
        actor: "external_observer",
        commandId: "command-approve-series",
        expectedRevision: published.revision,
        patch: { status: "approved" },
      }),
    ).toThrow("reject PR series transition");
    expect(eventsForSubject(store.db, "pr_series", "series-1")).toHaveLength(beforeStale);
    expect(store.db.query("SELECT revision, status FROM pr_series WHERE series_id = 'series-1'").get()).toEqual({
      revision: published.revision,
      status: "published",
    });
  });
});
