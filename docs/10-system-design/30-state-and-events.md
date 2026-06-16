---
covers: Durable state substrate, events, leases, reports, facts, and artifacts
concepts: [durable-state, sqlite, leases, events, facts, artifacts]
---

# Durable State And Events

Durable state is the orchestrator's memory. It records the board, active work,
agent sessions, scheduler epochs, reports, facts, and wake events. The state
substrate allows workers and deterministic scheduling to operate at different
times without losing context.

## State Model

The board carries:

- Runs: the goal, desired worker count, baseline report identity, and status.
- Targets and queue rows: candidate functions or units with priority and
  rationale.
- Leases and file locks: active ownership of bounded write sets.
- Pi sessions: worker, review, curation, reconcile, and QA repair invocation
  metadata.
- Scheduler epochs: active epoch configuration, fixed target membership,
  ready-queue state, completion counts, refresh counters, and boundary routing
  summaries.
- Legacy director cycles: old board-level decision rows retained only so old
  state files remain readable.
- Worker reports: progress, blockers, facts, patches, and status.
- Attempts and integrations: validation results and score-gate records.
- Events: durable wake requests.

## Event Handshake

Events are the handshake between workers, the runner, and the sleeping
scheduler loop.
A producer writes an event with payload and provenance. The runner handles the
oldest relevant unhandled event by invoking the correct next step. The event is
marked handled only after the resulting decision or state transition is stored.

Wake events include:

- `run_started`
- `worker_finished`
- `worker_stalled`
- `needs_fact`
- `score_candidate`
- `pool_below_target`
- `epoch_admitted`
- `epoch_exhausted`
- `epoch_fast_refresh_started`
- `epoch_fast_refresh_finished`
- `epoch_fast_refresh_deferred`
- `epoch_fast_refresh_skipped`
- `epoch_full_refresh_started`
- `epoch_full_refresh_finished`
- `epoch_regression_pause`
- `epoch_cycle_error`

In the default epoch cycle, fixed admission and ready-queue refill are separate.
A shrinking ready queue is normal when the admitted set is nearly complete.
Fast refresh events record in-epoch `kg-maintain --no-tool-runners` work and
coalescing decisions. Full refresh events record boundary knowledge
maintenance after report truth is rebuilt. In legacy continuous mode
(`--no-epoch-cycle`) the trigger tops the queue up on every pass and
`pool_below_target` covers low queued work, low schedulable distinct-file work,
blocked queued work behind active file locks, long-tail worker drain, and
optional periodic replans. The state reader prioritizes unhandled
`pool_below_target` events ahead of ordinary worker-report backlog so
capacity-preserving replans are not delayed behind many older completion
events.

`epoch_regression_pause` records that one epoch regressed more report rows
than the pause threshold, so the pipeline recorded its checkpoint but withheld
the refill. `epoch_cycle_error` records a failed epoch commit or report build.
Both carry enough payload for deterministic routing or an operator to decide
whether to repair, revert, or resume.

## Leases And Locks

A worker may only edit paths covered by its active lease. The state substrate
rejects overlapping active locks for the same source path. When a worker
finishes, stalls, or is recovered, the lease is released and transient locks are
removed while reports and artifacts remain.

## Facts

Facts are reusable, provenance-tagged board knowledge. They can describe
symbols, types, source shapes, resource findings, duplicate relationships,
negative hypotheses, or review constraints. Accepted facts can change future
target packets; rejected or uncertain facts stay visible so workers do not
repeat low-value guesses.

The design taxonomy names these fact classes:

| Fact Type | Meaning |
| --- | --- |
| `asm_duplicate_group` | Normalized assembly group with matched refs and unmatched candidates. |
| `source_shape_pattern` | Declaration order, branch shape, helper inline shape, loop form, or pragma behavior that improved a target. |
| `type_or_field_hint` | Struct field, accessor, callback signature, table type, or data ownership fact. |
| `negative_result` | Capability or hypothesis class that preserved a bad mismatch or caused regressions. |
| `integration_fact` | Accepted patch, score delta, validation commands, and affected graph neighbors. |

## Artifacts

Artifacts make the run inspectable. Board snapshots, rendered prompts, raw Pi
output, worker reports, fact files, blockers, validation transcripts, regression
reports, guardian system-run logs, and incident packets belong under the run
state directory.
