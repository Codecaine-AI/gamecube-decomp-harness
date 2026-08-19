#!/usr/bin/env python3
"""Compare two MWCC coloring snapshots by virtual register."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


SANDBOX_DIR = Path(__file__).resolve().parents[1] / "sandbox"
sys.path.insert(0, str(SANDBOX_DIR))

from allocator_snapshot import validate_coloring_snapshot  # noqa: E402
from compare_coloring_snapshots import compare_snapshots  # noqa: E402


def resolve_path(raw_path: str, repo_root: Path) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = repo_root / path
    return path.resolve()


def load_snapshot(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        snapshot = json.load(stream)
    if not isinstance(snapshot, dict):
        raise ValueError(f"{path} must contain a JSON object")
    validate_coloring_snapshot(snapshot)
    return snapshot


def print_json(payload: dict) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", required=True, help="Coloring snapshot before selection.")
    parser.add_argument("--after", required=True, help="Coloring snapshot after selection.")
    parser.add_argument("--repo-root", help="Root used to resolve relative snapshot paths.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).expanduser().resolve() if args.repo_root else Path.cwd()
    before_path = resolve_path(args.before, repo_root)
    after_path = resolve_path(args.after, repo_root)

    try:
        before = load_snapshot(before_path)
        after = load_snapshot(after_path)
        changes = compare_snapshots(before, after)
    except (
        OSError,
        ValueError,
        TypeError,
        KeyError,
        AttributeError,
        json.JSONDecodeError,
    ) as error:
        print_json({"status": "snapshot_invalid", "error": str(error)})
        return

    print_json(
        {
            "format": "mwcc-coloring-compare-v1",
            "before": str(before_path),
            "after": str(after_path),
            "register_class": before["register_class"],
            "changes": changes,
            "change_count": len(changes),
        }
    )


if __name__ == "__main__":
    main()
