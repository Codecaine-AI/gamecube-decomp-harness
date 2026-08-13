import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { openState } from "@server/core/orchestrator-state";
import { createProjectSession } from "@server/core/project-session/store.js";
import { getProjectState, initializeProjectState, listProjectEvents, requestDispatch } from "@server/core/project-state";
import { createRun, updateRunStatus } from "@server/core/session-runtime/run-state";
import { settlePausedRun } from "@server/core/session-runtime/phases/running/run-control.js";
import { defaultSyncGitRunner } from "./git.js";
import { recordSyncRequested, transitionSync } from "./state.js";
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
    processors: () => ({
      processMergedPr: async ({ job }) => ({ pr: job.sourceId }),
      processCorpus: async ({ job }) => ({ batch: job.sourceId }),
    }),
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
    current.store.db.close();

    const decision = await current.runtime.start({ projectId: "melee", syncId: sync.sync_id });

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
    } finally {
      store.db.close();
    }
  });

  test("operator sync activation queues behind the run and begins its handoff drain", async () => {
    const current = fixture();
    const sync = requested(current.store, "sync-handoff");
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

    const decision = await current.runtime.start({ projectId: "melee", syncId: sync.sync_id });
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
      const settled = settlePausedRun({
        actor: "guardian",
        commandId: "command-run-settled-for-sync",
        correlationId: sync.sync_id,
        leaseId: runDispatch.leaseId,
        reason: "run drained for operator sync",
        runId: run.id,
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
      const eventTypes = listProjectEvents(settling.db).map((event) => event.eventType);
      expect(eventTypes.indexOf("project.dispatch_released")).toBeLessThan(eventTypes.indexOf("project.dispatch_acquired", eventTypes.indexOf("project.dispatch_released")));
      expect(eventTypes.indexOf("sync.ingesting")).toBeGreaterThan(eventTypes.lastIndexOf("project.dispatch_acquired"));
      expect(eventTypes.indexOf("run.paused")).toBeGreaterThan(eventTypes.indexOf("sync.ingesting"));
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
      kind: "sync",
      projectId: "melee",
      reason: "start sync",
      workflowId: sync.sync_id,
    });
    if (dispatch.queued) throw new Error("expected sync dispatch lease");
    sync = activateAcquiredSync({
      store: current.store,
      projectId: "melee",
      syncId: sync.sync_id,
      leaseId: dispatch.leaseId,
      commandId: "command-sync-blocked-activated",
    });
    sync = transitionSync(current.store, sync.sync_id, {
      actor: "runner",
      commandId: "command-sync-blocked-recovery",
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
        expectedRevision: sync.revision,
        patch: { status },
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
