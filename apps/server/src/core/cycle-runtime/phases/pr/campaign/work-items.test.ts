import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createCycle } from "@server/core/cycle/store.js";
import { recordSavePointAnchor } from "@server/core/cycle/timeline.js";
import { eventsForSubject, listGameEvents } from "@server/core/harness-state/events.js";
import { getHarnessState, initializeHarnessState, requestDispatch } from "@server/core/harness-state/lease.js";
import {
  StalePrSeriesRevisionError,
  assertPrWorkItemStatusTransition,
  getPrCampaign,
  getPrSeries,
  ingestPrFeedback,
  observePrSeriesRemote,
  isPrWorkItemStatusTransitionAllowed,
  openPrCampaign,
  transitionPrCampaign,
  transitionPrWorkItems,
  transitionPrSeries,
} from "./index.js";
import {
  claimPrCampaignWorkItems,
  declinePrCampaignWorkItems,
  resolvePrCampaignWorkItems,
  revisePrCampaignSeries,
} from "./work-items.js";

const tempDirs: string[] = [];
const stores: StateStore[] = [];

function setup(): StateStore {
  const directory = mkdtempSync(join(tmpdir(), "pr-work-items-"));
  tempDirs.push(directory);
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
  store.db
    .query("INSERT INTO campaigns (id, game_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
    .run("legacy-campaign", "melee", "origin/master", "2026-08-13T10:00:00.000Z");
  store.db
    .query(
      `INSERT INTO save_points (
         id, campaign_id, trigger_kind, label, commit_sha,
         worktree_dirty, committed, payload_json, created_at
       ) VALUES ('save-point-1', 'legacy-campaign', 'manual', 'stable anchor',
                 'cycle-head', 0, 1, '{}', '2026-08-13T10:01:00.000Z')`,
    )
    .run();
  recordSavePointAnchor(store, {
    actor: "operator",
    commandId: "command-record-anchor",
    correlationId: "cycle-1",
    commitSha: "cycle-head",
    occurredAt: "2026-08-13T10:01:00.000Z",
    gameId: "melee",
    savePointId: "save-point-1",
    triggerKind: "manual",
  });
  let campaign = openPrCampaign(store, {
    actor: "operator",
    campaignId: "pr-campaign-1",
    commandId: "command-open-campaign",
    correlationId: "pr-campaign-1",
    namedSavePointId: "save-point-1",
    gameId: "melee",
    series: [{
      batchIndex: 0,
      branch: "codex/split-01-alpha",
      seriesId: "series-1",
      targetUnits: ["src/alpha.c"],
    }],
    cycleUuid: "cycle-1",
  });
  campaign = transitionPrCampaign(store, campaign.campaign_id, {
    actor: "operator",
    commandId: "command-activate-campaign",
    correlationId: "pr-campaign-1",
    expectedRevision: campaign.revision,
    patch: { status: "working" },
  });
  transitionPrSeries(store, "series-1", {
    actor: "operator",
    commandId: "command-publish-series",
    correlationId: "pr-campaign-1",
    expectedRevision: 0,
    patch: { status: "published", upstreamPrNumber: 2850 },
    payload: { upstream_pr_number: 2850, branch: "codex/split-01-alpha", batch_index: 0 },
  });
  transitionPrCampaign(store, campaign.campaign_id, {
    actor: "operator",
    commandId: "command-release-campaign",
    correlationId: "pr-campaign-1",
    expectedRevision: campaign.revision,
    patch: { status: "in_review" },
  });
  return store;
}

function setupDeclineFixture(store: StateStore, itemIds: string[]) {
  const feedback = ingestPrFeedback(store, {
    commandId: "observation-review-decline",
    correlationId: "pr-campaign-1",
    expectedRevision: 1,
    items: itemIds.map((itemId) => ({
      itemId,
      sourceKind: "review",
      sourceId: `comment-${itemId}`,
      summary: `Review feedback for ${itemId}`,
    })),
    seriesId: "series-1",
  });
  const campaign = getPrCampaign(store, "pr-campaign-1");
  if (!campaign) throw new Error("campaign missing from decline fixture");
  const workingCampaign = transitionPrCampaign(store, campaign.campaign_id, {
    actor: "operator",
    commandId: "command-reactivate-decline",
    correlationId: "pr-campaign-1",
    expectedRevision: campaign.revision,
    patch: { status: "working" },
  });
  const dispatch = requestDispatch(store, {
    actor: "operator",
    commandId: "command-acquire-decline-lease",
    correlationId: "pr-campaign-1",
    kind: "pr",
    gameId: "melee",
    reason: "decline review feedback",
    workflowId: "pr-campaign-1",
  });
  if (dispatch.queued) throw new Error("decline fixture lease queued unexpectedly");
  return { initialSeries: feedback.series, leaseId: dispatch.leaseId, traceId: workingCampaign.trace_id };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("PR feedback ingestion", () => {
  test.each([
    ["CHANGES_REQUESTED", "OPEN", "changes_requested", "pr.series_changes_requested"],
    ["APPROVED", "OPEN", "approved", "pr.series_approved"],
    ["", "MERGED", "merged", "pr.series_merged"],
    ["", "CLOSED", "closed", "pr.series_closed"],
  ] as const)("maps remote %s/%s observation to %s", (reviewDecision, state, status, eventType) => {
    const store = setup();
    const result = observePrSeriesRemote(store, {
      approvalSourceIdentity: "github-review:PRR_2850",
      approvedRevision: "approved-head-sha",
      approvingActor: "upstream-reviewer",
      branch: "codex/split-01-alpha",
      commandId: `observe-${status}`,
      correlationId: "pr-campaign-1",
      mergedUpstreamRevision: "merge-sha",
      occurredAt: "2026-08-13T12:00:00.000Z",
      reviewDecision,
      state,
      upstreamPrNumber: 2850,
    });

    expect(result).toMatchObject({ ignored: false, series: { status } });
    const event = eventsForSubject(store.db, "pr_series", "series-1").at(-1);
    expect(event).toMatchObject({
      actor: "external_observer",
      eventType,
      subjectId: "series-1",
    });
    if (status === "approved") {
      expect(event?.payload).toEqual({
        approval_source_identity: "github-review:PRR_2850",
        approved_revision: "approved-head-sha",
        approving_actor: "upstream-reviewer",
        from_status: "published",
        to_status: "approved",
      });
    }
  });

  test("ignores remote observations for branches without a campaign series", () => {
    const store = setup();
    const before = listGameEvents(store.db, { gameId: "melee" }).length;
    expect(observePrSeriesRemote(store, {
      branch: "codex/split-99-unknown",
      commandId: "observe-unknown",
      correlationId: "pr-campaign-1",
      reviewDecision: "APPROVED",
      state: "OPEN",
      upstreamPrNumber: 9999,
    })).toEqual({ feedbackItemIds: [], ignored: true, series: null });
    expect(listGameEvents(store.db, { gameId: "melee" })).toHaveLength(before);
  });

  test("remote feedback creates pending work immediately without changing the lease", () => {
    const store = setup();
    const harnessBefore = getHarnessState(store, "melee");
    const result = observePrSeriesRemote(store, {
      branch: "codex/split-01-alpha",
      commandId: "observe-feedback",
      correlationId: "pr-campaign-1",
      feedback: [{ sourceKind: "issue_comment", sourceId: "IC_123", summary: "Please use the game typedef." }],
      reviewDecision: "CHANGES_REQUESTED",
      state: "OPEN",
      upstreamPrNumber: 2850,
    });

    expect(result.series).toMatchObject({
      status: "changes_requested",
      work_items: [{ source_id: "IC_123", status: "pending", summary: "Please use the game typedef." }],
    });
    expect(result.feedbackItemIds).toHaveLength(1);
    expect(getHarnessState(store, "melee")).toEqual(harnessBefore);
    expect(eventsForSubject(store.db, "pr_series", "series-1").slice(-2).map((event) => event.eventType)).toEqual([
      "pr.feedback_ingested",
      "pr.series_changes_requested",
    ]);
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

  test("ingests feedback as progress followed by a status transition without touching the lease", () => {
    const store = setup();
    const harnessBefore = getHarnessState(store, "melee");
    const before = eventsForSubject(store.db, "pr_series", "series-1").length;

    const result = ingestPrFeedback(store, {
      commandId: "observation-review-19442",
      correlationId: "pr-campaign-1",
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
        revision: 3,
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
    expect(events).toHaveLength(before + 2);
    const feedbackEvent = events.at(-2)!;
    const changesRequestedEvent = events.at(-1)!;
    expect(feedbackEvent).toMatchObject({
      actor: "external_observer",
      causationId: "observation-review-19442",
      correlationId: "pr-campaign-1",
      eventType: "pr.feedback_ingested",
      subjectId: "series-1",
      payload: {
        work_item_ids: ["work-item-77"],
        review_source_identities: ["review_comment:review-comment-19442"],
        ingesting_actor: "external_observer",
        from_status: "published",
        to_status: "published",
      },
    });
    expect(changesRequestedEvent).toMatchObject({
      actor: "external_observer",
      causationId: feedbackEvent.eventId,
      correlationId: "pr-campaign-1",
      eventType: "pr.series_changes_requested",
      payload: {
        from_status: "published",
        to_status: "changes_requested",
      },
      subjectId: "series-1",
    });
    expect(changesRequestedEvent.sequence).toBe(feedbackEvent.sequence + 1);
    const actionRoot = feedbackEvent.parentSpanId;
    expect(actionRoot).not.toBeNull();
    expect(changesRequestedEvent.parentSpanId).toBe(actionRoot);
    expect(feedbackEvent.spanId).not.toBe(actionRoot);
    expect(changesRequestedEvent.spanId).not.toBe(actionRoot);
    expect(changesRequestedEvent.spanId).not.toBe(feedbackEvent.spanId);
    expect(getHarnessState(store, "melee")).toEqual(harnessBefore);
    expect(listGameEvents(store.db, { gameId: "melee" }).filter((event) => event.eventType.startsWith("game.dispatch_"))).toEqual([]);
  });

  test("is retry-safe by item id and review-source identity without creating a revision", () => {
    const store = setup();
    const first = ingestPrFeedback(store, {
      commandId: "observation-review-1",
      correlationId: "pr-campaign-1",
      expectedRevision: 1,
      items: [{ itemId: "item-1", sourceKind: "review", sourceId: "comment-1", summary: "First" }],
      seriesId: "series-1",
    });
    const eventCount = eventsForSubject(store.db, "pr_series", "series-1").length;
    const retry = ingestPrFeedback(store, {
      commandId: "observation-review-retry",
      correlationId: "pr-campaign-1",
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
      correlationId: "pr-campaign-1",
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
        correlationId: "pr-campaign-1",
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
      correlationId: "pr-campaign-1",
      expectedRevision: 1,
      items: [{ itemId: "item-fix", sourceKind: "review", sourceId: "comment-fix", summary: "Fix this" }],
      seriesId: "series-1",
    });
    const campaign = getPrCampaign(store, "pr-campaign-1");
    if (!campaign) throw new Error("campaign missing from fixture");
    const workingCampaign = transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-reactivate-campaign",
      correlationId: "pr-campaign-1",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });

    const dispatch = requestDispatch(store, {
      actor: "operator",
      commandId: "command-acquire-fixer-lease",
      correlationId: "pr-campaign-1",
      kind: "pr",
      gameId: "melee",
      reason: "fix review feedback",
      workflowId: "pr-campaign-1",
    });
    if (dispatch.queued) throw new Error("fixture lease queued unexpectedly");
    const claimRootSpan = "span-55555555-5555-4555-8555-555555555555";
    const claimInput = {
      commandId: "command-start-fix",
      correlationId: "pr-campaign-1",
      itemIds: ["item-fix"],
      leaseId: dispatch.leaseId,
      gameId: "melee",
      seriesId: "series-1",
      spanId: claimRootSpan,
      store,
    };
    expect(() => claimPrCampaignWorkItems({ ...claimInput, leaseId: "stale-lease" })).toThrow(
      `Dispatch lease stale-lease is stale; current lease is ${dispatch.leaseId}`,
    );
    expect(store.db.query("SELECT status FROM pr_work_items WHERE item_id = 'item-fix'").get()).toEqual({
      status: "pending",
    });

    const revising = claimPrCampaignWorkItems(claimInput);
    expect(revising).toMatchObject({
      revision: feedback.series.revision + 1,
      status: "revising",
      work_items: [{ item_id: "item-fix", status: "in_progress", resolved_at: null }],
    });
    const revisingEvent = eventsForSubject(store.db, "pr_series", "series-1").at(-1)!;
    expect(revisingEvent).toMatchObject({
      actor: "agent",
      causationId: "command-start-fix",
      correlationId: "pr-campaign-1",
      eventType: "pr.series_revising",
      parentSpanId: claimRootSpan,
      subjectId: "series-1",
      subjectKind: "pr_series",
      traceId: workingCampaign.trace_id,
    });
    expect(revisingEvent.payload).toEqual({
      from_status: "changes_requested",
      to_status: "revising",
    });
    expect(revisingEvent.spanId).not.toBe(claimRootSpan);
    expect(revising.caused_by_event_id).toBe(revisingEvent.eventId);
    expect(workingCampaign.status).toBe("working");
    const harnessState = getHarnessState(store, "melee");
    if (!harnessState) throw new Error("fixture game state missing after work-item claim");
    const activeWorkflow = harnessState.active_workflow;
    if (!activeWorkflow) throw new Error("fixture dispatch lease missing after work-item claim");
    expect(activeWorkflow).toMatchObject({
      kind: "pr",
      lease_id: dispatch.leaseId,
      status: "active",
      workflow_id: "pr-campaign-1",
    });

    const revised = transitionPrWorkItems(store, {
      actor: "agent",
      commandId: "command-finish-fix",
      correlationId: "pr-campaign-1",
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

  test("revises settled work without leaking decline or lease facts into pr.series_revised", () => {
    const store = setup();
    const feedback = ingestPrFeedback(store, {
      commandId: "observation-review-settled",
      correlationId: "pr-campaign-1",
      expectedRevision: 1,
      items: [
        { itemId: "item-resolved", sourceKind: "review", sourceId: "comment-resolved", summary: "Fix this" },
        { itemId: "item-declined", sourceKind: "review", sourceId: "comment-declined", summary: "Decline this" },
      ],
      seriesId: "series-1",
    });
    const campaign = getPrCampaign(store, "pr-campaign-1");
    if (!campaign) throw new Error("campaign missing from settled fixture");
    const workingCampaign = transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-reactivate-settled",
      correlationId: "pr-campaign-1",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const dispatch = requestDispatch(store, {
      actor: "operator",
      commandId: "command-acquire-settled-lease",
      correlationId: "pr-campaign-1",
      kind: "pr",
      gameId: "melee",
      reason: "settle review feedback",
      workflowId: "pr-campaign-1",
    });
    if (dispatch.queued) throw new Error("settled fixture lease queued unexpectedly");

    const revising = claimPrCampaignWorkItems({
      commandId: "command-claim-settled",
      correlationId: "pr-campaign-1",
      itemIds: ["item-resolved", "item-declined"],
      leaseId: dispatch.leaseId,
      gameId: "melee",
      seriesId: "series-1",
      store,
    });
    const resolved = resolvePrCampaignWorkItems({
      commandId: "command-resolve-settled",
      correlationId: "pr-campaign-1",
      itemIds: ["item-resolved"],
      leaseId: dispatch.leaseId,
      gameId: "melee",
      resolution: "fix applied",
      seriesId: "series-1",
      store,
    });
    const declined = declinePrCampaignWorkItems({
      commandId: "command-decline-settled",
      correlationId: "pr-campaign-1",
      itemIds: ["item-declined"],
      leaseId: dispatch.leaseId,
      gameId: "melee",
      reason: "upstream request conflicts with game constraints",
      seriesId: "series-1",
      store,
    });
    expect(revising.status).toBe("revising");
    expect(resolved.status).toBe("revising");
    expect(declined).toMatchObject({
      revision: resolved.revision + 1,
      status: "revising",
      work_items: [
        { item_id: "item-declined", status: "declined" },
        { item_id: "item-resolved", status: "resolved" },
      ],
    });

    const eventsBeforeStaleRevision = eventsForSubject(store.db, "pr_series", "series-1").length;
    expect(() => revisePrCampaignSeries({
      commandId: "command-revise-settled-stale",
      correlationId: "pr-campaign-1",
      leaseId: "stale-lease",
      gameId: "melee",
      pushedRevision: "revision-after-settled-fix",
      seriesId: "series-1",
      store,
    })).toThrow(`Dispatch lease stale-lease is stale; current lease is ${dispatch.leaseId}`);
    expect(eventsForSubject(store.db, "pr_series", "series-1")).toHaveLength(eventsBeforeStaleRevision);

    const reviseRootSpan = "span-66666666-6666-4666-8666-666666666666";
    const revised = revisePrCampaignSeries({
      commandId: "command-revise-settled",
      correlationId: "pr-campaign-1",
      leaseId: dispatch.leaseId,
      gameId: "melee",
      pushedRevision: "revision-after-settled-fix",
      seriesId: "series-1",
      spanId: reviseRootSpan,
      store,
    });
    expect(revised).toMatchObject({
      revision: declined.revision + 1,
      status: "published",
      work_items: [
        { item_id: "item-declined", status: "declined" },
        { item_id: "item-resolved", status: "resolved" },
      ],
    });
    expect(store.db.query(
      "SELECT item_id, status, resolved_at FROM pr_work_items WHERE series_id = ? ORDER BY item_id",
    ).all("series-1")).toEqual([
      { item_id: "item-declined", status: "declined", resolved_at: expect.any(String) },
      { item_id: "item-resolved", status: "resolved", resolved_at: expect.any(String) },
    ]);

    const seriesEvents = eventsForSubject(store.db, "pr_series", "series-1");
    expect(seriesEvents.slice(-4).map((event) => event.eventType)).toEqual([
      "pr.series_revising",
      "pr.work_items_resolved",
      "pr.work_items_declined",
      "pr.series_revised",
    ]);
    const revisedEvent = seriesEvents.at(-1)!;
    expect(revisedEvent).toMatchObject({
      actor: "agent",
      causationId: "command-revise-settled",
      correlationId: "pr-campaign-1",
      eventType: "pr.series_revised",
      parentSpanId: reviseRootSpan,
      subjectId: "series-1",
      subjectKind: "pr_series",
      traceId: workingCampaign.trace_id,
    });
    expect(revisedEvent.payload).toEqual({
      from_status: "revising",
      pushed_revision: "revision-after-settled-fix",
      resolved_work_item_ids: ["item-resolved"],
      to_status: "published",
    });
    expect(revisedEvent.spanId).not.toBe(reviseRootSpan);
    expect(revised.caused_by_event_id).toBe(revisedEvent.eventId);
    expect(feedback.series.revision).toBeLessThan(revised.revision);
  });

  test("cannot claim work while dormant or misstate the items resolved by a revision", () => {
    const store = setup();
    const feedback = ingestPrFeedback(store, {
      commandId: "observation-review-guarded",
      correlationId: "pr-campaign-1",
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
        correlationId: "pr-campaign-1",
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
      correlationId: "pr-campaign-1",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const revising = transitionPrWorkItems(store, {
      actor: "agent",
      commandId: "command-claim-a",
      correlationId: "pr-campaign-1",
      expectedRevision: feedback.series.revision,
      patch: { status: "revising" },
      seriesId: "series-1",
      workItems: [{ itemId: "item-a", expectedStatus: "pending", status: "in_progress" }],
    });
    expect(() =>
      transitionPrWorkItems(store, {
        actor: "agent",
        commandId: "command-misstate-resolution",
        correlationId: "pr-campaign-1",
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

describe("PR work-item decline transition honesty", () => {
  test("records decline progress before deriving revising with consecutive revisions and lineage", () => {
    const store = setup();
    const fixture = setupDeclineFixture(store, ["item-decline-last"]);
    const eventsBefore = eventsForSubject(store.db, "pr_series", "series-1").length;

    const result = declinePrCampaignWorkItems({
      commandId: "command-decline-last",
      correlationId: "pr-campaign-1",
      itemIds: ["item-decline-last"],
      leaseId: fixture.leaseId,
      gameId: "melee",
      reason: "request conflicts with game constraints",
      seriesId: "series-1",
      store,
    });

    expect(result).toMatchObject({
      revision: fixture.initialSeries.revision + 2,
      status: "revising",
      work_items: [{ item_id: "item-decline-last", status: "declined", resolved_at: expect.any(String) }],
    });
    expect(store.db.query(
      "SELECT status, resolved_at FROM pr_work_items WHERE item_id = 'item-decline-last'",
    ).get()).toEqual({ status: "declined", resolved_at: expect.any(String) });

    const events = eventsForSubject(store.db, "pr_series", "series-1").slice(eventsBefore);
    expect(events).toHaveLength(2);
    const declineEvent = events[0]!;
    const revisingEvent = events[1]!;
    const actionRoot = declineEvent.parentSpanId;
    expect(actionRoot).not.toBeNull();
    expect(declineEvent).toMatchObject({
      actor: "agent",
      causationId: "command-decline-last",
      correlationId: "pr-campaign-1",
      eventType: "pr.work_items_declined",
      parentSpanId: actionRoot,
      traceId: fixture.traceId,
    });
    expect(declineEvent.payload).toEqual({
      decline_reason: "request conflicts with game constraints",
      declined_work_item_ids: ["item-decline-last"],
      lease_id: fixture.leaseId,
      from_status: "changes_requested",
      to_status: "changes_requested",
    });
    expect(revisingEvent).toMatchObject({
      actor: "agent",
      causationId: declineEvent.eventId,
      correlationId: "pr-campaign-1",
      eventType: "pr.series_revising",
      parentSpanId: actionRoot,
      traceId: fixture.traceId,
    });
    expect(revisingEvent.payload).toEqual({
      from_status: "changes_requested",
      to_status: "revising",
    });
    expect(revisingEvent.sequence).toBe(declineEvent.sequence + 1);
    expect(declineEvent.spanId).not.toBe(actionRoot);
    expect(revisingEvent.spanId).not.toBe(declineEvent.spanId);
    expect(result.caused_by_event_id).toBe(revisingEvent.eventId);
  });

  test("emits only decline progress while pending work remains", () => {
    const store = setup();
    const fixture = setupDeclineFixture(store, ["item-decline-one", "item-pending-two"]);
    const eventsBefore = eventsForSubject(store.db, "pr_series", "series-1").length;
    const actionRoot = "span-88888888-8888-4888-8888-888888888888";

    const result = declinePrCampaignWorkItems({
      commandId: "command-decline-one",
      correlationId: "pr-campaign-1",
      itemIds: ["item-decline-one"],
      leaseId: fixture.leaseId,
      gameId: "melee",
      reason: "decline one request",
      seriesId: "series-1",
      spanId: actionRoot,
      store,
    });

    expect(result).toMatchObject({
      revision: fixture.initialSeries.revision + 1,
      status: "changes_requested",
      work_items: [
        { item_id: "item-decline-one", status: "declined" },
        { item_id: "item-pending-two", status: "pending" },
      ],
    });
    const events = eventsForSubject(store.db, "pr_series", "series-1").slice(eventsBefore);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      causationId: "command-decline-one",
      eventType: "pr.work_items_declined",
      parentSpanId: actionRoot,
      payload: {
        decline_reason: "decline one request",
        declined_work_item_ids: ["item-decline-one"],
        lease_id: fixture.leaseId,
        from_status: "changes_requested",
        to_status: "changes_requested",
      },
    });
    expect(result.caused_by_event_id).toBe(events[0]!.eventId);
  });

  test("emits only decline progress when the series is already revising", () => {
    const store = setup();
    const fixture = setupDeclineFixture(store, ["item-decline-active"]);
    const revising = claimPrCampaignWorkItems({
      commandId: "command-claim-active-decline",
      correlationId: "pr-campaign-1",
      itemIds: ["item-decline-active"],
      leaseId: fixture.leaseId,
      gameId: "melee",
      seriesId: "series-1",
      store,
    });
    const eventsBefore = eventsForSubject(store.db, "pr_series", "series-1").length;

    const result = declinePrCampaignWorkItems({
      commandId: "command-decline-active",
      correlationId: "pr-campaign-1",
      itemIds: ["item-decline-active"],
      leaseId: fixture.leaseId,
      gameId: "melee",
      reason: "decline claimed request",
      seriesId: "series-1",
      spanId: "span-99999999-9999-4999-8999-999999999999",
      store,
    });

    expect(result).toMatchObject({
      revision: revising.revision + 1,
      status: "revising",
      work_items: [{ item_id: "item-decline-active", status: "declined" }],
    });
    const events = eventsForSubject(store.db, "pr_series", "series-1").slice(eventsBefore);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      causationId: "command-decline-active",
      eventType: "pr.work_items_declined",
      payload: {
        decline_reason: "decline claimed request",
        declined_work_item_ids: ["item-decline-active"],
        lease_id: fixture.leaseId,
        from_status: "revising",
        to_status: "revising",
      },
    });
  });

  test.each(["event", "state"] as const)(
    "rolls back the decline event, item update, and revision when the derived %s write fails",
    (failure) => {
      const store = setup();
      const fixture = setupDeclineFixture(store, ["item-decline-rollback"]);
      const seriesBefore = getPrSeries(store, "series-1");
      if (!seriesBefore) throw new Error("series missing from rollback fixture");
      const eventsBefore = eventsForSubject(store.db, "pr_series", "series-1");
      const failureMessage = failure === "event"
        ? "reject derived revising event"
        : "reject derived revising state";
      if (failure === "event") {
        store.db.exec(`
          CREATE TRIGGER reject_derived_revising_event
          BEFORE INSERT ON game_events
          WHEN NEW.event_type = 'pr.series_revising' AND NEW.subject_id = 'series-1'
          BEGIN SELECT RAISE(ABORT, 'reject derived revising event'); END
        `);
      } else {
        store.db.exec(`
          CREATE TRIGGER reject_derived_revising_state
          BEFORE UPDATE OF revision ON pr_series
          WHEN OLD.series_id = 'series-1' AND OLD.revision = ${seriesBefore.revision + 1}
          BEGIN SELECT RAISE(ABORT, 'reject derived revising state'); END
        `);
      }

      expect(() => declinePrCampaignWorkItems({
        commandId: `command-decline-rollback-${failure}`,
        correlationId: "pr-campaign-1",
        itemIds: ["item-decline-rollback"],
        leaseId: fixture.leaseId,
        gameId: "melee",
        reason: "exercise atomic rollback",
        seriesId: "series-1",
        store,
      })).toThrow(failureMessage);

      expect(getPrSeries(store, "series-1")).toEqual(seriesBefore);
      expect(store.db.query(
        "SELECT status, resolved_at FROM pr_work_items WHERE item_id = 'item-decline-rollback'",
      ).get()).toEqual({ status: "pending", resolved_at: null });
      expect(eventsForSubject(store.db, "pr_series", "series-1")).toEqual(eventsBefore);
    },
  );
});
