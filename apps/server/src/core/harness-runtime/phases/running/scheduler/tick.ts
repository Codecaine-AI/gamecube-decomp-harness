import { getHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { getDispatchState } from "@server/core/harness-state/lease.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  loadKnowledgeBoardSnapshot,
  resourceGraphDbPath,
} from "@server/core/knowledge";
import { openKnowledgeGraph, readReportProvenance } from "@server/core/knowledge/graph";
import { loadExactTargetKeys, loadStackOnlyTargetKeys } from "@server/core/harness-runtime/phases/running/board/snapshot.js";
import { stackOnlyIndexForGame } from "@server/core/harness-runtime/run-state/stack-only-functions.js";
import {
  activeWorkerCount,
  activeSchedulerEpoch,
  admitEpochTargets,
  refreshEpochTargetAvailability,
  reconcileEpochTargetJobs,
  schedulerEpochProgress,
  setRunSchedulerCondition,
  startSchedulerEpoch,
  getLatestRun,
  getRun,
  markEventHandled,
  nextUnhandledEvent,
  openState,
  targetPressureSnapshot,
  type EpochAdmissionResult,
  type EpochProgressSummary,
  type EpochAvailabilityRefreshResult,
  type SchedulerEpochConfig,
  type SchedulerEpochRecord,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { assertSchedulableRun } from "@server/core/harness-runtime/phases/running/jobs/shared.js";
import { selectEpochAdmissionCandidates } from "@server/core/harness-runtime/run-state/epochs.js";
import type { BlockedCandidate, BoardReadinessSummary } from "@server/core/shared/types/index.js";
import { gameOrdering, orderingActive } from "@server/core/tools/ordering.js";
import {
  boardReadinessOptions,
  prepareEpochReadiness,
  readinessRevision,
  recordReadinessArtifact,
  recordReadinessParked,
  type EpochReadiness,
  type ReadinessRunner,
} from "./readiness.js";

export interface SchedulerTickResult {
  runId: string;
  status?: "no_unhandled_events" | "readiness_blocked_only";
  /** Blocked-only parking: every remaining candidate is blocked by class readiness; no epoch was created. */
  readinessBlocked?: number;
  handledEvent?: unknown;
  eventType?: string;
  eventProducer?: string;
  eventCreatedAt?: string;
  schedulerTargetUpdates?: number;
  schedulerEpoch?: EpochProgressSummary;
  epochAdmission?: EpochAdmissionResult;
  epochAvailabilityRefresh?: EpochAvailabilityRefreshResult;
  targetPressure?: {
    activeWorkers: number;
    admittedTargets: number;
    schedulableTargets: number;
    unhandledEvents: number;
  };
  dryRun?: boolean;
}

export interface SchedulerEpochEnsureResult {
  epoch: SchedulerEpochRecord;
  admission?: EpochAdmissionResult;
  availabilityRefresh: EpochAvailabilityRefreshResult;
  progress: EpochProgressSummary;
}

/**
 * Admission found only readiness-blocked candidates. Returned BEFORE
 * `startSchedulerEpoch`: no epoch exists, so no settlement may run. Callers
 * park and retry admission when readiness can change (integration, resume).
 */
export interface ReadinessBlockedOnlyResult {
  kind: "readiness_blocked_only";
  blocked: BlockedCandidate[];
  readiness: BoardReadinessSummary | null;
}

export type SchedulerEpochEnsureOutcome = SchedulerEpochEnsureResult | ReadinessBlockedOnlyResult;

export function isReadinessBlockedOnly(result: SchedulerEpochEnsureOutcome | null | undefined): result is ReadinessBlockedOnlyResult {
  return Boolean(result) && (result as ReadinessBlockedOnlyResult).kind === "readiness_blocked_only";
}

/** Whether the next ensure call can admit (no active epoch, or one with nothing admitted) and so needs readiness. */
export function schedulerAdmissionPending(store: StateStore, runId: string): boolean {
  const epoch = activeSchedulerEpoch(store, runId);
  return !epoch || schedulerEpochProgress(store, epoch.id).admitted === 0;
}

/**
 * Loads readiness for the next admission when it can happen (async, before
 * the admission transaction). Undefined for games without active ordering
 * or when an epoch already has admitted targets.
 */
export async function readinessForAdmission(params: {
  globals: GlobalArgs;
  store: StateStore;
  runId: string;
  rev?: string | null;
  currentRev?: () => string | null | undefined;
  runner?: ReadinessRunner;
}): Promise<EpochReadiness | undefined> {
  if (!orderingActive(gameOrdering(params.globals.game)?.mode)) return undefined;
  if (!schedulerAdmissionPending(params.store, params.runId)) return undefined;
  return prepareEpochReadiness({
    globals: params.globals,
    rev: params.rev === undefined ? readinessRevision(params.globals.repoRoot) : params.rev,
    currentRev: params.currentRev,
    runner: params.runner,
  });
}

/**
 * Writes the run's revision-bound readiness artifact without admitting (a
 * paused boundary after Sync), so the dashboard and settlement read readiness
 * at the accepted head rather than the previous admission's.
 */
export function refreshReadinessArtifact(params: {
  globals: GlobalArgs;
  graphDbPath: string;
  runId: string;
  store: StateStore;
  readiness: EpochReadiness;
}): boolean {
  const gameId = params.globals.game?.gameId ?? params.globals.gameId;
  const stackOnly = stackOnlyIndexForGame(params.store, { gameId, stackFramePolicy: params.globals.game?.matching?.stackFramePolicy });
  const readiness = boardReadinessOptions(params.readiness);
  const board = loadKnowledgeBoardSnapshot(params.globals.repoRoot, {
    graphDbPath: params.graphDbPath,
    validation: params.globals.game?.validation,
    ...(stackOnly ? { stackOnly } : {}),
    ...(readiness ? { readiness } : {}),
  });
  return recordReadinessArtifact(params.store, { runId: params.runId, gameId, board });
}

export function reconcileOrphanedEpochTargets(
  store: StateStore,
  epoch: Pick<SchedulerEpochRecord, "id">,
  progress: Pick<EpochProgressSummary, "ordinal">,
): { added: number; removed: number } {
  const result = reconcileEpochTargetJobs(store, { epochId: epoch.id });
  if (result.added > 0 || result.removed > 0) {
    console.error(
      `[run-loop] epoch ${progress.ordinal}: job coverage reconciled (+${result.added} / -${result.removed})`,
    );
  }
  return { added: result.added, removed: result.removed };
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function schedulerEpochConfigFromArgs(
  globals: GlobalArgs,
  _args: Map<string, string | true>,
  params: { workerPoolSize: number },
): SchedulerEpochConfig {
  const workerPoolSize = Math.max(1, nonNegativeInt(params.workerPoolSize));
  const validation = globals.game?.validation;
  const configuredCap = _args.has("--epoch-target-cap")
    ? Number(_args.get("--epoch-target-cap"))
    : undefined;
  return {
    workerPoolSize,
    freshReportGate: validation?.epochAdmissionFreshReportGate ?? true,
    // epochTargetCap limits admission to the first N board candidates; unset admits all.
    epochTargetCap: configuredCap !== undefined && Number.isFinite(configuredCap)
      ? Math.max(0, Math.floor(configuredCap))
      : null,
  };
}

function assertFreshBoardReport(params: Pick<EnsureSchedulerEpochParams, "globals" | "graphDbPath">): void {
  const configuredPath = params.globals.game?.validation.reportPath ?? "build/GALE01/report.json";
  const reportPath = isAbsolute(configuredPath) ? configuredPath : resolve(params.globals.repoRoot, configuredPath);
  if (!existsSync(reportPath)) {
    throw new Error(`Epoch admission refused: objdiff report is missing: ${reportPath}`);
  }
  const graph = openKnowledgeGraph(params.graphDbPath);
  try {
    const provenance = readReportProvenance(graph);
    if (!provenance) {
      throw new Error(`Epoch admission refused: knowledge board has no objdiff report provenance; rebuild the knowledge graph from ${reportPath}`);
    }
    const provenancePathDiffers = resolve(provenance.path) !== resolve(reportPath);
    const reportSha256 = createHash("sha256").update(readFileSync(reportPath)).digest("hex");
    if (reportSha256 !== provenance.sha256) {
      const reportMtimeMs = statSync(reportPath).mtimeMs;
      throw new Error(
        `Epoch admission refused: objdiff report does not match knowledge board provenance ` +
          (provenancePathDiffers ? `(knowledge board was built from ${provenance.path}, expected ${reportPath}; ` : "(") +
          `report sha256 ${reportSha256}, board sha256 ${provenance.sha256}, ` +
          `report mtime ${reportMtimeMs}, board source mtime ${provenance.mtimeMs}); rebuild the knowledge graph`,
      );
    }
    if (provenancePathDiffers) {
      console.info(`knowledge board provenance path differs (built from ${provenance.path}); content sha matches`);
    }
  } finally {
    graph.db.close();
  }
}

export interface EnsureSchedulerEpochParams {
  /** Prepare membership without changing paused intent or acquiring worker authority. */
  prepareOnly?: boolean;
  config: SchedulerEpochConfig;
  globals: GlobalArgs;
  graphDbPath: string;
  runId: string;
  store: StateStore;
  /** The epoch's class readiness, loaded beforehand (`readinessForAdmission`); absent leaves admission unchanged. */
  readiness?: EpochReadiness;
}

/** Without readiness nothing can be readiness-blocked, so admission always yields an epoch. */
export function ensureSchedulerEpochFromBoard(params: EnsureSchedulerEpochParams & { readiness?: undefined }): SchedulerEpochEnsureResult;
export function ensureSchedulerEpochFromBoard(params: EnsureSchedulerEpochParams): SchedulerEpochEnsureOutcome;
export function ensureSchedulerEpochFromBoard(params: EnsureSchedulerEpochParams): SchedulerEpochEnsureOutcome {
  return params.store.db.transaction((): SchedulerEpochEnsureOutcome => {
    const gameId = params.globals.game?.gameId ?? params.globals.gameId;
    const harness = gameId ? getHarnessState(params.store.db, gameId) : null;
    if (params.prepareOnly && (!harness || !gameId || harness.execution.desired !== "paused" || harness.execution.workflow !== "none" || getDispatchState(params.store, gameId)?.active_workflow || activeWorkerCount(params.store, params.runId) > 0)) {
      throw new Error("Epoch preparation requires a paused harness with no active workflow, lease, or workers");
    }
    if (harness && ((!params.prepareOnly && harness.execution.desired !== "run") || harness.execution.workflow === "sync" || harness.execution.status === "blocked" || harness.execution.blockers.length > 0 || Object.values(harness.readiness).some(value => value !== "ready"))) {
      throw new Error("Epoch admission refused: harness is paused, synchronizing, or has unresolved readiness blockers");
    }
    let epoch = activeSchedulerEpoch(params.store, params.runId);
    let progress = epoch ? schedulerEpochProgress(params.store, epoch.id) : null;
    let admission: EpochAdmissionResult | undefined;
    if ((!progress || progress.admitted === 0) && (params.config.freshReportGate ?? true)) {
      assertFreshBoardReport(params);
    }
    // stop_at_frame games (SMS): a function whose only difference is the stack frame is done.
    const stackOnly = stackOnlyIndexForGame(params.store, {
      gameId,
      stackFramePolicy: params.globals.game?.matching?.stackFramePolicy,
    });
    const readiness = boardReadinessOptions(params.readiness);
    const board = loadKnowledgeBoardSnapshot(params.globals.repoRoot, {
      graphDbPath: params.graphDbPath,
      validation: params.globals.game?.validation,
      ...(stackOnly ? { stackOnly } : {}),
      ...(readiness ? { readiness } : {}),
    });
    if (!progress || progress.admitted === 0) {
      const candidates = params.config.epochTargetCap == null
        ? board.candidates
        : board.candidates.slice(0, params.config.epochTargetCap);
      // Blocked-only: park before any epoch exists (an empty epoch would go straight to settlement).
      if (!epoch && (board.blocked?.length ?? 0) > 0 && selectEpochAdmissionCandidates({ candidates }).selected.length === 0) {
        recordReadinessParked(params.store, { runId: params.runId, gameId, board, producer: "scheduler" });
        return { kind: "readiness_blocked_only", blocked: board.blocked ?? [], readiness: board.readiness ?? null };
      }
      epoch ??= startSchedulerEpoch(params.store, params.runId, params.config);
      admission = admitEpochTargets(params.store, {
        epochId: epoch.id,
        runId: params.runId,
        candidates,
        workerPoolSize: params.config.workerPoolSize,
      });
      progress = schedulerEpochProgress(params.store, epoch.id);
      recordReadinessArtifact(params.store, { runId: params.runId, gameId, board, epochId: epoch.id });
    }
    if (!epoch || !progress) throw new Error("Scheduler epoch admission did not produce an epoch");

    const availabilityRefresh = refreshEpochTargetAvailability(params.store, epoch.id, {
      exactTargetKeys: stackOnly
        ? new Set([
            ...loadExactTargetKeys(params.globals.repoRoot, params.globals.game?.validation),
            ...loadStackOnlyTargetKeys(params.globals.repoRoot, { ...params.globals.game?.validation, stackOnly }),
          ])
        : loadExactTargetKeys(params.globals.repoRoot, params.globals.game?.validation),
    });
    if (harness && gameId && (admission || !params.prepareOnly)) {
      const current = getHarnessState(params.store.db, gameId)!;
      const eventId = `${params.prepareOnly ? "epoch-prepared" : "epoch-admitted"}:${epoch.id}`;
      if (!params.store.db.query("SELECT event_id FROM harness_timeline_entries WHERE game_id = ? AND event_id = ?").get(gameId, eventId)) {
        transitionHarnessState(params.store.db, { gameId, expectedRevision: current.identity.revision, commandId: eventId,
          patch: { execution: params.prepareOnly ? { workflow: "none", status: "paused" } : { workflow: "run", status: "active" }, history: { run_id: params.runId, epoch_id: epoch.id } },
          boundary: { eventId, kind: params.prepareOnly ? "epoch_prepared" : "epoch_admitted", outcome: params.prepareOnly ? "prepared_paused" : "admitted", runId: params.runId, epochId: epoch.id,
            evidence: { accepted_head: current.source.head, admitted: progress.admitted } },
        });
      }
    }
    epoch = activeSchedulerEpoch(params.store, params.runId) ?? epoch;
    progress = schedulerEpochProgress(params.store, epoch.id);
    return { epoch, admission, availabilityRefresh, progress };
  })();
}

export async function runSchedulerTick(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  options: {
    ownsSchedulerCondition?: boolean;
    /** Epoch-start revision for readiness (default: the checkout's HEAD). */
    readinessRev?: string | null;
    readinessRunner?: ReadinessRunner;
  } = {},
): Promise<SchedulerTickResult> {
  const store = openState(globals.stateDir);
  let observedRunId = "";
  const ownsSchedulerCondition = options.ownsSchedulerCondition ?? true;
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "tick");
    observedRunId = runId;
    if (ownsSchedulerCondition) setRunSchedulerCondition(store, runId, "planning");

    const event = nextUnhandledEvent(store, runId);
    if (!event) {
      const epoch = activeSchedulerEpoch(store, runId);
      if (epoch) reconcileOrphanedEpochTargets(store, epoch, schedulerEpochProgress(store, epoch.id));
      return { runId, status: "no_unhandled_events" };
    }
    const eventType = String(event.eventType ?? event.event_type ?? "");
    const workerPoolSize = Math.max(1, nonNegativeInt(run.desiredWorkers));
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    let epochResult: SchedulerEpochEnsureResult | null = null;
    if (!booleanArg(args, "--no-start-epoch") || activeSchedulerEpoch(store, runId)) {
      const readiness = await readinessForAdmission({ globals, store, runId, rev: options.readinessRev, runner: options.readinessRunner });
      const outcome = ensureSchedulerEpochFromBoard({
        config: schedulerEpochConfigFromArgs(globals, args, { workerPoolSize }),
        globals,
        graphDbPath,
        runId,
        store,
        ...(readiness ? { readiness } : {}),
      });
      if (isReadinessBlockedOnly(outcome)) {
        markEventHandled(store, String(event.id));
        return {
          runId,
          status: "readiness_blocked_only",
          readinessBlocked: outcome.blocked.length,
          handledEvent: event.id,
          eventType,
          eventProducer: String(event.producer ?? ""),
          eventCreatedAt: String(event.createdAt ?? event.created_at ?? ""),
          schedulerTargetUpdates: 0,
          dryRun: globals.dryRunAgents,
        };
      }
      epochResult = outcome;
      reconcileOrphanedEpochTargets(store, epochResult.epoch, epochResult.progress);
    }
    markEventHandled(store, String(event.id));
    const targetPressure = targetPressureSnapshot(store, runId);

    return {
      runId,
      handledEvent: event.id,
      eventType,
      eventProducer: String(event.producer ?? ""),
      eventCreatedAt: String(event.createdAt ?? event.created_at ?? ""),
      schedulerTargetUpdates: epochResult?.admission?.admitted ?? 0,
      schedulerEpoch: epochResult?.progress,
      epochAdmission: epochResult?.admission,
      epochAvailabilityRefresh: epochResult?.availabilityRefresh,
      targetPressure: {
        activeWorkers: activeWorkerCount(store, runId),
        admittedTargets: targetPressure.admittedTargets,
        schedulableTargets: targetPressure.schedulableTargets,
        unhandledEvents: targetPressure.unhandledEvents,
      },
      dryRun: globals.dryRunAgents,
    };
  } finally {
    if (observedRunId && ownsSchedulerCondition) setRunSchedulerCondition(store, observedRunId, "idle");
    store.db.close();
  }
}

export async function tick(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runSchedulerTick(globals, args), null, 2));
}
