# Lane 1 — durable background knowledge processing (server core)

First read: context/lane_common_rules.md, context/01_constraints.md.
Contracts to render (docs CLI): docs/40-new-features/20-project-state-and-events/60-knowledge
and 10-authority-and-actions (the knowledge.process row and background_knowledge shape).

## Exclusive ownership (edit nothing else)
- NEW `apps/server/src/core/orchestrator-state/storage/migrations/017-*.ts`
- `apps/server/src/core/orchestrator-state/storage/migrations/index.ts` (register 017)
- `apps/server/src/core/orchestrator-state/storage/migrations/ddl.ts` (new DDL constants)
- `apps/server/src/core/orchestrator-state/storage/migrations/migrations.test.ts` (add 017 tests)
- NEW `apps/server/src/core/knowledge/background/**` (service, processor, catch-up, tests)
- The `closeWorkerState` code path in session-runtime run-state (enqueue integration) and
  its nearby tests.
- Librarian/job-runner integration points in `apps/server/src/core/knowledge/jobs/` and the
  runtime wiring needed to make the queue service always available and to run catch-up.
DO NOT touch: migration 016, `apps/server/src/application/dashboard/**`,
`apps/server/src/api/routes/**`, `apps/frontend/**`, `docs/**`.

## Requirements
1. Migration 017 — schema/indexes ONLY (no data backfill; runtime owns catch-up). Do not
   modify migration 016. Follow the conventions of 014/015/016 (StorageMigration type,
   DDL in ddl.ts, registration in index.ts). Create a durable background knowledge-job
   table with:
   - six job statuses: queued | processing | waiting | succeeded | failed | cancelled;
   - monotonic revision (increments per accepted transition);
   - attempts counter and retry/backoff timing (e.g. next_attempt_at);
   - fenced lease: lease_id + lease expiry for the processing owner;
   - execution class and source classification (per the 60-knowledge contract:
     background_safe vs sync_stage, source kind);
   - provenance (what evidence produced the job / what it published);
   - digest and error fields;
   - causation (caused_by_event_id linkage into the event fabric);
   - unique worker-state identity (UNIQUE index guaranteeing one job per worker state);
   - the indexes the claim path needs (status + next_attempt_at, project scoping).
2. `closeWorkerState` enqueues exactly once INSIDE its existing transaction. Idempotent
   (unique identity + insert-or-ignore); a re-close or replay must not create a second job.
3. Runtime catch-up: on startup/first use, idempotently enqueue jobs for older completed
   worker states that predate the queue. Never in the migration.
4. One claim/process seam: a single claim function (fenced lease, backoff-aware,
   revision-checked) used by BOTH automatic background processing and the operator
   `knowledge.process` trigger. No second code path.
5. Remove opt-in-only librarian behavior: the queue service is always available/constructed;
   automatic processing runs without a feature flag. Keep it a no-op when the queue is empty.
6. Crash-after-ledger-publication is retry-safe: publication/materialization is idempotent
   (digest/provenance check) so a job retried after a crash between ledger publication and
   job completion does not duplicate published knowledge.
7. Export a stable seam from `apps/server/src/core/knowledge/background/index.ts` for the
   Lane 2 read model and command route (document exact signatures in your report):
   - a summary query returning: published revision, queued/processing/waiting/failed
     counts, oldest_pending_at, active lease info (id/expiry), retry/backoff state, and
     recent failure details — enough to fill the DTO `knowledge` field described in
     context/dto_contract.md;
   - a process trigger (used by knowledge.process) that drives the shared claim/process
     seam and reports what it did;
   - the enqueue + catch-up entry points.
8. Events/tracing: emit the accepted-fact events for job lifecycle transitions consistent
   with Slice 5 event conventions (grep existing event emission for patterns); never treat
   events as state.

## Validation (focused only)
- `bun test apps/server/src/core/orchestrator-state/storage/migrations/migrations.test.ts`
- `bun test apps/server/src/core/knowledge/background/`
- The specific worker-state test files you touched.
- `tsc --noEmit` from repo root.

## Report
Write `objectives/project-state-slice-6/context/lane1_report.md` (changed files, exported
seam signatures, test commands + results, deviations).
