# Implementation Scope

All paths relative to `apps/server/src/` unless noted.

## New module: `core/job-queue/`

```
core/job-queue/
  kernel.ts        enqueue / claim / heartbeat / complete / fail / cancel / reap / summary
  descriptor.ts    JobKindDescriptor type + registry
  types.ts         JobRecord, JobStatus, ClaimToken, JobResult
  consumer.ts      per-kind consumer pool (single-flight tick, kind-filtered claims)
  executor.ts      WorkerExecutor port + LocalProcessExecutor adapter
  kernel.test.ts   consumer.test.ts   executor.test.ts
```

### `jobs` table (added to final-schema.ts baseline)

```sql
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                        -- 'worker' | 'knowledge_absorption' | 'sync_publication' | 'integration'
  dedupe_key TEXT NOT NULL,                  -- natural key within kind
  game_id TEXT NOT NULL, run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','claimed','running','waiting','succeeded','failed','cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  priority INTEGER NOT NULL DEFAULT 0,       -- worker: board priority; others: 0 (FIFO)
  concurrency_key TEXT,                      -- e.g. 'integration' singleton; NULL = kind-level limit only
  execution_class TEXT NOT NULL DEFAULT 'local' CHECK (execution_class IN ('local','sandbox')),
  lease_id TEXT, lease_expires_at TEXT,      -- visibility timeout; renewed by heartbeat for dispatched kinds
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),   -- small: ids + params only
  result_ref TEXT,                           -- id into domain tables (worker_state id, publication digest, ...)
  error_json TEXT, trace_id TEXT,
  caused_by_event_id TEXT REFERENCES game_events(event_id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
  UNIQUE (kind, dedupe_key)
);
CREATE INDEX jobs_claim ON jobs (kind, status, next_attempt_at, priority DESC, created_at, job_id);
```

Claim ordering: `priority DESC, created_at ASC, job_id ASC`. Claim selects
`status IN ('queued','waiting') AND (next_attempt_at IS NULL OR next_attempt_at <= now)` OR
self-reaps `status IN ('claimed','running') AND lease_expires_at <= now`. Every transition:
revision CAS + game_events append (copy the proven shape from knowledge/background/index.ts:98-126).

### Kind descriptor

```ts
type JobKindDescriptor = {
  kind: JobKind;
  concurrencyLimit: number;                        // worker: pool size; knowledge: 2; integration: 1
  leaseMs: number;                                 // inline ~60s; dispatched: renewed via heartbeat
  backoff: (attempts: number) => number;           // default: min(300s, 1s * 2^min(attempts,8))
  execution:
    | { mode: 'inline'; handler: (job, ctx) => Promise<JobResult> }
    | { mode: 'dispatched'; buildTask: (job, ctx) => TaskSpec; executor: WorkerExecutor };
  onComplete?: (job, result, tx) => void;          // explicit chaining, same transaction
};
```

### Executor port

```ts
type WorkerExecutor = {
  submit(task: TaskSpec): Promise<TaskHandle>;     // TaskHandle is durable (stored on the job row)
  poll(handle: TaskHandle): Promise<TaskStatus>;
  collect(handle: TaskHandle): Promise<TaskOutcome>;
  cancel(handle: TaskHandle): Promise<void>;
};
```

`LocalProcessExecutor` = the ~100 lines extracted from run-loop.ts:721-821 (workerCommand,
workerProcessEnv, runWorkerProcess, defaultConfigureCommand) plus process registry. Daytona
sandbox executor is a future second adapter selected by `execution_class` — port must not leak
Bun.spawn types.

### Claim token

`claim()` returns `ClaimToken` (branded object holding job_id + lease_id + revision, mintable
only by kernel.ts). All post-claim durable writes take the token; kernel verifies lease_id +
expiry against the row inside the write transaction. Reap invalidates by rotating lease_id.

## Changed modules

- **run-state/epochs.ts** — admission additionally enqueues one `worker` job per admitted target
  (dedupe_key = epoch_target id, priority = board priority). Availability refresh updates job
  priority for queued jobs. Selection math unchanged.
- **run-state/worker-state.ts** — `claimNextEpochTarget` becomes the worker kind's claim handler
  invoked host-side by the consumer (not by the worker child). Signature gains ClaimToken;
  recycle branch preserved. `recordWorkerCheckpoint`, `closeWorkerState`, `widenClaimWriteSet`,
  `setClaimWorktreePath`, `appendWorkerSessionId`, `updateWorkerStateBaselineScore` require
  ClaimToken. `closeWorkerState` moves its knowledge enqueue into the worker descriptor's
  onComplete. Fix the raw-SQL artifact_dir leak (worker-cycle.ts:1711) by using the existing
  claim parameter.
- **scheduler/run-loop.ts** — loop body drops: worker spawn/reap machinery, in-memory pool Sets,
  kill timers, stdout parsing, argv building (all -> consumer.ts + executor.ts). Keeps: dispatch
  heartbeat, epoch maintenance/boundary orchestration (merged with epoch-run.ts core), wake
  handling, maintenance lanes. launchEpochCycle closure is dismantled into named functions.
- **workers/worker-cycle.ts** — restaged into: host-side prepare (worktree provision via
  extracted `core/job-queue/provisioning.ts` recipe, from ensureWorkerWorktree
  worker-cycle.ts:1480-1558) -> execute (agent attempts, validation; the only part a sandbox
  would run) -> host-side record (checkpoints/close via token). Child no longer claims and no
  longer drains the integration queue (worker-cycle.ts:2632-2641 -> integration consumer).
- **jobs/babysit.ts** — argv allowlists deleted; supervises run-loop only. The sync-runtime
  finally block (babysit.ts:472-530) moves out of the supervisor.
- **jobs/recover-claims.ts** — becomes the worker kind's reap hook (journal-first behavior
  preserved).
- **knowledge/background/index.ts** — phase 3: enqueue/claim/CAS/poller replaced by kernel +
  inline descriptor; processor logic, catch-up query, digest idempotency kept.
- **sync jobs + integration/worker-output-integration.ts** — phase 4: same treatment;
  integration singleton expressed as concurrencyLimit 1.
- **application/jobs/job-runner.ts** — worker subcommand becomes "execute TaskSpec from file/fd",
  not "claim and do everything".

## Deleted

- phases/running/epochs/epoch-run.ts (divergent twin; core merged into run-loop boundary path)
- babysit argv allowlists (GUARDIAN_ONLY_ARGS, SYSTEM_ARG_ALLOWLIST)
- bespoke queue code in knowledge/background/index.ts, sync jobs, worker-output-integration.ts
- run-state/target-pressure.ts duplicates (schedulableTargetCount dup, blockedAdmittedTargetCount
  dead constant + its 5 threaded fields)
- Dead tables from baseline: queue, leases, scheduler_epochs, scheduler_epoch_targets,
  file_locks, worker_reports, checkpoint_items_legacy_20260630T1917; duplicate GAME_EVENTS_DDL
  in storage/ddl.ts; fix the /tmp/purge-compat-apply.js error text in migrations/index.ts.
- Optional (phase 4, if cheap): drizzle mirror storage/schema.ts — rewrite its 2 call sites
  (cycle/store.ts:629,642) as raw SQL and drop the dependency.

## Explicitly untouched

harness-state/lease.ts, dispatch-guard.ts semantics (worker path now goes through it host-side),
admission selection math, board prioritization, PR/sync workflow logic, frontend, agent
catalog/prompts, packages/agent-kernel.
