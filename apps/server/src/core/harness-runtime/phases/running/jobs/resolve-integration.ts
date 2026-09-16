import { getDispatchState } from "@server/core/harness-state";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import {
  addEvent,
  getRun,
  getWorkerOutputIntegration,
  openState,
  updateWorkerOutputIntegration,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { isBlockingWorkerOutputIntegrationStatus } from "@server/core/harness-runtime/run-state/worker-output-integration.js";
import { immediateTransaction, now } from "@server/core/orchestrator-state";
import { createManagedProcessController } from "@server/infrastructure/process-control/managed-process-controller.js";

export type IntegrationResolutionChoice = "reject";

export interface ResolveWorkerOutputIntegrationInput {
  choice: IntegrationResolutionChoice;
  hasActiveLeaseProcess: (stateDir: string, leaseId: string) => { active: boolean };
  outcomeId: string;
  reason: string;
  runId: string;
  stateDir: string;
  store: StateStore;
}

export interface ResolveWorkerOutputIntegrationResult {
  schema_version: "worker_output_integration_resolution_v1";
  choice: IntegrationResolutionChoice;
  run_id: string;
  outcome_id: string;
  target_key: string | null;
  checkpoint_id: string;
  previous_status: string;
  status: "rejected";
  disposition: "operator_rejected";
  resolved_at: string;
  event_id: string;
  checkpoint_selected: false;
  target_remains_open: true;
  message: string;
}

function assertNoLiveRunLease(input: ResolveWorkerOutputIntegrationInput, gameId: string): void {
  const lease = getDispatchState(input.store, gameId)?.active_workflow ?? null;
  if (!lease || lease.kind !== "run" || lease.workflow_id !== input.runId) return;

  let active: boolean;
  try {
    active = input.hasActiveLeaseProcess(input.stateDir, lease.lease_id).active;
  } catch {
    throw new Error(`Dispatch lease ${lease.lease_id} process liveness could not be determined; integration resolution refused`);
  }
  if (active) {
    throw new Error(`Dispatch lease ${lease.lease_id} still has a live scheduler process; integration resolution refused`);
  }
}

export function resolveWorkerOutputIntegration(input: ResolveWorkerOutputIntegrationInput): ResolveWorkerOutputIntegrationResult {
  if (input.choice !== "reject") throw new Error(`Unsupported integration resolution choice: ${input.choice}`);
  const reason = input.reason.trim();
  if (!reason) throw new Error("Integration resolution requires a non-empty reason");

  return immediateTransaction(input.store.db, () => {
    const run = getRun(input.store, input.runId);
    if (!run) throw new Error(`Run not found: ${input.runId}`);
    if (!run.gameId) throw new Error(`Run ${input.runId} has no game id`);
    assertNoLiveRunLease(input, run.gameId);

    const outcome = getWorkerOutputIntegration(input.store, input.outcomeId);
    if (!outcome || outcome.runId !== input.runId) {
      throw new Error(`Worker output integration not found for run ${input.runId}: ${input.outcomeId}`);
    }
    if (!isBlockingWorkerOutputIntegrationStatus(outcome.status)) {
      throw new Error(`Worker output integration ${outcome.id} is ${outcome.status}; only blocking outcomes can be rejected`);
    }
    if (!outcome.workerCheckpointId) {
      throw new Error(`Worker output integration ${outcome.id} has no checkpoint`);
    }

    const resolvedAt = now();
    const updated = updateWorkerOutputIntegration(input.store, outcome.id, {
      status: "rejected",
      disposition: "operator_rejected",
      resolvedAt,
      metadata: {
        rejected_by: "operator",
        reason,
        previous_status: outcome.status,
      },
    });
    const checkpointUpdate = input.store.db
      .query("UPDATE worker_checkpoints SET selected = 0 WHERE id = ?")
      .run(outcome.workerCheckpointId);
    if (checkpointUpdate.changes !== 1) {
      throw new Error(`Worker checkpoint not found: ${outcome.workerCheckpointId}`);
    }
    const eventId = addEvent(input.store, input.runId, "worker_integration_rejected", "operator", {
      outcome_id: outcome.id,
      target_key: outcome.targetKey,
      checkpoint_id: outcome.workerCheckpointId,
      reason,
    });

    return {
      schema_version: "worker_output_integration_resolution_v1",
      choice: input.choice,
      run_id: input.runId,
      outcome_id: outcome.id,
      target_key: outcome.targetKey,
      checkpoint_id: outcome.workerCheckpointId,
      previous_status: outcome.status,
      status: "rejected",
      disposition: "operator_rejected",
      resolved_at: updated.resolvedAt ?? resolvedAt,
      event_id: eventId,
      checkpoint_selected: false,
      target_remains_open: true,
      message: "The target remains open and can be re-admitted by the next epoch board admission.",
    };
  });
}

export async function resolveIntegration(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const runId = stringArg(args, "--run-id", "").trim();
  const outcomeId = stringArg(args, "--outcome-id", "").trim();
  const choice = stringArg(args, "--choice", "").trim();
  const reason = stringArg(args, "--reason", "").trim();
  if (!runId) throw new Error("resolve-integration requires --run-id <id>");
  if (!outcomeId) throw new Error("resolve-integration requires --outcome-id <id>");
  if (choice !== "reject") throw new Error("resolve-integration currently requires --choice reject");
  if (!reason) throw new Error("resolve-integration requires --reason <text>");

  const processController = createManagedProcessController({
    packageRoot: globals.repoRoot,
    gameToSummary: () => ({}),
  });
  const store = openState(globals.stateDir);
  try {
    const result = resolveWorkerOutputIntegration({
      choice,
      hasActiveLeaseProcess: (stateDir, leaseId) => processController.hasActiveLeaseProcess(stateDir, leaseId),
      outcomeId,
      reason,
      runId,
      stateDir: globals.stateDir,
      store,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    store.db.close();
  }
}
