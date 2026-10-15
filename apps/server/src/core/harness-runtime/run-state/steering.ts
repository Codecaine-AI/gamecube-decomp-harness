import { now, type StateStore } from "@server/core/orchestrator-state";
import type { SteeringProbe } from "@server/core/validation/steering/steering-check.js";

/**
 * Steering gate state (migration 013). Observations are attempt history,
 * read only for probes/hints and the dashboard. Backfill rows, coverage and
 * backfill runs are authoritative and written only by the `steering-gate`
 * job. Every reader tolerates a store behind migration 013 (null/empty) and
 * every writer is a no-op there, like `stack-only-functions.ts`.
 */
export type SteeringObservationMode = "shadow" | "enforce";

export interface SteeringObservationInput {
  gameId: string;
  unit: string;
  symbol: string;
  runId?: string | null;
  attemptRef?: string | null;
  baseRev?: string | null;
  functionSourceSha?: string | null;
  verdict: string;
  analysis?: string | null;
  scores?: Record<string, unknown>;
  probe?: SteeringProbe | null;
  mode: SteeringObservationMode;
}

export interface SteeringBackfillInput {
  gameId: string;
  unit: string;
  symbol: string;
  analyzedRev: string;
  functionSourceSha?: string | null;
  verdict: string;
  applied?: boolean;
  appliedRev?: string | null;
  report?: Record<string, unknown>;
}

export interface SteeringBackfillRecord extends Required<Omit<SteeringBackfillInput, "report">> {
  report: Record<string, unknown>;
  recordedAt: string;
}

export interface SteeringCoverageInput {
  gameId: string;
  unit: string;
  analyzedRev: string;
  baselineRev: string;
  clean: boolean;
  applied?: boolean;
  /** The unit's coverage as decide reported it (built/compared). */
  report?: Record<string, unknown>;
}

export interface SteeringCoverage {
  baselineRev: string;
  clean: boolean;
  analyzedRev: string;
}

const STEERING_TABLES = ["steering_observations", "steering_backfill", "steering_backfill_coverage", "steering_backfill_runs"] as const;
type SteeringTable = (typeof STEERING_TABLES)[number];

function tableExists(store: StateStore, table: SteeringTable): boolean {
  return Boolean(store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table));
}

function parseObject(text: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(text ?? "{}")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function recordSteeringObservation(store: StateStore, row: SteeringObservationInput): void {
  if (!tableExists(store, "steering_observations")) return;
  store.db
    .query(
      `INSERT INTO steering_observations (
         game_id, unit, symbol, run_id, attempt_ref, base_rev, function_source_sha,
         verdict, analysis, scores_json, probe_json, mode, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.gameId,
      row.unit,
      row.symbol,
      row.runId ?? null,
      row.attemptRef ?? null,
      row.baseRev ?? null,
      row.functionSourceSha ?? null,
      row.verdict,
      row.analysis ?? null,
      JSON.stringify(row.scores ?? {}),
      row.probe ? JSON.stringify(row.probe) : null,
      row.mode,
      now(),
    );
}

/**
 * The newest probe recorded for a target. With `functionSourceSha`, only a
 * probe whose recorded function-source hash still matches is returned, so a
 * hint never outlives the source it was computed from.
 */
export function latestSteeringProbe(
  store: StateStore,
  params: { gameId: string; unit: string; symbol: string; functionSourceSha?: string | null },
): SteeringProbe | null {
  if (!tableExists(store, "steering_observations")) return null;
  const sha = params.functionSourceSha ?? null;
  const row = store.db
    .query(
      `SELECT probe_json FROM steering_observations
       WHERE game_id = ? AND unit = ? AND symbol = ? AND probe_json IS NOT NULL
         ${sha ? "AND function_source_sha = ?" : ""}
       ORDER BY id DESC LIMIT 1`,
    )
    .get(...(sha ? [params.gameId, params.unit, params.symbol, sha] : [params.gameId, params.unit, params.symbol])) as { probe_json?: string } | null;
  if (!row?.probe_json) return null;
  const probe = parseObject(row.probe_json);
  return typeof probe.function === "string" && typeof probe.unit === "string" ? probe as SteeringProbe : null;
}

export function recordSteeringBackfill(store: StateStore, row: SteeringBackfillInput): void {
  if (!tableExists(store, "steering_backfill")) return;
  store.db
    .query(
      `INSERT INTO steering_backfill (
         game_id, unit, symbol, analyzed_rev, function_source_sha, verdict, applied, applied_rev, report_json, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id, unit, symbol) DO UPDATE SET
         analyzed_rev = excluded.analyzed_rev,
         function_source_sha = excluded.function_source_sha,
         verdict = excluded.verdict,
         applied = excluded.applied,
         applied_rev = excluded.applied_rev,
         report_json = excluded.report_json,
         recorded_at = excluded.recorded_at`,
    )
    .run(
      row.gameId,
      row.unit,
      row.symbol,
      row.analyzedRev,
      row.functionSourceSha ?? null,
      row.verdict,
      row.applied ? 1 : 0,
      row.appliedRev ?? null,
      JSON.stringify(row.report ?? {}),
      now(),
    );
}

export function listSteeringBackfill(store: StateStore, gameId: string, unit?: string): SteeringBackfillRecord[] {
  if (!tableExists(store, "steering_backfill")) return [];
  const rows = store.db
    .query(`SELECT * FROM steering_backfill WHERE game_id = ? ${unit ? "AND unit = ?" : ""} ORDER BY unit, symbol`)
    .all(...(unit ? [gameId, unit] : [gameId])) as Record<string, unknown>[];
  return rows.map((row) => ({
    gameId: String(row.game_id),
    unit: String(row.unit),
    symbol: String(row.symbol),
    analyzedRev: String(row.analyzed_rev),
    functionSourceSha: row.function_source_sha == null ? null : String(row.function_source_sha),
    verdict: String(row.verdict),
    applied: Number(row.applied) === 1,
    appliedRev: row.applied_rev == null ? null : String(row.applied_rev),
    report: parseObject(row.report_json),
    recordedAt: String(row.recorded_at),
  }));
}

export function recordSteeringCoverage(store: StateStore, row: SteeringCoverageInput): void {
  if (!tableExists(store, "steering_backfill_coverage")) return;
  store.db
    .query(
      `INSERT INTO steering_backfill_coverage (game_id, unit, analyzed_rev, baseline_rev, clean, applied, report_json, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id, unit) DO UPDATE SET
         analyzed_rev = excluded.analyzed_rev,
         baseline_rev = excluded.baseline_rev,
         clean = excluded.clean,
         applied = excluded.applied,
         report_json = excluded.report_json,
         recorded_at = excluded.recorded_at`,
    )
    .run(row.gameId, row.unit, row.analyzedRev, row.baselineRev, row.clean ? 1 : 0, row.applied ? 1 : 0, JSON.stringify(row.report ?? {}), now());
}

/** The stored coverage report for a unit, or null. */
export function steeringCoverageReport(store: StateStore, gameId: string, unit: string): Record<string, unknown> | null {
  if (!tableExists(store, "steering_backfill_coverage")) return null;
  const row = store.db
    .query("SELECT report_json FROM steering_backfill_coverage WHERE game_id = ? AND unit = ?")
    .get(gameId, unit) as { report_json: string } | null;
  return row ? parseObject(row.report_json) : null;
}

export function steeringCoverageFor(store: StateStore, gameId: string, unit: string): SteeringCoverage | null {
  if (!tableExists(store, "steering_backfill_coverage")) return null;
  const row = store.db
    .query("SELECT analyzed_rev, baseline_rev, clean FROM steering_backfill_coverage WHERE game_id = ? AND unit = ?")
    .get(gameId, unit) as { analyzed_rev: string; baseline_rev: string; clean: number } | null;
  return row ? { baselineRev: String(row.baseline_rev), clean: Number(row.clean) === 1, analyzedRev: String(row.analyzed_rev) } : null;
}

export function recordSteeringBackfillRun(store: StateStore, row: { gameId: string; baselineRev: string; clean: boolean }): void {
  if (!tableExists(store, "steering_backfill_runs")) return;
  store.db
    .query("INSERT INTO steering_backfill_runs (game_id, baseline_rev, clean, recorded_at) VALUES (?, ?, ?, ?)")
    .run(row.gameId, row.baselineRev, row.clean ? 1 : 0, now());
}

/** The newest clean full backfill for a game: the enforce-mode run preflight's prerequisite. */
export function latestCleanSteeringBackfillRun(store: StateStore, gameId: string): { baselineRev: string; recordedAt: string } | null {
  if (!tableExists(store, "steering_backfill_runs")) return null;
  const row = store.db
    .query("SELECT baseline_rev, recorded_at FROM steering_backfill_runs WHERE game_id = ? AND clean = 1 ORDER BY id DESC LIMIT 1")
    .get(gameId) as { baseline_rev: string; recorded_at: string } | null;
  return row ? { baselineRev: String(row.baseline_rev), recordedAt: String(row.recorded_at) } : null;
}
