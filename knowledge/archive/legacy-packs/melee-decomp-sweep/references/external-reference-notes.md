# External Reference Notes

The repo may contain `reference/ai-melee-decomp-main/`, which documents another AI-assisted Melee setup. Borrow useful mechanics, not the full autonomous workflow.

## Useful To Borrow

- Compact objdiff view: show symbol summary and paired mismatching instructions only.
- Section summary mode: useful for quick data-section regression checks.
- Timed permuter budgets: run each finalist for a fixed duration instead of open-ended search.
- Harvested permuter outputs: copy `output-<score>-*/`, `base.c`, and `target.s` into a durable results folder.
- Abort rule: skip or reroute after 4-5 build/verify cycles with no improvement.
- Systemic-change rule: flag shared header/struct changes that would cascade outside the target surface.
- Cleanup pass: do a final source-quality pass without losing match percent.

## Avoid Copying Directly

- Absolute paths such as `/home/sysop/...`.
- Auto-committing every function result.
- Global random function selection when the user asked for a file-local run.
- Treating register swaps as final matches; use them as a mismatch class to solve later.
- Using `PAD_STACK` as a first-line tactic.
- Forcing every loop into one preferred source form; loop form is an experiment dimension.
- Leaving generated comments or unreviewable permuter output in production source.

## Blend Into This Skill

Map those mechanics into run artifacts:

- objdiff wrapper output -> `artifacts/diff_text/<config_id>.<symbol>.md`;
- auto-permute harvest -> `artifacts/permuter_runs/<config_id>/`;
- target checkbox list -> `artifacts/target_manifest.csv`;
- skip/no-progress decisions -> `notes/rejected_candidates.md`;
- cleanup pass -> `context/04_validation_and_handoff.md` and `notes/cleanup_notes.md`;
- worked/failed run logs -> `artifacts/analysis/sweep_analysis.md`, `artifacts/learned_patterns.csv`, and `artifacts/analysis/next_sweep_plan.md`;
- charts -> `artifacts/charts/*.svg` plus `current_state.md` metric snapshot.
