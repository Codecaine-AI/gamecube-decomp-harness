import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createProjectSession } from "@server/core/project-session/store.js";
import { recordSavePointAnchor } from "@server/core/project-session/timeline.js";
import { listProjectEvents } from "@server/core/project-state/events.js";
import { initializeProjectState, requestDispatch } from "@server/core/project-state";
import { activateAcquiredPrCampaign } from "./activation.js";
import { adoptLegacyPrSeries } from "./adoption.js";
import { listPrSeriesForCampaign, openPrCampaign } from "./state.js";

const stores: StateStore[] = [];
const dirs: string[] = [];

function fixture() {
  const stateDir = mkdtempSync(join(tmpdir(), "pr-campaign-adoption-"));
  dirs.push(stateDir);
  const store = openState(stateDir);
  stores.push(store);
  createProjectSession(store.db, {
    baseSha: "session-head",
    id: "project-session:session-1",
    projectId: "melee",
    sessionUuid: "session-1",
  });
  store.db.query("INSERT INTO campaigns (id, project_id, base_ref, created_at) VALUES (?, ?, ?, ?)")
    .run("legacy", "melee", "origin/master", "2026-08-13T10:00:00.000Z");
  store.db.query(
    `INSERT INTO save_points (
       id, campaign_id, trigger_kind, label, commit_sha, worktree_dirty, committed, payload_json, created_at
     ) VALUES ('save-1', 'legacy', 'manual', 'stable', 'session-head', 0, 1, '{}', '2026-08-13T10:01:00.000Z')`,
  ).run();
  recordSavePointAnchor(store, {
    actor: "operator",
    commandId: "command-anchor",
    commitSha: "session-head",
    projectId: "melee",
    savePointId: "save-1",
    triggerKind: "manual",
  });
  openPrCampaign(store, {
    actor: "operator",
    campaignId: "campaign-1",
    commandId: "command-open",
    namedSavePointId: "save-1",
    projectId: "melee",
    publicationPolicy: { batch_size: 2 },
    sessionUuid: "session-1",
  }, { allowEmptyForLegacyAdoption: true });
  initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
  const dispatch = requestDispatch(store, {
    actor: "operator",
    commandId: "command-dispatch",
    kind: "pr",
    projectId: "melee",
    reason: "adopt legacy",
    workflowId: "campaign-1",
  });
  if (dispatch.queued) throw new Error("fixture lease queued unexpectedly");
  activateAcquiredPrCampaign({
    campaignId: "campaign-1",
    commandId: "command-activate",
    leaseId: dispatch.leaseId,
    projectId: "melee",
    store,
  });
  return { leaseId: dispatch.leaseId, store };
}

function realShapeFixture() {
  return {
    schemaVersion: "session_pr_records_v2",
    batchLimit: 3,
    syncedAt: "2026-08-13T11:00:00.000Z",
    repo: "doldecomp/melee",
    upstreamOpen: 2,
    records: [
      {
        sliceId: "split-01-gm-mode-flow",
        displayName: "1/14: GM Mode Flow",
        branch: "codex/split-01-gm-mode-flow",
        title: "1/14: GM Mode Flow",
        scope: "split-series",
        files: ["src/melee/gm/gm_1601.c"],
        status: "merged",
        baseSha: "f1fd53ee09775223f8ea1fe6b7d84bf9eed65682",
        sourcePlan: { source: "local_branch_discovery", baseRef: "origin/master" },
        local: { status: "local_only", branch: "codex/split-01-gm-mode-flow", commitSha: "c979bfd" },
        validation: { status: "not_run", checkedAt: "", regressions: 0 },
        batch: { state: "unbatched", ordinal: 1, selectedAt: "", publishedAt: "" },
        schemaVersion: "session_pr_record_v1",
        runId: "run-legacy",
        sessionId: "run:run-legacy",
        github: {
          status: "merged",
          prNumber: 2704,
          url: "https://github.com/doldecomp/melee/pull/2704",
          ci: "passing",
          comments: 2,
          author: "fjooord",
          updatedAt: "2026-06-17T05:51:14Z",
        },
        review: { subState: "", lastSeenComments: 2 },
        prNumber: 2704,
        url: "https://github.com/doldecomp/melee/pull/2704",
        comments: 2,
        ci: "passing",
      },
      {
        sliceId: "split-02-ft-root",
        displayName: "2/14: FT Root",
        branch: "codex/split-02-ft-root",
        title: "2/14: FT Root",
        scope: "split-series",
        files: ["src/melee/ft/ftcoll.c"],
        supportFiles: ["config/GALE01/symbols.txt"],
        status: "open",
        sourcePlan: { source: "local_branch_discovery", baseRef: "origin/master" },
        local: { status: "local_only", branch: "codex/split-02-ft-root", commitSha: "deadbee" },
        validation: { status: "passed", checkedAt: "2026-07-17T20:35:05.951Z", regressions: 0 },
        batch: { state: "unbatched", ordinal: 2, selectedAt: "", publishedAt: "" },
        schemaVersion: "session_pr_record_v1",
        runId: "run-legacy",
        sessionId: "run:run-legacy",
        github: {
          status: "open",
          prNumber: 2893,
          url: "https://github.com/doldecomp/melee/pull/2893",
          ci: "failing",
          comments: 2,
          author: "fjooord",
          updatedAt: "2026-07-15T20:13:23Z",
        },
        review: { subState: "changes_requested", lastSeenComments: 19 },
        prNumber: 2893,
        url: "https://github.com/doldecomp/melee/pull/2893",
        comments: 2,
        ci: "failing",
      },
    ],
  };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("legacy PR campaign adoption", () => {
  test("adopts the real artifact shape plus discovered split branches exactly once", () => {
    const { leaseId, store } = fixture();
    const recordsPayload = realShapeFixture();
    const evidenceBefore = JSON.stringify(recordsPayload);
    const input = {
      campaignId: "campaign-1",
      commandId: "command-adopt",
      discoveredBranches: [
        "codex/split-01-gm-mode-flow",
        "codex/split-02-ft-root",
        "codex/split-03-new-local",
      ],
      leaseId,
      projectId: "melee",
      recordsPayload,
      store,
    };

    const first = adoptLegacyPrSeries(input);
    expect(first.adopted).toHaveLength(2);
    expect(first.skippedSeriesIds).toEqual([]);
    expect(listPrSeriesForCampaign(store, "campaign-1").map((series) => ({
      batch: series.batch_index,
      branch: series.branch,
      pr: series.upstream_pr_number,
      status: series.status,
      targets: series.target_units,
    })).sort((left, right) => left.branch.localeCompare(right.branch))).toEqual([
      {
        batch: 0,
        branch: "codex/split-02-ft-root",
        pr: 2893,
        status: "changes_requested",
        targets: ["src/melee/ft/ftcoll.c", "config/GALE01/symbols.txt"],
      },
      {
        batch: 0,
        branch: "codex/split-03-new-local",
        pr: null,
        status: "prepared",
        targets: [],
      },
    ]);
    expect(store.db.query("SELECT COUNT(*) AS count FROM pr_work_items").get()).toEqual({ count: 1 });
    expect(listProjectEvents(store.db).filter((event) => event.eventType === "pr.feedback_ingested")).toHaveLength(1);
    const eventsAfterFirst = listProjectEvents(store.db).length;

    const second = adoptLegacyPrSeries({ ...input, commandId: "command-adopt-again" });
    expect(second.adopted).toEqual([]);
    expect(second.skippedSeriesIds).toHaveLength(2);
    expect(listProjectEvents(store.db)).toHaveLength(eventsAfterFirst);
    expect(listPrSeriesForCampaign(store, "campaign-1")).toHaveLength(2);
    expect(JSON.stringify(recordsPayload)).toBe(evidenceBefore);
  });

  test("terminal-only legacy evidence is unavailable, including discovered fallback branches", () => {
    const { leaseId, store } = fixture();
    expect(() => adoptLegacyPrSeries({
      campaignId: "campaign-1",
      commandId: "command-adopt-terminal",
      discoveredBranches: ["codex/split-01-done"],
      leaseId,
      projectId: "melee",
      recordsPayload: {
        records: [{ branch: "codex/split-01-done", status: "closed", prNumber: 42 }],
      },
      store,
    })).toThrow("No codex/split-* legacy PR series were found to adopt");
    expect(listPrSeriesForCampaign(store, "campaign-1")).toEqual([]);
  });
});
