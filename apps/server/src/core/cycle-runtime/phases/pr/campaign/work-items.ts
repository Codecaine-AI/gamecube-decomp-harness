import { randomUUID } from "node:crypto";
import { immediateTransaction, now as currentTime, type StateStore } from "@server/core/orchestrator-state";
import { requireActiveLease } from "@server/core/harness-state";
import { newSpanId } from "@server/core/harness-state/events.js";
import {
  StalePrSeriesRevisionError,
  getPrCampaign,
  getPrSeries,
  isTerminalPrSeriesStatus,
  transitionPrSeries,
} from "./state.js";
import type {
  IngestPrFeedbackInput,
  IngestPrFeedbackResult,
  PrFeedbackWorkItemInput,
  PrSeriesState,
  PrWorkItem,
  PrWorkItemStatus,
  TransitionPrWorkItemsInput,
} from "./types.js";

type WorkItemRow = {
  item_id: string;
  series_id: string;
  source_kind: string;
  source_id: string;
  status: PrWorkItemStatus;
  summary: string;
  created_at: string;
  resolved_at: string | null;
};

export interface PrCampaignWorkItemCommandInput {
  commandId: string;
  correlationId: string;
  itemIds: string[];
  leaseId: string;
  gameId: string;
  seriesId: string;
  spanId?: string;
  store: StateStore;
}

export interface ResolvePrCampaignWorkItemsInput extends PrCampaignWorkItemCommandInput {
  resolution?: string;
}

export interface DeclinePrCampaignWorkItemsInput extends PrCampaignWorkItemCommandInput {
  reason: string;
}

export interface RevisePrCampaignSeriesInput extends Omit<PrCampaignWorkItemCommandInput, "itemIds"> {
  pushedRevision: string;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function rowToWorkItem(row: WorkItemRow): PrWorkItem {
  return { ...row };
}

const ALLOWED_WORK_ITEM_STATUS_TRANSITIONS: Readonly<Record<PrWorkItemStatus, readonly PrWorkItemStatus[]>> = {
  pending: ["in_progress", "declined"],
  in_progress: ["pending", "resolved", "declined"],
  resolved: [],
  declined: [],
};

export class StalePrWorkItemStatusError extends Error {
  readonly itemId: string;
  readonly expectedStatus: PrWorkItemStatus;
  readonly actualStatus: PrWorkItemStatus;

  constructor(itemId: string, expectedStatus: PrWorkItemStatus, actualStatus: PrWorkItemStatus) {
    super(`Stale PR work-item status ${expectedStatus} for ${itemId}; current status is ${actualStatus}`);
    this.name = "StalePrWorkItemStatusError";
    this.itemId = itemId;
    this.expectedStatus = expectedStatus;
    this.actualStatus = actualStatus;
  }
}

export function isPrWorkItemStatusTransitionAllowed(
  current: PrWorkItemStatus,
  next: PrWorkItemStatus,
): boolean {
  return ALLOWED_WORK_ITEM_STATUS_TRANSITIONS[current].includes(next);
}

export function assertPrWorkItemStatusTransition(current: PrWorkItemStatus, next: PrWorkItemStatus): void {
  if (!isPrWorkItemStatusTransitionAllowed(current, next)) {
    throw new Error(`Invalid PR work-item status transition ${current} -> ${next}`);
  }
}

export function listPrWorkItems(store: StateStore, seriesId: string): PrWorkItem[] {
  return (store.db
    .query("SELECT * FROM pr_work_items WHERE series_id = ? ORDER BY created_at, item_id")
    .all(seriesId) as WorkItemRow[]).map(rowToWorkItem);
}

function fencedCampaignSeries(input: Omit<PrCampaignWorkItemCommandInput, "itemIds">): PrSeriesState {
  const gameId = requiredText(input.gameId, "gameId");
  const leaseId = requiredText(input.leaseId, "leaseId");
  const seriesId = requiredText(input.seriesId, "seriesId");
  const series = getPrSeries(input.store, seriesId);
  if (!series) throw new Error(`PR series not found: ${seriesId}`);
  const campaign = getPrCampaign(input.store, series.campaign_id);
  if (!campaign) throw new Error(`PR campaign not found: ${series.campaign_id}`);
  if (input.correlationId !== campaign.campaign_id) {
    throw new Error(`PR event correlation_id must equal campaign id ${campaign.campaign_id}`);
  }
  if (campaign.game_id !== gameId) {
    throw new Error(`PR campaign ${campaign.campaign_id} belongs to ${campaign.game_id}, not ${gameId}`);
  }
  if (campaign.status !== "working") {
    throw new Error(`PR campaign ${campaign.campaign_id} cannot execute fixer work while ${campaign.status}`);
  }
  const lease = requireActiveLease(input.store, leaseId, gameId);
  if (lease.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
    throw new Error(
      `Dispatch lease ${lease.lease_id} belongs to ${lease.kind}:${lease.workflow_id}, not pr:${campaign.campaign_id}`,
    );
  }
  return series;
}

function selectedWorkItems(
  store: StateStore,
  seriesId: string,
  itemIds: string[],
  allowedStatuses: readonly PrWorkItemStatus[],
): PrWorkItem[] {
  if (itemIds.length === 0) throw new Error("PR work-item command requires at least one item id");
  const normalizedIds = itemIds.map((itemId) => requiredText(itemId, "itemId"));
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new Error("PR work-item command item ids must be unique");
  }
  const byId = new Map(listPrWorkItems(store, seriesId).map((item) => [item.item_id, item]));
  return normalizedIds.map((itemId) => {
    const item = byId.get(itemId);
    if (!item) throw new Error(`PR work item not found for ${seriesId}: ${itemId}`);
    if (!allowedStatuses.includes(item.status)) {
      throw new Error(`PR work item ${itemId} is ${item.status}; expected ${allowedStatuses.join(" or ")}`);
    }
    return item;
  });
}

/** Claims pending review work under the campaign's current dispatch fence. */
export function claimPrCampaignWorkItems(input: PrCampaignWorkItemCommandInput): PrSeriesState {
  return immediateTransaction(input.store.db, () => {
    const series = fencedCampaignSeries(input);
    if (series.status !== "changes_requested" && series.status !== "revising") {
      throw new Error(`PR series ${series.series_id} cannot claim fixer work while ${series.status}`);
    }
    const items = selectedWorkItems(input.store, series.series_id, input.itemIds, ["pending"]);
    const occurredAt = currentTime();
    return transitionPrWorkItems(input.store, {
      actor: "agent",
      commandId: requiredText(input.commandId, "commandId"),
      correlationId: requiredText(input.correlationId, "correlationId"),
      eventType: series.status === "revising" ? "pr.work_items_claimed" : "pr.series_revising",
      expectedRevision: series.revision,
      occurredAt,
      patch: { status: "revising" },
      payload: series.status === "revising"
        ? {
            claimed_work_item_ids: items.map((item) => item.item_id),
            lease_id: input.leaseId,
          }
        : undefined,
      seriesId: series.series_id,
      spanId: input.spanId,
      workItems: items.map((item) => ({
        expectedStatus: "pending",
        itemId: item.item_id,
        status: "in_progress",
      })),
    });
  });
}

/** Records completed fixer work while leaving the series in its active revision cycle. */
export function resolvePrCampaignWorkItems(input: ResolvePrCampaignWorkItemsInput): PrSeriesState {
  return immediateTransaction(input.store.db, () => {
    const series = fencedCampaignSeries(input);
    if (series.status !== "revising") {
      throw new Error(`PR series ${series.series_id} cannot resolve fixer work while ${series.status}`);
    }
    const items = selectedWorkItems(input.store, series.series_id, input.itemIds, ["in_progress"]);
    const occurredAt = currentTime();
    return transitionPrWorkItems(input.store, {
      actor: "agent",
      commandId: requiredText(input.commandId, "commandId"),
      correlationId: requiredText(input.correlationId, "correlationId"),
      eventType: "pr.work_items_resolved",
      expectedRevision: series.revision,
      occurredAt,
      patch: { status: "revising" },
      payload: {
        lease_id: input.leaseId,
        resolution: input.resolution?.trim() || "fixer completed the requested work",
        resolved_work_item_ids: items.map((item) => item.item_id),
      },
      seriesId: series.series_id,
      spanId: input.spanId,
      workItems: items.map((item) => ({
        expectedStatus: "in_progress",
        itemId: item.item_id,
        status: "resolved",
      })),
    });
  });
}

function persistDeclinedWorkItems(
  store: StateStore,
  seriesId: string,
  items: PrWorkItem[],
  resolvedAt: string,
): void {
  for (const item of items) {
    assertPrWorkItemStatusTransition(item.status, "declined");
    const result = store.db
      .query(
        `UPDATE pr_work_items SET status = 'declined', resolved_at = ?
         WHERE item_id = ? AND series_id = ? AND status = ?`,
      )
      .run(resolvedAt, item.item_id, seriesId, item.status);
    if (result.changes !== 1) {
      const actual = store.db
        .query("SELECT status FROM pr_work_items WHERE item_id = ?")
        .get(item.item_id) as { status: PrWorkItemStatus } | null;
      throw new StalePrWorkItemStatusError(item.item_id, item.status, actual?.status ?? item.status);
    }
  }
}

/** Declines review work, then derives revising only after the progress fact is durable. */
export function declinePrCampaignWorkItems(input: DeclinePrCampaignWorkItemsInput): PrSeriesState {
  return immediateTransaction(input.store.db, () => {
    const series = fencedCampaignSeries(input);
    if (series.status !== "changes_requested" && series.status !== "revising") {
      throw new Error(`PR series ${series.series_id} cannot decline fixer work while ${series.status}`);
    }
    const reason = requiredText(input.reason, "decline reason");
    const items = selectedWorkItems(input.store, series.series_id, input.itemIds, ["pending", "in_progress"]);
    const selectedPending = items.filter((item) => item.status === "pending").length;
    const remainingPending = series.work_items.filter((item) => item.status === "pending").length - selectedPending;
    const commandId = requiredText(input.commandId, "commandId");
    const correlationId = requiredText(input.correlationId, "correlationId");
    const occurredAt = currentTime();
    const actionSpanId = input.spanId ?? newSpanId();
    const declined = transitionPrSeries(input.store, series.series_id, {
      actor: "agent",
      commandId,
      correlationId,
      eventType: "pr.work_items_declined",
      expectedRevision: series.revision,
      occurredAt,
      patch: { status: series.status },
      payload: {
        decline_reason: reason,
        declined_work_item_ids: items.map((item) => item.item_id),
        lease_id: input.leaseId,
      },
      spanId: actionSpanId,
    });
    persistDeclinedWorkItems(input.store, series.series_id, items, occurredAt);

    if (series.status !== "changes_requested" || remainingPending > 0) {
      const saved = getPrSeries(input.store, series.series_id);
      if (!saved) throw new Error(`PR series disappeared after declining work items: ${series.series_id}`);
      return saved;
    }

    return transitionPrSeries(input.store, series.series_id, {
      actor: "agent",
      causationId: declined.caused_by_event_id,
      commandId,
      correlationId,
      eventType: "pr.series_revising",
      expectedRevision: declined.revision,
      occurredAt,
      patch: { status: "revising" },
      spanId: actionSpanId,
    });
  });
}

/** Finalizes a settled revision cycle after every claimed item is resolved or declined. */
export function revisePrCampaignSeries(input: RevisePrCampaignSeriesInput): PrSeriesState {
  return immediateTransaction(input.store.db, () => {
    const series = fencedCampaignSeries(input);
    if (series.status !== "revising") {
      throw new Error(`PR series ${series.series_id} cannot finish a revision while ${series.status}`);
    }
    const unsettled = series.work_items.filter((item) => item.status === "pending" || item.status === "in_progress");
    if (unsettled.length > 0) {
      throw new Error(
        `PR series ${series.series_id} cannot finish a revision with unsettled work items: ${unsettled.map((item) => item.item_id).join(", ")}`,
      );
    }
    const pushedRevision = requiredText(input.pushedRevision, "pushedRevision");
    return transitionPrSeries(input.store, series.series_id, {
      actor: "agent",
      commandId: requiredText(input.commandId, "commandId"),
      correlationId: requiredText(input.correlationId, "correlationId"),
      eventType: "pr.series_revised",
      expectedRevision: series.revision,
      occurredAt: currentTime(),
      patch: { status: "published" },
      payload: {
        pushed_revision: pushedRevision,
        resolved_work_item_ids: series.work_items
          .filter((item) => item.status === "resolved")
          .map((item) => item.item_id),
      },
      spanId: input.spanId,
    });
  });
}

/**
 * Advances child work-item statuses and their owning series under one series
 * CAS event. The outer transaction rolls every child update back if the series
 * event or envelope revision is rejected.
 */
export function transitionPrWorkItems(store: StateStore, input: TransitionPrWorkItemsInput): PrSeriesState {
  return immediateTransaction(store.db, () => {
    const seriesId = requiredText(input.seriesId, "seriesId");
    const currentSeries = getPrSeries(store, seriesId);
    if (!currentSeries) throw new Error(`PR series not found: ${seriesId}`);
    if (currentSeries.revision !== input.expectedRevision) {
      throw new StalePrSeriesRevisionError(seriesId, input.expectedRevision, currentSeries.revision);
    }
    if (input.workItems.length === 0) throw new Error("Work-item transition requires at least one item");
    const itemIds = new Set<string>();
    const becomingInProgress = new Set<string>();
    const becomingResolved = new Set<string>();
    const becomingDeclined = new Set<string>();
    const at = input.occurredAt ?? new Date().toISOString();
    for (const transition of input.workItems) {
      const itemId = requiredText(transition.itemId, "itemId");
      if (itemIds.has(itemId)) throw new Error(`Duplicate work-item transition: ${itemId}`);
      itemIds.add(itemId);
      assertPrWorkItemStatusTransition(transition.expectedStatus, transition.status);
      if (transition.status === "in_progress") becomingInProgress.add(itemId);
      if (transition.status === "resolved") becomingResolved.add(itemId);
      if (transition.status === "declined") becomingDeclined.add(itemId);
      const row = store.db
        .query("SELECT * FROM pr_work_items WHERE item_id = ? AND series_id = ?")
        .get(itemId, seriesId) as WorkItemRow | null;
      if (!row) throw new Error(`PR work item not found for ${seriesId}: ${itemId}`);
      if (row.status !== transition.expectedStatus) {
        throw new StalePrWorkItemStatusError(itemId, transition.expectedStatus, row.status);
      }
      const terminal = transition.status === "resolved" || transition.status === "declined";
      if (!terminal && transition.resolvedAt !== undefined && transition.resolvedAt !== null) {
        throw new Error(`Non-terminal PR work item ${itemId} cannot set resolved_at`);
      }
      const result = store.db
        .query(
          `UPDATE pr_work_items SET status = ?, resolved_at = ?
           WHERE item_id = ? AND series_id = ? AND status = ?`,
        )
        .run(
          transition.status,
          terminal ? (transition.resolvedAt ?? at) : null,
          itemId,
          seriesId,
          transition.expectedStatus,
        );
      if (result.changes !== 1) {
        const actual = store.db
          .query("SELECT status FROM pr_work_items WHERE item_id = ?")
          .get(itemId) as { status: PrWorkItemStatus } | null;
        throw new StalePrWorkItemStatusError(itemId, transition.expectedStatus, actual?.status ?? row.status);
      }
    }
    if (becomingInProgress.size > 0 && input.patch.status !== "revising") {
      throw new Error("Claiming PR work items requires the owning series to enter revising");
    }
    if (becomingResolved.size > 0) {
      const recordsActiveRevision = input.eventType === "pr.work_items_resolved" && input.patch.status === "revising";
      const finishesRevision = input.eventType === "pr.series_revised" && input.patch.status === "published";
      if (!recordsActiveRevision && !finishesRevision) {
        throw new Error("Resolving PR work items requires a revising or revised series event");
      }
      const payloadIds = input.payload?.resolved_work_item_ids;
      if (!Array.isArray(payloadIds) || payloadIds.some((item) => typeof item !== "string")) {
        throw new Error("Resolving PR work items requires resolved_work_item_ids");
      }
      const payloadSet = new Set(payloadIds as string[]);
      if (
        payloadSet.size !== becomingResolved.size ||
        [...becomingResolved].some((itemId) => !payloadSet.has(itemId))
      ) {
        throw new Error("pr.series_revised resolved_work_item_ids must match the accepted work-item transitions");
      }
    }
    if (becomingDeclined.size > 0) {
      const payloadIds = input.payload?.declined_work_item_ids;
      if (!Array.isArray(payloadIds) || payloadIds.some((item) => typeof item !== "string")) {
        throw new Error("Declining PR work items requires declined_work_item_ids");
      }
      const payloadSet = new Set(payloadIds as string[]);
      if (
        payloadSet.size !== becomingDeclined.size ||
        [...becomingDeclined].some((itemId) => !payloadSet.has(itemId))
      ) {
        throw new Error("declined_work_item_ids must match the accepted work-item transitions");
      }
      requiredText(String(input.payload?.decline_reason ?? ""), "decline reason");
    }
    return transitionPrSeries(store, seriesId, input);
  });
}

function normalizedFeedbackItem(input: PrFeedbackWorkItemInput): Required<PrFeedbackWorkItemInput> {
  return {
    itemId: requiredText(input.itemId ?? `pr-work-item-${randomUUID()}`, "itemId"),
    sourceKind: requiredText(input.sourceKind, "sourceKind"),
    sourceId: requiredText(input.sourceId, "sourceId"),
    summary: requiredText(input.summary, "summary"),
  };
}

/**
 * Ingests immutable review evidence without reading, requesting, or acquiring
 * the dispatch lease. Fixer ownership and checkout mutation remain activation-only.
 */
export function ingestPrFeedback(store: StateStore, input: IngestPrFeedbackInput): IngestPrFeedbackResult {
  return immediateTransaction(store.db, () => {
    const seriesId = requiredText(input.seriesId, "seriesId");
    const current = getPrSeries(store, seriesId);
    if (!current) throw new Error(`PR series not found: ${seriesId}`);
    if (current.revision !== input.expectedRevision) {
      throw new StalePrSeriesRevisionError(seriesId, input.expectedRevision, current.revision);
    }
    if (isTerminalPrSeriesStatus(current.status)) {
      throw new Error(`PR series ${seriesId} is terminal in ${current.status}`);
    }
    if (!["published", "changes_requested", "revising", "approved"].includes(current.status)) {
      throw new Error(`PR series ${seriesId} cannot ingest review feedback while ${current.status}`);
    }
    if (input.items.length === 0) throw new Error("Feedback ingestion requires at least one work item");

    const normalized = input.items.map(normalizedFeedbackItem);
    const ids = new Set<string>();
    const identities = new Set<string>();
    for (const item of normalized) {
      const identity = `${item.sourceKind}:${item.sourceId}`;
      if (ids.has(item.itemId)) throw new Error(`Duplicate feedback item id in request: ${item.itemId}`);
      if (identities.has(identity)) throw new Error(`Duplicate feedback source identity in request: ${identity}`);
      ids.add(item.itemId);
      identities.add(identity);
    }

    const acceptedItemIds: string[] = [];
    const duplicateItemIds: string[] = [];
    const acceptedSourceIdentities: string[] = [];
    const at = input.occurredAt ?? new Date().toISOString();
    for (const item of normalized) {
      const byId = store.db
        .query("SELECT * FROM pr_work_items WHERE item_id = ?")
        .get(item.itemId) as WorkItemRow | null;
      if (byId) {
        if (
          byId.series_id !== seriesId ||
          byId.source_kind !== item.sourceKind ||
          byId.source_id !== item.sourceId
        ) {
          throw new Error(`Feedback item id ${item.itemId} already belongs to different evidence`);
        }
        duplicateItemIds.push(byId.item_id);
        continue;
      }
      const bySource = store.db
        .query(
          `SELECT * FROM pr_work_items
           WHERE series_id = ? AND source_kind = ? AND source_id = ?
           ORDER BY created_at, item_id LIMIT 1`,
        )
        .get(seriesId, item.sourceKind, item.sourceId) as WorkItemRow | null;
      if (bySource) {
        duplicateItemIds.push(bySource.item_id);
        continue;
      }
      store.db
        .query(
          `INSERT INTO pr_work_items (
             item_id, series_id, source_kind, source_id, status,
             summary, created_at, resolved_at
           ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL)`,
        )
        .run(item.itemId, seriesId, item.sourceKind, item.sourceId, item.summary, at);
      acceptedItemIds.push(item.itemId);
      acceptedSourceIdentities.push(`${item.sourceKind}:${item.sourceId}`);
    }

    if (acceptedItemIds.length === 0) {
      const unchanged = getPrSeries(store, seriesId);
      if (!unchanged) throw new Error(`PR series disappeared during feedback ingestion: ${seriesId}`);
      return { acceptedItemIds, duplicateItemIds, series: unchanged };
    }

    const actor = input.actor ?? "external_observer";
    const actionSpanId = input.spanId ?? newSpanId();
    const progress = transitionPrSeries(store, seriesId, {
      actor,
      causationId: input.causationId,
      commandId: input.commandId,
      correlationId: requiredText(input.correlationId, "correlationId"),
      expectedRevision: current.revision,
      eventType: "pr.feedback_ingested",
      occurredAt: at,
      patch: { status: current.status },
      payload: {
        work_item_ids: acceptedItemIds,
        review_source_identities: acceptedSourceIdentities,
        ingesting_actor: actor,
      },
      spanId: actionSpanId,
    });
    const series = current.status === "published" || current.status === "approved"
      ? transitionPrSeries(store, seriesId, {
        actor,
        causationId: progress.caused_by_event_id,
        commandId: input.commandId,
        correlationId: requiredText(input.correlationId, "correlationId"),
        expectedRevision: progress.revision,
        eventType: "pr.series_changes_requested",
        occurredAt: at,
        patch: { status: "changes_requested" },
        spanId: actionSpanId,
      })
      : progress;
    return { acceptedItemIds, duplicateItemIds, series };
  });
}
