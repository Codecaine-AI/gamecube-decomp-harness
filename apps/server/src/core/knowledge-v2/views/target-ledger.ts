import type { KnowledgeStoreHandle } from "../records/index.js";
import type { EventCause, EventKind, EventRefKind, Outcome, WorkerErrorType, Integration, IntegrationDetail } from "../storage/schema.js";

export interface LedgerWorkerRun {
  id: string;
  goal: string;
  baseline: Record<string, unknown>;
  summary: string | null;
  runId: string | null;
  workerStateId: string | null;
  finalOutcome: Outcome;
  errorType: WorkerErrorType | null;
  integration: Integration | null;
  integrationDetail: IntegrationDetail | null;
  startedAt: string;
  endedAt: string | null;
  closedAt: string;
}

export type TargetLedgerEntry =
  | { type: "submission"; timestamp: string; id: string; seq: number; description: string; hypothesis: string | null; score: number; runtimeRef: string | null; workerRun: LedgerWorkerRun; isRegression: false }
  | { type: "pull_request"; timestamp: string; id: string; prRef: string; summary: string; outcome: Outcome; attribution: "target" | "unit"; isRegression: false }
  | { type: "event"; timestamp: string; id: string; kind: EventKind; cause: EventCause | null; summary: string; refs: Array<{ refKind: EventRefKind; refId: string }>; isRegression: boolean };

interface SubmissionRow {
  submission_id: string; seq: number; description: string; hypothesis: string | null; score: number;
  submitted_at: string; runtime_ref: string | null; worker_run_id: string; goal: string; baseline: string;
  run_id: string | null; worker_state_id: string | null; final_outcome: Outcome; error_type: WorkerErrorType | null;
  integration: Integration | null; integration_detail: string | null;
  started_at: string; ended_at: string | null; closed_at: string;
  narrative_summary: string | null;
}

interface PullRequestRow {
  id: string;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
  attribution: "target" | "unit";
}

/** Returns target activity newest first. Equal timestamps are ordered by type and id. */
export function targetLedger(store: KnowledgeStoreHandle, targetId: string): TargetLedgerEntry[] {
  const submissionEntries: TargetLedgerEntry[] = store.db.query<SubmissionRow, [string]>(`
    SELECT s.id AS submission_id, s.seq, s.description, s.hypothesis, s.score, s.submitted_at, s.runtime_ref,
      w.id AS worker_run_id, w.goal, w.baseline, w.run_id, w.worker_state_id, w.final_outcome,
      w.error_type, w.integration, w.integration_detail, w.started_at, w.ended_at, w.closed_at,
      n.summary AS narrative_summary
    FROM submission s JOIN worker_run w ON w.id = s.worker_run_id
    LEFT JOIN run_narrative n ON n.worker_run_id = w.id
    WHERE w.target_id = ?
  `).all(targetId).map((row) => ({
    type: "submission", timestamp: row.submitted_at, id: row.submission_id, seq: row.seq,
    description: row.description, hypothesis: row.hypothesis, score: row.score, runtimeRef: row.runtime_ref,
    workerRun: { id: row.worker_run_id, goal: row.goal, baseline: parseBaseline(row.baseline), runId: row.run_id,
      summary: row.narrative_summary,
      workerStateId: row.worker_state_id, finalOutcome: row.final_outcome, errorType: row.error_type,
      integration: row.integration, integrationDetail: parseIntegrationDetail(row.integration_detail),
      startedAt: row.started_at, endedAt: row.ended_at, closedAt: row.closed_at },
    isRegression: false,
  }));
  const prEntries: TargetLedgerEntry[] = store.db.query<PullRequestRow, [string]>(`
    SELECT p.id, p.pr_ref, p.summary, p.outcome, p.merged_at,
      CASE WHEN p.target_id = t.id THEN 'target' ELSE 'unit' END AS attribution
    FROM target t
    JOIN pull_request p
      ON p.target_id = t.id OR p.entity_id = t.unit_entity_id
    WHERE t.id = ?
  `).all(targetId).map((row) => ({
    type: "pull_request", timestamp: row.merged_at, id: row.id, prRef: row.pr_ref,
    summary: row.summary, outcome: row.outcome, attribution: row.attribution, isRegression: false,
  }));
  const eventEntries: TargetLedgerEntry[] = store.db.query<any, [string]>(`
    SELECT e.*, r.ref_kind, r.ref_id FROM event e
    LEFT JOIN event_ref r ON r.event_id = e.id WHERE e.target_id = ?
    ORDER BY e.id, r.ref_kind, r.ref_id
  `).all(targetId).reduce<TargetLedgerEntry[]>((entries, row) => {
    let entry = entries.find((candidate) => candidate.type === "event" && candidate.id === row.id);
    if (!entry) {
      entry = { type: "event", timestamp: row.created_at, id: row.id, kind: row.kind, cause: row.cause,
        summary: row.summary, refs: [], isRegression: row.kind === "regression" };
      entries.push(entry);
    }
    if (entry.type === "event" && row.ref_kind !== null) entry.refs.push({ refKind: row.ref_kind, refId: row.ref_id });
    return entries;
  }, []);
  return [...submissionEntries, ...prEntries, ...eventEntries].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

function parseBaseline(value: string | Record<string, unknown>): Record<string, unknown> {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function parseIntegrationDetail(value: string | null): IntegrationDetail | null {
  return value === null ? null : JSON.parse(value) as IntegrationDetail;
}
