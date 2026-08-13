import { createHash, randomUUID } from "node:crypto";
import {
  immediateTransaction,
  now as currentTime,
  type StateStore,
} from "@server/core/orchestrator-state";
import { appendProjectEvent, type JsonObject } from "@server/core/project-state/events.js";
import { requireActiveLease } from "@server/core/project-state";
import { getPrCampaign, getPrSeries } from "./state.js";
import { ingestPrFeedback } from "./work-items.js";
import type { PrEventType, PrSeriesState, PrSeriesStatus } from "./types.js";

export interface AdoptLegacyPrSeriesInput {
  campaignId: string;
  commandId: string;
  correlationId?: string;
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

function eventPayload(
  record: JsonObject,
  status: PrSeriesStatus,
  branch: string,
  batchIndex: number,
  upstreamPrNumber: number | null,
): JsonObject {
  const common: JsonObject = {
    adoption: "legacy_pr_records",
    batch_index: batchIndex,
    branch,
    previous_status: null,
    status,
  };
  if (status === "prepared") return common;
  if (status === "published") return { ...common, upstream_pr_number: upstreamPrNumber };
  if (status === "changes_requested" || status === "approved") {
    return { ...common, review_decision: status === "approved" ? "APPROVED" : "CHANGES_REQUESTED", upstream_pr_number: upstreamPrNumber };
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
      const traceId = `trace-pr-series-${seriesId}`;
      const event = appendProjectEvent(input.store.db, {
        actor: "operator",
        causationId: `${input.commandId}:series:${seriesId}`,
        correlationId: input.correlationId ?? campaign.campaign_id,
        eventType: eventType(status),
        occurredAt,
        payload: eventPayload(record, status, branch, batchIndex, upstreamPrNumber),
        projectId: campaign.project_id,
        spanId: input.spanId ?? `span-${randomUUID()}`,
        subjectId: seriesId,
        subjectKind: "pr_series",
        traceId,
      });
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
          traceId,
          event.eventId,
          occurredAt,
        );
      if (observedStatus === "changes_requested") {
        ingestPrFeedback(input.store, {
          actor: "operator",
          commandId: `${input.commandId}:feedback:${seriesId}`,
          expectedRevision: 0,
          items: [{
            itemId: stableWorkItemId(seriesId),
            sourceKind: "legacy_pr_status",
            sourceId: `pr-${upstreamPrNumber}:changes_requested`,
            summary: "Legacy PR records reported changes requested; retained artifact contains the detailed evidence.",
          }],
          occurredAt,
          seriesId,
        });
      }
      const saved = getPrSeries(input.store, seriesId);
      if (!saved) throw new Error(`Legacy PR series was not recorded: ${seriesId}`);
      adopted.push(saved);
    }
    return { adopted, skippedSeriesIds };
  });
}
