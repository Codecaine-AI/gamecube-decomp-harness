import type { Database } from "bun:sqlite";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  createCycleRecord,
  defaultKernelTraceState,
  normalizeCompleteState,
  normalizeKernelTraceState,
  normalizePreparingState,
  normalizePrState,
  normalizeProcessState,
  normalizeRunningState,
  cycleView,
} from "./state.js";
import type {
  CreateCycleInput,
  CycleKernelTracePatch,
  CyclePatch,
  CyclePayloadByEvent,
  CycleRecord,
  CycleDerivedStatusTransitionEventType,
  CycleDerivedStatusTransitionInput,
  CycleStatus,
  CycleStatusPreservingEventType,
  CycleStatusPreservingTransitionInput,
  CycleTelemetryPatch,
  CycleTransitionInput,
  CycleTransitionEventType,
  CycleView,
} from "./types.js";
import { newCycleId, newCycleUuid } from "./identity.js";
import { createOrchestratorStateOrm, immediateTransaction, now as currentTime } from "@server/core/orchestrator-state";
import { cycles, type CycleRow } from "@server/core/orchestrator-state/storage/schema";
import {
  appendGameEvent,
  eventSpan,
  newSpanId,
  type JsonObject,
} from "@server/core/harness-state/events.js";

type Row = CycleRow;
type SqlValue = string | number | bigint | boolean | null | Uint8Array;

type CycleTransitionRule =
  | { destination: "preserve" }
  | { destination: CycleStatus; entryOnly?: boolean };

const CYCLE_TRANSITION_RULES = {
  "cycle.preparing_subphase_updated": { destination: "preserve" },
  "cycle.preparing_completed": { destination: "preserve" },
  "cycle.running_started": { destination: "preserve" },
  "cycle.running_subphase_updated": { destination: "preserve" },
  "cycle.running_stopped": { destination: "preserve" },
  "cycle.pr_entered": { destination: "preserve" },
  "cycle.pr_final_build_completed": { destination: "preserve" },
  "cycle.pr_subphase_updated": { destination: "preserve" },
  "cycle.pr_completed": { destination: "preserve" },
  "cycle.running_unblocked": { destination: "active", entryOnly: true },
  "cycle.blocked": { destination: "blocked", entryOnly: true },
  "cycle.blockers_updated": { destination: "preserve" },
  "cycle.complete": { destination: "complete", entryOnly: true },
  "cycle.closing": { destination: "closing", entryOnly: true },
  "cycle.closed": { destination: "closed", entryOnly: true },
} as const satisfies Readonly<Record<CycleTransitionEventType, CycleTransitionRule>>;

const CYCLE_STATUS_TRANSITIONS = {
  active: ["blocked", "complete", "closing"],
  blocked: ["active", "closing"],
  complete: ["closing"],
  closing: ["closed"],
  closed: [],
} as const satisfies Readonly<Record<CycleStatus, readonly CycleStatus[]>>;

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseJson(value: unknown): unknown {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mergeJsonObjects(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const currentValue = merged[key];
    merged[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      currentValue &&
      typeof currentValue === "object" &&
      !Array.isArray(currentValue)
        ? mergeJsonObjects(
            currentValue as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
  }
  return merged;
}

export function rowToCycle(row: Row): CycleRecord {
  const now = stringValue(row.updatedAt, currentTime());
  const gameId = stringValue(row.gameId);
  const cycleUuid = stringValue(row.cycleUuid);
  return {
    id: row.id,
    game_id: gameId,
    cycle_uuid: cycleUuid,
    status: row.status,
    phase: row.phase,
    active_run_id: nullableString(row.activeRunId),
    base_ref: nullableString(row.baseRef),
    base_sha: nullableString(row.baseSha),
    revision: Number(row.revision ?? 0),
    head_revision: nullableString(row.headRevision),
    trace_id: nullableString(row.traceId) ?? `trace-cycle-${cycleUuid}`,
    blockers_json: Array.isArray(parseJson(row.blockersJson))
      ? (parseJson(row.blockersJson) as CycleRecord["blockers_json"])
      : [],
    save_point_stale: Boolean(row.savePointStale),
    caused_by_event_id: nullableString(row.causedByEventId),
    preparing_state_json: normalizePreparingState(parseJson(row.preparingStateJson), now),
    running_state_json: normalizeRunningState(parseJson(row.runningStateJson)),
    pr_state_json: normalizePrState(parseJson(row.prStateJson)),
    complete_state_json: normalizeCompleteState(parseJson(row.completeStateJson)),
    process_state_json: normalizeProcessState(parseJson(row.processStateJson), gameId, cycleUuid, now),
    kernel_trace_json: normalizeKernelTraceState(parseJson(row.kernelTraceJson), cycleUuid),
    created_at: stringValue(row.createdAt, now),
    updated_at: now,
    completed_at: nullableString(row.completedAt),
    closed_at: nullableString(row.closedAt),
  };
}

export function insertCycle(db: Database, record: CycleRecord): CycleRecord {
  createOrchestratorStateOrm(db)
    .insert(cycles)
    .values({
      id: record.id,
      gameId: record.game_id,
      cycleUuid: record.cycle_uuid,
      status: record.status,
      phase: record.phase,
      activeRunId: record.active_run_id,
      baseRef: record.base_ref,
      baseSha: record.base_sha,
      revision: record.revision,
      headRevision: record.head_revision,
      traceId: record.trace_id,
      blockersJson: record.blockers_json,
      savePointStale: record.save_point_stale,
      causedByEventId: record.caused_by_event_id,
      preparingStateJson: record.preparing_state_json,
      runningStateJson: record.running_state_json,
      prStateJson: record.pr_state_json,
      completeStateJson: record.complete_state_json,
      processStateJson: record.process_state_json ?? {},
      kernelTraceJson: record.kernel_trace_json ?? defaultKernelTraceState(record.cycle_uuid),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      completedAt: record.completed_at,
      closedAt: record.closed_at,
    })
    .run();
  return record;
}

export function createCycle(db: Database, input: CreateCycleInput): CycleRecord {
  if (!input.actor) throw new Error("Cycle creation requires an explicit actor");
  const at = input.now ?? currentTime();
  const cycleUuid = input.cycleUuid ?? newCycleUuid();
  const id = input.id ?? newCycleId(cycleUuid);
  const record = createCycleRecord({
    ...input,
    id,
    now: at,
    cycleUuid,
  });
  return immediateTransaction(db, () => {
    const actionSpanId = input.spanId ?? newSpanId();
    const opened = appendGameEvent(db, {
      eventType: "cycle.opened",
      gameId: record.game_id,
      subjectKind: "cycle",
      subjectId: record.cycle_uuid,
      correlationId: record.cycle_uuid,
      causationId: input.commandId ?? `command-cycle-open-${record.cycle_uuid}`,
      traceId: record.trace_id,
      ...eventSpan(actionSpanId),
      actor: input.actor,
      occurredAt: at,
      payload: {
        baseline_revision: record.base_sha,
        initial_head_revision: record.head_revision,
        worktree_identity:
          input.worktreeIdentity ?? `cycle:${record.game_id}:${record.cycle_uuid}`,
        opening_sync_id: input.openingSyncId ?? null,
        state_revision: record.revision,
      },
    });
    return insertCycle(db, { ...record, caused_by_event_id: opened.eventId });
  });
}

export function getCycleById(db: Database, id: string): CycleRecord | null {
  const row = createOrchestratorStateOrm(db).select().from(cycles).where(eq(cycles.id, id)).get();
  return row ? rowToCycle(row) : null;
}

export function getCycleByUuid(db: Database, cycleUuid: string): CycleRecord | null {
  const row = createOrchestratorStateOrm(db).select().from(cycles).where(eq(cycles.cycleUuid, cycleUuid)).get();
  return row ? rowToCycle(row) : null;
}

export function getActiveCycle(db: Database, gameId: string): CycleRecord | null {
  const row = createOrchestratorStateOrm(db)
    .select()
    .from(cycles)
    .where(and(eq(cycles.gameId, gameId), inArray(cycles.status, ["active", "blocked", "closing"])))
    .orderBy(desc(cycles.createdAt))
    .limit(1)
    .get();
  return row ? rowToCycle(row) : null;
}

export function getOrCreateActiveCycle(db: Database, input: CreateCycleInput): CycleRecord {
  const active = getActiveCycle(db, input.gameId);
  if (active) return active;
  return createCycle(db, input);
}

export function listCycles(db: Database, gameId: string, limit = 20): CycleRecord[] {
  return createOrchestratorStateOrm(db)
    .select()
    .from(cycles)
    .where(eq(cycles.gameId, gameId))
    .orderBy(desc(cycles.createdAt))
    .limit(Math.max(1, Math.trunc(limit)))
    .all()
    .map(rowToCycle);
}

function patchedCycle(
  current: CycleRecord,
  patch: CyclePatch,
  at: string,
): CycleRecord {
  const next: CycleRecord = {
    ...current,
    status: patch.status ?? current.status,
    phase: patch.phase ?? current.phase,
    active_run_id: patch.active_run_id === undefined ? current.active_run_id : patch.active_run_id,
    base_ref: patch.base_ref === undefined ? current.base_ref : patch.base_ref,
    base_sha: patch.base_sha === undefined ? current.base_sha : patch.base_sha,
    head_revision: patch.head_revision === undefined ? current.head_revision : patch.head_revision,
    trace_id: patch.trace_id ?? current.trace_id,
    blockers_json: patch.blockers_json ?? current.blockers_json,
    save_point_stale: patch.save_point_stale ?? current.save_point_stale,
    caused_by_event_id: patch.caused_by_event_id === undefined ? current.caused_by_event_id : patch.caused_by_event_id,
    preparing_state_json: patch.preparing_state_json ?? current.preparing_state_json,
    running_state_json: patch.running_state_json ?? current.running_state_json,
    pr_state_json: patch.pr_state_json ?? current.pr_state_json,
    complete_state_json: patch.complete_state_json ?? current.complete_state_json,
    process_state_json: patch.process_state_json === undefined ? current.process_state_json : patch.process_state_json,
    kernel_trace_json: patch.kernel_trace_json === undefined ? current.kernel_trace_json : patch.kernel_trace_json,
    completed_at: patch.completed_at === undefined ? current.completed_at : patch.completed_at,
    closed_at: patch.closed_at === undefined ? current.closed_at : patch.closed_at,
    updated_at: at,
  };
  return next;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function requiredBlockerString(
  blocker: CycleRecord["blockers_json"][number],
  index: number,
  field: "code" | "source_kind" | "source_id",
): string {
  const value = typeof blocker[field] === "string" ? blocker[field].trim() : "";
  if (!value) throw new Error(`blockers[${index}] must include ${field}`);
  return value;
}

function blockerPayloadFacts(
  blockers: CycleRecord["blockers_json"],
): {
  blocker_codes: string[];
  recovery_choices: string[];
  source_identities: Array<{ source_kind: string; source_id: string }>;
} {
  if (blockers.length === 0) {
    throw new Error("A blocked cycle transition requires at least one blocker");
  }
  const blockerCodes: string[] = [];
  const recoveryChoices: string[] = [];
  const identities = new Map<
    string,
    { source_kind: string; source_id: string }
  >();
  blockers.forEach((blocker, index) => {
    const code = requiredBlockerString(blocker, index, "code");
    const sourceKind = requiredBlockerString(blocker, index, "source_kind");
    const sourceId = requiredBlockerString(blocker, index, "source_id");
    if (!Array.isArray(blocker.recovery_choices)) {
      throw new Error(`blockers[${index}] must include explicit recovery_choices`);
    }
    const choices = blocker.recovery_choices.map((choice, choiceIndex) => {
      const normalized = typeof choice === "string" ? choice.trim() : "";
      if (!normalized) {
        throw new Error(
          `blockers[${index}].recovery_choices[${choiceIndex}] must be a nonblank string`,
        );
      }
      return normalized;
    });
    blockerCodes.push(code);
    recoveryChoices.push(...choices);
    identities.set(`${sourceKind}\0${sourceId}`, {
      source_kind: sourceKind,
      source_id: sourceId,
    });
  });
  return {
    blocker_codes: uniqueStrings(blockerCodes),
    recovery_choices: uniqueStrings(recoveryChoices),
    source_identities: [...identities.values()],
  };
}

function assertCycleTransitionCompatibility(
  current: CycleRecord,
  input: CycleTransitionInput<string>,
): void {
  const rule = (
    CYCLE_TRANSITION_RULES as Readonly<
      Record<string, CycleTransitionRule | undefined>
    >
  )[input.eventType];
  if (!rule) {
    throw new Error(`Unsupported game cycle transition event: ${input.eventType}`);
  }

  const nextStatus = input.patch.status ?? current.status;
  if (rule.destination === "preserve") {
    if (input.patch.status !== undefined) {
      throw new Error(`${input.eventType} must preserve game cycle status`);
    }
    if (input.eventType === "cycle.blockers_updated") {
      const blockersChanged =
        JSON.stringify(input.patch.blockers_json ?? current.blockers_json) !==
        JSON.stringify(current.blockers_json);
      if (current.status !== "blocked" || !blockersChanged) {
        throw new Error(
          "cycle.blockers_updated requires changed blockers while remaining blocked",
        );
      }
    }
    if (
      input.eventType === "cycle.pr_entered" &&
      (current.status !== "active" || current.phase === "pr" || input.patch.phase !== "pr")
    ) {
      throw new Error(
        "cycle.pr_entered requires an active cycle transitioning to phase pr",
      );
    }
    return;
  }
  if (nextStatus !== rule.destination) {
    throw new Error(
      `${input.eventType} requires destination status ${rule.destination}; received ${nextStatus}`,
    );
  }
  if (rule.entryOnly && current.status === rule.destination) {
    throw new Error(`${input.eventType} is valid only on entry to ${rule.destination}`);
  }
  if (
    current.status !== nextStatus &&
    !(CYCLE_STATUS_TRANSITIONS[current.status] as readonly CycleStatus[])
      .includes(nextStatus)
  ) {
    throw new Error(
      `Invalid game cycle status transition ${current.status} -> ${nextStatus}`,
    );
  }
}

function cycleTransitionPayload(
  current: CycleRecord,
  input: CycleTransitionInput<string>,
): JsonObject {
  if (input.eventType === "cycle.blocked") {
    const facts = blockerPayloadFacts(
      input.patch.blockers_json ?? current.blockers_json,
    );
    return {
      from_status: current.status,
      to_status: "blocked",
      prior_status: current.status,
      ...facts,
      state_revision: current.revision + 1,
    };
  }
  if (input.eventType === "cycle.blockers_updated") {
    const facts = blockerPayloadFacts(
      input.patch.blockers_json ?? current.blockers_json,
    );
    const previousCodes = uniqueStrings(
      current.blockers_json.map((blocker) => blocker.code),
    );
    const previousCodeSet = new Set(previousCodes);
    const nextCodeSet = new Set(facts.blocker_codes);
    return {
      added_blocker_codes: facts.blocker_codes.filter(
        (code) => !previousCodeSet.has(code),
      ),
      removed_blocker_codes: previousCodes.filter(
        (code) => !nextCodeSet.has(code),
      ),
      ...facts,
      state_revision: current.revision + 1,
    };
  }
  if (input.eventType === "cycle.running_unblocked") {
    return { from_status: current.status, to_status: "active" };
  }
  if (input.eventType === "cycle.complete") {
    return { from_status: current.status, to_status: "complete" };
  }
  if (input.eventType === "cycle.closing") {
    return { from_status: current.status, to_status: "closing" };
  }
  if (input.eventType === "cycle.closed") {
    const supplied = requireCycleClosedPayload(input.payload);
    return {
      final_head: input.patch.head_revision ?? current.head_revision,
      shipped_and_unshipped_work_summary:
        supplied.shipped_and_unshipped_work_summary,
      final_save_point_id: supplied.final_save_point_id,
      closing_operator: input.actor,
      state_revision: current.revision + 1,
    };
  }
  return {
    ...(input.payload ?? {}),
    previous_phase: current.phase,
    previous_status: current.status,
    phase: input.patch.phase ?? current.phase,
    status: input.patch.status ?? current.status,
  };
}

function isJsonObject(value: JsonObject[string] | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireCycleClosedPayload(
  payload: JsonObject | undefined,
): Pick<
  CyclePayloadByEvent["cycle.closed"],
  "final_save_point_id" | "shipped_and_unshipped_work_summary"
> {
  const summary = payload?.shipped_and_unshipped_work_summary;
  const finalSavePointId = payload?.final_save_point_id;
  if (
    !isJsonObject(summary) ||
    typeof summary.ahead_of_base !== "number" ||
    typeof summary.worktree_dirty_beyond_head !== "boolean" ||
    (finalSavePointId !== null && typeof finalSavePointId !== "string")
  ) {
    throw new Error("cycle.closed requires explicit closeout facts");
  }
  return {
    final_save_point_id: finalSavePointId,
    shipped_and_unshipped_work_summary: {
      ahead_of_base: summary.ahead_of_base,
      worktree_dirty_beyond_head: summary.worktree_dirty_beyond_head,
    },
  };
}

/**
 * Accepts one durable cycle transition. The semantic event and revision-CAS
 * update share the caller-visible transaction and therefore succeed or roll
 * back as one fact.
 */
export function transitionCycle<
  const TEvent extends CycleStatusPreservingEventType,
>(
  db: Database,
  id: string,
  input: CycleStatusPreservingTransitionInput<TEvent>,
): CycleRecord;
export function transitionCycle<
  const TEvent extends CycleDerivedStatusTransitionEventType,
>(
  db: Database,
  id: string,
  input: CycleDerivedStatusTransitionInput<TEvent>,
): CycleRecord;
export function transitionCycle<
  const TEvent extends CycleTransitionEventType,
>(
  db: Database,
  id: string,
  input: CycleTransitionInput<TEvent>,
): CycleRecord;
export function transitionCycle(
  db: Database,
  id: string,
  input: CycleTransitionInput<string>,
): CycleRecord {
  return immediateTransaction(db, () => {
    const current = getCycleById(db, id);
    if (!current) throw new Error(`Game cycle not found: ${id}`);
    if (current.revision !== input.expectedRevision) {
      throw new Error(`Stale game cycle revision ${input.expectedRevision} for ${current.cycle_uuid}`);
    }
    if (input.gameId && input.gameId !== current.game_id) {
      throw new Error(`Game cycle ${current.cycle_uuid} does not belong to ${input.gameId}`);
    }
    if (input.cycleUuid && input.cycleUuid !== current.cycle_uuid) {
      throw new Error(`Game cycle UUID mismatch: ${input.cycleUuid}`);
    }
    const at = input.occurredAt ?? currentTime();
    if (input.correlationId !== current.cycle_uuid) {
      throw new Error(`Cycle event correlation_id must equal cycle UUID ${current.cycle_uuid}`);
    }
    assertCycleTransitionCompatibility(current, input);
    const actionSpanId = input.spanId ?? newSpanId();
    const payload = cycleTransitionPayload(current, input);
    const event = appendGameEvent(db, {
      eventType: input.eventType,
      gameId: current.game_id,
      subjectKind: "cycle",
      subjectId: current.cycle_uuid,
      correlationId: current.cycle_uuid,
      causationId: input.causationId ?? input.commandId,
      traceId: current.trace_id,
      ...eventSpan(actionSpanId),
      actor: input.actor,
      occurredAt: at,
      payload,
    });
    const next = patchedCycle(current, input.patch, at);

    const result = db
      .query(
        `UPDATE cycles
         SET status = ?, phase = ?, active_run_id = ?, base_ref = ?, base_sha = ?,
             head_revision = ?, trace_id = ?, blockers_json = ?, save_point_stale = ?,
             revision = ?, caused_by_event_id = ?, preparing_state_json = ?,
             running_state_json = ?, pr_state_json = ?, complete_state_json = ?,
             process_state_json = ?, kernel_trace_json = ?, updated_at = ?,
             completed_at = ?, closed_at = ?
         WHERE id = ? AND revision = ?`,
      )
      .run(
        next.status,
        next.phase,
        next.active_run_id,
        next.base_ref,
        next.base_sha,
        next.head_revision,
        next.trace_id,
        JSON.stringify(next.blockers_json),
        next.save_point_stale ? 1 : 0,
        current.revision + 1,
        event.eventId,
        JSON.stringify(next.preparing_state_json),
        JSON.stringify(next.running_state_json),
        JSON.stringify(next.pr_state_json),
        JSON.stringify(next.complete_state_json),
        JSON.stringify(next.process_state_json ?? {}),
        JSON.stringify(next.kernel_trace_json ?? defaultKernelTraceState(next.cycle_uuid)),
        next.updated_at,
        next.completed_at,
        next.closed_at,
        next.id,
        current.revision,
      );
    if (result.changes !== 1) {
      throw new Error(`Stale game cycle revision ${current.revision} for ${current.cycle_uuid}`);
    }
    const saved = getCycleById(db, id);
    if (!saved) throw new Error(`Game cycle disappeared after transition: ${id}`);
    return saved;
  });
}

/** Telemetry mirrors do not advance the durable cycle lifecycle revision. */
export function updateCycle(
  db: Database,
  id: string,
  patch: CycleTelemetryPatch,
  at = currentTime(),
): CycleRecord {
  const invalid = Object.keys(patch).filter(
    (key) => key !== "process_state_json" && key !== "kernel_trace_json",
  );
  if (invalid.length > 0) {
    throw new Error(`Game cycle lifecycle fields require transitionCycle: ${invalid.join(", ")}`);
  }
  return immediateTransaction(db, () => {
    const current = getCycleById(db, id);
    if (!current) throw new Error(`Game cycle not found: ${id}`);
    createOrchestratorStateOrm(db)
      .update(cycles)
      .set({
        processStateJson:
          patch.process_state_json === undefined
            ? (current.process_state_json ?? {})
            : (patch.process_state_json ?? {}),
        kernelTraceJson:
          patch.kernel_trace_json === undefined
            ? (current.kernel_trace_json ?? defaultKernelTraceState(current.cycle_uuid))
            : (patch.kernel_trace_json ?? defaultKernelTraceState(current.cycle_uuid)),
        updatedAt: at,
      })
      .where(eq(cycles.id, id))
      .run();
    const saved = getCycleById(db, id);
    if (!saved) throw new Error(`Game cycle disappeared after telemetry update: ${id}`);
    return saved;
  });
}

export function updateCycleWith(
  db: Database,
  id: string,
  updater: (record: CycleRecord, now: string) => CycleTelemetryPatch,
  at = currentTime(),
): CycleRecord {
  return immediateTransaction(db, () => {
    const current = getCycleById(db, id);
    if (!current) throw new Error(`Game cycle not found: ${id}`);
    return updateCycle(db, id, updater(current, at), at);
  });
}

/**
 * Losslessly merges kernel telemetry under an immediate lock. The linkage
 * cursor is replaced atomically while unrelated nested metadata survives.
 */
export function mergeCycleKernelTrace(
  db: Database,
  id: string,
  patch: CycleKernelTracePatch,
  at = currentTime(),
): CycleRecord {
  return immediateTransaction(db, () => {
    const current = getCycleById(db, id);
    if (!current) throw new Error(`Game cycle not found: ${id}`);
    const currentTrace = objectValue(
      current.kernel_trace_json ?? defaultKernelTraceState(current.cycle_uuid),
    );
    const patchObject = objectValue(patch);
    const merged = mergeJsonObjects(currentTrace, patchObject);
    if (Object.prototype.hasOwnProperty.call(patchObject, "last_linkage_cursor")) {
      merged.last_linkage_cursor = patch.last_linkage_cursor ?? null;
    }
    const kernelTrace = normalizeKernelTraceState(
      {
        ...merged,
        cycle_uuid: current.cycle_uuid,
      },
      current.cycle_uuid,
    );
    createOrchestratorStateOrm(db)
      .update(cycles)
      .set({ kernelTraceJson: kernelTrace, updatedAt: at })
      .where(eq(cycles.id, id))
      .run();
    const saved = getCycleById(db, id);
    if (!saved) {
      throw new Error(`Game cycle disappeared after kernel trace merge: ${id}`);
    }
    return saved;
  });
}

export function cycleProjection(record: CycleRecord | null): CycleView | null {
  return record ? cycleView(record) : null;
}

export function activeCycleProjection(db: Database, gameId: string): CycleView | null {
  return cycleProjection(getActiveCycle(db, gameId));
}

export function bindCycleProcess(db: Database, cycleId: string, processState: CyclePatch["process_state_json"]): CycleRecord {
  return updateCycle(db, cycleId, { process_state_json: processState });
}

export function getCycleBySelector(db: Database, selector: { id?: string | null; cycleUuid?: string | null; gameId?: string | null }): CycleRecord | null {
  if (selector.id) {
    const byId = getCycleById(db, selector.id);
    if (byId) return byId;
  }
  if (selector.cycleUuid) {
    const byUuid = getCycleByUuid(db, selector.cycleUuid);
    if (byUuid) return byUuid;
  }
  if (selector.gameId) return getActiveCycle(db, selector.gameId);
  return null;
}

export function assertNoTopLevelSubphase(row: CycleRecord | Row): void {
  if ("active_subphase" in row || "subphase" in row) {
    throw new Error("Game cycle storage must not use a top-level canonical subphase");
  }
}

export function sqlBindings(values: SqlValue[]): SqlValue[] {
  return values;
}
