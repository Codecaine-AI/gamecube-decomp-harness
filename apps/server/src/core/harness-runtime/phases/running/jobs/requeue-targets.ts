import { getDispatchState } from "@server/core/harness-state";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import {
  getRun,
  openState,
  requeueEpochTarget,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { providerOutageReason } from "@server/core/harness-runtime/run-state/infrastructure-failure.js";
import { createManagedProcessController } from "@server/infrastructure/process-control/managed-process-controller.js";

export interface RequeueTargetsInput {
  cappedByProviderOutage: boolean;
  epochId: string;
  hasActiveLeaseProcess: (stateDir: string, leaseId: string) => { active: boolean };
  reason: string;
  runId: string;
  stateDir: string;
  store: StateStore;
  targetKeys: string[];
}

export interface RequeueTargetsResult {
  schema_version: "requeue_targets_v1";
  epoch_id: string;
  epoch_status: string;
  reason: string;
  requeued: Array<{
    epoch_target_id: string;
    target_key: string;
    job_id: string;
    infra_failure_count_before: number;
    infra_failure_count_after: number;
  }>;
  run_id: string;
  selected_target_count: number;
  status: "deferred" | "requeued";
  target_keys: string[];
  message: string;
}

function assertNoLiveRunLease(input: RequeueTargetsInput, gameId: string): void {
  const lease = getDispatchState(input.store, gameId)?.active_workflow ?? null;
  if (!lease || lease.kind !== "run" || lease.workflow_id !== input.runId) return;

  let active: boolean;
  try {
    active = input.hasActiveLeaseProcess(input.stateDir, lease.lease_id).active;
  } catch {
    throw new Error(`Dispatch lease ${lease.lease_id} process liveness could not be determined; target requeue refused`);
  }
  if (active) throw new Error(`Dispatch lease ${lease.lease_id} still has a live scheduler process; target requeue refused`);
}

function parseSummary(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function cappedProviderOutage(store: StateStore, params: { epochTargetId: string; epochId: string; runId: string }): boolean {
  const rows = store.db
    .query(`SELECT summary_json, error_summary FROM worker_state
      WHERE run_id = ? AND epoch_id = ? AND epoch_target_id = ?`)
    .all(params.runId, params.epochId, params.epochTargetId) as Array<Record<string, unknown>>;
  return rows.some((row) => {
    const summary = parseSummary(row.summary_json);
    const infrastructureFailure = summary.infrastructure_failure;
    const capped = infrastructureFailure
      && typeof infrastructureFailure === "object"
      && !Array.isArray(infrastructureFailure)
      && (infrastructureFailure as Record<string, unknown>).capped === true;
    if (!capped) return false;
    const evidence = `${JSON.stringify(summary)}\n${String(row.error_summary ?? "")}`;
    return providerOutageReason(evidence) !== null;
  });
}

export function requeueTargetsForRun(input: RequeueTargetsInput): RequeueTargetsResult {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Target requeue requires a non-empty reason");
  const targetKeys = [...new Set(input.targetKeys.map((key) => key.trim()).filter(Boolean))];
  const run = getRun(input.store, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (!run.gameId) throw new Error(`Run ${input.runId} has no game id`);
  assertNoLiveRunLease(input, run.gameId);

  const epoch = input.store.db.query("SELECT id, run_id, status FROM epochs WHERE id = ?").get(input.epochId) as Record<string, unknown> | undefined;
  if (!epoch || String(epoch.run_id) !== input.runId) {
    throw new Error(`Epoch not found for run ${input.runId}: ${input.epochId}`);
  }
  const epochStatus = String(epoch.status);
  const finished = input.store.db.query(`SELECT id, target_key FROM epoch_targets
    WHERE epoch_id = ? AND run_id = ? AND status = 'finished'
    ORDER BY admission_index ASC`).all(input.epochId, input.runId) as Array<Record<string, unknown>>;
  const selected = finished.filter((target) =>
    (targetKeys.length === 0 || targetKeys.includes(String(target.target_key)))
    && (!input.cappedByProviderOutage || cappedProviderOutage(input.store, {
      epochTargetId: String(target.id), epochId: input.epochId, runId: input.runId,
    }))
  );
  if (targetKeys.length > 0) {
    const selectedKeys = new Set(selected.map((target) => String(target.target_key)));
    const missing = targetKeys.filter((key) => !selectedKeys.has(key));
    if (missing.length > 0) {
      const capFilter = input.cappedByProviderOutage ? " finished targets capped by provider outage" : " finished targets";
      throw new Error(`No matching${capFilter} for target key(s): ${missing.join(", ")}`);
    }
  }
  if (selected.length === 0) {
    const filter = targetKeys.length > 0 ? ` for target key(s): ${targetKeys.join(", ")}` : "";
    const capFilter = input.cappedByProviderOutage ? " capped by provider outage" : "";
    throw new Error(`No finished${capFilter} epoch targets matched${filter}`);
  }

  if (epochStatus !== "active") {
    const keys = selected.map((target) => String(target.target_key));
    return {
      schema_version: "requeue_targets_v1",
      run_id: input.runId,
      epoch_id: input.epochId,
      epoch_status: epochStatus,
      reason,
      target_keys: keys,
      selected_target_count: keys.length,
      requeued: [],
      status: "deferred",
      message: `Epoch ${input.epochId} is ${epochStatus}; ${keys.length} target(s) will re-admit at the next board admission.`,
    };
  }

  const requeued = selected.map((target) => requeueEpochTarget(input.store, {
    epochTargetId: String(target.id),
    actor: "operator",
  })).map((target) => ({
    epoch_target_id: target.epochTargetId,
    target_key: target.targetKey,
    job_id: target.jobId,
    infra_failure_count_before: target.infraFailureCountBefore,
    infra_failure_count_after: target.infraFailureCountAfter,
  }));
  return {
    schema_version: "requeue_targets_v1",
    run_id: input.runId,
    epoch_id: input.epochId,
    epoch_status: epochStatus,
    reason,
    target_keys: requeued.map((target) => target.target_key),
    selected_target_count: requeued.length,
    requeued,
    status: "requeued",
    message: `Requeued ${requeued.length} finished epoch target(s) for another worker attempt.`,
  };
}

export function targetKeysFromArgv(argv: string[]): string[] {
  const targetKeys: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target-key") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --target-key");
      targetKeys.push(value);
      index += 1;
    } else if (arg.startsWith("--target-key=")) {
      const value = arg.slice("--target-key=".length);
      if (!value) throw new Error("Missing value for --target-key");
      targetKeys.push(value);
    }
  }
  return targetKeys;
}

export async function requeueTargets(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const runId = stringArg(args, "--run-id", "").trim();
  const epochId = stringArg(args, "--epoch-id", "").trim();
  const reason = stringArg(args, "--reason", "").trim();
  if (!runId) throw new Error("requeue-targets requires --run-id <id>");
  if (!epochId) throw new Error("requeue-targets requires --epoch-id <id>");
  if (!reason) throw new Error("requeue-targets requires --reason <text>");

  const processController = createManagedProcessController({
    packageRoot: globals.repoRoot,
    gameToSummary: () => ({}),
  });
  const store = openState(globals.stateDir);
  try {
    const result = requeueTargetsForRun({
      cappedByProviderOutage: args.get("--capped-by-provider-outage") === true,
      epochId,
      hasActiveLeaseProcess: (stateDir, leaseId) => processController.hasActiveLeaseProcess(stateDir, leaseId),
      reason,
      runId,
      stateDir: globals.stateDir,
      store,
      targetKeys: targetKeysFromArgv(argv),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    store.db.close();
  }
}
