import { resolveGame } from "../../apps/server/src/core/game-registry/resolver.ts";
import { openState } from "../../apps/server/src/core/orchestrator-state/index.ts";
import { getHarnessState } from "../../apps/server/src/core/harness-state/state.ts";
import { activeSchedulerEpoch, closeSchedulerEpoch, schedulerEpochProgress } from "../../apps/server/src/core/harness-runtime/run-state/index.ts";

// Close an active epoch whose targets were admitted against a head the harness has since left
// (an upstream sync adopted a new head). Resume reuses an active epoch as is, so it would dispatch
// the old selection. closeSchedulerEpoch cancels the epoch's queued, unclaimed worker jobs in the
// same transaction; the next admission starts a fresh epoch at the accepted head.
//
//   bun runbooks/source-fidelity/close-stale-epoch.ts --game sms --run <run id> --epoch <epoch id> [--dry-run]
const argOf = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const gameId = argOf("--game") ?? "sms";
const runId = argOf("--run");
const epochId = argOf("--epoch");
const dryRun = process.argv.includes("--dry-run");
if (!runId || !epochId) throw new Error("--run and --epoch are required");

const game = resolveGame({ gameId });
const store = openState(game.stateDir);
try {
  const state = getHarnessState(store.db, gameId);
  if (!state) throw new Error(`no harness state for ${gameId}`);
  if (state.execution.desired !== "paused" || state.execution.workflow !== "none") throw new Error("harness must be paused with no workflow; aborting");
  if (activeSchedulerEpoch(store, runId)?.id !== epochId) throw new Error(`epoch ${epochId} is not the active epoch of run ${runId}; aborting`);
  const progress = schedulerEpochProgress(store, epochId);
  console.log("progress:", progress);
  if (progress.claimed !== 0) throw new Error(`epoch has ${progress.claimed} claimed targets; settle them first`);
  if (dryRun) { console.log("dry run: no change"); process.exit(0); }
  const result = closeSchedulerEpoch(store, epochId, {
    status: "paused",
    boundaryStatus: "manual_discarded_stale_head",
    routingSummary: { trigger: "operator", reason: `admitted before the accepted head moved to ${state.source.head?.slice(0, 8)}`, admitted: progress.admitted },
  });
  console.log("closed:", result);
  console.log("active epoch now:", activeSchedulerEpoch(store, runId)?.id ?? null);
} finally {
  store.db.close();
}
