---
covers: SQLite schema and state helper modules for runs, targets, leases, events, reports, checkpoints, and status
concepts: [state, sqlite, schema, leases, events, reports, checkpoints, run-status, status]
code-ref: decomp-orchestrator/src/state
---

# State: Overview

State code owns SQLite connection setup, schema creation, and durable row
transitions for the orchestrator board. Command modules call these helpers
instead of manipulating SQL ad hoc.

## File Tree

```text
src/state/
+-- db.ts
+-- director-cycles.ts
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
| `runs` | Run checkpoint goal, baseline identity, desired worker count, and status. |
| `targets` | Candidate targets loaded from board data. |
| `queue` | Priority queue rows for director/worker scheduling. |
| `leases` | Active and released worker ownership records. |
| `file_locks` | Transient path locks associated with active leases. |
| `events` | Durable wake events and event payloads. |
| `pi_sessions` | Director and worker session metadata. |
| `director_cycles` | Board-level director decision records. |
| `worker_reports` | Worker output, blocker, fact, and patch artifact references. |
| `attempts` | Attempt-level validation and score movement records. |
| `facts` | Reusable evidence accepted or tracked by the board. |
| `integrations` | Score-gate integration records. |
| `run_checkpoints` | End-of-run checkpoint records that separate PR candidates from carried-forward work. |
| `checkpoint_items` | Per-report checkpoint items with dispositions such as PR candidate, deferred patch, needs-fact, or stalled. |

## Module Responsibilities

- `schema.ts` configures SQLite pragmas and creates tables.
- `runs.ts`, `targets.ts`, and `director-cycles.ts` create core board rows.
- `targets.ts` also owns deterministic queue refill from board candidates.
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
- Run status gates scheduling. `active` runs can start workers and director
  ticks; `paused`, `complete`, and `failed` runs are rejected by scheduling
  commands until an operator intentionally resumes or starts a fresh run.
- `updateRunStatus` writes run status transitions and records a handled
  `run_status_changed` event. The event is an audit row, not a director wake.
- File-lock rows are transient active-lease guards.
- Refill prefers fresh candidates that are not already represented in the run
  and skips source paths with active locks.
- Director-selected target packets can add a fresh queued row for a previously
  attempted target when it is not already queued or leased.
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
