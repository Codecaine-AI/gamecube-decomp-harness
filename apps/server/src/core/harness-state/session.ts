import type { Database } from "bun:sqlite";
import { getHarnessState } from "./state.js";

export interface CanonicalHarnessSessionInput {
  db: Database;
  gameId?: string | null;
  /** Explicit workflow identity for work before a harness has been initialized. */
  fallback: string;
}

export function activeHarnessSessionId(db: Database, gameId?: string | null): string | null {
  const game = gameId?.trim();
  return game ? getHarnessState(db, game)?.identity.harness_id ?? null : null;
}

export function canonicalHarnessSessionId(input: CanonicalHarnessSessionInput): string {
  return activeHarnessSessionId(input.db, input.gameId) ?? input.fallback;
}
