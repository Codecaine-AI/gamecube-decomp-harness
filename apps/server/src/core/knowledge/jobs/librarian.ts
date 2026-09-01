import { existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

import { buildAttemptRecord, type AttemptCheckpointRow, type AttemptWorkerStateRow } from "@server/core/knowledge/attempt-view.js";
import { shortHash } from "@server/core/knowledge/graph/util";
import {
  type LearningEvidence,
  type LearningOrigin,
  type LearningRecord,
  type LearningScope,
} from "@server/core/knowledge/ledger.js";
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

interface LibrarianLearningSubject {
  symbol?: string;
  file?: string;
  area?: string;
}

export interface ValidLibrarianLearning {
  statement: string;
  subject: LibrarianLearningSubject;
  scope: LearningScope;
  origin: LearningOrigin;
  evidence: LearningEvidence[];
  confidence: number;
}

export interface LibrarianReportValidation {
  ok: boolean;
  errors: string[];
  learnings: ValidLibrarianLearning[];
}

const LEARNING_SCOPES = new Set<LearningScope>(["symbol", "file", "area", "general"]);
const LEARNING_ORIGINS = new Set<LearningOrigin>(["human_extracted", "ai_inferred"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() ? value : undefined;
}

export function validateLibrarianReport(value: unknown): LibrarianReportValidation {
  const errors: string[] = [];
  const learnings: ValidLibrarianLearning[] = [];
  let ok = true;

  if (!isObject(value)) {
    return { ok: false, errors: ["report must be a JSON object"], learnings };
  }

  if (value.schema_version === undefined) {
    errors.push("warning: missing schema_version; accepting report as librarian_v1");
  } else if (value.schema_version !== "librarian_v1") {
    errors.push('schema_version must be "librarian_v1"');
    ok = false;
  }

  if (!Array.isArray(value.learnings)) {
    errors.push("learnings must be an array");
    return { ok: false, errors, learnings };
  }

  value.learnings.forEach((candidate, index) => {
    const prefix = `learnings[${index}]`;
    if (!isObject(candidate)) {
      errors.push(`${prefix} must be an object`);
      ok = false;
      return;
    }

    const statement = nonEmptyString(candidate.statement);
    const scope = candidate.scope;
    const origin = candidate.origin;
    const confidence = candidate.confidence;
    let valid = true;

    if (!statement) {
      errors.push(`${prefix}.statement must be a non-empty string`);
      valid = false;
    }
    if (typeof scope !== "string" || !LEARNING_SCOPES.has(scope as LearningScope)) {
      errors.push(`${prefix}.scope must be one of symbol, file, area, or general`);
      valid = false;
    }
    if (typeof origin !== "string" || !LEARNING_ORIGINS.has(origin as LearningOrigin)) {
      errors.push(`${prefix}.origin must be human_extracted or ai_inferred`);
      valid = false;
    }
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push(`${prefix}.confidence must be a number from 0 through 1`);
      valid = false;
    }

    const evidence: LearningEvidence[] = [];
    if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
      errors.push(`${prefix}.evidence must be a non-empty array`);
      valid = false;
    } else {
      candidate.evidence.forEach((item, evidenceIndex) => {
        const evidencePrefix = `${prefix}.evidence[${evidenceIndex}]`;
        if (!isObject(item)) {
          errors.push(`${evidencePrefix} must be an object`);
          valid = false;
          return;
        }
        const type = typeof item.type === "string" ? item.type : undefined;
        const ref = nonEmptyString(item.ref);
        if (type === undefined) {
          errors.push(`${evidencePrefix}.type must be a string`);
          valid = false;
        }
        if (!ref) {
          errors.push(`${evidencePrefix}.ref must be a non-empty string`);
          valid = false;
        }
        if (type !== undefined && ref) evidence.push({ type, ref });
      });
    }

    if (!valid || !statement || typeof scope !== "string" || typeof origin !== "string" || typeof confidence !== "number") {
      ok = false;
      return;
    }

    const subjectValue = isObject(candidate.subject) ? candidate.subject : {};
    const symbol = nonEmptyString(subjectValue.symbol);
    const file = nonEmptyString(subjectValue.file);
    const area = nonEmptyString(subjectValue.area);
    learnings.push({
      statement,
      subject: {
        ...(symbol ? { symbol } : {}),
        ...(file ? { file } : {}),
        ...(area ? { area } : {}),
      },
      scope: scope as LearningScope,
      origin: origin as LearningOrigin,
      evidence,
      confidence,
    });
  });

  return { ok, errors, learnings };
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

export function learningRecord(learning: ValidLibrarianLearning, producedBy: string): LearningRecord {
  const subjectKey = learning.subject.symbol ?? learning.subject.file ?? learning.subject.area ?? "general";
  return {
    id: `learning:${learning.scope}:${subjectKey}:${shortHash(learning.statement)}`,
    origin: learning.origin,
    subject: {
      scope: learning.scope,
      ...learning.subject,
    },
    statement: learning.statement,
    evidence: learning.evidence,
    confidence: learning.confidence,
    produced_by: producedBy,
    status: "proposed",
  };
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
