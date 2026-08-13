import type { Database } from "bun:sqlite";

type SyncEnvelopeValue = bigint | boolean | null | number | string | Uint8Array;

export interface SyncEnvelopeCasInput {
  blockersJson?: string;
  eventId: string;
  eventSequence: number;
  expectedRevision: number;
  intakeJson?: string;
  prReconciliationJson?: string;
  publicationJson?: string | null;
  stagingJson?: string | null;
  status?: string;
  syncId: string;
  updatedAt: string;
}

/** Applies one already-appended event to the sync envelope under revision CAS. */
export function casSyncEnvelope(db: Database, input: SyncEnvelopeCasInput): boolean {
  const assignments = [
    "revision = ?",
    "caused_by_event_id = ?",
    "latest_event_sequence = ?",
    "updated_at = ?",
  ];
  const values: SyncEnvelopeValue[] = [
    input.expectedRevision + 1,
    input.eventId,
    input.eventSequence,
    input.updatedAt,
  ];
  const add = (column: string, value: SyncEnvelopeValue | undefined): void => {
    if (value === undefined) return;
    assignments.push(`${column} = ?`);
    values.push(value);
  };
  add("status", input.status);
  add("blockers_json", input.blockersJson);
  add("intake_json", input.intakeJson);
  add("staging_json", input.stagingJson);
  add("pr_reconciliation_json", input.prReconciliationJson);
  add("publication_json", input.publicationJson);
  const result = db
    .query(`UPDATE sync_state SET ${assignments.join(", ")} WHERE sync_id = ? AND revision = ?`)
    .run(...values, input.syncId, input.expectedRevision);
  return result.changes === 1;
}
