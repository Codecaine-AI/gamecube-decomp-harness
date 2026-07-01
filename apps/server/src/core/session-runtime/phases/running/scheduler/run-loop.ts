import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadKnowledgeBoardSnapshot, packageRoot, resourceGraphDbPath } from "@server/core/knowledge";
import { loadExactTargetKeys } from "@server/core/session-runtime/phases/running/board/snapshot.js";
import {
  activeClaimsForSession,
  activeWorkerCount,
  activeSchedulerEpoch,
  addEvent,
  blockingWorkerOutputIntegrationCount,
  blockedAdmittedTargetCount,
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
  unhandledEventCount,
  workerOutputIntegrationConflictsForResolver,
  type WorkerOutputIntegrationRecord,
  type EpochProgressSummary,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import { immediateTransaction, withBusyRetry } from "@server/core/orchestrator-state";
import { runEpochCycle, type EpochCycleResult } from "@server/core/session-runtime/phases/running/epochs";
import { publishSessionDraftPr } from "@server/core/session-runtime/phases/running/epochs/session-draft-pr.js";
import { integrationResolve } from "@server/core/session-runtime/phases/running/integration";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { assertSchedulableRun } from "@server/core/session-runtime/phases/running/jobs/shared.js";
import {
  derivedSchedulerCandidateWindow,
  ensureSchedulerEpochFromBoard,
  runSchedulerTick,
  schedulerEpochConfigFromArgs,
  type SchedulerEpochEnsureResult,
  type SchedulerTickResult,
} from "@server/core/session-runtime/phases/running/scheduler/tick.js";
import type { WorkerCycleResult } from "@server/core/session-runtime/phases/running/workers/worker-cycle.js";
import { runKnowledgeMaintenance, type KnowledgeMaintenanceProgressEvent } from "@server/core/knowledge/jobs/kg.js";
import { recoverActiveClaims } from "@server/core/session-runtime/phases/running/jobs/recover-claims.js";
import { workerTtlSeconds } from "@server/core/session-runtime/phases/running/worker-ttl.js";

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
  blockedAdmittedTargets: number;
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
  workerResults: WorkerCycleResult[];
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
  dryRun: boolean;
  finalStatus: {
    activeWorkers: number;
    admittedTargets: number;
    blockedAdmittedTargets: number;
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
async function probeProvider(globals: GlobalArgs, outputDir: string, runId: string): Promise<{ healthy: boolean; error?: string }> {
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
        projectId: globals.project?.projectId ?? globals.projectId,
        sessionId: runId,
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

function orchestratorRoot(): string {
  return packageRoot();
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
            FROM target_claims
            WHERE session_id = ?
              AND status = 'active'
              AND worker_id IN (${placeholders})
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

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function targetPressureSnapshotForRunLoop(params: {
  admissionTargetSize: number;
  candidateLimit: number;
  candidateWindow: number;
  maxWorkers: number;
  runningWorkers: Set<Promise<void>>;
  runningWorkerIds: Set<string>;
  runId: string;
  store: StateStore;
}): TargetPressureSnapshot {
  const activeWorkers = activeWorkerCount(params.store, params.runId);
  const activeLocalWorkers = activeLocalWorkerCount(params.store, params.runId, params.runningWorkerIds);
  const openSlots = workerOpenSlots({
    maxWorkers: params.maxWorkers,
    activeWorkers,
    runningWorkers: params.runningWorkers.size,
    activeLocalWorkers,
  });
  return {
    admittedTargets: admittedTargetCount(params.store, params.runId),
    activeWorkers,
    admissionTargetSize: params.admissionTargetSize,
    blockedAdmittedTargets: blockedAdmittedTargetCount(params.store, params.runId),
    candidateLimit: params.candidateLimit,
    candidateWindow: params.candidateWindow,
    maxWorkers: params.maxWorkers,
    openSlots,
    runningWorkers: params.runningWorkers.size,
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
            WHERE session_id = ?
              AND admitted_count > 0
              AND status != 'exhausted'
              AND COALESCE(boundary_status, '') NOT LIKE 'manual_discarded%'
            ORDER BY ordinal DESC
            LIMIT 1
          `,
        )
        .get(runId) as Record<string, unknown> | undefined,
  );
  return row && String(row.status) === "error" && String(row.boundary_status) === "error"
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
  const activeClaims = activeClaimsForSession(store, runId).filter((claim) => claim.epochId === epoch.id);
  for (const claim of activeClaims) {
    closeWorkerState(store, {
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
            WHERE session_id = ?
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
  params: { runId: string },
): Map<string, string | true> {
  return cloneArgs(args, [
    ["--run-id", params.runId],
    ["--no-start-epoch", true],
  ]);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function defaultConfigureCommand(globals: Pick<GlobalArgs, "repoRoot" | "stateDir">): string {
  const localWibo = resolve(globals.repoRoot, "build", "tools", "wibo");
  if ((process.platform === "darwin" || process.platform === "linux") && existsSync(localWibo)) {
    return "python3 configure.py --require-protos --wrapper build/tools/wibo";
  }
  const wibo = resolve(globals.stateDir, "tools", "wibo");
  if ((process.platform === "darwin" || process.platform === "linux") && existsSync(wibo)) {
    return `python3 configure.py --require-protos --wrapper ${shellQuote(wibo)}`;
  }
  return "python3 configure.py --require-protos";
}

function workerProcessEnv(globals: Pick<GlobalArgs, "stateDir">): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...Bun.env };
  const wibo = resolve(globals.stateDir, "tools", "wibo");
  if ((process.platform === "darwin" || process.platform === "linux") && existsSync(wibo)) {
    env.MWCC_WIBO = wibo;
  }
  return env;
}

function workerCommand(
  globals: GlobalArgs,
  params: {
    runId: string;
    workerId: string;
    baseRev: string;
    ttlSeconds: number;
    thinkingLevel: string;
    postReturnCheckCommand: string;
    workerConfigureCommand: string;
    graphDbPath: string;
  },
): string[] {
  const bin = resolve(orchestratorRoot(), "apps/server/src/job-runner.ts");
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
    "--base-rev",
    params.baseRev,
  );
  if (params.postReturnCheckCommand) command.push("--post-return-check-command", params.postReturnCheckCommand);
  if (params.workerConfigureCommand) command.push("--worker-configure-command", params.workerConfigureCommand);
  command.push("--graph-db", params.graphDbPath);
  return command;
}

async function runWorkerProcess(
  globals: GlobalArgs,
  params: {
    runId: string;
    workerId: string;
    baseRev: string;
    ttlSeconds: number;
    thinkingLevel: string;
    postReturnCheckCommand: string;
    workerConfigureCommand: string;
    graphDbPath: string;
  },
  procRegistry?: Set<{ kill: (signal?: number) => void; exited: Promise<number> }>,
): Promise<WorkerCycleResult> {
  const command = workerCommand(globals, params);
  let timedOut = false;
  const proc = Bun.spawn(command, {
    cwd: orchestratorRoot(),
    env: workerProcessEnv(globals),
    stdout: "pipe",
    stderr: "pipe",
  });
  procRegistry?.add(proc);
  void proc.exited.finally(() => procRegistry?.delete(proc));
  const timeoutMs = Math.max(60_000, Math.floor(params.ttlSeconds * 1000));
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill(9);
  }, timeoutMs);
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]).finally(() => clearTimeout(timeout));
  if (timedOut) {
    throw new Error(`Worker process timed out after ${Math.round(timeoutMs / 1000)}s: ${command.join(" ")}\n${stderr || stdout}`);
  }
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
  const integrationResolverRuns: Record<string, unknown>[] = [];
  const integrationResolverErrors: IntegrationResolverError[] = [];
  const runningWorkers = new Set<Promise<void>>();
  const runningWorkerIds = new Set<string>();
  const runningWorkerProcs = new Set<{ kill: (signal?: number) => void; exited: Promise<number> }>();
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
  const drain = () => {
    drainRequested = true;
    stoppedReason = "draining";
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("SIGUSR1", drain);

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
    const baseRev = stringArg(args, "--base-rev", "unknown");
    const ttlSeconds = workerTtlSeconds(globals, args);
    const postReturnCheckCommand = stringArg(args, "--post-return-check-command", "");
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
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
    const sessionDraftPrEnabled = !booleanArg(args, "--no-session-draft-pr");
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
      let didWork = false;
      const boundaryWorkPendingBeforeMaintenance = epochBoundaryWorkPending(store, runId);
      const blockingIntegrationsBeforeMaintenance = blockingWorkerOutputIntegrationCount(store, runId);

      if (
        !drainRequested &&
        autoIntegrationResolverEnabled(args) &&
        !runningEpoch &&
        runningIntegrationResolvers.size < integrationResolverConcurrency &&
        activeWorkerCount(store, runId) === 0 &&
        runningWorkers.size === 0
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
        didWork = true;
      }

      const targetPressureBefore = targetPressureSnapshotForRunLoop({
        admissionTargetSize: workerPoolTargetSize,
        candidateLimit,
        candidateWindow,
        maxWorkers,
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
                if (sessionDraftPrEnabled) {
                  const publish = await publishSessionDraftPr({
                    baseRef: globals.project?.baseRef,
                    commitSha: result.commitSha,
                    epochLabel: result.label,
                    matchedCodePercent: result.matchedCodePercent,
                    projectId: globals.project?.projectId ?? globals.projectId ?? null,
                    qaGate: result.qaGate as unknown as Record<string, unknown> | null,
                    regressions: result.regressions as unknown as Record<string, unknown>,
                    repoRoot: globals.repoRoot,
                    runId,
                    savePointId: result.savePointId,
                    stateDir: globals.stateDir,
                    store,
                  });
                  console.error(
                    `[run-loop] epoch ${epochOrdinal}: session draft PR ${publish.status}` +
                      `${publish.url ? ` ${publish.url}` : publish.reason ? ` (${publish.reason})` : publish.error ? ` (${publish.error})` : ""}`,
                  );
                }
                console.error(
                  `[run-loop] epoch ${epochOrdinal}: matched_code ${result.matchedCodePercent ?? "?"}%, ` +
                    `${result.regressions.regressedFunctions} regressed functions, ${result.repair.requeued} repairs readmitted, ` +
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
                const maintenanceGlobals = boundaryResult?.worktreeDir ? { ...globals, repoRoot: boundaryResult.worktreeDir } : globals;
                console.error(`[run-loop] epoch ${epochOrdinal}: full knowledge refresh started (${fullKgMaintenanceMode})`);
                addEvent(store, runId, "epoch_full_refresh_started", "run-loop", {
                  epoch: epochOrdinal,
                  lane: "full_boundary",
                  mode: fullKgMaintenanceMode,
                  repo_root: maintenanceGlobals.repoRoot,
                  created_by: "run-loop",
                });
                const maintenance = await runKnowledgeMaintenance(maintenanceGlobals, fullBoundaryKnowledgeMaintenanceArgs(args, runId, fullKgMaintenanceMode), {
                  progress: knowledgeProgressReporter(store, runId, {
                    lane: "full_boundary",
                    mode: fullKgMaintenanceMode,
                    epochId: schedulerEpochId,
                    epochOrdinal,
                    repoRoot: maintenanceGlobals.repoRoot,
                  }),
                });
                knowledgeMaintenanceRuns.push({ ...maintenance, lane: "full_boundary", mode: fullKgMaintenanceMode, repo_root: maintenanceGlobals.repoRoot });
                console.error(`[run-loop] epoch ${epochOrdinal}: full knowledge refresh finished`);
                addEvent(store, runId, "epoch_full_refresh_finished", "run-loop", {
                  epoch: epochOrdinal,
                  lane: "full_boundary",
                  mode: fullKgMaintenanceMode,
                  repo_root: maintenanceGlobals.repoRoot,
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
              console.error(
                `[run-loop] epoch ${nextEpoch.progress.ordinal}: admitted ${nextEpoch.progress.admitted}/${nextEpoch.progress.size.mode === "full" ? "full" : nextEpoch.progress.size.value} ` +
                  `targets from candidate window ${schedulerEpochConfig.candidateWindow} (${schedulerEpochConfig.candidateRerank ?? "priority"}), ` +
                  `${nextEpoch.progress.available} available, ${nextEpoch.priorityRefreshes} refreshed`,
              );
              lastSchedulerEpoch = nextEpoch.progress;
              epochAdmissions += (nextEpoch.admission?.admitted ?? 0) + (nextEpoch.existingAdmission?.admitted ?? 0);
              epochAvailabilityRefreshes += nextEpoch.availabilityRefresh.inserted > 0 ? 1 : 0;
              epochTargetsAdmitted += (nextEpoch.admission?.admitted ?? 0) + (nextEpoch.existingAdmission?.admitted ?? 0);
              epochTargetsMadeAvailable += (nextEpoch.admission?.admitted ?? 0) + nextEpoch.availabilityRefresh.inserted;
              epochPriorityRefreshes += nextEpoch.priorityRefreshes;
              if ((nextEpoch.progress.admitted === 0 || nextEpoch.progress.remaining === 0) && nextEpoch.progress.available === 0 && nextEpoch.progress.claimed === 0) {
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
                  available: nextEpoch.progress.available,
                  candidate_rerank: schedulerEpochConfig.candidateRerank ?? "priority",
                  candidate_window: schedulerEpochConfig.candidateWindow,
                  size: nextEpoch.progress.size,
                  created_by: "run-loop",
                });
                if (nextEpoch.availabilityRefresh.inserted > 0 || (nextEpoch.admission?.admitted ?? 0) > 0) {
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

      const forceFinishEvent = nextForceFinishEpochEvent(store, runId);
      if (forceFinishEvent) {
        const result = forceFinishActiveEpoch(store, runId, forceFinishEvent);
        if (result.epochId) {
          console.error(
            `[run-loop] epoch ${result.ordinal}: manual finish requested; ` +
              `closed ${result.activeClaimsClosed} active claim(s), marked ${result.openTargetsFinished} open target(s) finished`,
          );
        }
        if (runningWorkerProcs.size > 0) {
          for (const proc of runningWorkerProcs) proc.kill(9);
          await Promise.allSettled([...runningWorkers]);
        }
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
                    candidateRerank: schedulerEpochConfig.candidateRerank,
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
                  `${epochResult.progress.available} available, candidate window ${schedulerEpochConfig.candidateWindow}`,
              );
              addEvent(store, runId, "epoch_admitted", "run-loop", {
                epoch_id: epochResult.epoch.id,
                ordinal: epochResult.progress.ordinal,
                admitted: epochResult.progress.admitted,
                admitted_now: admittedNow,
                available: epochResult.progress.available,
                candidate_rerank: schedulerEpochConfig.candidateRerank ?? "priority",
                candidate_window: schedulerEpochConfig.candidateWindow,
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
            } else if (epochResult.progress.admitted > 0 && epochResult.progress.remaining === 0 && epochResult.progress.claimed === 0 && runningWorkers.size === 0) {
              didWork = true;
              launchEpochCycle(`scheduler epoch ${epochResult.progress.ordinal} completed`, epochResult.epoch.id);
            }
          }
        }
      }

      if (!drainRequested && providerPausedSinceMs != null && !runningProviderProbe && Date.now() >= nextProviderProbeMs) {
        const probeDir = resolve(globals.stateDir, "runs", runId, "provider_probes");
        let probeTask: Promise<void>;
        probeTask = probeProvider(globals, probeDir, runId)
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
      const schedulableTargets = schedulableTargetCount(store, runId);
      const openSlots = workerOpenSlots({
        maxWorkers,
        activeWorkers,
        runningWorkers: runningWorkers.size,
        activeLocalWorkers,
      });
      const iterationBudgetExhausted = maxIterations > 0 && iterations >= maxIterations;
      const workersToStart = drainRequested || providerPausedSinceMs != null || iterationBudgetExhausted ? 0 : Math.min(openSlots, schedulableTargets);
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
            baseRev,
            ttlSeconds,
            thinkingLevel: workerThinkingLevel,
            postReturnCheckCommand,
            workerConfigureCommand,
            graphDbPath,
          },
          runningWorkerProcs,
        )
          .then((result) => {
            workerResults.push(result);
            // Provider failures return the target to admitted and pause spawning until a probe
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
                error: result.error ?? `Worker state closed as ${result.lifecycleStatus}`,
              });
              if (exitOnWorkerError) {
                stopRequested = true;
                stoppedReason = "worker_error";
              }
            }
          })
          .catch(async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            try {
              const recovery = await recoverActiveClaims({
                globals,
                store,
                runId,
                repoRoot: run.project?.repoRoot ?? globals.repoRoot,
                force: true,
                workerIdFilter: workerId,
                reason: `run-loop recovered failed worker process ${workerId}: ${message.slice(0, 500)}`,
              });
              if (recovery.recoveredClaims > 0) {
                console.error(`[run-loop] recovered ${recovery.recoveredClaims} active claim(s) for failed worker ${workerId}`);
              }
              workerErrors.push({
                workerId,
                error: recovery.recoveredClaims > 0 ? `${message} (recovered ${recovery.recoveredClaims} active claim(s))` : message,
              });
            } catch (recoveryError) {
              const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
              workerErrors.push({
                workerId,
                error: `${message}; claim recovery failed: ${recoveryMessage}`,
              });
            }
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

      const schedulerEvent = nextUnhandledEvent(store, runId);
      const schedulerEventType = schedulerEvent ? String(schedulerEvent.eventType ?? schedulerEvent.event_type ?? "") : "";
      if (!drainRequested && !runningScheduler && schedulerEvent && schedulerEventType !== "epoch_force_finish_requested") {
        const tickArgs = schedulerTickArgs(args, { runId });
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
        didWork = true;
      }

      if (didWork || runningWorkers.size === 0) iterations += 1;
      if (didWork || runningWorkers.size > 0 || runningEpoch || runningFastKnowledgeMaintenance || runningIntegrationResolvers.size > 0) idleIterations = 0;
      else idleIterations += 1;

      if (maxIdleIterations > 0 && idleIterations >= maxIdleIterations && unhandledEventCount(store, runId) === 0) {
        stoppedReason = "idle";
        break;
      }
      if (maxIterations > 0 && iterations >= maxIterations && runningWorkers.size === 0 && !runningEpoch && runningIntegrationResolvers.size === 0) {
        stoppedReason = "max_iterations";
        break;
      }
      if (
        drainRequested &&
        runningWorkers.size === 0 &&
        !runningEpoch &&
        !runningScheduler &&
        runningIntegrationResolvers.size === 0 &&
        !runningFastKnowledgeMaintenance &&
        !runningKnowledgeMaintenance &&
        !runningProviderProbe
      ) {
        stoppedReason = "drained";
        break;
      }

      await waitForRestingTrigger(runningWorkers, idleSleepMs, [runningEpoch, runningFastKnowledgeMaintenance, ...runningIntegrationResolvers.values()]);
    }

    if (runningWorkers.size > 0) {
      // A stopped pool must not wedge for hours awaiting worker TTLs (workers
      // ignore SIGTERM). Give in-flight workers a short grace, then kill them;
      // claim recovery returns any interrupted active targets to admitted state.
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
      dryRun: globals.dryRunAgents,
      finalStatus: {
        activeWorkers: activeWorkerCount(store, runId),
        admittedTargets: admittedTargetCount(store, runId),
        blockedAdmittedTargets: blockedAdmittedTargetCount(store, runId),
        schedulableTargets: schedulableTargetCount(store, runId),
        unhandledEvents: unhandledEventCount(store, runId),
      },
    };
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.off("SIGUSR1", drain);
    store.db.close();
  }
}

export async function runLoop(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runRunLoop(globals, args), null, 2));
}
