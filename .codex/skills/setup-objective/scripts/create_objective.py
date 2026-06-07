#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise SystemExit("Objective name must contain at least one letter or digit.")
    return slug


def title_from_slug(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.split("-"))


def write_file(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        raise SystemExit(f"Refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def readme_template(title: str, slug: str) -> str:
    return f"""# {title}

Use this objective bundle for the long-running work described in `goal.md`.
Keep durable handoff notes in `current_state.md`, not in the top-level
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

Objective path: `objectives/{slug}/`
"""


def goal_template(slug: str) -> str:
    context_files = [
        "00_problem.md",
        "01_constraints.md",
        "02_implementation_scope.md",
        "03_working_plan.md",
        "04_validation_and_handoff.md",
    ]
    context_lines = "\n".join(
        f"        - objectives/{slug}/context/{name}" for name in context_files
    )
    return f"""<goal>
    - Define the objective outcome.
    - State the implementation or research surface this objective owns.
</goal>

<context_refresh>
    <required_files>
        - objectives/{slug}/goal.md
        - objectives/{slug}/current_state.md
{context_lines}
    </required_files>

    <instruction>
        - At objective start and after compaction/resume, reread the required
          files and treat this bundle as the authority for this objective.
    </instruction>
</context_refresh>

<working_strategy>
    - Summarize the preferred approach and sequencing constraints.
    - Keep detailed phase gates in `context/03_working_plan.md`.
    - Name important assumptions that should guide implementation.
</working_strategy>

<success_metrics>
    - Define observable signs of progress.
    - Include run artifacts, tests, benchmarks, or review gates when applicable.
</success_metrics>

<non_goals>
    - State what this objective must not expand into.
    - Call out tempting but invalid shortcuts.
</non_goals>

<completion_criteria>
    - Define the conditions required to mark this objective complete.
    - Include the expected update to objectives/{slug}/current_state.md.
</completion_criteria>
"""


def current_state_template(today: str) -> str:
    return f"""<current_state>
<last_updated>{today}</last_updated>

<status>
    - Objective scaffold created. Replace this with the active handoff once work begins.
</status>

<completed>
    - No implementation work recorded yet.
</completed>

<in_progress>
    - Objective definition is pending.
</in_progress>

<next_actions>
    - Fill in `goal.md` and the `context/` files with concrete objective details.
    - Replace vague plan bullets with phase-gated instructions before starting
      substantive work.
</next_actions>

<risks_or_open_questions>
    - Unknown until the objective is defined.
</risks_or_open_questions>

<important_paths>
    - `goal.md`
    - `current_state.md`
    - `context/`
    - `examples/`
</important_paths>
</current_state>
"""


CONTEXT_TEMPLATES = {
    "00_problem.md": """<problem>
    <objective_question>
        - State the concrete question this objective must answer.
    </objective_question>

    <current_baseline>
        - Name the current behavior, metric, candidate, or known state.
        - Link baseline artifacts or reports that a future agent must reread.
    </current_baseline>

    <why_current_state_is_insufficient>
        - Explain the gap, failure mode, plateau, bug, or missing evidence.
    </why_current_state_is_insufficient>

    <failure_modes>
        - `[failure_mode_name]`: Describe how it appears and why it matters.
    </failure_modes>

    <prior_evidence>
        - `[path]`: Summarize the decision-relevant evidence in one sentence.
    </prior_evidence>

    <expected_value>
        - Define what kind of result would justify this objective.
    </expected_value>
</problem>
""",
    "01_constraints.md": """<constraints>
    <hard_rules>
        - List non-negotiable constraints, validity boundaries, and evidence
          requirements.
    </hard_rules>

    <forbidden_shortcuts>
        - `[shortcut]`: State why it is invalid for this objective.
    </forbidden_shortcuts>

    <data_and_feature_boundaries>
        - State which inputs are deployable, diagnostic-only, truth-only,
          local-only, or forbidden.
    </data_and_feature_boundaries>

    <risk_budget>
        - `[metric_or_failure_mode]`: Define the allowed budget and escalation
          rule.
    </risk_budget>

    <promotion_or_completion_gates>
        - `[gate]`: Define the exact pass/fail condition.
    </promotion_or_completion_gates>
</constraints>
""",
    "02_implementation_scope.md": """<implementation_scope>
    <owned_surfaces>
        - `[path]`: State what this objective may edit, generate, or replace.
    </owned_surfaces>

    <read_only_references>
        - `[path]`: State why this should be read but not changed.
    </read_only_references>

    <generated_outputs>
        - `[path]`: State required contents and regeneration command.
    </generated_outputs>

    <commands_and_entrypoints>
        - `[command]`: State purpose, expected outputs, and when to run it.
    </commands_and_entrypoints>

    <adjacent_surfaces_requiring_caution>
        - `[path_or_system]`: State the risk and approval or validation needed.
    </adjacent_surfaces_requiring_caution>

    <out_of_scope>
        - `[path_or_behavior]`: State why it is excluded.
    </out_of_scope>
</implementation_scope>
""",
    "03_working_plan.md": """<working_plan>
    <overview>
        1. baseline_reproduction - Reproduce or load the current baseline and
           record decision metrics before changing behavior.
        2. plan_execution - Execute the objective-specific implementation,
           sweep, audit, or research phases.
        3. validation_and_reporting - Validate finalists, write artifacts,
           update state, and produce the final report.
    </overview>

    <operating_principles>
        - Replace this scaffold with objective-specific principles before
          substantive work starts.
        - Do not accept vague instructions such as "analyze results" or "run
          tests"; name the inputs, outputs, and gates.
    </operating_principles>

    <phase id="1" name="baseline_reproduction">
        <objective>
            - Establish the baseline metrics, artifacts, and commands that all
              later work compares against.
        </objective>
        <inputs>
            - `[baseline artifact or command]`
        </inputs>
        <process>
            - Load or reproduce the baseline.
            - Record aggregate, per-shard, per-cohort, runtime, or other
              objective-relevant metrics.
            - If the baseline does not reproduce, diagnose before continuing.
        </process>
        <outputs>
            - `artifacts/baseline_summary.json`: baseline metrics, artifact
              paths, command, and timestamp.
        </outputs>
        <gate>
            - Baseline is reproduced or a documented mismatch explains why the
              objective must change route.
        </gate>
        <failure_handling>
            - If required artifacts are missing, write a missing-artifact list
              and either rebuild them or narrow the objective scope.
        </failure_handling>
    </phase>

    <phase id="2" name="objective_execution">
        <objective>
            - Execute the core objective work.
        </objective>
        <inputs>
            - Output from phase 1.
            - Objective-specific files, datasets, configs, reports, or code
              surfaces.
        </inputs>
        <process>
            - Replace this with concrete steps: candidate families, files to
              edit, config rows to generate, audits to render, or commands to
              run.
            - Include decision branches. If a candidate is unsafe, define the
              brake, narrowing, or rejection route.
        </process>
        <outputs>
            - `[artifact path]`: required contents, columns, or summary fields.
        </outputs>
        <gate>
            - Define the measurable condition required before validation.
        </gate>
        <failure_handling>
            - Define what to do if the result is empty, unsafe, too slow,
              inconclusive, or outside the owned scope.
        </failure_handling>
    </phase>

    <phase id="3" name="validation_and_reporting">
        <objective>
            - Validate the result, write the report, and leave a durable
              handoff.
        </objective>
        <inputs>
            - Outputs from phases 1 and 2.
        </inputs>
        <process>
            - Run the validation ladder from `context/04_validation_and_handoff.md`.
            - Compare against baseline and relevant anchors.
            - Write report sections that explain wins, losses, risk, rejected
              routes, and next actions.
            - Update `current_state.md` with decisions, commands, paths, risks,
              and next actions.
        </process>
        <outputs>
            - `report.md`: final objective report.
            - `current_state.md`: updated handoff state.
            - `artifacts/run_summary.json`: commands, counts, decisions, and
              artifact index.
        </outputs>
        <gate>
            - Completion criteria in `goal.md` and validation gates in
              `context/04_validation_and_handoff.md` are satisfied or the
              report clearly marks the objective as blocked/rejected.
        </gate>
        <failure_handling>
            - If validation fails, keep artifacts, explain the failure, and
              route the next objective or rollback path.
        </failure_handling>
    </phase>
</working_plan>
""",
    "04_validation_and_handoff.md": """<validation_and_handoff>
    <validation_ladder>
        - `[tier_or_command]`: State purpose, required pass condition, and
          artifacts produced.
    </validation_ladder>

    <artifact_contract>
        - `[path]`: State required contents, columns, summary fields, or
          regeneration command.
    </artifact_contract>

    <acceptance_gates>
        - `[gate]`: State exact completion or promotion condition.
    </acceptance_gates>

    <report_contract>
        - `report.md` must summarize baseline, method, artifacts, results,
          rejected routes, risks, and recommended next action.
    </report_contract>

    <current_state_update>
        - Before handoff, update `current_state.md` with completed work,
          active decision, commands run, important paths, risks, and next
          actions.
    </current_state_update>

    <blocked_or_failed_handoff>
        - If the objective cannot complete, preserve artifacts, state the
          blocker, and define the smallest useful next step.
    </blocked_or_failed_handoff>
</validation_and_handoff>
""",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create an objective bundle.")
    parser.add_argument("name", help="Objective name or slug.")
    parser.add_argument("--title", help="Readable objective title.")
    parser.add_argument("--root", default="objectives", help="Objective root directory.")
    parser.add_argument(
        "--no-examples", action="store_true", help="Skip creating examples/."
    )
    parser.add_argument("--force", action="store_true", help="Overwrite files.")
    parser.add_argument(
        "--date",
        default=dt.date.today().isoformat(),
        help="Initial current_state date, YYYY-MM-DD.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    slug = slugify(args.name)
    title = args.title or title_from_slug(slug)
    root = Path(args.root)
    objective_dir = root / slug

    write_file(objective_dir / "README.md", readme_template(title, slug), args.force)
    write_file(objective_dir / "goal.md", goal_template(slug), args.force)
    write_file(
        objective_dir / "current_state.md",
        current_state_template(args.date),
        args.force,
    )
    for filename, content in CONTEXT_TEMPLATES.items():
        write_file(objective_dir / "context" / filename, content, args.force)

    if not args.no_examples:
        write_file(objective_dir / "examples" / ".gitkeep", "", args.force)

    print(f"Created objective bundle: {objective_dir}")


if __name__ == "__main__":
    main()
