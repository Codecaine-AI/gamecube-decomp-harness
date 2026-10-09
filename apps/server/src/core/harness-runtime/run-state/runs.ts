import { createHash, randomUUID } from "node:crypto";
import type {
  RunBlocker,
  RunInputs,
  RunGameMetadata,
  RunRecord,
  RunSchedulerCondition,
  RunStatus,
} from "@server/core/shared/types/index.js";
import { casRunEnvelope, immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";
import {
  appendGameEvent,
  eventSpan,
  newSpanId,
  type EventActor,
  type JsonObject,
  type JsonValue,
} from "@server/core/harness-state/events.js";
import { getHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { getDispatchState } from "@server/core/harness-state/lease.js";

interface RunDbRow extends Record<string, unknown> {
  id: string;
  game_id: string | null;
  goal_kind: string;
  goal_value: number;
  desired_workers: number;
  status: RunStatus;
  revision: number;
  trace_id: string | null;
  caused_by_event_id: string | null;
  blockers_json: string;
  head_revision: string | null;
  inputs_json: string | null;
  stop_request_json: string | null;
  terminal_reason: string | null;
  scheduler_condition: RunSchedulerCondition | null;
  created_at: string;
  game_kind: string | null;
  game_repo_root: string | null;
  game_state_dir: string | null;
  game_graph_db: string | null;
  game_descriptor_path: string | null;
  game_local_override_path: string | null;
}

export interface CreateRunOptions {
  baseRevision?: string;
  configurationSnapshot?: Record<string, unknown>;
  commandId?: string;
  actor?: EventActor;
  requireReady?: boolean;
  spanId?: string;
}

export interface RunTransitionPatch {
  blockers?: RunBlocker[];
  desiredWorkers?: number;
  headRevision?: string | null;
  inputs?: RunInputs | null;
  status?: RunStatus;
  stopRequest?: Record<string, unknown> | null;
  terminalReason?: string | null;
}

export type RunStatusPreservingEventType = "run.configured" | "run.desired_workers_changed" | "run.configuration_updated";

export interface RunDestinationStatusByEvent {
  "run.readied": "ready";
  "run.activated": "active";
  "run.paused": "paused";
  "run.completed": "completed";
  "run.failed": "failed";
  "run.cancelled": "cancelled";
  "run.recovered": "paused";
}

export type RunRecoveryEventType = "run.recovered";
export type RunStatusTransitionEventType = Exclude<
  keyof RunDestinationStatusByEvent,
  RunRecoveryEventType
>;
export type RunStateChangingEventType =
  | RunStatusTransitionEventType
  | RunRecoveryEventType;
export type RunTransitionEventType =
  | RunStatusPreservingEventType
  | RunStateChangingEventType;
export type RunTransitionStatus = Exclude<RunStatus, "draft">;

export type RunPausedEventPayload = {
  from_status: RunStatus;
  to_status: "paused";
  recovery_id?: string;
  recovery_reason?: string;
  cancelled_claim_ids?: string[];
  cancelled_operation_ids?: string[];
  queued_work?: JsonValue[];
};

interface RunPayloadInputByEvent {
  "run.configured": {
    previous_policy_revision: string;
    policy_revision: string;
    old_values: JsonObject;
    new_values: JsonObject;
  };
  "run.configuration_updated": { policy_revision: string };
  "run.desired_workers_changed": {
    previous_desired_workers: number;
    desired_workers: number;
  };
  "run.readied": {
    base_revision: string;
    policy_revision: string;
    starting_knowledge_revision: string;
  };
  "run.activated": { lease_id: string };
  "run.paused": Omit<RunPausedEventPayload, "from_status" | "to_status">;
  "run.completed": Record<string, never>;
  "run.failed": { terminal_reason?: string };
  "run.cancelled": { cancellation_reason: string };
  "run.recovered": {
    recovery_id?: string;
    recovery_reason: string;
    cancelled_claim_ids: string[];
    cancelled_operation_ids: string[];
    queued_work?: JsonValue[];
    resulting_status: "paused";
  };
}

type RunTransitionPatchForEvent<TEvent extends RunTransitionEventType> =
  TEvent extends RunStatusPreservingEventType
    ? Omit<RunTransitionPatch, "status"> & { status?: never }
    : TEvent extends RunStateChangingEventType
      ? Omit<RunTransitionPatch, "status"> & {
          status: RunDestinationStatusByEvent[TEvent];
        }
      : never;

export type RunTransitionInput<
  TEvent extends RunTransitionEventType = RunTransitionEventType,
> = {
  actor: EventActor;
  causationId?: string;
  commandId: string;
  correlationId: string;
  eventType: TEvent;
  expectedRevision: number;
  legacyProducer?: string;
  occurredAt?: string;
  patch: RunTransitionPatchForEvent<NoInfer<TEvent>>;
  spanId?: string;
} & { payload: RunPayloadInputByEvent[NoInfer<TEvent>] };

export interface RunCommandContext {
  commandId?: string;
  causationId?: string;
  spanId?: string;
}

export class StaleRunRevisionError extends Error {
  readonly runId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(runId: string, expectedRevision: number, actualRevision: number) {
    super(`Stale run revision ${expectedRevision} for ${runId}; current revision is ${actualRevision}`);
    this.name = "StaleRunRevisionError";
    this.runId = runId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function canonicalJson(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (!child || typeof child !== "object") return child;
    return Object.fromEntries(
      Object.entries(child as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sort(nested)]),
    );
  };
  return JSON.stringify(sort(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Until a standalone policy artifact exists, a run's policy is its immutable
 * configuration snapshot. Hashing canonical JSON makes that binding stable
 * and mechanically checkable.
 */
export function policyRevisionForConfiguration(configurationSnapshot: Record<string, unknown>): string {
  return `policy-${sha256(canonicalJson(configurationSnapshot))}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseJson<T>(value: unknown, fallback: T, label: string): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON in runs`, { cause: error });
  }
}

function gameFromRow(row: RunDbRow): RunGameMetadata | undefined {
  const game: RunGameMetadata = {
    gameId: optionalString(row.game_id),
    gameKind: optionalString(row.game_kind),
    repoRoot: optionalString(row.game_repo_root),
    stateDir: optionalString(row.game_state_dir),
    graphDbPath: optionalString(row.game_graph_db),
    descriptorPath: optionalString(row.game_descriptor_path),
    localOverridePath: optionalString(row.game_local_override_path),
  };
  return Object.values(game).some(Boolean) ? game : undefined;
}

function runFromRow(row: RunDbRow): RunRecord {
  return {
    id: String(row.id),
    gameId: nullableString(row.game_id),
    goalKind: String(row.goal_kind),
    goalValue: Number(row.goal_value),
    desiredWorkers: Number(row.desired_workers),
    status: row.status,
    revision: Number(row.revision),
    traceId: nullableString(row.trace_id) ?? `trace-run-${row.id}`,
    causedByEventId: nullableString(row.caused_by_event_id),
    blockers: parseJson<RunBlocker[]>(row.blockers_json, [], "blockers"),
    headRevision: nullableString(row.head_revision),
    inputs: parseJson<RunInputs | null>(row.inputs_json, null, "inputs"),
    stopRequest: parseJson<Record<string, unknown> | null>(row.stop_request_json, null, "stop_request"),
    terminalReason: nullableString(row.terminal_reason),
    schedulerCondition: nullableString(row.scheduler_condition) as RunSchedulerCondition | null,
    createdAt: String(row.created_at),
    game: gameFromRow(row),
  };
}

function selectRun(store: StateStore, runId: string): RunDbRow | null {
  return (store.db.query("SELECT * FROM runs WHERE id = ?").get(runId) as RunDbRow | null) ?? null;
}

function readinessFailures(run: RunRecord): string[] {
  const inputs = run.inputs;
  const failures: string[] = [];
  if (!run.gameId) failures.push("game_id");
  if (!inputs?.base_revision?.trim()) failures.push("inputs.base_revision");
  if (!inputs?.policy_revision?.trim()) failures.push("inputs.policy_revision");
  if (!inputs?.starting_knowledge_revision?.trim()) failures.push("inputs.starting_knowledge_revision");
  if (!inputs?.configuration_snapshot || typeof inputs.configuration_snapshot !== "object") {
    failures.push("inputs.configuration_snapshot");
  }
  if (run.blockers.length > 0) failures.push("blockers");
  return failures;
}

const RUN_STATUS_EVENT_BY_DESTINATION = {
  ready: "run.readied",
  active: "run.activated",
  paused: "run.paused",
  completed: "run.completed",
  failed: "run.failed",
  cancelled: "run.cancelled",
} as const satisfies Readonly<Record<RunTransitionStatus, RunStatusTransitionEventType>>;

const RUN_EVENT_DESTINATION_STATUSES = {
  "run.configured": "preserve",
  "run.desired_workers_changed": "preserve",
  "run.configuration_updated": "preserve",
  "run.readied": ["ready"],
  "run.activated": ["active"],
  "run.paused": ["paused"],
  "run.completed": ["completed"],
  "run.failed": ["failed"],
  "run.cancelled": ["cancelled"],
  "run.recovered": ["paused"],
} as const satisfies Readonly<
  Record<RunTransitionEventType, "preserve" | readonly RunStatus[]>
>;

function eventTypeForStatus(status: RunTransitionStatus): RunStatusTransitionEventType {
  return RUN_STATUS_EVENT_BY_DESTINATION[status];
}

function actorForProducer(producer: string): EventActor {
  switch (producer) {
    case "operator":
    case "ui":
      return "operator";
    case "guardian":
      return "guardian";
    case "agent":
      return "agent";
    case "external_observer":
      return "external_observer";
    case "dashboard":
    case "runner":
    case "scheduler":
    case "test":
      return "runner";
    default:
      throw new Error(`Unknown run event producer: ${producer}`);
  }
}

function isAfterActivation(status: RunStatus): boolean {
  return status !== "draft" && status !== "ready";
}

function assertStatusTransition(current: RunStatus, next: RunStatus): void {
  const allowed: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
    draft: ["ready"],
    ready: ["active"],
    active: ["paused", "completed", "failed"],
    paused: ["active", "completed", "cancelled"],
    completed: [],
    failed: ["paused", "cancelled"],
    cancelled: [],
  };
  if (!allowed[current].includes(next)) throw new Error(`Invalid run status transition ${current} -> ${next}`);
}

function assertRunTransitionCompatibility<TEvent extends RunTransitionEventType>(
  current: RunRecord,
  input: RunTransitionInput<TEvent>,
): void {
  const rule = (
    RUN_EVENT_DESTINATION_STATUSES as Readonly<
      Record<string, "preserve" | readonly RunStatus[] | undefined>
    >
  )[input.eventType];
  if (!rule) {
    throw new Error(`Unsupported run transition event: ${input.eventType}`);
  }
  if (rule === "preserve") {
    if (input.patch.status !== undefined) {
      throw new Error(`${input.eventType} must preserve run status`);
    }
    return;
  }
  if (input.patch.status === undefined) {
    throw new Error(`${input.eventType} requires an explicit destination status`);
  }
  const nextStatus = input.patch.status;
  if (!(rule as readonly RunStatus[]).includes(nextStatus)) {
    throw new Error(
      `${input.eventType} is incompatible with destination status ${nextStatus}`,
    );
  }
  if (
    isRunStatusTransitionEvent(input.eventType) &&
    current.status === nextStatus
  ) {
    throw new Error(`${input.eventType} is valid only on entry to ${nextStatus}`);
  }
}

function isRunStatusTransitionEvent(
  eventType: RunTransitionEventType,
): eventType is RunStatusTransitionEventType {
  return eventType !== "run.configured" && eventType !== "run.desired_workers_changed" && eventType !== "run.configuration_updated" && eventType !== "run.recovered";
}

function runTransitionPayload<TEvent extends RunTransitionEventType>(
  current: RunRecord,
  input: RunTransitionInput<TEvent>,
): JsonObject {
  if (input.eventType === "run.paused" && input.payload && "reason" in input.payload) {
    throw new Error("run.paused payload must not include reason");
  }
  const payload: JsonObject = { ...input.payload };
  if (!isRunStatusTransitionEvent(input.eventType)) return payload;
  delete payload.previous_status;
  delete payload.status;
  delete payload.from_status;
  delete payload.to_status;
  return {
    ...payload,
    from_status: current.status,
    to_status: input.patch.status ?? current.status,
  };
}

function assertActiveRunLease(store: StateStore, run: RunRecord): void {
  const state = getDispatchState(store, run.gameId ?? undefined);
  const lease = state?.active_workflow;
  if (!lease || lease.kind !== "run" || lease.workflow_id !== run.id || lease.status !== "active") {
    throw new Error(`Run ${run.id} cannot activate without its active game dispatch lease`);
  }
}

export function transitionRun<const TEvent extends RunTransitionEventType>(
  store: StateStore,
  runId: string,
  input: RunTransitionInput<TEvent>,
): RunRecord {
  return immediateTransaction(store.db, () => {
    const currentRow = selectRun(store, runId);
    if (!currentRow) throw new Error(`Run not found: ${runId}`);
    const current = runFromRow(currentRow);
    if (current.revision !== input.expectedRevision) {
      throw new StaleRunRevisionError(runId, input.expectedRevision, current.revision);
    }
    if (!current.gameId) throw new Error(`Run ${runId} has no game id; canonical transitions require game ownership`);
    if (input.correlationId !== runId) throw new Error(`Run event correlation_id must equal run id ${runId}`);
    assertRunTransitionCompatibility(current, input);
    const nextStatus = input.patch.status ?? current.status;
    if (input.patch.status && input.patch.status !== current.status) assertStatusTransition(current.status, input.patch.status);
    if (nextStatus === "active" && current.status !== "active") assertActiveRunLease(store, current);
    const nextInputs = input.patch.inputs === undefined ? current.inputs : input.patch.inputs;
    const nextBlockers = input.patch.blockers ?? current.blockers;
    if ((current.status === "draft" && nextStatus === "ready") || (current.status === "ready" && nextStatus === "active")) {
      const failures = readinessFailures({ ...current, status: nextStatus, inputs: nextInputs, blockers: nextBlockers });
      if (failures.length > 0) throw new Error(`Run ${runId} readiness failed: ${failures.join(", ")}`);
    }
    if (
      ((current.status === "ready" && nextStatus === "active") || isAfterActivation(current.status)) &&
      input.eventType !== "run.configured" &&
      canonicalJson(nextInputs) !== canonicalJson(current.inputs)
    ) {
      throw new Error(`Run ${runId} inputs are immutable after activation`);
    }

    const at = input.occurredAt ?? now();
    const actionSpanId = input.spanId ?? newSpanId();
    const event = appendGameEvent(store.db, {
      eventType: input.eventType,
      gameId: current.gameId,
      subjectKind: "run",
      subjectId: runId,
      correlationId: input.correlationId,
      causationId: input.causationId ?? input.commandId,
      traceId: current.traceId,
      ...eventSpan(actionSpanId),
      actor: input.actor,
      occurredAt: at,
      payload: runTransitionPayload(current, input),
    });
    const accepted = casRunEnvelope(store.db, {
      allowInputsAfterActivation: input.eventType === "run.configured",
      blockersJson: JSON.stringify(nextBlockers),
      desiredWorkers: input.patch.desiredWorkers ?? current.desiredWorkers,
      eventId: event.eventId,
      expectedRevision: current.revision,
      headRevision: input.patch.headRevision === undefined ? current.headRevision : input.patch.headRevision,
      inputsJson: nextInputs === null ? null : JSON.stringify(nextInputs),
      runId,
      status: nextStatus,
      stopRequestJson:
        input.patch.stopRequest === undefined
          ? (current.stopRequest === null ? null : JSON.stringify(current.stopRequest))
          : (input.patch.stopRequest === null ? null : JSON.stringify(input.patch.stopRequest)),
      terminalReason: input.patch.terminalReason === undefined ? current.terminalReason : input.patch.terminalReason,
    });
    if (!accepted) throw new StaleRunRevisionError(runId, current.revision, getRun(store, runId)?.revision ?? -1);
    if (current.status !== "active" && nextStatus === "active") {
      store.db
        .query(
          `INSERT INTO events (id, run_id, event_type, producer, payload_json, created_at)
           VALUES (?, ?, 'run_started', ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          runId,
          input.legacyProducer ?? input.actor,
          JSON.stringify({ desired_workers: input.patch.desiredWorkers ?? current.desiredWorkers, goal_kind: current.goalKind, goal_value: current.goalValue }),
          at,
        );
    }
    const saved = selectRun(store, runId);
    if (!saved) throw new Error(`Run disappeared after transition: ${runId}`);
    return runFromRow(saved);
  });
}

export function createRun(
  store: StateStore,
  goalKind: string,
  goalValue: number,
  desiredWorkers: number,
  game?: RunGameMetadata,
  options: CreateRunOptions = {},
): RunRecord {
  const id = randomUUID();
  const gameId = game?.gameId?.trim();
  if (!gameId) throw new Error("Run creation requires an explicit game id");
  const canonicalState = getHarnessState(store.db, gameId);
  if (!canonicalState) throw new Error("Run creation requires an initialized harness");
  if (canonicalState.history.run_id) {
    const existing = getRun(store, canonicalState.history.run_id);
    if (!existing || existing.gameId !== gameId) throw new Error("Harness run reference is invalid");
    if (existing.status === "draft") {
      const failures = readinessFailures(existing);
      if (failures.length && options.requireReady) throw new Error(`Run ${existing.id} readiness failed: ${failures.join(", ")}`);
      if (!failures.length) return transitionRun(store, existing.id, {
        actor: options.actor ?? "runner", commandId: options.commandId ?? `command-run-ready-${existing.id}`,
        correlationId: existing.id, eventType: "run.readied", expectedRevision: existing.revision,
        patch: { status: "ready" }, payload: {
          base_revision: existing.inputs!.base_revision, policy_revision: existing.inputs!.policy_revision,
          starting_knowledge_revision: existing.inputs!.starting_knowledge_revision,
        },
      });
    }
    return existing;
  }
  if (!canonicalState.source.head) throw new Error("Initial Sync must accept a harness head before creating a Run");
  const repoRoot = canonicalState.source.worktree;
  if (options.baseRevision && options.baseRevision !== canonicalState.source.head) throw new Error("Run base must equal the accepted harness head");
  const configurationSnapshot = options.configurationSnapshot ?? {
    agent_timeout_seconds: 1800,
    desired_workers: Math.max(1, Math.trunc(desiredWorkers)),
    dry_run_agents: false,
    epoch_configure_command: "",
    goal_kind: goalKind,
    goal_value: goalValue,
    model: "gpt-6-astra",
    provider: "codex-lb",
    sandbox_profile: "",
    thinking_level: "medium",
    worker_configure_command: "",
  };
  const baseRevision = canonicalState.source.head;
  const createdAt = now();
  const traceId = `trace-run-${id}`;
  const actor = options.actor ?? "runner";
  const commandId = options.commandId ?? `command-run-create-${id}`;
  const actionSpanId = options.spanId ?? newSpanId();
  const run = immediateTransaction(store.db, () => {
    const startingRevision = baseRevision;
    const inputs: RunInputs = {
      base_revision: baseRevision,
      policy_revision: policyRevisionForConfiguration(configurationSnapshot),
      starting_knowledge_revision: startingRevision,
      configuration_snapshot: configurationSnapshot,
    };
    const event = appendGameEvent(store.db, {
      eventType: "run.drafted",
      gameId,
      subjectKind: "run",
      subjectId: id,
      correlationId: id,
      causationId: commandId,
      traceId,
      ...eventSpan(actionSpanId),
      actor,
      occurredAt: createdAt,
      payload: {
        desired_workers: Math.max(1, Math.trunc(desiredWorkers)),
        goal_kind: goalKind,
        goal_value: goalValue,
      },
    });
    store.db
      .query(
        `INSERT INTO runs (
           id, goal_kind, goal_value, desired_workers, status, created_at,
           game_id, game_kind, game_repo_root, game_state_dir,
           game_graph_db, game_descriptor_path, game_local_override_path,
           revision, trace_id, caused_by_event_id, blockers_json, head_revision,
           inputs_json, scheduler_condition
         ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '[]', ?, ?, 'idle')`,
      )
      .run(
        id,
        goalKind,
        goalValue,
        Math.max(1, Math.trunc(desiredWorkers)),
        createdAt,
        gameId,
        game?.gameKind ?? null,
        repoRoot ?? null,
        game?.stateDir ?? null,
        game?.graphDbPath ?? null,
        game?.descriptorPath ?? null,
        game?.localOverridePath ?? null,
        traceId,
        event.eventId,
        canonicalState.source.head,
        JSON.stringify(inputs),
      );
    transitionHarnessState(store.db, {
      gameId, expectedRevision: canonicalState.identity.revision, commandId: `${commandId}:attach-run`,
      patch: { history: { run_id: id } },
    });
    const row = selectRun(store, id);
    if (!row) throw new Error(`Run was not created: ${id}`);
    return runFromRow(row);
  });

  const failures = readinessFailures(run);
  if (failures.length > 0) {
    if (options.requireReady) throw new Error(`Run ${id} readiness failed: ${failures.join(", ")}`);
    return run;
  }
  return transitionRun(store, id, {
    actor,
    causationId: run.causedByEventId ?? commandId,
    commandId,
    correlationId: id,
    eventType: "run.readied",
    expectedRevision: run.revision,
    patch: { status: "ready" },
    payload: {
      base_revision: run.inputs!.base_revision,
      policy_revision: run.inputs!.policy_revision,
      starting_knowledge_revision: run.inputs!.starting_knowledge_revision,
    },
    spanId: actionSpanId,
  });
}

export function getLatestRun(store: StateStore): RunRecord | null {
  const row = store.db.query("SELECT * FROM runs ORDER BY created_at DESC LIMIT 1").get() as RunDbRow | null;
  return row ? runFromRow(row) : null;
}

export function getRun(store: StateStore, runId: string): RunRecord | null {
  const row = selectRun(store, runId);
  return row ? runFromRow(row) : null;
}

export function setRunDesiredWorkers(
  store: StateStore,
  runId: string,
  desiredWorkers: number,
  producer = "operator",
  context: RunCommandContext = {},
): RunRecord {
  const current = getRun(store, runId);
  if (!current) throw new Error(`Run not found: ${runId}`);
  const next = Math.max(1, Math.trunc(desiredWorkers));
  if (current.desiredWorkers === next) return current;
  const nextInputs =
    (current.status === "draft" || current.status === "ready") && current.inputs
      ? (() => {
          const configurationSnapshot = {
            ...current.inputs.configuration_snapshot,
            desired_workers: next,
          };
          return {
            ...current.inputs,
            configuration_snapshot: configurationSnapshot,
            policy_revision: policyRevisionForConfiguration(configurationSnapshot),
          };
        })()
      : undefined;
  const changed = transitionRun(store, runId, {
    actor: actorForProducer(producer),
    causationId: context.causationId,
    commandId: context.commandId ?? `command-run-desired-workers-${randomUUID()}`,
    correlationId: runId,
    eventType: "run.desired_workers_changed",
    expectedRevision: current.revision,
    patch: { desiredWorkers: next, inputs: nextInputs },
    payload: { previous_desired_workers: current.desiredWorkers, desired_workers: next },
    spanId: context.spanId ?? newSpanId(),
  });
  return changed;
}

export function updateRunStatus(
  store: StateStore,
  runId: string,
  status: RunTransitionStatus,
  producer = "operator",
  context: RunCommandContext = {},
): RunRecord {
  const current = getRun(store, runId);
  if (!current) throw new Error(`Run not found: ${runId}`);
  if (current.status === status) return current;
  const statusPayload: JsonObject = {};
  if (status === "active") {
    const lease = getDispatchState(store, current.gameId ?? undefined)?.active_workflow;
    if (!lease || lease.kind !== "run" || lease.workflow_id !== runId) {
      throw new Error(`Run ${runId} cannot activate without its active game dispatch lease`);
    }
    statusPayload.lease_id = lease.lease_id;
  }
  if (status === "cancelled") statusPayload.cancellation_reason = current.terminalReason ?? "status update";
  const changed = transitionRun(store, runId, {
    actor: actorForProducer(producer),
    causationId: context.causationId,
    commandId: context.commandId ?? `command-run-status-${randomUUID()}`,
    correlationId: runId,
    eventType: eventTypeForStatus(status),
    expectedRevision: current.revision,
    legacyProducer: producer,
    patch: { status },
    payload: statusPayload,
    spanId: context.spanId ?? newSpanId(),
  });
  return changed;
}

/** Scheduler condition is an observability mirror, not an accepted transition. */
export function setRunSchedulerCondition(
  store: StateStore,
  runId: string,
  schedulerCondition: RunSchedulerCondition,
): RunRecord {
  const result = store.db
    .query("UPDATE runs SET scheduler_condition = ? WHERE id = ? AND scheduler_condition IS NOT ?")
    .run(schedulerCondition, runId, schedulerCondition);
  if (result.changes === 0 && !selectRun(store, runId)) throw new Error(`Run not found: ${runId}`);
  const row = selectRun(store, runId);
  if (!row) throw new Error(`Run not found: ${runId}`);
  return runFromRow(row);
}

/** Edit the prepared configuration atomically, without acquiring dispatch authority. */
export function updatePreparedRunConfiguration(
  store: StateStore, runId: string, expectedRevision: number,
  settings: Record<string, unknown>, commandId: string,
  options: { hasActiveProcess?: (stateDir: string) => { active: boolean } } = {},
): RunRecord {
  return immediateTransaction(store.db, () => {
    const run = getRun(store, runId);
    if (!run || run.revision !== expectedRevision) throw new Error("Run configuration changed; reload before saving");
    const harness = run.gameId ? getHarnessState(store.db, run.gameId) : null;
    const isReady = run.status === "ready";
    const isPaused = run.status === "paused";
    const hasStaleStoppedExecution = isPaused
      && harness?.execution.workflow === "run"
      && harness.execution.status === "active";
    const lease = getDispatchState(store, run.gameId!)?.active_workflow;
    if (!run.inputs || (!isReady && !isPaused) || !harness || harness.history.run_id !== runId
      || harness.execution.desired !== "paused"
      || (harness.execution.workflow !== "none" && !hasStaleStoppedExecution)
      || lease
      || (isReady && store.db.query("SELECT 1 FROM target_claims WHERE run_id = ? LIMIT 1").get(runId))) {
      throw new Error("Settings can only change on the owned, paused Run before its first activation");
    }
    if (isPaused) {
      let processLive: boolean;
      try {
        if (!options.hasActiveProcess) throw new Error("missing liveness check");
        processLive = options.hasActiveProcess(run.game?.stateDir ?? store.stateDir).active;
      } catch {
        throw new Error(`Run ${runId} process liveness could not be determined; paused settings change refused`);
      }
      if (processLive) throw new Error(`Run ${runId} still has a live managed scheduler process; paused settings change refused`);
      if (hasStaleStoppedExecution) {
        transitionHarnessState(store.db, {
          gameId: run.gameId!,
          expectedRevision: harness.identity.revision,
          commandId: `${commandId}:harness-hard-stopped`,
          patch: { execution: { workflow: "none", status: "paused" } },
          boundary: {
            eventId: `${commandId}:harness-hard-stopped`,
            kind: "recovered",
            outcome: "hard_stopped",
            runId,
            evidence: { run_id: runId, cancelled_claim_ids: [] },
          },
        });
      }
    }
    const allowed = new Set(["desired_workers", "agent_timeout_seconds", "model", "provider", "thinking_level", "sandbox_profile"]);
    for (const [key, value] of Object.entries(settings)) {
      if (!allowed.has(key)) throw new Error(`Unsupported Run setting: ${key}`);
      if (isPaused && key !== "desired_workers" && key !== "agent_timeout_seconds") {
        throw new Error(`Paused Run settings can only change desired_workers and agent_timeout_seconds; ${key} changes worker policy mid-run`);
      }
      if (key === "desired_workers" || key === "agent_timeout_seconds") {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
      } else if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a nonempty string`);
    }
    const configuration = { ...run.inputs.configuration_snapshot, ...settings };
    const policy = policyRevisionForConfiguration(configuration);
    const workers = Number(configuration.desired_workers ?? run.desiredWorkers);
    const oldValues = Object.fromEntries(Object.keys(settings).map((key) => [key, run.inputs!.configuration_snapshot[key]])) as JsonObject;
    const newValues = Object.fromEntries(Object.keys(settings).map((key) => [key, configuration[key]])) as JsonObject;
    const result = transitionRun(store, runId, {
      actor: "operator", commandId, correlationId: runId, spanId: newSpanId(),
      eventType: "run.configured", expectedRevision,
      patch: { desiredWorkers: workers, inputs: { ...run.inputs, configuration_snapshot: configuration, policy_revision: policy } },
      payload: { previous_policy_revision: run.inputs.policy_revision, policy_revision: policy, old_values: oldValues, new_values: newValues },
    });
    store.db.query("UPDATE epochs SET worker_pool_size = ? WHERE run_id = ? AND status IN ('active', 'paused')").run(workers, runId);
    return result;
  });
}

/** Live worker-count bounds shared by the run-loop, the CLI, and the dashboard route. */
export const MAX_DESIRED_WORKERS = 256;

export function isDesiredWorkerCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_DESIRED_WORKERS;
}

/** The stored worker count; one primary-key read the run-loop makes every iteration. */
export function readRunDesiredWorkers(store: StateStore, runId: string): number | null {
  const row = store.db.query("SELECT desired_workers FROM runs WHERE id = ?").get(runId) as { desired_workers: number } | null;
  return row ? Number(row.desired_workers) : null;
}

/**
 * Change only desired_workers on a ready, active, or paused Run. It is the same
 * run.configured revision as a prepared settings edit, so the configuration
 * snapshot keeps the value across a restart, and a live run-loop applies it on
 * its next iteration: a raise claims more workers, a cut stops new claims while
 * in-flight workers finish.
 */
export function setRunDesiredWorkersLive(
  store: StateStore,
  runId: string,
  workers: number,
  context: RunCommandContext = {},
): { previousDesiredWorkers: number; run: RunRecord } {
  if (!isDesiredWorkerCount(workers)) throw new Error(`desired_workers must be an integer from 1 to ${MAX_DESIRED_WORKERS}`);
  // BEGIN IMMEDIATE serializes this read and the revision CAS against the run-loop's writes.
  return immediateTransaction(store.db, () => {
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.status !== "ready" && run.status !== "active" && run.status !== "paused") {
      throw new Error(`Run ${runId} is ${run.status}; workers can only change on a ready, active, or paused Run`);
    }
    if (!run.inputs) throw new Error(`Run ${runId} has no prepared configuration`);
    const previousDesiredWorkers = run.desiredWorkers;
    const snapshotWorkers = run.inputs.configuration_snapshot.desired_workers;
    if (previousDesiredWorkers === workers && snapshotWorkers === workers) return { previousDesiredWorkers, run };
    const configuration = { ...run.inputs.configuration_snapshot, desired_workers: workers };
    const policy = policyRevisionForConfiguration(configuration);
    const changed = transitionRun(store, runId, {
      actor: "operator",
      causationId: context.causationId,
      commandId: context.commandId ?? `command-run-desired-workers-live-${randomUUID()}`,
      correlationId: runId,
      eventType: "run.configured",
      expectedRevision: run.revision,
      patch: { desiredWorkers: workers, inputs: { ...run.inputs, configuration_snapshot: configuration, policy_revision: policy } },
      payload: {
        previous_policy_revision: run.inputs.policy_revision,
        policy_revision: policy,
        old_values: { desired_workers: (snapshotWorkers ?? previousDesiredWorkers) as JsonValue },
        new_values: { desired_workers: workers },
      },
      spanId: context.spanId ?? newSpanId(),
    });
    store.db.query("UPDATE epochs SET worker_pool_size = ? WHERE run_id = ? AND status IN ('active', 'paused')").run(workers, runId);
    return { previousDesiredWorkers, run: changed };
  });
}
