import { getHarnessState, requireActiveLease } from "@server/core/harness-state";
import type { StateStore } from "@server/core/orchestrator-state";
import { emitSandboxDeletedEvent } from "./sandbox-events.js";
import { getJob } from "./kernel.js";
import type { SandboxDeleteReason, SandboxProvider } from "./sandbox.js";
import type { JobRecord } from "./types.js";

export type SandboxLifecycleWarning = (message: string, error?: unknown) => void;

interface SandboxDeletionContext {
  gameId: string;
  sandboxId: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  jobId?: string;
  claimId?: string;
}

export interface SandboxLifecycleDeps {
  sandboxProvider?: SandboxProvider;
  warn?: SandboxLifecycleWarning;
  retryDelay?: (milliseconds: number) => Promise<void>;
  settlementDeleteTimeoutMs?: number;
}

export interface SandboxReconciliationResult {
  scanned: number;
  kept: number;
  deleted: number;
  failed: number;
}

function nonempty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function alreadyDeleted(store: StateStore, sandboxId: string): boolean {
  return Boolean(store.db.query(`SELECT 1 FROM game_events
    WHERE event_type = 'sandbox.deleted' AND subject_kind = 'sandbox' AND subject_id = ?
    LIMIT 1`).get(sandboxId));
}

function providerError(error: unknown): {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  response?: { status?: unknown };
} {
  return error && typeof error === "object" ? error : {};
}

function isNotFound(error: unknown): boolean {
  const candidate = providerError(error);
  return candidate.name === "DaytonaNotFoundError"
    || candidate.status === 404
    || candidate.statusCode === 404
    || candidate.response?.status === 404;
}

function isTransientDeleteFailure(error: unknown): boolean {
  const candidate = providerError(error);
  const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  return status === 502
    || (candidate.name === "DaytonaConflictError"
      && typeof candidate.message === "string"
      && candidate.message.toLowerCase().includes("state change in progress"));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class SettlementDeleteTimeoutError extends Error {}

async function beforeDeadline<T>(work: Promise<T>, deadline: number | undefined): Promise<T> {
  if (deadline === undefined) return work;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new SettlementDeleteTimeoutError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SettlementDeleteTimeoutError()), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function deleteSandbox(
  store: StateStore,
  context: SandboxDeletionContext,
  reason: SandboxDeleteReason,
  deps: SandboxLifecycleDeps,
): Promise<"deleted" | "failed" | "skipped"> {
  const provider = deps.sandboxProvider;
  if (!provider || alreadyDeleted(store, context.sandboxId)) return "skipped";
  const warn = deps.warn ?? ((message: string, error?: unknown) => console.warn(message, error));
  const retryDelay = deps.retryDelay ?? delay;
  const deadline = reason === "settlement"
    ? Date.now() + (deps.settlementDeleteTimeoutMs ?? 120_000)
    : undefined;
  const retryWaits = [5_000, 15_000];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await beforeDeadline(provider.delete(context.sandboxId, reason), deadline);
      break;
    } catch (error) {
      if (error instanceof SettlementDeleteTimeoutError) {
        warn(`[sandbox] settlement delete timed out for ${context.sandboxId}; leaving to reconciliation`);
        return "failed";
      }
      if (isNotFound(error)) break;
      const retryWait = retryWaits[attempt];
      if (retryWait !== undefined && isTransientDeleteFailure(error)) {
        try {
          await beforeDeadline(retryDelay(retryWait), deadline);
        } catch (delayError) {
          if (delayError instanceof SettlementDeleteTimeoutError) {
            warn(`[sandbox] settlement delete timed out for ${context.sandboxId}; leaving to reconciliation`);
            return "failed";
          }
          throw delayError;
        }
        continue;
      }
      warn(`[sandbox] failed to delete ${context.sandboxId} (${reason})`, error);
      return "failed";
    }
  }
  try {
    emitSandboxDeletedEvent(store, {
      gameId: context.gameId,
      sandboxId: context.sandboxId,
      correlationId: context.correlationId,
      causationId: context.causationId,
      traceId: context.traceId,
      reason,
      jobId: context.jobId,
      claimId: context.claimId,
    });
    return "deleted";
  } catch (error) {
    warn(`[sandbox] deleted ${context.sandboxId} (${reason}) but failed to emit sandbox.deleted`, error);
    return "failed";
  }
}

export async function deleteSandboxForJob(
  store: StateStore,
  job: JobRecord,
  reason: Extract<SandboxDeleteReason, "settlement" | "reap">,
  deps: SandboxLifecycleDeps = {},
): Promise<boolean> {
  const sandboxId = nonempty(job.payload.sandbox_id);
  if (!sandboxId || !deps.sandboxProvider) return false;
  const claimId = nonempty(job.payload.target_claim_id);
  const result = await deleteSandbox(store, {
    gameId: job.gameId,
    sandboxId,
    correlationId: job.runId ?? job.jobId,
    causationId: job.causedByEventId ?? job.jobId,
    traceId: job.traceId ?? `trace-job-${job.jobId}`,
    jobId: job.jobId,
    claimId,
  }, reason, deps);
  return result === "deleted";
}

export async function deleteSandboxForRetryReprovision(
  store: StateStore,
  job: JobRecord,
  sandboxId: string,
  deps: SandboxLifecycleDeps = {},
): Promise<"deleted" | "failed" | "skipped"> {
  return deleteSandbox(store, {
    gameId: job.gameId,
    sandboxId,
    correlationId: job.runId ?? job.jobId,
    causationId: job.causedByEventId ?? job.jobId,
    traceId: job.traceId ?? `trace-job-${job.jobId}`,
    jobId: job.jobId,
    claimId: nonempty(job.payload.target_claim_id),
  }, "retry_reprovision", deps);
}

function hasActiveClaim(store: StateStore, claimId: string): boolean {
  const row = store.db.query("SELECT status FROM target_claims WHERE id = ?").get(claimId) as
    | { status: string }
    | null;
  return row?.status === "active";
}

function isLiveSandbox(
  store: StateStore,
  sandbox: { sandboxId: string; labels: Record<string, string> },
  gameId: string,
): { job: JobRecord; claimId: string } | null {
  const jobId = nonempty(sandbox.labels.job_id);
  const jobLeaseId = nonempty(sandbox.labels.job_lease_id);
  const dispatchLeaseId = nonempty(sandbox.labels.dispatch_lease_id);
  const claimId = nonempty(sandbox.labels.claim_id);
  const runId = nonempty(sandbox.labels.run_id);
  if (!jobId || !jobLeaseId || !dispatchLeaseId || !claimId || !runId) return null;

  const job = getJob(store, jobId);
  if (!job || job.kind !== "worker" || !["claimed", "running", "waiting"].includes(job.status)) return null;
  if (job.gameId !== gameId || job.runId !== runId) return null;
  if (job.payload.sandbox_id !== sandbox.sandboxId) return null;

  const activeLeaseId = getHarnessState(store, gameId)?.active_workflow?.lease_id;
  if (!activeLeaseId) return null;
  let dispatch: ReturnType<typeof requireActiveLease>;
  try {
    dispatch = requireActiveLease(store, activeLeaseId, gameId);
  } catch {
    return null;
  }
  if (dispatch.kind !== "run" || dispatch.workflow_id !== runId) return null;
  return hasActiveClaim(store, claimId) ? { job, claimId } : null;
}

export async function reconcileSandboxes(
  store: StateStore,
  input: { gameId: string; at?: string },
  deps: SandboxLifecycleDeps = {},
): Promise<SandboxReconciliationResult> {
  const provider = deps.sandboxProvider;
  const result: SandboxReconciliationResult = { scanned: 0, kept: 0, deleted: 0, failed: 0 };
  if (!provider) return result;
  const warn = deps.warn ?? ((message: string, error?: unknown) => console.warn(message, error));
  let sandboxes: Array<{ sandboxId: string; labels: Record<string, string> }>;
  try {
    sandboxes = await provider.listByLabels({ game_id: input.gameId });
  } catch (error) {
    warn(`[sandbox] failed to list sandboxes for ${input.gameId} during reconciliation`, error);
    return { ...result, failed: 1 };
  }
  result.scanned = sandboxes.length;
  if (sandboxes.length === 0) return result;

  const harness = getHarnessState(store, input.gameId);
  for (const sandbox of sandboxes) {
    const live = isLiveSandbox(store, sandbox, input.gameId);
    if (live) {
      result.kept += 1;
      continue;
    }
    const jobId = nonempty(sandbox.labels.job_id);
    const job = jobId ? getJob(store, jobId) : null;
    const claimId = nonempty(sandbox.labels.claim_id);
    const deletion = await deleteSandbox(store, {
      gameId: input.gameId,
      sandboxId: sandbox.sandboxId,
      correlationId: nonempty(sandbox.labels.run_id) ?? job?.runId ?? sandbox.sandboxId,
      causationId: job?.causedByEventId ?? harness?.caused_by_event_id ?? sandbox.sandboxId,
      traceId: job?.traceId ?? nonempty(sandbox.labels.trace_id) ?? harness?.trace_id ?? `trace-sandbox-${sandbox.sandboxId}`,
      jobId,
      claimId,
    }, "reconciliation", { sandboxProvider: provider, warn, retryDelay: deps.retryDelay });
    if (deletion === "deleted" || deletion === "skipped") result.deleted += 1;
    else result.failed += 1;
  }
  return result;
}
