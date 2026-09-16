import { createRun } from "../../run-state/runs.js";
import { getHarnessState, initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";

/** A configured, accepted harness for workflow tests unrelated to bootstrap gates. */
export function createAcceptedRun(...args: Parameters<typeof createRun>): ReturnType<typeof createRun> {
  const [store, , , , metadata, options] = args;
  const gameId = metadata?.gameId ?? "test";
  let harness = getHarnessState(store.db, gameId);
  if (!harness) {
    harness = initializeHarnessState(store.db, { gameId, worktree: metadata?.repoRoot ?? store.stateDir, configurationRevision: "fixture", commandId: `fixture-init-${gameId}` });
    transitionHarnessState(store.db, { gameId, expectedRevision: harness.identity.revision, commandId: `fixture-ready-${gameId}`,
      patch: { source: { head: options?.baseRevision ?? "base-test", upstream_revision: options?.baseRevision ?? "base-test" },
        readiness: { build: "ready", evidence: "ready", sources: "ready", sandbox: "ready" }, execution: { desired: "run", workflow: "none", status: "idle" } } });
  }
  args[4] = { ...metadata, gameId };
  return createRun(...args);
}
