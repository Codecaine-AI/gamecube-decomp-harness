import { loadKnowledgeBoardSnapshot, resourceGraphDbPath } from "@server/core/knowledge";
import { loadExactTargetKeys } from "@server/core/cycle-runtime/phases/running/board/snapshot.js";
import {
  activeWorkerCount,
  activeSchedulerEpoch,
  admitEpochTargets,
  refreshEpochTargetPriorities,
  refreshEpochTargetAvailability,
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
} from "@server/core/cycle-runtime/run-state";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { assertSchedulableRun } from "@server/core/cycle-runtime/phases/running/jobs/shared.js";

export interface SchedulerTickResult {
  runId: string;
  status?: "no_unhandled_events";
  handledEvent?: unknown;
  eventType?: string;
  eventProducer?: string;
  eventCreatedAt?: string;
  schedulerTargetUpdates?: number;
  schedulerEpoch?: EpochProgressSummary;
  epochAdmission?: EpochAdmissionResult;
  epochAvailabilityRefresh?: EpochAvailabilityRefreshResult;
  epochPriorityRefreshes?: number;
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
  priorityRefreshes: number;
  progress: EpochProgressSummary;
  boardExhausted: boolean;
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function schedulerEpochConfigFromArgs(
  _globals: GlobalArgs,
  _args: Map<string, string | true>,
  params: { workerPoolSize: number },
): SchedulerEpochConfig {
  const workerPoolSize = Math.max(1, nonNegativeInt(params.workerPoolSize));
  return { workerPoolSize };
}

export function ensureSchedulerEpochFromBoard(params: {
  config: SchedulerEpochConfig;
  globals: GlobalArgs;
  graphDbPath: string;
  runId: string;
  store: StateStore;
}): SchedulerEpochEnsureResult {
  let epoch = activeSchedulerEpoch(params.store, params.runId) ?? startSchedulerEpoch(params.store, params.runId, params.config);
  let progress = schedulerEpochProgress(params.store, epoch.id);
  let admission: EpochAdmissionResult | undefined;
  const board = loadKnowledgeBoardSnapshot(params.globals.repoRoot, {
    graphDbPath: params.graphDbPath,
  });
  const boardExhausted = board.candidates.length === 0;
  if (progress.admitted === 0) {
    admission = admitEpochTargets(params.store, {
      epochId: epoch.id,
      runId: params.runId,
      candidates: board.candidates,
      workerPoolSize: params.config.workerPoolSize,
    });
    progress = schedulerEpochProgress(params.store, epoch.id);
  }

  const priorityRefreshes = refreshEpochTargetPriorities(params.store, {
    epochId: epoch.id,
    runId: params.runId,
    candidates: board.candidates,
  }).refreshed;
  const availabilityRefresh = refreshEpochTargetAvailability(params.store, epoch.id, {
    exactTargetKeys: loadExactTargetKeys(params.globals.repoRoot),
  });
  epoch = activeSchedulerEpoch(params.store, params.runId) ?? epoch;
  progress = schedulerEpochProgress(params.store, epoch.id);
  return { epoch, admission, availabilityRefresh, priorityRefreshes, progress, boardExhausted };
}

export async function runSchedulerTick(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  options: { ownsSchedulerCondition?: boolean } = {},
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
    if (!event) return { runId, status: "no_unhandled_events" };
    const eventType = String(event.eventType ?? event.event_type ?? "");
    const workerPoolSize = Math.max(1, nonNegativeInt(run.desiredWorkers));
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    let epochResult: SchedulerEpochEnsureResult | null = null;
    if (!booleanArg(args, "--no-start-epoch") || activeSchedulerEpoch(store, runId)) {
      epochResult = ensureSchedulerEpochFromBoard({
        config: schedulerEpochConfigFromArgs(globals, args, { workerPoolSize }),
        globals,
        graphDbPath,
        runId,
        store,
      });
    }
    markEventHandled(store, String(event.id));
    const targetPressure = targetPressureSnapshot(store, runId);

    return {
      runId,
      handledEvent: event.id,
      eventType,
      eventProducer: String(event.producer ?? ""),
      eventCreatedAt: String(event.createdAt ?? event.created_at ?? ""),
      schedulerTargetUpdates: (epochResult?.admission?.admitted ?? 0) + (epochResult?.priorityRefreshes ?? 0),
      schedulerEpoch: epochResult?.progress,
      epochAdmission: epochResult?.admission,
      epochAvailabilityRefresh: epochResult?.availabilityRefresh,
      epochPriorityRefreshes: epochResult?.priorityRefreshes,
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
