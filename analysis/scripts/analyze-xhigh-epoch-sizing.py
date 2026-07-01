#!/usr/bin/env python3
"""Analyze xhigh epoch size, admission order, and match yield.

The report is intentionally narrow: it uses persisted epoch_targets,
worker_state, and best checkpoints to answer whether recent xhigh exact
matches were concentrated at the front of the admitted queue, and what smaller
epoch slices would have looked like under the observed admission order.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sqlite3
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "projects/melee/state/orchestrator.sqlite"
DEFAULT_OUT = ROOT / "analysis/reports/xhigh-epoch-sizing"
DEFAULT_EPOCHS = "20,21"
SEGMENT_SIZES = [4, 8, 16, 20, 24, 32, 40, 48, 64, 96, 128, 256]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def minutes_between(start: Any, end: Any) -> float | None:
    start_time = parse_time(start)
    end_time = parse_time(end)
    if start_time is None or end_time is None:
        return None
    return (end_time - start_time).total_seconds() / 60.0


def round_or_none(value: Any, digits: int = 2) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return round(number, digits)


def pct(numerator: float, denominator: float, digits: int = 1) -> float | None:
    if denominator <= 0:
        return None
    return round((100.0 * numerator) / denominator, digits)


def median_or_none(values: list[float]) -> float | None:
    return round_or_none(statistics.median(values), 2) if values else None


def json_dumps(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True)


def parse_epoch_list(text: str) -> list[int]:
    epochs: list[int] = []
    for part in text.split(","):
        item = part.strip()
        if not item:
            continue
        if "-" in item:
            start_text, end_text = item.split("-", 1)
            start = int(start_text)
            end = int(end_text)
            step = 1 if end >= start else -1
            epochs.extend(range(start, end + step, step))
        else:
            epochs.append(int(item))
    return sorted(set(epochs))


def load_rows(db_path: Path, epochs: list[int], include_active: bool) -> list[dict[str, Any]]:
    if not db_path.exists():
        raise FileNotFoundError(db_path)
    if not epochs:
        raise ValueError("At least one epoch is required.")
    placeholders = ", ".join("?" for _ in epochs)
    status_clause = "" if include_active else "AND e.closed_at IS NOT NULL"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            f"""
            SELECT
              e.id AS epoch_id,
              e.ordinal AS epoch_ordinal,
              e.status AS epoch_status,
              e.size_value AS epoch_size,
              e.worker_pool_size,
              e.candidate_window,
              e.created_at AS epoch_created_at,
              e.closed_at AS epoch_closed_at,
              et.id AS epoch_target_id,
              et.admission_index,
              et.priority,
              et.baseline_score,
              et.size,
              et.source_path,
              et.symbol,
              et.unit,
              et.status AS epoch_target_status,
              ws.id AS worker_state_id,
              ws.lifecycle_status,
              ws.started_at,
              ws.ended_at,
              ws.exact AS worker_exact,
              wc.selectable AS checkpoint_selectable,
              wc.new_score,
              wc.delta,
              wc.exact_match AS checkpoint_exact,
              wc.validation_time
            FROM epochs e
            JOIN epoch_targets et ON et.epoch_id = e.id
            LEFT JOIN worker_state ws ON ws.epoch_target_id = et.id
            LEFT JOIN worker_checkpoints wc ON wc.id = ws.best_checkpoint_id
            WHERE e.ordinal IN ({placeholders})
              {status_clause}
            ORDER BY e.ordinal, et.admission_index
            """,
            epochs,
        ).fetchall()
    finally:
        conn.close()

    result: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        item["exact"] = bool(item.get("lifecycle_status") == "exact" and item.get("worker_exact"))
        delta = round_or_none(item.get("delta"), 6) or 0.0
        item["improved"] = bool(item["exact"] or (item.get("checkpoint_selectable") and delta > 0))
        item["observed_worker"] = bool(item.get("worker_state_id"))
        item["minutes_to_validation"] = minutes_between(item.get("epoch_created_at"), item.get("validation_time") or item.get("ended_at"))
        item["worker_minutes_to_validation"] = minutes_between(item.get("started_at"), item.get("validation_time") or item.get("ended_at"))
        result.append(item)
    assign_ranks(result)
    return result


def assign_ranks(rows: list[dict[str, Any]]) -> None:
    by_epoch: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_epoch[int(row["epoch_ordinal"])].append(row)
    for epoch_rows in by_epoch.values():
        for rank, row in enumerate(
            sorted(epoch_rows, key=lambda item: (-(float(item.get("priority") or -1.0)), int(item.get("admission_index") or 0))),
            start=1,
        ):
            row["priority_rank"] = rank
        started = [row for row in epoch_rows if row.get("started_at")]
        for rank, row in enumerate(sorted(started, key=lambda item: str(item.get("started_at") or "")), start=1):
            row["claim_start_rank"] = rank


def summarize_epochs(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for ordinal, group in grouped(rows, "epoch_ordinal"):
        workers = [row for row in group if row["observed_worker"]]
        exacts = [row for row in group if row["exact"]]
        improved = [row for row in group if row["improved"]]
        minutes_to_exact = [float(row["minutes_to_validation"]) for row in exacts if row.get("minutes_to_validation") is not None]
        summaries.append(
            {
                "epoch": int(ordinal),
                "status": group[0]["epoch_status"],
                "epoch_size": int(group[0].get("epoch_size") or 0),
                "candidate_window": int(group[0].get("candidate_window") or 0),
                "worker_pool_size": int(group[0].get("worker_pool_size") or 0),
                "targets": len(group),
                "workers": len(workers),
                "exact": len(exacts),
                "improved": len(improved),
                "retired_without_worker": sum(1 for row in group if row.get("epoch_target_status") == "finished" and not row["observed_worker"]),
                "exact_rate_targets_pct": pct(len(exacts), len(group)),
                "exact_rate_workers_pct": pct(len(exacts), len(workers)),
                "improved_rate_targets_pct": pct(len(improved), len(group)),
                "first_exact_admission_index": min((int(row["admission_index"]) for row in exacts), default=None),
                "median_exact_admission_index": median_or_none([float(row["admission_index"]) for row in exacts]),
                "median_exact_priority_rank": median_or_none([float(row["priority_rank"]) for row in exacts]),
                "median_minutes_to_exact": median_or_none(minutes_to_exact),
                "created_at": group[0]["epoch_created_at"],
                "closed_at": group[0]["epoch_closed_at"],
            }
        )
    return summaries


def grouped(rows: list[dict[str, Any]], key: str) -> list[tuple[Any, list[dict[str, Any]]]]:
    buckets: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        buckets[row.get(key)].append(row)
    return [(key_value, buckets[key_value]) for key_value in sorted(buckets)]


def bucket_summaries(rows: list[dict[str, Any]], order_key: str, bucket_count: int = 5) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    label = "admission_index" if order_key == "admission_index" else "priority_rank"
    for ordinal, group in grouped(rows, "epoch_ordinal"):
        ordered = sorted(group, key=lambda row: int(row[order_key]))
        if not ordered:
            continue
        for index in range(bucket_count):
            start = math.floor(index * len(ordered) / bucket_count)
            end = math.floor((index + 1) * len(ordered) / bucket_count)
            bucket = ordered[start:end]
            if not bucket:
                continue
            exact = sum(1 for row in bucket if row["exact"])
            improved = sum(1 for row in bucket if row["improved"])
            summaries.append(
                {
                    "epoch": int(ordinal),
                    "order": label,
                    "bucket_high_to_low": index + 1,
                    "rows": len(bucket),
                    "min_order": int(bucket[0][order_key]),
                    "max_order": int(bucket[-1][order_key]),
                    "exact": exact,
                    "exact_rate_pct": pct(exact, len(bucket)),
                    "improved": improved,
                    "improved_rate_pct": pct(improved, len(bucket)),
                }
            )
    return summaries


def segment_simulation(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    by_epoch = grouped(rows, "epoch_ordinal")
    for segment_size in SEGMENT_SIZES:
        segment_rows: list[tuple[int, int, int, int, int]] = []
        for ordinal, group in by_epoch:
            ordered = sorted(group, key=lambda row: int(row["admission_index"]))
            if segment_size > len(ordered):
                continue
            for segment_index, start in enumerate(range(0, len(ordered), segment_size), start=1):
                segment = ordered[start : start + segment_size]
                if not segment:
                    continue
                exact = sum(1 for row in segment if row["exact"])
                improved = sum(1 for row in segment if row["improved"])
                segment_rows.append((int(ordinal), segment_index, len(segment), exact, improved))
                result.append(
                    {
                        "scope": "epoch",
                        "epoch": int(ordinal),
                        "segment_size": segment_size,
                        "segment_index": segment_index,
                        "rows": len(segment),
                        "exact": exact,
                        "improved": improved,
                        "exact_rate_pct": pct(exact, len(segment)),
                        "improved_rate_pct": pct(improved, len(segment)),
                    }
                )
        if segment_rows:
            exact_values = [exact for _, _, _, exact, _ in segment_rows]
            improved_values = [improved for _, _, _, _, improved in segment_rows]
            first_segments = [row for row in segment_rows if row[1] == 1]
            result.append(
                {
                    "scope": "aggregate",
                    "epoch": None,
                    "segment_size": segment_size,
                    "segment_index": None,
                    "segments": len(segment_rows),
                    "rows": sum(row[2] for row in segment_rows),
                    "exact": sum(exact_values),
                    "improved": sum(improved_values),
                    "avg_exact_per_segment": round_or_none(sum(exact_values) / len(exact_values), 2),
                    "median_exact_per_segment": median_or_none([float(value) for value in exact_values]),
                    "avg_improved_per_segment": round_or_none(sum(improved_values) / len(improved_values), 2),
                    "first_segments_exact": sum(row[3] for row in first_segments),
                    "first_segments_improved": sum(row[4] for row in first_segments),
                }
            )
    return result


def exact_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in rows:
        if not row["exact"]:
            continue
        output.append(
            {
                "epoch": int(row["epoch_ordinal"]),
                "admission_index": int(row["admission_index"]),
                "priority_rank": int(row["priority_rank"]),
                "claim_start_rank": row.get("claim_start_rank"),
                "priority": round_or_none(row.get("priority"), 4),
                "baseline_score": round_or_none(row.get("baseline_score"), 5),
                "size": int(row.get("size") or 0),
                "minutes_to_validation": round_or_none(row.get("minutes_to_validation"), 1),
                "worker_minutes_to_validation": round_or_none(row.get("worker_minutes_to_validation"), 1),
                "source_path": row["source_path"],
                "symbol": row["symbol"],
            }
        )
    return sorted(output, key=lambda row: (row["epoch"], row["admission_index"]))


def source_yield(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counters: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        counter = counters[str(row["source_path"])]
        counter["targets"] += 1
        if row["observed_worker"]:
            counter["workers"] += 1
        if row["exact"]:
            counter["exact"] += 1
        if row["improved"]:
            counter["improved"] += 1
    result = []
    for source_path, counter in counters.items():
        result.append(
            {
                "source_path": source_path,
                "targets": int(counter["targets"]),
                "workers": int(counter["workers"]),
                "exact": int(counter["exact"]),
                "improved": int(counter["improved"]),
                "exact_rate_targets_pct": pct(counter["exact"], counter["targets"]),
                "improved_rate_targets_pct": pct(counter["improved"], counter["targets"]),
            }
        )
    return sorted(result, key=lambda row: (row["exact"], row["improved"], row["targets"]), reverse=True)


def aggregate_segment_rows(segment_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in segment_rows if row["scope"] == "aggregate"]


def render_table(rows: list[dict[str, Any]], columns: list[str]) -> str:
    if not rows:
        return "_No rows._"

    def fmt(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, float):
            return f"{value:.4g}"
        return str(value)

    header = "| " + " | ".join(columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    body = ["| " + " | ".join(fmt(row.get(column)) for column in columns) + " |" for row in rows]
    return "\n".join([header, sep, *body])


def recommendation(stats: dict[str, Any]) -> list[str]:
    aggregate_segments = {row["segment_size"]: row for row in stats["segment_simulation"] if row["scope"] == "aggregate"}
    size_16 = aggregate_segments.get(16, {})
    size_32 = aggregate_segments.get(32, {})
    size_64 = aggregate_segments.get(64, {})
    return [
        "Use 64 as the default xhigh epoch size for 20 workers. In the analyzed xhigh epochs, 64-target slices averaged "
        f"{size_64.get('avg_exact_per_segment', 'n/a')} exacts and {size_64.get('avg_improved_per_segment', 'n/a')} improvements per slice.",
        "Use 32 only as an experiment when rebuild/checkpoint time is cheap. The observed 32-target slices averaged "
        f"{size_32.get('avg_exact_per_segment', 'n/a')} exacts, but that gives only about 1.6 waves for a 20-worker pool.",
        "Avoid production 4/8/16 epochs until candidate-window decoupling is in place. The 16-target slices averaged "
        f"{size_16.get('avg_exact_per_segment', 'n/a')} exacts and would underfill a 20-worker pool.",
        "Keep the candidate window at least 128, preferably 256 for experiments, even when epoch size is 32 or 64. Otherwise small epochs only see the very front of the board.",
        "Do not treat raw priority as enough. Exact wins appeared across admission order and priority rank, and repeated source hot streaks show that strict one-per-source round-robin can push winners later in the epoch.",
    ]


def run(args: argparse.Namespace) -> dict[str, Any]:
    epochs = parse_epoch_list(args.epochs)
    rows = load_rows(args.db, epochs, args.include_active)
    date_suffix = utc_now()[:10]
    out_prefix = args.out
    if out_prefix.name == "xhigh-epoch-sizing":
        out_prefix = out_prefix.with_name(f"{out_prefix.name}-{date_suffix}")
    out_prefix.parent.mkdir(parents=True, exist_ok=True)

    stats = {
        "generated_at": utc_now(),
        "db_path": str(args.db),
        "epochs": epochs,
        "include_active": args.include_active,
        "epoch_summary": summarize_epochs(rows),
        "bucket_summary": [*bucket_summaries(rows, "admission_index"), *bucket_summaries(rows, "priority_rank")],
        "segment_simulation": segment_simulation(rows),
        "exact_rows": exact_rows(rows),
        "source_yield": source_yield(rows),
    }
    stats["recommendations"] = recommendation(stats)

    dataset_path = out_prefix.with_suffix(".dataset.csv")
    stats_path = out_prefix.with_suffix(".stats.json")
    md_path = out_prefix.with_suffix(".md")
    write_dataset(dataset_path, rows)
    stats_path.write_text(json_dumps(stats) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(stats), encoding="utf-8")
    stats["outputs"] = {
        "dataset_csv": str(dataset_path),
        "stats_json": str(stats_path),
        "markdown": str(md_path),
    }
    stats_path.write_text(json_dumps(stats) + "\n", encoding="utf-8")
    return stats


def write_dataset(path: Path, rows: list[dict[str, Any]]) -> None:
    columns = [
        "epoch_ordinal",
        "epoch_status",
        "epoch_size",
        "candidate_window",
        "admission_index",
        "priority_rank",
        "claim_start_rank",
        "priority",
        "baseline_score",
        "size",
        "source_path",
        "symbol",
        "epoch_target_status",
        "lifecycle_status",
        "exact",
        "improved",
        "new_score",
        "delta",
        "minutes_to_validation",
        "worker_minutes_to_validation",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column) for column in columns})


def render_markdown(stats: dict[str, Any]) -> str:
    lines = [
        "# Xhigh Epoch Sizing Analysis",
        "",
        f"Generated: `{stats['generated_at']}`",
        "",
        "## Recommendations",
        "",
        *[f"- {item}" for item in stats["recommendations"]],
        "",
        "## Epoch Summary",
        "",
        render_table(
            stats["epoch_summary"],
            [
                "epoch",
                "status",
                "epoch_size",
                "candidate_window",
                "targets",
                "workers",
                "exact",
                "improved",
                "exact_rate_targets_pct",
                "improved_rate_targets_pct",
                "median_exact_admission_index",
                "median_exact_priority_rank",
                "median_minutes_to_exact",
            ],
        ),
        "",
        "## Segment Simulation",
        "",
        "Observed-order slices answer: if the admitted epoch had been cut into smaller chunks, how many exacts/improvements were inside each chunk? This is not a causal rebuild replay.",
        "",
        render_table(
            aggregate_segment_rows(stats["segment_simulation"]),
            [
                "segment_size",
                "segments",
                "rows",
                "exact",
                "improved",
                "avg_exact_per_segment",
                "median_exact_per_segment",
                "avg_improved_per_segment",
                "first_segments_exact",
                "first_segments_improved",
            ],
        ),
        "",
        "## Exact Match Timing",
        "",
        render_table(
            stats["exact_rows"],
            [
                "epoch",
                "admission_index",
                "priority_rank",
                "claim_start_rank",
                "priority",
                "baseline_score",
                "size",
                "minutes_to_validation",
                "worker_minutes_to_validation",
                "source_path",
                "symbol",
            ],
        ),
        "",
        "## Admission And Priority Buckets",
        "",
        render_table(
            stats["bucket_summary"],
            ["epoch", "order", "bucket_high_to_low", "rows", "min_order", "max_order", "exact", "exact_rate_pct", "improved", "improved_rate_pct"],
        ),
        "",
        "## Source Yield",
        "",
        render_table(
            stats["source_yield"][:30],
            ["source_path", "targets", "workers", "exact", "improved", "exact_rate_targets_pct", "improved_rate_targets_pct"],
        ),
        "",
        "## Limits",
        "",
        "- This analyzes persisted admitted targets, not the full candidate board available at each historical rebuild.",
        "- Active epochs should be treated as snapshots; closed epochs are better for rate estimates.",
        "- Smaller epoch simulations preserve the observed admission order. Real rebuilds can change later order after exact targets retire and graph context updates.",
        "",
    ]
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--epochs", default=DEFAULT_EPOCHS, help="Comma/range list such as 20,21 or 20-22.")
    parser.add_argument("--include-active", action="store_true")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return parser


def main() -> None:
    stats = run(build_parser().parse_args())
    print(json_dumps({"outputs": stats["outputs"], "epochs": stats["epochs"], "recommendations": stats["recommendations"]}))


if __name__ == "__main__":
    main()
