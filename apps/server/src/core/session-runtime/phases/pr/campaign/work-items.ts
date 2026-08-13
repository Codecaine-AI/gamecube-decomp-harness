import { randomUUID } from "node:crypto";
import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import {
  StalePrSeriesRevisionError,
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
    const at = input.occurredAt ?? new Date().toISOString();
    for (const transition of input.workItems) {
      const itemId = requiredText(transition.itemId, "itemId");
      if (itemIds.has(itemId)) throw new Error(`Duplicate work-item transition: ${itemId}`);
      itemIds.add(itemId);
      assertPrWorkItemStatusTransition(transition.expectedStatus, transition.status);
      if (transition.status === "in_progress") becomingInProgress.add(itemId);
      if (transition.status === "resolved") becomingResolved.add(itemId);
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
      if (input.eventType !== "pr.series_revised" || input.patch.status !== "published") {
        throw new Error("Resolving PR work items requires a pr.series_revised transition to published");
      }
      const payloadIds = input.payload?.resolved_work_item_ids;
      if (!Array.isArray(payloadIds) || payloadIds.some((item) => typeof item !== "string")) {
        throw new Error("pr.series_revised requires resolved_work_item_ids");
      }
      const payloadSet = new Set(payloadIds as string[]);
      if (
        payloadSet.size !== becomingResolved.size ||
        [...becomingResolved].some((itemId) => !payloadSet.has(itemId))
      ) {
        throw new Error("pr.series_revised resolved_work_item_ids must match the accepted work-item transitions");
      }
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
    const nextStatus = current.status === "revising" ? "revising" : "changes_requested";
    const series = transitionPrSeries(store, seriesId, {
      actor,
      commandId: input.commandId,
      expectedRevision: current.revision,
      eventType: "pr.feedback_ingested",
      occurredAt: at,
      patch: { status: nextStatus },
      payload: {
        work_item_ids: acceptedItemIds,
        review_source_identities: acceptedSourceIdentities,
        ingesting_actor: actor,
      },
      spanId: input.spanId,
    });
    return { acceptedItemIds, duplicateItemIds, series };
  });
}
