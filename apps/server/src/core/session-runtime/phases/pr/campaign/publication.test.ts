import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { prBatchPublicationReservationsMigration } from "@server/core/orchestrator-state/storage/migrations/015-pr-batch-publication-reservations.js";
import { createProjectSession } from "@server/core/project-session/store.js";
import { recordSavePointAnchor } from "@server/core/project-session/timeline.js";
import { eventsForSubject } from "@server/core/project-state/events.js";
import { initializeProjectState, requestDispatch } from "@server/core/project-state";
import { activateAcquiredPrCampaign } from "./activation.js";
import { prPublishBatchBlockers, publishPrBatch } from "./publication.js";
import { getPrCampaign, listPrSeriesForCampaign, openPrCampaign } from "./state.js";

const stores: StateStore[] = [];
const dirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  const stderr = new TextDecoder().decode(result.stderr);
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  return new TextDecoder().decode(result.stdout).trim();
}

function fixture() {
  const stateDir = tempDir("pr-campaign-publish-state-");
  const store = openState(stateDir);
  prBatchPublicationReservationsMigration.up(store.db);
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
    occurredAt: "2026-08-13T10:01:00.000Z",
    projectId: "melee",
    savePointId: "save-1",
    triggerKind: "manual",
  });
  const validation = {
    result: "clean",
    source_revision: "session-head",
    validated_at: "2026-08-13T10:02:00.000Z",
  };
  openPrCampaign(store, {
    actor: "operator",
    campaignId: "campaign-1",
    commandId: "command-open",
    namedSavePointId: "save-1",
    projectId: "melee",
    publicationPolicy: { batch_size: 2 },
    series: [
      { batchIndex: 0, branch: "codex/split-01-alpha", lastValidation: validation, seriesId: "series-1", targetUnits: ["src/a.c"] },
      { batchIndex: 0, branch: "codex/split-02-beta", lastValidation: validation, seriesId: "series-2", targetUnits: ["src/b.c"] },
    ],
    sessionUuid: "session-1",
  });
  initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
  const dispatch = requestDispatch(store, {
    actor: "operator",
    commandId: "command-pr-dispatch",
    kind: "pr",
    projectId: "melee",
    reason: "publish fixture",
    workflowId: "campaign-1",
  });
  if (dispatch.queued) throw new Error("fixture lease queued unexpectedly");
  activateAcquiredPrCampaign({
    campaignId: "campaign-1",
    commandId: "command-pr-activate",
    leaseId: dispatch.leaseId,
    projectId: "melee",
    store,
  });
  return { leaseId: dispatch.leaseId, stateDir, store };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("PR campaign batch publication", () => {
  test("pushes the next validated batch to a temporary remote and records upstream PR numbers", async () => {
    const { leaseId, store } = fixture();
    const source = tempDir("pr-campaign-publish-source-");
    const remote = tempDir("pr-campaign-publish-remote-");
    git(source, ["init", "-q"]);
    git(remote, ["init", "--bare", "-q"]);
    writeFileSync(join(source, "README.md"), "fixture\n");
    git(source, ["add", "README.md"]);
    git(source, ["-c", "user.name=PR Test", "-c", "user.email=pr@example.invalid", "commit", "-qm", "fixture"]);
    git(source, ["remote", "add", "fork", remote]);
    for (const branch of ["codex/split-01-alpha", "codex/split-02-beta"]) git(source, ["branch", branch]);
    let prNumber = 100;

    const result = await publishPrBatch({
      campaignId: "campaign-1",
      commandId: "command-publish",
      confirmed: true,
      leaseId,
      projectId: "melee",
      publishSeries: async (series, revalidateLease) => {
        revalidateLease();
        git(source, ["push", "fork", `${series.branch}:${series.branch}`]);
        return { upstreamPrNumber: ++prNumber };
      },
      store,
    });

    expect(result.batch_index).toBe(0);
    expect(result.series.map((series) => [series.series_id, series.upstream_pr_number])).toEqual([
      ["series-1", 101],
      ["series-2", 102],
    ]);
    for (const series of result.series) {
      expect(git(remote, ["rev-parse", `refs/heads/${series.branch}`])).toHaveLength(40);
      expect(eventsForSubject(store.db, "pr_series", series.series_id).at(-1)).toMatchObject({
        eventType: "pr.series_published",
        payload: { upstream_pr_number: series.upstream_pr_number },
      });
    }
    expect(eventsForSubject(store.db, "pr_campaign", "campaign-1").at(-1)).toMatchObject({
      eventType: "pr.batch_published",
      payload: { batch_index: 0, series_ids: ["series-1", "series-2"] },
    });
    expect(listPrSeriesForCampaign(store, "campaign-1").every((series) => series.status === "published")).toBe(true);
  });

  test("blocks unvalidated and sync-invalidated series before any publisher runs", async () => {
    const { leaseId, store } = fixture();
    store.db.query("UPDATE pr_series SET last_validation_json = NULL WHERE series_id = 'series-1'").run();
    let called = 0;
    await expect(publishPrBatch({
      campaignId: "campaign-1",
      commandId: "command-unvalidated",
      confirmed: true,
      leaseId,
      projectId: "melee",
      publishSeries: async () => { called += 1; return { upstreamPrNumber: 1 }; },
      store,
    })).rejects.toThrow("lacks clean validation");
    expect(called).toBe(0);

    store.db.query(
      `UPDATE pr_series SET last_validation_json = ? WHERE series_id = 'series-1'`,
    ).run(JSON.stringify({ result: "clean", source_revision: "session-head", validated_at: "2026-08-13T10:02:00.000Z" }));
    store.db.query(
      `INSERT INTO sync_invalidations (
         invalidation_id, sync_id, project_id, session_uuid, subject_kind,
         subject_id, reason, caused_by_event_id, created_at
       ) VALUES ('invalidation-1', 'sync-1', 'melee', 'session-1', 'pr_snapshot',
                 'series-2', 'upstream changed the branch', 'event-sync-1', '2026-08-13T10:03:00.000Z')`,
    ).run();
    const campaign = getPrCampaign(store, "campaign-1")!;
    expect(prPublishBatchBlockers(store, campaign).map((entry) => entry.code)).toContain("pr_series_sync_invalidated");
    await expect(publishPrBatch({
      campaignId: "campaign-1",
      commandId: "command-invalidated",
      confirmed: true,
      leaseId,
      projectId: "melee",
      publishSeries: async () => { called += 1; return { upstreamPrNumber: 1 }; },
      store,
    })).rejects.toThrow("invalidated after validation");
    expect(called).toBe(0);
  });

  test("retries external, series-commit, and batch-commit failures against one frozen reservation", async () => {
    const cases = ["external", "series_commit", "batch_commit"] as const;
    for (const failure of cases) {
      const { leaseId, store } = fixture();
      let publishCalls = 0;
      if (failure === "series_commit") {
        store.db.exec(`
          CREATE TRIGGER fail_series_publication_progress
          BEFORE UPDATE OF status ON pr_batch_publication_series
          WHEN NEW.status = 'published'
          BEGIN SELECT RAISE(ABORT, 'injected series completion failure'); END;
        `);
      }
      if (failure === "batch_commit") {
        store.db.exec(`
          CREATE TRIGGER fail_batch_publication_completion
          BEFORE UPDATE OF status ON pr_batch_publications
          WHEN NEW.status = 'completed'
          BEGIN SELECT RAISE(ABORT, 'injected batch completion failure'); END;
        `);
      }
      const publish = () => publishPrBatch({
        campaignId: "campaign-1",
        commandId: `command-retry-${failure}`,
        confirmed: true,
        leaseId,
        projectId: "melee",
        publishSeries: async () => {
          publishCalls += 1;
          if (failure === "external" && publishCalls === 1) throw new Error("injected external failure");
          return { upstreamPrNumber: 200 + publishCalls };
        },
        store,
      });

      await expect(publish()).rejects.toThrow("injected");
      const frozen = store.db.query(
        "SELECT batch_index, series_ids_json, idempotency_key, status, owner_token FROM pr_batch_publications",
      ).get() as Record<string, unknown>;
      expect(frozen).toMatchObject({
        batch_index: 0,
        idempotency_key: `command-retry-${failure}`,
        owner_token: null,
        series_ids_json: JSON.stringify(["series-1", "series-2"]),
        status: "reserved",
      });

      if (failure === "series_commit") store.db.exec("DROP TRIGGER fail_series_publication_progress");
      if (failure === "batch_commit") store.db.exec("DROP TRIGGER fail_batch_publication_completion");
      const result = await publish();
      expect(result.idempotency_key).toBe(`command-retry-${failure}`);
      expect(result.series.map((series) => series.series_id)).toEqual(["series-1", "series-2"]);
      const callsAfterCompletion = publishCalls;
      await expect(publish()).resolves.toMatchObject({ idempotency_key: `command-retry-${failure}` });
      expect(publishCalls).toBe(callsAfterCompletion);
      expect(eventsForSubject(store.db, "pr_campaign", "campaign-1")
        .filter((event) => event.eventType === "pr.batch_published")).toHaveLength(1);
      expect(store.db.query("SELECT status, batch_event_id FROM pr_batch_publications").get()).toMatchObject({
        status: "completed",
        batch_event_id: expect.any(String),
      });
    }
  });

  test("stops before the next series when sync invalidation arrives mid-batch", async () => {
    const { leaseId, store } = fixture();
    const calls: string[] = [];

    await expect(publishPrBatch({
      campaignId: "campaign-1",
      commandId: "command-mid-batch-invalidation",
      confirmed: true,
      leaseId,
      projectId: "melee",
      publishSeries: async (series) => {
        calls.push(series.series_id);
        if (series.series_id === "series-1") {
          store.db.query(
            `INSERT INTO sync_invalidations (
               invalidation_id, sync_id, project_id, session_uuid, subject_kind,
               subject_id, reason, caused_by_event_id, created_at
             ) VALUES ('invalidation-mid-batch', 'sync-2', 'melee', 'session-1', 'pr_snapshot',
                       'series-2', 'mid-batch upstream movement', 'event-sync-2', '2026-08-13T10:04:00.000Z')`,
          ).run();
        }
        return { upstreamPrNumber: series.series_id === "series-1" ? 301 : 302 };
      },
      store,
    })).rejects.toThrow("mid-batch upstream movement");

    expect(calls).toEqual(["series-1"]);
    expect(listPrSeriesForCampaign(store, "campaign-1").map((series) => [series.series_id, series.status])).toEqual([
      ["series-1", "published"],
      ["series-2", "prepared"],
    ]);
    expect(eventsForSubject(store.db, "pr_campaign", "campaign-1")
      .filter((event) => event.eventType === "pr.batch_published")).toHaveLength(0);
  });

  test("resumes at the first unpublished series after a mid-batch external failure", async () => {
    const { leaseId, store } = fixture();
    const calls = new Map<string, number>();
    const publish = () => publishPrBatch({
      campaignId: "campaign-1",
      commandId: "command-mid-batch-retry",
      confirmed: true,
      leaseId,
      projectId: "melee",
      publishSeries: async (series) => {
        const count = (calls.get(series.series_id) ?? 0) + 1;
        calls.set(series.series_id, count);
        if (series.series_id === "series-2" && count === 1) throw new Error("second series failed");
        return { upstreamPrNumber: series.series_id === "series-1" ? 501 : 502 };
      },
      store,
    });

    await expect(publish()).rejects.toThrow("second series failed");
    await expect(publish()).resolves.toMatchObject({
      idempotency_key: "command-mid-batch-retry",
      series: [
        { series_id: "series-1", upstream_pr_number: 501 },
        { series_id: "series-2", upstream_pr_number: 502 },
      ],
    });
    expect(Object.fromEntries(calls)).toEqual({ "series-1": 1, "series-2": 2 });
  });

  test("serializes concurrent publish commands on the durable reservation CAS", async () => {
    const { leaseId, store } = fixture();
    let releaseFirst!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let externalCalls = 0;
    const first = publishPrBatch({
      campaignId: "campaign-1",
      commandId: "command-concurrent-first",
      confirmed: true,
      leaseId,
      projectId: "melee",
      publishSeries: async () => {
        externalCalls += 1;
        if (externalCalls === 1) {
          signalStarted();
          await release;
        }
        return { upstreamPrNumber: 400 + externalCalls };
      },
      store,
    });
    await started;

    await expect(publishPrBatch({
      campaignId: "campaign-1",
      commandId: "command-concurrent-second",
      confirmed: true,
      leaseId,
      projectId: "melee",
      publishSeries: async () => {
        externalCalls += 100;
        return { upstreamPrNumber: 999 };
      },
      store,
    })).rejects.toThrow("already in progress");
    releaseFirst();
    await first;

    expect(externalCalls).toBe(2);
    expect(store.db.query("SELECT COUNT(*) AS count FROM pr_batch_publications").get()).toEqual({ count: 1 });
    expect(eventsForSubject(store.db, "pr_campaign", "campaign-1")
      .filter((event) => event.eventType === "pr.batch_published")).toHaveLength(1);
  });
});
