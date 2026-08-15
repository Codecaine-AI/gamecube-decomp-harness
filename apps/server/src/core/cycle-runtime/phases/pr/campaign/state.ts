import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { immediateTransaction, now as currentTime, type StateStore } from "@server/core/orchestrator-state";
import { getActiveCycle } from "@server/core/cycle/store.js";
import { unresolvedSavePointFailures } from "@server/core/cycle/timeline.js";
import { appendGameEvent, eventSpan, newSpanId, type JsonObject } from "@server/core/harness-state/events.js";
import { casPrCampaignEnvelope, casPrSeriesEnvelope } from "./cas.js";
import {
  PR_CAMPAIGN_STATUSES,
  PR_SERIES_STATUSES,
  PR_WORK_ITEM_STATUSES,
  type OpenPrCampaignInput,
  type PrCampaignState,
  type PrCampaignStatus,
  type PrCampaignTransitionInput,
  type PrEventType,
  type PrPublicationPolicy,
  type PrSeriesState,
  type PrSeriesStatus,
  type PrSeriesTransitionInput,
  type PrSourceAnchor,
  type PrWorkItem,
  type PrWorkItemStatus,
  type RecordPreparedPrSeriesInput,
} from "./types.js";

type PrCampaignRow = {
  campaign_id: string;
  game_id: string;
  cycle_uuid: string;
  revision: number;
  status: string;
  trace_id: string;
  caused_by_event_id: string;
  blockers_json: string;
  created_at: string;
  closed_at: string | null;
  latest_event_sequence: number;
  source_anchor_json: string;
  publication_policy_json: string;
};

type PrSeriesRow = {
  series_id: string;
  campaign_id: string;
  revision: number;
  batch_index: number;
  status: string;
  branch: string;
  upstream_pr_number: number | null;
  target_units_json: string;
  last_validation_json: string | null;
  trace_id: string;
  caused_by_event_id: string;
  blockers_json: string;
  updated_at: string;
};

type PrWorkItemRow = {
  item_id: string;
  series_id: string;
  source_kind: string;
  source_id: string;
  status: string;
  summary: string;
  created_at: string;
  resolved_at: string | null;
};

const TERMINAL_CAMPAIGN_STATUSES = new Set<PrCampaignStatus>(["completed", "abandoned"]);
const TERMINAL_SERIES_STATUSES = new Set<PrSeriesStatus>(["merged", "closed"]);

const ALLOWED_CAMPAIGN_STATUS_TRANSITIONS: Readonly<Record<PrCampaignStatus, readonly PrCampaignStatus[]>> = {
  preparing: ["working", "completed", "abandoned"],
  in_review: ["working", "completed", "abandoned"],
  working: ["in_review", "completed", "abandoned"],
  completed: [],
  abandoned: [],
};

const ALLOWED_SERIES_STATUS_TRANSITIONS: Readonly<Record<PrSeriesStatus, readonly PrSeriesStatus[]>> = {
  prepared: ["published", "closed"],
  published: ["changes_requested", "approved", "merged", "closed"],
  changes_requested: ["revising", "approved", "merged", "closed"],
  revising: ["published", "changes_requested", "approved", "merged", "closed"],
  approved: ["changes_requested", "merged", "closed"],
  merged: [],
  closed: [],
};

export class StalePrCampaignRevisionError extends Error {
  readonly campaignId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(campaignId: string, expectedRevision: number, actualRevision: number) {
    super(`Stale PR campaign revision ${expectedRevision} for ${campaignId}; current revision is ${actualRevision}`);
    this.name = "StalePrCampaignRevisionError";
    this.campaignId = campaignId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class StalePrSeriesRevisionError extends Error {
  readonly seriesId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(seriesId: string, expectedRevision: number, actualRevision: number) {
    super(`Stale PR series revision ${expectedRevision} for ${seriesId}; current revision is ${actualRevision}`);
    this.name = "StalePrSeriesRevisionError";
    this.seriesId = seriesId;
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
    throw new Error(`Invalid ${label} JSON`, { cause: error });
  }
}

function parseObject<T extends object>(value: string, label: string): T {
  const parsed = parseJson(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${label} JSON: expected an object`);
  }
  return parsed as T;
}

function parseNullableObject(value: string | null, label: string): JsonObject | null {
  return value === null ? null : parseObject<JsonObject>(value, label);
}

function parseArray<T>(value: string, label: string): T[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) throw new Error(`Invalid ${label} JSON: expected an array`);
  return parsed as T[];
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

function stringArray(value: unknown, label: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be an array of nonblank strings`);
  }
  if (!allowEmpty && value.length === 0) throw new Error(`${label} must not be empty`);
  return value as string[];
}

function isPrCampaignStatus(value: string): value is PrCampaignStatus {
  return (PR_CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

function isPrSeriesStatus(value: string): value is PrSeriesStatus {
  return (PR_SERIES_STATUSES as readonly string[]).includes(value);
}

function isPrWorkItemStatus(value: string): value is PrWorkItemStatus {
  return (PR_WORK_ITEM_STATUSES as readonly string[]).includes(value);
}

function assertSourceAnchor(value: PrSourceAnchor): void {
  requiredText(value.save_point_id, "source_anchor.save_point_id");
  requiredText(value.source_revision, "source_anchor.source_revision");
}

function assertPublicationPolicy(value: PrPublicationPolicy): void {
  if (!Number.isInteger(value.batch_size) || value.batch_size < 1) {
    throw new Error("publication_policy.batch_size must be a positive integer");
  }
}

function rowToWorkItem(row: PrWorkItemRow): PrWorkItem {
  if (!isPrWorkItemStatus(row.status)) throw new Error(`Invalid PR work-item status: ${row.status}`);
  return {
    item_id: row.item_id,
    series_id: row.series_id,
    source_kind: row.source_kind,
    source_id: row.source_id,
    status: row.status,
    summary: row.summary,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
  };
}

function workItemsForSeries(db: Database, seriesId: string): PrWorkItem[] {
  return (db
    .query("SELECT * FROM pr_work_items WHERE series_id = ? ORDER BY created_at, item_id")
    .all(seriesId) as PrWorkItemRow[]).map(rowToWorkItem);
}

function rowToSeriesState(db: Database, row: PrSeriesRow): PrSeriesState {
  if (!isPrSeriesStatus(row.status)) throw new Error(`Invalid PR series status: ${row.status}`);
  const targetUnits = parseArray<unknown>(row.target_units_json, "target_units");
  if (targetUnits.some((unit) => typeof unit !== "string" || unit.trim() === "")) {
    throw new Error(`Invalid target_units JSON for PR series ${row.series_id}`);
  }
  return {
    series_id: row.series_id,
    campaign_id: row.campaign_id,
    revision: Number(row.revision),
    batch_index: Number(row.batch_index),
    status: row.status,
    branch: row.branch,
    upstream_pr_number: row.upstream_pr_number === null ? null : Number(row.upstream_pr_number),
    target_units: targetUnits as string[],
    last_validation: parseNullableObject(row.last_validation_json, "last_validation"),
    trace_id: row.trace_id,
    caused_by_event_id: row.caused_by_event_id,
    blockers: parseArray(row.blockers_json, "blockers"),
    updated_at: row.updated_at,
    work_items: workItemsForSeries(db, row.series_id),
  };
}

function seriesIdsForCampaign(db: Database, campaignId: string): string[] {
  return (db
    .query("SELECT series_id FROM pr_series WHERE campaign_id = ? ORDER BY batch_index, series_id")
    .all(campaignId) as Array<{ series_id: string }>).map((row) => row.series_id);
}

function rowToCampaignState(db: Database, row: PrCampaignRow): PrCampaignState {
  if (!isPrCampaignStatus(row.status)) throw new Error(`Invalid PR campaign status: ${row.status}`);
  const sourceAnchor = parseObject<PrSourceAnchor>(row.source_anchor_json, "source_anchor");
  const publicationPolicy = parseObject<PrPublicationPolicy>(row.publication_policy_json, "publication_policy");
  assertSourceAnchor(sourceAnchor);
  assertPublicationPolicy(publicationPolicy);
  return {
    campaign_id: row.campaign_id,
    game_id: row.game_id,
    cycle_uuid: row.cycle_uuid,
    revision: Number(row.revision),
    status: row.status,
    trace_id: row.trace_id,
    caused_by_event_id: row.caused_by_event_id,
    blockers: parseArray(row.blockers_json, "blockers"),
    created_at: row.created_at,
    closed_at: row.closed_at,
    latest_event_sequence: Number(row.latest_event_sequence),
    source_anchor: sourceAnchor,
    publication_policy: publicationPolicy,
    series_ids: seriesIdsForCampaign(db, row.campaign_id),
  };
}

function selectCampaign(db: Database, campaignId: string): PrCampaignRow | null {
  return (db.query("SELECT * FROM pr_campaigns WHERE campaign_id = ?").get(campaignId) as PrCampaignRow | null) ?? null;
}

function selectSeries(db: Database, seriesId: string): PrSeriesRow | null {
  return (db.query("SELECT * FROM pr_series WHERE series_id = ?").get(seriesId) as PrSeriesRow | null) ?? null;
}

export function getPrCampaign(store: StateStore, campaignId: string): PrCampaignState | null {
  const row = selectCampaign(store.db, campaignId);
  return row ? rowToCampaignState(store.db, row) : null;
}

export function getOpenPrCampaignForGame(store: StateStore, gameId: string): PrCampaignState | null {
  const rows = store.db
    .query(
      `SELECT * FROM pr_campaigns
       WHERE game_id = ? AND status NOT IN ('completed', 'abandoned')
       ORDER BY created_at DESC LIMIT 2`,
    )
    .all(gameId) as PrCampaignRow[];
  if (rows.length > 1) throw new Error(`Game ${gameId} has multiple open PR campaigns`);
  return rows[0] ? rowToCampaignState(store.db, rows[0]) : null;
}

export function getPrSeries(store: StateStore, seriesId: string): PrSeriesState | null {
  const row = selectSeries(store.db, seriesId);
  return row ? rowToSeriesState(store.db, row) : null;
}

export function listPrSeriesForCampaign(store: StateStore, campaignId: string): PrSeriesState[] {
  return (store.db
    .query("SELECT * FROM pr_series WHERE campaign_id = ? ORDER BY batch_index, series_id")
    .all(campaignId) as PrSeriesRow[]).map((row) => rowToSeriesState(store.db, row));
}

export function isTerminalPrCampaignStatus(status: PrCampaignStatus): boolean {
  return TERMINAL_CAMPAIGN_STATUSES.has(status);
}

export function isTerminalPrSeriesStatus(status: PrSeriesStatus): boolean {
  return TERMINAL_SERIES_STATUSES.has(status);
}

export function isPrCampaignStatusTransitionAllowed(current: PrCampaignStatus, next: PrCampaignStatus): boolean {
  return ALLOWED_CAMPAIGN_STATUS_TRANSITIONS[current].includes(next);
}

export function isPrSeriesStatusTransitionAllowed(current: PrSeriesStatus, next: PrSeriesStatus): boolean {
  return ALLOWED_SERIES_STATUS_TRANSITIONS[current].includes(next);
}

export function assertPrCampaignStatusTransition(current: PrCampaignStatus, next: PrCampaignStatus): void {
  if (!isPrCampaignStatusTransitionAllowed(current, next)) {
    throw new Error(`Invalid PR campaign status transition ${current} -> ${next}`);
  }
}

export function assertPrSeriesStatusTransition(current: PrSeriesStatus, next: PrSeriesStatus): void {
  if (!isPrSeriesStatusTransitionAllowed(current, next)) {
    throw new Error(`Invalid PR series status transition ${current} -> ${next}`);
  }
}

export function eventTypeForPrCampaignStatus(status: PrCampaignStatus): PrEventType {
  switch (status) {
    case "preparing": return "pr.campaign_opened";
    case "in_review": return "pr.campaign_in_review";
    case "working": return "pr.campaign_working";
    case "completed":
    case "abandoned": return "pr.campaign_closed";
  }
}

export function eventTypeForPrSeriesStatus(status: PrSeriesStatus): PrEventType {
  switch (status) {
    case "prepared": return "pr.series_prepared";
    case "published": return "pr.series_published";
    case "changes_requested": return "pr.series_changes_requested";
    case "revising": return "pr.series_revising";
    case "approved": return "pr.series_approved";
    case "merged": return "pr.series_merged";
    case "closed": return "pr.series_closed";
  }
}

function payloadObject(payload: JsonObject | undefined, eventType: PrEventType): JsonObject {
  if (!payload) throw new Error(`Event ${eventType} requires a payload`);
  return payload;
}

function campaignEventMatchesTransition(
  current: PrCampaignStatus,
  next: PrCampaignStatus,
  eventType: PrEventType,
): void {
  if (eventType === "pr.batch_published") {
    if (current !== "working" || next !== "working") {
      throw new Error(`pr.batch_published cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.campaign_recovered") {
    if (current !== "working" || next !== "in_review") {
      throw new Error(`pr.campaign_recovered cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.campaign_closed") {
    if (!isTerminalPrCampaignStatus(next)) {
      throw new Error(`pr.campaign_closed cannot record ${current} -> ${next}`);
    }
    return;
  }
  const expected = eventTypeForPrCampaignStatus(next);
  if (eventType !== expected) {
    throw new Error(`Event ${eventType} cannot produce PR campaign status ${next}; expected ${expected}`);
  }
  if (current === next) throw new Error(`${eventType} is valid only on entry to ${next}`);
}

function assertCampaignSemanticPayload(
  db: Database,
  current: PrCampaignState,
  nextStatus: PrCampaignStatus,
  eventType: PrEventType,
  payload: JsonObject | undefined,
): void {
  if (eventType === "pr.batch_published") {
    const value = payloadObject(payload, eventType);
    if (!Number.isInteger(value.batch_index) || Number(value.batch_index) < 0) {
      throw new Error("pr.batch_published requires a nonnegative batch_index");
    }
    const seriesIds = stringArray(value.series_ids, "series_ids", false);
    if (new Set(seriesIds).size !== seriesIds.length) {
      throw new Error("pr.batch_published series_ids must be unique");
    }
    const rows = db
      .query(
        `SELECT series_id, batch_index, status FROM pr_series
         WHERE campaign_id = ? AND series_id IN (${seriesIds.map(() => "?").join(",")})`,
      )
      .all(current.campaign_id, ...seriesIds) as Array<{ series_id: string; batch_index: number; status: string }>;
    if (rows.length !== seriesIds.length ||
        rows.some((row) => row.batch_index !== Number(value.batch_index) || row.status !== "published")) {
      throw new Error("pr.batch_published series must be published members of the named batch");
    }
    requiredText(String(value.operator ?? ""), "operator");
  } else if (eventType === "pr.campaign_recovered") {
    const value = payloadObject(payload, eventType);
    requiredText(String(value.recovery_reason ?? ""), "recovery_reason");
    stringArray(value.cancelled_subject_ids, "cancelled_subject_ids");
    if (value.resulting_status !== nextStatus) {
      throw new Error(`pr.campaign_recovered resulting_status must equal ${nextStatus}`);
    }
  } else if (eventType === "pr.campaign_closed") {
    const value = payloadObject(payload, eventType);
    if (value.outcome !== nextStatus) throw new Error(`pr.campaign_closed outcome must equal ${nextStatus}`);
    if (!value.per_series_terminal_summary || typeof value.per_series_terminal_summary !== "object" || Array.isArray(value.per_series_terminal_summary)) {
      throw new Error("pr.campaign_closed requires per_series_terminal_summary");
    }
    const rows = db
      .query("SELECT series_id, status FROM pr_series WHERE campaign_id = ? ORDER BY series_id")
      .all(current.campaign_id) as Array<{ series_id: string; status: string }>;
    const expectedSummary = Object.fromEntries(rows.map((row) => [row.series_id, row.status]));
    if (canonicalJson(value.per_series_terminal_summary) !== canonicalJson(expectedSummary)) {
      throw new Error("pr.campaign_closed per_series_terminal_summary must match the durable series statuses");
    }
  }
  if (eventType === "pr.campaign_opened") {
    throw new Error(`pr.campaign_opened cannot revise existing campaign ${current.campaign_id}`);
  }
}

export function transitionPrCampaign(
  store: StateStore,
  campaignId: string,
  input: PrCampaignTransitionInput,
): PrCampaignState {
  return immediateTransaction(store.db, () => {
    const row = selectCampaign(store.db, campaignId);
    if (!row) throw new Error(`PR campaign not found: ${campaignId}`);
    const current = rowToCampaignState(store.db, row);
    if (input.correlationId !== campaignId) {
      throw new Error(`PR event correlation_id must equal campaign id ${campaignId}`);
    }
    if (current.revision !== input.expectedRevision) {
      throw new StalePrCampaignRevisionError(campaignId, input.expectedRevision, current.revision);
    }
    if (isTerminalPrCampaignStatus(current.status)) {
      throw new Error(`PR campaign ${campaignId} is terminal in ${current.status}`);
    }
    const nextStatus = input.patch.status ?? current.status;
    if (nextStatus !== current.status) assertPrCampaignStatusTransition(current.status, nextStatus);
    const eventType = input.eventType ?? eventTypeForPrCampaignStatus(nextStatus);
    campaignEventMatchesTransition(current.status, nextStatus, eventType);
    if (["pr.batch_published", "pr.campaign_recovered", "pr.campaign_closed"].includes(eventType) && input.actor !== "operator") {
      throw new Error(`Event ${eventType} is operator-only`);
    }
    if (nextStatus !== current.status && ["agent", "external_observer"].includes(input.actor)) {
      throw new Error(`Actor ${input.actor} cannot execute PR campaign transitions`);
    }
    assertCampaignSemanticPayload(store.db, current, nextStatus, eventType, input.payload);

    if (nextStatus === "completed") {
      const row = store.db
        .query(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN status NOT IN ('merged', 'closed') THEN 1 ELSE 0 END) AS non_terminal
           FROM pr_series WHERE campaign_id = ?`,
        )
        .get(campaignId) as { non_terminal: number | null; total: number };
      if (Number(row.total) === 0) throw new Error(`PR campaign ${campaignId} cannot complete without series`);
      if (Number(row.non_terminal) > 0) throw new Error(`PR campaign ${campaignId} cannot complete with non-terminal series`);
    }
    if (!isTerminalPrCampaignStatus(nextStatus) && input.patch.closedAt !== undefined) {
      throw new Error(`Non-terminal PR campaign ${campaignId} cannot set closed_at`);
    }

    const at = input.occurredAt ?? currentTime();
    const nextClosedAt = isTerminalPrCampaignStatus(nextStatus) ? (input.patch.closedAt ?? at) : current.closed_at;
    const nextBlockers = input.patch.blockers ?? current.blockers;
    const event = appendGameEvent(store.db, {
      eventType,
      gameId: current.game_id,
      subjectKind: "pr_campaign",
      subjectId: campaignId,
      correlationId: requiredText(input.correlationId, "correlationId"),
      causationId: requiredText(input.causationId ?? input.commandId, "causationId"),
      traceId: current.trace_id,
      ...eventSpan(input.spanId ?? newSpanId()),
      actor: input.actor,
      occurredAt: at,
      payload: { ...(input.payload ?? {}), from_status: current.status, to_status: nextStatus },
    });
    const accepted = casPrCampaignEnvelope(store.db, {
      blockersJson: JSON.stringify(nextBlockers),
      campaignId,
      closedAt: nextClosedAt,
      eventId: event.eventId,
      eventSequence: event.sequence,
      expectedRevision: current.revision,
      status: nextStatus,
    });
    if (!accepted) {
      throw new StalePrCampaignRevisionError(campaignId, current.revision, getPrCampaign(store, campaignId)?.revision ?? -1);
    }
    const saved = selectCampaign(store.db, campaignId);
    if (!saved) throw new Error(`PR campaign disappeared after transition: ${campaignId}`);
    return rowToCampaignState(store.db, saved);
  });
}

function seriesEventMatchesTransition(
  current: PrSeriesStatus,
  next: PrSeriesStatus,
  eventType: PrEventType,
): void {
  if (eventType === "pr.work_items_claimed") {
    if (current !== "revising" || next !== "revising") {
      throw new Error(`pr.work_items_claimed cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.work_items_resolved") {
    if (current !== "revising" || next !== "revising") {
      throw new Error(`pr.work_items_resolved cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.work_items_declined") {
    if (current !== next || !["changes_requested", "revising"].includes(current)) {
      throw new Error(`pr.work_items_declined cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.series_published") {
    if (current !== "prepared" || next !== "published") {
      throw new Error(`pr.series_published cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.feedback_ingested") {
    if (!["published", "changes_requested", "revising", "approved"].includes(current) || current !== next) {
      throw new Error(`pr.feedback_ingested cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.series_revised") {
    if (current !== "revising" || next !== "published") {
      throw new Error(`pr.series_revised cannot record ${current} -> ${next}`);
    }
    return;
  }
  if (eventType === "pr.series_merged") {
    if (next !== "merged") throw new Error(`pr.series_merged cannot record ${current} -> ${next}`);
    return;
  }
  if (eventType === "pr.series_closed") {
    if (next !== "closed") throw new Error(`pr.series_closed cannot record ${current} -> ${next}`);
    return;
  }
  const expected = eventTypeForPrSeriesStatus(next);
  if (eventType !== expected) {
    throw new Error(`Event ${eventType} cannot produce PR series status ${next}; expected ${expected}`);
  }
  if (current === next) throw new Error(`${eventType} is valid only on entry to ${next}`);
}

function assertSeriesSemanticPayload(
  db: Database,
  current: PrSeriesState,
  nextStatus: PrSeriesStatus,
  nextUpstreamPrNumber: number | null,
  eventType: PrEventType,
  actor: PrSeriesTransitionInput["actor"],
  payload: JsonObject | undefined,
): void {
  if (eventType === "pr.series_published") {
    const value = payloadObject(payload, eventType);
    if (!Number.isInteger(value.upstream_pr_number) || Number(value.upstream_pr_number) < 1) {
      throw new Error("pr.series_published requires a positive upstream_pr_number");
    }
    if (Number(value.upstream_pr_number) !== nextUpstreamPrNumber || value.branch !== current.branch || value.batch_index !== current.batch_index) {
      throw new Error("pr.series_published facts must match the durable series");
    }
  } else if (eventType === "pr.feedback_ingested") {
    const value = payloadObject(payload, eventType);
    const itemIds = stringArray(value.work_item_ids, "work_item_ids", false);
    const sourceIdentities = stringArray(value.review_source_identities, "review_source_identities", false);
    if (
      new Set(itemIds).size !== itemIds.length ||
      sourceIdentities.length !== itemIds.length ||
      new Set(sourceIdentities).size !== sourceIdentities.length
    ) {
      throw new Error("pr.feedback_ingested item ids and review source identities must be unique one-to-one facts");
    }
    if (value.ingesting_actor !== actor) {
      throw new Error("pr.feedback_ingested ingesting_actor must match the event actor");
    }
    const rows = db
      .query(
        `SELECT item_id, source_kind || ':' || source_id AS source_identity
         FROM pr_work_items WHERE series_id = ? AND item_id IN (${itemIds.map(() => "?").join(",")})`,
      )
      .all(current.series_id, ...itemIds) as Array<{ item_id: string; source_identity: string }>;
    const durableItemIds = new Set(rows.map((row) => row.item_id));
    const durableSourceIdentities = new Set(rows.map((row) => row.source_identity));
    if (
      rows.length !== itemIds.length ||
      itemIds.some((itemId) => !durableItemIds.has(itemId)) ||
      sourceIdentities.some((identity) => !durableSourceIdentities.has(identity))
    ) {
      throw new Error("pr.feedback_ingested facts must name accepted work items for the series");
    }
  } else if (eventType === "pr.series_revised") {
    const value = payloadObject(payload, eventType);
    const resolved = stringArray(value.resolved_work_item_ids, "resolved_work_item_ids");
    requiredText(String(value.pushed_revision ?? ""), "pushed_revision");
    if (resolved.length > 0) {
      const row = db
        .query(
          `SELECT COUNT(*) AS count FROM pr_work_items
           WHERE series_id = ? AND status = 'resolved'
             AND item_id IN (${resolved.map(() => "?").join(",")})`,
        )
        .get(current.series_id, ...resolved) as { count: number };
      if (Number(row.count) !== resolved.length) {
        throw new Error("pr.series_revised requires every named work item to be resolved");
      }
    }
  } else if (eventType === "pr.series_approved") {
    const value = payloadObject(payload, eventType);
    requiredText(String(value.approval_source_identity ?? ""), "approval_source_identity");
    requiredText(String(value.approved_revision ?? ""), "approved_revision");
    requiredText(String(value.approving_actor ?? ""), "approving_actor");
  } else if (eventType === "pr.series_merged") {
    const value = payloadObject(payload, eventType);
    if (value.upstream_pr_number !== nextUpstreamPrNumber) {
      throw new Error("pr.series_merged upstream_pr_number must match the durable series");
    }
    requiredText(String(value.merged_upstream_revision ?? ""), "merged_upstream_revision");
  } else if (eventType === "pr.series_closed") {
    const value = payloadObject(payload, eventType);
    requiredText(String(value.close_reason ?? ""), "close_reason");
    if (requiredText(String(value.closing_actor ?? ""), "closing_actor") !== actor) {
      throw new Error("pr.series_closed closing_actor must match the event actor");
    }
  }
  if (eventType === "pr.series_prepared") {
    throw new Error(`pr.series_prepared cannot revise existing series ${current.series_id}`);
  }
  if (nextStatus === "changes_requested") {
    const pending = db
      .query("SELECT 1 FROM pr_work_items WHERE series_id = ? AND status = 'pending' LIMIT 1")
      .get(current.series_id);
    if (!pending) throw new Error(`PR series ${current.series_id} cannot enter changes_requested without pending work`);
  }
}

export function transitionPrSeries(
  store: StateStore,
  seriesId: string,
  input: PrSeriesTransitionInput,
): PrSeriesState {
  return immediateTransaction(store.db, () => {
    const row = selectSeries(store.db, seriesId);
    if (!row) throw new Error(`PR series not found: ${seriesId}`);
    const current = rowToSeriesState(store.db, row);
    if (current.revision !== input.expectedRevision) {
      throw new StalePrSeriesRevisionError(seriesId, input.expectedRevision, current.revision);
    }
    if (isTerminalPrSeriesStatus(current.status)) throw new Error(`PR series ${seriesId} is terminal in ${current.status}`);
    const campaignRow = selectCampaign(store.db, current.campaign_id);
    if (!campaignRow) throw new Error(`PR campaign not found: ${current.campaign_id}`);
    const campaign = rowToCampaignState(store.db, campaignRow);
    if (input.correlationId !== campaign.campaign_id) {
      throw new Error(`PR event correlation_id must equal campaign id ${campaign.campaign_id}`);
    }
    if (isTerminalPrCampaignStatus(campaign.status)) {
      throw new Error(`PR campaign ${current.campaign_id} is terminal`);
    }

    const nextStatus = input.patch.status ?? current.status;
    if (nextStatus !== current.status) assertPrSeriesStatusTransition(current.status, nextStatus);
    const eventType = input.eventType ?? eventTypeForPrSeriesStatus(nextStatus);
    seriesEventMatchesTransition(current.status, nextStatus, eventType);
    if (
      (eventType === "pr.series_published" || eventType === "pr.series_revised" || nextStatus === "revising") &&
      campaign.status !== "working"
    ) {
      throw new Error(`PR series ${seriesId} requires a working campaign for ${eventType}`);
    }
    if (eventType === "pr.series_published" && input.actor !== "operator") {
      throw new Error("pr.series_published is operator-only");
    }
    if (
      (nextStatus === "revising" || eventType === "pr.series_revised") &&
      (input.actor === "external_observer" || input.actor === "guardian")
    ) {
      throw new Error(`Actor ${input.actor} cannot execute PR fixer transitions`);
    }
    const nextUpstreamPrNumber = input.patch.upstreamPrNumber === undefined
      ? current.upstream_pr_number
      : input.patch.upstreamPrNumber;
    if (current.upstream_pr_number !== null && nextUpstreamPrNumber !== current.upstream_pr_number) {
      throw new Error(`PR series ${seriesId} upstream PR number is immutable once assigned`);
    }
    if (["published", "changes_requested", "revising", "approved", "merged"].includes(nextStatus) &&
        (!Number.isInteger(nextUpstreamPrNumber) || Number(nextUpstreamPrNumber) < 1)) {
      throw new Error(`PR series ${seriesId} requires an upstream PR number while ${nextStatus}`);
    }
    if (nextStatus === "prepared" && nextUpstreamPrNumber !== null) {
      throw new Error(`Prepared PR series ${seriesId} cannot have an upstream PR number`);
    }
    assertSeriesSemanticPayload(
      store.db,
      current,
      nextStatus,
      nextUpstreamPrNumber,
      eventType,
      input.actor,
      input.payload,
    );

    const at = input.occurredAt ?? currentTime();
    const nextBlockers = input.patch.blockers ?? current.blockers;
    const event = appendGameEvent(store.db, {
      eventType,
      gameId: campaignRow.game_id,
      subjectKind: "pr_series",
      subjectId: seriesId,
      correlationId: requiredText(input.correlationId, "correlationId"),
      causationId: requiredText(input.causationId ?? input.commandId, "causationId"),
      traceId: campaign.trace_id,
      ...eventSpan(input.spanId ?? newSpanId()),
      actor: input.actor,
      occurredAt: at,
      payload: { ...(input.payload ?? {}), from_status: current.status, to_status: nextStatus },
    });
    const accepted = casPrSeriesEnvelope(store.db, {
      blockersJson: JSON.stringify(nextBlockers),
      eventId: event.eventId,
      expectedRevision: current.revision,
      lastValidationJson: input.patch.lastValidation === undefined
        ? undefined
        : input.patch.lastValidation === null
          ? null
          : JSON.stringify(input.patch.lastValidation),
      seriesId,
      status: nextStatus,
      updatedAt: at,
      upstreamPrNumber: input.patch.upstreamPrNumber,
    });
    if (!accepted) {
      throw new StalePrSeriesRevisionError(seriesId, current.revision, getPrSeries(store, seriesId)?.revision ?? -1);
    }
    const saved = selectSeries(store.db, seriesId);
    if (!saved) throw new Error(`PR series disappeared after transition: ${seriesId}`);
    return rowToSeriesState(store.db, saved);
  });
}

function assertStableNamedSavePoint(
  store: StateStore,
  gameId: string,
  cycleUuid: string,
  namedSavePointId: string,
): PrSourceAnchor {
  const cycle = getActiveCycle(store.db, gameId);
  if (!cycle) throw new Error(`Game ${gameId} has no active cycle for a PR campaign`);
  if (cycle.cycle_uuid !== cycleUuid) {
    throw new Error(`Current game cycle is ${cycle.cycle_uuid}, not ${cycleUuid}`);
  }
  if (!cycle.head_revision?.trim()) throw new Error(`Game cycle ${cycleUuid} has no canonical head`);
  if (cycle.save_point_stale) throw new Error(`Game cycle ${cycleUuid} save-point evidence is stale`);
  if (unresolvedSavePointFailures(store, { gameId, cycleUuid }).length > 0) {
    throw new Error(`Game cycle ${cycleUuid} has unresolved save-point failures`);
  }
  const latest = store.db
    .query(
      `SELECT save_points.commit_sha, save_points.worktree_dirty
       FROM cycle_timeline_entries
       LEFT JOIN save_points ON save_points.id = cycle_timeline_entries.entry_id
       WHERE cycle_timeline_entries.cycle_uuid = ?
         AND cycle_timeline_entries.entry_kind = 'save_point'
       ORDER BY cycle_timeline_entries.id DESC LIMIT 1`,
    )
    .get(cycleUuid) as { commit_sha: string | null; worktree_dirty: number | null } | undefined;
  if (latest?.commit_sha !== cycle.head_revision || Boolean(latest.worktree_dirty)) {
    throw new Error(`Latest save point is not a clean anchor at the current head of ${cycleUuid}`);
  }
  const named = store.db
    .query(
      `SELECT 1
       FROM save_points
       JOIN campaigns ON campaigns.id = save_points.campaign_id
       JOIN cycle_timeline_entries
         ON cycle_timeline_entries.entry_kind = 'save_point'
        AND cycle_timeline_entries.entry_id = save_points.id
       WHERE save_points.id = ?
         AND campaigns.game_id = ?
         AND cycle_timeline_entries.cycle_uuid = ?
         AND LENGTH(TRIM(COALESCE(save_points.label, ''))) > 0
         AND save_points.worktree_dirty = 0
         AND save_points.commit_sha = ?`,
    )
    .get(namedSavePointId, gameId, cycleUuid, cycle.head_revision);
  if (!named) throw new Error(`A named save point at the current head is required for ${cycleUuid}`);
  return { save_point_id: namedSavePointId, source_revision: cycle.head_revision };
}

function insertPreparedSeries(
  store: StateStore,
  campaign: PrCampaignRow,
  input: RecordPreparedPrSeriesInput,
): PrSeriesState {
  if (input.correlationId !== campaign.campaign_id) {
    throw new Error(`PR event correlation_id must equal campaign id ${campaign.campaign_id}`);
  }
  if (!isPrCampaignStatus(campaign.status)) throw new Error(`Invalid PR campaign status: ${campaign.status}`);
  if (isTerminalPrCampaignStatus(campaign.status)) {
    throw new Error(`PR campaign ${campaign.campaign_id} is terminal in ${campaign.status}`);
  }
  if (campaign.status !== "preparing" && campaign.status !== "working") {
    throw new Error(`PR campaign ${campaign.campaign_id} cannot prepare series while ${campaign.status}`);
  }
  if (input.actor !== "operator") throw new Error("pr.series_prepared is operator-only");
  if (!Number.isInteger(input.batchIndex) || input.batchIndex < 0) {
    throw new Error("batchIndex must be a nonnegative integer");
  }
  const branch = requiredText(input.branch, "branch");
  const targetUnits = input.targetUnits.map((unit) => requiredText(unit, "target unit"));
  const seriesId = requiredText(input.seriesId ?? `pr-series-${randomUUID()}`, "seriesId");
  if (selectSeries(store.db, seriesId)) throw new Error(`PR series already exists: ${seriesId}`);
  const duplicateBranch = store.db
    .query("SELECT series_id FROM pr_series WHERE campaign_id = ? AND branch = ?")
    .get(campaign.campaign_id, branch) as { series_id: string } | null;
  if (duplicateBranch) {
    throw new Error(`PR campaign ${campaign.campaign_id} already has branch ${branch} in ${duplicateBranch.series_id}`);
  }
  const at = input.occurredAt ?? currentTime();
  const traceId = requiredText(campaign.trace_id, "campaign traceId");
  if (input.traceId !== undefined && requiredText(input.traceId, "traceId") !== traceId) {
    throw new Error(`PR series trace_id must equal campaign trace_id ${traceId}`);
  }
  const event = appendGameEvent(store.db, {
    eventType: "pr.series_prepared",
    gameId: campaign.game_id,
    subjectKind: "pr_series",
    subjectId: seriesId,
    correlationId: requiredText(input.correlationId, "correlationId"),
    causationId: requiredText(input.causationId ?? input.commandId, "causationId"),
    traceId,
    ...eventSpan(input.spanId ?? newSpanId()),
    actor: input.actor,
    occurredAt: at,
    payload: {
      from_status: null,
      to_status: "prepared",
      branch,
      batch_index: input.batchIndex,
    },
  });
  store.db
    .query(
      `INSERT INTO pr_series (
         series_id, campaign_id, revision, batch_index, status, branch,
         upstream_pr_number, target_units_json, last_validation_json,
         trace_id, caused_by_event_id, blockers_json, updated_at
       ) VALUES (?, ?, 0, ?, 'prepared', ?, NULL, ?, ?, ?, ?, '[]', ?)`,
    )
    .run(
      seriesId,
      campaign.campaign_id,
      input.batchIndex,
      branch,
      JSON.stringify(targetUnits),
      input.lastValidation === undefined || input.lastValidation === null ? null : JSON.stringify(input.lastValidation),
      traceId,
      event.eventId,
      at,
    );
  const saved = selectSeries(store.db, seriesId);
  if (!saved) throw new Error(`PR series was not recorded: ${seriesId}`);
  return rowToSeriesState(store.db, saved);
}

export function recordPreparedPrSeries(store: StateStore, input: RecordPreparedPrSeriesInput): PrSeriesState {
  return immediateTransaction(store.db, () => {
    const campaign = selectCampaign(store.db, requiredText(input.campaignId, "campaignId"));
    if (!campaign) throw new Error(`PR campaign not found: ${input.campaignId}`);
    return insertPreparedSeries(store, campaign, input);
  });
}

export function openPrCampaign(
  store: StateStore,
  input: OpenPrCampaignInput,
  options: { allowEmptyForLegacyAdoption?: boolean } = {},
): PrCampaignState {
  if (input.actor !== "operator") throw new Error("PR campaign open is operator-only");
  return immediateTransaction(store.db, () => {
    const gameId = requiredText(input.gameId, "gameId");
    const cycleUuid = requiredText(input.cycleUuid, "cycleUuid");
    const namedSavePointId = requiredText(input.namedSavePointId, "namedSavePointId");
    if (getOpenPrCampaignForGame(store, gameId)) {
      throw new Error(`Game ${gameId} already has an open PR campaign`);
    }
    const sourceAnchor = assertStableNamedSavePoint(store, gameId, cycleUuid, namedSavePointId);
    const campaignId = requiredText(input.campaignId ?? `pr-campaign-${randomUUID()}`, "campaignId");
    if (input.correlationId !== campaignId) {
      throw new Error(`PR event correlation_id must equal campaign id ${campaignId}`);
    }
    if (selectCampaign(store.db, campaignId)) throw new Error(`PR campaign already exists: ${campaignId}`);
    const publicationPolicy: PrPublicationPolicy = { batch_size: input.publicationPolicy?.batch_size ?? 4 };
    assertPublicationPolicy(publicationPolicy);
    const series = input.series ?? [];
    if (series.length === 0 && options.allowEmptyForLegacyAdoption !== true) {
      throw new Error("PR campaign requires at least one series");
    }
    const seriesIds = new Set(series.map((entry) => entry.seriesId).filter((value): value is string => value !== undefined));
    if (seriesIds.size !== series.filter((entry) => entry.seriesId !== undefined).length) {
      throw new Error("PR campaign series ids must be unique");
    }
    const at = input.occurredAt ?? currentTime();
    const actionSpanId = input.spanId ?? newSpanId();
    const traceId = requiredText(input.traceId ?? `trace-pr-campaign-${campaignId}`, "traceId");
    const event = appendGameEvent(store.db, {
      eventType: "pr.campaign_opened",
      gameId,
      subjectKind: "pr_campaign",
      subjectId: campaignId,
      correlationId: requiredText(input.correlationId, "correlationId"),
      causationId: requiredText(input.causationId ?? input.commandId, "causationId"),
      traceId,
      ...eventSpan(actionSpanId),
      actor: input.actor,
      occurredAt: at,
      payload: {
        from_status: null,
        to_status: "preparing",
        source_anchor: {
          save_point_id: sourceAnchor.save_point_id,
          source_revision: sourceAnchor.source_revision,
        },
        series_count: series.length,
        publication_batch_size: publicationPolicy.batch_size,
      },
    });
    store.db
      .query(
        `INSERT INTO pr_campaigns (
           campaign_id, game_id, cycle_uuid, revision, status, trace_id,
           caused_by_event_id, blockers_json, created_at, closed_at,
           latest_event_sequence, source_anchor_json, publication_policy_json
         ) VALUES (?, ?, ?, 0, 'preparing', ?, ?, '[]', ?, NULL, ?, ?, ?)`,
      )
      .run(
        campaignId,
        gameId,
        cycleUuid,
        traceId,
        event.eventId,
        at,
        event.sequence,
        JSON.stringify(sourceAnchor),
        JSON.stringify(publicationPolicy),
      );
    const campaign = selectCampaign(store.db, campaignId);
    if (!campaign) throw new Error(`PR campaign was not recorded: ${campaignId}`);
    for (const prepared of series) {
      insertPreparedSeries(store, campaign, {
        ...prepared,
        actor: input.actor,
        campaignId,
        causationId: event.eventId,
        commandId: input.commandId,
        correlationId: input.correlationId,
        occurredAt: at,
        spanId: actionSpanId,
        traceId,
      });
    }
    const saved = selectCampaign(store.db, campaignId);
    if (!saved) throw new Error(`PR campaign disappeared after opening: ${campaignId}`);
    return rowToCampaignState(store.db, saved);
  });
}
