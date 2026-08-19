#!/usr/bin/env python3
# Vendored from https://github.com/MarkMcCaskey/decomp-scripts at commit
# 88f0abe02080a1d3f19df3aebf551dc5fb226442 under the MIT License.
# Copyright (c) 2026 Mark McCaskey.
# Original path: mwcc/compare_coloring_snapshots.py
# Local modifications:
# - Make the sibling allocator_snapshot import explicit.
# - Add --json output using the mwcc-coloring-compare-v1 format.
"""Compare two GC/1.2.5 coloring snapshots by virtual register."""

import argparse
import json
from pathlib import Path
import sys


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from allocator_snapshot import validate_coloring_snapshot


NODE_FIELDS = (
    "object",
    "spill_cost",
    "degree",
    "physical_register",
    "flags",
    "neighbors",
)


def load_snapshot(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        snapshot = json.load(stream)
    validate_coloring_snapshot(snapshot)
    return snapshot


def compare_snapshots(before: dict, after: dict) -> list[dict]:
    validate_coloring_snapshot(before)
    validate_coloring_snapshot(after)
    if before.get("register_class") != after.get("register_class"):
        raise ValueError("snapshots use different register classes")

    before_nodes = {node["virtual_register"]: node for node in before["nodes"]}
    after_nodes = {node["virtual_register"]: node for node in after["nodes"]}
    before_order = {
        register: index for index, register in enumerate(before["simplify_order"])
    }
    after_order = {
        register: index for index, register in enumerate(after["simplify_order"])
    }

    changes = []
    for register in sorted(set(before_nodes) | set(after_nodes)):
        old = before_nodes.get(register)
        new = after_nodes.get(register)
        if old is None or new is None:
            changes.append(
                {
                    "virtual_register": register,
                    "status": "added" if old is None else "removed",
                    "fields": {},
                    "simplify_order": (
                        before_order.get(register),
                        after_order.get(register),
                    ),
                }
            )
            continue

        fields = {
            field: (old.get(field), new.get(field))
            for field in NODE_FIELDS
            if old.get(field) != new.get(field)
        }
        order = (before_order.get(register), after_order.get(register))
        if fields or order[0] != order[1]:
            changes.append(
                {
                    "virtual_register": register,
                    "status": "changed",
                    "fields": fields,
                    "simplify_order": order,
                }
            )
    return changes


def format_value(value: object) -> str:
    if value is None:
        return "-"
    if isinstance(value, list):
        return "[" + ",".join(str(item) for item in value) + "]"
    return str(value)


def print_changes(changes: list[dict]) -> None:
    if not changes:
        print("No coloring-node or simplify-order changes")
        return

    for change in changes:
        register = change["virtual_register"]
        status = change["status"]
        print(f"v{register}: {status}")
        old_order, new_order = change["simplify_order"]
        if old_order != new_order:
            print(
                "  simplify_order: "
                f"{format_value(old_order)} -> {format_value(new_order)}"
            )
        for field, (old, new) in change["fields"].items():
            print(f"  {field}: {format_value(old)} -> {format_value(new)}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare two mwcc-coloring-snapshot-v1 files"
    )
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    before = load_snapshot(args.before)
    after = load_snapshot(args.after)
    changes = compare_snapshots(before, after)
    if args.json:
        print(
            json.dumps(
                {
                    "format": "mwcc-coloring-compare-v1",
                    "before": str(args.before.resolve()),
                    "after": str(args.after.resolve()),
                    "register_class": before["register_class"],
                    "changes": changes,
                    "change_count": len(changes),
                },
                indent=2,
            )
        )
    else:
        print_changes(changes)


if __name__ == "__main__":
    main()
