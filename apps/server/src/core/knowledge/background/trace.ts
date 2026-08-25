import { activeCycleSessionId } from "@server/core/cycle/session.js";
import type { JobRecord } from "@server/core/job-queue/types.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { getDefaultMeleeKernelRuntime } from "@server/infrastructure/kernel/bridge/runtime.js";
import {
  submitMeleeWorkflowTraceEvent,
  type MeleeWorkflowTraceStatus,
} from "@server/infrastructure/kernel/bridge/workflow-trace.js";

/** Label the job container carries in the trace tree. */
const JOB_KIND_LABEL = "Knowledge absorption";
const OPERATION = "knowledge-absorption";

export interface BackgroundKnowledgeTraceHooks {
  onJobClaimed: (job: JobRecord) => Promise<void>;
  onJobSettled: (job: JobRecord, settle: { status: "succeeded" | "failed"; error?: string }) => void;
}

function kernelDisabled(env: Record<string, string | undefined>): boolean {
  return /^(1|true|yes)$/i.test(env.ORCH_AGENT_KERNEL_DISABLED ?? env.ORCH_AGENT_KERNEL_DISABLE ?? "");
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export interface BackgroundKnowledgeTraceOptions {
  env?: Record<string, string | undefined>;
}

/**
 * Trace hooks for the background knowledge queue.
 *
 * Knowledge jobs ran completely dark: they claimed, worked, and settled without
 * ever opening a container, so the lane was invisible in a trace. These hooks
 * open the knowledge lane and one container per job on claim, and close it on
 * settle.
 *
 * Emission is strictly observational. It never fails a job — every path is
 * wrapped, a missing kernel is a no-op, and a game with no active cycle is
 * skipped rather than filed under an invented session id.
 */
export function createBackgroundKnowledgeTraceHooks(
  store: StateStore,
  options: BackgroundKnowledgeTraceOptions = {},
): BackgroundKnowledgeTraceHooks {
  const env = options.env ?? process.env;
  let missingCycleLogged = false;

  const emit = async (
    job: JobRecord,
    status: MeleeWorkflowTraceStatus,
    error?: string,
  ): Promise<void> => {
    try {
      if (kernelDisabled(env)) return;
      const gameId = job.gameId;
      if (!gameId) return;

      // Containers are keyed by cycle. Without an active cycle there is no
      // session to hang them from, and persisting one would mint a cycle id
      // that no reader can resolve. Skip, and say so once.
      const sessionId = activeCycleSessionId(store.db, gameId);
      if (!sessionId) {
        if (!missingCycleLogged) {
          missingCycleLogged = true;
          console.warn(
            `Knowledge trace emission skipped: game ${gameId} has no active cycle`,
          );
        }
        return;
      }

      const runtime = await getDefaultMeleeKernelRuntime();
      if (!runtime) return;

      await submitMeleeWorkflowTraceEvent({
        runtime,
        kind: "knowledge-job",
        gameId,
        sessionId,
        correlationId: job.traceId ?? job.jobId,
        gameEventId: job.causedByEventId ?? job.jobId,
        causedByEventId: null,
        operation: OPERATION,
        status,
        detail: error ?? null,
        metadata: {
          jobId: job.jobId,
          jobKey: job.jobId,
          jobKind: JOB_KIND_LABEL,
          jobQueueKind: job.kind,
          attempts: job.attempts,
          ...(job.runId ? { runId: job.runId } : {}),
          ...(error ? { error } : {}),
        },
      });
    } catch (cause) {
      console.warn(
        `Knowledge trace emission failed for ${job.jobId} (${status}): ${message(cause)}`,
      );
    }
  };

  return {
    onJobClaimed: (job) => emit(job, "started"),
    // The settle hook is synchronous by contract, so this deliberately does not
    // block settlement on a trace write. `emit` swallows its own failures.
    onJobSettled: (job, settle) => {
      void emit(job, settle.status === "succeeded" ? "completed" : "failed", settle.error);
    },
  };
}
