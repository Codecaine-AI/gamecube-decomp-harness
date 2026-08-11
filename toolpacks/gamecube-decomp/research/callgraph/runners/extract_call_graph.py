#!/usr/bin/env python3
"""Extract call and symbolized data-reference edges from generated assembly."""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from typing import Any, Iterable


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))
from search_index import package_root_for_tool, tool_storage_root  # type: ignore

PACKAGE_ROOT = package_root_for_tool(TOOL_ROOT)
TOOL_STORAGE_ROOT = tool_storage_root(TOOL_ROOT)
DEFAULT_REPO_ROOT = PACKAGE_ROOT / "projects" / "melee" / "checkout"

SYMBOL_PATTERN = r"[A-Za-z_$][A-Za-z0-9_$.]*"
CALL_TARGET_RE = re.compile(rf"^({SYMBOL_PATTERN})(?:\s|,|$)")
DATA_REF_RE = re.compile(rf"({SYMBOL_PATTERN})@(ha|h|l|sda21|sda2)")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate call and data-reference indexes from build/GALE01/asm.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--limit", type=int, default=0, help="Maximum functions to scan; 0 means all.")
    parser.add_argument("--query", default="", help="Optional symbol query to include in the smoke summary.")
    return parser.parse_args(argv)


def has_required_artifacts(repo_root: Path) -> bool:
    return (repo_root / "build" / "GALE01" / "asm").is_dir() and (repo_root / "build" / "GALE01" / "report.json").is_file()


def resolve_repo_root(requested: Path) -> tuple[Path, str | None]:
    requested = requested.expanduser().resolve()
    if has_required_artifacts(requested):
        return requested, None
    fallback = DEFAULT_REPO_ROOT.expanduser().resolve()
    if fallback != requested and has_required_artifacts(fallback):
        return fallback, "requested_repo_root_missing_build_GALE01_asm"
    return requested, None


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def report_metadata(repo_root: Path) -> dict[str, Any]:
    report = read_json(repo_root / "build" / "GALE01" / "report.json", {})
    by_unit_symbol: dict[tuple[str, str], dict[str, Any]] = {}
    by_symbol: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for unit in report.get("units") or []:
        if not isinstance(unit, dict):
            continue
        unit_name = str(unit.get("name") or "")
        unit_meta = unit.get("metadata") if isinstance(unit.get("metadata"), dict) else {}
        source_path = str(unit_meta.get("source_path") or "")
        for fn in unit.get("functions") or []:
            if not isinstance(fn, dict):
                continue
            symbol = str(fn.get("name") or "")
            if not symbol:
                continue
            fn_meta = fn.get("metadata") if isinstance(fn.get("metadata"), dict) else {}
            metadata = {
                "unit": unit_name,
                "source_path": source_path,
                "address": format_address(fn_meta.get("virtual_address")),
                "size": fn.get("size"),
                "fuzzy_match_percent": fn.get("fuzzy_match_percent"),
                "status": "matched" if safe_float(fn.get("fuzzy_match_percent")) >= 100 else "unmatched",
            }
            by_unit_symbol[(unit_name, symbol)] = metadata
            by_symbol[symbol].append(metadata)
    return {"by_unit_symbol": by_unit_symbol, "by_symbol": by_symbol}


def resolve_report_metadata(metadata: dict[str, Any], unit: str, symbol: str) -> dict[str, Any]:
    by_unit_symbol = metadata.get("by_unit_symbol") if isinstance(metadata, dict) else {}
    if isinstance(by_unit_symbol, dict):
        resolved = by_unit_symbol.get((unit, symbol))
        if isinstance(resolved, dict):
            return resolved
    by_symbol = metadata.get("by_symbol") if isinstance(metadata, dict) else {}
    matches = by_symbol.get(symbol) if isinstance(by_symbol, dict) else None
    if isinstance(matches, list) and len(matches) == 1 and isinstance(matches[0], dict):
        return matches[0]
    return {}


def format_address(value: Any) -> str:
    if isinstance(value, int):
        return f"0x{value:08X}"
    if isinstance(value, str) and value.isdigit():
        return f"0x{int(value):08X}"
    return str(value or "")


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def iter_asm_functions(repo_root: Path, metadata: dict[str, Any]) -> Iterable[dict[str, Any]]:
    """Yield functions delimited by .fn/.endfn with parsed instruction lines."""
    asm_root = repo_root / "build" / "GALE01" / "asm"
    for asm_path in sorted(asm_root.rglob("*.s")):
        lines = asm_path.read_text(encoding="utf-8", errors="replace").splitlines()
        symbol = ""
        start_line = 0
        instructions: list[tuple[int, str]] = []
        for line_no, line in enumerate(lines, start=1):
            if line.startswith(".fn "):
                if symbol:
                    yield make_function_row(repo_root, asm_path, start_line, symbol, instructions, metadata)
                symbol = line.removeprefix(".fn ").split(",", 1)[0].strip()
                start_line = line_no
                instructions = []
                continue
            if line.startswith(".endfn"):
                if symbol:
                    yield make_function_row(repo_root, asm_path, start_line, symbol, instructions, metadata)
                symbol = ""
                start_line = 0
                instructions = []
                continue
            if not symbol or line.startswith(".L_"):
                continue
            instruction = asm_instruction(line)
            if instruction:
                instructions.append((line_no, instruction))


def asm_instruction(line: str) -> str:
    if "*/\t" in line:
        _, line = line.split("*/\t", 1)
    stripped = line.strip()
    if not stripped or stripped.startswith((".", "#", "/*")):
        return ""
    if re.match(r"^[A-Za-z_][A-Za-z0-9_.]*\b", stripped):
        return stripped
    return ""


def make_function_row(
    repo_root: Path,
    asm_path: Path,
    start_line: int,
    symbol: str,
    instructions: list[tuple[int, str]],
    metadata: dict[str, Any],
) -> dict[str, Any]:
    asm_unit = unit_from_asm_path(repo_root, asm_path)
    meta = resolve_report_metadata(metadata, asm_unit, symbol)
    unit = str(meta.get("unit") or asm_unit)
    return {
        "id": f"asm_function:{unit}:{symbol}",
        "symbol": symbol,
        "unit": unit,
        "source_path": str(meta.get("source_path") or ""),
        "address": meta.get("address") or "",
        "fuzzy_match_percent": meta.get("fuzzy_match_percent"),
        "instructions": instructions,
        "instruction_count": len(instructions),
        "evidence_ref": f"{asm_path}#line={start_line}",
        "report_metadata": meta,
        "asm_unit": asm_unit,
        "asm_path": str(asm_path),
        "asm_line": start_line,
    }


def unit_from_asm_path(repo_root: Path, asm_path: Path) -> str:
    try:
        rel = asm_path.relative_to(repo_root / "build" / "GALE01" / "asm").with_suffix("")
    except ValueError:
        try:
            rel = asm_path.relative_to(repo_root).with_suffix("")
        except ValueError:
            rel = asm_path.with_suffix("")
    parts = rel.parts
    if not parts:
        return ""
    if parts[0] == "main":
        return "/".join(parts)
    return "main/" + "/".join(parts)


def dedupe_function_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    for row in rows:
        row_id = str(row.get("id") or "")
        if not row_id:
            continue
        existing = selected.get(row_id)
        if existing is None or row_quality(row) > row_quality(existing):
            selected[row_id] = row
    return sorted(selected.values(), key=function_sort_key)


def row_quality(row: dict[str, Any]) -> tuple[int, int, int, int, str]:
    unit = str(row.get("unit") or "")
    asm_unit = str(row.get("asm_unit") or "")
    return (
        1 if asm_unit and asm_unit == unit else 0,
        1 if row.get("source_path") else 0,
        1 if row.get("address") else 0,
        int(row.get("instruction_count") or 0),
        str(row.get("evidence_ref") or ""),
    )


def function_sort_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("symbol") or "").lower(),
        str(row.get("unit") or "").lower(),
        str(row.get("id") or ""),
    )


def instruction_parts(instruction: str) -> tuple[str, str]:
    parts = instruction.split(None, 1)
    mnemonic = parts[0].lower() if parts else ""
    operands = parts[1].strip() if len(parts) > 1 else ""
    return mnemonic, operands


def symbolic_call_target(mnemonic: str, operands: str) -> str:
    if mnemonic != "bl" or not operands:
        return ""
    match = CALL_TARGET_RE.match(operands)
    if not match:
        return ""
    target = match.group(1)
    if target.startswith(("0x", ".L_")):
        return ""
    return target


def base_edge_payload(function: dict[str, Any], first_line: int, count: int) -> dict[str, Any]:
    metadata = function.get("report_metadata") if isinstance(function.get("report_metadata"), dict) else {}
    return {
        **metadata,
        "asm_unit": function.get("asm_unit") or "",
        "asm_path": function.get("asm_path") or "",
        "asm_line": first_line,
        "count": count,
    }


def build_edges(
    functions: list[dict[str, Any]],
    known_function_symbols: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    call_rows: list[dict[str, Any]] = []
    data_ref_rows: list[dict[str, Any]] = []
    call_sites = 0
    data_ref_sites = 0

    for function in functions:
        calls: dict[str, dict[str, int]] = {}
        data_refs: dict[str, dict[str, int]] = {}
        for line_no, instruction in function.get("instructions") or []:
            mnemonic, operands = instruction_parts(str(instruction))
            callee = symbolic_call_target(mnemonic, operands)
            if callee:
                call_sites += 1
                site = calls.setdefault(callee, {"count": 0, "first_line": int(line_no)})
                site["count"] += 1
                continue
            if mnemonic.startswith("b"):
                continue
            for match in DATA_REF_RE.finditer(operands):
                ref_symbol = match.group(1)
                if ref_symbol.startswith(".L_"):
                    continue
                data_ref_sites += 1
                site = data_refs.setdefault(ref_symbol, {"count": 0, "first_line": int(line_no)})
                site["count"] += 1

        for callee, site in calls.items():
            call_rows.append(make_call_row(function, callee, site, callee in known_function_symbols))
        for ref_symbol, site in data_refs.items():
            ref_kind = "function_pointer" if ref_symbol in known_function_symbols else "data"
            data_ref_rows.append(make_data_ref_row(function, ref_symbol, ref_kind, site))

    call_rows.sort(key=edge_sort_key)
    data_ref_rows.sort(key=edge_sort_key)
    return call_rows, data_ref_rows, {"call_sites": call_sites, "data_ref_sites": data_ref_sites}


def make_call_row(
    function: dict[str, Any],
    callee_symbol: str,
    site: dict[str, int],
    callee_is_known_function: bool,
) -> dict[str, Any]:
    symbol = str(function.get("symbol") or "")
    unit = str(function.get("unit") or "")
    source_path = str(function.get("source_path") or "")
    count = int(site["count"])
    first_line = int(site["first_line"])
    payload = base_edge_payload(function, first_line, count)
    payload.update({"callee_symbol": callee_symbol, "callee_is_known_function": callee_is_known_function})
    return {
        "id": f"call:{unit}:{symbol}:{callee_symbol}",
        "kind": "call_edge",
        "title": f"Call: {symbol} -> {callee_symbol}",
        "symbol": symbol,
        "unit": unit,
        "source_path": source_path,
        "address": function.get("address") or "",
        "fuzzy_match_percent": function.get("fuzzy_match_percent"),
        "callee_symbol": callee_symbol,
        "count": count,
        "evidence_ref": f"{function.get('asm_path')}#line={first_line}",
        "text": f"{symbol} {source_path} {unit} calls {callee_symbol} count {count}",
        "payload": payload,
    }


def make_data_ref_row(
    function: dict[str, Any],
    ref_symbol: str,
    ref_kind: str,
    site: dict[str, int],
) -> dict[str, Any]:
    symbol = str(function.get("symbol") or "")
    unit = str(function.get("unit") or "")
    source_path = str(function.get("source_path") or "")
    count = int(site["count"])
    first_line = int(site["first_line"])
    payload = base_edge_payload(function, first_line, count)
    payload.update({"ref_symbol": ref_symbol, "ref_kind": ref_kind})
    return {
        "id": f"data_ref:{unit}:{symbol}:{ref_symbol}",
        "kind": "data_ref_edge",
        "title": f"Data ref: {symbol} -> {ref_symbol}",
        "symbol": symbol,
        "unit": unit,
        "source_path": source_path,
        "address": function.get("address") or "",
        "fuzzy_match_percent": function.get("fuzzy_match_percent"),
        "ref_symbol": ref_symbol,
        "ref_kind": ref_kind,
        "count": count,
        "evidence_ref": f"{function.get('asm_path')}#line={first_line}",
        "text": f"{symbol} {source_path} {unit} references {ref_symbol} {ref_kind} count {count}",
        "payload": payload,
    }


def edge_sort_key(row: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(row.get("unit") or "").lower(),
        str(row.get("symbol") or "").lower(),
        str(row.get("callee_symbol") or row.get("ref_symbol") or "").lower(),
        str(row.get("id") or ""),
    )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def smoke_results(query: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = query.strip().lower()
    if not normalized:
        return []
    results: list[dict[str, Any]] = []
    for row in rows:
        if normalized in json.dumps(row, sort_keys=True).lower():
            results.append(
                {
                    "kind": row.get("kind"),
                    "symbol": row.get("symbol"),
                    "target_symbol": row.get("callee_symbol") or row.get("ref_symbol"),
                    "evidence_ref": row.get("evidence_ref"),
                }
            )
        if len(results) >= 5:
            break
    return results


def write_manifest(
    args: argparse.Namespace,
    success: bool,
    counts: dict[str, int],
    generated_indexes: list[Path],
    smoke: list[dict[str, Any]],
) -> dict[str, Any]:
    command = [
        "python3",
        "toolpacks/gamecube-decomp/research/callgraph/runners/extract_call_graph.py",
        "--repo-root",
        str(args.repo_root),
        "--limit",
        str(args.limit),
    ]
    if args.query:
        command.extend(["--query", str(args.query)])
    manifest = {
        "tool": "callgraph",
        "runner": "extract_call_graph.py",
        "success": success,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": command,
        "repo_root": str(args.repo_root),
        "requested_repo_root": str(getattr(args, "requested_repo_root", args.repo_root)),
        "fallback_reason": getattr(args, "fallback_reason", None),
        "counts": counts,
        "record_count": counts["call_edges"] + counts["data_ref_edges"],
        "generated_indexes": [str(path) for path in generated_indexes],
        "smoke_results": smoke,
        "dependencies": ["build/GALE01/asm", "build/GALE01/report.json"],
    }
    status_path = TOOL_STORAGE_ROOT / "cache" / "runner_status.json"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest


def run(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    requested_repo_root = args.repo_root
    repo_root, fallback_reason = resolve_repo_root(requested_repo_root)
    args.requested_repo_root = requested_repo_root
    args.repo_root = repo_root
    args.fallback_reason = fallback_reason

    metadata = report_metadata(repo_root)
    raw_functions = list(iter_asm_functions(repo_root, metadata))
    known_function_symbols = {str(row.get("symbol") or "") for row in raw_functions if row.get("symbol")}
    functions = dedupe_function_rows(raw_functions)
    if args.limit > 0:
        functions = functions[: args.limit]

    call_rows, data_ref_rows, site_counts = build_edges(functions, known_function_symbols)
    calls_path = TOOL_STORAGE_ROOT / "indexes" / "calls.jsonl"
    data_refs_path = TOOL_STORAGE_ROOT / "indexes" / "data_refs.jsonl"
    write_jsonl(calls_path, call_rows)
    write_jsonl(data_refs_path, data_ref_rows)

    counts = {
        "functions_scanned": len(functions),
        "call_sites": site_counts["call_sites"],
        "call_edges": len(call_rows),
        "data_ref_sites": site_counts["data_ref_sites"],
        "data_ref_edges": len(data_ref_rows),
    }
    generated_indexes = [calls_path, data_refs_path]
    smoke = smoke_results(str(args.query), [*call_rows, *data_ref_rows])
    success = has_required_artifacts(repo_root) and bool(functions)
    manifest = write_manifest(args, success, counts, generated_indexes, smoke)
    return manifest, 0 if success else 1


def main(argv: list[str] | None = None) -> int:
    manifest, exit_code = run(parse_args(argv))
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
