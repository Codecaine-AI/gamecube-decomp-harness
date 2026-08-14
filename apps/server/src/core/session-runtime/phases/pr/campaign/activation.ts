import {
  immediateTransaction,
  now as currentTime,
  type StateStore,
} from "@server/core/orchestrator-state";
import {
  releaseDispatch,
  requireActiveLease,
  type ProjectState,
} from "@server/core/project-state";
import { newSpanId, type EventActor } from "@server/core/project-state/events.js";
import { recordPrPhaseBoundaryInTransaction } from "./timeline-writer.js";
import { getPrCampaign, transitionPrCampaign } from "./state.js";
import type { PrCampaignState } from "./types.js";

export interface ActivateAcquiredPrCampaignInput {
  actor?: EventActor;
  campaignId: string;
  causationId?: string;
  commandId: string;
  correlationId: string;
  leaseId: string;
  occurredAt?: string;
  projectId: string;
  spanId?: string;
  store: StateStore;
}

export interface ReleasePrCampaignInput extends ActivateAcquiredPrCampaignInput {}

export interface ReleasePrCampaignResult {
  campaign: PrCampaignState;
  projectState: ProjectState;
}

function requireCampaign(store: StateStore, campaignId: string): PrCampaignState {
  const campaign = getPrCampaign(store, campaignId);
  if (!campaign) throw new Error(`PR campaign not found: ${campaignId}`);
  return campaign;
}

function requireCampaignLease(input: ActivateAcquiredPrCampaignInput): void {
  const lease = requireActiveLease(input.store, input.leaseId, input.projectId);
  if (lease.kind !== "pr" || lease.workflow_id !== input.campaignId) {
    throw new Error(
      `Dispatch lease ${lease.lease_id} belongs to ${lease.kind}:${lease.workflow_id}, not pr:${input.campaignId}`,
    );
  }
}

/** Activates a campaign after either immediate acquisition or queued handoff. */
export function activateAcquiredPrCampaign(input: ActivateAcquiredPrCampaignInput): PrCampaignState {
  return immediateTransaction(input.store.db, () => {
    const campaign = requireCampaign(input.store, input.campaignId);
    if (campaign.project_id !== input.projectId) {
      throw new Error(`PR campaign ${campaign.campaign_id} belongs to ${campaign.project_id}, not ${input.projectId}`);
    }
    if (campaign.status === "completed" || campaign.status === "abandoned") {
      throw new Error(`Terminal PR campaign ${campaign.campaign_id} cannot acquire dispatch authority`);
    }
    requireCampaignLease(input);
    if (campaign.status === "working") {
      const entry = input.store.db
        .query(
          `SELECT 1 FROM session_timeline_entries
           WHERE session_uuid = ? AND entry_kind = 'pr_phase' AND entry_id = ?`,
        )
        .get(campaign.session_uuid, `pr-phase:${input.leaseId}:acquired`);
      if (!entry) {
        throw new Error(`Working PR campaign ${campaign.campaign_id} is missing activation timeline evidence`);
      }
      return campaign;
    }
    if (campaign.status !== "preparing" && campaign.status !== "in_review") {
      throw new Error(`pr.activate requires preparing or in_review status; ${campaign.campaign_id} is ${campaign.status}`);
    }
    const occurredAt = input.occurredAt ?? currentTime();
    const actionSpanId = input.spanId ?? newSpanId();
    const activated = transitionPrCampaign(input.store, campaign.campaign_id, {
      actor: "operator",
      causationId: input.causationId,
      commandId: input.commandId,
      correlationId: input.correlationId,
      expectedRevision: campaign.revision,
      occurredAt,
      patch: { status: "working" },
      spanId: actionSpanId,
    });
    recordPrPhaseBoundaryInTransaction(input.store.db, {
      boundary: "acquired",
      campaign: activated,
      leaseId: input.leaseId,
      occurredAt,
    });
    return activated;
  });
}

/** Releases a settled PR activation and records its closing timeline boundary. */
export function releasePrCampaign(input: ReleasePrCampaignInput): ReleasePrCampaignResult {
  return immediateTransaction(input.store.db, () => {
    requireCampaignLease(input);
    const campaign = requireCampaign(input.store, input.campaignId);
    if (campaign.project_id !== input.projectId) {
      throw new Error(`PR campaign ${campaign.campaign_id} belongs to ${campaign.project_id}, not ${input.projectId}`);
    }
    if (campaign.status !== "working") {
      throw new Error(`pr.release requires working status; ${campaign.campaign_id} is ${campaign.status}`);
    }
    const lease = requireActiveLease(input.store, input.leaseId, input.projectId);
    if (lease.blockers.length > 0) {
      throw new Error(
        `PR campaign ${campaign.campaign_id} cannot release with dispatch blockers: ${lease.blockers.map((entry) => entry.code).join(", ")}`,
      );
    }
    const unsettled = input.store.db
      .query(
        `SELECT
           (SELECT COUNT(*) FROM pr_series WHERE campaign_id = ? AND status = 'revising') AS revising,
           (SELECT COUNT(*) FROM pr_work_items
              JOIN pr_series ON pr_series.series_id = pr_work_items.series_id
              WHERE pr_series.campaign_id = ? AND pr_work_items.status = 'in_progress') AS in_progress`,
      )
      .get(campaign.campaign_id, campaign.campaign_id) as { in_progress: number; revising: number };
    if (Number(unsettled.revising) > 0 || Number(unsettled.in_progress) > 0) {
      throw new Error(
        `PR campaign ${campaign.campaign_id} cannot release while ${Number(unsettled.revising)} series revise and ${Number(unsettled.in_progress)} work items are in progress`,
      );
    }

    const occurredAt = input.occurredAt ?? currentTime();
    const actionSpanId = input.spanId ?? newSpanId();
    const releasedCampaign = transitionPrCampaign(input.store, campaign.campaign_id, {
      actor: "operator",
      causationId: input.causationId,
      commandId: input.commandId,
      correlationId: input.correlationId,
      expectedRevision: campaign.revision,
      occurredAt,
      patch: { status: "in_review" },
      spanId: actionSpanId,
    });
    recordPrPhaseBoundaryInTransaction(input.store.db, {
      boundary: "released",
      campaign: releasedCampaign,
      leaseId: input.leaseId,
      occurredAt,
    });
    const projectState = releaseDispatch(input.store, {
      actor: input.actor ?? "operator",
      causationId: releasedCampaign.caused_by_event_id,
      commandId: input.commandId,
      correlationId: input.correlationId,
      leaseId: input.leaseId,
      now: occurredAt,
      projectId: input.projectId,
      spanId: actionSpanId,
    });
    if (projectState.active_workflow?.lease_id === input.leaseId) {
      throw new Error(`Dispatch lease ${input.leaseId} was not released`);
    }
    return { campaign: releasedCampaign, projectState };
  });
}
