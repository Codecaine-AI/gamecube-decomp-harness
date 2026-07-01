#!/usr/bin/env python3
"""Calibrate OPSEC/opseq and model gates against exact-match outcomes.

This is analysis-only. It reads a queue/priority outcome dataset, attaches
current epoch ordinals from the orchestrator database when possible, and scans
single-feature, pairwise, and top-k gates. The goal is to show whether any gate
can honestly support an 80% exact-match likelihood before it is wired into the
scheduler.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "projects/melee/state/orchestrator.sqlite"
DEFAULT_OUT = ROOT / "analysis/reports/opseq-gate-calibration"
TARGET_EXACT_RATE = 0.80
DEFAULT_MIN_SUPPORT = 5
TOP_K_VALUES = [4, 8, 16, 32, 64]

FEATURES: dict[str, dict[str, Any]] = {
    "hgb_exact": {"column": "pred_hist_gradient_boost_exact", "directions": [">="]},
    "logistic_exact": {"column": "pred_logistic_exact", "directions": [">="]},
    "hgb_value": {"column": "pred_hist_gradient_boost_value", "directions": [">="]},
    "logistic_value": {"column": "pred_logistic_value", "directions": [">="]},
    "opseq_best_matched": {"column": "opseq_best_matched_analog_score", "directions": [">="]},
    "opseq_best": {"column": "opseq_best_analog_score", "directions": [">="]},
    "opseq_matched_ratio": {"column": "opseq_matched_analog_ratio", "directions": [">="]},
    "opseq_matched_count": {"column": "opseq_matched_analog_count", "directions": [">="]},
    "opseq_high_matched_65": {"column": "opseq_high_matched_score_65_count", "directions": [">="]},
    "opseq_exact_analogs": {"column": "opseq_exact_analog_count", "directions": [">="]},
    "prior_source_exact": {"column": "prior_source_exact_rate", "directions": [">="]},
    "prior_target_exact": {"column": "prior_target_exact_rate", "directions": [">="]},
    "prior_target_trials": {"column": "prior_target_trials", "directions": ["<=", ">="]},
    "fuzzy": {"column": "fuzzy", "directions": [">="]},
    "gap_to_exact": {"column": "gap_to_exact", "directions": ["<="]},
    "size": {"column": "size", "directions": ["<="]},
    "closeness": {"column": "closeness_score", "directions": [">=", "<="]},
    "high_accuracy_bonus": {"column": "high_accuracy_bonus", "directions": [">=", "<="]},
}

PREDICATES: dict[str, tuple[str, str, float]] = {
    "model_exact_high": ("pred_hist_gradient_boost_exact", ">=", 0.20),
    "model_value_high": ("pred_hist_gradient_boost_value", ">=", 1.00),
    "opseq_best_matched_065": ("opseq_best_matched_analog_score", ">=", 0.65),
    "opseq_best_matched_080": ("opseq_best_matched_analog_score", ">=", 0.80),
    "opseq_ratio_090": ("opseq_matched_analog_ratio", ">=", 0.90),
    "opseq_dense_matched": ("opseq_matched_analog_count", ">=", 10.00),
    "small_500": ("size", "<=", 500.00),
    "small_800": ("size", "<=", 800.00),
    "high_fuzzy_99": ("fuzzy", ">=", 99.00),
    "tiny_gap_02": ("gap_to_exact", "<=", 0.20),
    "source_exact_history_020": ("prior_source_exact_rate", ">=", 0.20),
    "target_no_prior": ("prior_target_trials", "<=", 0.00),
}

SCORE_COLUMNS = [
    "pred_hist_gradient_boost_exact",
    "pred_logistic_exact",
    "pred_hist_gradient_boost_value",
    "pred_logistic_value",
    "opseq_best_matched_analog_score",
    "opseq_matched_analog_ratio",
    "opseq_high_matched_score_65_count",
    "prior_source_exact_rate",
    "priority",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def json_dumps(value: Any) -> str:
    return json.dumps(to_jsonable(value), indent=2, sort_keys=True)


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [to_jsonable(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def pct(numerator: float, denominator: float, digits: int = 1) -> float | None:
    if denominator <= 0:
        return None
    return round((100.0 * numerator) / denominator, digits)


def round_or_none(value: Any, digits: int = 4) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return round(number, digits)


def wilson_lower_bound(successes: int, total: int, z: float = 1.96) -> float | None:
    if total <= 0:
        return None
    p = successes / total
    denom = 1 + z * z / total
    centre = p + z * z / (2 * total)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return (centre - margin) / denom


def latest_priority_dataset() -> Path:
    candidates = sorted((ROOT / "analysis/reports").glob("q-priority-outcome-analysis-*.dataset.csv"))
    if not candidates:
        raise FileNotFoundError("No q-priority outcome dataset found under analysis/reports.")
    return candidates[-1]


def bool_series(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series
    return series.astype(str).str.lower().isin(["true", "1", "yes"])


def load_epoch_map(db_path: Path) -> pd.DataFrame:
    if not db_path.exists():
        return pd.DataFrame(columns=["record_id", "epoch_ordinal"])
    conn = sqlite3.connect(str(db_path))
    try:
        return pd.read_sql_query(
            """
            SELECT ws.id AS record_id, e.ordinal AS epoch_ordinal
            FROM worker_state ws
            JOIN epochs e ON e.id = ws.epoch_id
            """,
            conn,
        )
    finally:
        conn.close()


def load_dataset(path: Path, db_path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    if "record_id" in df:
        df["record_id"] = df["record_id"].astype(str)
        epoch_map = load_epoch_map(db_path)
        if not epoch_map.empty:
            epoch_map["record_id"] = epoch_map["record_id"].astype(str)
            df = df.merge(epoch_map, on="record_id", how="left")
    for column in ["exact", "improved", "observed", "validated", "end_to_end_model_row", "validated_model_row"]:
        if column in df:
            df[column] = bool_series(df[column])
    for column in ["prior_target_trials", *[spec["column"] for spec in FEATURES.values()], *SCORE_COLUMNS]:
        if column in df and not pd.api.types.is_numeric_dtype(df[column]):
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def scopes(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    base = df[df.get("end_to_end_model_row", pd.Series(False, index=df.index))].copy()
    prior_target_trials = pd.to_numeric(base.get("prior_target_trials", pd.Series(np.nan, index=base.index)), errors="coerce").fillna(0)
    result = {
        "all_model_rows": base,
        "new_target_model_rows": base[prior_target_trials <= 0].copy(),
    }
    if "run_id" in df:
        xhigh_run = df[(df["run_id"].astype(str) == "53d5b342-c066-48fc-aa49-dd78b69dc2ac") & (df["dataset_type"].astype(str) == "modern_worker")].copy()
        result["xhigh_run_all_modern"] = xhigh_run
        xhigh_prior_trials = pd.to_numeric(xhigh_run.get("prior_target_trials", pd.Series(np.nan, index=xhigh_run.index)), errors="coerce").fillna(0)
        result["xhigh_run_new_target"] = xhigh_run[xhigh_prior_trials <= 0].copy()
    if "epoch_ordinal" in df:
        result["xhigh_epochs_20_21"] = df[df["epoch_ordinal"].isin([20, 21])].copy()
        result["xhigh_epochs_20_22_snapshot"] = df[df["epoch_ordinal"].isin([20, 21, 22])].copy()
    return {key: value for key, value in result.items() if len(value) > 0}


def evaluate_mask(scope_name: str, df: pd.DataFrame, mask: pd.Series, label: str, kind: str) -> dict[str, Any] | None:
    clean_mask = mask.reindex(df.index, fill_value=False).fillna(False).astype(bool)
    selected = df[clean_mask]
    n = len(selected)
    if n <= 0:
        return None
    exact = int(selected["exact"].sum())
    improved = int(selected["improved"].sum())
    exact_rate = exact / n
    improved_rate = improved / n
    base_exact = float(df["exact"].mean() or 0)
    base_improved = float(df["improved"].mean() or 0)
    return {
        "scope": scope_name,
        "kind": kind,
        "gate": label,
        "rows": n,
        "coverage_pct": pct(n, len(df)),
        "exact": exact,
        "exact_rate_pct": pct(exact, n),
        "exact_lift": round_or_none(exact_rate / base_exact, 3) if base_exact else None,
        "exact_wilson_lcb_pct": pct(wilson_lower_bound(exact, n) or 0, 1),
        "improved": improved,
        "improved_rate_pct": pct(improved, n),
        "improved_lift": round_or_none(improved_rate / base_improved, 3) if base_improved else None,
        "base_exact_rate_pct": pct(float(df["exact"].sum()), len(df)),
        "base_improved_rate_pct": pct(float(df["improved"].sum()), len(df)),
        "meets_raw_80": exact_rate >= TARGET_EXACT_RATE,
    }


def thresholds_for(series: pd.Series) -> list[float]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return []
    quantiles = np.linspace(0, 1, 41)
    values = set(float(value) for value in np.nanquantile(clean, quantiles))
    unique = sorted(float(value) for value in clean.unique())
    values.update(unique[:5])
    values.update(unique[-5:])
    return sorted(value for value in values if math.isfinite(value))


def scan_single_feature(scope_name: str, df: pd.DataFrame, min_support: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for name, spec in FEATURES.items():
        column = spec["column"]
        if column not in df:
            continue
        series = pd.to_numeric(df[column], errors="coerce")
        if series.notna().sum() < min_support:
            continue
        for threshold in thresholds_for(series):
            for direction in spec["directions"]:
                mask = series >= threshold if direction == ">=" else series <= threshold
                if int(mask.sum()) < min_support:
                    continue
                label = f"{name} {direction} {threshold:.5g}"
                row = evaluate_mask(scope_name, df, mask, label, "single_feature")
                if row:
                    row.update({"feature": name, "direction": direction, "threshold": threshold})
                    rows.append(row)
    return rows


def predicate_mask(df: pd.DataFrame, predicate: tuple[str, str, float]) -> pd.Series:
    column, direction, threshold = predicate
    if column not in df:
        return pd.Series(False, index=df.index)
    series = pd.to_numeric(df[column], errors="coerce")
    return series >= threshold if direction == ">=" else series <= threshold


def scan_pairwise(scope_name: str, df: pd.DataFrame, min_support: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    items = list(PREDICATES.items())
    for index, (left_name, left_predicate) in enumerate(items):
        left_mask = predicate_mask(df, left_predicate)
        left_label = predicate_label(left_name, left_predicate)
        row = evaluate_mask(scope_name, df, left_mask, left_label, "predicate")
        if row and row["rows"] >= min_support:
            rows.append(row)
        for right_name, right_predicate in items[index + 1 :]:
            mask = left_mask & predicate_mask(df, right_predicate)
            if int(mask.sum()) < min_support:
                continue
            label = f"{left_label} AND {predicate_label(right_name, right_predicate)}"
            row = evaluate_mask(scope_name, df, mask, label, "pairwise_predicate")
            if row:
                rows.append(row)
    return rows


def predicate_label(name: str, predicate: tuple[str, str, float]) -> str:
    column, direction, threshold = predicate
    return f"{name} ({column} {direction} {threshold:g})"


def top_k_scan(scope_name: str, df: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for column in SCORE_COLUMNS:
        if column not in df:
            continue
        scoped = df[pd.to_numeric(df[column], errors="coerce").notna()].copy()
        if scoped.empty:
            continue
        scoped[column] = pd.to_numeric(scoped[column], errors="coerce")
        ordered = scoped.sort_values(column, ascending=False)
        for k in TOP_K_VALUES:
            if len(ordered) < k:
                continue
            mask = pd.Series(False, index=scoped.index)
            mask.loc[ordered.head(k).index] = True
            row = evaluate_mask(scope_name, scoped, mask, f"top {k} by {column}", "top_k")
            if row:
                row["score_column"] = column
                row["k"] = k
                rows.append(row)
    if "epoch_ordinal" in df:
        for epoch, group in df.dropna(subset=["epoch_ordinal"]).groupby("epoch_ordinal"):
            if len(group) < 4:
                continue
            for column in SCORE_COLUMNS:
                if column not in group:
                    continue
                scoped = group[pd.to_numeric(group[column], errors="coerce").notna()].copy()
                if scoped.empty:
                    continue
                scoped[column] = pd.to_numeric(scoped[column], errors="coerce")
                ordered = scoped.sort_values(column, ascending=False)
                for k in TOP_K_VALUES:
                    if len(ordered) < k:
                        continue
                    mask = pd.Series(False, index=scoped.index)
                    mask.loc[ordered.head(k).index] = True
                    row = evaluate_mask(
                        f"{scope_name}:epoch_{int(epoch)}",
                        scoped,
                        mask,
                        f"top {k} by {column}",
                        "top_k_epoch",
                    )
                    if row:
                        row["score_column"] = column
                        row["k"] = k
                        row["epoch"] = int(epoch)
                        rows.append(row)
    return rows


def sort_gate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (
            bool(row.get("meets_raw_80")),
            float(row.get("exact_rate_pct") or 0),
            float(row.get("exact_wilson_lcb_pct") or 0),
            int(row.get("rows") or 0),
        ),
        reverse=True,
    )


def scope_summary(name: str, df: pd.DataFrame) -> dict[str, Any]:
    return {
        "scope": name,
        "rows": len(df),
        "exact": int(df["exact"].sum()),
        "exact_rate_pct": pct(float(df["exact"].sum()), len(df)),
        "improved": int(df["improved"].sum()),
        "improved_rate_pct": pct(float(df["improved"].sum()), len(df)),
        "validated": int(df["validated"].sum()) if "validated" in df else None,
        "target_no_prior_rows": int((pd.to_numeric(df.get("prior_target_trials", pd.Series(np.nan, index=df.index)), errors="coerce").fillna(0) <= 0).sum())
        if "prior_target_trials" in df
        else None,
    }


def analysis_notes(stats: dict[str, Any], min_support: int) -> list[str]:
    exact_80_rows = [
        row
        for row in stats["top_gates"]
        if row.get("meets_raw_80") and int(row.get("rows") or 0) >= min_support and row.get("kind") != "top_k_epoch"
    ]
    new_target_80 = [row for row in exact_80_rows if row["scope"] == "new_target_model_rows"]
    xhigh_epoch_80 = [row for row in exact_80_rows if str(row["scope"]).startswith("xhigh_epochs")]
    notes = []
    if new_target_80:
        best = new_target_80[0]
        notes.append(f"New-target rows have a raw 80% gate: `{best['gate']}` at {best['exact_rate_pct']}% exact over {best['rows']} rows.")
    else:
        notes.append(f"No new-target gate with at least {min_support} rows reached a raw 80% exact rate.")
    if xhigh_epoch_80:
        best = xhigh_epoch_80[0]
        notes.append(f"Recent xhigh epochs have a raw 80% gate: `{best['gate']}` at {best['exact_rate_pct']}% exact over {best['rows']} rows.")
    else:
        notes.append(f"No recent xhigh epoch gate with at least {min_support} rows reached a raw 80% exact rate.")
    notes.append("The strongest non-leaky OPSEC/opseq signals raise exact likelihood but do not yet calibrate to 80% exact with meaningful support.")
    notes.append("Prior target exact history can look extremely strong, but that is a rediscovery/retry signal rather than a new-candidate discovery signal.")
    notes.append("For small batches, use the gate report as a candidate sieve: high OPSEC/opseq analogs plus small size or high model score should shrink the batch, then rebuild feedback can re-rank the next batch.")
    return notes


def render_table(rows: list[dict[str, Any]], columns: list[str], limit: int | None = None) -> str:
    scoped = rows[:limit] if limit else rows
    if not scoped:
        return "_No rows._"

    def fmt(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, float):
            return f"{value:.4g}"
        return str(value)

    header = "| " + " | ".join(columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    body = ["| " + " | ".join(fmt(row.get(column)) for column in columns) + " |" for row in scoped]
    return "\n".join([header, sep, *body])


def write_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    columns = [
        "scope",
        "kind",
        "gate",
        "rows",
        "coverage_pct",
        "exact",
        "exact_rate_pct",
        "exact_wilson_lcb_pct",
        "exact_lift",
        "improved",
        "improved_rate_pct",
        "improved_lift",
        "base_exact_rate_pct",
        "base_improved_rate_pct",
        "meets_raw_80",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def render_markdown(stats: dict[str, Any]) -> str:
    columns = [
        "scope",
        "kind",
        "rows",
        "exact_rate_pct",
        "exact_wilson_lcb_pct",
        "improved_rate_pct",
        "gate",
    ]
    lines = [
        "# OPSEC / Opseq Gate Calibration",
        "",
        f"Generated: `{stats['generated_at']}`",
        f"Dataset: `{stats['dataset_path']}`",
        "",
        "## Findings",
        "",
        *[f"- {note}" for note in stats["notes"]],
        "",
        "## Scope Summary",
        "",
        render_table(stats["scope_summary"], ["scope", "rows", "exact", "exact_rate_pct", "improved", "improved_rate_pct", "target_no_prior_rows"]),
        "",
        "## Best Gates",
        "",
        render_table(stats["top_gates"], columns, limit=40),
        "",
        "## Best Recent Xhigh Gates",
        "",
        render_table([row for row in stats["top_gates"] if str(row["scope"]).startswith("xhigh_epochs")], columns, limit=40),
        "",
        "## New-Target Gates",
        "",
        render_table([row for row in stats["top_gates"] if row["scope"] == "new_target_model_rows"], columns, limit=40),
        "",
        "## Top-K Batch Simulation",
        "",
        render_table(stats["top_k_rows"], ["scope", "kind", "rows", "exact_rate_pct", "improved_rate_pct", "gate"], limit=60),
        "",
        "## Limits",
        "",
        "- This report evaluates observed queued/admitted rows, not every candidate that was available at each historical rebuild.",
        "- Model columns are out-of-fold ranking scores from the priority outcome analysis, not production-calibrated probabilities.",
        "- Wilson lower bounds are intentionally conservative; raw high rates on tiny cohorts should not be treated as deployable guarantees.",
        "- OPSEC/opseq here means the opcode-sequence similarity features already present in the priority outcome dataset.",
        "",
    ]
    return "\n".join(lines)


def run(args: argparse.Namespace) -> dict[str, Any]:
    dataset_path = args.dataset or latest_priority_dataset()
    df = load_dataset(dataset_path, args.db)
    all_gate_rows: list[dict[str, Any]] = []
    top_k_rows: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    for scope_name, scope_df in scopes(df).items():
        if scope_df.empty:
            continue
        summaries.append(scope_summary(scope_name, scope_df))
        all_gate_rows.extend(scan_single_feature(scope_name, scope_df, args.min_support))
        all_gate_rows.extend(scan_pairwise(scope_name, scope_df, args.min_support))
        top_k_rows.extend(top_k_scan(scope_name, scope_df))
    sorted_gate_rows = sort_gate_rows([row for row in all_gate_rows if int(row.get("rows") or 0) >= args.min_support])
    sorted_top_k = sort_gate_rows(top_k_rows)

    generated_at = utc_now()
    out_prefix = args.out
    if out_prefix.name == "opseq-gate-calibration":
        out_prefix = out_prefix.with_name(f"{out_prefix.name}-{generated_at[:10]}")
    stats = {
        "generated_at": generated_at,
        "dataset_path": str(dataset_path),
        "db_path": str(args.db),
        "target_exact_rate": TARGET_EXACT_RATE,
        "min_support": args.min_support,
        "scope_summary": summaries,
        "top_gates": sorted_gate_rows[:250],
        "top_k_rows": sorted_top_k[:250],
    }
    stats["notes"] = analysis_notes(stats, args.min_support)
    stats["outputs"] = {
        "markdown": str(out_prefix.with_suffix(".md")),
        "stats_json": str(out_prefix.with_suffix(".stats.json")),
        "gates_csv": str(out_prefix.with_suffix(".gates.csv")),
    }
    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    write_rows(out_prefix.with_suffix(".gates.csv"), sorted_gate_rows)
    out_prefix.with_suffix(".stats.json").write_text(json_dumps(stats) + "\n", encoding="utf-8")
    out_prefix.with_suffix(".md").write_text(render_markdown(stats), encoding="utf-8")
    return stats


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None, help="q-priority outcome dataset CSV. Defaults to latest generated dataset.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--min-support", type=int, default=DEFAULT_MIN_SUPPORT)
    return parser


def main() -> None:
    stats = run(build_parser().parse_args())
    print(json_dumps({"outputs": stats["outputs"], "notes": stats["notes"]}))


if __name__ == "__main__":
    main()
