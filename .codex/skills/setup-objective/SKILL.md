---
name: setup-objective
description: Create, update, and maintain repo-local objective bundles for long-running work. Use when Codex needs to scaffold a new folder under objectives/, write or normalize pseudo-XML goal.md and context files, create objective-local current_state.md, migrate handoff state out of a top-level CURRENT_STATE.md, or keep objective state updated during extended implementation or research tasks.
---

# Setup Objective

## Contract

Use an objective bundle as the durable source of truth for long-running repo work:

```text
objectives/<objective-slug>/
+-- README.md
+-- goal.md
+-- current_state.md
+-- context/
|   +-- 00_problem.md
|   +-- 01_constraints.md
|   +-- 02_implementation_scope.md
|   +-- 03_working_plan.md
|   +-- 04_validation_and_handoff.md
+-- examples/
```

Prefer objective-local `current_state.md` over top-level `CURRENT_STATE.md`.
Treat any top-level state file as legacy/global index material unless the user
explicitly asks to keep using it.

## Workflow

1. Inspect existing `objectives/` folders and any active state file before
   creating or changing an objective.
2. Choose a stable slug. Use the user's exact folder name when they provide one;
   otherwise normalize to lowercase hyphen-case.
3. For a new objective, run `scripts/create_objective.py` from this skill to
   create the base files, then replace template bullets with concrete content.
4. For an existing objective, preserve the established file names unless they
   block the local-state convention.
5. Keep `goal.md` concise and pseudo-XML structured. Put detailed background,
   research notes, implementation maps, and phase-gated plans in `context/`.
   Use `references/objective_authoring.md` when drafting or normalizing these
   files.
6. If the goal text is intended for a Codex `/goal` command, validate and prune
   it under the 4,000-character TUI objective limit.
7. Update `current_state.md` at the start of active work, after meaningful
   milestones, before handoff/compaction, and before final response for a
   long-running task.

## Optimization Strategy Planning

When an objective includes testing design, parameter sweeps, data analysis,
visual review, subagent review, or measurable optimization, treat experiment
layout as part of the objective design.

Before writing the objective's working plan, consult
`references/known_optimization_strategies/README.md` and select the relevant
strategy references. Capture the chosen strategy in `context/03_working_plan.md`
and the required artifacts in `context/04_validation_and_handoff.md`.

For serious optimization objectives, bias toward deep, structured search rather
than surface-level threshold probes. Use `references/objective_authoring.md`
for the objective-file structure and the known optimization references for the
experiment strategy. The working plan should name the candidate families,
feature interactions, ablations, proxy metrics, Pareto/near-miss selection
rules, full-validation gates, and handoff artifacts that can reveal
non-obvious wins.

Default to an experiment loop that:

- reproduces the current baseline before changing behavior;
- records candidate variables in a `config_matrix.csv` or equivalent manifest;
- uses proxy sweeps only for screening;
- validates selected anchors, Pareto candidates, and near-misses end to end;
- renders visual wins/regressions and false-merge risks when visual failure
  modes matter;
- uses subagents for observation-only visual reports when review can be
  parallelized;
- converts visual findings into deployable feature hypotheses, not hand-labeled
  production rules;
- writes enough artifacts for a future agent to reproduce every decision.

## Objective Performance Defaults

For objective-local analysis, sweeps, audits, and research runners, treat
runtime as part of the objective design. These scripts often score millions of
edge rows, thousands of configs, or large feature-similarity matrices; a slow
implementation can waste whole research cycles.

Default to these performance habits:

- Look for parallelism during code changes. Use the repo's existing bounded
  worker patterns when jobs are independent, shard-local, or config-local.
  Keep output deterministic and avoid parallel writes to the same artifact.
- Prefer vectorized NumPy operations, matrix multiplication, batched scoring,
  and count-only reductions over Python row loops for data analysis.
- Before adding hardware-specific acceleration, check whether an
  algorithmic/vectorized rewrite removes the bottleneck. For example, do not
  materialize a full mostly-zero `edge_rows x config_chunk` boolean matrix when
  a filtered-universe count-only reduction gives the same answer.
- Keep production/challenge pipeline code portable unless the user explicitly
  authorizes an environment-specific dependency.
- For local debugging or research-only acceleration, use the optional reference
  `references/debugging_analysis_acceleration.md`. That reference is not a
  default production-code instruction.

## Goal Length

Codex `/goal` objective text must be less than 4,000 characters. Treat this as
a hard product constraint, not a style preference. A strong objective is dense:
it names the outcome, refresh context, strategy, success metrics, non-goals,
and completion criteria without carrying background that belongs in `context/`.

The default mode is soft on length below the hard limit. Do not force a goal
toward 1,600 characters if that would make it vague, lossy, or less executable.
Use 1,600 only as an optional compact target for simple objectives or
space-constrained handoff.

The recommended workflow is:

1. Draft the goal long enough to capture the real intent.
2. Move details, evidence, examples, and implementation maps into
   `context/*.md`.
3. Prune redundancy until the objective is below 4,000 characters. Keep useful
   structure and specificity even when the goal is longer than 1,600
   characters.
4. Validate with `scripts/validate_goal_length.py` before handing the goal to
   `/goal`.

Use concise wording, but do not make the goal vague. The goal should be as
short as it can be while preserving the execution contract.

## Goal Format

Write `goal.md` as pseudo-XML blocks with Markdown bullets inside the tags. The
format is for agent readability, not strict XML parsing.

Required blocks:

```xml
<goal>
- State the objective outcome and owned implementation/research surface.
</goal>

<context_refresh>
- Reread objectives/<slug>/goal.md.
- Reread objectives/<slug>/current_state.md.
- Reread the relevant objectives/<slug>/context/*.md files.
</context_refresh>

<working_strategy>
- Capture the approach and important sequencing constraints.
</working_strategy>

<success_metrics>
- Define observable signs of progress.
</success_metrics>

<non_goals>
- State what this objective must not expand into.
</non_goals>

<completion_criteria>
- Define what must be true before the objective is complete.
</completion_criteria>
```

Use additional blocks only when they reduce ambiguity, such as
`<authorized_edit_surfaces>`, `<validation_commands>`, or `<handoff_rules>`.

## Context File Depth

Use `references/objective_authoring.md` for the expected structure of
`context/*.md`. For substantial objectives, `context/03_working_plan.md` must
be a phase-gated execution contract, not a vague checklist. Each phase should
include:

- objective;
- inputs;
- process;
- outputs;
- gate;
- failure handling.

Prefer explicit paths, commands, artifact schemas, candidate families,
decision gates, and rejection criteria. If a working plan says only "analyze",
"sweep", "validate", or "write report", expand it before starting work.

## Current State Format

Keep `current_state.md` objective-local and compact. Use pseudo-XML blocks so a
future agent can resume without rereading unrelated global history.

Recommended blocks:

```xml
<current_state>
<last_updated>YYYY-MM-DD</last_updated>

<status>
- Current objective status in one to five bullets.
</status>

<completed>
- Durable accomplishments and accepted decisions.
</completed>

<in_progress>
- The active branch of work and any running assumptions.
</in_progress>

<next_actions>
- Concrete next commands, files, or decisions.
</next_actions>

<risks_or_open_questions>
- Blockers, uncertainty, and validation gaps.
</risks_or_open_questions>

<important_paths>
- Paths to objective files, run artifacts, logs, configs, or outputs.
</important_paths>
</current_state>
```

Do not paste large logs into state. Link artifact paths and summarize only the
decision-relevant evidence.

## Scripts

Use the scaffold script for new objectives:

```bash
python .codex/skills/setup-objective/scripts/create_objective.py \
  "new objective name" \
  --title "Readable Objective Title"
```

Options:

- `--root objectives`: choose another objective root.
- `--no-examples`: skip the `examples/` directory.
- `--force`: overwrite existing scaffold files.
- `--date YYYY-MM-DD`: set the initial `current_state.md` date.

The script refuses to overwrite existing files unless `--force` is passed. After
running it, edit the generated files so no generic template bullets remain in a
real objective.

Validate `/goal` objective length:

```bash
python .codex/skills/setup-objective/scripts/validate_goal_length.py \
  objectives/<objective-slug>/goal.md
```

The validator strips a leading `/goal` command or fenced code block before
counting. By default, it fails only above the hard maximum of `3,999` objective
characters and does not warn at `1,600`. Use `--compact-target` to apply the
optional `1,600` advisory target, `--target-chars N` for another advisory
target, and `--strict-target` when the selected target should fail the local
check.

## Migration

When moving from top-level `CURRENT_STATE.md` to an objective-local
`current_state.md`:

1. Identify the active objective from the user request, objective `README.md`,
   `goal.md`, or the old state file.
2. Create `objectives/<slug>/current_state.md` with only the state relevant to
   that objective.
3. Update the objective's `goal.md` `<context_refresh>` and completion criteria
   to reference `objectives/<slug>/current_state.md`.
4. Leave unrelated top-level state content alone unless the user explicitly asks
   to delete, rewrite, or convert it.
