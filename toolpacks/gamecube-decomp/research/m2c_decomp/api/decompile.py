#!/usr/bin/env python3
"""Run tool-local decomp.py/m2c for a function or translation unit."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import clamp_int, print_json, resolve_repo_root, run_tool_script


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--input", required=True, help="Function symbol or translation unit path.")
    parser.add_argument("--no-context", action="store_true", help="Skip m2ctx context generation.")
    parser.add_argument("--prepared-context", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--format", action="store_true", help="Format m2c output with clang-format if available.")
    parser.add_argument("--extra-arg", action="append", default=[], help="Additional m2c argument; may repeat.")
    parser.add_argument("--timeout-seconds", type=int, default=120, help="Maximum runtime for decompilation.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    command_args: list[str] = ["--no-copy"]
    if args.no_context or args.prepared_context:
        command_args.append("--no-context")
    format_applied = bool(args.format and shutil.which("clang-format"))
    format_skip_reason = "clang-format not found" if args.format and not format_applied else None
    if format_applied:
        command_args.append("--format")
    command_args.append(args.input)
    command_args.extend(args.extra_arg)

    repo_root = resolve_repo_root(args.repo_root)
    payload = run_tool_script(
        "decomp.py",
        command_args,
        repo_root=repo_root,
        operation="m2c_decomp:decompile",
        timeout_seconds=clamp_int(args.timeout_seconds, default=120, minimum=10, maximum=600),
    )
    payload.update(
        {
            "input": args.input,
            "no_context": bool(args.no_context),
            "format": format_applied,
            "format_requested": bool(args.format),
            "format_applied": format_applied,
            "format_skip_reason": format_skip_reason,
            "extra_args": args.extra_arg,
        }
    )
    print_json(payload)


if __name__ == "__main__":
    main()
