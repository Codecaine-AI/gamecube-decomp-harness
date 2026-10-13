import { now, type StateStore } from "@server/core/orchestrator-state";

/**
 * Per-game record of functions whose only remaining difference from the
 * target is the stack frame. Only games with `stackFramePolicy:
 * "stop_at_frame"` read it: the board skips such a function while its report
 * score still equals the recorded `fuzzy`, so a later source change to the
 * function re-queues it automatically.
 */
export type StackOnlyRecordSource = "claim" | "attempt" | "backfill";

export interface StackOnlyFunctionRecord {
  gameId: string;
  unit: string;
  symbol: string;
  fuzzy: number | null;
  frameCompiled: number | null;
  frameTarget: number | null;
  source: StackOnlyRecordSource;
  runId: string | null;
  evidence: Record<string, unknown>;
  recordedAt: string;
}

export type StackOnlyFunctionInput = Omit<StackOnlyFunctionRecord, "recordedAt" | "runId" | "evidence" | "frameCompiled" | "frameTarget"> & {
  runId?: string | null;
  evidence?: Record<string, unknown>;
  frameCompiled?: number | null;
  frameTarget?: number | null;
};

/** Two scores this close are the same report value (objdiff prints a handful of decimals). */
export const STACK_ONLY_SCORE_TOLERANCE = 0.001;

function finiteOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : value == null ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tableExists(store: StateStore): boolean {
  return Boolean(store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'stack_only_functions'").get());
}

export function stackOnlyTargetKey(unit: string, symbol: string): string {
  return `${unit}::${symbol}`;
}

export function recordStackOnlyFunction(store: StateStore, input: StackOnlyFunctionInput): StackOnlyFunctionRecord {
  const record: StackOnlyFunctionRecord = {
    gameId: input.gameId,
    unit: input.unit,
    symbol: input.symbol,
    fuzzy: finiteOrNull(input.fuzzy),
    frameCompiled: finiteOrNull(input.frameCompiled),
    frameTarget: finiteOrNull(input.frameTarget),
    source: input.source,
    runId: input.runId ?? null,
    evidence: input.evidence ?? {},
    recordedAt: now(),
  };
  store.db
    .query(
      `
        INSERT INTO stack_only_functions (
          game_id, unit, symbol, fuzzy, frame_compiled, frame_target, source, run_id, evidence_json, recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (game_id, unit, symbol) DO UPDATE SET
          fuzzy = excluded.fuzzy,
          frame_compiled = excluded.frame_compiled,
          frame_target = excluded.frame_target,
          source = excluded.source,
          run_id = excluded.run_id,
          evidence_json = excluded.evidence_json,
          recorded_at = excluded.recorded_at
      `,
    )
    .run(
      record.gameId,
      record.unit,
      record.symbol,
      record.fuzzy,
      record.frameCompiled,
      record.frameTarget,
      record.source,
      record.runId,
      JSON.stringify(record.evidence),
      record.recordedAt,
    );
  return record;
}

export function clearStackOnlyFunction(store: StateStore, params: { gameId: string; unit: string; symbol: string }): void {
  if (!tableExists(store)) return;
  store.db.query("DELETE FROM stack_only_functions WHERE game_id = ? AND unit = ? AND symbol = ?")
    .run(params.gameId, params.unit, params.symbol);
}

export function listStackOnlyFunctions(store: StateStore, gameId: string): StackOnlyFunctionRecord[] {
  // A store still behind migration 012 has no records: read as empty.
  if (!tableExists(store)) return [];
  const rows = store.db
    .query("SELECT * FROM stack_only_functions WHERE game_id = ? ORDER BY unit, symbol")
    .all(gameId) as Record<string, unknown>[];
  return rows.map((row) => {
    let evidence: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(row.evidence_json ?? "{}")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) evidence = parsed as Record<string, unknown>;
    } catch {}
    return {
      gameId: String(row.game_id),
      unit: String(row.unit),
      symbol: String(row.symbol),
      fuzzy: finiteOrNull(row.fuzzy),
      frameCompiled: finiteOrNull(row.frame_compiled),
      frameTarget: finiteOrNull(row.frame_target),
      source: String(row.source) as StackOnlyRecordSource,
      runId: row.run_id == null ? null : String(row.run_id),
      evidence,
      recordedAt: String(row.recorded_at),
    };
  });
}

/** `unit::symbol` -> recorded score, the board's exclusion index. */
export function stackOnlyFunctionIndex(store: StateStore, gameId: string): Map<string, number | null> {
  return new Map(listStackOnlyFunctions(store, gameId).map((record) => [stackOnlyTargetKey(record.unit, record.symbol), record.fuzzy]));
}

/**
 * True while the function's current report score still equals the recorded
 * one. A record without a score always excludes; a function whose score moved
 * is stale and is a candidate again.
 */
export function isRecordedStackOnly(index: ReadonlyMap<string, number | null> | undefined, key: string, fuzzy: number): boolean {
  if (!index?.has(key)) return false;
  const recorded = index.get(key);
  if (recorded == null) return true;
  return Math.abs(recorded - fuzzy) <= STACK_ONLY_SCORE_TOLERANCE;
}

/** The board's exclusion index, or undefined for games that match the frame (Melee): their records are never read. */
export function stackOnlyIndexForGame(
  store: StateStore,
  game: { gameId?: string | null; stackFramePolicy?: string | null },
): Map<string, number | null> | undefined {
  if (game.stackFramePolicy !== "stop_at_frame" || !game.gameId) return undefined;
  return stackOnlyFunctionIndex(store, game.gameId);
}
