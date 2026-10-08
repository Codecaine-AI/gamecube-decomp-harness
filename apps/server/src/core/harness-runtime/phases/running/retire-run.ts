import { immediateTransaction } from "@server/core/orchestrator-state";
import { getDispatchState } from "@server/core/harness-state";
import { getHarnessState, transitionHarnessState, type HarnessState, type TransitionHarnessStateInput } from "@server/core/harness-state/state.js";
import { getNonTerminalSyncForGame } from "@server/core/harness-runtime/phases/sync/state.js";
import { activeClaimsForRun, getRun, transitionRun, type StateStore } from "@server/core/harness-runtime/run-state";
import type { RunRecord } from "@server/core/shared/types";

export interface RetireHarnessRunInput {
  store: StateStore;
  gameId: string;
  runId: string;
  expectedRevision: number;
  commandId: string;
  reason: string;
  /** Whether a managed scheduler process is live for this game's state dir. */
  processActive: boolean;
}

export interface RetireHarnessRunResult {
  harness: HarnessState;
  run: RunRecord;
}

const RETIRABLE_STATUSES = new Set(["paused", "failed", "completed", "cancelled"]);

/**
 * Detach a settled Run from the harness so the next Run request creates a fresh
 * Run with new immutable settings. The run row, its epochs and save points stay
 * intact; a paused or failed run settles to completed (every epoch completed)
 * or cancelled. Revision-checked and idempotent by commandId.
 */
export function retireHarnessRun(input: RetireHarnessRunInput): RetireHarnessRunResult {
  const { store, gameId, runId, commandId } = input;
  const reason = input.reason?.trim();
  if (!gameId?.trim() || !runId?.trim() || !commandId?.trim() || !reason) {
    throw new Error("Run retirement requires gameId, runId, commandId and reason");
  }
  return immediateTransaction(store.db, () => {
    const epochs = store.db.query("SELECT id, status FROM epochs WHERE run_id = ? ORDER BY ordinal ASC")
      .all(runId) as Array<{ id: string; status: string }>;
    const epochsCompleted = epochs.length > 0 && epochs.every((epoch) => epoch.status === "completed");
    const lastEpochId = epochs.at(-1)?.id ?? null;
    const harnessInput: TransitionHarnessStateInput = {
      gameId, expectedRevision: input.expectedRevision, commandId,
      patch: { history: { run_id: null, epoch_id: null } },
      boundary: {
        eventId: `harness-run-retired-${commandId}`, kind: "operator", outcome: "run_retired", runId, epochId: lastEpochId,
        evidence: { run_id: runId, reason, last_epoch_id: lastEpochId, epoch_count: epochs.length, epochs_completed: epochsCompleted },
      },
    };
    // A retried command replays the recorded harness result without touching the run again.
    if (store.db.query("SELECT 1 FROM harness_commands WHERE game_id = ? AND command_id = ?").get(gameId, commandId)) {
      return { harness: transitionHarnessState(store.db, harnessInput), run: getRun(store, runId)! };
    }
    const harness = getHarnessState(store.db, gameId);
    if (!harness) throw new Error(`Harness is not initialized for ${gameId}`);
    if (harness.identity.revision !== input.expectedRevision) {
      throw new Error(`Harness revision conflict: expected ${input.expectedRevision}, found ${harness.identity.revision}`);
    }
    if (harness.history.run_id !== runId) throw new Error(`Run ${runId} is not the harness run (${harness.history.run_id ?? "none"})`);
    const run = getRun(store, runId);
    if (!run || run.gameId !== gameId) throw new Error(`Run ${runId} does not belong to ${gameId}`);
    const blockers: string[] = [];
    if (harness.execution.desired !== "paused") blockers.push("harness desired state is not paused");
    if (harness.execution.workflow !== "none" || harness.execution.status === "active") blockers.push(`harness workflow ${harness.execution.workflow} is ${harness.execution.status}`);
    const dispatch = getDispatchState(store, gameId);
    if (dispatch?.active_workflow) blockers.push(`${dispatch.active_workflow.kind} workflow ${dispatch.active_workflow.workflow_id} holds the dispatch lease`);
    if (dispatch?.queued_dispatch_requests.length) blockers.push("dispatch requests are queued");
    const openSync = getNonTerminalSyncForGame(store, gameId);
    if (openSync) blockers.push(`Sync ${openSync.sync_id} is ${openSync.status}`);
    const claims = activeClaimsForRun(store, runId);
    if (claims.length) blockers.push(`${claims.length} active claim(s)`);
    if (input.processActive) blockers.push("a managed scheduler process is live");
    if (!RETIRABLE_STATUSES.has(run.status)) blockers.push(`run status ${run.status} cannot be retired`);
    if (blockers.length) throw new Error(`Run ${runId} cannot be retired: ${blockers.join("; ")}`);

    let settled = run;
    if (run.status === "paused" && epochsCompleted) {
      settled = transitionRun(store, runId, {
        actor: "operator", commandId: `${commandId}:run-completed`, correlationId: runId,
        eventType: "run.completed", expectedRevision: run.revision,
        patch: { status: "completed", stopRequest: null, terminalReason: reason }, payload: {},
      });
    } else if (run.status === "paused" || run.status === "failed") {
      settled = transitionRun(store, runId, {
        actor: "operator", commandId: `${commandId}:run-cancelled`, correlationId: runId,
        eventType: "run.cancelled", expectedRevision: run.revision,
        patch: { status: "cancelled", stopRequest: null, terminalReason: reason }, payload: { cancellation_reason: reason },
      });
    }
    return { harness: transitionHarnessState(store.db, harnessInput), run: settled };
  });
}
