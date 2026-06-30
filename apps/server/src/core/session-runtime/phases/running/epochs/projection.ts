import { listSavePoints } from "@server/core/session-runtime/phases/pr/state";
import { openState } from "@server/core/session-runtime/run-state";

export type RunningEpochJsonObject = Record<string, unknown>;

export interface RunningEpochCheckpointProgress {
  building: boolean;
  buildingSince: string | null;
  completionsSinceCheckpoint: number;
  interval: number;
  lastCheckpointAt: string | null;
  remaining: number;
}

const CHECKPOINT_ROTATIONS = 4;
const CHECKPOINT_FALLBACK_WORKERS = 32;

const CHECKPOINT_BUILD_STALE_MS = 45 * 60_000;

function asObject(value: unknown): RunningEpochJsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RunningEpochJsonObject) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function unmatchedTargetsValue(measures: RunningEpochJsonObject): number {
  const explicit = numberValue(measures.unmatched_targets, numberValue(measures.unmatchedTargets, NaN));
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const totalFunctions = numberValue(measures.total_functions, numberValue(measures.totalFunctions, NaN));
  const matchedFunctions = numberValue(measures.matched_functions, numberValue(measures.matchedFunctions, NaN));
  return Number.isFinite(totalFunctions) && Number.isFinite(matchedFunctions) ? Math.max(0, totalFunctions - matchedFunctions) : NaN;
}

function compactMeasures(measures: RunningEpochJsonObject): RunningEpochJsonObject {
  return {
    fuzzy_match_percent: numberValue(measures.fuzzy_match_percent, NaN),
    matched_code_percent: numberValue(measures.matched_code_percent, NaN),
    complete_code_percent: numberValue(measures.complete_code_percent, NaN),
    matched_functions_percent: numberValue(measures.matched_functions_percent, NaN),
    complete_units: numberValue(measures.complete_units, NaN),
    total_units: numberValue(measures.total_units, NaN),
    unmatched_targets: unmatchedTargetsValue(measures),
  };
}

/**
 * Epoch checkpoints, oldest first: the run's measured progress history. Each
 * row is one drain-snapshot-rebuild cycle recorded by the running epoch pipeline.
 */
export function runningEpochHistory(stateDir: string, limit = 48): RunningEpochJsonObject[] {
  const store = openState(stateDir);
  try {
    return listSavePoints(store, 500)
      .filter((savePoint) => savePoint.triggerKind === "epoch")
      .slice(0, limit)
      .reverse()
      .map((savePoint) => ({
        id: savePoint.id,
        runId: savePoint.runId,
        label: savePoint.label,
        createdAt: savePoint.createdAt,
        commitSha: savePoint.commitSha,
        matchedCodePercent: savePoint.matchedCodePercent,
        measures: compactMeasures(asObject(asObject(savePoint.payload).measures)),
        regressions: asObject(asObject(savePoint.payload).regressions),
        repair: asObject(asObject(savePoint.payload).repair),
      }));
  } catch {
    return [];
  } finally {
    store.db.close();
  }
}

/**
 * An epoch checkpoint build is in flight when the newest epoch_started event
 * has no newer epoch_finished, and started recently enough to be believable.
 */
function checkpointBuildState(stateDir: string, runId: string): { building: boolean; buildingSince: string | null } {
  const store = openState(stateDir);
  try {
    const row = store.db
      .query(
        `
          SELECT event_type, created_at FROM events
          WHERE run_id = ? AND event_type IN ('epoch_started', 'epoch_finished')
          ORDER BY created_at DESC LIMIT 1
        `,
      )
      .get(runId) as Record<string, unknown> | undefined;
    if (!row || stringValue(row.event_type) !== "epoch_started") return { building: false, buildingSince: null };
    const startedMs = Date.parse(stringValue(row.created_at));
    if (!Number.isFinite(startedMs) || Date.now() - startedMs > CHECKPOINT_BUILD_STALE_MS) return { building: false, buildingSince: null };
    return { building: true, buildingSince: stringValue(row.created_at) };
  } catch {
    return { building: false, buildingSince: null };
  } finally {
    store.db.close();
  }
}

/**
 * Countdown to the next epoch checkpoint: closed worker states since the last
 * epoch save point, against the worker-completion interval the pool checkpoints on.
 */
export function runningEpochCheckpointProgress(params: {
  desiredWorkers: number;
  epochs: RunningEpochJsonObject[];
  workerStates: RunningEpochJsonObject[];
  runCreatedAt: string;
  runId: string;
  stateDir: string;
}): RunningEpochCheckpointProgress {
  const workers = Number.isFinite(params.desiredWorkers) && params.desiredWorkers > 0 ? params.desiredWorkers : CHECKPOINT_FALLBACK_WORKERS;
  const interval = workers * CHECKPOINT_ROTATIONS;
  const lastEpochAt = params.epochs.length > 0 ? stringValue(params.epochs[params.epochs.length - 1].createdAt) : "";
  const since = lastEpochAt || params.runCreatedAt;
  const completions = params.workerStates.filter(
    (workerState) => stringValue(workerState.lifecycleStatus) !== "error" && stringValue(workerState.createdAt) > since,
  ).length;
  const build = checkpointBuildState(params.stateDir, params.runId);
  return {
    completionsSinceCheckpoint: completions,
    interval,
    remaining: Math.max(0, interval - completions),
    lastCheckpointAt: lastEpochAt || null,
    building: build.building,
    buildingSince: build.buildingSince,
  };
}
