import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resourceGraphDbPath } from "@server/core/knowledge";
import { getHarnessState, heartbeatDispatch } from "@server/core/harness-state";
import {
  activeWorkerCount,
  activeSchedulerEpoch,
  addEvent,
  blockingWorkerOutputIntegrationCount,
  getLatestRun,
  getRun,
  markEventHandled,
  nextUnhandledEvent,
  openState,
  admittedTargetCount,
  schedulerEpochProgress,
  schedulableTargetCount,
  setRunSchedulerCondition,
  unhandledEventCount,
  workerOutputIntegrationConflictsForResolver,
  borrowState,
  isStateStoreClosedError,
  stateStoreCloseInfo,
  type WorkerOutputIntegrationRecord,
  type EpochProgressSummary,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import { withBusyRetry } from "@server/core/orchestrator-state";
import type { EpochCycleResult } from "@server/core/cycle-runtime/phases/running/epochs";
import { integrationResolve, processWorkerOutputIntegrationQueue } from "@server/core/cycle-runtime/phases/running/integration";
import {
  booleanArg,
  numberArg,
  stringArg,
  writeSetIntegrationFlags,
  type GlobalArgs,
} from "@server/core/game-registry/runtime-options.js";
import { assertSchedulableRun } from "@server/core/cycle-runtime/phases/running/jobs/shared.js";
import { settleRunOnExit } from "@server/core/cycle-runtime/phases/running/jobs/settle-supervised-run.js";
import {
  ensureSchedulerEpochFromBoard,
  reconcileOrphanedEpochTargets,
  runSchedulerTick,
  schedulerEpochConfigFromArgs,
  type SchedulerTickResult,
} from "@server/core/cycle-runtime/phases/running/scheduler/tick.js";
import { resolveBaseRev } from "@server/core/cycle-runtime/phases/running/workers/worker-cycle.js";
import { startJobConsumer, type JobConsumerHandle } from "@server/core/job-queue/consumer.js";
import { defaultConfigureCommand } from "@server/core/job-queue/executor.js";
import { reconcileSandboxes } from "@server/core/job-queue/sandbox-lifecycle.js";
import { DaytonaSandboxProvider, type SandboxProvider } from "@server/core/job-queue/sandbox.js";
import type { JobRecord, TaskOutcome } from "@server/core/job-queue/types.js";
import {
  DEFAULT_SANDBOX_SLEEP_DEBOUNCE_MS,
  reapWorkerJobs,
  workerJobDescriptor,
  workerKernelOps,
  type WorkerJobRunContext,
} from "@server/core/cycle-runtime/phases/running/workers/worker-job.js";
import { runKnowledgeMaintenance, type KnowledgeMaintenanceProgressEvent } from "@server/core/knowledge/jobs/kg.js";
import { kgLibrarianCondense } from "@server/core/knowledge/jobs/librarian.js";
import { startBackgroundKnowledgeProcessor } from "@server/core/knowledge/background/index.js";
import { createBackgroundKnowledgeTraceHooks } from "@server/core/knowledge/background/trace.js";
import { recoverActiveClaims } from "@server/core/cycle-runtime/phases/running/jobs/recover-claims.js";
import { workerTtlSeconds } from "@server/core/cycle-runtime/phases/running/worker-ttl.js";
import { runEpochBoundary } from "./epoch-boundary.js";

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

interface KnowledgeMaintenanceError {
  error: string;
}

interface EpochError {
  error: string;
}

interface IntegrationResolverError {
  itemId: string;
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
  epochCycle: boolean;
  epochCycles: number;
  schedulerEpoch?: EpochProgressSummary | null;
  epochAdmissions: number;
  epochAvailabilityRefreshes: number;
  epochTargetsAdmitted: number;
  epochErrors: EpochError[];
  epochPaused: boolean;
  lastEpoch?: EpochCycleResult;
  epochPriorityRefreshes: number;
  epochTargetsMadeAvailable: number;
  workersStarted: number;
  workerResults: WorkerResultSummary[];
  workerErrors: WorkerError[];
  knowledgeMaintenanceRuns: Record<string, unknown>[];
  knowledgeMaintenanceErrors: KnowledgeMaintenanceError[];
  integrationResolverRuns: Record<string, unknown>[];
  integrationResolverErrors: IntegrationResolverError[];
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
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
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

export function epochBoundaryWorkPending(store: StateStore, runId: string, at = new Date()): boolean {
  const activeEpoch = activeSchedulerEpoch(store, runId);
  if (activeEpoch) {
    const progress = schedulerEpochProgress(store, activeEpoch.id);
    return progress.remaining === 0 && progress.claimed === 0;
  }
  const failedBoundary = boundaryErrorEpoch(store, runId);
  return failedBoundary !== null &&
    !failedBoundary.terminal &&
    failedBoundary.finished >= failedBoundary.admitted &&
    (!failedBoundary.nextAttemptAt || Date.parse(failedBoundary.nextAttemptAt) <= at.getTime());
}

function autoIntegrationResolverEnabled(args: Map<string, string | true>): boolean {
  return !booleanArg(args, "--no-integration-resolver");
}

function integrationResolverArgs(args: Map<string, string | true>, runId: string, record: WorkerOutputIntegrationRecord): Map<string, string | true> {
  const itemPath = record.itemPath ?? "";
  const queueSummaryPath = typeof record.metadata.queue_summary_path === "string" ? record.metadata.queue_summary_path : "";
  const entries: [string, string | true][] = [
    ["--run-id", runId],
    ["--item-file", itemPath],
  ];
  if (queueSummaryPath && existsSync(queueSummaryPath)) entries.push(["--queue-summary-file", queueSummaryPath]);
  return cloneArgs(args, entries);
}

function looksLikePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "patch failed") return false;
  return trimmed.includes("/") || /\.[A-Za-z0-9_+-]+$/.test(trimmed);
}

export function integrationResolverLockPaths(record: Pick<WorkerOutputIntegrationRecord, "conflictPaths" | "id" | "targetKey" | "writeSet">): string[] {
  const paths = [...record.writeSet, ...record.conflictPaths]
    .map((path) => path.trim())
    .filter(looksLikePath);
  const unique = [...new Set(paths)];
  return unique.length > 0 ? unique : [record.targetKey ?? record.id];
}

interface IntegrationResolverSelectionRecord extends Pick<WorkerOutputIntegrationRecord, "conflictPaths" | "id" | "targetKey" | "writeSet"> {}

export function selectIntegrationResolverBatch<T extends IntegrationResolverSelectionRecord>(params: {
  candidates: T[];
  activeLockPaths?: Iterable<string>;
  concurrency: number;
  runningCount?: number;
}): { record: T; lockPaths: string[] }[] {
  const concurrency = Math.max(1, Math.floor(params.concurrency));
  const runningCount = Math.max(0, Math.floor(params.runningCount ?? 0));
  const slots = Math.max(0, concurrency - runningCount);
  if (slots === 0) return [];
  const activeLockPaths = new Set(params.activeLockPaths ?? []);
  const selected: { record: T; lockPaths: string[] }[] = [];
  for (const candidate of params.candidates) {
    if (selected.length >= slots) break;
    const lockPaths = integrationResolverLockPaths(candidate);
    if (lockPaths.some((path) => activeLockPaths.has(path))) continue;
    selected.push({ record: candidate, lockPaths });
    for (const path of lockPaths) activeLockPaths.add(path);
  }
  return selected;
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
    "--curator-agent-batch-size",
    "--curator-agent-jobs",
    "--curator-agent-record-limit",
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
    "--run-curator-agent",
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
): { ordinal: number; nextAttemptAt: string; sleepMs: number } | null {
  const boundaryError = boundaryErrorEpoch(store, runId);
  if (
    !boundaryError ||
    boundaryError.terminal ||
    boundaryError.finished < boundaryError.admitted ||
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
): boolean {
  const boundaryError = boundaryErrorEpoch(store, runId);
  if (
    !boundaryError ||
    boundaryError.terminal ||
    boundaryError.finished < boundaryError.admitted ||
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
  const integrationResolverRuns: Record<string, unknown>[] = [];
  const integrationResolverErrors: IntegrationResolverError[] = [];
  const runningIntegrationResolvers = new Map<string, Promise<void>>();
  const runningIntegrationResolverPaths = new Map<string, string[]>();
  let runningScheduler: Promise<void> | null = null;
  let runningKnowledgeMaintenance: Promise<void> | null = null;
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
  const stopBackgroundKnowledge = startBackgroundKnowledgeProcessor(
    borrowedStore,
    async (backgroundJob) => {
      const publication = await kgLibrarianCondense(globals, new Map<string, string | true>([
        ["--worker-state-id", backgroundJob.workerStateId],
        ["--run-id", typeof backgroundJob.provenance.run_id === "string" ? backgroundJob.provenance.run_id : ""],
      ]));
      return publication;
    },
    // The run loop is a CLI process with no DashboardKernelRuntimeService, so
    // the hooks reach the kernel through the default runtime directly.
    {
      gameId,
      onFatalError: onFatalStateError,
      onShutdownAbandoned: (count) => { abandonedBackgroundBorrowers = count; },
      shouldClaim: () => getHarnessState(borrowedStore, gameId)?.active_workflow?.kind !== "sync",
      trace: createBackgroundKnowledgeTraceHooks(borrowedStore),
    },
  );

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
    const sandboxProvider = deps.sandboxProvider
      ?? (process.env.DAYTONA_API_KEY?.trim() ? new DaytonaSandboxProvider() : undefined);
    if (sessionGameId) {
      await reconcileSandboxes(store, { gameId: sessionGameId }, { sandboxProvider });
    }
    observedRunId = runId;
    setRunSchedulerCondition(store, runId, "idle");

    const maxIterations = booleanArg(args, "--once") ? 1 : numberArg(args, "--max-iterations", 0);
    const maxIdleIterations = numberArg(args, "--max-idle-iterations", 0);
    const idleSleepMs = numberArg(args, "--idle-sleep-ms", 5_000);
    const requestedMaxWorkers = numberArg(args, "--max-workers", run.desiredWorkers);
    const maxWorkers = Math.max(0, Math.min(run.desiredWorkers, requestedMaxWorkers));
    const integrationResolverConcurrency = Math.max(1, Math.floor(numberArg(args, "--integration-resolver-concurrency", 4)));
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
    if (writeSetFlags.writeSetWidening !== "off") {
      const flagEvent = addEvent(store, runId, "write_set_integration_flags", "run-loop", {
        write_set_widening: writeSetFlags.writeSetWidening,
        created_by: "run-loop",
      });
      markEventHandled(store, flagEvent);
    }
    const exitOnWorkerError = booleanArg(args, "--exit-on-worker-error");
    const workerThinkingLevel = stringArg(args, "--worker-thinking-level", globals.thinkingLevel);
    const workerConfigureCommand = stringArg(args, "--worker-configure-command", defaultConfigureCommand(globals));
    const maintenanceIntervalMs = knowledgeMaintenanceIntervalMs(globals, args);
    const epochCycleEnabled = true;
    const schedulerEpochConfig = schedulerEpochConfigFromArgs(globals, args, { workerPoolSize: maxWorkers });
    const epochWorktreeDir = stringArg(args, "--epoch-worktree", resolve(globals.stateDir, "epoch_worktree"));
    const epochConfigureCommand = stringArg(args, "--epoch-configure-command", defaultConfigureCommand(globals));
    const epochLinkPaths = stringArg(args, "--epoch-link-paths", "orig")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean);
    const epochPauseThreshold = nonNegativeInt(numberArg(args, "--epoch-regression-pause-threshold", 12));
    const epochRequeueLimit = nonNegativeInt(numberArg(args, "--epoch-regression-requeue-limit", 32));
    const cycleDraftPrEnabled = !booleanArg(args, "--no-cycle-draft-pr");
    const ciParityEnabled = !booleanArg(args, "--no-ci-parity");
    const preCommitGateEnabled = !booleanArg(args, "--no-pre-commit-gate");
    const preCommitAutofixEnabled = !booleanArg(args, "--no-precommit-autofix");
    const linkCompleteUnitsEnabled = booleanArg(args, "--link-complete-units");
    const boundarySyncEnabled = !booleanArg(args, "--no-boundary-sync");
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
    let epochCycles = 0;
    let epochPaused = false;
    let lastEpoch: EpochCycleResult | undefined;
    const epochErrors: EpochError[] = [];
    let epochPriorityRefreshes = 0;
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
        let recoveryTask: Promise<void>;
        recoveryTask = recoverActiveClaims({
          globals,
          leaseId,
          store,
          runId,
          repoRoot: run.game?.repoRoot ?? globals.repoRoot,
          force: true,
          claimIdFilter: typeof job.payload.target_claim_id === "string" ? job.payload.target_claim_id : undefined,
          reason: `run-loop recovered failed worker job ${job.jobId}: ${(error ?? "unknown failure").slice(0, 500)}`,
          processIntegrations: false,
        }).then((recovery) => {
          workerErrors.push({ workerId, error: recovery.recoveredClaims > 0 ? `${error ?? "worker job failed"} (recovered ${recovery.recoveredClaims} active claim(s))` : error ?? "worker job failed" });
        }).catch((recoveryError) => {
          workerErrors.push({ workerId, error: `${error ?? "worker job failed"}; claim recovery failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}` });
        }).finally(() => pendingSettleWork.delete(recoveryTask));
        pendingSettleWork.add(recoveryTask);
        if (exitOnWorkerError) { stopRequested = true; stoppedReason = "worker_error"; }
      } else if (String(row?.lifecycle_status ?? "") === "error") {
        workerErrors.push({ workerId, error: error ?? `Worker state closed as ${String(row?.lifecycle_status)}` });
        if (exitOnWorkerError) { stopRequested = true; stoppedReason = "worker_error"; }
      }
      integrationFlushPending = true;
      runLoopWakeResolve?.();
    };
    const workerDescriptor = workerJobDescriptor(workerCtx, {
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
      shouldClaim: () => !(maxIterations > 0 && iterations >= maxIterations) && !schedulerBlocked && !epochPaused,
      onFatalError: onFatalStateError,
      onJobSettled: handleWorkerJobSettled,
    });
    workerConsumerForCleanup = workerConsumer;
    const syncSchedulerCondition = (fallback: "planning" | "dispatching" | "waiting"): void => {
      setRunSchedulerCondition(
        store,
        runId,
        selectRunLoopSchedulerCondition({
          blocked: schedulerBlocked || epochPaused,
          boundary: Boolean(
            runningEpoch ||
              runningKnowledgeMaintenance ||
              runningIntegrationDrain ||
              runningIntegrationResolvers.size > 0,
          ),
          planning: Boolean(runningScheduler),
          fallback,
        }),
      );
    };
    const launchIntegrationResolver = (record: WorkerOutputIntegrationRecord, lockPaths: string[]): void => {
      if (!record.itemPath || runningIntegrationResolvers.has(record.id)) return;
      console.error(`[run-loop] resolving worker integration conflict ${record.id} (${record.targetKey ?? "unknown target"})`);
      addEvent(store, runId, "worker_integration_resolver_started", "run-loop", {
        id: record.id,
        item_id: record.id,
        item_path: record.itemPath,
        lock_paths: lockPaths,
        target_key: record.targetKey,
        phase: "integration_resolver",
        status: "started",
        message: `integration resolver started for ${record.targetKey ?? record.id}`,
        created_by: "run-loop",
      });
      let task: Promise<void>;
      runningIntegrationResolverPaths.set(record.id, lockPaths);
      task = integrationResolve(globals, integrationResolverArgs(args, runId, record))
        .then((resolveOutcome) => {
          integrationResolverRuns.push({
            item_id: record.id,
            lock_paths: lockPaths,
            target_key: record.targetKey,
            item_path: record.itemPath,
            status: resolveOutcome.status,
            resolved_commit: resolveOutcome.committedSha,
          });
          // A resolved conflict is committed harness-side; base new workers on it.
          if (resolveOutcome.committedSha) workerCtx.baseRev = resolveOutcome.committedSha;
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          integrationResolverErrors.push({ itemId: record.id, error: message });
          console.error(`[run-loop] integration resolver ${record.id} failed: ${message}`);
          addEvent(store, runId, "worker_integration_resolver_failed", "run-loop", {
            id: record.id,
            item_id: record.id,
            item_path: record.itemPath,
            lock_paths: lockPaths,
            target_key: record.targetKey,
            phase: "integration_resolver",
            status: "error",
            message: `integration resolver failed for ${record.targetKey ?? record.id}: ${message.slice(0, 500)}`,
            error: message.slice(0, 2000),
            created_by: "run-loop",
          });
        })
        .finally(() => {
          runningIntegrationResolvers.delete(record.id);
          runningIntegrationResolverPaths.delete(record.id);
        });
      runningIntegrationResolvers.set(record.id, task);
    };

    while (!stopRequested) {
      const dispatchLease = heartbeatDispatch(store, {
        leaseId,
        gameId,
      });
      schedulerBlocked = dispatchLease.status === "blocked";
      syncSchedulerCondition("planning");
      let didWork = false;
      resetSettleWake();
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
      const boundaryWorkPendingBeforeMaintenance = epochBoundaryWorkPending(store, runId);
      const blockingIntegrationsBeforeMaintenance = blockingWorkerOutputIntegrationCount(store, runId);

      // Resolvers run promptly alongside live workers: path locks fence them
      // from each other, the epoch boundary is blocked while any resolver
      // runs, and no boundary may be running when one launches.
      if (
        autoIntegrationResolverEnabled(args) &&
        !runningEpoch &&
        runningIntegrationResolvers.size < integrationResolverConcurrency
      ) {
        const activeLockPaths = new Set([...runningIntegrationResolverPaths.values()].flat());
        const resolverItems = workerOutputIntegrationConflictsForResolver(store, runId, {
          excludedIds: runningIntegrationResolvers.keys(),
          limit: integrationResolverConcurrency * 4,
        });
        const resolverBatch = selectIntegrationResolverBatch({
          candidates: resolverItems,
          activeLockPaths,
          concurrency: integrationResolverConcurrency,
          runningCount: runningIntegrationResolvers.size,
        });
        for (const { record: resolverItem, lockPaths } of resolverBatch) {
          launchIntegrationResolver(resolverItem, lockPaths);
          didWork = true;
        }
      }

      if (
        !runningKnowledgeMaintenance &&
        runningIntegrationResolvers.size === 0 &&
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
      const launchEpochCycle = (trigger: string, schedulerEpochId?: string): void => {
        syncSchedulerCondition("planning");
        const epochOrdinal = epochCycles + 1;
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
            cycleDraftPrEnabled,
            ciParityEnabled,
            preCommitGateEnabled,
            preCommitAutofixEnabled,
            linkCompleteUnitsEnabled,
            boundarySyncEnabled,
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
            // Workers base new worktrees on the latest epoch boundary commit.
            // Compare-and-set: the boundary sha was captured at snapshot time,
            // so if an integration drain or resolver advanced baseRev during
            // the (long) report build, the newer value wins.
            if (outcome.boundaryHeadSha && workerCtx.baseRev === baseRevAtBoundaryStart) {
              workerCtx.baseRev = outcome.boundaryHeadSha;
            }
            if (globals.dryRunAgents || outcome.boundaryResult || outcome.reconciled) epochCycles += 1;
            if (outcome.boundaryResult) {
              lastEpoch = outcome.boundaryResult;
              epochPaused = outcome.boundaryResult.repair.paused;
            }
            if (outcome.error) epochErrors.push({ error: outcome.error });
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
              epochPriorityRefreshes += nextEpoch.priorityRefreshes;
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
      if (epochCycleEnabled && runningIntegrationResolvers.size === 0 && !runningIntegrationDrain) {
        const boundaryError = boundaryErrorEpoch(store, runId);
        if (shouldEvaluateEpochBoundary({
          boundaryError: Boolean(boundaryError),
          epochPaused,
          runningEpoch: Boolean(runningEpoch),
        })) {
          const boundaryRetryDue = boundaryError && (!boundaryError.nextAttemptAt || Date.parse(boundaryError.nextAttemptAt) <= Date.now());
          if (boundaryError?.terminal) {
            epochPaused = true;
            schedulerBlocked = true;
            stopRequested = true;
            stoppedReason = "epoch_boundary_retry_exhausted";
          } else if (boundaryError && boundaryError.finished >= boundaryError.admitted && boundaryRetryDue) {
            if (boundaryError.nextAttemptAt) {
              const transition = boundaryRetryLogTransition(boundaryRetryLogState, {
                ordinal: boundaryError.ordinal,
                nextAttemptAt: boundaryError.nextAttemptAt,
              }, "due");
              boundaryRetryLogState = transition.state;
              if (transition.message) console.error(transition.message);
            }
            didWork = true;
            launchBoundaryRetryIfDue(store, runId, launchEpochCycle);
          } else if (boundaryError && boundaryError.finished >= boundaryError.admitted) {
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
            if (epochResult.priorityRefreshes > 0) epochPriorityRefreshes += epochResult.priorityRefreshes;
            if (madeAvailableNow > 0 || epochResult.priorityRefreshes > 0) didWork = true;
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
              launchEpochCycle(`scheduler epoch ${epochResult.progress.ordinal} completed`, epochResult.epoch.id);
            }
          }
        }
      }

      const schedulerEvent = nextUnhandledEvent(store, runId);
      if (!schedulerBlocked && !runningScheduler && schedulerEvent) {
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
            epochPriorityRefreshes += result.epochPriorityRefreshes ?? 0;
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

      if (didWork || workerConsumer.inFlight() === 0) iterations += 1;
      if (didWork || workerConsumer.inFlight() > 0 || runningEpoch || runningIntegrationDrain || runningIntegrationResolvers.size > 0) idleIterations = 0;
      else idleIterations += 1;

      if (maxIdleIterations > 0 && idleIterations >= maxIdleIterations && unhandledEventCount(store, runId) === 0) {
        stoppedReason = "idle";
        break;
      }
      if (maxIterations > 0 && iterations >= maxIterations && workerConsumer.inFlight() === 0 && !runningEpoch && !runningIntegrationDrain && pendingSettleWork.size === 0 && runningIntegrationResolvers.size === 0) {
        stoppedReason = "max_iterations";
        break;
      }
      syncSchedulerCondition("waiting");
      const retryRest = boundaryRetryRest(store, runId, idleSleepMs);
      const restingSleepMs = retryRest?.sleepMs ?? idleSleepMs;
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
        ...runningIntegrationResolvers.values(),
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
    if (runningIntegrationResolvers.size > 0) await Promise.allSettled([...runningIntegrationResolvers.values()]);
    if (runningKnowledgeMaintenance) await runningKnowledgeMaintenance;
    if (stoppedReason === "running") stoppedReason = "complete";
    const finalActiveSchedulerEpoch = activeSchedulerEpoch(store, runId);
    const finalSchedulerEpoch = lastSchedulerEpoch ?? (finalActiveSchedulerEpoch ? schedulerEpochProgress(store, finalActiveSchedulerEpoch.id) : null);

    return {
      runId,
      mode: "run_loop",
      stoppedReason,
      iterations,
      idleIterations,
      desiredWorkers: run.desiredWorkers,
      maxWorkers,
      schedulerTicks: schedulerResults.filter((result) => result.status !== "no_unhandled_events").length,
      epochCycle: epochCycleEnabled,
      epochCycles,
      schedulerEpoch: finalSchedulerEpoch,
      epochAdmissions,
      epochAvailabilityRefreshes,
      epochTargetsAdmitted,
      epochErrors,
      epochPaused,
      lastEpoch,
      epochPriorityRefreshes,
      epochTargetsMadeAvailable,
      workersStarted,
      workerResults,
      workerErrors,
      knowledgeMaintenanceRuns,
      knowledgeMaintenanceErrors,
      integrationResolverRuns,
      integrationResolverErrors,
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
    await stopBackgroundKnowledge({ maxWaitMs: 15_000 });
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
