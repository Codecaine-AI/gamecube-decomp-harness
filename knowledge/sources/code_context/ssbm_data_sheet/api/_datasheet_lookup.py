from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Callable

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from source_index import (  # type: ignore
    address_query,
    data_path_status,
    format_result,
    index_files,
    load_index_rows,
    load_source_descriptor,
    offset_query,
    package_root_for_source,
    print_payload,
    searchable_text,
    source_root_from_api_file,
    status_payload,
)


SOURCE_TYPE_PRIORITY = {
    "codebase_function": 90,
    "data_symbol": 85,
    "local_lesson": 80,
    "source_reference": 65,
    "sheet_reconciliation": 45,
}


def run_datasheet_search(
    api_file: str,
    argv: list[str] | None = None,
    *,
    query_builder: Callable[[argparse.Namespace], str] | None = None,
) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", default="")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--address", default="")
    parser.add_argument("--offset", default="")
    parser.add_argument("--type", default="")
    parser.add_argument("--tool", default="")
    args = parser.parse_args(argv)
    query = query_builder(args) if query_builder else args.query
    if not query:
        parser.error("a query value is required")
    payload = datasheet_search_payload(source_root_from_api_file(api_file), query, args.limit)
    print_payload(payload, bool(args.json))


def run_datasheet_status(api_file: str, argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    source_root = source_root_from_api_file(api_file)
    payload = status_payload(source_root)
    raw_rows = load_index_rows(source_root)
    rows = filter_lookup_rows(raw_rows)
    source_counts: dict[str, int] = {}
    for row in rows:
        source_type = row_source_type(row)
        source_counts[source_type] = source_counts.get(source_type, 0) + 1
    payload["raw_index_records"] = payload.get("index_records", 0)
    payload["index_records"] = len(rows)
    payload["filtered_generated_csv_rows"] = len(raw_rows) - len(rows)
    payload["generated_facts"] = generated_facts_status(source_root)
    payload["index_record_types"] = source_counts
    payload["data_paths"] = data_path_status(source_root)
    print_payload(payload, bool(args.json))


def datasheet_search_payload(source_root: Path, query: str, limit: int) -> dict[str, Any]:
    descriptor = load_source_descriptor(source_root)
    rows = filter_lookup_rows(load_index_rows(source_root))
    results = ranked_rows(rows, query, limit)
    return {
        "source": descriptor.get("id", source_root.name),
        "query": query,
        "limit": limit,
        "available": bool(rows),
        "results": results,
        "indexes_path": str(source_root / "indexes"),
        "generated_facts": generated_facts_status(source_root),
        "message": "Generated codebase facts and legacy sheet rows are ready for local lookup." if rows else "No generated index rows were found.",
    }


def ranked_rows(rows: list[dict[str, Any]], query: str, limit: int) -> list[dict[str, Any]]:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9_./:-]+", query) if len(term) >= 2]
    phrase = query.lower().strip()
    normalized_query_address = normalize_address(query, min_hex_digits=6)
    scored: list[tuple[float, int, dict[str, Any]]] = []
    for row in rows:
        text = searchable_text(row).lower()
        base_score = 0.0
        if phrase and phrase in text:
            base_score += 10
        matched_terms = 0
        for term in terms:
            if term in text:
                base_score += 1
                matched_terms += 1
        if base_score <= 0:
            continue
        priority = row_priority(row)
        coverage_bonus = (matched_terms / len(terms) * 30) if terms else 0
        score = base_score + coverage_bonus + priority / 10
        symbol = str(row.get("symbol") or nested_payload_value(row, "symbol") or "").lower()
        source_path = str(row.get("source_path") or nested_payload_value(row, "source_path") or "").lower()
        address = normalize_address(str(row.get("address") or nested_payload_value(row, "address") or ""), min_hex_digits=6)
        if phrase and symbol and phrase == symbol:
            score += 50
        if normalized_query_address and address == normalized_query_address:
            score += 60
        if phrase and source_path and phrase == source_path:
            score += 35
        scored.append((score, priority, row))
    scored.sort(key=lambda item: (-item[0], -item[1], len(searchable_text(item[2]))))
    results = []
    for score, priority, row in scored[:limit]:
        result = format_result(row, int(round(score)))
        result["lookup_source"] = row_source_type(row)
        result["lookup_priority"] = priority
        result["trust_tier"] = nested_payload_value(row, "trust_tier") or ("external_hint" if priority < 45 else "local")
        results.append(result)
    return results


def filter_lookup_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if not is_generated_csv_cell(row)]


def is_generated_csv_cell(row: dict[str, Any]) -> bool:
    payload = row.get("payload")
    if not isinstance(payload, dict):
        return False
    source_csv = str(payload.get("source_csv") or "")
    return source_csv.startswith("generated/")


def row_priority(row: dict[str, Any]) -> int:
    return SOURCE_TYPE_PRIORITY.get(row_source_type(row), 10)


def row_source_type(row: dict[str, Any]) -> str:
    source_type = str(row.get("source_type") or row.get("kind") or nested_payload_value(row, "source_type") or "")
    if source_type:
        return source_type
    return "legacy_sheet_row"


def nested_payload_value(row: dict[str, Any], key: str) -> Any:
    payload = row.get("payload")
    if isinstance(payload, dict):
        return payload.get(key)
    return None


def normalize_address(value: str, *, min_hex_digits: int = 2) -> str:
    text = value.strip()
    match = re.search(r"0x[0-9A-Fa-f]{2,8}", text)
    if not match:
        return ""
    if len(match.group(0)) - 2 < min_hex_digits:
        return ""
    try:
        return f"0x{int(match.group(0), 16):08X}"
    except ValueError:
        return match.group(0)


def generated_facts_status(source_root: Path) -> dict[str, Any]:
    meta_path = source_root / "indexes" / "codebase_facts.meta.json"
    index_path = source_root / "indexes" / "codebase_facts.jsonl"
    meta = read_json(meta_path, {})
    package_root = package_root_for_source(source_root)
    repo_root = Path(str(meta.get("repo_root") or package_root / "projects" / "melee" / "checkout"))
    current = current_input_fingerprints(repo_root, package_root)
    stored = meta.get("inputs") if isinstance(meta.get("inputs"), dict) else {}
    stale_inputs = [key for key, value in current.items() if stored.get(key) != value]
    return {
        "available": index_path.exists() and meta_path.exists(),
        "status": "fresh" if index_path.exists() and meta_path.exists() and not stale_inputs else "stale",
        "stale": (not index_path.exists()) or (not meta_path.exists()) or bool(stale_inputs),
        "stale_inputs": stale_inputs,
        "index_path": str(index_path),
        "meta_path": str(meta_path),
        "repo_root": str(repo_root),
        "generated_at": meta.get("generated_at"),
        "stats": meta.get("stats", {}),
        "declared_index_files": [str(path) for path in index_files(source_root)],
    }


def current_input_fingerprints(repo_root: Path, package_root: Path) -> dict[str, Any]:
    return {
        "report_json": file_stamp(repo_root / "build" / "GALE01" / "report.json"),
        "objdiff_json": file_stamp(repo_root / "objdiff.json"),
        "symbols_txt": file_stamp(repo_root / "config" / "GALE01" / "symbols.txt"),
        "splits_txt": file_stamp(repo_root / "config" / "GALE01" / "splits.txt"),
        "code_graph_functions": file_stamp(package_root / "knowledge" / "sources" / "code_context" / "code_graph" / "indexes" / "functions.jsonl"),
        "code_graph_files": file_stamp(package_root / "knowledge" / "sources" / "code_context" / "code_graph" / "indexes" / "files.jsonl"),
        "knowledge_curator_updates": file_stamp(package_root / "knowledge" / "resource_graph" / "enrichments" / "knowledge_curator_updates.jsonl"),
        "source_tree": tree_stamp(repo_root, ["src", "include"]),
    }


def file_stamp(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "exists": False}
    stat = path.stat()
    return {"path": str(path), "exists": True, "size": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def tree_stamp(repo_root: Path, rel_roots: list[str]) -> dict[str, Any]:
    digest = hashlib.sha1()
    count = 0
    for rel_root in rel_roots:
        root = repo_root / rel_root
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix not in {".c", ".h", ".hpp", ".cpp", ".inc"}:
                continue
            try:
                stat = path.stat()
                rel_path = path.relative_to(repo_root).as_posix()
            except OSError:
                continue
            digest.update(f"{rel_path}\0{stat.st_size}\0{stat.st_mtime_ns}\n".encode("utf-8", errors="replace"))
            count += 1
    return {"roots": [str(repo_root / rel_root) for rel_root in rel_roots], "exists": count > 0, "file_count": count, "fingerprint": digest.hexdigest()}


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


__all__ = [
    "address_query",
    "offset_query",
    "run_datasheet_search",
    "run_datasheet_status",
]
