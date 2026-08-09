---
covers: Drizzle-typed SQLite schema and state helper modules for sessions, runs, epoch targets, target claims, worker state, checkpoints, events, PR checkpoints, and status
concepts: [state, sqlite, drizzle, schema, epochs, target-claims, worker-state, checkpoints, run-status, project-session, status]
code-ref: decomp-orchestrator/apps/server/src/core/orchestrator-state, decomp-orchestrator/apps/server/src/core/session-runtime/run-state, decomp-orchestrator/apps/server/src/core/project-session
---

# State: Overview

The orchestrator app state lives in `<stateDir>/orchestrator.sqlite`. The
shared storage adapter in `core/orchestrator-state` opens that database,
configures SQLite, ensures the runtime DDL, and exposes a Drizzle ORM typed over
every orchestrator table. Domain slices keep ownership of behavior: project
session lifecycle state stays in `core/project-session`, run/epoch/worker state
stays in `core/session-runtime/run-state`, and PR save-point/checkpoint state
stays under the PR phase slice. The live worker runtime is session-rooted:
epochs admit fixed target batches, workers claim epoch targets, and the runner
maintains worker states and validation checkpoints.

## File Tree

```text
apps/server/src/core/orchestrator-state/
+-- index.ts
+-- storage/
    +-- ddl.ts       # SQLite pragmas, CREATE TABLE, ensureColumn compatibility path
    +-- schema.ts    # Drizzle sqliteTable definitions and inferred row/insert types
    +-- store.ts     # openState, StateStore, retry/transaction helpers, typed orm

apps/server/src/core/session-runtime/run-state/
+-- epochs.ts
+-- events.ts
+-- index.ts
+-- latest-run.ts
+-- pi-sessions.ts
+-- runs.ts
+-- status.ts
+-- target-pressure.ts
+-- targets.ts
+-- worker-state.ts

apps/server/src/core/project-session/
+-- store.ts
+-- state.ts
+-- types.ts

apps/server/src/core/session-runtime/phases/pr/state/
+-- save-points.ts

apps/server/src/infrastructure/persistence/sqlite/
+-- db.ts       # compatibility re-export
+-- schema.ts   # compatibility re-export
```

## Core Tables

| Table | Purpose |
| --- | --- |
| `runs` | Session-rooted run goal, baseline identity, desired worker count, status, and nullable project metadata. |
| `targets` | Board candidate snapshots retained for status and compatibility with run setup. |
| `epochs` | Active and historical deterministic epoch configuration, status, progress counters, fast-refresh count, and boundary routing summary. |
| `epoch_targets` | Fixed epoch membership rows for admitted targets, with lifecycle statuses `admitted`, `claimed`, and `finished`. |
| `target_claims` | Active and closed worker ownership records for epoch targets, including explicit write sets and worktree paths. |
| `worker_state` | One runner-owned execution summary per target claim: lifecycle status, worker sessions, artifacts, baseline/best scores, exact flag, and timeout/error summaries. |
| `worker_checkpoints` | One row per runner validation attempt, including failed validations, score movement, hard-gate status, selectable/selected flags, artifact paths, and failure reasons. |
| `epoch_verdicts` | Target-centric epoch gate outcomes linked to epoch targets after boundary validation. |
| `events` | Durable wake events and event payloads. |
| `pi_sessions` | Worker and review/curation session metadata. |
| `director_cycles` | Legacy board-level decision records retained for old state readability. Current scheduling does not write this table. |
| `facts` | Reusable evidence accepted or tracked by the board. |
| `integrations` | Score-gate integration records. |
| `run_checkpoints` | End-of-run checkpoint records that separate PR candidates from carried-forward work. |
| `checkpoint_items` | Per-worker-state checkpoint items with lifecycle status, PR-candidate disposition, patch path, summary path, and evidence payload. |
| `campaigns` | One canonical campaign per state dir: the long-lived timeline, session branch, and base ref that runs and save points hang off. |
| `save_points` | Commit-anchored position records: commit/base SHAs, trigger kind, matched-code percent, report/board artifact paths, and dirty/committed flags. Rows with trigger kind `epoch` are written automatically by the epoch cycle and form the run's measured progress history. |

## Module Responsibilities

- `core/orchestrator-state/storage/ddl.ts` configures SQLite pragmas and creates tables.
- `core/orchestrator-state/storage/schema.ts` declares the Drizzle table map and exported row/insert types for every orchestrator table.
- `core/orchestrator-state/storage/store.ts` opens state directories and provides shared transaction/retry helpers plus `StateStore.orm`.
- `infrastructure/persistence/sqlite/*` only re-export the new state storage module for compatibility with old imports.
- `project-session/store.ts` owns the Drizzle-backed `project_sessions` repository and phase lifecycle projection.
- `runs.ts` and `targets.ts` create core board rows.
- `targets.ts` owns helper paths that turn board candidates or regression
  repairs into admitted epoch targets and computes active write-set paths from
  open claims.
- `epochs.ts` owns scheduler epoch size parsing, fixed admission, priority
  refresh inside the active epoch, fast-refresh counters, progress summaries,
  and boundary close summaries.
- `worker-state.ts` claims admitted epoch targets, creates the paired
  `target_claims` and `worker_state` rows, records runner validation
  checkpoints, selects the best checkpoint, and closes claim/state lifecycle.
- `events.ts` creates, reads, and handles wake events.
- `pi-sessions.ts` records dry-run or live Pi invocation metadata.
- `target-pressure.ts` computes active-worker, admitted-target, schedulable-target,
  and unhandled-event counters shared by status, tick, and run-loop logic.
- `status.ts` builds the operator-facing status summary.
- `phases/pr/state/save-points.ts` owns the Drizzle-backed `campaigns` and `save_points` repositories.

## Key Rules

- Worker execution evidence is runner-owned. Worker notes can annotate a
  checkpoint, but lifecycle, validation truth, best-attempt selection, timeout,
  and error classification are recorded through `worker_state` and
  `worker_checkpoints`.
- A run goal is a checkpoint threshold for pausing and handoff. It is not the
  global project completion target.
- Project-aware runs record nullable project id, project kind, repo root, state
  directory, graph DB, descriptor path, and local override path. Legacy/raw path
  runs can leave those fields empty.
- Run status gates scheduling. `active` runs can start workers and scheduler
  ticks; `paused`, `complete`, and `failed` runs are rejected by scheduling
  commands until an operator intentionally resumes or starts a fresh run.
- `updateRunStatus` writes run status transitions and records a handled
  `run_status_changed` event. The event is an audit row, not scheduler work.
- Each `target_claim` has exactly one `worker_state`, and each active claim
  owns an explicit write set. Workers run in separate worktrees, so multiple
  targets from the same source path can be active concurrently.
- Scheduler epoch admission records a fixed target set before workers claim it.
  The active worker pool can be smaller than the admitted set, and worker slots
  draw from epoch membership until the boundary closes the epoch.
- `Full` epoch mode admits every currently schedulable candidate observed while
  the ranked-board scan expands to exhaustion. If no unmatched schedulable work
  remains, the scheduler closes the epoch as exhausted and backs off instead of
  spinning.
- Deterministic routing can admit a fresh epoch-target row for a target that
  appeared in an earlier epoch. The epoch pipeline's regression repairs use the
  same `admitPriorityTargets` path so a regressed function can re-enter a
  later epoch.
- A checkpoint is selectable only when runner hard gates pass and the target
  improves over the worker state's baseline. Best checkpoint selection is
  deterministic: exact match first, then highest score, then earliest
  validation tie.
- Timeout closes the worker state with the best prior selectable checkpoint, or
  baseline when none improved. Provider, infrastructure, or tool failures close
  the worker state as `error` while preserving any prior selectable checkpoint.
- Events are handled only after the follow-up state transition is persisted.
- SQLite is configured with WAL mode, foreign keys, and a busy timeout so server
  jobs and API handlers can safely coordinate through the same state directory.
- Drizzle typing is the schema contract for application state. Runtime DDL stays
  handwritten for now so existing state directories remain compatible while
  repositories migrate query-by-query.
- Complex scheduler and epoch/claim queries are still allowed to use raw SQL
  behind `StateStore` when that is the lowest-risk representation of the transition;
  new repositories should prefer `StateStore.orm` and the exported Drizzle row
  types.
- A checkpoint can be written after a run drains. Exact-match worker states
  become PR candidates, while non-PR worker states and failed or neutral
  checkpoints remain as carry-forward items for later sessions.
- Dashboard PR handoff state reads the latest checkpoint row plus the latest
  regression-check and split-plan summary artifacts so operators can see the
  handoff status without leaving the UI.

## Related

- [Durable state and events](../../10-system-design/30-state-and-events.md)
- [Server jobs overview](../20-server-jobs/00-overview.md)
- [UI implementation](../60-ui/00-overview.md)
