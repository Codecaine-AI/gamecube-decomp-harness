import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";

import { librarianPrompt } from "@server/core/agent-catalog/agents/knowledge/librarian";
import { buildAttemptRecord, type AttemptCheckpointRow, type AttemptWorkerStateRow } from "@server/core/knowledge/attempt-view.js";
import { shortHash } from "@server/core/knowledge/graph/util";
import {
  appendLearnings,
  defaultLedgerPath,
  type LearningEvidence,
  type LearningOrigin,
  type LearningRecord,
  type LearningScope,
} from "@server/core/knowledge/ledger.js";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { knowledgeCycleSessionId } from "./cycle-session.js";
import { stringArg } from "@server/core/game-registry/runtime-options.js";
import { addPiSession, openState, type StateStore } from "@server/core/cycle-runtime/run-state";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";

export interface LibrarianWorkerStateRow extends AttemptWorkerStateRow {
  run_id: string;
  epoch_id: string;
  epoch_target_id: string;
  worker_id: string;
  lifecycle_status: string;
  best_checkpoint_id: string | null;
  worker_session_ids_json: string;
  summary_json: string;
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
const DEFAULT_LIBRARIAN_TIMEOUT_SECONDS = 600;

export interface LibrarianCondenseDeps {
  runPiAgent?: typeof runPiAgent;
}

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
          id, run_id, epoch_id, epoch_target_id, worker_id, target_key,
          lifecycle_status, started_at, ended_at, baseline_score,
          best_checkpoint_id, best_score, exact, worker_session_ids_json,
          summary_json
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

export interface LibrarianCondensePublication {
  digest: string;
  provenance: { worker_state_id: string; ledger_path: string; learning_ids: string[]; output_path: string | null };
}

/** Programmatic materializer used by both the durable queue and the CLI wrapper. */
export async function kgLibrarianCondense(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  deps: LibrarianCondenseDeps = {},
): Promise<LibrarianCondensePublication> {
  const workerStateId = stringArg(args, "--worker-state-id", "").trim();
  if (!workerStateId) throw new Error("kg-librarian-condense requires --worker-state-id");

  const runId = stringArg(args, "--run-id", "");
  const ledgerPath = stringArg(args, "--ledger-path", defaultLedgerPath(globals.game?.gameId ?? "melee"));
  const store = openState(globals.stateDir);

  try {
    // This store remains an idle connection during the model call; no SQLite transaction spans the await.
    const {
      worker_state: workerState,
      checkpoints: checkpointRows,
      attempt: attemptRecord,
      transcripts,
    } = loadWorkerCondenseInput(store.db, workerStateId);
    const librarianBatch = {
      batch_id: `worker:${workerStateId}`,
      kind: "worker_run",
      run_id: runId,
      worker_state: workerState,
      checkpoints: checkpointRows,
      attempt: attemptRecord,
      transcripts,
    };

    const outputDir = resolve(globals.stateDir, "knowledge_librarian", new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(outputDir, { recursive: true });
    const timeoutMs = (globals.agentTimeoutSeconds || DEFAULT_LIBRARIAN_TIMEOUT_SECONDS) * 1_000;
    const startedAt = Date.now();
    const modelRun = (deps.runPiAgent ?? runPiAgent)({
      role: "librarian",
      cwd: globals.repoRoot,
      prompt: librarianPrompt({
        librarianBatch,
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        game: globals.game,
      }),
      outputDir,
      dryRun: globals.dryRunAgents,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      timeoutMs,
      toolContext: {
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        game: globals.game,
      },
      kernelContext: createMeleeKernelSpawnContext({
        kind: "knowledge-curation",
        gameId: globals.game?.gameId ?? globals.gameId,
        sessionId: knowledgeCycleSessionId({
          globals,
          db: store.db,
          fallback: runId || workerStateId,
        }),
        runId: runId || workerStateId,
        jobId: workerStateId,
        jobKind: "Condense",
        phase: "knowledge-curation",
        workingDir: globals.repoRoot,
        metadata: {
          workerStateId,
          checkpointCount: checkpointRows.length,
          transcriptCount: transcripts.length,
        },
      }),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol("librarian-timeout");
    const result = await Promise.race([
      modelRun,
      new Promise<typeof timedOut>((resolveTimeout) => {
        timer = setTimeout(() => resolveTimeout(timedOut), timeoutMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    if (result === timedOut) {
      void modelRun.catch(() => {});
      console.warn(
        `Librarian worker_state ${workerStateId} timed out after ${Date.now() - startedAt}ms; cooperative abort may not settle, so the underlying agent session may remain active`,
      );
      throw new Error(`librarian timed out after ${timeoutMs}ms`);
    }

    if (result.dryRun) {
      console.log(
        JSON.stringify({
          command: "kg-librarian-condense",
          dry_run: true,
          worker_state_id: workerStateId,
          target_key: workerState.target_key,
          checkpoint_count: checkpointRows.length,
          transcript_count: transcripts.length,
          output_dir: outputDir,
          system_prompt_path: result.systemPromptPath,
          user_prompt_path: result.userPromptPath,
          ledger_path: ledgerPath,
          learnings_appended: 0,
        }),
      );
      return { digest: `dry-run:${workerStateId}`, provenance: { worker_state_id: workerStateId, ledger_path: ledgerPath, learning_ids: [], output_path: result.outputPath ?? null } };
    }

    const parsed = parseJsonObject(result.rawText);
    const validation = parsed.object
      ? validateLibrarianReport(parsed.object)
      : { ok: false, errors: [], learnings: [] } satisfies LibrarianReportValidation;
    const records = validation.learnings.map((learning) =>
      learningRecord(learning, `librarian condense worker:${workerStateId}`),
    );
    const appendResult = appendLearnings(ledgerPath, records);
    recordLibrarianSession(store, globals, runId, result);

    console.log(
      JSON.stringify({
        command: "kg-librarian-condense",
        dry_run: false,
        worker_state_id: workerStateId,
        target_key: workerState.target_key,
        checkpoint_count: checkpointRows.length,
        transcript_count: transcripts.length,
        output_dir: outputDir,
        output_path: result.outputPath,
        failed: result.failed ?? false,
        parse_error: parsed.error ?? null,
        validation_errors: validation.errors,
        learnings_appended: appendResult.appended_records,
        ledger_path: ledgerPath,
        attempt_overlays: Array.isArray(parsed.object?.attempt_overlays) ? parsed.object.attempt_overlays.length : 0,
        verdicts: Array.isArray(parsed.object?.verdicts) ? parsed.object.verdicts.length : 0,
      }),
    );
    const learningIds = records.map((record) => record.id).sort();
    return {
      digest: `sha256:${createHash("sha256").update(JSON.stringify({ worker_state_id: workerStateId, learning_ids: learningIds })).digest("hex")}`,
      provenance: { worker_state_id: workerStateId, ledger_path: ledgerPath, learning_ids: learningIds, output_path: result.outputPath ?? null },
    };
  } finally {
    store.db.close();
  }
}
