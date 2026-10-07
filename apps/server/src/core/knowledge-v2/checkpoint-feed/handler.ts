// The `checkpoint_knowledge` lane handler (plan §6.8 handler steps 1–7, §6.3,
// owner D1): for one integrated checkpoint of a settled epoch, decide whether
// it is confirmed good, extract reusable matching knowledge from it with
// `ExtractConfirmedCheckpointKnowledge`, and enqueue one `checkpoint_confirmed`
// librarian task. It runs for every confirmed-good checkpoint, whatever the
// adjudication mode and whether or not it has advisories.
//
// Contract (§6.3): every evaluated outcome completes the job and is recorded
// with one atomic `json_set` at `metadata.checkpoint_knowledge`; an extraction
// failure is such an outcome (no task, never blocks anything). Only
// infrastructure throws (no node kernel, a stopping lane, a submission not
// ingested yet), so the queue backs off and retries, and after `maxAttempts`
// the job is terminal with the error.
import type { ConfirmedCheckpointKnowledge } from "@server/generated/baml_client/types";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { JsonObject } from "@server/core/harness-state/events.js";
import type { JobRecord, JobResult } from "@server/core/job-queue/types.js";
import { knowledgeHarnessSessionId } from "@server/core/knowledge/jobs/harness-session.js";
import { SUBMISSION_NOT_FOUND } from "@server/core/model-node-work/catch-up.js";
import type {
  ModelNodeHandlerContext,
  ModelNodeJobHandler,
  ModelNodeRetryDecision,
} from "@server/core/model-node-work/lane.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { getDefaultMeleeKernelRuntime } from "@server/infrastructure/kernel/bridge/runtime.js";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context.js";
import { NODE_CALL_MANIFESTS, NODE_CALL_MODEL } from "@server/infrastructure/kernel/nodes/functions.js";
import { getNodeKernel, type WorkerNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import { enqueueIndexTask } from "../records/index.js";
import { openKnowledgeStore as realOpenKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { immediateTransaction } from "../storage/transaction.js";
import { evaluateConfirmedGood, sha256Hex, type ConfirmedCheckpoint, type ConfirmedGoodDeps } from "./confirmed-good.js";
import {
  CHECKPOINT_CONFIRMED_PATHWAY,
  checkpointConfirmedPayload,
  checkpointConfirmedTaskId,
  extractionInput,
} from "./payload.js";
import { assembleSources, canonicalJson, changedSources, currentDigests, type SourceDigests } from "./sources.js";

export const EXTRACTION_FUNCTION = "ExtractConfirmedCheckpointKnowledge" as const;
/**
 * Operation deadline of the extraction. Out of band, so longer than the node
 * kernel's 60 s default, which bounds the worker's inline enforce path: a live
 * extraction takes about 30 s and can exceed 60 s. The lane and the backfill
 * keep the claim alive by heartbeat for the whole call.
 */
export const CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS = 180_000;
/** Where every outcome is recorded on the checkpoint. */
export const CHECKPOINT_KNOWLEDGE_RESULT_KEY = "checkpoint_knowledge";
/**
 * Where the first extraction attempt binds its evidence: the digests and the
 * input it was invoked with, and its kernel run. A retry replays that call by
 * request id, and the kernel replays without comparing arguments, so a retry
 * whose evidence no longer matches the binding is `evidence-changed`.
 */
export const CHECKPOINT_KNOWLEDGE_BINDING_KEY = "checkpoint_knowledge_extraction";

export interface ExtractionBinding {
  request_id: string;
  input_sha256: string;
  sources: SourceDigests;
  kernel_run_id: string | null;
  bound_at: string;
}

/** Kernel request id of the extraction, so a retried job replays a finished call instead of re-paying. */
export function checkpointConfirmedRequestId(checkpointId: string): string {
  return `checkpoint_confirmed:${checkpointId}`;
}

/** No knowledge submission records the checkpoint yet; ingestion runs at the epoch boundary, so the job retries. */
export class SubmissionNotYetIngested extends Error {
  readonly checkpointId: string;

  constructor(checkpointId: string) {
    super(`${SUBMISSION_NOT_FOUND}: no knowledge submission records checkpoint ${checkpointId} yet`);
    this.name = "SubmissionNotYetIngested";
    this.checkpointId = checkpointId;
  }
}

/**
 * Waiting for ingestion: exponential from one minute to 30 minutes between
 * attempts, terminal once at least six hours of backoff have passed. After
 * that, catch-up re-enqueues the checkpoint as soon as its submission exists.
 */
export const SUBMISSION_RETRY = Object.freeze({
  firstBackoffMs: 60_000,
  maxBackoffMs: 30 * 60_000,
  windowMs: 6 * 60 * 60_000,
});

/** Backoff after failed attempt `attempt` (1-based). */
export function submissionRetryBackoffMs(attempt: number): number {
  const exponent = Math.min(Math.max(0, attempt - 1), 30);
  return Math.min(SUBMISSION_RETRY.maxBackoffMs, SUBMISSION_RETRY.firstBackoffMs * 2 ** exponent);
}

/**
 * The `checkpoint_knowledge` lane's retry policy: a submission not ingested
 * yet retries on the long schedule above, past the lane's `maxAttempts`;
 * every other error keeps the lane default.
 */
export function checkpointKnowledgeRetry(job: JobRecord, cause: unknown): ModelNodeRetryDecision | null {
  if (!isNamedError(cause, "SubmissionNotYetIngested")) return null;
  const attempt = Math.max(1, job.attempts);
  let waitedMs = 0;
  for (let previous = 1; previous < attempt; previous += 1) waitedMs += submissionRetryBackoffMs(previous);
  return { backoffMs: submissionRetryBackoffMs(attempt), terminal: waitedMs >= SUBMISSION_RETRY.windowMs };
}

export interface CheckpointKnowledgeHandlerDeps {
  /** Default: the process's node kernel over `globals.stateDir`. */
  nodeKernel?: () => Promise<WorkerNodeKernel | null>;
  /** Default: the game's knowledge store (refused under a test runner). */
  openKnowledgeStore?: (gameId: string) => KnowledgeStore;
  /**
   * The kernel container for an extraction with no usable worker kernel run
   * (adjudication off, or a run outside this kernel database). Default: the
   * run's knowledge-curation job container in the melee kernel database.
   */
  callContainer?: (job: JobRecord, checkpoint: ConfirmedCheckpoint) => Promise<string>;
  isAncestor?: ConfirmedGoodDeps["isAncestor"];
  now?: () => string;
}

interface SubmissionRow {
  worker_run_id: string;
  seq: number;
  id: string;
}

function isUnderTestRunner(): boolean {
  return process.env.NODE_ENV === "test"
    || process.env.BUN_TEST !== undefined
    || (typeof Bun !== "undefined" && Bun.env.NODE_ENV === "test");
}

function defaultKnowledgeStore(gameId: string): KnowledgeStore {
  if (isUnderTestRunner()) {
    throw new Error("checkpoint knowledge handler refuses to touch the default knowledge root under a test runner; inject a temporary knowledge store");
  }
  return realOpenKnowledgeStore({ gameId });
}

function defaultCallContainer(globals: GlobalArgs, store: StateStore) {
  return async (job: JobRecord, checkpoint: ConfirmedCheckpoint): Promise<string> => {
    const runtime = await getDefaultMeleeKernelRuntime({ database: { stateDir: globals.stateDir } });
    if (!runtime) throw new Error("checkpoint_knowledge: kernel runtime unavailable");
    const runId = job.runId ?? checkpoint.runId;
    const context = createMeleeKernelSpawnContext({
      kind: "knowledge-curation",
      gameId: job.gameId,
      sessionId: knowledgeHarnessSessionId({ globals, gameId: job.gameId, db: store.db, fallback: runId }),
      runId,
      epochId: checkpoint.epochId,
      jobId: job.jobId,
      jobKind: "CheckpointKnowledge",
      workingDir: globals.repoRoot,
      metadata: { checkpointId: checkpoint.checkpointId },
    });
    await runtime.upsertSpawnContainers(context);
    if (!context.containerId) throw new Error("checkpoint_knowledge: no knowledge-curation container");
    return context.containerId;
  };
}

/** The worker's kernel run, when the checkpoint recorded one (adjudication shadow or enforce). */
function workerKernelRunId(metadata: Record<string, unknown>): string | null {
  const candidate = metadata.llm_review_candidate;
  if (typeof candidate !== "object" || candidate === null) return null;
  const kernel = (candidate as Record<string, unknown>).kernel;
  if (typeof kernel !== "object" || kernel === null) return null;
  const runId = (kernel as Record<string, unknown>).run_id;
  return typeof runId === "string" && runId ? runId : null;
}

function isNamedError(error: unknown, name: string): error is Error {
  return error instanceof Error && error.name === name;
}

function nodeErrorCode(error: unknown): string | null {
  if (!isNamedError(error, "KernelNodeError")) return null;
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function callFailure(error: unknown): { kind: string; runId: string | null } | null {
  if (!isNamedError(error, "KernelCallError")) return null;
  const failure = (error as { failure?: { kind?: unknown } }).failure;
  if (typeof failure?.kind !== "string") return null;
  const runId = (error as { runId?: unknown }).runId;
  return { kind: failure.kind, runId: typeof runId === "string" ? runId : null };
}

function currentMetadata(store: StateStore, checkpointId: string): Record<string, unknown> {
  const row = store.db.query<{ metadata_json: string }, [string]>(
    "SELECT metadata_json FROM worker_checkpoints WHERE id = ?",
  ).get(checkpointId);
  try {
    const value = JSON.parse(row?.metadata_json ?? "{}") as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function isDigests(value: unknown): value is SourceDigests {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).note_sha256 === "string";
}

/** The extraction binding recorded for the checkpoint, or null. */
export function extractionBinding(store: StateStore, checkpointId: string): ExtractionBinding | null {
  const value = currentMetadata(store, checkpointId)[CHECKPOINT_KNOWLEDGE_BINDING_KEY];
  if (typeof value !== "object" || value === null) return null;
  const binding = value as Partial<ExtractionBinding>;
  if (typeof binding.request_id !== "string" || typeof binding.input_sha256 !== "string" || !isDigests(binding.sources)) return null;
  return {
    request_id: binding.request_id,
    input_sha256: binding.input_sha256,
    sources: binding.sources,
    kernel_run_id: typeof binding.kernel_run_id === "string" ? binding.kernel_run_id : null,
    bound_at: typeof binding.bound_at === "string" ? binding.bound_at : "",
  };
}

/** Write-once: the first attempt's binding stands; a later attempt is compared against it. */
function bindExtraction(store: StateStore, checkpointId: string, binding: ExtractionBinding): void {
  store.db.query(`
    UPDATE worker_checkpoints
    SET metadata_json = json_set(metadata_json, '$.${CHECKPOINT_KNOWLEDGE_BINDING_KEY}', json(?))
    WHERE id = ? AND json_valid(metadata_json)
      AND json_extract(metadata_json, '$.${CHECKPOINT_KNOWLEDGE_BINDING_KEY}') IS NULL`)
    .run(JSON.stringify(binding), checkpointId);
}

/**
 * Records the kernel run of the extraction attempt that just started, so a
 * later replay cites the run whose output it returns: an aborted attempt is
 * followed by a fresh one under the same request id, and that fresh run is
 * the one a replay serves. Only an unchanged binding (same request, same
 * input) is updated.
 *
 * Runs in `onNodeStarted`, before the engine is invoked, and throws when the
 * write fails or matches no binding: the kernel then ends that run without
 * calling the model, and the job fails retryable. A run that could not be
 * recorded is never paid for, so a replay never cites an earlier run.
 */
function bindKernelRun(store: StateStore, checkpointId: string, binding: ExtractionBinding, runId: string): void {
  const written = store.db.query(`
    UPDATE worker_checkpoints
    SET metadata_json = json_set(metadata_json, '$.${CHECKPOINT_KNOWLEDGE_BINDING_KEY}.kernel_run_id', ?)
    WHERE id = ? AND json_valid(metadata_json)
      AND json_extract(metadata_json, '$.${CHECKPOINT_KNOWLEDGE_BINDING_KEY}.request_id') = ?
      AND json_extract(metadata_json, '$.${CHECKPOINT_KNOWLEDGE_BINDING_KEY}.input_sha256') = ?`)
    .run(runId, checkpointId, binding.request_id, binding.input_sha256);
  if (written.changes !== 1) {
    throw new Error(`checkpoint_knowledge ${checkpointId}: extraction binding did not record kernel run ${runId}`);
  }
}

/** One atomic json_set (§6.3); `onlyIfUnset` keeps an outcome a replay must not overwrite. */
function recordOutcome(store: StateStore, checkpointId: string, outcome: JsonObject, onlyIfUnset = false): void {
  store.db.query(`
    UPDATE worker_checkpoints
    SET metadata_json = json_set(metadata_json, '$.${CHECKPOINT_KNOWLEDGE_RESULT_KEY}', json(?))
    WHERE id = ? AND json_valid(metadata_json)
      ${onlyIfUnset ? `AND json_extract(metadata_json, '$.${CHECKPOINT_KNOWLEDGE_RESULT_KEY}') IS NULL` : ""}`)
    .run(JSON.stringify(outcome), checkpointId);
}

function throwIfAborted(signal: AbortSignal, checkpointId: string): void {
  // Thrown, not recorded: the job retries after the lease, and the kernel replays a finished extraction.
  if (signal.aborted) throw new Error(`checkpoint_knowledge ${checkpointId}: lane stopped before the outcome was recorded`);
}

/**
 * Factory for the `checkpoint_knowledge` lane (§6.3, §6.8). Idempotent per
 * checkpoint: the task id is fixed by the checkpoint id, an existing task is
 * never rewritten, and the extraction's request id replays a finished call.
 */
export function createCheckpointKnowledgeHandler(
  globals: GlobalArgs,
  deps: CheckpointKnowledgeHandlerDeps = {},
): ModelNodeJobHandler {
  const nodeKernel = deps.nodeKernel ?? (() => getNodeKernel({ stateDir: globals.stateDir }));
  const openKnowledge = deps.openKnowledgeStore ?? defaultKnowledgeStore;
  const now = deps.now ?? (() => new Date().toISOString());
  const requestedModel = NODE_CALL_MANIFESTS[EXTRACTION_FUNCTION].model ?? NODE_CALL_MODEL;

  return async (job: JobRecord, ctx: ModelNodeHandlerContext): Promise<JobResult> => {
    const checkpointId = typeof job.payload.checkpointId === "string" ? job.payload.checkpointId : "";
    if (!checkpointId) return { resultRef: null, detail: { status: "skipped", reason: "invalid-payload" } };
    // Dry-run agents make no model calls; the checkpoint is left without a task.
    if (globals.dryRunAgents) return { resultRef: checkpointId, detail: { status: "skipped", reason: "dry-run-agents" } };

    const done = (outcome: JsonObject, resultRef: string | null = checkpointId): JobResult => {
      ctx.ensureClaim();
      recordOutcome(ctx.store, checkpointId, { ...outcome, recorded_at: now() });
      return { resultRef, detail: outcome };
    };
    const taskId = checkpointConfirmedTaskId(checkpointId);
    const knowledge = openKnowledge(job.gameId);
    try {
      const taskExists = () => knowledge.db.query("SELECT 1 FROM index_task WHERE id = ?").get(taskId) !== null;
      if (taskExists()) {
        // A crash after step 6 committed: the task stands; record it unless an outcome already is.
        const outcome: JsonObject = { status: "enqueued", task_id: taskId, reused: true };
        ctx.ensureClaim();
        recordOutcome(ctx.store, checkpointId, { ...outcome, recorded_at: now() }, true);
        return { resultRef: taskId, detail: outcome };
      }

      // 1. Rules 1–5.
      const verdict = await evaluateConfirmedGood(ctx.store, checkpointId, {
        repoRoot: globals.repoRoot,
        ...(deps.isAncestor ? { isAncestor: deps.isAncestor } : {}),
      });
      if (!verdict.confirmed) {
        return done({ status: "not-confirmed", rule: verdict.rule, reason: verdict.reason, ...(verdict.detail ? { detail: verdict.detail } : {}) });
      }
      const checkpoint = verdict.checkpoint;

      // 2. Sources and their digests.
      const assembled = await assembleSources(checkpoint, globals.repoRoot);
      if (assembled.status === "evidence-missing") return done({ status: "skipped", reason: "evidence-missing", missing: assembled.missing });
      if (assembled.status === "evidence-invalid") return done({ status: "skipped", reason: "evidence-invalid", detail: assembled.reason });
      const sources = assembled.sources;
      if (sources.digests.report_changes_sha256 !== checkpoint.reportChangesSha256) {
        return done({ status: "skipped", reason: "evidence-changed", changed: ["report_changes_sha256"] });
      }

      // 3. The submission, through runtime_ref (indexed by knowledge migration 007).
      const submission = knowledge.db.query<SubmissionRow, [string]>(
        "SELECT worker_run_id, seq, id FROM submission WHERE runtime_ref = ? ORDER BY worker_run_id, seq LIMIT 1",
      ).get(checkpointId);
      if (!submission) throw new SubmissionNotYetIngested(checkpointId);

      // 4. Extraction.
      throwIfAborted(ctx.signal, checkpointId);
      const kernel = await nodeKernel();
      if (!kernel) throw new Error(`checkpoint_knowledge ${checkpointId}: node kernel unavailable`);
      const extraction = extractionInput(checkpoint, sources);
      const requestId = checkpointConfirmedRequestId(checkpointId);
      const inputSha256 = sha256Hex(canonicalJson(extraction.input));

      // The request id replays the first attempt's call whatever its arguments: bind them before
      // the first call, and refuse a retry whose evidence or input moved since.
      ctx.ensureClaim();
      bindExtraction(ctx.store, checkpointId, {
        request_id: requestId,
        input_sha256: inputSha256,
        sources: sources.digests,
        kernel_run_id: null,
        bound_at: now(),
      });
      const binding = extractionBinding(ctx.store, checkpointId);
      if (!binding) throw new Error(`checkpoint_knowledge ${checkpointId}: extraction binding was not recorded`);
      const unbound = [
        ...changedSources(binding.sources, sources.digests),
        ...(binding.input_sha256 !== inputSha256 ? ["input_sha256"] : []),
        ...(binding.request_id !== requestId ? ["request_id"] : []),
      ];
      if (unbound.length > 0) {
        return done({ status: "skipped", reason: "evidence-changed", changed: unbound, bound_at: binding.bound_at });
      }

      let kernelRunId: string | null = null;
      const callOptions = {
        trigger: "post-run" as const,
        requestId,
        timeoutMs: CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS,
        signal: ctx.signal,
        // Throwing here ends the run before the engine is invoked (see bindKernelRun).
        onNodeStarted: (ids: { runId: string }) => {
          ctx.ensureClaim();
          bindKernelRun(ctx.store, checkpointId, binding, ids.runId);
          kernelRunId = ids.runId;
        },
      };
      const container = () => (deps.callContainer ?? defaultCallContainer(globals, ctx.store))(job, checkpoint);
      const parentRunId = workerKernelRunId(checkpoint.metadata);
      let knowledgeOut: ConfirmedCheckpointKnowledge;
      try {
        try {
          knowledgeOut = parentRunId
            ? await kernel.call(EXTRACTION_FUNCTION, [extraction.input], { ...callOptions, parentRunId })
            : await kernel.call(EXTRACTION_FUNCTION, [extraction.input], { ...callOptions, containerId: await container() });
        } catch (error) {
          // A worker run this kernel database does not hold: nothing was written, so hang the call on the container.
          if (!parentRunId || nodeErrorCode(error) !== "unknown-parent-run") throw error;
          knowledgeOut = await kernel.call(EXTRACTION_FUNCTION, [extraction.input], { ...callOptions, containerId: await container() });
        }
      } catch (error) {
        const failure = callFailure(error);
        if (!failure || ctx.signal.aborted) throw error;
        return done({
          status: "extraction-error",
          error_kind: failure.kind,
          kernel_run_id: kernelRunId ?? failure.runId,
        });
      }
      // A replay starts no node: the run is the bound attempt's.
      const extractionRunId = kernelRunId ?? binding.kernel_run_id;

      // 5. Every source unchanged since step 2.
      const after = await currentDigests(checkpoint, currentMetadata(ctx.store, checkpointId), globals.repoRoot);
      if (after === null) return done({ status: "skipped", reason: "evidence-changed", changed: ["unreadable"] });
      const changed = changedSources(sources.digests, after);
      if (changed.length > 0) return done({ status: "skipped", reason: "evidence-changed", changed });

      // 6. One knowledge transaction: an existing task is never rewritten.
      const { payload, droppedFacts } = checkpointConfirmedPayload({
        checkpoint,
        submission: { id: submission.id, workerRunId: submission.worker_run_id, seq: Number(submission.seq) },
        knowledge: knowledgeOut,
        refs: extraction.refs,
        digests: sources.digests,
        extraction: { kernelRunId: extractionRunId, requestedModel },
      });
      ctx.ensureClaim();
      const inserted = immediateTransaction(knowledge.db, () => {
        if (taskExists()) return false;
        enqueueIndexTask(knowledge, {
          id: taskId,
          pathway: CHECKPOINT_CONFIRMED_PATHWAY,
          payload: JSON.stringify(payload),
          enqueuedAt: now(),
        });
        return true;
      });

      // 7. Complete with the task id and digests.
      return done({
        status: "enqueued",
        task_id: taskId,
        ...(inserted ? {} : { reused: true }),
        confirmation: checkpoint.confirmation,
        facts: payload.facts.length,
        dropped_facts: droppedFacts,
        kept_advisories: payload.kept_advisories.length,
        advisories: extraction.refs.length,
        note_truncated: extraction.noteTruncated,
        hunks_truncated: extraction.hunksTruncated,
        kernel_run_id: extractionRunId,
        sources: { ...sources.digests },
      }, taskId);
    } finally {
      knowledge.close();
    }
  };
}
