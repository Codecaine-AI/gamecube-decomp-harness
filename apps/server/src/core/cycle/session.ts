import type { Database } from "bun:sqlite";

import { getActiveCycle } from "./store.js";

function nonEmpty(value: string | null | undefined): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

export interface CanonicalCycleSessionInput {
  db: Database;
  /** Game the work belongs to; without it there is no active cycle to look up. */
  gameId?: string | null;
  /** A cycle uuid the caller already holds (a run's `cycleUuid`, say). */
  cycleUuid?: string | null;
  /**
   * What to call the session when no cycle can be resolved. Operator CLI
   * invocations against an idle game are legitimate and must keep working, so
   * this is a required, caller-chosen value rather than a silent default.
   */
  fallback: string;
}

/**
 * The one answer to "which cycle does this work belong to?".
 *
 * Kernel containers are keyed by `gameId` + `sessionId`, so a spawn site that
 * passes its own run id — or worse, a minted timestamp — lands its agents in a
 * session of one, disconnected from the cycle the operator is watching. This
 * resolves the caller's own cycle uuid first, then the game's active cycle, and
 * only then the caller's fallback.
 */
export function canonicalCycleSessionId(input: CanonicalCycleSessionInput): string {
  const held = nonEmpty(input.cycleUuid);
  if (held) return held;
  return activeCycleSessionId(input.db, input.gameId) ?? input.fallback;
}

/**
 * The active cycle's uuid, or null when there is none.
 *
 * Callers that write kernel containers need the distinction: a fallback id is
 * fine for naming an agent's session, but filing containers under one invents
 * a cycle that no reader can open. Those callers skip instead.
 */
export function activeCycleSessionId(db: Database, gameId?: string | null): string | null {
  const game = nonEmpty(gameId);
  if (!game) return null;
  return nonEmpty(getActiveCycle(db, game)?.cycle_uuid) ?? null;
}
