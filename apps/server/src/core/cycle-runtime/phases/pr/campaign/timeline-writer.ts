import type { Database } from "bun:sqlite";
import type { CycleTimelineEntry } from "@server/core/cycle/types.js";
import type { JsonObject } from "@server/core/harness-state/events.js";
import type { PrCampaignState } from "./types.js";

type PrPhaseBoundary = "acquired" | "released";

interface CycleRow {
  game_id: string;
  revision: number;
  cycle_uuid: string;
  status: string;
}

interface EventRow {
  event_type: string;
  game_id: string;
  subject_id: string;
  subject_kind: string;
}

export interface RecordPrPhaseBoundaryInput {
  boundary: PrPhaseBoundary;
  campaign: PrCampaignState;
  leaseId: string;
  occurredAt: string;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

/**
 * Records one side of a PR activation while the caller's lease/campaign
 * transaction is still open. The campaign status event is deliberately reused
 * as the cycle transition cause, matching the shared-event boundary writers
 * in cycle/timeline.ts.
 */
export function recordPrPhaseBoundaryInTransaction(
  db: Database,
  input: RecordPrPhaseBoundaryInput,
): CycleTimelineEntry {
  if (!db.inTransaction) {
    throw new Error("PR phase timeline boundaries require an active transaction");
  }
  const campaignId = requiredText(input.campaign.campaign_id, "campaignId");
  const leaseId = requiredText(input.leaseId, "leaseId");
  const occurredAt = requiredText(input.occurredAt, "occurredAt");
  const eventId = requiredText(input.campaign.caused_by_event_id, "campaign caused_by_event_id");
  const expectedEventTypes = input.boundary === "acquired"
    ? ["pr.campaign_working"]
    : ["pr.campaign_in_review", "pr.campaign_recovered", "pr.campaign_closed"];
  const event = db
    .query(
      `SELECT event_type, game_id, subject_kind, subject_id
       FROM game_events WHERE event_id = ?`,
    )
    .get(eventId) as EventRow | null;
  if (
    !event ||
    !expectedEventTypes.includes(event.event_type) ||
    event.game_id !== input.campaign.game_id ||
    event.subject_kind !== "pr_campaign" ||
    event.subject_id !== campaignId
  ) {
    throw new Error(
      `PR phase ${input.boundary} must reuse ${expectedEventTypes.join(" or ")} for campaign ${campaignId}`,
    );
  }

  const cycle = db
    .query(
      `SELECT game_id, cycle_uuid, revision, status
       FROM cycles WHERE cycle_uuid = ?`,
    )
    .get(input.campaign.cycle_uuid) as CycleRow | null;
  if (!cycle) throw new Error(`Game cycle not found for PR campaign ${campaignId}`);
  if (cycle.game_id !== input.campaign.game_id) {
    throw new Error(
      `PR campaign ${campaignId} belongs to ${input.campaign.game_id}, but cycle ${cycle.cycle_uuid} belongs to ${cycle.game_id}`,
    );
  }
  if (cycle.status !== "active" && cycle.status !== "blocked") {
    throw new Error(`Game cycle ${cycle.cycle_uuid} cannot record PR work while ${cycle.status}`);
  }

  const entryId = `pr-phase:${leaseId}:${input.boundary}`;
  const payload: JsonObject = {
    activation_id: leaseId,
    boundary: input.boundary,
    campaign_id: campaignId,
    lease_id: leaseId,
  };
  const inserted = db
    .query(
      `INSERT INTO cycle_timeline_entries (
         cycle_uuid, entry_kind, entry_id, occurred_at, payload_json, caused_by_event_id
       ) VALUES (?, 'pr_phase', ?, ?, ?, ?)`,
    )
    .run(cycle.cycle_uuid, entryId, occurredAt, JSON.stringify(payload), eventId);
  const updated = db
    .query(
      `UPDATE cycles
       SET revision = ?, caused_by_event_id = ?, updated_at = ?
       WHERE cycle_uuid = ? AND revision = ?`,
    )
    .run(cycle.revision + 1, eventId, occurredAt, cycle.cycle_uuid, cycle.revision);
  if (updated.changes !== 1) {
    throw new Error(`Stale game cycle revision ${cycle.revision} for ${cycle.cycle_uuid}`);
  }
  return {
    id: Number(inserted.lastInsertRowid),
    cycle_uuid: cycle.cycle_uuid,
    entry_kind: "pr_phase",
    entry_id: entryId,
    occurred_at: occurredAt,
    payload,
    caused_by_event_id: eventId,
  };
}
