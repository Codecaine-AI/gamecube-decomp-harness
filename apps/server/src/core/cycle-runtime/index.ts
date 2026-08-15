import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import {
  cycleView,
  type CreateCycleInput,
  type ManualStopMode,
  type PreparingPhaseState,
  type PrPhaseState,
  type CycleBlocker,
  type CycleDerivedStatusTransitionInput,
  type CyclePatch,
  type CycleRecord,
  type CycleRuntimeBlocker,
  type CycleStatusPreservingEventType,
  type CycleStatusPreservingTransitionInput,
  type CycleStatusTransitionEventType,
  type CycleView,
  type RunningPhaseState,
  type RunningStopReason,
} from "@server/core/cycle";
import type { EventActor, JsonObject } from "@server/core/harness-state/events.js";
import {
  activeCycleProjection,
  createCycle,
  getActiveCycle,
  getOrCreateActiveCycle,
  getCycleBySelector,
  listCycles,
  transitionCycle,
} from "@server/core/cycle/store";
import { now as currentTime } from "@server/core/orchestrator-state";
import { completePreparing, setPreparingSubphase, startRunningFromPreparing } from "./phases/preparing/index.js";
import { completeCycle } from "./phases/complete/index.js";
import { completeFinalBuild, completePr, enterPrPhase, setPrSubphase } from "./phases/pr/index.js";
import { blockRunning, setRunningSubphase, stopRunning, unblockStoppedRunning } from "./phases/running/index.js";

export interface CycleSelector {
  id?: string | null;
  cycleUuid?: string | null;
  gameId?: string | null;
}

export interface CycleRuntimeResult {
  record: CycleRecord;
  view: CycleView;
}

export type CycleCommand =
  | "create"
  | "enter-pr"
  | "finish-pr-final-build"
  | "mark-pr-complete"
  | "mark-preparing-complete"
  | "publish-pr"
  | "read"
  | "start-running"
  | "stop-running"
  | "update-pr-subphase"
  | "update-preparing-subphase"
  | "update-running-subphase";

export interface CycleCommandInput {
  baseRef?: string | null;
  body?: Record<string, unknown>;
  force?: boolean;
  gameId: string;
}

export interface CycleCommandResponse {
  payload: Record<string, unknown>;
  status?: number;
}

export interface CycleRuntimeTransitionOptions {
  actor?: EventActor;
  causationId?: string;
  commandId?: string;
  correlationId: string;
  now?: string;
  spanId?: string;
}

function requireCycle(db: Database, selector: CycleSelector): CycleRecord {
  const record = getCycleBySelector(db, selector);
  if (!record) throw new Error("No matching active game cycle");
  return record;
}

function result(record: CycleRecord): CycleRuntimeResult {
  return {
    record,
    view: cycleView(record),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function requireBlockerSourceValue(
  blocker: CycleBlocker,
  index: number,
  field: "source_kind" | "source_id",
): string {
  const value = typeof blocker[field] === "string" ? blocker[field].trim() : "";
  if (!value) {
    throw new Error(`blockers[${index}] must include ${field}`);
  }
  return value;
}

function normalizeRuntimeBlockers(
  blockers: readonly CycleBlocker[],
): CycleBlocker[] {
  return blockers.map((blocker, index) => {
    const sourceKind = requireBlockerSourceValue(blocker, index, "source_kind");
    const sourceId = requireBlockerSourceValue(blocker, index, "source_id");
    if (!Array.isArray(blocker.recovery_choices)) {
      throw new Error(`blockers[${index}] must include explicit recovery_choices`);
    }
    const recoveryChoices = blocker.recovery_choices.map((choice, choiceIndex) => {
      if (typeof choice !== "string" || choice.trim() === "") {
        throw new Error(`blockers[${index}].recovery_choices[${choiceIndex}] must be a nonblank string`);
      }
      return choice.trim();
    });
    return {
      ...blocker,
      source_kind: sourceKind,
      source_id: sourceId,
      recovery_choices: uniqueStrings(recoveryChoices),
    };
  });
}

function progressPayload(
  record: CycleRecord,
  patch: CyclePatch,
  payload: JsonObject,
): JsonObject {
  return {
    previous_phase: record.phase,
    previous_status: record.status,
    phase: patch.phase ?? record.phase,
    status: patch.status ?? record.status,
    ...payload,
  };
}

const CYCLE_RUNTIME_STATUS_DESTINATIONS = {
  "cycle.running_unblocked": "active",
  "cycle.blocked": "blocked",
  "cycle.complete": "complete",
} as const satisfies Partial<
  Record<CycleStatusTransitionEventType, CycleRecord["status"]>
>;

type CycleRuntimeStatusEventType = keyof typeof CYCLE_RUNTIME_STATUS_DESTINATIONS;

function commitStatusPreservingTransition<
  const TEvent extends CycleStatusPreservingEventType,
>(
  db: Database,
  record: CycleRecord,
  patch: CycleStatusPreservingTransitionInput<TEvent>["patch"],
  eventType: TEvent,
  options: CycleRuntimeTransitionOptions,
  payload: JsonObject = {},
): CycleRuntimeResult {
  const at = options.now ?? currentTime();
  if (options.correlationId !== record.cycle_uuid) {
    throw new Error(`Cycle event correlation_id must equal cycle UUID ${record.cycle_uuid}`);
  }
  const input: CycleStatusPreservingTransitionInput<TEvent> = {
    actor: options.actor ?? "runner",
    commandId: options.commandId ?? `command-${eventType.replaceAll(".", "-")}-${randomUUID()}`,
    correlationId: record.cycle_uuid,
    causationId: options.causationId,
    eventType,
    expectedRevision: record.revision,
    occurredAt: at,
    patch,
    payload: progressPayload(record, patch, payload),
    gameId: record.game_id,
    cycleUuid: record.cycle_uuid,
    spanId: options.spanId,
  };
  return result(transitionCycle(db, record.id, input));
}

function commitStatusTransition<const TEvent extends CycleRuntimeStatusEventType>(
  db: Database,
  record: CycleRecord,
  patch: CycleDerivedStatusTransitionInput<TEvent>["patch"],
  eventType: TEvent,
  options: CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const at = options.now ?? currentTime();
  if (options.correlationId !== record.cycle_uuid) {
    throw new Error(`Cycle event correlation_id must equal cycle UUID ${record.cycle_uuid}`);
  }
  const input: CycleDerivedStatusTransitionInput<TEvent> = {
    actor: options.actor ?? "runner",
    commandId: options.commandId ?? `command-${eventType.replaceAll(".", "-")}-${randomUUID()}`,
    correlationId: record.cycle_uuid,
    causationId: options.causationId,
    eventType,
    expectedRevision: record.revision,
    occurredAt: at,
    patch,
    gameId: record.game_id,
    cycleUuid: record.cycle_uuid,
    spanId: options.spanId,
  };
  return result(transitionCycle(db, record.id, input));
}

function acceptStatusPreservingTransition(
  db: Database,
  record: CycleRecord,
  patch: CyclePatch,
  eventType: CycleStatusPreservingEventType,
  options: CycleRuntimeTransitionOptions,
  payload: JsonObject = {},
): CycleRuntimeResult {
  if (patch.status !== undefined) {
    throw new Error(`${eventType} must preserve game cycle status`);
  }
  return commitStatusPreservingTransition(
    db,
    record,
    withoutStatus(patch),
    eventType,
    options,
    payload,
  );
}

function acceptStatusTransition<TEvent extends CycleRuntimeStatusEventType>(
  db: Database,
  record: CycleRecord,
  patch: CyclePatch,
  eventType: TEvent,
  options: CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const destination = CYCLE_RUNTIME_STATUS_DESTINATIONS[eventType];
  if (!isCycleRuntimeStatusPatch(patch, eventType)) {
    throw new Error(`${eventType} requires destination status ${destination}`);
  }
  return commitStatusTransition(
    db,
    record,
    patch,
    eventType,
    options,
  );
}

function isCycleRuntimeStatusPatch<TEvent extends CycleRuntimeStatusEventType>(
  patch: CyclePatch,
  eventType: TEvent,
): patch is CycleDerivedStatusTransitionInput<TEvent>["patch"] {
  return patch.status === CYCLE_RUNTIME_STATUS_DESTINATIONS[eventType];
}

function withoutStatus(
  patch: CyclePatch,
): Omit<CyclePatch, "status"> & { status?: never } {
  const { status: _status, ...preservingPatch } = patch;
  return preservingPatch;
}

function acceptBlockedOrSemanticTransition(
  db: Database,
  record: CycleRecord,
  patch: CyclePatch,
  options: CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  if (patch.status !== "blocked") {
    throw new Error("blocked path requires destination status blocked");
  }
  const nextBlockers = normalizeRuntimeBlockers(patch.blockers_json ?? []);
  if (nextBlockers.length === 0) {
    throw new Error("blocked path requires at least one blocker");
  }
  const blockersChanged =
    JSON.stringify(nextBlockers) !== JSON.stringify(record.blockers_json);
  const blockedPatch = {
    ...patch,
    blockers_json: nextBlockers,
  } satisfies CyclePatch;
  if (record.status !== "blocked") {
    return acceptStatusTransition(
      db,
      record,
      blockedPatch,
      "cycle.blocked",
      options,
    );
  }
  if (blockersChanged) {
    return acceptStatusPreservingTransition(
      db,
      record,
      withoutStatus(blockedPatch),
      "cycle.blockers_updated",
      options,
    );
  }
  return result(record);
}

export function ensureCycle(db: Database, input: CreateCycleInput): CycleRuntimeResult {
  return result(getOrCreateActiveCycle(db, input));
}

export function createNewCycle(db: Database, input: CreateCycleInput): CycleRuntimeResult {
  return result(createCycle(db, input));
}

export function updatePreparingSubphase(
  db: Database,
  selector: CycleSelector,
  subphase: PreparingPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PreparingPhaseState> } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, setPreparingSubphase(record, at, subphase, options), "cycle.preparing_subphase_updated", { ...options, now: at }, { subphase });
}

export function markPreparingComplete(
  db: Database,
  selector: CycleSelector,
  options: { activeRunId?: string | null; completion?: Record<string, unknown> } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  const patch = completePreparing(record, at, options.completion);
  if (options.activeRunId !== undefined) patch.active_run_id = options.activeRunId || null;
  return acceptStatusPreservingTransition(db, record, patch, "cycle.preparing_completed", { ...options, now: at });
}

export function startRunning(db: Database, selector: CycleSelector, options: CycleRuntimeTransitionOptions): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, startRunningFromPreparing(record, at), "cycle.running_started", { ...options, now: at });
}

export function updateRunningSubphase(
  db: Database,
  selector: CycleSelector,
  subphase: RunningPhaseState["subphase"],
  options: { detail?: string; data?: Partial<RunningPhaseState> } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, setRunningSubphase(record, at, subphase, options), "cycle.running_subphase_updated", { ...options, now: at }, { subphase });
}

export function stopCycleRun(
  db: Database,
  selector: CycleSelector,
  stopReason: RunningStopReason,
  options: { manualStopMode?: ManualStopMode; blockers?: CycleRuntimeBlocker[] } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  const patch = stopRunning(record, at, stopReason, options);
  if (patch.status === "blocked") {
    return acceptBlockedOrSemanticTransition(db, record, patch, { ...options, now: at });
  }
  return acceptStatusPreservingTransition(db, record, withoutStatus(patch), "cycle.running_stopped", { ...options, now: at }, { stop_reason: stopReason });
}

export function unblockCycleRun(db: Database, selector: CycleSelector, options: CycleRuntimeTransitionOptions): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusTransition(db, record, unblockStoppedRunning(record, at), "cycle.running_unblocked", { ...options, now: at });
}

export function blockCycleRun(
  db: Database,
  selector: CycleSelector,
  blockers: CycleRuntimeBlocker[],
  options: CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptBlockedOrSemanticTransition(db, record, blockRunning(record, blockers), { ...options, now: at });
}

export function enterPr(db: Database, selector: CycleSelector, options: { force?: boolean } & CycleRuntimeTransitionOptions): CycleRuntimeResult {
  let record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  const transitionOptions = {
    ...options,
    commandId: options.commandId ?? `command-cycle-enter-pr-${randomUUID()}`,
    now: at,
    spanId: options.spanId ?? `span-${randomUUID()}`,
  };
  let causationId = options.causationId;
  if (record.status === "blocked") {
    if (!options.force) {
      throw new Error("Cannot enter PR while the cycle remains blocked");
    }
    const unblocked = acceptStatusTransition(
      db,
      record,
      unblockStoppedRunning(record, at),
      "cycle.running_unblocked",
      transitionOptions,
    );
    record = unblocked.record;
    causationId = unblocked.record.caused_by_event_id ?? options.causationId;
  }
  if (record.status !== "active") {
    throw new Error(`cycle.pr_entered requires active cycle status; received ${record.status}`);
  }
  return acceptStatusPreservingTransition(
    db,
    record,
    enterPrPhase(record, at, options),
    "cycle.pr_entered",
    { ...transitionOptions, causationId },
    { forced: options.force ?? false },
  );
}

export function finishPrFinalBuild(
  db: Database,
  selector: CycleSelector,
  options: { finalBuild?: Record<string, unknown> } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, completeFinalBuild(record, at, options.finalBuild), "cycle.pr_final_build_completed", { ...options, now: at });
}

export function updatePrSubphase(
  db: Database,
  selector: CycleSelector,
  subphase: PrPhaseState["subphase"],
  options: { detail?: string; data?: Partial<PrPhaseState> } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, setPrSubphase(record, at, subphase, options), "cycle.pr_subphase_updated", { ...options, now: at }, { subphase });
}

export function markPrComplete(
  db: Database,
  selector: CycleSelector,
  options: { completion?: Record<string, unknown> } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusPreservingTransition(db, record, completePr(record, at, options.completion), "cycle.pr_completed", { ...options, now: at });
}

export function markCycleComplete(
  db: Database,
  selector: CycleSelector,
  options: {
    completedBy?: string;
    completedReason?: string;
    finalSavePoint?: Record<string, unknown>;
    settledPrCounts?: Record<string, unknown>;
  } & CycleRuntimeTransitionOptions,
): CycleRuntimeResult {
  const record = requireCycle(db, selector);
  const at = options.now ?? currentTime();
  return acceptStatusTransition(
    db,
    record,
    completeCycle(record, at, options),
    "cycle.complete",
    { ...options, now: at },
  );
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function commandSelector(body: Record<string, unknown>, gameId: string): CycleSelector {
  return {
    id: text(body.id),
    cycleUuid: text(body.cycleUuid, text(body.cycle_uuid)),
    gameId,
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function responsePayload(view: unknown, history: unknown[] = []): Record<string, unknown> {
  return {
    cycle: view,
    history,
  };
}

function commandResult(db: Database, gameId: string, runtimeResult: CycleRuntimeResult): CycleCommandResponse {
  return {
    payload: responsePayload(runtimeResult.view, listCycles(db, gameId)),
  };
}

export function handleCycleCommand(
  db: Database,
  command: CycleCommand,
  input: CycleCommandInput,
): CycleCommandResponse {
  const body = input.body ?? {};
  const gameId = input.gameId;
  const selector = commandSelector(body, gameId);
  const actor = "operator" as const;
  const commandId = text(body.commandId, text(body.command_id)) || `command-cycle-${command}-${randomUUID()}`;
  const spanId = text(body.spanId, text(body.span_id)) || undefined;
  if (command === "read") {
    return {
      payload: responsePayload(activeCycleProjection(db, gameId), listCycles(db, gameId)),
    };
  }
  if (command === "create") {
    if (getActiveCycle(db, gameId)) {
      return {
        payload: {
          error: "An active game cycle already exists",
          cycle: activeCycleProjection(db, gameId),
        },
        status: 409,
      };
    }
    return commandResult(
      db,
      gameId,
      createNewCycle(db, {
        gameId,
        baseRef: text(body.baseRef, input.baseRef ?? "") || null,
        baseSha: text(body.baseSha) || null,
        activeRunId: text(body.activeRunId, text(body.runId)) || null,
        actor,
        commandId,
        spanId,
        worktreeIdentity: text(body.worktreeIdentity, text(body.worktree_identity)) || undefined,
        openingSyncId: text(body.openingSyncId, text(body.opening_sync_id)) || null,
      }),
    );
  }
  const suppliedCorrelationId = text(body.correlationId, text(body.correlation_id)).trim();
  const actionCycle = requireCycle(db, selector);
  if (suppliedCorrelationId && suppliedCorrelationId !== actionCycle.cycle_uuid) {
    throw new Error(`Cycle event correlation_id must equal cycle UUID ${actionCycle.cycle_uuid}`);
  }
  const transitionContext = {
    actor,
    commandId,
    correlationId: actionCycle.cycle_uuid,
    spanId,
  };

  switch (command) {
    case "update-preparing-subphase":
      return commandResult(
        db,
        gameId,
        updatePreparingSubphase(db, selector, text(body.subphase) as PreparingPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
          ...transitionContext,
        }),
      );
    case "mark-preparing-complete":
      return commandResult(
        db,
        gameId,
        markPreparingComplete(db, selector, {
          activeRunId: text(body.activeRunId, text(body.active_run_id)) || undefined,
          completion: objectValue(body.completion),
          ...transitionContext,
        }),
      );
    case "start-running":
      return commandResult(db, gameId, startRunning(db, selector, transitionContext));
    case "update-running-subphase":
      return commandResult(
        db,
        gameId,
        updateRunningSubphase(db, selector, text(body.subphase) as RunningPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
          data: objectValue(body.data) as Partial<RunningPhaseState>,
          ...transitionContext,
        }),
      );
    case "stop-running":
      return commandResult(
        db,
        gameId,
        stopCycleRun(db, selector, text(body.stopReason, text(body.stop_reason, "manual_stop")) as RunningStopReason, {
          manualStopMode: text(body.manualStopMode, text(body.manual_stop_mode)) as ManualStopMode,
          ...transitionContext,
        }),
      );
    case "enter-pr":
      return commandResult(db, gameId, enterPr(db, selector, { force: input.force || body.force === true, ...transitionContext }));
    case "finish-pr-final-build":
      return commandResult(db, gameId, finishPrFinalBuild(db, selector, { finalBuild: objectValue(body.finalBuild), ...transitionContext }));
    case "update-pr-subphase":
      return commandResult(
        db,
        gameId,
        updatePrSubphase(db, selector, text(body.subphase) as PrPhaseState["subphase"], {
          detail: text(body.subphaseDetail, text(body.subphase_detail)),
          ...transitionContext,
        }),
      );
    case "publish-pr":
      return commandResult(db, gameId, updatePrSubphase(db, selector, "publish", transitionContext));
    case "mark-pr-complete":
      return commandResult(db, gameId, markPrComplete(db, selector, { completion: objectValue(body.completion), ...transitionContext }));
  }
}
