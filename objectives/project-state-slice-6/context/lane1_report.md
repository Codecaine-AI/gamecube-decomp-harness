# Lane 1 report — migration 017 and durable background knowledge queue

## Changed files

- `apps/server/src/core/orchestrator-state/storage/migrations/017-background-knowledge-jobs.ts` — registers schema-only migration 017.
- `apps/server/src/core/orchestrator-state/storage/migrations/ddl.ts` — adds `BACKGROUND_KNOWLEDGE_JOBS_DDL` with status/execution constraints, revision and retry state, fenced lease fields, provenance/digest/error state, event causation, worker identity, and claim indexes.
- `apps/server/src/core/orchestrator-state/storage/migrations/index.ts` — appends migration 017.
- `apps/server/src/core/orchestrator-state/storage/migrations/migrations.test.ts` — validates fresh/upgrade/idempotent migration 017 behavior and constraints.
- `apps/server/src/core/knowledge/background/index.ts` — durable enqueue, catch-up, fenced claim/transition, shared processing seam, summary query, and always-on processor loop.
- `apps/server/src/core/knowledge/background/background.test.ts` — enqueue/catch-up, fencing/shared trigger, summary, failure, and retry coverage.
- `apps/server/src/core/knowledge/jobs/attempt-record.ts` — exposes attempt-record digest/provenance for programmatic queue processing; ledger record IDs preserve retry idempotency.
- `apps/server/src/core/session-runtime/run-state/worker-state.ts` — enqueues completed worker evidence inside the existing `closeWorkerState` transaction.
- `apps/server/src/core/session-runtime/run-state/worker-state-lease.test.ts` — proves re-close exactly-once behavior and rollback when enqueue fails.
- `apps/server/src/core/session-runtime/phases/running/scheduler/run-loop.ts` — constructs the background processor unconditionally, removes the opt-in worker-finish spawn path, and drains the processor before closing storage.
- `objectives/project-state-slice-6/context/lane1_report.md` — this handoff.

Migration 016 was not modified. No files under `packages/agent-kernel`, dashboard application/routes, frontend, or docs were modified by Lane 1.

## Exported seam signatures

From `apps/server/src/core/knowledge/background/index.ts`:

```ts
enqueueBackgroundKnowledgeForWorker(
  store: StateStore,
  workerStateId: string,
): BackgroundKnowledgeJob

catchUpBackgroundKnowledge(
  store: StateStore,
  projectId?: string,
): number

claimBackgroundKnowledge(
  store: StateStore,
  options?: { actor?: "operator" | "runner"; leaseMs?: number; at?: string },
): BackgroundKnowledgeJob | null

processBackgroundKnowledge(
  store: StateStore,
  processor: BackgroundKnowledgeProcessor,
  options?: { actor?: "operator" | "runner"; leaseMs?: number },
): Promise<ProcessBackgroundKnowledgeResult>

triggerBackgroundKnowledgeProcess(
  store: StateStore,
  processor: BackgroundKnowledgeProcessor,
): Promise<ProcessBackgroundKnowledgeResult>

queryBackgroundKnowledgeSummary(
  store: StateStore,
  projectId: string,
): BackgroundKnowledgeSummary

startBackgroundKnowledgeProcessor(
  store: StateStore,
  processor: BackgroundKnowledgeProcessor,
  options?: { intervalMs?: number },
): () => Promise<void>
```

`BackgroundKnowledgeSummary` returns `publishedRevision`, queued/processing/waiting/failed counts, `oldestPendingAt`, active lease id/expiry, next retry time/attempts, and five recent failure details.

The librarian integration seam is:

```ts
kgLibrarianCondense(
  globals: GlobalArgs,
  args: Map<string, string | true>,
): Promise<LibrarianCondensePublication>
```

## Validation

- `bun test ./apps/server/src/core/orchestrator-state/storage/migrations/migrations.test.ts`
  - PASS: 20 tests, 0 failures, 170 assertions.
- `bun test ./apps/server/src/core/knowledge/background/`
  - PASS: 3 tests, 0 failures, 13 assertions.
- `bun test ./apps/server/src/core/session-runtime/run-state/worker-state-lease.test.ts`
  - PASS: 2 tests, 0 failures, 13 assertions.
- `bunx tsc --noEmit`
  - FAIL outside Lane 1: TS6059 `rootDir` errors for the pre-existing external `../../Codecaine/Core/prompt-kit` source tree and its concurrent frontend import. No diagnostic named a Lane 1 changed file.
- `git diff --check` scoped to Lane 1 implementation paths
  - PASS: no whitespace errors.

The requested Bun paths without a leading `./` intermittently failed during parallel work with process-wide `EMFILE`/`ENFILE` or were interpreted as filters. The same focused files/directories passed when expressed as explicit `./apps/...` paths above.

## Deviations and blockers

- The common constraint required implementation edits through fresh `codex exec` processes. Both scoped launches failed before agent startup with `failed to initialize in-process app-server client: Operation not permitted`; approval policy was fixed to `never`, so elevation was unavailable. Fresh low-reasoning native harness sub-agents were used with the same non-overlapping ownership instead.
- Root TypeScript validation is blocked by unrelated external prompt-kit `rootDir` configuration/concurrent frontend state, as recorded above. Lane 1-focused tests pass and the root TypeScript output contains no Lane 1 file diagnostics.
- Migration 017 was not applied to any live database. Copy/live migration validation remains orchestrator-owned; live application still requires explicit user approval.
