import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { openState } from "@server/core/orchestrator-state";
import { createProjectSession } from "@server/core/project-session/store.js";
import { getProjectState, initializeProjectState, listProjectEvents, newSpanId, requestDispatch } from "@server/core/project-state";
import { createRun, getRun, updateRunStatus } from "@server/core/session-runtime/run-state";
import { settlePausedRun } from "@server/core/session-runtime/phases/running/run-control.js";
import { defaultSyncGitRunner } from "./git.js";
import { getSyncState, recordSyncRequested, syncActionSpanId, transitionSync } from "./state.js";
import { activateAcquiredSync } from "./activation.js";
import {
  createSyncRuntime,
  projectSyncAction,
  type SyncRuntimeDeps,
  type SyncRuntimeProjectContext,
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
  processors: NonNullable<SyncRuntimeDeps["processors"]> = () => ({
    processMergedPr: async ({ job }) => ({ pr: job.sourceId }),
    processCorpus: async ({ job }) => ({ batch: job.sourceId }),
  }),
) {
  const root = tempDir();
  const stateDir = resolve(root, "state");
  const repoRoot = resolve(root, "session");
  const sessionWorktree = resolve(root, "worktrees", "sessions", "session-melee", "current");
  mkdirSync(sessionWorktree, { recursive: true });
  git(sessionWorktree, "init");
  git(sessionWorktree, "config", "user.email", "sync-runtime@example.com");
  git(sessionWorktree, "config", "user.name", "Sync Runtime Test");
  write(sessionWorktree, "base.c", "int base = 1;\n");
  const sessionHead = commitAll(sessionWorktree, "fixture session head");
  const store = openState(stateDir);
  createProjectSession(store.db, {
    actor: "operator",
    baseSha: sessionHead,
    id: "project-session:session-melee",
    projectId: "melee",
    sessionUuid: "session-melee",
  });
  initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
  const paths: SyncRuntimeProjectContext = {
    graphDbPath: resolve(root, "graph.sqlite"),
    project: { projectId: "melee", baseRef: "origin/master" } as SyncRuntimeProjectContext["project"],
    repoRoot,
    stateDir,
  };
  const runtime = createSyncRuntime({
    packageRoot: root,
    resolveDashboardProject: () => paths,
    runCli: async () => ({ exitCode: 0, stdout: "{}", stderr: "" }),
    runGit,
    serverJobPath: resolve(root, "job-runner.ts"),
    sourceRoot: () => root,
    processors,
  });
  return { paths, root, runtime, stateDir, store };
}

function requested(store: ReturnType<typeof openState>, syncId = "sync-1") {
  const sessionHead = (store.db.query(
    "SELECT head_revision FROM project_sessions WHERE session_uuid = 'session-melee'",
  ).get() as { head_revision: string }).head_revision;
  return recordSyncRequested(store, {
    projectId: "melee",
    sessionUuid: "session-melee",
    syncId,
    commandId: `command-observe-${syncId}`,
    actor: "external_observer",
    correlationId: syncId,
    observationSourceIdentity: "origin/master",
    intake: {
      upstream_from: sessionHead,
      upstream_to: sessionHead,
      merged_pr_ids: [],
      corpus_batch_ids: [],
      knowledge_only: true,
    },
  });
}

describe("S4 sync operator runtime", () => {
  test("keeps the operator actor on the failure event for an operator-started action", async () => {
    const current = fixture(defaultSyncGitRunner, () => ({
      processMergedPr: async () => { throw new Error("injected operator ingest failure"); },
      processCorpus: async () => { throw new Error("injected operator ingest failure"); },
    }));
    const sessionHead = (current.store.db.query(
      "SELECT head_revision FROM project_sessions WHERE session_uuid = 'session-melee'",
    ).get() as { head_revision: string }).head_revision;
    recordSyncRequested(current.store, {
      actor: "external_observer",
      commandId: "command-observe-operator-failure",
      correlationId: "sync-operator-failure",
      observationSourceIdentity: "origin/master",
      intake: {
        upstream_from: sessionHead,
        upstream_to: sessionHead,
        merged_pr_ids: [],
        corpus_batch_ids: ["corpus-failure"],
        knowledge_only: true,
      },
      projectId: "melee",
      sessionUuid: "session-melee",
      syncId: "sync-operator-failure",
    });
    current.store.db.close();

    await expect(current.runtime.start({
      commandId: "command-start-operator-failure",
      projectId: "melee",
      syncId: "sync-operator-failure",
    })).rejects.toThrow("injected operator ingest failure");
    const store = openState(current.stateDir);
    try {
      const projectEvents = listProjectEvents(store.db);
      const failureEvent = [...projectEvents].reverse().find((event) =>
        event.subjectId === "sync-operator-failure" && event.eventType === "sync.blocked",
      );
      expect(failureEvent).toMatchObject({ actor: "operator", correlationId: "sync-operator-failure" });
      const actionEvents = projectEvents.filter((event) =>
        event.correlationId === "sync-operator-failure" &&
        ["knowledge.job_processing", "knowledge.job_failed", "sync.blocked"].includes(event.eventType),
      );
      expect(actionEvents.map((event) => event.actor)).toEqual(["operator", "operator", "operator"]);
      expect(actionEvents[1]!.causationId).toBe(actionEvents[0]!.eventId);
    } finally {
      store.db.close();
    }
  });

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
      projectId: "melee",
    });

    expect(refreshed).toMatchObject({
      revision: 1,
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
      const event = listProjectEvents(store.db).find((candidate) =>
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

  test("publishes through distinct control, durable session, and staging worktrees", async () => {
    const root = tempDir();
    const projectDir = resolve(root, "project");
    const control = resolve(projectDir, "control");
    const remote = resolve(root, "upstream.git");
    const stateDir = resolve(root, "state");
    const sessionUuid = "session-distinct-roots";
    const session = resolve(projectDir, "worktrees", "sessions", sessionUuid, "current");
    mkdirSync(projectDir, { recursive: true });
    git(root, "init", "--bare", remote);
    git(projectDir, "clone", remote, control);
    git(control, "config", "user.email", "sync-runtime@example.com");
    git(control, "config", "user.name", "Sync Runtime Test");
    write(control, "base.c", "int base = 1;\n");
    const base = commitAll(control, "base");
    git(control, "push", "origin", "HEAD:master");
    mkdirSync(resolve(session, ".."), { recursive: true });
    git(control, "worktree", "add", "-b", `orchestrator/session/${sessionUuid}`, session, base);
    write(session, "local.c", "int local_epoch = 1;\n");
    const localHead = commitAll(session, "local epoch");
    write(control, "upstream.c", "int upstream = 2;\n");
    const upstreamHead = commitAll(control, "upstream movement (#711)");
    git(control, "push", "origin", "HEAD:master");

    const store = openState(stateDir);
    createProjectSession(store.db, {
      actor: "operator",
      baseSha: localHead,
      id: `project-session:${sessionUuid}`,
      projectId: "melee",
      sessionUuid,
    });
    initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
    const sync = recordSyncRequested(store, {
      projectId: "melee",
      sessionUuid,
      syncId: "sync-distinct-roots",
      commandId: "command-observe-distinct-roots",
      actor: "external_observer",
      correlationId: "sync-distinct-roots",
      observationSourceIdentity: "origin/master",
      intake: {
        upstream_from: base,
        upstream_to: upstreamHead,
        merged_pr_ids: [],
        corpus_batch_ids: [],
        knowledge_only: false,
      },
    });
    store.db.close();

    const paths: SyncRuntimeProjectContext = {
      graphDbPath: resolve(root, "graph.sqlite"),
      project: {
        projectId: "melee",
        baseRef: "origin/master",
        projectDir,
      } as SyncRuntimeProjectContext["project"],
      repoRoot: control,
      stateDir,
    };
    const gitRoots: string[] = [];
    const runtime = createSyncRuntime({
      packageRoot: root,
      resolveDashboardProject: () => paths,
      runCli: async () => ({ exitCode: 0, stdout: "{}", stderr: "" }),
      runGit: async (repoRoot, args, options) => {
        gitRoots.push(repoRoot);
        return defaultSyncGitRunner(repoRoot, args, options);
      },
      serverJobPath: resolve(root, "job-runner.ts"),
      sourceRoot: () => root,
      processors: () => ({
        processMergedPr: async () => ({}),
        processCorpus: async () => ({}),
      }),
      validate: async (worktreePath, context) => {
        expect(context.repoRoot).toBe(control);
        expect(context.sessionWorktreePath).toBe(session);
        expect(worktreePath).not.toBe(control);
        expect(worktreePath).not.toBe(session);
        return { result: "passed", whatRan: [{ name: "distinct-root-validation" }] };
      },
    });

    const started = await runtime.start({ projectId: "melee", syncId: sync.sync_id });
    expect(started.sync.status).toBe("validated");
    const staging = started.sync.staging?.workspace_path ?? "";
    expect(staging).not.toBe("");
    expect(staging).not.toBe(control);
    expect(staging).not.toBe(session);
    expect(git(control, "rev-parse", "HEAD")).toBe(upstreamHead);
    expect(git(session, "rev-parse", "HEAD")).toBe(localHead);
    expect(git(staging, "merge-base", "--is-ancestor", upstreamHead, "HEAD")).toBe("");

    const result = await runtime.publish({ projectId: "melee", syncId: sync.sync_id, confirmed: true });
    expect(result.sync.status).toBe("published");
    const publishedHead = result.sync.publication?.new_head;
    if (!publishedHead) throw new Error("Published distinct-root sync has no new head");
    expect(git(control, "rev-parse", "HEAD")).toBe(upstreamHead);
    expect(git(session, "rev-parse", "HEAD")).toBe(publishedHead);
    const anchored = openState(stateDir);
    expect(anchored.db.query(
      "SELECT trigger_kind, commit_sha FROM save_points WHERE trigger_kind = 'sync'",
    ).get()).toEqual({ trigger_kind: "sync", commit_sha: publishedHead });
    anchored.db.close();
    expect(gitRoots).toEqual(expect.arrayContaining([control, session, staging]));

    write(control, "upstream-2.c", "int upstream_2 = 3;\n");
    const secondUpstreamHead = commitAll(control, "second upstream movement (#712)");
    git(control, "push", "origin", "HEAD:master");
    const secondStore = openState(stateDir);
    const secondSync = recordSyncRequested(secondStore, {
      projectId: "melee",
      sessionUuid,
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
      head: git(session, "rev-parse", "HEAD"),
      status: git(session, "status", "--porcelain=v1", "--untracked-files=all"),
    };
    const secondStarted = await runtime.start({ projectId: "melee", syncId: secondSync.sync_id });
    const secondStaging = secondStarted.sync.staging?.workspace_path ?? "";
    expect(secondStarted.sync.status).toBe("validated");
    expect(existsSync(secondStaging)).toBe(true);
    const cancelled = await runtime.cancel({ projectId: "melee", syncId: secondSync.sync_id, confirmed: true });
    expect(cancelled.status).toBe("cancelled");
    expect(existsSync(secondStaging)).toBe(false);
    expect({
      head: git(session, "rev-parse", "HEAD"),
      status: git(session, "status", "--porcelain=v1", "--untracked-files=all"),
    }).toEqual(beforeCancel);
    expect(git(control, "rev-parse", "HEAD")).toBe(secondUpstreamHead);
  }, 30_000);

  test("free lease starts under sync authority and rests validated without releasing", async () => {
    const current = fixture();
    const sync = requested(current.store);
    const commandId = "command-free-sync-start";
    const actionRoot = syncActionSpanId(commandId);
    current.store.db.close();

    const decision = await current.runtime.start({ commandId, projectId: "melee", syncId: sync.sync_id });

    expect(decision).toMatchObject({ queued: false, run_draining: false, sync: { status: "validated" } });
    const store = openState(current.stateDir);
    try {
      expect(getProjectState(store, "melee")?.active_workflow).toMatchObject({
        kind: "sync",
        workflow_id: sync.sync_id,
        status: "active",
      });
      expect(listProjectEvents(store.db).map((event) => event.eventType)).toEqual(expect.arrayContaining([
        "sync.requested",
        "project.dispatch_requested",
        "project.dispatch_acquired",
        "sync.ingesting",
        "sync.validating",
        "sync.validated",
      ]));
      const actionEvents = listProjectEvents(store.db).filter((event) =>
        event.eventType === "project.dispatch_requested" ||
        event.eventType === "project.dispatch_acquired" ||
        event.eventType === "sync.ingesting"
      );
      expect(actionEvents.map((event) => event.eventType)).toEqual([
        "project.dispatch_requested",
        "project.dispatch_acquired",
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

  test("operator sync activation queues behind the run and begins its handoff drain", async () => {
    const current = fixture();
    const sync = requested(current.store, "sync-handoff");
    const syncStartCommand = "command-sync-handoff-start";
    const syncStartRoot = syncActionSpanId(syncStartCommand);
    const run = createRun(
      current.store,
      "matched_code_percent",
      100,
      1,
      { projectId: "melee", repoRoot: current.paths.repoRoot, stateDir: current.stateDir },
      { baseRevision: "base-test", sessionUuid: "session-melee" },
    );
    const runDispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-run-start",
      correlationId: run.id,
      kind: "run",
      projectId: "melee",
      reason: "start run",
      workflowId: run.id,
    });
    if (runDispatch.queued) throw new Error("expected run dispatch lease");
    updateRunStatus(current.store, run.id, "active", "operator");
    expect(projectSyncAction(current.store, "melee", "sync.start", sync.sync_id)).toMatchObject({
      enabled: true,
      blocked_by: [],
      expected_transition: "requested → ingesting after run drains",
    });
    current.store.db.close();

    const decision = await current.runtime.start({
      commandId: syncStartCommand,
      projectId: "melee",
      syncId: sync.sync_id,
    });
    expect(decision).toMatchObject({
      queued: true,
      run_draining: true,
      lease_id: null,
      sync: { sync_id: sync.sync_id, status: "requested" },
    });
    expect(current.runtime.action({ projectId: "melee", syncId: sync.sync_id }, "sync.cancel")).toMatchObject({
      enabled: true,
      confirmation_required: true,
    });

    const settling = openState(current.stateDir);
    try {
      expect(getProjectState(settling, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        workflow_id: run.id,
        status: "draining",
        requested_handoff: { target_kind: "sync", target_workflow_id: sync.sync_id },
      });
      const drain = [...listProjectEvents(settling.db)].reverse().find(
        (event) => event.eventType === "project.dispatch_drain_started",
      )!;
      const queuedRequest = [...listProjectEvents(settling.db)].reverse().find(
        (event) => event.eventType === "project.dispatch_requested" && event.payload.workflow_id === sync.sync_id,
      )!;
      const settlementRoot = newSpanId();
      const settlementCommand = "command-run-settled-for-sync";
      const settled = settlePausedRun({
        actor: "guardian",
        commandId: settlementCommand,
        leaseId: runDispatch.leaseId,
        reason: "run drained for operator sync",
        runId: run.id,
        spanId: settlementRoot,
        store: settling,
      });
      expect(settled.run.status).toBe("paused");
      expect(getProjectState(settling, "melee")?.active_workflow).toMatchObject({
        kind: "sync",
        workflow_id: sync.sync_id,
        status: "active",
      });
      expect(current.runtime.action({ projectId: "melee", syncId: sync.sync_id }, "sync.start")).toMatchObject({
        enabled: false,
        blocked_by: [expect.objectContaining({ code: "sync_already_started" })],
      });
      const events = listProjectEvents(settling.db);
      const eventTypes = events.map((event) => event.eventType);
      expect(eventTypes.indexOf("project.dispatch_released")).toBeLessThan(eventTypes.indexOf("project.dispatch_acquired", eventTypes.indexOf("project.dispatch_released")));
      expect(eventTypes.indexOf("sync.ingesting")).toBeGreaterThan(eventTypes.lastIndexOf("project.dispatch_acquired"));
      expect(eventTypes.indexOf("run.paused")).toBeGreaterThan(eventTypes.indexOf("sync.ingesting"));
      const release = [...events].reverse().find((event) => event.eventType === "project.dispatch_released")!;
      const acquired = [...events].reverse().find((event) => event.eventType === "project.dispatch_acquired")!;
      const ingesting = [...events].reverse().find((event) => event.eventType === "sync.ingesting")!;
      const paused = [...events].reverse().find((event) => event.eventType === "run.paused")!;
      expect(release.correlationId).toBe(run.id);
      expect(release.traceId).toBe(run.traceId);
      expect(release.causationId).toBe(drain.eventId);
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

  test("legacy handoff provenance fails settlement atomically before release, acquisition, ingestion, or pause", async () => {
    const current = fixture();
    const sync = requested(current.store, "sync-legacy-handoff");
    const run = createRun(
      current.store,
      "matched_code_percent",
      100,
      1,
      { projectId: "melee", repoRoot: current.paths.repoRoot, stateDir: current.stateDir },
      { baseRevision: "base-test", sessionUuid: "session-melee" },
    );
    const runDispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-run-legacy-handoff",
      correlationId: run.id,
      kind: "run",
      projectId: "melee",
      reason: "start run",
      workflowId: run.id,
    });
    if (runDispatch.queued) throw new Error("expected run dispatch lease");
    updateRunStatus(current.store, run.id, "active", "operator");
    current.store.db.close();

    await current.runtime.start({
      commandId: "command-sync-legacy-handoff",
      projectId: "melee",
      syncId: sync.sync_id,
    });

    const settling = openState(current.stateDir);
    try {
      const project = getProjectState(settling, "melee")!;
      const handoff = { ...project.active_workflow!.requested_handoff! } as Record<string, unknown>;
      delete handoff.request_event_id;
      const legacyLease = { ...project.active_workflow!, requested_handoff: handoff };
      settling.db.query("UPDATE project_state SET active_workflow_json = ? WHERE project_id = ?")
        .run(JSON.stringify(legacyLease), "melee");
      const projectBefore = getProjectState(settling, "melee");
      const runBefore = getRun(settling, run.id);
      const syncBefore = getSyncState(settling, sync.sync_id);
      const eventsBefore = listProjectEvents(settling.db);

      expect(() => settlePausedRun({
        actor: "guardian",
        commandId: "command-settle-legacy-handoff",
        leaseId: runDispatch.leaseId,
        reason: "supervisor settlement",
        runId: run.id,
        store: settling,
      })).toThrow("missing accepted request provenance field request_event_id");
      expect(getProjectState(settling, "melee")).toEqual(projectBefore);
      expect(getRun(settling, run.id)).toEqual(runBefore);
      expect(getSyncState(settling, sync.sync_id)).toEqual(syncBefore);
      expect(listProjectEvents(settling.db)).toEqual(eventsBefore);
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
      projectId: "melee",
      reason: "start sync",
      workflowId: sync.sync_id,
    });
    if (dispatch.queued) throw new Error("expected sync dispatch lease");
    sync = activateAcquiredSync({
      actor: "operator",
      store: current.store,
      projectId: "melee",
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

    expect(projectSyncAction(current.store, "melee", "sync.start", sync.sync_id)).toMatchObject({
      enabled: false,
      blocked_by: expect.arrayContaining([
        expect.objectContaining({ code: "sync_staging_awaits_decision" }),
      ]),
    });
    current.store.db.close();
  });

  test("startup reconciliation blocks legacy raw publishing without mutating the session", async () => {
    const current = fixture();
    let sync = requested(current.store, "sync-startup-raw-publishing");
    const dispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-startup-raw-dispatch",
      correlationId: sync.sync_id,
      kind: "sync",
      projectId: "melee",
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

    const reconciled = await current.runtime.reconcileStartup({ projectId: "melee" });
    expect(reconciled).toMatchObject({
      status: "blocked",
      blockers: [expect.objectContaining({ code: "publication_intent_missing" })],
    });
  });

  test("cancel clears a queued sync handoff and leaves the run draining without a target", async () => {
    const current = fixture();
    const sync = requested(current.store, "sync-cancel-handoff");
    const run = createRun(
      current.store,
      "matched_code_percent",
      100,
      1,
      { projectId: "melee", repoRoot: current.paths.repoRoot, stateDir: current.stateDir },
      { baseRevision: "base-test", sessionUuid: "session-melee" },
    );
    const runDispatch = requestDispatch(current.store, {
      actor: "operator",
      commandId: "command-run-start-for-cancel",
      correlationId: run.id,
      kind: "run",
      projectId: "melee",
      reason: "start run",
      workflowId: run.id,
    });
    if (runDispatch.queued) throw new Error("expected run dispatch lease");
    updateRunStatus(current.store, run.id, "active", "operator");
    current.store.db.close();

    await current.runtime.start({ projectId: "melee", syncId: sync.sync_id });
    const cancelled = await current.runtime.cancel({
      projectId: "melee",
      syncId: sync.sync_id,
      confirmed: true,
    });

    expect(cancelled.status).toBe("cancelled");
    const store = openState(current.stateDir);
    try {
      expect(getProjectState(store, "melee")?.active_workflow).toMatchObject({
        kind: "run",
        workflow_id: run.id,
        status: "draining",
      });
      expect(getProjectState(store, "melee")?.active_workflow?.requested_handoff).toBeUndefined();
      expect(getProjectState(store, "melee")?.queued_dispatch_requests).toEqual([]);
      expect(listProjectEvents(store.db).map((event) => event.eventType)).toEqual(expect.arrayContaining([
        "sync.cancelled",
        "project.dispatch_request_cancelled",
      ]));
    } finally {
      store.db.close();
    }
  });
});
