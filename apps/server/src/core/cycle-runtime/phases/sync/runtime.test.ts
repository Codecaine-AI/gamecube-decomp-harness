import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { openState } from "@server/core/orchestrator-state";
import { createCycle } from "@server/core/cycle/store.js";
import { getHarnessState, initializeHarnessState, listGameEvents, newSpanId, requestDispatch } from "@server/core/harness-state";
import { createRun, getRun, updateRunStatus } from "@server/core/cycle-runtime/run-state";
import { settleStoppedRun } from "@server/core/cycle-runtime/phases/running/run-control.js";
import { defaultSyncGitRunner } from "./git.js";
import { getSyncState, recordSyncRequested, syncActionSpanId, transitionSync } from "./state.js";
import { activateAcquiredSync } from "./activation.js";
import { createSyncTraceEmitter, type SyncWorkflowEventInput } from "./trace.js";
import {
  createSyncRuntime,
  gameSyncAction,
  type SyncRuntimeDeps,
  type SyncRuntimeGameContext,
} from "./runtime.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sync-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? "").trim();
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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(
  runGit: SyncRuntimeDeps["runGit"] = defaultSyncGitRunner,
  extraDeps: Partial<SyncRuntimeDeps> = {},
) {
  const root = tempDir();
  const stateDir = resolve(root, "state");
  const repoRoot = resolve(root, "cycle");
  const cycleWorktree = resolve(root, "worktrees", "cycles", "cycle-melee", "current");
  mkdirSync(cycleWorktree, { recursive: true });
  git(cycleWorktree, "init");
  git(cycleWorktree, "config", "user.email", "sync-runtime@example.com");
  git(cycleWorktree, "config", "user.name", "Sync Runtime Test");
  write(cycleWorktree, "base.c", "int base = 1;\n");
  const cycleHead = commitAll(cycleWorktree, "fixture cycle head");
  const store = openState(stateDir);
  createCycle(store.db, {
    actor: "operator",
    baseSha: cycleHead,
    id: "cycle:cycle-melee",
    gameId: "melee",
    cycleUuid: "cycle-melee",
  });
  initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
  const paths: SyncRuntimeGameContext = {
    graphDbPath: resolve(root, "graph.sqlite"),
    game: { gameId: "melee", baseRef: "origin/master" } as SyncRuntimeGameContext["game"],
    repoRoot,
    stateDir,
  };
  const stopCalls: Record<string, unknown>[] = [];
  const runtime = createSyncRuntime({
    packageRoot: root,
    resolveDashboardGame: () => paths,
    runGit,
    stopManaged: async (body) => {
      stopCalls.push(body);
      return { stopped: true };
    },
    sourceRoot: () => root,
    refreshDiscordMirror: async () => ({ ok: true, detail: "discord mirror test fixture" }),
    ...extraDeps,
  });
  return { paths, root, runtime, stateDir, stopCalls, store };
}

function requested(
  store: ReturnType<typeof openState>,
  syncId = "sync-1",
  corpusBatchIds: string[] = [],
  mergedPrIds: string[] = [],
) {
  const cycleHead = (store.db.query(
    "SELECT head_revision FROM cycles WHERE cycle_uuid = 'cycle-melee'",
  ).get() as { head_revision: string }).head_revision;
  return recordSyncRequested(store, {
    gameId: "melee",
    cycleUuid: "cycle-melee",
    syncId,
    commandId: `command-observe-${syncId}`,
    actor: "external_observer",
    correlationId: syncId,
    observationSourceIdentity: "origin/master",
    intake: {
      upstream_from: cycleHead,
      upstream_to: cycleHead,
      merged_pr_ids: mergedPrIds,
      corpus_batch_ids: corpusBatchIds,
      knowledge_only: true,
    },
  });
}

describe("S4 sync kernel trace", () => {
  test("files each milestone into the cycle's sync-intake container with its game event", async () => {
    const emitted: Array<{ paths: SyncRuntimeGameContext; input: SyncWorkflowEventInput }> = [];
    const current = fixture(defaultSyncGitRunner, {
      submitWorkflowEvent: async (paths, input) => {
        emitted.push({ paths, input });
        return { containerId: "container-sync-intake" };
      },
    });
    requested(current.store, "sync-trace-milestones");
    current.store.db.close();

    const decision = await current.runtime.start({
      commandId: "command-start-trace-milestones",
      gameId: "melee",
      syncId: "sync-trace-milestones",
    });
    expect(decision.sync.status).toBe("validated");

    const store = openState(current.stateDir);
    try {
      const events = listGameEvents(store.db).filter((event) => event.subjectId === "sync-trace-milestones");
      const ingesting = events.find((event) => event.eventType === "sync.ingesting");
      const validated = events.find((event) => event.eventType === "sync.validated");
      expect(ingesting?.eventId).toBeTruthy();
      expect(validated?.eventId).toBeTruthy();

      expect(emitted.map((entry) => [entry.input.operation, entry.input.status])).toEqual([
        ["sync.start", "started"],
        ["sync.ingest", "started"],
        ["sync.validate", "completed"],
      ]);
      // Every milestone is filed under the sync's own cycle, never the run-id
      // fallback the kernel would otherwise pick when it cannot see a cycle.
      expect(new Set(emitted.map((entry) => entry.input.kind))).toEqual(new Set(["sync-intake"]));
      expect(new Set(emitted.map((entry) => entry.input.sessionId))).toEqual(new Set(["cycle-melee"]));
      // The join to the game event log is what makes the trace reachable from
      // a sync event, so every emit carries a real game event id.
      expect(emitted.map((entry) => entry.input.gameEventId)).toEqual([
        ingesting!.eventId,
        ingesting!.eventId,
        validated!.eventId,
      ]);
      expect(new Set(emitted.map((entry) => entry.input.correlationId))).toEqual(
        new Set(["sync-trace-milestones"]),
      );
      expect(emitted[2]!.input.metadata).toMatchObject({
        milestone: "validated",
        syncId: "sync-trace-milestones",
        cycleUuid: "cycle-melee",
      });
    } finally {
      store.db.close();
    }
  });

  test("a throwing trace emit never fails the sync step", async () => {
    let attempts = 0;
    const current = fixture(defaultSyncGitRunner, {
      submitWorkflowEvent: async () => {
        attempts += 1;
        throw new Error("agent kernel is unreachable");
      },
    });
    requested(current.store, "sync-trace-guarded");
    current.store.db.close();

    const decision = await current.runtime.start({
      commandId: "command-start-trace-guarded",
      gameId: "melee",
      syncId: "sync-trace-guarded",
    });
    expect(decision.sync.status).toBe("validated");
    expect(attempts).toBe(3);
  });

  test("skips emission, once, for a sync whose cycle cannot be resolved", async () => {
    const emitted: SyncWorkflowEventInput[] = [];
    const current = fixture();
    const sync = requested(current.store, "sync-trace-orphan");
    current.store.db.close();
    const emit = createSyncTraceEmitter<SyncRuntimeGameContext>({
      submitWorkflowEvent: async (_paths, input) => {
        emitted.push(input);
        return null;
      },
    });
    const orphan = { ...sync, cycle_uuid: "cycle-that-never-existed" };

    await emit(current.paths, orphan, "activation");
    await emit(current.paths, orphan, "cancelled");

    expect(emitted).toEqual([]);
  });

  test("skips a milestone with no durable game event behind it", async () => {
    const emitted: SyncWorkflowEventInput[] = [];
    const current = fixture();
    const sync = requested(current.store, "sync-trace-unreached");
    current.store.db.close();
    const emit = createSyncTraceEmitter<SyncRuntimeGameContext>({
      submitWorkflowEvent: async (_paths, input) => {
        emitted.push(input);
        return null;
      },
    });

    // The sync has only ever been requested, so nothing published.
    await emit(current.paths, sync, "published");

    expect(emitted).toEqual([]);
  });
});

describe("S4 sync operator runtime", () => {
  test("threads discovery.baseRef into the requested observation refresh event", async () => {
    const observedUpstream = "observed-upstream-head";
    const current = fixture(async (_repoRoot, args) => {
      if (args[0] === "fetch") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: `${observedUpstream}\n`, stderr: "" };
      if (args[0] === "branch") return { exitCode: 0, stdout: "master\n", stderr: "" };
      if (args[0] === "log") {
        return { exitCode: 0, stdout: "Merge pull request #8123 from observation-refresh\n", stderr: "" };
      }
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    });
    const initial = requested(current.store, "sync-runtime-observation-refresh");
    const priorUpstream = initial.intake.upstream_to;
    current.store.db.close();

    const refreshed = await current.runtime.observe({
      actor: "external_observer",
      commandId: "command-runtime-observation-refresh",
      corpusBatchIds: ["corpus-runtime-1", "corpus-runtime-2"],
      gameId: "melee",
    });

    expect(refreshed).toMatchObject({
      revision: 2,
      status: "requested",
      intake: {
        upstream_from: priorUpstream,
        upstream_to: observedUpstream,
        merged_pr_ids: ["8123"],
        corpus_batch_ids: ["corpus-runtime-1", "corpus-runtime-2"],
        knowledge_only: false,
      },
    });
    const store = openState(current.stateDir);
    try {
      const event = listGameEvents(store.db).find((candidate) =>
        candidate.eventType === "sync.observation_refreshed" &&
        candidate.subjectId === initial.sync_id,
      );
      expect(event?.payload).toEqual({
        prior_upstream_revision: priorUpstream,
        observed_upstream_revision: observedUpstream,
        merged_pr_ids: ["8123"],
        corpus_batch_ids: ["corpus-runtime-1", "corpus-runtime-2"],
        knowledge_only: false,
        observation_source_identity: "origin/master",
        state_revision: 1,
      });
    } finally {
      store.db.close();
    }
  });

  test.each<{
    ok: boolean;
    detail: string;
  }>([
    { ok: true, detail: "refresh complete" },
    { ok: false, detail: "refresh unavailable; using mirror" },
  ])("records the complete Discord observation sequence when refresh ok=$ok", async (scenario) => {
    const emitted: SyncWorkflowEventInput[] = [];
    const current = fixture(async (_repoRoot, args) => {
      if (args[0] === "fetch") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: "observed-head\n", stderr: "" };
      if (args[0] === "branch") return { exitCode: 0, stdout: "master\n", stderr: "" };
      if (args[0] === "log") return { exitCode: 0, stdout: "Merge pull request #41 from sync\n", stderr: "" };
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    }, {
      refreshDiscordMirror: async () => ({ ok: scenario.ok, detail: scenario.detail }),
      submitWorkflowEvent: async (_paths, input) => {
        emitted.push(input);
        return { containerId: "discord-sync-intake" };
      },
    });
    current.store.db.close();

    const sync = await current.runtime.observe({ gameId: "melee", syncId: `sync-discord-${String(scenario.ok)}` });
    expect(sync.intake.corpus_batch_ids).toEqual([]);
    const store = openState(current.stateDir);
    try {
      const events = listGameEvents(store.db).filter((event) => event.subjectId === sync.sync_id);
      expect(events.map((event) => event.eventType)).toEqual([
        "sync.requested",
        "sync.discord_refresh_requested",
        "sync.discord_refresh_completed",
        "sync.observation_refreshed",
      ]);
      expect(events[2]?.payload).toEqual(expect.objectContaining({ ok: scenario.ok, detail: scenario.detail }));
      expect(emitted.map((event) => [event.operation, event.status])).toEqual([
        ["sync.discord_refresh", scenario.ok ? "completed" : "failed"],
      ]);
      expect(emitted[0]?.metadata).toMatchObject({ ok: scenario.ok, detail: scenario.detail });
    } finally {
      store.db.close();
    }
  });

  test("publishes through distinct control, durable cycle, and staging worktrees", async () => {
    const root = tempDir();
    const gameDir = resolve(root, "game");
    const control = resolve(gameDir, "control");
    const remote = resolve(root, "upstream.git");
    const stateDir = resolve(root, "state");
    const cycleUuid = "cycle-distinct-roots";
    const cycle = resolve(gameDir, "worktrees", "cycles", cycleUuid, "current");
    mkdirSync(gameDir, { recursive: true });
    git(root, "init", "--bare", remote);
    git(gameDir, "clone", remote, control);
    git(control, "config", "user.email", "sync-runtime@example.com");
    git(control, "config", "user.name", "Sync Runtime Test");
    write(control, "base.c", "int base = 1;\n");
    const base = commitAll(control, "base");
    git(control, "push", "origin", "HEAD:master");
    mkdirSync(resolve(cycle, ".."), { recursive: true });
    git(control, "worktree", "add", "-b", `orchestrator/cycle/${cycleUuid}`, cycle, base);
    write(cycle, "local.c", "int local_epoch = 1;\n");
    const localHead = commitAll(cycle, "local epoch");
    write(control, "upstream.c", "int upstream = 2;\n");
    const upstreamHead = commitAll(control, "upstream movement (#711)");
    git(control, "push", "origin", "HEAD:master");

    const store = openState(stateDir);
    createCycle(store.db, {
      actor: "operator",
      baseSha: localHead,
      id: `cycle:${cycleUuid}`,
      gameId: "melee",
      cycleUuid,
    });
    initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
    const sync = recordSyncRequested(store, {
      gameId: "melee",
      cycleUuid,
      syncId: "sync-distinct-roots",
      commandId: "command-observe-distinct-roots",
      actor: "external_observer",
      correlationId: "sync-distinct-roots",
      observationSourceIdentity: "origin/master",
      intake: {
        upstream_from: base,
        upstream_to: upstreamHead,
        merged_pr_ids: ["711"],
        corpus_batch_ids: [],
        knowledge_only: false,
      },
    });
    store.db.close();

    const paths: SyncRuntimeGameContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      game: {
        gameId: "melee",
        baseRef: "origin/master",
        gameDir,
      } as SyncRuntimeGameContext["game"],
      repoRoot: control,
      stateDir,
    };
    const gitRoots: string[] = [];
    const gitCommands: string[][] = [];
    const intakeCalls: Array<Parameters<NonNullable<SyncRuntimeDeps["runKnowledgeIntake"]>>[0]> = [];
    const runtime = createSyncRuntime({
      packageRoot: root,
      resolveDashboardGame: () => paths,
      runGit: async (repoRoot, args, options) => {
        gitRoots.push(repoRoot);
        gitCommands.push(args);
        return defaultSyncGitRunner(repoRoot, args, options);
      },
      stopManaged: async () => ({ stopped: true }),
      sourceRoot: () => root,
      forceReportRun: async (checkoutRoot) => {
        const reportPath = resolve(checkoutRoot, "build/GALE01/report.json");
        write(checkoutRoot, "build/GALE01/report.json", "{}");
        return {
          baselinePath: resolve(checkoutRoot, "build/GALE01/report.base.json"),
          reportChangesPath: resolve(checkoutRoot, "build/GALE01/report.changes.json"),
          reportPath,
          resetBaseline: false,
          steps: [],
          timestamps: { report: "2026-09-03T00:00:00.000Z" },
        };
      },
      runKnowledgeIntake: async (input) => {
        intakeCalls.push(input);
        return {
          fetched_prs: [711],
          skipped_prs: [],
          ingest: {},
        };
      },
      validate: async (worktreePath, context) => {
        expect(context.repoRoot).toBe(control);
        expect(context.cycleWorktreePath).toBe(cycle);
        expect(worktreePath).not.toBe(control);
        expect(worktreePath).not.toBe(cycle);
        return { result: "passed", whatRan: [{ name: "distinct-root-validation" }] };
      },
    });

    const started = await runtime.start({ gameId: "melee", syncId: sync.sync_id, mergePolicy: "theirs" });
    expect(started.sync.status).toBe("validated");
    expect(started.sync.staging?.merge_policy).toBe("theirs");
    expect(gitCommands.some((args) => args[0] === "merge" && args.includes("-X") && args.includes("theirs"))).toBe(true);
    const staging = started.sync.staging?.workspace_path ?? "";
    expect(staging).not.toBe("");
    expect(staging).not.toBe(control);
    expect(staging).not.toBe(cycle);
    expect(git(control, "rev-parse", "HEAD")).toBe(upstreamHead);
    expect(git(cycle, "rev-parse", "HEAD")).toBe(localHead);
    expect(git(staging, "merge-base", "--is-ancestor", upstreamHead, "HEAD")).toBe("");

    const result = await runtime.publish({ gameId: "melee", syncId: sync.sync_id, confirmed: true });
    expect(result.sync.status).toBe("published");
    const publishedHead = result.sync.publication?.new_head;
    if (!publishedHead) throw new Error("Published distinct-root sync has no new head");
    expect(git(control, "rev-parse", "HEAD")).toBe(upstreamHead);
    expect(git(cycle, "rev-parse", "HEAD")).toBe(publishedHead);
    expect(intakeCalls).toHaveLength(1);
    expect(intakeCalls[0]).toMatchObject({
      checkoutRoot: cycle,
      expectedHead: publishedHead.slice(0, 7),
      prNumbers: [711],
    });
    const anchored = openState(stateDir);
    expect(anchored.db.query(
      "SELECT trigger_kind, commit_sha FROM save_points WHERE trigger_kind = 'sync'",
    ).get()).toEqual({ trigger_kind: "sync", commit_sha: publishedHead });
    anchored.db.close();
    expect(gitRoots).toEqual(expect.arrayContaining([control, cycle, staging]));

    write(control, "upstream-2.c", "int upstream_2 = 3;\n");
    const secondUpstreamHead = commitAll(control, "second upstream movement (#712)");
    git(control, "push", "origin", "HEAD:master");
    const secondStore = openState(stateDir);
    const secondSync = recordSyncRequested(secondStore, {
      gameId: "melee",
      cycleUuid,
      syncId: "sync-distinct-roots-cancel",
      commandId: "command-observe-distinct-roots-cancel",
      actor: "external_observer",
      correlationId: "sync-distinct-roots-cancel",
      observationSourceIdentity: "origin/master",
      intake: {
        upstream_from: upstreamHead,
        upstream_to: secondUpstreamHead,
        merged_pr_ids: [],
        corpus_batch_ids: [],
        knowledge_only: false,
      },
    });
    secondStore.db.close();
    const beforeCancel = {
      head: git(cycle, "rev-parse", "HEAD"),
      status: git(cycle, "status", "--porcelain=v1", "--untracked-files=all"),
    };
    const secondStarted = await runtime.start({ gameId: "melee", syncId: secondSync.sync_id });
    const secondStaging = secondStarted.sync.staging?.workspace_path ?? "";
    expect(secondStarted.sync.status).toBe("validated");
    expect(secondStarted.sync.staging?.merge_policy).toBe("score");
    expect(existsSync(secondStaging)).toBe(true);
    const cancelled = await runtime.cancel({ gameId: "melee", syncId: secondSync.sync_id, confirmed: true });
    expect(cancelled.status).toBe("cancelled");
    expect(existsSync(secondStaging)).toBe(false);
    expect({
      head: git(cycle, "rev-parse", "HEAD"),
      status: git(cycle, "status", "--porcelain=v1", "--untracked-files=all"),
    }).toEqual(beforeCancel);
    expect(git(control, "rev-parse", "HEAD")).toBe(secondUpstreamHead);
  }, 30_000);

  test("free lease starts under sync authority and rests validated without releasing", async () => {
    const current = fixture();
    const sync = requested(current.store);
    const commandId = "command-free-sync-start";
    const actionRoot = syncActionSpanId(commandId);
    current.store.db.close();

    const decision = await current.runtime.start({ commandId, gameId: "melee", syncId: sync.sync_id });

    expect(decision).toMatchObject({ queued: false, run_stopping: false, sync: { status: "validated" } });
    const store = openState(current.stateDir);
    try {
      expect(getHarnessState(store, "melee")?.active_workflow).toMatchObject({
        kind: "sync",
        workflow_id: sync.sync_id,
        status: "active",
      });
      expect(listGameEvents(store.db).map((event) => event.eventType)).toEqual(expect.arrayContaining([
        "sync.requested",
        "game.dispatch_requested",
        "game.dispatch_acquired",
        "sync.ingesting",
        "sync.validating",
        "sync.validated",
      ]));
      const actionEvents = listGameEvents(store.db).filter((event) =>
        event.eventType === "game.dispatch_requested" ||
        event.eventType === "game.dispatch_acquired" ||
        event.eventType === "sync.ingesting"
      );
      expect(actionEvents.map((event) => event.eventType)).toEqual([
        "game.dispatch_requested",
        "game.dispatch_acquired",
        "sync.ingesting",
      ]);
      expect(actionEvents.map((event) => event.actor)).toEqual(["operator", "operator", "operator"]);
      expect(actionEvents.map((event) => event.correlationId)).toEqual([sync.sync_id, sync.sync_id, sync.sync_id]);
      expect(actionEvents.map((event) => event.traceId)).toEqual([sync.trace_id, sync.trace_id, sync.trace_id]);
      expect(actionEvents.map((event) => event.parentSpanId)).toEqual([actionRoot, actionRoot, actionRoot]);
      expect(actionEvents.map((event) => event.causationId)).toEqual([
        commandId,
        actionEvents[0]?.eventId,
        actionEvents[1]?.eventId,
      ]);
      expect(new Set(actionEvents.map((event) => event.spanId)).size).toBe(3);
    } finally {
      store.db.close();
    }
  });

  test("operator sync activation queues behind the run and requests a graceful stop", async () => {
    const current = fixture();
    const sync = requested(current.store, "sync-handoff");
    const syncStartCommand = "command-sync-handoff-start";
    const syncStartRoot = syncActionSpanId(syncStartCommand);
    const run = createRun(
      current.store,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", repoRoot: current.paths.repoRoot, stateDir: current.stateDir },
      { baseRevision: "base-test", cycleUuid: "cycle-melee" },
    );
    const runDispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-run-start",
      correlationId: run.id,
      kind: "run",
      gameId: "melee",
      reason: "start run",
      workflowId: run.id,
    });
    if (runDispatch.queued) throw new Error("expected run dispatch lease");
    updateRunStatus(current.store, run.id, "active", "operator");
    expect(gameSyncAction(current.store, "melee", "sync.start", sync.sync_id)).toMatchObject({
      enabled: true,
      blocked_by: [],
      expected_transition: "requested → ingesting after run stops",
    });
    current.store.db.close();

    const decision = await current.runtime.start({
      commandId: syncStartCommand,
      gameId: "melee",
      syncId: sync.sync_id,
    });
    expect(decision).toMatchObject({
      queued: true,
      run_stopping: true,
      lease_id: null,
      sync: { sync_id: sync.sync_id, status: "requested" },
    });
    expect(current.stopCalls).toEqual([expect.objectContaining({
      commandId: syncStartCommand,
      recoverClaims: false,
      runId: run.id,
    })]);
    expect(current.runtime.action({ gameId: "melee", syncId: sync.sync_id }, "sync.cancel")).toMatchObject({
      enabled: true,
      confirmation_required: true,
    });

    const settling = openState(current.stateDir);
    try {
      expect(getHarnessState(settling, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        workflow_id: run.id,
        status: "active",
        requested_handoff: { target_kind: "sync", target_workflow_id: sync.sync_id },
      });
      const queuedRequest = [...listGameEvents(settling.db)].reverse().find(
        (event) => event.eventType === "game.dispatch_requested" && event.payload.workflow_id === sync.sync_id,
      )!;
      const settlementRoot = newSpanId();
      const settlementCommand = "command-run-settled-for-sync";
      const settled = settleStoppedRun({
        actor: "guardian",
        commandId: settlementCommand,
        leaseId: runDispatch.leaseId,
        reason: "run stopped for operator sync",
        runId: run.id,
        spanId: settlementRoot,
        store: settling,
      });
      expect(settled.run.status).toBe("paused");
      expect(getHarnessState(settling, "melee")?.active_workflow).toMatchObject({
        kind: "sync",
        workflow_id: sync.sync_id,
        status: "active",
      });
      expect(current.runtime.action({ gameId: "melee", syncId: sync.sync_id }, "sync.start")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "sync_already_started" })],
      });
      const events = listGameEvents(settling.db);
      const eventTypes = events.map((event) => event.eventType);
      expect(eventTypes.indexOf("game.dispatch_released")).toBeLessThan(eventTypes.indexOf("game.dispatch_acquired", eventTypes.indexOf("game.dispatch_released")));
      expect(eventTypes.indexOf("sync.ingesting")).toBeGreaterThan(eventTypes.lastIndexOf("game.dispatch_acquired"));
      expect(eventTypes.indexOf("run.paused")).toBeGreaterThan(eventTypes.indexOf("sync.ingesting"));
      const release = [...events].reverse().find((event) => event.eventType === "game.dispatch_released")!;
      const acquired = [...events].reverse().find((event) => event.eventType === "game.dispatch_acquired")!;
      const ingesting = [...events].reverse().find((event) => event.eventType === "sync.ingesting")!;
      const paused = [...events].reverse().find((event) => event.eventType === "run.paused")!;
      expect(release.correlationId).toBe(run.id);
      expect(release.traceId).toBe(run.traceId);
      expect(release.payload.handoff_snapshot_id).toMatch(/^handoff-snapshot-/);
      expect(acquired.correlationId).toBe(sync.sync_id);
      expect(acquired.traceId).toBe(sync.trace_id);
      expect(acquired.causationId).toBe(release.eventId);
      expect(ingesting.correlationId).toBe(sync.sync_id);
      expect(ingesting.traceId).toBe(sync.trace_id);
      expect(ingesting.causationId).toBe(acquired.eventId);
      expect(paused.correlationId).toBe(run.id);
      expect(paused.traceId).toBe(run.traceId);
      expect(paused.causationId).toBe(release.eventId);
      expect([release.actor, paused.actor]).toEqual(["guardian", "guardian"]);
      expect([acquired.actor, ingesting.actor]).toEqual(["operator", "operator"]);
      expect(queuedRequest).toMatchObject({
        actor: "operator",
        causationId: syncStartCommand,
        parentSpanId: syncStartRoot,
      });
      expect(new Set([release.spanId, acquired.spanId, ingesting.spanId, paused.spanId]).size).toBe(4);
      expect([release.parentSpanId, paused.parentSpanId]).toEqual([settlementRoot, settlementRoot]);
      expect([acquired.parentSpanId, ingesting.parentSpanId]).toEqual([syncStartRoot, syncStartRoot]);
      expect(new Set([release.parentSpanId, acquired.parentSpanId, ingesting.parentSpanId, paused.parentSpanId])).toEqual(
        new Set([settlementRoot, syncStartRoot]),
      );
    } finally {
      settling.db.close();
    }
  });

  test("legacy handoff provenance fails settlement atomically before release, acquisition, ingestion, or stop", async () => {
    const current = fixture();
    const sync = requested(current.store, "sync-legacy-handoff");
    const run = createRun(
      current.store,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", repoRoot: current.paths.repoRoot, stateDir: current.stateDir },
      { baseRevision: "base-test", cycleUuid: "cycle-melee" },
    );
    const runDispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-run-legacy-handoff",
      correlationId: run.id,
      kind: "run",
      gameId: "melee",
      reason: "start run",
      workflowId: run.id,
    });
    if (runDispatch.queued) throw new Error("expected run dispatch lease");
    updateRunStatus(current.store, run.id, "active", "operator");
    current.store.db.close();

    await current.runtime.start({
      commandId: "command-sync-legacy-handoff",
      gameId: "melee",
      syncId: sync.sync_id,
    });

    const settling = openState(current.stateDir);
    try {
      const game = getHarnessState(settling, "melee")!;
      const handoff = { ...game.active_workflow!.requested_handoff! } as Record<string, unknown>;
      delete handoff.request_event_id;
      const legacyLease = { ...game.active_workflow!, requested_handoff: handoff };
      settling.db.query("UPDATE harness_state SET active_workflow_json = ? WHERE game_id = ?")
        .run(JSON.stringify(legacyLease), "melee");
      const harnessBefore = getHarnessState(settling, "melee");
      const runBefore = getRun(settling, run.id);
      const syncBefore = getSyncState(settling, sync.sync_id);
      const eventsBefore = listGameEvents(settling.db);

      expect(() => settleStoppedRun({
        actor: "guardian",
        commandId: "command-settle-legacy-handoff",
        leaseId: runDispatch.leaseId,
        reason: "supervisor settlement",
        runId: run.id,
        store: settling,
      })).toThrow("missing accepted request provenance field request_event_id");
      expect(getHarnessState(settling, "melee")).toEqual(harnessBefore);
      expect(getRun(settling, run.id)).toEqual(runBefore);
      expect(getSyncState(settling, sync.sync_id)).toEqual(syncBefore);
      expect(listGameEvents(settling.db)).toEqual(eventsBefore);
    } finally {
      settling.db.close();
    }
  });

  test("prior staged sync awaiting a decision blocks a new start", () => {
    const current = fixture();
    let sync = requested(current.store, "sync-blocked");
    const dispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-sync-blocked-start",
      correlationId: sync.sync_id,
      kind: "sync",
      gameId: "melee",
      reason: "start sync",
      workflowId: sync.sync_id,
    });
    if (dispatch.queued) throw new Error("expected sync dispatch lease");
    sync = activateAcquiredSync({
      actor: "operator",
      store: current.store,
      gameId: "melee",
      syncId: sync.sync_id,
      leaseId: dispatch.leaseId,
      commandId: "command-sync-blocked-activated",
      correlationId: sync.sync_id,
      causationId: dispatch.acquiredEventId,
    });
    sync = transitionSync(current.store, sync.sync_id, {
      actor: "runner",
      commandId: "command-sync-blocked-recovery",
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: {
        status: "blocked",
        blockers: [{
          code: "recovery_required",
          message: "Staged ingestion needs an operator decision.",
          source_kind: "sync",
          source_id: sync.sync_id,
          recoverable: true,
        }],
      },
    });

    expect(gameSyncAction(current.store, "melee", "sync.start", sync.sync_id)).toMatchObject({
      enabled: false,
      blocked_by: expect.arrayContaining([
        expect.objectContaining({ code: "sync_staging_awaits_decision" }),
      ]),
    });
    current.store.db.close();
  });

  test("startup reconciliation blocks interrupted publication without mutating the cycle", async () => {
    const current = fixture();
    let sync = requested(current.store, "sync-startup-raw-publishing");
    const dispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-startup-raw-dispatch",
      correlationId: sync.sync_id,
      kind: "sync",
      gameId: "melee",
      reason: "startup raw publishing fixture",
      workflowId: sync.sync_id,
    });
    if (dispatch.queued) throw new Error("expected sync dispatch lease");
    for (const [status, actor] of [
      ["ingesting", "operator"],
      ["validating", "runner"],
      ["validated", "runner"],
      ["publishing", "operator"],
    ] as const) {
      sync = transitionSync(current.store, sync.sync_id, {
        actor,
        commandId: `command-startup-raw-${status}`,
        correlationId: sync.sync_id,
        expectedRevision: sync.revision,
        patch: {
          status,
          ...(status === "validated" ? { validationEvidence: { fixture: "legacy-raw" } } : {}),
        },
        payload: status === "validated" ? { validation_evidence: { fixture: "legacy-raw" } } : undefined,
      });
    }
    current.store.db.close();

    const reconciled = await current.runtime.reconcileStartup({ gameId: "melee" });
    expect(reconciled).toMatchObject({
      status: "blocked",
      blockers: [expect.objectContaining({ code: "publication_interrupted" })],
    });
  });

  test("cancel clears a queued sync handoff and leaves the stopping run without a target", async () => {
    const current = fixture();
    const sync = requested(current.store, "sync-cancel-handoff");
    const run = createRun(
      current.store,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", repoRoot: current.paths.repoRoot, stateDir: current.stateDir },
      { baseRevision: "base-test", cycleUuid: "cycle-melee" },
    );
    const runDispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-run-start-for-cancel",
      correlationId: run.id,
      kind: "run",
      gameId: "melee",
      reason: "start run",
      workflowId: run.id,
    });
    if (runDispatch.queued) throw new Error("expected run dispatch lease");
    updateRunStatus(current.store, run.id, "active", "operator");
    current.store.db.close();

    await current.runtime.start({ gameId: "melee", syncId: sync.sync_id });
    const cancelled = await current.runtime.cancel({
      gameId: "melee",
      syncId: sync.sync_id,
      confirmed: true,
    });

    expect(cancelled.status).toBe("cancelled");
    const store = openState(current.stateDir);
    try {
      expect(getHarnessState(store, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        workflow_id: run.id,
        status: "active",
      });
      expect(getHarnessState(store, "melee")?.active_workflow?.requested_handoff).toBeUndefined();
      expect(getHarnessState(store, "melee")?.queued_dispatch_requests).toEqual([]);
      expect(listGameEvents(store.db).map((event) => event.eventType)).toEqual(expect.arrayContaining([
        "sync.cancelled",
        "game.dispatch_request_cancelled",
      ]));
    } finally {
      store.db.close();
    }
  });
});
