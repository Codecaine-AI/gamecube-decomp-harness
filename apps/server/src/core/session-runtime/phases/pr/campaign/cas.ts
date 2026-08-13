import type { Database } from "bun:sqlite";

type EnvelopeValue = bigint | boolean | null | number | string | Uint8Array;

export interface PrCampaignEnvelopeCasInput {
  blockersJson?: string;
  campaignId: string;
  closedAt?: string | null;
  eventId: string;
  eventSequence: number;
  expectedRevision: number;
  status?: string;
}

export interface PrSeriesEnvelopeCasInput {
  blockersJson?: string;
  eventId: string;
  expectedRevision: number;
  lastValidationJson?: string | null;
  seriesId: string;
  status?: string;
  updatedAt: string;
  upstreamPrNumber?: number | null;
}

/** Applies one already-appended event to the campaign envelope under revision CAS. */
export function casPrCampaignEnvelope(db: Database, input: PrCampaignEnvelopeCasInput): boolean {
  const assignments = ["revision = ?", "caused_by_event_id = ?", "latest_event_sequence = ?"];
  const values: EnvelopeValue[] = [input.expectedRevision + 1, input.eventId, input.eventSequence];
  const add = (column: string, value: EnvelopeValue | undefined): void => {
    if (value === undefined) return;
    assignments.push(`${column} = ?`);
    values.push(value);
  };
  add("status", input.status);
  add("blockers_json", input.blockersJson);
  add("closed_at", input.closedAt);
  const result = db
    .query(`UPDATE pr_campaigns SET ${assignments.join(", ")} WHERE campaign_id = ? AND revision = ?`)
    .run(...values, input.campaignId, input.expectedRevision);
  return result.changes === 1;
}

/** Applies one already-appended event to a series envelope under revision CAS. */
export function casPrSeriesEnvelope(db: Database, input: PrSeriesEnvelopeCasInput): boolean {
  const assignments = ["revision = ?", "caused_by_event_id = ?", "updated_at = ?"];
  const values: EnvelopeValue[] = [input.expectedRevision + 1, input.eventId, input.updatedAt];
  const add = (column: string, value: EnvelopeValue | undefined): void => {
    if (value === undefined) return;
    assignments.push(`${column} = ?`);
    values.push(value);
  };
  add("status", input.status);
  add("blockers_json", input.blockersJson);
  add("upstream_pr_number", input.upstreamPrNumber);
  add("last_validation_json", input.lastValidationJson);
  const result = db
    .query(`UPDATE pr_series SET ${assignments.join(", ")} WHERE series_id = ? AND revision = ?`)
    .run(...values, input.seriesId, input.expectedRevision);
  return result.changes === 1;
}
