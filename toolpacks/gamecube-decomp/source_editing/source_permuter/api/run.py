#!/usr/bin/env python3
"""Run a bounded tool-local source-permutation search for one function."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import clamp_int, print_json, resolve_repo_root, run_tool_script


DEFAULT_JOBS = 1
MAX_JOBS = 1


def split_symbols(values: list[str], joined: str | None) -> list[str]:
    """Normalize repeated and comma/space-separated symbol arguments."""

    raw = list(values)
    if joined:
        raw.extend(re.split(r"[\s,]+", joined))
    return [value.strip() for value in raw if value.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--function", required=True, help="Function symbol whose object code is scored.")
    parser.add_argument("--mutate-function", action="append", default=[], help="Function in the same TU to mutate; may repeat.")
    parser.add_argument("--mutate-functions", help="Comma- or space-separated mutation targets.")
    parser.add_argument("--max-iters", type=int, default=32, help="Maximum compiled candidates.")
    parser.add_argument("--timeout-seconds", type=int, default=90, help="Maximum search runtime.")
    parser.add_argument("--jobs", type=int, default=DEFAULT_JOBS, help="Worker threads for permutation.")
    parser.add_argument("--seed", type=int, default=0, help="Base random seed.")
    parser.add_argument("--keep-prob", type=float, default=0.25, help="Probability of stacking another mutation.")
    parser.add_argument("--no-narrow", action="store_true", help="Skip post-search diff minimization.")
    parser.add_argument("--save-replay", help="Optional replay JSON path to write if a best candidate is found.")
    parser.add_argument("--apply", choices=("never", "match", "always"), default="never", help="Whether permute.py may write the best candidate.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    mutate_functions = split_symbols(args.mutate_function, args.mutate_functions)
    jobs = clamp_int(args.jobs, default=DEFAULT_JOBS, minimum=1, maximum=MAX_JOBS)
    command_args = [
        args.function,
        *mutate_functions,
        "-j",
        str(jobs),
        "--batch",
        str(min(16, clamp_int(args.max_iters, default=32, minimum=1, maximum=10_000))),
        "--timeout",
        str(clamp_int(args.timeout_seconds, default=90, minimum=5, maximum=900)),
        "--seed",
        str(args.seed),
        "--keep-prob",
        str(args.keep_prob),
        "--max-iters",
        str(clamp_int(args.max_iters, default=32, minimum=1, maximum=10_000)),
        "--apply",
        args.apply,
    ]
    if args.no_narrow:
        command_args.append("--no-narrow")
    if args.save_replay:
        command_args.extend(["--save-replay", args.save_replay])

    repo_root = resolve_repo_root(args.repo_root)
    payload = run_tool_script(
        "permute.py",
        command_args,
        repo_root=repo_root,
        operation="source_permuter:run",
        timeout_seconds=clamp_int(args.timeout_seconds + 120, default=210, minimum=30, maximum=1500),
    )
    payload.update(
        {
            "function": args.function,
            "mutate_functions": mutate_functions or [args.function],
            "max_iters": clamp_int(args.max_iters, default=32, minimum=1, maximum=10_000),
            "jobs": jobs,
            "requested_jobs": args.jobs,
            "apply": args.apply,
        }
    )
    print_json(payload)


if __name__ == "__main__":
    main()
