---
covers: SQLite schema and state helper modules for runs, targets, leases, events, reports, and status
concepts: [state, sqlite, schema, leases, events, reports, status]
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
+-- reports.ts
+-- runs.ts
+-- schema.ts
+-- status.ts
+-- targets.ts
```

## Core Tables

| Table | Purpose |
| --- | --- |
| `runs` | Run goal, baseline identity, desired worker count, and status. |
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

## Module Responsibilities

- `schema.ts` configures SQLite pragmas and creates tables.
- `runs.ts`, `targets.ts`, and `director-cycles.ts` create core board rows.
- `leases.ts` leases queued targets, writes file locks, releases work, and
  handles recovery paths.
- `events.ts` creates, reads, and handles wake events.
- `pi-sessions.ts` records dry-run or live Pi invocation metadata.
- `reports.ts` records worker reports and related artifact paths.
- `status.ts` builds the operator-facing status summary.

## Key Rules

- State helpers preserve worker reports and artifacts even when leases are
  released or recovered.
- File-lock rows are transient active-lease guards.
- Events are handled only after the follow-up state transition is persisted.
- SQLite is configured with WAL mode, foreign keys, and a busy timeout so CLI
  steps can safely coordinate through the same state directory.

## Related

- [Durable state and events](../../10-system-design/30-state-and-events.md)
- [CLI overview](../cli/00-overview.md)
