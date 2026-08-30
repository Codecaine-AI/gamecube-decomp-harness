# Section Data Targets + Ranking Removal

Use this objective bundle for the long-running work described in `goal.md`.
Keep durable handoff notes in `current_state.md`, not in the top-level
`CURRENT_STATE.md`.

For objective-local scripts that may run for many minutes or hours, follow
`.codex/skills/setup-objective/references/long_running_handoff_and_scripts.md`
when that reference is available.

## Objective Files

- `goal.md` - objective, context refresh, strategy, success metrics, non-goals,
  and completion criteria.
- `current_state.md` - compact objective-local handoff state for active work.
- `context/00_problem.md` - problem statement and motivation.
- `context/01_constraints.md` - hard constraints, validity rules, and boundaries.
- `context/02_implementation_scope.md` - files, modules, and systems this
  objective may change.
- `context/03_working_plan.md` - phase-gated execution plan with inputs,
  outputs, gates, long-running runner contracts, and failure handling.
- `context/04_validation_and_handoff.md` - acceptance checks, active-run
  handoff, and handoff rules.
- `examples/` - configs, prompts, command snippets, or fixtures that make the
  objective concrete.

Objective path: `objectives/data-targets-and-ranking-removal/`
