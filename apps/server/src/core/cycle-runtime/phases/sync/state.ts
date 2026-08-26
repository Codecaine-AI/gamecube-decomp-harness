import { createHash, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { immediateTransaction, now as currentTime, type StateStore } from "@server/core/orchestrator-state";
import {
  appendGameEvent,
  eventSpan,
  type AppendedGameEvent,
  type JsonObject,
} from "@server/core/harness-state/events.js";
import { getHarnessState } from "@server/core/harness-state/lease.js";
import { casSyncEnvelope } from "./cas.js";
import {
  SYNC_STATUSES,
  type RecordSyncRequestedInput,
  type SyncIntake,
  type SyncKnowledgeEventInput,
  type SyncObservationRefreshedPayload,
  type SyncPublication,
  type SyncPrReconciliation,
  type SyncStagingProgress,
  type SyncState,
  type SyncStatus,
  type SyncTransitionInput,
  type SyncWorkflowEventType,
} from "./types.js";

type SyncStateRow = {
  sync_id: string;
  game_id: string;
  cycle_uuid: string;
  revision: number;
  status: string;
  trace_id: string;
  caused_by_event_id: string;
  blockers_json: string;
  created_at: string;
  updated_at: string;
  latest_event_sequence: number;
  intake_json: string;
  staging_json: string | null;
  pr_reconciliation_json: string;
  publication_json: string | null;
  blocked_origin_status: string | null;
  validation_evidence_json: string | null;
  resolved_conflict_paths_json: string;
};

const TERMINAL_SYNC_STATUSES = new Set<SyncStatus>(["published", "cancelled"]);

const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<SyncStatus, readonly SyncStatus[]>> = {
  requested: ["ingesting", "cancelled"],
  ingesting: ["reconciling", "validating", "blocked", "cancelled"],
  reconciling: ["validating", "blocked", "cancelled"],
  validating: ["validated", "blocked", "cancelled"],
  validated: ["validating", "publishing", "blocked", "cancelled"],
  publishing: ["published", "blocked"],
  published: [],
  blocked: ["ingesting", "reconciling", "validating", "validated", "publishing", "cancelled"],
  cancelled: [],
};

export class StaleSyncRevisionError extends Error {
  readonly syncId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(syncId: string, expectedRevision: number, actualRevision: number) {
    super(`Stale sync revision ${expectedRevision} for ${syncId}; current revision is ${actualRevision}`);
    this.name = "StaleSyncRevisionError";
    this.syncId = syncId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON in sync_state`, { cause: error });
  }
}

function parseObject<T extends object>(value: string, label: string): T {
  const parsed = parseJson(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${label} JSON in sync_state: expected an object`);
  }
  return parsed as T;
}

function parseNullableObject<T extends object>(value: string | null, label: string): T | null {
  if (value === null) return null;
  return parseObject<T>(value, label);
}

function parseArray<T>(value: string, label: string): T[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) throw new Error(`Invalid ${label} JSON in sync_state: expected an array`);
  return parsed as T[];
}

function isSyncStatus(value: string): value is SyncStatus {
  return (SYNC_STATUSES as readonly string[]).includes(value);
}

function rowToSyncState(row: SyncStateRow): SyncState {
  if (!isSyncStatus(row.status)) throw new Error(`Invalid sync status in sync_state: ${row.status}`);
  return {
    sync_id: row.sync_id,
    game_id: row.game_id,
    cycle_uuid: row.cycle_uuid,
    revision: Number(row.revision),
    status: row.status,
    trace_id: row.trace_id,
    caused_by_event_id: row.caused_by_event_id,
    blockers: parseArray(row.blockers_json, "blockers"),
    created_at: row.created_at,
    updated_at: row.updated_at,
    latest_event_sequence: Number(row.latest_event_sequence),
    intake: parseObject<SyncIntake>(row.intake_json, "intake"),
    staging: parseNullableObject<SyncStagingProgress>(row.staging_json, "staging"),
    pr_reconciliation: parseArray<SyncPrReconciliation>(row.pr_reconciliation_json, "pr_reconciliation"),
    publication: parseNullableObject<SyncPublication>(row.publication_json, "publication"),
    blocked_origin_status: row.blocked_origin_status === null
      ? null
      : isSyncStatus(row.blocked_origin_status)
        ? row.blocked_origin_status
        : (() => { throw new Error(`Invalid blocked origin status in sync_state: ${row.blocked_origin_status}`); })(),
    validation_evidence: parseNullableObject<JsonObject>(row.validation_evidence_json, "validation_evidence"),
    resolved_conflict_paths: parseArray<string>(row.resolved_conflict_paths_json, "resolved_conflict_paths"),
  };
}

function selectSync(db: Database, syncId: string): SyncStateRow | null {
  return (db.query("SELECT * FROM sync_state WHERE sync_id = ?").get(syncId) as SyncStateRow | null) ?? null;
}

export function getSyncState(store: StateStore, syncId: string): SyncState | null {
  const row = selectSync(store.db, syncId);
  return row ? rowToSyncState(row) : null;
}

export function getNonTerminalSyncForGame(store: StateStore, gameId: string): SyncState | null {
  const rows = store.db
    .query(
      `SELECT * FROM sync_state
       WHERE game_id = ? AND status NOT IN ('published', 'cancelled')
       ORDER BY created_at DESC LIMIT 2`,
    )
    .all(gameId) as SyncStateRow[];
  if (rows.length > 1) throw new Error(`Game ${gameId} has multiple non-terminal syncs`);
  return rows[0] ? rowToSyncState(rows[0]) : null;
}

export function isTerminalSyncStatus(status: SyncStatus): boolean {
  return TERMINAL_SYNC_STATUSES.has(status);
}

export function isSyncStatusTransitionAllowed(current: SyncStatus, next: SyncStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[current].includes(next);
}

export function assertSyncStatusTransition(current: SyncStatus, next: SyncStatus): void {
  if (!isSyncStatusTransitionAllowed(current, next)) {
    throw new Error(`Invalid sync status transition ${current} -> ${next}`);
  }
}

export function eventTypeForSyncStatus(status: SyncStatus): SyncWorkflowEventType {
  switch (status) {
    case "requested": return "sync.requested";
    case "published": return "sync.published";
    case "cancelled": return "sync.cancelled";
    default: return `sync.${status}`;
  }
}

/** Deterministic root span shared by all events caused by one action command. */
export function syncActionSpanId(commandId: string): string {
  const digest = createHash("sha256").update(requiredText(commandId, "commandId")).digest("hex");
  return `span-${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function assertEventMatchesTransition(
  current: SyncStatus,
  next: SyncStatus,
  eventType: SyncWorkflowEventType,
): void {
  if (eventType === "sync.observation_refreshed") {
    if (current !== "requested" || next !== "requested") {
      throw new Error(`sync.observation_refreshed cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "sync.staging_progressed") {
    if (current !== next) throw new Error(`sync.staging_progressed cannot record ${current} -> ${next}`);
    return;
  }
  if (eventType === "sync.recovered") {
    const confirmedOrphanIngest = current === "ingesting" && next === "ingesting";
    if (!confirmedOrphanIngest && (current !== "blocked" || next === "blocked" || next === "published")) {
      throw new Error(`sync.recovered cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "sync.reconciliation_blocked") {
    if (current !== "reconciling" || next !== "blocked") {
      throw new Error(`sync.reconciliation_blocked cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "sync.boundary_published") {
    if (current !== "publishing" || next !== "publishing") {
      throw new Error(`sync.boundary_published cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "sync.published") {
    if (current !== "publishing" || next !== "published") {
      throw new Error(`sync.published cannot record ${current} -> ${next}`);
    }
    return;
  }
  const expected = eventTypeForSyncStatus(next);
  if (eventType !== expected) {
    throw new Error(`Event ${eventType} cannot produce sync status ${next}; expected ${expected}`);
  }
  if (current === next) throw new Error(`${eventType} is valid only on entry to ${next}`);
}

function stringifyNullable(value: object | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function progressKind(input: SyncTransitionInput): string {
  if (typeof input.payload?.progress_kind === "string" && input.payload.progress_kind.trim()) {
    return input.payload.progress_kind;
  }
  if (input.patch.staging !== undefined) return "staging_updated";
  if (input.patch.prReconciliation !== undefined) return "pr_reconciliation_updated";
  if (input.patch.intake !== undefined) return "observation_refreshed";
  if (input.patch.publication !== undefined) return "publication_updated";
  return "workflow_progressed";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => requiredText(value, "event payload text")))];
}

function blockerRecoveryChoices(blockers: SyncState["blockers"]): string[] {
  return uniqueStrings(blockers.flatMap((blocker) => {
    if (!blocker.recoverable) return [];
    if (blocker.code === "conflict_needs_operator") return ["resolve_conflict"];
    if (blocker.code === "upstream_moved_after_validation") return ["resume", "cancel"];
    if (blocker.code.startsWith("publication_") || blocker.code === "pr_push_failed") return ["resume"];
    return ["resume", "discard"];
  }));
}

function blockerSourceIdentities(
  blockers: SyncState["blockers"],
): Array<{ source_kind: string; source_id: string }> {
  const identities = new Map<string, { source_kind: string; source_id: string }>();
  for (const blocker of blockers) {
    const sourceKind = requiredText(blocker.source_kind, "blocker source_kind");
    const sourceId = requiredText(blocker.source_id, "blocker source_id");
    identities.set(JSON.stringify([sourceKind, sourceId]), {
      source_kind: sourceKind,
      source_id: sourceId,
    });
  }
  return [...identities.values()];
}

function blockerPayload(blockers: SyncState["blockers"]): JsonObject {
  return {
    blocker_codes: uniqueStrings(blockers.map((blocker) => blocker.code)),
    source_identities: blockerSourceIdentities(blockers),
    recovery_choices: blockerRecoveryChoices(blockers),
  };
}

function durableStagingStage(sync: SyncState): string {
  const staging = sync.staging;
  if (!staging) throw new Error("sync.staging_progressed requires accepted staging state");
  if (staging.last_durable_stage) return staging.last_durable_stage;
  if (staging.validation_evidence) return "validated";
  if (sync.pr_reconciliation.length > 0 || (staging.pr_workspaces?.length ?? 0) > 0) {
    return "pr_series_reconciled";
  }
  if (staging.epochs_total > 0 && staging.epochs_applied >= staging.epochs_total) return "cycle_rebased";
  return "workspace_created";
}

function prSeriesReconciliationSummary(sync: SyncState): JsonObject {
  const count = (result: SyncPrReconciliation["result"]): number =>
    sync.pr_reconciliation.filter((entry) => entry.result === result).length;
  return {
    series_total: sync.pr_reconciliation.length,
    clean: count("clean"),
    auto_resolved: count("auto_resolved"),
    needs_operator: count("needs_operator"),
    pushed: sync.pr_reconciliation.filter((entry) => entry.pushed).length,
  };
}

function acceptedCycleHead(db: Database, sync: SyncState): string {
  const cycle = db
    .query("SELECT head_revision FROM cycles WHERE cycle_uuid = ?")
    .get(sync.cycle_uuid) as { head_revision: string | null } | null;
  if (!cycle) throw new Error(`Game cycle not found: ${sync.cycle_uuid}`);
  return requiredText(cycle.head_revision ?? "", `cycle ${sync.cycle_uuid} head_revision`);
}

function canonicalSyncEventPayload(
  db: Database,
  current: SyncState,
  next: SyncState,
  eventType: SyncWorkflowEventType,
  input: SyncTransitionInput,
): JsonObject {
  const supplied = input.payload ?? {};
  const transition = { from_status: current.status, to_status: next.status };
  if (eventType === "sync.observation_refreshed") {
    return {
      prior_upstream_revision: current.intake.upstream_to,
      observed_upstream_revision: next.intake.upstream_to,
      merged_pr_ids: next.intake.merged_pr_ids,
      corpus_batch_ids: next.intake.corpus_batch_ids,
      knowledge_only: next.intake.knowledge_only,
      observation_source_identity: requiredText(
        String(supplied.observation_source_identity ?? ""),
        "observation_source_identity",
      ),
      state_revision: current.revision + 1,
    };
  }
  if (eventType === "sync.staging_progressed") {
    const staging = next.staging;
    if (!staging) throw new Error("sync.staging_progressed requires accepted staging state");
    return {
      staging_workspace_id: requiredText(staging.workspace_id, "staging.workspace_id"),
      durable_stage: durableStagingStage(next),
      epochs_total: staging.epochs_total,
      epochs_applied: staging.epochs_applied,
      minor_conflicts_resolved: staging.minor_conflicts_resolved,
      conflicts_awaiting_operator: staging.conflicts_awaiting_operator,
      pr_series_reconciliation_summary: prSeriesReconciliationSummary(next),
      state_revision: current.revision + 1,
      progress_kind: progressKind(input),
    };
  }
  if (eventType === "sync.reconciliation_blocked") {
    const durableIdentities = next.staging?.conflicting_paths ?? [];
    const conflictIdentities = durableIdentities.length > 0
      ? stringArray(durableIdentities, "staging.conflicting_paths")
      : stringArray(supplied.conflict_identities, "conflict_identities");
    return {
      ...transition,
      conflict_identities: conflictIdentities,
      conflicts_awaiting_operator: next.staging?.conflicts_awaiting_operator ?? 0,
    };
  }
  if (eventType === "sync.cancelled") {
    const untouchedCycleHead = acceptedCycleHead(db, current);
    if (input.eventType !== "sync.recovered") {
      if (supplied.untouched_cycle_head !== untouchedCycleHead) {
        throw new Error(`sync.cancelled untouched_cycle_head does not match cycle ${current.cycle_uuid}`);
      }
      if (supplied.discarded_staging_workspace_id !== (current.staging?.workspace_id ?? null)) {
        throw new Error("sync.cancelled discarded workspace must match current staging state");
      }
    }
    return {
      ...transition,
      discarded_staging_workspace_id: current.staging?.workspace_id ?? null,
      untouched_cycle_head: untouchedCycleHead,
      untouched_submodule_heads: supplied.untouched_submodule_heads as JsonObject[],
    };
  }
  if (eventType === "sync.boundary_published") {
    if (!next.publication) throw new Error("sync.boundary_published requires publication state");
    if (!next.validation_evidence) throw new Error("sync.boundary_published requires durable validation evidence");
    return {
      upstream_revision: next.intake.upstream_to,
      knowledge_revision: next.publication.knowledge_revision,
      invalidations: next.publication.invalidated_ids,
      validation_evidence: next.validation_evidence,
    };
  }
  if (eventType === "sync.recovered") {
    return {
      ...transition,
      staging_preserved: supplied.staging_preserved as boolean,
      staging_discarded: supplied.staging_discarded as boolean,
      resume_stage: supplied.resume_stage as string,
      recovery_reason: requiredText(String(supplied.recovery_reason ?? ""), "recovery_reason"),
    };
  }
  if (eventType === "sync.validated") {
    if (!next.validation_evidence) throw new Error("sync.validated requires durable validation evidence");
    return { ...transition, validation_evidence: next.validation_evidence };
  }
  if (eventType === "sync.blocked") return { ...transition, ...blockerPayload(next.blockers) };
  if (
    eventType === "sync.ingesting" ||
    eventType === "sync.reconciling" ||
    eventType === "sync.validating" ||
    eventType === "sync.publishing" ||
    eventType === "sync.published"
  ) {
    return transition;
  }
  throw new Error(`Event ${eventType} has no transition payload builder`);
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

function resolvedPathsFromStaging(staging: SyncStagingProgress | null): string[] {
  if (!staging) return [];
  const paths = new Set(staging.auto_resolved_paths ?? []);
  for (const workspace of staging.pr_workspaces ?? []) {
    for (const path of workspace.auto_resolved_paths ?? []) paths.add(`${workspace.branch}:${path}`);
  }
  return [...paths];
}

function payloadObject(payload: JsonObject | undefined, eventType: string): JsonObject {
  if (!payload) throw new Error(`Event ${eventType} requires a payload`);
  return payload;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be an array of nonblank strings`);
  }
  return value as string[];
}

function assertSubmodulePointers(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const paths = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} entries must be objects`);
    const pointer = raw as Record<string, unknown>;
    const path = requiredText(String(pointer.path ?? ""), `${label}.path`);
    requiredText(String(pointer.gitlink_head ?? ""), `${label}.gitlink_head`);
    requiredText(String(pointer.checked_out_head ?? ""), `${label}.checked_out_head`);
    if (paths.has(path)) throw new Error(`${label} contains duplicate path ${path}`);
    paths.add(path);
  }
}

function assertSemanticEventPayload(
  db: Database,
  current: SyncState,
  next: SyncState,
  eventType: SyncWorkflowEventType,
  payload: JsonObject | undefined,
): void {
  if (eventType === "sync.observation_refreshed") {
    const value = payloadObject(payload, eventType);
    if (value.prior_upstream_revision !== current.intake.upstream_to) {
      throw new Error("sync.observation_refreshed prior revision must match durable intake");
    }
    if (value.observed_upstream_revision !== next.intake.upstream_to) {
      throw new Error("sync.observation_refreshed observed revision must match accepted intake");
    }
    if (canonicalJson(value.merged_pr_ids) !== canonicalJson(next.intake.merged_pr_ids)) {
      throw new Error("sync.observation_refreshed merged PR ids must match accepted intake");
    }
    if (canonicalJson(value.corpus_batch_ids) !== canonicalJson(next.intake.corpus_batch_ids)) {
      throw new Error("sync.observation_refreshed corpus batch ids must match accepted intake");
    }
    if (value.knowledge_only !== next.intake.knowledge_only) {
      throw new Error("sync.observation_refreshed knowledge-only flag must match accepted intake");
    }
    requiredText(String(value.observation_source_identity ?? ""), "observation_source_identity");
    if (value.state_revision !== current.revision + 1) {
      throw new Error("sync.observation_refreshed state revision must equal the next accepted revision");
    }
    return;
  }
  if (eventType === "sync.staging_progressed") {
    const value = payloadObject(payload, eventType);
    const staging = next.staging;
    if (!staging) throw new Error("sync.staging_progressed requires accepted staging state");
    if (value.staging_workspace_id !== staging.workspace_id) {
      throw new Error("sync.staging_progressed workspace must match accepted staging state");
    }
    if (value.durable_stage !== durableStagingStage(next)) {
      throw new Error("sync.staging_progressed durable stage must match accepted staging state");
    }
    for (const [field, accepted] of [
      ["epochs_total", staging.epochs_total],
      ["epochs_applied", staging.epochs_applied],
      ["minor_conflicts_resolved", staging.minor_conflicts_resolved],
      ["conflicts_awaiting_operator", staging.conflicts_awaiting_operator],
      ["state_revision", current.revision + 1],
    ] as const) {
      if (!Number.isInteger(value[field]) || value[field] !== accepted) {
        throw new Error(`sync.staging_progressed ${field} must match accepted staging state`);
      }
    }
    if (canonicalJson(value.pr_series_reconciliation_summary) !== canonicalJson(prSeriesReconciliationSummary(next))) {
      throw new Error("sync.staging_progressed PR-series summary must match accepted reconciliation state");
    }
    requiredText(String(value.progress_kind ?? ""), "progress_kind");
    return;
  }
  if (eventType === "sync.blocked") {
    const value = payloadObject(payload, eventType);
    const accepted = blockerPayload(next.blockers);
    if (canonicalJson(value.blocker_codes) !== canonicalJson(accepted.blocker_codes)) {
      throw new Error("sync.blocked blocker codes must match accepted blockers");
    }
    if (canonicalJson(value.source_identities) !== canonicalJson(accepted.source_identities)) {
      throw new Error("sync.blocked source identities must match accepted blockers");
    }
    if (canonicalJson(value.recovery_choices) !== canonicalJson(accepted.recovery_choices)) {
      throw new Error("sync.blocked recovery choices must match accepted blockers");
    }
    return;
  }
  if (eventType === "sync.reconciliation_blocked") {
    const value = payloadObject(payload, eventType);
    const identities = stringArray(value.conflict_identities, "conflict_identities");
    if (identities.length === 0) throw new Error("sync.reconciliation_blocked requires conflict identities");
    if (!Number.isInteger(value.conflicts_awaiting_operator) || Number(value.conflicts_awaiting_operator) < 1) {
      throw new Error("sync.reconciliation_blocked requires a positive conflicts_awaiting_operator count");
    }
    if (next.staging?.conflicts_awaiting_operator !== value.conflicts_awaiting_operator) {
      throw new Error("sync.reconciliation_blocked conflict count must match staging state");
    }
    return;
  }
  if (eventType === "sync.recovered") {
    const value = payloadObject(payload, eventType);
    if (current.status === "ingesting" && next.status === "ingesting") {
      if (
        value.recovery_path !== "confirmed_orphan" ||
        value.process_liveness !== "not_live" ||
        value.lease_staleness !== "stale" ||
        value.resume_stage !== "ingesting" ||
        value.staging_preserved !== true ||
        value.staging_discarded !== false
      ) {
        throw new Error("Confirmed orphan ingest recovery requires stale-lease and not-live process evidence");
      }
      requiredText(String(value.recovery_reason ?? ""), "recovery_reason");
      if (canonicalJson(next.staging) !== canonicalJson(current.staging)) {
        throw new Error("Confirmed orphan ingest recovery cannot replace staging state");
      }
      return;
    }
    if (typeof value.staging_preserved !== "boolean" || typeof value.staging_discarded !== "boolean") {
      throw new Error("sync.recovered requires staging_preserved and staging_discarded booleans");
    }
    if (value.staging_preserved === value.staging_discarded) {
      throw new Error("sync.recovered must preserve or discard staging, but not both");
    }
    requiredText(String(value.recovery_reason ?? ""), "recovery_reason");
    if (value.staging_discarded) {
      if (next.status !== "cancelled" || value.resume_stage !== null || next.staging !== null) {
        throw new Error("Discarded sync recovery must cancel with a null resume_stage");
      }
      assertSubmodulePointers(value.untouched_submodule_heads, "untouched_submodule_heads");
    } else {
      if (value.resume_stage !== next.status) {
        throw new Error(`Preserved sync recovery resume_stage must equal ${next.status}`);
      }
      if (canonicalJson(next.staging) !== canonicalJson(current.staging)) {
        throw new Error("Preserved sync recovery cannot replace staging state");
      }
    }
    return;
  }
  if (eventType === "sync.cancelled") {
    const value = payloadObject(payload, eventType);
    if (value.discarded_staging_workspace_id !== null) {
      requiredText(String(value.discarded_staging_workspace_id ?? ""), "discarded_staging_workspace_id");
    }
    if (value.discarded_staging_workspace_id !== (current.staging?.workspace_id ?? null)) {
      throw new Error("sync.cancelled discarded workspace must match current staging state");
    }
    const untouchedHead = requiredText(String(value.untouched_cycle_head ?? ""), "untouched_cycle_head");
    assertSubmodulePointers(value.untouched_submodule_heads, "untouched_submodule_heads");
    const cycle = db
      .query("SELECT head_revision FROM cycles WHERE cycle_uuid = ?")
      .get(current.cycle_uuid) as { head_revision: string | null } | null;
    if (!cycle) throw new Error(`Game cycle not found: ${current.cycle_uuid}`);
    if (cycle.head_revision !== untouchedHead) {
      throw new Error(`sync.cancelled untouched_cycle_head does not match cycle ${current.cycle_uuid}`);
    }
    return;
  }
  if (eventType === "sync.boundary_published") {
    const value = payloadObject(payload, eventType);
    requiredText(String(value.upstream_revision ?? ""), "upstream_revision");
    requiredText(String(value.knowledge_revision ?? ""), "knowledge_revision");
    stringArray(value.invalidations, "invalidations");
    if (!value.validation_evidence || typeof value.validation_evidence !== "object" || Array.isArray(value.validation_evidence)) {
      throw new Error("sync.boundary_published requires validation_evidence");
    }
    if (!next.publication) throw new Error("sync.boundary_published requires publication state");
    if (value.upstream_revision !== next.intake.upstream_to) {
      throw new Error("sync.boundary_published upstream revision must match intake");
    }
    if (value.knowledge_revision !== next.publication.knowledge_revision) {
      throw new Error("sync.boundary_published knowledge revision must match publication state");
    }
    if (canonicalJson(value.invalidations) !== canonicalJson(next.publication.invalidated_ids)) {
      throw new Error("sync.boundary_published invalidations must match publication state");
    }
    if (canonicalJson(value.validation_evidence) !== canonicalJson(next.validation_evidence)) {
      throw new Error("sync.boundary_published validation evidence must match durable validation state");
    }
    if (current.publication !== null) {
      throw new Error("sync.boundary_published cannot replace an existing publication state");
    }
    return;
  }
  if (eventType === "sync.published") {
    if (!current.publication || canonicalJson(next.publication) !== canonicalJson(current.publication)) {
      throw new Error("sync.published requires the durable publication state from sync.boundary_published");
    }
    if (next.pr_reconciliation.some((entry) => !entry.pushed)) {
      throw new Error("sync.published requires every reconciled PR series push to be complete");
    }
    const pushRows = db
      .query("SELECT series_id, branch, status FROM sync_push_records WHERE sync_id = ? ORDER BY series_id")
      .all(current.sync_id) as Array<{ series_id: string; branch: string; status: string }>;
    if (pushRows.length !== next.pr_reconciliation.length) {
      throw new Error("sync.published requires one durable push record per reconciled PR series");
    }
    const pushesBySeries = new Map(pushRows.map((row) => [row.series_id, row]));
    for (const reconciliation of next.pr_reconciliation) {
      const push = pushesBySeries.get(reconciliation.series_id);
      if (!push || push.branch !== reconciliation.branch || push.status !== "pushed") {
        throw new Error(`sync.published requires a durable pushed record for ${reconciliation.series_id}`);
      }
    }
  }
}

function assertStateInvariants(current: SyncState, next: SyncState, eventType: SyncWorkflowEventType): void {
  if (
    current.status !== "requested" &&
    canonicalJson(next.intake) !== canonicalJson(current.intake)
  ) {
    // A stale validated candidate extending onto a newly observed upstream
    // tip may retarget exactly intake.upstream_to, only while reconciling,
    // and only to the tip durably recorded as staging.observed_upstream.
    const onlyUpstreamToChanged = canonicalJson({ ...next.intake, upstream_to: current.intake.upstream_to }) ===
      canonicalJson(current.intake);
    const staleCandidateExtension = onlyUpstreamToChanged &&
      current.status === "reconciling" &&
      next.status === "reconciling" &&
      next.intake.upstream_to === next.staging?.observed_upstream;
    if (!staleCandidateExtension) {
      throw new Error(`Sync ${current.sync_id} intake is immutable after start`);
    }
  }
  if (next.intake.knowledge_only) {
    if (next.staging !== null) throw new Error(`Knowledge-only sync ${current.sync_id} cannot have staging`);
    if (next.pr_reconciliation.length > 0) {
      throw new Error(`Knowledge-only sync ${current.sync_id} cannot reconcile PR branches`);
    }
    if (current.status === "ingesting" && next.status === "reconciling") {
      throw new Error(`Knowledge-only sync ${current.sync_id} must skip reconciliation`);
    }
  } else {
    if (current.status === "ingesting" && next.status === "validating") {
      throw new Error(`Source-moving sync ${current.sync_id} must reconcile before validation`);
    }
    if (["reconciling", "validating", "validated", "publishing", "published"].includes(next.status) && !next.staging) {
      throw new Error(`Source-moving sync ${current.sync_id} requires staging while ${next.status}`);
    }
  }
  if (next.status === "cancelled" && next.staging !== null) {
    throw new Error(`Cancelled sync ${current.sync_id} must discard staging state`);
  }
  if (next.status === "blocked" && current.staging && next.staging?.workspace_id !== current.staging.workspace_id) {
    throw new Error(`Blocked sync ${current.sync_id} must preserve its staging workspace`);
  }
  if (!["publishing", "blocked", "published"].includes(next.status) && next.publication !== null) {
    throw new Error(`Sync ${current.sync_id} publication is valid only after publishing starts`);
  }
  if (
    current.publication === null &&
    next.publication !== null &&
    eventType !== "sync.boundary_published"
  ) {
    throw new Error(`Sync ${current.sync_id} publication must begin with sync.boundary_published`);
  }
  if (current.publication !== null && canonicalJson(next.publication) !== canonicalJson(current.publication)) {
    throw new Error(`Sync ${current.sync_id} publication is immutable after sync.boundary_published`);
  }
  if (next.status === "published") {
    if (!next.publication) throw new Error(`Published sync ${current.sync_id} requires a publication record`);
    if (next.publication.knowledge_revision.trim() === "") {
      throw new Error(`Published sync ${current.sync_id} requires a knowledge revision`);
    }
    if (next.intake.knowledge_only) {
      if (next.publication.remote_application_id !== undefined) {
        throw new Error(`Knowledge-only sync ${current.sync_id} cannot publish a remote application`);
      }
      if (next.publication.prior_head !== next.publication.new_head) {
        throw new Error(`Knowledge-only sync ${current.sync_id} cannot advance the source head`);
      }
    } else if (!next.publication.remote_application_id?.trim()) {
      throw new Error(`Source-moving sync ${current.sync_id} requires a remote application id`);
    }
  }
  if (current.status === "blocked" && next.status !== "blocked") {
    if (next.blockers.length > 0) throw new Error(`Sync ${current.sync_id} must clear blockers before resuming`);
    if (
      eventType !== "sync.recovered" &&
      eventType !== "sync.cancelled" &&
      !(next.status === "reconciling" && eventType === "sync.reconciling")
    ) {
      throw new Error(`Blocked sync ${current.sync_id} must resume through sync.recovered`);
    }
  }
}

export function getSyncBlockedOriginStatus(db: Database, sync: SyncState): SyncStatus | null {
  void db;
  if (sync.status !== "blocked") return null;
  if (!sync.blocked_origin_status) throw new Error(`Sync ${sync.sync_id} has no durable blocked origin`);
  return sync.blocked_origin_status;
}

export function transitionSync(store: StateStore, syncId: string, input: SyncTransitionInput): SyncState {
  return immediateTransaction(store.db, () => {
    const currentRow = selectSync(store.db, syncId);
    if (!currentRow) throw new Error(`Sync not found: ${syncId}`);
    const current = rowToSyncState(currentRow);
    if (input.correlationId !== syncId) throw new Error(`Sync event correlation_id must equal sync id ${syncId}`);
    if (current.revision !== input.expectedRevision) {
      throw new StaleSyncRevisionError(syncId, input.expectedRevision, current.revision);
    }
    if (isTerminalSyncStatus(current.status)) {
      throw new Error(`Sync ${syncId} is terminal in ${current.status}`);
    }
    const nextStatus = input.patch.status ?? current.status;
    // Observation may refresh a still-requested envelope and a queued request
    // may be cancelled before acquisition. Starting and every mutation after
    // start are fenced by the active sync lease in this same transaction.
    if (nextStatus === "ingesting" || current.status !== "requested") {
      const lease = getHarnessState(store, current.game_id)?.active_workflow;
      if (
        !lease ||
        lease.kind !== "sync" ||
        lease.workflow_id !== current.sync_id ||
        lease.status !== "active"
      ) {
        throw new Error(`Sync ${syncId} requires its matching active dispatch lease`);
      }
    }
    if (nextStatus !== current.status) assertSyncStatusTransition(current.status, nextStatus);
    const blockedOrigin = getSyncBlockedOriginStatus(store.db, current);
    if (current.status === "blocked" && nextStatus === "cancelled" && blockedOrigin === "publishing") {
      throw new Error(`Sync ${syncId} cannot be cancelled after publishing has started`);
    }
    const requestedEventType = input.eventType ?? (
      nextStatus === current.status
        ? current.status === "requested" && input.patch.intake !== undefined
          ? "sync.observation_refreshed"
          : "sync.staging_progressed"
        : eventTypeForSyncStatus(nextStatus)
    );
    const eventType = nextStatus === "cancelled" && requestedEventType === "sync.recovered"
      ? "sync.cancelled"
      : requestedEventType;
    assertEventMatchesTransition(current.status, nextStatus, eventType);
    if (
      current.status === "requested" && nextStatus === "ingesting" &&
      input.actor !== "operator" && !(input.actor === "guardian" && input.causationId?.startsWith("event-"))
    ) {
      throw new Error(`Sync ${syncId} can start only through an operator action or its guardian-settled handoff`);
    }
    if (
      (eventType === "sync.cancelled" ||
        eventType === "sync.recovered" ||
        (current.status === "validated" && nextStatus === "publishing") ||
        (current.status === "blocked" && nextStatus === "reconciling" && eventType === "sync.reconciling")) &&
      input.actor !== "operator"
    ) {
      throw new Error(`Event ${eventType} is operator-only`);
    }
    const nextBlockers = input.patch.blockers ?? current.blockers;
    if (nextStatus === "blocked" && nextBlockers.length === 0) {
      throw new Error(`Sync ${syncId} cannot enter blocked without a blocker`);
    }
    const nextStaging = input.patch.staging === undefined ? current.staging : input.patch.staging;
    const next: SyncState = {
      ...current,
      status: nextStatus,
      blockers: nextBlockers,
      intake: input.patch.intake ?? current.intake,
      staging: nextStaging,
      pr_reconciliation: input.patch.prReconciliation ?? current.pr_reconciliation,
      publication: input.patch.publication === undefined ? current.publication : input.patch.publication,
      blocked_origin_status: nextStatus === "blocked"
        ? current.status === "blocked" ? current.blocked_origin_status : current.status
        : null,
      validation_evidence: input.patch.validationEvidence === undefined
        ? input.payload?.validation_evidence && typeof input.payload.validation_evidence === "object" &&
            !Array.isArray(input.payload.validation_evidence)
          ? input.payload.validation_evidence as JsonObject
          : current.validation_evidence
        : input.patch.validationEvidence,
      resolved_conflict_paths: [...new Set([
        ...current.resolved_conflict_paths,
        ...(input.patch.resolvedConflictPaths ?? []),
        ...resolvedPathsFromStaging(nextStaging),
      ])].sort(),
    };
    assertIntake(next.intake);
    if (
      eventType === "sync.recovered" &&
      next.status !== "cancelled" &&
      !(current.status === "ingesting" && next.status === "ingesting")
    ) {
      // Extending a stale validated candidate onto a newly observed upstream
      // tip legitimately steps one stage back: staging must re-reconcile
      // before validation re-runs.
      const staleCandidateExtension = blockedOrigin === "validated" &&
        current.blockers.some((blocker) => blocker.code === "upstream_moved_after_validation") &&
        (next.status === "reconciling" || next.status === "validating");
      // A sync blocked out of validating with nothing durable staged can only
      // restart at reconciling, where staging is re-derived from scratch.
      const bareStagingRestart = blockedOrigin === "validating" &&
        !current.staging &&
        next.status === "reconciling";
      const allowedRecoveryStatus = blockedOrigin === "validated" && next.status === "validating"
        ? "validating"
        : blockedOrigin;
      if (!staleCandidateExtension && !bareStagingRestart && next.status !== allowedRecoveryStatus) {
        throw new Error(
          `Sync ${syncId} must recover to its last durable stage ${blockedOrigin ?? "unknown"}, not ${next.status}`,
        );
      }
    }
    assertStateInvariants(current, next, eventType);
    if (requestedEventType === "sync.recovered") {
      assertSemanticEventPayload(store.db, current, next, requestedEventType, input.payload);
    }
    const eventPayload = canonicalSyncEventPayload(store.db, current, next, eventType, input);
    if (eventType !== "sync.recovered") {
      assertSemanticEventPayload(store.db, current, next, eventType, eventPayload);
    }

    const at = input.occurredAt ?? currentTime();
    const event = appendGameEvent(store.db, {
      eventType,
      gameId: current.game_id,
      subjectKind: "sync_workflow",
      subjectId: syncId,
      correlationId: requiredText(input.correlationId, "correlationId"),
      causationId: requiredText(input.causationId ?? input.commandId, "causationId"),
      traceId: current.trace_id,
      ...eventSpan(input.parentSpanId ?? input.spanId ?? syncActionSpanId(input.commandId)),
      actor: input.actor,
      occurredAt: at,
      payload: eventPayload,
    });
    const accepted = casSyncEnvelope(store.db, {
      blockersJson: JSON.stringify(nextBlockers),
      blockedOriginStatus: next.blocked_origin_status,
      eventId: event.eventId,
      eventSequence: event.sequence,
      expectedRevision: current.revision,
      intakeJson: JSON.stringify(next.intake),
      prReconciliationJson: JSON.stringify(next.pr_reconciliation),
      publicationJson: stringifyNullable(next.publication),
      stagingJson: stringifyNullable(next.staging),
      status: nextStatus,
      syncId,
      updatedAt: at,
      validationEvidenceJson: stringifyNullable(next.validation_evidence),
      resolvedConflictPathsJson: JSON.stringify(next.resolved_conflict_paths),
    });
    if (!accepted) {
      throw new StaleSyncRevisionError(syncId, current.revision, getSyncState(store, syncId)?.revision ?? -1);
    }
    const saved = selectSync(store.db, syncId);
    if (!saved) throw new Error(`Sync disappeared after transition: ${syncId}`);
    return rowToSyncState(saved);
  });
}

function assertIntake(intake: SyncIntake): void {
  requiredText(intake.upstream_from, "intake.upstream_from");
  requiredText(intake.upstream_to, "intake.upstream_to");
  stringArray(intake.merged_pr_ids, "intake.merged_pr_ids");
  stringArray(intake.corpus_batch_ids, "intake.corpus_batch_ids");
  if (typeof intake.knowledge_only !== "boolean") throw new Error("intake.knowledge_only must be boolean");
  const knowledgeOnly = intake.upstream_from === intake.upstream_to;
  if (intake.knowledge_only !== knowledgeOnly) {
    throw new Error("intake.knowledge_only must be true exactly when upstream_from equals upstream_to");
  }
}

function assertOwningCycle(db: Database, gameId: string, cycleUuid: string): void {
  const row = db
    .query("SELECT game_id, status, head_revision FROM cycles WHERE cycle_uuid = ?")
    .get(cycleUuid) as { game_id: string; status: string; head_revision: string | null } | null;
  if (!row) throw new Error(`Game cycle not found: ${cycleUuid}`);
  if (row.game_id !== gameId) {
    throw new Error(`Game cycle ${cycleUuid} does not belong to ${gameId}`);
  }
  if (!["active", "blocked"].includes(row.status)) {
    throw new Error(`Game cycle ${cycleUuid} cannot accept a sync request while ${row.status}`);
  }
  if (!row.head_revision?.trim()) {
    throw new Error(`Game cycle ${cycleUuid} has no canonical head for a sync request`);
  }
}

/** Appends a typed knowledge-stage fact inside the caller's state transaction. */
export function appendSyncKnowledgeEventInTransaction(
  db: Database,
  input: SyncKnowledgeEventInput,
): AppendedGameEvent {
  if (!db.inTransaction) throw new Error(`${input.eventType} must be appended inside a state transaction`);
  requiredText(input.gameId, "gameId");
  requiredText(input.subjectId, "subjectId");
  requiredText(input.causationId, "causationId");
  requiredText(input.correlationId, "correlationId");
  requiredText(input.traceId, "traceId");
  requiredText(input.spanId, "spanId");
  if (input.eventType === "knowledge.job_enqueued") {
    if (!input.payload.provenance || typeof input.payload.provenance !== "object") {
      throw new Error("knowledge.job_enqueued requires provenance");
    }
    requiredText(input.payload.source_class, "source_class");
    if (input.payload.execution_class !== "sync_stage" && input.payload.execution_class !== "background_safe") {
      throw new Error("knowledge.job_enqueued requires execution_class sync_stage or background_safe");
    }
  } else if (input.eventType === "knowledge.revision_advanced") {
    requiredText(input.payload.old_revision, "old_revision");
    requiredText(input.payload.new_revision, "new_revision");
    stringArray(input.payload.accepted_job_ids, "accepted_job_ids");
  } else {
    requiredText(input.payload.source_class, "source_class");
    if (!input.payload.provenance || typeof input.payload.provenance !== "object" || Array.isArray(input.payload.provenance)) {
      throw new Error(`${input.eventType} requires provenance`);
    }
    if (input.payload.execution_class === "sync_stage") {
      requiredText(input.payload.sync_id, "sync_id");
    } else if (input.payload.execution_class === "background_safe") {
      if (input.payload.sync_id !== null) {
        throw new Error(`${input.eventType} requires sync_id null for background_safe execution`);
      }
    } else {
      throw new Error(`${input.eventType} requires execution_class sync_stage or background_safe`);
    }
    requiredText(input.payload.source_id, "source_id");
    requiredText(input.payload.source_kind, "source_kind");
    if (input.eventType === "knowledge.job_processing") {
      if (!(["queued", "waiting"] as const).includes(input.payload.from_status)) {
        throw new Error("knowledge.job_processing requires queued or waiting from_status");
      }
      if (input.payload.to_status !== "processing") {
        throw new Error("knowledge.job_processing requires processing to_status");
      }
    } else if (input.eventType === "knowledge.job_waiting") {
      if (
        !(["processing", "succeeded", "failed"] as const).includes(input.payload.from_status) ||
        input.payload.to_status !== "waiting"
      ) {
        throw new Error("knowledge.job_waiting requires processing, succeeded, or failed -> waiting");
      }
      requiredText(input.payload.reason, "reason");
    } else if (input.eventType === "knowledge.job_succeeded") {
      if (input.payload.from_status !== "processing" || input.payload.to_status !== "succeeded") {
        throw new Error("knowledge.job_succeeded requires processing -> succeeded");
      }
      requiredText(input.payload.staged_digest, "staged_digest");
    } else if (input.eventType === "knowledge.job_cancelled") {
      if (
        !(["queued", "processing", "waiting", "succeeded", "failed"] as const)
          .includes(input.payload.from_status) ||
        input.payload.to_status !== "cancelled"
      ) {
        throw new Error("knowledge.job_cancelled requires a non-cancelled from_status -> cancelled");
      }
      requiredText(input.payload.reason, "reason");
    } else {
      if (input.payload.from_status !== "processing" || input.payload.to_status !== "failed") {
        throw new Error("knowledge.job_failed requires processing -> failed");
      }
      requiredText(input.payload.error, "error");
    }
  }
  return appendGameEvent(db, {
    eventType: input.eventType,
    gameId: input.gameId,
    subjectKind: input.eventType === "knowledge.revision_advanced" ? "game_knowledge" : "knowledge_job",
    subjectId: input.subjectId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    traceId: input.traceId,
    ...eventSpan(input.parentSpanId ?? input.spanId),
    actor: input.actor,
    occurredAt: input.occurredAt,
    payload: input.payload,
  });
}

type SyncDiscordEventInput = {
  syncId: string;
  commandId: string;
  actor?: "operator" | "runner";
  spanId?: string;
  parentSpanId?: string;
  occurredAt?: string;
} & (
  | { eventType: "sync.discord_refresh_requested"; payload: Record<never, never> }
  | {
      eventType: "sync.discord_refresh_completed";
      payload: {
        ok: boolean;
        detail: string;
        duration_ms: number;
        messages_pulled: number | null;
      };
    }
  | {
      eventType: "sync.discord_staged";
      payload: {
        batches: number;
        messages: number;
        days: number;
        channels: number;
        first_message_at: string | null;
        last_message_at: string | null;
      };
    }
);

/** Appends a Discord intake fact without revising the sync state envelope. */
export function appendSyncDiscordEvent(
  store: StateStore,
  input: SyncDiscordEventInput,
): AppendedGameEvent {
  return immediateTransaction(store.db, () => {
    const sync = getSyncState(store, requiredText(input.syncId, "syncId"));
    if (!sync) throw new Error(`Sync not found: ${input.syncId}`);
    return appendGameEvent(store.db, {
      eventType: input.eventType,
      gameId: sync.game_id,
      subjectKind: "sync_workflow",
      subjectId: sync.sync_id,
      correlationId: sync.sync_id,
      causationId: requiredText(input.commandId, "commandId"),
      traceId: sync.trace_id,
      ...eventSpan(input.parentSpanId ?? input.spanId ?? syncActionSpanId(input.commandId)),
      actor: input.actor ?? "operator",
      occurredAt: input.occurredAt ?? currentTime(),
      payload: input.payload,
    });
  });
}

function requestedPayload(intake: SyncIntake): JsonObject {
  return {
    upstream_from: intake.upstream_from,
    upstream_to: intake.upstream_to,
    merged_pr_ids: intake.merged_pr_ids,
    corpus_batch_ids: intake.corpus_batch_ids,
    knowledge_only: intake.knowledge_only,
  };
}

function observationRefreshedPayload(
  current: SyncState,
  intake: SyncIntake,
  observationSourceIdentity: string,
): SyncObservationRefreshedPayload {
  return {
    prior_upstream_revision: current.intake.upstream_to,
    observed_upstream_revision: intake.upstream_to,
    merged_pr_ids: intake.merged_pr_ids,
    corpus_batch_ids: intake.corpus_batch_ids,
    knowledge_only: intake.knowledge_only,
    observation_source_identity: requiredText(observationSourceIdentity, "observationSourceIdentity"),
    state_revision: current.revision + 1,
  };
}

type LegacySyncCreationInput = Omit<RecordSyncRequestedInput, "observationSourceIdentity"> & {
  observationSourceIdentity?: undefined;
};

/** Records observation only. It deliberately does not request or acquire the dispatch lease. */
export function recordSyncRequested(store: StateStore, input: RecordSyncRequestedInput): SyncState;
/** Compatibility for direct creation fixtures; observation refresh still requires an explicit source identity. */
export function recordSyncRequested(store: StateStore, input: LegacySyncCreationInput): SyncState;
export function recordSyncRequested(
  store: StateStore,
  input: RecordSyncRequestedInput | LegacySyncCreationInput,
): SyncState {
  return immediateTransaction(store.db, () => {
    const gameId = requiredText(input.gameId, "gameId");
    const cycleUuid = requiredText(input.cycleUuid, "cycleUuid");
    assertIntake(input.intake);
    assertOwningCycle(store.db, gameId, cycleUuid);
    const existing = getNonTerminalSyncForGame(store, gameId);
    if (existing) {
      if (input.correlationId !== existing.sync_id) {
        throw new Error(`Sync event correlation_id must equal sync id ${existing.sync_id}`);
      }
      if (existing.status !== "requested") {
        throw new Error(`Game ${gameId} already has non-terminal sync ${existing.sync_id} in ${existing.status}`);
      }
      if (input.syncId && input.syncId !== existing.sync_id) {
        throw new Error(`Game ${gameId} already has requested sync ${existing.sync_id}`);
      }
      if (existing.cycle_uuid !== cycleUuid) {
        throw new Error(`Requested sync ${existing.sync_id} belongs to cycle ${existing.cycle_uuid}, not ${cycleUuid}`);
      }
      return transitionSync(store, existing.sync_id, {
        actor: input.actor,
        commandId: input.commandId,
        correlationId: input.correlationId,
        eventType: "sync.observation_refreshed",
        expectedRevision: existing.revision,
        occurredAt: input.occurredAt,
        patch: { intake: input.intake },
        payload: observationRefreshedPayload(existing, input.intake, input.observationSourceIdentity ?? ""),
        spanId: input.spanId,
      });
    }

    const syncId = requiredText(input.syncId ?? `sync-${randomUUID()}`, "syncId");
    if (input.correlationId !== syncId) throw new Error(`Sync event correlation_id must equal sync id ${syncId}`);
    const at = input.occurredAt ?? currentTime();
    const traceId = requiredText(input.traceId ?? `trace-sync-${syncId}`, "traceId");
    const event = appendGameEvent(store.db, {
      eventType: "sync.requested",
      gameId,
      subjectKind: "sync_workflow",
      subjectId: syncId,
      correlationId: requiredText(input.correlationId, "correlationId"),
      causationId: requiredText(input.commandId, "commandId"),
      traceId,
      ...eventSpan(input.spanId ?? syncActionSpanId(input.commandId)),
      actor: input.actor,
      occurredAt: at,
      payload: requestedPayload(input.intake),
    });
    store.db
      .query(
        `INSERT INTO sync_state (
           sync_id, game_id, cycle_uuid, revision, status, trace_id,
           caused_by_event_id, blockers_json, created_at, updated_at,
           latest_event_sequence, intake_json, staging_json,
           pr_reconciliation_json, publication_json,
           blocked_origin_status, validation_evidence_json, resolved_conflict_paths_json
         ) VALUES (?, ?, ?, 0, 'requested', ?, ?, '[]', ?, ?, ?, ?, NULL, '[]', NULL, NULL, NULL, '[]')`,
      )
      .run(
        syncId,
        gameId,
        cycleUuid,
        traceId,
        event.eventId,
        at,
        at,
        event.sequence,
        JSON.stringify(input.intake),
      );
    const saved = selectSync(store.db, syncId);
    if (!saved) throw new Error(`Sync was not recorded: ${syncId}`);
    return rowToSyncState(saved);
  });
}
