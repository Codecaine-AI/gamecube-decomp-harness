import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { immediateTransaction, openState, type StateStore } from "@server/core/orchestrator-state";
import { getActiveProjectSession, getProjectSessionByUuid } from "@server/core/project-session/store.js";
import {
  beginDrain,
  getProjectState,
  initializeProjectState,
  requestDispatch,
  requireLease,
  type Blocker,
} from "@server/core/project-state";
import { eventsForSubject } from "@server/core/project-state/events.js";
import type { JsonValue } from "@server/core/project-state/events.js";
import { getRun } from "@server/core/session-runtime/run-state";
import { pauseRun, runDispatchLeaseStaleness } from "@server/core/session-runtime/phases/running/run-control.js";
import { fetchUpstreamAndFindMergedPrs } from "@server/core/session-runtime/phases/preparing/subphases/git-intake.js";
import { prepareWorktreePaths } from "@server/core/session-runtime/phases/preparing/subphases/worktrees.js";
import type { ResolvedProject } from "@server/core/project-registry";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";
import { activateAcquiredSync } from "./activation.js";
import {
  cancelSync,
  getSyncBlockedOriginStatus,
  getNonTerminalSyncForProject,
  getSyncState,
  listSyncKnowledgeJobs,
  markSyncRecoveryRequired,
  publishSync,
  reconcileInterruptedSyncPublication,
  reconcileSync,
  recordSyncRequested,
  recoverConfirmedOrphanSyncIngest,
  recoverSync,
  resolveSyncConflict,
  refreshSyncUpstreamObservation,
  validateSync,
  completeSyncKnowledgeIngest,
  continueSyncPublication,
  type SyncEngineContext,
  type SyncKnowledgeProcessors,
  type SyncState,
  type SyncValidationResult,
} from "./index.js";

export type SyncActionId =
  | "sync.start"
  | "sync.resolve_conflict"
  | "sync.publish"
  | "sync.cancel"
  | "sync.recover";

export interface SyncActionProjection {
  action_id: SyncActionId;
  subject_kind: "sync";
  subject_id: string;
  enabled: boolean;
  blocked_by: Blocker[];
  expected_transition: string;
  confirmation_required: boolean;
}

export interface SyncRuntimeProjectContext {
  graphDbPath: string;
  project: ResolvedProject | null;
  repoRoot: string;
  stateDir: string;
}

export interface SyncRuntimeDeps {
  appendLog?: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  kernelEnabled?: () => Promise<boolean>;
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  now?: () => Date | number | string;
  packageRoot: string;
  resolveDashboardProject: (
    input: Record<string, unknown>,
    options: { useDefaultProject?: boolean },
  ) => SyncRuntimeProjectContext;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGit: (
    repoRoot: string,
    args: string[],
    options?: { check?: boolean; failureHint?: string },
  ) => Promise<CliResult>;
  serverJobPath: string;
  sourceRoot: (sourceId: string) => string;
  processors?: (input: {
    body: Record<string, unknown>;
    paths: SyncRuntimeProjectContext;
    sync: SyncState;
  }) => SyncKnowledgeProcessors;
  validate?: (worktreePath: string, context: SyncEngineContext) => Promise<SyncValidationResult>;
}

export interface SyncStartDecision {
  queued: boolean;
  run_draining: boolean;
  lease_id: string | null;
  sync: SyncState;
}

export class SyncActionBlockedError extends Error {
  readonly action: SyncActionProjection;

  constructor(action: SyncActionProjection) {
    super(`${action.action_id} is blocked: ${action.blocked_by.map((blocker) => blocker.message).join("; ")}`);
    this.name = "SyncActionBlockedError";
    this.action = action;
  }
}

export class SyncWorkflowBlockedError extends Error {
  readonly sync: SyncState;

  constructor(sync: SyncState, cause: unknown) {
    super(
      `Sync ${sync.sync_id} stopped in ${sync.status}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "SyncWorkflowBlockedError";
    this.sync = sync;
  }
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => text(item)).filter(Boolean))]
    : [];
}

function blocker(code: string, message: string, sourceKind: string, sourceId: string, recoverable = true): Blocker {
  return { code, message, source_kind: sourceKind, source_id: sourceId, recoverable };
}

function dedupeBlockers(blockers: Blocker[]): Blocker[] {
  const seen = new Set<string>();
  return blockers.filter((entry) => {
    const key = `${entry.code}\0${entry.source_kind}\0${entry.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actionResult(
  actionId: SyncActionId,
  subjectId: string,
  blockedBy: Blocker[],
  expectedTransition: string,
  confirmationRequired: boolean,
): SyncActionProjection {
  const blockers = dedupeBlockers(blockedBy);
  return {
    action_id: actionId,
    subject_kind: "sync",
    subject_id: subjectId,
    enabled: blockers.length === 0,
    blocked_by: blockers,
    expected_transition: expectedTransition,
    confirmation_required: confirmationRequired,
  };
}

function currentSync(store: StateStore, projectId: string, explicitSyncId?: string): SyncState | null {
  if (explicitSyncId) return getSyncState(store, explicitSyncId);
  return getNonTerminalSyncForProject(store, projectId);
}

function ownsSyncLease(store: StateStore, projectId: string, sync: SyncState | null): boolean {
  const lease = getProjectState(store, projectId)?.active_workflow;
  return Boolean(sync && lease?.kind === "sync" && lease.workflow_id === sync.sync_id);
}

function hasValidationEvidence(store: StateStore, sync: SyncState): boolean {
  if (sync.staging?.validation_evidence) return true;
  return eventsForSubject(store.db, "sync", sync.sync_id).some(
    (event) => event.eventType === "sync.validated" && event.payload.validation_evidence !== undefined,
  );
}

export function projectSyncAction(
  store: StateStore,
  projectId: string,
  actionId: SyncActionId,
  explicitSyncId?: string,
  options: {
    hasActiveProcess?: (stateDir: string) => { active: boolean };
    now?: Date | number | string;
    stateDir?: string;
  } = {},
): SyncActionProjection {
  const sync = currentSync(store, projectId, explicitSyncId);
  const subjectId = sync?.sync_id ?? explicitSyncId ?? `sync:new:${projectId}`;
  const state = getProjectState(store, projectId);
  const lease = state?.active_workflow ?? null;
  const session = getActiveProjectSession(store.db, projectId);
  const missingSync = sync
    ? []
    : [blocker("sync_not_found", "No non-terminal sync exists.", "project", projectId)];
  const missingSession = session
    ? []
    : [blocker("session_not_active", "No active project session exists.", "project", projectId)];
  const ownLease = ownsSyncLease(store, projectId, sync);
  const leaseRequired = ownLease
    ? []
    : [blocker("sync_does_not_own_dispatch_lease", "The sync does not own the dispatch lease.", "sync", subjectId)];
  const observedUpstream = sync?.staging?.observed_upstream;
  const validatedUpstream = sync?.staging?.validated_upstream;
  const staleValidatedCandidate = Boolean(
    sync?.status === "validated" &&
    observedUpstream &&
    validatedUpstream &&
    observedUpstream !== validatedUpstream,
  );

  if (actionId === "sync.start") {
    const blockers: Blocker[] = [...missingSession];
    if (sync && sync.status !== "requested") {
      blockers.push(...sync.blockers);
      blockers.push(blocker(
        sync.status === "blocked" ? "sync_staging_awaits_decision" : "sync_already_started",
        sync.status === "blocked"
          ? `Sync ${sync.sync_id} has staging awaiting an operator decision.`
          : `Sync ${sync.sync_id} is already ${sync.status}.`,
        "sync",
        sync.sync_id,
      ));
    }
    if (lease) {
      const sameSync = sync && lease.kind === "sync" && lease.workflow_id === sync.sync_id && lease.status === "active";
      const activeRun = lease.kind === "run" && lease.status === "active";
      const drainCanTargetSync = lease.kind === "run" && lease.status === "draining" &&
        (!lease.requested_handoff || (
          sync && lease.requested_handoff.target_kind === "sync" &&
          lease.requested_handoff.target_workflow_id === sync.sync_id
        ));
      if (!sameSync && !activeRun && !drainCanTargetSync) {
        blockers.push(blocker(
          "dispatch_lease_held",
          `${lease.kind} workflow ${lease.workflow_id} holds the dispatch lease and cannot hand off to this sync.`,
          lease.kind,
          lease.workflow_id,
        ));
      }
    }
    const afterDrain = lease?.kind === "run";
    return actionResult(
      actionId,
      subjectId,
      blockers,
      afterDrain ? "requested → ingesting after run drains" : "requested → ingesting",
      false,
    );
  }

  if (actionId === "sync.resolve_conflict") {
    const blockers = [...missingSync, ...leaseRequired];
    if (sync && (sync.status !== "blocked" || !sync.blockers.some((entry) => entry.code === "conflict_needs_operator"))) {
      blockers.push(...sync.blockers);
      blockers.push(blocker(
        "sync_not_waiting_on_conflict",
        `Sync ${sync.sync_id} is not blocked on an operator conflict.`,
        "sync",
        sync.sync_id,
      ));
    }
    return actionResult(actionId, subjectId, blockers, "blocked → reconciling", false);
  }

  if (actionId === "sync.publish") {
    const blockers = [...missingSync, ...leaseRequired];
    if (sync && observedUpstream && validatedUpstream && observedUpstream !== validatedUpstream) {
      blockers.push(blocker(
        "upstream_moved_after_validation",
        `Validated ${validatedUpstream}, but upstream is now ${observedUpstream}.`,
        "sync",
        sync.sync_id,
      ));
    }
    if (sync && sync.status !== "validated") {
      blockers.push(...sync.blockers);
      blockers.push(blocker("sync_not_validated", `Sync ${sync.sync_id} is ${sync.status}; publish requires validated.`, "sync", sync.sync_id));
    } else if (sync && !hasValidationEvidence(store, sync)) {
      blockers.push(blocker("missing_validation_evidence", "Validated sync evidence is missing.", "sync", sync.sync_id));
    }
    return actionResult(actionId, subjectId, blockers, "validated → publishing → published", true);
  }

  if (actionId === "sync.cancel") {
    const blockers = [...missingSync];
    if (sync) {
      const origin = sync.status === "blocked" ? getSyncBlockedOriginStatus(store.db, sync) : null;
      if (sync.status === "publishing" || origin === "publishing" || sync.status === "published" || sync.status === "cancelled") {
        blockers.push(blocker("sync_publish_committing", "Sync cannot be cancelled after publication has started.", "sync", sync.sync_id, false));
      } else if (sync.status !== "requested" && !ownLease) {
        blockers.push(...leaseRequired);
      }
    }
    return actionResult(actionId, subjectId, blockers, `${sync?.status ?? "requested"} → cancelled`, true);
  }

  const blockers = [...missingSync, ...leaseRequired];
  const staleRecoveryRequiresNewSync = Boolean(
    sync && (
      staleValidatedCandidate ||
      sync.blockers.some((entry) => entry.code === "upstream_moved_after_validation")
    ),
  );
  if (sync && staleRecoveryRequiresNewSync) {
    blockers.push(...sync.blockers);
    blockers.push(blocker(
      "sync_cancel_required",
      "The validated candidate is stale. Cancel it and start a new sync so knowledge and source intake use the same upstream.",
      "sync",
      sync.sync_id,
    ));
    return actionResult(
      actionId,
      subjectId,
      blockers,
      "stale candidate → cancel → new sync",
      true,
    );
  }
  const processingOrphan = sync?.status === "ingesting" &&
    listSyncKnowledgeJobs(store.db, sync.sync_id).some((job) => job.status === "processing");
  if (processingOrphan) {
    const staleness = runDispatchLeaseStaleness({
      hasActiveProcess: options.hasActiveProcess,
      lease,
      now: options.now,
      stateDir: options.stateDir ?? store.stateDir,
    });
    if (staleness === "process_liveness_unknown") {
      blockers.push(blocker(
        "process_liveness_unknown",
        "The managed process liveness could not be determined.",
        "sync",
        sync.sync_id,
      ));
    } else if (staleness !== "stale") {
      blockers.push(blocker(
        "dispatch_lease_not_stale",
        "The sync dispatch lease is not stale or its managed process is still active.",
        "sync",
        sync.sync_id,
      ));
    }
    return actionResult(
      actionId,
      subjectId,
      blockers,
      "orphaned ingesting → ingesting with processing jobs requeued",
      true,
    );
  }
  if (sync && (
    (sync.status !== "blocked" && sync.status !== "publishing") ||
    sync.blockers.some((entry) => entry.code === "conflict_needs_operator")
  )) {
    blockers.push(...sync.blockers);
    blockers.push(blocker(
      sync.blockers.some((entry) => entry.code === "conflict_needs_operator")
        ? "sync_conflict_requires_resolution"
        : "sync_recovery_not_required",
      sync.blockers.some((entry) => entry.code === "conflict_needs_operator")
        ? "Use sync.resolve_conflict for staged reconciliation conflicts."
        : `Sync ${sync.sync_id} is not awaiting crash recovery.`,
      "sync",
      sync.sync_id,
    ));
  }
  return actionResult(
    actionId,
    subjectId,
    blockers,
    sync?.status === "publishing"
      ? "publishing → blocked recovery point or published"
      : "blocked → last durable stage or cancelled",
    true,
  );
}

function requiredProjectId(paths: SyncRuntimeProjectContext, body: Record<string, unknown>): string {
  const projectId = paths.project?.projectId ?? text(body.projectId, text(body.project_id));
  if (!projectId) throw new Error("Sync action requires a project id");
  return projectId;
}

function durableSessionWorktreePath(
  paths: SyncRuntimeProjectContext,
  store: StateStore,
  sync: SyncState,
): string {
  const session = getProjectSessionByUuid(store.db, sync.session_uuid);
  if (!session) throw new Error(`Project session not found for sync ${sync.sync_id}: ${sync.session_uuid}`);
  if (session.project_id !== sync.project_id) {
    throw new Error(
      `Sync ${sync.sync_id} belongs to ${sync.project_id}, but session ${sync.session_uuid} belongs to ${session.project_id}`,
    );
  }
  const preparation = session.preparing_state_json.sync;
  const persisted = preparation && typeof preparation === "object"
    ? text(preparation.sessionCurrentWorktreePath, text(preparation.sessionWorktreePath))
    : "";
  if (persisted) return resolve(persisted);
  const derived = prepareWorktreePaths(paths, sync.session_uuid).sessionCurrentWorktreePath;
  if (!derived) throw new Error(`Unable to derive the worktree for project session ${sync.session_uuid}`);
  return derived;
}

function syncLeaseContext(
  paths: SyncRuntimeProjectContext,
  store: StateStore,
  sync: SyncState,
  deps: SyncRuntimeDeps,
): SyncEngineContext {
  const lease = getProjectState(store, sync.project_id)?.active_workflow;
  if (!lease || lease.kind !== "sync" || lease.workflow_id !== sync.sync_id) {
    throw new Error(`Sync ${sync.sync_id} does not own the dispatch lease`);
  }
  return {
    store,
    stateDir: paths.stateDir,
    repoRoot: paths.repoRoot,
    sessionWorktreePath: durableSessionWorktreePath(paths, store, sync),
    project: paths.project ? { baseRef: paths.project.baseRef } : null,
    leaseId: lease.lease_id,
    runGit: deps.runGit,
    appendLog: deps.appendLog,
  };
}

function requestedSyncContext(
  paths: SyncRuntimeProjectContext,
  store: StateStore,
  sync: SyncState,
  deps: SyncRuntimeDeps,
): SyncEngineContext {
  if (sync.status !== "requested") return syncLeaseContext(paths, store, sync, deps);
  return {
    store,
    stateDir: paths.stateDir,
    repoRoot: paths.repoRoot,
    sessionWorktreePath: durableSessionWorktreePath(paths, store, sync),
    project: paths.project ? { baseRef: paths.project.baseRef } : null,
    leaseId: "requested-sync-has-no-lease",
    runGit: deps.runGit,
    appendLog: deps.appendLog,
  };
}

function syncActionOptions(paths: SyncRuntimeProjectContext, deps: SyncRuntimeDeps) {
  return {
    hasActiveProcess: deps.hasActiveProcess,
    now: deps.now?.(),
    stateDir: paths.stateDir,
  };
}

function parseCliOutput(result: CliResult): Record<string, unknown> {
  const value = result.stdout.trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { output: parsed };
  } catch {
    return { output: value };
  }
}

function commandFailure(name: string, result: CliResult): void {
  if (result.exitCode === 0) return;
  throw new Error(`${name} failed (${String(result.exitCode)}): ${(result.stderr || result.stdout || "no output").slice(-4000)}`);
}

function within(root: string, path: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

function defaultProcessors(
  deps: SyncRuntimeDeps,
  paths: SyncRuntimeProjectContext,
  body: Record<string, unknown>,
  sync: SyncState,
): SyncKnowledgeProcessors {
  const dryRunAgents = body.dryRunAgents === true;
  return {
    async processMergedPr({ artifactDirectory, job }) {
      const number = Number(job.sourceId.replace(/^pr-/, ""));
      if (!Number.isInteger(number) || number <= 0) throw new Error(`Invalid merged PR id: ${job.sourceId}`);
      const dataRoot = resolve(artifactDirectory, "data");
      const kernelEnabled = !dryRunAgents && await deps.kernelEnabled?.().catch(() => false);
      const fetch = [
        "python3",
        resolve(deps.sourceRoot("past_prs"), "commands/fetch_recent_pr_dump.py"),
        "--dump-root",
        dataRoot,
        "--postmortem-mode",
        kernelEnabled ? "pi" : "scaffold",
        "--postmortem-scope",
        "fetched",
        "--postmortem-jobs",
        "1",
        "--fetch-jobs",
        "1",
        "--orchestrator-state-dir",
        paths.stateDir,
        "--orchestrator-run-id",
        sync.sync_id,
        "--orchestrator-project-id",
        sync.project_id,
        "--pr",
        String(number),
      ];
      const fetched = await deps.runCli(fetch, deps.packageRoot);
      commandFailure(`Merged PR #${number} staged fetch`, fetched);
      const postmortem = resolve(dataRoot, "prs", `pr-${number}`, "postmortem", "postmortem.json");
      if (!existsSync(postmortem)) throw new Error(`Merged PR #${number} staged postmortem was not produced`);
      const command = [
        "bun",
        deps.serverJobPath,
        ...(paths.project ? ["--project", paths.project.projectId] : []),
        "--repo-root",
        paths.repoRoot,
        "--state-dir",
        paths.stateDir,
        ...(dryRunAgents ? ["--dry-run-agents"] : []),
        "kg-knowledge-intake-agent",
        "--postmortem",
        postmortem,
        "--pr",
        String(number),
        "--run-id",
        sync.sync_id,
        "--item-id",
        `pr-${number}`,
        "--knowledge-curator-enrichment",
        resolve(artifactDirectory, "curated.jsonl"),
        "--agent-output-dir",
        resolve(artifactDirectory, "agent"),
      ];
      const curated = await deps.runCli(command, deps.packageRoot);
      commandFailure(`Merged PR #${number} staged knowledge intake`, curated);
      return {
        pr: number,
        postmortem_path: postmortem,
        postmortem: JSON.parse(readFileSync(postmortem, "utf8")) as JsonValue,
        curation: parseCliOutput(curated) as JsonValue,
      };
    },
    async processCorpus({ job }) {
      const stagedRoot = resolve(paths.stateDir, "staged_corpora");
      const candidates = [
        resolve(stagedRoot, `${job.sourceId}.json`),
        resolve(stagedRoot, `${job.sourceId}.jsonl`),
        resolve(stagedRoot, job.sourceId),
      ].filter((candidate) => within(stagedRoot, candidate));
      const source = candidates.find((candidate) => existsSync(candidate));
      if (!source) throw new Error(`Staged corpus batch ${job.sourceId} was not found below ${stagedRoot}`);
      const content = readFileSync(source, "utf8");
      try {
        return { corpus_batch_id: job.sourceId, source_path: source, content: JSON.parse(content) as JsonValue };
      } catch {
        return { corpus_batch_id: job.sourceId, source_path: source, content };
      }
    },
  };
}

export function createSyncRuntime(deps: SyncRuntimeDeps) {
  async function observe(body: Record<string, unknown>): Promise<SyncState> {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const session = getActiveProjectSession(store.db, projectId);
      if (!session) throw new Error(`No active project session exists for ${projectId}`);
      const existing = getNonTerminalSyncForProject(store, projectId);
      if (existing?.status === "validated") {
        return (await refreshSyncUpstreamObservation({
          context: syncLeaseContext(paths, store, existing, deps),
          syncId: existing.sync_id,
          expectedRevision: existing.revision,
          commandId: text(body.commandId, text(body.command_id)) || `command-sync-refresh-observation-${randomUUID()}`,
        })).sync;
      }
      if (existing && existing.status !== "requested") return existing;
      const anchor = store.db
        .query("SELECT upstream_revision FROM project_upstream_anchors WHERE project_id = ?")
        .get(projectId) as { upstream_revision: string } | null;
      const upstreamFrom = anchor?.upstream_revision ?? session.base_sha ?? session.head_revision;
      if (!upstreamFrom) throw new Error(`Project session ${session.session_uuid} has no upstream anchor`);
      const discovery = await fetchUpstreamAndFindMergedPrs(
        { appendLog: deps.appendLog ?? (() => {}), runGit: deps.runGit },
        { project: paths.project, repoRoot: paths.repoRoot },
        undefined,
        { upstreamFrom },
      );
      return recordSyncRequested(store, {
        projectId,
        sessionUuid: session.session_uuid,
        syncId: text(body.syncId, text(body.sync_id)) || undefined,
        actor: body.actor === "external_observer" ? "external_observer" : "operator",
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-observe-${randomUUID()}`,
        correlationId: text(body.correlationId, text(body.correlation_id)) || undefined,
        intake: {
          upstream_from: upstreamFrom,
          upstream_to: discovery.afterRef,
          merged_pr_ids: discovery.mergedPrs.map(String),
          corpus_batch_ids: strings(body.corpusBatchIds ?? body.corpus_batch_ids),
          knowledge_only: upstreamFrom === discovery.afterRef,
        },
      });
    } finally {
      store.db.close();
    }
  }

  /** Production observation-path hook used by the dashboard refresh loop. */
  async function refreshObservation(body: Record<string, unknown>): Promise<SyncState | null> {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = getNonTerminalSyncForProject(store, projectId);
      if (!sync || sync.status !== "validated") return sync;
      const observedUpstream = text(body.observedUpstream, text(body.observed_upstream));
      if (
        observedUpstream &&
        observedUpstream === (sync.staging?.validated_upstream ?? sync.intake.upstream_to)
      ) {
        return sync;
      }
      return (await refreshSyncUpstreamObservation({
        context: syncLeaseContext(paths, store, sync, deps),
        syncId: sync.sync_id,
        expectedRevision: sync.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-refresh-observation-${randomUUID()}`,
      })).sync;
    } finally {
      store.db.close();
    }
  }

  async function advance(
    paths: SyncRuntimeProjectContext,
    body: Record<string, unknown>,
    syncId: string,
  ): Promise<SyncState> {
    const store = openState(paths.stateDir);
    try {
      let sync = getSyncState(store, syncId);
      if (!sync) throw new Error(`Sync not found: ${syncId}`);
      if (sync.status !== "ingesting") return sync;
      const context = syncLeaseContext(paths, store, sync, deps);
      const revalidateOwnership = (): void => {
        const lease = requireLease(store, context.leaseId, sync!.project_id);
        if (lease.kind !== "sync" || lease.workflow_id !== sync!.sync_id) {
          throw new Error(`Dispatch lease ${lease.lease_id} no longer belongs to sync ${sync!.sync_id}`);
        }
      };
      try {
        const knowledge = await completeSyncKnowledgeIngest({
          store,
          stateDir: paths.stateDir,
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId: text(body.commandId, text(body.command_id)) || `command-sync-ingest-${randomUUID()}`,
          processors: deps.processors?.({ body, paths, sync }) ?? defaultProcessors(deps, paths, body, sync),
          revalidateOwnership,
        });
        sync = knowledge.sync;
        if (sync.intake.knowledge_only || sync.status !== "ingesting") return sync;
        sync = await reconcileSync({
          context,
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId: `command-sync-reconcile-${randomUUID()}`,
        });
        if (sync.status !== "validating") return sync;
        return await validateSync(context, {
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId: `command-sync-validate-${randomUUID()}`,
          validate: deps.validate,
        });
      } catch (error) {
        let current = getSyncState(store, sync.sync_id) ?? sync;
        if (["ingesting", "reconciling", "validating", "validated"].includes(current.status)) {
          try {
            current = markSyncRecoveryRequired({
              context: syncLeaseContext(paths, store, current, deps),
              syncId: current.sync_id,
              expectedRevision: current.revision,
              commandId: `command-sync-recovery-required-${randomUUID()}`,
              reason: error instanceof Error ? error.message : String(error),
            });
          } catch (markError) {
            throw new Error(
              `Sync phase failed and recovery blocker could not be recorded: ${markError instanceof Error ? markError.message : String(markError)}`,
              { cause: error },
            );
          }
        }
        throw new SyncWorkflowBlockedError(current, error);
      }
    } finally {
      store.db.close();
    }
  }

  async function start(body: Record<string, unknown>): Promise<SyncStartDecision> {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    let store = openState(paths.stateDir);
    let sync = currentSync(store, projectId, text(body.syncId, text(body.sync_id)) || undefined);
    let action = projectSyncAction(store, projectId, "sync.start", sync?.sync_id, syncActionOptions(paths, deps));
    store.db.close();
    if (!action.enabled) throw new SyncActionBlockedError(action);
    if (!sync) sync = await observe(body);

    store = openState(paths.stateDir);
    let decision: SyncStartDecision;
    try {
      action = projectSyncAction(store, projectId, "sync.start", sync.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      decision = immediateTransaction(store.db, () => {
        initializeProjectState(store, { projectId, traceId: `trace-project-${projectId}` });
        const existingLease = getProjectState(store, projectId)?.active_workflow;
        if (existingLease?.kind === "sync" && existingLease.workflow_id === sync!.sync_id) {
          const activated = activateAcquiredSync({
            store,
            projectId,
            syncId: sync!.sync_id,
            leaseId: existingLease.lease_id,
            commandId: text(body.commandId, text(body.command_id)) || `command-sync-start-${randomUUID()}`,
          });
          return { queued: false, run_draining: false, lease_id: existingLease.lease_id, sync: activated };
        }
        const dispatch = requestDispatch(store, {
          actor: "operator",
          commandId: text(body.commandId, text(body.command_id)) || `command-sync-start-${randomUUID()}`,
          correlationId: sync!.sync_id,
          kind: "sync",
          projectId,
          reason: text(body.reason, "operator started sync"),
          workflowId: sync!.sync_id,
        });
        if (!dispatch.queued) {
          const activated = activateAcquiredSync({
            store,
            projectId,
            syncId: sync!.sync_id,
            leaseId: dispatch.leaseId,
            commandId: `command-sync-activated-${randomUUID()}`,
          });
          return { queued: false, run_draining: false, lease_id: dispatch.leaseId, sync: activated };
        }
        const holder = dispatch.blockedBy;
        if (holder.kind !== "run") {
          throw new Error(`Only an active run can hand off dispatch authority to sync; found ${holder.kind}:${holder.workflow_id}`);
        }
        if (holder.status === "active") {
          const run = getRun(store, holder.workflow_id);
          if (!run) throw new Error(`Run not found: ${holder.workflow_id}`);
          pauseRun({
            actor: "operator",
            commandId: `command-sync-handoff-${randomUUID()}`,
            correlationId: sync!.sync_id,
            reason: text(body.reason, "operator started sync"),
            runId: run.id,
            store,
            targetKind: "sync",
            targetWorkflowId: sync!.sync_id,
          });
        } else if (holder.status === "draining" && !holder.requested_handoff) {
          beginDrain(store, {
            actor: "operator",
            commandId: `command-sync-handoff-${randomUUID()}`,
            correlationId: sync!.sync_id,
            leaseId: holder.lease_id,
            projectId,
            reason: text(body.reason, "operator started sync"),
            targetKind: "sync",
            targetWorkflowId: sync!.sync_id,
          });
        } else if (
          holder.status !== "draining" ||
          holder.requested_handoff?.target_kind !== "sync" ||
          holder.requested_handoff.target_workflow_id !== sync!.sync_id
        ) {
          throw new Error(`Run ${holder.workflow_id} cannot hand off to sync while ${holder.status}`);
        }
        return { queued: true, run_draining: true, lease_id: null, sync: getSyncState(store, sync!.sync_id)! };
      });
    } finally {
      store.db.close();
    }
    if (!decision.queued) decision.sync = await advance(paths, body, decision.sync.sync_id);
    return decision;
  }

  async function resolveConflict(body: Record<string, unknown>): Promise<SyncState> {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, projectId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = projectSyncAction(store, projectId, "sync.resolve_conflict", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      let next = await resolveSyncConflict({
        context: syncLeaseContext(paths, store, sync!, deps),
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-resolve-${randomUUID()}`,
      });
      if (next.status === "validating") {
        next = await validateSync(syncLeaseContext(paths, store, next, deps), {
          syncId: next.sync_id,
          expectedRevision: next.revision,
          commandId: `command-sync-validate-${randomUUID()}`,
          validate: deps.validate,
        });
      }
      return next;
    } finally {
      store.db.close();
    }
  }

  async function publish(body: Record<string, unknown>): Promise<{ sync: SyncState; save_point: unknown | null }> {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, projectId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = projectSyncAction(store, projectId, "sync.publish", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const context = syncLeaseContext(paths, store, sync!, deps);
      const published = await publishSync({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-publish-${randomUUID()}`,
        confirmed: body.confirmed === true,
      });
      const savePoint = published.status === "published" && published.publication?.remote_application_id
        ? store.db.query(
            `SELECT id, commit_sha, payload_json FROM save_points
             WHERE trigger_kind = 'sync'
               AND json_extract(payload_json, '$.remote_application_id') = ?
             ORDER BY created_at DESC LIMIT 1`,
          ).get(published.publication.remote_application_id) ?? null
        : null;
      return { sync: published, save_point: savePoint };
    } finally {
      store.db.close();
    }
  }

  async function cancel(body: Record<string, unknown>): Promise<SyncState> {
    if (body.confirmed !== true) throw new Error("sync.cancel requires explicit confirmation");
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, projectId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = projectSyncAction(store, projectId, "sync.cancel", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const context = requestedSyncContext(paths, store, sync!, deps);
      const cancelled = await cancelSync({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-cancel-${randomUUID()}`,
      });
      return cancelled;
    } finally {
      store.db.close();
    }
  }

  async function recover(body: Record<string, unknown>): Promise<SyncState> {
    if (body.confirmed !== true) throw new Error("sync.recover requires explicit confirmation");
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    const store = openState(paths.stateDir);
    let recovered: SyncState;
    try {
      let sync = currentSync(store, projectId, text(body.syncId, text(body.sync_id)) || undefined);
      let action = projectSyncAction(store, projectId, "sync.recover", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const choice = body.choice === "discard"
        ? "discard"
        : body.choice === "resume"
          ? "resume"
          : null;
      if (!choice) throw new Error("sync.recover requires choice 'resume' or 'discard'");
      if (sync?.status === "publishing") {
        if (choice !== "resume") throw new Error("Publishing recovery requires choice 'resume'");
        sync = await reconcileInterruptedSyncPublication({
          context: syncLeaseContext(paths, store, sync, deps),
          syncId: sync.sync_id,
          commandId: `command-sync-publishing-reconcile-${randomUUID()}`,
        });
        if (sync.status === "published") return sync;
        action = projectSyncAction(store, projectId, "sync.recover", sync.sync_id, syncActionOptions(paths, deps));
        if (!action.enabled) throw new SyncActionBlockedError(action);
      }
      const commandId = text(body.commandId, text(body.command_id)) || `command-sync-recover-${randomUUID()}`;
      const recoveryReason = text(body.recoveryReason, text(body.recovery_reason, "operator recovered sync"));
      if (sync!.status === "ingesting") {
        if (choice !== "resume") throw new Error("Confirmed orphan ingest recovery requires choice 'resume'");
        recovered = recoverConfirmedOrphanSyncIngest({
          context: syncLeaseContext(paths, store, sync!, deps),
          syncId: sync!.sync_id,
          expectedRevision: sync!.revision,
          commandId,
          recoveryReason,
          hasActiveProcess: deps.hasActiveProcess,
          now: deps.now?.(),
        });
      } else {
        recovered = await recoverSync({
          context: syncLeaseContext(paths, store, sync!, deps),
          syncId: sync!.sync_id,
          expectedRevision: sync!.revision,
          commandId,
          choice,
          recoveryReason,
        });
      }
      if (recovered.status === "cancelled") {
        return recovered;
      }
    } finally {
      store.db.close();
    }
    if (recovered!.status === "ingesting") return advance(paths, body, recovered!.sync_id);
    if (recovered!.status === "reconciling") {
      const resumedStore = openState(paths.stateDir);
      try {
        recovered = await reconcileSync({
          context: syncLeaseContext(paths, resumedStore, recovered!, deps),
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId: `command-sync-reconcile-${randomUUID()}`,
        });
      } finally {
        resumedStore.db.close();
      }
    }
    if (recovered!.status === "validating") {
      const resumedStore = openState(paths.stateDir);
      try {
        recovered = await validateSync(syncLeaseContext(paths, resumedStore, recovered!, deps), {
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId: `command-sync-validate-${randomUUID()}`,
          validate: deps.validate,
        });
      } finally {
        resumedStore.db.close();
      }
    }
    if (recovered!.status === "publishing") {
      const resumedStore = openState(paths.stateDir);
      try {
        recovered = await continueSyncPublication({
          context: syncLeaseContext(paths, resumedStore, recovered!, deps),
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId: `command-sync-publish-retry-${randomUUID()}`,
        });
      } finally {
        resumedStore.db.close();
      }
    }
    return recovered!;
  }

  function action(body: Record<string, unknown>, actionId: SyncActionId): SyncActionProjection {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = requiredProjectId(paths, body);
    const store = openState(paths.stateDir);
    try {
      return projectSyncAction(
        store,
        projectId,
        actionId,
        text(body.syncId, text(body.sync_id)) || undefined,
        syncActionOptions(paths, deps),
      );
    } finally {
      store.db.close();
    }
  }

  async function reconcileStartup(body: Record<string, unknown> = {}): Promise<SyncState | null> {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const projectId = paths.project?.projectId ?? text(body.projectId, text(body.project_id));
    if (!projectId) return null;
    const store = openState(paths.stateDir);
    try {
      const sync = getNonTerminalSyncForProject(store, projectId);
      if (!sync || sync.status !== "publishing") return sync;
      return await reconcileInterruptedSyncPublication({
        context: syncLeaseContext(paths, store, sync, deps),
        syncId: sync.sync_id,
        commandId: `command-sync-startup-reconcile-${randomUUID()}`,
      });
    } finally {
      store.db.close();
    }
  }

  return {
    action,
    advance,
    cancel,
    observe,
    publish,
    reconcileStartup,
    recover,
    refreshObservation,
    resolveConflict,
    start,
  };
}
