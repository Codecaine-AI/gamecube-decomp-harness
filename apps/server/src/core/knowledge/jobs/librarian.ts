import { existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

import { buildAttemptRecord, type AttemptCheckpointRow, type AttemptWorkerStateRow } from "@server/core/knowledge/attempt-view.js";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { addPiSession, type StateStore } from "@server/core/cycle-runtime/run-state";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";

export interface LibrarianWorkerStateRow extends AttemptWorkerStateRow {
  run_id: string;
  epoch_id: string;
  epoch_target_id: string;
  worker_id: string;
  lifecycle_status: string;
  best_checkpoint_id: string | null;
  worker_session_ids_json: string;
  summary_json: string;
  target_claim_id: string | null;
  timeout_summary: string | null;
  error_summary: string | null;
}

export interface LibrarianCheckpointRow extends AttemptCheckpointRow {
  kind: "checkpoint";
  hard_gates_passed: number | boolean;
  selectable: number | boolean;
  selected: number | boolean;
  validation_status: string;
  failure_reasons_json: string;
  metadata_json: string;
}

interface PiSessionTranscriptRow {
  session_id: string;
  session_file: string | null;
  role: string;
  status: string;
}

export interface LibrarianTranscript {
  kind: "transcript_span";
  session_id: string;
  path: string | null;
  exists: boolean;
}

export interface LibrarianWorkerCondenseInput {
  worker_state: Record<string, unknown> & AttemptWorkerStateRow;
  checkpoints: LibrarianCheckpointRow[];
  attempt: ReturnType<typeof buildAttemptRecord>;
  transcripts: LibrarianTranscript[];
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() ? value : undefined;
}

function parseSessionIds(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => nonEmptyString(item)).filter((item): item is string => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

export function recordLibrarianSession(
  store: StateStore,
  globals: GlobalArgs,
  runId: string,
  result: Awaited<ReturnType<typeof runPiAgent>>,
): void {
  if (!runId) return;
  addPiSession({
    store,
    runId,
    role: "librarian",
    sessionId: result.sessionId,
    sessionFile: result.sessionFile,
    provider: globals.provider,
    model: globals.model,
    thinkingLevel: globals.thinkingLevel,
    status: result.failed ? "failed" : result.dryRun ? "dry_run" : "succeeded",
    outputPath: result.outputPath,
  });
}

export function loadWorkerCondenseInput(db: Database, workerStateId: string): LibrarianWorkerCondenseInput {
  const [workerRow] = db
    .query(
      `
        SELECT
          id, run_id, epoch_id, epoch_target_id, worker_id, target_key, target_claim_id,
          lifecycle_status, started_at, ended_at, baseline_score,
          best_checkpoint_id, best_score, exact, worker_session_ids_json,
          summary_json, timeout_summary, error_summary
        FROM worker_state
        WHERE id = ?
      `,
    )
    .all(workerStateId) as LibrarianWorkerStateRow[];
  if (!workerRow) throw new Error(`Worker state not found: ${workerStateId}`);

  const rawCheckpointRows = db
    .query(
      `
        SELECT
          id, worker_state_id, attempt_index, validation_time, old_score,
          new_score, delta, exact_match, hard_gates_passed,
          improved_over_baseline, selectable, selected, validation_status,
          failure_reasons_json, metadata_json
        FROM worker_checkpoints
        WHERE worker_state_id = ?
        ORDER BY attempt_index ASC, validation_time ASC
      `,
    )
    .all(workerStateId) as Omit<LibrarianCheckpointRow, "kind">[];
  const checkpointRows: LibrarianCheckpointRow[] = rawCheckpointRows.map((row) => ({
    kind: "checkpoint",
    ...row,
  }));

  const transcripts: LibrarianTranscript[] = parseSessionIds(workerRow.worker_session_ids_json).map((sessionId) => {
    const [sessionRow] = db
      .query("SELECT session_id, session_file, role, status FROM pi_sessions WHERE session_id = ?")
      .all(sessionId) as PiSessionTranscriptRow[];
    const path = sessionRow?.session_file ?? null;
    return {
      kind: "transcript_span",
      session_id: sessionRow?.session_id ?? sessionId,
      path,
      exists: path !== null && existsSync(path),
    };
  });

  const workerState = { ...workerRow } as Record<string, unknown> & AttemptWorkerStateRow;
  delete workerState.worker_session_ids_json;
  delete workerState.summary_json;
  return {
    worker_state: workerState,
    checkpoints: checkpointRows,
    attempt: buildAttemptRecord(workerRow, checkpointRows),
    transcripts,
  };
}
