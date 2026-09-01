#!/usr/bin/env python3
"""Build Phase 1 worker tool-usage artifacts for the 2026-09-01 audit."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import math
import os
import sqlite3
import statistics
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


RUN_ID = "4a45af8a-9f8c-499b-b375-c0d8e93fc8fd"
SCRIPT_DIR = Path(__file__).resolve().parent
AUDIT_DIR = SCRIPT_DIR.parent
REPO_ROOT = AUDIT_DIR.parents[1]
DB_PATH = REPO_ROOT / "games/melee/state/orchestrator.sqlite"

# Groups intentionally overlap. checkdiff tools compile before inspecting a diff.
TOOL_GROUPS: dict[str, frozenset[str]] = {
    "build_compile": frozenset({"direct_compile_tu", "checkdiff_run", "checkdiff_summary"}),
    "dedicated_compile": frozenset({"direct_compile_tu"}),
    "diff_checkdiff": frozenset({"checkdiff_run", "checkdiff_summary", "objdiff_score_candidate"}),
    "permuter_mutation": frozenset({"source_permuter_run", "source_permuter_replay", "source_mutation_preview"}),
    "graph_related_functions": frozenset({"graph_related_functions"}),
    "past_prs_search": frozenset({"past_prs_search"}),
    "knowledge_search": frozenset({
        "ledger_search", "knowledge_graph_search", "asm_window_search", "code_graph_search",
        "code_graph_file_card", "mwcc_debug_lookup", "type_layout_lookup", "type_oracle_lookup",
    }),
    "diagnostics": frozenset({
        "mwcc_debug_diagnose_regflow", "mwcc_debug_diagnose_stack",
        "mwcc_debug_diagnose_inlines", "mwcc_debug_dump_function", "mwcc_alloc_snapshot",
        "mwcc_alloc_compare", "m2c_decompile",
    }),
    "lint_review": frozenset({"review_lint_scan", "review_lint_sdata2_order_helper"}),
}

CORE_METRICS = [
    "total_calls", "n_distinct_tools", "error_nonzero_exit_count", "event_duration_min",
    "build_invocations", "approx_edit_build_diff_loop_count", "time_to_first_build_min",
]
GROUP_METRICS = [f"group_{name}_calls" for name in TOOL_GROUPS]
RATIO_METRICS = ["diff_to_build_ratio", "permuter_to_build_ratio", "diagnostics_to_build_ratio"]
ALL_METRICS = CORE_METRICS + GROUP_METRICS + RATIO_METRICS
COHORTS = ("exact", "near_miss", "progressed", "no_progress")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=AUDIT_DIR / "manifest.json")
    parser.add_argument("--workers", type=int, default=min(32, (os.cpu_count() or 4) * 4))
    return parser.parse_args()


def cohort_for(exact: Any, baseline: Any, best: Any) -> str:
    if int(exact or 0) == 1:
        return "exact"
    if best is not None and float(best) >= 99.5:
        return "near_miss"
    if best is not None and baseline is not None and float(best) > float(baseline) + 0.0001:
        return "progressed"
    return "no_progress"


def load_workers(manifest_path: Path) -> tuple[list[dict[str, Any]], str]:
    if manifest_path.is_file():
        records = json.loads(manifest_path.read_text())
        if not isinstance(records, list):
            raise ValueError(f"{manifest_path} must contain a JSON array")
        return records, str(manifest_path)

    # Development fallback only. Final audit runs should use Phase 0's manifest snapshot.
    uri = f"file:{DB_PATH}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(
            """
            SELECT ws.id AS ws_id, ws.worker_id, e.ordinal AS epoch_ordinal,
                   ws.target_key, ws.lifecycle_status, ws.baseline_score, ws.best_score,
                   ws.exact, ws.started_at, ws.ended_at, ws.artifact_dir
              FROM worker_state ws LEFT JOIN epochs e ON e.id = ws.epoch_id
             WHERE ws.run_id = ? ORDER BY e.ordinal, ws.started_at, ws.id
            """,
            (RUN_ID,),
        ).fetchall()
    finally:
        con.close()
    records = []
    for row in rows:
        record = dict(row)
        artifact_dir = record.get("artifact_dir")
        path = Path(artifact_dir) / "tool_events.jsonl" if artifact_dir else None
        record.update(
            tool_events_path=str(path) if path else None,
            has_tool_events=bool(path and path.is_file()),
            cohort=cohort_for(record.get("exact"), record.get("baseline_score"), record.get("best_score")),
        )
        records.append(record)
    return records, f"SQLite fallback: {DB_PATH}"


def parse_timestamp(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def safe_ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def analyze_worker(worker: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    ws_id = str(worker["ws_id"])
    path_value = worker.get("tool_events_path")
    if not path_value and worker.get("artifact_dir"):
        path_value = str(Path(worker["artifact_dir"]) / "tool_events.jsonl")
    path = Path(path_value) if path_value else None
    tool_counts: Counter[str] = Counter()
    errors = 0
    malformed = 0
    timestamps: list[dt.datetime] = []
    build_timestamps: list[dt.datetime] = []
    parse_error: str | None = None

    if path and path.is_file():
        try:
            with path.open(encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    if not line.strip():
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        malformed += 1
                        continue
                    tool = str(event.get("tool") or "<missing>")
                    tool_counts[tool] += 1
                    exit_code = event.get("exit_code")
                    nonzero = isinstance(exit_code, (int, float)) and not isinstance(exit_code, bool) and exit_code != 0
                    if event.get("status") not in (None, "ok", "success") or nonzero:
                        errors += 1
                    created = parse_timestamp(event.get("created_at"))
                    if created:
                        timestamps.append(created)
                        if tool in TOOL_GROUPS["build_compile"]:
                            build_timestamps.append(created)
        except OSError as exc:
            parse_error = f"{type(exc).__name__}: {exc}"

    first = min(timestamps) if timestamps else None
    last = max(timestamps) if timestamps else None
    event_duration = (last - first).total_seconds() / 60 if first and last else None
    time_first_build = (min(build_timestamps) - first).total_seconds() / 60 if first and build_timestamps else None
    group_counts = {
        name: sum(tool_counts[tool] for tool in tools)
        for name, tools in TOOL_GROUPS.items()
    }
    builds = group_counts["build_compile"]
    diffs = group_counts["diff_checkdiff"]
    permuters = group_counts["permuter_mutation"]
    diagnostics = group_counts["diagnostics"]
    result: dict[str, Any] = {
        "worker_id": worker.get("worker_id"),
        "epoch_ordinal": worker.get("epoch_ordinal"),
        "target_key": worker.get("target_key"),
        "cohort": worker.get("cohort") or cohort_for(worker.get("exact"), worker.get("baseline_score"), worker.get("best_score")),
        "tool_events_path": str(path) if path else None,
        "has_tool_events": bool(path and path.is_file()),
        "parse_error": parse_error,
        "malformed_event_lines": malformed,
        "total_calls": sum(tool_counts.values()),
        "tool_counts": dict(sorted(tool_counts.items())),
        "n_distinct_tools": len(tool_counts),
        "error_nonzero_exit_count": errors,
        "first_event_at": first.isoformat().replace("+00:00", "Z") if first else None,
        "last_event_at": last.isoformat().replace("+00:00", "Z") if last else None,
        "event_duration_min": event_duration,
        "group_counts": group_counts,
        "build_invocations": builds,
        "approx_edit_build_diff_loop_count": builds,
        "time_to_first_build_min": time_first_build,
        "ratios": {
            "diff_to_build_ratio": safe_ratio(diffs, builds),
            "permuter_to_build_ratio": safe_ratio(permuters, builds),
            "diagnostics_to_build_ratio": safe_ratio(diagnostics, builds),
            "diff_inspection_to_edit_ratio": None,
        },
    }
    return ws_id, result


def metric_value(record: dict[str, Any], name: str) -> float | int | None:
    if name.startswith("group_") and name.endswith("_calls"):
        return record["group_counts"].get(name[6:-6], 0)
    if name in record.get("ratios", {}):
        return record["ratios"][name]
    return record.get(name)


def finite_values(records: Iterable[dict[str, Any]], metric: str) -> list[float]:
    values: list[float] = []
    for record in records:
        value = metric_value(record, metric)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            values.append(float(value))
    return values


def summarize_numbers(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    summary = {}
    for metric in ALL_METRICS:
        values = finite_values(records, metric)
        summary[metric] = {
            "n": len(values),
            "mean": statistics.fmean(values) if values else None,
            "median": statistics.median(values) if values else None,
        }
    return summary


def tool_prevalence(records: list[dict[str, Any]], vocabulary: list[str]) -> dict[str, dict[str, Any]]:
    denominator = len(records)
    result = {}
    for tool in vocabulary:
        users = sum(record["tool_counts"].get(tool, 0) > 0 for record in records)
        result[tool] = {
            "workers_using": users,
            "workers_total": denominator,
            "prevalence_pct": users * 100 / denominator if denominator else None,
        }
    return result


def aggregate_scope(records: list[dict[str, Any]], vocabulary: list[str]) -> dict[str, Any]:
    return {
        "worker_count": len(records),
        "workers_with_tool_events": sum(record["has_tool_events"] for record in records),
        "workers_with_calls": sum(record["total_calls"] > 0 for record in records),
        "numeric_metrics": summarize_numbers(records),
        "tool_prevalence": tool_prevalence(records, vocabulary),
    }


def fmt(value: Any, digits: int = 2) -> str:
    if value is None:
        return "NA"
    if isinstance(value, int):
        return f"{value:,}"
    return f"{value:,.{digits}f}"


def mean_med(scope: dict[str, Any], metric: str, digits: int = 1) -> str:
    stats = scope["numeric_metrics"][metric]
    return f"{fmt(stats['mean'], digits)} / {fmt(stats['median'], digits)}"


def build_stats(per_worker: dict[str, dict[str, Any]], input_source: str) -> dict[str, Any]:
    records = list(per_worker.values())
    vocabulary_counts: Counter[str] = Counter()
    for record in records:
        vocabulary_counts.update(record["tool_counts"])
    vocabulary = sorted(vocabulary_counts)
    overall = aggregate_scope(records, vocabulary)
    by_cohort = {cohort: aggregate_scope([r for r in records if r["cohort"] == cohort], vocabulary) for cohort in COHORTS}
    epoch_values: list[int | str] = sorted({int(r["epoch_ordinal"]) for r in records if r.get("epoch_ordinal") is not None})
    if any(r.get("epoch_ordinal") is None for r in records):
        epoch_values.append("unknown")
    by_epoch: dict[str, Any] = {}
    for epoch in epoch_values:
        epoch_records = [
            r for r in records
            if (r.get("epoch_ordinal") is None if epoch == "unknown" else r.get("epoch_ordinal") == epoch)
        ]
        by_epoch[str(epoch)] = {
            "overall": aggregate_scope(epoch_records, vocabulary),
            "by_cohort": {
                cohort: aggregate_scope([r for r in epoch_records if r["cohort"] == cohort], vocabulary)
                for cohort in COHORTS
            },
        }
    exact_prev = by_cohort["exact"]["tool_prevalence"]
    near_prev = by_cohort["near_miss"]["tool_prevalence"]
    gaps = []
    for tool in vocabulary:
        exact_pct = exact_prev[tool]["prevalence_pct"] or 0.0
        near_pct = near_prev[tool]["prevalence_pct"] or 0.0
        gaps.append({
            "tool": tool,
            "exact_prevalence_pct": exact_pct,
            "near_miss_prevalence_pct": near_pct,
            "gap_percentage_points": exact_pct - near_pct,
            "absolute_gap_percentage_points": abs(exact_pct - near_pct),
        })
    gaps.sort(key=lambda row: (-row["absolute_gap_percentage_points"], row["tool"]))
    return {
        "metadata": {
            "run_id": RUN_ID,
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
            "input_source": input_source,
            "worker_count": len(records),
            "tool_event_file_count": sum(r["has_tool_events"] for r in records),
            "missing_tool_event_file_count": sum(not r["has_tool_events"] for r in records),
            "parse_error_count": sum(bool(r["parse_error"]) for r in records),
            "malformed_event_line_count": sum(r["malformed_event_lines"] for r in records),
            "edit_ratio_available": False,
            "edit_ratio_note": "tool_events.jsonl contains no general file-edit tool; source_mutation_preview is read-only preview work.",
        },
        "definitions": {
            "tool_groups": {name: sorted(tools) for name, tools in TOOL_GROUPS.items()},
            "build_invocations": "Call count for direct_compile_tu, checkdiff_run, and checkdiff_summary. The checkdiff tools compile internally; this is a call-level loop proxy.",
            "approx_edit_build_diff_loop_count": "Equal to build_invocations, as requested. General edit actions are absent from tool_events.jsonl.",
            "error_nonzero_exit_count": "Events whose status is neither ok/success/null or whose numeric exit_code is nonzero, counted once per event.",
            "event_duration_min": "Elapsed time from the earliest to latest valid event created_at timestamp.",
            "time_to_first_build_min": "Elapsed time from the earliest event to the first build_compile event.",
        },
        "vocabulary": [{"tool": tool, "call_count": vocabulary_counts[tool]} for tool in sorted(vocabulary_counts, key=lambda t: (-vocabulary_counts[t], t))],
        "overall": overall,
        "by_cohort": by_cohort,
        "by_epoch": by_epoch,
        "top_15_exact_near_miss_prevalence_gaps": gaps[:15],
    }


def render_markdown(stats: dict[str, Any]) -> str:
    meta = stats["metadata"]
    lines = [
        "# Phase 1 Tool-Usage Statistics",
        "",
        f"Run `{RUN_ID}`. {meta['worker_count']:,} workers are in the manifest; "
        f"{meta['tool_event_file_count']:,} have `tool_events.jsonl` and {meta['missing_tool_event_file_count']:,} do not.",
        "",
        "## Method",
        "",
        "Each worker is one observation. Means and medians include workers with a present but empty event file as zero-call workers. "
        "Missing event files also remain in the cohort denominator and have zero calls. Duration and time-to-first-build omit workers without valid timestamps or build events.",
        "",
        "`build_invocations` counts `direct_compile_tu`, `checkdiff_run`, and `checkdiff_summary`. Both checkdiff tools compile internally, so this is a call-level proxy for edit-build-diff loop count, not a compiler-process count. "
        "The event stream has no general file-edit tool. `source_mutation_preview` is read-only preview work, so an edit-based ratio would be misleading and is reported as unavailable.",
        "",
        "Tool groups overlap when a call has two roles. In particular, checkdiff calls count in both build and diff groups.",
        "",
        "## Cohort Comparison",
        "",
        "Cells show mean / median per worker.",
        "",
        "| Cohort | Workers | With events | Calls | Tools | Errors | Duration min | Build proxy | First build min |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for cohort, scope in [("all workers", stats["overall"])] + [(name, stats["by_cohort"][name]) for name in COHORTS]:
        lines.append(
            f"| {cohort} | {scope['worker_count']:,} | {scope['workers_with_tool_events']:,} | "
            f"{mean_med(scope, 'total_calls')} | {mean_med(scope, 'n_distinct_tools')} | "
            f"{mean_med(scope, 'error_nonzero_exit_count')} | {mean_med(scope, 'event_duration_min')} | "
            f"{mean_med(scope, 'build_invocations')} | {mean_med(scope, 'time_to_first_build_min')} |"
        )

    lines += [
        "",
        "### Tool-Group Calls and Sequence Ratios",
        "",
        "Cells show mean / median per worker. Ratios omit workers with zero build invocations.",
        "",
        "| Cohort | Diff | Dedicated compile | Permuter/mutation | Knowledge/search | Diagnostics | Diff/build | Permuter/build |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for cohort, scope in [("all workers", stats["overall"])] + [(name, stats["by_cohort"][name]) for name in COHORTS]:
        lines.append(
            f"| {cohort} | {mean_med(scope, 'group_diff_checkdiff_calls')} | "
            f"{mean_med(scope, 'group_dedicated_compile_calls')} | {mean_med(scope, 'group_permuter_mutation_calls')} | "
            f"{mean_med(scope, 'group_knowledge_search_calls')} | {mean_med(scope, 'group_diagnostics_calls')} | "
            f"{mean_med(scope, 'diff_to_build_ratio', 2)} | {mean_med(scope, 'permuter_to_build_ratio', 2)} |"
        )

    exact_metrics = stats["by_cohort"]["exact"]["numeric_metrics"]
    near_metrics = stats["by_cohort"]["near_miss"]["numeric_metrics"]
    lines += [
        "",
        "### Sequence-Level Read",
        "",
        f"Near misses made {fmt(near_metrics['total_calls']['mean'], 1)} calls on average versus "
        f"{fmt(exact_metrics['total_calls']['mean'], 1)} for exact workers. Their median observed event span was "
        f"{fmt(near_metrics['event_duration_min']['median'], 1)} minutes versus {fmt(exact_metrics['event_duration_min']['median'], 1)} minutes.",
        "",
        f"The median diff/build ratio was {fmt(near_metrics['diff_to_build_ratio']['median'], 2)} for near misses and "
        f"{fmt(exact_metrics['diff_to_build_ratio']['median'], 2)} for exact workers. The median permuter/build ratio was "
        f"{fmt(near_metrics['permuter_to_build_ratio']['median'], 2)} versus {fmt(exact_metrics['permuter_to_build_ratio']['median'], 2)}. "
        "These differences are descriptive. Cohort mix, target difficulty, epoch, and missing event files all confound them.",
    ]

    lines += [
        "",
        "## Per-Epoch Cohort Statistics",
        "",
        "Cells show mean / median per worker. Full aggregates for every metric and tool-prevalence values for every epoch appear in `phase1_stats.json`.",
        "",
        "| Epoch | Cohort | Workers | Calls | Errors | Duration min | Build proxy | Diff calls | Permuter calls | First build min |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for epoch, epoch_data in stats["by_epoch"].items():
        for cohort in COHORTS:
            scope = epoch_data["by_cohort"][cohort]
            if not scope["worker_count"]:
                continue
            lines.append(
                f"| {epoch} | {cohort} | {scope['worker_count']:,} | {mean_med(scope, 'total_calls')} | "
                f"{mean_med(scope, 'error_nonzero_exit_count')} | {mean_med(scope, 'event_duration_min')} | "
                f"{mean_med(scope, 'build_invocations')} | {mean_med(scope, 'group_diff_checkdiff_calls')} | "
                f"{mean_med(scope, 'group_permuter_mutation_calls')} | {mean_med(scope, 'time_to_first_build_min')} |"
            )

    lines += [
        "",
        "### Per-Epoch Lookup, Specialist, and Ratio Metrics",
        "",
        "Cells show mean / median per worker.",
        "",
        "| Epoch | Cohort | Graph-related | Past PRs | Knowledge/search | Diagnostics | Lint/review | Diff/build | Permuter/build |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for epoch, epoch_data in stats["by_epoch"].items():
        for cohort in COHORTS:
            scope = epoch_data["by_cohort"][cohort]
            if not scope["worker_count"]:
                continue
            lines.append(
                f"| {epoch} | {cohort} | {mean_med(scope, 'group_graph_related_functions_calls')} | "
                f"{mean_med(scope, 'group_past_prs_search_calls')} | {mean_med(scope, 'group_knowledge_search_calls')} | "
                f"{mean_med(scope, 'group_diagnostics_calls')} | {mean_med(scope, 'group_lint_review_calls')} | "
                f"{mean_med(scope, 'diff_to_build_ratio', 2)} | {mean_med(scope, 'permuter_to_build_ratio', 2)} |"
            )

    lines += [
        "",
        "## Overall Tool Prevalence by Cohort",
        "",
        "Percent of all workers in the cohort with at least one call. Missing event files stay in the denominator.",
        "",
        "| Tool | Exact % | Near miss % | Progressed % | No progress % |",
        "|---|---:|---:|---:|---:|",
    ]
    for vocab_row in stats["vocabulary"]:
        tool = vocab_row["tool"]
        cells = []
        for cohort in COHORTS:
            cells.append(fmt(stats["by_cohort"][cohort]["tool_prevalence"][tool]["prevalence_pct"], 1))
        lines.append(f"| `{tool}` | " + " | ".join(cells) + " |")

    lines += [
        "",
        "## Largest Exact vs Near-Miss Prevalence Gaps",
        "",
        "The gap is exact prevalence minus near-miss prevalence in percentage points. These are associations, not causal estimates.",
        "",
        "| Tool | Exact % | Near miss % | Gap pp | Absolute gap pp |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in stats["top_15_exact_near_miss_prevalence_gaps"]:
        lines.append(
            f"| `{row['tool']}` | {fmt(row['exact_prevalence_pct'], 1)} | "
            f"{fmt(row['near_miss_prevalence_pct'], 1)} | {fmt(row['gap_percentage_points'], 1)} | "
            f"{fmt(row['absolute_gap_percentage_points'], 1)} |"
        )

    lines += [
        "",
        "## Vocabulary",
        "",
        f"{len(stats['vocabulary'])} raw tool names appeared in {sum(r['call_count'] for r in stats['vocabulary']):,} calls.",
        "",
        "| Tool | Calls |",
        "|---|---:|",
    ]
    for row in stats["vocabulary"]:
        lines.append(f"| `{row['tool']}` | {row['call_count']:,} |")
    lines += ["", "## Tool Groups", ""]
    for name, tools in stats["definitions"]["tool_groups"].items():
        lines.append(f"- `{name}`: " + ", ".join(f"`{tool}`" for tool in tools))
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    workers, input_source = load_workers(args.manifest)
    ids = [str(worker["ws_id"]) for worker in workers]
    if len(ids) != len(set(ids)):
        raise ValueError("worker input contains duplicate ws_id values")
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        analyzed = dict(pool.map(analyze_worker, workers))
    per_worker = {ws_id: analyzed[ws_id] for ws_id in sorted(analyzed)}
    stats = build_stats(per_worker, input_source)
    (AUDIT_DIR / "phase1_per_worker.json").write_text(json.dumps(per_worker, indent=2, sort_keys=False) + "\n")
    (AUDIT_DIR / "phase1_stats.json").write_text(json.dumps(stats, indent=2, sort_keys=False) + "\n")
    (AUDIT_DIR / "phase1_stats.md").write_text(render_markdown(stats))
    print(json.dumps({
        "workers": len(per_worker),
        "tool_event_files": stats["metadata"]["tool_event_file_count"],
        "missing_tool_event_files": stats["metadata"]["missing_tool_event_file_count"],
        "total_calls": sum(row["call_count"] for row in stats["vocabulary"]),
        "vocabulary_size": len(stats["vocabulary"]),
        "input_source": input_source,
    }, indent=2))


if __name__ == "__main__":
    main()
