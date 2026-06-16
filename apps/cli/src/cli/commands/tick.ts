import { loadKnowledgeBoardSnapshot, resourceGraphDbPath } from "@decomp-orchestrator/knowledge";
import {
  activeWorkerCount,
  activeSchedulerEpoch,
  admitExistingQueuedEpochTargets,
  admitEpochTargets,
  parseEpochSize,
  refreshEpochQueuedTargetPriorities,
  refillEpochReadyQueue,
  schedulerEpochProgress,
  startSchedulerEpoch,
  getLatestRun,
  getRun,
  markEventHandled,
  nextUnhandledEvent,
  openState,
  queueStatsSnapshot,
  refillQueuedTargets,
  type EpochAdmissionResult,
  type ExistingEpochAdmissionResult,
  type EpochProgressSummary,
  type EpochReadyRefillResult,
  type EpochSizeSpec,
  type QueueRefillResult,
  type SchedulerEpochConfig,
  type SchedulerEpochRecord,
  type StateStore,
} from "@decomp-orchestrator/core/state";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "../args.js";
import { assertSchedulableRun } from "./shared.js";

export interface SchedulerTickResult {
  runId: string;
  status?: "no_unhandled_events";
  handledEvent?: unknown;
  eventType?: string;
  eventProducer?: string;
  eventCreatedAt?: string;
  schedulerTargetUpdates?: number;
  queueRefill?: QueueRefillResult;
  schedulerEpoch?: EpochProgressSummary;
  existingEpochAdmission?: ExistingEpochAdmissionResult;
  epochAdmission?: EpochAdmissionResult;
  epochReadyRefill?: EpochReadyRefillResult;
  epochPriorityRefreshes?: number;
  queuePressure?: {
    activeWorkers: number;
    candidateLimit: number;
    candidateWindow: number;
    queueTargetSize: number;
    queuedTargets: number;
    schedulableTargets: number;
    blockedQueuedTargets: number;
    unhandledEvents: number;
  };
  dryRun?: boolean;
}

export interface SchedulerEpochEnsureResult {
  epoch: SchedulerEpochRecord;
  admission?: EpochAdmissionResult;
  existingAdmission?: ExistingEpochAdmissionResult;
  readyRefill: EpochReadyRefillResult;
  priorityRefreshes: number;
  progress: EpochProgressSummary;
  candidateWindow: number;
  boardExhausted: boolean;
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function nextCandidateWindow(current: number): number {
  if (current <= 0) return 1;
  return current * 2;
}

function positiveIntArg(args: Map<string, string | true>, name: string, fallback: number): number {
  return Math.max(1, nonNegativeInt(numberArg(args, name, fallback)));
}

function rawEpochSize(globals: GlobalArgs, args: Map<string, string | true>, queueTargetSize: number): string | number {
  const explicit = args.get("--epoch-size");
  if (typeof explicit === "string") return explicit;
  return globals.project?.dashboard.epochSize ?? queueTargetSize;
}

export function schedulerEpochConfigFromArgs(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  params: { candidateWindow: number; queueTargetSize: number },
): SchedulerEpochConfig {
  const size = parseEpochSize(rawEpochSize(globals, args, params.queueTargetSize));
  const readyQueueSize = positiveIntArg(args, "--epoch-ready-queue-size", globals.project?.dashboard.epochReadyQueueSize ?? params.queueTargetSize);
  return {
    size,
    readyQueueSize,
    candidateWindow: Math.max(1, params.candidateWindow),
  };
}

function remainingFixedAdmission(size: EpochSizeSpec, progress: EpochProgressSummary): number {
  if (size.mode === "full") return Number.POSITIVE_INFINITY;
  return Math.max(0, (size.value ?? 0) - progress.admitted);
}

function combineEpochAdmissions(previous: EpochAdmissionResult | undefined, next: EpochAdmissionResult): EpochAdmissionResult {
  if (!previous) return next;
  return {
    ...next,
    admitted: previous.admitted + next.admitted,
    candidateCount: previous.candidateCount + next.candidateCount,
    queued: previous.queued + next.queued,
    skippedExisting: previous.skippedExisting + next.skippedExisting,
    skippedLockedSource: previous.skippedLockedSource + next.skippedLockedSource,
    skippedMissingSource: previous.skippedMissingSource + next.skippedMissingSource,
  };
}

export function ensureSchedulerEpochFromBoard(params: {
  config: SchedulerEpochConfig;
  globals: GlobalArgs;
  graphDbPath: string;
  runId: string;
  store: StateStore;
}): SchedulerEpochEnsureResult {
  let epoch = activeSchedulerEpoch(params.store, params.runId) ?? startSchedulerEpoch(params.store, params.runId, params.config);
  let candidateWindow = Math.max(1, params.config.candidateWindow);
  let progress = schedulerEpochProgress(params.store, epoch.id);
  let admission: EpochAdmissionResult | undefined;
  let existingAdmission: ExistingEpochAdmissionResult | undefined;
  let boardExhausted = false;

  const existingLimit = remainingFixedAdmission(params.config.size, progress);
  if (existingLimit > 0) {
    existingAdmission = admitExistingQueuedEpochTargets(params.store, {
      epochId: epoch.id,
      runId: params.runId,
      limit: params.config.size.mode === "full" ? Number.MAX_SAFE_INTEGER : existingLimit,
    });
    progress = schedulerEpochProgress(params.store, epoch.id);
  }

  for (;;) {
    const remaining = remainingFixedAdmission(params.config.size, progress);
    if (remaining <= 0) break;

    const board = loadKnowledgeBoardSnapshot(params.globals.repoRoot, candidateWindow, { graphDbPath: params.graphDbPath });
    const passSize: EpochSizeSpec = params.config.size.mode === "full" ? params.config.size : { mode: "fixed", value: remaining };
    admission = combineEpochAdmissions(
      admission,
      admitEpochTargets(params.store, {
        epochId: epoch.id,
        runId: params.runId,
        candidates: board.candidates,
        size: passSize,
        readyQueueSize: params.config.readyQueueSize,
      }),
    );
    boardExhausted = board.candidates.length < candidateWindow;
    progress = schedulerEpochProgress(params.store, epoch.id);
    if (params.config.size.mode === "fixed" && remainingFixedAdmission(params.config.size, progress) <= 0) break;
    if (boardExhausted) break;
    const expanded = nextCandidateWindow(candidateWindow);
    if (expanded <= candidateWindow) break;
    candidateWindow = expanded;
  }

  const refreshBoard = loadKnowledgeBoardSnapshot(params.globals.repoRoot, candidateWindow, { graphDbPath: params.graphDbPath });
  const priorityRefreshes = refreshEpochQueuedTargetPriorities(params.store, {
    epochId: epoch.id,
    runId: params.runId,
    candidates: refreshBoard.candidates,
  }).refreshed;
  const readyRefill = refillEpochReadyQueue(params.store, epoch.id);
  epoch = activeSchedulerEpoch(params.store, params.runId) ?? epoch;
  progress = schedulerEpochProgress(params.store, epoch.id);
  return { epoch, admission, existingAdmission, readyRefill, priorityRefreshes, progress, candidateWindow, boardExhausted };
}

function refillQueueDeterministically(params: {
  candidateWindow: number;
  graphDbPath: string;
  minSchedulableSources: number;
  repoRoot: string;
  runId: string;
  store: StateStore;
  targetSize: number;
}): { candidateWindow: number; refill: QueueRefillResult } {
  let candidateWindow = params.candidateWindow;
  let combined: QueueRefillResult | null = null;

  for (;;) {
    const board = loadKnowledgeBoardSnapshot(params.repoRoot, candidateWindow, { graphDbPath: params.graphDbPath });
    const refill = refillQueuedTargets(params.store, params.runId, board.candidates, {
      targetSize: params.targetSize,
      minSchedulableSources: params.minSchedulableSources,
    });
    combined = combined
      ? {
          ...refill,
          inserted: combined.inserted + refill.inserted,
          refreshed: combined.refreshed + refill.refreshed,
          queuedBefore: combined.queuedBefore,
          schedulableBefore: combined.schedulableBefore,
        }
      : refill;

    const targetSatisfied = combined.queuedAfter >= params.targetSize && combined.schedulableAfter >= params.minSchedulableSources;
    const boardExhausted = board.candidates.length < candidateWindow;
    if (targetSatisfied || boardExhausted) return { candidateWindow, refill: combined };

    const expanded = nextCandidateWindow(candidateWindow);
    if (expanded <= candidateWindow) return { candidateWindow, refill: combined };
    candidateWindow = expanded;
  }
}

export async function runSchedulerTick(globals: GlobalArgs, args: Map<string, string | true>): Promise<SchedulerTickResult> {
  const store = openState(globals.stateDir);
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "tick");

    const event = nextUnhandledEvent(store, runId);
    if (!event) return { runId, status: "no_unhandled_events" };

    const candidateLimit = nonNegativeInt(
      numberArg(args, "--candidate-limit", globals.project?.dashboard.candidateLimit ?? Math.max(32, run.desiredWorkers * 2)),
    );
    const queueTargetSize = nonNegativeInt(
      numberArg(args, "--queue-target-size", globals.project?.dashboard.queueTargetSize ?? Math.max(candidateLimit, run.desiredWorkers * 2)),
    );
    const requestedCandidateWindow = Math.max(
      candidateLimit,
      queueTargetSize,
      nonNegativeInt(numberArg(args, "--candidate-window", globals.project?.dashboard.candidateWindow ?? Math.max(candidateLimit, queueTargetSize * 8))),
    );
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    const epochCycleEnabled = !booleanArg(args, "--no-epoch-cycle");
    let refill: { candidateWindow: number; refill: QueueRefillResult } | null = null;
    let epochResult: SchedulerEpochEnsureResult | null = null;
    if (epochCycleEnabled) {
      epochResult = ensureSchedulerEpochFromBoard({
        config: schedulerEpochConfigFromArgs(globals, args, { candidateWindow: requestedCandidateWindow, queueTargetSize }),
        globals,
        graphDbPath,
        runId,
        store,
      });
    } else {
      const minSchedulableSources = Math.min(run.desiredWorkers, queueTargetSize);
      refill = refillQueueDeterministically({
        candidateWindow: requestedCandidateWindow,
        graphDbPath,
        minSchedulableSources,
        repoRoot: globals.repoRoot,
        runId,
        store,
        targetSize: queueTargetSize,
      });
    }
    markEventHandled(store, String(event.id));
    const queuePressure = queueStatsSnapshot(store, runId);

    return {
      runId,
      handledEvent: event.id,
      eventType: String(event.event_type ?? ""),
      eventProducer: String(event.producer ?? ""),
      eventCreatedAt: String(event.created_at ?? ""),
      schedulerTargetUpdates: epochResult
        ? (epochResult.admission?.admitted ?? 0) + epochResult.readyRefill.inserted + epochResult.priorityRefreshes
        : (refill?.refill.inserted ?? 0) + (refill?.refill.refreshed ?? 0),
      queueRefill: refill?.refill,
      schedulerEpoch: epochResult?.progress,
      existingEpochAdmission: epochResult?.existingAdmission,
      epochAdmission: epochResult?.admission,
      epochReadyRefill: epochResult?.readyRefill,
      epochPriorityRefreshes: epochResult?.priorityRefreshes,
      queuePressure: {
        activeWorkers: activeWorkerCount(store, runId),
        candidateLimit,
        candidateWindow: epochResult?.candidateWindow ?? refill?.candidateWindow ?? requestedCandidateWindow,
        queueTargetSize,
        queuedTargets: queuePressure.queuedTargets,
        schedulableTargets: queuePressure.schedulableTargets,
        blockedQueuedTargets: queuePressure.blockedQueuedTargets,
        unhandledEvents: queuePressure.unhandledEvents,
      },
      dryRun: globals.dryRunAgents,
    };
  } finally {
    store.db.close();
  }
}

export async function tick(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runSchedulerTick(globals, args), null, 2));
}
