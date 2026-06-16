import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadKnowledgeBoardSnapshot, packageRoot, resourceGraphDbPath } from "@decomp-orchestrator/knowledge";
import {
  activeWorkerCount,
  activeSchedulerEpoch,
  addEvent,
  blockedQueuedTargetCount,
  closeSchedulerEpoch,
  DEFAULT_WORKER_TTL_SECONDS,
  getLatestRun,
  getRun,
  nextUnhandledEvent,
  openState,
  queuedTargetCount,
  recordSchedulerEpochFastRefresh,
  refreshEpochQueuedTargetPriorities,
  refillEpochReadyQueue,
  refillQueuedTargets,
  schedulerEpochProgress,
  schedulableTargetCount,
  unhandledEventCount,
  unhandledPoolEventCount,
  type QueueRefillResult,
  type EpochProgressSummary,
  type StateStore,
} from "@decomp-orchestrator/core/state";
import { withBusyRetry } from "@decomp-orchestrator/core/state/db";
import { runEpochCycle, type EpochCycleResult } from "@decomp-orchestrator/core/epoch";
import { runPiAgent } from "@decomp-orchestrator/agents/runtime";
import { booleanArg, numberArg, stringArg, workerReportTypeArg, type GlobalArgs } from "../args.js";
import { assertSchedulableRun } from "./shared.js";
import {
  ensureSchedulerEpochFromBoard,
  runSchedulerTick,
  schedulerEpochConfigFromArgs,
  type SchedulerEpochEnsureResult,
  type SchedulerTickResult,
} from "./tick.js";
import type { WorkerCycleResult } from "./worker.js";
import { runKnowledgeMaintenance } from "./kg.js";

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

interface QueuePressureSnapshot {
  activeWorkers: number;
  blockedQueuedTargets: number;
  candidateLimit: number;
  candidateWindow: number;
  maxWorkers: number;
  openSlots: number;
  queuedTargets: number;
  queueTargetSize: number;
  runningWorkers: number;
  schedulableTargets: number;
}

interface ReplanPolicy {
  activeLowWatermark: number;
  blockedQueueReplan: boolean;
  longTailReplanMs: number;
  queueLowWatermark: number;
  replanCooldownMs: number;
  replanIntervalMs: number;
  schedulableLowWatermark: number;
}

interface ReplanState {
  lastQueueRefill?: QueueRefillResult | null;
  lastPeriodicReplanMs: number;
  lastReplanRequestMs: number;
  longTailSinceMs: number | null;
  nowMs: number;
}

export interface ReplanDecision {
  reason:
    | "active_low_watermark"
    | "blocked_queue_pressure"
    | "long_tail_timeout"
    | "periodic_replan"
    | "queue_refill_exhausted"
    | "queue_low_watermark"
    | "schedulable_refill_exhausted"
    | "schedulable_low_watermark";
  longTailSinceMs: number | null;
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
  epochReadyRefills: number;
  epochTargetsAdmitted: number;
  epochErrors: EpochError[];
  epochPaused: boolean;
  lastEpoch?: EpochCycleResult;
  queueRefills: number;
  queuePriorityRefreshes: number;
  queueTargetsAdded: number;
  lastQueueRefill?: QueueRefillResult;
  workersStarted: number;
  workerResults: WorkerCycleResult[];
  workerErrors: WorkerError[];
  providerPauses: number;
  providerPaused: boolean;
  lastProviderError?: string;
  knowledgeMaintenanceRuns: Record<string, unknown>[];
  knowledgeMaintenanceErrors: KnowledgeMaintenanceError[];
  fastKnowledgeMaintenanceRuns: Record<string, unknown>[];
  fastKnowledgeMaintenanceErrors: KnowledgeMaintenanceError[];
  dryRun: boolean;
  finalStatus: {
    activeWorkers: number;
    blockedQueuedTargets: number;
    queuedTargets: number;
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
async function probeProvider(globals: GlobalArgs, outputDir: string): Promise<{ healthy: boolean; error?: string }> {
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
    });
    if (result.failed) return { healthy: false, error: result.error ?? "probe session failed" };
    if (result.providerError) return { healthy: false, error: result.providerError };
    if (!result.rawText.trim()) return { healthy: false, error: "probe returned empty output" };
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function orchestratorRoot(): string {
  return resolve(import.meta.dir, "../../../../..");
}

function activeLocalWorkerCount(store: StateStore, runId: string, workerIds: Set<string>): number {
  if (workerIds.size === 0) return 0;
  const ids = [...workerIds];
  const placeholders = ids.map(() => "?").join(", ");
  const row = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT COUNT(*) AS count
            FROM leases
            JOIN queue ON leases.queue_id = queue.id
            WHERE queue.run_id = ?
              AND leases.status = 'active'
              AND leases.worker_id IN (${placeholders})
          `,
        )
        .get(runId, ...ids) as Record<string, unknown>,
  );
  return Number(row.count ?? 0);
}

export function workerOpenSlots(params: { maxWorkers: number; activeWorkers: number; runningWorkers: number; activeLocalWorkers: number }): number {
  const pendingLocalWorkers = Math.max(0, params.runningWorkers - params.activeLocalWorkers);
  return Math.max(0, params.maxWorkers - params.activeWorkers - pendingLocalWorkers);
}

function longTailActive(snapshot: QueuePressureSnapshot, policy: ReplanPolicy): boolean {
  const hasLiveWork = snapshot.activeWorkers > 0 || snapshot.runningWorkers > 0;
  const underfilled = snapshot.activeWorkers < snapshot.maxWorkers || snapshot.openSlots > 0;
  const queueLow = snapshot.queuedTargets <= policy.queueLowWatermark;
  const schedulableLow = snapshot.schedulableTargets <= policy.schedulableLowWatermark;
  const blockedPressure = policy.blockedQueueReplan && snapshot.blockedQueuedTargets > 0 && snapshot.openSlots > 0 && snapshot.schedulableTargets < snapshot.openSlots;
  return (
    hasLiveWork &&
    snapshot.maxWorkers > 0 &&
    underfilled &&
    snapshot.activeWorkers <= policy.activeLowWatermark &&
    (queueLow || blockedPressure || schedulableLow || snapshot.blockedQueuedTargets > 0)
  );
}

function nextLongTailSinceMs(snapshot: QueuePressureSnapshot, policy: ReplanPolicy, previous: number | null, nowMs: number): number | null {
  return longTailActive(snapshot, policy) ? previous ?? nowMs : null;
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function candidateLimitArg(args: Map<string, string | true>, maxWorkers: number): number {
  return nonNegativeInt(numberArg(args, "--candidate-limit", Math.max(32, maxWorkers * 2)));
}

function queueTargetSizeArg(args: Map<string, string | true>, params: { candidateLimit: number; maxWorkers: number }): number {
  return nonNegativeInt(numberArg(args, "--queue-target-size", Math.max(params.candidateLimit, params.maxWorkers * 2)));
}

function candidateWindowArg(args: Map<string, string | true>, params: { candidateLimit: number; queueTargetSize: number }): number {
  const fallback = Math.max(params.candidateLimit, params.queueTargetSize * 8);
  return Math.max(params.candidateLimit, params.queueTargetSize, nonNegativeInt(numberArg(args, "--candidate-window", fallback)));
}

function nextCandidateWindow(current: number): number {
  if (current <= 0) return 1;
  return current * 2;
}

function replanPolicy(args: Map<string, string | true>, params: { maxWorkers: number; queueTargetSize: number }): ReplanPolicy {
  return {
    activeLowWatermark: nonNegativeInt(numberArg(args, "--active-low-watermark", Math.ceil(params.maxWorkers * 0.75))),
    blockedQueueReplan: !booleanArg(args, "--no-blocked-queue-replan"),
    longTailReplanMs: nonNegativeInt(numberArg(args, "--long-tail-replan-ms", 5 * 60_000)),
    queueLowWatermark: nonNegativeInt(numberArg(args, "--queue-low-watermark", Math.ceil(params.queueTargetSize * 0.25))),
    replanCooldownMs: nonNegativeInt(numberArg(args, "--replan-cooldown-ms", 5 * 60_000)),
    replanIntervalMs: nonNegativeInt(numberArg(args, "--replan-interval-ms", 0)),
    schedulableLowWatermark: nonNegativeInt(numberArg(args, "--schedulable-low-watermark", params.maxWorkers)),
  };
}

function queueSnapshot(params: {
  candidateLimit: number;
  candidateWindow: number;
  maxWorkers: number;
  queueTargetSize: number;
  runningWorkers: Set<Promise<void>>;
  runningWorkerIds: Set<string>;
  runId: string;
  store: StateStore;
}): QueuePressureSnapshot {
  const activeWorkers = activeWorkerCount(params.store, params.runId);
  const activeLocalWorkers = activeLocalWorkerCount(params.store, params.runId, params.runningWorkerIds);
  const openSlots = workerOpenSlots({
    maxWorkers: params.maxWorkers,
    activeWorkers,
    runningWorkers: params.runningWorkers.size,
    activeLocalWorkers,
  });
  return {
    activeWorkers,
    blockedQueuedTargets: blockedQueuedTargetCount(params.store, params.runId),
    candidateLimit: params.candidateLimit,
    candidateWindow: params.candidateWindow,
    maxWorkers: params.maxWorkers,
    openSlots,
    queuedTargets: queuedTargetCount(params.store, params.runId),
    queueTargetSize: params.queueTargetSize,
    runningWorkers: params.runningWorkers.size,
    schedulableTargets: schedulableTargetCount(params.store, params.runId),
  };
}

function shouldAttemptQueueRefill(snapshot: QueuePressureSnapshot, policy: ReplanPolicy): boolean {
  const blockedPressure =
    policy.blockedQueueReplan && snapshot.blockedQueuedTargets > 0 && snapshot.openSlots > 0 && snapshot.schedulableTargets < snapshot.openSlots;
  return (
    snapshot.queuedTargets < snapshot.queueTargetSize ||
    snapshot.schedulableTargets < Math.min(snapshot.maxWorkers, policy.schedulableLowWatermark) ||
    blockedPressure
  );
}

function combineRefillResults(previous: QueueRefillResult | null, next: QueueRefillResult): QueueRefillResult {
  if (!previous) return next;
  return {
    ...next,
    inserted: previous.inserted + next.inserted,
    refreshed: previous.refreshed + next.refreshed,
    queuedBefore: previous.queuedBefore,
    schedulableBefore: previous.schedulableBefore,
  };
}

export function refillQueueFromBoard(params: {
  forceRefresh?: boolean;
  globals: GlobalArgs;
  graphDbPath?: string;
  policy: ReplanPolicy;
  runId: string;
  snapshot: QueuePressureSnapshot;
  store: StateStore;
}): QueueRefillResult | null {
  if (!shouldAttemptQueueRefill(params.snapshot, params.policy) && !params.forceRefresh) return null;
  const targetSize = params.snapshot.queueTargetSize;
  const minSchedulableSources = Math.min(params.snapshot.maxWorkers, params.policy.schedulableLowWatermark);
  let candidateWindow = params.snapshot.candidateWindow;
  let combined: QueueRefillResult | null = null;

  for (;;) {
    const board = loadKnowledgeBoardSnapshot(params.globals.repoRoot, candidateWindow, {
      graphDbPath: params.graphDbPath ?? params.globals.graphDbPath ?? resourceGraphDbPath(),
    });
    const refill = refillQueuedTargets(params.store, params.runId, board.candidates, {
      targetSize,
      minSchedulableSources,
    });
    combined = combineRefillResults(combined, refill);

    const targetSatisfied = combined.queuedAfter >= targetSize && combined.schedulableAfter >= minSchedulableSources;
    const boardExhausted = board.candidates.length < candidateWindow;
    if (targetSatisfied || boardExhausted) return combined;

    const nextWindow = nextCandidateWindow(candidateWindow);
    if (nextWindow <= candidateWindow) return combined;
    candidateWindow = nextWindow;
  }
}

function exhaustedRefillDecision(refill: QueueRefillResult | null | undefined, longTailSinceMs: number | null): ReplanDecision | null {
  if (!refill) return null;
  if (refill.schedulableAfter < refill.minSchedulableSources) {
    return { reason: "schedulable_refill_exhausted", longTailSinceMs };
  }
  if (refill.queuedAfter < refill.targetSize) {
    return { reason: "queue_refill_exhausted", longTailSinceMs };
  }
  return null;
}

export function evaluateReplanDecision(snapshot: QueuePressureSnapshot, policy: ReplanPolicy, state: ReplanState): ReplanDecision | null {
  const hasLiveWork = snapshot.activeWorkers > 0 || snapshot.runningWorkers > 0;
  const hasCapacityPressure = hasLiveWork && snapshot.maxWorkers > 0;
  const underfilled = snapshot.activeWorkers < snapshot.maxWorkers || snapshot.openSlots > 0;
  const schedulableLow = snapshot.schedulableTargets <= policy.schedulableLowWatermark;
  const queueLow = snapshot.queuedTargets <= policy.queueLowWatermark;
  const blockedPressure = policy.blockedQueueReplan && snapshot.blockedQueuedTargets > 0 && snapshot.openSlots > 0 && snapshot.schedulableTargets < snapshot.openSlots;
  const longTailSinceMs = nextLongTailSinceMs(snapshot, policy, state.longTailSinceMs, state.nowMs);
  const cooldownActive = policy.replanCooldownMs > 0 && state.nowMs - state.lastReplanRequestMs < policy.replanCooldownMs;

  if (!hasCapacityPressure) return null;
  if (cooldownActive) return null;

  const exhaustedRefill = exhaustedRefillDecision(state.lastQueueRefill, longTailSinceMs);
  if (exhaustedRefill) return exhaustedRefill;
  if (policy.replanIntervalMs > 0 && state.nowMs - state.lastPeriodicReplanMs >= policy.replanIntervalMs) {
    return { reason: "periodic_replan", longTailSinceMs };
  }
  if (blockedPressure) return { reason: "blocked_queue_pressure", longTailSinceMs };
  if (queueLow) return { reason: "queue_low_watermark", longTailSinceMs };
  if (underfilled && schedulableLow) return { reason: "schedulable_low_watermark", longTailSinceMs };
  if (longTailSinceMs != null && policy.longTailReplanMs > 0 && state.nowMs - longTailSinceMs >= policy.longTailReplanMs) {
    return { reason: "long_tail_timeout", longTailSinceMs };
  }
  if (underfilled && snapshot.activeWorkers > 0 && snapshot.activeWorkers <= policy.activeLowWatermark && (queueLow || snapshot.blockedQueuedTargets > 0)) {
    return { reason: "active_low_watermark", longTailSinceMs };
  }

  return null;
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

function writeReplanEvent(
  store: StateStore,
  runId: string,
  decision: ReplanDecision,
  snapshot: QueuePressureSnapshot,
  policy: ReplanPolicy,
  refill?: QueueRefillResult | null,
): string {
  return addEvent(store, runId, "pool_below_target", "run-loop", {
    reason: decision.reason,
    snapshot,
    policy,
    refill: refill ?? null,
    created_by: "run-loop",
  });
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

function fullBoundaryKnowledgeMaintenanceArgs(args: Map<string, string | true>, runId: string, mode: string): Map<string, string | true> {
  const next = knowledgeMaintenanceArgs(args, runId, false);
  if (!next.has("--run-pr-agent")) next.set("--no-run-pr-agent", true);
  if (mode === "no-tool-runners") next.set("--no-tool-runners", true);
  return next;
}

function knowledgeMaintenanceIntervalMs(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-knowledge-maintenance")) return 0;
  const fallback = globals.dryRunAgents ? 0 : 5 * 60_000;
  return Math.max(0, Math.floor(numberArg(args, "--knowledge-maintenance-interval-ms", fallback)));
}

function fastKnowledgeMaintenanceIntervalMs(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-fast-kg-maintenance")) return 0;
  const fallback = globals.project?.dashboard.fastKgMaintenanceEnabled === false ? 0 : (globals.project?.dashboard.fastKgMaintenanceIntervalMs ?? (globals.dryRunAgents ? 0 : 3 * 60_000));
  return Math.max(0, Math.floor(numberArg(args, "--fast-kg-maintenance-interval-ms", fallback)));
}

function fastKnowledgeMaintenanceReportCount(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-fast-kg-maintenance")) return 0;
  return Math.max(0, Math.floor(numberArg(args, "--fast-kg-maintenance-report-count", globals.project?.dashboard.fastKgMaintenanceReportCount ?? 16)));
}

function workerReportCountSince(store: StateStore, runId: string, sinceIso: string): number {
  const row = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT COUNT(*) AS count
            FROM worker_reports
            JOIN leases ON leases.id = worker_reports.lease_id
            JOIN queue ON queue.id = leases.queue_id
            WHERE queue.run_id = ?
              AND worker_reports.report_type != 'provider_error'
              AND worker_reports.created_at > ?
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

async function waitForRestingTrigger(runningWorkers: Set<Promise<void>>, idleSleepMs: number, extras: Array<Promise<void> | null> = []): Promise<void> {
  const live = [...runningWorkers, ...extras.filter((task): task is Promise<void> => task != null)];
  if (live.length === 0) {
    await sleep(idleSleepMs);
    return;
  }
  await Promise.race([sleep(idleSleepMs), ...live]);
}

function schedulerTickArgs(
  args: Map<string, string | true>,
  params: { candidateLimit: number; candidateWindow: number; queueTargetSize: number; runId: string },
): Map<string, string | true> {
  return cloneArgs(args, [
    ["--run-id", params.runId],
    ["--candidate-limit", String(params.candidateLimit)],
    ["--candidate-window", String(params.candidateWindow)],
    ["--queue-target-size", String(params.queueTargetSize)],
  ]);
}

function workerCommand(
  globals: GlobalArgs,
  params: {
    runId: string;
    workerId: string;
    reportType: string;
    baseRev: string;
    ttlSeconds: number;
    thinkingLevel: string;
    repairAttempts: number;
    postReturnCheckCommand: string;
    graphDbPath: string;
  },
): string[] {
  const bin = resolve(orchestratorRoot(), "apps/cli/src/bin/decomp-orchestrator.ts");
  const command = [
    "bun",
    bin,
    "--repo-root",
    globals.repoRoot,
    "--state-dir",
    globals.stateDir,
    "--provider",
    globals.provider,
    "--model",
    globals.model,
    "--thinking-level",
    params.thinkingLevel,
  ];
  if (globals.projectId) command.splice(2, 0, "--project", globals.projectId);
  if (globals.dryRunAgents) command.push("--dry-run-agents");
  if (globals.agentTimeoutSeconds != null) command.push("--agent-timeout-seconds", String(globals.agentTimeoutSeconds));
  command.push(
    "worker",
    "--run-id",
    params.runId,
    "--worker-id",
    params.workerId,
    "--report-type",
    params.reportType,
    "--base-rev",
    params.baseRev,
    "--ttl-seconds",
    String(params.ttlSeconds),
    "--repair-attempts",
    String(params.repairAttempts),
  );
  if (params.postReturnCheckCommand) command.push("--post-return-check-command", params.postReturnCheckCommand);
  command.push("--graph-db", params.graphDbPath);
  return command;
}

async function runWorkerProcess(
  globals: GlobalArgs,
  params: {
    runId: string;
    workerId: string;
    reportType: string;
    baseRev: string;
    ttlSeconds: number;
    thinkingLevel: string;
    repairAttempts: number;
    postReturnCheckCommand: string;
    graphDbPath: string;
  },
  procRegistry?: Set<{ kill: (signal?: number) => void; exited: Promise<number> }>,
): Promise<WorkerCycleResult> {
  const command = workerCommand(globals, params);
  const proc = Bun.spawn(command, {
    cwd: orchestratorRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  procRegistry?.add(proc);
  void proc.exited.finally(() => procRegistry?.delete(proc));
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
  if (exitCode !== 0) {
    throw new Error(`Worker process failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  }
  try {
    return JSON.parse(stdout) as WorkerCycleResult;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Worker process returned non-JSON output: ${detail}\n${stdout}\n${stderr}`);
  }
}

export async function runRunLoop(globals: GlobalArgs, args: Map<string, string | true>): Promise<RunLoopResult> {
  const store = openState(globals.stateDir);
  const workerResults: WorkerCycleResult[] = [];
  const workerErrors: WorkerError[] = [];
  const schedulerResults: SchedulerTickResult[] = [];
  const knowledgeMaintenanceRuns: Record<string, unknown>[] = [];
  const knowledgeMaintenanceErrors: KnowledgeMaintenanceError[] = [];
  const fastKnowledgeMaintenanceRuns: Record<string, unknown>[] = [];
  const fastKnowledgeMaintenanceErrors: KnowledgeMaintenanceError[] = [];
  const runningWorkers = new Set<Promise<void>>();
  const runningWorkerIds = new Set<string>();
  const runningWorkerProcs = new Set<{ kill: (signal?: number) => void; exited: Promise<number> }>();
  let runningScheduler: Promise<void> | null = null;
  let runningKnowledgeMaintenance: Promise<void> | null = null;
  let stoppedReason = "running";
  let stopRequested = false;
  let iterations = 0;
  let idleIterations = 0;
  let workersStarted = 0;
  let workerOrdinal = 0;
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

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "run-loop");

    const maxIterations = booleanArg(args, "--once") ? 1 : numberArg(args, "--max-iterations", 0);
    const maxIdleIterations = numberArg(args, "--max-idle-iterations", 0);
    const idleSleepMs = numberArg(args, "--idle-sleep-ms", 5_000);
    const requestedMaxWorkers = numberArg(args, "--max-workers", run.desiredWorkers);
    const maxWorkers = Math.max(0, Math.min(run.desiredWorkers, requestedMaxWorkers));
    if (requestedMaxWorkers > run.desiredWorkers) {
      console.error(
        `[run-loop] --max-workers ${requestedMaxWorkers} exceeds run desired_workers ${run.desiredWorkers}; clamping to ${maxWorkers}. ` +
          `Raise the run's desired_workers (or re-init with --desired-workers) to use the full pool.`,
      );
    }
    const candidateLimit = nonNegativeInt(numberArg(args, "--candidate-limit", globals.project?.dashboard.candidateLimit ?? Math.max(32, maxWorkers * 2)));
    const queueTargetSize = nonNegativeInt(
      numberArg(args, "--queue-target-size", globals.project?.dashboard.queueTargetSize ?? Math.max(candidateLimit, maxWorkers * 2)),
    );
    const candidateWindow = Math.max(
      candidateLimit,
      queueTargetSize,
      nonNegativeInt(numberArg(args, "--candidate-window", globals.project?.dashboard.candidateWindow ?? Math.max(candidateLimit, queueTargetSize * 8))),
    );
    const reportType = workerReportTypeArg(args, "--report-type", "stalled_no_useful_guess");
    const baseRev = stringArg(args, "--base-rev", "unknown");
    const ttlSeconds = numberArg(args, "--ttl-seconds", DEFAULT_WORKER_TTL_SECONDS);
    const repairAttempts = Math.max(0, Math.trunc(numberArg(args, "--repair-attempts", globals.dryRunAgents ? 0 : 2)));
    const postReturnCheckCommand = stringArg(args, "--post-return-check-command", "");
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    const exitOnWorkerError = booleanArg(args, "--exit-on-worker-error");
    const workerThinkingLevel = stringArg(args, "--worker-thinking-level", globals.thinkingLevel);
    const maintenanceIntervalMs = knowledgeMaintenanceIntervalMs(globals, args);
    const epochCycleEnabled = !booleanArg(args, "--no-epoch-cycle");
    const schedulerEpochConfig = schedulerEpochConfigFromArgs(globals, args, { candidateWindow, queueTargetSize });
    const readyQueueTargetSize = epochCycleEnabled ? schedulerEpochConfig.readyQueueSize : queueTargetSize;
    const policy = replanPolicy(args, { maxWorkers, queueTargetSize: readyQueueTargetSize });
    const epochWorktreeDir = stringArg(args, "--epoch-worktree", resolve(globals.stateDir, "epoch_worktree"));
    const epochConfigureCommand = stringArg(args, "--epoch-configure-command", "python3 configure.py --require-protos");
    const epochLinkPaths = stringArg(args, "--epoch-link-paths", "orig")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean);
    const epochPauseThreshold = nonNegativeInt(numberArg(args, "--epoch-regression-pause-threshold", 12));
    const epochRequeueLimit = nonNegativeInt(numberArg(args, "--epoch-regression-requeue-limit", 32));
    const epochRetryMs = nonNegativeInt(numberArg(args, "--epoch-retry-ms", 10 * 60_000));
    const fullKgMaintenanceMode = stringArg(args, "--full-kg-maintenance-mode", globals.project?.dashboard.fullKgMaintenanceMode ?? "full").trim().toLowerCase();
    let runningEpoch: Promise<void> | null = null;
    let nextEpochAllowedMs = 0;
    let epochCycles = 0;
    let epochPaused = false;
    let lastEpoch: EpochCycleResult | undefined;
    const epochErrors: EpochError[] = [];
    let queueRefills = 0;
    let queuePriorityRefreshes = 0;
    let queueTargetsAdded = 0;
    let epochAdmissions = 0;
    let epochReadyRefills = 0;
    let epochTargetsAdmitted = 0;
    let lastSchedulerEpoch: EpochProgressSummary | null = null;
    let lastQueueRefill: QueueRefillResult | undefined;
    let lastReplanRequestMs = 0;
    let lastPeriodicReplanMs = Date.now();
    let longTailSinceMs: number | null = null;
    let lastKnowledgeMaintenanceMs = maintenanceIntervalMs > 0 ? 0 : Date.now();
    const fastMaintenanceIntervalMs = fastKnowledgeMaintenanceIntervalMs(globals, args);
    const fastMaintenanceReportCount = fastKnowledgeMaintenanceReportCount(globals, args);
    let lastFastMaintenanceMs = Date.now();
    let lastFastMaintenanceReportIso = latestFastRefreshFinishedAt(store, runId, run.createdAt);
    let runningFastKnowledgeMaintenance: Promise<void> | null = null;
    let pendingFastKnowledgeMaintenance = false;
    const queueRefreshIntervalMs = nonNegativeInt(numberArg(args, "--queue-refresh-interval-ms", 60_000));
    let lastQueueRefreshMs = queueRefreshIntervalMs > 0 ? 0 : Date.now();

    while (!stopRequested) {
      let didWork = false;

      if (!runningKnowledgeMaintenance && maintenanceIntervalMs > 0 && Date.now() - lastKnowledgeMaintenanceMs >= maintenanceIntervalMs) {
        lastKnowledgeMaintenanceMs = Date.now();
        let task: Promise<void>;
        task = runKnowledgeMaintenance(globals, knowledgeMaintenanceArgs(args, runId, !globals.dryRunAgents))
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
        didWork = true;
      }

      const beforeRefill = queueSnapshot({
        candidateLimit,
        candidateWindow,
        maxWorkers,
        queueTargetSize: readyQueueTargetSize,
        runningWorkers,
        runningWorkerIds,
        runId,
        store,
      });
      const nowMs = Date.now();
      const launchEpochCycle = (trigger: string, schedulerEpochId?: string): void => {
        const epochOrdinal = epochCycles + 1;
        let task: Promise<void>;
        task = (async () => {
            try {
              let boundaryResult: EpochCycleResult | undefined;
              if (globals.dryRunAgents) {
                // Dry runs skip the snapshot/build but still close/start
                // scheduler epochs so tests exercise deterministic admission.
                epochCycles += 1;
              } else {
                console.error(`[run-loop] epoch ${epochOrdinal}: ${trigger}; snapshotting and rebuilding report`);
                const result = await runEpochCycle(store, runId, globals.repoRoot, globals.stateDir, {
                  baseRef: globals.project?.baseRef,
                  configureCommand: epochConfigureCommand,
                  label: `epoch-${epochOrdinal}`,
                  linkPaths: epochLinkPaths,
                  projectId: globals.project?.projectId ?? globals.projectId ?? null,
                  qaScan: { orchestratorRoot: packageRoot() },
                  regressionPauseThreshold: epochPauseThreshold,
                  regressionRequeueLimit: epochRequeueLimit,
                  reportRelPath: globals.project?.validation.reportPath,
                  reportChangesRelPath: globals.project?.validation.reportChangesPath,
                  worktreeDir: epochWorktreeDir,
                });
                boundaryResult = result;
                epochCycles += 1;
                lastEpoch = result;
                epochPaused = result.repair.paused;
                console.error(
                  `[run-loop] epoch ${epochOrdinal}: matched_code ${result.matchedCodePercent ?? "?"}%, ` +
                    `${result.regressions.regressedFunctions} regressed functions, ${result.repair.requeued} repairs requeued, ` +
                    `qa gate ${result.qaGate === null ? "not run" : `${result.qaGate.status} (${result.qaGate.errors} errors, ${result.qaGate.warnings} warnings)`} ` +
                    `(${Math.round(result.durationMs / 1000)}s)`,
                );
                if (result.repair.paused) {
                  addEvent(store, runId, "epoch_regression_pause", "run-loop", {
                    epoch: epochOrdinal,
                    qa_gate: result.qaGate,
                    reasons: result.repair.reasons,
                    regressions: result.regressions,
                    save_point_id: result.savePointId,
                    created_by: "run-loop",
                  });
                  console.error(`[run-loop] epoch ${epochOrdinal}: paused on regressions; retrying in ${Math.round(epochRetryMs / 1000)}s`);
                  if (schedulerEpochId) {
                    closeSchedulerEpoch(store, schedulerEpochId, {
                      status: "paused",
                      boundaryStatus: "regression_pause",
                      routingSummary: {
                        trigger,
                        save_point_id: result.savePointId,
                        regressions: result.regressions,
                        repair: result.repair,
                        qa_gate: result.qaGate,
                      },
                    });
                  }
                  nextEpochAllowedMs = Date.now() + epochRetryMs;
                  return;
                }
              }

              if (!globals.dryRunAgents && fullKgMaintenanceMode !== "skip" && fullKgMaintenanceMode !== "none" && fullKgMaintenanceMode !== "off") {
                addEvent(store, runId, "epoch_full_refresh_started", "run-loop", {
                  epoch: epochOrdinal,
                  lane: "full_boundary",
                  mode: fullKgMaintenanceMode,
                  created_by: "run-loop",
                });
                const maintenance = await runKnowledgeMaintenance(globals, fullBoundaryKnowledgeMaintenanceArgs(args, runId, fullKgMaintenanceMode));
                knowledgeMaintenanceRuns.push({ ...maintenance, lane: "full_boundary", mode: fullKgMaintenanceMode });
                addEvent(store, runId, "epoch_full_refresh_finished", "run-loop", {
                  epoch: epochOrdinal,
                  lane: "full_boundary",
                  mode: fullKgMaintenanceMode,
                  created_by: "run-loop",
                });
              }

              if (schedulerEpochId) {
                closeSchedulerEpoch(store, schedulerEpochId, {
                  status: "completed",
                  boundaryStatus: globals.dryRunAgents ? "dry_run" : "success",
                  routingSummary: {
                    trigger,
                    dry_run: globals.dryRunAgents,
                    save_point_id: boundaryResult?.savePointId ?? null,
                    matched_code_percent: boundaryResult?.matchedCodePercent ?? null,
                    regressions: boundaryResult?.regressions ?? null,
                    repair: boundaryResult?.repair ?? null,
                    qa_gate: boundaryResult?.qaGate ?? null,
                  },
                });
              }

              const nextEpoch = ensureSchedulerEpochFromBoard({
                config: schedulerEpochConfig,
                globals,
                graphDbPath,
                runId,
                store,
              });
              lastSchedulerEpoch = nextEpoch.progress;
              epochAdmissions += (nextEpoch.admission?.admitted ?? 0) + (nextEpoch.existingAdmission?.admitted ?? 0);
              epochReadyRefills += nextEpoch.readyRefill.inserted > 0 ? 1 : 0;
              epochTargetsAdmitted += (nextEpoch.admission?.admitted ?? 0) + (nextEpoch.existingAdmission?.admitted ?? 0);
              queueTargetsAdded += (nextEpoch.admission?.queued ?? 0) + nextEpoch.readyRefill.inserted;
              queuePriorityRefreshes += nextEpoch.priorityRefreshes;
              if ((nextEpoch.progress.admitted === 0 || nextEpoch.progress.remaining === 0) && nextEpoch.progress.readyQueued === 0 && nextEpoch.progress.leased === 0) {
                closeSchedulerEpoch(store, nextEpoch.epoch.id, {
                  status: "exhausted",
                  boundaryStatus: "board_exhausted",
                  routingSummary: { trigger: "post_boundary_admission", board_exhausted: nextEpoch.boardExhausted },
                });
                addEvent(store, runId, "epoch_exhausted", "run-loop", {
                  epoch_id: nextEpoch.epoch.id,
                  ordinal: nextEpoch.progress.ordinal,
                  size: nextEpoch.progress.size,
                  created_by: "run-loop",
                });
                nextEpochAllowedMs = Date.now() + epochRetryMs;
              } else {
                addEvent(store, runId, "epoch_admitted", "run-loop", {
                  epoch_id: nextEpoch.epoch.id,
                  ordinal: nextEpoch.progress.ordinal,
                  admitted: nextEpoch.progress.admitted,
                  ready_queued: nextEpoch.progress.readyQueued,
                  size: nextEpoch.progress.size,
                  created_by: "run-loop",
                });
                if (nextEpoch.readyRefill.inserted > 0 || (nextEpoch.admission?.queued ?? 0) > 0) {
                  didWork = true;
                }
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              epochErrors.push({ error: message });
              console.error(`[run-loop] epoch ${epochOrdinal} failed: ${message}`);
              addEvent(store, runId, "epoch_cycle_error", "run-loop", {
                epoch: epochOrdinal,
                error: message.slice(0, 2000),
                created_by: "run-loop",
              });
              if (schedulerEpochId) {
                closeSchedulerEpoch(store, schedulerEpochId, {
                  status: "error",
                  boundaryStatus: "error",
                  routingSummary: { trigger, error: message.slice(0, 2000) },
                });
              }
              nextEpochAllowedMs = Date.now() + epochRetryMs;
            }
        })().finally(() => {
          if (runningEpoch === task) runningEpoch = null;
        });
        runningEpoch = task;
      };

      if (epochCycleEnabled && fastMaintenanceIntervalMs > 0 && !runningEpoch) {
        const reportsSinceFast = workerReportCountSince(store, runId, lastFastMaintenanceReportIso);
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
            addEvent(store, runId, "epoch_fast_refresh_started", "run-loop", {
              epoch_id: activeEpoch?.id ?? null,
              reports_since_refresh: fastDecision.reportsSinceRefresh,
              reason: fastDecision.reason,
              created_by: "run-loop",
            });
            let task: Promise<void>;
            task = runKnowledgeMaintenance(globals, fastKnowledgeMaintenanceArgs(args, runId))
              .then((result) => {
                const completedAt = new Date().toISOString();
                fastKnowledgeMaintenanceRuns.push({ ...result, lane: "fast_run_evidence" });
                lastFastMaintenanceReportIso = completedAt;
                const epoch = activeSchedulerEpoch(store, runId);
                let progress: EpochProgressSummary | null = null;
                let priorityRefreshes = 0;
                let readyRefillInserted = 0;
                if (epoch) {
                  recordSchedulerEpochFastRefresh(store, epoch.id);
                  const board = loadKnowledgeBoardSnapshot(globals.repoRoot, schedulerEpochConfig.candidateWindow, {
                    graphDbPath,
                  });
                  priorityRefreshes = refreshEpochQueuedTargetPriorities(store, {
                    epochId: epoch.id,
                    runId,
                    candidates: board.candidates,
                  }).refreshed;
                  const readyRefill = refillEpochReadyQueue(store, epoch.id);
                  readyRefillInserted = readyRefill.inserted;
                  if (readyRefillInserted > 0) {
                    epochReadyRefills += 1;
                    queueTargetsAdded += readyRefillInserted;
                  }
                  progress = schedulerEpochProgress(store, epoch.id);
                  lastSchedulerEpoch = progress;
                  queuePriorityRefreshes += priorityRefreshes;
                }
                addEvent(store, runId, "epoch_fast_refresh_finished", "run-loop", {
                  epoch_id: epoch?.id ?? null,
                  reports_since_refresh: fastDecision.reportsSinceRefresh,
                  priority_refreshes: priorityRefreshes,
                  ready_refill_inserted: readyRefillInserted,
                  progress,
                  created_by: "run-loop",
                });
              })
              .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                fastKnowledgeMaintenanceErrors.push({ error: message });
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
            didWork = true;
          }
        }
      }

      if (epochCycleEnabled) {
        if (!runningEpoch && nowMs >= nextEpochAllowedMs && !epochPaused) {
          const epochResult = ensureSchedulerEpochFromBoard({
            config: schedulerEpochConfig,
            globals,
            graphDbPath,
            runId,
            store,
          });
          lastSchedulerEpoch = epochResult.progress;
          const admittedNow = (epochResult.admission?.admitted ?? 0) + (epochResult.existingAdmission?.admitted ?? 0);
          const queuedNow = (epochResult.admission?.queued ?? 0) + epochResult.readyRefill.inserted;
          if (admittedNow > 0) {
            epochAdmissions += 1;
            epochTargetsAdmitted += admittedNow;
          }
          if (epochResult.readyRefill.inserted > 0) epochReadyRefills += 1;
          if (epochResult.priorityRefreshes > 0) queuePriorityRefreshes += epochResult.priorityRefreshes;
          if (queuedNow > 0 || epochResult.priorityRefreshes > 0) didWork = true;
          queueTargetsAdded += queuedNow;

          if (admittedNow > 0) {
            addEvent(store, runId, "epoch_admitted", "run-loop", {
              epoch_id: epochResult.epoch.id,
              ordinal: epochResult.progress.ordinal,
              admitted: epochResult.progress.admitted,
              admitted_now: admittedNow,
              ready_queued: epochResult.progress.readyQueued,
              size: epochResult.progress.size,
              created_by: "run-loop",
            });
          }

          if (epochResult.progress.admitted === 0 && beforeRefill.activeWorkers === 0 && beforeRefill.queuedTargets === 0) {
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
          } else if (epochResult.progress.admitted > 0 && epochResult.progress.remaining === 0 && epochResult.progress.leased === 0) {
            didWork = true;
            launchEpochCycle(`scheduler epoch ${epochResult.progress.ordinal} completed`, epochResult.epoch.id);
          }
        }
      } else {
        const refillNeeded = shouldAttemptQueueRefill(beforeRefill, policy);
        const refreshDue = queueRefreshIntervalMs > 0 && beforeRefill.queuedTargets > 0 && nowMs - lastQueueRefreshMs >= queueRefreshIntervalMs;
        const refill = refillQueueFromBoard({ forceRefresh: refreshDue, globals, graphDbPath, policy, runId, snapshot: beforeRefill, store });
        if (refill) {
          if (refillNeeded) queueRefills += 1;
          if (refill.refreshed > 0) queuePriorityRefreshes += refill.refreshed;
          queueTargetsAdded += refill.inserted;
          if (refillNeeded) lastQueueRefill = refill;
          if (refreshDue) lastQueueRefreshMs = nowMs;
          if (refill.inserted > 0 || refill.refreshed > 0) didWork = true;
        }

        const replanSnapshot = queueSnapshot({
          candidateLimit,
          candidateWindow,
          maxWorkers,
          queueTargetSize: readyQueueTargetSize,
          runningWorkers,
          runningWorkerIds,
          runId,
          store,
        });
        const replanDecision = evaluateReplanDecision(replanSnapshot, policy, {
          lastQueueRefill: refill,
          lastPeriodicReplanMs,
          lastReplanRequestMs,
          longTailSinceMs,
          nowMs: Date.now(),
        });
        longTailSinceMs = nextLongTailSinceMs(replanSnapshot, policy, longTailSinceMs, Date.now());
        if (replanDecision && unhandledPoolEventCount(store, runId) === 0) {
          writeReplanEvent(store, runId, replanDecision, replanSnapshot, policy, refill);
          lastReplanRequestMs = Date.now();
          if (replanDecision.reason === "periodic_replan") lastPeriodicReplanMs = lastReplanRequestMs;
          didWork = true;
        }

      }

      if (providerPausedSinceMs != null && !runningProviderProbe && Date.now() >= nextProviderProbeMs) {
        const probeDir = resolve(globals.stateDir, "runs", runId, "provider_probes");
        let probeTask: Promise<void>;
        probeTask = probeProvider(globals, probeDir)
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

      const activeWorkers = activeWorkerCount(store, runId);
      const activeLocalWorkers = activeLocalWorkerCount(store, runId, runningWorkerIds);
      const queuedTargets = schedulableTargetCount(store, runId);
      const openSlots = workerOpenSlots({
        maxWorkers,
        activeWorkers,
        runningWorkers: runningWorkers.size,
        activeLocalWorkers,
      });
      const workersToStart = providerPausedSinceMs != null ? 0 : Math.min(openSlots, queuedTargets);
      for (let index = 0; index < workersToStart; index += 1) {
        workerOrdinal += 1;
        workersStarted += 1;
        didWork = true;
        const workerId = `runloop-${process.pid}-${workerOrdinal}-${randomUUID().slice(0, 8)}`;
        let task: Promise<void>;
        task = runWorkerProcess(
          globals,
          {
            runId,
            workerId,
            reportType,
            baseRev,
            ttlSeconds,
            thinkingLevel: workerThinkingLevel,
            repairAttempts,
            postReturnCheckCommand,
            graphDbPath,
          },
          runningWorkerProcs,
        )
          .then((result) => {
            workerResults.push(result);
            // Provider failures requeue their target and pause spawning until a probe
            // succeeds — the provider being down is not the pool's fault, so it never
            // trips exit-on-worker-error.
            if (result.providerFailure) {
              lastProviderError = result.error ?? "provider error";
              if (providerPausedSinceMs == null) {
                providerPausedSinceMs = Date.now();
                providerPauses += 1;
                providerProbeBackoffMs = PROVIDER_PROBE_INITIAL_BACKOFF_MS;
                nextProviderProbeMs = Date.now() + providerProbeBackoffMs;
                console.error(
                  `[run-loop] provider failure from ${workerId}: ${lastProviderError}; pausing worker spawns until a provider probe succeeds`,
                );
              }
              return;
            }
            // failed is set only for explicit tool_error (infrastructure) results;
            // needs_rework gate rejections and heuristic tool_error guesses are normal
            // completions and never trip exit-on-worker-error.
            if (result.failed) {
              workerErrors.push({
                workerId,
                error: result.error ?? `Worker reported ${result.reportType ?? "error"}`,
              });
              if (exitOnWorkerError) {
                stopRequested = true;
                stoppedReason = "worker_error";
              }
            }
          })
          .catch((error) => {
            workerErrors.push({
              workerId,
              error: error instanceof Error ? error.message : String(error),
            });
            if (exitOnWorkerError) {
              stopRequested = true;
              stoppedReason = "worker_error";
            }
          })
          .finally(() => {
            runningWorkers.delete(task);
            runningWorkerIds.delete(workerId);
          });
        runningWorkers.add(task);
        runningWorkerIds.add(workerId);
      }

      if (!runningScheduler && nextUnhandledEvent(store, runId)) {
        const tickArgs = schedulerTickArgs(args, { candidateLimit, candidateWindow, queueTargetSize: readyQueueTargetSize, runId });
        let task: Promise<void>;
        task = runSchedulerTick(globals, tickArgs)
          .then((result) => {
            schedulerResults.push(result);
            if (result.schedulerEpoch) lastSchedulerEpoch = result.schedulerEpoch;
            const admittedByTick = (result.epochAdmission?.admitted ?? 0) + (result.existingEpochAdmission?.admitted ?? 0);
            if (admittedByTick > 0) {
              epochAdmissions += 1;
              epochTargetsAdmitted += admittedByTick;
            }
            if ((result.epochReadyRefill?.inserted ?? 0) > 0) epochReadyRefills += 1;
            queueTargetsAdded += (result.epochAdmission?.queued ?? 0) + (result.epochReadyRefill?.inserted ?? 0);
            queuePriorityRefreshes += result.epochPriorityRefreshes ?? 0;
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
        didWork = true;
      }

      if (didWork || runningWorkers.size === 0) iterations += 1;
      if (didWork || runningWorkers.size > 0 || runningEpoch || runningFastKnowledgeMaintenance) idleIterations = 0;
      else idleIterations += 1;

      if (maxIdleIterations > 0 && idleIterations >= maxIdleIterations && unhandledEventCount(store, runId) === 0) {
        stoppedReason = "idle";
        break;
      }
      if (maxIterations > 0 && iterations >= maxIterations && runningWorkers.size === 0 && !runningEpoch) {
        stoppedReason = "max_iterations";
        break;
      }

      await waitForRestingTrigger(runningWorkers, idleSleepMs, [runningEpoch, runningFastKnowledgeMaintenance]);
    }

    if (runningWorkers.size > 0) {
      // A stopped pool must not wedge for hours awaiting worker TTLs (workers
      // ignore SIGTERM). Give in-flight workers a short grace, then kill them;
      // babysit's lease recovery requeues whatever they were holding.
      addEvent(store, runId, "pool_stopping", "run-loop", {
        reason: stoppedReason,
        running_workers: runningWorkers.size,
        created_by: "run-loop",
      });
      const grace = new Promise<void>((resolveGrace) => setTimeout(resolveGrace, 30_000));
      await Promise.race([Promise.allSettled([...runningWorkers]).then(() => undefined), grace]);
      for (const proc of runningWorkerProcs) proc.kill(9);
      await Promise.allSettled([...runningWorkers]);
    }
    if (runningEpoch) await runningEpoch;
    if (runningScheduler) await runningScheduler;
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
      epochReadyRefills,
      epochTargetsAdmitted,
      epochErrors,
      epochPaused,
      lastEpoch,
      queueRefills,
      queuePriorityRefreshes,
      queueTargetsAdded,
      lastQueueRefill,
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
      dryRun: globals.dryRunAgents,
      finalStatus: {
        activeWorkers: activeWorkerCount(store, runId),
        blockedQueuedTargets: blockedQueuedTargetCount(store, runId),
        queuedTargets: queuedTargetCount(store, runId),
        schedulableTargets: schedulableTargetCount(store, runId),
        unhandledEvents: unhandledEventCount(store, runId),
      },
    };
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    store.db.close();
  }
}

export async function runTriggerAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<RunLoopResult> {
  return runRunLoop(globals, args);
}

export async function runLoop(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runRunLoop(globals, args), null, 2));
}

export async function triggerAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runRunLoop(globals, args), null, 2));
}
