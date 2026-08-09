---
concepts: [durable-state, sqlite, epochs, target-claims, worker-state, checkpoints, events, facts, artifacts]
---

# Durable State And Events

Durable state substrate, events, target claims, worker states, checkpoints, facts, and artifacts.

Durable state is the orchestrator's memory. It records the board, active work,
agent sessions, scheduler epochs, worker states, checkpoints, facts, and wake
events. The state substrate allows workers and deterministic scheduling to
operate at different times without losing context.

## State Model

The board carries:

- Runs: the goal, desired worker count, baseline report identity, and status.
- Targets: candidate functions or units with priority and rationale.
- Epochs: deterministic scheduling waves with fixed target membership,
  completion counts, refresh counters, and boundary routing summaries.
- Epoch targets: the target inventory for one epoch, with lifecycle positions
  such as admitted, claimed, and finished.
- Target claims: active or closed worker ownership for one epoch target,
  including the explicit write set and worker workspace.
- Worker states: runner-owned lifecycle ledgers for target claims.
- Worker checkpoints: one row per runner validation attempt, including failed
  validations and the selected best attempt.
- Pi sessions: worker, PR splitter/reviewer, curation, reconcile, and QA repair invocation
  metadata.
- Legacy director cycles: old board-level decision rows retained only so old
  state files remain readable.
- Epoch verdicts and integrations: target-centric boundary truth, validation
  results, and score-gate records.
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
- `worker_error`
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

In the default epoch cycle, fixed admission and worker-slot realization are
separate. A shrinking pool of admitted-but-unclaimed work is normal when the
admitted set is nearly complete.
Fast refresh events record in-epoch `kg-maintain --no-tool-runners` work and
coalescing decisions. Full refresh events record boundary knowledge
maintenance after report truth is rebuilt. `pool_below_target` covers worker
pool pressure and admitted-target exhaustion. The state reader prioritizes
unhandled `pool_below_target` events ahead of ordinary completion backlog so
capacity-preserving replans are not delayed behind many older completion
events.

`epoch_regression_pause` records that one epoch regressed more report rows
than the pause threshold, so the pipeline recorded its checkpoint but withheld
the refill. `epoch_cycle_error` records a failed epoch commit or report build.
Both carry enough payload for deterministic routing or an operator to decide
whether to repair, revert, or resume.

## Claims And Checkpoints

A worker may only edit paths covered by its active target claim. Each claim owns
an explicit write set, and each claim has exactly one worker state. Runner
validation writes checkpoints under that worker state; failed validations are
kept as evidence, while selectable checkpoints must pass hard gates and improve
over baseline. When execution ends, the claim closes and the worker state
records whether the lifecycle ended as exact, timeout, error, cancellation, or
another runner-owned terminal state.

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
output, worker-state summaries, checkpoint notes, fact files, blockers,
validation transcripts, regression reports, guardian system-run logs, and
incident packets belong under the run state directory.
