---
concepts: [write-safety, target-claims, write-sets, workspaces, validation, integration, tool-slots]
---

# Write Safety

Target-claim write sets, worker workspaces, integration validation, and shared artifact safety.

Write safety starts with explicit target-claim write sets and isolated worker
workspaces. The state substrate records who owns a target, what paths that
worker may touch, and which validation checkpoints are safe to integrate.

## Claim Rule

Before editing, a worker receives a target claim with an explicit write set.
The worker must not edit outside that write set. If the work discovers that
another file is genuinely required, that expansion becomes explicit evidence
for the runner and integration path rather than an implicit side effect.

```text
admit epoch target
claim target for one worker
create worker state with explicit write set

worker edits only claimed paths in its own workspace
runner validates current workspace and records a checkpoint
integration applies the selected checkpoint after validation
```

## Workspace Rule

The main checkout remains the canonical integration surface. Worker workspaces
are the normal execution surface. They isolate simultaneous attempts, allow
same-file targets to run concurrently, and keep unfinished source changes out
of the baseline until the runner selects a checkpoint.

## Worker Output Integration

Worker outputs move through an integration queue before they affect the current
epoch/session root. The normal path is deterministic: apply the selected
checkpoint patch, record the disposition, and leave the integration resolver
out of the loop. The resolver is only for failed applies, same-file conflicts,
or conflict groups that need source-level reconciliation.

```text
active epoch target
  -> target claim
       -> worker_state
            -> isolated worker worktree
                 -> runner validation
                      -> worker_checkpoints
                           -> selected checkpoint
                                -> worker-output integration queue
                                     |
                                     +-- clean apply ------------------+
                                     |                                 |
                                     v                                 v
                              integration record              current epoch/session root
                                                                      |
                                                                      v
                                                            epoch rebuild + report
```

Same-file concurrency is expected to be rare but allowed. It is handled at
integration time, not by preventing workers from starting.

```text
worker A worktree                worker B worktree
  target: file.c::fn_a             target: file.c::fn_b
  patch: file.c hunk A             patch: file.c hunk B
        |                                |
        v                                v
  selected checkpoint              selected checkpoint
        |                                |
        +-----------> integration queue <+
                         |
                         v
                apply against current root
                         |
             +-----------+-----------+
             |                       |
             v                       v
        applies cleanly        apply conflict / merge conflict
             |                       |
             v                       v
   record applied output       conflict queue item
             |                       |
             |                       v
             |              integration-resolver agent
             |                       |
             |                       v
             +-------------> resolved source in root
                                     |
                                     v
                         focused validation + epoch gate
```

The integration queue item carries the selected checkpoint metadata, patch
paths, explicit write sets, failed apply evidence, conflict paths, and target
identity. The runner owns queue mutation, final acceptance, and epoch truth; the
integration resolver only edits inside the supplied conflict group and returns
worker-output dispositions.

## Build And Tool Slot Rule

Worker worktrees isolate source and build outputs, but the host still has a
finite amount of CPU, disk, and MWCC runner capacity. The runner therefore uses
slot pools for expensive local operations instead of letting every active
worker invoke them at once.

Runner-owned Ninja validation acquires an epoch-scoped worker Ninja slot before
running `ninja` in a worker worktree. Toolpack API calls such as `checkdiff`,
direct compile, source permutation, `m2c_decomp`, and `mwcc_debug` acquire a
tool-specific slot before launching their helper command. Slot directories live
beside the epoch worker worktrees, include an `owner.json` with the owning PID,
and are pruned when stale.

These pools do not weaken write isolation: each command still runs against the
claim's own worktree and write set. They only cap concurrent compiler/tool
pressure so a large worker pool keeps making progress without turning every
validation boundary into a machine-wide stampede.

## Risk Rules

| Risk | Rule |
| --- | --- |
| Two workers edit the same file | Allow concurrent isolated workspaces; integrate only selected checkpoints through explicit write sets. |
| Header/data owner edits | Start with explicit write sets and widen to dependent files or target groups when evidence shows invalidation risk. |
| Stale patch base | Score integration checks `base_rev`; stale patches are rebased, revalidated, or rejected. |
| Shared build/tool pressure | Use worker-local worktrees plus epoch-scoped Ninja and tool slot pools; tune pool sizes before raising the worker count. |
| Shared CSV/artifact races | Workers write shards; reducers own shared summaries, charts, and merged artifacts. |
| Bad integration | Run patch apply checks, narrow objdiff, neighbor/unit checks when needed, then update the baseline only after validation. |

## Related

- [Durable state and events](30-state-and-events.md)
- [Score integration and PR handoff](60-score-and-pr-handoff.md)
