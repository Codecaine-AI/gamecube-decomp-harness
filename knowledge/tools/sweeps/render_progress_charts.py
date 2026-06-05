#!/usr/bin/env python3
"""Render dependency-free SVG charts for a decomp run."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any


WIDTH = 760
HEIGHT = 360
PAD = 48


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as fp:
        return list(csv.DictReader(fp))


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


def svg_doc(title: str, body: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="{PAD}" y="28" font-family="Arial, sans-serif" font-size="18" fill="#111827">{title}</text>
{body}
</svg>
"""


def placeholder(title: str, message: str) -> str:
    body = f"""
<rect x="{PAD}" y="{PAD}" width="{WIDTH - 2 * PAD}" height="{HEIGHT - 2 * PAD}" fill="#f9fafb" stroke="#d1d5db"/>
<text x="{WIDTH / 2}" y="{HEIGHT / 2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#6b7280">{message}</text>
"""
    return svg_doc(title, body)


def axes(y_min: float, y_max: float, x_label: str, y_label: str) -> str:
    plot_w = WIDTH - 2 * PAD
    plot_h = HEIGHT - 2 * PAD
    return f"""
<line x1="{PAD}" y1="{HEIGHT - PAD}" x2="{WIDTH - PAD}" y2="{HEIGHT - PAD}" stroke="#374151"/>
<line x1="{PAD}" y1="{PAD}" x2="{PAD}" y2="{HEIGHT - PAD}" stroke="#374151"/>
<text x="{WIDTH / 2}" y="{HEIGHT - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#374151">{x_label}</text>
<text x="16" y="{HEIGHT / 2}" transform="rotate(-90 16 {HEIGHT / 2})" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#374151">{y_label}</text>
<text x="{PAD - 8}" y="{HEIGHT - PAD + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">{y_min:.2f}</text>
<text x="{PAD - 8}" y="{PAD + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">{y_max:.2f}</text>
<rect x="{PAD}" y="{PAD}" width="{plot_w}" height="{plot_h}" fill="none" stroke="#e5e7eb"/>
"""


def scale_points(values: list[float]) -> list[tuple[float, float]]:
    if not values:
        return []
    y_min = min(values)
    y_max = max(values)
    if y_min == y_max:
        y_min -= 0.5
        y_max += 0.5
    plot_w = WIDTH - 2 * PAD
    plot_h = HEIGHT - 2 * PAD
    denom_x = max(1, len(values) - 1)
    points = []
    for idx, value in enumerate(values):
        x = PAD + (idx / denom_x) * plot_w
        y = HEIGHT - PAD - ((value - y_min) / (y_max - y_min)) * plot_h
        points.append((x, y))
    return points


def accuracy_chart(rows: list[dict[str, str]]) -> str:
    values = [as_float(row.get("match_percent"), -1) for row in rows if as_float(row.get("match_percent"), -1) >= 0]
    if not values:
        return placeholder("Accuracy Progress", "No sweep results yet")
    points = scale_points(values)
    best = []
    cur = values[0]
    for value in values:
        cur = max(cur, value)
        best.append(cur)
    best_points = scale_points(best)
    y_min = min(values + best)
    y_max = max(values + best)
    if y_min == y_max:
        y_min -= 0.5
        y_max += 0.5
    path = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    best_path = " ".join(f"{x:.1f},{y:.1f}" for x, y in best_points)
    body = axes(y_min, y_max, "candidate order", "match percent")
    body += f'<polyline points="{path}" fill="none" stroke="#2563eb" stroke-width="2"/>\n'
    body += f'<polyline points="{best_path}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 4"/>\n'
    for x, y in points:
        body += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#2563eb"/>\n'
    body += f'<text x="{WIDTH - PAD}" y="{PAD - 12}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#16a34a">best {max(best):.2f}%</text>\n'
    return svg_doc("Accuracy Progress", body)


def mismatch_count(row: dict[str, str]) -> int:
    keys = [
        "instruction_diff_count",
        "arg_mismatch_count",
        "insert_count",
        "delete_count",
        "replace_count",
        "reloc_diff_count",
        "data_diff_count",
    ]
    return sum(as_int(row.get(key)) for key in keys)


def pareto_chart(rows: list[dict[str, str]]) -> str:
    points = []
    for row in rows:
        match = as_float(row.get("match_percent"), -1)
        if match < 0:
            continue
        mismatch = as_float(row.get("mismatch_count"), -1)
        if mismatch < 0:
            mismatch = mismatch_count(row)
        selected = str(row.get("selected_for_validation", "")).lower() in {"1", "true", "yes", "y"}
        points.append((mismatch, match, selected))
    if not points:
        return placeholder("Pareto Frontier", "No frontier rows yet")
    x_vals = [p[0] for p in points]
    y_vals = [p[1] for p in points]
    x_min, x_max = min(x_vals), max(x_vals)
    y_min, y_max = min(y_vals), max(y_vals)
    if x_min == x_max:
        x_min -= 1
        x_max += 1
    if y_min == y_max:
        y_min -= 0.5
        y_max += 0.5
    plot_w = WIDTH - 2 * PAD
    plot_h = HEIGHT - 2 * PAD
    body = axes(y_min, y_max, "mismatch count", "match percent")
    for mismatch, match, selected in points:
        x = PAD + ((mismatch - x_min) / (x_max - x_min)) * plot_w
        y = HEIGHT - PAD - ((match - y_min) / (y_max - y_min)) * plot_h
        color = "#dc2626" if selected else "#7c3aed"
        radius = 5 if selected else 3
        body += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{radius}" fill="{color}" opacity="0.85"/>\n'
    body += f'<text x="{PAD}" y="{PAD - 12}" font-family="Arial, sans-serif" font-size="12" fill="#dc2626">red = selected</text>\n'
    return svg_doc("Pareto Frontier", body)


def mismatch_chart(rows: list[dict[str, str]]) -> str:
    scored = [row for row in rows if as_float(row.get("match_percent"), -1) >= 0]
    if not scored:
        return placeholder("Mismatch Classes", "No mismatch rows yet")
    best_row = max(scored, key=lambda row: (as_float(row.get("match_percent")), -mismatch_count(row)))
    classes = [
        ("arg", as_int(best_row.get("arg_mismatch_count"))),
        ("insert", as_int(best_row.get("insert_count"))),
        ("delete", as_int(best_row.get("delete_count"))),
        ("replace", as_int(best_row.get("replace_count"))),
        ("reloc", as_int(best_row.get("reloc_diff_count"))),
        ("data", as_int(best_row.get("data_diff_count"))),
    ]
    max_value = max([value for _, value in classes] + [1])
    plot_w = WIDTH - 2 * PAD
    plot_h = HEIGHT - 2 * PAD
    bar_w = plot_w / len(classes) * 0.65
    body = axes(0, max_value, "mismatch class", "count")
    for idx, (label, value) in enumerate(classes):
        x = PAD + (idx + 0.2) * (plot_w / len(classes))
        h = (value / max_value) * plot_h
        y = HEIGHT - PAD - h
        body += f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{h:.1f}" fill="#f59e0b"/>\n'
        body += f'<text x="{x + bar_w / 2:.1f}" y="{HEIGHT - PAD + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#374151">{label}</text>\n'
        body += f'<text x="{x + bar_w / 2:.1f}" y="{y - 6:.1f}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#374151">{value}</text>\n'
    body += f'<text x="{WIDTH - PAD}" y="{PAD - 12}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#374151">best candidate snapshot</text>\n'
    return svg_doc("Mismatch Classes", body)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()

    artifacts = args.run_dir / "artifacts"
    charts = artifacts / "charts"
    charts.mkdir(parents=True, exist_ok=True)

    sweep_rows = read_csv(artifacts / "sweep_results.csv")
    pareto_rows = read_csv(artifacts / "pareto_frontier.csv") or sweep_rows

    (charts / "accuracy_progress.svg").write_text(accuracy_chart(sweep_rows), encoding="utf-8")
    (charts / "pareto_frontier.svg").write_text(pareto_chart(pareto_rows), encoding="utf-8")
    (charts / "mismatch_classes.svg").write_text(mismatch_chart(sweep_rows), encoding="utf-8")

    print(f"Wrote charts to {charts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
