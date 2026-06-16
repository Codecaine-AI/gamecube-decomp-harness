# Deterministic Epoch Orchestration

This objective owns the move from LM-directed target scheduling to a
deterministic epoch scheduler. The scheduler admits an epoch-sized target set,
keeps a ready queue filled from that set, runs coalesced fast run-evidence
refreshes while workers are active, performs full truth rebuilds at epoch
boundaries, and routes matches/regressions/facts/stalls before admitting the
next epoch.

Keep durable handoff notes in `current_state.md`, not in a top-level
`CURRENT_STATE.md`.

## Objective Files

- `goal.md` - objective, context refresh, strategy, success metrics, non-goals,
  and completion criteria.
- `current_state.md` - compact objective-local handoff state for active work.
- `context/00_problem.md` - problem statement and motivation.
- `context/01_constraints.md` - hard constraints, validity rules, and boundaries.
- `context/02_implementation_scope.md` - files, modules, and systems this
  objective may change.
- `context/03_working_plan.md` - phase-gated execution plan with inputs,
  outputs, gates, and failure handling.
- `context/04_validation_and_handoff.md` - acceptance checks and handoff rules.
- `examples/` - configs, prompts, command snippets, or fixtures that make the
  objective concrete.

Objective path: `objectives/deterministic-epoch-orchestration/`
