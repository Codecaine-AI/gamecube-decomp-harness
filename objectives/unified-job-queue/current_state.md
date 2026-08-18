<current_state>
<last_updated>2026-08-18</last_updated>

<status>
- OBJECTIVE COMPLETE. All five phases shipped.
- Phases 1-4 merged to main; latest merge `190f9bb4`.
- Phase 5 documentation edits are uncommitted in the main working tree awaiting Ford's review
  alongside his in-flight documentation reorganization edits. This is deliberate: the docs tree
  already contained uncommitted operator changes, so job-queue updates were applied on top for
  one combined review.
</status>

<final_architecture>
- One `jobs` table and `core/job-queue` kernel: enqueue, claim, claimByDedupeKey, heartbeat,
  complete, fail (terminal), cancel (force), requeue, reap, reprioritize, attachPayload, and
  verifyToken.
- Revision CAS; one `job.*` game event per status transition; deterministic claim order;
  runId-scoped claims.
- Four kinds:
  - `worker`: dispatched; slot job per epoch target; host-side atomic claim, provisioning, and
    `task_spec.json`; worker-task child; ClaimToken-fenced write-back with host-authority markers;
    consumer heartbeats; reap lane also sweeps expired `target_claims`.
  - `knowledge_absorption`: inline; deduped by `worker_state_id`; chained from close.
  - `sync_publication`: inline and pipeline-driven; domain `knowledge.job_*` events preserved.
  - `integration`: inline per-run singleton; domain outcomes in `integration_outcomes`;
    conflict -> resolver -> requeue.
- Deleted `epoch-run.ts`, babysit allowlists, argv worker path, three bespoke queue tables and
  modules, seven dead tables, and duplicate `GAME_EVENTS_DDL`.
- Executor port is ready for the Daytona sandbox adapter. `execution_class` routes execution;
  `task_spec.json` retains host-absolute paths by design until the adapter exists.
</final_architecture>

<completed>
- Phase 3 commit `ac9295d9`.
- Phase 4a commit `7598f65e`.
- Phase 4b commit `ee6cd7f2`.
- Phase 4c commit `7a82f23b`.
- Phase 5: 12 documentation bundles rewritten: director-loop; workers parent plus three children;
  process-guardians; state-composition parent plus three children; durable-records.
- All `doc.json` referential-integrity checks passed; stale-term greps clean.
- Full close-out suite from `apps/server`: 1055 pass / 0 fail via `bun test`.
</completed>

<in_progress>
- None. Objective complete; phase 5 awaits operator review and commit.
</in_progress>

<next_actions>
- Ford: review and commit phase 5 documentation with his documentation-reorganization edits.
- Ford: perform live-DB cutover between runs. Existing `orchestrator.sqlite` files predate the
  `jobs` table; recreate or migrate by operator decision.
- Ford: use the first production run for the deferred fuzzy/exact per-function regression check.
  Agents were unavailable in development because agent-kernel Postgres was down and the checkout
  was detached HEAD.
</next_actions>

<risks_or_open_questions>
- Daytona adapter remains future work; the executor port is designed, not implemented.
- PR work-item kinds remain deferred per the objective non-goals.
- Drizzle mirror `storage/schema.ts` remains because graph/cycle modules consume it; only dead
  entries were removed.
- One silent freeze occurred once during the soak and never reproduced under tracing.
- Operations scripts invoking `job-runner worker` or `epoch-run` no longer work.
</risks_or_open_questions>

<important_paths>
- `apps/server/src/core/job-queue/` — kernel.
- `apps/server/src/core/cycle-runtime/phases/running/workers/worker-job.ts` — worker kind.
- `apps/server/src/core/cycle-runtime/phases/running/scheduler/epoch-boundary.ts` — boundary.
- `apps/server/src/core/cycle-runtime/knowledge/background/index.ts` — absorption kind.
- `apps/server/src/core/cycle-runtime/phases/sync/knowledge.ts` — sync kind.
- `apps/server/src/core/cycle-runtime/integration/worker-output-queue.ts` and
  `integration_outcomes` — integration kind and outcomes.
- `/tmp/jq-int` — branch worktree; disposable.
- `/tmp/jq-soak-state` and `/tmp/jq-soak/` — soak evidence; disposable.
</important_paths>
</current_state>
