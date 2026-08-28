import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  loadKnowledgeBoardSnapshot,
  resourceGraphDbPath,
} from "@server/core/knowledge";
import { openKnowledgeGraph, readReportProvenance } from "@server/core/knowledge/graph";
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
  return {
    workerPoolSize,
    freshReportGate: validation?.epochAdmissionFreshReportGate ?? true,
    candidateMultiple: positiveNumber(validation?.epochAdmissionCandidateMultiple, 4),
    candidateCap: positiveNumber(validation?.epochAdmissionCandidateCap, 500),
  };
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function eligibleCandidateCount(candidates: Array<{ unit: string; symbol: string; sourcePath: string }>): number {
  const keys = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.sourcePath.trim()) continue;
    keys.add(`${candidate.unit}::${candidate.symbol}`);
  }
  return keys.size;
}

function assertFreshBoardReport(params: Pick<Parameters<typeof ensureSchedulerEpochFromBoard>[0], "globals" | "graphDbPath">): void {
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

function assertCandidateCountWithinLimits(params: {
  candidateCount: number;
  config: SchedulerEpochConfig;
  runId: string;
  store: StateStore;
}): void {
  const cap = positiveNumber(params.config.candidateCap, 500);
  if (params.candidateCount > cap) {
    throw new Error(`Epoch admission refused: ${params.candidateCount} candidates exceed the configured absolute cap of ${cap}`);
  }
  const recent = params.store.db
    .query(
      `SELECT admitted_count FROM epochs
       WHERE run_id = ? AND status != 'active' AND admitted_count > 0
       ORDER BY ordinal DESC LIMIT 3`,
    )
    .all(params.runId) as Array<{ admitted_count: number }>;
  const recentMax = Math.max(0, ...recent.map((row) => Number(row.admitted_count)));
  const multiple = positiveNumber(params.config.candidateMultiple, 4);
  if (recentMax > 0 && params.candidateCount > recentMax * multiple) {
    throw new Error(
      `Epoch admission refused: ${params.candidateCount} candidates exceed ${multiple}x the recent epoch maximum of ${recentMax}`,
    );
  }
}

export function ensureSchedulerEpochFromBoard(params: {
  config: SchedulerEpochConfig;
  globals: GlobalArgs;
  graphDbPath: string;
  runId: string;
  store: StateStore;
}): SchedulerEpochEnsureResult {
  let epoch = activeSchedulerEpoch(params.store, params.runId);
  let progress = epoch ? schedulerEpochProgress(params.store, epoch.id) : null;
  let admission: EpochAdmissionResult | undefined;
  if ((!progress || progress.admitted === 0) && (params.config.freshReportGate ?? true)) {
    assertFreshBoardReport(params);
  }
  const board = loadKnowledgeBoardSnapshot(params.globals.repoRoot, {
    graphDbPath: params.graphDbPath,
  });
  if (!progress || progress.admitted === 0) {
    assertCandidateCountWithinLimits({
      candidateCount: eligibleCandidateCount(board.candidates),
      config: params.config,
      runId: params.runId,
      store: params.store,
    });
    epoch ??= startSchedulerEpoch(params.store, params.runId, params.config);
    admission = admitEpochTargets(params.store, {
      epochId: epoch.id,
      runId: params.runId,
      candidates: board.candidates,
      workerPoolSize: params.config.workerPoolSize,
    });
    progress = schedulerEpochProgress(params.store, epoch.id);
  }
  if (!epoch || !progress) throw new Error("Scheduler epoch admission did not produce an epoch");

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
  return { epoch, admission, availabilityRefresh, priorityRefreshes, progress };
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
