import { createHash } from "node:crypto";
import {
  immediateTransaction,
  now as currentTime,
  type StateStore,
} from "@server/core/orchestrator-state";
import { appendProjectEvent, eventSpan, newSpanId, type JsonObject } from "@server/core/project-state/events.js";
import { requireActiveLease } from "@server/core/project-state";
import { getPrCampaign, getPrSeries, transitionPrSeries } from "./state.js";
import type { PrEventType, PrSeriesState, PrSeriesStatus } from "./types.js";

export interface AdoptLegacyPrSeriesInput {
  campaignId: string;
  causationId?: string;
  commandId: string;
  correlationId: string;
  discoveredBranches?: string[];
  leaseId: string;
  occurredAt?: string;
  projectId: string;
  recordsPayload: Record<string, unknown>;
  spanId?: string;
  store: StateStore;
}

export interface AdoptLegacyPrSeriesResult {
  adopted: PrSeriesState[];
  skippedSeriesIds: string[];
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown): string[] {
  return asArray(value).map(text).filter(Boolean);
}

function splitSeriesBranch(branch: string): boolean {
  return /^codex\/split-\d+(?:-|$)/.test(branch);
}

function stableSeriesId(campaignId: string, branch: string): string {
  const digest = createHash("sha256").update(`${campaignId}\0${branch}`).digest("hex").slice(0, 24);
  return `pr-series-legacy-${digest}`;
}

function stableWorkItemId(seriesId: string): string {
  const digest = createHash("sha256").update(`${seriesId}\0legacy-changes-requested`).digest("hex").slice(0, 24);
  return `pr-work-item-${digest}`;
}

function recordStatus(record: JsonObject): PrSeriesStatus {
  const github = asObject(record.github);
  const review = asObject(record.review);
  const raw = text(github.status) || text(record.status) || "planned";
  const normalized = raw.toLowerCase();
  const reviewDecision = (text(record.reviewDecision) || text(github.reviewDecision)).toUpperCase();
  const reviewSubState = text(review.subState).toLowerCase();
  if (normalized === "merged") return "merged";
  if (normalized === "closed") return "closed";
  if (normalized === "changes_requested" || reviewSubState === "changes_requested") return "changes_requested";
  if (normalized === "approved" || reviewDecision === "APPROVED") return "approved";
  if (["draft", "open", "branch_pushed", "published"].includes(normalized)) return "published";
  return "prepared";
}

function eventType(status: PrSeriesStatus): PrEventType {
  switch (status) {
    case "prepared": return "pr.series_prepared";
    case "published": return "pr.series_published";
    case "changes_requested": return "pr.series_changes_requested";
    case "approved": return "pr.series_approved";
    case "merged": return "pr.series_merged";
    case "closed": return "pr.series_closed";
    case "revising": return "pr.series_revising";
  }
}

function requiredApprovalEvidence(record: JsonObject, branch: string, field: string): string {
  if (!Object.prototype.hasOwnProperty.call(record, field)) {
    throw new Error(`Approved legacy PR series ${branch} is missing ${field}`);
  }
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Approved legacy PR series ${branch} requires ${field} to be a string`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Approved legacy PR series ${branch} requires non-empty ${field}`);
  }
  return normalized;
}

function eventPayload(
  record: JsonObject,
  status: PrSeriesStatus,
  branch: string,
  batchIndex: number,
  upstreamPrNumber: number | null,
): JsonObject {
  if (status === "prepared") {
    return {
      adoption: "legacy_pr_records",
      batch_index: batchIndex,
      branch,
      from_status: null,
      to_status: "prepared",
    };
  }
  const common: JsonObject = {
    adoption: "legacy_pr_records",
    batch_index: batchIndex,
    branch,
    from_status: status === "published" ? "prepared" : "published",
    to_status: status,
  };
  if (status === "published") return { ...common, upstream_pr_number: upstreamPrNumber };
  if (status === "changes_requested") {
    return { ...common, review_decision: "CHANGES_REQUESTED", upstream_pr_number: upstreamPrNumber };
  }
  if (status === "approved") {
    return {
      ...common,
      approval_source_identity: requiredApprovalEvidence(record, branch, "approvalSourceIdentity"),
      approved_revision: requiredApprovalEvidence(record, branch, "approvedRevision"),
      approving_actor: requiredApprovalEvidence(record, branch, "approvingActor"),
      upstream_pr_number: upstreamPrNumber,
    };
  }
  if (status === "merged") {
    const github = asObject(record.github);
    const mergeCommit = asObject(github.mergeCommit);
    return {
      ...common,
      merged_upstream_revision: text(mergeCommit.oid) || `legacy-observed-pr-${upstreamPrNumber}`,
      upstream_pr_number: upstreamPrNumber,
    };
  }
  return { ...common, close_reason: "legacy_observed_closed", closing_actor: "operator" };
}

export function adoptLegacyPrSeries(input: AdoptLegacyPrSeriesInput): AdoptLegacyPrSeriesResult {
  return immediateTransaction(input.store.db, () => {
    const campaign = getPrCampaign(input.store, input.campaignId);
    if (!campaign) throw new Error(`PR campaign not found: ${input.campaignId}`);
    if (campaign.project_id !== input.projectId) {
      throw new Error(`PR campaign ${campaign.campaign_id} belongs to ${campaign.project_id}, not ${input.projectId}`);
    }
    if (campaign.status !== "working") {
      throw new Error(`pr.adopt_legacy requires a working campaign; ${campaign.campaign_id} is ${campaign.status}`);
    }
    const lease = requireActiveLease(input.store, input.leaseId, input.projectId);
    if (lease.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
      throw new Error(`PR campaign ${campaign.campaign_id} does not own dispatch lease ${input.leaseId}`);
    }

    const records = asArray(input.recordsPayload.records).map(asObject);
    const recordsByBranch = new Map<string, JsonObject>();
    const terminalBranches = new Set<string>();
    for (const record of records) {
      const branch = text(record.branch);
      if (!splitSeriesBranch(branch)) continue;
      if (["merged", "closed"].includes(recordStatus(record))) {
        terminalBranches.add(branch);
        continue;
      }
      if (recordsByBranch.has(branch)) throw new Error(`Legacy PR records contain duplicate branch ${branch}`);
      recordsByBranch.set(branch, record);
    }
    for (const branchValue of input.discoveredBranches ?? []) {
      const branch = text(branchValue);
      if (splitSeriesBranch(branch) && !terminalBranches.has(branch) && !recordsByBranch.has(branch)) {
        recordsByBranch.set(branch, { branch });
      }
    }
    const ordered = [...recordsByBranch.entries()].sort(([left], [right]) => left.localeCompare(right));
    if (ordered.length === 0) throw new Error("No codex/split-* legacy PR series were found to adopt");

    const adopted: PrSeriesState[] = [];
    const skippedSeriesIds: string[] = [];
    const occurredAt = input.occurredAt ?? currentTime();
    const correlationId = text(input.correlationId);
    if (correlationId !== campaign.campaign_id) {
      throw new Error(`PR event correlation_id must equal campaign id ${campaign.campaign_id}`);
    }
    const actionSpanId = input.spanId ?? newSpanId();
    let adoptionRootEventId: string | null = null;
    for (const [index, [branch, record]] of ordered.entries()) {
      const existing = input.store.db
        .query("SELECT series_id FROM pr_series WHERE campaign_id = ? AND branch = ?")
        .get(campaign.campaign_id, branch) as { series_id: string } | null;
      if (existing) {
        skippedSeriesIds.push(existing.series_id);
        continue;
      }
      const seriesId = stableSeriesId(campaign.campaign_id, branch);
      const collision = input.store.db
        .query("SELECT branch FROM pr_series WHERE series_id = ?")
        .get(seriesId) as { branch: string } | null;
      if (collision) {
        throw new Error(`Legacy PR series id collision: ${seriesId} already names ${collision.branch}`);
      }
      const observedStatus = recordStatus(record);
      const status = observedStatus === "changes_requested" ? "published" : observedStatus;
      const github = asObject(record.github);
      const upstreamPrNumber = number(record.prNumber) ?? number(github.prNumber);
      if (status !== "prepared" && (!Number.isInteger(upstreamPrNumber) || Number(upstreamPrNumber) < 1)) {
        throw new Error(`Legacy PR series ${branch} is ${status} without an upstream PR number`);
      }
      const batch = asObject(record.batch);
      const ordinal = number(batch.ordinal) ?? index + 1;
      const batchIndex = Math.floor(Math.max(0, Math.trunc(ordinal) - 1) / campaign.publication_policy.batch_size);
      const targetUnits = [...new Set([...stringArray(record.files), ...stringArray(record.supportFiles)])];
      const validation = asObject(record.validation);
      const event = appendProjectEvent(input.store.db, {
        actor: status === "approved" ? "external_observer" : "operator",
        causationId: adoptionRootEventId ?? input.causationId ?? input.commandId,
        correlationId,
        eventType: eventType(status),
        occurredAt,
        payload: eventPayload(record, status, branch, batchIndex, upstreamPrNumber),
        projectId: campaign.project_id,
        ...eventSpan(actionSpanId),
        subjectId: seriesId,
        subjectKind: "pr_series",
        traceId: campaign.trace_id,
      });
      adoptionRootEventId ??= event.eventId;
      input.store.db
        .query(
          `INSERT INTO pr_series (
             series_id, campaign_id, revision, batch_index, status, branch,
             upstream_pr_number, target_units_json, last_validation_json,
             trace_id, caused_by_event_id, blockers_json, updated_at
           ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
        )
        .run(
          seriesId,
          campaign.campaign_id,
          batchIndex,
          status,
          branch,
          upstreamPrNumber,
          JSON.stringify(targetUnits),
          Object.keys(validation).length > 0 ? JSON.stringify(validation) : null,
          campaign.trace_id,
          event.eventId,
          occurredAt,
        );
      if (observedStatus === "changes_requested") {
        const itemId = stableWorkItemId(seriesId);
        const sourceKind = "legacy_pr_status";
        const sourceId = `pr-${upstreamPrNumber}:changes_requested`;
        input.store.db
          .query(
            `INSERT INTO pr_work_items (
               item_id, series_id, source_kind, source_id, status,
               summary, created_at, resolved_at
             ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL)`,
          )
          .run(
            itemId,
            seriesId,
            sourceKind,
            sourceId,
            "Legacy PR records reported changes requested; retained artifact contains the detailed evidence.",
            occurredAt,
          );
        const feedback = transitionPrSeries(input.store, seriesId, {
          actor: "external_observer",
          causationId: event.eventId,
          commandId: input.commandId,
          correlationId,
          eventType: "pr.feedback_ingested",
          expectedRevision: 0,
          occurredAt,
          patch: { status: "published" },
          payload: {
            ingesting_actor: "external_observer",
            review_source_identities: [`${sourceKind}:${sourceId}`],
            work_item_ids: [itemId],
          },
          spanId: actionSpanId,
        });
        transitionPrSeries(input.store, seriesId, {
          actor: "external_observer",
          causationId: feedback.caused_by_event_id,
          commandId: input.commandId,
          correlationId,
          eventType: "pr.series_changes_requested",
          expectedRevision: feedback.revision,
          occurredAt,
          patch: { status: "changes_requested" },
          spanId: actionSpanId,
        });
      }
      const saved = getPrSeries(input.store, seriesId);
      if (!saved) throw new Error(`Legacy PR series was not recorded: ${seriesId}`);
      adopted.push(saved);
    }
    return { adopted, skippedSeriesIds };
  });
}
