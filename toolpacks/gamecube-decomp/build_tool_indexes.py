#!/usr/bin/env python3
"""Build lightweight local indexes for registered worker tool APIs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable


SCRIPT_PATH = Path(__file__).resolve()
TOOLS_ROOT = SCRIPT_PATH.parent
sys.path.append(str(TOOLS_ROOT / "_shared"))
from search_index import package_root_for_tool, project_knowledge_root, tool_storage_root  # type: ignore

BUILD_ID = os.environ.get("ORCH_GAME_BUILD_ID") or "GALE01"

PACKAGE_ROOT = package_root_for_tool(TOOLS_ROOT)
PROJECT_KNOWLEDGE_ROOT = project_knowledge_root(TOOLS_ROOT)
TOOL_RESOURCE_PATHS = {
    "ghidra": TOOLS_ROOT / "research" / "ghidra",
    "opseq": TOOLS_ROOT / "research" / "opseq",
    "mismatch_db": TOOLS_ROOT / "research" / "mismatch_db",
    "mwcc_debug": TOOLS_ROOT / "compiler" / "mwcc_debug",
}
TOOL_STORAGE_PATHS = {
    tool_id: tool_storage_root(path) for tool_id, path in TOOL_RESOURCE_PATHS.items()
}


def parse_args() -> argparse.Namespace:
    """Parse CLI options for regenerating lightweight suite indexes."""

    parser = argparse.ArgumentParser(description="Generate local JSONL indexes for registered tool APIs.")
    parser.add_argument("--repo-root", type=Path, default=PACKAGE_ROOT.parent / "melee")
    return parser.parse_args()


def read_json(path: Path, default: Any) -> Any:
    """Read a JSON file, returning ``default`` when it is absent."""

    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    """Write rows to a JSONL file and return the number written."""

    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False))
            f.write("\n")
            count += 1
    return count


def report_functions(repo_root: Path) -> list[dict[str, Any]]:
    """Load function rows from the target checkout report or local fallback."""

    report_path = repo_root / "build" / BUILD_ID / "report.json"
    report = read_json(report_path, {})
    functions: list[dict[str, Any]] = []
    for unit in report.get("units") or []:
        if not isinstance(unit, dict):
            continue
        unit_name = str(unit.get("name") or "")
        metadata = unit.get("metadata") if isinstance(unit.get("metadata"), dict) else {}
        source_path = str(metadata.get("source_path") or "")
        for fn in unit.get("functions") or []:
            if not isinstance(fn, dict):
                continue
            fn_metadata = fn.get("metadata") if isinstance(fn.get("metadata"), dict) else {}
            address = format_address(fn_metadata.get("virtual_address"))
            symbol = str(fn.get("name") or "")
            if not symbol:
                continue
            functions.append(
                {
                    "unit": unit_name,
                    "source_path": source_path,
                    "symbol": symbol,
                    "address": address,
                    "size": fn.get("size"),
                    "fuzzy_match_percent": fn.get("fuzzy_match_percent"),
                    "evidence_ref": str(report_path),
                }
            )
    if functions:
        return functions
    return indexed_code_graph_functions()


def indexed_code_graph_functions() -> list[dict[str, Any]]:
    """Read fallback function metadata from the orchestrator code graph."""

    index_path = PROJECT_KNOWLEDGE_ROOT / "sources" / "code_context" / "code_graph" / "indexes" / "functions.jsonl"
    functions: list[dict[str, Any]] = []
    if not index_path.exists():
        return functions
    with index_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(row, dict):
                continue
            symbol = str(row.get("symbol") or "")
            if not symbol:
                continue
            functions.append(
                {
                    "unit": str(row.get("unit") or ""),
                    "source_path": str(row.get("sourcePath") or row.get("source_path") or ""),
                    "symbol": symbol,
                    "address": format_address(row.get("address")),
                    "size": row.get("size"),
                    "fuzzy_match_percent": row.get("fuzzy", row.get("fuzzy_match_percent")),
                    "evidence_ref": f"{index_path}#line={line_number}",
                }
            )
    return functions


def format_address(value: Any) -> str:
    """Normalize integer-like report addresses to canonical hex strings."""

    if isinstance(value, int):
        return f"0x{value:08X}"
    if isinstance(value, str) and value.isdigit():
        return f"0x{int(value):08X}"
    return str(value or "")


def build_ghidra_index(repo_root: Path) -> int:
    """Build the source-symbol lookup index consumed by the Ghidra suite."""

    rows = []
    for fn in report_functions(repo_root):
        text = " ".join(str(fn.get(field) or "") for field in ("symbol", "address", "source_path", "unit", "size", "fuzzy_match_percent"))
        rows.append(
            {
                "id": f"source_symbol:{fn['unit']}:{fn['symbol']}",
                "kind": "source_symbol_lookup",
                "title": f"Source symbol lookup: {fn['symbol']}",
                "symbol": fn["symbol"],
                "address": fn["address"],
                "source_path": fn["source_path"],
                "unit": fn["unit"],
                "text": text,
                "evidence_ref": str(fn.get("evidence_ref") or repo_root / "build" / BUILD_ID / "report.json"),
                "payload": fn,
            }
        )
    return write_jsonl(TOOL_STORAGE_PATHS["ghidra"] / "indexes" / "symbol_lookup.jsonl", rows)


def build_opseq_index(repo_root: Path) -> int:
    """Build the report-derived function-shape index for opseq."""

    rows = []
    for fn in report_functions(repo_root):
        size = safe_int(fn.get("size"))
        fuzzy = safe_float(fn.get("fuzzy_match_percent"))
        size_bucket = "unknown"
        if size:
            size_bucket = f"{(size // 64) * 64}-{((size // 64) + 1) * 64 - 1}"
        status = "matched" if fuzzy >= 100 else "unmatched"
        rows.append(
            {
                "id": f"function_shape:{fn['unit']}:{fn['symbol']}",
                "kind": "function_shape_lookup",
                "title": f"Function shape lookup: {fn['symbol']}",
                "symbol": fn["symbol"],
                "source_path": fn["source_path"],
                "unit": fn["unit"],
                "address": fn["address"],
                "text": f"{fn['symbol']} {fn['source_path']} {fn['unit']} size {size} bucket {size_bucket} {status}",
                "evidence_ref": str(fn.get("evidence_ref") or repo_root / "build" / BUILD_ID / "report.json"),
                "payload": {**fn, "size_bucket": size_bucket, "status": status},
            }
        )
    return write_jsonl(TOOL_STORAGE_PATHS["opseq"] / "indexes" / "function_shapes.jsonl", rows)


def write_removed_reference_indexes() -> dict[str, int]:
    """Clear indexes that previously mirrored the deleted legacy-doc archive."""

    return {
        "mismatch_db": write_jsonl(TOOL_STORAGE_PATHS["mismatch_db"] / "indexes" / "patterns.jsonl", []),
        "mwcc_debug": write_jsonl(TOOL_STORAGE_PATHS["mwcc_debug"] / "indexes" / "dumps.jsonl", []),
    }


def safe_int(value: Any) -> int:
    """Convert a loose JSON value to int with zero fallback."""

    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def safe_float(value: Any) -> float:
    """Convert a loose JSON value to float with zero fallback."""

    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def main() -> int:
    """Regenerate all lightweight tool indexes."""

    args = parse_args()
    repo_root = args.repo_root.resolve()
    stats = {
        "ghidra": build_ghidra_index(repo_root),
        "opseq": build_opseq_index(repo_root),
        **write_removed_reference_indexes(),
    }
    print(json.dumps({"repo_root": str(repo_root), "stats": stats}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
