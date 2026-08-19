#!/usr/bin/env python3
"""Summarize JSONL emitted by host-footprint-sampler.sh."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jsonl", type=Path, help="sampler JSONL file")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    return parser.parse_args()


def numeric(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def percentile(values: list[float], percent: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percent
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def stats(values: list[float], include_p95: bool = False) -> dict[str, float | None]:
    result: dict[str, float | None] = {
        "mean": statistics.fmean(values) if values else None,
        "max": max(values) if values else None,
    }
    if include_p95:
        result["p95"] = percentile(values, 0.95)
    return result


def nested(sample: dict[str, Any], *keys: str) -> Any:
    value: Any = sample
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def load_samples(path: Path) -> list[dict[str, Any]]:
    samples = []
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                print(f"warning: skipping line {line_number}: {error}", file=sys.stderr)
                continue
            if isinstance(value, dict):
                samples.append(value)
    return samples


def summarize(samples: list[dict[str, Any]]) -> dict[str, Any]:
    times = [parsed for sample in samples if (parsed := timestamp(sample.get("ts"))) is not None]
    span = (max(times) - min(times)).total_seconds() if times else None

    cpu = [value for sample in samples if (value := numeric(nested(sample, "host", "cpu_busy_pct"))) is not None]
    used_gb = [value / 1024 for sample in samples if (value := numeric(nested(sample, "host", "memory", "used_mb"))) is not None]
    workers = [value for sample in samples if (value := numeric(nested(sample, "counts", "n_workers"))) is not None]
    tcp = [value for sample in samples if (value := numeric(nested(sample, "counts", "tcp_conns"))) is not None]

    role_summary: dict[str, Any] = {}
    for output_role, input_role in (("run-loop", "run-loop"), ("workers", "worker")):
        rss_totals: list[float] = []
        cpu_totals: list[float] = []
        for sample in samples:
            processes = sample.get("procs") if isinstance(sample.get("procs"), list) else []
            matching = [proc for proc in processes if isinstance(proc, dict) and proc.get("role") == input_role]
            rss_totals.append(sum(value for proc in matching if (value := numeric(proc.get("rss_mb"))) is not None))
            cpu_totals.append(sum(value for proc in matching if (value := numeric(proc.get("cpu_pct"))) is not None))
        role_summary[output_role] = {"rss_mb": stats(rss_totals), "cpu_pct": stats(cpu_totals)}

    bytes_in = 0.0
    bytes_out = 0.0
    for previous, current in zip(samples, samples[1:]):
        previous_net, current_net = previous.get("net"), current.get("net")
        if not isinstance(previous_net, dict) or not isinstance(current_net, dict):
            continue
        if not previous_net.get("interface") or previous_net.get("interface") != current_net.get("interface"):
            continue
        for key, accumulator in (("bytes_in", "in"), ("bytes_out", "out")):
            before, after = numeric(previous_net.get(key)), numeric(current_net.get(key))
            if before is None or after is None:
                continue
            delta = max(0.0, after - before)
            if accumulator == "in":
                bytes_in += delta
            else:
                bytes_out += delta

    def mbps(byte_count: float) -> float | None:
        return byte_count * 8 / span / 1_000_000 if span and span > 0 else None

    return {
        "sample_count": len(samples),
        "wall_span_seconds": span,
        "host": {
            "cpu_busy_pct": stats(cpu, include_p95=True),
            "used_memory_gb": stats(used_gb),
        },
        "roles": role_summary,
        "n_workers": {"max": max(workers) if workers else None},
        "tcp_conns": stats(tcp),
        "network": {
            "total_mb_in": bytes_in / 1_000_000,
            "total_mb_out": bytes_out / 1_000_000,
            "mean_mbps_in": mbps(bytes_in),
            "mean_mbps_out": mbps(bytes_out),
        },
    }


def fmt(value: Any, digits: int = 2) -> str:
    return "-" if value is None else f"{float(value):.{digits}f}"


def print_human(report: dict[str, Any]) -> None:
    host = report["host"]
    print(f"Samples: {report['sample_count']}    Wall span: {fmt(report['wall_span_seconds'])} s")
    print()
    print(f"{'Metric':<30} {'Mean':>12} {'P95':>12} {'Max':>12}")
    print("-" * 69)
    cpu = host["cpu_busy_pct"]
    print(f"{'Host CPU busy %':<30} {fmt(cpu['mean']):>12} {fmt(cpu['p95']):>12} {fmt(cpu['max']):>12}")
    memory = host["used_memory_gb"]
    print(f"{'Host used memory GB':<30} {fmt(memory['mean']):>12} {'-':>12} {fmt(memory['max']):>12}")
    for role in ("run-loop", "workers"):
        rss = report["roles"][role]["rss_mb"]
        cpu_role = report["roles"][role]["cpu_pct"]
        print(f"{role + ' aggregate RSS MB':<30} {fmt(rss['mean']):>12} {'-':>12} {fmt(rss['max']):>12}")
        print(f"{role + ' aggregate CPU %':<30} {fmt(cpu_role['mean']):>12} {'-':>12} {fmt(cpu_role['max']):>12}")
    tcp = report["tcp_conns"]
    print(f"{'TCP connections':<30} {fmt(tcp['mean']):>12} {'-':>12} {fmt(tcp['max']):>12}")
    print(f"{'Worker count':<30} {'-':>12} {'-':>12} {fmt(report['n_workers']['max'], 0):>12}")
    print()
    network = report["network"]
    print(f"Network in:  {fmt(network['total_mb_in'], 3)} MB total, {fmt(network['mean_mbps_in'], 3)} Mbps mean")
    print(f"Network out: {fmt(network['total_mb_out'], 3)} MB total, {fmt(network['mean_mbps_out'], 3)} Mbps mean")


def main() -> int:
    args = arguments()
    try:
        report = summarize(load_samples(args.jsonl))
    except OSError as error:
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
