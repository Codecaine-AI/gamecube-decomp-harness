---
covers: Write-set leases, file locks, integration locks, optional workspaces, and shared artifact safety
concepts: [write-safety, leases, file-locks, workspaces, validation-locks, integration]
---

# Write Safety

Write safety starts with central leases and file locks. Optional worktrees or
isolated workspaces can help, but they are not the mandatory primitive. The
state substrate is the mandatory primitive.

## Lease Rule

Before editing, a worker receives a lease with an explicit write set. The state
substrate records file-level locks for every path the worker may touch. A worker
must not edit outside its active lease.

```text
BEGIN IMMEDIATE
  lease target
  insert file_locks for every write-set path
  mark queue row leased
COMMIT

worker edits only leased paths
worker writes result artifacts under its lease
score integration applies accepted patches after validation
```

## Workspace Rule

The main checkout remains the canonical integration surface. Isolated
workspaces are implementation tools for cases where shared build output,
generated files, risky headers, or long-running validation would make one
checkout too fragile.

A simpler v1 can still be correct if the database owns edit locks and shared
validation is serialized.

## Risk Rules

| Risk | Rule |
| --- | --- |
| Two workers edit the same file | Reject overlapping active locks on the same source path. |
| Header/data owner edits | Start with explicit write-set locks and widen to dependent files or target groups when evidence shows invalidation risk. |
| Stale patch base | Score integration checks `base_rev`; stale patches are rebased, revalidated, or rejected. |
| Shared build output contention | Serialize build/report generation in v1 with one global validation path. |
| Shared CSV/artifact races | Workers write shards; reducers own shared summaries, charts, and merged artifacts. |
| Bad integration | Run patch apply checks, narrow objdiff, neighbor/unit checks when needed, then update the baseline only after validation. |

## Related

- [Durable state and events](30-state-and-events.md)
- [Score integration and PR handoff](60-score-and-pr-handoff.md)
