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
import type {
  SyncPrReconciliation,
  SyncPublication,
  SyncState,
} from "./types.js";
import type { SyncEngineContext } from "./engine.js";

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

interface PlannedPush {
  pushId: string;
  seriesId: string;
  branch: string;
  remoteName: string;
  expectedRemoteHead: string | null;
  newHead: string;
}

export interface BoundaryPlan {
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

export interface SyncPublicationContext extends SyncEngineContext {
  /** Open Melee PR branches live on fork by default; tests/local mirrors may override it. */
  prRemoteName?: string;
  runKnowledgeIntake?: (input: {
    checkoutRoot: string;
    expectedHead: string;
    prNumbers: number[];
  }) => Promise<JsonObject>;
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

function publicationHeads(context: SyncPublicationContext, sync: SyncState): Pick<BoundaryPlan, "newHead" | "priorHead"> {
  const priorHeadRow = context.store.db
    .query("SELECT head_revision FROM cycles WHERE cycle_uuid = ?")
    .get(sync.cycle_uuid) as { head_revision: string | null } | null;
  const priorHead = requiredText(priorHeadRow?.head_revision ?? "", `head_revision for ${sync.cycle_uuid}`);
  const newHead = sync.intake.knowledge_only
    ? priorHead
    : requiredText(sync.staging?.staging_head_sha ?? "", `staging head for ${sync.sync_id}`);
  return { newHead, priorHead };
}

async function buildBoundaryPlan(context: SyncPublicationContext, sync: SyncState): Promise<BoundaryPlan> {
  revalidatePublicationLease(context, sync);
  const { newHead, priorHead } = publicationHeads(context, sync);
  if (!sync.intake.knowledge_only) {
    const staging = await inspectSyncWorktree({ worktreePath: sync.staging!.workspace_path!, runGit: runner(context) });
    if (!staging.exists || staging.head !== newHead || staging.mergeInProgress || staging.status.trim()) {
      throw new Error(`Sync ${sync.sync_id} staging workspace is not the validated clean head ${newHead}`);
    }
  }
  return {
    newHead,
    priorHead,
    pushes: await plannedPushes(context, sync),
    ...(sync.intake.knowledge_only ? {} : { remoteApplicationId: stableId("remote-application", sync.sync_id) }),
    resolvedConflicts: [...sync.resolved_conflict_paths].sort(),
    validationEvidence: validationEvidence(context.store.db, sync),
  };
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

async function publicationTargetState(
  context: SyncPublicationContext,
  sync: SyncState,
  plan: BoundaryPlan,
): Promise<RecursiveWorktreeState> {
  const target = sync.intake.knowledge_only
    ? await captureRecursiveWorktreeState({ worktreePath: context.cycleWorktreePath, runGit: runner(context) })
    : await captureRecursiveWorktreeState({ worktreePath: sync.staging!.workspace_path!, runGit: runner(context) });
  assertRecursiveWorktreeClean(target, "Validated staging worktree");
  if (target.root_head !== plan.newHead) {
    throw new Error(`Validated staging worktree is at ${target.root_head}, not target head ${plan.newHead}`);
  }
  return target;
}


async function observedUpstream(context: SyncPublicationContext, sync: SyncState): Promise<string> {
  revalidatePublicationLease(context, sync);
  const discovery = await fetchUpstreamAndFindMergedPrs(
    { runGit: runner(context) },
    { game: context.game ?? null, repoRoot: context.repoRoot },
    () => revalidatePublicationLease(context, sync),
    { upstreamFrom: sync.intake.upstream_from },
  );
  return discovery.afterRef;
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
  const plan = await buildBoundaryPlan(context, sync);
  if (sync.intake.knowledge_only) return;
  revalidatePublicationLease(context, sync);
  const worktree = context.cycleWorktreePath;
  const before = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  const target = await publicationTargetState(context, sync, plan);
  if (recursiveWorktreeStatesEqual(before, target)) return;
  assertRecursiveWorktreeClean(before, "Cycle worktree before publication");
  if (before.root_head !== plan.priorHead) {
    throw new Error(`Cycle worktree moved outside the sync publication heads: ${worktree}`);
  }
  assertSameRecursiveLayout(before, target);
  await ensureRecursiveTargetObjects(context, before, target);
  await checkedGit(
    context,
    worktree,
    ["reset", "--hard", "--recurse-submodules", plan.newHead],
    `Unable to point the cycle worktree at ${plan.newHead}`,
  );
  const after = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  if (!recursiveWorktreeStatesEqual(after, target)) {
    throw new Error(`Cycle worktree did not settle at recursive published state ${plan.newHead}`);
  }
}

async function compensateCycleHead(
  context: SyncPublicationContext,
  sync: SyncState,
  plan: Pick<BoundaryPlan, "newHead" | "priorHead">,
): Promise<void> {
  if (sync.intake.knowledge_only) return;
  const worktree = context.cycleWorktreePath;
  const before = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  if (before.root_head !== plan.priorHead && before.root_head !== plan.newHead) {
    throw new Error(`Refusing to compensate cycle worktree at unexpected head ${before.root_head}`);
  }
  for (const repository of before.repositories) {
    if (repository.local_status) {
      throw new Error(`Refusing to compensate changed publication repository ${repository.path || "."}`);
    }
  }
  revalidatePublicationLease(context, sync);
  await checkedGit(
    context,
    worktree,
    ["reset", "--hard", "--recurse-submodules", plan.priorHead],
    `Unable to compensate publication to ${plan.priorHead}`,
  );
  const after = await captureRecursiveWorktreeState({ worktreePath: worktree, runGit: runner(context) });
  assertRecursiveWorktreeClean(after, "Compensated cycle worktree");
  if (after.root_head !== plan.priorHead) throw new Error(`Cycle compensation did not restore ${plan.priorHead}`);
}

function durableBoundary(
  context: SyncPublicationContext,
  sync: SyncState,
  plan: BoundaryPlan,
  knowledgeIntake: JsonObject,
  commandId: string,
  scoreDelta: number | null | undefined,
  actor: EventActor = "operator",
): SyncState {
  return immediateTransaction(context.store.db, () => {
    const publication: SyncPublication = {
      ...(plan.remoteApplicationId ? { remote_application_id: plan.remoteApplicationId } : {}),
      prior_head: plan.priorHead,
      new_head: plan.newHead,
      knowledge_intake: knowledgeIntake,
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
        knowledge_intake: knowledgeIntake,
        validation_evidence: plan.validationEvidence,
      },
    });
    const occurredAt = operationTime(context);
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
    return boundary;
  });
}

function mergedPrNumbers(sync: SyncState): number[] {
  return sync.intake.merged_pr_ids.map((value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`Sync ${sync.sync_id} has invalid merged PR number: ${value}`);
    }
    return parsed;
  });
}

async function runPublicationKnowledgeIntake(
  context: SyncPublicationContext,
  sync: SyncState,
  plan: BoundaryPlan,
): Promise<JsonObject> {
  if (!context.runKnowledgeIntake) {
    throw new Error(`Sync ${sync.sync_id} cannot publish without a V2 knowledge intake callback`);
  }
  const fullHead = await checkedGit(
    context,
    context.cycleWorktreePath,
    ["rev-parse", "HEAD"],
    "Unable to verify the cycle worktree before V2 knowledge intake",
  );
  if (fullHead !== plan.newHead) {
    throw new Error(`Cycle worktree is at ${fullHead}, not publication head ${plan.newHead}`);
  }
  const expectedHead = await checkedGit(
    context,
    context.cycleWorktreePath,
    ["rev-parse", "--short", "HEAD"],
    "Unable to derive the V2 knowledge intake report revision",
  );
  return context.runKnowledgeIntake({
    checkoutRoot: context.cycleWorktreePath,
    expectedHead,
    prNumbers: sync.intake.knowledge_only ? [] : mergedPrNumbers(sync),
  });
}

export async function commitSyncPublicationBoundary(input: {
  context: SyncPublicationContext;
  syncId: string;
  expectedRevision: number;
  commandId: string;
  scoreDelta?: number | null;
  actor?: EventActor;
}): Promise<SyncState> {
  const sync = requireCurrentSync(input.context, input.syncId, input.expectedRevision);
  if (sync.status !== "publishing" || sync.publication) {
    throw new Error(`Sync ${sync.sync_id} is not a raw publishing boundary`);
  }
  const plan = await buildBoundaryPlan(input.context, sync);
  const observed = await captureRecursiveWorktreeState({
    worktreePath: input.context.cycleWorktreePath,
    runGit: runner(input.context),
  });
  const target = await publicationTargetState(input.context, sync, plan);
  if (!recursiveWorktreeStatesEqual(observed, target)) {
    throw new Error(`Cycle worktree is not at recursive publication head ${plan.newHead}`);
  }
  const knowledgeIntake = await runPublicationKnowledgeIntake(input.context, sync, plan);
  return durableBoundary(
    input.context,
    sync,
    plan,
    knowledgeIntake,
    input.commandId,
    input.scoreDelta,
    input.actor,
  );
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
    try {
      await repointSyncPublication(input.context, sync.sync_id);
      sync = await commitSyncPublicationBoundary({
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

/** Confirms the publication preflight before validated -> publishing. */
export async function prepareSyncPublication(input: PrepareSyncPublicationInput): Promise<SyncState> {
  if (input.confirmed !== true) throw new Error("sync.publish requires explicit confirmation");
  const sync = requireCurrentSync(input.context, input.syncId, input.expectedRevision);
  const actor = input.actor ?? "operator";
  if (sync.status !== "validated") {
    throw new Error(`sync.publish requires validated status; ${sync.sync_id} is ${sync.status}`);
  }
  try {
    if (!input.context.runKnowledgeIntake) {
      throw new Error(`Sync ${sync.sync_id} cannot publish without a V2 knowledge intake callback`);
    }
    const plan = await buildBoundaryPlan(input.context, sync);
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
    await buildPublicationWorktreeStates(input.context, sync, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blockSync(input.context, sync, input.commandId, "publication_preflight_failed", message, actor);
    throw new Error(`Sync publication preflight failed: ${message}`, { cause: error });
  }
  return immediateTransaction(input.context.store.db, () => {
    return transitionSync(input.context.store, sync.sync_id, {
      actor,
      commandId: input.commandId,
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: { status: "publishing", blockers: [] },
    });
  });
}

/**
 * Fresh-process reconciliation for raw or boundary-committed publishing.
 * Raw state restores the durable prior head and blocks. Committed state moves
 * forward through pushes and finalization.
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
  if (sync.publication) {
    const boundaryEvent = input.context.store.db.query(
      `SELECT event_id FROM game_events
       WHERE subject_kind = 'sync_workflow' AND subject_id = ?
         AND event_type = 'sync.boundary_published'
       ORDER BY sequence DESC LIMIT 1`,
    ).get(sync.sync_id) as { event_id: string } | null;
    if (!boundaryEvent) {
      throw new Error(`Sync ${sync.sync_id} has a publication without a canonical boundary event`);
    }
    return continuePublishing({
      context: input.context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: input.commandId,
      actor: input.actor ?? "runner",
    }, sync);
  }
  await compensateCycleHead(input.context, sync, publicationHeads(input.context, sync));
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
