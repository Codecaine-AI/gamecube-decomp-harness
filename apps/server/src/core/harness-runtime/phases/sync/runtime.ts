import { gameConfigurationRevision } from "@server/core/game-registry/config-revision.js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { immediateTransaction, openState, type StateStore } from "@server/core/orchestrator-state";
import {
  getDispatchState,
  initializeDispatchState,
  requestDispatch,
  type Blocker,
} from "@server/core/harness-state";
import type { JsonObject } from "@server/core/harness-state/events.js";
import { getRun } from "@server/core/harness-runtime/run-state";
import { fetchUpstreamAndFindMergedPrs } from "@server/core/harness-runtime/phases/sync/upstream.js";
import { getHarnessState, initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { runGameSourcePipeline } from "@server/core/knowledge-v2/ingest/game-sources.js";
import { extractEntities } from "@server/core/knowledge-v2/ingest/entities.js";
import { openKnowledgeStore } from "@server/core/knowledge-v2/storage/store.js";
import {
  runKnowledgeIntake,
} from "@server/core/knowledge-v2/ingest/harness-intake.js";
import { forceReportRun, reportRunOptionsForGame } from "@server/core/validation/report/index.js";
import type { ResolvedGame } from "@server/core/game-registry";
import type { SyncMergePolicy } from "@server/core/game-registry/runtime-options.js";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import { activateAcquiredSync } from "./activation.js";
import { createSyncTraceEmitter, type SubmitSyncWorkflowEvent } from "./trace.js";
import { refreshDiscordMirror } from "./discord.js";
import {
  cancelSync,
  getSyncBlockedOriginStatus,
  getNonTerminalSyncForGame,
  getSyncState,
  markSyncRecoveryRequired,
  publishSync,
  reconcileInterruptedSyncPublication,
  reconcileSync,
  recordSyncRequested,
  recoverSync,
  resolveSyncConflict,
  refreshSyncUpstreamObservation,
  syncActionSpanId,
  validateKnowledgeOnlySync,
  validateSync,
  continueSyncPublication,
  type SyncEngineContext,
  type SyncPublicationContext,
  type SyncStagingProgress,
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

export interface SyncRuntimeGameContext {
  graphDbPath: string;
  game: ResolvedGame | null;
  repoRoot: string;
  stateDir: string;
}

export interface SyncRuntimeDeps {
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  now?: () => Date | number | string;
  packageRoot: string;
  mergePolicy?: SyncMergePolicy;
  resolveDashboardGame: (
    input: Record<string, unknown>,
    options: { useDefaultGame?: boolean },
  ) => SyncRuntimeGameContext;
  runGit: (
    repoRoot: string,
    args: string[],
    options?: { check?: boolean; failureHint?: string },
  ) => Promise<CliResult>;
  stopManaged: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /**
   * Optional kernel workflow-trace writer. Absent in tests and CLI contexts,
   * where sync behaves exactly as it did before the trace existed.
   */
  submitWorkflowEvent?: SubmitSyncWorkflowEvent<SyncRuntimeGameContext>;
  sourceRoot: (sourceId: string) => string;
  refreshDiscordMirror?: typeof refreshDiscordMirror;
  forceReportRun?: typeof forceReportRun;
  runKnowledgeIntake?: typeof runKnowledgeIntake;
  runGameSourcePipeline?: typeof runGameSourcePipeline;
  extractEntities?: typeof extractEntities;
  withOperation?: <T>(name: string, label: string, stepNames: string[], fn: () => Promise<T>) => Promise<T>;
  validate?: (
    worktreePath: string,
    context: SyncEngineContext,
    staging: SyncStagingProgress,
  ) => Promise<SyncValidationResult>;
}

function syncMergePolicy(
  body: Record<string, unknown>,
  deps: SyncRuntimeDeps,
  sync?: SyncState | null,
): SyncMergePolicy {
  const value = body.mergePolicy ?? sync?.staging?.merge_policy ?? deps.mergePolicy ?? "score";
  if (value !== "score" && value !== "theirs") {
    throw new Error("mergePolicy must be one of: score, theirs");
  }
  return value;
}

export interface SyncStartDecision {
  queued: boolean;
  run_stopping: boolean;
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

function currentSync(store: StateStore, gameId: string, explicitSyncId?: string): SyncState | null {
  if (explicitSyncId) return getSyncState(store, explicitSyncId);
  return getNonTerminalSyncForGame(store, gameId);
}

function ownsSyncLease(store: StateStore, gameId: string, sync: SyncState | null): boolean {
  const lease = getDispatchState(store, gameId)?.active_workflow;
  return Boolean(sync && lease?.kind === "sync" && lease.workflow_id === sync.sync_id);
}

function hasValidationEvidence(store: StateStore, sync: SyncState): boolean {
  void store;
  return sync.validation_evidence !== null;
}

export function gameSyncAction(
  store: StateStore,
  gameId: string,
  actionId: SyncActionId,
  explicitSyncId?: string,
  options: {
    hasActiveProcess?: (stateDir: string) => { active: boolean };
    now?: Date | number | string;
    stateDir?: string;
  } = {},
): SyncActionProjection {
  const sync = currentSync(store, gameId, explicitSyncId);
  const subjectId = sync?.sync_id ?? explicitSyncId ?? `sync:new:${gameId}`;
  const state = getDispatchState(store, gameId);
  const lease = state?.active_workflow ?? null;
  const missingSync = sync
    ? []
    : [blocker("sync_not_found", "No non-terminal sync exists.", "game", gameId)];
  const ownLease = ownsSyncLease(store, gameId, sync);
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
    const blockers: Blocker[] = [];
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
      const activeRun = lease.kind === "run" && lease.status === "active" &&
        (!lease.requested_handoff || (
          sync && lease.requested_handoff.target_kind === "sync" &&
          lease.requested_handoff.target_workflow_id === sync.sync_id
        ));
      if (!sameSync && !activeRun) {
        blockers.push(blocker(
          "dispatch_lease_held",
          `${lease.kind} workflow ${lease.workflow_id} holds the dispatch lease and cannot hand off to this sync.`,
          lease.kind,
          lease.workflow_id,
        ));
      }
    }
    const afterStop = lease?.kind === "run";
    return actionResult(
      actionId,
      subjectId,
      blockers,
      afterStop ? "requested → ingesting after run stops" : "requested → ingesting",
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
  // A stale validated candidate with durable staging can be revalidated in
  // place through sync.recover (merge the new tip into staging, re-run the
  // incremental validation); only a stale candidate without staging still
  // forces a cancel.
  const staleBlockedRevalidatable = Boolean(
    sync?.status === "blocked" &&
    sync.blockers.some((entry) => entry.code === "upstream_moved_after_validation") &&
    sync.staging?.workspace_path,
  );
  const staleRecoveryRequiresNewSync = !staleBlockedRevalidatable && Boolean(
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

function requiredGameId(paths: SyncRuntimeGameContext, body: Record<string, unknown>): string {
  const gameId = paths.game?.gameId ?? text(body.gameId, text(body.game_id));
  if (!gameId) throw new Error("Sync action requires a game id");
  return gameId;
}

function durableHarnessWorktreePath(_paths: SyncRuntimeGameContext, store: StateStore, sync: SyncState): string {
  const harness = getHarnessState(store.db, sync.game_id);
  if (!harness) throw new Error(`Harness ${sync.game_id} is not initialized`);
  return harness.source.worktree;
}

function syncLeaseContext(
  paths: SyncRuntimeGameContext,
  store: StateStore,
  sync: SyncState,
  deps: SyncRuntimeDeps,
  mergePolicy?: SyncMergePolicy,
): SyncPublicationContext {
  const lease = getDispatchState(store, sync.game_id)?.active_workflow;
  if (!lease || lease.kind !== "sync" || lease.workflow_id !== sync.sync_id) {
    throw new Error(`Sync ${sync.sync_id} does not own the dispatch lease`);
  }
  const harnessWorktreePath = durableHarnessWorktreePath(paths, store, sync);
  const expectedConfiguration = getHarnessState(store.db, sync.game_id)?.source.configuration_revision;
  const verifyConfiguration = () => {
    if (!paths.game || !expectedConfiguration || gameConfigurationRevision(paths.game) !== expectedConfiguration) {
      throw new Error("Game configuration changed during Sync; restore the validated configuration to resume, or cancel before publication and start a new Sync. Publication already started must be recovered under its original configuration.");
    }
  };
  return {
    store,
    stateDir: paths.stateDir,
    repoRoot: paths.repoRoot,
    harnessWorktreePath,
    verifyConfiguration,
    game: paths.game ? {
      baseRef: paths.game.baseRef,
      reportPath: paths.game.validation?.reportPath,
      reportChangesPath: paths.game.validation?.reportChangesPath,
      qaTarget: paths.game.validation?.qaTarget,
    } : null,
    leaseId: lease.lease_id,
    runGit: deps.runGit,
    mergePolicy: mergePolicy ?? sync.staging?.merge_policy ?? deps.mergePolicy ?? "score",
    runKnowledgeIntake: async ({ checkoutRoot, expectedHead, prNumbers }) => {
      const configuredReportPath = paths.game?.validation?.reportPath ?? "build/GALE01/report.json";
      const reportPath = isAbsolute(configuredReportPath)
        ? configuredReportPath
        : resolve(checkoutRoot, configuredReportPath);
      {
        const baselinePath = resolve(dirname(reportPath), "baseline.json");
        await (deps.forceReportRun ?? forceReportRun)(checkoutRoot, {
          ...reportRunOptionsForGame(paths.game),
          resetBaseline: !existsSync(baselinePath),
          generateChanges: false,
        });
      }
      if (!existsSync(reportPath)) {
        throw new Error(`V2 knowledge intake report was not produced at ${reportPath} for ${expectedHead}`);
      }
      const result = await (deps.runKnowledgeIntake ?? runKnowledgeIntake)({
        knowledgeRoot: resolve(paths.game?.gameDir ?? resolve(deps.packageRoot, "games", sync.game_id), "knowledge"),
        checkoutRoot,
        reportPath,
        expectedHead,
        prNumbers,
        orchestratorDbPath: resolve(paths.stateDir, "orchestrator.sqlite"),
        sourceRoot: paths.game ? resolve(paths.game.gameDir, "knowledge/sources/code_context/past_prs") : deps.sourceRoot("past_prs"),
        fetch: { enabled: false },
        lanes: ["reconcile", "attempts"],
        dryRun: false,
        log: (message) => uiLog("stdout", `[sync ${sync.sync_id}] ${message}`),
      });
      {
        const gameRoot = paths.game?.gameDir ?? resolve(deps.packageRoot, "games", sync.game_id);
        const knowledgeRoot = resolve(gameRoot, "knowledge");
        const knowledge = openKnowledgeStore({ knowledgeRoot });
        try { (deps.extractEntities ?? extractEntities)(knowledge, { checkoutRoot, reportPath, dryRun: false }); }
        finally { knowledge.close(); }
        const harness = getHarnessState(store.db, sync.game_id)!;
        const sources = await (deps.runGameSourcePipeline ?? runGameSourcePipeline)({
          gameId: sync.game_id, gameRoot, knowledgeRoot, stateRoot: paths.stateDir,
          operationId: sync.sync_id, mode: harness.source.upstream_revision ? "sync" : "bootstrap",
        });
        if (!sources.ready) throw new Error(`Required source intake is blocked: ${JSON.stringify(sources.sources)}`);
        const verifiedHead = (await deps.runGit(checkoutRoot, ["rev-parse", "HEAD"], { check: true })).stdout.trim();
        if (!verifiedHead.startsWith(expectedHead)) throw new Error("Checkout moved during source intake");
        return { ...result, source_pipeline: sources, mechanical_entities: "complete", report_verified: verifiedHead } as unknown as JsonObject;
      }
    },
  };
}

function requestedSyncContext(
  paths: SyncRuntimeGameContext,
  store: StateStore,
  sync: SyncState,
  deps: SyncRuntimeDeps,
): SyncEngineContext {
  if (sync.status !== "requested") return syncLeaseContext(paths, store, sync, deps);
  return {
    store,
    stateDir: paths.stateDir,
    repoRoot: paths.repoRoot,
    harnessWorktreePath: durableHarnessWorktreePath(paths, store, sync),
    game: paths.game ? {
      baseRef: paths.game.baseRef,
      reportPath: paths.game.validation?.reportPath,
      reportChangesPath: paths.game.validation?.reportChangesPath,
      qaTarget: paths.game.validation?.qaTarget,
    } : null,
    leaseId: "requested-sync-has-no-lease",
    runGit: deps.runGit,
    mergePolicy: deps.mergePolicy ?? "score",
  };
}

function syncActionOptions(paths: SyncRuntimeGameContext, deps: SyncRuntimeDeps) {
  return {
    hasActiveProcess: deps.hasActiveProcess,
    now: deps.now?.(),
    stateDir: paths.stateDir,
  };
}

export function createSyncRuntime(deps: SyncRuntimeDeps) {
  const emitSyncMilestone = createSyncTraceEmitter<SyncRuntimeGameContext>({
    submitWorkflowEvent: deps.submitWorkflowEvent,
  });

  /** Files whichever terminal-ish milestone the sync actually landed on. */
  async function emitSettledMilestone(
    paths: SyncRuntimeGameContext,
    sync: SyncState,
    detail?: string,
  ): Promise<void> {
    if (sync.status === "published") {
      const store = openState(paths.stateDir);
      try {
        const harness = getHarnessState(store.db, sync.game_id);
        const eventId = `harness-sync-complete:${sync.sync_id}`;
        const recorded = store.db.query("SELECT 1 FROM harness_timeline_entries WHERE event_id = ?").get(eventId);
        if (harness && !recorded && harness.source.head === sync.publication?.new_head && harness.execution.workflow !== "run") {
          if (!paths.game || gameConfigurationRevision(paths.game) !== harness.source.configuration_revision) {
            throw new Error("Game configuration changed before Sync evidence acceptance; restore its validated configuration before recovery");
          }
          const evidence = sync.publication?.knowledge_intake;
          const verified = evidence?.report_verified === sync.publication?.new_head && evidence?.mechanical_entities === "complete";
          const sourcesReady = (evidence?.source_pipeline as JsonObject | undefined)?.ready === true;
          const readiness = { ...harness.readiness, build: verified ? "ready" as const : "blocked" as const, evidence: verified ? "ready" as const : "blocked" as const, sources: sourcesReady ? "ready" as const : "blocked" as const };
          const blockers = Object.entries(readiness).filter(([,status]) => status !== "ready").map(([gate,status]) => blocker(`harness_${gate}_${status}`, `Harness ${gate} readiness is ${status}`, "game", sync.game_id));
          transitionHarnessState(store.db, { gameId: sync.game_id, expectedRevision: harness.identity.revision,
            commandId: eventId, patch: { readiness, history: { sync_id: sync.sync_id }, execution: { workflow: "none", status: blockers.length ? "blocked" : harness.execution.desired === "paused" ? "paused" : "idle", blockers } },
            boundary: { eventId, kind: "sync_completed", outcome: blockers.length ? "published_awaiting_readiness" : "published", syncId: sync.sync_id, evidence: evidence ?? {} },
          });
        }
      } finally { store.db.close(); }
    }
    if (sync.status === "blocked") {
      await emitSyncMilestone(paths, sync, "blocked", {
        detail: detail ?? (sync.blockers.map((entry) => entry.message).join("; ") || null),
        metadata: { blockerCodes: sync.blockers.map((entry) => entry.code) },
      });
    }
  }

  async function ensureHarness(paths: SyncRuntimeGameContext, store: StateStore, gameId: string) {
    const existing = getHarnessState(store.db, gameId);
    if (existing?.source.head) {
      if (!paths.game) throw new Error("Sync requires resolved game configuration");
      const revision = gameConfigurationRevision(paths.game);
      if (existing.source.configuration_revision === revision) return existing;
      const lease = getDispatchState(store, gameId)?.active_workflow;
      if (lease) throw new Error("Settle active work before accepting changed game configuration");
      return transitionHarnessState(store.db, { gameId, expectedRevision: existing.identity.revision,
        commandId: `harness-config:${existing.identity.revision}:${revision}`,
        patch: { source: { configuration_revision: revision }, execution: { workflow: "none", status: "initializing" } } });
    }
    if (!paths.game) throw new Error(`Game ${gameId} needs a resolved descriptor before initial Sync`);
    const worktree = existing?.source.worktree ?? paths.game.repoRoot ?? paths.repoRoot;
    const result = await deps.runGit(worktree, ["rev-parse", "HEAD"], { check: true });
    const head = result.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(head)) throw new Error(`Harness checkout has no verified Git HEAD: ${worktree}`);
    const configurationRevision = gameConfigurationRevision(paths.game);
    const harness = existing ?? initializeHarnessState(store.db, {
      gameId, worktree, configurationRevision, commandId: `harness-initialize:${gameId}`,
    });
    initializeDispatchState(store, { gameId, traceId: `trace-game-${gameId}` });
    return transitionHarnessState(store.db, {
      gameId, expectedRevision: harness.identity.revision, commandId: `harness-initial-head:${head}`,
      patch: { source: { head }, execution: { workflow: "sync", status: "initializing" } },
    });
  }

  async function observe(body: Record<string, unknown>): Promise<SyncState> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const existing = getNonTerminalSyncForGame(store, gameId);
      const commandId = text(body.commandId, text(body.command_id)) || `command-sync-observe-${randomUUID()}`;
      const actionSpanId = syncActionSpanId(commandId);
      if (existing?.status === "validated") {
        return (await refreshSyncUpstreamObservation({
          context: syncLeaseContext(paths, store, existing, deps),
          syncId: existing.sync_id,
          expectedRevision: existing.revision,
          commandId,
        })).sync;
      }
      if (existing && existing.status !== "requested") return existing;
      const harness = await ensureHarness(paths, store, gameId);
      const anchor = store.db
        .query("SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = ?")
        .get(gameId) as { upstream_revision: string } | null;
      const upstreamFrom = anchor?.upstream_revision ?? harness.source.upstream_revision ?? harness.source.head;
      if (!upstreamFrom) throw new Error(`Harness ${gameId} has no upstream anchor`);
      const discovery = await fetchUpstreamAndFindMergedPrs(
        { runGit: deps.runGit },
        { game: paths.game, repoRoot: paths.repoRoot },
        undefined,
        { upstreamFrom },
      );
      const syncId = text(body.syncId, text(body.sync_id)) || existing?.sync_id || `sync-${randomUUID()}`;
      const observationSourceIdentity = discovery.baseRef;
      if (!observationSourceIdentity?.trim()) throw new Error("Upstream discovery returned no baseRef identity");
      const actor = body.actor === "external_observer" ? "external_observer" : "operator";
      const bodyCorpusBatchIds = strings(body.corpusBatchIds ?? body.corpus_batch_ids);
      let sync = recordSyncRequested(store, {
        gameId,
        syncId,
        actor,
        commandId,
        correlationId: syncId,
        spanId: actionSpanId,
        observationSourceIdentity,
        intake: {
          upstream_from: upstreamFrom,
          upstream_to: discovery.afterRef,
          merged_pr_ids: discovery.mergedPrs.map(String),
          corpus_batch_ids: bodyCorpusBatchIds,
          knowledge_only: upstreamFrom === discovery.afterRef,
        },
      });
      // Harness sources are acquired/imported through the per-game
      // pipeline at publication. Historical Sync retains its old source identity.
      const corpusBatchIds = [...new Set(bodyCorpusBatchIds)]
        .sort((left, right) => left.localeCompare(right));
      sync = recordSyncRequested(store, {
        gameId,
        syncId,
        actor,
        commandId,
        correlationId: syncId,
        spanId: actionSpanId,
        observationSourceIdentity,
        intake: {
          upstream_from: upstreamFrom,
          upstream_to: discovery.afterRef,
          merged_pr_ids: discovery.mergedPrs.map(String),
          corpus_batch_ids: corpusBatchIds,
          knowledge_only: upstreamFrom === discovery.afterRef,
        },
      });
      return sync;
    } finally {
      store.db.close();
    }
  }

  /** Production observation-path hook used by the dashboard refresh loop. */
  async function refreshObservation(body: Record<string, unknown>): Promise<SyncState | null> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = getNonTerminalSyncForGame(store, gameId);
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
    paths: SyncRuntimeGameContext,
    body: Record<string, unknown>,
    syncId: string,
  ): Promise<SyncState> {
    const store = openState(paths.stateDir);
    const commandId = text(body.commandId, text(body.command_id)) || `command-sync-advance-${randomUUID()}`;
    try {
      let sync = getSyncState(store, syncId);
      if (!sync) throw new Error(`Sync not found: ${syncId}`);
      if (sync.status !== "ingesting") return sync;
      await emitSyncMilestone(paths, sync, "ingest", {
        detail: `staging ${String(sync.intake.merged_pr_ids.length)} merged PR(s) and ${String(sync.intake.corpus_batch_ids.length)} corpus batch(es)`,
        metadata: {
          mergedPrIds: sync.intake.merged_pr_ids,
          corpusBatchIds: sync.intake.corpus_batch_ids,
          knowledgeOnly: sync.intake.knowledge_only,
        },
      });
      const context = syncLeaseContext(paths, store, sync, deps, syncMergePolicy(body, deps, sync));
      context.actor = body.actor === "operator" ? "operator" : "runner";
      try {
        if (sync.intake.knowledge_only) {
          sync = validateKnowledgeOnlySync({
            context,
            syncId: sync.sync_id,
            expectedRevision: sync.revision,
            commandId,
          });
          await emitSyncMilestone(paths, sync, "validated");
          await emitSettledMilestone(paths, sync);
          return sync;
        }
        sync = await reconcileSync({
          context,
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId,
        });
        await emitSyncMilestone(paths, sync, "reconciling");
        if (sync.status !== "validating") {
          await emitSettledMilestone(paths, sync);
          return sync;
        }
        const validated = await validateSync(context, {
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId,
          validate: deps.validate,
        });
        if (validated.status === "validated") await emitSyncMilestone(paths, validated, "validated");
        await emitSettledMilestone(paths, validated);
        return validated;
      } catch (error) {
        let current = getSyncState(store, sync.sync_id) ?? sync;
        if (["ingesting", "reconciling", "validating", "validated"].includes(current.status)) {
          try {
            const recoveryContext = syncLeaseContext(paths, store, current, deps);
            recoveryContext.actor = context.actor;
            current = markSyncRecoveryRequired({
              context: recoveryContext,
              syncId: current.sync_id,
              expectedRevision: current.revision,
              commandId,
              reason: error instanceof Error ? error.message : String(error),
            });
          } catch (markError) {
            throw new Error(
              `Sync phase failed and recovery blocker could not be recorded: ${markError instanceof Error ? markError.message : String(markError)}`,
              { cause: error },
            );
          }
        }
        await emitSettledMilestone(
          paths,
          current,
          error instanceof Error ? error.message : String(error),
        );
        throw new SyncWorkflowBlockedError(current, error);
      }
    } finally {
      store.db.close();
    }
  }

  async function start(body: Record<string, unknown>): Promise<SyncStartDecision> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const commandId = text(body.commandId, text(body.command_id)) || `command-sync-start-${randomUUID()}`;
    const actionSpanId = syncActionSpanId(commandId);
    const actionBody = {
      ...body,
      actor: "operator",
      commandId,
      mergePolicy: syncMergePolicy(body, deps),
    };
    let store = openState(paths.stateDir);
    try { if (!currentSync(store, gameId)) await ensureHarness(paths, store, gameId); }
    catch (error) { store.db.close(); throw error; }
    let sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
    let action = gameSyncAction(store, gameId, "sync.start", sync?.sync_id, syncActionOptions(paths, deps));
    store.db.close();
    if (!action.enabled) throw new SyncActionBlockedError(action);
    if (!sync) {
      sync = deps.withOperation
        ? await deps.withOperation("sync-pull", "Pulling things down", ["Discovering intake"], () => observe(actionBody))
        : await observe(actionBody);
    }

    store = openState(paths.stateDir);
    let decision: SyncStartDecision;
    let stopRunId: string | null = null;
    try {
      action = gameSyncAction(store, gameId, "sync.start", sync.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      decision = immediateTransaction(store.db, () => {
        initializeDispatchState(store, { gameId, traceId: `trace-game-${gameId}` });
        const dispatchState = getDispatchState(store, gameId);
        const existingLease = dispatchState?.active_workflow;
        if (existingLease?.kind === "sync" && existingLease.workflow_id === sync!.sync_id) {
          const activated = activateAcquiredSync({
            actor: "operator",
            store,
            gameId,
            syncId: sync!.sync_id,
            leaseId: existingLease.lease_id,
            commandId,
            correlationId: sync!.sync_id,
            causationId: dispatchState?.caused_by_event_id ?? commandId,
            spanId: actionSpanId,
          });
          return { queued: false, run_stopping: false, lease_id: existingLease.lease_id, sync: activated };
        }
        const dispatch = requestDispatch(store, {
          actor: "operator",
          commandId,
          correlationId: sync!.sync_id,
          kind: "sync",
          gameId,
          reason: text(body.reason, "operator started sync"),
          workflowId: sync!.sync_id,
          spanId: actionSpanId,
          handoffOnQueue: true,
        });
        if (!dispatch.queued) {
          const activated = activateAcquiredSync({
            actor: "operator",
            store,
            gameId,
            syncId: sync!.sync_id,
            leaseId: dispatch.leaseId,
            commandId,
            correlationId: sync!.sync_id,
            causationId: dispatch.acquiredEventId,
            spanId: actionSpanId,
          });
          return { queued: false, run_stopping: false, lease_id: dispatch.leaseId, sync: activated };
        }
        const holder = dispatch.blockedBy;
        if (holder.kind !== "run") {
          throw new Error(`Only an active run can hand off dispatch authority to sync; found ${holder.kind}:${holder.workflow_id}`);
        }
        if (holder.status !== "active") {
          throw new Error(`Run ${holder.workflow_id} cannot hand off to sync while ${holder.status}`);
        }
        if (!getRun(store, holder.workflow_id)) throw new Error(`Run not found: ${holder.workflow_id}`);
        stopRunId = holder.workflow_id;
        return { queued: true, run_stopping: true, lease_id: null, sync: getSyncState(store, sync!.sync_id)! };
      });
    } finally {
      store.db.close();
    }
    if (!decision.queued) {
      await emitSyncMilestone(paths, decision.sync, "activation", {
        detail: `operator started sync ${decision.sync.sync_id}`,
        metadata: { leaseId: decision.lease_id },
      });
    }
    if (stopRunId) {
      await deps.stopManaged({
        ...body,
        commandId,
        reason: text(body.reason, "operator started sync"),
        recoverClaims: false,
        runId: stopRunId,
      });
    }
    if (!decision.queued) decision.sync = await advance(paths, actionBody, decision.sync.sync_id);
    return decision;
  }

  async function resolveConflict(body: Record<string, unknown>): Promise<SyncState> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = gameSyncAction(store, gameId, "sync.resolve_conflict", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const commandId = text(body.commandId, text(body.command_id)) || `command-sync-resolve-${randomUUID()}`;
      const context = syncLeaseContext(paths, store, sync!, deps);
      context.actor = "operator";
      let next = await resolveSyncConflict({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId,
      });
      await emitSyncMilestone(paths, next, "reconciling", { detail: "operator resolved staged conflicts" });
      if (next.status === "validating") {
        context.actor = "operator";
        next = await validateSync(context, {
          syncId: next.sync_id,
          expectedRevision: next.revision,
          commandId,
          validate: deps.validate,
        });
        if (next.status === "validated") await emitSyncMilestone(paths, next, "validated");
      }
      await emitSettledMilestone(paths, next);
      return next;
    } finally {
      store.db.close();
    }
  }

  async function publish(body: Record<string, unknown>): Promise<{ sync: SyncState; save_point: unknown | null }> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = gameSyncAction(store, gameId, "sync.publish", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const context = syncLeaseContext(paths, store, sync!, deps);
      const published = await publishSync({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-publish-${randomUUID()}`,
        confirmed: body.confirmed === true,
      });
      // publishSync crosses validated -> publishing -> published inside one
      // call, so both milestones are read back from the durable events it
      // appended rather than from an intermediate return value. A sync still
      // resting at validated never entered publishing, and must not borrow an
      // earlier attempt's event.
      if (published.status !== "validated") {
        await emitSyncMilestone(paths, published, "publishing", {
          detail: "operator confirmed publication",
        });
      }
      if (published.status === "published") {
        await emitSyncMilestone(paths, published, "published", {
          detail: published.publication?.new_head ?? null,
          metadata: {
            priorHead: published.publication?.prior_head ?? null,
            newHead: published.publication?.new_head ?? null,
            knowledgeIntake: published.publication?.knowledge_intake ?? null,
          },
        });
      }
      await emitSettledMilestone(paths, published);
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
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = gameSyncAction(store, gameId, "sync.cancel", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const context = requestedSyncContext(paths, store, sync!, deps);
      const cancelled = await cancelSync({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-cancel-${randomUUID()}`,
      });
      await emitSyncMilestone(paths, cancelled, "cancelled", {
        detail: text(body.reason, "operator cancelled sync"),
      });
      return cancelled;
    } finally {
      store.db.close();
    }
  }

  async function recover(body: Record<string, unknown>): Promise<SyncState> {
    if (body.confirmed !== true) throw new Error("sync.recover requires explicit confirmation");
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    let recovered: SyncState;
    const commandId = text(body.commandId, text(body.command_id)) || `command-sync-recover-${randomUUID()}`;
    try {
      let sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      let action = gameSyncAction(store, gameId, "sync.recover", sync?.sync_id, syncActionOptions(paths, deps));
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
          commandId,
          actor: "operator",
        });
        if (sync.status === "published") {
          await emitSyncMilestone(paths, sync, "published", {
            detail: "interrupted publication reconciled forward",
          });
          await emitSettledMilestone(paths, sync);
          return sync;
        }
        action = gameSyncAction(store, gameId, "sync.recover", sync.sync_id, syncActionOptions(paths, deps));
        if (!action.enabled) throw new SyncActionBlockedError(action);
      }
      const recoveryReason = text(body.recoveryReason, text(body.recovery_reason, "operator recovered sync"));
      recovered = await recoverSync({
        context: syncLeaseContext(paths, store, sync!, deps),
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId,
        choice,
        recoveryReason,
      });
      await emitSyncMilestone(paths, recovered, "recovered", {
        detail: recoveryReason,
        metadata: { choice, resumeStatus: recovered.status },
      });
      if (recovered.status === "cancelled") {
        await emitSyncMilestone(paths, recovered, "cancelled", { detail: recoveryReason });
        return recovered;
      }
    } finally {
      store.db.close();
    }
    if (recovered!.status === "ingesting") return advance(paths, { ...body, actor: "operator", commandId }, recovered!.sync_id);
    if (recovered!.status === "reconciling") {
      const resumedStore = openState(paths.stateDir);
      try {
        const context = syncLeaseContext(paths, resumedStore, recovered!, deps);
        context.actor = "operator";
        recovered = await reconcileSync({
          context,
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId,
        });
      } finally {
        resumedStore.db.close();
      }
      await emitSyncMilestone(paths, recovered!, "reconciling", { detail: "resumed after recovery" });
    }
    if (recovered!.status === "validating") {
      const resumedStore = openState(paths.stateDir);
      try {
        const context = syncLeaseContext(paths, resumedStore, recovered!, deps);
        context.actor = "operator";
        recovered = await validateSync(context, {
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId,
          validate: deps.validate,
        });
      } finally {
        resumedStore.db.close();
      }
      if (recovered!.status === "validated") await emitSyncMilestone(paths, recovered!, "validated");
    }
    if (recovered!.status === "publishing") {
      const resumedStore = openState(paths.stateDir);
      try {
        recovered = await continueSyncPublication({
          context: syncLeaseContext(paths, resumedStore, recovered!, deps),
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId,
          actor: "operator",
        });
      } finally {
        resumedStore.db.close();
      }
      await emitSyncMilestone(paths, recovered!, "publishing", { detail: "resumed after recovery" });
      if (recovered!.status === "published") {
        await emitSyncMilestone(paths, recovered!, "published", {
          detail: recovered!.publication?.new_head ?? null,
        });
      }
    }
    await emitSettledMilestone(paths, recovered!);
    return recovered!;
  }

  function action(body: Record<string, unknown>, actionId: SyncActionId): SyncActionProjection {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      return gameSyncAction(
        store,
        gameId,
        actionId,
        text(body.syncId, text(body.sync_id)) || undefined,
        syncActionOptions(paths, deps),
      );
    } finally {
      store.db.close();
    }
  }

  async function reconcileStartup(body: Record<string, unknown> = {}): Promise<SyncState | null> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = paths.game?.gameId ?? text(body.gameId, text(body.game_id));
    if (!gameId) return null;
    const store = openState(paths.stateDir);
    try {
      const sync = getNonTerminalSyncForGame(store, gameId);
      if (!sync) {
        const latest = store.db.query("SELECT sync_id FROM sync_state WHERE game_id = ? AND status = 'published' ORDER BY updated_at DESC LIMIT 1").get(gameId) as { sync_id: string } | null;
        if (latest) {
          const published = getSyncState(store, latest.sync_id)!;
          await emitSettledMilestone(paths, published);
          return published;
        }
        return null;
      }
      if (sync.status !== "publishing") return sync;
      const reconciled = await reconcileInterruptedSyncPublication({
        context: syncLeaseContext(paths, store, sync, deps),
        syncId: sync.sync_id,
        commandId: `command-sync-startup-reconcile-${randomUUID()}`,
      });
      if (reconciled.status === "published") {
        await emitSyncMilestone(paths, reconciled, "published", {
          detail: "interrupted publication reconciled at startup",
        });
      }
      await emitSettledMilestone(paths, reconciled);
      return reconciled;
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
