#!/usr/bin/env python3
"""Capture MWCC register-allocator state for one function."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys


SANDBOX_REQUIRED_GUIDANCE = (
    "mwcc_alloc_snapshot captures run inside the Linux sandbox; attach a "
    "sandbox-backed worker claim or run in the sandbox image."
)


def print_json(payload: dict) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument(
        "--unit",
        required=True,
        help="Translation unit relative to the project root.",
    )
    parser.add_argument("--function", required=True, help="Function symbol to capture.")
    parser.add_argument(
        "--capture",
        choices=("pcode", "coloring", "pair"),
        default="pair",
        help="Allocator state to capture.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=900,
        help="Maximum runtime for the build and qemu/gdb capture.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    gdb_path = shutil.which("gdb-multiarch")
    qemu_path = shutil.which("qemu-i386")
    if not gdb_path or not qemu_path:
        print_json(
            {
                "status": "sandbox_required",
                "guidance": SANDBOX_REQUIRED_GUIDANCE,
            }
        )
        return

    capture_script = Path(__file__).resolve().parents[1] / "sandbox" / "mwcc_alloc_capture.py"
    command = [
        sys.executable,
        str(capture_script),
        "--unit",
        args.unit,
        "--function",
        args.function,
        "--capture",
        args.capture,
        "--timeout-seconds",
        str(args.timeout_seconds),
        "--json",
    ]
    if args.repo_root:
        command.extend(("--repo-root", args.repo_root))

    os.execv(sys.executable, command)


if __name__ == "__main__":
    main()
