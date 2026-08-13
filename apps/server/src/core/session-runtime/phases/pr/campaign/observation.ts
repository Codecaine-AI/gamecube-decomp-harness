import { createHash } from "node:crypto";
import type { StateStore } from "@server/core/orchestrator-state";
import type { JsonObject } from "@server/core/project-state/events.js";
import { getPrSeries, isPrSeriesStatusTransitionAllowed, transitionPrSeries } from "./state.js";
import { ingestPrFeedback } from "./work-items.js";
import type {
  ObservePrSeriesRemoteInput,
  ObservePrSeriesRemoteResult,
  PrEventType,
  PrSeriesStatus,
} from "./types.js";

type SeriesIdentityRow = { series_id: string };

function feedbackItemId(seriesId: string, sourceKind: string, sourceId: string): string {
  const digest = createHash("sha256").update(`${seriesId}\0${sourceKind}\0${sourceId}`).digest("hex").slice(0, 24);
  return `pr-work-item-${digest}`;
}

function observedStatus(input: ObservePrSeriesRemoteInput): PrSeriesStatus | null {
  const state = input.state.toUpperCase();
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  const decision = (input.reviewDecision ?? "").toUpperCase();
  if (decision === "CHANGES_REQUESTED") return "changes_requested";
  if (decision === "APPROVED") return "approved";
  return null;
}

function eventForStatus(status: PrSeriesStatus): PrEventType {
  if (status === "merged") return "pr.series_merged";
  if (status === "closed") return "pr.series_closed";
  if (status === "changes_requested") return "pr.series_changes_requested";
  if (status === "approved") return "pr.series_approved";
  throw new Error(`No remote-observation event for PR series status ${status}`);
}

function payloadForStatus(input: ObservePrSeriesRemoteInput, status: PrSeriesStatus): JsonObject {
  if (status === "merged") {
    return {
      merged_upstream_revision: input.mergedUpstreamRevision ?? "",
      upstream_pr_number: input.upstreamPrNumber,
    };
  }
  if (status === "closed") return { close_reason: "closed_upstream", closing_actor: "external_observer" };
  return { review_decision: input.reviewDecision ?? "", upstream_pr_number: input.upstreamPrNumber };
}

/** Applies GitHub evidence without consulting or acquiring the dispatch lease. */
export function observePrSeriesRemote(store: StateStore, input: ObservePrSeriesRemoteInput): ObservePrSeriesRemoteResult {
  const branch = input.branch.trim();
  if (!branch) throw new Error("branch is required");
  const identity = store.db
    .query("SELECT series_id FROM pr_series WHERE branch = ? ORDER BY series_id LIMIT 1")
    .get(branch) as SeriesIdentityRow | null;
  if (!identity) return { feedbackItemIds: [], ignored: true, series: null };

  let series = getPrSeries(store, identity.series_id);
  if (!series) return { feedbackItemIds: [], ignored: true, series: null };
  const target = observedStatus(input);
  const feedbackItemIds: string[] = [];
  const feedback = [...(input.feedback ?? [])];
  if (target === "changes_requested" && feedback.length === 0) {
    feedback.push({
      sourceKind: "review_decision",
      sourceId: `pr-${input.upstreamPrNumber}:changes_requested`,
      summary: "Upstream review requested changes.",
    });
  }
  if (feedback.length && series.status !== "merged" && series.status !== "closed") {
    const ingestion = ingestPrFeedback(store, {
      actor: "external_observer",
      commandId: `${input.commandId}:feedback`,
      expectedRevision: series.revision,
      items: feedback.map((item) => ({
        itemId: feedbackItemId(series!.series_id, item.sourceKind, item.sourceId),
        ...item,
      })),
      occurredAt: input.occurredAt,
      seriesId: series.series_id,
    });
    feedbackItemIds.push(...ingestion.acceptedItemIds);
    series = ingestion.series;
  }

  if (target && target !== series.status && isPrSeriesStatusTransitionAllowed(series.status, target)) {
    series = transitionPrSeries(store, series.series_id, {
      actor: "external_observer",
      commandId: `${input.commandId}:status:${target}`,
      eventType: eventForStatus(target),
      expectedRevision: series.revision,
      occurredAt: input.occurredAt,
      patch: { status: target, upstreamPrNumber: input.upstreamPrNumber },
      payload: payloadForStatus(input, target),
    });
  }
  return { feedbackItemIds, ignored: false, series };
}
