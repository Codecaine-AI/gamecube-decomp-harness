import { randomUUID } from "node:crypto";
import { getHarnessState } from "@server/core/harness-state/state.js";
import { openState, setRunBoundarySyncHoldLive } from "@server/core/harness-runtime/run-state";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

/**
 * `set-boundary-sync-hold --game <id> [--run <id>] --hold on|off`: when on, the next
 * epoch boundary records its save point, then parks the harness paused before Sync.
 * Clear it and resume the harness to run the held Sync.
 */
export async function setBoundarySyncHold(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const value = stringArg(args, "--hold", "").trim().toLowerCase();
  if (value !== "on" && value !== "off") throw new Error("--hold must be on or off");
  const store = openState(globals.stateDir);
  try {
    const currentRunId = globals.gameId ? getHarnessState(store.db, globals.gameId)?.history.run_id : undefined;
    const runId = stringArg(args, "--run", stringArg(args, "--run-id", currentRunId ?? ""));
    if (!runId) throw new Error("set-boundary-sync-hold needs --game <id> with a current Run, or --run <id>");
    const { previousHold, run } = setRunBoundarySyncHoldLive(store, runId, value === "on", {
      commandId: `command-cli-boundary-sync-hold-${randomUUID()}`,
    });
    const boundarySyncHold = run.inputs?.configuration_snapshot.boundary_sync_hold === true;
    console.log(JSON.stringify({ runId, status: run.status, previousBoundarySyncHold: previousHold, boundarySyncHold }, null, 2));
  } finally {
    store.db.close();
  }
}
