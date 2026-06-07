#!/usr/bin/env python3
"""Extract live opcode fingerprints from generated assembly files."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


TOOL_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_REPO_ROOT = PACKAGE_ROOT.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate opcode-sequence fingerprints from build/GALE01/asm.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--limit", type=int, default=0, help="Maximum functions to index; 0 means all.")
    parser.add_argument("--query", default="", help="Optional symbol/opcode query to include in the smoke summary.")
    return parser.parse_args()


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def report_metadata(repo_root: Path) -> dict[str, dict[str, Any]]:
    report = read_json(repo_root / "build" / "GALE01" / "report.json", {})
    by_symbol: dict[str, dict[str, Any]] = {}
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
            by_symbol[symbol] = {
                "unit": unit_name,
                "source_path": source_path,
                "address": format_address(fn_meta.get("virtual_address")),
                "size": fn.get("size"),
                "fuzzy_match_percent": fn.get("fuzzy_match_percent"),
                "status": "matched" if safe_float(fn.get("fuzzy_match_percent")) >= 100 else "unmatched",
            }
    return by_symbol


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


def iter_asm_functions(repo_root: Path, metadata: dict[str, dict[str, Any]]) -> Iterable[dict[str, Any]]:
    asm_root = repo_root / "build" / "GALE01" / "asm"
    for asm_path in sorted(asm_root.rglob("*.s")):
        lines = asm_path.read_text(encoding="utf-8", errors="replace").splitlines()
        symbol = ""
        start_line = 0
        opcodes: list[str] = []
        formatted: list[str] = []
        for line_no, line in enumerate(lines, start=1):
            if line.startswith(".fn "):
                if symbol and opcodes:
                    yield make_row(repo_root, asm_path, start_line, symbol, opcodes, formatted, metadata)
                symbol = line.removeprefix(".fn ").split(",", 1)[0].strip()
                start_line = line_no
                opcodes = []
                formatted = []
                continue
            if line.startswith(".endfn"):
                if symbol and opcodes:
                    yield make_row(repo_root, asm_path, start_line, symbol, opcodes, formatted, metadata)
                symbol = ""
                opcodes = []
                formatted = []
                continue
            if not symbol or line.startswith(".L_"):
                continue
            instruction = asm_instruction(line)
            if not instruction:
                continue
            opcode = instruction.split()[0]
            opcodes.append(opcode)
            if len(formatted) < 16:
                formatted.append(instruction)


def asm_instruction(line: str) -> str:
    if "*/\t" in line:
        _, line = line.split("*/\t", 1)
    stripped = line.strip()
    if not stripped or stripped.startswith((".", "#", "/*")):
        return ""
    if re.match(r"^[A-Za-z_][A-Za-z0-9_.]*\b", stripped):
        return stripped
    return ""


def make_row(
    repo_root: Path,
    asm_path: Path,
    start_line: int,
    symbol: str,
    opcodes: list[str],
    formatted: list[str],
    metadata: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    meta = metadata.get(symbol, {})
    opcode_prefix = ",".join(opcodes[:12])
    opcode_histogram: dict[str, int] = {}
    for opcode in opcodes:
        opcode_histogram[opcode] = opcode_histogram.get(opcode, 0) + 1
    rel_asm = asm_path.relative_to(repo_root)
    unit = str(meta.get("unit") or rel_asm.with_suffix("")).replace("build/GALE01/asm/", "")
    source_path = str(meta.get("source_path") or "")
    text = " ".join(
        part
        for part in [
            symbol,
            source_path,
            unit,
            str(meta.get("address") or ""),
            opcode_prefix,
            " ".join(sorted(opcode_histogram)[:32]),
        ]
        if part
    )
    return {
        "id": f"opcode_sequence:{unit}:{symbol}",
        "kind": "opcode_sequence_live",
        "title": f"Opcode sequence: {symbol}",
        "symbol": symbol,
        "source_path": source_path,
        "unit": unit,
        "address": meta.get("address") or "",
        "opcode_count": len(opcodes),
        "opcode_prefix": opcode_prefix,
        "opcode_histogram": opcode_histogram,
        "sample_instructions": formatted,
        "text": text,
        "evidence_ref": f"{asm_path}#line={start_line}",
        "payload": {
            **meta,
            "asm_path": str(asm_path),
            "asm_line": start_line,
            "opcode_count": len(opcodes),
            "opcode_prefix": opcode_prefix,
        },
    }


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def write_manifest(args: argparse.Namespace, rows: list[dict[str, Any]], generated: list[Path], smoke_results: list[dict[str, Any]]) -> dict[str, Any]:
    manifest = {
        "tool": "opseq",
        "runner": "extract_opcode_sequences.py",
        "success": bool(rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": ["python3", "knowledge/tools/opseq/runners/extract_opcode_sequences.py", "--repo-root", str(args.repo_root)],
        "repo_root": str(args.repo_root),
        "record_count": len(rows),
        "generated_artifacts": [str(path) for path in generated if path.name != "opcode_sequences.jsonl"],
        "generated_indexes": [str(path) for path in generated if path.name == "opcode_sequences.jsonl"],
        "smoke_results": smoke_results,
        "dependencies": ["build/GALE01/asm", "build/GALE01/report.json"],
    }
    status_path = TOOL_ROOT / "cache" / "runner_status.json"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    metadata = report_metadata(repo_root)
    rows = list(iter_asm_functions(repo_root, metadata))
    if args.limit > 0:
        rows = rows[: args.limit]
    cache_path = TOOL_ROOT / "cache" / "opcode_fingerprints.jsonl"
    index_path = TOOL_ROOT / "indexes" / "opcode_sequences.jsonl"
    write_jsonl(cache_path, rows)
    write_jsonl(index_path, rows)
    query = args.query.strip().lower()
    smoke_results = []
    if query:
        for row in rows:
            haystack = json.dumps(row, sort_keys=True).lower()
            if query in haystack:
                smoke_results.append({"symbol": row.get("symbol"), "evidence_ref": row.get("evidence_ref")})
            if len(smoke_results) >= 5:
                break
    manifest = write_manifest(args, rows, [cache_path, index_path], smoke_results)
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
