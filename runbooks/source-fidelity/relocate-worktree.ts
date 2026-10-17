import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolveGame } from "../../apps/server/src/core/game-registry/resolver.ts";
import { gameConfigurationRevision } from "../../apps/server/src/core/game-registry/config-revision.ts";
import { openState } from "../../apps/server/src/core/orchestrator-state/index.ts";
import { getHarnessState, transitionHarnessState } from "../../apps/server/src/core/harness-state/state.ts";

// Re-point harness_state.source.worktree after the repository moved on disk.
// The configuration revision hashes absolute paths, so a stale worktree path makes
// sandbox admission (init-run, prepare-epoch, the Run route) reject the accepted config.
const ROOT = "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness";
const argOf = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const GAME = argOf("--game") ?? "sms";
const REASON = argOf("--reason") ?? "repository moved from ~/Github Repos/Codecaine to ~/workspace/harnesses; re-point the accepted worktree to the resolved game checkout";
const dryRun = process.argv.includes("--dry-run");

const game = resolveGame({ gameId: GAME, orchestratorRoot: ROOT });
const config = gameConfigurationRevision(game);
const store = openState(game.stateDir);
try {
  const state = getHarnessState(store.db, GAME);
  if (!state) throw new Error(`no harness state for ${GAME}`);
  const prior = state.source.worktree;
  const next = game.repoRoot;
  console.log("before:", { revision: state.identity.revision, worktree: prior, config: state.source.configuration_revision.slice(0, 8), desired: state.execution.desired, workflow: state.execution.workflow, run: state.history.run_id });
  console.log("resolved checkout:", next, "| config at resolved checkout:", config.slice(0, 8));
  if (prior === next) { console.log("worktree already current: no change"); process.exit(0); }
  if (existsSync(prior)) {
    if (realpathSync(prior) !== realpathSync(next)) throw new Error(`recorded worktree ${prior} is not the same directory as ${next}; aborting`);
  } else {
    // The old location is gone after a move: accept the resolved checkout only at the accepted head.
    const head = execFileSync("git", ["-C", next, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (!state.source.head || head !== state.source.head) throw new Error(`recorded worktree ${prior} is missing and ${next} is at ${head.slice(0, 8)}, not the accepted head ${state.source.head?.slice(0, 8)}; aborting`);
    console.log(`recorded worktree is missing; resolved checkout is at the accepted head ${head.slice(0, 8)}`);
  }
  if (state.execution.desired !== "paused" || state.execution.workflow !== "none") throw new Error("harness must be paused with no workflow; aborting");
  if (config !== state.source.configuration_revision) throw new Error(`configuration at the resolved checkout (${config.slice(0, 8)}) differs from the accepted revision; aborting`);
  if (dryRun) { console.log("dry run: no change"); process.exit(0); }
  const result = transitionHarnessState(store.db, {
    gameId: GAME,
    expectedRevision: state.identity.revision,
    commandId: `operator-worktree-relocation:${next}`,
    patch: { source: { worktree: next } },
    boundary: {
      eventId: `operator-worktree-relocation:${next}`,
      kind: "operator",
      outcome: "worktree_relocated",
      runId: state.history.run_id ?? null,
      epochId: state.history.epoch_id ?? null,
      evidence: { reason: REASON, worktree_prior: prior, worktree_accepted: next, configuration_revision: config },
    },
  });
  console.log("after:", { revision: result.identity.revision, worktree: result.source.worktree, config: result.source.configuration_revision.slice(0, 8), readiness: result.readiness, desired: result.execution.desired });
} finally { store.db.close(); }
