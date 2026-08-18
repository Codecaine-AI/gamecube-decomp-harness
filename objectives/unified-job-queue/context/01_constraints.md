# Constraints

## Accepted design decisions (do not re-litigate)

1. **One `jobs` table, one kernel module, kind descriptors.** Not per-kind tables, not a class
   hierarchy. Per-kind differences are data on the descriptor (concurrency limit, ordering,
   environment recipe, handler), not code branches inside the kernel.
2. **Queue rows are dispatch truth only.** Evidence and heavy relational state stay in domain
   tables (`worker_state`, `worker_checkpoints`, `target_claims`, knowledge/sync tables), linked
   by id. `payload_json` stays small (ids + parameters, not artifacts).
3. **Two execution modes on the descriptor** (see 02_implementation_scope.md):
   `inline` (short in-process handler, ~60s lease, knowledge/sync/integration style) and
   `dispatched` (submit/poll/collect/cancel through the executor port, heartbeat-renewed lease,
   worker style). The kernel owns both lifecycles; handlers do not hand-roll lease logic.
4. **Chaining is explicit domain code** in per-kind complete handlers, in the same transaction
   (worker close -> enqueue knowledge job, as today at worker-state.ts:781). No DAG engine.
5. **Claim tokens replace raw leaseId strings for write-back.** `claim()` mints an unforgeable
   token object; all durable worker writes require it; the reaper invalidates it. The game-wide
   dispatch lease (harness-state/lease.ts) is checked host-side at claim time and never handed
   to workers again. Dispatch-lease internals are out of scope.
6. **File safety stays write-sets + claim ordering** (`active_source_claims ASC`). No per-file
   leases; the dead `file_locks`/`leases` tables are dropped, not revived.
7. **execution_class routes local vs sandbox.** Design the executor port so a Daytona adapter is
   a drop-in; do not implement it in this objective.

## Hard constraints

- **No backwards compatibility.** Delete bespoke queue modules outright; squash schema changes
  into the baseline (`storage/migrations/final-schema.ts`) per repo convention (single squashed
  baseline, schema-identity verification in migrations/index.ts). Update baseline.test.ts
  accordingly.
- **Live orchestrator DBs are product state.** Recreating or migrating existing state
  directories is an operator decision made at cutover — ask Ford before touching any live
  `orchestrator.sqlite`. Never land phase 2 while a run is active.
- **Do not modify:** harness-state/lease.ts internals, admission candidate selection math in
  run-state/epochs.ts, board prioritization, frontend, agent prompt builders, PR/sync workflow
  logic (beyond their queue plumbing in phase 4).
- **packages/agent-kernel is a symlinked peer repo** (agent-kernel-main worktree). Do not edit
  it from this repo; the harness breaks if the symlink points at the overhaul branch.
- **Tests are Bun tests** (`bun test`), colocated `*.test.ts`. New kernel code follows the
  existing pattern: pure decision functions + store-level tests against in-memory/temp SQLite,
  as in run-state/epochs.test.ts and knowledge/background/background.test.ts.
- **Keep determinism.** Scheduler decisions must stay reproducible from durable state
  (documented contract in 20-director-loop docs). Job claim ordering must be deterministic:
  `priority DESC, created_at ASC, job_id ASC`.
- **SQLite discipline:** all multi-write operations inside `immediateTransaction`
  (orchestrator-state/storage/transaction.ts), which participates in an open outer transaction;
  revision-CAS on every state transition; every transition appends a game_events row with
  trace_id/caused_by_event_id, following the background-knowledge pattern.

## Delegation constraints (build phases)

- Implementation work is delegated to Codex (`codex exec -m gpt-5.6-sol
  -c model_reasoning_effort="low" --enable fast_mode`, `xhigh` only for the run-loop/worker-cycle
  restage if a low attempt fails). Claude workers orchestrate; they do not edit files directly.
- Never run two codex agents in one worktree; background codex invocations need `</dev/null`
  and `-s workspace-write`.
