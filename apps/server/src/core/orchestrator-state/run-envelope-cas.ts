import type { Database } from "bun:sqlite";

type RunEnvelopeValue = bigint | boolean | null | number | string | Uint8Array;

export interface RunEnvelopeCasInput {
  blockersJson?: string;
  desiredWorkers?: number;
  eventId: string;
  expectedRevision: number;
  headRevision?: string | null;
  inputsJson?: string | null;
  remoteApplicationIdsJson?: string;
  runId: string;
  status?: string;
  stopRequestJson?: string | null;
  terminalReason?: string | null;
}

function canonicalJson(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (!child || typeof child !== "object") return child;
    return Object.fromEntries(
      Object.entries(child as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sort(nested)]),
    );
  };
  return JSON.stringify(sort(value));
}

function canonicalInputs(inputsJson: string | null): string {
  return canonicalJson(inputsJson === null ? null : JSON.parse(inputsJson));
}

/** Applies one already-appended event to the run envelope under revision CAS. */
export function casRunEnvelope(db: Database, input: RunEnvelopeCasInput): boolean {
  if (input.inputsJson !== undefined) {
    const current = db.query("SELECT status, inputs_json FROM runs WHERE id = ? AND revision = ?").get(input.runId, input.expectedRevision) as
      | { status: string; inputs_json: string | null }
      | null;
    if (!current) return false;
    const activationAccepted = input.status === "active";
    const alreadyActivated = current.status !== "draft" && current.status !== "ready";
    if (
      (activationAccepted || alreadyActivated) &&
      canonicalInputs(input.inputsJson) !== canonicalInputs(current.inputs_json)
    ) {
      throw new Error(`Run ${input.runId} inputs are immutable after activation`);
    }
  }
  const assignments = ["revision = ?", "caused_by_event_id = ?"];
  const values: RunEnvelopeValue[] = [input.expectedRevision + 1, input.eventId];
  const add = (column: string, value: RunEnvelopeValue | undefined): void => {
    if (value === undefined) return;
    assignments.push(`${column} = ?`);
    values.push(value);
  };
  add("status", input.status);
  add("desired_workers", input.desiredWorkers);
  add("blockers_json", input.blockersJson);
  add("head_revision", input.headRevision);
  add("inputs_json", input.inputsJson);
  add("remote_application_ids_json", input.remoteApplicationIdsJson);
  add("stop_request_json", input.stopRequestJson);
  add("terminal_reason", input.terminalReason);
  const result = db
    .query(`UPDATE runs SET ${assignments.join(", ")} WHERE id = ? AND revision = ?`)
    .run(...values, input.runId, input.expectedRevision);
  return result.changes === 1;
}
