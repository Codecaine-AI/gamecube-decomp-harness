---
covers: SQLite schema and state helper modules for runs, targets, leases, events, reports, checkpoints, and status
concepts: [state, sqlite, schema, leases, events, reports, checkpoints, run-status, status]
code-ref: decomp-orchestrator/packages/core/src/state
---

# State: Overview

State code owns SQLite connection setup, schema creation, and durable row
transitions for the orchestrator board. Command modules call these helpers
instead of manipulating SQL ad hoc.

## File Tree

```text
packages/core/src/state/
+-- db.ts
+-- epochs.ts
+-- events.ts
+-- index.ts
+-- leases.ts
+-- pi-sessions.ts
+-- queue-stats.ts
+-- reports.ts
+-- runs.ts
+-- schema.ts
+-- status.ts
+-- targets.ts
```

## Core Tables

| Table | Purpose |
| --- | --- |
| `runs` | Run checkpoint goal, baseline identity, desired worker count, status, and nullable project metadata for project-aware runs. |
| `targets` | Candidate targets loaded from board data. |
| `scheduler_epochs` | Active and historical deterministic scheduler epoch configuration, status, progress counters, fast-refresh count, and boundary routing summary. |
| `scheduler_epoch_targets` | Fixed epoch membership rows for admitted targets, including queued, leased, completed, and requeued state transitions. |
| `queue` | Priority queue rows for scheduler/worker coordination. |
| `leases` | Active and released worker ownership records. |
| `file_locks` | Transient path locks associated with active leases. |
| `events` | Durable wake events and event payloads. |
| `pi_sessions` | Worker and review/curation session metadata. |
| `director_cycles` | Legacy board-level decision records retained for old state readability. Current scheduling does not write this table. |
| `worker_reports` | Worker output, blocker, fact, and patch artifact references. |
| `attempts` | Attempt-level validation and score movement records. |
| `facts` | Reusable evidence accepted or tracked by the board. |
| `integrations` | Score-gate integration records. |
| `run_checkpoints` | End-of-run checkpoint records that separate PR candidates from carried-forward work. |
| `checkpoint_items` | Per-report checkpoint items with dispositions such as PR candidate, deferred patch, needs-fact, or stalled. |
| `campaigns` | One canonical campaign per state dir: the long-lived timeline, session branch, and base ref that runs and save points hang off. |
| `save_points` | Commit-anchored position records: commit/base SHAs, trigger kind, matched-code percent, report/board artifact paths, and dirty/committed flags. Rows with trigger kind `epoch` are written automatically by the epoch cycle and form the run's measured progress history. |

## Module Responsibilities

- `schema.ts` configures SQLite pragmas and creates tables.
- `runs.ts` and `targets.ts` create core board rows.
- `targets.ts` also owns deterministic queue refill from board candidates.
- `epochs.ts` owns scheduler epoch size parsing, fixed admission, existing
  queued-target adoption, ready-queue refill from admitted targets, priority
  refresh inside the active epoch, fast-refresh counters, and boundary close
  summaries.
- `leases.ts` leases queued targets, writes file locks, releases work, and
  handles recovery paths.
- `events.ts` creates, reads, and handles wake events.
- `pi-sessions.ts` records dry-run or live Pi invocation metadata.
- `queue-stats.ts` computes queued, schedulable, blocked, and unhandled-event
  counts shared by status, tick, and trigger logic.
- `reports.ts` records worker reports and related artifact paths.
- `status.ts` builds the operator-facing status summary.

## Key Rules

- State helpers preserve worker reports and artifacts even when leases are
  released or recovered.
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
- File-lock rows are transient active-lease guards.
- Refill prefers fresh candidates that are not already represented in the run
  and skips source paths with active locks.
- Scheduler epoch admission records a fixed target set before workers lease it.
  The ready queue can be smaller than the admitted set, and refills draw only
  from epoch membership until the boundary closes the epoch.
- `Full` epoch mode admits every currently schedulable candidate observed while
  the ranked-board scan expands to exhaustion. If no unmatched schedulable work
  remains, the scheduler closes the epoch as exhausted and backs off instead of
  spinning.
- Deterministic routing can add a fresh queued row for a previously attempted
  target when it is not already queued or leased. The epoch pipeline's
  regression repairs use the same `prioritizeQueuedTargets` path, which is how
  a regressed previously-completed function re-enters the queue despite
  refill's ever-seen dedupe.
- Schedulable queue depth is counted by distinct unlocked source path, not raw
  queued row count.
- Events are handled only after the follow-up state transition is persisted.
- SQLite is configured with WAL mode, foreign keys, and a busy timeout so CLI
  steps can safely coordinate through the same state directory.
- A checkpoint can be written after a run drains. Exact-match reports become
  PR candidates, while non-PR progress, fact requests, and stalls remain as
  carry-forward items for later sessions.
- Dashboard PR handoff state reads the latest checkpoint row plus the latest
  regression-check and split-plan summary artifacts so operators can see the
  handoff status without leaving the UI.

## Related

- [Durable state and events](../../10-system-design/30-state-and-events.md)
- [CLI overview](../cli/00-overview.md)
- [UI implementation](../ui/00-overview.md)
