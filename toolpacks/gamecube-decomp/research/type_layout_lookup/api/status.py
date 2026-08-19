#!/usr/bin/env python3
"""Report type-layout index readiness."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT / "api"))

from layout_lookup import INDEX_RELATIVE_PATH, load_index, storage_roots  # type: ignore


def build_payload(index_root: Path | None = None) -> dict[str, Any]:
    index, index_path, roots = load_index(index_root)
    files = [{"path": str(root / INDEX_RELATIVE_PATH), "exists": (root / INDEX_RELATIVE_PATH).is_file()} for root in roots]
    if index is None or index_path is None:
        return {
            "tool": "type_layout_lookup",
            "available": False,
            "status": "index_not_built",
            "record_count": 0,
            "cast_scan_available": False,
            "index_files": files,
            "storage_roots": [str(root) for root in roots],
        }
    cast_scan = index.get("cast_scan") if isinstance(index.get("cast_scan"), dict) else {}
    return {
        "tool": "type_layout_lookup",
        "available": True,
        "status": "ready",
        "record_count": len(index["records"]),
        "duplicate_group_count": len(index.get("dup_groups") or []),
        "cast_scan_available": bool(cast_scan.get("available")),
        "cast_record_count": len(cast_scan.get("rows") or []),
        "manifest": {
            "schema_version": index.get("schema_version"),
            "built_at": index.get("built_at"),
            "vendor_commit": index.get("vendor_commit"),
            "project": index.get("project"),
            "ctx": index.get("ctx"),
        },
        "index_path": str(index_path),
        "index_files": files,
        "storage_roots": [str(root) for root in roots],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Report type-layout index status.")
    parser.add_argument("--index-root", type=Path, help="Explicit tool storage root.")
    parser.add_argument("--json", action="store_true", help="Emit JSON. Output is JSON in all modes.")
    args = parser.parse_args()
    print(json.dumps(build_payload(args.index_root), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

