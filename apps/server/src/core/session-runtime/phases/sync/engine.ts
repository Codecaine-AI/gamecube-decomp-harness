import { constants, copyFileSync, cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import {
  cancelDispatchRequest,
  getProjectState,
  releaseDispatch,
  requireLease,
} from "@server/core/project-state/lease.js";
import type { JsonObject } from "@server/core/project-state/events.js";
import type { Blocker } from "@server/core/project-state/types.js";
import { readPrRecordsArtifact } from "@server/core/session-runtime/phases/pr/pr-records.js";
import { fetchUpstreamAndFindMergedPrs, parseBaseRef } from "@server/core/session-runtime/phases/preparing/subphases/git-intake.js";
import { readRegressionReport } from "@server/core/validation/objdiff/report.js";
import { forceReportRun } from "@server/core/validation/report/index.js";
import {
  continueSyncRebaseAfterOperator,
  captureRecursiveWorktreeState,
  createDetachedSyncWorktree,
  defaultSyncGitRunner,
  discardSyncStaging,
  inspectSyncWorktree,
  initializeSyncWorktreeSubmodules,
  rebaseSyncWorktree,
  recursiveSubmodulePointers,
  recursiveWorktreeStatesEqual,
  syncPrStagingWorktreePath,
  syncStagingPaths,
  type SyncGitRunner,
  type RecursiveWorktreeState,
  type SyncRebaseResult,
} from "./git.js";
import {
  getSyncBlockedOriginStatus,
  getSyncState,
  StaleSyncRevisionError,
  transitionSync,
} from "./state.js";
import {
  cancelSyncKnowledgeJobs,
  listSyncKnowledgeJobs,
  recoverConfirmedOrphanKnowledgeIngest,
  waitSyncKnowledgeJobsForRecovery,
} from "./knowledge.js";
import type {
  SyncPrReconciliation,
  SyncStagingProgress,
  SyncState,
  SyncStatus,
} from "./types.js";

interface SyncProjectContext {
  baseRef?: string;
}

type LooseJsonObject = Record<string, unknown>;

export interface SyncEngineContext {
  store: StateStore;
  stateDir: string;
  repoRoot: string;
  sessionWorktreePath: string;
  project?: SyncProjectContext | null;
  leaseId: string;
  runGit?: SyncGitRunner;
  appendLog?: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  now?: () => string;
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
  validate?: (worktreePath: string, context: SyncEngineContext) => Promise<SyncValidationResult>;
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

function currentSync(context: SyncEngineContext, syncId: string, expectedRevision?: number): SyncState {
  const sync = getSyncState(context.store, syncId);
  if (!sync) throw new Error(`Sync not found: ${syncId}`);
  if (expectedRevision !== undefined && sync.revision !== expectedRevision) {
    throw new StaleSyncRevisionError(syncId, expectedRevision, sync.revision);
  }
  return sync;
}

function revalidateSyncLease(context: SyncEngineContext, sync: SyncState) {
  const lease = requireLease(context.store, context.leaseId, sync.project_id);
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

function sessionHead(context: SyncEngineContext, sync: SyncState): string {
  const row = context.store.db
    .query("SELECT head_revision FROM project_sessions WHERE session_uuid = ?")
    .get(sync.session_uuid) as { head_revision: string | null } | null;
  if (!row?.head_revision?.trim()) throw new Error(`Project session ${sync.session_uuid} has no canonical head`);
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

async function sessionSnapshot(context: SyncEngineContext): Promise<RecursiveWorktreeState> {
  return captureRecursiveWorktreeState({ worktreePath: context.sessionWorktreePath, runGit: runner(context) });
}

function assertSessionUnchanged(before: RecursiveWorktreeState, after: RecursiveWorktreeState): void {
  if (!recursiveWorktreeStatesEqual(before, after)) {
    throw new Error("Session worktree changed while operating on sync staging");
  }
}

function settleCancelledSyncAuthority(
  context: SyncEngineContext,
  sync: SyncState,
  commandId: string,
): void {
  const lease = getProjectState(context.store, sync.project_id)?.active_workflow;
  if (lease?.kind === "sync" && lease.workflow_id === sync.sync_id) {
    releaseDispatch(context.store, {
      actor: "operator",
      commandId: `${commandId}:lease-released`,
      correlationId: sync.sync_id,
      leaseId: lease.lease_id,
      projectId: sync.project_id,
      now: now(context),
    });
    return;
  }
  cancelDispatchRequest(context.store, {
    actor: "operator",
    commandId: `${commandId}:dispatch-request-cancelled`,
    correlationId: sync.sync_id,
    kind: "sync",
    projectId: sync.project_id,
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

async function ensureSessionStaging(
  context: SyncEngineContext,
  sync: SyncState,
  commandId: string,
): Promise<SyncState> {
  const head = sessionHead(context, sync);
  const snapshot = await sessionSnapshot(context);
  if (snapshot.root_head !== head) {
    throw new Error(`Session worktree HEAD ${snapshot.root_head} does not match canonical head ${head}`);
  }
  if (sync.staging) {
    if (sync.staging.session_head_sha && sync.staging.session_head_sha !== head) {
      throw new Error(`Session head moved after sync staging was created (${sync.staging.session_head_sha} -> ${head})`);
    }
    return sync;
  }
  const paths = syncStagingPaths(context.stateDir, sync.sync_id);
  const existing = await inspectSyncWorktree({ worktreePath: paths.sessionWorktree, runGit: runner(context) });
  if (existing.exists) {
    if (existing.head !== head || existing.status.trim() || existing.rebaseInProgress) {
      throw new Error(`Unrecorded sync staging workspace is not a pristine snapshot of ${head}`);
    }
  } else {
    await createDetachedSyncWorktree({
      repoRoot: context.repoRoot,
      worktreePath: paths.sessionWorktree,
      head,
      runGit: runner(context),
      revalidateLease: leaseGuard(context, sync),
    });
  }
  const staging: SyncStagingProgress = {
    workspace_id: sync.sync_id,
    workspace_path: paths.sessionWorktree,
    session_head_sha: head,
    staging_head_sha: head,
    epochs_total: 0,
    epochs_applied: 0,
    minor_conflicts_resolved: 0,
    conflicts_awaiting_operator: 0,
    last_durable_stage: "workspace_created",
    rebase_in_progress: false,
    conflicting_paths: [],
    pr_workspaces: [],
  };
  return transitionSync(context.store, sync.sync_id, {
    actor: "runner",
    commandId: `${commandId}:workspace-created`,
    expectedRevision: sync.revision,
    patch: { status: "reconciling", staging },
    payload: { workspace_id: staging.workspace_id, session_head_sha: head },
  });
}

async function discoverUpstream(context: SyncEngineContext, sync: SyncState) {
  const guard = leaseGuard(context, sync);
  return fetchUpstreamAndFindMergedPrs(
    {
      appendLog: context.appendLog ?? (() => {}),
      runGit: runner(context),
    },
    { project: context.project ?? null, repoRoot: context.repoRoot },
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
  const { remote } = parseBaseRef(context.project?.baseRef ?? "origin/master");
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

async function oldBaseForSeries(
  context: SyncEngineContext,
  sync: SyncState,
  series: OpenPrSeries,
  sourceHead: string,
): Promise<string> {
  if (series.baseSha && await gitSucceeds(context, context.repoRoot, ["merge-base", "--is-ancestor", series.baseSha, sourceHead])) {
    return series.baseSha;
  }
  return gitText(
    context,
    context.repoRoot,
    ["merge-base", sync.intake.upstream_from, sourceHead],
    `Unable to identify the base of PR series ${series.branch}`,
  );
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
    const sourceHead = await sourceHeadForSeries(context, sync, series);
    const oldBase = await oldBaseForSeries(context, sync, series, sourceHead);
    const worktreePath = syncPrStagingWorktreePath(context.stateDir, sync.sync_id, series.branch);
    const existing = await inspectSyncWorktree({ worktreePath, runGit: runner(context) });
    let rebased: SyncRebaseResult;
    if (!existing.exists) {
      await createDetachedSyncWorktree({
        repoRoot: context.repoRoot,
        worktreePath,
        head: sourceHead,
        runGit: runner(context),
        revalidateLease: leaseGuard(context, sync),
      });
      rebased = await rebaseSyncWorktree({
        worktreePath,
        oldBase,
        newBase: sync.intake.upstream_to,
        runGit: runner(context),
        revalidateLease: leaseGuard(context, sync),
      });
    } else if (existing.rebaseInProgress && existing.head) {
      const totalText = await gitText(
        context,
        context.repoRoot,
        ["rev-list", "--count", `${oldBase}..${sourceHead}`],
        `Unable to recover PR rebase progress for ${series.branch}`,
      );
      const total = Number.parseInt(totalText, 10);
      rebased = {
        status: "needs_operator",
        head: existing.head,
        commitsTotal: Number.isFinite(total) ? total : 0,
        commitsApplied: 0,
        minorConflictsResolved: 0,
        autoResolvedPaths: [],
        conflictingPaths: existing.conflictingPaths,
      };
    } else if (
      existing.head &&
      !existing.status.trim() &&
      await gitSucceeds(context, worktreePath, ["merge-base", "--is-ancestor", sync.intake.upstream_to, "HEAD"])
    ) {
      const totalText = await gitText(
        context,
        context.repoRoot,
        ["rev-list", "--count", `${oldBase}..${sourceHead}`],
        `Unable to recover completed PR rebase for ${series.branch}`,
      );
      const total = Number.parseInt(totalText, 10);
      rebased = {
        status: "clean",
        head: existing.head,
        commitsTotal: Number.isFinite(total) ? total : 0,
        commitsApplied: Number.isFinite(total) ? total : 0,
        minorConflictsResolved: 0,
        autoResolvedPaths: [],
        conflictingPaths: [],
      };
    } else if (existing.head === sourceHead && !existing.status.trim()) {
      rebased = await rebaseSyncWorktree({
        worktreePath,
        oldBase,
        newBase: sync.intake.upstream_to,
        runGit: runner(context),
        revalidateLease: leaseGuard(context, sync),
      });
    } else {
      throw new Error(`Existing PR staging workspace cannot be recovered safely for ${series.branch}`);
    }
    minorConflictsResolved += rebased.minorConflictsResolved;
    results.push({ series_id: series.seriesId, branch: series.branch, result: rebased.status, pushed: false });
    const identities = rebased.conflictingPaths.map((path) => `${series.branch}:${path}`);
    conflicts.push(...identities);
    prWorkspaces.push({
      series_id: series.seriesId,
      branch: series.branch,
      workspace_path: worktreePath,
      source_head: sourceHead,
      staging_head: rebased.head,
      commits_total: rebased.commitsTotal,
      auto_resolved_paths: rebased.autoResolvedPaths,
      conflicting_paths: rebased.conflictingPaths,
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
    actor: "runner",
    commandId,
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

export async function createSyncStagingWorkspace(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): Promise<SyncState> {
  const sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["ingesting", "reconciling"], "createSyncStagingWorkspace");
  revalidateSyncLease(input.context, sync);
  return ensureSessionStaging(input.context, sync, input.commandId);
}

export async function inspectSyncStaging(input: {
  context: Pick<SyncEngineContext, "stateDir" | "runGit"> & Partial<Pick<SyncEngineContext, "store">>;
  syncId: string;
}): Promise<{
  session: Awaited<ReturnType<typeof inspectSyncWorktree>>;
  prWorktrees: Awaited<ReturnType<typeof inspectSyncWorktree>>[];
}> {
  const paths = syncStagingPaths(input.context.stateDir, input.syncId);
  const git = input.context.runGit ?? defaultSyncGitRunner;
  const session = await inspectSyncWorktree({ worktreePath: paths.sessionWorktree, runGit: git });
  const sync = input.context.store ? getSyncState(input.context.store, input.syncId) : null;
  const prWorktrees = await Promise.all(
    (sync?.staging?.pr_workspaces ?? []).map((workspace) =>
      inspectSyncWorktree({ worktreePath: workspace.workspace_path, runGit: git }),
    ),
  );
  return { session, prWorktrees };
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
  sync = await ensureSessionStaging(input.context, sync, input.commandId);
  const stagingPath = sync.staging?.workspace_path ?? syncStagingPaths(input.context.stateDir, sync.sync_id).sessionWorktree;

  const discovery = await discoverUpstream(input.context, sync);
  if (!await gitSucceeds(input.context, input.context.repoRoot, ["cat-file", "-e", `${sync.intake.upstream_to}^{commit}`])) {
    throw new Error(`Sync intake upstream target is unavailable after fetch: ${sync.intake.upstream_to}`);
  }
  const totalText = await gitText(
    input.context,
    stagingPath,
    ["rev-list", "--count", `${sync.intake.upstream_from}..HEAD`],
    "Unable to count session commits for sync",
  );
  const countedCommits = Number.parseInt(totalText, 10);
  const epochsTotal = sync.staging!.epochs_total > 0
    ? sync.staging!.epochs_total
    : Number.isFinite(countedCommits) ? countedCommits : 0;
  let staging: SyncStagingProgress = {
    ...sync.staging!,
    epochs_total: epochsTotal,
    observed_upstream: discovery.afterRef,
  };
  sync = transitionSync(input.context.store, sync.sync_id, {
    actor: "runner",
    commandId: `${input.commandId}:upstream-discovered`,
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
    let sessionRebase: SyncRebaseResult;
    const inspection = await inspectSyncWorktree({ worktreePath: stagingPath, runGit: runner(input.context) });
    const alreadyRebased = !inspection.rebaseInProgress && inspection.head !== null &&
      await gitSucceeds(input.context, stagingPath, ["merge-base", "--is-ancestor", sync.intake.upstream_to, "HEAD"]);
    if (alreadyRebased) {
      sessionRebase = {
        status: "clean",
        head: inspection.head!,
        commitsTotal: staging.epochs_total,
        commitsApplied: staging.epochs_total,
        minorConflictsResolved: 0,
        autoResolvedPaths: [],
        conflictingPaths: [],
      };
    } else {
      sessionRebase = await rebaseSyncWorktree({
        worktreePath: stagingPath,
        oldBase: sync.intake.upstream_from,
        newBase: sync.intake.upstream_to,
        runGit: runner(input.context),
        revalidateLease: leaseGuard(input.context, sync),
      });
    }
    staging = {
      ...staging,
      staging_head_sha: sessionRebase.head,
      epochs_applied: sessionRebase.commitsApplied,
      minor_conflicts_resolved: staging.minor_conflicts_resolved + sessionRebase.minorConflictsResolved,
      auto_resolved_paths: [...new Set([...(staging.auto_resolved_paths ?? []), ...sessionRebase.autoResolvedPaths])],
      conflicts_awaiting_operator: sessionRebase.conflictingPaths.length,
      conflicting_paths: sessionRebase.conflictingPaths,
      rebase_in_progress: sessionRebase.status === "needs_operator",
      last_durable_stage: sessionRebase.status === "needs_operator" ? "workspace_created" : "session_rebased",
    };
    if (sessionRebase.status === "needs_operator") {
      return blockForConflicts(
        input.context,
        sync,
        staging,
        sessionRebase.conflictingPaths,
        `${input.commandId}:session-conflict`,
      );
    }
    sync = transitionSync(input.context.store, sync.sync_id, {
      actor: "runner",
      commandId: `${input.commandId}:session-rebased`,
      expectedRevision: sync.revision,
      patch: { staging },
      payload: {
        staging_head_sha: sessionRebase.head,
        epochs_applied: sessionRebase.commitsApplied,
        minor_conflicts_resolved: staging.minor_conflicts_resolved,
      },
    });
  }

  if (staging.last_durable_stage === "session_rebased") {
    const reconciled = await reconcilePrSeries(input.context, sync);
    staging = reconciled.staging;
    sync = transitionSync(input.context.store, sync.sync_id, {
      actor: "runner",
      commandId: `${input.commandId}:pr-series-reconciled`,
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
        `${input.commandId}:pr-series-conflict`,
        reconciled.results,
      );
    }
  }

  return transitionSync(input.context.store, sync.sync_id, {
    actor: "runner",
    commandId: `${input.commandId}:validation-started`,
    expectedRevision: sync.revision,
    patch: { status: "validating", staging: { ...staging, conflicts_awaiting_operator: 0, conflicting_paths: [] } },
  });
}

function operatorConflictPaths(staging: SyncStagingProgress): Array<{
  identityPrefix: string;
  paths: string[];
  worktreePath: string;
  commitsTotal: number;
}> {
  const groups: Array<{ identityPrefix: string; paths: string[]; worktreePath: string; commitsTotal: number }> = [];
  if (staging.rebase_in_progress && staging.workspace_path && staging.conflicting_paths?.length) {
    groups.push({
      identityPrefix: "",
      paths: staging.conflicting_paths.filter((path) => !path.includes(":")),
      worktreePath: staging.workspace_path,
      commitsTotal: staging.epochs_total,
    });
  }
  for (const workspace of staging.pr_workspaces ?? []) {
    if (!workspace.conflicting_paths?.length) continue;
    groups.push({
      identityPrefix: `${workspace.branch}:`,
      paths: workspace.conflicting_paths,
      worktreePath: workspace.workspace_path,
      commitsTotal: 0,
    });
  }
  return groups;
}

async function assertOperatorResolutionsHaveNoMarkers(
  context: SyncEngineContext,
  staging: SyncStagingProgress,
): Promise<void> {
  for (const group of operatorConflictPaths(staging)) {
    const inspection = await inspectSyncWorktree({ worktreePath: group.worktreePath, runGit: runner(context) });
    if (!inspection.rebaseInProgress) throw new Error(`Expected an in-progress rebase at ${group.worktreePath}`);
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
  await assertOperatorResolutionsHaveNoMarkers(input.context, sync.staging);
  sync = transitionSync(input.context.store, sync.sync_id, {
    actor: "operator",
    commandId: `${input.commandId}:accepted`,
    expectedRevision: sync.revision,
    patch: { status: "reconciling", blockers: [] },
    payload: { resolution: "operator_staging_edits_verified" },
  });

  let staging = sync.staging!;
  const remainingIdentities: string[] = [];
  if (staging.rebase_in_progress && staging.workspace_path) {
    const paths = staging.conflicting_paths?.filter((path) => !path.includes(":")) ?? [];
    const result = await continueSyncRebaseAfterOperator({
      worktreePath: staging.workspace_path,
      expectedConflictPaths: paths,
      newBase: sync.intake.upstream_to,
      commitsTotal: staging.epochs_total,
      runGit: runner(input.context),
      revalidateLease: leaseGuard(input.context, sync),
    });
    staging = {
      ...staging,
      staging_head_sha: result.head,
      epochs_applied: result.commitsApplied,
      minor_conflicts_resolved: staging.minor_conflicts_resolved + result.minorConflictsResolved,
      auto_resolved_paths: [...new Set([...(staging.auto_resolved_paths ?? []), ...result.autoResolvedPaths])],
      rebase_in_progress: result.status === "needs_operator",
      last_durable_stage: result.status === "needs_operator" ? "workspace_created" : "session_rebased",
      conflicting_paths: result.conflictingPaths,
    };
    remainingIdentities.push(...result.conflictingPaths);
  }

  const prResults = [...sync.pr_reconciliation];
  const nextPrWorkspaces: NonNullable<SyncStagingProgress["pr_workspaces"]> = [];
  for (const workspace of staging.pr_workspaces ?? []) {
    if (!workspace.conflicting_paths?.length) {
      nextPrWorkspaces.push(workspace);
      continue;
    }
    const result = await continueSyncRebaseAfterOperator({
      worktreePath: workspace.workspace_path,
      expectedConflictPaths: workspace.conflicting_paths,
      newBase: sync.intake.upstream_to,
      commitsTotal: workspace.commits_total ?? 1,
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
    actor: "runner",
    commandId: `${input.commandId}:continued`,
    expectedRevision: sync.revision,
    patch: { staging, prReconciliation: prResults },
    payload: { remaining_conflicts: remainingIdentities },
  });
  if (remainingIdentities.length > 0) {
    return blockForConflicts(
      input.context,
      sync,
      staging,
      remainingIdentities,
      `${input.commandId}:blocked-again`,
      prResults,
    );
  }

  if (staging.last_durable_stage === "session_rebased" && nextPrWorkspaces.length === 0) {
    const reconciled = await reconcilePrSeries(input.context, sync);
    staging = reconciled.staging;
    sync = transitionSync(input.context.store, sync.sync_id, {
      actor: "runner",
      commandId: `${input.commandId}:pr-series-reconciled`,
      expectedRevision: sync.revision,
      patch: { staging, prReconciliation: reconciled.results },
      payload: { series_count: reconciled.results.length, conflicts: reconciled.conflicts },
    });
    if (reconciled.conflicts.length > 0) {
      return blockForConflicts(input.context, sync, staging, reconciled.conflicts, `${input.commandId}:pr-conflict`, reconciled.results);
    }
  }
  return transitionSync(input.context.store, sync.sync_id, {
    actor: "runner",
    commandId: `${input.commandId}:validation-started`,
    expectedRevision: sync.revision,
    patch: { status: "validating", staging: { ...staging, conflicts_awaiting_operator: 0, conflicting_paths: [] } },
  });
}

async function defaultValidation(
  worktreePath: string,
  context: SyncEngineContext,
): Promise<SyncValidationResult> {
  const sessionWorktree = context.sessionWorktreePath;
  const sessionBuild = resolve(sessionWorktree, "build");
  const sessionBuildNinja = resolve(sessionWorktree, "build.ninja");
  const sessionBaseline = resolve(sessionBuild, "GALE01/baseline.json");
  if (!existsSync(sessionBuildNinja) || !existsSync(sessionBaseline)) {
    throw new Error(
      `Incremental sync validation requires the existing session baseline cache (${sessionBaseline}); refusing a full rebuild`,
    );
  }
  const stagingBuild = resolve(worktreePath, "build");
  if (!existsSync(resolve(stagingBuild, "GALE01/baseline.json"))) {
    cpSync(sessionBuild, stagingBuild, { recursive: true, mode: constants.COPYFILE_FICLONE });
  }
  for (const name of ["build.ninja", ".ninja_deps", ".ninja_log"]) {
    const source = resolve(sessionWorktree, name);
    const target = resolve(worktreePath, name);
    if (existsSync(source) && !existsSync(target)) copyFileSync(source, target, constants.COPYFILE_FICLONE);
  }
  const report = await forceReportRun(worktreePath, { resetBaseline: false });
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
      incremental_cache_seeded_from: sessionWorktree,
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
  if (inspection.rebaseInProgress || inspection.conflictingPaths.length > 0 || inspection.status.trim()) {
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
      prInspection.rebaseInProgress ||
      prInspection.conflictingPaths.length > 0 ||
      prInspection.status.trim()
    ) {
      throw new Error(`PR series staging worktree is not ready for validation: ${workspace.branch}`);
    }
  }

  let result: SyncValidationResult;
  try {
    result = await (input.validate ?? defaultValidation)(sync.staging.workspace_path, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    transitionSync(context.store, sync.sync_id, {
      actor: "runner",
      commandId: `${input.commandId}:failed`,
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
      actor: "runner",
      commandId: `${input.commandId}:failed`,
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
    actor: "runner",
    commandId: `${input.commandId}:validated`,
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
    actor: "runner",
    commandId: input.commandId,
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
export function recoverConfirmedOrphanSyncIngest(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
  recoveryReason: string;
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  now?: Date | number | string;
}): SyncState {
  return recoverConfirmedOrphanKnowledgeIngest(input.context.store, {
    syncId: input.syncId,
    expectedRevision: input.expectedRevision,
    leaseId: input.context.leaseId,
    commandId: input.commandId,
    reason: input.recoveryReason,
    stateDir: input.context.stateDir,
    hasActiveProcess: input.hasActiveProcess,
    now: input.now,
    occurredAt: now(input.context),
  });
}

export async function cancelSync(input: {
  context: SyncEngineContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
}): Promise<SyncState> {
  const sync = currentSync(input.context, input.syncId, input.expectedRevision);
  ensureStatus(sync, ["requested", "ingesting", "reconciling", "validating", "validated", "blocked"], "cancelSync");
  if (sync.status !== "requested" || sync.staging) revalidateSyncLease(input.context, sync);
  const before = await sessionSnapshot(input.context);
  const canonicalHead = sessionHead(input.context, sync);
  if (before.root_head !== canonicalHead) {
    throw new Error(`Session worktree HEAD ${before.root_head} does not match canonical head ${canonicalHead}`);
  }
  cancelSyncKnowledgeJobs(input.context.store, {
    syncId: sync.sync_id,
    commandId: `${input.commandId}:knowledge-jobs`,
    reason: "sync cancelled before publication",
    occurredAt: now(input.context),
  });
  if (sync.staging || existsSync(syncStagingPaths(input.context.stateDir, sync.sync_id).root)) {
    await discardSyncStaging({
      repoRoot: input.context.repoRoot,
      stateDir: input.context.stateDir,
      syncId: sync.sync_id,
      runGit: runner(input.context),
      revalidateLease: leaseGuard(input.context, sync),
    });
  }
  assertSessionUnchanged(before, await sessionSnapshot(input.context));
  return immediateTransaction(input.context.store.db, () => {
    const cancelled = transitionSync(input.context.store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
      eventType: "sync.cancelled",
      expectedRevision: sync.revision,
      patch: { status: "cancelled", blockers: [], staging: null },
      payload: {
        discarded_staging_workspace_id: sync.staging?.workspace_id ?? null,
        untouched_session_head: canonicalHead,
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
    actor: "runner",
    commandId: input.commandId,
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
    const before = await sessionSnapshot(input.context);
    cancelSyncKnowledgeJobs(input.context.store, {
      syncId: sync.sync_id,
      commandId: `${input.commandId}:knowledge-jobs`,
      reason: input.recoveryReason,
      occurredAt: now(input.context),
    });
    if (sync.staging || existsSync(syncStagingPaths(input.context.stateDir, sync.sync_id).root)) {
      await discardSyncStaging({
        repoRoot: input.context.repoRoot,
        stateDir: input.context.stateDir,
        syncId: sync.sync_id,
        runGit: runner(input.context),
        revalidateLease: leaseGuard(input.context, sync),
      });
    }
    assertSessionUnchanged(before, await sessionSnapshot(input.context));
    return immediateTransaction(input.context.store.db, () => {
      const cancelled = transitionSync(input.context.store, sync.sync_id, {
        actor: "operator",
        commandId: input.commandId,
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
    throw new Error(`Sync ${sync.sync_id} validated candidate is stale; cancel it and request a new sync`);
  }

  if (sync.blockers.some((blocker) => blocker.code === "conflict_needs_operator")) {
    throw new Error(`Sync ${sync.sync_id} must use resolveSyncConflict for staged reconciliation conflicts`);
  }
  const origin = getSyncBlockedOriginStatus(input.context.store.db, sync);
  if (!origin) throw new Error(`Sync ${sync.sync_id} has no durable blocked origin`);
  // After the boundary commits, the session/timeline and push rows are the
  // authoritative retry inputs. The staging worktree may already be gone.
  if (origin === "publishing" && sync.publication) {
    return transitionSync(input.context.store, sync.sync_id, {
      actor: "operator",
      commandId: input.commandId,
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
  const knowledgeJobs = listSyncKnowledgeJobs(input.context.store.db, sync.sync_id);
  const knowledgeStageFailed = sync.blockers.some((blocker) => blocker.code === "knowledge_stage_failed");
  if (origin === "ingesting" && (knowledgeStageFailed || knowledgeJobs.some((job) =>
    job.status === "processing" || job.status === "failed"))) {
    if (knowledgeJobs.some((job) => job.status === "cancelled")) {
      throw new Error(`Sync ${sync.sync_id} has cancelled knowledge jobs and cannot resume`);
    }
    return immediateTransaction(input.context.store.db, () => {
      waitSyncKnowledgeJobsForRecovery(input.context.store, {
        syncId: sync.sync_id,
        commandId: `${input.commandId}:knowledge-jobs`,
        reason: input.recoveryReason,
        occurredAt: now(input.context),
        requeueSucceeded: knowledgeStageFailed,
      });
      return transitionSync(input.context.store, sync.sync_id, {
        actor: "operator",
        commandId: input.commandId,
        eventType: "sync.recovered",
        expectedRevision: sync.revision,
        patch: { status: "ingesting", blockers: [] },
        payload: {
          staging_preserved: true,
          staging_discarded: false,
          resume_stage: "ingesting",
          recovery_reason: input.recoveryReason,
          recovery_path: "resume",
        },
      });
    });
  }
  if (sync.intake.knowledge_only) {
    if (knowledgeJobs.some((job) => job.status === "cancelled")) {
      throw new Error(`Sync ${sync.sync_id} has cancelled knowledge jobs and cannot resume`);
    }
    if (origin === "publishing") {
      return transitionSync(input.context.store, sync.sync_id, {
        actor: "operator",
        commandId: input.commandId,
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
    throw new Error(`Sync ${sync.sync_id} has no retryable knowledge job or publication stage to resume`);
  }
  if (!sync.staging?.workspace_path) throw new Error(`Sync ${sync.sync_id} has no durable staging workspace to resume`);
  const inspection = await inspectSyncWorktree({ worktreePath: sync.staging.workspace_path, runGit: runner(input.context) });
  if (!inspection.exists) throw new Error(`Sync staging workspace is missing: ${sync.staging.workspace_path}`);
  const resumeStage: SyncStatus = origin === "validated" ? "validating" : origin;
  return transitionSync(input.context.store, sync.sync_id, {
    actor: "operator",
    commandId: input.commandId,
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
