import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import { requireActiveLease } from "@server/core/harness-state";
import { enqueueBackgroundKnowledgeForWorker } from "@server/core/knowledge/background/index.js";
import {
  activeSchedulerEpoch,
  claimNextEpochTarget,
  setClaimWorktreePath,
} from "@server/core/cycle-runtime/run-state";
import { recoverActiveClaims } from "@server/core/cycle-runtime/phases/running/jobs/recover-claims.js";
import type { GlobalArgs, WriteSetIntegrationFlags } from "@server/core/game-registry/runtime-options.js";
import {
  isHostToolPlatform,
  requiredStateToolArtifactError,
  resolveStateToolArtifact,
  resolveToolPlatform,
  type ToolPlatform,
} from "@server/core/tools/platform.js";
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
import { defaultConfigureCommand, LocalProcessExecutor, workerProcessEnv } from "@server/core/job-queue/executor.js";
import {
  provisionWorkerWorktree,
  type WorkerReportArtifactSource,
  type WorkerToolArtifactSource,
} from "@server/core/job-queue/provisioning.js";
import type {
  JobKindDescriptor,
  JobQueueKernelOps,
  JobRecord,
  JobResult,
  TaskSpec,
  WorkerExecutor,
} from "@server/core/job-queue/types.js";
import { workerWorktreePath } from "./worker-cycle.js";

export interface WorkerJobRunContext {
  store: StateStore;
  globals: GlobalArgs;
  runId: string;
  dispatchLeaseId: string;
  baseRev: string;
  ttlSeconds: number;
  concurrencyLimit: number;
  thinkingLevel: string;
  postReturnCheckCommand: string;
  workerConfigureCommand: string;
  graphDbPath: string;
  writeSetFlags: WriteSetIntegrationFlags;
  workerIdPrefix?: string;
}

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
          const target = claimNextEpochTarget({
            store,
            runId: ctx.runId,
            workerId,
            baseRev: ctx.baseRev,
            ttlSeconds: ctx.ttlSeconds,
            artifactDirRoot: resolve(ctx.globals.stateDir, "runs", ctx.runId, "worker_state"),
          });
          if (!target) throw new NoClaimableTargetError();
          attachJobPayload(store, claimedJob.token, {
            target_claim_id: target.claimId,
            worker_state_id: target.workerStateId,
            claimed_epoch_target_id: target.epochTargetId,
            worker_id: workerId,
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
const TOOL_ARTIFACTS = [
  { name: "tools", relativePath: "build/tools" },
  { name: "compilers", relativePath: "build/compilers" },
  { name: "binutils", relativePath: "build/binutils" },
] as const;

function latestArtifactSourcePath(store: StateStore, runId: string, artifactType: string, artifactKey: string): string | null {
  const row = store.db.query(`SELECT source_path FROM dashboard_artifacts
    WHERE run_id = ? AND artifact_type = ? AND artifact_key = ?
    ORDER BY created_at DESC, id DESC LIMIT 1`).get(runId, artifactType, artifactKey) as { source_path?: unknown } | undefined;
  return typeof row?.source_path === "string" && row.source_path ? row.source_path : null;
}

/* Duplicates worker-cycle.ts's private report/tool source lookup so today's spawn path stays unchanged. */
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

function toolArtifactSources(globals: GlobalArgs, platform: ToolPlatform): WorkerToolArtifactSource[] {
  const roots = Array.from(new Set([globals.repoRoot, ...(globals.game?.gameDir ? [resolve(globals.game.gameDir, "worktrees", "upstream-current")] : [])]));
  return TOOL_ARTIFACTS.flatMap((artifact) => {
    const stateSource = resolveStateToolArtifact({ stateDir: globals.stateDir, name: artifact.name, platform });
    if (stateSource) return [{ platform, relativePath: artifact.relativePath, sourcePath: stateSource }];
    if (!isHostToolPlatform(platform)) throw requiredStateToolArtifactError({ stateDir: globals.stateDir, name: artifact.name, platform });
    const sourcePath = roots.map((root) => resolve(root, artifact.relativePath)).find(existsSync);
    return sourcePath ? [{ platform, relativePath: artifact.relativePath, sourcePath }] : [];
  });
}

function payloadString(job: JobRecord, key: string): string {
  const value = job.payload[key];
  if (typeof value !== "string" || !value) throw new Error(`Worker job ${job.jobId} is missing ${key}`);
  return value;
}

export function buildWorkerTask(
  ctx: WorkerJobRunContext,
  deps: { provision?: typeof provisionWorkerWorktree } = {},
): JobKindDescriptor["execution"] extends never ? never : (job: JobRecord, handlerCtx: { store: StateStore; token: import("@server/core/job-queue/types.js").ClaimToken }) => Promise<TaskSpec> {
  return async (job, handlerCtx) => {
    const workerStateId = payloadString(job, "worker_state_id");
    const targetClaimId = payloadString(job, "target_claim_id");
    const workerId = payloadString(job, "worker_id");
    const row = ctx.store.db.query("SELECT artifact_dir FROM worker_state WHERE id = ?").get(workerStateId) as { artifact_dir: string | null } | null;
    if (!row?.artifact_dir) throw new Error(`Worker state ${workerStateId} has no artifact_dir`);
    const artifactDir = row.artifact_dir;
    const workerRepoRoot = workerWorktreePath(ctx.globals, targetClaimId, activeSchedulerEpoch(ctx.store, ctx.runId));
    setClaimWorktreePath(ctx.store, targetClaimId, workerStateId, workerRepoRoot, handlerCtx.token);
    const toolPlatform = resolveToolPlatform();
    await (deps.provision ?? provisionWorkerWorktree)({
      sourceRepoRoot: ctx.globals.repoRoot,
      workerRepoRoot,
      baseRev: ctx.baseRev,
      outputDir: artifactDir,
      configureCommand: ctx.workerConfigureCommand || defaultConfigureCommand(ctx.globals),
      reportArtifactSources: reportArtifactSources(ctx),
      toolArtifactSources: toolArtifactSources(ctx.globals, toolPlatform),
      toolPlatform,
      dryRun: ctx.globals.dryRunAgents,
    });
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
      base_rev: ctx.baseRev,
      worktree_path: workerRepoRoot,
      artifact_dir: artifactDir,
      ttl_seconds: ctx.ttlSeconds,
      thinking_level: ctx.thinkingLevel,
      post_return_check_command: ctx.postReturnCheckCommand,
      worker_configure_command: ctx.workerConfigureCommand,
      graph_db_path: ctx.graphDbPath,
      write_set_flags: ctx.writeSetFlags,
      execution_class: job.executionClass,
    }, null, 2));
    const command = ["bun", resolve(packageRoot(), "apps/server/src/job-runner.ts")];
    if (ctx.globals.gameId) command.push("--game", ctx.globals.gameId);
    command.push("--repo-root", ctx.globals.repoRoot, "--state-dir", ctx.globals.stateDir, "--provider", ctx.globals.provider, "--model", ctx.globals.model, "--thinking-level", ctx.thinkingLevel);
    if (ctx.globals.dryRunAgents) command.push("--dry-run-agents");
    if (ctx.globals.agentTimeoutSeconds != null) command.push("--agent-timeout-seconds", String(ctx.globals.agentTimeoutSeconds));
    command.push("worker-task", "--task-file", taskFile);
    return {
      jobId: job.jobId,
      kind: "worker",
      executionClass: job.executionClass,
      command,
      env: Object.fromEntries(Object.entries(workerProcessEnv(ctx.globals)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      cwd: packageRoot(),
      timeoutMs: Math.max(60_000, ctx.ttlSeconds * 1000),
    };
  };
}

export function onWorkerJobComplete(job: JobRecord, _result: JobResult, ctx: WorkerJobRunContext): void {
  const workerStateId = job.payload.worker_state_id;
  if (typeof workerStateId !== "string" || !workerStateId) return;
  const state = ctx.store.db.query("SELECT ended_at FROM worker_state WHERE id = ?").get(workerStateId) as { ended_at: string | null } | null;
  if (state?.ended_at) enqueueBackgroundKnowledgeForWorker(ctx.store, workerStateId);
  const epochTargetId = job.payload.claimed_epoch_target_id;
  if (typeof epochTargetId !== "string" || !epochTargetId) return;
  const target = ctx.store.db.query("SELECT status FROM epoch_targets WHERE id = ?").get(epochTargetId) as { status: string } | null;
  if (target?.status !== "admitted") return;
  const slot = getJobByDedupeKey(ctx.store, "worker", epochTargetId);
  if (slot && ["succeeded", "failed", "cancelled"].includes(slot.status)) requeueJob(ctx.store, { kind: "worker", dedupeKey: epochTargetId });
}

export function workerJobDescriptor(
  ctx: WorkerJobRunContext,
  deps: { provision?: typeof provisionWorkerWorktree; executor?: WorkerExecutor } = {},
): JobKindDescriptor {
  return {
    kind: "worker",
    concurrencyLimit: ctx.concurrencyLimit,
    leaseMs: ctx.ttlSeconds * 1000,
    execution: { mode: "dispatched", buildTask: buildWorkerTask(ctx, deps), executor: deps.executor ?? new LocalProcessExecutor() },
    onComplete: (job, result) => onWorkerJobComplete(job, result, ctx),
  };
}

export async function reapWorkerJobs(
  store: StateStore,
  ctx: WorkerJobRunContext,
  deps: { recover?: typeof recoverActiveClaims } = {},
): Promise<{ reaped: JobRecord[]; recovered: number }> {
  const reaped = reapExpiredJobs(store, { kind: "worker" });
  let recovered = 0;
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
  return { reaped, recovered };
}
