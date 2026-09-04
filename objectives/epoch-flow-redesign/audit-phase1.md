# Phase 1 Boundary Reconciliation Audit

This audit records the existing paths before Phase 1 implementation. The canonical flow and constraints in `context/00_problem.md`, `context/01_constraints.md`, and `context/02_implementation_scope.md` control the changes.

## Boundary Insertion Points

The scheduler launches an epoch boundary from `apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts` in `launchEpochCycle`. It captures `baseRevAtBoundaryStart`, calls `runEpochBoundary`, then compare-and-set advances `workerCtx.baseRev` only when the captured revision still matches. The boundary already cannot launch while worker-output integration or resolver work is active. Phase 1 must retain that fencing and change the CAS input from the epoch-finish commit to the final post-sync head when upstream drift changes the branch.

`runEpochBoundary` is implemented in `apps/server/src/core/cycle-runtime/phases/running/scheduler/epoch-boundary.ts`, not `epochs/cycle.ts`. Its reconciliation insertion point is immediately after `runEpochCycle` returns and assigns `boundaryResult`, before draft-PR publication, full knowledge maintenance, scheduler-epoch closure, and next-epoch admission.

`apps/server/src/core/cycle-runtime/phases/running/epochs/cycle.ts` owns `runEpochCycle`. It drains accepted integrations, commits the epoch snapshot, builds the report in the epoch worktree, copies report artifacts back to the cycle worktree, and records the epoch save point. The `addSavePoint` call near the end of `runEpochCycle` is the exact epoch-finish marker insertion point.

## Typed Save Points and Timeline

Save-point types and persistence live in `apps/server/src/core/cycle-runtime/phases/pr/state/save-points.ts`. `SavePointTrigger` currently includes `epoch`; the `save_points` table already stores unconstrained `trigger_kind TEXT NOT NULL` and a nullable label. No schema migration is needed to add `epoch_finish` and `pr_sync` trigger values.

`recordSavePointAnchor` in `apps/server/src/core/cycle/timeline.ts` records every save point as a `cycle_timeline_entries.entry_kind` of `save_point` and copies `trigger_kind` into the timeline payload. The marker contract should therefore use `save_points.trigger_kind`, while labels remain human-readable epoch or sync labels. The epoch save-point evidence emitted by `epochs/cycle.ts` must use the same `epoch_finish` value.

## Existing Draft PR Flag

`cycleDraftPrEnabled` defaults on in `run-loop.ts` and is disabled with `--no-cycle-draft-pr`. `scheduler/epoch-boundary.ts` currently calls `publishCycleDraftPr` after each successful epoch report. The publisher is in `epochs/cycle-draft-pr.ts`; it pushes a cycle branch, finds or creates a draft PR, and records a dashboard artifact. Phase 1 will not add or extend draft-PR behavior. Boundary sync must occur before the existing publisher so any later Phase 3 work sees the stable post-sync state.

## Upstream Intake Reuse

`fetchUpstreamAndFindMergedPrs` in `apps/server/src/core/cycle-runtime/phases/preparing/subphases/git-intake.ts` is the reusable fetch and merged-PR discovery entry point. It accepts an upstream anchor, fetches the configured remote, compares the anchor with the fetched base ref, parses merged PR numbers, and returns the before ref, after ref, merged PRs, and command steps. Operator sync calls it from `apps/server/src/core/cycle-runtime/phases/sync/runtime.ts`.

The operator sync's per-PR processor is private to `sync/runtime.ts` and its exported completion flow requires a persisted sync in the ingesting phase, ownership validation, and publication jobs. Phase 1 must not manufacture that state or call publication/confirmation gates. The boundary can reuse upstream discovery directly. Any merged-PR knowledge indexing reuse must be extracted as a standalone processor without invoking sync publication.

## Librarian Ledger Append

The ledger contract and writer are in `apps/server/src/core/knowledge/ledger.ts`. `defaultLedgerPath(gameId)` resolves to `games/<game>/knowledge/ledger/learnings.jsonl`, and `appendLearnings` validates defaults, deduplicates by stable ID, sorts, and rewrites the JSONL. The shared attempt-record helpers are in `apps/server/src/core/knowledge/jobs/attempt-record.ts`.

The boundary cannot run agents. It should construct deterministic `LearningRecord` values and call `appendLearnings` directly. Each displacement record must identify the target key, symbol and file, prior local match or improvement and score, upstream SHA, and verdict `overridden_by_upstream_requeued`. Dry-run planning must construct and print these records without calling the writer. Stable IDs based on target key and upstream SHA make retries idempotent.

## Target Requeue

Epoch admission and status transitions live in `apps/server/src/core/cycle-runtime/run-state/epochs.ts` and `worker-state.ts`. `requeueJob` in `apps/server/src/core/job-queue/kernel.ts` only resets a terminal job to queued. It does not update `epoch_targets`.

The established target reset sets `epoch_targets.status` to `admitted`, clears claimed and finished timestamps, and recomputes the owning epoch's `finished_count`. A boundary helper must perform that state reset transactionally, then call `requeueJob` only for a terminal worker job. Because reconciliation runs after claim drain, a claimed target is an invariant failure, not a conflict-resolution case.

## Epoch N+1 Board Source

After the boundary, `scheduler/epoch-boundary.ts` calls `ensureSchedulerEpochFromBoard`. `scheduler/tick.ts` loads the board and exact target keys from `globals.repoRoot`. The board loader reads `<repoRoot>/build/GALE01/report.json`, not the staged run's dashboard artifacts. `runEpochCycle` currently copies its fresh epoch report from the epoch worktree back to that cycle root.

Phase 1 must rebuild and publish the post-sync report at the same cycle-root path before next-epoch admission. Failure to publish that report must be loud because otherwise epoch N+1 would consume stale input.

## Implementation Guardrails

Boundary reconciliation runs under the run's existing dispatch lease and must not request another lease or enqueue operator sync. Upstream wins conflicts mechanically. Conflict resolution records the upstream-taken files and requeues their targets without resolver agents. Fetch, merge, build, report, or persistence failures raise the epoch boundary error path. Full knowledge rebuild and the `pr_sync` save point happen only when upstream drift changes the branch. The upstream anchor and cycle head advance only after the changed boundary completes successfully.
