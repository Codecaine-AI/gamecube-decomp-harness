import type { Database } from "bun:sqlite";
import type { SessionTimelineEntry } from "@server/core/project-session/types.js";
import type { JsonObject } from "@server/core/project-state/events.js";
import type { PrCampaignState } from "./types.js";

type PrPhaseBoundary = "acquired" | "released";

interface SessionRow {
  project_id: string;
  revision: number;
  session_uuid: string;
  status: string;
}

interface EventRow {
  event_type: string;
  project_id: string;
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
 * as the session transition cause, matching the shared-event boundary writers
 * in project-session/timeline.ts.
 */
export function recordPrPhaseBoundaryInTransaction(
  db: Database,
  input: RecordPrPhaseBoundaryInput,
): SessionTimelineEntry {
  if (!db.inTransaction) {
    throw new Error("PR phase timeline boundaries require an active transaction");
  }
  const campaignId = requiredText(input.campaign.campaign_id, "campaignId");
  const leaseId = requiredText(input.leaseId, "leaseId");
  const occurredAt = requiredText(input.occurredAt, "occurredAt");
  const eventId = requiredText(input.campaign.caused_by_event_id, "campaign caused_by_event_id");
  const expectedEventType = input.boundary === "acquired"
    ? "pr.campaign_working"
    : "pr.campaign_in_review";
  const event = db
    .query(
      `SELECT event_type, project_id, subject_kind, subject_id
       FROM project_events WHERE event_id = ?`,
    )
    .get(eventId) as EventRow | null;
  if (
    !event ||
    event.event_type !== expectedEventType ||
    event.project_id !== input.campaign.project_id ||
    event.subject_kind !== "pr_campaign" ||
    event.subject_id !== campaignId
  ) {
    throw new Error(
      `PR phase ${input.boundary} must reuse ${expectedEventType} for campaign ${campaignId}`,
    );
  }

  const session = db
    .query(
      `SELECT project_id, session_uuid, revision, status
       FROM project_sessions WHERE session_uuid = ?`,
    )
    .get(input.campaign.session_uuid) as SessionRow | null;
  if (!session) throw new Error(`Project session not found for PR campaign ${campaignId}`);
  if (session.project_id !== input.campaign.project_id) {
    throw new Error(
      `PR campaign ${campaignId} belongs to ${input.campaign.project_id}, but session ${session.session_uuid} belongs to ${session.project_id}`,
    );
  }
  if (session.status !== "active" && session.status !== "blocked") {
    throw new Error(`Project session ${session.session_uuid} cannot record PR work while ${session.status}`);
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
      `INSERT INTO session_timeline_entries (
         session_uuid, entry_kind, entry_id, occurred_at, payload_json, caused_by_event_id
       ) VALUES (?, 'pr_phase', ?, ?, ?, ?)`,
    )
    .run(session.session_uuid, entryId, occurredAt, JSON.stringify(payload), eventId);
  const updated = db
    .query(
      `UPDATE project_sessions
       SET revision = ?, caused_by_event_id = ?, updated_at = ?
       WHERE session_uuid = ? AND revision = ?`,
    )
    .run(session.revision + 1, eventId, occurredAt, session.session_uuid, session.revision);
  if (updated.changes !== 1) {
    throw new Error(`Stale project session revision ${session.revision} for ${session.session_uuid}`);
  }
  return {
    id: Number(inserted.lastInsertRowid),
    session_uuid: session.session_uuid,
    entry_kind: "pr_phase",
    entry_id: entryId,
    occurred_at: occurredAt,
    payload,
    caused_by_event_id: eventId,
  };
}
