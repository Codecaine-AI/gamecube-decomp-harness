import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { workerSummarizerPrompt } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import {
  loadWorkerCondenseInput,
  type LibrarianCheckpointRow,
} from "@server/core/knowledge/jobs/librarian.js";
import { knowledgeCycleSessionId } from "@server/core/knowledge/jobs/cycle-session.js";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  getJob,
  heartbeatJob,
} from "@server/core/job-queue/kernel.js";
import { startJobConsumer } from "@server/core/job-queue/consumer.js";
import type { JobKindDescriptor, JobQueueKernelOps, JobRecord, JobResult } from "@server/core/job-queue/types.js";
import { immediateTransaction as orchestratorTransaction, type StateStore } from "@server/core/orchestrator-state";
import { runMeleeKernelPiAgent as realRunPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import {
  buildAttemptMechanicalRows,
  hasAttemptErrorSignal,
  type AttemptSourceCheckpoint,
  type AttemptSourceCheckpointItem,
  type AttemptSourceWorkerState,
} from "../ingest/attempts.js";
import { taskId } from "../ingest/common.js";
import { advanceWatermark, enqueueIndexTask, insertWorkerRun, type KnowledgeStoreHandle } from "../records/index.js";
import { immediateTransaction } from "../storage/transaction.js";
import { openKnowledgeStore as realOpenKnowledgeStore, type KnowledgeStore } from "../storage/store.js";

const KIND = "worker_summary" as const;
const CONCURRENCY_LIMIT = 16;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_STOP_MAX_WAIT_MS = 15_000;
const DEFAULT_TIMEOUT_SECONDS = 600;
const MAX_ATTEMPTS = 5;

interface WorkerSource {
  worker_state_id: string;
  run_id: string;
  lifecycle_status: string;
  ended_at: string | null;
  game_id: string | null;
  trace_id: string | null;
  caused_by_event_id: string | null;
}

interface NarrativeSubmission {
  hypothesis: string;
  outcome_reasoning: string;
}

interface WorkerSummaryNarrative {
  run: { hypothesis: string; summary: string };
  submissions: NarrativeSubmission[];
  notable_observations: Array<{ observation: string; reusable_when: string }>;
}

export interface WorkerSummaryHandlerDeps {
  globals: GlobalArgs;
  runPiAgent?: typeof realRunPiAgent;
  openKnowledgeStore?: (globals: GlobalArgs) => KnowledgeStore;
  log?: (message: string) => void;
}

export interface WorkerSummaryProcessorOptions {
  intervalMs?: number;
  leaseMs?: number;
  gameId?: string;
  shouldClaim?: () => boolean;
  onFatalError?: (cause: unknown, context: { job: JobRecord | null; operation: string }) => void;
  onShutdownAbandoned?: (count: number) => void;
}

export function enqueueWorkerSummaryForWorker(store: StateStore, workerStateId: string): JobRecord {
  return orchestratorTransaction(store.db, () => {
    const source = store.db.query(`SELECT ws.id AS worker_state_id, ws.run_id, ws.lifecycle_status, ws.ended_at,
      r.game_id, r.trace_id, r.caused_by_event_id
      FROM worker_state ws JOIN runs r ON r.id = ws.run_id WHERE ws.id = ?`).get(workerStateId) as WorkerSource | null;
    if (!source || source.ended_at === null) throw new Error(`Completed worker state not found: ${workerStateId}`);
    const gameId = source.game_id ?? "melee";
    return enqueueJob(store, {
      kind: KIND,
      dedupeKey: workerStateId,
      gameId,
      runId: source.run_id,
      payload: { worker_state_id: workerStateId, run_id: source.run_id },
      traceId: source.trace_id ?? `trace-worker-summary-${gameId}`,
      ...(source.caused_by_event_id ? { causedByEventId: source.caused_by_event_id } : {}),
      executionClass: "local",
      actor: "runner",
      at: source.ended_at,
    });
  });
}

export function catchUpWorkerSummaries(store: StateStore, gameId?: string): number {
  return orchestratorTransaction(store.db, () => {
    const rows = store.db.query(`SELECT ws.id FROM worker_state ws JOIN runs r ON r.id = ws.run_id
      LEFT JOIN jobs j ON j.kind = 'worker_summary' AND j.dedupe_key = ws.id
      WHERE ws.ended_at IS NOT NULL AND j.job_id IS NULL
        AND (? IS NULL OR COALESCE(r.game_id, 'melee') = ?)
      ORDER BY ws.ended_at, ws.id`).all(gameId ?? null, gameId ?? null) as Array<{ id: string }>;
    for (const row of rows) enqueueWorkerSummaryForWorker(store, row.id);
    return rows.length;
  });
}

function validateNarrative(value: Record<string, unknown> | null): WorkerSummaryNarrative {
  const run = value?.run;
  const submissions = value?.submissions;
  const observations = value?.notable_observations;
  if (!run || typeof run !== "object" || Array.isArray(run)
    || typeof (run as Record<string, unknown>).hypothesis !== "string"
    || typeof (run as Record<string, unknown>).summary !== "string"
    || !Array.isArray(submissions) || !Array.isArray(observations)) {
    throw new Error("worker summarizer returned an invalid narrative object");
  }
  const unexpectedTopLevel = Object.keys(value).filter((key) => !["run", "submissions", "notable_observations"].includes(key));
  const unexpectedRun = Object.keys(run).filter((key) => !["hypothesis", "summary"].includes(key));
  if (unexpectedTopLevel.length > 0 || unexpectedRun.length > 0) {
    throw new Error("worker summarizer returned fields outside the narrative schema");
  }
  for (const row of submissions) {
    if (!row || typeof row !== "object" || Array.isArray(row)
      || typeof (row as Record<string, unknown>).hypothesis !== "string"
      || typeof (row as Record<string, unknown>).outcome_reasoning !== "string") {
      throw new Error("worker summarizer returned an invalid submission narrative");
    }
    if (Object.keys(row).some((key) => !["hypothesis", "outcome_reasoning"].includes(key))) {
      throw new Error("worker summarizer returned fields outside the submission narrative schema");
    }
  }
  for (const row of observations) {
    if (!row || typeof row !== "object" || Array.isArray(row)
      || typeof (row as Record<string, unknown>).observation !== "string"
      || typeof (row as Record<string, unknown>).reusable_when !== "string") {
      throw new Error("worker summarizer returned an invalid notable observation");
    }
    if (Object.keys(row).some((key) => !["observation", "reusable_when"].includes(key))) {
      throw new Error("worker summarizer returned fields outside the observation narrative schema");
    }
  }
  return value as unknown as WorkerSummaryNarrative;
}

async function transcriptPacket(rows: ReturnType<typeof loadWorkerCondenseInput>["transcripts"]): Promise<unknown[]> {
  return Promise.all(rows.map(async (row) => ({
    ...row,
    content: row.exists && row.path ? await readFile(row.path, "utf8") : null,
  })));
}

function sourceCheckpoint(row: LibrarianCheckpointRow): AttemptSourceCheckpoint | null {
  if (typeof row.new_score !== "number") return null;
  return {
    id: row.id,
    attempt_index: row.attempt_index,
    validation_time: row.validation_time,
    new_score: row.new_score,
    exact_match: Number(row.exact_match),
    metadata_json: row.metadata_json,
  };
}

function defaultStore(globals: GlobalArgs): KnowledgeStore {
  return realOpenKnowledgeStore({ gameId: globals.game?.gameId ?? globals.gameId ?? "melee" });
}

export async function handleWorkerSummaryJob(
  orchestratorStore: StateStore,
  job: JobRecord,
  deps: WorkerSummaryHandlerDeps,
): Promise<JobResult> {
  const workerStateId = typeof job.payload.worker_state_id === "string" ? job.payload.worker_state_id : job.dedupeKey;
  const input = loadWorkerCondenseInput(orchestratorStore.db, workerStateId);
  const knowledge = (deps.openKnowledgeStore ?? defaultStore)(deps.globals);
  try {
    const existing = knowledge.db.query<{ id: string }, [string]>(
      "SELECT id FROM worker_run WHERE worker_state_id = ?",
    ).get(workerStateId);
    if (existing) return { resultRef: existing.id, detail: { skipped: "existing" } };

    const state = input.worker_state as unknown as AttemptSourceWorkerState;
    const target = knowledge.db.query<{ id: string; stable_key: string }, [string]>(
      "SELECT id, stable_key FROM target WHERE stable_key = ? AND identity_status = 'current'",
    ).get(state.target_key.replace("::", ":"));
    if (!target) {
      deps.log?.(`worker_summary skipped ${workerStateId}: no current V2 target`);
      return { detail: { skipped: "no_target" } };
    }
    const checkpoints = input.checkpoints.map(sourceCheckpoint).filter((row): row is AttemptSourceCheckpoint => row !== null);
    if (checkpoints.length === 0 && !hasAttemptErrorSignal(state)) {
      deps.log?.(`worker_summary skipped ${workerStateId}: no scored checkpoint or error signal`);
      return { detail: { skipped: "no_signal" } };
    }
    const items = orchestratorStore.db.query<AttemptSourceCheckpointItem, [string, string | null, string | null]>(`SELECT disposition, item_status
      FROM checkpoint_items
      WHERE worker_checkpoint_id IN (SELECT id FROM worker_checkpoints WHERE worker_state_id = ?)
         OR (? IS NOT NULL AND target_claim_id = ?)`).all(workerStateId, state.target_claim_id, state.target_claim_id);
    const mechanical = buildAttemptMechanicalRows(state, checkpoints, items, {
      targetId: target.id,
      closedAt: new Date().toISOString(),
    });
    const timeoutMs = (deps.globals.agentTimeoutSeconds || DEFAULT_TIMEOUT_SECONDS) * 1_000;
    const outputDir = resolve(deps.globals.stateDir, "knowledge_v2", "summarizer-output", new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(outputDir, { recursive: true });
    const modelRun = (deps.runPiAgent ?? realRunPiAgent)({
      role: "pr-reviewer",
      catalogAgentId: "worker-summarizer",
      cwd: deps.globals.repoRoot,
      prompt: workerSummarizerPrompt({
        transcript: await transcriptPacket(input.transcripts),
        checkpointSubmissionDigest: { checkpoints: input.checkpoints, submissions: mechanical.submissions },
        targetCardReference: { id: target.id, stable_key: target.stable_key },
        repoRoot: deps.globals.repoRoot,
        stateDir: deps.globals.stateDir,
        game: deps.globals.game,
      }),
      outputDir,
      dryRun: deps.globals.dryRunAgents,
      provider: deps.globals.provider,
      model: deps.globals.model,
      thinkingLevel: deps.globals.thinkingLevel,
      timeoutMs,
      toolContext: { repoRoot: deps.globals.repoRoot, stateDir: deps.globals.stateDir, game: deps.globals.game },
      kernelContext: createMeleeKernelSpawnContext({
        kind: "knowledge-curation",
        gameId: deps.globals.game?.gameId ?? deps.globals.gameId,
        sessionId: knowledgeCycleSessionId({ globals: deps.globals, db: orchestratorStore.db, fallback: job.runId ?? workerStateId }),
        runId: job.runId ?? workerStateId,
        jobId: job.jobId,
        jobKind: "WorkerSummary",
        phase: "knowledge-curation",
        workingDir: deps.globals.repoRoot,
        metadata: { workerStateId, checkpointCount: checkpoints.length, transcriptCount: input.transcripts.length },
      }),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Symbol("worker-summary-timeout");
    const result = await Promise.race([
      modelRun,
      new Promise<typeof deadline>((resolveDeadline) => { timer = setTimeout(() => resolveDeadline(deadline), timeoutMs); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (result === deadline) {
      void modelRun.catch(() => {});
      throw new Error(`worker summarizer timed out after ${timeoutMs}ms`);
    }
    if (result.failed || result.dryRun) throw new Error(result.error ?? "worker summarizer did not produce narrative output");
    const parsed = parseJsonObject(result.rawText);
    if (!parsed.object) throw new Error(parsed.error ?? "worker summarizer output was not JSON");
    const narrative = validateNarrative(parsed.object);
    if (narrative.submissions.length > mechanical.submissions.length) {
      deps.log?.(`worker_summary dropped ${narrative.submissions.length - mechanical.submissions.length} extra submission narrative row(s) for ${workerStateId}`);
    }
    const submissions = mechanical.submissions.map((submission, index) => {
      const modelRow = narrative.submissions[index];
      return modelRow ? { ...submission, hypothesis: modelRow.hypothesis, description: modelRow.outcome_reasoning } : submission;
    });
    const proposalDir = resolve(deps.globals.stateDir, "knowledge_v2", "proposals");
    await mkdir(proposalDir, { recursive: true });
    const proposalPath = resolve(proposalDir, `${mechanical.run.id.replace(/[:/]/g, "-")}.json`);
    await writeFile(proposalPath, `${JSON.stringify({
      run: { id: mechanical.run.id, ...narrative.run },
      notable_observations: narrative.notable_observations,
      submissions: mechanical.submissions.map((submission, index) => ({
        id: submission.id,
        hypothesis: narrative.submissions[index]?.hypothesis ?? null,
        outcome_reasoning: narrative.submissions[index]?.outcome_reasoning ?? submission.description,
      })),
    }, null, 2)}\n`, "utf8");
    const payload = `attempt://run/${mechanical.run.id}`;
    immediateTransaction(knowledge.db, () => {
      insertWorkerRun(knowledge, mechanical.run, submissions);
      advanceWatermark(knowledge, "attempt", JSON.stringify({ last_worker_state_id: workerStateId }));
      enqueueIndexTask(knowledge, { id: taskId("run_closed", payload), pathway: "run_closed", payload });
    });
    return { resultRef: mechanical.run.id, detail: { proposal_path: proposalPath } };
  } finally {
    knowledge.close();
  }
}

export function createWorkerSummaryHandler(store: StateStore, deps: WorkerSummaryHandlerDeps) {
  return (job: JobRecord): Promise<JobResult> => handleWorkerSummaryJob(store, job, deps);
}

const kernelOps: JobQueueKernelOps = {
  claimNextJob,
  completeJob,
  failJob: (store, token, error, input = {}) => {
    const attempts = getJob(store, token.jobId)?.attempts ?? 0;
    return failJob(store, token, error, { ...input, terminal: attempts >= MAX_ATTEMPTS });
  },
  markJobRunning: () => { throw new Error("worker summary jobs execute inline"); },
  heartbeatJob,
};

function descriptor(handler: (job: JobRecord) => Promise<JobResult>, leaseMs: number): JobKindDescriptor {
  return { kind: KIND, concurrencyLimit: CONCURRENCY_LIMIT, leaseMs, execution: { mode: "inline", handler } };
}

export function startWorkerSummaryProcessor(
  store: StateStore,
  handlerDeps: WorkerSummaryHandlerDeps,
  options: WorkerSummaryProcessorOptions = {},
): (options?: { maxWaitMs?: number }) => Promise<void> {
  catchUpWorkerSummaries(store, options.gameId);
  const consumer = startJobConsumer(store, descriptor(createWorkerSummaryHandler(store, handlerDeps), options.leaseMs ?? DEFAULT_LEASE_MS), kernelOps, {
    intervalMs: options.intervalMs ?? 1_000,
    actor: "runner",
    shouldClaim: options.shouldClaim,
    onFatalError: options.onFatalError,
  });
  return async (stopOptions = {}) => {
    const stopping = consumer.stop();
    const maxWaitMs = stopOptions.maxWaitMs ?? DEFAULT_STOP_MAX_WAIT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Symbol("worker-summary-stop-deadline");
    const outcome = await Promise.race([
      stopping,
      new Promise<typeof deadline>((resolveDeadline) => { timer = setTimeout(() => resolveDeadline(deadline), maxWaitMs); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (outcome === deadline) {
      const abandoned = consumer.inFlight();
      void stopping.catch(() => {});
      console.warn(`Worker summary shutdown abandoned ${abandoned} in-flight job(s) after ${maxWaitMs}ms`);
      options.onShutdownAbandoned?.(abandoned);
    }
  };
}
