import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadKnowledgeBoardSnapshot, resourceGraphDbPath } from "@server/core/knowledge";
import { heartbeatDispatch } from "@server/core/harness-state";
import { getActiveCycle } from "@server/core/cycle";
import { refreshBoardRerankMode } from "@server/core/cycle-runtime/phases/running/board";
import { loadExactTargetKeys } from "@server/core/cycle-runtime/phases/running/board/snapshot.js";
import {
  activeClaimsForRun,
  activeWorkerCount,
  activeSchedulerEpoch,
  addEvent,
  blockingWorkerOutputIntegrationCount,
  closeWorkerState,
  closeSchedulerEpoch,
  getLatestRun,
  getRun,
  markEventHandled,
  nextUnhandledEvent,
  openState,
  admittedTargetCount,
  recordSchedulerEpochFastRefresh,
  refreshEpochTargetPriorities,
  refreshEpochTargetAvailability,
  schedulerEpochProgress,
  schedulableTargetCount,
  setRunSchedulerCondition,
  unhandledEventCount,
  workerOutputIntegrationConflictsForResolver,
  type WorkerOutputIntegrationRecord,
  type EpochProgressSummary,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import { immediateTransaction, withBusyRetry } from "@server/core/orchestrator-state";
import type { EpochCycleResult } from "@server/core/cycle-runtime/phases/running/epochs";
import { integrationResolve, processWorkerOutputIntegrationQueue } from "@server/core/cycle-runtime/phases/running/integration";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import {
  booleanArg,
  numberArg,
  stringArg,
  writeSetIntegrationFlags,
  type GlobalArgs,
} from "@server/core/game-registry/runtime-options.js";
import { assertSchedulableRun } from "@server/core/cycle-runtime/phases/running/jobs/shared.js";
import {
  derivedSchedulerCandidateWindow,
  ensureSchedulerEpochFromBoard,
  runSchedulerTick,
  schedulerEpochConfigFromArgs,
  type SchedulerEpochEnsureResult,
  type SchedulerTickResult,
} from "@server/core/cycle-runtime/phases/running/scheduler/tick.js";
import { liveConflictResolverConfig, resolveBaseRev } from "@server/core/cycle-runtime/phases/running/workers/worker-cycle.js";
import { startJobConsumer } from "@server/core/job-queue/consumer.js";
import { defaultConfigureCommand } from "@server/core/job-queue/executor.js";
import type { JobRecord, TaskOutcome } from "@server/core/job-queue/types.js";
import {
  reapWorkerJobs,
  workerJobDescriptor,
  workerKernelOps,
  type WorkerJobRunContext,
} from "@server/core/cycle-runtime/phases/running/workers/worker-job.js";
import { runKnowledgeMaintenance, type KnowledgeMaintenanceProgressEvent } from "@server/core/knowledge/jobs/kg.js";
import { kgLibrarianCondense } from "@server/core/knowledge/jobs/librarian.js";
import { startBackgroundKnowledgeProcessor } from "@server/core/knowledge/background/index.js";
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
  admissionTargetSize: number;
  candidateLimit: number;
  candidateWindow: number;
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
}

export interface ForceFinishEpochEvent {
  id: string;
  payload: Record<string, unknown>;
}

export interface ForceFinishEpochResult {
  epochId: string | null;
  ordinal: number | null;
  activeClaimsClosed: number;
  openTargetsFinished: number;
  before: EpochProgressSummary | null;
  after: EpochProgressSummary | null;
}

export type FastKnowledgeMaintenanceAction = "defer" | "none" | "skip_no_new_reports" | "start";

export interface FastKnowledgeMaintenanceDecision {
  action: FastKnowledgeMaintenanceAction;
  reason?: "interval" | "report_count" | "no_new_reports";
  reportDue: boolean;
  reportsSinceRefresh: number;
  timeDue: boolean;
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
  providerPauses: number;
  providerPaused: boolean;
  lastProviderError?: string;
  knowledgeMaintenanceRuns: Record<string, unknown>[];
  knowledgeMaintenanceErrors: KnowledgeMaintenanceError[];
  fastKnowledgeMaintenanceRuns: Record<string, unknown>[];
  fastKnowledgeMaintenanceErrors: KnowledgeMaintenanceError[];
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

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PROVIDER_PROBE_INITIAL_BACKOFF_MS = 30_000;
const PROVIDER_PROBE_MAX_BACKOFF_MS = 300_000;

// Cheapest truthful health check: a tiny no-tools session through the exact provider
// path workers use. An LB liveness endpoint can say "ok" while its upstream account
// pool is exhausted; a completion can't lie.
async function probeProvider(globals: GlobalArgs, outputDir: string, sessionId: string, runId: string): Promise<{ healthy: boolean; error?: string }> {
  try {
    const result = await runPiAgent({
      role: "worker",
      cwd: globals.repoRoot,
      prompt: {
        systemPrompt: "You are a connectivity probe. Reply with the single word OK.",
        userPrompt: "Reply with the single word OK.",
        systemTemplatePath: "(provider-probe inline)",
        userTemplatePath: "(provider-probe inline)",
      },
      outputDir,
      dryRun: false,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: "low",
      timeoutMs: 120_000,
      sessionDir: outputDir,
      toolProfile: { replace: [] },
      kernelContext: createMeleeKernelSpawnContext({
        kind: "run",
        gameId: globals.game?.gameId ?? globals.gameId,
        sessionId,
        runId,
        phase: "provider-probe",
        workingDir: globals.repoRoot,
        metadata: {
          probe: true,
          outputDir,
        },
      }),
    });
    if (result.failed) return { healthy: false, error: result.error ?? "probe session failed" };
    if (result.providerError) return { healthy: false, error: result.providerError };
    if (!result.rawText.trim()) return { healthy: false, error: "probe returned empty output" };
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function targetPressureSnapshotForRunLoop(params: {
  admissionTargetSize: number;
  candidateLimit: number;
  candidateWindow: number;
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
    admissionTargetSize: params.admissionTargetSize,
    candidateLimit: params.candidateLimit,
    candidateWindow: params.candidateWindow,
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
            SELECT id, ordinal, status, boundary_status, admitted_count, finished_count
            FROM epochs
            WHERE run_id = ?
              AND admitted_count > 0
              AND status != 'exhausted'
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
      }
    : null;
}

export function epochBoundaryWorkPending(store: StateStore, runId: string): boolean {
  const activeEpoch = activeSchedulerEpoch(store, runId);
  if (activeEpoch) {
    const progress = schedulerEpochProgress(store, activeEpoch.id);
    return progress.admitted > 0 && progress.remaining === 0 && progress.claimed === 0;
  }
  const failedBoundary = boundaryErrorEpoch(store, runId);
  return failedBoundary !== null && failedBoundary.finished >= failedBoundary.admitted;
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

function jsonObjectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringPayloadValue(payload: Record<string, unknown>, key: string, fallbackKey = key): string {
  const value = payload[key] ?? payload[fallbackKey];
  return typeof value === "string" ? value : "";
}

function nextForceFinishEpochEvent(store: StateStore, runId: string): ForceFinishEpochEvent | null {
  const row = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT id, payload_json
            FROM events
            WHERE run_id = ?
              AND event_type = 'epoch_force_finish_requested'
              AND handled_at IS NULL
            ORDER BY created_at ASC
            LIMIT 1
          `,
        )
        .get(runId) as Record<string, unknown> | undefined,
  );
  return row ? { id: String(row.id), payload: jsonObjectValue(row.payload_json) } : null;
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

function finishOpenEpochTargets(store: StateStore, epochId: string): number {
  return immediateTransaction(store.db, () => {
    const finishedAt = new Date().toISOString();
    const result = store.db
      .query(
        `
          UPDATE epoch_targets
          SET status = 'finished',
              finished_at = ?
          WHERE epoch_id = ?
            AND status IN ('admitted', 'claimed')
        `,
      )
      .run(finishedAt, epochId);
    store.db
      .query(
        `
          UPDATE epochs
          SET finished_count = (
            SELECT COUNT(*)
            FROM epoch_targets
            WHERE epoch_targets.epoch_id = epochs.id
              AND epoch_targets.status = 'finished'
          )
          WHERE id = ?
        `,
      )
      .run(epochId);
    return Number(result.changes ?? 0);
  });
}

export function forceFinishActiveEpoch(store: StateStore, runId: string, event: ForceFinishEpochEvent): ForceFinishEpochResult {
  const epoch = activeSchedulerEpoch(store, runId);
  if (!epoch) {
    markEventHandled(store, event.id);
    return { epochId: null, ordinal: null, activeClaimsClosed: 0, openTargetsFinished: 0, before: null, after: null };
  }
  const requestedEpochId = stringPayloadValue(event.payload, "epoch_id", "epochId");
  if (requestedEpochId && requestedEpochId !== epoch.id) {
    markEventHandled(store, event.id);
    return { epochId: null, ordinal: null, activeClaimsClosed: 0, openTargetsFinished: 0, before: null, after: null };
  }

  const before = schedulerEpochProgress(store, epoch.id);
  const activeClaims = activeClaimsForRun(store, runId).filter((claim) => claim.epochId === epoch.id);
  for (const claim of activeClaims) {
    closeWorkerState(store, {
      authority: { host: "run-loop-settle" },
      workerStateId: claim.workerStateId,
      lifecycleStatus: "cancelled",
      epochTargetStatus: "finished",
      summary: {
        forced_by: "dashboard",
        force_finish_event_id: event.id,
        recovery_reason: "manual epoch finish requested; treating current epoch as drained",
      },
      errorSummary: "Manual epoch finish requested; worker claim cancelled and retained as epoch-finished.",
    });
  }
  const openTargetsFinished = finishOpenEpochTargets(store, epoch.id);
  const after = schedulerEpochProgress(store, epoch.id);
  markEventHandled(store, event.id);
  addEvent(store, runId, "epoch_force_finished", "run-loop", {
    epoch_id: epoch.id,
    ordinal: epoch.ordinal,
    request: event.payload,
    active_claims_closed: activeClaims.length,
    open_targets_finished: openTargetsFinished,
    before,
    after,
    created_by: "run-loop",
  });
  return { epochId: epoch.id, ordinal: epoch.ordinal, activeClaimsClosed: activeClaims.length, openTargetsFinished, before, after };
}


export function evaluateFastKnowledgeMaintenanceDecision(params: {
  intervalMs: number;
  lastMaintenanceMs: number;
  nowMs: number;
  reportCountTrigger: number;
  reportsSinceRefresh: number;
  running: boolean;
}): FastKnowledgeMaintenanceDecision {
  const reportsSinceRefresh = Math.max(0, Math.floor(params.reportsSinceRefresh));
  const timeDue = params.intervalMs > 0 && params.nowMs - params.lastMaintenanceMs >= params.intervalMs;
  const reportDue = params.reportCountTrigger > 0 && reportsSinceRefresh >= params.reportCountTrigger;
  if (!timeDue && !reportDue) return { action: "none", reportDue, reportsSinceRefresh, timeDue };
  const reason = reportDue ? "report_count" : "interval";
  if (params.running) return { action: "defer", reason, reportDue, reportsSinceRefresh, timeDue };
  if (reportsSinceRefresh <= 0) return { action: "skip_no_new_reports", reason: "no_new_reports", reportDue, reportsSinceRefresh, timeDue };
  return { action: "start", reason, reportDue, reportsSinceRefresh, timeDue };
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

function fastKnowledgeMaintenanceArgs(args: Map<string, string | true>, runId: string): Map<string, string | true> {
  const next = knowledgeMaintenanceArgs(args, runId, false);
  next.set("--no-tool-runners", true);
  if (!next.has("--run-pr-agent")) next.set("--no-run-pr-agent", true);
  return next;
}

function knowledgeMaintenanceIntervalMs(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-knowledge-maintenance")) return 0;
  const fallback = globals.dryRunAgents ? 0 : 5 * 60_000;
  return Math.max(0, Math.floor(numberArg(args, "--knowledge-maintenance-interval-ms", fallback)));
}

function fastKnowledgeMaintenanceIntervalMs(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-fast-kg-maintenance")) return 0;
  const fallback = globals.dryRunAgents ? 0 : 3 * 60_000;
  return Math.max(0, Math.floor(numberArg(args, "--fast-kg-maintenance-interval-ms", fallback)));
}

function fastKnowledgeMaintenanceReportCount(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-fast-kg-maintenance")) return 0;
  return Math.max(0, Math.floor(numberArg(args, "--fast-kg-maintenance-report-count", 16)));
}

function workerStateCloseCountSince(store: StateStore, runId: string, sinceIso: string): number {
  const row = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT COUNT(*) AS count
            FROM worker_state
            WHERE run_id = ?
              AND lifecycle_status != 'error'
              AND ended_at > ?
          `,
        )
        .get(runId, sinceIso) as Record<string, unknown> | undefined,
  );
  return Number(row?.count ?? 0);
}

function latestFastRefreshFinishedAt(store: StateStore, runId: string, fallbackIso: string): string {
  const row = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT created_at
            FROM events
            WHERE run_id = ?
              AND event_type = 'epoch_fast_refresh_finished'
            ORDER BY created_at DESC
            LIMIT 1
          `,
        )
        .get(runId) as Record<string, unknown> | undefined,
  );
  return row?.created_at == null ? fallbackIso : String(row.created_at);
}

async function waitForRestingTrigger(idleSleepMs: number, extras: Array<Promise<void> | null> = []): Promise<void> {
  const live = extras.filter((task): task is Promise<void> => task != null);
  if (live.length === 0) {
    await sleep(idleSleepMs);
    return;
  }
  await Promise.race([sleep(idleSleepMs), ...live]);
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

export async function runRunLoop(globals: GlobalArgs, args: Map<string, string | true>): Promise<RunLoopResult> {
  const store = openState(globals.stateDir);
  const stopBackgroundKnowledge = startBackgroundKnowledgeProcessor(store, async (backgroundJob) => {
    const publication = await kgLibrarianCondense(globals, new Map<string, string | true>([
      ["--worker-state-id", backgroundJob.workerStateId],
      ["--run-id", typeof backgroundJob.provenance.run_id === "string" ? backgroundJob.provenance.run_id : ""],
    ]));
    return publication;
  });
  let observedRunId = "";
  const workerResults: WorkerResultSummary[] = [];
  const workerErrors: WorkerError[] = [];
  const schedulerResults: SchedulerTickResult[] = [];
  const knowledgeMaintenanceRuns: Record<string, unknown>[] = [];
  const knowledgeMaintenanceErrors: KnowledgeMaintenanceError[] = [];
  const fastKnowledgeMaintenanceRuns: Record<string, unknown>[] = [];
  const fastKnowledgeMaintenanceErrors: KnowledgeMaintenanceError[] = [];
  const integrationResolverRuns: Record<string, unknown>[] = [];
  const integrationResolverErrors: IntegrationResolverError[] = [];
  const runningIntegrationResolvers = new Map<string, Promise<void>>();
  const runningIntegrationResolverPaths = new Map<string, string[]>();
  let runningScheduler: Promise<void> | null = null;
  let runningKnowledgeMaintenance: Promise<void> | null = null;
  let stoppedReason = "running";
  let stopRequested = false;
  let drainRequested = false;
  let iterations = 0;
  let idleIterations = 0;
  let workersStarted = 0;
  let integrationDrains = 0;
  let providerPausedSinceMs: number | null = null;
  let providerPauses = 0;
  let lastProviderError: string | undefined;
  let providerProbeBackoffMs = PROVIDER_PROBE_INITIAL_BACKOFF_MS;
  let nextProviderProbeMs = 0;
  let runningProviderProbe: Promise<void> | null = null;
  const stop = () => {
    stopRequested = true;
    stoppedReason = "signal";
  };
  const drain = () => {
    drainRequested = true;
    stoppedReason = "draining";
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("SIGUSR1", drain);

  try {
    const leaseId = stringArg(args, "--lease-id", "").trim();
    if (!leaseId) throw new Error("run-loop requires --lease-id");
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "run-loop");
    const sessionGameId = run.gameId ?? globals.game?.gameId ?? globals.gameId;
    const sessionId = run.cycleUuid ?? (sessionGameId ? getActiveCycle(store.db, sessionGameId)?.cycle_uuid : null) ?? runId;
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
    const candidateLimit = maxWorkers;
    const admissionTargetSize = maxWorkers;
    const candidateWindow = derivedSchedulerCandidateWindow(globals, args, maxWorkers);
    const baseRev = resolveBaseRev(globals.repoRoot, stringArg(args, "--base-rev", "unknown"));
    const ttlSeconds = workerTtlSeconds(globals, args);
    const postReturnCheckCommand = stringArg(args, "--post-return-check-command", "");
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    const writeSetFlags = writeSetIntegrationFlags(args);
    if (writeSetFlags.mergeOnFinish || writeSetFlags.writeSetWidening !== "off") {
      const flagEvent = addEvent(store, runId, "write_set_integration_flags", "run-loop", {
        merge_on_finish: writeSetFlags.mergeOnFinish,
        write_set_widening: writeSetFlags.writeSetWidening,
        confirmation_pass: writeSetFlags.confirmationPass,
        created_by: "run-loop",
      });
      markEventHandled(store, flagEvent);
    }
    const exitOnWorkerError = booleanArg(args, "--exit-on-worker-error");
    const workerThinkingLevel = stringArg(args, "--worker-thinking-level", globals.thinkingLevel);
    const workerConfigureCommand = stringArg(args, "--worker-configure-command", defaultConfigureCommand(globals));
    const maintenanceIntervalMs = knowledgeMaintenanceIntervalMs(globals, args);
    const epochCycleEnabled = true;
    const schedulerEpochConfig = schedulerEpochConfigFromArgs(globals, args, { candidateWindow, workerPoolSize: maxWorkers });
    const workerPoolTargetSize = schedulerEpochConfig.workerPoolSize;
    const epochWorktreeDir = stringArg(args, "--epoch-worktree", resolve(globals.stateDir, "epoch_worktree"));
    const epochConfigureCommand = stringArg(args, "--epoch-configure-command", defaultConfigureCommand(globals));
    const epochLinkPaths = stringArg(args, "--epoch-link-paths", "orig")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean);
    const epochPauseThreshold = nonNegativeInt(numberArg(args, "--epoch-regression-pause-threshold", 12));
    const epochRequeueLimit = nonNegativeInt(numberArg(args, "--epoch-regression-requeue-limit", 32));
    const epochRetryMs = nonNegativeInt(numberArg(args, "--epoch-retry-ms", 10 * 60_000));
    const cycleDraftPrEnabled = !booleanArg(args, "--no-cycle-draft-pr");
    const fullKgMaintenanceMode = stringArg(args, "--full-kg-maintenance-mode", "full").trim().toLowerCase();
    let runningEpoch: Promise<void> | null = null;
    let nextEpochAllowedMs = 0;
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
    let lastKnowledgeMaintenanceMs = maintenanceIntervalMs > 0 ? 0 : Date.now();
    const fastMaintenanceIntervalMs = fastKnowledgeMaintenanceIntervalMs(globals, args);
    const fastMaintenanceReportCount = fastKnowledgeMaintenanceReportCount(globals, args);
    let lastFastMaintenanceMs = Date.now();
    let lastFastMaintenanceReportIso = latestFastRefreshFinishedAt(store, runId, run.createdAt);
    let runningFastKnowledgeMaintenance: Promise<void> | null = null;
    let pendingFastKnowledgeMaintenance = false;
    let schedulerBlocked = false;
    let runningIntegrationDrain: Promise<void> | null = null;
    let workerSettledSinceDrain = false;
    const pendingSettleWork = new Set<Promise<void>>();
    let settleWakeResolve: (() => void) | null = null;
    let settleWake = new Promise<void>((resolveWake) => { settleWakeResolve = resolveWake; });
    const resetSettleWake = (): void => {
      settleWake = new Promise<void>((resolveWake) => { settleWakeResolve = resolveWake; });
    };
    const workerCtx: WorkerJobRunContext = {
      store,
      globals,
      runId,
      dispatchLeaseId: leaseId,
      baseRev,
      ttlSeconds,
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
      const providerFailure = errorKind === "provider_error" || /provider[_ -]?error/i.test(settle.error ?? "");
      if (providerFailure) {
        lastProviderError = error ?? "provider error";
        if (providerPausedSinceMs == null) {
          providerPausedSinceMs = Date.now();
          providerPauses += 1;
          providerProbeBackoffMs = PROVIDER_PROBE_INITIAL_BACKOFF_MS;
          nextProviderProbeMs = Date.now() + providerProbeBackoffMs;
          console.error(`[run-loop] provider failure from ${workerId}: ${lastProviderError}; pausing worker dispatch until a provider probe succeeds`);
        }
      } else if (settle.status === "failed") {
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
      workerSettledSinceDrain = true;
      settleWakeResolve?.();
    };
    const workerDescriptor = workerJobDescriptor(workerCtx);
    const workerConsumer = startJobConsumer(store, workerDescriptor, workerKernelOps(workerCtx), {
      intervalMs: 1_000,
      actor: "runner",
      shouldClaim: () => !drainRequested && providerPausedSinceMs == null
        && !(maxIterations > 0 && iterations >= maxIterations) && !schedulerBlocked && !epochPaused,
      onJobSettled: handleWorkerJobSettled,
    });
    const syncSchedulerCondition = (fallback: "planning" | "dispatching" | "waiting"): void => {
      setRunSchedulerCondition(
        store,
        runId,
        selectRunLoopSchedulerCondition({
          blocked: schedulerBlocked || epochPaused,
          boundary: Boolean(
            runningEpoch ||
              runningFastKnowledgeMaintenance ||
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
        .then(() => {
          integrationResolverRuns.push({
            item_id: record.id,
            lock_paths: lockPaths,
            target_key: record.targetKey,
            item_path: record.itemPath,
          });
          nextEpochAllowedMs = 0;
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
        gameId: globals.game?.gameId ?? globals.gameId,
      });
      schedulerBlocked = dispatchLease.status === "blocked";
      if (dispatchLease.status === "draining") {
        drainRequested = true;
        stoppedReason = "draining";
      } else if (dispatchLease.status === "blocked") {
      }
      syncSchedulerCondition("planning");
      let didWork = false;
      resetSettleWake();
      if (!drainRequested) {
        const reaped = await reapWorkerJobs(store, workerCtx);
        if (reaped.recovered > 0) {
          console.error(`[run-loop] reaped worker jobs and recovered ${reaped.recovered} active claim(s)`);
          didWork = true;
        }
      }
      if (workerSettledSinceDrain && !runningIntegrationDrain) {
        workerSettledSinceDrain = false;
        let task: Promise<void>;
        task = processWorkerOutputIntegrationQueue({
          conflictResolver: writeSetFlags.mergeOnFinish ? liveConflictResolverConfig(globals, sessionId, runId) : undefined,
          dryRun: globals.dryRunAgents,
          leaseId,
          mergeOnFinish: writeSetFlags.mergeOnFinish,
          repoRoot: globals.repoRoot,
          runId,
          stateDir: globals.stateDir,
          store,
        }).then(() => { integrationDrains += 1; })
          .catch((error) => console.error(`[run-loop] worker output integration drain failed: ${error instanceof Error ? error.message : String(error)}`))
          .finally(() => { if (runningIntegrationDrain === task) runningIntegrationDrain = null; });
        runningIntegrationDrain = task;
        didWork = true;
      }
      const boundaryWorkPendingBeforeMaintenance = epochBoundaryWorkPending(store, runId);
      const blockingIntegrationsBeforeMaintenance = blockingWorkerOutputIntegrationCount(store, runId);

      if (
        !drainRequested &&
        autoIntegrationResolverEnabled(args) &&
        !runningEpoch &&
        runningIntegrationResolvers.size < integrationResolverConcurrency &&
        activeWorkerCount(store, runId) === 0 &&
        workerConsumer.inFlight() === 0
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
        !drainRequested &&
        !runningKnowledgeMaintenance &&
        runningIntegrationResolvers.size === 0 &&
        !boundaryWorkPendingBeforeMaintenance &&
        blockingIntegrationsBeforeMaintenance === 0 &&
        maintenanceIntervalMs > 0 &&
        Date.now() - lastKnowledgeMaintenanceMs >= maintenanceIntervalMs
      ) {
        lastKnowledgeMaintenanceMs = Date.now();
        let task: Promise<void>;
        task = runKnowledgeMaintenance(globals, knowledgeMaintenanceArgs(args, runId, !globals.dryRunAgents), {
          progress: knowledgeProgressReporter(store, runId, { lane: "scheduled", mode: globals.dryRunAgents ? "dry_run" : "full", repoRoot: globals.repoRoot }),
        })
          .then((result) => {
            knowledgeMaintenanceRuns.push(result);
          })
          .catch((error) => {
            knowledgeMaintenanceErrors.push({ error: error instanceof Error ? error.message : String(error) });
          })
          .finally(() => {
            if (runningKnowledgeMaintenance === task) runningKnowledgeMaintenance = null;
          });
        runningKnowledgeMaintenance = task;
        syncSchedulerCondition("planning");
        didWork = true;
      }

      const targetPressureBefore = targetPressureSnapshotForRunLoop({
        admissionTargetSize: workerPoolTargetSize,
        candidateLimit,
        candidateWindow,
        maxWorkers,
        inFlightWorkers: workerConsumer.inFlight(),
        runId,
        store,
      });
      const nowMs = Date.now();
      const launchEpochCycle = (trigger: string, schedulerEpochId?: string): void => {
        syncSchedulerCondition("planning");
        const epochOrdinal = epochCycles + 1;
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
            epochRetryMs,
            cycleDraftPrEnabled,
            fullKgMaintenanceMode,
            writeSetFlags,
            schedulerEpochConfig,
            graphDbPath,
            epochWorktreeDir,
          },
          reportKnowledgeProgress: knowledgeProgressReporter,
        })
          .then((outcome) => {
            // Workers base new worktrees on the latest epoch boundary commit.
            workerCtx.baseRev = outcome.boundaryResult?.commitSha ?? workerCtx.baseRev;
            if (globals.dryRunAgents || outcome.boundaryResult || outcome.reconciled) epochCycles += 1;
            if (outcome.boundaryResult) {
              lastEpoch = outcome.boundaryResult;
              epochPaused = outcome.boundaryResult.repair.paused;
            }
            if (outcome.error) epochErrors.push({ error: outcome.error });
            if (outcome.retryAtMs !== null) nextEpochAllowedMs = outcome.retryAtMs;
            if (outcome.knowledgeMaintenanceRun) knowledgeMaintenanceRuns.push(outcome.knowledgeMaintenanceRun);
            if (outcome.nextEpoch) {
              const nextEpoch = outcome.nextEpoch;
              lastSchedulerEpoch = nextEpoch.progress;
              epochAdmissions += (nextEpoch.admission?.admitted ?? 0) + (nextEpoch.existingAdmission?.admitted ?? 0);
              epochAvailabilityRefreshes += nextEpoch.availabilityRefresh.inserted > 0 ? 1 : 0;
              epochTargetsAdmitted += (nextEpoch.admission?.admitted ?? 0) + (nextEpoch.existingAdmission?.admitted ?? 0);
              epochTargetsMadeAvailable += (nextEpoch.admission?.admitted ?? 0) + nextEpoch.availabilityRefresh.inserted;
              epochPriorityRefreshes += nextEpoch.priorityRefreshes;
              if (!outcome.exhausted && (nextEpoch.availabilityRefresh.inserted > 0 || (nextEpoch.admission?.admitted ?? 0) > 0)) {
                didWork = true;
              }
            }
          })
          .finally(() => {
            if (runningEpoch === task) runningEpoch = null;
          });
        runningEpoch = task;
      };
      const forceFinishEvent = nextForceFinishEpochEvent(store, runId);
      if (forceFinishEvent) {
        syncSchedulerCondition("planning");
        const result = forceFinishActiveEpoch(store, runId, forceFinishEvent);
        if (result.epochId) {
          console.error(
            `[run-loop] epoch ${result.ordinal}: manual finish requested; ` +
              `closed ${result.activeClaimsClosed} active claim(s), marked ${result.openTargetsFinished} open target(s) finished`,
          );
        }
        if (workerConsumer.inFlight() > 0) await workerConsumer.cancelAll();
        if (result.after) lastSchedulerEpoch = result.after;
        didWork = true;
      }

      if (
        !drainRequested &&
        epochCycleEnabled &&
        fastMaintenanceIntervalMs > 0 &&
        !runningEpoch &&
        runningIntegrationResolvers.size === 0 &&
        !epochBoundaryWorkPending(store, runId) &&
        blockingWorkerOutputIntegrationCount(store, runId) === 0
      ) {
        const reportsSinceFast = workerStateCloseCountSince(store, runId, lastFastMaintenanceReportIso);
        const fastDecision = evaluateFastKnowledgeMaintenanceDecision({
          intervalMs: fastMaintenanceIntervalMs,
          lastMaintenanceMs: lastFastMaintenanceMs,
          nowMs,
          reportCountTrigger: fastMaintenanceReportCount,
          reportsSinceRefresh: reportsSinceFast,
          running: Boolean(runningFastKnowledgeMaintenance),
        });
        if (fastDecision.action !== "none") {
          if (fastDecision.action === "defer") {
            if (!pendingFastKnowledgeMaintenance) {
              pendingFastKnowledgeMaintenance = true;
              addEvent(store, runId, "epoch_fast_refresh_deferred", "run-loop", {
                reason: fastDecision.reason,
                reports_since_refresh: fastDecision.reportsSinceRefresh,
                created_by: "run-loop",
              });
            }
          } else if (fastDecision.action === "skip_no_new_reports") {
            lastFastMaintenanceMs = nowMs;
            addEvent(store, runId, "epoch_fast_refresh_skipped", "run-loop", {
              reason: "no_new_reports",
              created_by: "run-loop",
            });
          } else {
            pendingFastKnowledgeMaintenance = false;
            lastFastMaintenanceMs = nowMs;
            const activeEpoch = activeSchedulerEpoch(store, runId);
            console.error(
              `[run-loop] epoch ${activeEpoch?.ordinal ?? "?"}: fast knowledge refresh started ` +
                `(${fastDecision.reason}, ${fastDecision.reportsSinceRefresh} report(s) since refresh)`,
            );
            addEvent(store, runId, "epoch_fast_refresh_started", "run-loop", {
              epoch_id: activeEpoch?.id ?? null,
              reports_since_refresh: fastDecision.reportsSinceRefresh,
              reason: fastDecision.reason,
              created_by: "run-loop",
            });
            let task: Promise<void>;
            task = runKnowledgeMaintenance(globals, fastKnowledgeMaintenanceArgs(args, runId), {
              progress: knowledgeProgressReporter(store, runId, {
                lane: "fast_run_evidence",
                mode: "fast",
                epochId: activeEpoch?.id ?? null,
                epochOrdinal: activeEpoch?.ordinal ?? null,
                repoRoot: globals.repoRoot,
              }),
            })
              .then((result) => {
                const completedAt = new Date().toISOString();
                fastKnowledgeMaintenanceRuns.push({ ...result, lane: "fast_run_evidence" });
                lastFastMaintenanceReportIso = completedAt;
                const epoch = activeSchedulerEpoch(store, runId);
                let progress: EpochProgressSummary | null = null;
                let priorityRefreshes = 0;
                let availabilityRefreshInserted = 0;
                if (epoch) {
                  recordSchedulerEpochFastRefresh(store, epoch.id);
                  const board = loadKnowledgeBoardSnapshot(globals.repoRoot, schedulerEpochConfig.candidateWindow, {
                    candidateRerank: refreshBoardRerankMode(schedulerEpochConfig.candidateRerank),
                    graphDbPath,
                  });
                  priorityRefreshes = refreshEpochTargetPriorities(store, {
                    epochId: epoch.id,
                    runId,
                    candidates: board.candidates,
                  }).refreshed;
                  const availabilityRefresh = refreshEpochTargetAvailability(store, epoch.id, {
                    exactTargetKeys: loadExactTargetKeys(globals.repoRoot),
                  });
                  availabilityRefreshInserted = availabilityRefresh.inserted;
                  if (availabilityRefreshInserted > 0) {
                    epochAvailabilityRefreshes += 1;
                    epochTargetsMadeAvailable += availabilityRefreshInserted;
                  }
                  progress = schedulerEpochProgress(store, epoch.id);
                  lastSchedulerEpoch = progress;
                  epochPriorityRefreshes += priorityRefreshes;
                }
                addEvent(store, runId, "epoch_fast_refresh_finished", "run-loop", {
                  epoch_id: epoch?.id ?? null,
                  reports_since_refresh: fastDecision.reportsSinceRefresh,
                  priority_refreshes: priorityRefreshes,
                  ready_refill_inserted: availabilityRefreshInserted,
                  progress,
                  created_by: "run-loop",
                });
                console.error(
                  `[run-loop] epoch ${epoch?.ordinal ?? "?"}: fast knowledge refresh finished; ` +
                    `${priorityRefreshes} priorities refreshed, ${availabilityRefreshInserted} ready target(s) inserted`,
                );
              })
              .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                fastKnowledgeMaintenanceErrors.push({ error: message });
                console.error(`[run-loop] fast knowledge refresh failed: ${message}`);
                addEvent(store, runId, "epoch_fast_refresh_finished", "run-loop", {
                  status: "error",
                  error: message.slice(0, 2000),
                  created_by: "run-loop",
                });
              })
              .finally(() => {
                if (runningFastKnowledgeMaintenance === task) runningFastKnowledgeMaintenance = null;
              });
            runningFastKnowledgeMaintenance = task;
            syncSchedulerCondition("planning");
            didWork = true;
          }
        }
      }

      if (!drainRequested && epochCycleEnabled && runningIntegrationResolvers.size === 0) {
        if (!runningEpoch && nowMs >= nextEpochAllowedMs && !epochPaused) {
          const boundaryError = boundaryErrorEpoch(store, runId);
          if (boundaryError && boundaryError.finished >= boundaryError.admitted) {
            didWork = true;
            launchEpochCycle(`retry scheduler epoch ${boundaryError.ordinal} boundary`, boundaryError.id);
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
            nextEpochAllowedMs = Date.now() + epochRetryMs;
          } else {
            const epochResult = ensureSchedulerEpochFromBoard({
              config: schedulerEpochConfig,
              globals,
              graphDbPath,
              runId,
              store,
            });
            lastSchedulerEpoch = epochResult.progress;
            const admittedNow = (epochResult.admission?.admitted ?? 0) + (epochResult.existingAdmission?.admitted ?? 0);
            const madeAvailableNow = (epochResult.admission?.admitted ?? 0) + epochResult.availabilityRefresh.inserted;
            if (admittedNow > 0) {
              epochAdmissions += 1;
              epochTargetsAdmitted += admittedNow;
            }
            if (epochResult.availabilityRefresh.inserted > 0) epochAvailabilityRefreshes += 1;
            if (epochResult.priorityRefreshes > 0) epochPriorityRefreshes += epochResult.priorityRefreshes;
            if (madeAvailableNow > 0 || epochResult.priorityRefreshes > 0) didWork = true;
            epochTargetsMadeAvailable += madeAvailableNow;

            if (admittedNow > 0) {
              console.error(
                `[run-loop] epoch ${epochResult.progress.ordinal}: admitted ${admittedNow} new target(s); ` +
                  `${epochResult.progress.admitted}/${epochResult.progress.size.mode === "full" ? "full" : epochResult.progress.size.value} admitted, ` +
                  `${epochResult.progress.available} available, candidate window ${schedulerEpochConfig.candidateWindow}` +
                  (epochResult.admissionCap
                    ? `, capped ${epochResult.admissionCap.candidateCount} -> ${epochResult.admissionCap.cap} (${epochResult.admissionCap.mode})`
                    : ""),
              );
              addEvent(store, runId, "epoch_admitted", "run-loop", {
                epoch_id: epochResult.epoch.id,
                ordinal: epochResult.progress.ordinal,
                admitted: epochResult.progress.admitted,
                admitted_now: admittedNow,
                available: epochResult.progress.available,
                candidate_rerank: schedulerEpochConfig.candidateRerank ?? "priority",
                candidate_window: schedulerEpochConfig.candidateWindow,
                admission_cap: epochResult.admissionCap,
                size: epochResult.progress.size,
                created_by: "run-loop",
              });
            }

            if (epochResult.progress.admitted === 0 && targetPressureBefore.activeWorkers === 0 && targetPressureBefore.admittedTargets === 0) {
              closeSchedulerEpoch(store, epochResult.epoch.id, {
                status: "exhausted",
                boundaryStatus: "board_exhausted",
                routingSummary: { trigger: "admission", board_exhausted: epochResult.boardExhausted },
              });
              addEvent(store, runId, "epoch_exhausted", "run-loop", {
                epoch_id: epochResult.epoch.id,
                ordinal: epochResult.progress.ordinal,
                size: epochResult.progress.size,
                created_by: "run-loop",
              });
              nextEpochAllowedMs = Date.now() + epochRetryMs;
            } else if (epochResult.progress.admitted > 0 && epochResult.progress.remaining === 0 && epochResult.progress.claimed === 0 && workerConsumer.inFlight() === 0) {
              didWork = true;
              launchEpochCycle(`scheduler epoch ${epochResult.progress.ordinal} completed`, epochResult.epoch.id);
            }
          }
        }
      }

      if (!drainRequested && providerPausedSinceMs != null && !runningProviderProbe && Date.now() >= nextProviderProbeMs) {
        const probeDir = resolve(globals.stateDir, "runs", runId, "provider_probes");
        let probeTask: Promise<void>;
        probeTask = probeProvider(globals, probeDir, sessionId, runId)
          .then((probe) => {
            if (probe.healthy) {
              const pausedForMs = Date.now() - (providerPausedSinceMs ?? Date.now());
              console.error(`[run-loop] provider probe succeeded after ${Math.round(pausedForMs / 1000)}s paused; resuming worker spawns`);
              providerPausedSinceMs = null;
              providerProbeBackoffMs = PROVIDER_PROBE_INITIAL_BACKOFF_MS;
            } else {
              lastProviderError = probe.error ?? lastProviderError;
              providerProbeBackoffMs = Math.min(providerProbeBackoffMs * 2, PROVIDER_PROBE_MAX_BACKOFF_MS);
              nextProviderProbeMs = Date.now() + providerProbeBackoffMs;
              console.error(
                `[run-loop] provider probe failed (${probe.error ?? "unknown"}); next probe in ${Math.round(providerProbeBackoffMs / 1000)}s`,
              );
            }
          })
          .finally(() => {
            if (runningProviderProbe === probeTask) runningProviderProbe = null;
          });
        runningProviderProbe = probeTask;
      }

      const schedulerEvent = nextUnhandledEvent(store, runId);
      const schedulerEventType = schedulerEvent ? String(schedulerEvent.eventType ?? schedulerEvent.event_type ?? "") : "";
      if (!drainRequested && !runningScheduler && schedulerEvent && schedulerEventType !== "epoch_force_finish_requested") {
        const tickArgs = schedulerTickArgs(args, { runId });
        let task: Promise<void>;
        task = runSchedulerTick(globals, tickArgs, { ownsSchedulerCondition: false })
          .then((result) => {
            schedulerResults.push(result);
            if (result.schedulerEpoch) lastSchedulerEpoch = result.schedulerEpoch;
            const admittedByTick = (result.epochAdmission?.admitted ?? 0) + (result.existingEpochAdmission?.admitted ?? 0);
            if (admittedByTick > 0) {
              epochAdmissions += 1;
              epochTargetsAdmitted += admittedByTick;
            }
            if ((result.epochAvailabilityRefresh?.inserted ?? 0) > 0) epochAvailabilityRefreshes += 1;
            epochTargetsMadeAvailable += (result.epochAdmission?.admitted ?? 0) + (result.epochAvailabilityRefresh?.inserted ?? 0);
            epochPriorityRefreshes += result.epochPriorityRefreshes ?? 0;
          })
          .catch((error) => {
            schedulerResults.push({
              runId,
              eventType: "scheduler_error",
              eventProducer: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => {
            if (runningScheduler === task) runningScheduler = null;
          });
        runningScheduler = task;
        syncSchedulerCondition("planning");
        didWork = true;
      }

      if (didWork || workerConsumer.inFlight() === 0) iterations += 1;
      if (didWork || workerConsumer.inFlight() > 0 || runningEpoch || runningFastKnowledgeMaintenance || runningIntegrationDrain || runningIntegrationResolvers.size > 0) idleIterations = 0;
      else idleIterations += 1;

      if (maxIdleIterations > 0 && idleIterations >= maxIdleIterations && unhandledEventCount(store, runId) === 0) {
        stoppedReason = "idle";
        break;
      }
      if (maxIterations > 0 && iterations >= maxIterations && workerConsumer.inFlight() === 0 && !runningEpoch && !runningIntegrationDrain && pendingSettleWork.size === 0 && runningIntegrationResolvers.size === 0) {
        stoppedReason = "max_iterations";
        break;
      }
      if (
        drainRequested &&
        workerConsumer.inFlight() === 0 &&
        !runningEpoch &&
        !runningScheduler &&
        !runningIntegrationDrain &&
        !workerSettledSinceDrain &&
        pendingSettleWork.size === 0 &&
        runningIntegrationResolvers.size === 0 &&
        !runningFastKnowledgeMaintenance &&
        !runningKnowledgeMaintenance &&
        !runningProviderProbe
      ) {
        stoppedReason = "drained";
        break;
      }

      syncSchedulerCondition("waiting");
      await waitForRestingTrigger(idleSleepMs, [
        settleWake,
        runningEpoch,
        runningIntegrationDrain,
        runningFastKnowledgeMaintenance,
        runningKnowledgeMaintenance,
        runningScheduler,
        runningProviderProbe,
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
    if (workerSettledSinceDrain) {
      await processWorkerOutputIntegrationQueue({
        conflictResolver: writeSetFlags.mergeOnFinish ? liveConflictResolverConfig(globals, sessionId, runId) : undefined,
        dryRun: globals.dryRunAgents,
        leaseId,
        mergeOnFinish: writeSetFlags.mergeOnFinish,
        repoRoot: globals.repoRoot,
        runId,
        stateDir: globals.stateDir,
        store,
      });
      integrationDrains += 1;
      workerSettledSinceDrain = false;
    }
    if (runningEpoch) await runningEpoch;
    if (runningScheduler) await runningScheduler;
    if (runningIntegrationResolvers.size > 0) await Promise.allSettled([...runningIntegrationResolvers.values()]);
    if (runningFastKnowledgeMaintenance) await runningFastKnowledgeMaintenance;
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
      providerPauses,
      providerPaused: providerPausedSinceMs != null,
      lastProviderError,
      knowledgeMaintenanceRuns,
      knowledgeMaintenanceErrors,
      fastKnowledgeMaintenanceRuns,
      fastKnowledgeMaintenanceErrors,
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
  } finally {
    await stopBackgroundKnowledge();
    if (observedRunId) setRunSchedulerCondition(store, observedRunId, "idle");
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.off("SIGUSR1", drain);
    store.db.close();
  }
}

export async function runLoop(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runRunLoop(globals, args), null, 2));
}
