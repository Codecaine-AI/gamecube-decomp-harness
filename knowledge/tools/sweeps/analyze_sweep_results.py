#!/usr/bin/env python3
"""Generate worked/failed analysis and next-sweep planning artifacts."""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


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


@dataclass
class JoinedRow:
    config: dict[str, str]
    result: dict[str, str]

    @property
    def config_id(self) -> str:
        return self.result.get("config_id") or self.config.get("config_id") or ""

    @property
    def family(self) -> str:
        return self.config.get("family") or "unknown"

    @property
    def search_pass(self) -> str:
        return self.config.get("search_pass") or "unknown"

    @property
    def match_percent(self) -> float:
        return as_float(self.result.get("match_percent"), -1.0)

    @property
    def compiled(self) -> bool:
        value = str(self.result.get("compiled", "")).lower()
        return value in {"1", "true", "yes", "y"} or self.match_percent >= 0

    @property
    def mismatch_count(self) -> int:
        return sum(
            as_int(self.result.get(key))
            for key in [
                "instruction_diff_count",
                "arg_mismatch_count",
                "insert_count",
                "delete_count",
                "replace_count",
                "reloc_diff_count",
                "data_diff_count",
            ]
        )

    @property
    def reviewability_score(self) -> int:
        return as_int(self.result.get("reviewability_score"))

    @property
    def neighbor_regressions(self) -> int:
        return as_int(self.result.get("neighbor_regression_count"))

    @property
    def joined_notes(self) -> str:
        return " ".join(
            [
                self.config.get("selection_reason", ""),
                self.config.get("transform_list", ""),
                self.config.get("notes", ""),
                self.result.get("notes", ""),
            ]
        ).lower()


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as fp:
        return list(csv.DictReader(fp))


def write_csv(path: Path, header: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=header)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in header})


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in ("", None):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def as_int(value: Any, default: int = 0) -> int:
    try:
        if value in ("", None):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def join_rows(configs: list[dict[str, str]], results: list[dict[str, str]]) -> list[JoinedRow]:
    by_id = {row.get("config_id", ""): row for row in configs}
    return [JoinedRow(by_id.get(row.get("config_id", ""), {}), row) for row in results]


def baseline_percent(rows: list[JoinedRow]) -> float:
    for row in rows:
        if row.family == "baseline" or row.config_id == "baseline":
            return row.match_percent
    valid = [row.match_percent for row in rows if row.match_percent >= 0]
    return valid[0] if valid else -1.0


def best_rows(rows: list[JoinedRow], limit: int = 5) -> list[JoinedRow]:
    valid = [row for row in rows if row.match_percent >= 0]
    return sorted(
        valid,
        key=lambda row: (
            -row.match_percent,
            row.neighbor_regressions,
            row.reviewability_score,
            row.mismatch_count,
        ),
    )[:limit]


def group_by_family(rows: list[JoinedRow]) -> dict[str, list[JoinedRow]]:
    groups: dict[str, list[JoinedRow]] = defaultdict(list)
    for row in rows:
        groups[row.family].append(row)
    return dict(groups)


def family_summary(rows: list[JoinedRow], baseline: float) -> list[dict[str, Any]]:
    out = []
    for family, items in sorted(group_by_family(rows).items()):
        compiled = [row for row in items if row.compiled and row.match_percent >= 0]
        failed = len(items) - len(compiled)
        if compiled:
            best = max(compiled, key=lambda row: row.match_percent)
            avg = sum(row.match_percent for row in compiled) / len(compiled)
            best_delta = best.match_percent - baseline if baseline >= 0 else 0.0
        else:
            best = None
            avg = 0.0
            best_delta = 0.0
        out.append(
            {
                "family": family,
                "count": len(items),
                "compiled": len(compiled),
                "failed": failed,
                "best_config": best.config_id if best else "",
                "best_percent": best.match_percent if best else "",
                "best_delta": best_delta,
                "avg_percent": avg if compiled else "",
            }
        )
    return out


def classify_effect(row: JoinedRow, baseline: float) -> str:
    delta = row.match_percent - baseline if baseline >= 0 and row.match_percent >= 0 else 0.0
    if not row.compiled:
        return "did not compile"
    if "optimized away" in row.joined_notes or "optimised away" in row.joined_notes:
        return "optimized away; negative evidence for this source-shape lever"
    if row.neighbor_regressions > 0:
        return "improved or changed target but regressed neighbors"
    if as_int(row.result.get("data_diff_count")) or as_int(row.result.get("reloc_diff_count")):
        return "changed relocation/data evidence"
    if delta > 0.05:
        return "improved match percent"
    if delta < -0.05:
        return "worsened match percent"
    if row.mismatch_count == 0:
        return "candidate matches by recorded mismatch metrics"
    return "no material aggregate change"


def evidence_line(row: JoinedRow, baseline: float) -> str:
    delta = row.match_percent - baseline if baseline >= 0 and row.match_percent >= 0 else 0.0
    transform = row.config.get("transform_list", "")
    expected = row.config.get("expected_mismatch_class", "")
    bits = [
        f"`{row.config_id}`",
        f"family `{row.family}`",
        f"{row.match_percent:.3f}%" if row.match_percent >= 0 else "no percent",
        f"delta {delta:+.3f}" if baseline >= 0 and row.match_percent >= 0 else "delta n/a",
        f"mismatches {row.mismatch_count}",
    ]
    if transform:
        bits.append(f"transforms `{transform}`")
    if expected:
        bits.append(f"expected `{expected}`")
    return "- " + "; ".join(bits) + f": {classify_effect(row, baseline)}."


def infer_next_actions(rows: list[JoinedRow], baseline: float) -> list[str]:
    best = best_rows(rows, 1)
    if not best:
        return ["Reproduce baseline and add at least one compiled candidate row."]
    top = best[0]
    actions = []
    if top.family != "unknown":
        actions.append(f"Hold the best `{top.family}` anchor fixed and vary one adjacent source-shape family at a time.")
    if as_int(top.result.get("arg_mismatch_count")) > 0:
        actions.append("Expand local order, temp lifetime, and accessor reuse rows because arg mismatches usually indicate register allocation pressure.")
    if as_int(top.result.get("insert_count")) + as_int(top.result.get("delete_count")) > 0:
        actions.append("Add branch/inline/stack-shape rows because insert/delete mismatches indicate instruction stream shape changes.")
    if as_int(top.result.get("replace_count")) > 0:
        actions.append("Add expression-shape and call/literal checks because replace mismatches are not just register swaps.")
    if as_int(top.result.get("data_diff_count")) + as_int(top.result.get("reloc_diff_count")) > 0:
        actions.append("Route the next pass through TU-sensitive validation before promotion because data or relocation evidence changed.")
    if top.reviewability_score >= 4:
        actions.append("Create cleanup and ablation rows to preserve the gain while reducing reviewability risk.")
    if not actions:
        actions.append("Add ablations and near-misses around the best row to prove which transform caused the gain.")
    return actions


def build_learned_patterns(rows: list[JoinedRow], baseline: float) -> list[dict[str, Any]]:
    patterns = []
    idx = 1
    candidates = best_rows(rows, 8)
    candidates.extend(
        row
        for row in rows
        if ("optimized away" in row.joined_notes or "optimised away" in row.joined_notes)
        and row not in candidates
    )
    for row in candidates:
        delta = row.match_percent - baseline if baseline >= 0 and row.match_percent >= 0 else 0.0
        optimized_away = "optimized away" in row.joined_notes or "optimised away" in row.joined_notes
        if delta <= 0 and row.neighbor_regressions == 0 and row.reviewability_score < 4 and not optimized_away:
            continue
        effect = classify_effect(row, baseline)
        next_action = infer_next_actions([row], baseline)[0]
        patterns.append(
            {
                "pattern_id": f"lp_{idx:03d}",
                "search_pass": row.search_pass,
                "family": row.family,
                "observation": row.config.get("selection_reason") or row.config.get("transform_list") or "candidate changed measured codegen",
                "evidence_configs": row.config_id,
                "effect": effect,
                "next_action": next_action,
                "confidence": "medium" if delta > 0 else "low",
                "notes": row.result.get("notes", ""),
            }
        )
        idx += 1
    return patterns


def markdown_report(rows: list[JoinedRow], baseline: float) -> str:
    lines = ["# Sweep Analysis", ""]
    if not rows:
        lines.extend(["No sweep results are recorded yet.", ""])
        return "\n".join(lines)

    best = best_rows(rows, 5)
    compiled_count = sum(1 for row in rows if row.compiled)
    lines.extend(
        [
            "## Summary",
            "",
            f"- Candidates evaluated: {len(rows)}",
            f"- Compiled candidates: {compiled_count}",
            f"- Baseline: {baseline:.3f}%" if baseline >= 0 else "- Baseline: unknown",
            f"- Best: `{best[0].config_id}` at {best[0].match_percent:.3f}%" if best else "- Best: unknown",
            "",
            "## What Worked",
            "",
        ]
    )
    improvers = [row for row in best if baseline < 0 or row.match_percent > baseline]
    if improvers:
        lines.extend(evidence_line(row, baseline) for row in improvers)
    else:
        lines.append("- No candidate materially improved match percent yet.")

    lines.extend(["", "## What Failed Or Was Optimized Away", ""])
    failed = [
        row
        for row in rows
        if (not row.compiled)
        or (baseline >= 0 and row.match_percent < baseline)
        or row.neighbor_regressions > 0
        or row.reviewability_score >= 4
        or "optimized away" in row.joined_notes
        or "optimised away" in row.joined_notes
    ]
    if failed:
        for row in sorted(failed, key=lambda r: (r.compiled, -r.neighbor_regressions, -r.reviewability_score))[:10]:
            lines.append(evidence_line(row, baseline))
    else:
        lines.append("- No compile failures, regressions, or high-risk reviewability rows are recorded yet.")

    lines.extend(["", "## Family-Level Readout", ""])
    for item in family_summary(rows, baseline):
        lines.append(
            f"- `{item['family']}`: {item['compiled']}/{item['count']} compiled, "
            f"best `{item['best_config'] or 'n/a'}` {item['best_percent'] or 'n/a'} "
            f"(delta {as_float(item['best_delta']):+.3f})."
        )

    lines.extend(["", "## Next-Sweep Hypotheses", ""])
    for action in infer_next_actions(rows, baseline):
        lines.append(f"- {action}")
    lines.append("")
    return "\n".join(lines)


def next_plan(rows: list[JoinedRow], baseline: float) -> str:
    actions = infer_next_actions(rows, baseline)
    best = best_rows(rows, 1)
    fixed = best[0].config_id if best else "baseline"
    lines = [
        "# Next Sweep Plan",
        "",
        "## Fixed Anchors",
        "",
        f"- Keep `{fixed}` as the comparison anchor.",
        "",
        "## Families To Expand",
        "",
    ]
    for action in actions:
        lines.append(f"- {action}")
    lines.extend(
        [
            "",
            "## Families To Suppress",
            "",
            "- Suppress rows that failed to compile, only added stack traffic, or carried high reviewability risk without measurable gain.",
            "",
            "## Required Ablations",
            "",
            "- For each next finalist, add one row that removes the suspected useful transform and one row that preserves it with lower reviewability risk.",
            "",
            "## Stop Conditions",
            "",
            "- Stop a family after 4-5 compiled variants with no score, mismatch-class, or reviewability improvement.",
            "- Reroute to TU-sensitive validation if data, relocation, header, static, or pragma evidence changes.",
            "",
        ]
    )
    return "\n".join(lines)


def seed_rows(rows: list[JoinedRow], baseline: float) -> list[dict[str, str]]:
    seeds = []
    for row in best_rows(rows, 3):
        seeds.append(
            {
                "config_id": f"{row.config_id}__next_ablate",
                "symbol": row.config.get("symbol") or row.result.get("symbol", ""),
                "family": row.family,
                "subfamily": "ablation",
                "search_pass": "next_seed",
                "parent_config_id": row.config_id,
                "posture": "diagnostic",
                "transform_list": "remove_one_promising_transform",
                "expected_mismatch_class": row.config.get("expected_mismatch_class", ""),
                "reviewability_risk": row.config.get("reviewability_risk", "medium"),
                "allowed_to_promote": "false",
                "selection_reason": "Ablate best prior row to prove which transform mattered",
                "notes": "",
            }
        )
    return seeds


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()

    artifacts = args.run_dir / "artifacts"
    analysis_dir = artifacts / "analysis"
    analysis_dir.mkdir(parents=True, exist_ok=True)

    configs = read_csv(artifacts / "config_matrix.csv")
    results = read_csv(artifacts / "sweep_results.csv")
    rows = join_rows(configs, results)
    baseline = baseline_percent(rows)

    (analysis_dir / "sweep_analysis.md").write_text(markdown_report(rows, baseline), encoding="utf-8")
    (analysis_dir / "next_sweep_plan.md").write_text(next_plan(rows, baseline), encoding="utf-8")
    write_csv(artifacts / "learned_patterns.csv", LEARNED_PATTERNS_HEADER, build_learned_patterns(rows, baseline))
    write_csv(analysis_dir / "next_config_seeds.csv", CONFIG_MATRIX_HEADER, seed_rows(rows, baseline))

    print(f"Wrote analysis artifacts to {analysis_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
