#!/usr/bin/env python3
"""Build the worker-audit manifest, cohort counts, and Phase 3 sample pairs."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


RUN_ID = "4a45af8a-9f8c-499b-b375-c0d8e93fc8fd"
COHORTS = ("exact", "near_miss", "progressed", "no_progress")
AUDIT_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = AUDIT_DIR.parent.parent
DEFAULT_DB = REPO_ROOT / "games/melee/state/orchestrator.sqlite"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--run-id", default=RUN_ID)
    parser.add_argument("--output-dir", type=Path, default=AUDIT_DIR)
    return parser.parse_args()


def read_rows(db_path: Path, run_id: str) -> list[sqlite3.Row]:
    uri = db_path.resolve().as_uri() + "?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        return connection.execute(
            """
            SELECT
                ws.id,
                ws.worker_id,
                e.ordinal AS epoch_ordinal,
                ws.target_key,
                ws.lifecycle_status,
                ws.artifact_dir,
                ws.worker_session_ids_json,
                ws.started_at,
                ws.ended_at,
                ws.baseline_score,
                ws.best_score,
                ws.exact
            FROM worker_state AS ws
            LEFT JOIN epochs AS e ON e.id = ws.epoch_id
            WHERE ws.run_id = ?
            ORDER BY e.ordinal, ws.id
            """,
            (run_id,),
        ).fetchall()
    finally:
        connection.close()


def cohort_for(row: sqlite3.Row) -> str:
    if row["exact"] == 1:
        return "exact"
    best = row["best_score"]
    baseline = row["baseline_score"]
    if best is not None and best >= 99.5:
        return "near_miss"
    if best is not None and baseline is not None and best > baseline + 0.0001:
        return "progressed"
    return "no_progress"


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def duration_minutes(started_at: str | None, ended_at: str | None) -> float | None:
    start = parse_timestamp(started_at)
    end = parse_timestamp(ended_at)
    if start is None or end is None:
        return None
    return round((end - start).total_seconds() / 60.0, 6)


def session_ids(value: str | None) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, str) and item]


def find_transcripts(artifact_dir: Path, sessions: Iterable[str]) -> list[str]:
    root = artifact_dir / "host-cwd" / ".pi-sessions"
    suffixes = tuple(f"_{session}.jsonl" for session in sessions)
    if not suffixes or not root.is_dir():
        return []

    matches: list[str] = []
    try:
        for directory, _, filenames in os.walk(root):
            directory_path = Path(directory)
            if directory_path.name != "worker":
                continue
            matches.extend(
                str(directory_path / name)
                for name in filenames
                if name.endswith(suffixes)
            )
    except OSError:
        return sorted(matches)
    return sorted(matches)


def build_manifest(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for row in rows:
        artifact_value = row["artifact_dir"]
        artifact_dir = Path(artifact_value) if artifact_value else None
        sessions = session_ids(row["worker_session_ids_json"])

        summaries: list[str] = []
        transcripts: list[str] = []
        tool_events_path: str | None = None
        has_tool_events = False
        if artifact_dir is not None:
            summaries = sorted(
                str(path)
                for session in sessions
                if (path := artifact_dir / f"worker_{session}.txt").is_file()
            )
            transcripts = find_transcripts(artifact_dir, sessions)
            tool_path = artifact_dir / "tool_events.jsonl"
            tool_events_path = str(tool_path)
            has_tool_events = tool_path.is_file()

        manifest.append(
            {
                "ws_id": row["id"],
                "worker_id": row["worker_id"],
                "epoch_ordinal": row["epoch_ordinal"],
                "target_key": row["target_key"],
                "lifecycle_status": row["lifecycle_status"],
                "baseline_score": row["baseline_score"],
                "best_score": row["best_score"],
                "exact": int(row["exact"]),
                "started_at": row["started_at"],
                "ended_at": row["ended_at"],
                "duration_min": duration_minutes(row["started_at"], row["ended_at"]),
                "artifact_dir": artifact_value,
                "summary_files": summaries,
                "transcript_files": transcripts,
                "tool_events_path": tool_events_path,
                "has_tool_events": has_tool_events,
                "cohort": cohort_for(row),
            }
        )
    return manifest


def cohort_counts(manifest: list[dict[str, Any]]) -> dict[str, Any]:
    overall = Counter(item["cohort"] for item in manifest)
    by_epoch: dict[int | None, Counter[str]] = defaultdict(Counter)
    for item in manifest:
        by_epoch[item["epoch_ordinal"]][item["cohort"]] += 1

    known_epochs = sorted(epoch for epoch in by_epoch if epoch is not None)
    epoch_counts = {
        str(epoch): {cohort: by_epoch[epoch][cohort] for cohort in COHORTS}
        for epoch in known_epochs
    }
    if None in by_epoch:
        epoch_counts["unknown"] = {
            cohort: by_epoch[None][cohort] for cohort in COHORTS
        }
    return {
        "overall": {cohort: overall[cohort] for cohort in COHORTS},
        "per_epoch": epoch_counts,
    }


def pair_member(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "ws_id": item["ws_id"],
        "target_key": item["target_key"],
        "baseline_score": item["baseline_score"],
        "best_score": item["best_score"],
    }


def choose_control(
    exact: dict[str, Any],
    candidates: Iterable[dict[str, Any]],
    exact_epoch: int,
) -> dict[str, Any] | None:
    available = list(candidates)
    if not available:
        return None
    return min(
        available,
        key=lambda control: (
            abs(control["baseline_score"] - exact["baseline_score"]),
            abs(control["epoch_ordinal"] - exact_epoch),
            control["epoch_ordinal"],
            control["ws_id"],
        ),
    )


def build_pairs(manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
    epochs = sorted(
        {
            item["epoch_ordinal"]
            for item in manifest
            if item["epoch_ordinal"] is not None and item["epoch_ordinal"] >= 3
        }
    )
    exact_by_epoch: dict[int, list[dict[str, Any]]] = defaultdict(list)
    controls_by_epoch: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in manifest:
        epoch = item["epoch_ordinal"]
        if epoch is None or epoch < 3:
            continue
        if item["cohort"] == "exact":
            exact_by_epoch[epoch].append(item)
        elif item["cohort"] == "near_miss":
            controls_by_epoch[epoch].append(item)

    used_controls: set[str] = set()
    pairs: list[dict[str, Any]] = []
    for epoch in epochs:
        selected_exact = sorted(
            exact_by_epoch[epoch],
            key=lambda item: (item["baseline_score"], item["ws_id"]),
        )[:6]
        for exact in selected_exact:
            same_epoch = [
                item
                for item in controls_by_epoch[epoch]
                if item["ws_id"] not in used_controls
            ]
            control = choose_control(exact, same_epoch, epoch)
            if control is None:
                adjacent = [
                    item
                    for adjacent_epoch in (epoch - 1, epoch + 1)
                    for item in controls_by_epoch[adjacent_epoch]
                    if item["ws_id"] not in used_controls
                ]
                control = choose_control(exact, adjacent, epoch)
            if control is None:
                continue

            used_controls.add(control["ws_id"])
            epoch_pair_number = 1 + sum(
                pair["epoch_ordinal"] == epoch for pair in pairs
            )
            pairs.append(
                {
                    "pair_id": f"epoch-{epoch:02d}-pair-{epoch_pair_number:02d}",
                    "epoch_ordinal": epoch,
                    "exact": pair_member(exact),
                    "control": pair_member(control),
                }
            )
    return pairs


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows = read_rows(args.db, args.run_id)
    manifest = build_manifest(rows)
    cohorts = cohort_counts(manifest)
    pairs = build_pairs(manifest)

    write_json(args.output_dir / "manifest.json", manifest)
    write_json(args.output_dir / "cohorts.json", cohorts)
    write_json(args.output_dir / "pairs.json", pairs)

    missing_artifact_dirs = sum(
        not item["artifact_dir"] or not Path(item["artifact_dir"]).is_dir()
        for item in manifest
    )
    missing_tool_events = sum(not item["has_tool_events"] for item in manifest)
    print(f"manifest rows: {len(manifest)}")
    print(f"cohorts: {cohorts['overall']}")
    print(f"pairs: {len(pairs)}")
    print(f"missing artifact dirs: {missing_artifact_dirs}")
    print(f"missing tool events: {missing_tool_events}")


if __name__ == "__main__":
    main()
