# Problem

Findings from the 2026-08-17 architecture audit (three read-only scans: worker/run-loop, state
layer, operator surface). Full HTML report was ephemeral; the load-bearing evidence is recorded
here. All paths relative to `apps/server/src/`.

## The queue nobody named

The design docs (docs/10-system-design/50-workflows/20-run) already describe workers as "queue
workers that execute target claims" and name an "epoch ready queue". The implementation has the
queue only implicitly:

- `epoch_targets WHERE status='admitted'` is the ready queue; `claimNextEpochTarget`
  (core/cycle-runtime/run-state/worker-state.ts:287-488) is an atomic, lease-fenced dequeue.
- The run loop decides only a **count** of workers (scheduler/run-loop.ts:1607-1617), then spawns
  processes with no target attached; the child self-claims after spawn
  (workers/worker-cycle.ts:1698-1706). A spawned worker finding no target throws — an admission
  race reported as an execution failure (run-loop.ts:1689).
- Pool sizing reads in-process Sets (`runningWorkers`, `runningWorkerIds`;
  run-loop.ts:236-260). Two schedulers, or one scheduler plus a remote executor, would
  over-admit. This is the hard blocker for sandboxed workers.
- Inter-process task "interface" is argv: hand-built flag array (run-loop.ts:721-773) filtered
  through two hand-maintained allowlists in babysit (jobs/babysit.ts:69-136, 58 entries).
  Results ride stdout JSON (run-loop.ts:816); timeout is a host setTimeout + SIGKILL
  (run-loop.ts:801-811); cancellation is proc.kill(9).
- `target_claims.heartbeat_at` exists but is written once at claim and never renewed.
- `epochs/epoch-run.ts` and the 244-line `launchEpochCycle` closure (run-loop.ts:1102-1345) are
  two divergent implementations of "close an epoch" with different configure defaults and
  completion paths.

## Three sibling queues, three implementations of the same shape

| Queue | One job = | Location |
|---|---|---|
| background_knowledge_jobs | absorb one closed worker's evidence into knowledge | core/knowledge/background/index.ts (239 lines) |
| sync_knowledge_jobs | publish one knowledge item during sync reconciliation | sync phase |
| worker_output_integrations | apply one banked checkpoint to the shared checkout | integration/worker-output-integration.ts |

background_knowledge_jobs is the most complete: revision CAS, lease_id/lease_expires_at
visibility timeout, attempts/next_attempt_at backoff, execution_class routing column,
published_digest idempotency, event-per-transition, catch-up backfill, single-flight poller.
The other two are partial re-implementations. Worker dispatch is a fourth re-implementation
that never got a table.

## Unfenced write-back

- The dispatch lease itself (core/harness-state/lease.ts) is sound: single writer, revision CAS,
  18-test rollback suite. Do not touch it.
- But holding it is caller discipline: `withDispatchLease` (cycle-runtime/dispatch-guard.ts) is
  used at 4 sites while 19 sites thread a raw `leaseId: string`; two make the fence conditional
  (`if (params.leaseId)` at worker-state.ts:300, run-control.ts:570).
- Post-claim worker writes are entirely unfenced: `recordWorkerCheckpoint`, `closeWorkerState`,
  `widenClaimWriteSet`, `setClaimWorktreePath`, `appendWorkerSessionId`,
  `updateWorkerStateBaselineScore` take no lease. A worker whose claim was recovered and
  reassigned can keep writing checkpoints indefinitely. First thing that breaks with remote
  workers (partition -> lease recovered -> partitioned worker reconnects and writes).

## Untested exactly where the change lands

`runRunLoop` (1,033 lines) and `runWorkerCycle` (1,013 lines) have zero injectable dependencies
(openState inside, Bun.spawn, dynamic import of the Pi runner, signal handlers) and zero tests.
The extracted pure decision functions are well tested; the mechanism is not. The queue kernel
interface becomes the missing test surface.

## Dead/ghost schema

`final-schema.ts` creates 49 tables; the drizzle mirror `storage/schema.ts` (935 lines) covers
36, serving 2 production call sites. Six tables are dead: `queue`, `leases`, `scheduler_epochs`,
`scheduler_epoch_targets`, `file_locks`, `worker_reports` (grep: only the schema file references
them). The ghost `queue`/`leases` tables actively mislead new queue design. The migration error
message references `/tmp/purge-compat-apply.js`, which does not exist.
