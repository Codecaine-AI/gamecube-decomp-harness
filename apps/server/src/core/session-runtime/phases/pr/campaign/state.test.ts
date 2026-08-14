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
  PR_PROGRESS_EVENT_TYPES,
  PR_SERIES_STATUSES,
  PR_WORK_ITEM_STATUSES,
  StalePrSeriesRevisionError,
  getPrCampaign,
  getPrSeries,
  isPrCampaignStatusTransitionAllowed,
  isPrSeriesStatusTransitionAllowed,
  openPrCampaign,
  recordPreparedPrSeries,
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
    actor: "operator",
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
    correlationId: "session-1",
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
    correlationId: campaignId,
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
    expect(PR_PROGRESS_EVENT_TYPES).toEqual([
      "pr.work_items_claimed",
      "pr.work_items_resolved",
      "pr.work_items_declined",
    ]);
    expect(PR_EVENT_TYPES).toEqual([
      ...PR_LIFECYCLE_EVENT_TYPES,
      ...PR_DERIVED_STATUS_EVENT_TYPES,
      ...PR_PROGRESS_EVENT_TYPES,
    ]);
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
    expect(campaignEvents[0]!.causationId).toBe(`command-open-${campaign.campaign_id}`);
    const creationEvents = [campaignEvents[0]!];
    const preparedEvents = [];
    for (const seriesId of campaign.series_ids) {
      const events = eventsForSubject(store.db, "pr_series", seriesId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "pr.series_prepared",
        subjectId: seriesId,
        correlationId: campaign.campaign_id,
      });
      creationEvents.push(events[0]!);
      preparedEvents.push(events[0]!);
    }
    expect(new Set(creationEvents.map((event) => event.actor))).toEqual(new Set(["operator"]));
    expect(new Set(creationEvents.map((event) => event.correlationId))).toEqual(new Set([campaign.campaign_id]));
    expect(new Set(creationEvents.map((event) => event.traceId))).toEqual(new Set([campaign.trace_id]));
    expect(preparedEvents.every((event) => event.causationId === campaignEvents[0]!.eventId)).toBe(true);
    expect(new Set(creationEvents.map((event) => event.parentSpanId)).size).toBe(1);
    expect(new Set(creationEvents.map((event) => event.spanId)).size).toBe(3);
    expect(creationEvents.map((event) => event.spanId)).not.toContain(creationEvents[0]!.parentSpanId);
    expect(() => openCampaign(store, "pr-campaign-2")).toThrow("already has an open PR campaign");
  });

  test("rejects zero-series creation and prevents an adoption placeholder from completing empty", () => {
    const store = fixture();
    const input = {
      actor: "operator" as const,
      campaignId: "pr-campaign-empty",
      commandId: "command-open-empty",
      correlationId: "pr-campaign-empty",
      namedSavePointId: "save-point-1",
      projectId: "melee",
      sessionUuid: "session-1",
    };
    expect(() => openPrCampaign(store, input)).toThrow("requires at least one series");
    expect(eventsForSubject(store.db, "pr_campaign", "pr-campaign-empty")).toEqual([]);

    const placeholder = openPrCampaign(store, input, { allowEmptyForLegacyAdoption: true });
    expect(() => transitionPrCampaign(store, placeholder.campaign_id, {
      actor: "operator",
      commandId: "command-close-empty",
      correlationId: "pr-campaign-empty",
      eventType: "pr.campaign_closed",
      expectedRevision: placeholder.revision,
      patch: { status: "completed" },
      payload: { outcome: "completed", per_series_terminal_summary: {} },
    })).toThrow("cannot complete without series");
    expect(getPrCampaign(store, placeholder.campaign_id)?.status).toBe("preparing");
  });

  test("keeps standalone prepared and later series events on the campaign workflow trace", () => {
    const store = fixture();
    let campaign = openCampaign(store);
    const prepareRootSpan = "span-11111111-1111-4111-8111-111111111111";
    const prepared = recordPreparedPrSeries(store, {
      actor: "operator",
      batchIndex: 0,
      branch: "codex/split-03-gamma",
      campaignId: campaign.campaign_id,
      commandId: "command-prepare-series-3",
      correlationId: campaign.campaign_id,
      seriesId: "series-3",
      spanId: prepareRootSpan,
      targetUnits: ["src/gamma.c"],
    });
    expect(prepared.trace_id).toBe(campaign.trace_id);
    expect(prepared.target_units).toEqual(["src/gamma.c"]);
    const preparedEvent = eventsForSubject(store.db, "pr_series", prepared.series_id)[0]!;
    expect(preparedEvent).toMatchObject({
      actor: "operator",
      causationId: "command-prepare-series-3",
      correlationId: campaign.campaign_id,
      eventType: "pr.series_prepared",
      parentSpanId: prepareRootSpan,
      traceId: campaign.trace_id,
    });
    expect(preparedEvent.payload).toEqual({
      batch_index: 0,
      branch: "codex/split-03-gamma",
      from_status: null,
      to_status: "prepared",
    });
    expect(preparedEvent.payload).not.toHaveProperty("target_units");
    expect(preparedEvent.spanId).not.toBe(prepareRootSpan);

    expect(() => recordPreparedPrSeries(store, {
      actor: "operator",
      batchIndex: 0,
      branch: "codex/split-04-conflicting-trace",
      campaignId: campaign.campaign_id,
      commandId: "command-prepare-conflicting-trace",
      correlationId: campaign.campaign_id,
      seriesId: "series-conflicting-trace",
      targetUnits: ["src/conflicting.c"],
      traceId: "trace-conflicting-series",
    })).toThrow(`PR series trace_id must equal campaign trace_id ${campaign.trace_id}`);
    expect(eventsForSubject(store.db, "pr_series", "series-conflicting-trace")).toEqual([]);

    expect(() => recordPreparedPrSeries(store, {
      actor: "operator",
      batchIndex: 0,
      branch: "codex/split-04-conflicting-correlation",
      campaignId: campaign.campaign_id,
      commandId: "command-prepare-conflicting-correlation",
      correlationId: "different-campaign",
      seriesId: "series-conflicting-correlation",
      targetUnits: ["src/conflicting-correlation.c"],
    })).toThrow(`PR event correlation_id must equal campaign id ${campaign.campaign_id}`);
    expect(eventsForSubject(store.db, "pr_series", "series-conflicting-correlation")).toEqual([]);

    expect(() => recordPreparedPrSeries(store, {
      actor: "agent",
      batchIndex: 0,
      branch: "codex/split-04-agent",
      campaignId: campaign.campaign_id,
      commandId: "command-prepare-as-agent",
      correlationId: campaign.campaign_id,
      seriesId: "series-agent",
      targetUnits: ["src/agent.c"],
    })).toThrow("pr.series_prepared is operator-only");
    expect(eventsForSubject(store.db, "pr_series", "series-agent")).toEqual([]);

    campaign = transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-activate-campaign-for-series-3",
      correlationId: campaign.campaign_id,
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const publishRootSpan = "span-22222222-2222-4222-8222-222222222222";
    const published = transitionPrSeries(store, prepared.series_id, {
      actor: "operator",
      commandId: "command-publish-series-3",
      correlationId: campaign.campaign_id,
      expectedRevision: prepared.revision,
      patch: { status: "published", upstreamPrNumber: 2851 },
      payload: { upstream_pr_number: 2851, branch: prepared.branch, batch_index: prepared.batch_index },
      spanId: publishRootSpan,
    });
    const publishedEvent = eventsForSubject(store.db, "pr_series", published.series_id).at(-1)!;
    expect(publishedEvent).toMatchObject({
      actor: "operator",
      causationId: "command-publish-series-3",
      correlationId: campaign.campaign_id,
      eventType: "pr.series_published",
      parentSpanId: publishRootSpan,
      traceId: campaign.trace_id,
    });
    expect(published.trace_id).toBe(campaign.trace_id);
    expect(publishedEvent.spanId).not.toBe(publishRootSpan);
  });

  test("requires exact approval evidence and contract-exact terminal payloads", () => {
    const store = fixture();
    let campaign = openCampaign(store);
    campaign = transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-activate-terminal-evidence",
      correlationId: campaign.campaign_id,
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const published = transitionPrSeries(store, "series-1", {
      actor: "operator",
      commandId: "command-publish-terminal-evidence",
      correlationId: campaign.campaign_id,
      expectedRevision: 0,
      patch: { status: "published", upstreamPrNumber: 2850 },
      payload: { upstream_pr_number: 2850, branch: "codex/split-01-alpha", batch_index: 0 },
    });

    for (const field of ["approval_source_identity", "approved_revision", "approving_actor"] as const) {
      expect(() => transitionPrSeries(store, published.series_id, {
        actor: "external_observer",
        commandId: `command-invalid-approval-${field}`,
        correlationId: campaign.campaign_id,
        expectedRevision: published.revision,
        patch: { status: "approved" },
        payload: {
          approval_source_identity: "github-review:PRR_42",
          approved_revision: "approved-head-sha",
          approving_actor: "octocat",
          [field]: " ",
        },
      })).toThrow(`${field} is required`);
      expect(getPrSeries(store, published.series_id)?.revision).toBe(published.revision);
    }

    const approved = transitionPrSeries(store, published.series_id, {
      actor: "external_observer",
      commandId: "command-record-approval",
      correlationId: campaign.campaign_id,
      expectedRevision: published.revision,
      patch: { status: "approved" },
      payload: {
        approval_source_identity: "github-review:PRR_42",
        approved_revision: "approved-head-sha",
        approving_actor: "octocat",
      },
    });
    const approvalEvent = eventsForSubject(store.db, "pr_series", approved.series_id).at(-1)!;
    expect(approvalEvent.actor).toBe("external_observer");
    expect(approvalEvent.payload).toEqual({
      approval_source_identity: "github-review:PRR_42",
      approved_revision: "approved-head-sha",
      approving_actor: "octocat",
      from_status: "published",
      to_status: "approved",
    });

    expect(() => transitionPrSeries(store, approved.series_id, {
      actor: "external_observer",
      commandId: "command-close-with-wrong-actor-evidence",
      correlationId: campaign.campaign_id,
      eventType: "pr.series_closed",
      expectedRevision: approved.revision,
      patch: { status: "closed" },
      payload: { close_reason: "withdrawn upstream", closing_actor: "operator" },
    })).toThrow("pr.series_closed closing_actor must match the event actor");
    const closedFirst = transitionPrSeries(store, approved.series_id, {
      actor: "external_observer",
      commandId: "command-close-first-series",
      correlationId: campaign.campaign_id,
      eventType: "pr.series_closed",
      expectedRevision: approved.revision,
      patch: { status: "closed" },
      payload: { close_reason: "withdrawn upstream", closing_actor: "external_observer" },
    });
    const closedFirstEvent = eventsForSubject(store.db, "pr_series", closedFirst.series_id).at(-1)!;
    expect(closedFirstEvent.payload).toEqual({
      close_reason: "withdrawn upstream",
      closing_actor: "external_observer",
      from_status: "approved",
      to_status: "closed",
    });

    transitionPrSeries(store, "series-2", {
      actor: "operator",
      commandId: "command-close-second-series",
      correlationId: campaign.campaign_id,
      eventType: "pr.series_closed",
      expectedRevision: 0,
      patch: { status: "closed" },
      payload: { close_reason: "campaign complete", closing_actor: "operator" },
    });
    const completed = transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "command-close-campaign-exact",
      correlationId: campaign.campaign_id,
      eventType: "pr.campaign_closed",
      expectedRevision: campaign.revision,
      patch: { status: "completed" },
      payload: {
        outcome: "completed",
        per_series_terminal_summary: { "series-1": "closed", "series-2": "closed" },
      },
    });
    expect(eventsForSubject(store.db, "pr_campaign", completed.campaign_id).at(-1)!.payload).toEqual({
      outcome: "completed",
      per_series_terminal_summary: { "series-1": "closed", "series-2": "closed" },
      from_status: "working",
      to_status: "completed",
    });
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
      correlationId: "session-1",
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
      correlationId: "session-1",
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
      correlationId: "pr-campaign-1",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const campaignEvents = eventsForSubject(store.db, "pr_campaign", campaign.campaign_id);
    expect(campaignEvents).toHaveLength(campaignEventCount + 1);
    expect(campaignEvents.at(-1)).toMatchObject({
      eventType: "pr.campaign_working",
      correlationId: campaign.campaign_id,
      payload: { from_status: "preparing", to_status: "working" },
    });
    expect(campaign).toMatchObject({ revision: 1, status: "working" });
    expect(campaign.caused_by_event_id).toBe(campaignEvents.at(-1)!.eventId);

    const initialSeries = store.db.query("SELECT revision FROM pr_series WHERE series_id = 'series-1'").get() as { revision: number };
    const series = transitionPrSeries(store, "series-1", {
      actor: "operator",
      commandId: "command-publish-series-1",
      correlationId: "pr-campaign-1",
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
      correlationId: "pr-campaign-1",
      expectedRevision: campaign.revision,
      patch: { status: "working" },
    });
    const published = transitionPrSeries(store, "series-1", {
      actor: "operator",
      commandId: "command-publish-series-1",
      correlationId: "pr-campaign-1",
      expectedRevision: 0,
      patch: { status: "published", upstreamPrNumber: 2850 },
      payload: { upstream_pr_number: 2850, branch: "codex/split-01-alpha", batch_index: 0 },
    });
    const beforeStale = eventsForSubject(store.db, "pr_series", "series-1").length;
    expect(() =>
      transitionPrSeries(store, "series-1", {
        actor: "external_observer",
        commandId: "command-stale-approval",
        correlationId: "pr-campaign-1",
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
        correlationId: "pr-campaign-1",
        expectedRevision: published.revision,
        patch: { status: "approved" },
        payload: {
          approval_source_identity: "github-review:PRR_rollback",
          approved_revision: "head-sha-approved",
          approving_actor: "octocat",
        },
      }),
    ).toThrow("reject PR series transition");
    expect(eventsForSubject(store.db, "pr_series", "series-1")).toHaveLength(beforeStale);
    expect(store.db.query("SELECT revision, status FROM pr_series WHERE series_id = 'series-1'").get()).toEqual({
      revision: published.revision,
      status: "published",
    });
  });
});
