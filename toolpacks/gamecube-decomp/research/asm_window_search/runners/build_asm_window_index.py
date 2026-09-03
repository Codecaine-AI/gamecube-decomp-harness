#!/usr/bin/env python3
"""Build the sparse hashed assembly-window index from target objects."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
from typing import Any, Iterable


TOOL_ROOT = Path(__file__).resolve().parents[1]
TOOLPACK_ROOT = TOOL_ROOT.parents[1]
sys.path.append(str(TOOLPACK_ROOT / "_impl" / "gamecube"))
sys.path.append(str(TOOLPACK_ROOT / "_shared"))

from dsearch.embed import HASHED_DIM, embed_hashed_sparse  # type: ignore
from dsearch.normalize import Function, function_tokens, window_texts  # type: ignore
from dsearch.objparse import (  # type: ignore
    find_objdump,
    find_source_file,
    iter_units,
    load_report,
    parse_object,
)
from search_index import env_path, package_root_for_tool  # type: ignore


SCHEMA_VERSION = 1
VENDOR_COMMIT = "586800f"
VECTOR_MAGIC = b"DSWV"
VECTOR_VERSION = 1
VECTOR_HEADER = struct.Struct("<4sHHI")
VECTOR_COUNT = struct.Struct("<H")
VECTOR_ENTRY = struct.Struct("<Hf")


def default_output_root() -> Path:
    shared = env_path("ORCH_TOOL_SHARED_DATA_ROOT")
    if shared:
        return shared
    return (
        package_root_for_tool(TOOL_ROOT)
        / "games"
        / "melee"
        / "shared"
        / "tool-data"
        / "asm_window_search"
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a sparse assembly-window search index.")
    parser.add_argument("--repo-root", type=Path, required=True, help="Built melee checkout root.")
    parser.add_argument("--version", default=os.environ.get("ORCH_GAME_BUILD_ID") or "GALE01")
    parser.add_argument("--report", help="Progress report path or URL.")
    parser.add_argument("--objdump", help="powerpc-eabi-objdump executable.")
    parser.add_argument("--out", type=Path, default=default_output_root())
    parser.add_argument("--window-size", type=int, default=32)
    parser.add_argument("--stride", type=int, default=16)
    return parser.parse_args(argv)


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = _temporary_path(path)
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = _temporary_path(path)
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
                handle.write("\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _temporary_path(path: Path) -> Path:
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(descriptor)
    return Path(name)


def write_sparse_vectors(
    path: Path,
    vectors: list[list[tuple[int, float]]],
    dim: int = HASHED_DIM,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = _temporary_path(path)
    try:
        with temporary.open("wb") as handle:
            handle.write(VECTOR_HEADER.pack(VECTOR_MAGIC, VECTOR_VERSION, dim, len(vectors)))
            for vector in vectors:
                if len(vector) > 0xFFFF:
                    raise ValueError("sparse vector has too many entries")
                handle.write(VECTOR_COUNT.pack(len(vector)))
                for index, value in vector:
                    if index < 0 or index >= dim:
                        raise ValueError(f"sparse vector index {index} is outside dimension {dim}")
                    handle.write(VECTOR_ENTRY.pack(index, value))
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def function_rows_and_windows(
    functions: Iterable[Function],
    report: dict[str, tuple[float, str]],
    repo_root: Path | None,
    window_size: int,
    stride: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[list[tuple[int, float]]]]:
    function_rows: list[dict[str, Any]] = []
    window_rows: list[dict[str, Any]] = []
    vectors: list[list[tuple[int, float]]] = []
    for function in functions:
        report_match = report.get(function.name)
        fuzzy_match = report_match[0] if report_match else None
        unit = report_match[1] if report_match and report_match[1] != "?" else function.unit
        source_path = find_source_file(repo_root, unit) if repo_root else None
        tokens = function_tokens(function)
        function_rows.append(
            {
                "symbol": function.name,
                "unit": unit,
                "source_path": source_path or "",
                "fuzzy_match_percent": fuzzy_match,
                "insn_count": len(tokens),
                "tokens": tokens,
            }
        )
        indexed_function = Function(function.name, unit, function.insns)
        for start, document in window_texts(indexed_function, size=window_size, stride=stride):
            window_insns = len(document.splitlines()[-1].split())
            row_number = len(window_rows)
            window_rows.append(
                {
                    "row": row_number,
                    "symbol": function.name,
                    "unit": unit,
                    "start": start,
                    "insn_count": window_insns,
                }
            )
            vectors.append(embed_hashed_sparse(document))
    return function_rows, window_rows, vectors


def build_index_from_functions(
    functions: Iterable[Function],
    out_root: Path,
    *,
    report: dict[str, tuple[float, str]] | None = None,
    repo_root: Path | None = None,
    version: str = os.environ.get("ORCH_GAME_BUILD_ID") or "GALE01",
    window_size: int = 32,
    stride: int = 16,
    report_source: str | None = None,
) -> dict[str, Any]:
    """Build an index from parsed functions. Tests use this before API search."""
    if window_size <= 0:
        raise ValueError("window size must be positive")
    if stride <= 0:
        raise ValueError("stride must be positive")
    function_rows, window_rows, vectors = function_rows_and_windows(
        functions,
        report or {},
        repo_root,
        window_size,
        stride,
    )
    indexes = out_root / "indexes"
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "repo_root": str(repo_root.resolve()) if repo_root else None,
        "version": version,
        "window_size": window_size,
        "stride": stride,
        "embed": {"backend": "hashed", "dim": HASHED_DIM, "ngrams": [1, 2, 3]},
        "counts": {"functions": len(function_rows), "windows": len(window_rows)},
        "report_source": report_source,
        "warnings": [] if report_source else ["No report was loaded; fuzzy_match_percent values are null."],
        "vendor_commit": VENDOR_COMMIT,
    }
    atomic_write_jsonl(indexes / "functions.jsonl", function_rows)
    atomic_write_jsonl(indexes / "windows.meta.jsonl", window_rows)
    write_sparse_vectors(indexes / "windows.vec.bin", vectors)
    atomic_write_json(indexes / "manifest.json", manifest)
    return manifest


def resolve_report(args: argparse.Namespace, repo_root: Path) -> tuple[dict[str, tuple[float, str]], str | None]:
    source = args.report
    if not source:
        default = repo_root / "build" / args.version / "report.json"
        if default.exists():
            source = str(default)
    return (load_report(source), source) if source else ({}, None)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = args.repo_root.expanduser().resolve()
    out_root = args.out.expanduser().resolve()
    if args.window_size <= 0 or args.stride <= 0:
        print("error: --window-size and --stride must be positive", file=sys.stderr)
        return 2
    try:
        units = list(iter_units(repo_root, args.version))
    except FileNotFoundError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    objdump = args.objdump or find_objdump(repo_root)
    try:
        report, report_source = resolve_report(args, repo_root)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: could not load report: {error}", file=sys.stderr)
        return 2

    functions: list[Function] = []
    print(f"disassembling {len(units)} target objects with {objdump}")
    try:
        for number, (object_path, unit) in enumerate(units, start=1):
            functions.extend(parse_object(objdump, object_path, unit))
            if number == len(units) or number % 100 == 0:
                print(f"objects {number}/{len(units)}; functions {len(functions)}")
    except FileNotFoundError:
        print(
            "error: powerpc-eabi-objdump was not found; pass --objdump or set DSEARCH_OBJDUMP",
            file=sys.stderr,
        )
        return 2

    manifest = build_index_from_functions(
        functions,
        out_root,
        report=report,
        repo_root=repo_root,
        version=args.version,
        window_size=args.window_size,
        stride=args.stride,
        report_source=report_source,
    )
    print(
        f"indexed {manifest['counts']['functions']} functions and "
        f"{manifest['counts']['windows']} windows under {out_root / 'indexes'}"
    )
    if not report_source:
        print("warning: no report found; fuzzy match percentages are unavailable")
    if not functions:
        print("error: objdump produced no target functions", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
