#!/usr/bin/env python3
"""Query the prebuilt type-layout index."""

from __future__ import annotations

import argparse
import difflib
import json
from pathlib import Path
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
TOOLPACK_ROOT = TOOL_ROOT.parents[1]
sys.path.append(str(TOOLPACK_ROOT / "_shared"))
sys.path.append(str(TOOLPACK_ROOT / "_impl" / "gamecube" / "dsearch"))

from search_index import tool_storage_roots  # type: ignore
import typeidx  # type: ignore


INDEX_RELATIVE_PATH = Path("indexes") / "type_layout_index.json"
RUNNER_COMMAND = (
    "python3 toolpacks/gamecube-decomp/research/type_layout_lookup/"
    "runners/build_type_index.py --repo-root <built_melee_repo>"
)


def storage_roots(index_root: Path | None = None) -> list[Path]:
    roots: list[Path] = []
    if index_root is not None:
        roots.append(index_root.expanduser())
    for root in tool_storage_roots(TOOL_ROOT):
        if root not in roots:
            roots.append(root)
    return roots


def load_index(index_root: Path | None = None) -> tuple[dict[str, Any] | None, Path | None, list[Path]]:
    roots = storage_roots(index_root)
    for root in roots:
        path = root / INDEX_RELATIVE_PATH
        if not path.is_file():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(payload, dict) and isinstance(payload.get("records"), dict) and payload["records"]:
            return payload, path, roots
    return None, None, roots


def missing_index_payload(roots: list[Path]) -> dict[str, Any]:
    return {
        "status": "index_not_built",
        "guidance": (
            "The type-layout index has not been built. Do not retry this lookup. "
            "An operator must generate build/ctx.c in a built melee checkout and run the index builder."
        ),
        "runner": RUNNER_COMMAND,
        "storage_roots": [str(root) for root in roots],
    }


def suggestions(index: dict[str, Any], record: str, limit: int = 10) -> list[str]:
    names = sorted(index["records"])
    aliases = sorted(index.get("typedefs", {}))
    candidates = names + [alias for alias in aliases if alias not in names]
    return difflib.get_close_matches(record, candidates, n=limit, cutoff=0.25)


def record_summary(index: dict[str, Any], name: str) -> dict[str, Any]:
    record = index["records"][name]
    return {
        "name": name,
        "display_name": typeidx.display_name(index, name),
        "size": record["size"],
        "align": record["align"],
        "n_fields": record["n_fields"],
        "n_leaves": len(record["leaves"]),
        "signature": record["sig"],
        "pad_fraction": record["pad_frac"],
    }


def duplicate_group(index: dict[str, Any], name: str) -> list[str]:
    for group in index.get("dup_groups") or typeidx.dup_groups(index):
        if name in group:
            return list(group)
    return []


def format_dup_group(index: dict[str, Any], group: list[str]) -> dict[str, Any]:
    first = index["records"][group[0]]
    return {
        "size": first["size"],
        "n_leaves": len(first["leaves"]),
        "records": list(group),
        "display_names": [typeidx.display_name(index, name) for name in group],
    }


def cast_rows(index: dict[str, Any]) -> list[dict[str, Any]]:
    scan = index.get("cast_scan")
    if not isinstance(scan, dict):
        return []
    rows = scan.get("rows")
    return rows if isinstance(rows, list) else []


def casts_for_record(index: dict[str, Any], name: str) -> list[dict[str, Any]]:
    return [row for row in cast_rows(index) if row.get("record") == name]


def provenance(index: dict[str, Any], index_path: Path) -> dict[str, Any]:
    return {
        "index_path": str(index_path),
        "schema_version": index.get("schema_version"),
        "built_at": index.get("built_at"),
        "vendor_commit": index.get("vendor_commit"),
        "project": index.get("project"),
        "ctx": index.get("ctx"),
    }


def summary_payload(index: dict[str, Any], index_path: Path, limit: int) -> dict[str, Any]:
    groups = index.get("dup_groups") or typeidx.dup_groups(index)
    rows = cast_rows(index)
    overlays = [row for row in rows if row.get("flags", {}).get("overlay_view")]
    cast_scan = index.get("cast_scan") if isinstance(index.get("cast_scan"), dict) else {}
    return {
        "status": "ok",
        "mode": "summary",
        "counts": {
            "records": len(index["records"]),
            "duplicate_groups": len(groups),
            "duplicate_records": sum(len(group) for group in groups),
            "cast_records": len(rows),
            "cast_only_overlay_types": len(overlays),
        },
        "top_duplicate_groups": [format_dup_group(index, group) for group in groups[:limit]],
        "flagged_cast_only_overlay_types": overlays[:limit],
        "cast_scan_available": bool(cast_scan.get("available")),
        "index": provenance(index, index_path),
    }


def record_payload(
    index: dict[str, Any],
    index_path: Path,
    record_query: str,
    mode: str,
    byte_offset: int | None,
    prefix: bool,
    limit: int,
) -> dict[str, Any]:
    try:
        name = typeidx.find_record(index, record_query)
    except KeyError:
        return {
            "status": "record_not_indexed",
            "record": record_query,
            "suggestions": suggestions(index, record_query),
            "index": provenance(index, index_path),
        }
    base: dict[str, Any] = {
        "status": "ok",
        "mode": mode,
        "record": record_summary(index, name),
        "index": provenance(index, index_path),
    }
    if mode == "near":
        base["near"] = [
            {"similarity": round(score, 6), **record_summary(index, candidate)}
            for score, candidate in typeidx.near(index, name, limit)
        ]
        base["duplicate_group"] = duplicate_group(index, name)
        base["union_views"] = typeidx.union_views(index, name)
        base["cast_flags"] = casts_for_record(index, name)
    elif mode == "dups":
        group = duplicate_group(index, name)
        base["duplicate_group"] = format_dup_group(index, group) if group else None
        if prefix:
            base["prefix_pairs"] = [
                {"prefix": short, "extended": long}
                for short, long in typeidx.prefix_pairs(index) if name in (short, long)
            ][:limit]
    elif mode == "unions":
        if byte_offset is None:
            base["union_views"] = typeidx.union_views(index, name)
        else:
            base["at"] = byte_offset
            base["members"] = [
                {"path": path, "start": start}
                for path, start in typeidx.members_at(index, name, byte_offset)
            ]
    elif mode == "casts":
        scan = index.get("cast_scan") if isinstance(index.get("cast_scan"), dict) else {}
        if not scan.get("available"):
            return {
                "status": "cast_scan_unavailable",
                "record": record_summary(index, name),
                "guidance": "Rebuild the index without --skip-casts from a checkout with its src tree.",
                "runner": RUNNER_COMMAND,
                "index": provenance(index, index_path),
            }
        base["casts"] = casts_for_record(index, name)
    return base


def build_payload(
    record: str | None = None,
    mode: str | None = None,
    at: str | None = None,
    prefix: bool = False,
    limit: int = 15,
    index_root: Path | None = None,
) -> dict[str, Any]:
    index, index_path, roots = load_index(index_root)
    if index is None or index_path is None:
        return missing_index_payload(roots)
    selected_mode = mode or ("near" if record else "summary")
    bounded_limit = max(1, limit)
    if selected_mode == "summary":
        return summary_payload(index, index_path, bounded_limit)
    if selected_mode == "dups" and not record:
        groups = index.get("dup_groups") or typeidx.dup_groups(index)
        payload: dict[str, Any] = {
            "status": "ok",
            "mode": "dups",
            "duplicate_groups": [format_dup_group(index, group) for group in groups[:bounded_limit]],
            "index": provenance(index, index_path),
        }
        if prefix:
            payload["prefix_pairs"] = [
                {"prefix": short, "extended": long}
                for short, long in typeidx.prefix_pairs(index)[:bounded_limit]
            ]
        return payload
    if selected_mode == "casts" and not record:
        scan = index.get("cast_scan") if isinstance(index.get("cast_scan"), dict) else {}
        if not scan.get("available"):
            return {
                "status": "cast_scan_unavailable",
                "guidance": "Rebuild the index without --skip-casts from a checkout with its src tree.",
                "runner": RUNNER_COMMAND,
                "index": provenance(index, index_path),
            }
        return {
            "status": "ok",
            "mode": "casts",
            "casts": cast_rows(index)[:bounded_limit],
            "index": provenance(index, index_path),
        }
    if not record:
        return {
            "status": "record_required",
            "mode": selected_mode,
            "guidance": f"--record is required for {selected_mode} mode.",
            "index": provenance(index, index_path),
        }
    try:
        byte_offset = int(at, 0) if at is not None else None
    except ValueError:
        return {"status": "invalid_offset", "at": at, "guidance": "Use a decimal byte offset or 0x-prefixed hexadecimal offset."}
    return record_payload(index, index_path, record, selected_mode, byte_offset, prefix, bounded_limit)


def main() -> int:
    parser = argparse.ArgumentParser(description="Query normalized PPC-EABI type layouts.")
    parser.add_argument("--record", help="Record name, tag, or typedef alias.")
    parser.add_argument("--mode", choices=("dups", "near", "unions", "casts", "summary"))
    parser.add_argument("--at", help="Byte offset for unions mode, decimal or 0x-prefixed.")
    parser.add_argument("--prefix", action="store_true", help="Include truncated-layout prefix pairs in dups mode.")
    parser.add_argument("--limit", type=int, default=15)
    parser.add_argument("--index-root", type=Path, help="Explicit tool storage root, used by the sandbox fetch-first cache.")
    parser.add_argument("--json", action="store_true", help="Emit JSON. Output is JSON in all modes for stable worker parsing.")
    args = parser.parse_args()
    print(json.dumps(build_payload(args.record, args.mode, args.at, args.prefix, args.limit, args.index_root), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
