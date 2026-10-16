import { listSavePoints, type SavePointRecord } from "@server/core/harness-runtime/phases/pr/state";
import { openState } from "@server/core/harness-runtime/run-state";
import type { UnverifiedIndex } from "@server/core/harness-runtime/phases/running/board/candidates.js";
import {
  completionIndexAt,
  withholdUnverifiedStoredMeasures,
  type CompletionIndexSource,
} from "@server/core/harness-runtime/phases/running/board/unverified-measures.js";

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
    // Steering-gated games: the "100% unverified" figures and the unknown-completion marker, only when present.
    ...Object.fromEntries(Object.entries(measures).filter(([key]) => key.startsWith("unverified_"))),
  };
}

export interface RunningEpochHistoryOptions {
  /**
   * Steering-gated games' completion holds: active `unverified_match`
   * functions and, with a revision-aware index, the rollback holds of each
   * epoch save point's own commit, withheld from every epoch's done counts.
   */
  unverified?: CompletionIndexSource;
}

/**
 * The epoch's measures as published. The save point keeps its report's own
 * measures as evidence; for a steering-gated game they are re-derived from
 * the epoch's archived raw report under the current active `unverified_match`
 * rows and the rollback holds at the save point's own commit, or marked `unverified_unbounded` with unknown (null) completion
 * metrics when that report is unreadable. Without an index the recorded
 * measures stand.
 */
function epochMeasures(savePoint: SavePointRecord, unverified: UnverifiedIndex | undefined): RunningEpochJsonObject {
  const recorded = asObject(asObject(savePoint.payload).measures);
  return unverified ? withholdUnverifiedStoredMeasures(recorded, savePoint.reportPath, unverified) : recorded;
}

/** The epoch's headline matched-code score: unknown while unbounded, the re-derived figure when withheld. */
function epochMatchedCodePercent(savePoint: SavePointRecord, measures: RunningEpochJsonObject, unverified: UnverifiedIndex | undefined): number | null {
  if (!unverified) return savePoint.matchedCodePercent;
  if (measures.unverified_unbounded === true) return null;
  const derived = numberValue(measures.matched_code_percent, NaN);
  return Number.isFinite(derived) ? derived : null;
}

/**
 * Epoch checkpoints, oldest first: the run's measured progress history. Each
 * row is one drain-snapshot-rebuild cycle recorded by the running epoch pipeline.
 */
export function runningEpochHistory(stateDir: string, limit = 48, options: RunningEpochHistoryOptions = {}): RunningEpochJsonObject[] {
  const store = openState(stateDir);
  try {
    return listSavePoints(store, 500)
      .filter((savePoint) => savePoint.triggerKind === "epoch_finish" || savePoint.triggerKind === "epoch")
      .slice(0, limit)
      .reverse()
      .map((savePoint) => {
        const unverified = completionIndexAt(options.unverified, savePoint.commitSha);
        const measures = epochMeasures(savePoint, unverified);
        return {
          id: savePoint.id,
          runId: savePoint.runId,
          label: savePoint.label,
          createdAt: savePoint.createdAt,
          commitSha: savePoint.commitSha,
          matchedCodePercent: epochMatchedCodePercent(savePoint, measures, unverified),
          measures: compactMeasures(measures),
          regressions: asObject(asObject(savePoint.payload).regressions),
          repair: asObject(asObject(savePoint.payload).repair),
        };
      });
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
