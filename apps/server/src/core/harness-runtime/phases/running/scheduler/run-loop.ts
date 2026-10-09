import { assertSandboxAdmission } from "@server/core/harness-state/sandbox-admission.js";
import { getHarnessState } from "@server/core/harness-state/state.js";
import { resolve } from "node:path";
import { resourceGraphDbPath } from "@server/core/knowledge";
import { getDispatchState, heartbeatDispatch } from "@server/core/harness-state";
import {
  activeWorkerCount,
  activeSchedulerEpoch,
  addEvent,
  blockingWorkerOutputIntegrationCount,
  getLatestRun,
  getRun,
  isDesiredWorkerCount,
  markEventHandled,
  nextUnhandledEvent,
  openState,
  admittedTargetCount,
  readRunDesiredWorkers,
  schedulerEpochProgress,
  schedulableTargetCount,
  setRunSchedulerCondition,
  unhandledEventCount,
  borrowState,
  isStateStoreClosedError,
  stateStoreCloseInfo,
  type EpochProgressSummary,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { withBusyRetry } from "@server/core/orchestrator-state";
import type { EpochSettlementResult } from "@server/core/harness-runtime/phases/running/epochs";
import { processWorkerOutputIntegrationQueue } from "@server/core/harness-runtime/phases/running/integration";
import {
  booleanArg,
  numberArg,
  stringArg,
  syncMergePolicyArg,
  librarianConsumerFlag,
  modelNodeFlags,
  workerSummaryFlag,
  writeSetIntegrationFlags,
  type GlobalArgs,
  type ModelNodeFlags,
  type WriteSetIntegrationFlags,
} from "@server/core/game-registry/runtime-options.js";
import type { AdvisoryAdjudicationConfig } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/config.js";
import { assertSchedulableRun } from "@server/core/harness-runtime/phases/running/jobs/shared.js";
import { settleRunOnExit } from "@server/core/harness-runtime/phases/running/jobs/settle-supervised-run.js";
import {
  ensureSchedulerEpochFromBoard,
  reconcileOrphanedEpochTargets,
  runSchedulerTick,
  schedulerEpochConfigFromArgs,
  type SchedulerTickResult,
} from "@server/core/harness-runtime/phases/running/scheduler/tick.js";
import { resolveBaseRev, resolveWorkerAdvisoryMode } from "@server/core/harness-runtime/phases/running/workers/worker-cycle.js";
import { startJobConsumer, type JobConsumerHandle } from "@server/core/job-queue/consumer.js";
import { defaultConfigureCommand } from "@server/core/job-queue/executor.js";
import { reconcileSandboxes } from "@server/core/job-queue/sandbox-lifecycle.js";
import { DaytonaSandboxProvider, type SandboxProvider } from "@server/core/job-queue/sandbox.js";
import type { JobRecord, TaskOutcome } from "@server/core/job-queue/types.js";
import {
  DEFAULT_SANDBOX_SLEEP_DEBOUNCE_MS,
  reapWorkerJobs,
  requeueAdmittedWorkerJob,
  workerJobDescriptor,
  workerKernelOps,
  type WorkerJobRunContext,
} from "@server/core/harness-runtime/phases/running/workers/worker-job.js";
import { runKnowledgeMaintenance, type KnowledgeMaintenanceProgressEvent } from "@server/core/knowledge/jobs/kg.js";
import { startWorkerSummaryProcessor } from "@server/core/knowledge-v2/summarizer-job/index.js";
import { startLibrarianConsumerLane } from "@server/core/knowledge-v2/librarian/lane.js";
import { startModelNodeLanesIfEnabled, type ModelNodeLanes } from "@server/core/model-node-work/index.js";
import { recoverActiveClaims } from "@server/core/harness-runtime/phases/running/jobs/recover-claims.js";
import { workerTtlSeconds } from "@server/core/harness-runtime/phases/running/worker-ttl.js";
import { runEpochBoundary } from "./epoch-boundary.js";
import { probeWorkerProvider, type ProviderProbeResult } from "@server/infrastructure/agent-runtime/provider-probe.js";

interface WorkerResultSummary {
  workerStateId: string;
  lifecycleStatus: string;
  bestCheckpointId: string | null;
  exact: boolean;
  error?: string;
  errorKind?: string;
}

interface WorkerError {
  workerId: string;
  error: string;
}

export function workerJobClaimRecoveryFilters(job: JobRecord): {
  claimIdFilter: string | undefined;
  workerIdFilter: string | undefined;
} {
  return {
    claimIdFilter: typeof job.payload.target_claim_id === "string" ? job.payload.target_claim_id : undefined,
    workerIdFilter: typeof job.payload.worker_id === "string" ? job.payload.worker_id : undefined,
  };
}

interface KnowledgeMaintenanceError {
  error: string;
}

interface EpochError {
  error: string;
}

interface TargetPressureSnapshot {
  admittedTargets: number;
  activeWorkers: number;
  maxWorkers: number;
  openSlots: number;
  runningWorkers: number;
  schedulableTargets: number;
}

interface BoundaryErrorEpoch {
  id: string;
  ordinal: number;
  admitted: number;
  finished: number;
  attemptCount: number;
  nextAttemptAt: string | null;
  terminal: boolean;
}

export interface BoundaryRetryLogState {
  deadline: string;
  phase: "waiting" | "due";
}

export interface RunLoopResult {
  runId: string;
  mode: "run_loop";
  stoppedReason: string;
  iterations: number;
  idleIterations: number;
  desiredWorkers: number;
  maxWorkers: number;
  schedulerTicks: number;
  epochSettlement: boolean;
  epochsSettled: number;
  schedulerEpoch?: EpochProgressSummary | null;
  epochAdmissions: number;
  epochAvailabilityRefreshes: number;
  epochTargetsAdmitted: number;
  epochErrors: EpochError[];
  epochPaused: boolean;
  lastEpoch?: EpochSettlementResult;
  epochTargetsMadeAvailable: number;
  workersStarted: number;
  workerResults: WorkerResultSummary[];
  workerErrors: WorkerError[];
  knowledgeMaintenanceRuns: Record<string, unknown>[];
  knowledgeMaintenanceErrors: KnowledgeMaintenanceError[];
  integrationDrains: number;
  dryRun: boolean;
  finalStatus: {
    activeWorkers: number;
    admittedTargets: number;
    schedulableTargets: number;
    unhandledEvents: number;
  };
}

export type TriggerAgentResult = RunLoopResult;

export interface RunLoopDeps {
  sandboxProvider?: SandboxProvider;
  providerProbe?: () => Promise<ProviderProbeResult>;
  /** Test seam: the worker job's task executor and sandbox provisioning; production passes nothing. */
  workerJobDeps?: Pick<NonNullable<Parameters<typeof workerJobDescriptor>[1]>, "executor" | "provisionSandbox">;
}

export function providerCircuitConfigFromArgs(args: Map<string, string | true>) {
  const positive = (flag: string, fallback: number): number => {
    const value = numberArg(args, flag, fallback);
    if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
      throw new Error(`${flag} must be a positive integer`);
    }
    return value;
  };
  return {
    threshold: positive("--provider-outage-threshold", 6),
    windowSeconds: positive("--provider-outage-window-seconds", 300),
    probeIntervalSeconds: Math.min(300, positive("--provider-probe-interval-seconds", 60)),
  };
}

type ProviderCircuitEvent = "provider_circuit_opened" | "provider_probe" | "provider_circuit_closed";

export function createProviderCircuitBreaker(
  config: ReturnType<typeof providerCircuitConfigFromArgs>,
  deps: {
    probe: () => Promise<ProviderProbeResult>;
    emit: (event: ProviderCircuitEvent, payload: Record<string, unknown>) => void;
    now?: () => number;
    log?: (message: string) => void;
  },
) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.error(message));
  let outages: number[] = [];
  let openedAt: number | null = null;
  let nextProbeAt: number | null = null;
  let intervalSeconds = config.probeIntervalSeconds;
  let probing = false;
  const snapshot = () => ({
    state: openedAt === null ? "closed" : "open",
    opened_at: openedAt === null ? null : new Date(openedAt).toISOString(),
    next_probe_at: nextProbeAt === null ? null : new Date(nextProbeAt).toISOString(),
    probe_interval_seconds: intervalSeconds,
    outage_count: outages.length,
    threshold: config.threshold,
    window_seconds: config.windowSeconds,
  });
  return {
    isOpen: () => openedAt !== null,
    snapshot,
    recordClosure(errorKind: string | undefined): void {
      if (errorKind !== "provider_outage") return;
      const at = now();
      outages = outages.filter((time) => time >= at - config.windowSeconds * 1_000);
      outages.push(at);
      if (openedAt !== null || outages.length < config.threshold) return;
      openedAt = at;
      intervalSeconds = config.probeIntervalSeconds;
      nextProbeAt = at + intervalSeconds * 1_000;
      deps.emit("provider_circuit_opened", snapshot());
      log(`[run-loop] provider circuit opened: ${outages.length} outages; waiting ${intervalSeconds}s before probe`);
    },
    async probeIfDue(): Promise<boolean> {
      if (openedAt === null || probing || nextProbeAt === null || now() < nextProbeAt) return false;
      probing = true;
      try {
        let result: ProviderProbeResult;
        try { result = await deps.probe(); }
        catch (error) { result = { success: false, error: error instanceof Error ? error.message : String(error) }; }
        if (!result.success) {
          intervalSeconds = Math.min(300, intervalSeconds * 2);
          nextProbeAt = now() + intervalSeconds * 1_000;
        }
        deps.emit("provider_probe", { ...snapshot(), success: result.success, error: result.error ?? null, probed_at: new Date(now()).toISOString() });
        log(`[run-loop] provider circuit probe ${result.success ? "succeeded" : `failed; retry in ${intervalSeconds}s`}`);
        if (result.success) {
          openedAt = null;
          nextProbeAt = null;
          outages = [];
          deps.emit("provider_circuit_closed", snapshot());
          log("[run-loop] provider circuit closed: resuming worker claims");
        }
        return true;
      } finally { probing = false; }
    },
  };
}

/**
 * Records the run's widening policy (always, so it is auditable even at its
 * default) and, when any model-node feature is on, the model-node policies.
 * With adjudication and the knowledge feed both off the payload is exactly
 * today's (plan §11 #14). An enforce request also records the mode workers
 * will run, resolved by the worker's own rule, and warns once when it is
 * downgraded to shadow.
 */
export function recordRunLoopFlags(
  store: StateStore,
  runId: string,
  flags: { writeSetFlags: WriteSetIntegrationFlags; nodeFlags: ModelNodeFlags },
  options: { advisoryConfig?: AdvisoryAdjudicationConfig; warn?: (message: string) => void } = {},
): void {
  const { writeSetFlags, nodeFlags } = flags;
  const enforce = nodeFlags.advisoryAdjudication === "enforce"
    ? resolveWorkerAdvisoryMode("enforce", options.advisoryConfig)
    : null;
  const modelNodesOn = nodeFlags.advisoryAdjudication !== "off" || nodeFlags.checkpointKnowledgeFeed === "on";
  const flagEvent = addEvent(store, runId, "write_set_integration_flags", "run-loop", {
    write_set_widening: writeSetFlags.writeSetWidening,
    ...(modelNodesOn && {
      advisory_adjudication: nodeFlags.advisoryAdjudication,
      ...(enforce && {
        advisory_adjudication_effective: enforce.mode,
        ...(enforce.downgradedReason && { advisory_adjudication_downgraded_reason: enforce.downgradedReason }),
      }),
      checkpoint_knowledge_feed: nodeFlags.checkpointKnowledgeFeed,
      checkpoint_knowledge_cap: nodeFlags.checkpointKnowledgeCap,
    }),
    created_by: "run-loop",
  });
  markEventHandled(store, flagEvent);
  if (enforce?.downgradedReason) {
    (options.warn ?? console.warn)(
      `[advisory-adjudication] enforce requested; running shadow (${enforce.downgradedReason}). ` +
        "Calibrate and write qualified thresholds to enable enforce.",
    );
  }
}

export function startWorkerSummaryIfEnabled(params: {
  args: Map<string, string | true>;
  store: StateStore;
  runId: string;
  globals: GlobalArgs;
  gameId?: string;
  shouldClaim?: () => boolean;
  onFatalError?: (cause: unknown, context: { job: JobRecord | null; operation: string }) => void;
  onShutdownAbandoned?: (count: number) => void;
  start?: typeof startWorkerSummaryProcessor;
}): ((options?: { maxWaitMs?: number }) => Promise<void>) | null {
  if (!workerSummaryFlag(params.args)) return null;
  const { store, runId, globals, gameId, shouldClaim, onFatalError, onShutdownAbandoned } = params;
  const flagEvent = addEvent(store, runId, "worker_summary_flag_recorded", "run-loop", {
    worker_summary: true,
    created_by: "run-loop",
  });
  markEventHandled(store, flagEvent);
  return (params.start ?? startWorkerSummaryProcessor)(store, { globals }, {
    gameId,
    shouldClaim,
    onFatalError,
    onShutdownAbandoned,
  });
}

export function startLibrarianConsumerIfEnabled(params: {
  args: Map<string, string | true>;
  store: StateStore;
  runId: string;
  globals: GlobalArgs;
  gameId?: string;
  shouldClaim?: () => boolean;
  start?: typeof startLibrarianConsumerLane;
}): ((options?: { maxWaitMs?: number }) => Promise<void>) | null {
  if (!librarianConsumerFlag(params.args)) return null;
  const { store, runId, globals, gameId, shouldClaim } = params;
  const flagEvent = addEvent(store, runId, "librarian_consumer_flag_recorded", "run-loop", {
    librarian_consumer: true,
    created_by: "run-loop",
  });
  markEventHandled(store, flagEvent);
  return (params.start ?? startLibrarianConsumerLane)({ runId, globals, gameId, shouldClaim });
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function epochOrdinalForBoundary(
  store: StateStore,
  schedulerEpochId: string | undefined,
  fallback: number,
): number {
  if (!schedulerEpochId) return fallback;
  const row = store.db
    .query<{ ordinal: number }, [string]>("SELECT ordinal FROM epochs WHERE id = ?")
    .get(schedulerEpochId);
  return row?.ordinal ?? fallback;
}

export function sandboxSleepConfigFromArgs(args: Map<string, string | true>): {
  sandboxSleep: boolean;
  sandboxSleepDebounceMs: number;
} {
  return {
    sandboxSleep: !booleanArg(args, "--no-sandbox-sleep"),
    sandboxSleepDebounceMs: nonNegativeInt(
      numberArg(args, "--sandbox-sleep-debounce-ms", DEFAULT_SANDBOX_SLEEP_DEBOUNCE_MS),
    ),
  };
}

function targetPressureSnapshotForRunLoop(params: {
  maxWorkers: number;
  inFlightWorkers: number;
  runId: string;
  store: StateStore;
}): TargetPressureSnapshot {
  const activeWorkers = activeWorkerCount(params.store, params.runId);
  const openSlots = Math.max(0, params.maxWorkers - params.inFlightWorkers);
  return {
    admittedTargets: admittedTargetCount(params.store, params.runId),
    activeWorkers,
    maxWorkers: params.maxWorkers,
    openSlots,
    runningWorkers: params.inFlightWorkers,
    schedulableTargets: schedulableTargetCount(params.store, params.runId),
  };
}

function boundaryErrorEpoch(store: StateStore, runId: string): BoundaryErrorEpoch | null {
  if (activeSchedulerEpoch(store, runId)) return null;
  const row = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT id, ordinal, status, boundary_status, admitted_count, finished_count,
                   boundary_attempt_count, boundary_next_attempt_at
            FROM epochs
            WHERE run_id = ?
              AND admitted_count > 0
              AND COALESCE(boundary_status, '') NOT LIKE 'manual_discarded%'
            ORDER BY ordinal DESC
            LIMIT 1
          `,
        )
        .get(runId) as Record<string, unknown> | undefined,
  );
  return row && String(row.status) === "error"
    ? {
        id: String(row.id),
        ordinal: Number(row.ordinal),
        admitted: Number(row.admitted_count ?? 0),
        finished: Number(row.finished_count ?? 0),
        attemptCount: Number(row.boundary_attempt_count ?? 0),
        nextAttemptAt: row.boundary_next_attempt_at == null ? null : String(row.boundary_next_attempt_at),
        terminal: String(row.boundary_status) === "retry_exhausted",
      }
    : null;
}

function isBoundarySettled(boundaryError: BoundaryErrorEpoch, noActiveWork: boolean): boolean {
  return boundaryError.finished >= boundaryError.admitted || noActiveWork;
}

export function epochBoundaryWorkPending(
  store: StateStore,
  runId: string,
  at = new Date(),
  noActiveWork = false,
): boolean {
  const activeEpoch = activeSchedulerEpoch(store, runId);
  if (activeEpoch) {
    const progress = schedulerEpochProgress(store, activeEpoch.id);
    return progress.remaining === 0 && progress.claimed === 0;
  }
  const failedBoundary = boundaryErrorEpoch(store, runId);
  return failedBoundary !== null &&
    !failedBoundary.terminal &&
    isBoundarySettled(failedBoundary, noActiveWork) &&
    (!failedBoundary.nextAttemptAt || Date.parse(failedBoundary.nextAttemptAt) <= at.getTime());
}

function knowledgeProgressReporter(
  store: StateStore,
  runId: string,
  params: { lane: string; mode?: string; epochId?: string | null; epochOrdinal?: number | null; repoRoot?: string },
): (event: KnowledgeMaintenanceProgressEvent) => void {
  return (event) => {
    try {
      addEvent(store, runId, "knowledge_maintenance_progress", "run-loop", {
        lane: params.lane,
        mode: params.mode ?? null,
        epoch_id: params.epochId ?? null,
        epoch_ordinal: params.epochOrdinal ?? null,
        repo_root: params.repoRoot ?? event.repo_root ?? null,
        stage: event.stage,
        status: event.status,
        tool: event.tool ?? null,
        command: event.command ?? null,
        reason: event.reason ?? null,
        exit_code: event.exit_code ?? null,
        duration_ms: event.duration_ms ?? null,
        summary: event.summary ?? null,
        error: event.error ?? null,
        progress_created_at: event.created_at,
        created_by: "run-loop",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[run-loop] knowledge progress event failed: ${message}`);
    }
  };
}

function cloneArgs(args: Map<string, string | true>, entries: [string, string | true][]): Map<string, string | true> {
  const next = new Map(args);
  for (const [key, value] of entries) next.set(key, value);
  return next;
}

function knowledgeMaintenanceArgs(args: Map<string, string | true>, runId: string, runPrAgentByDefault: boolean): Map<string, string | true> {
  const next = new Map<string, string | true>([["--run-id", runId]]);
  for (const key of [
    "--agent-state-enrichment",
    "--graph-db",
    "--knowledge-curator-enrichment",
    "--no-pr-index",
    "--no-rebuild",
    "--no-run-pr-agent",
    "--no-tool-index",
    "--no-tool-runners",
    "--progress-only",
    "--pr-jobs",
    "--pr-limit",
    "--rerun-existing-prs",
    "--run-pr-agent",
    "--sources",
    "--worker-limit",
  ]) {
    const value = args.get(key);
    if (value !== undefined) next.set(key, value);
  }
  if (runPrAgentByDefault && !next.has("--run-pr-agent") && !next.has("--no-run-pr-agent")) next.set("--run-pr-agent", true);
  if (next.has("--run-pr-agent") && !next.has("--pr-limit")) next.set("--pr-limit", "8");
  return next;
}

function knowledgeMaintenanceIntervalMs(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-knowledge-maintenance")) return 0;
  const fallback = globals.dryRunAgents ? 0 : 5 * 60_000;
  return Math.max(0, Math.floor(numberArg(args, "--knowledge-maintenance-interval-ms", fallback)));
}

export function createKnowledgeMaintenanceClock(intervalMs: number, initializedAt = Date.now()): {
  isDue: (now?: number) => boolean;
  markCompleted: (now?: number) => void;
} {
  let lastCompletedAt = intervalMs > 0 ? 0 : initializedAt;
  return {
    isDue: (now = Date.now()) => intervalMs > 0 && now - lastCompletedAt >= intervalMs,
    markCompleted: (now = Date.now()) => { lastCompletedAt = now; },
  };
}

export async function waitForRestingTrigger(
  idleSleepMs: number,
  extras: Array<Promise<void> | null> = [],
  sleepFor: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  const live = extras.filter((task): task is Promise<void> => task != null);
  if (live.length === 0) {
    await sleepFor(idleSleepMs);
    return;
  }
  await Promise.race([sleepFor(idleSleepMs), ...live]);
}

export function boundaryRetryRest(
  store: StateStore,
  runId: string,
  idleSleepMs: number,
  now = Date.now(),
  noActiveWork = false,
): { ordinal: number; nextAttemptAt: string; sleepMs: number } | null {
  const boundaryError = boundaryErrorEpoch(store, runId);
  if (
    !boundaryError ||
    boundaryError.terminal ||
    !isBoundarySettled(boundaryError, noActiveWork) ||
    !boundaryError.nextAttemptAt
  ) return null;
  const retryAt = Date.parse(boundaryError.nextAttemptAt);
  if (!Number.isFinite(retryAt) || retryAt <= now) return null;
  return {
    ordinal: boundaryError.ordinal,
    nextAttemptAt: boundaryError.nextAttemptAt,
    sleepMs: Math.min(idleSleepMs, retryAt - now),
  };
}

export function boundaryRetryLogTransition(
  previous: BoundaryRetryLogState | null,
  retry: { ordinal: number; nextAttemptAt: string },
  phase: "waiting" | "due",
  sleepMs = 0,
): { state: BoundaryRetryLogState; message: string | null } {
  const state = { deadline: retry.nextAttemptAt, phase } satisfies BoundaryRetryLogState;
  if (previous?.deadline === state.deadline && previous.phase === state.phase) {
    return { state, message: null };
  }
  return {
    state,
    message: phase === "waiting"
      ? `[run-loop] epoch ${retry.ordinal}: boundary retry due at ${retry.nextAttemptAt}, sleeping ${sleepMs}ms`
      : `[run-loop] epoch ${retry.ordinal}: boundary retry due at ${retry.nextAttemptAt}, retrying now`,
  };
}

export function launchBoundaryRetryIfDue(
  store: StateStore,
  runId: string,
  launch: (trigger: string, schedulerEpochId: string) => void,
  now = Date.now(),
  noActiveWork = false,
): boolean {
  const boundaryError = boundaryErrorEpoch(store, runId);
  if (
    !boundaryError ||
    boundaryError.terminal ||
    !isBoundarySettled(boundaryError, noActiveWork) ||
    (boundaryError.nextAttemptAt && Date.parse(boundaryError.nextAttemptAt) > now)
  ) return false;
  launch(`retry scheduler epoch ${boundaryError.ordinal} boundary`, boundaryError.id);
  return true;
}

export function shouldEvaluateEpochBoundary(params: {
  boundaryError: boolean;
  epochPaused: boolean;
  runningEpoch: boolean;
}): boolean {
  return !params.runningEpoch && (params.boundaryError || !params.epochPaused);
}

export function selectRunLoopSchedulerCondition(params: {
  blocked: boolean;
  boundary: boolean;
  planning: boolean;
  fallback: "planning" | "dispatching" | "waiting";
}): "blocked" | "boundary" | "planning" | "dispatching" | "waiting" {
  if (params.blocked) return "blocked";
  if (params.boundary) return "boundary";
  if (params.planning) return "planning";
  return params.fallback;
}

/**
 * Live worker-count control: a change to the run's stored desired_workers (from
 * set-desired-workers or the dashboard) becomes the claim limit, uncapped by the
 * spawn-time --max-workers. Null while the stored value is unchanged or outside 1..256.
 */
export function liveWorkerConcurrency(stored: number | null, lastStored: number): number | null {
  return stored !== lastStored && isDesiredWorkerCount(stored) ? stored : null;
}

function schedulerTickArgs(
  args: Map<string, string | true>,
  params: { runId: string },
): Map<string, string | true> {
  return cloneArgs(args, [
    ["--run-id", params.runId],
    ["--no-start-epoch", true],
  ]);
}

export async function runRunLoop(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  deps: RunLoopDeps = {},
): Promise<RunLoopResult> {
  const store = openState(globals.stateDir);
  const borrowedStore = borrowState(store);
  const gameId = globals.game?.gameId ?? globals.gameId;
  let observedRunId = "";
  const workerResults: WorkerResultSummary[] = [];
  const workerErrors: WorkerError[] = [];
  const schedulerResults: SchedulerTickResult[] = [];
  const knowledgeMaintenanceRuns: Record<string, unknown>[] = [];
  const knowledgeMaintenanceErrors: KnowledgeMaintenanceError[] = [];
  let runningScheduler: Promise<void> | null = null;
  let runningKnowledgeMaintenance: Promise<void> | null = null;
  let runningProviderProbe: Promise<void> | null = null;
  let startupSandboxReconciliation: Promise<unknown> | null = null;
  let stoppedReason = "running";
  let stopRequested = false;
  let iterations = 0;
  let idleIterations = 0;
  let workersStarted = 0;
  let integrationDrains = 0;
  let workerConsumerForCleanup: JobConsumerHandle | null = null;
  let runLoopFailure: unknown = null;
  let fatalStateError: unknown = null;
  let abandonedBackgroundBorrowers = 0;
  let stopWorkerSummary: ((options?: { maxWaitMs?: number }) => Promise<void>) | null = null;
  let stopLibrarianConsumer: ((options?: { maxWaitMs?: number }) => Promise<void>) | null = null;
  let modelNodeLanes: ModelNodeLanes | null = null;
  let runLoopWakeResolve: (() => void) | null = null;
  const stop = () => {
    stopRequested = true;
    stoppedReason = "signal";
  };
  const onFatalStateError = (
    cause: unknown,
    context: { job: JobRecord | null; operation: string },
  ): void => {
    if (fatalStateError || !isStateStoreClosedError(cause)) return;
    fatalStateError = cause;
    stopRequested = true;
    stoppedReason = "database_closed";
    const close = stateStoreCloseInfo(store);
    const observedStack = cause instanceof Error ? cause.stack ?? cause.message : String(cause);
    console.error(
      `[run-loop] shared StateStore closed during ${context.operation}` +
        `${context.job ? ` for ${context.job.jobId}` : ""}; exiting immediately\n` +
        `Close recorded at: ${close?.closedAt ?? "unknown"}\n` +
        `${close?.stack ?? "No StateStore close stack was recorded"}\n` +
        `Closed-database error:\n${observedStack}`,
    );
    runLoopWakeResolve?.();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const leaseId = stringArg(args, "--lease-id", "").trim();
    if (!leaseId) throw new Error("run-loop requires --lease-id");
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "run-loop");
    const sessionGameId = run.gameId ?? globals.game?.gameId ?? globals.gameId;
    if (!globals.dryRunAgents) assertSandboxAdmission(store, { game: globals.game, gameId: sessionGameId, profile: globals.sandboxProfile });
    const sandboxProvider = deps.sandboxProvider
      ?? (process.env.DAYTONA_API_KEY?.trim() ? new DaytonaSandboxProvider() : undefined);
    if (sessionGameId) {
      // Deleting a stalled Daytona sandbox can take minutes per sandbox. Reconciliation only
      // touches sandboxes listed before any claim, so workers start without waiting for it.
      startupSandboxReconciliation = reconcileSandboxes(store, { gameId: sessionGameId }, { sandboxProvider })
        .catch((cause) => console.warn("[sandbox] startup reconciliation failed", cause));
    }
    observedRunId = runId;
    setRunSchedulerCondition(store, runId, "idle");

    const maxIterations = booleanArg(args, "--once") ? 1 : numberArg(args, "--max-iterations", 0);
    const maxIdleIterations = numberArg(args, "--max-idle-iterations", 0);
    const idleSleepMs = numberArg(args, "--idle-sleep-ms", 5_000);
    const providerCircuit = createProviderCircuitBreaker(providerCircuitConfigFromArgs(args), {
      probe: deps.providerProbe ?? (() => probeWorkerProvider({ provider: globals.provider, model: globals.model })),
      emit: (event, payload) => {
        const eventId = addEvent(store, runId, event, "run-loop", {
          ...payload, provider: globals.provider, model: globals.model,
        });
        markEventHandled(store, eventId);
      },
    });
    const requestedMaxWorkers = numberArg(args, "--max-workers", run.desiredWorkers);
    let maxWorkers = Math.max(0, Math.min(run.desiredWorkers, requestedMaxWorkers));
    let observedDesiredWorkers = run.desiredWorkers;
    if (requestedMaxWorkers > run.desiredWorkers) {
      console.error(
        `[run-loop] --max-workers ${requestedMaxWorkers} exceeds run desired_workers ${run.desiredWorkers}; clamping to ${maxWorkers}. ` +
          `Raise the run's desired_workers (or re-init with --desired-workers) to use the full pool.`,
      );
    }
    const baseRev = resolveBaseRev(globals.repoRoot, stringArg(args, "--base-rev", "unknown"));
    const ttlSeconds = workerTtlSeconds(globals, args);
    const { sandboxSleep, sandboxSleepDebounceMs } = sandboxSleepConfigFromArgs(args);
    const postReturnCheckCommand = stringArg(args, "--post-return-check-command", "");
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    const writeSetFlags = writeSetIntegrationFlags(args);
    const nodeFlags = modelNodeFlags(args);
    recordRunLoopFlags(store, runId, { writeSetFlags, nodeFlags });
    stopWorkerSummary = startWorkerSummaryIfEnabled({
      args,
      store: borrowedStore,
      runId,
      globals,
      gameId,
      shouldClaim: () => !providerCircuit.isOpen() && getDispatchState(borrowedStore, gameId)?.active_workflow?.kind !== "sync",
      onFatalError: onFatalStateError,
      onShutdownAbandoned: (count) => {
        abandonedBackgroundBorrowers = Math.max(abandonedBackgroundBorrowers, count);
      },
    });
    stopLibrarianConsumer = startLibrarianConsumerIfEnabled({
      args,
      store: borrowedStore,
      runId,
      globals,
      gameId,
      shouldClaim: () => !providerCircuit.isOpen() && getDispatchState(borrowedStore, gameId)?.active_workflow?.kind !== "sync",
    });
    // Out-of-band model-node work (shadow adjudication, checkpoint knowledge):
    // durable jobs on their own lanes, never counted toward drain or idle exit.
    modelNodeLanes = startModelNodeLanesIfEnabled({
      store: borrowedStore,
      runId,
      globals,
      advisoryAdjudication: nodeFlags.advisoryAdjudication,
      checkpointKnowledgeFeed: nodeFlags.checkpointKnowledgeFeed === "on",
      checkpointKnowledgeCap: nodeFlags.checkpointKnowledgeCap,
      shouldClaim: () => !providerCircuit.isOpen() && getDispatchState(borrowedStore, gameId)?.active_workflow?.kind !== "sync",
      onFatalError: onFatalStateError,
      onShutdownAbandoned: (count) => {
        abandonedBackgroundBorrowers = Math.max(abandonedBackgroundBorrowers, count);
      },
    });
    const exitOnWorkerError = booleanArg(args, "--exit-on-worker-error");
    const workerThinkingLevel = stringArg(args, "--worker-thinking-level", globals.thinkingLevel);
    const workerConfigureCommand = stringArg(args, "--worker-configure-command", defaultConfigureCommand(globals));
    const maintenanceIntervalMs = knowledgeMaintenanceIntervalMs(globals, args);
    const epochSettlementEnabled = true;
    const schedulerEpochConfig = schedulerEpochConfigFromArgs(globals, args, { workerPoolSize: maxWorkers });
    const epochWorktreeDir = stringArg(args, "--epoch-worktree", resolve(globals.stateDir, "epoch_worktree"));
    const epochConfigureCommand = stringArg(args, "--epoch-configure-command", defaultConfigureCommand(globals));
    const epochLinkPaths = stringArg(args, "--epoch-link-paths", "orig")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean);
    const epochPauseThreshold = nonNegativeInt(numberArg(args, "--epoch-regression-pause-threshold", 12));
    const epochRequeueLimit = nonNegativeInt(numberArg(args, "--epoch-regression-requeue-limit", 32));
    const harnessDraftPrEnabled = !booleanArg(args, "--no-harness-draft-pr");
    const ciParityEnabled = !booleanArg(args, "--no-ci-parity");
    const preCommitGateEnabled = !booleanArg(args, "--no-pre-commit-gate");
    const preCommitAutofixEnabled = !booleanArg(args, "--no-precommit-autofix");
    const linkCompleteUnitsEnabled = booleanArg(args, "--link-complete-units");
    const boundarySyncEnabled = !booleanArg(args, "--no-boundary-sync");
    const syncMergePolicy = syncMergePolicyArg(args);
    const breakageGateEnabled = !booleanArg(args, "--no-breakage-gate");
    const boundaryBuildFixerEnabled = !booleanArg(args, "--no-boundary-build-fixer");
    const validation = globals.game?.validation;
    const boundaryRetry = {
      enabled: (validation?.epochBoundaryRetryEnabled ?? true) && !booleanArg(args, "--no-epoch-boundary-retry"),
      maxAttempts: Math.max(1, nonNegativeInt(numberArg(args, "--epoch-boundary-retry-max-attempts", validation?.epochBoundaryRetryMaxAttempts ?? 5))),
      baseMs: nonNegativeInt(numberArg(args, "--epoch-boundary-retry-base-ms", validation?.epochBoundaryRetryBaseMs ?? 120_000)),
      maxMs: nonNegativeInt(numberArg(args, "--epoch-boundary-retry-max-ms", validation?.epochBoundaryRetryMaxMs ?? 1_800_000)),
    };
    const fullKgMaintenanceMode = stringArg(args, "--full-kg-maintenance-mode", "full").trim().toLowerCase();
    let runningEpoch: Promise<void> | null = null;
    let epochsSettled = 0;
    let epochPaused = false;
    let lastEpoch: EpochSettlementResult | undefined;
    const epochErrors: EpochError[] = [];
    let epochTargetsMadeAvailable = 0;
    let epochAdmissions = 0;
    let epochAvailabilityRefreshes = 0;
    let epochTargetsAdmitted = 0;
    let lastSchedulerEpoch: EpochProgressSummary | null = null;
    const knowledgeMaintenanceClock = createKnowledgeMaintenanceClock(maintenanceIntervalMs);
    let schedulerBlocked = false;
    let boundaryRetryLogState: BoundaryRetryLogState | null = null;
    let runningIntegrationDrain: Promise<void> | null = null;
    let integrationFlushPending = false;
    const pendingSettleWork = new Set<Promise<void>>();
    let settleWake = new Promise<void>((resolveWake) => { runLoopWakeResolve = resolveWake; });
    const resetSettleWake = (): void => {
      settleWake = new Promise<void>((resolveWake) => { runLoopWakeResolve = resolveWake; });
    };
    const workerCtx: WorkerJobRunContext = {
      store: borrowedStore,
      globals,
      runId,
      dispatchLeaseId: leaseId,
      baseRev,
      ttlSeconds,
      sandboxSleep,
      sandboxSleepDebounceMs,
      concurrencyLimit: maxWorkers,
      thinkingLevel: workerThinkingLevel,
      postReturnCheckCommand,
      workerConfigureCommand,
      graphDbPath,
      writeSetFlags,
      advisoryAdjudication: nodeFlags.advisoryAdjudication,
      workerIdPrefix: "runloop",
    };
    const handleWorkerJobSettled = (
      job: JobRecord,
      settle: { status: "succeeded" | "failed"; error?: string; outcome?: TaskOutcome },
    ): void => {
      const workerStateId = typeof job.payload.worker_state_id === "string" ? job.payload.worker_state_id : "";
      const workerId = typeof job.payload.worker_id === "string" ? job.payload.worker_id : workerStateId || job.jobId;
      const row = workerStateId
        ? store.db.query(`SELECT lifecycle_status, summary_json, best_checkpoint_id, exact, error_summary
            FROM worker_state WHERE id = ?`).get(workerStateId) as Record<string, unknown> | undefined
        : undefined;
      let summary: Record<string, unknown> = {};
      try { summary = JSON.parse(String(row?.summary_json ?? "{}")) as Record<string, unknown>; } catch { /* malformed summaries are reported from error_summary */ }
      const summaryError = summary.error && typeof summary.error === "object" ? summary.error as Record<string, unknown> : undefined;
      const errorKind = typeof summaryError?.kind === "string" ? summaryError.kind : undefined;
      providerCircuit.recordClosure(errorKind);
      // Durable source enqueue (SQL only) so the loop can exit right after this worker.
      if (workerStateId) modelNodeLanes?.afterWorkerSettled(workerStateId);
      const error = settle.error ?? (typeof row?.error_summary === "string" ? row.error_summary : undefined);
      workerResults.push({
        workerStateId,
        lifecycleStatus: String(row?.lifecycle_status ?? (settle.status === "failed" ? "error" : "unknown")),
        bestCheckpointId: typeof row?.best_checkpoint_id === "string" ? row.best_checkpoint_id : null,
        exact: Boolean(row?.exact),
        error,
        errorKind,
      });
      workersStarted += 1;
      if (settle.status === "failed") {
        const recoveryFilters = workerJobClaimRecoveryFilters(job);
        let recoveryTask: Promise<void>;
        recoveryTask = recoverActiveClaims({
          globals,
          leaseId,
          store,
          runId,
          repoRoot: run.game?.repoRoot ?? globals.repoRoot,
          force: true,
          ...recoveryFilters,
          reason: `run-loop recovered failed worker job ${job.jobId}: ${(error ?? "unknown failure").slice(0, 500)}`,
          processIntegrations: false,
        }).then((recovery) => {
          const epochTargetId = typeof job.payload.claimed_epoch_target_id === "string"
            ? job.payload.claimed_epoch_target_id
            : "";
          if (epochTargetId) requeueAdmittedWorkerJob(store, epochTargetId);
          const ownershipSkip = recovery.skippedActiveClaims.find((claim) =>
            claim.claimId === recoveryFilters.claimIdFilter && claim.reason === "worker_id_filter"
          );
          if (ownershipSkip) {
            console.error(
              `[run-loop] claim ${String(ownershipSkip.claimId)} now owned by ${String(ownershipSkip.workerId)}; skipping recovery for failed job ${job.jobId}`,
            );
          }
          workerErrors.push({ workerId, error: recovery.recoveredClaims > 0 ? `${error ?? "worker job failed"} (recovered ${recovery.recoveredClaims} active claim(s))` : error ?? "worker job failed" });
        }).catch((recoveryError) => {
          workerErrors.push({ workerId, error: `${error ?? "worker job failed"}; claim recovery failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}` });
        }).finally(() => pendingSettleWork.delete(recoveryTask));
        pendingSettleWork.add(recoveryTask);
        if (exitOnWorkerError && errorKind !== "provider_outage") { stopRequested = true; stoppedReason = "worker_error"; }
      } else if (String(row?.lifecycle_status ?? "") === "error") {
        workerErrors.push({ workerId, error: error ?? `Worker state closed as ${String(row?.lifecycle_status)}` });
        if (exitOnWorkerError && errorKind !== "provider_outage") { stopRequested = true; stoppedReason = "worker_error"; }
      }
      integrationFlushPending = true;
      runLoopWakeResolve?.();
    };
    const workerDescriptor = workerJobDescriptor(workerCtx, {
      ...deps.workerJobDeps,
      sandboxProvider,
      trackSandboxDeletion: (deletion) => {
        pendingSettleWork.add(deletion);
        void deletion.finally(() => pendingSettleWork.delete(deletion));
      },
    });
    const workerConsumer = startJobConsumer(borrowedStore, workerDescriptor, workerKernelOps(workerCtx), {
      intervalMs: 1_000,
      actor: "runner",
      runId,
      shouldClaim: () => !(maxIterations > 0 && iterations >= maxIterations) && !schedulerBlocked && !epochPaused
        && !providerCircuit.isOpen()
        && !runningEpoch && !runningIntegrationDrain
        && (gameId ? getHarnessState(store.db, gameId)?.execution.desired : undefined) !== "paused",
      onFatalError: onFatalStateError,
      onJobSettled: handleWorkerJobSettled,
    });
    workerConsumerForCleanup = workerConsumer;
    const syncSchedulerCondition = (fallback: "planning" | "dispatching" | "waiting"): void => {
      setRunSchedulerCondition(
        store,
        runId,
        providerCircuit.isOpen() ? "waiting" : selectRunLoopSchedulerCondition({
          blocked: schedulerBlocked || epochPaused,
          boundary: Boolean(
            runningEpoch ||
              runningKnowledgeMaintenance ||
              runningIntegrationDrain,
          ),
          planning: Boolean(runningScheduler),
          fallback,
        }),
      );
    };
    while (!stopRequested) {
      const dispatchLease = heartbeatDispatch(store, {
        leaseId,
        gameId,
      });
      schedulerBlocked = dispatchLease.status === "blocked";
      // The consumer re-reads the descriptor limit every tick: a raise claims more,
      // a cut stops new claims and lets in-flight workers finish.
      const liveWorkers = liveWorkerConcurrency(withBusyRetry(() => readRunDesiredWorkers(store, runId)), observedDesiredWorkers);
      if (liveWorkers !== null) {
        observedDesiredWorkers = liveWorkers;
        if (liveWorkers !== maxWorkers) {
          console.error(`[run-loop] worker concurrency ${maxWorkers} -> ${liveWorkers}`);
          maxWorkers = liveWorkers;
          workerCtx.concurrencyLimit = liveWorkers;
          workerDescriptor.concurrencyLimit = liveWorkers;
          schedulerEpochConfig.workerPoolSize = liveWorkers;
        }
      }
      const desiredPause = (gameId ? getHarnessState(store.db, gameId)?.execution.desired : undefined) === "paused";
      syncSchedulerCondition("planning");
      let didWork = false;
      resetSettleWake();
      if (providerCircuit.isOpen() && !runningProviderProbe) {
        runningProviderProbe = providerCircuit.probeIfDue().then((probed) => {
          if (probed) runLoopWakeResolve?.();
        }).finally(() => {
          runningProviderProbe = null;
        });
      }
      const reaped = await reapWorkerJobs(store, workerCtx, { sandboxProvider });
      if (reaped.recovered > 0) {
        console.error(`[run-loop] reaped worker jobs and recovered ${reaped.recovered} active claim(s)`);
        didWork = true;
      }
      if (integrationFlushPending && !runningIntegrationDrain) {
        integrationFlushPending = false;
        let task: Promise<void>;
        task = processWorkerOutputIntegrationQueue({
          dryRun: globals.dryRunAgents,
          leaseId,
          repoRoot: globals.repoRoot,
          runId,
          stateDir: globals.stateDir,
          store,
        }).then((drainResult) => {
          integrationDrains += 1;
          // New workers base their sandboxes on the latest per-accept
          // integration commit; in-flight workers keep their original base.
          if (drainResult.headRev) workerCtx.baseRev = drainResult.headRev;
        })
          .catch((error) => console.error(`[run-loop] worker output integration drain failed: ${error instanceof Error ? error.message : String(error)}`))
          .finally(() => { if (runningIntegrationDrain === task) runningIntegrationDrain = null; });
        runningIntegrationDrain = task;
        didWork = true;
      }
      const noActiveWorkBeforeMaintenance = workerConsumer.inFlight() === 0 && pendingSettleWork.size === 0 && !integrationFlushPending;
      const boundaryWorkPendingBeforeMaintenance = epochBoundaryWorkPending(store, runId, new Date(), noActiveWorkBeforeMaintenance);
      const blockingIntegrationsBeforeMaintenance = blockingWorkerOutputIntegrationCount(store, runId);

      if (
        !providerCircuit.isOpen() &&
        !runningKnowledgeMaintenance &&
        !boundaryWorkPendingBeforeMaintenance &&
        blockingIntegrationsBeforeMaintenance === 0 &&
        knowledgeMaintenanceClock.isDue()
      ) {
        let task: Promise<void>;
        task = runKnowledgeMaintenance(globals, knowledgeMaintenanceArgs(args, runId, !globals.dryRunAgents), {
          progress: knowledgeProgressReporter(store, runId, { lane: "scheduled", mode: globals.dryRunAgents ? "dry_run" : "full", repoRoot: globals.repoRoot }),
          stateStore: borrowedStore,
        })
          .then((result) => {
            knowledgeMaintenanceRuns.push(result);
          })
          .catch((error) => {
            knowledgeMaintenanceErrors.push({ error: error instanceof Error ? error.message : String(error) });
          })
          .finally(() => {
            knowledgeMaintenanceClock.markCompleted();
            if (runningKnowledgeMaintenance === task) runningKnowledgeMaintenance = null;
          });
        runningKnowledgeMaintenance = task;
        syncSchedulerCondition("planning");
        didWork = true;
      }

      let emptyEpochBoundaryLaunched = false;
      const launchEpochSettlement = (trigger: string, schedulerEpochId?: string): void => {
        syncSchedulerCondition("planning");
        const epochOrdinal = epochOrdinalForBoundary(store, schedulerEpochId, epochsSettled + 1);
        const baseRevAtBoundaryStart = workerCtx.baseRev;
        let task: Promise<void>;
        task = runEpochBoundary({
          store,
          globals,
          args,
          runId,
          leaseId,
          trigger,
          schedulerEpochId,
          epochOrdinal,
          config: {
            epochConfigureCommand,
            epochLinkPaths,
            epochPauseThreshold,
            epochRequeueLimit,
            harnessDraftPrEnabled,
            ciParityEnabled,
            preCommitGateEnabled,
            preCommitAutofixEnabled,
            linkCompleteUnitsEnabled,
            boundarySyncEnabled,
            syncMergePolicy,
            breakageGateEnabled,
            boundaryBuildFixerEnabled,
            fullKgMaintenanceMode,
            writeSetFlags,
            schedulerEpochConfig,
            graphDbPath,
            epochWorktreeDir,
            boundaryRetry,
          },
          reportKnowledgeProgress: knowledgeProgressReporter,
        })
          .then((outcome) => {
            // Fresh or reconciled: enqueue this epoch's knowledge jobs now (SQL
            // only); the lane's catch-up reads stored rows, so it is idempotent.
            modelNodeLanes?.afterEpochBoundary(schedulerEpochId);
            // Workers base new worktrees on the latest epoch boundary commit.
            // Compare-and-set: the boundary sha was captured at snapshot time,
            // so if an integration drain or resolver advanced baseRev during
            // the (long) report build, the newer value wins.
            if (outcome.boundaryHeadSha && workerCtx.baseRev === baseRevAtBoundaryStart) {
              workerCtx.baseRev = outcome.boundaryHeadSha;
            }
            if (globals.dryRunAgents || outcome.boundaryResult || outcome.reconciled) epochsSettled += 1;
            if (outcome.boundaryResult) {
              lastEpoch = outcome.boundaryResult;
              epochPaused = outcome.paused || outcome.boundaryResult.repair.paused;
            }
            if (outcome.error) epochErrors.push({ error: outcome.error });
            if (outcome.ok && outcome.paused) {
              epochPaused = true;
              stopRequested = true;
              stoppedReason = "paused";
            }
            if (outcome.terminal) {
              epochPaused = true;
              schedulerBlocked = true;
              stopRequested = true;
              stoppedReason = "epoch_boundary_retry_exhausted";
            }
            if (outcome.knowledgeMaintenanceRun) knowledgeMaintenanceRuns.push(outcome.knowledgeMaintenanceRun);
            if (outcome.nextEpoch) {
              const nextEpoch = outcome.nextEpoch;
              lastSchedulerEpoch = nextEpoch.progress;
              epochAdmissions += nextEpoch.admission?.admitted ?? 0;
              epochTargetsAdmitted += nextEpoch.admission?.admitted ?? 0;
              epochTargetsMadeAvailable += nextEpoch.admission?.admitted ?? 0;
              if ((nextEpoch.admission?.admitted ?? 0) > 0) {
                didWork = true;
              }
            }
          })
          .finally(() => {
            if (runningEpoch === task) runningEpoch = null;
          });
        runningEpoch = task;
      };
      // A boundary must not launch while a worker-output drain is applying:
      // the same iteration that settles the last worker starts a drain, and
      // the boundary's blocking-integration check would then throw a spurious
      // error epoch. The drain finishes fast; the next iteration launches.
      if (epochSettlementEnabled && !runningIntegrationDrain && !providerCircuit.isOpen()) {
        const boundaryError = boundaryErrorEpoch(store, runId);
        if (shouldEvaluateEpochBoundary({
          boundaryError: Boolean(boundaryError),
          epochPaused,
          runningEpoch: Boolean(runningEpoch),
        })) {
          const noActiveWork = workerConsumer.inFlight() === 0 && pendingSettleWork.size === 0 && !integrationFlushPending;
          const boundarySettled = boundaryError && isBoundarySettled(boundaryError, noActiveWork);
          const boundaryRetryDue = boundaryError && (!boundaryError.nextAttemptAt || Date.parse(boundaryError.nextAttemptAt) <= Date.now());
          if (boundaryError?.terminal) {
            epochPaused = true;
            schedulerBlocked = true;
            stopRequested = true;
            stoppedReason = "epoch_boundary_retry_exhausted";
          } else if (boundaryError && boundarySettled && boundaryRetryDue) {
            if (boundaryError.nextAttemptAt) {
              const transition = boundaryRetryLogTransition(boundaryRetryLogState, {
                ordinal: boundaryError.ordinal,
                nextAttemptAt: boundaryError.nextAttemptAt,
              }, "due");
              boundaryRetryLogState = transition.state;
              if (transition.message) console.error(transition.message);
            }
            didWork = true;
            launchBoundaryRetryIfDue(store, runId, launchEpochSettlement, Date.now(), noActiveWork);
          } else if (boundaryError && boundarySettled) {
            schedulerBlocked = true;
            syncSchedulerCondition("waiting");
          } else if (boundaryError) {
            didWork = true;
            schedulerBlocked = true;
            syncSchedulerCondition("planning");
            addEvent(store, runId, "epoch_boundary_waiting_for_recovery", "run-loop", {
              epoch_id: boundaryError.id,
              ordinal: boundaryError.ordinal,
              admitted: boundaryError.admitted,
              finished: boundaryError.finished,
              created_by: "run-loop",
            });
            console.error(
              `[run-loop] epoch ${boundaryError.ordinal}: boundary is still failed but only ${boundaryError.finished}/${boundaryError.admitted} targets are finished; waiting before admitting a new epoch`,
            );
          } else if (desiredPause) {
            // Stop claiming immediately, then capture a partial epoch only
            // after workers, their settlement callbacks, and integration drain.
            if (workerConsumer.inFlight() === 0 && pendingSettleWork.size === 0 && !integrationFlushPending) {
              const settledEpoch = activeSchedulerEpoch(store, runId);
              if (settledEpoch) {
                didWork = true;
                launchEpochSettlement("pause requested after active claims settled", settledEpoch.id);
              } else {
                stopRequested = true;
                stoppedReason = "paused";
              }
            }
          } else if (!epochPaused) {
            const epochResult = ensureSchedulerEpochFromBoard({
              config: schedulerEpochConfig,
              globals,
              graphDbPath,
              runId,
              store,
            });
            const jobCoverageRepair = reconcileOrphanedEpochTargets(store, epochResult.epoch, epochResult.progress);
            if (jobCoverageRepair.added > 0 || jobCoverageRepair.removed > 0) {
              didWork = true;
            }
            lastSchedulerEpoch = epochResult.progress;
            epochAvailabilityRefreshes += 1;
            const admittedNow = epochResult.admission?.admitted ?? 0;
            const madeAvailableNow = epochResult.admission?.admitted ?? 0;
            if (admittedNow > 0) {
              epochAdmissions += 1;
              epochTargetsAdmitted += admittedNow;
            }
            if (madeAvailableNow > 0) didWork = true;
            epochTargetsMadeAvailable += madeAvailableNow;

            if (admittedNow > 0) {
              console.error(
                `[run-loop] epoch ${epochResult.progress.ordinal}: admitted ${admittedNow} new target(s); ` +
                  `${epochResult.progress.admitted} admitted, ${epochResult.progress.available} available`,
              );
              addEvent(store, runId, "epoch_admitted", "run-loop", {
                epoch_id: epochResult.epoch.id,
                ordinal: epochResult.progress.ordinal,
                admitted: epochResult.progress.admitted,
                admitted_now: admittedNow,
                available: epochResult.progress.available,
                created_by: "run-loop",
              });
            }

            if (
              epochResult.progress.remaining === 0 &&
              epochResult.progress.claimed === 0 &&
              workerConsumer.inFlight() === 0
            ) {
              didWork = true;
              emptyEpochBoundaryLaunched = epochResult.progress.admitted === 0;
              launchEpochSettlement(`scheduler epoch ${epochResult.progress.ordinal} completed`, epochResult.epoch.id);
            }
          }
        }
      }

      const schedulerEvent = nextUnhandledEvent(store, runId);
      if (!providerCircuit.isOpen() && !schedulerBlocked && !desiredPause && !runningEpoch && !runningIntegrationDrain && !runningScheduler && schedulerEvent) {
        const tickArgs = schedulerTickArgs(args, { runId });
        let task: Promise<void>;
        task = runSchedulerTick(globals, tickArgs, { ownsSchedulerCondition: false })
          .then((result) => {
            schedulerResults.push(result);
            if (result.schedulerEpoch) lastSchedulerEpoch = result.schedulerEpoch;
            const admittedByTick = result.epochAdmission?.admitted ?? 0;
            if (admittedByTick > 0) {
              epochAdmissions += 1;
              epochTargetsAdmitted += admittedByTick;
            }
            epochTargetsMadeAvailable += result.epochAdmission?.admitted ?? 0;
            if (result.epochAvailabilityRefresh) epochAvailabilityRefreshes += 1;
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            schedulerResults.push({
              runId,
              eventType: "scheduler_error",
              eventProducer: message,
            });
            if (message.startsWith("Epoch admission refused:")) {
              schedulerBlocked = true;
              epochPaused = true;
              console.error(`[run-loop] ${message}`);
            }
          })
          .finally(() => {
            if (runningScheduler === task) runningScheduler = null;
          });
        runningScheduler = task;
        syncSchedulerCondition("planning");
        didWork = true;
      }

      if (!providerCircuit.isOpen() && (didWork || workerConsumer.inFlight() === 0)) iterations += 1;
      if (providerCircuit.isOpen() || didWork || workerConsumer.inFlight() > 0 || runningEpoch || runningIntegrationDrain) idleIterations = 0;
      else idleIterations += 1;

      if (!providerCircuit.isOpen() && maxIdleIterations > 0 && idleIterations >= maxIdleIterations && unhandledEventCount(store, runId) === 0) {
        stoppedReason = "idle";
        break;
      }
      if (!providerCircuit.isOpen() && maxIterations > 0 && iterations >= maxIterations && workerConsumer.inFlight() === 0 && !runningEpoch && !runningIntegrationDrain && pendingSettleWork.size === 0) {
        stoppedReason = "max_iterations";
        break;
      }
      syncSchedulerCondition("waiting");
      const noActiveWorkAtRest = workerConsumer.inFlight() === 0 && pendingSettleWork.size === 0 && !integrationFlushPending;
      const retryRest = providerCircuit.isOpen() ? null : boundaryRetryRest(store, runId, idleSleepMs, Date.now(), noActiveWorkAtRest);
      // Keep heartbeating and checking probe deadlines even with a long normal idle sleep.
      const restingSleepMs = providerCircuit.isOpen() ? Math.min(Math.max(1, idleSleepMs), 1_000) : retryRest?.sleepMs ?? idleSleepMs;
      if (retryRest) {
        const transition = boundaryRetryLogTransition(boundaryRetryLogState, retryRest, "waiting", restingSleepMs);
        boundaryRetryLogState = transition.state;
        if (transition.message) console.error(transition.message);
      }
      await waitForRestingTrigger(restingSleepMs, [
        settleWake,
        emptyEpochBoundaryLaunched ? null : runningEpoch,
        runningIntegrationDrain,
        runningKnowledgeMaintenance,
        runningScheduler,
      ]);
    }

    if (workerConsumer.inFlight() > 0) {
      // A stopped pool must not wedge for hours awaiting worker TTLs (workers
      // ignore SIGTERM). Give in-flight workers a short grace, then kill them;
      // claim recovery returns any interrupted active targets to admitted state.
      addEvent(store, runId, "pool_stopping", "run-loop", {
        reason: stoppedReason,
        running_workers: workerConsumer.inFlight(),
        created_by: "run-loop",
      });
      const grace = new Promise<void>((resolveGrace) => setTimeout(resolveGrace, 30_000));
      const stopPromise = workerConsumer.stop();
      await Promise.race([stopPromise, grace]);
      if (workerConsumer.inFlight() > 0) await workerConsumer.cancelAll();
      await stopPromise;
    } else {
      await workerConsumer.stop();
    }
    if (pendingSettleWork.size > 0) await Promise.allSettled([...pendingSettleWork]);
    if (runningIntegrationDrain) await runningIntegrationDrain;
    if (integrationFlushPending) {
      const finalDrain = await processWorkerOutputIntegrationQueue({
        dryRun: globals.dryRunAgents,
        leaseId,
        repoRoot: globals.repoRoot,
        runId,
        stateDir: globals.stateDir,
        store,
      });
      if (finalDrain.headRev) workerCtx.baseRev = finalDrain.headRev;
      integrationDrains += 1;
      integrationFlushPending = false;
    }
    if (runningEpoch) await runningEpoch;
    if (runningScheduler) await runningScheduler;
    if (runningKnowledgeMaintenance) await runningKnowledgeMaintenance;
    if (runningProviderProbe) await runningProviderProbe;
    if (stoppedReason === "running") stoppedReason = "complete";
    const finalActiveSchedulerEpoch = activeSchedulerEpoch(store, runId);
    const finalSchedulerEpoch = lastSchedulerEpoch ?? (finalActiveSchedulerEpoch ? schedulerEpochProgress(store, finalActiveSchedulerEpoch.id) : null);

    return {
      runId,
      mode: "run_loop",
      stoppedReason,
      iterations,
      idleIterations,
      desiredWorkers: observedDesiredWorkers,
      maxWorkers,
      schedulerTicks: schedulerResults.filter((result) => result.status !== "no_unhandled_events").length,
      epochSettlement: epochSettlementEnabled,
      epochsSettled,
      schedulerEpoch: finalSchedulerEpoch,
      epochAdmissions,
      epochAvailabilityRefreshes,
      epochTargetsAdmitted,
      epochErrors,
      epochPaused,
      lastEpoch,
      epochTargetsMadeAvailable,
      workersStarted,
      workerResults,
      workerErrors,
      knowledgeMaintenanceRuns,
      knowledgeMaintenanceErrors,
      integrationDrains,
      dryRun: globals.dryRunAgents,
      finalStatus: {
        activeWorkers: activeWorkerCount(store, runId),
        admittedTargets: admittedTargetCount(store, runId),
        schedulableTargets: schedulableTargetCount(store, runId),
        unhandledEvents: unhandledEventCount(store, runId),
      },
    };
  } catch (cause) {
    runLoopFailure = cause;
    if (isStateStoreClosedError(cause)) {
      onFatalStateError(cause, { job: null, operation: "run-loop" });
    }
    throw cause;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    if ((runLoopFailure || fatalStateError) && workerConsumerForCleanup?.inFlight()) {
      try {
        await workerConsumerForCleanup.cancelAll();
      } catch (cause) {
        console.error(`[run-loop] worker cancellation during error cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    if (workerConsumerForCleanup) {
      try {
        await workerConsumerForCleanup.stop();
      } catch (cause) {
        console.error(`[run-loop] worker consumer cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    if (runningProviderProbe) await runningProviderProbe;
    if (startupSandboxReconciliation) await startupSandboxReconciliation;
    if (stopWorkerSummary) await stopWorkerSummary({ maxWaitMs: 15_000 });
    if (stopLibrarianConsumer) await stopLibrarianConsumer({ maxWaitMs: 15_000 });
    // Final synchronous catch-up of both kinds, then stop the lanes.
    if (modelNodeLanes) await modelNodeLanes.stop({ maxWaitMs: 15_000 });
    const closed = stateStoreCloseInfo(store);
    if (observedRunId && !closed) {
      try {
        setRunSchedulerCondition(store, observedRunId, "idle");
      } catch (cause) {
        if (isStateStoreClosedError(cause)) onFatalStateError(cause, { job: null, operation: "scheduler-condition-cleanup" });
        else throw cause;
      }
    }
    if (!stateStoreCloseInfo(store) && abandonedBackgroundBorrowers === 0) {
      store.db.close();
    } else if (!stateStoreCloseInfo(store) && abandonedBackgroundBorrowers > 0) {
      console.warn("[run-loop] leaving StateStore owner open because background knowledge still borrows it");
    }
  }
}

export async function runLoop(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const leaseId = stringArg(args, "--lease-id", "").trim();
  let stoppedReason = "error";
  let result: RunLoopResult | undefined;
  let runError: unknown = null;
  try {
    result = await runRunLoop(globals, args);
    stoppedReason = result.stoppedReason;
  } catch (cause) {
    runError = cause;
    if (isStateStoreClosedError(cause)) stoppedReason = "database_closed";
  }
  try {
    await settleRunOnExit({ globals, args, leaseId, stoppedReason });
  } catch (settlementError) {
    if (!runError) throw settlementError;
    console.error(
      `[run-loop] exit settlement failed after preserving the original run-loop error: ` +
        `${settlementError instanceof Error ? settlementError.stack ?? settlementError.message : String(settlementError)}`,
    );
  }
  if (runError) throw runError;
  if (!result) throw new Error("run-loop finished without a result");
  console.log(JSON.stringify(result, null, 2));
}
