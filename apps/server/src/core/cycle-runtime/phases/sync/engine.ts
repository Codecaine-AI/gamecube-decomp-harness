import { constants, copyFileSync, cpSync, existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import {
  cancelDispatchRequest,
  getHarnessState,
  releaseDispatch,
  requireLease,
} from "@server/core/harness-state/lease.js";
import type { JsonObject } from "@server/core/harness-state/events.js";
import type { EventActor } from "@server/core/harness-state/events.js";
import type { Blocker } from "@server/core/harness-state/types.js";
import { readPrRecordsArtifact } from "@server/core/cycle-runtime/phases/pr/pr-records.js";
import { fetchUpstreamAndFindMergedPrs, parseBaseRef } from "@server/core/cycle-runtime/phases/preparing/subphases/git-intake.js";
import { linkGameAssets } from "@server/core/cycle-runtime/phases/preparing/subphases/worktrees.js";
import { readRegressionReport } from "@server/core/validation/objdiff/report.js";
import { forceReportRun } from "@server/core/validation/report/index.js";
import { fetchUpstreamMasterReport } from "@server/core/cycle-runtime/phases/running/epochs/breakage-gate.js";
import type { SyncMergePolicy } from "@server/core/game-registry/runtime-options.js";
import type { PolicyMergeReports } from "@server/core/cycle-runtime/phases/running/epochs/policy-merge.js";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import {
  continueSyncMergeAfterOperator,
  captureRecursiveWorktreeState,
  createDetachedSyncWorktree,
  defaultSyncGitRunner,
  discardSyncStaging,
  abortAndRemoveSyncWorktree,
  inspectSyncWorktree,
  initializeSyncWorktreeSubmodules,
  mergeSyncWorktree,
  recursiveSubmodulePointers,
  recursiveWorktreeStatesEqual,
  syncPrStagingWorktreePath,
  syncStagingPaths,
  type SyncGitRunner,
  type RecursiveWorktreeState,
  type SyncMergeResult,
} from "./git.js";
import {
  getSyncBlockedOriginStatus,
  getSyncState,
  StaleSyncRevisionError,
  transitionSync,
} from "./state.js";
import type {
  SyncPrReconciliation,
  SyncStagingProgress,
  SyncState,
  SyncStatus,
} from "./types.js";

interface SyncGameContext {
  baseRef?: string;
  reportPath?: string;
}

type LooseJsonObject = Record<string, unknown>;

export interface SyncEngineContext {
  store: StateStore;
  stateDir: string;
  repoRoot: string;
  cycleWorktreePath: string;
  game?: SyncGameContext | null;
  leaseId: string;
  runGit?: SyncGitRunner;
  mergePolicy?: SyncMergePolicy;
  policyInputs?: PolicyMergeReports;
  forceReportRun?: typeof forceReportRun;
  now?: () => string;
  /** One actor owns every event emitted by the current action. */
  actor?: EventActor;
}

async function mergeStagedWorktree(input: {
  context: SyncEngineContext;
  sync: SyncState;
  worktreePath: string;
  newBase: string;
}): Promise<SyncMergeResult> {
  const mergePolicy = input.sync.staging?.merge_policy ?? input.context.mergePolicy ?? "score";
  const result = await mergeSyncWorktree({
    worktreePath: input.worktreePath,
    newBase: input.newBase,
    mergePolicy,
    policyInputs: mergePolicy === "score"
      ? await loadSyncPolicyInputs(input.context, input.newBase)
      : undefined,
    runGit: runner(input.context),
    revalidateLease: leaseGuard(input.context, input.sync),
  });
  for (const entry of result.policyMergeFiles) {
    uiLog("stdout", `sync ${input.sync.sync_id} policy merge ${entry.message}`);
  }
  return result;
}

export interface SyncValidationResult {
  result: "passed" | "failed";
  whatRan: JsonObject[];
  details?: JsonObject;
}

export interface ValidateSyncInput {
  syncId: string;
  expectedRevision: number;
  commandId: string;
  validate?: (
    worktreePath: string,
    context: SyncEngineContext,
    staging: SyncStagingProgress,
  ) => Promise<SyncValidationResult>;
}

interface OpenPrSeries {
  branch: string;
  seriesId: string;
  baseSha: string;
  prNumber: number | null;
}

const OPEN_PR_STATUSES = new Set([
  "planned",
  "planned_mock",
  "branch_pushed",
  "draft",
  "open",
  "changes_requested",
  "blocked",
]);

function asObject(value: unknown): LooseJsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as LooseJsonObject : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function runner(context: SyncEngineContext): SyncGitRunner {
  return context.runGit ?? defaultSyncGitRunner;
}

function now(context: SyncEngineContext): string {
  return context.now?.() ?? new Date().toISOString();
}

function reportVersion(reportPath: string): string {
  const parts = reportPath.replaceAll("\\", "/").split("/").filter(Boolean);
  const reportIndex = parts.lastIndexOf("report.json");
  return reportIndex > 0 ? parts[reportIndex - 1]! : parts[1] || "GALE01";
}

async function loadSyncPolicyInputs(
  context: SyncEngineContext,
  upstreamRevision: string,
): Promise<PolicyMergeReports> {
  if (context.policyInputs) return context.policyInputs;
  const configuredPath = context.game?.reportPath ?? "build/GALE01/report.json";
  const oursPath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(context.cycleWorktreePath, configuredPath);
  let ours: unknown;
  try {
    ours = JSON.parse(readFileSync(oursPath, "utf8"));
  } catch (error) {
    return {
      ours: {},
      upstream: {},
      scoreMode: "upstream-diff-fallback",
      upstreamReportFallbackReason: `cycle report unavailable at ${oursPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const fetched = await fetchUpstreamMasterReport({
    repoRoot: context.repoRoot,
    stateDir: context.stateDir,
    anchorSha: upstreamRevision,
    version: reportVersion(configuredPath),
  });
  if ("reason" in fetched) {
    return {
      ours,
      upstream: {},
      scoreMode: "upstream-diff-fallback",
      upstreamReportFallbackReason: fetched.reason,
    };
  }
  try {
    return {
      ours,
      upstream: JSON.parse(readFileSync(fetched.path, "utf8")),
      scoreMode: "reports",
      upstreamReportFallbackReason: null,
    };
  } catch (error) {
    return {
      ours,
      upstream: {},
      scoreMode: "upstream-diff-fallback",
      upstreamReportFallbackReason: `upstream report unavailable at ${fetched.path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function currentSync(context: SyncEngineContext, syncId: string, expectedRevision?: number): SyncState {
  const sync = getSyncState(context.store, syncId);
  if (!sync) throw new Error(`Sync not found: ${syncId}`);
  if (expectedRevision !== undefined && sync.revision !== expectedRevision) {
    throw new StaleSyncRevisionError(syncId, expectedRevision, sync.revision);
  }
  return sync;
}

function revalidateSyncLease(context: SyncEngineContext, sync: SyncState) {
  const lease = requireLease(context.store, context.leaseId, sync.game_id);
  if (lease.kind !== "sync" || lease.workflow_id !== sync.sync_id) {
    throw new Error(
      `Dispatch lease ${lease.lease_id} belongs to ${lease.kind}:${lease.workflow_id}, not sync:${sync.sync_id}`,
    );
  }
  if (lease.status === "acquiring" || lease.status === "releasing") {
    throw new Error(`Sync lease ${lease.lease_id} cannot mutate staging while ${lease.status}`);
  }
  return lease;
}

function leaseGuard(context: SyncEngineContext, sync: SyncState): () => ReturnType<typeof revalidateSyncLease> {
  return () => revalidateSyncLease(context, sync);
}

function cycleHead(context: SyncEngineContext, sync: SyncState): string {
  const row = context.store.db
    .query("SELECT head_revision FROM cycles WHERE cycle_uuid = ?")
    .get(sync.cycle_uuid) as { head_revision: string | null } | null;
  if (!row?.head_revision?.trim()) throw new Error(`Game cycle ${sync.cycle_uuid} has no canonical head`);
  return row.head_revision;
}

async function gitText(
  context: SyncEngineContext,
  cwd: string,
  args: string[],
  failureHint: string,
): Promise<string> {
  const result = await runner(context)(cwd, args, { failureHint });
  if (result.exitCode !== 0) {
    throw new Error(`${failureHint}: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

async function gitSucceeds(context: SyncEngineContext, cwd: string, args: string[]): Promise<boolean> {
  return (await runner(context)(cwd, args, { check: false })).exitCode === 0;
}

async function cycleSnapshot(context: SyncEngineContext): Promise<RecursiveWorktreeState> {
  return captureRecursiveWorktreeState({ worktreePath: context.cycleWorktreePath, runGit: runner(context) });
}

function assertCycleUnchanged(before: RecursiveWorktreeState, after: RecursiveWorktreeState): void {
  if (!recursiveWorktreeStatesEqual(before, after)) {
    throw new Error("Cycle worktree changed while operating on sync staging");
  }
}

function settleCancelledSyncAuthority(
  context: SyncEngineContext,
  sync: SyncState,
  commandId: string,
): void {
  const lease = getHarnessState(context.store, sync.game_id)?.active_workflow;
  if (lease?.kind === "sync" && lease.workflow_id === sync.sync_id) {
    releaseDispatch(context.store, {
      actor: "operator",
      commandId,
      correlationId: sync.sync_id,
      leaseId: lease.lease_id,
      gameId: sync.game_id,
      now: now(context),
    });
    return;
  }
  cancelDispatchRequest(context.store, {
    actor: "operator",
    commandId,
    correlationId: sync.sync_id,
    kind: "sync",
    gameId: sync.game_id,
    reason: "operator cancelled sync before publication",
    workflowId: sync.sync_id,
    now: now(context),
  });
}

function conflictBlocker(sync: SyncState, conflicts: string[]): Blocker {
  return {
    code: "conflict_needs_operator",
    message: `Resolve staged sync conflicts: ${conflicts.join(", ")}`,
    source_kind: "sync",
    source_id: sync.sync_id,
    recoverable: true,
  };
}

function recoveryBlocker(sync: SyncState, reason: string): Blocker {
  return {
    code: "recovery_required",
    message: reason,
    source_kind: "sync",
    source_id: sync.sync_id,
    recoverable: true,
  };
}

function validationBlocker(sync: SyncState, reason: string): Blocker {
  return {
    code: "validation_failed",
    message: reason,
    source_kind: "sync",
    source_id: sync.sync_id,
    recoverable: true,
  };
}

function staleUpstreamBlocker(sync: SyncState, observed: string): Blocker {
  return {
    code: "upstream_moved_after_validation",
    message: `Validated ${sync.intake.upstream_to}, but upstream is now ${observed}`,
    source_kind: "sync",
    source_id: sync.sync_id,
    recoverable: true,
  };
}

function ensureStatus(sync: SyncState, allowed: SyncStatus[], operation: string): void {
  if (!allowed.includes(sync.status)) {
    throw new Error(`${operation} requires sync status ${allowed.join(" or ")}; ${sync.sync_id} is ${sync.status}`);
  }
}

async function ensureCycleStaging(
  context: SyncEngineContext,
  sync: SyncState,
  commandId: string,
): Promise<SyncState> {
  const head = cycleHead(context, sync);
  const snapshot = await cycleSnapshot(context);
  if (snapshot.root_head !== head) {
    throw new Error(`Cycle worktree HEAD ${snapshot.root_head} does not match canonical head ${head}`);
  }
  if (sync.staging) {
    if (sync.staging.cycle_head_sha && sync.staging.cycle_head_sha !== head) {
      throw new Error(`Cycle head moved after sync staging was created (${sync.staging.cycle_head_sha} -> ${head})`);
    }
    const workspacePath = sync.staging.workspace_path;
    if (workspacePath && existsSync(workspacePath)) {
      const linked = linkGameAssets(context.repoRoot, workspacePath);
      uiLog("stdout", `sync ${sync.sync_id}: linked ${linked} game asset files into staging worktree`);
    }
    return sync;
  }
  const paths = syncStagingPaths(context.stateDir, sync.sync_id);
  const existing = await inspectSyncWorktree({ worktreePath: paths.cycleWorktree, runGit: runner(context) });
  if (existing.exists) {
    if (existing.head !== head || existing.status.trim() || existing.mergeInProgress) {
      throw new Error(`Unrecorded sync staging workspace is not a pristine snapshot of ${head}`);
    }
    const linked = linkGameAssets(context.repoRoot, paths.cycleWorktree);
    uiLog("stdout", `sync ${sync.sync_id}: linked ${linked} game asset files into staging worktree`);
  } else {
    await createDetachedSyncWorktree({
      repoRoot: context.repoRoot,
      worktreePath: paths.cycleWorktree,
      head,
      runGit: runner(context),
      revalidateLease: leaseGuard(context, sync),
    });
    const linked = linkGameAssets(context.repoRoot, paths.cycleWorktree);
    uiLog("stdout", `sync ${sync.sync_id}: linked ${linked} game asset files into staging worktree`);
  }
  const staging: SyncStagingProgress = {
    workspace_id: sync.sync_id,
    workspace_path: paths.cycleWorktree,
    cycle_head_sha: head,
    staging_head_sha: head,
    commits_behind: 0,
    minor_conflicts_resolved: 0,
    conflicts_awaiting_operator: 0,
    last_durable_stage: "workspace_created",
    merge_in_progress: false,
    merge_policy: context.mergePolicy ?? "score",
    conflicting_paths: [],
    pr_workspaces: [],
  };
  return transitionSync(context.store, sync.sync_id, {
    actor: context.actor ?? "runner",
    commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "reconciling", staging },
    payload: { workspace_id: staging.workspace_id, cycle_head_sha: head },
  });
}

async function discoverUpstream(context: SyncEngineContext, sync: SyncState) {
  const guard = leaseGuard(context, sync);
  return fetchUpstreamAndFindMergedPrs(
    {
      runGit: runner(context),
    },
    { game: context.game ?? null, repoRoot: context.repoRoot },
    guard,
    { upstreamFrom: sync.intake.upstream_from },
  );
}

function openPrSeriesFromRecords(payload: LooseJsonObject): OpenPrSeries[] {
  const byBranch = new Map<string, OpenPrSeries>();
  for (const raw of asArray(payload.records)) {
    const record = asObject(raw);
    const branch = stringValue(record.branch);
    const status = stringValue(record.status, stringValue(asObject(record.github).status, "planned"));
    if (!branch || !OPEN_PR_STATUSES.has(status)) continue;
    byBranch.set(branch, {
      branch,
      seriesId: stringValue(record.sliceId, branch),
      baseSha: stringValue(record.baseSha),
      prNumber: numberValue(record.prNumber ?? asObject(record.github).prNumber),
    });
  }
  return [...byBranch.values()].sort((left, right) => left.branch.localeCompare(right.branch));
}

async function sourceHeadForSeries(
  context: SyncEngineContext,
  sync: SyncState,
  series: OpenPrSeries,
): Promise<string> {
  const local = await runner(context)(context.repoRoot, ["rev-parse", "--verify", series.branch], { check: false });
  if (local.exitCode === 0 && local.stdout.trim()) return local.stdout.trim();
  if (series.prNumber === null) throw new Error(`Open PR series branch is unavailable locally: ${series.branch}`);
  const { remote } = parseBaseRef(context.game?.baseRef ?? "origin/master");
  revalidateSyncLease(context, sync);
  const fetch = await runner(context)(
    context.repoRoot,
    ["fetch", remote, `refs/pull/${series.prNumber}/head`],
    { check: false },
  );
  if (fetch.exitCode !== 0) {
    throw new Error(`Unable to fetch PR #${series.prNumber} for ${series.branch}: ${fetch.stderr || fetch.stdout}`);
  }
  return gitText(context, context.repoRoot, ["rev-parse", "--verify", "FETCH_HEAD"], `Unable to resolve PR #${series.prNumber}`);
}

async function reconcilePrSeries(
  context: SyncEngineContext,
  sync: SyncState,
): Promise<{ staging: SyncStagingProgress; results: SyncPrReconciliation[]; conflicts: string[] }> {
  const staging = sync.staging!;
  const records = openPrSeriesFromRecords(readPrRecordsArtifact(context.stateDir));
  const results: SyncPrReconciliation[] = [];
  const prWorkspaces: NonNullable<SyncStagingProgress["pr_workspaces"]> = [];
  const conflicts: string[] = [];
  let minorConflictsResolved = 0;
  for (const series of records) {
    // A planned slice with no local branch and no PR has nothing durable to
    // migrate — the plan record predates any pushed work. Skip it rather than
    // failing the whole sync; the next PR phase re-derives plans anyway.
    if (series.prNumber === null) {
      const planned = await runner(context)(context.repoRoot, ["rev-parse", "--verify", series.branch], { check: false });
      if (planned.exitCode !== 0 || !planned.stdout.trim()) {
        uiLog("stderr", `sync reconcile: skipping planned PR series with no branch or PR: ${series.branch}`);
        continue;
      }
    }
    const sourceHead = await sourceHeadForSeries(context, sync, series);
    const worktreePath = syncPrStagingWorktreePath(context.stateDir, sync.sync_id, series.branch);
    const existing = await inspectSyncWorktree({ worktreePath, runGit: runner(context) });
    let merged: SyncMergeResult;
    if (!existing.exists) {
      await createDetachedSyncWorktree({
        repoRoot: context.repoRoot,
        worktreePath,
        head: sourceHead,
        runGit: runner(context),
        revalidateLease: leaseGuard(context, sync),
      });
      merged = await mergeStagedWorktree({
        context,
        sync,
        worktreePath,
        newBase: sync.intake.upstream_to,
      });
    } else if (existing.mergeInProgress && existing.head) {
      merged = {
        status: "needs_operator",
        head: existing.head,
        minorConflictsResolved: 0,
        autoResolvedPaths: [],
        conflictingPaths: existing.conflictingPaths,
        policyMergeFiles: [],
      };
    } else if (
      existing.head &&
      !existing.status.trim() &&
      await gitSucceeds(context, worktreePath, ["merge-base", "--is-ancestor", sync.intake.upstream_to, "HEAD"])
    ) {
      merged = {
        status: "clean",
        head: existing.head,
        minorConflictsResolved: 0,
        autoResolvedPaths: [],
        conflictingPaths: [],
        policyMergeFiles: [],
      };
    } else if (existing.head === sourceHead && !existing.status.trim()) {
      merged = await mergeStagedWorktree({
        context,
        sync,
        worktreePath,
        newBase: sync.intake.upstream_to,
      });
    } else {
      throw new Error(`Existing PR staging workspace cannot be recovered safely for ${series.branch}`);
    }
    minorConflictsResolved += merged.minorConflictsResolved;
    results.push({ series_id: series.seriesId, branch: series.branch, result: merged.status, pushed: false });
    const identities = merged.conflictingPaths.map((path) => `${series.branch}:${path}`);
    conflicts.push(...identities);
    prWorkspaces.push({
      series_id: series.seriesId,
      branch: series.branch,
      workspace_path: worktreePath,
      source_head: sourceHead,
      staging_head: merged.head,
      auto_resolved_paths: merged.autoResolvedPaths,
      conflicting_paths: merged.conflictingPaths,
    });
  }
  return {
    results,
    conflicts,
    staging: {
      ...staging,
      minor_conflicts_resolved: staging.minor_conflicts_resolved + minorConflictsResolved,
      last_durable_stage: conflicts.length > 0 ? staging.last_durable_stage : "pr_series_reconciled",
      conflicts_awaiting_operator: conflicts.length,
      conflicting_paths: conflicts,
      pr_workspaces: prWorkspaces,
    },
  };
}

function blockForConflicts(
  context: SyncEngineContext,
  sync: SyncState,
  staging: SyncStagingProgress,
  conflicts: string[],
  commandId: string,
  prReconciliation = sync.pr_reconciliation,
): SyncState {
  return transitionSync(context.store, sync.sync_id, {
    actor: context.actor ?? "runner",
    commandId,
    correlationId: sync.sync_id,
    eventType: "sync.reconciliation_blocked",
    expectedRevision: sync.revision,
    patch: {
      status: "blocked",
      blockers: [conflictBlocker(sync, conflicts)],
      staging: { ...staging, conflicts_awaiting_operator: conflicts.length, conflicting_paths: conflicts },
      prReconciliation,
    },
    payload: { conflict_identities: conflicts, conflicts_awaiting_operator: conflicts.length },
  });
}

function resolvedConflictPaths(staging: SyncStagingProgress): string[] {
  const paths = new Set(staging.auto_resolved_paths ?? []);
  for (const workspace of staging.pr_workspaces ?? []) {
    for (const path of workspace.auto_resolved_paths ?? []) paths.add(`${workspace.branch}:${path}`);
  }
  return [...paths].sort();
}

export async function createSyncStagingWorkspace(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): Promise<SyncState> {
  const sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["ingesting", "reconciling"], "createSyncStagingWorkspace");
  revalidateSyncLease(input.context, sync);
  return ensureCycleStaging(input.context, sync, input.commandId);
}

export async function inspectSyncStaging(input: {
  context: Pick<SyncEngineContext, "stateDir" | "runGit"> & Partial<Pick<SyncEngineContext, "store">>;
  syncId: string;
}): Promise<{
  cycle: Awaited<ReturnType<typeof inspectSyncWorktree>>;
  prWorktrees: Awaited<ReturnType<typeof inspectSyncWorktree>>[];
}> {
  const paths = syncStagingPaths(input.context.stateDir, input.syncId);
  const git = input.context.runGit ?? defaultSyncGitRunner;
  const cycle = await inspectSyncWorktree({ worktreePath: paths.cycleWorktree, runGit: git });
  const sync = input.context.store ? getSyncState(input.context.store, input.syncId) : null;
  const prWorktrees = await Promise.all(
    (sync?.staging?.pr_workspaces ?? []).map((workspace) =>
      inspectSyncWorktree({ worktreePath: workspace.workspace_path, runGit: git }),
    ),
  );
  return { cycle, prWorktrees };
}

/** Advances a source-unchanged sync to its confirm-gated publication rest point. */
export function validateKnowledgeOnlySync(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): SyncState {
  let sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["ingesting"], "validateKnowledgeOnlySync");
  if (!sync.intake.knowledge_only) {
    throw new Error(`Sync ${sync.sync_id} changes source and must reconcile before validation`);
  }
  revalidateSyncLease(input.context, sync);
  sync = transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validating", staging: null },
  });
  const evidence: JsonObject = {
    result: "passed",
    knowledge_only: true,
    source_unchanged: true,
    validated_at: now(input.context),
  };
  return transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validated", blockers: [], staging: null },
    payload: { validation_evidence: evidence },
  });
}

export async function reconcileSync(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): Promise<SyncState> {
  let sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["ingesting", "reconciling"], "reconcileSync");
  revalidateSyncLease(input.context, sync);
  sync = await ensureCycleStaging(input.context, sync, input.commandId);
  const stagingPath = sync.staging?.workspace_path ?? syncStagingPaths(input.context.stateDir, sync.sync_id).cycleWorktree;

  const discovery = await discoverUpstream(input.context, sync);
  if (!await gitSucceeds(input.context, input.context.repoRoot, ["cat-file", "-e", `${sync.intake.upstream_to}^{commit}`])) {
    throw new Error(`Sync intake upstream target is unavailable after fetch: ${sync.intake.upstream_to}`);
  }
  const commitsBehindText = await gitText(
    input.context,
    input.context.repoRoot,
    ["rev-list", "--count", `${sync.intake.upstream_from}..${sync.intake.upstream_to}`],
    "Unable to count upstream commits for sync",
  );
  const countedCommits = Number.parseInt(commitsBehindText, 10);
  let staging: SyncStagingProgress = {
    ...sync.staging!,
    commits_behind: Number.isFinite(countedCommits) ? countedCommits : 0,
    observed_upstream: discovery.afterRef,
  };
  sync = transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { staging },
    payload: {
      upstream_from: sync.intake.upstream_from,
      upstream_to: sync.intake.upstream_to,
      observed_upstream: discovery.afterRef,
      merged_pr_ids: discovery.mergedPrs.map(String),
    },
  });

  if (staging.last_durable_stage === "workspace_created") {
    let cycleMerge: SyncMergeResult;
    const inspection = await inspectSyncWorktree({ worktreePath: stagingPath, runGit: runner(input.context) });
    const alreadyMerged = !inspection.mergeInProgress && inspection.head !== null &&
      await gitSucceeds(input.context, stagingPath, ["merge-base", "--is-ancestor", sync.intake.upstream_to, "HEAD"]);
    if (alreadyMerged) {
      cycleMerge = {
        status: "clean",
        head: inspection.head!,
        minorConflictsResolved: 0,
        autoResolvedPaths: [],
        conflictingPaths: [],
        policyMergeFiles: [],
      };
    } else {
      cycleMerge = await mergeStagedWorktree({
        context: input.context,
        sync,
        worktreePath: stagingPath,
        newBase: sync.intake.upstream_to,
      });
    }
    staging = {
      ...staging,
      staging_head_sha: cycleMerge.head,
      minor_conflicts_resolved: staging.minor_conflicts_resolved + cycleMerge.minorConflictsResolved,
      auto_resolved_paths: [...new Set([...(staging.auto_resolved_paths ?? []), ...cycleMerge.autoResolvedPaths])],
      conflicts_awaiting_operator: cycleMerge.conflictingPaths.length,
      conflicting_paths: cycleMerge.conflictingPaths,
      merge_in_progress: cycleMerge.status === "needs_operator",
      last_durable_stage: cycleMerge.status === "needs_operator" ? "workspace_created" : "cycle_merged",
    };
    if (cycleMerge.status === "needs_operator") {
      return blockForConflicts(
        input.context,
        sync,
        staging,
        cycleMerge.conflictingPaths,
        input.commandId,
      );
    }
    sync = transitionSync(input.context.store, sync.sync_id, {
      actor: input.context.actor ?? "runner",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: { staging },
      payload: {
        staging_head_sha: cycleMerge.head,
        commits_behind: staging.commits_behind,
        minor_conflicts_resolved: staging.minor_conflicts_resolved,
      },
    });
  }

  if (staging.last_durable_stage === "cycle_merged") {
    const reconciled = await reconcilePrSeries(input.context, sync);
    staging = reconciled.staging;
    sync = transitionSync(input.context.store, sync.sync_id, {
      actor: input.context.actor ?? "runner",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: { staging, prReconciliation: reconciled.results },
      payload: { series_count: reconciled.results.length, conflicts: reconciled.conflicts },
    });
    if (reconciled.conflicts.length > 0) {
      return blockForConflicts(
        input.context,
        sync,
        staging,
        reconciled.conflicts,
        input.commandId,
        reconciled.results,
      );
    }
  }

  return transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validating", staging: { ...staging, conflicts_awaiting_operator: 0, conflicting_paths: [] } },
  });
}

function operatorConflictPaths(staging: SyncStagingProgress): Array<{
  identityPrefix: string;
  paths: string[];
  worktreePath: string;
}> {
  const groups: Array<{ identityPrefix: string; paths: string[]; worktreePath: string }> = [];
  if (staging.merge_in_progress && staging.workspace_path && staging.conflicting_paths?.length) {
    groups.push({
      identityPrefix: "",
      paths: staging.conflicting_paths.filter((path) => !path.includes(":")),
      worktreePath: staging.workspace_path,
    });
  }
  for (const workspace of staging.pr_workspaces ?? []) {
    if (!workspace.conflicting_paths?.length) continue;
    groups.push({
      identityPrefix: `${workspace.branch}:`,
      paths: workspace.conflicting_paths,
      worktreePath: workspace.workspace_path,
    });
  }
  return groups;
}

/** Drops staged PR workspaces whose series is no longer open.
 *
 * A sync can stay blocked on staged PR-series conflicts long enough for the
 * PRs themselves to merge (or close) upstream. Those staged merges are then
 * moot — their content already landed — so requiring the operator to
 * hand-resolve their markers is wrong. Re-read the PR records and, for every
 * staged workspace whose branch is no longer an open series, abort the
 * in-progress merge, remove the staging worktree, and drop the workspace
 * plus its conflict identities from staging. Still-open series keep their
 * workspaces and conflicts untouched. */
async function pruneMootPrWorkspaces(
  context: SyncEngineContext,
  sync: SyncState,
): Promise<{ staging: SyncStagingProgress; droppedBranches: Set<string> }> {
  const staging = sync.staging!;
  const droppedBranches = new Set<string>();
  const workspaces = staging.pr_workspaces ?? [];
  if (workspaces.length === 0) return { staging, droppedBranches };
  const openBranches = new Set(
    openPrSeriesFromRecords(readPrRecordsArtifact(context.stateDir)).map((series) => series.branch),
  );
  const keptWorkspaces: NonNullable<SyncStagingProgress["pr_workspaces"]> = [];
  for (const workspace of workspaces) {
    if (openBranches.has(workspace.branch)) {
      keptWorkspaces.push(workspace);
      continue;
    }
    droppedBranches.add(workspace.branch);
    uiLog(
      "stderr",
      `sync ${sync.sync_id}: dropping staged PR workspace ${workspace.branch}: series merged/closed upstream`,
    );
    await abortAndRemoveSyncWorktree({
      repoRoot: context.repoRoot,
      worktreePath: workspace.workspace_path,
      runGit: runner(context),
    });
  }
  if (droppedBranches.size === 0) return { staging, droppedBranches };
  const conflictingPaths = (staging.conflicting_paths ?? []).filter((identity) => {
    const separator = identity.indexOf(":");
    return separator < 0 || !droppedBranches.has(identity.slice(0, separator));
  });
  return {
    staging: {
      ...staging,
      pr_workspaces: keptWorkspaces,
      conflicting_paths: conflictingPaths,
      conflicts_awaiting_operator: conflictingPaths.length,
    },
    droppedBranches,
  };
}

async function assertOperatorResolutionsHaveNoMarkers(
  context: SyncEngineContext,
  staging: SyncStagingProgress,
): Promise<void> {
  for (const group of operatorConflictPaths(staging)) {
    const inspection = await inspectSyncWorktree({ worktreePath: group.worktreePath, runGit: runner(context) });
    if (!inspection.mergeInProgress) throw new Error(`Expected an in-progress merge at ${group.worktreePath}`);
    for (const path of group.paths) {
      const check = await runner(context)(group.worktreePath, ["grep", "-n", "-e", "^<<<<<<< ", "-e", "^=======$", "-e", "^>>>>>>> ", "--", path], { check: false });
      if (check.exitCode === 0) throw new Error(`Conflict markers remain in ${group.identityPrefix}${path}`);
      if (check.exitCode !== 1 && existsSync(group.worktreePath)) {
        throw new Error(`Unable to verify conflict markers in ${group.identityPrefix}${path}: ${check.stderr || check.stdout}`);
      }
    }
  }
}

export async function resolveSyncConflict(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): Promise<SyncState> {
  let sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["blocked"], "resolveSyncConflict");
  if (!sync.blockers.some((blocker) => blocker.code === "conflict_needs_operator")) {
    throw new Error(`Sync ${sync.sync_id} is not blocked on a reconciliation conflict`);
  }
  if (!sync.staging) throw new Error(`Blocked sync ${sync.sync_id} has no staging workspace`);
  revalidateSyncLease(input.context, sync);
  // Series that merged/closed upstream while the sync was blocked make their
  // staged conflicts moot; drop them before demanding marker resolution.
  const pruned = await pruneMootPrWorkspaces(input.context, sync);
  const conflictIdentities = [...(pruned.staging.conflicting_paths ?? [])];
  await assertOperatorResolutionsHaveNoMarkers(input.context, pruned.staging);
  sync = transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "operator",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "reconciling", blockers: [], staging: pruned.staging },
    payload: {
      resolution: "operator_staging_edits_verified",
      ...(pruned.droppedBranches.size > 0
        ? { dropped_pr_workspaces: [...pruned.droppedBranches].sort() }
        : {}),
    },
  });

  let staging = sync.staging!;
  const remainingIdentities: string[] = [];
  if (staging.merge_in_progress && staging.workspace_path) {
    const paths = staging.conflicting_paths?.filter((path) => !path.includes(":")) ?? [];
    const result = await continueSyncMergeAfterOperator({
      worktreePath: staging.workspace_path,
      expectedConflictPaths: paths,
      runGit: runner(input.context),
      revalidateLease: leaseGuard(input.context, sync),
    });
    staging = {
      ...staging,
      staging_head_sha: result.head,
      minor_conflicts_resolved: staging.minor_conflicts_resolved + result.minorConflictsResolved,
      auto_resolved_paths: [...new Set([...(staging.auto_resolved_paths ?? []), ...result.autoResolvedPaths])],
      merge_in_progress: result.status === "needs_operator",
      last_durable_stage: result.status === "needs_operator" ? "workspace_created" : "cycle_merged",
      conflicting_paths: result.conflictingPaths,
    };
    remainingIdentities.push(...result.conflictingPaths);
  }

  const prResults = sync.pr_reconciliation.filter((entry) => !pruned.droppedBranches.has(entry.branch));
  const nextPrWorkspaces: NonNullable<SyncStagingProgress["pr_workspaces"]> = [];
  for (const workspace of staging.pr_workspaces ?? []) {
    if (!workspace.conflicting_paths?.length) {
      nextPrWorkspaces.push(workspace);
      continue;
    }
    const result = await continueSyncMergeAfterOperator({
      worktreePath: workspace.workspace_path,
      expectedConflictPaths: workspace.conflicting_paths,
      runGit: runner(input.context),
      revalidateLease: leaseGuard(input.context, sync),
    });
    const identities = result.conflictingPaths.map((path) => `${workspace.branch}:${path}`);
    remainingIdentities.push(...identities);
    nextPrWorkspaces.push({
      ...workspace,
      staging_head: result.head,
      auto_resolved_paths: [...new Set([...(workspace.auto_resolved_paths ?? []), ...result.autoResolvedPaths])],
      conflicting_paths: result.conflictingPaths,
    });
    staging = {
      ...staging,
      minor_conflicts_resolved: staging.minor_conflicts_resolved + result.minorConflictsResolved,
    };
    const index = prResults.findIndex((entry) => entry.branch === workspace.branch);
    if (index >= 0 && result.status === "needs_operator") {
      prResults[index] = { ...prResults[index]!, result: "needs_operator", pushed: false };
    }
  }
  staging = {
    ...staging,
    pr_workspaces: nextPrWorkspaces,
    conflicts_awaiting_operator: remainingIdentities.length,
    conflicting_paths: remainingIdentities,
    last_durable_stage: remainingIdentities.length > 0
      ? staging.last_durable_stage
      : nextPrWorkspaces.length > 0 ? "pr_series_reconciled" : staging.last_durable_stage,
  };
  sync = transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: {
      staging,
      prReconciliation: prResults,
      resolvedConflictPaths: [...new Set([
        ...sync.resolved_conflict_paths,
        ...resolvedConflictPaths(staging),
        ...conflictIdentities.filter((identity) => !remainingIdentities.includes(identity)),
      ])].sort(),
    },
    payload: { remaining_conflicts: remainingIdentities },
  });
  if (remainingIdentities.length > 0) {
    return blockForConflicts(
      input.context,
      sync,
      staging,
      remainingIdentities,
      input.commandId,
      prResults,
    );
  }

  if (staging.last_durable_stage === "cycle_merged" && nextPrWorkspaces.length === 0) {
    const reconciled = await reconcilePrSeries(input.context, sync);
    staging = reconciled.staging;
    sync = transitionSync(input.context.store, sync.sync_id, {
      actor: input.context.actor ?? "runner",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: { staging, prReconciliation: reconciled.results },
      payload: { series_count: reconciled.results.length, conflicts: reconciled.conflicts },
    });
    if (reconciled.conflicts.length > 0) {
      return blockForConflicts(input.context, sync, staging, reconciled.conflicts, input.commandId, reconciled.results);
    }
  }
  return transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validating", staging: { ...staging, conflicts_awaiting_operator: 0, conflicting_paths: [] } },
  });
}

export function syncValidationPolicy(
  staging: Pick<SyncStagingProgress, "cycle_head_sha">,
  upstreamFrom: string,
): {
  adoptUpstream: boolean;
  resetBaseline: boolean;
} {
  const adoptUpstream = staging.cycle_head_sha === upstreamFrom;
  return { adoptUpstream, resetBaseline: adoptUpstream };
}

async function defaultValidation(
  worktreePath: string,
  context: SyncEngineContext,
  staging: SyncStagingProgress,
  upstreamFrom: string,
): Promise<SyncValidationResult> {
  const cycleWorktree = context.cycleWorktreePath;
  const cycleBuild = resolve(cycleWorktree, "build");
  const cycleBuildNinja = resolve(cycleWorktree, "build.ninja");
  const cycleBaseline = resolve(cycleBuild, "GALE01/baseline.json");
  if (!existsSync(cycleBuildNinja)) {
    throw new Error(
      `Incremental sync validation requires the existing cycle build (${cycleBuildNinja}); refusing a full rebuild`,
    );
  }
  const runReport = context.forceReportRun ?? forceReportRun;
  if (!existsSync(cycleBaseline)) {
    await runReport(cycleWorktree, { resetBaseline: true, generateChanges: false });
    uiLog("stdout", `sync validation: seeded cycle baseline at ${cycleBaseline}`);
  }
  const stagingBuild = resolve(worktreePath, "build");
  if (!existsSync(resolve(stagingBuild, "GALE01/baseline.json"))) {
    cpSync(cycleBuild, stagingBuild, { recursive: true, mode: constants.COPYFILE_FICLONE });
  }
  for (const name of ["build.ninja", ".ninja_deps", ".ninja_log"]) {
    const source = resolve(cycleWorktree, name);
    const target = resolve(worktreePath, name);
    if (existsSync(source) && !existsSync(target)) copyFileSync(source, target, constants.COPYFILE_FICLONE);
  }
  const { adoptUpstream, resetBaseline } = syncValidationPolicy(staging, upstreamFrom);
  const report = await runReport(worktreePath, { resetBaseline });
  if (adoptUpstream) {
    return {
      result: "passed",
      whatRan: report.steps.map((step) => ({ name: step.name, command: step.command, exit_code: step.exitCode })),
      details: {
        baseline_path: report.baselinePath,
        report_changes_path: report.reportChangesPath,
        reused_report: report.reusedReport ?? false,
        incremental_cache_seeded_from: cycleWorktree,
        upstream_adopted: true,
        commits_behind: staging.commits_behind,
        ...(report.summary ? { report_summary: report.summary as unknown as JsonObject } : {}),
      },
    };
  }
  const regression = await readRegressionReport(report.reportChangesPath, "Sync staging validation", 0);
  const regressions = regression.regressions.length + regression.brokenMatches.length + regression.fuzzyRegressions.length;
  return {
    result: regressions === 0 ? "passed" : "failed",
    whatRan: report.steps.map((step) => ({ name: step.name, command: step.command, exit_code: step.exitCode })),
    details: {
      baseline_path: report.baselinePath,
      report_changes_path: report.reportChangesPath,
      regressions: regression.regressions.length,
      broken_matches: regression.brokenMatches.length,
      fuzzy_regressions: regression.fuzzyRegressions.length,
      reused_report: report.reusedReport ?? false,
      incremental_cache_seeded_from: cycleWorktree,
    },
  };
}

export async function validateSync(context: SyncEngineContext, input: ValidateSyncInput): Promise<SyncState> {
  let sync = currentSync(context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["validating"], "validateSync");
  if (!sync.staging?.workspace_path) throw new Error(`Sync ${sync.sync_id} has no staging worktree to validate`);
  revalidateSyncLease(context, sync);
  const inspection = await inspectSyncWorktree({ worktreePath: sync.staging.workspace_path, runGit: runner(context) });
  if (!inspection.exists || !inspection.head) throw new Error(`Sync staging worktree is missing: ${sync.staging.workspace_path}`);
  if (inspection.mergeInProgress || inspection.conflictingPaths.length > 0 || inspection.status.trim()) {
    throw new Error(`Sync staging worktree is not ready for validation: ${sync.staging.workspace_path}`);
  }
  await initializeSyncWorktreeSubmodules({
    worktreePath: sync.staging.workspace_path,
    runGit: runner(context),
  });
  revalidateSyncLease(context, sync);
  const recursiveInspection = await captureRecursiveWorktreeState({
    worktreePath: sync.staging.workspace_path,
    runGit: runner(context),
  });
  if (recursiveInspection.recursive_status || recursiveInspection.repositories.some((repository) =>
    repository.local_status || repository.head !== repository.expected_head)) {
    throw new Error(`Sync staging worktree has dirty or mismatched recursive submodules: ${sync.staging.workspace_path}`);
  }
  for (const workspace of sync.staging.pr_workspaces ?? []) {
    const prInspection = await inspectSyncWorktree({ worktreePath: workspace.workspace_path, runGit: runner(context) });
    if (
      !prInspection.exists ||
      prInspection.mergeInProgress ||
      prInspection.conflictingPaths.length > 0 ||
      prInspection.status.trim()
    ) {
      throw new Error(`PR series staging worktree is not ready for validation: ${workspace.branch}`);
    }
  }

  const linked = linkGameAssets(context.repoRoot, sync.staging.workspace_path);
  uiLog("stdout", `sync ${sync.sync_id}: linked ${linked} game asset files into staging worktree`);

  let result: SyncValidationResult;
  try {
    result = input.validate
      ? await input.validate(sync.staging.workspace_path, context, sync.staging)
      : await defaultValidation(sync.staging.workspace_path, context, sync.staging, sync.intake.upstream_from);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    transitionSync(context.store, sync.sync_id, {
      actor: context.actor ?? "runner",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: { status: "blocked", blockers: [validationBlocker(sync, message)] },
      payload: { validation_error: message },
    });
    throw new Error(`Sync validation failed: ${message}`, { cause: error });
  }
  const evidence: JsonObject = {
    what_ran: result.whatRan,
    result: result.result,
    staging_head_sha: inspection.head,
    validated_at: now(context),
    ...(result.details ?? {}),
  };
  const staging: SyncStagingProgress = {
    ...sync.staging,
    staging_head_sha: inspection.head,
    validated_upstream: sync.intake.upstream_to,
    validation_evidence: evidence,
    last_durable_stage: result.result === "passed" ? "validated" : sync.staging.last_durable_stage,
  };
  if (result.result === "failed") {
    return transitionSync(context.store, sync.sync_id, {
      actor: context.actor ?? "runner",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: {
        status: "blocked",
        blockers: [validationBlocker(sync, "Staged baseline/gate validation reported regressions")],
        staging,
      },
      payload: { validation_evidence: evidence },
    });
  }
  sync = transitionSync(context.store, sync.sync_id, {
    actor: context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validated", blockers: [], staging },
    payload: { validation_evidence: evidence },
  });
  return sync;
}

export async function refreshSyncUpstreamObservation(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): Promise<{ stale: boolean; sync: SyncState; observedUpstream: string }> {
  let sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["validated"], "refreshSyncUpstreamObservation");
  revalidateSyncLease(input.context, sync);
  const discovery = await discoverUpstream(input.context, sync);
  if (discovery.afterRef === sync.intake.upstream_to) {
    return { stale: false, sync, observedUpstream: discovery.afterRef };
  }
  sync = transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: {
      status: "blocked",
      blockers: [staleUpstreamBlocker(sync, discovery.afterRef)],
      staging: sync.staging ? { ...sync.staging, observed_upstream: discovery.afterRef } : null,
    },
    payload: { expected_upstream: sync.intake.upstream_to, observed_upstream: discovery.afterRef },
  });
  return { stale: true, sync, observedUpstream: discovery.afterRef };
}

/** Reclaims only a crash-left ingest whose owner is proven dead and stale. */
export async function cancelSync(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): Promise<SyncState> {
  const sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["requested", "ingesting", "reconciling", "validating", "validated", "blocked"], "cancelSync");
  if (sync.status !== "requested" || sync.staging) revalidateSyncLease(input.context, sync);
  const before = await cycleSnapshot(input.context);
  const canonicalHead = cycleHead(input.context, sync);
  if (before.root_head !== canonicalHead) {
    throw new Error(`Cycle worktree HEAD ${before.root_head} does not match canonical head ${canonicalHead}`);
  }
  if (sync.staging || existsSync(syncStagingPaths(input.context.stateDir, sync.sync_id).root)) {
    await discardSyncStaging({
      repoRoot: input.context.repoRoot,
      stateDir: input.context.stateDir,
      syncId: sync.sync_id,
      runGit: runner(input.context),
      revalidateLease: leaseGuard(input.context, sync),
    });
  }
  assertCycleUnchanged(before, await cycleSnapshot(input.context));
  return immediateTransaction(input.context.store.db, () => {
    const cancelled = transitionSync(input.context.store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      eventType: "sync.cancelled",
      expectedRevision: sync.revision,
      patch: { status: "cancelled", blockers: [], staging: null },
      payload: {
        discarded_staging_workspace_id: sync.staging?.workspace_id ?? null,
        untouched_cycle_head: canonicalHead,
        untouched_submodule_heads: recursiveSubmodulePointers(before),
      },
    });
    settleCancelledSyncAuthority(input.context, cancelled, input.commandId);
    return cancelled;
  });
}

export function markSyncRecoveryRequired(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
  reason: string;
}): SyncState {
  const sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["ingesting", "reconciling", "validating", "validated"], "markSyncRecoveryRequired");
  revalidateSyncLease(input.context, sync);
  return transitionSync(input.context.store, sync.sync_id, {
    actor: input.context.actor ?? "runner",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "blocked", blockers: [recoveryBlocker(sync, input.reason)] },
    payload: { recovery_reason: input.reason, last_durable_stage: sync.staging?.last_durable_stage ?? null },
  });
}

export async function recoverSync(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
  choice: "resume" | "discard";
  recoveryReason: string;
}): Promise<SyncState> {
  const sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["blocked"], "recoverSync");
  revalidateSyncLease(input.context, sync);
  if (input.choice === "discard") {
    const before = await cycleSnapshot(input.context);
    if (sync.staging || existsSync(syncStagingPaths(input.context.stateDir, sync.sync_id).root)) {
      await discardSyncStaging({
        repoRoot: input.context.repoRoot,
        stateDir: input.context.stateDir,
        syncId: sync.sync_id,
        runGit: runner(input.context),
        revalidateLease: leaseGuard(input.context, sync),
      });
    }
    assertCycleUnchanged(before, await cycleSnapshot(input.context));
    return immediateTransaction(input.context.store.db, () => {
      const cancelled = transitionSync(input.context.store, sync.sync_id, {
        actor: "operator",
        commandId: input.commandId,
        correlationId: sync.sync_id,
        eventType: "sync.recovered",
        expectedRevision: sync.revision,
        patch: { status: "cancelled", blockers: [], staging: null },
        payload: {
          staging_preserved: false,
          staging_discarded: true,
          resume_stage: null,
          recovery_reason: input.recoveryReason,
          recovery_path: "discard",
          untouched_submodule_heads: recursiveSubmodulePointers(before),
        },
      });
      settleCancelledSyncAuthority(input.context, cancelled, input.commandId);
      return cancelled;
    });
  }

  if (sync.blockers.some((blocker) => blocker.code === "upstream_moved_after_validation")) {
    if (!sync.staging?.workspace_path) {
      throw new Error(`Sync ${sync.sync_id} validated candidate is stale; cancel it and request a new sync`);
    }
    return extendStaleValidatedCandidate(input, sync);
  }

  if (sync.blockers.some((blocker) => blocker.code === "conflict_needs_operator")) {
    throw new Error(`Sync ${sync.sync_id} must use resolveSyncConflict for staged reconciliation conflicts`);
  }
  const origin = getSyncBlockedOriginStatus(input.context.store.db, sync);
  if (!origin) throw new Error(`Sync ${sync.sync_id} has no durable blocked origin`);
  // After the boundary commits, the cycle/timeline and push rows are the
  // authoritative retry inputs. The staging worktree may already be gone.
  if (origin === "publishing" && sync.publication) {
    return transitionSync(input.context.store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      eventType: "sync.recovered",
      expectedRevision: sync.revision,
      patch: { status: "publishing", blockers: [] },
      payload: {
        staging_preserved: true,
        staging_discarded: false,
        resume_stage: "publishing",
        recovery_reason: input.recoveryReason,
        recovery_path: "resume",
      },
    });
  }
  if (sync.intake.knowledge_only) {
    if (origin === "publishing") {
      return transitionSync(input.context.store, sync.sync_id, {
        actor: "operator",
        commandId: input.commandId,
        correlationId: sync.sync_id,
        eventType: "sync.recovered",
        expectedRevision: sync.revision,
        patch: { status: "publishing", blockers: [], staging: null },
        payload: {
          staging_preserved: true,
          staging_discarded: false,
          resume_stage: "publishing",
          recovery_reason: input.recoveryReason,
          recovery_path: "resume",
        },
      });
    }
    throw new Error(`Sync ${sync.sync_id} has no retryable publication stage to resume`);
  }
  // Blocked before anything durable was staged. The live shape: the cycle
  // worktree check in ensureCycleStaging threw while entering reconciliation,
  // before the ingesting -> reconciling transition, so the origin is
  // "ingesting" with staging null even though ingest fully succeeded.
  // Reconciliation had produced nothing durable, so the stage is safe to
  // restart from scratch: an ingesting origin resumes through the ingest
  // driver (succeeded jobs are skipped), and a reconciling/validating origin
  // resumes at "reconciling" where ensureCycleStaging re-derives staging from
  // the ingest artifacts and the cycle worktree. With durable staging present
  // the staged-workspace path below handles recovery instead.
  if (
    (origin === "ingesting" || origin === "reconciling" || origin === "validating") &&
    !sync.staging?.workspace_path &&
    // The staging root also holds durable knowledge artifacts; only the git
    // workspace (root/cycle) marks reconciliation as having staged anything.
    !existsSync(syncStagingPaths(input.context.stateDir, sync.sync_id).cycleWorktree)
  ) {
    const bareResumeStage: SyncStatus = origin === "ingesting" ? "ingesting" : "reconciling";
    return transitionSync(input.context.store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      eventType: "sync.recovered",
      expectedRevision: sync.revision,
      patch: { status: bareResumeStage, blockers: [] },
      payload: {
        staging_preserved: true,
        staging_discarded: false,
        resume_stage: bareResumeStage,
        recovery_reason: input.recoveryReason,
        recovery_path: "resume",
      },
    });
  }
  if (!sync.staging?.workspace_path) throw new Error(`Sync ${sync.sync_id} has no durable staging workspace to resume`);
  const inspection = await inspectSyncWorktree({ worktreePath: sync.staging.workspace_path, runGit: runner(input.context) });
  if (!inspection.exists) throw new Error(`Sync staging workspace is missing: ${sync.staging.workspace_path}`);
  const resumeStage: SyncStatus = origin === "validated" ? "validating" : origin;
  return transitionSync(input.context.store, sync.sync_id, {
    actor: "operator",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    eventType: "sync.recovered",
    expectedRevision: sync.revision,
    patch: { status: resumeStage, blockers: [] },
    payload: {
      staging_preserved: true,
      staging_discarded: false,
      resume_stage: resumeStage,
      recovery_reason: input.recoveryReason,
      recovery_path: "resume",
      last_durable_stage: sync.staging.last_durable_stage ?? null,
    },
  });
}

/** Extends a stale validated candidate onto the newly observed upstream tip.
 *
 * A busy upstream can move faster than validation completes; discarding the
 * whole sync (its ingest included) each time makes the sync unpublishable
 * forever. Instead: re-observe upstream, merge into the staging workspace and
 * surviving open-PR workspaces from the previously validated upstream onto
 * the new tip, record the new tip in the durable intake, and return to
 * "validating" so the incremental validation re-runs and re-records
 * validated_upstream. Real conflicts route through the existing
 * conflict_needs_operator flow. The updated intake target lets
 * resolveSyncConflict complete merges onto the new tip. If upstream moves
 * again during revalidation the same loop applies. The publish-time
 * staleness check stays the last line of defense. */
async function extendStaleValidatedCandidate(
  input: { context: SyncEngineContext; commandId: string; recoveryReason: string },
  sync: SyncState,
): Promise<SyncState> {
  const context = input.context;
  const staging = sync.staging!;
  const oldBase = staging.validated_upstream ?? sync.intake.upstream_to;
  const discovery = await discoverUpstream(context, sync);
  const newBase = discovery.afterRef;
  const recoveredPayload = {
    staging_preserved: true,
    staging_discarded: false,
    recovery_reason: input.recoveryReason,
    recovery_path: "resume",
    revalidate_from_upstream: oldBase,
    revalidate_to_upstream: newBase,
  };
  // A preserved sync.recovered transition may not replace staging, so the
  // recovery flips only status/blockers and a follow-up staging_progressed
  // transition records the new upstream target and cleared validation state.
  const clearedValidation = {
    observed_upstream: newBase,
    validated_upstream: undefined,
    validation_evidence: undefined,
  };

  if (newBase === oldBase) {
    // Upstream returned to the validated tip; nothing to merge. Re-run
    // validation directly against the unchanged staging heads.
    sync = transitionSync(context.store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      eventType: "sync.recovered",
      expectedRevision: sync.revision,
      patch: { status: "validating", blockers: [] },
      payload: { ...recoveredPayload, resume_stage: "validating" },
    });
    return transitionSync(context.store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: {
        staging: {
          ...sync.staging!,
          ...clearedValidation,
          last_durable_stage: (sync.staging!.pr_workspaces?.length ?? 0) > 0 ? "pr_series_reconciled" : "cycle_merged",
        },
      },
      payload: { revalidate_from_upstream: oldBase, revalidate_to_upstream: newBase },
    });
  }

  sync = transitionSync(context.store, sync.sync_id, {
    actor: "operator",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    eventType: "sync.recovered",
    expectedRevision: sync.revision,
    patch: { status: "reconciling", blockers: [] },
    payload: { ...recoveredPayload, resume_stage: "reconciling" },
  });
  sync = transitionSync(context.store, sync.sync_id, {
    actor: "operator",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: {
      intake: { ...sync.intake, upstream_to: newBase },
      staging: {
        ...sync.staging!,
        ...clearedValidation,
        last_durable_stage: "workspace_created",
      },
    },
    payload: { revalidate_from_upstream: oldBase, revalidate_to_upstream: newBase },
  });

  let extended = sync.staging!;
  const conflicts: string[] = [];
  const commitsBehindText = await gitText(
    context,
    context.repoRoot,
    ["rev-list", "--count", `${sync.intake.upstream_from}..${newBase}`],
    "Unable to count upstream commits for stale sync extension",
  );
  const commitsBehind = Number.parseInt(commitsBehindText, 10);
  const cycleMerge = await mergeStagedWorktree({
    context,
    sync,
    worktreePath: extended.workspace_path!,
    newBase,
  });
  extended = {
    ...extended,
    commits_behind: Number.isFinite(commitsBehind) ? commitsBehind : extended.commits_behind,
    staging_head_sha: cycleMerge.head,
    minor_conflicts_resolved: extended.minor_conflicts_resolved + cycleMerge.minorConflictsResolved,
    auto_resolved_paths: [...new Set([...(extended.auto_resolved_paths ?? []), ...cycleMerge.autoResolvedPaths])],
    merge_in_progress: cycleMerge.status === "needs_operator",
    last_durable_stage: cycleMerge.status === "needs_operator" ? "workspace_created" : "cycle_merged",
  };
  conflicts.push(...cycleMerge.conflictingPaths);

  const prResults = [...sync.pr_reconciliation];
  const extendedPrWorkspaces: NonNullable<SyncStagingProgress["pr_workspaces"]> = [];
  for (const workspace of extended.pr_workspaces ?? []) {
    const merged = await mergeStagedWorktree({
      context,
      sync,
      worktreePath: workspace.workspace_path,
      newBase,
    });
    extendedPrWorkspaces.push({
      ...workspace,
      staging_head: merged.head,
      auto_resolved_paths: [...new Set([...(workspace.auto_resolved_paths ?? []), ...merged.autoResolvedPaths])],
      conflicting_paths: merged.conflictingPaths,
    });
    extended = {
      ...extended,
      minor_conflicts_resolved: extended.minor_conflicts_resolved + merged.minorConflictsResolved,
    };
    conflicts.push(...merged.conflictingPaths.map((path) => `${workspace.branch}:${path}`));
    const index = prResults.findIndex((entry) => entry.branch === workspace.branch);
    if (index >= 0 && merged.status === "needs_operator") {
      prResults[index] = { ...prResults[index]!, result: "needs_operator", pushed: false };
    }
  }
  extended = { ...extended, pr_workspaces: extendedPrWorkspaces };

  if (conflicts.length > 0) {
    return blockForConflicts(context, sync, extended, conflicts, input.commandId, prResults);
  }
  extended = {
    ...extended,
    conflicts_awaiting_operator: 0,
    conflicting_paths: [],
    last_durable_stage: extendedPrWorkspaces.length > 0 ? "pr_series_reconciled" : "cycle_merged",
  };
  return transitionSync(context.store, sync.sync_id, {
    actor: context.actor ?? "operator",
    commandId: input.commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "validating", staging: extended, prReconciliation: prResults },
    payload: { revalidate_from_upstream: oldBase, revalidate_to_upstream: newBase },
  });
}
