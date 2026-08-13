import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { prCampaignMigration } from "@server/core/orchestrator-state/storage/migrations/014-pr-campaign.js";
import { createProjectSession } from "@server/core/project-session/store.js";
import { recordSavePointAnchor } from "@server/core/project-session/timeline.js";
import { eventsForSubject, listProjectEvents } from "@server/core/project-state/events.js";
import { getProjectState, initializeProjectState } from "@server/core/project-state/lease.js";
import {
  StalePrSeriesRevisionError,
  assertPrWorkItemStatusTransition,
  getPrCampaign,
  ingestPrFeedback,
  observePrSeriesRemote,
  isPrWorkItemStatusTransitionAllowed,
  openPrCampaign,
  transitionPrCampaign,
  transitionPrWorkItems,
  transitionPrSeries,
} from "./index.js";

const tempDirs: string[] = [];
const stores: StateStore[] = [];

function setup(): StateStore {
  const directory = mkdtempSync(join(tmpdir(), "pr-work-items-"));
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
  initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
  store.db
    .query("INSERT INTO campaigns (id, project_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
    .run("legacy-campaign", "melee", "origin/master", "2026-08-13T10:00:00.000Z");
  store.db
    .query(
      `INSERT INTO save_points (
         id, campaign_id, trigger_kind, label, commit_sha,
         worktree_dirty, committed, payload_json, created_at
       ) VALUES ('save-point-1', 'legacy-campaign', 'manual', 'stable anchor',
                 'session-head', 0, 1, '{}', '2026-08-13T10:01:00.000Z')`,
    )
    .run();
  recordSavePointAnchor(store, {
    actor: "operator",
    commandId: "command-record-anchor",
    commitSha: "session-head",
    occurredAt: "2026-08-13T10:01:00.000Z",
    projectId: "melee",
    savePointId: "save-point-1",
    triggerKind: "manual",
  });
  let campaign = openPrCampaign(store, {
    actor: "operator",
    campaignId: "pr-campaign-1",
    commandId: "command-open-campaign",
    namedSavePointId: "save-point-1",
    projectId: "melee",
    series: [{
      batchIndex: 0,
      branch: "codex/split-01-alpha",
      seriesId: "series-1",
      targetUnits: ["src/alpha.c"],
    }],
    sessionUuid: "session-1",
  });
  campaign = transitionPrCampaign(store, campaign.campaign_id, {
    actor: "operator",
    commandId: "command-activate-campaign",
    expectedRevision: campaign.revision,
    patch: { status: "working" },
  });
  transitionPrSeries(store, "series-1", {
    actor: "operator",
    commandId: "command-publish-series",
    expectedRevision: 0,
    patch: { status: "published", upstreamPrNumber: 2850 },
    payload: { upstream_pr_number: 2850, branch: "codex/split-01-alpha", batch_index: 0 },
  });
  transitionPrCampaign(store, campaign.campaign_id, {
    actor: "operator",
    commandId: "command-release-campaign",
    expectedRevision: campaign.revision,
    patch: { status: "in_review" },
  });
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("PR feedback ingestion", () => {
  test.each([
    ["CHANGES_REQUESTED", "OPEN", "changes_requested", "pr.feedback_ingested"],
    ["APPROVED", "OPEN", "approved", "pr.series_approved"],
    ["", "MERGED", "merged", "pr.series_merged"],
    ["", "CLOSED", "closed", "pr.series_closed"],
  ] as const)("maps remote %s/%s observation to %s", (reviewDecision, state, status, eventType) => {
    const store = setup();
    const result = observePrSeriesRemote(store, {
      branch: "codex/split-01-alpha",
      commandId: `observe-${status}`,
      mergedUpstreamRevision: "merge-sha",
      occurredAt: "2026-08-13T12:00:00.000Z",
      reviewDecision,
      state,
      upstreamPrNumber: 2850,
    });

    expect(result).toMatchObject({ ignored: false, series: { status } });
    expect(eventsForSubject(store.db, "pr_series", "series-1").at(-1)).toMatchObject({
      actor: "external_observer",
      eventType,
      subjectId: "series-1",
    });
  });

  test("ignores remote observations for branches without a campaign series", () => {
    const store = setup();
    const before = listProjectEvents(store.db, { projectId: "melee" }).length;
    expect(observePrSeriesRemote(store, {
      branch: "codex/split-99-unknown",
      commandId: "observe-unknown",
      reviewDecision: "APPROVED",
      state: "OPEN",
      upstreamPrNumber: 9999,
    })).toEqual({ feedbackItemIds: [], ignored: true, series: null });
    expect(listProjectEvents(store.db, { projectId: "melee" })).toHaveLength(before);
  });

  test("remote feedback creates pending work immediately without changing the lease", () => {
    const store = setup();
    const projectBefore = getProjectState(store, "melee");
    const result = observePrSeriesRemote(store, {
      branch: "codex/split-01-alpha",
      commandId: "observe-feedback",
      feedback: [{ sourceKind: "issue_comment", sourceId: "IC_123", summary: "Please use the project typedef." }],
      reviewDecision: "CHANGES_REQUESTED",
      state: "OPEN",
      upstreamPrNumber: 2850,
    });

    expect(result.series).toMatchObject({
      status: "changes_requested",
      work_items: [{ source_id: "IC_123", status: "pending", summary: "Please use the project typedef." }],
    });
    expect(result.feedbackItemIds).toHaveLength(1);
    expect(getProjectState(store, "melee")).toEqual(projectBefore);
    expect(eventsForSubject(store.db, "pr_series", "series-1").at(-1)).toMatchObject({
      actor: "external_observer",
      eventType: "pr.feedback_ingested",
    });
  });

  test("enforces the work-item status graph", () => {
    expect(isPrWorkItemStatusTransitionAllowed("pending", "in_progress")).toBe(true);
    expect(isPrWorkItemStatusTransitionAllowed("pending", "declined")).toBe(true);
    expect(isPrWorkItemStatusTransitionAllowed("in_progress", "pending")).toBe(true);
    expect(isPrWorkItemStatusTransitionAllowed("in_progress", "resolved")).toBe(true);
    expect(isPrWorkItemStatusTransitionAllowed("in_progress", "declined")).toBe(true);
    expect(isPrWorkItemStatusTransitionAllowed("resolved", "pending")).toBe(false);
    expect(isPrWorkItemStatusTransitionAllowed("declined", "in_progress")).toBe(false);
    expect(() => assertPrWorkItemStatusTransition("pending", "resolved")).toThrow(
      "Invalid PR work-item status transition pending -> resolved",
    );
  });

  test("ingests feedback as pending work with one per-series event and never touches the lease", () => {
    const store = setup();
    const projectBefore = getProjectState(store, "melee");
    const before = eventsForSubject(store.db, "pr_series", "series-1").length;

    const result = ingestPrFeedback(store, {
      commandId: "observation-review-19442",
      expectedRevision: 1,
      items: [{
        itemId: "work-item-77",
        sourceKind: "review_comment",
        sourceId: "review-comment-19442",
        summary: "Declaration style rejected by upstream lint",
      }],
      occurredAt: "2026-08-13T12:00:00.000Z",
      seriesId: "series-1",
    });

    expect(result).toMatchObject({
      acceptedItemIds: ["work-item-77"],
      duplicateItemIds: [],
      series: {
        revision: 2,
        status: "changes_requested",
        work_items: [{
          item_id: "work-item-77",
          source_kind: "review_comment",
          source_id: "review-comment-19442",
          status: "pending",
        }],
      },
    });
    const events = eventsForSubject(store.db, "pr_series", "series-1");
    expect(events).toHaveLength(before + 1);
    expect(events.at(-1)).toMatchObject({
      actor: "external_observer",
      correlationId: "pr-campaign-1",
      eventType: "pr.feedback_ingested",
      subjectId: "series-1",
      payload: {
        work_item_ids: ["work-item-77"],
        review_source_identities: ["review_comment:review-comment-19442"],
        ingesting_actor: "external_observer",
        previous_status: "published",
        status: "changes_requested",
      },
    });
    expect(getProjectState(store, "melee")).toEqual(projectBefore);
    expect(listProjectEvents(store.db, { projectId: "melee" }).filter((event) => event.eventType.startsWith("project.dispatch_"))).toEqual([]);
  });

  test("is retry-safe by item id and review-source identity without creating a revision", () => {
    const store = setup();
    const first = ingestPrFeedback(store, {
      commandId: "observation-review-1",
      expectedRevision: 1,
      items: [{ itemId: "item-1", sourceKind: "review", sourceId: "comment-1", summary: "First" }],
      seriesId: "series-1",
    });
    const eventCount = eventsForSubject(store.db, "pr_series", "series-1").length;
    const retry = ingestPrFeedback(store, {
      commandId: "observation-review-retry",
      expectedRevision: first.series.revision,
      items: [{ itemId: "item-1", sourceKind: "review", sourceId: "comment-1", summary: "First" }],
      seriesId: "series-1",
    });
    expect(retry).toMatchObject({
      acceptedItemIds: [],
      duplicateItemIds: ["item-1"],
      series: { revision: first.series.revision, status: "changes_requested" },
    });
    expect(eventsForSubject(store.db, "pr_series", "series-1")).toHaveLength(eventCount);

    const sameSource = ingestPrFeedback(store, {
      commandId: "observation-review-same-source",
      expectedRevision: first.series.revision,
      items: [{ itemId: "different-id", sourceKind: "review", sourceId: "comment-1", summary: "Updated rendering" }],
      seriesId: "series-1",
    });
    expect(sameSource).toMatchObject({ acceptedItemIds: [], duplicateItemIds: ["item-1"] });
    expect(eventsForSubject(store.db, "pr_series", "series-1")).toHaveLength(eventCount);
  });

  test("rejects stale ingestion before inserting work or appending an event", () => {
    const store = setup();
    const eventCount = eventsForSubject(store.db, "pr_series", "series-1").length;
    expect(() =>
      ingestPrFeedback(store, {
        commandId: "observation-stale",
        expectedRevision: 0,
        items: [{ itemId: "stale-item", sourceKind: "review", sourceId: "stale", summary: "Stale" }],
        seriesId: "series-1",
      }),
    ).toThrow(StalePrSeriesRevisionError);
    expect(store.db.query("SELECT * FROM pr_work_items WHERE item_id = 'stale-item'").get()).toBeNull();
    expect(eventsForSubject(store.db, "pr_series", "series-1")).toHaveLength(eventCount);
  });

  test("advances pending work through fixer ownership and revision under series CAS events", () => {
    const store = setup();
    const feedback = ingestPrFeedback(store, {
      commandId: "observation-review-fix",
      expectedRevision: 1,
      items: [{ itemId: "item-fix", sourceKind: "review", sourceId: "comment-fix", summary: "Fix this" }],
      seriesId: "series-1",
    });
    const campaign = getPrCampaign(store, "pr-campaign-1");
    if (!campaign) throw new Error("campaign missing from fixture");
    transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-reactivate-campaign",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });

    const revising = transitionPrWorkItems(store, {
      actor: "agent",
      commandId: "command-start-fix",
      expectedRevision: feedback.series.revision,
      patch: { status: "revising" },
      seriesId: "series-1",
      workItems: [{ itemId: "item-fix", expectedStatus: "pending", status: "in_progress" }],
    });
    expect(revising).toMatchObject({
      revision: feedback.series.revision + 1,
      status: "revising",
      work_items: [{ item_id: "item-fix", status: "in_progress", resolved_at: null }],
    });

    const revised = transitionPrWorkItems(store, {
      actor: "agent",
      commandId: "command-finish-fix",
      eventType: "pr.series_revised",
      expectedRevision: revising.revision,
      occurredAt: "2026-08-13T13:00:00.000Z",
      patch: { status: "published" },
      payload: { resolved_work_item_ids: ["item-fix"], pushed_revision: "revision-after-fix" },
      seriesId: "series-1",
      workItems: [{ itemId: "item-fix", expectedStatus: "in_progress", status: "resolved" }],
    });
    expect(revised).toMatchObject({
      revision: revising.revision + 1,
      status: "published",
      work_items: [{
        item_id: "item-fix",
        status: "resolved",
        resolved_at: "2026-08-13T13:00:00.000Z",
      }],
    });
    expect(eventsForSubject(store.db, "pr_series", "series-1").slice(-2).map((event) => event.eventType)).toEqual([
      "pr.series_revising",
      "pr.series_revised",
    ]);
  });

  test("cannot claim work while dormant or misstate the items resolved by a revision", () => {
    const store = setup();
    const feedback = ingestPrFeedback(store, {
      commandId: "observation-review-guarded",
      expectedRevision: 1,
      items: [
        { itemId: "item-a", sourceKind: "review", sourceId: "comment-a", summary: "Fix A" },
        { itemId: "item-b", sourceKind: "review", sourceId: "comment-b", summary: "Fix B" },
      ],
      seriesId: "series-1",
    });
    expect(() =>
      transitionPrWorkItems(store, {
        actor: "agent",
        commandId: "command-claim-dormant",
        expectedRevision: feedback.series.revision,
        patch: { status: "changes_requested" },
        seriesId: "series-1",
        workItems: [{ itemId: "item-a", expectedStatus: "pending", status: "in_progress" }],
      }),
    ).toThrow("Claiming PR work items requires the owning series to enter revising");
    expect(store.db.query("SELECT status FROM pr_work_items WHERE item_id = 'item-a'").get()).toEqual({ status: "pending" });

    const campaign = getPrCampaign(store, "pr-campaign-1");
    if (!campaign) throw new Error("campaign missing from fixture");
    transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-reactivate-guarded",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const revising = transitionPrWorkItems(store, {
      actor: "agent",
      commandId: "command-claim-a",
      expectedRevision: feedback.series.revision,
      patch: { status: "revising" },
      seriesId: "series-1",
      workItems: [{ itemId: "item-a", expectedStatus: "pending", status: "in_progress" }],
    });
    expect(() =>
      transitionPrWorkItems(store, {
        actor: "agent",
        commandId: "command-misstate-resolution",
        eventType: "pr.series_revised",
        expectedRevision: revising.revision,
        patch: { status: "published" },
        payload: { resolved_work_item_ids: ["item-b"], pushed_revision: "revision-after-fix" },
        seriesId: "series-1",
        workItems: [{ itemId: "item-a", expectedStatus: "in_progress", status: "resolved" }],
      }),
    ).toThrow("resolved_work_item_ids must match the accepted work-item transitions");
    expect(store.db.query("SELECT status FROM pr_work_items WHERE item_id = 'item-a'").get()).toEqual({ status: "in_progress" });
    expect(eventsForSubject(store.db, "pr_series", "series-1").at(-1)?.eventType).toBe("pr.series_revising");
  });
});
