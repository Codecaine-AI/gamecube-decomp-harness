import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createCycle } from "@server/core/cycle/store.js";
import { listCycleTimeline } from "@server/core/cycle/timeline.js";
import { appendGameEvent, eventSpan, eventsForSubject, listGameEvents, newSpanId } from "@server/core/harness-state/events.js";
import { getHarnessState, initializeHarnessState, requestDispatch } from "@server/core/harness-state/lease.js";
import { cancelSync, reconcileSync, recoverSync, validateKnowledgeOnlySync, validateSync } from "./engine.js";
import { defaultSyncGitRunner } from "./git.js";
import {
  commitSyncPublicationBoundary,
  continueSyncPublication,
  publishSync,
  prepareSyncPublication,
  reconcileInterruptedSyncPublication,
  repointSyncPublication,
  startSyncPublicationPush,
  type SyncPublicationContext,
} from "./publication.js";
import { getSyncState, recordSyncRequested, syncActionSpanId, transitionSync } from "./state.js";
import type { SyncState } from "./types.js";

const tempDirs: string[] = [];
const stores: StateStore[] = [];
const UUID_EVENT_ID = /^event-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_SPAN_ID = /^span-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface PublicationFixture {
  base: string;
  context: SyncPublicationContext;
  fork: string;
  localHead: string;
  root: string;
  seed: string;
  cycle: string;
  stateDir: string;
  store: StateStore;
  submodulePrior?: string;
  submoduleTarget?: string;
  sync: SyncState;
  upstream: string;
  intakeCalls: Array<{ checkoutRoot: string; expectedHead: string; observedHead: string; prNumbers: number[] }>;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_ALLOW_PROTOCOL: "file" },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? "").trim();
}

function reopenFixture(fixture: PublicationFixture): void {
  fixture.store.db.close();
  stores.splice(stores.indexOf(fixture.store), 1);
  fixture.store = openState(fixture.stateDir);
  stores.push(fixture.store);
  fixture.context = { ...fixture.context, store: fixture.store };
}

function configureGit(repo: string): void {
  git(repo, "config", "user.email", "sync-publication@example.com");
  git(repo, "config", "user.name", "Sync Publication Test");
}

function write(repo: string, path: string, content: string): void {
  const absolute = resolve(repo, path);
  mkdirSync(resolve(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function commitAll(repo: string, message: string): string {
  git(repo, "add", "-A");
  git(repo, "commit", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function createFixture(input: {
  syncId: string;
  knowledgeOnly?: boolean;
  renameBase?: boolean;
  withPrSeries?: boolean;
  withSubmodule?: boolean;
  corpusBatchIds?: string[];
  mergedPrIds?: string[];
}): PublicationFixture {
  const root = mkdtempSync(join(tmpdir(), "sync-publication-"));
  tempDirs.push(root);
  const upstreamRemote = resolve(root, "upstream.git");
  const fork = resolve(root, "fork.git");
  const seed = resolve(root, "seed");
  const cycle = resolve(root, "cycle");
  const stateDir = resolve(root, "state");
  git(root, "init", "--bare", upstreamRemote);
  git(root, "init", "--bare", fork);
  git(root, "clone", upstreamRemote, seed);
  configureGit(seed);
  let submodulePrior: string | undefined;
  let submoduleTarget: string | undefined;
  let submoduleSeed: string | undefined;
  if (input.withSubmodule) {
    const submoduleRemote = resolve(root, "submodule.git");
    submoduleSeed = resolve(root, "submodule-seed");
    git(root, "init", "--bare", submoduleRemote);
    git(root, "clone", submoduleRemote, submoduleSeed);
    configureGit(submoduleSeed);
    write(submoduleSeed, "pointer.c", "int pointer = 1;\n");
    submodulePrior = commitAll(submoduleSeed, "submodule pointer one");
    git(submoduleSeed, "push", "origin", "HEAD:master");
    git(seed, "submodule", "add", submoduleRemote, "deps/sub");
  }
  write(seed, "base.c", "int base = 1;\n");
  const base = commitAll(seed, "base");
  git(seed, "push", "origin", "HEAD:master");

  git(root, "clone", upstreamRemote, cycle);
  configureGit(cycle);
  git(cycle, "remote", "add", "fork", fork);
  if (input.withSubmodule) git(cycle, "submodule", "update", "--init", "--recursive", "--checkout");
  if (input.withPrSeries) {
    git(cycle, "checkout", "-b", "codex/split-01-publication", base);
    write(cycle, "pr.c", "int pr_series = 1;\n");
    const prHead = commitAll(cycle, "open PR series");
    git(cycle, "push", "fork", "HEAD:codex/split-01-publication");
    git(cycle, "checkout", "master");
    mkdirSync(resolve(stateDir, "pr_handoff"), { recursive: true });
    writeFileSync(resolve(stateDir, "pr_handoff/pr_records.json"), JSON.stringify({
      schemaVersion: "cycle_pr_records_v2",
      records: [{
        sliceId: "series-publication",
        branch: "codex/split-01-publication",
        status: "open",
        baseSha: base,
        local: { status: "ready", commitSha: prHead },
      }],
    }));
  }
  write(cycle, "local.c", "int local_epoch = 1;\n");
  const localHead = commitAll(cycle, "local epoch");

  let upstream = base;
  if (!input.knowledgeOnly) {
    if (input.withSubmodule) {
      write(submoduleSeed!, "pointer.c", "int pointer = 2;\n");
      submoduleTarget = commitAll(submoduleSeed!, "submodule pointer two");
      git(submoduleSeed!, "push", "origin", "HEAD:master");
      git(resolve(seed, "deps/sub"), "fetch", "origin", submoduleTarget);
      git(resolve(seed, "deps/sub"), "checkout", "--detach", submoduleTarget);
      git(seed, "add", "deps/sub");
    }
    if (input.renameBase) git(seed, "mv", "base.c", "renamed-base.c");
    write(seed, "upstream.c", "int upstream_change = 1;\n");
    upstream = commitAll(seed, "upstream movement (#501)");
    git(seed, "push", "origin", "HEAD:master");
  }

  const store = openState(stateDir);
  stores.push(store);
  store.db.query(
    `INSERT INTO runs (
       id, goal_kind, goal_value, desired_workers, status, created_at,
       game_id, game_repo_root, cycle_uuid, head_revision, trace_id
     ) VALUES (
       'run-publication', 'matched_code_percent', 100, 1, 'paused', '2026-08-13T19:00:00.000Z',
       'melee', ?, 'cycle-publication', ?, 'trace-run-publication'
     )`,
  ).run(cycle, localHead);
  createCycle(store.db, {
    actor: "operator",
    activeRunId: "run-publication",
    baseSha: localHead,
    commandId: "command-cycle-open",
    id: "cycle:publication",
    gameId: "melee",
    cycleUuid: "cycle-publication",
    traceId: "trace-cycle-publication",
    worktreeIdentity: cycle,
  });
  initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
  let sync = recordSyncRequested(store, {
    commandId: `${input.syncId}:requested`,
    actor: "external_observer",
    correlationId: input.syncId,
    intake: {
      upstream_from: base,
      upstream_to: upstream,
      merged_pr_ids: input.mergedPrIds ?? [],
      corpus_batch_ids: input.corpusBatchIds ?? [],
      knowledge_only: input.knowledgeOnly ?? false,
    },
    gameId: "melee",
    cycleUuid: "cycle-publication",
    syncId: input.syncId,
  });
  const dispatch = requestDispatch(store, {
    actor: "operator",
    commandId: `${input.syncId}:dispatch`,
    correlationId: input.syncId,
    kind: "sync",
    gameId: "melee",
    reason: "publication fixture",
    workflowId: input.syncId,
  });
  if (dispatch.queued) throw new Error("Expected sync dispatch lease");
  sync = transitionSync(store, sync.sync_id, {
    actor: "operator",
    commandId: `${input.syncId}:start`,
    correlationId: input.syncId,
    expectedRevision: sync.revision,
    patch: { status: "ingesting" },
  });
  const fileProtocolRunner = input.withSubmodule
    ? async (cwd: string, args: string[], options: { check?: boolean; failureHint?: string } = {}) => {
        const result = spawnSync("git", ["-C", cwd, ...args], {
          encoding: "utf8",
          env: { ...process.env, GIT_ALLOW_PROTOCOL: "file" },
        });
        const output = {
          exitCode: result.status,
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
        };
        if (options.check !== false && output.exitCode !== 0) {
          throw new Error(`${options.failureHint ?? `git ${args.join(" ")} failed`}: ${output.stderr || output.stdout}`);
        }
        return output;
      }
    : undefined;
  const intakeCalls: PublicationFixture["intakeCalls"] = [];
  return {
    base,
    context: {
      leaseId: dispatch.leaseId,
      now: () => "2026-08-13T19:00:00.000Z",
      prRemoteName: "fork",
      game: { baseRef: "origin/master" },
      repoRoot: cycle,
      cycleWorktreePath: cycle,
      stateDir,
      store,
      runKnowledgeIntake: async (intake) => {
        intakeCalls.push({
          ...intake,
          observedHead: git(cycle, "rev-parse", "HEAD"),
        });
        return {
          fetched_prs: intake.prNumbers,
          skipped_prs: [],
          ingest: { lanes: ["sync"] },
        };
      },
      ...(fileProtocolRunner ? { runGit: fileProtocolRunner } : {}),
    },
    fork,
    localHead,
    root,
    seed,
    cycle,
    stateDir,
    store,
    submodulePrior,
    submoduleTarget,
    sync,
    upstream,
    intakeCalls,
  };
}

async function sourceMovingValidated(fixture: PublicationFixture): Promise<SyncState> {
  let sync = await reconcileSync({
    commandId: `${fixture.sync.sync_id}:reconcile`,
    context: fixture.context,
    expectedRevision: fixture.sync.revision,
    syncId: fixture.sync.sync_id,
  });
  sync = await validateSync(fixture.context, {
    commandId: `${fixture.sync.sync_id}:validate`,
    expectedRevision: sync.revision,
    syncId: sync.sync_id,
    validate: async () => ({
      result: "passed",
      whatRan: [{ name: "publication fixture validation", command: ["fixture", "validate"] }],
      details: { regressions: 0 },
    }),
  });
  return sync;
}

async function knowledgeOnlyValidated(fixture: PublicationFixture): Promise<SyncState> {
  return validateKnowledgeOnlySync({
    commandId: `${fixture.sync.sync_id}:validate`,
    context: fixture.context,
    expectedRevision: fixture.sync.revision,
    syncId: fixture.sync.sync_id,
  });
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("sync atomic publication", () => {
  test("builds resolved-conflict publication evidence from sync state, not event payloads", async () => {
    const fixture = createFixture({ syncId: "sync-durable-resolved-conflicts" });
    const validated = await sourceMovingValidated(fixture);
    fixture.store.db.query("UPDATE sync_state SET resolved_conflict_paths_json = ? WHERE sync_id = ?")
      .run(JSON.stringify(["durable.c"]), validated.sync_id);
    appendGameEvent(fixture.store.db, {
      actor: "runner",
      causationId: "command-fake-legacy-conflict",
      correlationId: validated.sync_id,
      eventType: "sync.reconciliation_blocked",
      payload: {
        from_status: "reconciling",
        to_status: "blocked",
        conflict_identities: ["payload-only.c"],
        conflicts_awaiting_operator: 1,
      },
      gameId: validated.game_id,
      ...eventSpan(newSpanId()),
      subjectId: validated.sync_id,
      subjectKind: "sync_workflow",
      traceId: validated.trace_id,
    });

    const published = await publishSync({
      commandId: "command-durable-resolved-conflicts",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entry_kind: "remote_application",
        entry_id: published.publication?.remote_application_id,
        payload: expect.objectContaining({ resolved_conflicts: ["durable.c"] }),
      }),
    ]));
  }, 30_000);

  test("publishes the non-FF boundary, V2 intake, run linkage, anchor, and PR push", async () => {
    const fixture = createFixture({ syncId: "sync-publish-success", withPrSeries: true, mergedPrIds: ["501"] });
    const validated = await sourceMovingValidated(fixture);
    const stagedPrHead = validated.staging?.pr_workspaces?.[0]?.staging_head;

    const published = await publishSync({
      commandId: "command-publish-success",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      scoreDelta: 0.5,
      syncId: validated.sync_id,
    });

    expect(published.status).toBe("published");
    expect(published.publication).toMatchObject({
      prior_head: fixture.localHead,
      new_head: validated.staging?.staging_head_sha,
      knowledge_intake: {
        fetched_prs: [501],
        skipped_prs: [],
        ingest: { lanes: ["sync"] },
      },
    });
    expect(fixture.intakeCalls).toEqual([{
      checkoutRoot: fixture.cycle,
      expectedHead: git(fixture.cycle, "rev-parse", "--short", "HEAD"),
      observedHead: published.publication!.new_head,
      prNumbers: [501],
    }]);
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(published.publication!.new_head);
    expect(git(fixture.root, "--git-dir", fixture.fork, "rev-parse", "refs/heads/codex/split-01-publication"))
      .toBe(stagedPrHead!);
    expect(published.pr_reconciliation).toEqual([
      expect.objectContaining({ series_id: "series-publication", pushed: true }),
    ]);
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entry_kind: "remote_application",
        entry_id: published.publication?.remote_application_id,
      }),
      expect.objectContaining({
        entry_kind: "save_point",
        payload: expect.objectContaining({
          remote_application_id: published.publication?.remote_application_id,
          anchored_commit: published.publication?.new_head,
        }),
      }),
    ]));
    expect(fixture.store.db.query(
      "SELECT commit_sha, payload_json FROM save_points WHERE trigger_kind = 'sync'",
    ).get()).toMatchObject({ commit_sha: published.publication?.new_head });
    const run = fixture.store.db
      .query("SELECT revision, head_revision, remote_application_ids_json FROM runs WHERE id = 'run-publication'")
      .get() as Record<string, unknown>;
    expect(run).toMatchObject({ revision: 1, head_revision: published.publication?.new_head });
    expect(JSON.parse(String(run.remote_application_ids_json))).toEqual([published.publication?.remote_application_id]);
    expect(eventsForSubject(fixture.store.db, "run", "run-publication").map((event) => event.eventType))
      .toEqual(["run.remote_applied"]);
    expect(fixture.store.db.query("SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = 'melee'").get())
      .toEqual({ upstream_revision: fixture.upstream });
    expect(getHarnessState(fixture.store, "melee")?.active_workflow).toBeNull();
    const gameEvents = listGameEvents(fixture.store.db, { gameId: "melee" });
    const eventIds = new Set(gameEvents.map((event) => event.eventId));
    const causedRows = fixture.store.db.query(
      `SELECT caused_by_event_id FROM sync_state WHERE sync_id = ?
       UNION ALL SELECT caused_by_event_id FROM cycles WHERE cycle_uuid = 'cycle-publication'
       UNION ALL SELECT caused_by_event_id FROM runs WHERE id = 'run-publication'
       UNION ALL SELECT caused_by_event_id FROM harness_state WHERE game_id = 'melee'
       UNION ALL SELECT caused_by_event_id FROM game_upstream_anchors WHERE game_id = 'melee'
       UNION ALL SELECT caused_by_event_id FROM sync_push_records WHERE sync_id = ?`,
    ).all(published.sync_id, published.sync_id) as Array<{ caused_by_event_id: string }>;
    expect(causedRows.every((row) => eventIds.has(row.caused_by_event_id))).toBe(true);
    expect(gameEvents.filter((event) => event.correlationId === published.sync_id).map((event) => event.eventType))
      .toEqual(expect.arrayContaining([
        "sync.boundary_published",
        "sync.pr_push_started",
        "sync.pr_push_succeeded",
        "sync.published",
        "game.dispatch_released",
      ]));
    const savePointEvents = gameEvents.filter((event) =>
      event.eventType === "cycle.save_point_recorded" &&
      event.subjectKind === "cycle" &&
      event.subjectId === "cycle-publication"
    );
    expect(savePointEvents).toHaveLength(1);
    const savePointEvent = savePointEvents[0]!;
    const publishingEvent = gameEvents.find((event) => event.eventType === "sync.publishing");
    const publishedEvent = gameEvents.find((event) => event.eventType === "sync.published");
    const releasedEvent = gameEvents.find((event) => event.eventType === "game.dispatch_released");
    const boundaryEvent = gameEvents.find((event) => event.eventType === "sync.boundary_published");
    const remoteAppliedEvent = gameEvents.find((event) => event.eventType === "run.remote_applied");
    const pushEvents = gameEvents.filter((event) => event.eventType.startsWith("sync.pr_push_"));
    const lastPushEvent = pushEvents.at(-1);
    const actionRootSpanId = syncActionSpanId("command-publish-success");
    expect(publishingEvent).toMatchObject({
      subjectKind: "sync_workflow",
      correlationId: published.sync_id,
      causationId: "command-publish-success",
      traceId: published.trace_id,
      parentSpanId: actionRootSpanId,
    });
    expect(boundaryEvent).toMatchObject({
      subjectKind: "sync_workflow",
      correlationId: published.sync_id,
      causationId: publishingEvent!.eventId,
      traceId: published.trace_id,
      parentSpanId: actionRootSpanId,
    });
    expect(Object.keys(boundaryEvent!.payload).sort()).toEqual([
      "knowledge_intake",
      "upstream_revision",
      "validation_evidence",
    ]);
    expect(publishedEvent).toMatchObject({
      subjectKind: "sync_workflow",
      correlationId: published.sync_id,
      causationId: lastPushEvent!.eventId,
      traceId: published.trace_id,
      parentSpanId: actionRootSpanId,
    });
    expect(releasedEvent).toMatchObject({
      correlationId: published.sync_id,
      causationId: publishedEvent!.eventId,
      parentSpanId: actionRootSpanId,
    });
    const causalChain = [publishingEvent!, boundaryEvent!, ...pushEvents, publishedEvent!, releasedEvent!];
    expect(publishingEvent!.payload).toEqual({ from_status: "validated", to_status: "publishing" });
    expect(publishedEvent!.payload).toEqual({ from_status: "publishing", to_status: "published" });
    expect(pushEvents.map((event) => event.payload)).toEqual([
      expect.objectContaining({ from_status: "pending", to_status: "pushing" }),
      expect.objectContaining({ from_status: "pushing", to_status: "pushed" }),
    ]);
    expect(causalChain.every((event) => event.actor === "operator")).toBe(true);
    expect(published.caused_by_event_id).toBe(publishedEvent!.eventId);
    expect(getHarnessState(fixture.store, "melee")?.caused_by_event_id).toBe(releasedEvent!.eventId);
    expect(actionRootSpanId).toMatch(UUID_SPAN_ID);
    expect(causalChain.every((event) => UUID_EVENT_ID.test(event.eventId))).toBe(true);
    expect(causalChain.every((event) => UUID_SPAN_ID.test(event.spanId))).toBe(true);
    expect(new Set(causalChain.map((event) => event.spanId)).size).toBe(causalChain.length);
    for (let index = 1; index < causalChain.length; index += 1) {
      expect(causalChain[index]!.causationId).toBe(causalChain[index - 1]!.eventId);
    }
    expect(remoteAppliedEvent).toMatchObject({
      correlationId: "run-publication",
      causationId: boundaryEvent!.eventId,
    });
    expect(savePointEvent).toMatchObject({
      correlationId: "cycle-publication",
      causationId: boundaryEvent!.eventId,
    });
    expect(savePointEvent.payload).toEqual({
      anchored_commit: published.publication!.new_head,
      trigger_kind: "sync",
      headline_score: null,
      artifact_paths: [],
      replay_key: expect.stringMatching(/^save-point-[0-9a-f]{24}$/),
      replayed_failure_event_id: null,
    });
    expect(savePointEvent!.sequence).toBeLessThan(publishedEvent!.sequence);
    expect(savePointEvent!.sequence).toBeLessThan(releasedEvent!.sequence);
    const syncEvents = eventsForSubject(fixture.store.db, "sync_workflow", published.sync_id).map((event) => event.eventType);
    expect(syncEvents.slice(-3)).toEqual(["sync.publishing", "sync.boundary_published", "sync.published"]);
  }, 30_000);

  test("rechecks upstream after validation and blocks before changing the cycle", async () => {
    const fixture = createFixture({ syncId: "sync-publish-stale" });
    const validated = await sourceMovingValidated(fixture);
    write(fixture.seed, "later.c", "int later = 1;\n");
    const later = commitAll(fixture.seed, "upstream moved after validation");
    git(fixture.seed, "push", "origin", "HEAD:master");

    const blocked = await publishSync({
      commandId: "command-publish-stale",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });

    expect(blocked.status).toBe("blocked");
    expect(blocked.blockers[0]).toMatchObject({ code: "upstream_moved_after_validation" });
    expect(blocked.blockers[0]?.message).toContain(later);
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
    expect(blocked.publication).toBeNull();
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual([]);
  }, 30_000);

  test("preserves pre-existing cycle changes when publication preflight rejects the worktree", async () => {
    const fixture = createFixture({ syncId: "sync-publish-dirty-cycle" });
    const validated = await sourceMovingValidated(fixture);
    write(fixture.cycle, "operator-uncommitted.c", "int operator_work = 1;\n");

    await expect(publishSync({
      commandId: "command-publish-dirty-cycle",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    })).rejects.toThrow("Cycle worktree before publication has recursive worktree changes");

    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
    expect(git(fixture.cycle, "status", "--porcelain=v1", "--untracked-files=all"))
      .toContain("?? operator-uncommitted.c");
    expect(readFileSync(resolve(fixture.cycle, "operator-uncommitted.c"), "utf8"))
      .toBe("int operator_work = 1;\n");
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual([]);
  }, 30_000);

  test("compensates the non-FF worktree repoint when the durable boundary transaction fails", async () => {
    const fixture = createFixture({ syncId: "sync-publish-compensate" });
    const validated = await sourceMovingValidated(fixture);
    fixture.store.db.exec(
      `CREATE TRIGGER fail_sync_anchor_for_compensation
       BEFORE INSERT ON game_upstream_anchors
       BEGIN
         SELECT RAISE(ABORT, 'injected durable boundary failure');
       END`,
    );

    await expect(publishSync({
      commandId: "command-publish-compensate",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    })).rejects.toThrow("Sync publication boundary failed");

    const blocked = fixture.store.db.query("SELECT status, publication_json FROM sync_state WHERE sync_id = ?")
      .get(validated.sync_id) as { status: string; publication_json: string | null };
    expect(blocked).toEqual({ status: "blocked", publication_json: null });
    expect(eventsForSubject(fixture.store.db, "sync_workflow", validated.sync_id).at(-1)).toMatchObject({
      actor: "operator",
      eventType: "sync.blocked",
      payload: {
        from_status: "publishing",
        to_status: "blocked",
        blocker_codes: ["publication_interrupted"],
        source_identities: [{ source_kind: "sync", source_id: validated.sync_id }],
        recovery_choices: ["resume"],
      },
    });
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
    expect(git(fixture.cycle, "status", "--porcelain=v1", "--untracked-files=all")).toBe("");
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual([]);
    expect(fixture.store.db.query("SELECT 1 FROM game_upstream_anchors WHERE game_id = 'melee'").get()).toBeNull();
  }, 30_000);

  test("compensates the cycle worktree when V2 knowledge intake fails", async () => {
    const fixture = createFixture({ syncId: "sync-publish-intake-failure", mergedPrIds: ["501"] });
    const validated = await sourceMovingValidated(fixture);
    let intakeHead = "";
    fixture.context.runKnowledgeIntake = async () => {
      intakeHead = git(fixture.cycle, "rev-parse", "HEAD");
      throw new Error("injected V2 intake failure");
    };

    await expect(publishSync({
      commandId: "command-publish-intake-failure",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    })).rejects.toThrow("injected V2 intake failure");

    expect(intakeHead).toBe(validated.staging!.staging_head_sha!);
    expect(getSyncState(fixture.store, validated.sync_id)).toMatchObject({
      status: "blocked",
      publication: null,
    });
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual([]);
  }, 30_000);

  test("fresh-store recovery after entering publishing restores and blocks from durable state", async () => {
    const fixture = createFixture({ syncId: "sync-kill-after-publishing-cas" });
    const validated = await sourceMovingValidated(fixture);
    const publishing = await prepareSyncPublication({
      commandId: "command-kill-after-publishing-cas",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });
    expect(publishing.status).toBe("publishing");

    reopenFixture(fixture);
    const blocked = await reconcileInterruptedSyncPublication({
      commandId: "command-fresh-recover-after-cas",
      context: fixture.context,
      syncId: publishing.sync_id,
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.blockers[0]?.code).toBe("publication_interrupted");
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
    expect(getHarnessState(fixture.store, "melee")?.active_workflow?.workflow_id).toBe(publishing.sync_id);
  }, 30_000);

  test("fresh-store recovery after repoint compensates without an exception handler", async () => {
    const fixture = createFixture({ syncId: "sync-kill-after-repoint" });
    const validated = await sourceMovingValidated(fixture);
    const publishing = await prepareSyncPublication({
      commandId: "command-kill-after-repoint",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });
    await repointSyncPublication(fixture.context, publishing.sync_id);
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(validated.staging?.staging_head_sha!);

    reopenFixture(fixture);
    const blocked = await reconcileInterruptedSyncPublication({
      commandId: "command-fresh-recover-after-repoint",
      context: fixture.context,
      syncId: publishing.sync_id,
    });
    expect(blocked.status).toBe("blocked");
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
    expect(git(fixture.cycle, "status", "--porcelain=v1", "--untracked-files=all")).toBe("");
  }, 30_000);

  test("fresh-store recovery after boundary transaction rollback recomputes and compensates", async () => {
    const fixture = createFixture({ syncId: "sync-kill-after-boundary-rollback" });
    const validated = await sourceMovingValidated(fixture);
    const publishing = await prepareSyncPublication({
      commandId: "command-kill-after-boundary-rollback",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });
    await repointSyncPublication(fixture.context, publishing.sync_id);
    fixture.store.db.exec(
      `CREATE TRIGGER fail_kill_point_boundary
       BEFORE INSERT ON game_upstream_anchors
       BEGIN SELECT RAISE(ABORT, 'kill-point boundary rollback'); END`,
    );
    await expect(commitSyncPublicationBoundary({
      commandId: "command-raw-boundary-rollback",
      context: fixture.context,
      expectedRevision: publishing.revision,
      syncId: publishing.sync_id,
    })).rejects.toThrow("kill-point boundary rollback");

    reopenFixture(fixture);
    const blocked = await reconcileInterruptedSyncPublication({
      commandId: "command-fresh-recover-after-rollback",
      context: fixture.context,
      syncId: publishing.sync_id,
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.publication).toBeNull();
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual([]);
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
  }, 30_000);

  test("fresh-store recovery rejects a noncanonical sync-subject boundary", async () => {
    const fixture = createFixture({ syncId: "sync-kill-after-boundary-commit" });
    const validated = await sourceMovingValidated(fixture);
    const publishing = await prepareSyncPublication({
      commandId: "command-kill-after-boundary-commit",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });
    await repointSyncPublication(fixture.context, publishing.sync_id);
    const boundary = await commitSyncPublicationBoundary({
      commandId: "command-boundary-before-kill",
      context: fixture.context,
      expectedRevision: publishing.revision,
      syncId: publishing.sync_id,
    });
    expect(boundary.status).toBe("publishing");
    expect(boundary.publication).not.toBeNull();
    const legacySubject = fixture.store.db.query(
      "UPDATE game_events SET subject_kind = 'sync' WHERE event_id = ? AND subject_kind = 'sync_workflow'",
    ).run(boundary.caused_by_event_id);
    expect(legacySubject.changes).toBe(1);

    reopenFixture(fixture);
    await expect(reconcileInterruptedSyncPublication({
      commandId: "command-fresh-recover-after-boundary",
      context: fixture.context,
      syncId: boundary.sync_id,
    })).rejects.toThrow("publication without a canonical boundary event");
    expect(getSyncState(fixture.store, boundary.sync_id)?.status).toBe("publishing");
  }, 30_000);

  test("fresh-store recovery completes a push killed after the remote accepted it", async () => {
    const fixture = createFixture({ syncId: "sync-kill-mid-push", withPrSeries: true });
    const validated = await sourceMovingValidated(fixture);
    const publishing = await prepareSyncPublication({
      commandId: "command-kill-mid-push",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });
    await repointSyncPublication(fixture.context, publishing.sync_id);
    const boundary = await commitSyncPublicationBoundary({
      commandId: "command-mid-push-boundary",
      context: fixture.context,
      expectedRevision: publishing.revision,
      syncId: publishing.sync_id,
    });
    startSyncPublicationPush({
      commandId: "command-mid-push-started",
      context: fixture.context,
      seriesId: "series-publication",
      syncId: boundary.sync_id,
    });
    const push = fixture.store.db.query(
      "SELECT branch, expected_remote_head, new_head, status FROM sync_push_records WHERE sync_id = ?",
    ).get(boundary.sync_id) as {
      branch: string;
      expected_remote_head: string;
      new_head: string;
      status: string;
    };
    expect(push.status).toBe("pushing");
    git(
      fixture.cycle,
      "push",
      `--force-with-lease=refs/heads/${push.branch}:${push.expected_remote_head}`,
      "fork",
      `${push.new_head}:refs/heads/${push.branch}`,
    );

    reopenFixture(fixture);
    const published = await reconcileInterruptedSyncPublication({
      commandId: "command-fresh-recover-mid-push",
      context: fixture.context,
      syncId: boundary.sync_id,
    });
    expect(published.status).toBe("published");
    expect(fixture.store.db.query("SELECT status, attempt_count FROM sync_push_records").get())
      .toEqual({ status: "pushed", attempt_count: 1 });
  }, 30_000);

  test("publishes, compensates, and snapshots real recursive submodule pointers", async () => {
    const publishedFixture = createFixture({ syncId: "sync-submodule-publish", withSubmodule: true });
    const validated = await sourceMovingValidated(publishedFixture);
    const published = await publishSync({
      commandId: "command-submodule-publish",
      confirmed: true,
      context: publishedFixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });
    expect(published.status).toBe("published");
    expect(git(resolve(publishedFixture.cycle, "deps/sub"), "rev-parse", "HEAD"))
      .toBe(publishedFixture.submoduleTarget!);
    expect(git(publishedFixture.cycle, "status", "--porcelain=v1", "--ignore-submodules=none")).toBe("");

    const compensationFixture = createFixture({ syncId: "sync-submodule-mid-compensation", withSubmodule: true });
    const compensationValidated = await sourceMovingValidated(compensationFixture);
    const compensationPublishing = await prepareSyncPublication({
      commandId: "command-submodule-mid-compensation",
      confirmed: true,
      context: compensationFixture.context,
      expectedRevision: compensationValidated.revision,
      syncId: compensationValidated.sync_id,
    });
    await repointSyncPublication(compensationFixture.context, compensationPublishing.sync_id);
    expect(git(resolve(compensationFixture.cycle, "deps/sub"), "rev-parse", "HEAD"))
      .toBe(compensationFixture.submoduleTarget!);
    // Simulate process death halfway through recursive compensation: the root
    // is prior while the initialized child is still target.
    git(compensationFixture.cycle, "reset", "--hard", compensationFixture.localHead);
    expect(git(resolve(compensationFixture.cycle, "deps/sub"), "rev-parse", "HEAD"))
      .toBe(compensationFixture.submoduleTarget!);
    reopenFixture(compensationFixture);
    const blocked = await reconcileInterruptedSyncPublication({
      commandId: "command-fresh-recover-mid-compensation",
      context: compensationFixture.context,
      syncId: compensationPublishing.sync_id,
    });
    expect(blocked.status).toBe("blocked");
    expect(git(compensationFixture.cycle, "rev-parse", "HEAD")).toBe(compensationFixture.localHead);
    expect(git(resolve(compensationFixture.cycle, "deps/sub"), "rev-parse", "HEAD"))
      .toBe(compensationFixture.submodulePrior!);
    expect(git(compensationFixture.cycle, "status", "--porcelain=v1", "--ignore-submodules=none")).toBe("");

    const cancelFixture = createFixture({ syncId: "sync-submodule-cancel", withSubmodule: true });
    const cancelValidated = await sourceMovingValidated(cancelFixture);
    const cancelled = await cancelSync({
      commandId: "command-submodule-cancel",
      context: cancelFixture.context,
      expectedRevision: cancelValidated.revision,
      syncId: cancelValidated.sync_id,
    });
    expect(cancelled.status).toBe("cancelled");
    const cancelledEvent = eventsForSubject(cancelFixture.store.db, "sync_workflow", cancelled.sync_id).at(-1);
    expect(cancelledEvent?.eventType).toBe("sync.cancelled");
    expect(cancelledEvent?.payload.untouched_submodule_heads).toEqual([{
      path: "deps/sub",
      gitlink_head: cancelFixture.submodulePrior!,
      checked_out_head: cancelFixture.submodulePrior!,
    }]);
    expect(git(resolve(cancelFixture.cycle, "deps/sub"), "rev-parse", "HEAD"))
      .toBe(cancelFixture.submodulePrior!);
  }, 90_000);

  test("keeps a durable boundary on push failure and retries the push idempotently", async () => {
    const fixture = createFixture({ syncId: "sync-publish-retry", withPrSeries: true });
    const validated = await sourceMovingValidated(fixture);
    const baseRunner = defaultSyncGitRunner;
    fixture.context.runGit = async (cwd, args, options) => {
      if (args[0] === "push") return { exitCode: 1, stdout: "", stderr: "injected push failure" };
      return baseRunner(cwd, args, options);
    };

    await expect(publishSync({
      commandId: "command-publish-failing-push",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    })).rejects.toThrow("Sync PR push failed");

    let blocked = fixture.store.db.query("SELECT revision, status, publication_json FROM sync_state WHERE sync_id = ?")
      .get(validated.sync_id) as { revision: number; status: string; publication_json: string | null };
    expect(blocked.status).toBe("blocked");
    expect(blocked.publication_json).not.toBeNull();
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toHaveLength(1);
    expect(fixture.store.db.query(
      "SELECT COUNT(*) AS count FROM save_points WHERE trigger_kind = 'sync'",
    ).get()).toEqual({ count: 0 });
    expect(fixture.store.db.query("SELECT status, attempt_count FROM sync_push_records").get())
      .toEqual({ status: "failed", attempt_count: 1 });

    fixture.context.runGit = undefined;
    rmSync(validated.staging!.workspace_path!, { recursive: true, force: true });
    const recovered = await recoverSync({
      choice: "resume",
      commandId: "command-recover-push",
      context: fixture.context,
      expectedRevision: Number(blocked.revision),
      recoveryReason: "retry idempotent PR push",
      syncId: validated.sync_id,
    });
    expect(recovered.status).toBe("publishing");
    const published = await continueSyncPublication({
      commandId: "command-continue-push",
      context: fixture.context,
      expectedRevision: recovered.revision,
      syncId: recovered.sync_id,
    });

    expect(published.status).toBe("published");
    expect(fixture.store.db.query("SELECT status, attempt_count FROM sync_push_records").get())
      .toEqual({ status: "pushed", attempt_count: 2 });
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry_kind: "remote_application", entry_id: published.publication?.remote_application_id }),
      expect.objectContaining({
        entry_kind: "save_point",
        payload: expect.objectContaining({
          remote_application_id: published.publication?.remote_application_id,
          anchored_commit: published.publication?.new_head,
        }),
      }),
    ]));
    expect(fixture.store.db.query(
      "SELECT COUNT(*) AS count FROM save_points WHERE trigger_kind = 'sync'",
    ).get()).toEqual({ count: 1 });
    expect(eventsForSubject(fixture.store.db, "run", "run-publication")).toHaveLength(1);
  }, 30_000);

  test("publishes a knowledge-only pass without a remote application or source-head change", async () => {
    const fixture = createFixture({
      syncId: "sync-publish-knowledge-only",
      knowledgeOnly: true,
      corpusBatchIds: ["corpus-august"],
    });
    const validated = await knowledgeOnlyValidated(fixture);
    const cycleRevisionBefore = Number(
      (fixture.store.db.query("SELECT revision FROM cycles WHERE cycle_uuid = 'cycle-publication'").get() as { revision: number }).revision,
    );

    const published = await publishSync({
      commandId: "command-publish-knowledge-only",
      confirmed: true,
      context: fixture.context,
      expectedRevision: validated.revision,
      syncId: validated.sync_id,
    });

    expect(published.status).toBe("published");
    expect(published.publication).toEqual({
      prior_head: fixture.localHead,
      new_head: fixture.localHead,
      knowledge_intake: {
        fetched_prs: [],
        skipped_prs: [],
        ingest: { lanes: ["sync"] },
      },
    });
    expect(fixture.intakeCalls).toEqual([{
      checkoutRoot: fixture.cycle,
      expectedHead: git(fixture.cycle, "rev-parse", "--short", "HEAD"),
      observedHead: fixture.localHead,
      prNumbers: [],
    }]);
    expect(git(fixture.cycle, "rev-parse", "HEAD")).toBe(fixture.localHead);
    expect(listCycleTimeline(fixture.store.db, "cycle-publication")).toEqual([]);
    expect(eventsForSubject(fixture.store.db, "run", "run-publication")).toEqual([]);
    expect(fixture.store.db.query("SELECT 1 FROM game_upstream_anchors WHERE game_id = 'melee'").get()).toBeNull();
    expect(fixture.store.db.query("SELECT revision FROM cycles WHERE cycle_uuid = 'cycle-publication'").get())
      .toEqual({ revision: cycleRevisionBefore });
    expect(listGameEvents(fixture.store.db, { gameId: "melee" }).filter((event) => event.eventType === "run.remote_applied"))
      .toEqual([]);
  }, 30_000);
});
