import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createProjectSession, getProjectSessionByUuid } from "@server/core/project-session/store.js";
import { recordSavePointAnchor } from "@server/core/project-session/timeline.js";
import { eventsForSubject } from "@server/core/project-state/events.js";
import { getProjectState, initializeProjectState, requestDispatch } from "@server/core/project-state";
import { activateRun, settlePausedRun } from "@server/core/session-runtime/phases/running/run-control.js";
import { createRun, getRun } from "@server/core/session-runtime/run-state";
import { handlePrApiRoute } from "@server/api/routes/pr.js";
import { activateAcquiredPrCampaign } from "./activation.js";
import { createPrCampaignRuntime } from "./runtime.js";
import { getPrCampaign, getPrSeries, listPrSeriesForCampaign, openPrCampaign, transitionPrCampaign, transitionPrSeries } from "./state.js";
import { ingestPrFeedback } from "./work-items.js";

const stores: StateStore[] = [];
const dirs: string[] = [];

interface FixtureOptions {
  discoveredBranches?: string[];
  legacyRecords?: Record<string, unknown>;
  openCampaign?: boolean;
}

function fixture(options: FixtureOptions = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), "pr-campaign-activation-"));
  dirs.push(stateDir);
  const store = openState(stateDir);
  stores.push(store);
  createProjectSession(store.db, {
    baseSha: "session-head",
    id: "project-session:session-1",
    projectId: "melee",
    sessionUuid: "session-1",
  });
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
    commandId: "command-anchor",
    commitSha: "session-head",
    occurredAt: "2026-08-13T10:01:00.000Z",
    projectId: "melee",
    savePointId: "save-point-1",
    triggerKind: "manual",
  });
  if (options.openCampaign !== false) {
    openPrCampaign(store, {
      actor: "operator",
      campaignId: "campaign-1",
      commandId: "command-open",
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
  }
  if (options.legacyRecords) {
    const directory = join(stateDir, "pr_handoff");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "pr_records.json"), JSON.stringify(options.legacyRecords));
  }
  const qaRepairBodies: Array<Record<string, unknown>> = [];
  const runtime = createPrCampaignRuntime({
    handoff: {
      openPrForSliceUnderLease: async () => ({}),
      runQaRepairForPr: async (body) => {
        qaRepairBodies.push(body);
        return { status: "passed" };
      },
    },
    prSync: { syncPrRecords: async () => options.legacyRecords ?? ({ records: [] }) },
    resolveDashboardProject: () => ({
      graphDbPath: join(stateDir, "graph.sqlite"),
      project: { projectId: "melee" },
      repoRoot: stateDir,
      stateDir,
    } as never),
    runGit: async () => ({
      exitCode: 0,
      stdout: (options.discoveredBranches ?? []).join("\n"),
      stderr: "",
    }),
  });
  return { qaRepairBodies, runtime, stateDir, store };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("PR campaign activation lease", () => {
  test("rejects an empty campaign and closes only after its derived series is terminal", async () => {
    const { runtime, store } = fixture({ openCampaign: false });

    await expect(runtime.openCampaign({
      campaignId: "campaign-opened-by-runtime",
      projectId: "melee",
    })).rejects.toThrow("requires at least one series");
    const opened = await runtime.openCampaign({
      campaignId: "campaign-opened-by-runtime",
      projectId: "melee",
      series: [{
        batchIndex: 0,
        branch: "codex/split-01-runtime",
        seriesId: "series-runtime",
        targetUnits: ["src/runtime.c"],
      }],
    });
    expect(opened).toMatchObject({ campaign_id: "campaign-opened-by-runtime", status: "preparing" });
    await expect(runtime.closeCampaign({
      campaignId: opened.campaign_id,
      confirmed: true,
      projectId: "melee",
    })).rejects.toThrow("pr.close_campaign is blocked");
    transitionPrSeries(store, "series-runtime", {
      actor: "operator",
      commandId: "command-close-runtime-series",
      eventType: "pr.series_closed",
      expectedRevision: getPrSeries(store, "series-runtime")!.revision,
      patch: { status: "closed" },
      payload: { close_reason: "test complete", closing_actor: "operator" },
    });
    await expect(runtime.closeCampaign({
      campaignId: opened.campaign_id,
      projectId: "melee",
    })).rejects.toThrow("pr.close_campaign requires operator confirmation");

    const closed = await runtime.closeCampaign({
      campaignId: opened.campaign_id,
      confirmed: true,
      projectId: "melee",
    });
    expect(closed).toMatchObject({ status: "completed", closed_at: expect.any(String) });
    expect(getPrCampaign(store, opened.campaign_id)?.status).toBe("completed");
  });

  test("acquires and releases a free lease with a durable pr_phase entry pair", async () => {
    const { runtime, store } = fixture();
    const beforeRevision = getProjectSessionByUuid(store.db, "session-1")!.revision;

    const activated = await runtime.activate({ projectId: "melee", campaignId: "campaign-1" });
    expect(activated).toMatchObject({ queued: false, run_draining: false, campaign: { status: "working" } });
    expect(getProjectState(store, "melee")?.active_workflow).toMatchObject({
      kind: "pr",
      workflow_id: "campaign-1",
      status: "active",
    });

    const released = await runtime.release({ projectId: "melee", campaignId: "campaign-1" });
    expect(released.campaign.status).toBe("in_review");
    expect(getProjectState(store, "melee")?.active_workflow ?? null).toBeNull();
    const entries = store.db
      .query(
        `SELECT entry_id, payload_json, caused_by_event_id
         FROM session_timeline_entries
         WHERE session_uuid = 'session-1' AND entry_kind = 'pr_phase'
         ORDER BY id`,
      )
      .all() as Array<{ caused_by_event_id: string; entry_id: string; payload_json: string }>;
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => JSON.parse(entry.payload_json).boundary)).toEqual(["acquired", "released"]);
    expect(entries[0]!.entry_id).toContain(activated.lease_id!);
    expect(entries[1]!.entry_id).toContain(activated.lease_id!);
    const campaignEvents = eventsForSubject(store.db, "pr_campaign", "campaign-1");
    expect(campaignEvents.map((event) => event.eventType)).toEqual([
      "pr.campaign_opened",
      "pr.campaign_working",
      "pr.campaign_in_review",
    ]);
    expect(entries.map((entry) => entry.caused_by_event_id)).toEqual([
      campaignEvents[1]!.eventId,
      campaignEvents[2]!.eventId,
    ]);
    expect(getProjectSessionByUuid(store.db, "session-1")!.revision).toBe(beforeRevision + 2);
  });

  test("queues behind an active run and activates atomically when the run settles", async () => {
    const { runtime, stateDir, store } = fixture();
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      1,
      { projectId: "melee", repoRoot: stateDir, stateDir },
      { baseRevision: "session-head" },
    );
    const active = activateRun({ projectId: "melee", reason: "run first", runId: run.id, store });

    const queued = await runtime.activate({ projectId: "melee", campaignId: "campaign-1" });
    expect(queued).toMatchObject({ queued: true, run_draining: true, lease_id: null });
    expect(getRun(store, run.id)?.status).toBe("draining");
    expect(getPrCampaign(store, "campaign-1")?.status).toBe("preparing");

    settlePausedRun({
      actor: "guardian",
      leaseId: active.leaseId,
      reason: "run drained for PR",
      runId: run.id,
      store,
    });
    expect(getRun(store, run.id)?.status).toBe("paused");
    expect(getPrCampaign(store, "campaign-1")?.status).toBe("working");
    expect(getProjectState(store, "melee")?.active_workflow).toMatchObject({
      kind: "pr",
      workflow_id: "campaign-1",
      status: "active",
    });
    expect(store.db.query(
      "SELECT COUNT(*) AS count FROM session_timeline_entries WHERE entry_kind = 'pr_phase'",
    ).get()).toEqual({ count: 1 });
  });

  test("rolls back lease, campaign, event, and timeline when the pr_phase insert fails", async () => {
    const { runtime, store } = fixture();
    store.db.exec(`
      CREATE TRIGGER reject_pr_phase
      BEFORE INSERT ON session_timeline_entries
      WHEN NEW.entry_kind = 'pr_phase'
      BEGIN
        SELECT RAISE(ABORT, 'test pr_phase failure');
      END
    `);

    await expect(runtime.activate({ projectId: "melee", campaignId: "campaign-1" }))
      .rejects.toThrow("test pr_phase failure");
    expect(getProjectState(store, "melee")?.active_workflow ?? null).toBeNull();
    expect(getPrCampaign(store, "campaign-1")?.status).toBe("preparing");
    expect(eventsForSubject(store.db, "pr_campaign", "campaign-1").map((event) => event.eventType))
      .toEqual(["pr.campaign_opened"]);
    expect(store.db.query(
      "SELECT COUNT(*) AS count FROM session_timeline_entries WHERE entry_kind = 'pr_phase'",
    ).get()).toEqual({ count: 0 });
  });

  test("recovers a stale activation with release evidence", async () => {
    const { runtime, store } = fixture();
    const activated = await runtime.activate({ projectId: "melee", campaignId: "campaign-1" });
    const row = store.db
      .query("SELECT active_workflow_json FROM project_state WHERE project_id = 'melee'")
      .get() as { active_workflow_json: string };
    store.db
      .query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = 'melee'")
      .run(JSON.stringify({ ...JSON.parse(row.active_workflow_json), heartbeat_at: "2026-08-13T10:00:00.000Z" }));

    await expect(runtime.recoverCampaign({
      campaignId: "campaign-1",
      now: "2026-08-13T10:30:00.000Z",
      projectId: "melee",
    })).rejects.toThrow("pr.campaign_recover requires operator confirmation");
    const recovered = await runtime.recoverCampaign({
      campaignId: "campaign-1",
      confirmed: true,
      now: "2026-08-13T10:30:00.000Z",
      projectId: "melee",
      reason: "stale activation",
    });
    expect(recovered.status).toBe("in_review");
    expect(getProjectState(store, "melee")?.active_workflow).toBeNull();
    expect(store.db.query(
      "SELECT COUNT(*) AS count FROM session_timeline_entries WHERE entry_id = ?",
    ).get(`pr-phase:${activated.lease_id}:released`)).toEqual({ count: 1 });
    expect(eventsForSubject(store.db, "pr_campaign", "campaign-1").at(-1)?.eventType)
      .toBe("pr.campaign_recovered");
  });

  test("abandons a working campaign and releases its activation atomically", async () => {
    const { runtime, store } = fixture();
    await runtime.activate({ projectId: "melee", campaignId: "campaign-1" });

    const abandoned = await runtime.abandonCampaign({
      campaignId: "campaign-1",
      confirmed: true,
      projectId: "melee",
      reason: "operator discarded campaign",
    });
    expect(abandoned.status).toBe("abandoned");
    expect(getProjectState(store, "melee")?.active_workflow).toBeNull();
    expect(eventsForSubject(store.db, "pr_campaign", "campaign-1").map((event) => event.eventType))
      .toEqual([
        "pr.campaign_opened",
        "pr.campaign_working",
        "pr.campaign_closed",
      ]);
  });

  test("adopts legacy records by opening and activating a campaign in one command", async () => {
    const records = {
      schemaVersion: "session_pr_records_v2",
      records: [{
        branch: "codex/split-01-alpha",
        prNumber: 2850,
        status: "open",
      }],
    };
    const { runtime, store } = fixture({
      discoveredBranches: ["codex/split-01-alpha"],
      legacyRecords: records,
      openCampaign: false,
    });

    const result = await runtime.adoptLegacy({ projectId: "melee" });
    expect(result.adopted).toEqual([
      expect.objectContaining({
        branch: "codex/split-01-alpha",
        status: "published",
        upstream_pr_number: 2850,
      }),
    ]);
    const campaign = getPrCampaign(store, result.adopted[0]!.campaign_id);
    expect(campaign?.status).toBe("working");
    expect(getProjectState(store, "melee")?.active_workflow).toMatchObject({
      kind: "pr",
      workflow_id: campaign?.campaign_id,
    });
  });

  test("fences claim, resolve, revise, and decline commands with the current PR lease", async () => {
    const { runtime, store } = fixture();
    const activated = await runtime.activate({ campaignId: "campaign-1", projectId: "melee" });
    const published = transitionPrSeries(store, "series-1", {
      actor: "operator",
      commandId: "command-publish-for-fixer",
      expectedRevision: 0,
      patch: { status: "published", upstreamPrNumber: 2850 },
      payload: { batch_index: 0, branch: "codex/split-01-alpha", upstream_pr_number: 2850 },
    });
    const feedback = ingestPrFeedback(store, {
      commandId: "observe-fixer-feedback",
      expectedRevision: published.revision,
      items: [{ itemId: "item-fix", sourceKind: "review", sourceId: "comment-fix", summary: "Fix this" }],
      seriesId: "series-1",
    });

    await expect(runtime.claimWorkItems({
      itemIds: ["item-fix"],
      leaseId: activated.lease_id,
      seriesId: "series-1",
    })).rejects.toThrow("requires a projectId");
    await expect(runtime.claimWorkItems({
      itemIds: ["item-fix"],
      leaseId: "lease-stale",
      projectId: "melee",
      seriesId: "series-1",
    })).rejects.toThrow("stale");

    const claimed = await runtime.claimWorkItems({
      itemIds: ["item-fix"],
      leaseId: activated.lease_id,
      projectId: "melee",
      seriesId: "series-1",
    });
    expect(claimed).toMatchObject({
      status: "revising",
      work_items: [{ item_id: "item-fix", status: "in_progress" }],
    });
    const resolved = await runtime.resolveWorkItems({
      itemIds: ["item-fix"],
      leaseId: activated.lease_id,
      projectId: "melee",
      resolution: "updated the declaration",
      seriesId: "series-1",
    });
    expect(resolved).toMatchObject({
      status: "revising",
      work_items: [{ item_id: "item-fix", status: "resolved" }],
    });
    const revised = await runtime.reviseWorkItems({
      leaseId: activated.lease_id,
      projectId: "melee",
      pushedRevision: "revision-after-fix",
      seriesId: "series-1",
    });
    expect(revised.status).toBe("published");
    expect(eventsForSubject(store.db, "pr_series", "series-1").slice(-3).map((event) => event.eventType))
      .toEqual(["pr.series_revising", "pr.series_revising", "pr.series_revised"]);

    const declinedFeedback = ingestPrFeedback(store, {
      commandId: "observe-declined-feedback",
      expectedRevision: revised.revision,
      items: [{ itemId: "item-decline", sourceKind: "review", sourceId: "comment-decline", summary: "Do not do this" }],
      seriesId: "series-1",
    });
    await expect(runtime.declineWorkItems({
      itemIds: ["item-decline"],
      leaseId: activated.lease_id,
      projectId: "melee",
      seriesId: "series-1",
    })).rejects.toThrow("decline reason is required");
    expect(getPrSeries(store, "series-1")?.revision).toBe(declinedFeedback.series.revision);
    const declined = await runtime.declineWorkItems({
      itemIds: ["item-decline"],
      leaseId: activated.lease_id,
      projectId: "melee",
      reason: "conflicts with the upstream ABI",
      seriesId: "series-1",
    });
    expect(declined.status).toBe("revising");
    expect(declined.work_items.find((item) => item.item_id === "item-decline"))
      .toMatchObject({ item_id: "item-decline", status: "declined" });
    expect(eventsForSubject(store.db, "pr_series", "series-1").at(-1)?.payload).toMatchObject({
      decline_reason: "conflicts with the upstream ABI",
      declined_work_item_ids: ["item-decline"],
    });
  });

  test("routes QA repair through the campaign fence and threads both lease field spellings", async () => {
    const { qaRepairBodies, runtime } = fixture();
    const activated = await runtime.activate({ campaignId: "campaign-1", projectId: "melee" });

    await expect(runtime.runQaRepair({ campaignId: "campaign-1", projectId: "melee" }))
      .rejects.toThrow("requires the current leaseId");
    const result = await runtime.runQaRepair({
      campaignId: "campaign-1",
      leaseId: activated.lease_id,
      projectId: "melee",
    });
    expect(result).toEqual({ status: "passed" });
    expect(qaRepairBodies).toEqual([expect.objectContaining({
      campaignId: "campaign-1",
      leaseId: activated.lease_id,
      lease_id: activated.lease_id,
      projectId: "melee",
    })]);
  });

  test("recovery uses server time and returns interrupted fixers to review", async () => {
    const { runtime, store } = fixture();
    const activated = await runtime.activate({ campaignId: "campaign-1", projectId: "melee" });
    const published = transitionPrSeries(store, "series-1", {
      actor: "operator",
      commandId: "publish-recovery-series",
      expectedRevision: 0,
      patch: { status: "published", upstreamPrNumber: 2850 },
      payload: { batch_index: 0, branch: "codex/split-01-alpha", upstream_pr_number: 2850 },
    });
    const feedback = ingestPrFeedback(store, {
      commandId: "observe-recovery-feedback",
      expectedRevision: published.revision,
      items: [{ itemId: "item-recover", sourceKind: "review", sourceId: "comment-recover", summary: "Recover me" }],
      seriesId: "series-1",
    });
    await runtime.claimWorkItems({
      itemIds: ["item-recover"],
      leaseId: activated.lease_id,
      projectId: "melee",
      seriesId: feedback.series.series_id,
    });
    const row = store.db.query("SELECT active_workflow_json FROM project_state WHERE project_id = 'melee'").get() as { active_workflow_json: string };
    const lease = JSON.parse(row.active_workflow_json);
    store.db.query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = 'melee'")
      .run(JSON.stringify({ ...lease, heartbeat_at: "2000-01-01T00:00:00.000Z" }));

    const recovered = await runtime.recoverCampaign({
      campaignId: "campaign-1",
      confirmed: true,
      now: "1900-01-01T00:00:00.000Z",
      projectId: "melee",
      reason: "interrupted fixer",
    });
    expect(recovered.status).toBe("in_review");
    expect(getPrSeries(store, "series-1")).toMatchObject({
      status: "changes_requested",
      work_items: [{ item_id: "item-recover", status: "pending", resolved_at: null }],
    });
    expect(eventsForSubject(store.db, "pr_campaign", "campaign-1").at(-1)?.payload).toMatchObject({
      cancelled_subject_ids: ["series-1", "item-recover"],
      recovery_reason: "interrupted fixer",
    });
  });

  test("ignores caller-provided time when projecting stale recovery", async () => {
    const { runtime, store } = fixture();
    await runtime.activate({ campaignId: "campaign-1", projectId: "melee" });
    const row = store.db.query("SELECT active_workflow_json FROM project_state WHERE project_id = 'melee'").get() as { active_workflow_json: string };
    const lease = JSON.parse(row.active_workflow_json);
    store.db.query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = 'melee'")
      .run(JSON.stringify({ ...lease, heartbeat_at: "2999-01-01T00:00:00.000Z" }));

    const projected = runtime.action({
      campaignId: "campaign-1",
      now: "3999-01-01T00:00:00.000Z",
      projectId: "melee",
    }, "pr.campaign_recover");
    expect(projected.enabled).toBe(false);
    expect(projected.blocked_by.map((entry) => entry.code)).toContain("pr_activation_not_failed_or_stale");
  });

  test.each(["close", "abandon"] as const)("%s cancels queued activation before terminal CAS", async (outcome) => {
    const { runtime, stateDir, store } = fixture();
    if (outcome === "close") {
      transitionPrSeries(store, "series-1", {
        actor: "operator",
        commandId: "close-series-before-campaign",
        eventType: "pr.series_closed",
        expectedRevision: 0,
        patch: { status: "closed" },
        payload: { close_reason: "terminal test", closing_actor: "operator" },
      });
    }
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      1,
      { projectId: "melee", repoRoot: stateDir, stateDir },
      { baseRevision: "session-head" },
    );
    const activeRun = activateRun({ projectId: "melee", reason: "run first", runId: run.id, store });
    await runtime.activate({ campaignId: "campaign-1", projectId: "melee" });

    if (outcome === "close") {
      await runtime.closeCampaign({ campaignId: "campaign-1", confirmed: true, projectId: "melee" });
    } else {
      await runtime.abandonCampaign({ campaignId: "campaign-1", confirmed: true, projectId: "melee" });
    }
    const terminalState = getProjectState(store, "melee");
    expect(terminalState?.active_workflow).toMatchObject({ kind: "run", workflow_id: run.id });
    expect(terminalState?.active_workflow?.requested_handoff).toBeUndefined();
    expect(terminalState?.queued_dispatch_requests).toEqual([]);
    settlePausedRun({ leaseId: activeRun.leaseId, reason: "run settled", runId: run.id, store });
    expect(getProjectState(store, "melee")?.active_workflow).toBeNull();
    expect(getRun(store, run.id)?.status).toBe("paused");
  });

  test("run settlement does not promote a terminal queued campaign", async () => {
    const { runtime, stateDir, store } = fixture();
    const run = createRun(
      store,
      "matched_code_percent",
      100,
      1,
      { projectId: "melee", repoRoot: stateDir, stateDir },
      { baseRevision: "session-head" },
    );
    const activeRun = activateRun({ projectId: "melee", reason: "run first", runId: run.id, store });
    await runtime.activate({ campaignId: "campaign-1", projectId: "melee" });
    const campaign = getPrCampaign(store, "campaign-1")!;
    transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "simulate-terminal-race",
      eventType: "pr.campaign_closed",
      expectedRevision: campaign.revision,
      patch: { status: "abandoned" },
      payload: { outcome: "abandoned", per_series_terminal_summary: { "series-1": "prepared" } },
    });

    settlePausedRun({ leaseId: activeRun.leaseId, reason: "run settled", runId: run.id, store });
    expect(getProjectState(store, "melee")).toMatchObject({ active_workflow: null, queued_dispatch_requests: [] });
    expect(getPrCampaign(store, "campaign-1")?.status).toBe("abandoned");
  });

  test("activation refuses a terminal campaign even if a lease was minted for it", () => {
    const { store } = fixture();
    const campaign = getPrCampaign(store, "campaign-1")!;
    transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      commandId: "terminal-before-lease",
      eventType: "pr.campaign_closed",
      expectedRevision: campaign.revision,
      patch: { status: "abandoned" },
      payload: { outcome: "abandoned", per_series_terminal_summary: { "series-1": "prepared" } },
    });
    initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
    const dispatch = requestDispatch(store, {
      actor: "operator",
      commandId: "mint-terminal-pr-lease",
      kind: "pr",
      projectId: "melee",
      reason: "test guard",
      workflowId: "campaign-1",
    });
    if (dispatch.queued) throw new Error("terminal guard fixture unexpectedly queued");
    expect(() => activateAcquiredPrCampaign({
      campaignId: "campaign-1",
      commandId: "activate-terminal",
      leaseId: dispatch.leaseId,
      projectId: "melee",
      store,
    })).toThrow("Terminal PR campaign campaign-1 cannot acquire dispatch authority");
  });

  test("adoption retries return 200 at the route while conflicting campaigns return 409", async () => {
    const records = {
      schemaVersion: "session_pr_records_v2",
      records: [{ branch: "codex/split-01-alpha", prNumber: 2850, status: "open" }],
    };
    const adoptedFixture = fixture({
      discoveredBranches: ["codex/split-01-alpha"],
      legacyRecords: records,
      openCampaign: false,
    });
    const routeDeps = { ...adoptedFixture.runtime, json: (data: unknown, init?: ResponseInit) => Response.json(data, init) };
    const request = () => new Request("http://localhost/api/pr/adopt-legacy", {
      body: JSON.stringify({ projectId: "melee" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const first = await handlePrApiRoute(request(), new URL("http://localhost/api/pr/adopt-legacy"), routeDeps);
    const retry = await handlePrApiRoute(request(), new URL("http://localhost/api/pr/adopt-legacy"), routeDeps);
    expect(first?.status).toBe(200);
    expect(retry?.status).toBe(200);
    expect(await retry?.json()).toMatchObject({
      action_id: "pr.adopt_legacy",
      enabled: true,
      result: { adopted: [], skippedSeriesIds: [expect.any(String)] },
    });

    const conflicting = fixture({ legacyRecords: records });
    const conflictDeps = { ...conflicting.runtime, json: (data: unknown, init?: ResponseInit) => Response.json(data, init) };
    const conflict = await handlePrApiRoute(request(), new URL("http://localhost/api/pr/adopt-legacy"), conflictDeps);
    expect(conflict?.status).toBe(409);
    expect(await conflict?.json()).toMatchObject({ blocked_by: [{ code: "pr_campaign_open" }] });
  });

  test("derives campaign series from the final split plan and PR-record fallback", async () => {
    const planned = fixture({ openCampaign: false });
    const planDir = join(planned.stateDir, "pr_handoff", "run-plan", "split_plans", "20260813T120000Z");
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, "summary.json"), JSON.stringify({
      status: "passed",
      slices: [
        { branchName: "codex/split-01-plan", id: "plan", lane: "match", pathspecs: ["src/plan.c"] },
        { branchName: "codex/split-99-local", id: "local", lane: "local", pathspecs: ["src/local.c"] },
      ],
    }));
    const fromPlan = await planned.runtime.openCampaign({ projectId: "melee", runId: "run-plan" });
    expect(listPrSeriesForCampaign(planned.store, fromPlan.campaign_id)).toMatchObject([{
      batch_index: 0,
      branch: "codex/split-01-plan",
      target_units: ["src/plan.c"],
    }]);

    const fromRecordsFixture = fixture({
      legacyRecords: { records: [{ branch: "codex/split-01-record", files: ["src/record.c"] }] },
      openCampaign: false,
    });
    const fromRecords = await fromRecordsFixture.runtime.openCampaign({ projectId: "melee" });
    expect(listPrSeriesForCampaign(fromRecordsFixture.store, fromRecords.campaign_id)).toMatchObject([{
      batch_index: 0,
      branch: "codex/split-01-record",
      target_units: ["src/record.c"],
    }]);
  });

  test("projects pr_already_active instead of enabling activate twice", async () => {
    const { runtime } = fixture();
    await runtime.activate({ campaignId: "campaign-1", projectId: "melee" });
    expect(runtime.action({ campaignId: "campaign-1", projectId: "melee" }, "pr.activate")).toMatchObject({
      blocked_by: [{ code: "pr_already_active" }],
      enabled: false,
    });
  });
});
