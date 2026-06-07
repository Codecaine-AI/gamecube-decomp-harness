#!/usr/bin/env python3
"""Build lightweight local indexes for knowledge tool APIs."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable


SCRIPT_PATH = Path(__file__).resolve()
TOOLS_ROOT = SCRIPT_PATH.parent
PACKAGE_ROOT = TOOLS_ROOT.parent.parent
REFERENCE_DOCS_ROOT = PACKAGE_ROOT / "knowledge" / "sources" / "reference_docs" / "data" / "docs"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate local JSONL indexes for knowledge tool APIs.")
    parser.add_argument("--repo-root", type=Path, default=PACKAGE_ROOT.parent)
    return parser.parse_args()


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False))
            f.write("\n")
            count += 1
    return count


def report_functions(repo_root: Path) -> list[dict[str, Any]]:
    report_path = repo_root / "build" / "GALE01" / "report.json"
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
    index_path = PACKAGE_ROOT / "knowledge" / "sources" / "code_graph" / "indexes" / "functions.jsonl"
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
    if isinstance(value, int):
        return f"0x{value:08X}"
    if isinstance(value, str) and value.isdigit():
        return f"0x{int(value):08X}"
    return str(value or "")


def build_ghidra_index(repo_root: Path) -> int:
    rows = []
    for fn in report_functions(repo_root):
        text = " ".join(str(fn.get(field) or "") for field in ("symbol", "address", "source_path", "unit", "size", "fuzzy_match_percent"))
        rows.append(
            {
                "id": f"source_symbol:{fn['unit']}:{fn['symbol']}",
                "kind": "source_symbol_fallback",
                "title": f"Source symbol fallback: {fn['symbol']}",
                "symbol": fn["symbol"],
                "address": fn["address"],
                "source_path": fn["source_path"],
                "unit": fn["unit"],
                "text": text,
                "evidence_ref": str(fn.get("evidence_ref") or repo_root / "build" / "GALE01" / "report.json"),
                "payload": fn,
            }
        )
    return write_jsonl(TOOLS_ROOT / "ghidra" / "indexes" / "symbol_lookup.jsonl", rows)


def build_opseq_index(repo_root: Path) -> int:
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
                "kind": "function_shape_fallback",
                "title": f"Function shape fallback: {fn['symbol']}",
                "symbol": fn["symbol"],
                "source_path": fn["source_path"],
                "unit": fn["unit"],
                "address": fn["address"],
                "text": f"{fn['symbol']} {fn['source_path']} {fn['unit']} size {size} bucket {size_bucket} {status}",
                "evidence_ref": str(fn.get("evidence_ref") or repo_root / "build" / "GALE01" / "report.json"),
                "payload": {**fn, "size_bucket": size_bucket, "status": status},
            }
        )
    return write_jsonl(TOOLS_ROOT / "opseq" / "indexes" / "function_shapes.jsonl", rows)


def build_mismatch_index() -> int:
    docs = [
        path
        for path in sorted(REFERENCE_DOCS_ROOT.glob("*.md"))
        if re.search(r"(mwcc|pattern|mismatch|checkdiff|permuter|allocator|stack|register)", path.name, re.I)
    ]
    return write_jsonl(TOOLS_ROOT / "mismatch_db" / "indexes" / "patterns.jsonl", doc_rows("mismatch_pattern", docs))


def build_mwcc_debug_index() -> int:
    docs = [path for path in sorted(REFERENCE_DOCS_ROOT.glob("*.md")) if re.search(r"(mwcc|compiler|pcdump|allocator)", path.name, re.I)]
    return write_jsonl(TOOLS_ROOT / "mwcc_debug" / "indexes" / "dumps.jsonl", doc_rows("mwcc_debug_note", docs))


def doc_rows(kind: str, docs: list[Path]) -> Iterable[dict[str, Any]]:
    for path in docs:
        text = path.read_text(encoding="utf-8", errors="replace")
        for index, chunk in enumerate(split_text(text, 2600), start=1):
            heading = first_heading(chunk)
            yield {
                "id": f"{kind}:{path.name}:{index}",
                "kind": kind,
                "title": f"{path.stem}{': ' + heading if heading else ''}",
                "text": chunk,
                "evidence_ref": str(path),
                "payload": {"path": str(path), "chunk": index, "heading": heading},
            }


def split_text(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    current = ""
    for part in re.split(r"(\n#{1,6}\s+[^\n]+|\n\s*\n)", text):
        if not part:
            continue
        if current and len(current) + len(part) > max_chars:
            chunks.append(current.strip())
            current = ""
        if len(part) > max_chars:
            for index in range(0, len(part), max_chars):
                chunks.append(part[index : index + max_chars].strip())
        else:
            current += part
    if current.strip():
        chunks.append(current.strip())
    return chunks


def first_heading(text: str) -> str:
    match = re.search(r"^#{1,6}\s+(.+)$", text, flags=re.M)
    return match.group(1).strip() if match else ""


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    stats = {
        "ghidra": build_ghidra_index(repo_root),
        "opseq": build_opseq_index(repo_root),
        "mismatch_db": build_mismatch_index(),
        "mwcc_debug": build_mwcc_debug_index(),
    }
    print(json.dumps({"repo_root": str(repo_root), "stats": stats}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
