import { gameToSummary } from "@server/core/game-registry";
import { openState, statusSnapshot } from "@server/core/cycle-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";

export async function status(globals: GlobalArgs): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    const snapshot = statusSnapshot(store);
    const game = globals.game ? gameToSummary(globals.game) : undefined;
    console.log(JSON.stringify(game ? { game, gameWarnings: globals.game?.warnings ?? [], ...snapshot } : snapshot, null, 2));
  } finally {
    store.db.close();
  }
}
