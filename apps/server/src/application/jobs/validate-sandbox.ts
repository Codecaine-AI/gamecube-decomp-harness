import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { resolveGame } from "@server/core/game-registry/resolver.js";
import { validateHarnessSandbox } from "@server/core/harness-state/sandbox-validation.js";
import { openState } from "@server/core/orchestrator-state";

export async function validateSandbox(globals: GlobalArgs, _args: Map<string, string | true>): Promise<void> {
  if (!globals.game) throw new Error("validate-sandbox requires --game <id>");
  const game = globals.game;
  const store = openState(game.stateDir);
  try {
    const result = await validateHarnessSandbox({ store, game, profile: globals.sandboxProfile, reloadGame: () => resolveGame({ gameId: game.gameId, orchestratorRoot: game.orchestratorRoot })! });
    console.log(JSON.stringify(result, null, 2));
  } finally { store.db.close(); }
}
