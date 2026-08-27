import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import { requireActiveLease } from "@server/core/harness-state";
import { enqueueBackgroundKnowledgeForWorker } from "@server/core/knowledge/background/index.js";
import {
  activeClaimsForRun,
  claimNextEpochTarget,
  setClaimWorktreePath,
} from "@server/core/cycle-runtime/run-state";
import { recoverActiveClaims } from "@server/core/cycle-runtime/phases/running/jobs/recover-claims.js";
import { sandboxRuntimeOptions } from "@server/core/game-registry/resolver.js";
import type { GlobalArgs, WriteSetIntegrationFlags } from "@server/core/game-registry/runtime-options.js";
import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import {
  attachJobPayload,
  claimNextJob,
  completeJob,
  failJob,
  getJob,
  getJobByDedupeKey,
  heartbeatJob,
  markJobRunning,
  reapExpiredJobs,
  requeueJob,
} from "@server/core/job-queue/kernel.js";
import { LocalProcessExecutor, workerProcessEnv } from "@server/core/job-queue/executor.js";
import { deleteSandboxForJob } from "@server/core/job-queue/sandbox-lifecycle.js";
import {
  provisionSandboxWorkspace,
  type WorkerReportArtifactSource,
} from "@server/core/job-queue/provisioning.js";
import { emitSandboxDeletedEvent } from "@server/core/job-queue/sandbox-events.js";
import {
  DaytonaSandboxProvider,
  FakeSandboxProvider,
  type SandboxProvider,
} from "@server/core/job-queue/sandbox.js";
import type {
  JobKindDescriptor,
  JobQueueKernelOps,
  JobRecord,
  JobResult,
  TaskSpec,
  WorkerExecutor,
} from "@server/core/job-queue/types.js";

export interface WorkerJobRunContext {
  store: StateStore;
  globals: GlobalArgs;
  runId: string;
  dispatchLeaseId: string;
  baseRev: string;
  ttlSeconds: number;
  sandboxSleep: boolean;
  sandboxSleepDebounceMs: number;
  concurrencyLimit: number;
  thinkingLevel: string;
  postReturnCheckCommand: string;
  workerConfigureCommand: string;
  graphDbPath: string;
  writeSetFlags: WriteSetIntegrationFlags;
  workerIdPrefix?: string;
}

export const DEFAULT_SANDBOX_SLEEP_DEBOUNCE_MS = 250;

class NoClaimableTargetError extends Error {}

export function workerKernelOps(ctx: WorkerJobRunContext): JobQueueKernelOps {
  return {
    claimNextJob(store, input) {
      try {
        return immediateTransaction(store.db, () => {
          requireActiveLease(store, ctx.dispatchLeaseId);
          const claimedJob = claimNextJob(store, { ...input, kind: "worker" });
          if (!claimedJob) return null;
          const workerId = `${ctx.workerIdPrefix ?? "jobq"}-${process.pid}-${randomUUID().slice(0, 8)}`;
          // Capture baseRev exactly once at claim time. Provisioning and the
          // task file must see this same value: ctx.baseRev advances on every
          // integration commit, and a sandbox fetched at claim-time baseRev
          // cannot `git show` a newer sha.
          const baseRev = ctx.baseRev;
          const target = claimNextEpochTarget({
            store,
            runId: ctx.runId,
            workerId,
            baseRev,
            ttlSeconds: ctx.ttlSeconds,
            artifactDirRoot: resolve(ctx.globals.stateDir, "runs", ctx.runId, "worker_state"),
          });
          if (!target) throw new NoClaimableTargetError();
          attachJobPayload(store, claimedJob.token, {
            target_claim_id: target.claimId,
            worker_state_id: target.workerStateId,
            claimed_epoch_target_id: target.epochTargetId,
            worker_id: workerId,
            base_rev: baseRev,
            ttl: target.ttl,
          });
          return { job: getJob(store, claimedJob.job.jobId)!, token: claimedJob.token };
        });
      } catch (error) {
        if (error instanceof NoClaimableTargetError) return null;
        throw error;
      }
    },
    markJobRunning,
    heartbeatJob,
    completeJob,
    failJob,
  };
}

const REPORT_PATHS = [
  "build/GALE01/report.json",
  "build/GALE01/report_changes.json",
  "build/GALE01/baseline.json",
];
function latestArtifactSourcePath(store: StateStore, runId: string, artifactType: string, artifactKey: string): string | null {
  const row = store.db.query(`SELECT source_path FROM dashboard_artifacts
    WHERE run_id = ? AND artifact_type = ? AND artifact_key = ?
    ORDER BY created_at DESC, id DESC LIMIT 1`).get(runId, artifactType, artifactKey) as { source_path?: unknown } | undefined;
  return typeof row?.source_path === "string" && row.source_path ? row.source_path : null;
}

/* Duplicates worker-cycle.ts's private report source lookup so today's spawn path stays unchanged. */
function reportArtifactSources(ctx: WorkerJobRunContext): WorkerReportArtifactSource[] {
  const gameDir = ctx.globals.game?.gameDir ?? dirname(ctx.globals.repoRoot);
  const fallbackRoots = [ctx.globals.repoRoot, resolve(gameDir, "worktrees", "upstream-current")];
  const dashboard: Record<string, Array<string | null>> = {
    [REPORT_PATHS[0]]: [latestArtifactSourcePath(ctx.store, ctx.runId, "board_snapshot", "current"), latestArtifactSourcePath(ctx.store, ctx.runId, "board_snapshot", "initial")],
    [REPORT_PATHS[1]]: [latestArtifactSourcePath(ctx.store, ctx.runId, "trusted_report", "current"), latestArtifactSourcePath(ctx.store, ctx.runId, "trusted_report", "baseline")],
    [REPORT_PATHS[2]]: [],
  };
  return REPORT_PATHS.flatMap((relativePath) => {
    const sourcePath = [...dashboard[relativePath], ...fallbackRoots.map((root) => resolve(root, relativePath))]
      .find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0 && existsSync(candidate));
    return sourcePath ? [{ relativePath, sourcePath }] : [];
  });
}

function payloadString(job: JobRecord, key: string): string {
  const value = job.payload[key];
  if (typeof value !== "string" || !value) throw new Error(`Worker job ${job.jobId} is missing ${key}`);
  return value;
}

interface WorkerJobDeps {
  provisionSandbox?: typeof provisionSandboxWorkspace;
  sandboxProvider?: SandboxProvider;
  executor?: WorkerExecutor;
  trackSandboxDeletion?: (deletion: Promise<void>) => void;
}

export function buildWorkerTask(
  ctx: WorkerJobRunContext,
  deps: WorkerJobDeps = {},
): JobKindDescriptor["execution"] extends never ? never : (job: JobRecord, handlerCtx: { store: StateStore; token: import("@server/core/job-queue/types.js").ClaimToken }) => Promise<TaskSpec> {
  let defaultSandboxProvider: SandboxProvider | undefined;
  return async (job, handlerCtx) => {
    const workerStateId = payloadString(job, "worker_state_id");
    const targetClaimId = payloadString(job, "target_claim_id");
    const workerId = payloadString(job, "worker_id");
    // The claim-time baseRev is authoritative for the whole job: reading
    // ctx.baseRev again after the multi-minute provision await could name a
    // commit the sandbox never fetched. Jobs claimed before base_rev was
    // recorded in the payload fall back to the current ctx value, read once.
    const baseRev = payloadString(job, "base_rev") || ctx.baseRev;
    const row = ctx.store.db.query("SELECT artifact_dir FROM worker_state WHERE id = ?").get(workerStateId) as { artifact_dir: string | null } | null;
    if (!row?.artifact_dir) throw new Error(`Worker state ${workerStateId} has no artifact_dir`);
    const artifactDir = row.artifact_dir;
    let provisionedSandbox: { provider: SandboxProvider; sandboxId: string } | undefined;
    try {
      const sandbox = sandboxRuntimeOptions(ctx.globals.game, ctx.globals.sandboxProfile);
      const provider = deps.sandboxProvider
        ?? (defaultSandboxProvider ??= ctx.globals.dryRunAgents
          ? new FakeSandboxProvider()
          : new DaytonaSandboxProvider());
      // worker_state has no trace_id column; its owning workflow trace is carried by the worker job.
      const traceId = job.traceId ?? `trace-job-${job.jobId}`;
      const provisioned = await (deps.provisionSandbox ?? provisionSandboxWorkspace)({
        provider,
        sourceRepoRoot: ctx.globals.repoRoot,
        baseRev,
        snapshotBakedRev: sandbox.snapshot_baked_rev,
        workspaceRoot: sandbox.workspace_root,
        snapshot: sandbox.snapshot_name,
        resources: {
          cpu: sandbox.resource_class.cpu,
          memoryGiB: sandbox.resource_class.memory_gib,
          diskGiB: sandbox.resource_class.disk_gib,
        },
        ttlSeconds: ctx.ttlSeconds,
        labels: {
          game_id: job.gameId,
          run_id: ctx.runId,
          claim_id: targetClaimId,
          job_id: job.jobId,
          job_lease_id: handlerCtx.token.leaseId,
          dispatch_lease_id: ctx.dispatchLeaseId,
          worker_state_id: workerStateId,
          trace_id: traceId,
        },
        reportArtifactSources: reportArtifactSources(ctx),
        event: {
          store: ctx.store,
          context: {
            gameId: job.gameId,
            correlationId: job.jobId,
            causationId: job.causedByEventId ?? job.jobId,
            traceId,
            jobId: job.jobId,
            claimId: targetClaimId,
            workerStateId,
          },
        },
      });
      provisionedSandbox = { provider, sandboxId: provisioned.sandboxId };
      const workerRepoRoot = provisioned.workspaceRoot;
      attachJobPayload(ctx.store, handlerCtx.token, { sandbox_id: provisioned.sandboxId });
      // The job's sandbox_id qualifies this shared in-sandbox path as a durable workspace reference.
      setClaimWorktreePath(ctx.store, targetClaimId, workerStateId, workerRepoRoot, handlerCtx.token);
      await mkdir(artifactDir, { recursive: true });
      const taskFile = resolve(artifactDir, "task_spec.json");
      await writeFile(taskFile, JSON.stringify({
        version: 1,
        run_id: ctx.runId,
        worker_id: workerId,
        job_id: job.jobId,
        claim_token: { jobId: handlerCtx.token.jobId, kind: handlerCtx.token.kind, leaseId: handlerCtx.token.leaseId },
        target_claim_id: targetClaimId,
        worker_state_id: workerStateId,
        base_rev: baseRev,
        artifact_dir: artifactDir,
        ttl_seconds: ctx.ttlSeconds,
        sandbox_sleep: ctx.sandboxSleep,
        sandbox_sleep_debounce_ms: ctx.sandboxSleepDebounceMs,
        thinking_level: ctx.thinkingLevel,
        post_return_check_command: ctx.postReturnCheckCommand,
        worker_configure_command: ctx.workerConfigureCommand,
        graph_db_path: ctx.graphDbPath,
        write_set_flags: ctx.writeSetFlags,
        execution_class: "sandbox",
        sandbox_id: provisionedSandbox.sandboxId,
        workspace_root: workerRepoRoot,
      }, null, 2));
      const command = ["bun", resolve(packageRoot(), "apps/server/src/job-runner.ts")];
      if (ctx.globals.gameId) command.push("--game", ctx.globals.gameId);
      command.push("--repo-root", ctx.globals.repoRoot, "--state-dir", ctx.globals.stateDir, "--provider", ctx.globals.provider, "--model", ctx.globals.model, "--thinking-level", ctx.thinkingLevel);
      if (ctx.globals.dryRunAgents) command.push("--dry-run-agents");
      if (ctx.globals.agentTimeoutSeconds != null) command.push("--agent-timeout-seconds", String(ctx.globals.agentTimeoutSeconds));
      if (ctx.globals.sandboxProfile) command.push("--sandbox-profile", ctx.globals.sandboxProfile);
      command.push("worker-task", "--task-file", taskFile);
      return {
        jobId: job.jobId,
        kind: "worker",
        executionClass: "sandbox",
        command,
        env: Object.fromEntries(Object.entries(workerProcessEnv(ctx.globals)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
        cwd: packageRoot(),
        timeoutMs: Math.max(60_000, ctx.ttlSeconds * 1000),
      };
    } catch (error) {
      if (provisionedSandbox) {
        let deleted = false;
        try {
          await provisionedSandbox.provider.delete(provisionedSandbox.sandboxId, "provision_failure");
          deleted = true;
        } catch {}
        if (deleted) {
          try {
            emitSandboxDeletedEvent(ctx.store, {
              gameId: job.gameId,
              sandboxId: provisionedSandbox.sandboxId,
              correlationId: job.jobId,
              causationId: job.causedByEventId ?? job.jobId,
              traceId: job.traceId ?? `trace-job-${job.jobId}`,
              reason: "provision_failure",
              jobId: job.jobId,
              claimId: targetClaimId,
            });
          } catch {}
        }
      }
      throw error;
    }
  };
}

export function onWorkerJobComplete(
  job: JobRecord,
  _result: JobResult,
  ctx: WorkerJobRunContext,
  deps: { sandboxProvider?: SandboxProvider } = {},
): Promise<void> | undefined {
  const workerStateId = job.payload.worker_state_id;
  if (typeof workerStateId !== "string" || !workerStateId) return;
  const state = ctx.store.db.query(`SELECT worker_state.ended_at, target_claims.status AS claim_status
    FROM worker_state
    LEFT JOIN target_claims ON target_claims.id = worker_state.target_claim_id
    WHERE worker_state.id = ?`).get(workerStateId) as { ended_at: string | null; claim_status: string | null } | null;
  let sandboxDeletion: Promise<void> | undefined;
  if (state?.ended_at) {
    enqueueBackgroundKnowledgeForWorker(ctx.store, workerStateId);
    if (state.claim_status === "closed" && deps.sandboxProvider && typeof job.payload.sandbox_id === "string" && job.payload.sandbox_id) {
      // onComplete runs inside the job settlement transaction. Defer provider I/O
      // until that transaction has committed, and never reject into the host path.
      sandboxDeletion = Promise.resolve()
        .then(() => deleteSandboxForJob(ctx.store, job, "settlement", deps))
        .then(() => undefined)
        .catch((error) => console.warn(`[sandbox] settlement teardown failed for job ${job.jobId}`, error));
    }
  }
  const epochTargetId = job.payload.claimed_epoch_target_id;
  if (typeof epochTargetId === "string" && epochTargetId) {
    const target = ctx.store.db.query("SELECT status FROM epoch_targets WHERE id = ?").get(epochTargetId) as { status: string } | null;
    if (target?.status === "admitted") {
      const slot = getJobByDedupeKey(ctx.store, "worker", epochTargetId);
      if (slot && ["succeeded", "failed", "cancelled"].includes(slot.status)) requeueJob(ctx.store, { kind: "worker", dedupeKey: epochTargetId });
    }
  }
  return sandboxDeletion;
}

export function workerJobDescriptor(
  ctx: WorkerJobRunContext,
  deps: WorkerJobDeps = {},
): JobKindDescriptor {
  const sandboxDeletionFired = new Set<string>();
  return {
    kind: "worker",
    concurrencyLimit: ctx.concurrencyLimit,
    leaseMs: ctx.ttlSeconds * 1000,
    execution: { mode: "dispatched", buildTask: buildWorkerTask(ctx, deps), executor: deps.executor ?? new LocalProcessExecutor() },
    onPoll: (job) => {
      if (sandboxDeletionFired.has(job.jobId) || !deps.sandboxProvider) return;
      const freshJob = typeof job.payload.sandbox_id === "string" && job.payload.sandbox_id
        ? job
        : getJob(ctx.store, job.jobId);
      if (!freshJob || typeof freshJob.payload.sandbox_id !== "string" || !freshJob.payload.sandbox_id) return;
      const workerStateId = freshJob.payload.worker_state_id;
      if (typeof workerStateId !== "string" || !workerStateId) return;
      const state = ctx.store.db.query(`SELECT worker_state.ended_at, target_claims.status AS claim_status
        FROM worker_state
        LEFT JOIN target_claims ON target_claims.id = worker_state.target_claim_id
        WHERE worker_state.id = ?`).get(workerStateId) as { ended_at: string | null; claim_status: string | null } | null;
      if (!state?.ended_at || state.claim_status !== "closed") return;
      sandboxDeletionFired.add(job.jobId);
      const deletion = Promise.resolve()
        .then(() => deleteSandboxForJob(ctx.store, freshJob, "settlement", deps))
        .then((deleted) => {
          if (!deleted) sandboxDeletionFired.delete(job.jobId);
        })
        .catch((error) => {
          sandboxDeletionFired.delete(job.jobId);
          console.warn(`[sandbox] settlement teardown failed for job ${job.jobId}`, error);
        });
      deps.trackSandboxDeletion?.(deletion);
    },
    onComplete: (job, result) => {
      const deletion = onWorkerJobComplete(job, result, ctx, deps);
      if (deletion) deps.trackSandboxDeletion?.(deletion);
    },
  };
}

export async function reapWorkerJobs(
  store: StateStore,
  ctx: WorkerJobRunContext,
  deps: { recover?: typeof recoverActiveClaims; sandboxProvider?: SandboxProvider } = {},
): Promise<{ reaped: JobRecord[]; recovered: number; expiredClaimsRecovered: number }> {
  const reaped = reapExpiredJobs(store, { kind: "worker" });
  const sandboxDeletions = reaped.map((job) =>
    deleteSandboxForJob(store, job, "reap", deps)
      .catch((error) => console.warn(`[sandbox] reap teardown failed for job ${job.jobId}`, error))
  );
  let recovered = 0;
  let expiredClaimsRecovered = 0;
  try {
    for (const job of reaped) {
      const claimId = job.payload.target_claim_id;
      if (typeof claimId !== "string" || !claimId) continue;
      const result = await (deps.recover ?? recoverActiveClaims)({
        globals: ctx.globals,
        store,
        runId: ctx.runId,
        repoRoot: ctx.globals.repoRoot,
        force: true,
        claimIdFilter: claimId,
        leaseId: ctx.dispatchLeaseId,
        reason: "worker job lease expired (queue reap)",
        processIntegrations: false,
      });
      recovered += result.recoveredClaims;
    }
    if (activeClaimsForRun(store, ctx.runId).some((claim) => Date.parse(claim.ttl) < Date.now())) {
      try {
        const result = await (deps.recover ?? recoverActiveClaims)({
          globals: ctx.globals,
          store,
          runId: ctx.runId,
          repoRoot: ctx.globals.repoRoot,
          force: false,
          leaseId: ctx.dispatchLeaseId,
          reason: "expired worker claim recovery (queue reap lane)",
          processIntegrations: false,
        });
        expiredClaimsRecovered = result.recoveredClaims;
      } catch (error) {
        console.warn("Skipped expired worker claim recovery while run-control recovery owns the journal", error);
      }
    }
  } finally {
    await Promise.allSettled(sandboxDeletions);
  }
  return { reaped, recovered, expiredClaimsRecovered };
}
