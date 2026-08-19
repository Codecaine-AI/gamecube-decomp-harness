#!/usr/bin/env python3
"""Report sandbox sleep savings for orchestrator worker runs."""

from __future__ import annotations

import argparse
import json
import sqlite3
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


STAT_KEYS = ("stopCount", "startCount", "stoppedMs", "stopFailures", "startFailures")


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Produce the phase-5 cost report for run-and-sleep worker runs."
    )
    parser.add_argument(
        "--state-dir",
        type=Path,
        required=True,
        help="Orchestrator state directory containing orchestrator.sqlite",
    )
    parser.add_argument(
        "--rate-per-hour",
        type=float,
        default=0.1656,
        help="Sandbox running rate in dollars per hour (default: 0.1656)",
    )
    parser.add_argument(
        "--baseline-per-claim",
        type=float,
        default=0.081,
        help="Baseline cost in dollars per claim (default: 0.081)",
    )
    parser.add_argument("--json", action="store_true", help="Emit the full report as JSON")
    args = parser.parse_args()
    if args.rate_per_hour < 0:
        parser.error("--rate-per-hour must be non-negative")
    if args.baseline_per_claim < 0:
        parser.error("--baseline-per-claim must be non-negative")
    return args


def parse_json(value: Any) -> dict[str, Any]:
    try:
        parsed = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        result = datetime.fromisoformat(text)
    except ValueError:
        return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def seconds_between(start: str | None, end: str | None) -> float | None:
    start_dt, end_dt = timestamp(start), timestamp(end)
    if start_dt is None or end_dt is None:
        return None
    return (end_dt - start_dt).total_seconds()


def load_stats(state_dir: Path, run_id: str, worker_state_id: str) -> dict[str, Any]:
    root = state_dir / "runs" / run_id / "worker_state" / worker_state_id
    paths = sorted(root.rglob("sandbox_sleep_stats.json")) if root.is_dir() else []
    result: dict[str, Any] = {"path": str(paths[0]) if paths else None, "error": None}
    result.update({key: None for key in STAT_KEYS})
    if not paths:
        result["error"] = "artifact not found"
        return result
    try:
        data = json.loads(paths[0].read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("top-level JSON value is not an object")
        for key in STAT_KEYS:
            value = data.get(key)
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise ValueError(f"{key} is missing or non-numeric")
            result[key] = value
    except (OSError, json.JSONDecodeError, ValueError) as error:
        result["error"] = str(error)
    if len(paths) > 1:
        result["additional_paths"] = [str(path) for path in paths[1:]]
    return result


def mean(values: list[float]) -> float | None:
    return statistics.fmean(values) if values else None


def summarize(claims: list[dict[str, Any]], baseline: float) -> dict[str, Any]:
    numeric = lambda key: [float(claim[key]) for claim in claims if claim[key] is not None]
    billed = numeric("billed_cost")
    always = numeric("always_run_cost")
    lifetime = numeric("sandbox_lifetime_s")
    stopped = numeric("stopped_s")
    running = numeric("running_s")
    wakes = numeric("wakes")
    close_latency = numeric("close_to_delete_latency_s")
    total_billed, total_always = sum(billed), sum(always)
    mean_billed = mean(billed)
    return {
        "claim_count": len(claims),
        "costed_claim_count": len(billed),
        "totals": {
            "sandbox_lifetime_s": sum(lifetime),
            "stopped_s": sum(stopped),
            "running_s": sum(running),
            "billed_cost": total_billed,
            "always_run_cost": total_always,
            "savings_cost": total_always - total_billed,
            "savings_percent": ((total_always - total_billed) / total_always * 100) if total_always else None,
            "wakes": sum(wakes),
        },
        "means": {
            "sandbox_lifetime_s": mean(lifetime),
            "stopped_s": mean(stopped),
            "running_s": mean(running),
            "billed_cost_per_claim": mean_billed,
            "always_run_cost_per_claim": mean(always),
            "wakes_per_claim": mean(wakes),
            "close_to_delete_latency_s": mean(close_latency),
        },
        "baseline_per_claim": baseline,
        "mean_billed_to_baseline_ratio": (mean_billed / baseline) if mean_billed is not None and baseline else None,
    }


def build_report(state_dir: Path, rate: float, baseline: float) -> dict[str, Any]:
    database = state_dir / "orchestrator.sqlite"
    if not database.is_file():
        raise FileNotFoundError(f"database not found: {database}")
    uri = f"file:{quote(str(database.resolve()), safe='/')}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        jobs = connection.execute(
            """SELECT job_id, run_id, status, attempts, payload_json
               FROM jobs WHERE kind = 'worker'
               ORDER BY run_id, created_at, job_id"""
        ).fetchall()
        event_rows = connection.execute(
            """SELECT event_id, event_type, subject_id, occurred_at, payload_json
               FROM game_events
               WHERE event_type IN ('sandbox.created', 'sandbox.deleted')
               ORDER BY occurred_at, sequence"""
        ).fetchall()
        worker_rows = connection.execute(
            "SELECT id, ended_at FROM worker_state"
        ).fetchall()
    finally:
        connection.close()

    workers = {row["id"]: row["ended_at"] for row in worker_rows}
    lifecycles: dict[str, dict[str, Any]] = {}
    for row in event_rows:
        item = lifecycles.setdefault(row["subject_id"], {"created": [], "deleted": []})
        key = "created" if row["event_type"] == "sandbox.created" else "deleted"
        item[key].append({
            "event_id": row["event_id"],
            "occurred_at": row["occurred_at"],
            "payload": parse_json(row["payload_json"]),
        })

    runs: dict[str, dict[str, Any]] = {}
    all_claims: list[dict[str, Any]] = []
    for row in jobs:
        payload = parse_json(row["payload_json"])
        run_id = str(row["run_id"] or payload.get("run_id") or "<missing-run-id>")
        sandbox_id = payload.get("sandbox_id")
        worker_state_id = payload.get("worker_state_id")
        target_claim_id = payload.get("target_claim_id")
        lifecycle = lifecycles.get(str(sandbox_id), {}) if sandbox_id else {}
        created = (lifecycle.get("created") or [None])[0]
        deleted = (lifecycle.get("deleted") or [None])[-1]
        created_at = created["occurred_at"] if created else None
        deleted_at = deleted["occurred_at"] if deleted else None
        lifetime = seconds_between(created_at, deleted_at)
        ended_at = workers.get(str(worker_state_id)) if worker_state_id else None
        stats = load_stats(state_dir, run_id, str(worker_state_id)) if worker_state_id else {
            "path": None, "error": "worker_state_id missing", **{key: None for key in STAT_KEYS}
        }
        stopped_s = float(stats["stoppedMs"]) / 1000 if stats["stoppedMs"] is not None else None
        running_s = max(0.0, lifetime - stopped_s) if lifetime is not None and stopped_s is not None else None
        always_cost = lifetime / 3600 * rate if lifetime is not None else None
        billed_cost = running_s / 3600 * rate if running_s is not None else None
        savings = ((always_cost - billed_cost) / always_cost * 100) if always_cost and billed_cost is not None else None
        claim = {
            "job_id": row["job_id"], "run_id": run_id, "status": row["status"],
            "attempts": row["attempts"], "payload": payload,
            "sandbox_id": sandbox_id, "worker_state_id": worker_state_id,
            "target_claim_id": target_claim_id, "created_at": created_at,
            "deleted_at": deleted_at, "worker_ended_at": ended_at,
            "sandbox_lifetime_s": lifetime,
            "close_to_delete_latency_s": seconds_between(ended_at, deleted_at),
            "sleep_stats": stats, "stopped_s": stopped_s, "running_s": running_s,
            "billed_cost": billed_cost, "always_run_cost": always_cost,
            "savings_percent": savings, "wakes": stats["startCount"],
        }
        runs.setdefault(run_id, {"run_id": run_id, "claims": []})["claims"].append(claim)
        all_claims.append(claim)

    for run in runs.values():
        run["summary"] = summarize(run["claims"], baseline)
    orphans = [
        {"sandbox_id": sandbox_id, "created_events": life["created"]}
        for sandbox_id, life in sorted(lifecycles.items())
        if life["created"] and not life["deleted"]
    ]
    return {
        "state_dir": str(state_dir.resolve()), "database": str(database.resolve()),
        "rate_per_hour": rate, "baseline_per_claim": baseline,
        "runs": list(runs.values()), "overall": summarize(all_claims, baseline),
        "zero_orphan_check": {"passed": not orphans, "orphan_count": len(orphans), "sandboxes": orphans},
    }


def fmt(value: Any, digits: int = 2) -> str:
    return "-" if value is None else f"{float(value):.{digits}f}"


def print_human(report: dict[str, Any]) -> None:
    print(f"Phase-5 sandbox sleep cost report | ${report['rate_per_hour']:.4f}/hour")
    for run in report["runs"]:
        print(f"\nRun {run['run_id']}")
        print("claim/job      status     att lifetime_s stopped_s running_s billed_$ always_$ save_% wakes close_del_s")
        for claim in run["claims"]:
            label = str(claim["target_claim_id"] or claim["job_id"])
            print(
                f"{label[:14]:14} {claim['status'][:10]:10} {claim['attempts']:>3} "
                f"{fmt(claim['sandbox_lifetime_s']):>10} {fmt(claim['stopped_s']):>9} "
                f"{fmt(claim['running_s']):>9} {fmt(claim['billed_cost'], 5):>8} "
                f"{fmt(claim['always_run_cost'], 5):>8} {fmt(claim['savings_percent'], 1):>6} "
                f"{fmt(claim['wakes'], 0):>5} {fmt(claim['close_to_delete_latency_s']):>11}"
            )
            if claim["sleep_stats"]["error"]:
                print(f"  stats: {claim['sleep_stats']['error']}")
        summary = run["summary"]
        print(
            f"  totals: claims={summary['claim_count']} costed={summary['costed_claim_count']} "
            f"lifetime={fmt(summary['totals']['sandbox_lifetime_s'])}s "
            f"stopped={fmt(summary['totals']['stopped_s'])}s running={fmt(summary['totals']['running_s'])}s "
            f"billed=${fmt(summary['totals']['billed_cost'], 5)} always=${fmt(summary['totals']['always_run_cost'], 5)} "
            f"savings={fmt(summary['totals']['savings_percent'], 1)}% wakes={fmt(summary['totals']['wakes'], 0)}"
        )
        print(
            f"  means: billed/claim=${fmt(summary['means']['billed_cost_per_claim'], 5)} "
            f"lifetime={fmt(summary['means']['sandbox_lifetime_s'])}s "
            f"close-to-delete={fmt(summary['means']['close_to_delete_latency_s'])}s "
            f"baseline ratio={fmt(summary['mean_billed_to_baseline_ratio'], 3)}x"
        )
    overall = report["overall"]
    print(
        f"\nOverall: claims={overall['claim_count']} costed={overall['costed_claim_count']} "
        f"mean billed/claim=${fmt(overall['means']['billed_cost_per_claim'], 5)}; "
        f"baseline=${report['baseline_per_claim']:.5f}; ratio={fmt(overall['mean_billed_to_baseline_ratio'], 3)}x"
    )
    orphan = report["zero_orphan_check"]
    if orphan["passed"]:
        print("Zero-orphan check: PASS (every created sandbox has a deleted event)")
    else:
        print(f"Zero-orphan check: FAIL ({orphan['orphan_count']} created sandbox(es) lack a deleted event)")
        for item in orphan["sandboxes"]:
            print(f"  {item['sandbox_id']}")


def main() -> int:
    args = arguments()
    try:
        report = build_report(args.state_dir, args.rate_per_hour, args.baseline_per_claim)
    except (OSError, sqlite3.Error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    if args.json:
        json.dump(report, sys.stdout, indent=2, sort_keys=True)
        print()
    else:
        print_human(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
