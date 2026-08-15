import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import { immediateTransaction, now as currentTime } from "@server/core/orchestrator-state";
import { recordRemoteApplicationInTransaction, recordSavePointAnchor } from "@server/core/cycle/timeline.js";
import { appendGameEvent, eventSpan, type EventActor, type JsonObject } from "@server/core/harness-state/events.js";
import { releaseDispatch, requireLease } from "@server/core/harness-state/lease.js";
import { fetchUpstreamAndFindMergedPrs } from "@server/core/cycle-runtime/phases/preparing/subphases/git-intake.js";
import { ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state/save-points.js";
import {
  assertRecursiveWorktreeClean,
  captureRecursiveWorktreeState,
  defaultSyncGitRunner,
  inspectSyncWorktree,
  recursiveWorktreeStatesEqual,
  type RecursiveWorktreeState,
  type SyncGitRunner,
} from "./git.js";
import {
  getSyncState,
  syncActionSpanId,
  transitionSync,
} from "./state.js";
import {
  publishSyncKnowledgeInTransaction,
  readSyncKnowledgeManifest,
  type SyncKnowledgeManifest,
} from "./knowledge.js";
import type {
  SyncPrReconciliation,
  SyncPublication,
  SyncState,
} from "./types.js";
import type { SyncEngineContext } from "./engine.js";

type SqlValue = bigint | boolean | null | number | string | Uint8Array;

interface PushRecordRow {
  push_id: string;
  sync_id: string;
  series_id: string;
  branch: string;
  remote_name: string;
  expected_remote_head: string | null;
  new_head: string;
  revision: number;
  status: "pending" | "pushing" | "pushed" | "failed";
  attempt_count: number;
  last_error: string | null;
  caused_by_event_id: string;
}

interface InvalidationRecord {
  invalidationId: string;
  subjectKind: "target" | "checkpoint" | "pr_snapshot";
  subjectId: string;
  reason: string;
}

interface PlannedPush {
  pushId: string;
  seriesId: string;
  branch: string;
  remoteName: string;
  expectedRemoteHead: string | null;
  newHead: string;
}

export interface BoundaryPlan {
  invalidations: InvalidationRecord[];
  knowledgeManifest: SyncKnowledgeManifest;
  newHead: string;
  priorHead: string;
  pushes: PlannedPush[];
  remoteApplicationId?: string;
  resolvedConflicts: string[];
  validationEvidence: JsonObject;
}

interface PublicationWorktreeStates {
  schema_version: 1;
  prior: RecursiveWorktreeState;
  target: RecursiveWorktreeState;
}

interface PublicationIntentRow {
  sync_id: string;
  game_id: string;
  cycle_uuid: string;
  cycle_worktree_path: string;
  prior_head: string;
  new_head: string;
  worktree_state_json: string;
  boundary_plan_json: string;
  publishing_event_id: string;
  boundary_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncPublicationIntent {
  syncId: string;
  gameId: string;
  cycleUuid: string;
  cycleWorktreePath: string;
  priorHead: string;
  newHead: string;
  worktreeStates: PublicationWorktreeStates;
  boundaryPlan: BoundaryPlan;
  publishingEventId: string;
  boundaryEventId: string | null;
}

export interface SyncPublicationContext extends SyncEngineContext {
  /** Open Melee PR branches live on fork by default; tests/local mirrors may override it. */
  prRemoteName?: string;
}

export interface PublishSyncInput {
  context: SyncPublicationContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
  confirmed: boolean;
  scoreDelta?: number | null;
  actor?: EventActor;
}

export interface ContinueSyncPublicationInput {
  context: SyncPublicationContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
  scoreDelta?: number | null;
  actor?: EventActor;
}

export interface PrepareSyncPublicationInput extends PublishSyncInput {}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${sha256(parts.join("\0")).slice(0, 24)}`;
}

function runner(context: SyncPublicationContext): SyncGitRunner {
  return context.runGit ?? defaultSyncGitRunner;
}

function operationTime(context: SyncPublicationContext): string {
  return context.now?.() ?? currentTime();
}

function requireCurrentSync(context: SyncPublicationContext, syncId: string, expectedRevision?: number): SyncState {
  const sync = getSyncState(context.store, syncId);
  if (!sync) throw new Error(`Sync not found: ${syncId}`);
  if (expectedRevision !== undefined && sync.revision !== expectedRevision) {
    throw new Error(`Stale sync revision ${expectedRevision} for ${syncId}; current revision is ${sync.revision}`);
  }
  return sync;
}

function revalidatePublicationLease(context: SyncPublicationContext, sync: SyncState) {
  const lease = requireLease(context.store, context.leaseId, sync.game_id);
  if (lease.kind !== "sync" || lease.workflow_id !== sync.sync_id) {
    throw new Error(`Dispatch lease ${lease.lease_id} does not belong to sync ${sync.sync_id}`);
  }
  if (lease.status === "acquiring" || lease.status === "releasing") {
    throw new Error(`Sync lease ${lease.lease_id} cannot publish while ${lease.status}`);
  }
  return lease;
}

async function checkedGit(
  context: SyncPublicationContext,
  cwd: string,
  args: string[],
  failureHint: string,
): Promise<string> {
  const result = await runner(context)(cwd, args, { check: false });
  if (result.exitCode !== 0) {
    throw new Error(`${failureHint}: ${(result.stderr || result.stdout || "no output").trim()}`);
  }
  return result.stdout.trim();
}

function publicationBlocker(sync: SyncState, code: string, message: string) {
  return {
    code,
    message,
    source_kind: "sync",
    source_id: sync.sync_id,
    recoverable: true,
  } as const;
}

function blockSync(
  context: SyncPublicationContext,
  sync: SyncState,
  commandId: string,
  code: string,
  message: string,
  actor: EventActor = "runner",
): SyncState {
  return transitionSync(context.store, sync.sync_id, {
    actor,
    commandId,
    correlationId: sync.sync_id,
    expectedRevision: sync.revision,
    patch: { status: "blocked", blockers: [publicationBlocker(sync, code, message)] },
  });
}

function validationEvidence(db: Database, sync: SyncState): JsonObject {
  void db;
  if (!sync.validation_evidence) throw new Error(`Sync ${sync.sync_id} has no durable validation evidence`);
  return sync.validation_evidence;
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function invalidationId(syncId: string, kind: string, subjectId: string): string {
  return stableId("invalidation", syncId, kind, subjectId);
}

async function changedPaths(context: SyncPublicationContext, sync: SyncState, priorHead: string, newHead: string): Promise<string[]> {
  if (sync.intake.knowledge_only) return [];
  const output = await checkedGit(
    context,
    context.cycleWorktreePath,
    ["diff", "--name-status", "-z", "--find-renames", priorHead, newHead],
    "Unable to derive sync invalidations",
  );
  if (!output) return [];
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const paths = new Set<string>();
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const oldPath = fields[index++];
    if (!status || oldPath === undefined) {
      throw new Error("Unable to parse sync invalidations: incomplete git name-status record");
    }
    paths.add(oldPath);
    if (status.startsWith("R") || status.startsWith("C")) {
      const newPath = fields[index++];
      if (newPath === undefined) {
        throw new Error(`Unable to parse sync invalidations: ${status} record is missing its destination path`);
      }
      paths.add(newPath);
    }
  }
  return [...paths].sort();
}

function deriveInvalidations(
  db: Database,
  sync: SyncState,
  paths: string[],
): InvalidationRecord[] {
  if (sync.intake.knowledge_only) return [];
  const records = new Map<string, InvalidationRecord>();
  const add = (subjectKind: InvalidationRecord["subjectKind"], subjectId: string, reason: string): void => {
    const key = `${subjectKind}:${subjectId}`;
    records.set(key, {
      invalidationId: invalidationId(sync.sync_id, subjectKind, subjectId),
      subjectKind,
      subjectId,
      reason,
    });
  };
  if (paths.length > 0) {
    const bindings: SqlValue[] = [sync.cycle_uuid, ...paths];
    const targets = db
      .query(
        `SELECT DISTINCT targets.id
         FROM targets JOIN runs ON runs.id = targets.run_id
         WHERE runs.cycle_uuid = ? AND targets.source_path IN (${placeholders(paths)})`,
      )
      .all(...bindings) as Array<{ id: string }>;
    for (const target of targets) add("target", target.id, "remote application changed the target source path");
    const epochTargets = db
      .query(
        `SELECT DISTINCT epoch_targets.id
         FROM epoch_targets JOIN runs ON runs.id = epoch_targets.run_id
         WHERE runs.cycle_uuid = ? AND epoch_targets.source_path IN (${placeholders(paths)})`,
      )
      .all(...bindings) as Array<{ id: string }>;
    for (const target of epochTargets) add("target", target.id, "remote application changed the active epoch target source path");
    const checkpoints = db
      .query(
        `SELECT DISTINCT checkpoint_items.checkpoint_id AS id
         FROM checkpoint_items JOIN runs ON runs.id = checkpoint_items.run_id
         WHERE runs.cycle_uuid = ? AND checkpoint_items.source_path IN (${placeholders(paths)})`,
      )
      .all(...bindings) as Array<{ id: string }>;
    for (const checkpoint of checkpoints) {
      add("checkpoint", checkpoint.id, "remote application invalidated checkpoint source evidence");
    }
  }
  for (const series of sync.pr_reconciliation) {
    add("pr_snapshot", series.series_id, "sync rebased the open PR series");
  }
  return [...records.values()].sort((left, right) =>
    `${left.subjectKind}:${left.subjectId}`.localeCompare(`${right.subjectKind}:${right.subjectId}`),
  );
}

async function remoteBranchHead(
  context: SyncPublicationContext,
  remoteName: string,
  branch: string,
): Promise<string | null> {
  const ref = `refs/heads/${branch}`;
  const output = await checkedGit(
    context,
    context.cycleWorktreePath,
    ["ls-remote", "--heads", remoteName, ref],
    `Unable to inspect ${remoteName}/${branch}`,
  );
  if (!output) return null;
  const line = output.split(/\r?\n/).find((candidate) => candidate.trim().endsWith(`\t${ref}`));
  return line?.trim().split(/\s+/)[0] ?? null;
}

async function plannedPushes(context: SyncPublicationContext, sync: SyncState): Promise<PlannedPush[]> {
  if (sync.intake.knowledge_only) return [];
  const remoteName = context.prRemoteName ?? "fork";
  const workspaces = new Map((sync.staging?.pr_workspaces ?? []).map((workspace) => [workspace.series_id, workspace]));
  const pushes: PlannedPush[] = [];
  for (const series of sync.pr_reconciliation) {
    const workspace = workspaces.get(series.series_id);
    if (!workspace?.staging_head) throw new Error(`PR series ${series.series_id} has no reconciled staging head`);
    const expectedRemoteHead = await remoteBranchHead(context, remoteName, series.branch);
    if (expectedRemoteHead !== null && expectedRemoteHead !== workspace.source_head) {
      throw new Error(
        `PR series ${series.series_id} moved after reconciliation (${workspace.source_head} -> ${expectedRemoteHead})`,
      );
    }
    pushes.push({
      pushId: stableId("sync-push", sync.sync_id, series.series_id),
      seriesId: series.series_id,
      branch: series.branch,
      remoteName,
      expectedRemoteHead,
      newHead: workspace.staging_head,
    });
  }
  return pushes;
}

async function buildBoundaryPlan(context: SyncPublicationContext, sync: SyncState): Promise<BoundaryPlan> {
  revalidatePublicationLease(context, sync);
  const priorHeadRow = context.store.db
    .query("SELECT head_revision FROM cycles WHERE cycle_uuid = ?")
    .get(sync.cycle_uuid) as { head_revision: string | null } | null;
  const priorHead = requiredText(priorHeadRow?.head_revision ?? "", `head_revision for ${sync.cycle_uuid}`);
  const newHead = sync.intake.knowledge_only
    ? priorHead
    : requiredText(sync.staging?.staging_head_sha ?? "", `staging head for ${sync.sync_id}`);
  if (!sync.intake.knowledge_only) {
    const staging = await inspectSyncWorktree({ worktreePath: sync.staging!.workspace_path!, runGit: runner(context) });
    if (!staging.exists || staging.head !== newHead || staging.rebaseInProgress || staging.status.trim()) {
      throw new Error(`Sync ${sync.sync_id} staging workspace is not the validated clean head ${newHead}`);
    }
  }
  const knowledgeManifest = readSyncKnowledgeManifest(context.stateDir, sync.sync_id);
  const paths = await changedPaths(context, sync, priorHead, newHead);
  return {
    invalidations: deriveInvalidations(context.store.db, sync, paths),
    knowledgeManifest,
    newHead,
    priorHead,
    pushes: await plannedPushes(context, sync),
    ...(sync.intake.knowledge_only ? {} : { remoteApplicationId: stableId("remote-application", sync.sync_id) }),
    resolvedConflicts: [...sync.resolved_conflict_paths].sort(),
    validationEvidence: validationEvidence(context.store.db, sync),
  };
}

function parsePublicationIntent(row: PublicationIntentRow): SyncPublicationIntent {
  const worktreeStates = JSON.parse(row.worktree_state_json) as PublicationWorktreeStates;
  const boundaryPlan = JSON.parse(row.boundary_plan_json) as BoundaryPlan;
  if (worktreeStates.schema_version !== 1 || !worktreeStates.prior || !worktreeStates.target) {
    throw new Error(`Sync ${row.sync_id} has an invalid recursive publication intent`);
  }
  if (boundaryPlan.priorHead !== row.prior_head || boundaryPlan.newHead !== row.new_head) {
    throw new Error(`Sync ${row.sync_id} publication intent heads disagree with its boundary plan`);
  }
  return {
    syncId: row.sync_id,
    gameId: row.game_id,
    cycleUuid: row.cycle_uuid,
    cycleWorktreePath: row.cycle_worktree_path,
    priorHead: row.prior_head,
    newHead: row.new_head,
    worktreeStates,
    boundaryPlan,
    publishingEventId: row.publishing_event_id,
    boundaryEventId: row.boundary_event_id,
  };
}

export function getSyncPublicationIntent(db: Database, syncId: string): SyncPublicationIntent | null {
  const row = db.query("SELECT * FROM sync_publication_intents WHERE sync_id = ?").get(syncId) as
    | PublicationIntentRow
    | null;
  return row ? parsePublicationIntent(row) : null;
}

function assertIntentContext(context: SyncPublicationContext, sync: SyncState, intent: SyncPublicationIntent): void {
  if (intent.gameId !== sync.game_id || intent.cycleUuid !== sync.cycle_uuid) {
    throw new Error(`Sync ${sync.sync_id} publication intent has the wrong owner`);
  }
  if (intent.cycleWorktreePath !== context.cycleWorktreePath) {
    throw new Error(
      `Sync ${sync.sync_id} publication intent names ${intent.cycleWorktreePath}, not ${context.cycleWorktreePath}`,
    );
  }
}

function assertSameRecursiveLayout(prior: RecursiveWorktreeState, target: RecursiveWorktreeState): void {
  const priorPaths = prior.repositories.map((repository) => repository.path);
  const targetPaths = target.repositories.map((repository) => repository.path);
  if (JSON.stringify(priorPaths) !== JSON.stringify(targetPaths)) {
    throw new Error("Sync publication cannot add or remove initialized submodules at the atomic repoint boundary");
  }
}

async function ensureRecursiveTargetObjects(
  context: SyncPublicationContext,
  prior: RecursiveWorktreeState,
  target: RecursiveWorktreeState,
): Promise<void> {
  const priorByPath = new Map(prior.repositories.map((repository) => [repository.path, repository]));
  for (const repository of target.repositories) {
    if (!repository.path || priorByPath.get(repository.path)?.head === repository.head) continue;
    const repositoryPath = resolve(context.cycleWorktreePath, repository.path);
    const available = await runner(context)(repositoryPath, ["cat-file", "-e", `${repository.head}^{commit}`], { check: false });
    if (available.exitCode === 0) continue;
    await checkedGit(
      context,
      repositoryPath,
      ["fetch", "origin", repository.head],
      `Unable to fetch target commit for submodule ${repository.path}`,
    );
    await checkedGit(
      context,
      repositoryPath,
      ["cat-file", "-e", `${repository.head}^{commit}`],
      `Target commit is unavailable for submodule ${repository.path}`,
    );
  }
}

async function buildPublicationWorktreeStates(
  context: SyncPublicationContext,
  sync: SyncState,
  plan: BoundaryPlan,
): Promise<PublicationWorktreeStates> {
  const prior = await captureRecursiveWorktreeState({
    worktreePath: context.cycleWorktreePath,
    runGit: runner(context),
  });
  assertRecursiveWorktreeClean(prior, "Cycle worktree before publication");
  if (prior.root_head !== plan.priorHead) {
    throw new Error(`Cycle worktree is at ${prior.root_head}, not durable prior head ${plan.priorHead}`);
  }
  const target = sync.intake.knowledge_only
    ? prior
    : await captureRecursiveWorktreeState({
        worktreePath: sync.staging!.workspace_path!,
        runGit: runner(context),
      });
  assertRecursiveWorktreeClean(target, "Validated staging worktree");
  if (target.root_head !== plan.newHead) {
    throw new Error(`Validated staging worktree is at ${target.root_head}, not target head ${plan.newHead}`);
  }
  assertSameRecursiveLayout(prior, target);
  await ensureRecursiveTargetObjects(context, prior, target);
  return { schema_version: 1, prior, target };
}

function insertPublicationIntent(
  context: SyncPublicationContext,
  sync: SyncState,
  plan: BoundaryPlan,
  states: PublicationWorktreeStates,
  publishingEventId: string,
): SyncPublicationIntent {
  const at = operationTime(context);
  context.store.db.query(
    `INSERT INTO sync_publication_intents (
       sync_id, game_id, cycle_uuid, cycle_worktree_path, prior_head, new_head,
       worktree_state_json, boundary_plan_json, publishing_event_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sync.sync_id,
    sync.game_id,
    sync.cycle_uuid,
    context.cycleWorktreePath,
    plan.priorHead,
    plan.newHead,
    JSON.stringify(states),
    JSON.stringify(plan),
    publishingEventId,
    at,
    at,
  );
  return getSyncPublicationIntent(context.store.db, sync.sync_id)!;
}

async function observedUpstream(context: SyncPublicationContext, sync: SyncState): Promise<string> {
  revalidatePublicationLease(context, sync);
  const discovery = await fetchUpstreamAndFindMergedPrs(
    { appendLog: context.appendLog ?? (() => {}), runGit: runner(context) },
    { game: context.game ?? null, repoRoot: context.repoRoot },
    () => revalidatePublicationLease(context, sync),
    { upstreamFrom: sync.intake.upstream_from },
  );
  return discovery.afterRef;
}

function nextKnowledgeRevision(db: Database): number {
  const row = db.query("SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM knowledge_revisions").get() as {
    revision: number;
  };
  return Number(row.revision);
}

function insertBoundaryRecords(
  db: Database,
  sync: SyncState,
  plan: BoundaryPlan,
  boundaryEventId: string,
  occurredAt: string,
): void {
  if (!sync.intake.knowledge_only) {
    db.query(
      `INSERT INTO game_upstream_anchors (
         game_id, cycle_uuid, upstream_revision, sync_id, caused_by_event_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id) DO UPDATE SET
         cycle_uuid = excluded.cycle_uuid,
         upstream_revision = excluded.upstream_revision,
         sync_id = excluded.sync_id,
         caused_by_event_id = excluded.caused_by_event_id,
         updated_at = excluded.updated_at`,
    ).run(sync.game_id, sync.cycle_uuid, sync.intake.upstream_to, sync.sync_id, boundaryEventId, occurredAt);
  }
  const insertInvalidation = db.query(
    `INSERT INTO sync_invalidations (
       invalidation_id, sync_id, game_id, cycle_uuid, subject_kind,
       subject_id, reason, caused_by_event_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const record of plan.invalidations) {
    insertInvalidation.run(
      record.invalidationId,
      sync.sync_id,
      sync.game_id,
      sync.cycle_uuid,
      record.subjectKind,
      record.subjectId,
      record.reason,
      boundaryEventId,
      occurredAt,
    );
  }
  const insertPush = db.query(
    `INSERT INTO sync_push_records (
       push_id, sync_id, series_id, branch, remote_name, expected_remote_head,
       new_head, revision, status, attempt_count, caused_by_event_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', 0, ?, ?, ?)`,
  );
  for (const push of plan.pushes) {
    insertPush.run(
      push.pushId,
      sync.sync_id,
      push.seriesId,
      push.branch,
      push.remoteName,
      push.expectedRemoteHead,
      push.newHead,
      boundaryEventId,
      occurredAt,
      occurredAt,
    );
  }
}

export async function repointSyncPublication(
  context: SyncPublicationContext,
  syncId: string,
): Promise<void> {
  const sync = requireCurrentSync(context, syncId);
  const intent = getSyncPublicationIntent(context.store.db, syncId);
  if (!intent) throw new Error(`Sync ${syncId} has no durable publication intent`);
  assertIntentContext(context, sync, intent);
  if (sync.intake.knowledge_only) return;
  revalidatePublicationLease(context, sync);
  const worktree = context.cycleWorktreePath;
  const before = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  if (recursiveWorktreeStatesEqual(before, intent.worktreeStates.target)) return;
  if (!recursiveWorktreeStatesEqual(before, intent.worktreeStates.prior)) {
    throw new Error(`Cycle worktree moved outside sync publication intent: ${worktree}`);
  }
  await checkedGit(
    context,
    worktree,
    ["reset", "--hard", "--recurse-submodules", intent.newHead],
    `Unable to point the cycle worktree at ${intent.newHead}`,
  );
  const after = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  if (!recursiveWorktreeStatesEqual(after, intent.worktreeStates.target)) {
    throw new Error(`Cycle worktree did not settle at recursive published state ${intent.newHead}`);
  }
}

async function compensateCycleHead(
  context: SyncPublicationContext,
  sync: SyncState,
  intent: SyncPublicationIntent,
): Promise<void> {
  if (sync.intake.knowledge_only) return;
  const worktree = context.cycleWorktreePath;
  const before = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  if (recursiveWorktreeStatesEqual(before, intent.worktreeStates.prior)) return;
  const priorByPath = new Map(intent.worktreeStates.prior.repositories.map((repository) => [repository.path, repository]));
  const targetByPath = new Map(intent.worktreeStates.target.repositories.map((repository) => [repository.path, repository]));
  if (before.repositories.length !== priorByPath.size) {
    throw new Error(`Refusing to compensate changed recursive worktree layout: ${worktree}`);
  }
  for (const repository of before.repositories) {
    const prior = priorByPath.get(repository.path);
    const target = targetByPath.get(repository.path);
    if (!prior || !target || repository.local_status ||
      (repository.head !== prior.head && repository.head !== target.head)) {
      throw new Error(`Refusing to compensate changed publication repository ${repository.path || "."}`);
    }
  }
  // Reset one repository at a time in deterministic parent-first order. A
  // process may stop between any two steps; the next fresh-store pass accepts
  // the resulting prior/target mixture and resumes idempotently.
  for (const repository of intent.worktreeStates.prior.repositories) {
    revalidatePublicationLease(context, sync);
    const repositoryPath = repository.path ? resolve(worktree, repository.path) : worktree;
    await checkedGit(
      context,
      repositoryPath,
      ["reset", "--hard", repository.head],
      `Unable to compensate publication repository ${repository.path || "."} to ${repository.head}`,
    );
  }
  const after = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  if (!recursiveWorktreeStatesEqual(after, intent.worktreeStates.prior)) {
    throw new Error(`Cycle compensation did not restore recursive state ${intent.priorHead}`);
  }
}

function durableBoundary(
  context: SyncPublicationContext,
  sync: SyncState,
  plan: BoundaryPlan,
  commandId: string,
  scoreDelta: number | null | undefined,
  actor: EventActor = "operator",
): SyncState {
  return immediateTransaction(context.store.db, () => {
    const intent = getSyncPublicationIntent(context.store.db, sync.sync_id);
    if (!intent) throw new Error(`Sync ${sync.sync_id} has no durable publication intent`);
    assertIntentContext(context, sync, intent);
    if (intent.boundaryEventId !== null) {
      throw new Error(`Sync ${sync.sync_id} publication intent already names boundary ${intent.boundaryEventId}`);
    }
    const knowledgeRevisionNumber = nextKnowledgeRevision(context.store.db);
    const knowledgeRevision = `knowledge-${knowledgeRevisionNumber}`;
    const publication: SyncPublication = {
      ...(plan.remoteApplicationId ? { remote_application_id: plan.remoteApplicationId } : {}),
      prior_head: plan.priorHead,
      new_head: plan.newHead,
      knowledge_revision: knowledgeRevision,
      invalidated_ids: plan.invalidations.map((record) => record.invalidationId),
    };
    const boundary = transitionSync(context.store, sync.sync_id, {
      actor,
      causationId: sync.caused_by_event_id,
      commandId,
      correlationId: sync.sync_id,
      eventType: "sync.boundary_published",
      expectedRevision: sync.revision,
      patch: { publication },
      payload: {
        upstream_revision: sync.intake.upstream_to,
        knowledge_revision: knowledgeRevision,
        invalidations: publication.invalidated_ids,
        validation_evidence: plan.validationEvidence,
      },
    });
    const occurredAt = operationTime(context);
    const knowledge = publishSyncKnowledgeInTransaction(context.store.db, {
      actor,
      commandId: boundary.caused_by_event_id,
      correlationId: sync.sync_id,
      manifest: plan.knowledgeManifest,
      gameId: sync.game_id,
      spanId: syncActionSpanId(commandId),
      syncId: sync.sync_id,
      traceId: sync.trace_id,
      occurredAt,
    });
    if (knowledge.revisionId !== knowledgeRevision) {
      throw new Error(`Knowledge revision allocation changed during sync boundary (${knowledgeRevision} -> ${knowledge.revisionId})`);
    }
    if (plan.remoteApplicationId) {
      recordRemoteApplicationInTransaction(context.store.db, {
        actor,
        boundaryEventId: boundary.caused_by_event_id,
        commandId,
        newHead: plan.newHead,
        priorHead: plan.priorHead,
        gameId: sync.game_id,
        remoteApplicationId: plan.remoteApplicationId,
        repositoryRoot: context.cycleWorktreePath,
        resolvedConflicts: plan.resolvedConflicts,
        scoreDelta,
        cycleUuid: sync.cycle_uuid,
        syncId: sync.sync_id,
        occurredAt,
      });
    }
    insertBoundaryRecords(context.store.db, sync, plan, boundary.caused_by_event_id, occurredAt);
    const intentUpdate = context.store.db.query(
      `UPDATE sync_publication_intents
       SET boundary_event_id = ?, updated_at = ?
       WHERE sync_id = ? AND boundary_event_id IS NULL`,
    ).run(boundary.caused_by_event_id, occurredAt, sync.sync_id);
    if (intentUpdate.changes !== 1) {
      throw new Error(`Sync ${sync.sync_id} publication intent boundary CAS failed`);
    }
    return boundary;
  });
}

export function commitSyncPublicationBoundary(input: {
  context: SyncPublicationContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
  scoreDelta?: number | null;
  actor?: EventActor;
}): SyncState {
  const sync = requireCurrentSync(input.context, input.syncId, input.expectedRevision);
  if (sync.status !== "publishing" || sync.publication) {
    throw new Error(`Sync ${sync.sync_id} is not a raw publishing boundary`);
  }
  const intent = getSyncPublicationIntent(input.context.store.db, sync.sync_id);
  if (!intent) throw new Error(`Sync ${sync.sync_id} has no durable publication intent`);
  return durableBoundary(input.context, sync, intent.boundaryPlan, input.commandId, input.scoreDelta, input.actor);
}

function selectPushRecords(db: Database, syncId: string): PushRecordRow[] {
  return db
    .query("SELECT * FROM sync_push_records WHERE sync_id = ? ORDER BY series_id")
    .all(syncId) as PushRecordRow[];
}

function transitionPushRecord(
  context: SyncPublicationContext,
  sync: SyncState,
  row: PushRecordRow,
  next: PushRecordRow["status"],
  commandId: string,
  lastError?: string | null,
  actor: EventActor = "runner",
  causationId?: string,
): PushRecordRow {
  return immediateTransaction(context.store.db, () => {
    const current = context.store.db.query("SELECT * FROM sync_push_records WHERE push_id = ?").get(row.push_id) as
      | PushRecordRow
      | null;
    if (!current) throw new Error(`Sync push record disappeared: ${row.push_id}`);
    if (current.revision !== row.revision || current.status !== row.status) {
      throw new Error(`Stale sync push revision ${row.revision} for ${row.push_id}`);
    }
    const allowed =
      ((current.status === "pending" || current.status === "failed") && next === "pushing") ||
      (current.status === "pushing" && (next === "pushed" || next === "failed"));
    if (!allowed) throw new Error(`Invalid sync push transition ${current.status} -> ${next}`);
    const occurredAt = operationTime(context);
    const event = appendGameEvent(context.store.db, {
      actor,
      causationId: causationId ?? current.caused_by_event_id,
      correlationId: sync.sync_id,
      eventType: next === "pushing" ? "sync.pr_push_started" : next === "pushed" ? "sync.pr_push_succeeded" : "sync.pr_push_failed",
      occurredAt,
      payload: {
        from_status: current.status,
        to_status: next,
        series_id: current.series_id,
        branch: current.branch,
        remote_name: current.remote_name,
        new_head: current.new_head,
        attempt: current.attempt_count + (next === "pushing" ? 1 : 0),
        ...(lastError ? { error: lastError } : {}),
      },
      gameId: sync.game_id,
      ...eventSpan(syncActionSpanId(commandId)),
      subjectId: current.push_id,
      subjectKind: "sync_push",
      traceId: sync.trace_id,
    });
    const result = context.store.db
      .query(
        `UPDATE sync_push_records SET
           revision = ?, status = ?, attempt_count = ?, last_error = ?, caused_by_event_id = ?,
           updated_at = ?, pushed_at = ?
         WHERE push_id = ? AND revision = ? AND status = ?`,
      )
      .run(
        current.revision + 1,
        next,
        current.attempt_count + (next === "pushing" ? 1 : 0),
        lastError ?? null,
        event.eventId,
        occurredAt,
        next === "pushed" ? occurredAt : null,
        current.push_id,
        current.revision,
        current.status,
      );
    if (result.changes !== 1) throw new Error(`Stale sync push revision ${current.revision} for ${current.push_id}`);
    return context.store.db.query("SELECT * FROM sync_push_records WHERE push_id = ?").get(current.push_id) as PushRecordRow;
  });
}

/** Durable seam used by crash recovery/tests before the network push begins. */
export function startSyncPublicationPush(input: {
  context: SyncPublicationContext;
  syncId: string;
  seriesId: string;
  commandId: string;
  actor?: EventActor;
}): void {
  const sync = requireCurrentSync(input.context, input.syncId);
  if (sync.status !== "publishing" || !sync.publication) {
    throw new Error(`Sync ${sync.sync_id} has no committed boundary for PR pushes`);
  }
  const row = selectPushRecords(input.context.store.db, sync.sync_id)
    .find((candidate) => candidate.series_id === input.seriesId);
  if (!row) throw new Error(`Sync ${sync.sync_id} has no push record for ${input.seriesId}`);
  if (row.status === "pushing" || row.status === "pushed") return;
  transitionPushRecord(input.context, sync, row, "pushing", input.commandId, undefined, input.actor);
}

async function executePush(
  context: SyncPublicationContext,
  sync: SyncState,
  initial: PushRecordRow,
  commandId: string,
  actor: EventActor,
  causationId?: string,
): Promise<PushRecordRow> {
  if (initial.status === "pushed") return initial;
  let row = initial.status === "pushing"
    ? initial
    : transitionPushRecord(context, sync, initial, "pushing", commandId, undefined, actor, causationId);
  try {
    revalidatePublicationLease(context, sync);
    const currentRemoteHead = await remoteBranchHead(context, row.remote_name, row.branch);
    if (currentRemoteHead !== row.new_head) {
      if (currentRemoteHead !== row.expected_remote_head) {
        throw new Error(
          `PR branch ${row.remote_name}/${row.branch} moved before push (${row.expected_remote_head ?? "absent"} -> ${currentRemoteHead ?? "absent"})`,
        );
      }
      const ref = `refs/heads/${row.branch}`;
      await checkedGit(
        context,
        context.cycleWorktreePath,
        [
          "push",
          `--force-with-lease=${ref}:${row.expected_remote_head ?? ""}`,
          row.remote_name,
          `${row.new_head}:${ref}`,
        ],
        `Unable to push reconciled PR series ${row.series_id}`,
      );
    }
    row = transitionPushRecord(context, sync, row, "pushed", commandId, undefined, actor);
    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    immediateTransaction(context.store.db, () => {
      const failed = transitionPushRecord(context, sync, row, "failed", commandId, message, actor);
      const currentSync = requireCurrentSync(context, sync.sync_id);
      if (currentSync.status !== "publishing") {
        throw new Error(`Sync ${sync.sync_id} left publishing while recording push failure`);
      }
      blockSync(
        context,
        currentSync,
        commandId,
        "pr_push_failed",
        message,
        actor,
      );
    });
    throw new Error(`Sync PR push failed: ${message}`, { cause: error });
  }
}

/**
 * The sole post-publication anchor. Its deterministic id is derived from the
 * remote application, and its commit is the durable publication head rather
 * than a subsequently observed live HEAD.
 */
function anchorPublishedRemoteApplication(
  context: SyncPublicationContext,
  sync: SyncState,
  commandId: string,
  actor: EventActor,
): void {
  const publication = sync.publication;
  const remoteApplicationId = publication?.remote_application_id;
  if (!publication || !remoteApplicationId) return;
  const savePointId = stableId("save-point", remoteApplicationId);
  const existingSavePoint = context.store.db
    .query("SELECT commit_sha, payload_json FROM save_points WHERE id = ?")
    .get(savePointId) as { commit_sha: string | null; payload_json: string } | null;
  const existingTimeline = context.store.db
    .query(
      `SELECT payload_json FROM cycle_timeline_entries
       WHERE cycle_uuid = ? AND entry_kind = 'save_point' AND entry_id = ?`,
    )
    .get(sync.cycle_uuid, savePointId) as { payload_json: string } | null;
  if (existingSavePoint || existingTimeline) {
    if (!existingSavePoint || !existingTimeline || existingSavePoint.commit_sha !== publication.new_head) {
      throw new Error(`Sync publication save-point ${savePointId} is only partially or incorrectly anchored`);
    }
    const payload = JSON.parse(existingSavePoint.payload_json) as Record<string, unknown>;
    if (payload.remote_application_id !== remoteApplicationId || payload.anchor_revision !== publication.new_head) {
      throw new Error(`Sync publication save-point ${savePointId} does not match ${remoteApplicationId}`);
    }
    return;
  }
  const campaign = ensureCampaign(context.store, {
    gameId: sync.game_id,
    baseRef: context.game?.baseRef ?? "origin/master",
  });
  const at = operationTime(context);
  const payload: JsonObject = {
    remote_application_id: remoteApplicationId,
    sync_id: sync.sync_id,
    anchor_revision: publication.new_head,
    commit_reason: "sync_publication",
  };
  context.store.db.query(
    `INSERT INTO save_points (
       id, campaign_id, run_id, trigger_kind, label, commit_sha, base_ref,
       base_sha, worktree_dirty, committed, payload_json, created_at
     ) VALUES (?, ?, (
       SELECT active_run_id FROM cycles WHERE cycle_uuid = ?
     ), 'sync', ?, ?, ?, ?, 0, 0, ?, ?)`,
  ).run(
    savePointId,
    campaign.id,
    sync.cycle_uuid,
    `sync ${remoteApplicationId}`,
    publication.new_head,
    context.game?.baseRef ?? "origin/master",
    sync.intake.upstream_to,
    JSON.stringify(payload),
    at,
  );
  recordSavePointAnchor(context.store, {
    gameId: sync.game_id,
    cycleUuid: sync.cycle_uuid,
    savePointId,
    commitSha: publication.new_head,
    triggerKind: "sync",
    artifactPaths: [],
    payload,
    causationId: sync.caused_by_event_id,
    commandId,
    correlationId: sync.cycle_uuid,
    spanId: syncActionSpanId(commandId),
    actor,
    occurredAt: at,
  });
}

function finalizePublication(
  context: SyncPublicationContext,
  sync: SyncState,
  commandId: string,
  actor: EventActor,
  causationId?: string,
): SyncState {
  return immediateTransaction(context.store.db, () => {
    const current = requireCurrentSync(context, sync.sync_id);
    if (current.status !== "publishing" || !current.publication) {
      throw new Error(`Sync ${current.sync_id} has no durable publishing boundary to finalize`);
    }
    const records = selectPushRecords(context.store.db, current.sync_id);
    const incomplete = records.filter((record) => record.status !== "pushed");
    if (incomplete.length > 0) {
      throw new Error(`Sync ${current.sync_id} still has incomplete PR pushes: ${incomplete.map((row) => row.series_id).join(", ")}`);
    }
    if (records.length !== current.pr_reconciliation.length) {
      throw new Error(
        `Sync ${current.sync_id} has ${records.length} push records for ${current.pr_reconciliation.length} reconciled PR series`,
      );
    }
    const lease = requireLease(context.store, context.leaseId, current.game_id);
    if (lease.requested_handoff) {
      throw new Error(`Sync lease ${lease.lease_id} cannot auto-handoff after publication`);
    }
    anchorPublishedRemoteApplication(context, current, commandId, actor);
    const prReconciliation: SyncPrReconciliation[] = current.pr_reconciliation.map((entry) => ({ ...entry, pushed: true }));
    const published = transitionSync(context.store, current.sync_id, {
      actor,
      causationId: causationId ?? records.at(-1)?.caused_by_event_id ?? current.caused_by_event_id,
      commandId,
      correlationId: current.sync_id,
      eventType: "sync.published",
      expectedRevision: current.revision,
      patch: { status: "published", blockers: [], prReconciliation },
    });
    releaseDispatch(context.store, {
      actor,
      causationId: published.caused_by_event_id,
      commandId,
      correlationId: current.sync_id,
      leaseId: context.leaseId,
      gameId: current.game_id,
      spanId: syncActionSpanId(commandId),
      now: operationTime(context),
    });
    const deleted = context.store.db.query(
      "DELETE FROM sync_publication_intents WHERE sync_id = ? AND boundary_event_id IS NOT NULL",
    ).run(current.sync_id);
    if (deleted.changes !== 1) {
      throw new Error(`Sync ${current.sync_id} durable publication intent was not finalized`);
    }
    return published;
  });
}

async function continuePublishing(
  input: ContinueSyncPublicationInput,
  initial: SyncState,
): Promise<SyncState> {
  const actor = input.actor ?? "runner";
  let sync = initial;
  if (!sync.publication) {
    let intent = getSyncPublicationIntent(input.context.store.db, sync.sync_id);
    if (!intent) {
      const plan = await buildBoundaryPlan(input.context, sync);
      const states = await buildPublicationWorktreeStates(input.context, sync, plan);
      intent = immediateTransaction(input.context.store.db, () =>
        insertPublicationIntent(input.context, sync, plan, states, sync.caused_by_event_id));
    }
    assertIntentContext(input.context, sync, intent);
    try {
      await repointSyncPublication(input.context, sync.sync_id);
      sync = commitSyncPublicationBoundary({
        context: input.context,
        syncId: sync.sync_id,
        expectedRevision: sync.revision,
        commandId: input.commandId,
        scoreDelta: input.scoreDelta,
        actor,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let detail = message;
      try {
        const reconciled = await reconcileInterruptedSyncPublication({
          context: input.context,
          syncId: sync.sync_id,
          commandId: input.commandId,
          actor,
        });
        if (reconciled.status !== "blocked") return reconciled;
      } catch (recoveryError) {
        detail = `${message}; crash reconciliation failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`;
      }
      throw new Error(`Sync publication boundary failed: ${detail}`, { cause: error });
    }
  }
  let causationId = sync.caused_by_event_id;
  for (const push of selectPushRecords(input.context.store.db, sync.sync_id)) {
    const accepted = await executePush(input.context, sync, push, input.commandId, actor, causationId);
    causationId = accepted.caused_by_event_id;
  }
  return finalizePublication(input.context, sync, input.commandId, actor, causationId);
}

/** Persists exact recursive repoint intent in the same transaction as validated -> publishing. */
export async function prepareSyncPublication(input: PrepareSyncPublicationInput): Promise<SyncState> {
  if (input.confirmed !== true) throw new Error("sync.publish requires explicit confirmation");
  const sync = requireCurrentSync(input.context, input.syncId, input.expectedRevision);
  const actor = input.actor ?? "operator";
  if (sync.status !== "validated") {
    throw new Error(`sync.publish requires validated status; ${sync.sync_id} is ${sync.status}`);
  }
  let plan: BoundaryPlan;
  let states: PublicationWorktreeStates;
  try {
    plan = await buildBoundaryPlan(input.context, sync);
    const observed = await observedUpstream(input.context, sync);
    if (observed !== sync.intake.upstream_to) {
      return blockSync(
        input.context,
        sync,
        input.commandId,
        "upstream_moved_after_validation",
        `Validated ${sync.intake.upstream_to}, but upstream is now ${observed}`,
        actor,
      );
    }
    states = await buildPublicationWorktreeStates(input.context, sync, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blockSync(input.context, sync, input.commandId, "publication_preflight_failed", message, actor);
    throw new Error(`Sync publication preflight failed: ${message}`, { cause: error });
  }
  return immediateTransaction(input.context.store.db, () => {
    const publishing = transitionSync(input.context.store, sync.sync_id, {
      actor,
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: { status: "publishing", blockers: [] },
    });
    insertPublicationIntent(input.context, publishing, plan, states, publishing.caused_by_event_id);
    return publishing;
  });
}

/**
 * Fresh-process reconciliation for raw or boundary-committed publishing.
 * Raw state compensates and blocks; committed state moves forward through pushes/finalization.
 */
export async function reconcileInterruptedSyncPublication(input: {
  context: SyncPublicationContext;
  syncId: string;
  commandId: string;
  actor?: EventActor;
}): Promise<SyncState> {
  const sync = requireCurrentSync(input.context, input.syncId);
  if (sync.status !== "publishing") {
    throw new Error(`Sync ${sync.sync_id} is ${sync.status}; publishing reconciliation is not applicable`);
  }
  const intent = getSyncPublicationIntent(input.context.store.db, sync.sync_id);
  if (!intent) {
    return blockSync(
      input.context,
      sync,
      input.commandId,
      "publication_intent_missing",
      "Publishing state has no durable repoint intent; no worktree mutation was attempted",
      input.actor ?? "runner",
    );
  }
  assertIntentContext(input.context, sync, intent);
  const boundaryEvent = intent.boundaryEventId
    ? input.context.store.db.query(
        `SELECT event_id FROM game_events
         WHERE event_id = ? AND subject_kind = 'sync_workflow'
           AND subject_id = ? AND event_type = 'sync.boundary_published'`,
      ).get(intent.boundaryEventId, sync.sync_id) as { event_id: string } | null
    : null;
  const raw = sync.publication === null && intent.boundaryEventId === null && boundaryEvent === null;
  const committed = sync.publication !== null && intent.boundaryEventId !== null && boundaryEvent?.event_id === intent.boundaryEventId;
  if (!raw && !committed) {
    throw new Error(`Sync ${sync.sync_id} has inconsistent publication intent/boundary durability`);
  }
  if (committed) {
    return continuePublishing({
      context: input.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: input.commandId,
      actor: input.actor ?? "runner",
    }, sync);
  }
  await compensateCycleHead(input.context, sync, intent);
  const current = requireCurrentSync(input.context, sync.sync_id);
  return blockSync(
    input.context,
    current,
    input.commandId,
    "publication_interrupted",
    "Publication stopped before the durable boundary; the exact recursive cycle state was restored",
    input.actor ?? "runner",
  );
}

/** Confirm-gated operator entry point. Valid only from the validated resting state. */
export async function publishSync(input: PublishSyncInput): Promise<SyncState> {
  const action = { ...input, actor: input.actor ?? "operator" };
  const prepared = await prepareSyncPublication(action);
  if (prepared.status !== "publishing") return prepared;
  return continuePublishing({ ...action, expectedRevision: prepared.revision }, prepared);
}

/** Resumes a recovered/crashed publication while the durable status is publishing. */
export async function continueSyncPublication(input: ContinueSyncPublicationInput): Promise<SyncState> {
  const sync = requireCurrentSync(input.context, input.syncId, input.expectedRevision);
  if (sync.status !== "publishing") {
    throw new Error(`continueSyncPublication requires publishing status; ${sync.sync_id} is ${sync.status}`);
  }
  return continuePublishing(input, sync);
}
