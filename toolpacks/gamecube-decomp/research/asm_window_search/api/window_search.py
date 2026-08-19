#!/usr/bin/env python3
"""Search a sparse hashed assembly-window index for construct-level donors."""

from __future__ import annotations

import argparse
from array import array
import difflib
import json
from pathlib import Path
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
TOOLPACK_ROOT = TOOL_ROOT.parents[1]
sys.path.append(str(TOOLPACK_ROOT / "_impl" / "gamecube"))
sys.path.append(str(TOOLPACK_ROOT / "_shared"))
sys.path.append(str(TOOL_ROOT / "runners"))

from dsearch.embed import embed_hashed_sparse  # type: ignore
from dsearch.normalize import window_token_texts  # type: ignore
from build_asm_window_index import (  # type: ignore
    VECTOR_COUNT,
    VECTOR_ENTRY,
    VECTOR_HEADER,
    VECTOR_MAGIC,
    VECTOR_VERSION,
)
from search_index import tool_storage_roots  # type: ignore


RUNNER_COMMAND = (
    "python3 toolpacks/gamecube-decomp/research/asm_window_search/"
    "runners/build_asm_window_index.py --repo-root <built_melee_checkout>"
)
INDEX_FILES = (
    Path("indexes/functions.jsonl"),
    Path("indexes/windows.meta.jsonl"),
    Path("indexes/windows.vec.bin"),
    Path("indexes/manifest.json"),
)


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


def find_index_root() -> Path | None:
    for root in tool_storage_roots(TOOL_ROOT):
        paths = [root / relative for relative in INDEX_FILES]
        if all(path.is_file() and path.stat().st_size > 0 for path in paths):
            return root
    return None


def load_sparse_vectors(path: Path) -> tuple[int, list[tuple[array, array]]]:
    vectors: list[tuple[array, array]] = []
    with path.open("rb") as handle:
        header = handle.read(VECTOR_HEADER.size)
        if len(header) != VECTOR_HEADER.size:
            raise ValueError("sparse vector file has a truncated header")
        magic, version, dimension, row_count = VECTOR_HEADER.unpack(header)
        if magic != VECTOR_MAGIC:
            raise ValueError("sparse vector file has the wrong magic")
        if version != VECTOR_VERSION:
            raise ValueError(f"unsupported sparse vector version {version}")
        for _ in range(row_count):
            raw_count = handle.read(VECTOR_COUNT.size)
            if len(raw_count) != VECTOR_COUNT.size:
                raise ValueError("sparse vector file ends before a row count")
            count = VECTOR_COUNT.unpack(raw_count)[0]
            indices = array("H")
            values = array("f")
            raw_entries = handle.read(count * VECTOR_ENTRY.size)
            if len(raw_entries) != count * VECTOR_ENTRY.size:
                raise ValueError("sparse vector file ends inside a row")
            for index, value in VECTOR_ENTRY.iter_unpack(raw_entries):
                if index >= dimension:
                    raise ValueError(f"sparse vector index {index} exceeds dimension {dimension}")
                indices.append(index)
                values.append(value)
            vectors.append((indices, values))
        if handle.read(1):
            raise ValueError("sparse vector file has trailing data")
    return dimension, vectors


def sparse_dot(
    left: list[tuple[int, float]],
    right: tuple[array, array],
) -> float:
    right_indices, right_values = right
    left_at = 0
    right_at = 0
    total = 0.0
    while left_at < len(left) and right_at < len(right_indices):
        left_index = left[left_at][0]
        right_index = right_indices[right_at]
        if left_index == right_index:
            total += left[left_at][1] * right_values[right_at]
            left_at += 1
            right_at += 1
        elif left_index < right_index:
            left_at += 1
        else:
            right_at += 1
    return total


def row_matches_unit(row: dict[str, Any], unit_filter: str) -> bool:
    normalized = unit_filter.replace("\\", "/").lstrip("./")
    unit = str(row.get("unit") or "").replace("\\", "/")
    source = str(row.get("source_path") or "").replace("\\", "/")
    return unit == normalized or unit.endswith(normalized) or source.endswith(normalized)


def choose_query_function(
    functions: list[dict[str, Any]],
    symbol: str,
    unit_filter: str | None,
) -> dict[str, Any] | None:
    matches = [row for row in functions if str(row.get("symbol") or "") == symbol]
    if unit_filter:
        matches = [row for row in matches if row_matches_unit(row, unit_filter)]
    matches.sort(key=lambda row: (str(row.get("unit") or ""), str(row.get("source_path") or "")))
    return matches[0] if matches else None


def token_windows(tokens: list[str], size: int, stride: int) -> list[tuple[int, str]]:
    return window_token_texts(tokens, size=size, stride=stride)


def index_not_built_payload() -> dict[str, Any]:
    return {
        "status": "index_not_built",
        "guidance": (
            "The host assembly-window index is not built. Do not retry this worker call. "
            "An operator must build it from a melee checkout that has target objects."
        ),
        "runner": RUNNER_COMMAND,
    }


def function_not_indexed_payload(symbol: str, functions: list[dict[str, Any]]) -> dict[str, Any]:
    names = sorted({str(row.get("symbol")) for row in functions if row.get("symbol")})
    return {
        "status": "function_not_indexed",
        "symbol": symbol,
        "suggestions": difflib.get_close_matches(symbol, names, n=10, cutoff=0.3),
    }


def _fuzzy_allowed(row: dict[str, Any], min_match: float | None) -> bool:
    if min_match is None:
        return True
    value = row.get("fuzzy_match_percent")
    if value is None:
        return False
    try:
        return float(value) >= min_match
    except (TypeError, ValueError):
        return False


def build_payload(
    symbol: str,
    *,
    unit: str | None = None,
    min_match: float = 98.0,
    include_all: bool = False,
    exclude_self_unit: bool = False,
    limit: int = 10,
) -> dict[str, Any]:
    index_root = find_index_root()
    if index_root is None:
        return index_not_built_payload()

    indexes = index_root / "indexes"
    functions = read_jsonl(indexes / "functions.jsonl")
    windows = read_jsonl(indexes / "windows.meta.jsonl")
    if not functions or not windows:
        return index_not_built_payload()
    query = choose_query_function(functions, symbol, unit)
    if query is None:
        return function_not_indexed_payload(symbol, functions)

    with (indexes / "manifest.json").open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    dimension, vectors = load_sparse_vectors(indexes / "windows.vec.bin")
    if len(vectors) != len(windows):
        raise ValueError(
            f"window metadata/vector row mismatch: {len(windows)} metadata rows, {len(vectors)} vectors"
        )
    for position, metadata in enumerate(windows):
        if int(metadata.get("row", -1)) != position:
            raise ValueError(
                f"window metadata row {metadata.get('row')} is out of sequence at position {position}"
            )
    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    if counts:
        if int(counts.get("functions", -1)) != len(functions):
            raise ValueError("function row count does not match manifest")
        if int(counts.get("windows", -1)) != len(windows):
            raise ValueError("window row count does not match manifest")
    expected_dimension = int((manifest.get("embed") or {}).get("dim") or dimension)
    if dimension != expected_dimension:
        raise ValueError(f"vector dimension {dimension} does not match manifest {expected_dimension}")

    window_size = int(manifest.get("window_size") or 32)
    stride = int(manifest.get("stride") or 16)
    query_windows = [
        (start, embed_hashed_sparse(document, dim=dimension))
        for start, document in token_windows(list(query.get("tokens") or []), window_size, stride)
    ]
    effective_min_match = None if include_all else min_match
    functions_by_key = {
        (str(row.get("symbol") or ""), str(row.get("unit") or "")): row
        for row in functions
    }
    query_key = (str(query.get("symbol") or ""), str(query.get("unit") or ""))
    donors: list[tuple[dict[str, Any], dict[str, Any], tuple[array, array]]] = []
    for metadata, vector in zip(windows, vectors):
        key = (str(metadata.get("symbol") or ""), str(metadata.get("unit") or ""))
        donor_function = functions_by_key.get(key)
        if donor_function is None or key == query_key:
            continue
        if exclude_self_unit and key[1] == query_key[1]:
            continue
        if not _fuzzy_allowed(donor_function, effective_min_match):
            continue
        donors.append((metadata, donor_function, vector))

    best: dict[tuple[str, str], dict[str, Any]] = {}
    for query_start, query_vector in query_windows:
        for metadata, donor_function, vector in donors:
            similarity = sparse_dot(query_vector, vector)
            donor_key = (
                str(donor_function.get("symbol") or ""),
                str(donor_function.get("unit") or ""),
            )
            current = best.get(donor_key)
            candidate = {
                "symbol": donor_key[0],
                "unit": donor_key[1],
                "source_path": donor_function.get("source_path") or "",
                "fuzzy_match_percent": donor_function.get("fuzzy_match_percent"),
                "similarity": round(similarity, 6),
                "query_window_start": query_start,
                "donor_window_start": int(metadata.get("start") or 0),
                "window_insns": int(metadata.get("insn_count") or 0),
            }
            if current is None or (
                candidate["similarity"],
                -candidate["query_window_start"],
                -candidate["donor_window_start"],
            ) > (
                current["similarity"],
                -current["query_window_start"],
                -current["donor_window_start"],
            ):
                best[donor_key] = candidate

    ranked = sorted(
        best.values(),
        key=lambda row: (
            -float(row["similarity"]),
            str(row["symbol"]),
            str(row["unit"]),
        ),
    )[: max(1, limit)]
    return {
        "status": "ok",
        "query": {
            "symbol": query.get("symbol"),
            "unit": query.get("unit"),
            "insn_count": query.get("insn_count"),
            "n_windows": len(query_windows),
        },
        "results": ranked,
        "searched_windows": len(donors),
        "min_match": effective_min_match,
        "index": manifest,
        "index_root": str(index_root),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search for matching assembly constructs.")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--unit")
    parser.add_argument("--min-match", type=float, default=98.0)
    parser.add_argument("--all", action="store_true", dest="include_all")
    parser.add_argument("--exclude-self-unit", action="store_true")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = build_payload(
        args.symbol,
        unit=args.unit,
        min_match=args.min_match,
        include_all=args.include_all,
        exclude_self_unit=args.exclude_self_unit,
        limit=args.limit,
    )
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
