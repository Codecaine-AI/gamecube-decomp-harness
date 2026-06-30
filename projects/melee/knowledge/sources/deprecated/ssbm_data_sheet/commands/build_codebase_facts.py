#!/usr/bin/env python3
"""Generate codebase-backed facts for the SSBM data-sheet source."""

from __future__ import annotations

import argparse
import csv
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable


RESOURCE_SOURCE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RESOURCE_SOURCE_ROOT.parents[1] / "_shared"))
from source_index import package_root_for_source, project_knowledge_root, source_storage_root

SOURCE_ROOT = source_storage_root(RESOURCE_SOURCE_ROOT)
PROJECT_KNOWLEDGE_ROOT = project_knowledge_root(RESOURCE_SOURCE_ROOT)
GENERATED_DIR = SOURCE_ROOT / "data" / "generated"
INDEX_PATH = SOURCE_ROOT / "indexes" / "codebase_facts.jsonl"
META_PATH = SOURCE_ROOT / "indexes" / "codebase_facts.meta.json"
SOURCE_EXTENSIONS = {".c", ".h", ".hpp", ".cpp", ".inc"}

ADDRESS_RE = re.compile(r"\b0x[0-9A-Fa-f]{6,8}\b")
HEX_LITERAL_RE = re.compile(r"\b0x[0-9A-Fa-f]{2,8}\b")
IDENT_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")
SYMBOL_LINE_RE = re.compile(r"^\s*([^=\s]+)\s*=\s*([A-Za-z0-9_.]+)\s*:\s*(0x[0-9A-Fa-f]+)")
SPLIT_HEADER_RE = re.compile(r"^([A-Za-z0-9_./+-]+\.c):\s*$")
SPLIT_RANGE_RE = re.compile(r"^\s*([A-Za-z0-9_.]+)\s+start:(0x[0-9A-Fa-f]+)\s+end:(0x[0-9A-Fa-f]+)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate SSBM data-sheet facts from the current codebase.")
    parser.add_argument("--repo-root", type=Path, default=None, help="Melee checkout root. Defaults to projects/melee/checkout when present.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable status.")
    parser.add_argument("--check", action="store_true", help="Only report whether generated facts are fresh; do not rewrite files.")
    parser.add_argument("--strict", action="store_true", help="With --check, exit nonzero when facts are missing or stale.")
    parser.add_argument("--max-source-reference-rows", type=int, default=50_000, help="Bound generated source-reference rows.")
    return parser.parse_args()


def package_root() -> Path:
    return package_root_for_source(RESOURCE_SOURCE_ROOT)


def default_repo_root(root: Path) -> Path:
    cwd = Path.cwd().resolve()
    if looks_like_melee_repo(cwd):
        return cwd
    for candidate in (root / "projects" / "melee" / "checkout", root / "checkout", root.parent / "melee"):
        if looks_like_melee_repo(candidate):
            return candidate.resolve()
    return cwd


def looks_like_melee_repo(path: Path) -> bool:
    return (path / "config" / "GALE01").exists() and (path / "src").exists()


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict):
                row.setdefault("_line_number", line_number)
                rows.append(row)
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True, sort_keys=True))
            handle.write("\n")
            count += 1
    return count


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True) + "\n", encoding="utf-8")


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})
            count += 1
    return count


def objdiff_source_map(repo_root: Path) -> dict[str, str]:
    objdiff = read_json(repo_root / "objdiff.json", {})
    by_unit: dict[str, str] = {}
    for unit in objdiff.get("units") or []:
        if not isinstance(unit, dict):
            continue
        metadata = unit.get("metadata") if isinstance(unit.get("metadata"), dict) else {}
        name = str(unit.get("name") or "")
        source_path = str(metadata.get("source_path") or "")
        if name and source_path:
            by_unit[name] = source_path
    return by_unit


def report_function_rows(repo_root: Path, root: Path) -> tuple[list[dict[str, Any]], str]:
    report_path = repo_root / "build" / "GALE01" / "report.json"
    report = read_json(report_path, {})
    source_by_unit = objdiff_source_map(repo_root)
    rows: list[dict[str, Any]] = []
    for unit in report.get("units") or []:
        if not isinstance(unit, dict):
            continue
        unit_name = str(unit.get("name") or "")
        metadata = unit.get("metadata") if isinstance(unit.get("metadata"), dict) else {}
        source_path = str(metadata.get("source_path") or source_by_unit.get(unit_name) or "")
        for fn in unit.get("functions") or []:
            if not isinstance(fn, dict):
                continue
            symbol = str(fn.get("name") or "")
            if not symbol:
                continue
            fn_metadata = fn.get("metadata") if isinstance(fn.get("metadata"), dict) else {}
            fuzzy = safe_float(fn.get("fuzzy_match_percent", fn.get("fuzzy")))
            raw_address = fn_metadata.get("virtual_address")
            if raw_address is None:
                raw_address = fn.get("address")
            address = format_address(raw_address)
            rows.append(
                {
                    "source_type": "codebase_function",
                    "symbol": symbol,
                    "address": address,
                    "unit": unit_name,
                    "source_path": source_path,
                    "size": safe_int(fn.get("size")),
                    "fuzzy_match_percent": fuzzy,
                    "match_status": "matched" if fuzzy >= 100 else "unmatched",
                    "evidence_ref": f"{report_path}#{unit_name}:{symbol}",
                    "source_origin": "report_json",
                }
            )
    if rows:
        return sorted(rows, key=lambda row: (row.get("address") or "", row.get("unit") or "", row.get("symbol") or "")), "report_json"
    return indexed_code_graph_function_rows(root), "code_graph_index"


def indexed_code_graph_function_rows(root: Path) -> list[dict[str, Any]]:
    index_path = PROJECT_KNOWLEDGE_ROOT / "sources" / "code_context" / "code_graph" / "indexes" / "functions.jsonl"
    rows: list[dict[str, Any]] = []
    for row in read_jsonl(index_path):
        symbol = str(row.get("symbol") or "")
        if not symbol:
            continue
        fuzzy = safe_float(row.get("fuzzy", row.get("fuzzy_match_percent")))
        rows.append(
            {
                "source_type": "codebase_function",
                "symbol": symbol,
                "address": format_address(row.get("address")),
                "unit": str(row.get("unit") or ""),
                "source_path": str(row.get("sourcePath") or row.get("source_path") or ""),
                "size": safe_int(row.get("size")),
                "fuzzy_match_percent": fuzzy,
                "match_status": "matched" if fuzzy >= 100 else "unmatched",
                "evidence_ref": f"{index_path}#line={row.get('_line_number')}",
                "source_origin": "code_graph_index",
            }
        )
    return sorted(rows, key=lambda row: (row.get("address") or "", row.get("unit") or "", row.get("symbol") or ""))


def data_symbol_rows(repo_root: Path) -> list[dict[str, Any]]:
    symbols_path = repo_root / "config" / "GALE01" / "symbols.txt"
    ranges = parse_splits(repo_root / "config" / "GALE01" / "splits.txt")
    rows: list[dict[str, Any]] = []
    if not symbols_path.exists():
        return rows
    with symbols_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            match = SYMBOL_LINE_RE.search(line)
            if not match:
                continue
            symbol, section, address = match.groups()
            metadata = parse_symbol_metadata(line)
            symbol_type = metadata.get("type", "")
            if symbol_type == "function":
                continue
            owner = owner_for_address(ranges, address, section)
            rows.append(
                {
                    "source_type": "data_symbol",
                    "symbol": symbol,
                    "address": format_address(address),
                    "section": section,
                    "symbol_type": symbol_type,
                    "size": metadata.get("size", ""),
                    "scope": metadata.get("scope", ""),
                    "data_type": metadata.get("data", ""),
                    "owner_source_path": owner.get("source_path", ""),
                    "owner_section": owner.get("section", ""),
                    "evidence_ref": f"{symbols_path}#line={line_number}",
                    "source_origin": "symbols_txt",
                }
            )
    return sorted(rows, key=lambda row: (row.get("address") or "", row.get("symbol") or ""))


def parse_symbol_metadata(line: str) -> dict[str, str]:
    if "//" not in line:
        return {}
    comment = line.split("//", 1)[1]
    metadata: dict[str, str] = {}
    flags: list[str] = []
    for token in comment.split():
        cleaned = token.strip().strip(";,.")
        if not cleaned:
            continue
        if ":" in cleaned:
            key, value = cleaned.split(":", 1)
            metadata[key] = value
        else:
            flags.append(cleaned)
    if flags:
        metadata["flags"] = " ".join(flags)
    return metadata


def parse_splits(path: Path) -> list[dict[str, Any]]:
    ranges: list[dict[str, Any]] = []
    if not path.exists():
        return ranges
    current_source = ""
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            header = SPLIT_HEADER_RE.match(raw_line.strip())
            if header:
                current_source = normalize_split_source_path(header.group(1))
                continue
            if not current_source:
                continue
            range_match = SPLIT_RANGE_RE.match(raw_line)
            if not range_match:
                continue
            section, start, end = range_match.groups()
            ranges.append(
                {
                    "source_path": current_source,
                    "section": section,
                    "start": parse_int(start),
                    "end": parse_int(end),
                }
            )
    return ranges


def normalize_split_source_path(path: str) -> str:
    if path.startswith("src/"):
        return path
    return f"src/{path}"


def owner_for_address(ranges: list[dict[str, Any]], address: str, section: str) -> dict[str, Any]:
    value = parse_int(address)
    normalized_section = normalize_section(section)
    for item in ranges:
        if item["start"] <= value < item["end"] and normalize_section(str(item.get("section") or "")) == normalized_section:
            return item
    for item in ranges:
        if item["start"] <= value < item["end"]:
            return item
    return {}


def normalize_section(section: str) -> str:
    return section.strip().lstrip(".")


def source_reference_rows(
    repo_root: Path,
    data_rows: list[dict[str, Any]],
    max_rows: int,
) -> tuple[list[dict[str, Any]], bool]:
    roots = [repo_root / "src", repo_root / "include"]
    source_files = [path for root in roots for path in recursive_source_files(root)]
    if not source_files:
        return [], False

    symbol_addresses = {
        str(row["symbol"]): str(row.get("address") or "")
        for row in data_rows
        if is_c_identifier(str(row.get("symbol") or ""))
    }
    symbol_set = set(symbol_addresses)
    references: dict[tuple[str, str, str], dict[str, Any]] = {}

    for path in source_files:
        rel_path = path.relative_to(repo_root).as_posix()
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for line_number, line in enumerate(lines, start=1):
            tokens = set(IDENT_RE.findall(line))
            for symbol in sorted(tokens & symbol_set):
                add_reference(
                    references,
                    kind="data_symbol_reference",
                    key=symbol,
                    source_path=rel_path,
                    line_number=line_number,
                    snippet=line,
                    symbol=symbol,
                    address=symbol_addresses.get(symbol, ""),
                )
            for literal in HEX_LITERAL_RE.findall(line):
                if parse_int(literal) < 0x10:
                    continue
                add_reference(
                    references,
                    kind="hex_literal_reference",
                    key=format_address(literal) if len(literal) >= 8 else literal,
                    source_path=rel_path,
                    line_number=line_number,
                    snippet=line,
                    symbol="",
                    address=format_address(literal) if len(literal) >= 8 else literal,
                )

    rows = []
    for ref in references.values():
        rows.append(
            {
                "source_type": "source_reference",
                "reference_kind": ref["reference_kind"],
                "symbol": ref.get("symbol", ""),
                "address": ref.get("address", ""),
                "source_path": ref["source_path"],
                "line_numbers": ";".join(str(value) for value in ref["line_numbers"]),
                "occurrences": ref["occurrences"],
                "snippet": " | ".join(ref["snippets"]),
                "evidence_ref": f"{repo_root / ref['source_path']}#line={ref['line_numbers'][0]}",
            }
        )
    rows.sort(key=lambda row: (0 if row["reference_kind"] == "data_symbol_reference" else 1, row["source_path"], row.get("symbol") or row.get("address")))
    truncated = len(rows) > max_rows
    return rows[:max_rows], truncated


def recursive_source_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    files: list[Path] = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in SOURCE_EXTENSIONS:
            files.append(path)
    return sorted(files)


def add_reference(
    references: dict[tuple[str, str, str], dict[str, Any]],
    *,
    kind: str,
    key: str,
    source_path: str,
    line_number: int,
    snippet: str,
    symbol: str,
    address: str,
) -> None:
    ref_key = (kind, key, source_path)
    ref = references.setdefault(
        ref_key,
        {
            "reference_kind": kind,
            "source_path": source_path,
            "symbol": symbol,
            "address": address,
            "line_numbers": [],
            "snippets": [],
            "occurrences": 0,
        },
    )
    ref["occurrences"] += 1
    if len(ref["line_numbers"]) < 12:
        ref["line_numbers"].append(line_number)
    clipped = clip(snippet.strip(), 180)
    if clipped and len(ref["snippets"]) < 3 and clipped not in ref["snippets"]:
        ref["snippets"].append(clipped)


def curator_update_rows(root: Path) -> list[dict[str, Any]]:
    path = root / "knowledge" / "resource_graph" / "enrichments" / "knowledge_curator_updates.jsonl"
    rows: list[dict[str, Any]] = []
    for row in read_jsonl(path):
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        target_source = str(payload.get("target_source_id") or row.get("target_source_id") or "")
        if target_source != "ssbm_data_sheet":
            continue
        rows.append(
            {
                "source_type": "local_lesson",
                "status": str(row.get("status") or ""),
                "confidence": safe_float(row.get("confidence")),
                "source_path": str(row.get("source_path") or payload.get("source_path") or ""),
                "unit": str(row.get("unit") or payload.get("unit") or ""),
                "symbol": str(row.get("symbol") or payload.get("symbol") or ""),
                "title": str(row.get("title") or ""),
                "text": clip(str(row.get("text") or ""), 2000),
                "evidence_ref": str(row.get("evidence_ref") or ""),
                "created_at": str(row.get("created_at") or ""),
                "update_kind": str(payload.get("update_kind") or ""),
            }
        )
    return sorted(rows, key=lambda row: (row.get("source_path") or "", row.get("symbol") or "", row.get("created_at") or ""))


def reconciliation_rows(functions: list[dict[str, Any]], data_symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    legacy_text = legacy_sheet_text().lower()
    legacy_identifiers = set(IDENT_RE.findall(legacy_text))
    legacy_addresses = {format_address(match).lower() for match in ADDRESS_RE.findall(legacy_text)}
    rows: list[dict[str, Any]] = []
    for kind, records in (("function", functions), ("data_symbol", data_symbols)):
        for row in records:
            symbol = str(row.get("symbol") or "")
            address = str(row.get("address") or "")
            symbol_lower = symbol.lower()
            symbol_mentioned = bool(symbol and len(symbol) >= 3 and (symbol_lower in legacy_identifiers or (not is_c_identifier(symbol) and symbol_lower in legacy_text)))
            address_mentioned = bool(address and address.lower() in legacy_addresses)
            if symbol_mentioned and address_mentioned:
                status = "legacy_mentions_symbol_and_address"
            elif symbol_mentioned:
                status = "legacy_mentions_symbol"
            elif address_mentioned:
                status = "legacy_mentions_address"
            else:
                status = "not_found_in_legacy_sheet"
            rows.append(
                {
                    "source_type": "sheet_reconciliation",
                    "symbol": symbol,
                    "address": address,
                    "record_kind": kind,
                    "source_path": row.get("source_path") or row.get("owner_source_path") or "",
                    "unit": row.get("unit", ""),
                    "section": row.get("section", ""),
                    "legacy_symbol_mentioned": "true" if symbol_mentioned else "false",
                    "legacy_address_mentioned": "true" if address_mentioned else "false",
                    "reconciliation_status": status,
                    "evidence_ref": row.get("evidence_ref", ""),
                }
            )
    return rows


def legacy_sheet_text() -> str:
    csv_root = SOURCE_ROOT / "data" / "csv"
    parts: list[str] = []
    for path in sorted(csv_root.glob("*.csv")):
        try:
            parts.append(path.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
    return "\n".join(parts)


def build_facts(
    functions: list[dict[str, Any]],
    data_symbols: list[dict[str, Any]],
    references: list[dict[str, Any]],
    curator_updates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    for row in functions:
        symbol = str(row.get("symbol") or "")
        address = str(row.get("address") or "")
        source_path = str(row.get("source_path") or "")
        unit = str(row.get("unit") or "")
        facts.append(
            make_fact(
                "codebase_function",
                key=f"{unit}:{symbol}:{address}",
                title=f"Codebase function {symbol} {address}".strip(),
                text=compact_text(
                    [
                        "codebase function",
                        symbol,
                        address,
                        source_path,
                        unit,
                        f"size {row.get('size')}",
                        f"fuzzy_match_percent {row.get('fuzzy_match_percent')}",
                        str(row.get("match_status") or ""),
                    ]
                ),
                evidence_ref=str(row.get("evidence_ref") or ""),
                row=row,
                trust_tier="canonical" if row.get("source_origin") == "report_json" else "local",
            )
        )
    for row in data_symbols:
        symbol = str(row.get("symbol") or "")
        address = str(row.get("address") or "")
        owner = str(row.get("owner_source_path") or "")
        facts.append(
            make_fact(
                "data_symbol",
                key=f"{symbol}:{address}:{row.get('section')}",
                title=f"Codebase data symbol {symbol} {address}".strip(),
                text=compact_text(
                    [
                        "codebase data symbol",
                        symbol,
                        address,
                        str(row.get("section") or ""),
                        str(row.get("symbol_type") or ""),
                        f"size {row.get('size')}",
                        str(row.get("scope") or ""),
                        str(row.get("data_type") or ""),
                        owner,
                    ]
                ),
                evidence_ref=str(row.get("evidence_ref") or ""),
                row=row,
                trust_tier="canonical",
            )
        )
    for row in references:
        symbol = str(row.get("symbol") or "")
        address = str(row.get("address") or "")
        source_path = str(row.get("source_path") or "")
        facts.append(
            make_fact(
                "source_reference",
                key=f"{row.get('reference_kind')}:{symbol or address}:{source_path}",
                title=f"Source reference {symbol or address} in {source_path}",
                text=compact_text(
                    [
                        str(row.get("reference_kind") or ""),
                        symbol,
                        address,
                        source_path,
                        f"lines {row.get('line_numbers')}",
                        f"occurrences {row.get('occurrences')}",
                        str(row.get("snippet") or ""),
                    ]
                ),
                evidence_ref=str(row.get("evidence_ref") or ""),
                row=row,
                trust_tier="local",
            )
        )
    for row in curator_updates:
        symbol = str(row.get("symbol") or "")
        source_path = str(row.get("source_path") or "")
        facts.append(
            make_fact(
                "local_lesson",
                key=f"{row.get('created_at')}:{source_path}:{symbol}:{row.get('title')}",
                title=f"Local data-sheet lesson: {row.get('title') or symbol or source_path}",
                text=compact_text(
                    [
                        source_path,
                        str(row.get("unit") or ""),
                        symbol,
                        str(row.get("status") or ""),
                        f"confidence {row.get('confidence')}",
                        str(row.get("title") or ""),
                        str(row.get("text") or ""),
                    ]
                ),
                evidence_ref=str(row.get("evidence_ref") or ""),
                row=row,
                trust_tier="local",
            )
        )
    return facts


def make_fact(source_type: str, *, key: str, title: str, text: str, evidence_ref: str, row: dict[str, Any], trust_tier: str) -> dict[str, Any]:
    payload = dict(row)
    payload["trust_tier"] = trust_tier
    return {
        "id": f"codebase:{source_type}:{short_hash(key)}",
        "kind": source_type,
        "source_type": source_type,
        "title": title,
        "text": text,
        "symbol": row.get("symbol", ""),
        "address": row.get("address", ""),
        "source_path": row.get("source_path") or row.get("owner_source_path") or "",
        "unit": row.get("unit", ""),
        "evidence_ref": evidence_ref,
        "payload": payload,
    }


def current_input_fingerprints(repo_root: Path, root: Path) -> dict[str, Any]:
    return {
        "report_json": file_stamp(repo_root / "build" / "GALE01" / "report.json"),
        "objdiff_json": file_stamp(repo_root / "objdiff.json"),
        "symbols_txt": file_stamp(repo_root / "config" / "GALE01" / "symbols.txt"),
        "splits_txt": file_stamp(repo_root / "config" / "GALE01" / "splits.txt"),
        "code_graph_functions": file_stamp(PROJECT_KNOWLEDGE_ROOT / "sources" / "code_context" / "code_graph" / "indexes" / "functions.jsonl"),
        "code_graph_files": file_stamp(PROJECT_KNOWLEDGE_ROOT / "sources" / "code_context" / "code_graph" / "indexes" / "files.jsonl"),
        "knowledge_curator_updates": file_stamp(PROJECT_KNOWLEDGE_ROOT / "resource_graph" / "enrichments" / "knowledge_curator_updates.jsonl"),
        "source_tree": tree_stamp(repo_root, ["src", "include"]),
    }


def freshness_payload(repo_root: Path, root: Path) -> dict[str, Any]:
    meta = read_json(META_PATH, {})
    current = current_input_fingerprints(repo_root, root)
    stored = meta.get("inputs") if isinstance(meta.get("inputs"), dict) else {}
    stale_inputs = [key for key, value in current.items() if stored.get(key) != value]
    available = INDEX_PATH.exists() and META_PATH.exists()
    return {
        "available": available,
        "status": "fresh" if available and not stale_inputs else "stale",
        "stale": (not available) or bool(stale_inputs),
        "stale_inputs": stale_inputs,
        "repo_root": str(repo_root),
        "index_path": str(INDEX_PATH),
        "meta_path": str(META_PATH),
        "generated_at": meta.get("generated_at"),
        "stats": meta.get("stats", {}),
    }


def file_stamp(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "exists": False}
    stat = path.stat()
    return {
        "path": str(path),
        "exists": True,
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
    }


def tree_stamp(repo_root: Path, rel_roots: list[str]) -> dict[str, Any]:
    digest = hashlib.sha1()
    count = 0
    for rel_root in rel_roots:
        root = repo_root / rel_root
        for path in recursive_source_files(root):
            try:
                stat = path.stat()
                rel_path = path.relative_to(repo_root).as_posix()
            except OSError:
                continue
            digest.update(f"{rel_path}\0{stat.st_size}\0{stat.st_mtime_ns}\n".encode("utf-8", errors="replace"))
            count += 1
    return {"roots": [str(repo_root / rel_root) for rel_root in rel_roots], "exists": count > 0, "file_count": count, "fingerprint": digest.hexdigest()}


def compact_text(parts: Iterable[Any]) -> str:
    return " ".join(str(part).strip() for part in parts if str(part or "").strip())


def clip(text: str, max_chars: int) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3].rstrip() + "..."


def short_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8", errors="replace")).hexdigest()[:16]


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


def parse_int(value: Any) -> int:
    try:
        return int(str(value), 16 if str(value).lower().startswith("0x") else 10)
    except (TypeError, ValueError):
        return 0


def format_address(value: Any) -> str:
    if isinstance(value, int):
        return f"0x{value:08X}"
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        if text.lower().startswith("0x"):
            return f"0x{int(text, 16):08X}"
        if text.isdigit():
            return f"0x{int(text):08X}"
    except ValueError:
        return text
    return text


def is_c_identifier(value: str) -> bool:
    return bool(IDENT_RE.fullmatch(value))


def build(repo_root: Path, root: Path, max_source_reference_rows: int) -> dict[str, Any]:
    functions, function_origin = report_function_rows(repo_root, root)
    data_symbols = data_symbol_rows(repo_root)
    references, references_truncated = source_reference_rows(repo_root, data_symbols, max_source_reference_rows)
    curator_updates = curator_update_rows(root)
    reconciled = reconciliation_rows(functions, data_symbols)
    facts = build_facts(functions, data_symbols, references, curator_updates)

    counts = {
        "function_addresses_csv": write_csv(
            GENERATED_DIR / "function_addresses.csv",
            ["source_type", "symbol", "address", "unit", "source_path", "size", "fuzzy_match_percent", "match_status", "evidence_ref", "source_origin"],
            functions,
        ),
        "data_symbols_csv": write_csv(
            GENERATED_DIR / "data_symbols.csv",
            ["source_type", "symbol", "address", "section", "symbol_type", "size", "scope", "data_type", "owner_source_path", "owner_section", "evidence_ref", "source_origin"],
            data_symbols,
        ),
        "source_references_csv": write_csv(
            GENERATED_DIR / "source_references.csv",
            ["source_type", "reference_kind", "symbol", "address", "source_path", "line_numbers", "occurrences", "snippet", "evidence_ref"],
            references,
        ),
        "curator_updates_csv": write_csv(
            GENERATED_DIR / "curator_updates.csv",
            ["source_type", "status", "confidence", "source_path", "unit", "symbol", "title", "text", "evidence_ref", "created_at", "update_kind"],
            curator_updates,
        ),
        "sheet_reconciliation_csv": write_csv(
            GENERATED_DIR / "sheet_reconciliation.csv",
            ["source_type", "symbol", "address", "record_kind", "source_path", "unit", "section", "legacy_symbol_mentioned", "legacy_address_mentioned", "reconciliation_status", "evidence_ref"],
            reconciled,
        ),
        "codebase_facts_jsonl": write_jsonl(INDEX_PATH, facts),
    }
    stats = {
        "function_origin": function_origin,
        "functions": len(functions),
        "data_symbols": len(data_symbols),
        "source_references": len(references),
        "source_references_truncated": references_truncated,
        "curator_updates": len(curator_updates),
        "sheet_reconciliation_rows": len(reconciled),
        "facts": len(facts),
        "outputs": counts,
    }
    meta = {
        "generated_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "repo_root": str(repo_root),
        "inputs": current_input_fingerprints(repo_root, root),
        "stats": stats,
    }
    write_json(META_PATH, meta)
    return {
        "repo_root": str(repo_root),
        "generated_dir": str(GENERATED_DIR),
        "index_path": str(INDEX_PATH),
        "meta_path": str(META_PATH),
        "stats": stats,
        "freshness": freshness_payload(repo_root, root),
    }


def print_payload(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True))
        return
    print(f"repo_root: {payload.get('repo_root')}")
    print(f"index_path: {payload.get('index_path')}")
    stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
    for key, value in stats.items():
        print(f"{key}: {value}")


def main() -> int:
    args = parse_args()
    root = package_root()
    repo_root = (args.repo_root.resolve() if args.repo_root else default_repo_root(root)).resolve()
    if args.check:
        payload = freshness_payload(repo_root, root)
        print_payload(payload, args.json)
        return 1 if args.strict and payload["stale"] else 0
    payload = build(repo_root, root, max(0, args.max_source_reference_rows))
    print_payload(payload, args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
