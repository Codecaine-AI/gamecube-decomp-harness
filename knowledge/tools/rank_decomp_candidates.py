#!/usr/bin/env python3
"""Rank high-ROI doldecomp/melee decomp targets from an objdiff report."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


DEFAULT_REPORT = Path("build/GALE01/report.json")


def as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def load_report(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)
    if not isinstance(data, dict) or "units" not in data:
        raise ValueError(f"{path} does not look like an objdiff report")
    return data


def unit_unmatched_functions(unit: dict[str, Any], min_size: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for func in unit.get("functions", []):
        size = as_int(func.get("size"))
        fuzzy = as_float(func.get("fuzzy_match_percent"), 100.0)
        if size >= min_size and fuzzy < 100.0:
            rows.append(func)
    return rows


def reason_for(size: int, fuzzy: float, blocker_count: int) -> str:
    reasons: list[str] = []
    if fuzzy >= 97.0 and size >= 512:
        reasons.append("large near-match")
    elif fuzzy >= 95.0:
        reasons.append("tractable near-match")
    elif fuzzy >= 70.0 and size >= 512:
        reasons.append("large fuzzy source-shape target")
    elif size >= 1024:
        reasons.append("large logic-recovery target")
    else:
        reasons.append("moderate fuzzy target")

    if blocker_count <= 3:
        reasons.append("linked-unit blocker secondary")
    if fuzzy >= 98.5 and size <= 256:
        reasons.append("small near-match grind risk")
    if size < 64:
        reasons.append("tiny target")
    return "; ".join(reasons)


def function_score(size: int, fuzzy: float, blocker_count: int) -> float:
    closeness = max(0.0, min(fuzzy / 100.0, 1.0))
    score = size * (0.15 + closeness**3)

    # Linked progress is useful, but secondary to exact matched-code progress.
    if blocker_count <= 3:
        score *= 1.12

    # Avoid letting tiny one-instruction grinds dominate just because they are 99% fuzzy.
    if fuzzy >= 98.5 and size <= 256:
        score *= 0.55
    elif size < 64:
        score *= 0.6

    return score


def collect_function_candidates(
    report: dict[str, Any], min_size: int, max_fuzzy: float
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for unit in report.get("units", []):
        unit_name = unit.get("name", "")
        measures = unit.get("measures", {})
        blockers = unit_unmatched_functions(unit, min_size=1)
        blocker_count = len(blockers)
        for func in unit.get("functions", []):
            size = as_int(func.get("size"))
            fuzzy = as_float(func.get("fuzzy_match_percent"), 100.0)
            if size < min_size or fuzzy >= 100.0 or fuzzy > max_fuzzy:
                continue
            missing_est = size * (100.0 - fuzzy) / 100.0
            score = function_score(size, fuzzy, blocker_count)
            candidates.append(
                {
                    "score": round(score, 2),
                    "function": func.get("name", ""),
                    "unit": unit_name,
                    "size": size,
                    "fuzzy": round(fuzzy, 4),
                    "estimated_diff_bytes": round(missing_est, 2),
                    "unit_fuzzy": round(as_float(measures.get("fuzzy_match_percent")), 4),
                    "unit_matched_percent": round(
                        as_float(measures.get("matched_code_percent")), 4
                    ),
                    "unit_blockers": blocker_count,
                    "address": func.get("metadata", {}).get("virtual_address", ""),
                    "reason": reason_for(size, fuzzy, blocker_count),
                }
            )
    return sorted(candidates, key=lambda row: row["score"], reverse=True)


def unit_score(unit: dict[str, Any], blockers: list[dict[str, Any]]) -> float:
    measures = unit.get("measures", {})
    total_code = as_int(measures.get("total_code"))
    fuzzy = as_float(measures.get("fuzzy_match_percent"))
    matched = as_float(measures.get("matched_code_percent"))
    blocker_count = len(blockers)
    blocker_size = sum(as_int(func.get("size")) for func in blockers)
    if blocker_count == 0:
        return 0.0
    score = math.sqrt(max(total_code, 1)) * (fuzzy / 100.0) * (matched / 100.0)
    score *= 1.0 / blocker_count
    if blocker_size <= 256 and fuzzy >= 98.5:
        score *= 0.7
    return score


def collect_linked_blocker_units(
    report: dict[str, Any], max_blockers: int, min_unit_fuzzy: float
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for unit in report.get("units", []):
        measures = unit.get("measures", {})
        blockers = unit_unmatched_functions(unit, min_size=1)
        if not blockers or len(blockers) > max_blockers:
            continue
        unit_fuzzy = as_float(measures.get("fuzzy_match_percent"))
        if unit_fuzzy < min_unit_fuzzy:
            continue
        blocker_names = ", ".join(
            f"{func.get('name')}:{as_int(func.get('size'))}@"
            f"{as_float(func.get('fuzzy_match_percent')):.2f}%"
            for func in blockers[:5]
        )
        rows.append(
            {
                "score": round(unit_score(unit, blockers), 2),
                "unit": unit.get("name", ""),
                "total_code": as_int(measures.get("total_code")),
                "unit_fuzzy": round(unit_fuzzy, 4),
                "unit_matched_percent": round(
                    as_float(measures.get("matched_code_percent")), 4
                ),
                "blockers": len(blockers),
                "blocker_size": sum(as_int(func.get("size")) for func in blockers),
                "blocker_functions": blocker_names,
            }
        )
    return sorted(rows, key=lambda row: row["score"], reverse=True)


def report_summary(report: dict[str, Any]) -> dict[str, Any]:
    measures = report.get("measures", {})
    return {
        "fuzzy_match_percent": round(as_float(measures.get("fuzzy_match_percent")), 4),
        "matched_code_percent": round(as_float(measures.get("matched_code_percent")), 4),
        "complete_code_percent": round(as_float(measures.get("complete_code_percent")), 4),
        "total_code": as_int(measures.get("total_code")),
        "matched_code": as_int(measures.get("matched_code")),
        "complete_code": as_int(measures.get("complete_code")),
        "total_functions": as_int(measures.get("total_functions")),
        "matched_functions": as_int(measures.get("matched_functions")),
        "total_units": as_int(measures.get("total_units")),
        "complete_units": as_int(measures.get("complete_units")),
    }


def print_table(title: str, rows: list[dict[str, Any]], columns: list[str]) -> None:
    print(f"\n## {title}")
    if not rows:
        print("\nNo rows.")
        return
    widths = {
        column: max(len(column), *(len(str(row.get(column, ""))) for row in rows))
        for column in columns
    }
    header = "  ".join(column.ljust(widths[column]) for column in columns)
    rule = "  ".join("-" * widths[column] for column in columns)
    print(header)
    print(rule)
    for row in rows:
        print("  ".join(str(row.get(column, "")).ljust(widths[column]) for column in columns))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--min-size", type=int, default=32)
    parser.add_argument("--max-fuzzy", type=float, default=99.9999)
    parser.add_argument("--max-blockers", type=int, default=3)
    parser.add_argument("--min-unit-fuzzy", type=float, default=95.0)
    parser.add_argument("--mode", choices=["both", "functions", "units"], default="both")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    report = load_report(args.report)
    summary = report_summary(report)
    functions = collect_function_candidates(report, args.min_size, args.max_fuzzy)
    units = collect_linked_blocker_units(
        report, args.max_blockers, args.min_unit_fuzzy
    )

    payload = {
        "summary": summary,
        "function_candidates": functions[: args.limit],
        "linked_blocker_units": units[: args.limit],
    }

    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    print("# Decomp Candidate Ranking")
    print(
        "\nSummary: "
        f"{summary['fuzzy_match_percent']}% fuzzy, "
        f"{summary['matched_code_percent']}% matched, "
        f"{summary['complete_code_percent']}% linked; "
        f"{summary['matched_functions']} / {summary['total_functions']} functions matched."
    )

    if args.mode in {"both", "functions"}:
        print_table(
            "function_candidates",
            functions[: args.limit],
            [
                "score",
                "function",
                "size",
                "fuzzy",
                "unit_blockers",
                "estimated_diff_bytes",
                "unit",
                "reason",
            ],
        )

    if args.mode in {"both", "units"}:
        print_table(
            "linked_blocker_units",
            units[: args.limit],
            [
                "score",
                "unit",
                "total_code",
                "unit_fuzzy",
                "unit_matched_percent",
                "blockers",
                "blocker_size",
                "blocker_functions",
            ],
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
