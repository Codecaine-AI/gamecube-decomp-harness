import type { Database } from "bun:sqlite";

import { canonicalHarnessSessionId } from "@server/core/harness-state/session.js";
import { openState } from "@server/core/orchestrator-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";

export interface KnowledgeHarnessSessionInput {
  globals: GlobalArgs;
  /** Explicit game id when the CLI invocation did not hydrate globals.game. */
  gameId?: string | null;
  /**
   * Session id to use when the game has no initialized harness. Operators run these
   * jobs against idle games, so every caller keeps the id it used before.
   */
  fallback: string;
  /** Reuse a caller's open state handle instead of opening a second one. */
  db?: Database;
}

/** Bind knowledge work to the durable game harness session. */
export function knowledgeHarnessSessionId(input: KnowledgeHarnessSessionInput): string {
  const explicitGameId = String(input.gameId ?? "").trim();
  const gameId = explicitGameId || input.globals.game?.gameId || input.globals.gameId;
  if (input.db) {
    return canonicalHarnessSessionId({ db: input.db, gameId, fallback: input.fallback });
  }
  const store = openState(input.globals.stateDir);
  try {
    return canonicalHarnessSessionId({ db: store.db, gameId, fallback: input.fallback });
  } finally {
    store.db.close();
  }
}
