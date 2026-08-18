# Working Plan — phase-gated

Phases are sequential gates; work inside a phase parallelizes across Codex workers where files
are disjoint. Update `current_state.md` at every gate.

---

## Phase 0 — Design lock (mostly done in the 2026-08-17 session)

- **Objective:** freeze the decisions in 01_constraints.md and the interfaces in
  02_implementation_scope.md.
- **Inputs:** audit findings (00_problem.md), existing queue implementations.
- **Process:** review `jobs` DDL + descriptor + executor port against the three existing queues;
  confirm each queue's semantics are expressible (dedupe keys, integration singleton, knowledge
  digest idempotency, worker recycle branch). Resolve any mismatch by amending
  02_implementation_scope.md, not by special-casing the kernel later.
- **Outputs:** finalized 02_implementation_scope.md.
- **Gate:** Ford signs off on the descriptor interface and the no-compat cutover.
- **Failure handling:** mismatches that force per-kind branches inside kernel.ts mean the
  descriptor is wrong — redesign the descriptor, do not ship the branch.

## Phase 1 — Queue kernel (no consumers, zero behavior change)

- **Objective:** `core/job-queue/` kernel + `jobs` table, fully tested, nothing wired in.
- **Inputs:** 02 scope; knowledge/background/index.ts as the pattern donor; baseline
  final-schema.ts + migrations/index.ts + baseline.test.ts.
- **Process:** add table to baseline; implement kernel.ts, descriptor.ts, types.ts, consumer.ts,
  executor.ts (port + LocalProcessExecutor skeleton); table-driven Bun tests against temp SQLite.
  Required test families: claim ordering determinism; lease expiry self-reap; UNIQUE(kind,
  dedupe_key) idempotent enqueue; backoff persistence; concurrency limits (kind-level and
  concurrency_key singleton); two concurrent consumers never double-claim (BEGIN IMMEDIATE);
  ClaimToken rejected after reap; game_events appended per transition with correct
  trace lineage; onComplete chaining enqueues in the same transaction and rolls back together.
- **Outputs:** green `bun test apps/server/src/core/job-queue`; baseline.test.ts updated.
- **Gate:** kernel suite green; full `bun test apps/server` green; no production caller yet.
- **Failure handling:** SQLite contention flakes -> fix with transaction scope, not retries in
  tests.

## Phase 2 — Worker tasks on the kernel (the big restage) + claim-token fence

- **Objective:** worker dispatch runs entirely through the kernel; write-back fenced.
- **Inputs:** phase 1 kernel; run-loop.ts, worker-cycle.ts, worker-state.ts, epochs.ts,
  babysit.ts, recover-claims.ts, job-runner.ts per 02 scope.
- **Process (ordered):**
  1. Extract LocalProcessExecutor from run-loop.ts:721-821; extract worktree provisioning from
     worker-cycle.ts:1480-1558 into provisioning.ts. (parallelizable, mechanical)
  2. Admission enqueues worker jobs (epochs.ts); priority refresh updates queued jobs.
  3. Worker descriptor: dispatched mode; host-side claim wraps claimNextEpochTarget; buildTask
     produces TaskSpec (target packet, worktree path, env, model config — everything argv
     carries today); onComplete = closeWorkerState + knowledge enqueue; reap hook =
     recover-claims journal-first recovery.
  4. Restage worker-cycle.ts: child receives TaskSpec, executes attempts/validation only;
     checkpoint/close writes go through token-taking worker-state functions (child keeps its
     SQLite handle for now — transport abstraction is the sandbox adapter's problem later, the
     token fence is what must land here).
  5. Run-loop consumes: replace spawn/pool/kill/stdout machinery with consumer pool; merge
     epoch-run.ts core into the boundary path; delete babysit allowlists; dismantle
     launchEpochCycle into named, testable functions.
  6. Sweep the ~19 raw-leaseId write-back sites onto ClaimToken; delete the conditional fences
     (worker-state.ts:300 `if (params.leaseId)`, run-control.ts:570).
- **Outputs:** deleted epoch-run.ts + allowlists; run-loop body reduced; new tests for boundary
  path, consumer integration (stub executor), token sweep.
- **Gate (two-stage):**
  (a) full `bun test apps/server` green, plus new run-loop/consumer tests;
  (b) soak: one full live run (small epoch config) completes on queue dispatch — epoch
  boundaries, a forced worker kill mid-claim (reap re-queues, no orphan claim), knowledge
  absorption fires from onComplete, no stale-token write accepted. Coordinate the run with Ford;
  never cut over mid-run.
- **Failure handling:** if a Codex low-effort attempt mangles the restage, retry that slice at
  xhigh with a tighter spec; if the soak reveals ordering/liveness bugs, fix forward behind the
  kernel test suite — do not reintroduce the in-memory pool Sets as a workaround.

## Phase 3 — Knowledge absorption on the kernel

- **Objective:** background_knowledge_jobs mechanism replaced by an inline-mode kind.
- **Process:** descriptor {kind: knowledge_absorption, limit 2, inline handler = existing
  processor}; port catch-up backfill and digest short-circuit; migrate enqueue call (now in
  worker onComplete); delete bespoke claim/CAS/poller from knowledge/background/index.ts; drop
  the background_knowledge_jobs table from baseline; rewrite background.test.ts against the
  kernel.
- **Gate:** knowledge tests green; a live-run smoke shows absorption completing with the same
  published digests.
- **Failure handling:** if digest idempotency can't be expressed via result_ref + dedupe_key,
  amend the kernel's complete() contract once, for all kinds.

## Phase 4 — Sync publication + integration on the kernel; schema cleanup

- **Objective:** last two queues migrated; ghost schema gone.
- **Process:** sync_publication kind (inline, dedupe = sync_id+source); integration kind
  (inline, concurrencyLimit 1, staleness via lease not APPLYING_STALE_MS); delete
  sync_knowledge_jobs + worker_output_integrations tables and bespoke modules; drop the six dead
  tables + legacy checkpoint table; fix migrations/index.ts error text; optional drizzle-mirror
  removal (schema.ts) if the 2-call-site rewrite stays under a day.
- **Gate:** full `bun test apps/server` green; grep proves no references to deleted
  tables/modules; one live run exercising sync + integration paths.
- **Failure handling:** integration races (N workers previously raced to drain) must be covered
  by a dedicated singleton test before the bespoke module is deleted.

## Phase 5 — Docs to the new scope

- **Objective:** docs bundles describe the shipped system (per Ford: docs follow the build).
- **Process:** rewrite doc.json bundles: 50-workflows/20-run/20-director-loop (scheduler
  consumes queue; epoch ready queue is now literal), 20-run/40-workers (TaskSpec contract, claim
  token, executor port, execution_class), 40-harness-state/10-state-composition (jobs table as a
  durable record; retire descriptions of stdout transport/argv marshalling), 60-knowledge queue
  references. Design-narrative prose style per writingstyle.md — what/where/why, not atomized
  bullets. Add "job", "kind", "claim token", "executor" to the domain vocabulary where the docs
  define terms.
- **Gate:** Ford reviews rendered docs; no doc contradicts the implementation; current_state.md
  closed out with final architecture summary.
- **Failure handling:** doc/implementation mismatches found during writing get fixed in code
  only if trivial; otherwise recorded in current_state.md as follow-ups.

---

## Sequencing notes

- Phases 1 and the extractions in 2.1 can start together (disjoint files).
- Phase 3 must follow 2 (worker onComplete owns the enqueue). Phase 4 is independent of 3 and
  can interleave. Phase 5 is last.
- The Daytona sandbox adapter is explicitly after this objective; the phase-2 TaskSpec review
  should sanity-check it contains no host-absolute paths that a sandbox couldn't receive
  (worktree provisioning stays host-side; artifact paths ride result rows, not stdout).
