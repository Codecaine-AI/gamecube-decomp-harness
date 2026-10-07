// The `checkpoint_adjudication` lane handler (plan §6.4, M9-D task 1):
// adjudicates one eligible shadow checkpoint out of band, in the run-loop
// process, and records the result in its metadata. Acceptance never changes:
// the result is written with `applied: false` and nothing else reads it to
// gate a checkpoint.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { adjudicateAdvisories } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/index.js";
import type {
  AdvisoryAdjudication,
  LlmReviewCandidate,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/types.js";
import type { JsonObject } from "@server/core/harness-state/events.js";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { JobRecord, JobResult } from "@server/core/job-queue/types.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { getNodeKernel, type WorkerNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import type { ModelNodeHandlerContext, ModelNodeJobHandler } from "../lane.js";

/** Kernel request ids derive from it, so a retried job replays finished nodes instead of re-paying (§6.5). */
export function adjudicationRequestIdPrefix(checkpointId: string): string {
  return `checkpoint:${checkpointId}`;
}

export interface AdjudicationHandlerDeps {
  /** Default: the process's node kernel over `globals.stateDir`. */
  nodeKernel?: () => Promise<WorkerNodeKernel | null>;
  /** Default: the shared adjudication core (§6.5). */
  adjudicate?: typeof adjudicateAdvisories;
}

interface CheckpointRow {
  candidate: string | null;
  adjudication: string | null;
}

interface Evidence {
  text: string | null;
  sha256: string | null;
}

function done(checkpointId: string | null, detail: JsonObject): JobResult {
  return { resultRef: checkpointId, detail };
}

function loadCheckpoint(store: StateStore, checkpointId: string): CheckpointRow | null {
  return store.db
    .query<CheckpointRow, [string]>(`
      SELECT
        CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json, '$.llm_review_candidate') END AS candidate,
        CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json, '$.llm_review_adjudication') END AS adjudication
      FROM worker_checkpoints WHERE id = ?`)
    .get(checkpointId);
}

/** The stored candidate when the catch-up predicate still holds for it, else null. */
function shadowCandidate(raw: string | null): LlmReviewCandidate | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<LlmReviewCandidate>;
  if (candidate.schema !== "llm_review_candidate_v1" || candidate.mode !== "shadow" || candidate.eligible !== true) return null;
  if (!candidate.kernel || typeof candidate.kernel.run_id !== "string" || !candidate.kernel.run_id) return null;
  if (!Array.isArray(candidate.advisories)) return null;
  return candidate as LlmReviewCandidate;
}

/** Reads one evidence file; unreadable or unnamed evidence is a null text, never a throw. */
async function readEvidence(repoRoot: string, path: string | null | undefined): Promise<Evidence> {
  if (typeof path !== "string" || !path) return { text: null, sha256: null };
  try {
    const bytes = await readFile(resolve(repoRoot, path));
    return { text: bytes.toString("utf8"), sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return { text: null, sha256: null };
  }
}

/** One atomic json_set (§6.3); write-once, so a replayed job never overwrites a recorded result. */
function recordAdjudication(store: StateStore, checkpointId: string, result: AdvisoryAdjudication): boolean {
  const written = store.db
    .query(`
      UPDATE worker_checkpoints
      SET metadata_json = json_set(metadata_json, '$.llm_review_adjudication', json(?))
      WHERE id = ? AND json_extract(metadata_json, '$.llm_review_adjudication') IS NULL`)
    .run(JSON.stringify(result), checkpointId);
  return written.changes > 0;
}

function summary(result: AdvisoryAdjudication, written: boolean): JsonObject {
  const failed = result.verdict === "error" || result.extraction.status === "error";
  return {
    status: failed ? "error" : "ok",
    verdict: result.verdict,
    extraction_status: result.extraction.status,
    advisories: result.advisories.length,
    accepted: result.accepted_fingerprints.length,
    duration_ms: result.duration_ms,
    ...(result.gate_span_id ? { gate_span_id: result.gate_span_id } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(written ? {} : { reused: true }),
  };
}

function throwIfAborted(signal: AbortSignal, checkpointId: string): void {
  // Thrown, not recorded: the job retries after the lease and the kernel replays the nodes that finished.
  if (signal.aborted) throw new Error(`checkpoint_adjudication ${checkpointId}: lane stopped before the result was recorded`);
}

/**
 * Factory for the `checkpoint_adjudication` lane (§6.3, §6.4). Engine
 * failures come back from `adjudicateAdvisories` as results and are
 * recorded; the handler throws only for infrastructure (no node kernel, a
 * closed store, a stopping lane), so the queue backs off and retries and
 * nothing escapes the lane. Idempotent per checkpoint: an existing result is
 * kept, and kernel request ids replay finished nodes.
 */
export function createAdjudicationHandler(globals: GlobalArgs, deps: AdjudicationHandlerDeps = {}): ModelNodeJobHandler {
  const nodeKernel = deps.nodeKernel ?? (() => getNodeKernel({ stateDir: globals.stateDir }));
  const adjudicate = deps.adjudicate ?? adjudicateAdvisories;

  return async (job: JobRecord, ctx: ModelNodeHandlerContext): Promise<JobResult> => {
    const checkpointId = typeof job.payload.checkpointId === "string" ? job.payload.checkpointId : "";
    if (!checkpointId) return done(null, { status: "skipped", reason: "invalid-payload" });
    // Defensive: dry-run lanes construct no handler. Dry-run agents make no model calls either way.
    if (globals.dryRunAgents) return done(checkpointId, { status: "skipped", reason: "dry-run-agents" });

    const row = loadCheckpoint(ctx.store, checkpointId);
    if (!row) return done(checkpointId, { status: "skipped", reason: "checkpoint-missing" });
    if (row.adjudication !== null) return done(checkpointId, { status: "skipped", reason: "already-adjudicated" });
    const candidate = shadowCandidate(row.candidate);
    if (!candidate) return done(checkpointId, { status: "skipped", reason: "not-eligible" });
    throwIfAborted(ctx.signal, checkpointId);

    const [note, patch] = await Promise.all([
      readEvidence(globals.repoRoot, candidate.agent_output_path),
      readEvidence(globals.repoRoot, candidate.scan_path),
    ]);
    // A null kernel and missing evidence are the core's to classify: no node call either way,
    // a retryable result for the kernel, a recorded evidence-missing result for the files.
    const kernel = await nodeKernel();
    const adjudicated = await adjudicate({
      kernel,
      candidate,
      noteText: note.text,
      patchText: patch.text,
      signal: ctx.signal,
      requestIdPrefix: adjudicationRequestIdPrefix(checkpointId),
      // The digests of the exact bytes this handler read.
      sources: { note_sha256: note.sha256, patch_sha256: patch.sha256 },
    });
    throwIfAborted(ctx.signal, checkpointId);
    // Infrastructure (no node kernel, kernel write failure, unexpected exception) is retried, not recorded.
    if (adjudicated.retryable) {
      throw new Error(`checkpoint_adjudication ${checkpointId}: ${adjudicated.error ?? "retryable adjudication failure"}`);
    }
    // Shadow never applies.
    const result: AdvisoryAdjudication = { ...adjudicated, applied: false };
    // A handler that outlived its claim (released at shutdown, lease lost) throws here and writes nothing.
    ctx.ensureClaim();
    const written = recordAdjudication(ctx.store, checkpointId, result);
    return done(checkpointId, summary(result, written));
  };
}
