import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { workerSummarizerPrompt } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import {
  loadWorkerCondenseInput,
  type AttemptRecordWorkerCondenseInput,
} from "@server/core/knowledge/jobs/attempt-record.js";
import { knowledgeCycleSessionId } from "@server/core/knowledge/jobs/cycle-session.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { runMeleeKernelPiAgent as realRunPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { insertRunNarrative, type KnowledgeStoreHandle } from "../records/index.js";
import {
  narrativeSubmissionsById,
  validateNarrative,
  type WorkerSummaryNarrative,
} from "../summarizer-job/index.js";
import { buildTranscriptPacket } from "../summarizer-job/transcript.js";
import { immediateTransaction } from "../storage/transaction.js";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_SECONDS = 600;

export type RenarrateOutcome = "match" | "improvement" | "no_change" | "error";
export type RenarrateSkipReason = "already_narrated" | "no_worker_state" | "no_transcript" | "model_failure";

export interface RenarratePopulationRow {
  id: string;
  target_id: string;
  worker_state_id: string;
  run_id: string | null;
  goal: string;
  baseline: string;
  final_outcome: RenarrateOutcome;
  error_type: string | null;
  integration: string | null;
  started_at: string;
  ended_at: string | null;
  closed_at: string;
  target_stable_key: string;
}

export interface StoredSubmissionRow {
  id: string;
  seq: number;
  description: string;
  hypothesis: string | null;
  score: number;
  submitted_at: string;
  runtime_ref: string | null;
}

export interface RenarrateWouldUpdate {
  id: string;
  seq: number;
  description: string;
}

export interface RenarratePassTimings {
  startedAt: string;
  endedAt: string;
  contextMs: number;
  modelMs: number;
  writeMs: number;
  wallMs: number;
}

export interface RenarratePassArtifact {
  worker_run_id: string;
  worker_state_id: string;
  status: "completed" | "skipped";
  skip_reason?: RenarrateSkipReason;
  error?: string;
  attempts?: 1 | 2;
  target: { id: string; stable_key: string };
  digest?: { run: RenarratePopulationRow; submissions: StoredSubmissionRow[]; checkpoints: unknown[] };
  narrative?: WorkerSummaryNarrative;
  would_update: RenarrateWouldUpdate[];
  timings: RenarratePassTimings;
  model: string;
  dry_run: boolean;
}

export interface RenarratePassResult {
  artifact: RenarratePassArtifact;
  artifactPath: string;
}

export interface RenarrateRunOptions {
  runId: string;
  globals: GlobalArgs;
  orchestratorStore: StateStore;
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
  stopFile?: string;
  outcome?: RenarrateOutcome;
  workerStateId?: string;
  timeoutMs?: number;
  runPiAgent?: typeof realRunPiAgent;
  loadCondenseInput?: (workerStateId: string) => AttemptRecordWorkerCondenseInput;
  now?: () => string;
  clockMs?: () => number;
}

export interface RenarrateDurationSummary {
  min: number;
  max: number;
  mean: number;
  p50: number;
}

export interface RenarrateSummary {
  runId: string;
  dryRun: boolean;
  population: number;
  passesRun: number;
  completed: number;
  skipped: number;
  skipReasons: Record<RenarrateSkipReason, number>;
  stopped: boolean;
  wallMs: number;
  perPassMs: RenarrateDurationSummary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class NarrativeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NarrativeValidationError";
  }
}

function runDirectory(stateDir: string, runId: string): string {
  return resolve(stateDir, "knowledge_v2", "renarrate", runId);
}

function outputDirectory(stateDir: string, runId: string, workerRunId: string): string {
  return resolve(stateDir, "knowledge_v2", "renarrate-output", runId, slug(workerRunId));
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function selectRenarratePopulation(
  store: KnowledgeStoreHandle,
  filters: Pick<RenarrateRunOptions, "limit" | "outcome" | "workerStateId"> = {},
): RenarratePopulationRow[] {
  const rows = store.db.query<RenarratePopulationRow, [string | null, string | null, string | null, string | null]>(`
    SELECT wr.id, wr.target_id, wr.worker_state_id, wr.run_id, wr.goal, wr.baseline,
      wr.final_outcome, wr.error_type, wr.integration, wr.started_at, wr.ended_at,
      wr.closed_at, t.stable_key AS target_stable_key
    FROM worker_run wr
    JOIN target t ON t.id = wr.target_id
    LEFT JOIN run_narrative rn ON rn.worker_run_id = wr.id
    WHERE wr.worker_state_id IS NOT NULL
      AND rn.worker_run_id IS NULL
      AND (? IS NULL OR wr.final_outcome = ?)
      AND (? IS NULL OR wr.worker_state_id = ?)
    ORDER BY CASE wr.final_outcome
      WHEN 'match' THEN 0 WHEN 'improvement' THEN 1 WHEN 'no_change' THEN 2 ELSE 3 END,
      wr.closed_at ASC, wr.id ASC
  `).all(filters.outcome ?? null, filters.outcome ?? null, filters.workerStateId ?? null, filters.workerStateId ?? null);
  return filters.limit === undefined ? rows : rows.slice(0, filters.limit);
}

function storedSubmissions(store: KnowledgeStoreHandle, workerRunId: string): StoredSubmissionRow[] {
  return store.db.query<StoredSubmissionRow, [string]>(`SELECT id, seq, description, hypothesis, score,
    submitted_at, runtime_ref FROM submission WHERE worker_run_id = ? ORDER BY seq ASC`).all(workerRunId);
}

function updateRows(submissions: StoredSubmissionRow[], narrative: WorkerSummaryNarrative): RenarrateWouldUpdate[] {
  const narrativeById = narrativeSubmissionsById(submissions.map((submission) => submission.id), narrative);
  return submissions.flatMap((submission) => {
    const modelRow = narrativeById.get(submission.id)!;
    return [{
      id: submission.id,
      seq: submission.seq,
      description: `${modelRow.approach.trim()} ${modelRow.outcome_reasoning.trim()}`.trim(),
    }];
  });
}

async function modelNarrative(
  row: RenarratePopulationRow,
  submissions: StoredSubmissionRow[],
  input: AttemptRecordWorkerCondenseInput,
  options: RenarrateRunOptions,
): Promise<WorkerSummaryNarrative> {
  const timeoutMs = options.timeoutMs
    ?? (options.globals.agentTimeoutSeconds || DEFAULT_TIMEOUT_SECONDS) * 1_000;
  const outputDir = outputDirectory(options.globals.stateDir, options.runId, row.id);
  await mkdir(outputDir, { recursive: true });
  const modelRun = (options.runPiAgent ?? realRunPiAgent)({
    role: "pr-reviewer",
    catalogAgentId: "worker-summarizer",
    cwd: options.globals.repoRoot,
    prompt: workerSummarizerPrompt({
      transcript: await buildTranscriptPacket(input.transcripts),
      checkpointSubmissionDigest: {
        checkpoints: input.checkpoints,
        submissions,
        run: row,
      },
      targetCardReference: { id: row.target_id, stable_key: row.target_stable_key },
      repoRoot: options.globals.repoRoot,
      stateDir: options.globals.stateDir,
      game: options.globals.game,
    }),
    outputDir,
    dryRun: options.globals.dryRunAgents,
    provider: options.globals.provider,
    model: options.globals.model,
    thinkingLevel: options.globals.thinkingLevel,
    timeoutMs,
    toolContext: {
      repoRoot: options.globals.repoRoot,
      stateDir: options.globals.stateDir,
      game: options.globals.game,
    },
    kernelContext: createMeleeKernelSpawnContext({
      kind: "knowledge-curation",
      gameId: options.globals.game?.gameId ?? options.globals.gameId,
      sessionId: knowledgeCycleSessionId({
        globals: options.globals,
        db: options.orchestratorStore.db,
        fallback: row.run_id ?? row.worker_state_id,
      }),
      runId: row.run_id ?? row.worker_state_id,
      jobId: `kg2-renarrate:${options.runId}:${row.id}`,
      jobKind: "WorkerSummary",
      itemId: row.id,
      targetId: row.target_id,
      phase: "knowledge-curation",
      workingDir: options.globals.repoRoot,
      metadata: {
        workerStateId: row.worker_state_id,
        checkpointCount: input.checkpoints.length,
        transcriptCount: input.transcripts.length,
      },
    }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Symbol("kg2-renarrate-timeout");
  const result = await Promise.race([
    modelRun,
    new Promise<typeof deadline>((resolveDeadline) => {
      timer = setTimeout(() => resolveDeadline(deadline), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
  if (result === deadline) {
    void modelRun.catch(() => undefined);
    throw new Error(`worker summarizer timed out after ${timeoutMs}ms`);
  }
  if (result.failed || result.providerError || result.dryRun) {
    throw new Error(result.error ?? result.providerError ?? "worker summarizer did not produce narrative output");
  }
  let parsed: ReturnType<typeof parseJsonObject>;
  try {
    parsed = parseJsonObject(result.rawText);
  } catch (error) {
    throw new NarrativeValidationError(errorMessage(error));
  }
  if (parsed.object === null) {
    throw new NarrativeValidationError(parsed.error ?? "worker summarizer output was not JSON");
  }
  try {
    return validateNarrative(parsed.object);
  } catch (error) {
    throw new NarrativeValidationError(errorMessage(error));
  }
}

function timings(
  startedAt: string,
  startedMs: number,
  contextMs: number,
  modelMs: number,
  writeMs: number,
  now: () => string,
  clockMs: () => number,
): RenarratePassTimings {
  return { startedAt, endedAt: now(), contextMs, modelMs, writeMs, wallMs: clockMs() - startedMs };
}

export async function runRenarratePass(
  store: KnowledgeStoreHandle,
  row: RenarratePopulationRow,
  options: RenarrateRunOptions,
): Promise<RenarratePassResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? Date.now;
  const startedAt = now();
  const startedMs = clockMs();
  const directory = runDirectory(options.globals.stateDir, options.runId);
  const artifactPath = resolve(directory, `${slug(row.id)}.json`);
  let contextMs = 0;
  let modelMs = 0;
  let writeMs = 0;
  let submissions: StoredSubmissionRow[] = [];
  const target = { id: row.target_id, stable_key: row.target_stable_key };
  const finish = async (artifact: RenarratePassArtifact): Promise<RenarratePassResult> => {
    await mkdir(directory, { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return { artifact, artifactPath };
  };

  const existing = store.db.query<{ worker_run_id: string }, [string]>(
    "SELECT worker_run_id FROM run_narrative WHERE worker_run_id = ?",
  ).get(row.id);
  if (existing) {
    return finish({
      worker_run_id: row.id, worker_state_id: row.worker_state_id, status: "skipped",
      skip_reason: "already_narrated", target, would_update: [],
      timings: timings(startedAt, startedMs, contextMs, modelMs, writeMs, now, clockMs),
      model: options.globals.model, dry_run: options.dryRun === true,
    });
  }

  let input: AttemptRecordWorkerCondenseInput;
  const contextStarted = clockMs();
  try {
    input = (options.loadCondenseInput
      ?? ((workerStateId) => loadWorkerCondenseInput(options.orchestratorStore.db, workerStateId)))(row.worker_state_id);
    submissions = storedSubmissions(store, row.id);
  } catch (error) {
    contextMs = clockMs() - contextStarted;
    return finish({
      worker_run_id: row.id, worker_state_id: row.worker_state_id, status: "skipped",
      skip_reason: "no_worker_state", error: errorMessage(error), target, would_update: [],
      timings: timings(startedAt, startedMs, contextMs, modelMs, writeMs, now, clockMs),
      model: options.globals.model, dry_run: options.dryRun === true,
    });
  }
  contextMs = clockMs() - contextStarted;
  const digest = { run: row, submissions, checkpoints: input.checkpoints };
  if (!input.transcripts.some((transcript) => transcript.exists && transcript.path !== null && existsSync(transcript.path))) {
    return finish({
      worker_run_id: row.id, worker_state_id: row.worker_state_id, status: "skipped",
      skip_reason: "no_transcript", target, digest, would_update: [],
      timings: timings(startedAt, startedMs, contextMs, modelMs, writeMs, now, clockMs),
      model: options.globals.model, dry_run: options.dryRun === true,
    });
  }

  let narrative!: WorkerSummaryNarrative;
  let wouldUpdate: RenarrateWouldUpdate[] = [];
  let attempts: 1 | 2 = 1;
  const modelStarted = clockMs();
  const modelErrors: string[] = [];
  for (;;) {
    try {
      narrative = await modelNarrative(row, submissions, input, options);
      try {
        wouldUpdate = updateRows(submissions, narrative);
      } catch (error) {
        throw new NarrativeValidationError(errorMessage(error));
      }
      break;
    } catch (error) {
      modelErrors.push(errorMessage(error));
      if (!(error instanceof NarrativeValidationError) || attempts === 2) {
        modelMs = clockMs() - modelStarted;
        return finish({
          worker_run_id: row.id, worker_state_id: row.worker_state_id, status: "skipped",
          skip_reason: "model_failure", error: modelErrors.join("\n"), attempts,
          target, digest, would_update: [],
          timings: timings(startedAt, startedMs, contextMs, modelMs, writeMs, now, clockMs),
          model: options.globals.model, dry_run: options.dryRun === true,
        });
      }
      attempts = 2;
    }
  }
  modelMs = clockMs() - modelStarted;
  const writeStarted = clockMs();
  let racedWithExisting = false;
  if (options.dryRun !== true) {
    immediateTransaction(store.db, () => {
      const current = store.db.query<{ worker_run_id: string }, [string]>(
        "SELECT worker_run_id FROM run_narrative WHERE worker_run_id = ?",
      ).get(row.id);
      if (current) {
        racedWithExisting = true;
        return;
      }
      const update = store.db.query("UPDATE submission SET description = ? WHERE id = ?");
      for (const item of wouldUpdate) update.run(item.description, item.id);
      insertRunNarrative(store, {
        workerRunId: row.id,
        summary: narrative.run.summary,
        notableObservations: narrative.notable_observations,
        narrative,
        producedBy: "backfill",
        createdAt: now(),
      });
    });
  }
  writeMs = clockMs() - writeStarted;
  if (racedWithExisting) {
    return finish({
      worker_run_id: row.id, worker_state_id: row.worker_state_id, status: "skipped",
      skip_reason: "already_narrated", target, digest, narrative, would_update: wouldUpdate, attempts,
      timings: timings(startedAt, startedMs, contextMs, modelMs, writeMs, now, clockMs),
      model: options.globals.model, dry_run: false,
    });
  }
  return finish({
    worker_run_id: row.id, worker_state_id: row.worker_state_id, status: "completed",
    target, digest, narrative, would_update: wouldUpdate, attempts,
    timings: timings(startedAt, startedMs, contextMs, modelMs, writeMs, now, clockMs),
    model: options.globals.model, dry_run: options.dryRun === true,
  });
}

function validateOptions(options: RenarrateRunOptions): void {
  if (options.runId.trim().length === 0) throw new Error("runId is required");
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be a positive integer");
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 0)) {
    throw new Error("limit must be a non-negative integer");
  }
}

function durationSummary(values: number[]): RenarrateDurationSummary {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, p50: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return { min: sorted[0]!, max: sorted.at(-1)!, mean: total / sorted.length, p50: sorted[Math.floor((sorted.length - 1) / 2)]! };
}

export async function runRenarrate(
  store: KnowledgeStoreHandle,
  options: RenarrateRunOptions,
): Promise<RenarrateSummary> {
  validateOptions(options);
  const clockMs = options.clockMs ?? Date.now;
  const startedMs = clockMs();
  const population = selectRenarratePopulation(store, options);
  const stopFile = options.stopFile ?? resolve(options.globals.stateDir, "knowledge_v2", "renarrate", `${options.runId}.stop`);
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const skipReasons: Record<RenarrateSkipReason, number> = {
    already_narrated: 0, no_worker_state: 0, no_transcript: 0, model_failure: 0,
  };
  let nextIndex = 0;
  let passesRun = 0;
  let completed = 0;
  let skipped = 0;
  let stopped = false;
  const passDurations: number[] = [];
  const claim = (): RenarratePopulationRow | undefined => {
    if (stopped || nextIndex >= population.length) return undefined;
    if (existsSync(stopFile)) {
      stopped = true;
      return undefined;
    }
    const row = population[nextIndex];
    nextIndex += 1;
    return row;
  };
  const lane = async (): Promise<void> => {
    for (;;) {
      const row = claim();
      if (row === undefined) return;
      const passStarted = clockMs();
      passesRun += 1;
      let result: RenarratePassResult;
      try {
        result = await runRenarratePass(store, row, options);
      } catch (error) {
        const now = options.now ?? (() => new Date().toISOString());
        const directory = runDirectory(options.globals.stateDir, options.runId);
        const artifactPath = resolve(directory, `${slug(row.id)}.json`);
        const artifact: RenarratePassArtifact = {
          worker_run_id: row.id,
          worker_state_id: row.worker_state_id,
          status: "skipped",
          skip_reason: "model_failure",
          error: errorMessage(error),
          target: { id: row.target_id, stable_key: row.target_stable_key },
          would_update: [],
          timings: {
            startedAt: now(),
            endedAt: now(),
            contextMs: 0,
            modelMs: 0,
            writeMs: 0,
            wallMs: clockMs() - passStarted,
          },
          model: options.globals.model,
          dry_run: options.dryRun === true,
        };
        try {
          await mkdir(directory, { recursive: true });
          await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
        } catch {
          // Keep the lane alive so later rows run and summary.json still gets its write attempt.
        }
        result = { artifact, artifactPath };
      }
      if (result.artifact.status === "completed") completed += 1;
      else {
        skipped += 1;
        if (result.artifact.skip_reason) skipReasons[result.artifact.skip_reason] += 1;
      }
      passDurations.push(clockMs() - passStarted);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, population.length)) }, () => lane()));
  const summary: RenarrateSummary = {
    runId: options.runId,
    dryRun: options.dryRun === true,
    population: population.length,
    passesRun,
    completed,
    skipped,
    skipReasons,
    stopped,
    wallMs: clockMs() - startedMs,
    perPassMs: durationSummary(passDurations),
  };
  const directory = runDirectory(options.globals.stateDir, options.runId);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary));
  return summary;
}
