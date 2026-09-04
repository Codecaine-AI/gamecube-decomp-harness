import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createCycle } from "@server/core/cycle/store.js";
import { eventsForSubject } from "@server/core/harness-state/events.js";
import { getHarnessState, initializeHarnessState, requestDispatch } from "@server/core/harness-state/lease.js";
import {
  cancelSync,
  createSyncStagingWorkspace,
  inspectSyncStaging,
  markSyncRecoveryRequired,
  reconcileSync,
  recoverSync,
  recordSyncRequested,
  refreshSyncUpstreamObservation,
  resolveSyncConflict,
  syncStagingPaths,
  syncValidationPolicy,
  transitionSync,
  validateSync,
  type SyncEngineContext,
  type SyncState,
} from "./index.js";
import { gameSyncAction } from "./runtime.js";

const tempDirs: string[] = [];
const stores: StateStore[] = [];

interface Fixture {
  base: string;
  context: SyncEngineContext;
  root: string;
  seed: string;
  cycle: string;
  stateDir: string;
  store: StateStore;
  sync: SyncState;
  upstream: string;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? "").trim();
}

function configureGit(repo: string): void {
  git(repo, "config", "user.email", "sync-test@example.com");
  git(repo, "config", "user.name", "Sync Test");
}

function commitAll(repo: string, message: string): string {
  git(repo, "add", "-A");
  git(repo, "commit", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function write(repo: string, path: string, content: string): void {
  const absolute = resolve(repo, path);
  mkdirSync(resolve(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function hashWorktree(root: string): string {
  const hash = createHash("sha256");
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (relative(root, dir) === "" && name === ".git") continue;
      const path = resolve(dir, name);
      const stat = lstatSync(path);
      const key = relative(root, path);
      if (stat.isDirectory()) {
        hash.update(`dir\0${key}\0${stat.mode}\0`);
        visit(path);
      } else if (stat.isSymbolicLink()) {
        hash.update(`link\0${key}\0${readlinkSync(path)}\0`);
      } else {
        hash.update(`file\0${key}\0${stat.mode}\0`);
        hash.update(readFileSync(path));
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

function startSync(fixture: Omit<Fixture, "sync" | "context">, syncId: string): Pick<Fixture, "sync" | "context"> {
  initializeHarnessState(fixture.store, { gameId: "melee", traceId: "trace-game-melee" });
  createCycle(fixture.store.db, {
    actor: "operator",
    baseSha: git(fixture.cycle, "rev-parse", "HEAD"),
    id: "cycle:melee",
    gameId: "melee",
    cycleUuid: "cycle-melee",
  });
  let sync = recordSyncRequested(fixture.store, {
    gameId: "melee",
    cycleUuid: "cycle-melee",
    intake: {
      upstream_from: fixture.base,
      upstream_to: fixture.upstream,
      merged_pr_ids: ["pr-101"],
      corpus_batch_ids: [],
      knowledge_only: false,
    },
    syncId,
    commandId: `${syncId}:requested`,
    actor: "external_observer",
    correlationId: syncId,
  });
  const decision = requestDispatch(fixture.store, {
    actor: "operator",
    commandId: `${syncId}:lease-requested`,
    correlationId: syncId,
    kind: "sync",
    gameId: "melee",
    reason: "test staged reconciliation",
    workflowId: syncId,
  });
  if (decision.queued) throw new Error("Expected the sync lease to be acquired");
  sync = transitionSync(fixture.store, syncId, {
    actor: "operator",
    commandId: `${syncId}:started`,
    correlationId: syncId,
    expectedRevision: sync.revision,
    patch: { status: "ingesting" },
  });
  return {
    sync,
    context: {
      store: fixture.store,
      stateDir: fixture.stateDir,
      repoRoot: fixture.cycle,
      cycleWorktreePath: fixture.cycle,
      game: { baseRef: "origin/master" },
      leaseId: decision.leaseId,
      now: () => "2026-08-13T18:00:00.000Z",
    },
  };
}

function conflictFixture(syncId = "sync-conflicts", withPrSeries = true): Fixture {
  const root = mkdtempSync(join(tmpdir(), "sync-engine-"));
  tempDirs.push(root);
  const remote = resolve(root, "upstream.git");
  const seed = resolve(root, "seed");
  const cycle = resolve(root, "cycle");
  const stateDir = resolve(root, "state");
  git(root, "init", "--bare", remote);
  git(root, "clone", remote, seed);
  configureGit(seed);
  write(seed, "trivial.c", "int value = 1;\n");
  write(seed, "ambiguous.c", "const char *color = \"base\";\n");
  write(seed, "series.c", "int series = 0;\n");
  write(seed, "series-trivial.c", "int series_trivial = 0;\n");
  write(seed, "cycle-rename.txt", "cycle rename base\n");
  write(seed, "series-rename.txt", "series rename base\n");
  const base = commitAll(seed, "base");
  git(seed, "push", "origin", "HEAD:master");

  git(root, "clone", remote, cycle);
  configureGit(cycle);
  if (withPrSeries) {
    git(cycle, "checkout", "-b", "codex/split-01-series", base);
    write(cycle, "series.c", "int series = 1;\n");
    git(cycle, "mv", "series-rename.txt", "series-cycle-renamed.txt");
    const prHead = commitAll(cycle, "PR series commit");
    git(cycle, "checkout", "-b", "codex/split-02-trivial", base);
    write(cycle, "series-trivial.c", "int series_trivial=1;\n");
    const trivialPrHead = commitAll(cycle, "PR series mechanical conflict");
    git(cycle, "checkout", "master");
    mkdirSync(resolve(stateDir, "pr_handoff"), { recursive: true });
    writeFileSync(resolve(stateDir, "pr_handoff/pr_records.json"), JSON.stringify({
      schemaVersion: "cycle_pr_records_v2",
      records: [
        {
          sliceId: "series-01",
          branch: "codex/split-01-series",
          status: "open",
          baseSha: base,
          local: { status: "ready", commitSha: prHead },
        },
        {
          sliceId: "series-02",
          branch: "codex/split-02-trivial",
          status: "open",
          baseSha: base,
          local: { status: "ready", commitSha: trivialPrHead },
        },
      ],
    }, null, 2));
  }
  write(cycle, "trivial.c", "int value=2;\n");
  commitAll(cycle, "epoch 1 trivial mechanical conflict");
  write(cycle, "ambiguous.c", "const char *color = \"cycle\";\n");
  git(cycle, "mv", "cycle-rename.txt", "cycle-renamed.txt");
  commitAll(cycle, "epoch 2 ambiguous conflict");

  write(seed, "trivial.c", "int value = 2;\n");
  write(seed, "ambiguous.c", "const char *color = \"upstream\";\n");
  git(seed, "mv", "cycle-rename.txt", "upstream-renamed.txt");
  if (withPrSeries) {
    write(seed, "series.c", "int series = 2;\n");
    write(seed, "series-trivial.c", "int series_trivial = 1;\n");
    git(seed, "mv", "series-rename.txt", "series-upstream-renamed.txt");
  }
  write(seed, "upstream.c", "int upstream = 1;\n");
  const upstream = commitAll(seed, "upstream movement (#101)");
  git(seed, "push", "origin", "HEAD:master");

  const store = openState(stateDir);
  stores.push(store);
  const partial = { base, root, seed, cycle, stateDir, store, upstream };
  const started = startSync(partial, syncId);
  return { ...partial, ...started };
}

function resolveRenameConflict(
  worktreePath: string,
  conflictingPaths: string[],
  selectedPath: string,
  content: string,
): void {
  for (const path of conflictingPaths) rmSync(resolve(worktreePath, path), { force: true });
  write(worktreePath, selectedPath, content);
}

async function validateFixtureWithoutPrSeries(fixture: Fixture, command: string): Promise<SyncState> {
  let sync = await reconcileSync({
    context: fixture.context,
    syncId: fixture.sync.sync_id,
    expectedRevision: fixture.sync.revision,
    commandId: `${command}:reconcile`,
  });
  const staging = await inspectSyncStaging({ context: fixture.context, syncId: sync.sync_id });
  resolveRenameConflict(staging.cycle.path, staging.cycle.conflictingPaths, "cycle-renamed.txt", "operator resolved\n");
  sync = await resolveSyncConflict({
    context: fixture.context,
    syncId: sync.sync_id,
    expectedRevision: sync.revision,
    commandId: `${command}:resolve`,
  });
  return validateSync(fixture.context, {
    syncId: sync.sync_id,
    expectedRevision: sync.revision,
    commandId: `${command}:validate`,
    validate: async () => ({ result: "passed", whatRan: [{ name: "fixture gate" }] }),
  });
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("staged sync reconciliation", () => {
  test("links canonical game assets into a newly created sync staging worktree", async () => {
    const fixture = conflictFixture("sync-links-assets", false);
    writeFileSync(resolve(fixture.cycle, ".git/info/exclude"), "orig/\n", "utf8");
    const source = resolve(fixture.cycle, "orig/GALE01/sys/main.dol");
    write(fixture.cycle, "orig/GALE01/sys/main.dol", "fixture dol\n");

    const sync = await createSyncStagingWorkspace({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-create-staging-with-assets",
    });

    const linked = resolve(sync.staging!.workspace_path!, "orig/GALE01/sys/main.dol");
    expect(lstatSync(linked).isSymbolicLink()).toBe(true);
    expect(readlinkSync(linked)).toBe(source);
  }, 30_000);

  test("adopts upstream only when the cycle has no commits after the prior upstream", () => {
    expect(syncValidationPolicy({ cycle_head_sha: "same" }, "same")).toEqual({ adoptUpstream: true, resetBaseline: true });
    expect(syncValidationPolicy({ cycle_head_sha: "cycle" }, "upstream")).toEqual({ adoptUpstream: false, resetBaseline: false });
  });

  test("excludes a lingering merged split branch from durable PR series selection", async () => {
    const fixture = conflictFixture("sync-terminal-pr-record");
    const recordsPath = resolve(fixture.stateDir, "pr_handoff/pr_records.json");
    const records = JSON.parse(readFileSync(recordsPath, "utf8")) as {
      records: Array<{ branch: string; status: string }>;
    };
    const merged = records.records.find((record) => record.branch === "codex/split-01-series");
    if (!merged) throw new Error("Expected fixture PR record");
    merged.status = "merged";
    writeFileSync(recordsPath, JSON.stringify(records, null, 2), "utf8");
    expect(git(fixture.cycle, "rev-parse", "--verify", "codex/split-01-series")).not.toBe("");

    let sync = await reconcileSync({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-reconcile-terminal-pr-record",
    });
    const staging = await inspectSyncStaging({ context: fixture.context, syncId: sync.sync_id });
    resolveRenameConflict(staging.cycle.path, staging.cycle.conflictingPaths, "cycle-renamed.txt", "operator merged\n");
    sync = await resolveSyncConflict({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resolve-terminal-pr-record",
    });

    expect(sync.status).toBe("validating");
    expect(sync.pr_reconciliation).toEqual([
      { series_id: "series-02", branch: "codex/split-02-trivial", result: "auto_resolved", pushed: false },
    ]);
    expect(sync.staging?.pr_workspaces?.map((workspace) => workspace.branch)).toEqual([
      "codex/split-02-trivial",
    ]);
  }, 30_000);

  test("auto-resolves a mechanical conflict, blocks an ambiguous conflict, merges PR series, validates, and detects staleness", async () => {
    const fixture = conflictFixture();
    const originalPrHead = git(fixture.cycle, "rev-parse", "codex/split-01-series");

    let sync = await reconcileSync({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-reconcile",
    });

    expect(sync.status).toBe("blocked");
    expect(sync.staging).toMatchObject({
      commits_behind: 1,
      minor_conflicts_resolved: 1,
      auto_resolved_paths: ["trivial.c"],
      conflicts_awaiting_operator: 3,
      merge_in_progress: true,
    });
    expect(sync.blockers).toEqual([
      expect.objectContaining({ code: "conflict_needs_operator", message: expect.stringContaining("cycle-renamed.txt") }),
    ]);
    expect(sync.resolved_conflict_paths).toEqual(expect.arrayContaining(["trivial.c"]));
    expect(eventsForSubject(fixture.store.db, "sync_workflow", sync.sync_id).at(-1)).toMatchObject({
      eventType: "sync.reconciliation_blocked",
      payload: expect.objectContaining({ from_status: "reconciling", to_status: "blocked" }),
    });

    const staging = await inspectSyncStaging({ context: fixture.context, syncId: sync.sync_id });
    expect(staging.cycle).toMatchObject({ exists: true, mergeInProgress: true });
    expect(staging.cycle.conflictingPaths).toContain("cycle-renamed.txt");
    resolveRenameConflict(staging.cycle.path, staging.cycle.conflictingPaths, "cycle-renamed.txt", "operator merged\n");

    sync = await resolveSyncConflict({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resolve",
    });

    expect(sync.status).toBe("blocked");
    expect(sync.pr_reconciliation).toEqual([
      { series_id: "series-01", branch: "codex/split-01-series", result: "needs_operator", pushed: false },
      { series_id: "series-02", branch: "codex/split-02-trivial", result: "auto_resolved", pushed: false },
    ]);
    expect(sync.resolved_conflict_paths).toEqual(expect.arrayContaining([
      "cycle-renamed.txt",
      "trivial.c",
    ]));
    expect(sync.staging?.pr_workspaces?.find((workspace) => workspace.series_id === "series-02")?.auto_resolved_paths)
      .toEqual(["series-trivial.c"]);
    expect(sync.staging?.conflicting_paths).toEqual(expect.arrayContaining([
      "codex/split-01-series:series-cycle-renamed.txt",
    ]));
    const blockedPrWorkspace = sync.staging?.pr_workspaces?.find((workspace) => workspace.series_id === "series-01");
    resolveRenameConflict(
      blockedPrWorkspace!.workspace_path,
      blockedPrWorkspace!.conflicting_paths ?? [],
      "series-cycle-renamed.txt",
      "operator series resolution\n",
    );
    sync = await resolveSyncConflict({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resolve-pr-series",
    });

    expect(sync.status).toBe("validating");
    expect(sync.staging).toMatchObject({
      commits_behind: 1,
      conflicts_awaiting_operator: 0,
      last_durable_stage: "pr_series_reconciled",
    });
    expect(sync.pr_reconciliation).toEqual([
      { series_id: "series-01", branch: "codex/split-01-series", result: "needs_operator", pushed: false },
      { series_id: "series-02", branch: "codex/split-02-trivial", result: "auto_resolved", pushed: false },
    ]);
    expect(sync.resolved_conflict_paths).toEqual(expect.arrayContaining([
      "cycle-renamed.txt",
      "codex/split-01-series:series-cycle-renamed.txt",
      "trivial.c",
    ]));
    expect(git(fixture.cycle, "rev-parse", "codex/split-01-series")).toBe(originalPrHead);
    const prWorkspace = sync.staging?.pr_workspaces?.[0];
    expect(prWorkspace?.staging_head).not.toBe(originalPrHead);
    expect(git(prWorkspace!.workspace_path, "merge-base", "--is-ancestor", fixture.upstream, "HEAD")).toBe("");

    sync = await validateSync(fixture.context, {
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-validate",
      validate: async (_worktreePath, _context, stagingProgress) => {
        expect(stagingProgress).toMatchObject({ commits_behind: 1 });
        return {
          result: "passed",
          whatRan: [{ name: "fixture baseline gate", command: ["fixture", "gate"] }],
          details: { regressions: 0 },
        };
      },
    });
    expect(sync.status).toBe("validated");
    expect(sync.staging?.validation_evidence).toMatchObject({
      result: "passed",
      staging_head_sha: sync.staging?.staging_head_sha,
      validated_at: "2026-08-13T18:00:00.000Z",
      regressions: 0,
    });

    write(fixture.seed, "later.c", "int later = 1;\n");
    const later = commitAll(fixture.seed, "upstream moved after validation");
    git(fixture.seed, "push", "origin", "HEAD:master");
    const stale = await refreshSyncUpstreamObservation({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-refresh-upstream",
    });
    expect(stale).toMatchObject({ stale: true, observedUpstream: later });
    expect(stale.sync.status).toBe("blocked");
    expect(stale.sync.blockers[0]?.code).toBe("upstream_moved_after_validation");
    expect(gameSyncAction(fixture.store, "melee", "sync.recover", stale.sync.sync_id).enabled).toBe(true);
    expect(gameSyncAction(fixture.store, "melee", "sync.cancel", stale.sync.sync_id).enabled).toBe(true);

    // Recover resume extends the validated candidate in place: staging (and
    // surviving PR workspaces) merge the new tip and validation re-runs.
    const revalidating = await recoverSync({
      context: fixture.context,
      syncId: stale.sync.sync_id,
      expectedRevision: stale.sync.revision,
      commandId: "command-revalidate-stale",
      choice: "resume",
      recoveryReason: "operator extended the validated candidate to the new upstream tip",
    });
    expect(revalidating.status).toBe("validating");
    expect(revalidating.intake.upstream_to).toBe(later);
    expect(revalidating.staging?.observed_upstream).toBe(later);
    expect(revalidating.staging?.validated_upstream).toBeUndefined();
    expect(git(revalidating.staging!.workspace_path!, "merge-base", "--is-ancestor", later, "HEAD")).toBe("");
    for (const workspace of revalidating.staging?.pr_workspaces ?? []) {
      expect(git(workspace.workspace_path, "merge-base", "--is-ancestor", later, "HEAD")).toBe("");
    }
    const revalidated = await validateSync(fixture.context, {
      syncId: revalidating.sync_id,
      expectedRevision: revalidating.revision,
      commandId: "command-revalidate-stale-validate",
      validate: async () => ({ result: "passed", whatRan: [{ name: "fixture revalidation gate" }] }),
    });
    expect(revalidated.status).toBe("validated");
    expect(revalidated.staging?.validated_upstream).toBe(later);
  }, 30_000);

  test("upstream returning to the original anchor becomes cancellable staleness instead of crashing observation", async () => {
    const fixture = conflictFixture("sync-upstream-returned", false);
    const validated = await validateFixtureWithoutPrSeries(fixture, "command-upstream-returned");
    expect(validated.status).toBe("validated");
    git(fixture.seed, "push", "--force", "origin", `${fixture.base}:master`);

    const stale = await refreshSyncUpstreamObservation({
      context: fixture.context,
      syncId: validated.sync_id,
      expectedRevision: validated.revision,
      commandId: "command-observe-returned-anchor",
    });

    expect(stale).toMatchObject({ stale: true, observedUpstream: fixture.base });
    expect(stale.sync).toMatchObject({
      status: "blocked",
      blockers: [expect.objectContaining({ code: "upstream_moved_after_validation" })],
      intake: { upstream_to: fixture.upstream },
    });
    // With durable staging present the stale candidate is revalidatable in
    // place through sync.recover; cancel stays available as the alternative.
    expect(gameSyncAction(fixture.store, "melee", "sync.recover", stale.sync.sync_id).enabled).toBe(true);
    expect(gameSyncAction(fixture.store, "melee", "sync.cancel", stale.sync.sync_id).enabled).toBe(true);
  }, 30_000);

  test("sync.cancel discards all staging while the cycle worktree remains byte-identical", async () => {
    const fixture = conflictFixture("sync-cancel", false);
    const before = hashWorktree(fixture.cycle);
    let sync = await reconcileSync({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-reconcile-before-cancel",
    });
    expect(sync.status).toBe("blocked");
    expect(lstatSync(syncStagingPaths(fixture.stateDir, sync.sync_id).root).isDirectory()).toBe(true);

    sync = await cancelSync({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-cancel",
    });

    expect(sync.status).toBe("cancelled");
    expect(sync.staging).toBeNull();
    expect(getHarnessState(fixture.store, "melee")?.active_workflow).toBeNull();
    expect(hashWorktree(fixture.cycle)).toBe(before);
    expect(existsSync(syncStagingPaths(fixture.stateDir, sync.sync_id).root)).toBe(false);
    expect(eventsForSubject(fixture.store.db, "sync_workflow", sync.sync_id).at(-1)).toMatchObject({
      eventType: "sync.cancelled",
      payload: expect.objectContaining({
        from_status: "blocked",
        to_status: "cancelled",
        untouched_cycle_head: git(fixture.cycle, "rev-parse", "HEAD"),
      }),
    });
  }, 30_000);

  test("sync.recover resumes a sync blocked before any durable staging by restarting the stage", async () => {
    const fixture = conflictFixture("sync-recover-bare", false);
    // The live failure shape: the cycle worktree check threw while entering
    // reconciliation, before the ingesting -> reconciling transition — origin
    // "ingesting", staging null, ingest fully succeeded.
    let sync = markSyncRecoveryRequired({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-record-bare-crash",
      reason: "Worktree is missing: /worktrees/cycles/cycle-melee/current",
    });
    expect(sync.status).toBe("blocked");
    expect(sync.staging).toBeNull();
    expect(existsSync(syncStagingPaths(fixture.stateDir, sync.sync_id).root)).toBe(false);

    sync = await recoverSync({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resume-bare",
      choice: "resume",
      recoveryReason: "operator resumed after restoring the cycle worktree",
    });

    expect(sync.status).toBe("ingesting");
    expect(sync.blockers).toEqual([]);
    expect(eventsForSubject(fixture.store.db, "sync_workflow", sync.sync_id).at(-1)).toMatchObject({
      eventType: "sync.recovered",
      payload: expect.objectContaining({
        resume_stage: "ingesting",
        to_status: "ingesting",
        staging_preserved: true,
        staging_discarded: false,
      }),
    });

    // The stage restarts from the bare post-ingest state: reconciliation
    // re-derives staging from the cycle worktree and ingest artifacts.
    sync = await reconcileSync({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-reconcile-after-bare-resume",
    });
    expect(sync.staging?.workspace_path).toBeTruthy();
    expect(existsSync(syncStagingPaths(fixture.stateDir, sync.sync_id).root)).toBe(true);
    // The fixture's ambiguous conflict blocks as usual — reconciliation ran.
    expect(sync.status).toBe("blocked");
    expect(sync.blockers[0]?.code).toBe("conflict_needs_operator");
  }, 30_000);

  test("sync.recover resume with durable staging still resumes through the staged workspace", async () => {
    const fixture = conflictFixture("sync-recover-staged-resume", false);
    let sync = await reconcileSync({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-reconcile-before-staged-crash",
    });
    resolveRenameConflict(
      sync.staging!.workspace_path!,
      sync.staging!.conflicting_paths ?? [],
      "cycle-renamed.txt",
      "operator recovered\n",
    );
    sync = await resolveSyncConflict({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resolve-before-staged-crash",
    });
    expect(sync.status).toBe("validating");
    sync = markSyncRecoveryRequired({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-record-staged-crash",
      reason: "validator process exited",
    });

    sync = await recoverSync({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resume-staged",
      choice: "resume",
      recoveryReason: "operator resumed interrupted validation",
    });

    expect(sync.status).toBe("validating");
    expect(sync.staging?.workspace_path).toBeTruthy();
    expect(eventsForSubject(fixture.store.db, "sync_workflow", sync.sync_id).at(-1)).toMatchObject({
      eventType: "sync.recovered",
      payload: expect.objectContaining({
        resume_stage: "validating",
        staging_preserved: true,
        staging_discarded: false,
      }),
    });
  }, 30_000);

  test("stale-candidate revalidation with a real conflict routes through conflict_needs_operator", async () => {
    const fixture = conflictFixture("sync-revalidate-conflict", false);
    const validated = await validateFixtureWithoutPrSeries(fixture, "command-revalidate-conflict");
    expect(validated.status).toBe("validated");

    // Upstream moves again with a rename that conflicts with the staged
    // operator resolution of the earlier rename/rename conflict.
    write(fixture.seed, "ambiguous.c", "const char *color = \"upstream-again\";\n");
    git(fixture.seed, "mv", "upstream-renamed.txt", "upstream-again.txt");
    const movedAgain = commitAll(fixture.seed, "upstream conflicting movement");
    git(fixture.seed, "push", "origin", "HEAD:master");
    const stale = await refreshSyncUpstreamObservation({
      context: fixture.context,
      syncId: validated.sync_id,
      expectedRevision: validated.revision,
      commandId: "command-observe-conflicting-move",
    });
    expect(stale.sync.status).toBe("blocked");

    const blocked = await recoverSync({
      context: fixture.context,
      syncId: stale.sync.sync_id,
      expectedRevision: stale.sync.revision,
      commandId: "command-revalidate-conflicting",
      choice: "resume",
      recoveryReason: "operator extended the stale candidate",
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.blockers[0]?.code).toBe("conflict_needs_operator");
    expect(blocked.intake.upstream_to).toBe(movedAgain);
    expect(blocked.staging?.conflicting_paths).toContain("upstream-again.txt");
    expect(blocked.staging?.merge_in_progress).toBe(true);

    // The existing conflict flow completes the extension onto the new tip.
    resolveRenameConflict(
      blocked.staging!.workspace_path!,
      blocked.staging!.conflicting_paths ?? [],
      "upstream-again.txt",
      "operator extended\n",
    );
    const resumed = await resolveSyncConflict({
      context: fixture.context,
      syncId: blocked.sync_id,
      expectedRevision: blocked.revision,
      commandId: "command-resolve-extension-conflict",
    });
    expect(resumed.status).toBe("validating");
    expect(git(resumed.staging!.workspace_path!, "merge-base", "--is-ancestor", movedAgain, "HEAD")).toBe("");
  }, 30_000);

  test("resolveSyncConflict drops staged workspaces for series merged upstream and keeps blocking on open ones", async () => {
    const fixture = conflictFixture("sync-prune-merged-series", true);
    let sync = await reconcileSync({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-reconcile-prune",
    });
    expect(sync.status).toBe("blocked");
    resolveRenameConflict(
      sync.staging!.workspace_path!,
      sync.staging!.conflicting_paths ?? [],
      "cycle-renamed.txt",
      "operator merged\n",
    );
    sync = await resolveSyncConflict({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resolve-cycle-prune",
    });
    expect(sync.status).toBe("blocked");
    expect(sync.staging?.conflicting_paths).toEqual(expect.arrayContaining([
      "codex/split-01-series:series-cycle-renamed.txt",
    ]));
    const droppedWorkspace = sync.staging?.pr_workspaces?.find((workspace) => workspace.series_id === "series-01");
    expect(droppedWorkspace?.workspace_path).toBeTruthy();

    const blockedInspection = await inspectSyncStaging({ context: fixture.context, syncId: sync.sync_id });
    expect(blockedInspection.prWorktrees.some((workspace) => workspace.mergeInProgress)).toBe(true);

    // The PR merged upstream while the sync was blocked; its staged merge is
    // now moot and must be dropped without demanding marker resolution.
    const recordsPath = resolve(fixture.stateDir, "pr_handoff/pr_records.json");
    const records = JSON.parse(readFileSync(recordsPath, "utf8")) as {
      records: Array<{ branch: string; status: string }>;
    };
    const mergedRecord = records.records.find((record) => record.branch === "codex/split-01-series");
    if (!mergedRecord) throw new Error("Expected fixture PR record");
    mergedRecord.status = "merged";
    writeFileSync(recordsPath, JSON.stringify(records, null, 2), "utf8");

    sync = await resolveSyncConflict({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resolve-after-merge",
    });

    expect(sync.status).toBe("validating");
    expect(sync.staging?.conflicting_paths).toEqual([]);
    expect(sync.staging?.conflicts_awaiting_operator).toBe(0);
    expect(sync.staging?.pr_workspaces?.map((workspace) => workspace.series_id)).toEqual(["series-02"]);
    expect(sync.pr_reconciliation.map((entry) => entry.series_id)).toEqual(["series-02"]);
    expect(existsSync(droppedWorkspace!.workspace_path)).toBe(false);
  }, 30_000);

  test("sync.recover can discard from the last durable stage", async () => {
    const fixture = conflictFixture("sync-recover-discard", false);
    let sync = await reconcileSync({
      context: fixture.context,
      syncId: fixture.sync.sync_id,
      expectedRevision: fixture.sync.revision,
      commandId: "command-reconcile-before-recovery",
    });
    resolveRenameConflict(
      sync.staging!.workspace_path!,
      sync.staging!.conflicting_paths ?? [],
      "cycle-renamed.txt",
      "operator recovered\n",
    );
    sync = await resolveSyncConflict({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resolve-before-crash",
    });
    expect(sync.status).toBe("validating");
    sync = markSyncRecoveryRequired({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-record-crash",
      reason: "validator process exited",
    });

    sync = await recoverSync({
      context: fixture.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-discard-recovery",
      choice: "discard",
      recoveryReason: "operator discarded interrupted validation",
    });

    expect(sync.status).toBe("cancelled");
    expect(getHarnessState(fixture.store, "melee")?.active_workflow).toBeNull();
    expect(existsSync(syncStagingPaths(fixture.stateDir, sync.sync_id).root)).toBe(false);
    expect(eventsForSubject(fixture.store.db, "sync_workflow", sync.sync_id).at(-1)).toMatchObject({
      eventType: "sync.cancelled",
      payload: expect.objectContaining({
        from_status: "blocked",
        to_status: "cancelled",
        untouched_cycle_head: git(fixture.cycle, "rev-parse", "HEAD"),
      }),
    });
  }, 30_000);
});
