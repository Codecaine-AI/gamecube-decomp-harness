import { createHash } from "node:crypto";
import type { StateStore } from "@server/core/orchestrator-state";
import { newSpanId, type JsonObject } from "@server/core/project-state/events.js";
import { getPrSeries, isPrSeriesStatusTransitionAllowed, transitionPrSeries } from "./state.js";
import { ingestPrFeedback } from "./work-items.js";
import type {
  ObservePrSeriesRemoteInput,
  ObservePrSeriesRemoteResult,
  PrEventType,
  PrSeriesStatus,
} from "./types.js";

type SeriesIdentityRow = { series_id: string; campaign_id: string };

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

function requiredApprovalFact(value: string | undefined, fact: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`Approved PR observation requires ${fact}`);
  return normalized;
}

function payloadForStatus(input: ObservePrSeriesRemoteInput, status: PrSeriesStatus): JsonObject {
  if (status === "merged") {
    return {
      merged_upstream_revision: input.mergedUpstreamRevision ?? "",
      upstream_pr_number: input.upstreamPrNumber,
    };
  }
  if (status === "closed") return { close_reason: "closed_upstream", closing_actor: "external_observer" };
  if (status === "approved") {
    return {
      approval_source_identity: requiredApprovalFact(input.approvalSourceIdentity, "approvalSourceIdentity"),
      approved_revision: requiredApprovalFact(input.approvedRevision, "approvedRevision"),
      approving_actor: requiredApprovalFact(input.approvingActor, "approvingActor"),
    };
  }
  return { review_decision: input.reviewDecision ?? "", upstream_pr_number: input.upstreamPrNumber };
}

/** Applies GitHub evidence without consulting or acquiring the dispatch lease. */
export function observePrSeriesRemote(store: StateStore, input: ObservePrSeriesRemoteInput): ObservePrSeriesRemoteResult {
  const branch = input.branch.trim();
  if (!branch) throw new Error("branch is required");
  const identities = store.db
    .query(
      `SELECT series.series_id, series.campaign_id
       FROM pr_series AS series
       JOIN pr_campaigns AS campaign ON campaign.campaign_id = series.campaign_id
       WHERE series.upstream_pr_number = ?
         AND campaign.status IN ('preparing', 'in_review', 'working')
       ORDER BY series.series_id`,
    )
    .all(input.upstreamPrNumber) as SeriesIdentityRow[];
  if (identities.length === 0) return { feedbackItemIds: [], ignored: true, series: null };
  if (identities.length > 1) {
    const campaigns = [...new Set(identities.map((identity) => identity.campaign_id))];
    throw new Error(
      `Blocked PR observation for upstream PR #${input.upstreamPrNumber}: ambiguous open campaigns ${campaigns.join(", ")}`,
    );
  }
  const identity = identities[0]!;
  const correlationId = input.correlationId.trim();
  if (correlationId !== identity.campaign_id) {
    throw new Error(`PR observation correlation_id must equal campaign id ${identity.campaign_id}`);
  }
  const actionSpanId = input.spanId ?? newSpanId();

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
      commandId: input.commandId,
      correlationId,
      expectedRevision: series.revision,
      items: feedback.map((item) => ({
        itemId: feedbackItemId(series!.series_id, item.sourceKind, item.sourceId),
        ...item,
      })),
      occurredAt: input.occurredAt,
      seriesId: series.series_id,
      spanId: actionSpanId,
    });
    feedbackItemIds.push(...ingestion.acceptedItemIds);
    series = ingestion.series;
  }

  if (target && target !== series.status && isPrSeriesStatusTransitionAllowed(series.status, target)) {
    series = transitionPrSeries(store, series.series_id, {
      actor: "external_observer",
      commandId: input.commandId,
      correlationId,
      eventType: eventForStatus(target),
      expectedRevision: series.revision,
      occurredAt: input.occurredAt,
      patch: { status: target, upstreamPrNumber: input.upstreamPrNumber },
      payload: payloadForStatus(input, target),
      spanId: actionSpanId,
    });
  }
  return { feedbackItemIds, ignored: false, series };
}
