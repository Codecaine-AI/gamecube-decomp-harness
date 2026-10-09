import { randomUUID } from "node:crypto";
import { getHarnessState } from "@server/core/harness-state/state.js";
import { isDesiredWorkerCount, MAX_DESIRED_WORKERS, openState, setRunDesiredWorkersLive } from "@server/core/harness-runtime/run-state";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

/**
 * `set-desired-workers --game <id> [--run <id>] --workers <n>`: the live worker-count
 * control as its own process. The run defaults to the game's current Run; a live
 * run-loop applies the new count on its next iteration.
 */
export async function setDesiredWorkers(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const workers = Number(stringArg(args, "--workers", ""));
  if (!isDesiredWorkerCount(workers)) throw new Error(`--workers must be an integer from 1 to ${MAX_DESIRED_WORKERS}`);
  const store = openState(globals.stateDir);
  try {
    const currentRunId = globals.gameId ? getHarnessState(store.db, globals.gameId)?.history.run_id : undefined;
    const runId = stringArg(args, "--run", stringArg(args, "--run-id", currentRunId ?? ""));
    if (!runId) throw new Error("set-desired-workers needs --game <id> with a current Run, or --run <id>");
    const { previousDesiredWorkers, run } = setRunDesiredWorkersLive(store, runId, workers, {
      commandId: `command-cli-desired-workers-${randomUUID()}`,
    });
    console.log(JSON.stringify({ runId, status: run.status, previousDesiredWorkers, desiredWorkers: run.desiredWorkers }, null, 2));
  } finally {
    store.db.close();
  }
}
