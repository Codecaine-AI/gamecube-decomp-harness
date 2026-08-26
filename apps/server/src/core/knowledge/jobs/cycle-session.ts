import type { Database } from "bun:sqlite";

import { canonicalCycleSessionId } from "@server/core/cycle/session.js";
import { openState } from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";

export interface KnowledgeCycleSessionInput {
  globals: GlobalArgs;
  /** Explicit game id when the CLI invocation did not hydrate globals.game. */
  gameId?: string | null;
  /**
   * Session id to use when the game has no active cycle. Operators run these
   * jobs against idle games, so every caller keeps the id it used before.
   */
  fallback: string;
  /** Reuse a caller's open state handle instead of opening a second one. */
  db?: Database;
}

/**
 * Which cycle a knowledge job belongs to, for kernel container identity.
 *
 * Knowledge jobs used to name their own session — a run id, a batch id, in one
 * case a freshly minted timestamp — which scattered librarian agents across
 * single-occupant sessions instead of filing them under the cycle an operator
 * is actually watching. They all resolve the active cycle through here now.
 */
export function knowledgeCycleSessionId(input: KnowledgeCycleSessionInput): string {
  const explicitGameId = String(input.gameId ?? "").trim();
  const gameId = explicitGameId || input.globals.game?.gameId || input.globals.gameId;
  if (input.db) {
    return canonicalCycleSessionId({ db: input.db, gameId, fallback: input.fallback });
  }
  const store = openState(input.globals.stateDir);
  try {
    return canonicalCycleSessionId({ db: store.db, gameId, fallback: input.fallback });
  } finally {
    store.db.close();
  }
}
