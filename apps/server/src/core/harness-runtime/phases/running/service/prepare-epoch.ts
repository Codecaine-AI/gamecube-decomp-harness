import { assertSandboxAdmission } from "@server/core/harness-state/sandbox-admission.js";
import { getHarnessState } from "@server/core/harness-state/state.js";
import { getRun, openState } from "@server/core/harness-runtime/run-state";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { ensureSchedulerEpochFromBoard, schedulerEpochConfigFromArgs } from "../scheduler/tick.js";

/** Seed the accepted report's queue while leaving execution paused. Never dispatch workers. */
export async function prepareEpoch(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  if (!globals.game) throw new Error("prepare-epoch requires --game <id>");
  const store = openState(globals.stateDir);
  try {
    const harness = getHarnessState(store.db, globals.game.gameId);
    const runId = stringArg(args, "--run-id", harness?.history.run_id ?? "");
    const run = runId ? getRun(store, runId) : null;
    if (!harness || !run || run.gameId !== globals.game.gameId || harness.history.run_id !== runId) throw new Error("Initialize this game's Run record before preparing its epoch");
    if (!["ready", "paused"].includes(run.status) || run.headRevision !== harness.source.head || globals.repoRoot !== harness.source.worktree) throw new Error("Epoch preparation requires the accepted checkout and an idle Run record");
    assertSandboxAdmission(store, { game: globals.game, gameId: globals.game.gameId, profile: globals.sandboxProfile });
    const result = ensureSchedulerEpochFromBoard({
      prepareOnly: true, store, runId, globals,
      graphDbPath: globals.game.graphDbPath,
      config: schedulerEpochConfigFromArgs(globals, args, { workerPoolSize: run.desiredWorkers }),
    });
    console.log(JSON.stringify({ runId, ...result, execution: getHarnessState(store.db, globals.game.gameId)?.execution }, null, 2));
  } finally { store.db.close(); }
}
