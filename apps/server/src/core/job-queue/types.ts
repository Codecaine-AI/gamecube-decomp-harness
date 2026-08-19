import type { JsonObject } from "@server/core/harness-state/events.js";
import type { StateStore } from "@server/core/orchestrator-state";

export const JOB_KINDS = ["worker", "knowledge_absorption", "sync_publication", "integration"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATUSES = ["queued", "claimed", "running", "waiting", "succeeded", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobExecutionClass = "local" | "sandbox";
export type JobActor = "operator" | "runner";

export interface JobRecord {
  jobId: string; kind: JobKind; dedupeKey: string; gameId: string; runId: string | null;
  status: JobStatus; revision: number; priority: number; concurrencyKey: string | null;
  executionClass: JobExecutionClass; leaseId: string | null; leaseExpiresAt: string | null;
  attempts: number; nextAttemptAt: string | null; payload: JsonObject; resultRef: string | null;
  error: string | null; traceId: string | null; causedByEventId: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
}

/** Minted only by kernel claim; verified against the row's lease_id inside every write transaction. */
export interface ClaimToken { readonly jobId: string; readonly kind: JobKind; readonly leaseId: string; }

export interface JobResult { resultRef?: string | null; detail?: JsonObject; }

/** Durable, JSON-serializable executor handle (persisted on the job row payload as task_handle). */
export interface TaskHandle extends JsonObject { executorId: string; handleId: string; }
export interface TaskStatus { state: "running" | "exited"; }
export interface TaskOutcome {
  exitCode: number | null; signal: string | null; stdout: string; stderr: string;
  timedOut: boolean; startedAt: string; endedAt: string;
}
export interface TaskSpec {
  jobId: string; kind: JobKind; executionClass: JobExecutionClass;
  command: string[]; env: Record<string, string>; cwd: string; timeoutMs: number | null;
}

export interface WorkerExecutor {
  submit(task: TaskSpec): Promise<TaskHandle>;
  poll(handle: TaskHandle): Promise<TaskStatus>;
  collect(handle: TaskHandle): Promise<TaskOutcome>;
  cancel(handle: TaskHandle): Promise<void>;
}

export interface JobHandlerContext { store: StateStore; token: ClaimToken; }
export interface JobCompletionContext { store: StateStore; }
export interface JobPollContext { store: StateStore; }

export type JobKindExecution =
  | { mode: "inline"; handler: (job: JobRecord, ctx: JobHandlerContext) => Promise<JobResult> }
  | { mode: "dispatched"; buildTask: (job: JobRecord, ctx: JobHandlerContext) => TaskSpec | Promise<TaskSpec>; executor: WorkerExecutor };

export interface JobKindDescriptor {
  kind: JobKind;
  concurrencyLimit: number;
  leaseMs: number;
  backoff?: (attempts: number) => number;   // ms until next attempt; default min(300_000, 1_000 * 2 ** min(attempts, 8))
  execution: JobKindExecution;
  onPoll?: (job: JobRecord, ctx: JobPollContext) => void;
  onComplete?: (job: JobRecord, result: JobResult, ctx: JobCompletionContext) => void;  // runs inside the completion transaction
}

/** Kernel operations the consumer depends on (dependency-injected for testability). */
export interface JobQueueKernelOps {
  claimNextJob(store: StateStore, input: { kind: JobKind; concurrencyLimit: number; leaseMs: number; runId?: string; at?: string; actor?: JobActor }): { job: JobRecord; token: ClaimToken } | null;
  claimJobByDedupeKey?(store: StateStore, input: { kind: JobKind; dedupeKey: string; leaseMs: number; at?: string; actor?: JobActor; runId?: string }): { job: JobRecord; token: ClaimToken } | null;
  markJobRunning(store: StateStore, token: ClaimToken, input?: { taskHandle?: TaskHandle; at?: string; actor?: JobActor }): JobRecord;
  heartbeatJob(store: StateStore, token: ClaimToken, input?: { leaseMs?: number; at?: string }): JobRecord;
  completeJob(store: StateStore, token: ClaimToken, result: JobResult, input?: { at?: string; actor?: JobActor; onComplete?: (job: JobRecord, result: JobResult, ctx: JobCompletionContext) => void }): JobRecord;
  failJob(store: StateStore, token: ClaimToken, error: string, input?: { backoffMs?: number; terminal?: boolean; at?: string; actor?: JobActor }): JobRecord;
  cancelJob?(store: StateStore, input: { jobId: string; actor?: JobActor; reason?: string; force?: boolean; at?: string }): JobRecord;
}
