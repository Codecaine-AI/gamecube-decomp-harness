import type { StateStore } from "@server/core/orchestrator-state";
import { getHarnessState, initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";

export function seedRunHarness(store: StateStore, gameId = "test", head = "base-test", worktree = `/games/${gameId}/workspace/checkout`): void {
  if (getHarnessState(store.db, gameId)) return;
  initializeHarnessState(store.db, { gameId, worktree, configurationRevision: "test-config", commandId: `initialize-${gameId}` });
  transitionHarnessState(store.db, { gameId, expectedRevision: 0, commandId: `accept-${gameId}`, patch: { source: { head } } });
}
