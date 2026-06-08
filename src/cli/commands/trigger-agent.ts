import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadBoardSnapshot } from "../../board/index.js";
import { resourceGraphDbPath } from "../../knowledge/index.js";
import {
  activeWorkerCount,
  addEvent,
  blockedQueuedTargetCount,
  getLatestRun,
  getRun,
  nextUnhandledEvent,
  openState,
  queuedTargetCount,
  refillQueuedTargets,
  schedulableTargetCount,
  unhandledEventCount,
  unhandledPoolEventCount,
  type QueueRefillResult,
  type StateStore,
} from "../../state/index.js";
import { withBusyRetry } from "../../state/db.js";
import { booleanArg, numberArg, stringArg, workerReportTypeArg, type GlobalArgs } from "../args.js";
import { assertSchedulableRun } from "./shared.js";
import { runDirectorTick, type DirectorTickResult } from "./tick.js";
import type { WorkerCycleResult } from "./worker.js";
import { runKnowledgeMaintenance } from "./kg.js";

interface WorkerError {
  workerId: string;
  error: string;
}

interface KnowledgeMaintenanceError {
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

export interface TriggerAgentResult {
  runId: string;
  mode: "trigger_agent";
  stoppedReason: string;
  iterations: number;
  idleIterations: number;
  desiredWorkers: number;
  maxWorkers: number;
  directorTicks: number;
  queueRefills: number;
  queuePriorityRefreshes: number;
  queueTargetsAdded: number;
  lastQueueRefill?: QueueRefillResult;
  workersStarted: number;
  workerResults: WorkerCycleResult[];
  workerErrors: WorkerError[];
  knowledgeMaintenanceRuns: Record<string, unknown>[];
  knowledgeMaintenanceErrors: KnowledgeMaintenanceError[];
  dryRun: boolean;
  finalStatus: {
    activeWorkers: number;
    blockedQueuedTargets: number;
    queuedTargets: number;
    schedulableTargets: number;
    unhandledEvents: number;
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const board = loadBoardSnapshot(params.globals.repoRoot, candidateWindow, {
      graphDbPath: params.graphDbPath ?? resourceGraphDbPath(),
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

function writeReplanEvent(
  store: StateStore,
  runId: string,
  decision: ReplanDecision,
  snapshot: QueuePressureSnapshot,
  policy: ReplanPolicy,
  refill?: QueueRefillResult | null,
): string {
  return addEvent(store, runId, "pool_below_target", "trigger-agent", {
    reason: decision.reason,
    snapshot,
    policy,
    refill: refill ?? null,
    created_by: "trigger-agent",
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

function knowledgeMaintenanceIntervalMs(globals: GlobalArgs, args: Map<string, string | true>): number {
  if (booleanArg(args, "--no-knowledge-maintenance")) return 0;
  const fallback = globals.dryRunAgents ? 0 : 5 * 60_000;
  return Math.max(0, Math.floor(numberArg(args, "--knowledge-maintenance-interval-ms", fallback)));
}

async function waitForRestingTrigger(runningWorkers: Set<Promise<void>>, idleSleepMs: number): Promise<void> {
  if (runningWorkers.size === 0) {
    await sleep(idleSleepMs);
    return;
  }
  await Promise.race([sleep(idleSleepMs), ...runningWorkers]);
}

function directorTickArgs(
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
  const packageRoot = resolve(import.meta.dir, "../../..");
  const bin = resolve(packageRoot, "src/bin/decomp-orchestrator.ts");
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
): Promise<WorkerCycleResult> {
  const packageRoot = resolve(import.meta.dir, "../../..");
  const command = workerCommand(globals, params);
  const proc = Bun.spawn(command, {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
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

export async function runTriggerAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<TriggerAgentResult> {
  const store = openState(globals.stateDir);
  const workerResults: WorkerCycleResult[] = [];
  const workerErrors: WorkerError[] = [];
  const directorResults: DirectorTickResult[] = [];
  const knowledgeMaintenanceRuns: Record<string, unknown>[] = [];
  const knowledgeMaintenanceErrors: KnowledgeMaintenanceError[] = [];
  const runningWorkers = new Set<Promise<void>>();
  const runningWorkerIds = new Set<string>();
  let runningDirector: Promise<void> | null = null;
  let runningKnowledgeMaintenance: Promise<void> | null = null;
  let stoppedReason = "running";
  let stopRequested = false;
  let iterations = 0;
  let idleIterations = 0;
  let workersStarted = 0;
  let workerOrdinal = 0;
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
    assertSchedulableRun(run, "trigger-agent");

    const maxIterations = booleanArg(args, "--once") ? 1 : numberArg(args, "--max-iterations", 0);
    const maxIdleIterations = numberArg(args, "--max-idle-iterations", 0);
    const idleSleepMs = numberArg(args, "--idle-sleep-ms", 5_000);
    const maxWorkers = Math.max(0, Math.min(run.desiredWorkers, numberArg(args, "--max-workers", run.desiredWorkers)));
    const candidateLimit = candidateLimitArg(args, maxWorkers);
    const queueTargetSize = queueTargetSizeArg(args, { candidateLimit, maxWorkers });
    const candidateWindow = candidateWindowArg(args, { candidateLimit, queueTargetSize });
    const reportType = workerReportTypeArg(args, "--report-type", "stalled_no_useful_guess");
    const baseRev = stringArg(args, "--base-rev", "unknown");
    const ttlSeconds = numberArg(args, "--ttl-seconds", 60 * 60);
    const repairAttempts = Math.max(0, Math.trunc(numberArg(args, "--repair-attempts", globals.dryRunAgents ? 0 : 2)));
    const postReturnCheckCommand = stringArg(args, "--post-return-check-command", "");
    const graphDbPath = stringArg(args, "--graph-db", resourceGraphDbPath());
    const exitOnWorkerError = booleanArg(args, "--exit-on-worker-error");
    const workerThinkingLevel = stringArg(args, "--worker-thinking-level", globals.thinkingLevel);
    const maintenanceIntervalMs = knowledgeMaintenanceIntervalMs(globals, args);
    const policy = replanPolicy(args, { maxWorkers, queueTargetSize });
    let queueRefills = 0;
    let queuePriorityRefreshes = 0;
    let queueTargetsAdded = 0;
    let lastQueueRefill: QueueRefillResult | undefined;
    let lastReplanRequestMs = 0;
    let lastPeriodicReplanMs = Date.now();
    let longTailSinceMs: number | null = null;
    let lastKnowledgeMaintenanceMs = maintenanceIntervalMs > 0 ? 0 : Date.now();
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
        queueTargetSize,
        runningWorkers,
        runningWorkerIds,
        runId,
        store,
      });
      const nowMs = Date.now();
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
        queueTargetSize,
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

      const activeWorkers = activeWorkerCount(store, runId);
      const activeLocalWorkers = activeLocalWorkerCount(store, runId, runningWorkerIds);
      const queuedTargets = schedulableTargetCount(store, runId);
      const openSlots = workerOpenSlots({
        maxWorkers,
        activeWorkers,
        runningWorkers: runningWorkers.size,
        activeLocalWorkers,
      });
      const workersToStart = Math.min(openSlots, queuedTargets);
      for (let index = 0; index < workersToStart; index += 1) {
        workerOrdinal += 1;
        workersStarted += 1;
        didWork = true;
        const workerId = `trigger-${process.pid}-${workerOrdinal}-${randomUUID().slice(0, 8)}`;
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
        )
          .then((result) => {
            workerResults.push(result);
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

      if (!runningDirector && nextUnhandledEvent(store, runId)) {
        const tickArgs = directorTickArgs(args, { candidateLimit, candidateWindow, queueTargetSize, runId });
        let task: Promise<void>;
        task = runDirectorTick(globals, tickArgs)
          .then((result) => {
            directorResults.push(result);
          })
          .catch((error) => {
            directorResults.push({
              runId,
              directorPiError: error instanceof Error ? error.message : String(error),
              failed: true,
            });
          })
          .finally(() => {
            if (runningDirector === task) runningDirector = null;
          });
        runningDirector = task;
        didWork = true;
      }

      if (didWork || runningWorkers.size === 0) iterations += 1;
      if (didWork || runningWorkers.size > 0) idleIterations = 0;
      else idleIterations += 1;

      if (maxIdleIterations > 0 && idleIterations >= maxIdleIterations && unhandledEventCount(store, runId) === 0) {
        stoppedReason = "idle";
        break;
      }
      if (maxIterations > 0 && iterations >= maxIterations && runningWorkers.size === 0) {
        stoppedReason = "max_iterations";
        break;
      }

      await waitForRestingTrigger(runningWorkers, idleSleepMs);
    }

    if (runningWorkers.size > 0) await Promise.allSettled([...runningWorkers]);
    if (runningDirector) await runningDirector;
    if (runningKnowledgeMaintenance) await runningKnowledgeMaintenance;
    if (stoppedReason === "running") stoppedReason = "complete";

    return {
      runId,
      mode: "trigger_agent",
      stoppedReason,
      iterations,
      idleIterations,
      desiredWorkers: run.desiredWorkers,
      maxWorkers,
      directorTicks: directorResults.filter((result) => result.status !== "no_unhandled_events").length,
      queueRefills,
      queuePriorityRefreshes,
      queueTargetsAdded,
      lastQueueRefill,
      workersStarted,
      workerResults,
      workerErrors,
      knowledgeMaintenanceRuns,
      knowledgeMaintenanceErrors,
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

export async function triggerAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runTriggerAgent(globals, args), null, 2));
}
