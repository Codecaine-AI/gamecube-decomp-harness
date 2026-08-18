<goal>
- Replace the harness's four hand-rolled work-dispatch mechanisms (implicit worker ready-queue, background_knowledge_jobs, sync_knowledge_jobs, worker_output_integrations) with one durable job queue: a single `jobs` table plus one deep queue kernel module, consumed through per-kind descriptors and per-kind consumer pools.
- Workers become jobs: epoch admission enqueues worker tasks; a host-side claim mints an unforgeable claim token; execution runs behind an executor port (local process adapter now, Daytona sandbox adapter later, routed by execution_class).
- Fence all worker write-back: recordWorkerCheckpoint, closeWorkerState, widenClaimWriteSet and siblings require the claim token; the reaper invalidates tokens so stale workers are rejected.
- No backwards compatibility: bespoke queue modules are deleted, dead tables dropped, schema squashed into the baseline per repo convention.
- Finish by rewriting the affected docs bundles (director loop, workers, harness-state composition) to describe the new system.
</goal>

<context_refresh>
- Reread objectives/unified-job-queue/goal.md.
- Reread objectives/unified-job-queue/current_state.md.
- Reread objectives/unified-job-queue/context/00_problem.md through 04_validation_and_handoff.md.
</context_refresh>

<working_strategy>
- Phase-gated, per context/03_working_plan.md: (1) kernel + jobs table with zero consumers, fully unit-tested; (2) worker tasks on the kernel — the big restage of run-loop.ts and worker-cycle.ts, including the claim token fence; (3) migrate knowledge absorption; (4) migrate sync publication + integration and delete dead schema; (5) docs rewrite.
- Queue rows are dispatch truth only; evidence stays in domain tables (worker_state, worker_checkpoints, target_claims) linked by id.
- Job chaining stays explicit in per-kind complete handlers (worker close enqueues knowledge job, as today at worker-state.ts:781). No DAG engine.
- Never land phase 2 mid-live-run; cut over between runs. Live orchestrator DBs are product state — recreating or migrating them is an operator decision at cutover.
</working_strategy>

<success_metrics>
- Phase 1: kernel test suite covers claim ordering, lease expiry/reap, dedupe, backoff, concurrency limits, two-consumer safety — all table-driven, no subprocesses.
- Phase 2: a full run completes on queue dispatch; run-loop.ts loop body shrinks by >500 lines; babysit argv allowlists and epochs/epoch-run.ts deleted; admission race no longer surfaces as worker error.
- Phases 3–4: background/index.ts bespoke claim/CAS code deleted; queue kinds share one kernel; `bun test apps/server` green.
- Phase 5: docs bundles describe jobs/kinds/executor seam; no doc still describes stdout-JSON worker transport or argv marshalling.
</success_metrics>

<non_goals>
- No Daytona sandbox adapter implementation (design the port so it slots in; do not build it).
- No PR work-item job kinds yet (campaign state machine stays as is).
- No changes to dispatch-lease internals (harness-state/lease.ts), admission policy math (run-state/epochs.ts selection), board ranking, frontend, or agent prompts.
- No generic workflow/DAG engine.
</non_goals>

<completion_criteria>
- All four dispatch mechanisms run through the kernel; bespoke queue implementations and dead tables (queue, leases, scheduler_epochs, scheduler_epoch_targets, file_locks, worker_reports) are gone.
- Every durable worker write requires a claim token; no production call site threads a raw leaseId string for write-back.
- One soaked live run completed end-to-end on the new dispatch path with epoch boundaries, claim recovery, and knowledge absorption verified.
- Docs bundles updated; current_state.md closed out.
</completion_criteria>
