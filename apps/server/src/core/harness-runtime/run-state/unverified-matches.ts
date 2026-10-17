import { now, type StateStore } from "@server/core/orchestrator-state";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import { canonicalUnit, sqlPlaceholders, targetKey, unitVariants, withUnitKeys } from "./unit-key.js";

/**
 * `unverified_match` ("100% but unverified", migration 015): a function the
 * steering backfill recorded as `unresolved`. Its code usually reaches 100%,
 * a good sign the direction is right, but the gate could neither prove it real
 * nor find steering, so it is not a confirmed match:
 *
 * - the board never counts it as done (not exact, not stack-only) and keeps it
 *   claimable, ranked ahead of untouched functions;
 * - the worker sees it as a `previous_attempt` variant;
 * - only a certified pass clears it (`clearUnverifiedMatchIfCertified`): an
 *   attempt the enforced gate passes for the function, or a clean backfill
 *   `--record` that passes it in a certified unit, either one measured
 *   against the row's trusted base or an ancestor of it
 *   (`unverifiedBaseCertified`). A record run that does not list it, lists it
 *   with any other verdict, or measured from a later base, leaves it active;
 * - an active row keeps the trusted base it was first recorded against: a
 *   later `--record` from a descendant base (which already treats the
 *   unexplained code as trusted) refreshes the facts, never the base;
 * - a clear by an integration is undone when the epoch confirmation pass
 *   reverts that integration's code (`restoreUnverifiedMatchesClearedBy`):
 *   the certified version is gone, so the function is unverified again.
 *
 * Every reader tolerates a store behind migration 015 (empty) and every writer
 * is a no-op there. Units are stored and returned canonical (`canonicalUnit`:
 * no module prefix); lookups by unit also match a row written with a prefixed
 * spelling (`unitVariants`).
 */
export const UNVERIFIED_MATCH_STATE = "unverified_match";
export const UNVERIFIED_MATCH_LABEL = "100% but unverified";

export interface UnverifiedMatchMatch {
  base: number | null;
  candidate: number | null;
  real_only: number | null;
}

export interface UnverifiedMatchInput {
  gameId: string;
  unit: string;
  symbol: string;
  /** HEAD the backfill analysed. */
  analyzedRev: string;
  /** Trusted base the backfill measured against. */
  baseRev?: string | null;
  sourcePath?: string | null;
  /** sha256 of the unit's source file at `analyzedRev` (`steeringSourceSha`). */
  functionSourceSha?: string | null;
  match: UnverifiedMatchMatch;
  /** The gate's reasons for `unresolved`. */
  reasons: string[];
  /** The function's `SteeringBackfillFunctionReport`. */
  report?: Record<string, unknown>;
}

export interface UnverifiedMatchRecord extends Required<Omit<UnverifiedMatchInput, "report">> {
  report: Record<string, unknown>;
  recordedAt: string;
  clearedAt: string | null;
  clearedBy: string | null;
  /**
   * The revision whose certification cleared the row (the backfill's analysed
   * rev, an integration's `integrated_rev`); null while active, or when the
   * clear recorded none. Saved revisions before it stay held.
   */
  clearedRev: string | null;
}

/** The raw `unit::symbol` key; prefer `targetKey(game, unit, symbol)` where the game is known. */
export function unverifiedMatchKey(unit: string, symbol: string): string {
  return `${unit}::${symbol}`;
}

/** Canonical `unit::symbol` -> the function's active record: the board's index (tagged `withUnitKeys`). */
export type UnverifiedMatchIndex = ReadonlyMap<string, UnverifiedMatchRecord>;

function tableExists(store: StateStore): boolean {
  return Boolean(store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'steering_unverified_matches'").get());
}

/** A store migrated by an earlier draft of 015 has no `cleared_rev`: writes skip it there (its clears stay held at every saved rev). */
function hasClearedRev(store: StateStore): boolean {
  return (store.db.query("PRAGMA table_info(steering_unverified_matches)").all() as Array<{ name: string }>)
    .some(({ name }) => name === "cleared_rev");
}

/** `unit IN (...)` over every spelling of the unit, with its bound values. */
function unitClause(gameId: string, unit: string): { sql: string; units: string[] } {
  const units = unitVariants(gameId, unit);
  return { sql: `unit IN (${sqlPlaceholders(units)})`, units };
}

/** Renames a row written with a prefixed unit to the canonical one, unless a canonical row already exists. */
function adoptLegacyUnit(store: StateStore, gameId: string, unit: string, symbol: string): void {
  const legacy = unitVariants(gameId, unit).slice(1);
  if (legacy.length === 0) return;
  store.db
    .query(`UPDATE OR IGNORE steering_unverified_matches SET unit = ? WHERE game_id = ? AND symbol = ? AND unit IN (${sqlPlaceholders(legacy)})`)
    .run(canonicalUnit(gameId, unit), gameId, symbol, ...legacy);
}

function parseJson<T>(text: unknown, fallback: T, accept: (value: unknown) => boolean): T {
  try {
    const parsed = JSON.parse(String(text ?? "")) as unknown;
    return accept(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(row: Record<string, unknown>): UnverifiedMatchRecord {
  const match = parseJson<Record<string, unknown>>(row.match_json, {}, isObject);
  return {
    gameId: String(row.game_id),
    unit: canonicalUnit(String(row.game_id), String(row.unit)),
    symbol: String(row.symbol),
    analyzedRev: String(row.analyzed_rev),
    baseRev: row.base_rev == null ? null : String(row.base_rev),
    sourcePath: row.source_path == null ? null : String(row.source_path),
    functionSourceSha: row.function_source_sha == null ? null : String(row.function_source_sha),
    match: { base: finiteOrNull(match.base), candidate: finiteOrNull(match.candidate), real_only: finiteOrNull(match.real_only) },
    reasons: parseJson<unknown[]>(row.reasons_json, [], Array.isArray).filter((reason): reason is string => typeof reason === "string"),
    report: parseJson<Record<string, unknown>>(row.report_json, {}, isObject),
    recordedAt: String(row.recorded_at),
    clearedAt: row.cleared_at == null ? null : String(row.cleared_at),
    clearedBy: row.cleared_by == null ? null : String(row.cleared_by),
    clearedRev: row.cleared_rev == null || row.cleared_rev === "" ? null : String(row.cleared_rev),
  };
}

/**
 * Is `ancestor` the commit `descendant` or one of its ancestors? Callers treat
 * `false`, a throw, a rejection or an unknown revision as no.
 */
export type RevAncestry = (ancestor: string, descendant: string) => boolean | Promise<boolean>;

/**
 * The trusted-base rule. A gate pass measured against `certifiedBaseRev`
 * certifies a row recorded against `rowBaseRev` only when `certifiedBaseRev`
 * is `rowBaseRev` itself or one of its ancestors: the gate then compared the
 * whole delta from the row's trusted base, which holds the implementation
 * the backfill could not explain (introduced after `rowBaseRev`). A base
 * after it (the backfill at B marked f, H was committed, a record run with
 * `--base H`) treats that implementation as trusted, so its pass proves
 * nothing about it. A missing revision, or ancestry the check cannot
 * establish, never certifies.
 */
export async function unverifiedBaseCertified(params: {
  rowBaseRev: string | null | undefined;
  certifiedBaseRev: string | null | undefined;
  isAncestor: RevAncestry;
}): Promise<boolean> {
  const { rowBaseRev, certifiedBaseRev } = params;
  if (!rowBaseRev || !certifiedBaseRev) return false;
  if (rowBaseRev === certifiedBaseRev) return true;
  try {
    return (await params.isAncestor(certifiedBaseRev, rowBaseRev)) === true;
  } catch {
    return false;
  }
}

/**
 * Records (or re-records) a function as unverified; a cleared row becomes
 * active again. An active row keeps its trusted base (`base_rev`): only a
 * caller that has established the new base is an ancestor of exactly
 * `widenBaseFrom` (the active row's current base) replaces it. A cleared row,
 * or an active row without a base, takes the new one.
 */
export function recordUnverifiedMatch(store: StateStore, input: UnverifiedMatchInput, options: { widenBaseFrom?: string | null } = {}): void {
  if (!tableExists(store)) return;
  const unit = canonicalUnit(input.gameId, input.unit);
  adoptLegacyUnit(store, input.gameId, unit, input.symbol);
  store.db
    .query(
      `INSERT INTO steering_unverified_matches (
         game_id, unit, symbol, analyzed_rev, base_rev, source_path, function_source_sha,
         match_json, reasons_json, report_json, recorded_at, cleared_at, cleared_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT (game_id, unit, symbol) DO UPDATE SET
         analyzed_rev = excluded.analyzed_rev,
         base_rev = CASE
           WHEN steering_unverified_matches.cleared_at IS NULL AND steering_unverified_matches.base_rev IS NOT NULL
             AND (excluded.base_rev IS NULL OR steering_unverified_matches.base_rev IS NOT ?)
           THEN steering_unverified_matches.base_rev
           ELSE excluded.base_rev
         END,
         source_path = excluded.source_path,
         function_source_sha = excluded.function_source_sha,
         match_json = excluded.match_json,
         reasons_json = excluded.reasons_json,
         report_json = excluded.report_json,
         recorded_at = excluded.recorded_at,
         cleared_at = NULL,
         cleared_by = NULL${hasClearedRev(store) ? ",\n         cleared_rev = NULL" : ""}`,
    )
    .run(
      input.gameId, unit, input.symbol, input.analyzedRev, input.baseRev ?? null, input.sourcePath ?? null,
      input.functionSourceSha ?? null, JSON.stringify(input.match), JSON.stringify(input.reasons), JSON.stringify(input.report ?? {}), now(),
      options.widenBaseFrom ?? null,
    );
}

/**
 * Clears one function's state (kept as history) unconditionally; returns
 * whether an active row was cleared. Production clears go through
 * `clearUnverifiedMatchIfCertified`, which checks the row's trusted base.
 */
export function clearUnverifiedMatch(
  store: StateStore,
  params: { gameId: string; unit: string; symbol: string; clearedBy: string; clearedRev?: string | null },
): boolean {
  if (!tableExists(store)) return false;
  const rev = hasClearedRev(store);
  const units = unitClause(params.gameId, params.unit);
  const result = store.db
    .query(`UPDATE steering_unverified_matches SET cleared_at = ?, cleared_by = ?${rev ? ", cleared_rev = ?" : ""}
            WHERE game_id = ? AND ${units.sql} AND symbol = ? AND cleared_at IS NULL`)
    .run(now(), params.clearedBy, ...(rev ? [params.clearedRev ?? null] : []), params.gameId, ...units.units, params.symbol);
  return Number(result.changes) > 0;
}

export interface UnverifiedClearResult {
  cleared: boolean;
  /** The function had an active row when the clear was decided. */
  active: boolean;
  /** The active row's trusted base when the clear was decided (null: no active row, or none recorded). */
  rowBaseRev: string | null;
  /** Why the row was left active (null when cleared). */
  refused: string | null;
}

/**
 * Clears the function's active row for a gate pass measured against
 * `certifiedBaseRev`, only when that base certifies the row's current
 * trusted base (`unverifiedBaseCertified`). Decided against the row as it is
 * now, not as the pass saw it: a row re-recorded or re-based since keeps
 * its state unless the rule still holds, and a row that changes between the
 * check and the write is left active (compare-and-set on its base and
 * `recorded_at` and source path). `fresh`, when given, judges the row it was decided on
 * (null: the certified content is what the row now describes; a string, a
 * throw or a rejection: left active with that reason).
 */
export async function clearUnverifiedMatchIfCertified(store: StateStore, params: {
  gameId: string;
  unit: string;
  symbol: string;
  clearedBy: string;
  /** The revision the certified version is at (`cleared_rev`): saved revisions before it stay held. */
  clearedRev?: string | null;
  certifiedBaseRev: string | null | undefined;
  isAncestor: RevAncestry;
  fresh?: (row: UnverifiedMatchRecord) => string | null | Promise<string | null>;
}): Promise<UnverifiedClearResult> {
  const row = activeUnverifiedMatch(store, params);
  if (!row) return { cleared: false, active: false, rowBaseRev: null, refused: "no active unverified_match row" };
  const rowBaseRev = row.baseRev;
  if (!rowBaseRev) return { cleared: false, active: true, rowBaseRev, refused: "the row has no trusted base revision" };
  if (!params.certifiedBaseRev) return { cleared: false, active: true, rowBaseRev, refused: "the pass has no base revision" };
  if (!await unverifiedBaseCertified({ rowBaseRev, certifiedBaseRev: params.certifiedBaseRev, isAncestor: params.isAncestor })) {
    return {
      cleared: false,
      active: true,
      rowBaseRev,
      refused: `the pass was measured against ${params.certifiedBaseRev}, which is not the row's trusted base ${rowBaseRev} or an ancestor of it`,
    };
  }
  if (params.fresh) {
    let stale: string | null;
    try {
      stale = await params.fresh(row);
    } catch (error) {
      stale = `content freshness could not be established: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (stale !== null) return { cleared: false, active: true, rowBaseRev, refused: stale };
  }
  const rev = hasClearedRev(store);
  const units = unitClause(params.gameId, params.unit);
  const result = store.db
    .query(
      `UPDATE steering_unverified_matches SET cleared_at = ?, cleared_by = ?${rev ? ", cleared_rev = ?" : ""}
       WHERE game_id = ? AND ${units.sql} AND symbol = ? AND cleared_at IS NULL AND base_rev = ? AND recorded_at = ? AND source_path IS ?`,
    )
    .run(
      now(), params.clearedBy, ...(rev ? [params.clearedRev ?? null] : []),
      params.gameId, ...units.units, params.symbol, rowBaseRev, row.recordedAt, row.sourcePath,
    );
  return Number(result.changes) > 0
    ? { cleared: true, active: true, rowBaseRev, refused: null }
    : { cleared: false, active: true, rowBaseRev, refused: "the row changed while the clear was decided" };
}

/** `cleared_by` of a row cleared by the clean apply of a certified integration. */
export function integrationClearedBy(integrationId: string): string {
  return `integration:${integrationId}`;
}

/**
 * Reactivates the rows still cleared by exactly `clearedBy`, once the code
 * that clear accepted has been rolled back. The row comes back as it was
 * recorded (match, reasons, analysed rev, source sha, recordedAt); a row
 * re-recorded or cleared by another pass since keeps that newer state.
 * Returns how many rows became active.
 */
export function restoreUnverifiedMatchesClearedBy(store: StateStore, clearedBy: string): number {
  if (!tableExists(store) || !clearedBy) return 0;
  const result = store.db
    .query(`UPDATE steering_unverified_matches SET cleared_at = NULL, cleared_by = NULL${hasClearedRev(store) ? ", cleared_rev = NULL" : ""}
            WHERE cleared_by = ? AND cleared_at IS NOT NULL`)
    .run(clearedBy);
  return Number(result.changes);
}

/** Active (uncleared) rows of a game; `includeCleared` adds the history. */
export function listUnverifiedMatches(store: StateStore, gameId: string, options: { includeCleared?: boolean } = {}): UnverifiedMatchRecord[] {
  if (!tableExists(store)) return [];
  const rows = store.db
    .query(`SELECT * FROM steering_unverified_matches WHERE game_id = ? ${options.includeCleared ? "" : "AND cleared_at IS NULL"} ORDER BY unit, symbol`)
    .all(gameId) as Record<string, unknown>[];
  return rows.map(record);
}

/** The function's active record, or null; `unit` may be written with or without the module prefix. */
export function activeUnverifiedMatch(store: StateStore, params: { gameId: string; unit: string; symbol: string }): UnverifiedMatchRecord | null {
  if (!tableExists(store) || !params.unit || !params.symbol) return null;
  const units = unitClause(params.gameId, params.unit);
  const row = store.db
    .query(`SELECT * FROM steering_unverified_matches WHERE game_id = ? AND ${units.sql} AND symbol = ? AND cleared_at IS NULL
            ORDER BY recorded_at DESC LIMIT 1`)
    .get(params.gameId, ...units.units, params.symbol) as Record<string, unknown> | null;
  return row ? record(row) : null;
}

/** Keyed by the canonical `targetKey`; `unitKeyedHas`/`unitKeyedGet` also find a report (prefixed) key. */
export function unverifiedMatchIndex(store: StateStore, gameId: string): Map<string, UnverifiedMatchRecord> {
  return withUnitKeys(new Map(listUnverifiedMatches(store, gameId).map((row) => [targetKey(gameId, row.unit, row.symbol), row])), gameId);
}

/** The board's index, or undefined for games without an active steering gate (Melee): their state is never read. */
export function unverifiedIndexForGame(
  store: StateStore,
  game: { gameId?: string | null; steeringGate?: string | null },
): Map<string, UnverifiedMatchRecord> | undefined {
  if (!game.gameId || !steeringGateActive(game.steeringGate as Parameters<typeof steeringGateActive>[0])) return undefined;
  return unverifiedMatchIndex(store, game.gameId);
}
