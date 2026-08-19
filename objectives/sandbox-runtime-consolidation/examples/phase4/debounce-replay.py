#!/usr/bin/env python3
"""Replay recorded tool bursts against sandbox stop-debounce policies."""

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path


DEFAULT_INPUT = Path(__file__).parents[3] / "daytona-sandbox-execution/examples/scale/thinking_time.json"


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def replay_session(session, debounce_ms, stop_ms, wake_ms):
    """Return billing counters for one session.

    The sandbox starts running at session start. Session boundaries and burst
    ends arm the debounce. For a gap > debounce + stop latency, only the time
    after that transition is stopped. A following burst wakes the sandbox at
    its recorded start, adding wake latency to duration; that added transition
    is billed. A final-tail stop has no wake. Tool execution and all debounce
    and stop-transition time remain billed. Recorded timestamps are not shifted
    by earlier wakes: accumulated wakes are new wall time outside the trace.
    """
    start = timestamp(session["first_event_timestamp"])
    end = timestamp(session["last_event_timestamp"])
    bursts = sorted(session.get("merged_tool_bursts", []), key=lambda b: b["start_timestamp"])
    boundaries = [(start, timestamp(bursts[0]["start_timestamp"]), True)] if bursts else []
    boundaries += [
        (timestamp(left["end_timestamp"]), timestamp(right["start_timestamp"]), True)
        for left, right in zip(bursts, bursts[1:])
    ]
    if bursts:
        boundaries.append((timestamp(bursts[-1]["end_timestamp"]), end, False))
    else:
        boundaries = [(start, end, False)]

    threshold = (debounce_ms + stop_ms) / 1000.0
    stopped = 0.0
    wakes = 0
    for gap_start, gap_end, followed_by_work in boundaries:
        gap = max(0.0, gap_end - gap_start)
        if gap > threshold:
            stopped += gap - threshold
            wakes += int(followed_by_work)

    wall = float(session["wall_seconds"])
    added_wake = wakes * wake_ms / 1000.0
    billed = wall + added_wake - stopped
    return {"wall_seconds": wall, "added_wake_seconds": added_wake,
            "stopped_seconds": stopped, "billed_seconds": billed, "wakes": wakes}


def aggregate(items, rate_per_hour):
    count = len(items)
    wall = sum(item["wall_seconds"] for item in items)
    added = sum(item["added_wake_seconds"] for item in items)
    stopped = sum(item["stopped_seconds"] for item in items)
    billed = sum(item["billed_seconds"] for item in items)
    baseline_cost = wall / 3600.0 * rate_per_hour
    billed_cost = billed / 3600.0 * rate_per_hour
    effective_wall = wall + added
    return {
        "count": count,
        "total_wall_hours": wall / 3600.0,
        "added_wall_percent": 100.0 * added / wall if wall else 0.0,
        "wakes_per_item_mean": sum(item["wakes"] for item in items) / count if count else 0.0,
        "stopped_fraction": stopped / effective_wall if effective_wall else 0.0,
        "billed_usd_per_claim_hour_equivalent": billed_cost / (wall / 3600.0) if wall else 0.0,
        "mean_usd_per_item": billed_cost / count if count else 0.0,
        "savings_percent_vs_always_run": 100.0 * (1.0 - billed_cost / baseline_cost) if baseline_cost else 0.0,
        "total_billed_seconds": billed,
    }


def claim_items(session_results, sessions, claims):
    claim_ids = {c["worker_claim_id"] for c in claims}
    grouped = defaultdict(list)
    for result, session in zip(session_results, sessions):
        claim_id = session.get("worker_claim_id")
        if claim_id in claim_ids:
            grouped[claim_id].append(result)
    return [{key: sum(item[key] for item in group) for key in
             ("wall_seconds", "added_wake_seconds", "stopped_seconds", "billed_seconds", "wakes")}
            for group in grouped.values()]


def parse_candidates(value):
    try:
        values = [int(part.strip()) for part in value.split(",") if part.strip()]
    except ValueError as error:
        raise argparse.ArgumentTypeError("candidates must be comma-separated integer milliseconds") from error
    if not values or any(value < 0 for value in values):
        raise argparse.ArgumentTypeError("candidates must contain non-negative milliseconds")
    return values


def compact(metric, item_label):
    return [metric["count"], f'{metric["total_wall_hours"]:.3f}',
            f'{metric["added_wall_percent"]:.2f}%', f'{metric["wakes_per_item_mean"]:.2f}',
            f'{metric["stopped_fraction"]:.3f}', f'${metric["billed_usd_per_claim_hour_equivalent"]:.4f}',
            f'${metric["mean_usd_per_item"]:.4f}', f'{metric["savings_percent_vs_always_run"]:.2f}%']


def print_table(title, rows, key, item_label):
    headers = ["T ms", item_label, "wall h", "added wall", f"wakes/{item_label[:-1]}",
               "stopped", "$/claim-h", f"mean $/{item_label[:-1]}", "savings"]
    values = [[row["candidate_ms"], *compact(row[key], item_label)] for row in rows]
    widths = [max(len(str(value)) for value in [header] + [row[i] for row in values])
              for i, header in enumerate(headers)]
    print(title)
    print("  ".join(header.ljust(widths[i]) for i, header in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in values:
        print("  ".join(str(value).rjust(widths[i]) for i, value in enumerate(row)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--stop-ms", type=int, default=1000)
    parser.add_argument("--wake-ms", type=int, default=850)
    parser.add_argument("--candidates", type=parse_candidates, default=parse_candidates("0,250,500,1000,2000,3000"))
    parser.add_argument("--rate-per-hour", type=float, default=0.1656)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.stop_ms < 0 or args.wake_ms < 0 or args.rate_per_hour < 0:
        parser.error("stop-ms, wake-ms, and rate-per-hour must be non-negative")

    data = json.loads(args.input.read_text())
    sessions = [session for session in data.get("sessions", []) if session.get("complete") is True]
    claims = data.get("claims", [])
    rows = []
    for candidate in args.candidates:
        results = [replay_session(session, candidate, args.stop_ms, args.wake_ms) for session in sessions]
        row = {"candidate_ms": candidate, "sessions": aggregate(results, args.rate_per_hour)}
        if claims:
            row["claims"] = aggregate(claim_items(results, sessions, claims), args.rate_per_hour)
        rows.append(row)

    # The recorded headline is for the 14 complete scale claims. Replaying T=0
    # with instantaneous stop and unbilled/zero-duration wake should match it.
    scale_claim_ids = {c["worker_claim_id"] for c in claims
                       if c.get("complete") is True and c.get("rung") != "single-worker PoC"}
    sanity_sessions = [s for s in sessions if s.get("worker_claim_id") in scale_claim_ids]
    sanity_results = [replay_session(session, 0, 0, 0) for session in sanity_sessions]
    sanity = aggregate(sanity_results, args.rate_per_hour)["savings_percent_vs_always_run"]
    report = {
        "input": str(args.input),
        "assumptions": {"stop_ms": args.stop_ms, "wake_ms": args.wake_ms,
                        "rate_per_hour": args.rate_per_hour,
                        "complete_sessions_only": True,
                        "claims_group_all_complete_sessions": bool(claims)},
        "results": rows,
        "sanity_check": {"description": "T=0, instantaneous stop, wake unbilled; complete scale claims",
                         "modeled_savings_percent": sanity, "recorded_headline_percent": 89.2,
                         "difference_percentage_points": sanity - 89.2},
    }
    if args.json:
        json.dump(report, sys.stdout, indent=2)
        print()
    else:
        print_table("Sessions (complete only)", rows, "sessions", "sessions")
        if claims:
            print()
            print_table("Claims (grouped complete sessions)", rows, "claims", "claims")
        print(f"\nSanity: T=0 with instantaneous stop and unbilled wake gives {sanity:.2f}% savings "
              f"vs the recorded ~89.2% headline ({sanity - 89.2:+.2f} pp).")


if __name__ == "__main__":
    main()
