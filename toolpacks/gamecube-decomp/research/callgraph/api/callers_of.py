#!/usr/bin/env python3
"""Look up callers, callees, and symbolized data references."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))

from search_index import tool_storage_roots  # type: ignore


CALLS_INDEX = Path("indexes") / "calls.jsonl"
DATA_REFS_INDEX = Path("indexes") / "data_refs.jsonl"
DIRECTIONS = ("callers", "callees", "refs", "refed_by")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict):
                rows.append(row)
    return rows


def load_rows(relative_path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for storage_root in tool_storage_roots(TOOL_ROOT):
        for row in read_jsonl(storage_root / relative_path):
            key = str(row.get("id") or json.dumps(row, sort_keys=True))
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
    return rows


def lookup_rows(symbol: str, direction: str, unit: str | None = None) -> list[dict[str, Any]]:
    if direction == "callers":
        relative_path = CALLS_INDEX
        symbol_field = "callee_symbol"
    elif direction == "callees":
        relative_path = CALLS_INDEX
        symbol_field = "symbol"
    elif direction == "refs":
        relative_path = DATA_REFS_INDEX
        symbol_field = "symbol"
    elif direction == "refed_by":
        relative_path = DATA_REFS_INDEX
        symbol_field = "ref_symbol"
    else:
        raise ValueError(f"unsupported direction: {direction}")

    return [
        row
        for row in load_rows(relative_path)
        if row.get(symbol_field) == symbol and (unit is None or row.get("unit") == unit)
    ]


def build_payload(symbol: str, direction: str, unit: str | None, limit: int) -> dict[str, Any]:
    rows = lookup_rows(symbol, direction, unit)[:limit]
    return {
        "query": symbol,
        "direction": direction,
        "rows": rows,
        "row_count": len(rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Look up callgraph and data-reference edges for a symbol.")
    parser.add_argument("--symbol", required=True, help="Exact caller, callee, or referenced symbol.")
    parser.add_argument("--unit", help="Restrict results to an exact caller unit.")
    parser.add_argument("--direction", choices=DIRECTIONS, default="callers", help="Edge direction to query.")
    parser.add_argument("--limit", type=int, default=25, help="Maximum number of rows to return.")
    args = parser.parse_args()
    print(json.dumps(build_payload(args.symbol, args.direction, args.unit, max(1, args.limit)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
