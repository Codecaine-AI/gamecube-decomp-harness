#!/usr/bin/env python3
"""Create a decomp-runs/<slug>/ bundle for data-driven Melee decomp sweeps."""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


TARGET_MANIFEST_HEADER = [
    "symbol",
    "source_path",
    "unit",
    "size",
    "baseline_percent",
    "status",
    "best_percent",
    "best_config",
    "next_action",
    "notes",
]

CONFIG_MATRIX_HEADER = [
    "config_id",
    "symbol",
    "family",
    "subfamily",
    "search_pass",
    "parent_config_id",
    "posture",
    "transform_list",
    "expected_mismatch_class",
    "reviewability_risk",
    "allowed_to_promote",
    "selection_reason",
    "notes",
]

SWEEP_RESULTS_HEADER = [
    "config_id",
    "symbol",
    "compiled",
    "compile_seconds",
    "match_percent",
    "score_delta",
    "instruction_count",
    "instruction_diff_count",
    "arg_mismatch_count",
    "insert_count",
    "delete_count",
    "replace_count",
    "reloc_diff_count",
    "data_diff_count",
    "neighbor_regression_count",
    "reviewability_score",
    "notes",
]

MISMATCH_LEDGER_HEADER = [
    "config_id",
    "symbol",
    "mismatch_class",
    "diff_kind",
    "ours",
    "target",
    "address",
    "notes",
]

PARETO_HEADER = [
    "config_id",
    "symbol",
    "match_percent",
    "reviewability_score",
    "compile_seconds",
    "mismatch_count",
    "neighbor_regression_count",
    "selected_for_validation",
    "frontier_reason",
]

VALIDATION_CONFIGS_HEADER = [
    "config_id",
    "symbol",
    "selection_reason",
    "validation_scope",
    "expected_gate",
]

VALIDATION_RESULTS_HEADER = [
    "config_id",
    "symbol",
    "command",
    "passed",
    "match_percent",
    "neighbor_regression_count",
    "data_regression_count",
    "notes",
]

LEARNED_PATTERNS_HEADER = [
    "pattern_id",
    "search_pass",
    "family",
    "observation",
    "evidence_configs",
    "effect",
    "next_action",
    "confidence",
    "notes",
]


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "decomp-run"


def rel_path(path: str | None, root: Path) -> str:
    if not path:
        return ""
    p = Path(path)
    if p.is_absolute():
        try:
            return str(p.relative_to(root))
        except ValueError:
            return str(p)
    return str(p)


def load_json(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def find_objdiff_unit(root: Path, source_path: str | None) -> dict[str, Any]:
    if not source_path:
        return {}
    source_rel = rel_path(source_path, root)
    data = load_json(root / "objdiff.json")
    if not data:
        return {}
    for unit in data.get("units", []):
        metadata = unit.get("metadata") or {}
        if metadata.get("source_path") == source_rel:
            scratch = unit.get("scratch") or {}
            return {
                "unit": unit.get("name", ""),
                "target_path": unit.get("target_path", ""),
                "base_path": unit.get("base_path", ""),
                "ctx_path": scratch.get("ctx_path", ""),
            }
    return {}


def report_function_info(root: Path, unit_name: str, symbol: str) -> dict[str, Any]:
    data = load_json(root / "build" / "GALE01" / "report.json")
    if not data:
        return {}
    for unit in data.get("units", []):
        if unit.get("name") != unit_name:
            continue
        for fn in unit.get("functions", []) or []:
            if fn and fn.get("name") == symbol:
                return {
                    "size": fn.get("size", ""),
                    "baseline_percent": fn.get("fuzzy_match_percent", ""),
                }
    return {}


def write_text(path: Path, text: str, force: bool) -> None:
    if path.exists() and not force:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, obj: Any, force: bool) -> None:
    if path.exists() and not force:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def write_csv(path: Path, header: list[str], rows: list[dict[str, Any]], force: bool) -> None:
    if path.exists() and not force:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=header)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in header})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", help="Readable run name or slug")
    parser.add_argument("--source", help="Target source file, e.g. src/melee/it/items/itlinkbomb.c")
    parser.add_argument("--symbol", action="append", default=[], help="Target symbol; repeat for multiple symbols")
    parser.add_argument("--root", type=Path, default=Path("."), help="Repo root (default: current directory)")
    parser.add_argument("--runs-dir", default="decomp-runs", help="Run root relative to repo (default: decomp-runs)")
    parser.add_argument("--force", action="store_true", help="Overwrite scaffold files that already exist")
    args = parser.parse_args()

    root = args.root.resolve()
    source_rel = rel_path(args.source, root)
    symbols = args.symbol
    base_name = args.name or source_rel or (symbols[0] if symbols else "decomp-run")
    run_slug = slugify(base_name)
    run_dir = root / args.runs_dir / run_slug

    if run_dir.exists() and not args.force:
        raise SystemExit(f"Run already exists: {run_dir} (use --force to refresh templates)")

    unit_info = find_objdiff_unit(root, source_rel)
    unit_name = unit_info.get("unit", "")
    today = datetime.now().strftime("%Y-%m-%d")

    for subdir in [
        "context",
        "notes",
        "artifacts/candidate_sources",
        "artifacts/candidate_patches",
        "artifacts/candidate_objects",
        "artifacts/diff_json",
        "artifacts/diff_text",
        "artifacts/permuter_runs",
        "artifacts/charts",
        "artifacts/analysis",
    ]:
        (run_dir / subdir).mkdir(parents=True, exist_ok=True)

    target_rows = []
    for symbol in symbols:
        info = report_function_info(root, unit_name, symbol)
        target_rows.append(
            {
                "symbol": symbol,
                "source_path": source_rel,
                "unit": unit_name,
                "size": info.get("size", ""),
                "baseline_percent": info.get("baseline_percent", ""),
                "status": "queued",
                "next_action": "baseline_objdiff",
            }
        )

    target_packet = {
        "run_name": run_slug,
        "created_at": today,
        "source_path": source_rel,
        "unit": unit_name,
        "target_path": unit_info.get("target_path", ""),
        "base_path": unit_info.get("base_path", ""),
        "ctx_path": unit_info.get("ctx_path", ""),
        "symbols": symbols,
        "baseline": {
            "generated_at": "",
            "report_percent": target_rows[0].get("baseline_percent", "") if target_rows else "",
            "objdiff_percent": "",
        },
        "sections_owned": [],
        "risky_neighbors": [],
        "validation_commands": [
            "export WINEDEBUG=-all",
            "python configure.py --require-protos",
            f"ninja {unit_info.get('base_path', '<target-object>')}",
            f"build/tools/objdiff-cli diff -p . -u {unit_name or '<unit>'} <symbol> --format json-pretty -o {args.runs_dir}/{run_slug}/artifacts/diff_json/final.<symbol>.json",
        ],
    }

    baseline = target_rows[0].get("baseline_percent", "") if target_rows else ""
    symbols_text = ", ".join(f"`{s}`" for s in symbols) if symbols else "`<symbol>`"

    write_text(
        run_dir / "README.md",
        f"""# Decomp Sweep: {run_slug}

- Source: `{source_rel or '<source-path>'}`
- Unit: `{unit_name or '<unit>'}`
- Symbols: {symbols_text}
- Baseline: {baseline or "TBD"}
- Best: TBD
- Candidates evaluated: 0
- Pareto finalists: 0
- Analysis: `artifacts/analysis/sweep_analysis.md`
- Next sweep focus: baseline reproduction

![accuracy progress](artifacts/charts/accuracy_progress.svg)
![pareto frontier](artifacts/charts/pareto_frontier.svg)
![mismatch classes](artifacts/charts/mismatch_classes.svg)

## Latest Decision

- Status: scaffolded
- Next action: reproduce baseline and fill `artifacts/baseline_summary.json`.
""",
        args.force,
    )

    write_text(
        run_dir / "goal.md",
        f"""<goal>
- Continue the Melee decomp sweep in `decomp-runs/{run_slug}` for source `{source_rel or '<source-path>'}`, unit `{unit_name or '<unit>'}`, symbols {symbols_text}.
- Drive the run from baseline reproduction through candidate-matrix sweeps, Pareto selection, post-sweep worked/failed analysis, next-sweep planning, permuter handoff when justified, cleanup, and validation.
</goal>

<context_refresh>
- Reread `decomp-orchestrator/knowledge/workflows/experimental-sweeps/overview.md` and `decomp-orchestrator/knowledge/references/melee/overview.md`.
- Reread `decomp-runs/{run_slug}/current_state.md`, `decomp-runs/{run_slug}/run.md`, and the files under `decomp-runs/{run_slug}/context/`.
- Inspect `decomp-runs/{run_slug}/artifacts/target_packet.json`, `target_manifest.csv`, `config_matrix.csv`, `sweep_results.csv`, `pareto_frontier.csv`, `artifacts/analysis/sweep_analysis.md`, and `artifacts/analysis/next_sweep_plan.md` if present.
</context_refresh>

<working_strategy>
- Keep exploratory variants under `decomp-runs/{run_slug}/artifacts/`; do not promote changes into `src/` until a finalist is selected and cleaned.
- For each sweep cycle: establish or refresh baseline, add explicit `config_matrix.csv` rows, compile/score candidates in isolation, summarize objdiff JSON, select Pareto and near-miss rows, run post-sweep analysis, render charts, and update `current_state.md`.
- Use post-sweep analysis to name what worked, what failed or was optimized away, why it likely happened, and what the next sweep should vary, hold fixed, ablate, or avoid.
- Continue sweep/analyze/plan cycles until an exact match is found, a reviewable near-match reaches the agreed handoff point, or the run is blocked by a documented missing type/tooling/systemic issue.
</working_strategy>

<success_metrics>
- Candidate rows and results are reproducible from `config_matrix.csv`, `sweep_results.csv`, diff artifacts, and analysis notes.
- `artifacts/charts/accuracy_progress.svg`, `pareto_frontier.svg`, and `mismatch_classes.svg` reflect current results.
- `current_state.md` records baseline, best candidate, evaluated count, Pareto finalist count, latest analysis, next sweep focus, risks, and next actions.
- Any promoted source passes the relevant objdiff/build validation ladder and preserves review standards.
</success_metrics>

<non_goals>
- Do not turn this into a broad random global function queue.
- Do not auto-commit, hide fake-match tradeoffs, or leave permuter slop/generator comments in production source.
- Do not let parallel candidates write to shared `build/` outputs.
</non_goals>

<completion_criteria>
- Complete when the target symbol set is matched and validated, or when the best reviewable result plus remaining blocker is documented with artifacts and a concrete handoff.
- Before completion, update `current_state.md`, render charts, write `artifacts/analysis/sweep_analysis.md` and `next_sweep_plan.md`, and record validation evidence.
</completion_criteria>
""",
        args.force,
    )

    write_text(
        run_dir / "run.md",
        f"""<decomp_run>
<target>
- Source: `{source_rel or '<source-path>'}`
- Unit: `{unit_name or '<unit>'}`
- Symbols: {symbols_text}
</target>

<strategy>
- Treat each source-shape candidate as a row in `artifacts/config_matrix.csv`.
- Compile candidates in isolation before scoring with objdiff.
- Select by Pareto frontier across match percent, mismatch count, reviewability, compile cost, and neighbor/data regressions.
- Use permuter only on strong finalists.
</strategy>

<success_metrics>
- Best reviewed candidate improves over baseline or reaches 100%.
- Charts and CSV artifacts reproduce every decision.
- Final promoted source passes the validation ladder recorded in `context/04_validation_and_handoff.md`.
</success_metrics>

<non_goals>
- Do not use this run as a broad random global decomp queue.
- Do not promote fake-match or permuter slop without cleanup and explicit tradeoff notes.
</non_goals>
</decomp_run>
""",
        args.force,
    )

    write_text(
        run_dir / "current_state.md",
        f"""<current_state>
<last_updated>{today}</last_updated>

<status>
- Run scaffolded; baseline still needs to be reproduced.
</status>

<metrics_snapshot>
- Baseline: {baseline or "TBD"}
- Best candidate: TBD
- Candidates evaluated: 0
- Pareto finalists: 0
- Analysis: `artifacts/analysis/sweep_analysis.md`
- Next sweep focus: baseline reproduction
- Latest chart: `artifacts/charts/accuracy_progress.svg`
</metrics_snapshot>

<next_actions>
- Run baseline object build and objdiff.
- Populate `artifacts/baseline_summary.json`.
- Add baseline and first coarse rows to `artifacts/config_matrix.csv`.
</next_actions>

<risks_or_open_questions>
- Confirm whether this run is text-only or TU-sensitive.
</risks_or_open_questions>
</current_state>
""",
        args.force,
    )

    context_files = {
        "00_target_packet.md": f"""# Target Packet

- Source: `{source_rel or '<source-path>'}`
- Unit: `{unit_name or '<unit>'}`
- Symbols: {symbols_text}
- Target object: `{unit_info.get('target_path', '<target-path>')}`
- Base object: `{unit_info.get('base_path', '<base-path>')}`
- Context path: `{unit_info.get('ctx_path', '<ctx-path>')}`

## Baseline Commands

```bash
export WINEDEBUG=-all
ninja {unit_info.get('base_path', '<target-object>')}
build/tools/objdiff-cli diff -p . -u {unit_name or '<unit>'} <symbol> --format json-pretty -o {args.runs_dir}/{run_slug}/artifacts/diff_json/baseline.<symbol>.json
```
""",
        "01_constraints.md": """# Constraints

- Keep exploratory candidates out of `src/` until a finalist is selected.
- Do not run parallel candidates that write to shared `build/` outputs.
- Treat headers, statics, literals, pragmas, data sections, splits, and symbols as TU-sensitive.
- Do not promote raw offset math, fake statics, unreviewable padding, or generated comments.
""",
        "02_candidate_families.md": """# Candidate Families

Start with rows from these families:

- `local_order`
- `temp_lifetime`
- `expression_shape`
- `branch_shape`
- `loop_shape`
- `inline_shape`
- `accessor_shape`
- `stack_shape`
- `literal_relocation`
- `prototype_type`
""",
        "03_working_plan.md": """# Working Plan

1. Reproduce baseline and render initial charts.
2. Add coarse candidate rows to `config_matrix.csv`.
3. Compile and score candidates in isolated outputs.
4. Select Pareto rows and near-misses.
5. Run permuter on selected finalists.
6. Clean the best candidate and validate before promotion.
""",
        "04_validation_and_handoff.md": """# Validation And Handoff

## Validation Ladder

- Compile candidate.
- Run symbol objdiff.
- Run TU objdiff when candidate is TU-sensitive.
- Run `python configure.py --require-protos`.
- Run target object build.
- Run full `ninja` when data, headers, splits, or shared helpers changed.

## Handoff

- Update `current_state.md`.
- Render charts.
- Record validation commands and results in `validation_results.csv`.
""",
        "05_post_sweep_analysis.md": """# Post-Sweep Analysis

After each sweep batch:

1. Generate or update `artifacts/analysis/sweep_analysis.md`.
2. Explain what worked, what failed, what was optimized away, and what created regressions.
3. Append durable findings to `artifacts/learned_patterns.csv`.
4. Write `artifacts/analysis/next_sweep_plan.md`.
5. Update `current_state.md` with the analysis path and next sweep focus.

Use:

```bash
python decomp-orchestrator/knowledge/tools/sweeps/analyze_sweep_results.py <run-dir>
```
""",
    }
    for name, text in context_files.items():
        write_text(run_dir / "context" / name, text, args.force)

    write_text(run_dir / "notes" / "hypotheses.md", "# Hypotheses\n\n", args.force)
    write_text(run_dir / "notes" / "rejected_candidates.md", "# Rejected Candidates\n\n", args.force)
    write_text(run_dir / "notes" / "cleanup_notes.md", "# Cleanup Notes\n\n", args.force)

    write_json(run_dir / "artifacts" / "target_packet.json", target_packet, args.force)
    write_json(run_dir / "artifacts" / "baseline_summary.json", {}, args.force)
    write_json(run_dir / "artifacts" / "run_summary.json", {"run_name": run_slug, "status": "scaffolded"}, args.force)
    write_text(run_dir / "artifacts" / "analysis" / "sweep_analysis.md", "# Sweep Analysis\n\nNo sweep results yet.\n", args.force)
    write_text(run_dir / "artifacts" / "analysis" / "next_sweep_plan.md", "# Next Sweep Plan\n\nReproduce the baseline before planning the first sweep.\n", args.force)
    write_csv(run_dir / "artifacts" / "target_manifest.csv", TARGET_MANIFEST_HEADER, target_rows, args.force)
    write_csv(run_dir / "artifacts" / "config_matrix.csv", CONFIG_MATRIX_HEADER, [], args.force)
    write_csv(run_dir / "artifacts" / "sweep_results.csv", SWEEP_RESULTS_HEADER, [], args.force)
    write_csv(run_dir / "artifacts" / "mismatch_ledger.csv", MISMATCH_LEDGER_HEADER, [], args.force)
    write_csv(run_dir / "artifacts" / "pareto_frontier.csv", PARETO_HEADER, [], args.force)
    write_csv(run_dir / "artifacts" / "frontier_near_misses.csv", PARETO_HEADER, [], args.force)
    write_csv(run_dir / "artifacts" / "validation_configs.csv", VALIDATION_CONFIGS_HEADER, [], args.force)
    write_csv(run_dir / "artifacts" / "validation_results.csv", VALIDATION_RESULTS_HEADER, [], args.force)
    write_csv(run_dir / "artifacts" / "learned_patterns.csv", LEARNED_PATTERNS_HEADER, [], args.force)
    write_csv(
        run_dir / "artifacts" / "analysis" / "next_config_seeds.csv",
        CONFIG_MATRIX_HEADER,
        [],
        args.force,
    )

    print(f"Created decomp run: {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
