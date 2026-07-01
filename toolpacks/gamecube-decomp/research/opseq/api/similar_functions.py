#!/usr/bin/env python3
"""Search opcode-sequence indexes for concrete similar-function evidence."""

from __future__ import annotations

import argparse
from collections import defaultdict
import json
import re
from pathlib import Path
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))
sys.path.append(str(TOOL_ROOT / "runners"))

from extract_opcode_sequences import (  # type: ignore
    count_bucket,
    histogram_norm,
    sequence_digest,
    similarity_components,
    similarity_features,
)
from search_index import (  # type: ignore
    env_path,
    load_tool_descriptor,
    tool_storage_root,
    tool_storage_roots,
)


SEQUENCE_INDEX = Path("indexes") / "opcode_sequences.jsonl"
FINGERPRINT_INDEX = Path("indexes") / "opcode_fingerprints.jsonl"
NEIGHBOR_INDEX = Path("indexes") / "opcode_neighbors.jsonl"
FUNCTION_SHAPES_INDEX = Path("indexes") / "function_shapes.jsonl"


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
                row.setdefault("index_path", str(path))
                row.setdefault("index_line", line_number)
                rows.append(row)
    return rows


def load_rows(relative_path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for storage_root in tool_storage_roots(TOOL_ROOT):
        rows.extend(read_jsonl(storage_root / relative_path))
    return dedupe_rows(rows)


def dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for row in rows:
        key = str(row.get("id") or f"{row.get('index_path')}:{row.get('index_line')}")
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def index_counts() -> dict[str, int]:
    return {
        "function_shapes": count_rows(FUNCTION_SHAPES_INDEX),
        "opcode_sequences": count_rows(SEQUENCE_INDEX),
        "fingerprints": count_rows(FINGERPRINT_INDEX),
        "neighbors": count_rows(NEIGHBOR_INDEX),
    }


def count_rows(relative_path: Path) -> int:
    return sum(1 for row in load_rows(relative_path) if row)


def normalize_query(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def opcode_vocabulary(rows: list[dict[str, Any]]) -> set[str]:
    vocab: set[str] = set()
    for row in rows:
        sequence = row.get("opcode_sequence")
        if isinstance(sequence, list):
            vocab.update(str(opcode).lower() for opcode in sequence)
        histogram = row.get("opcode_histogram")
        if isinstance(histogram, dict):
            vocab.update(str(opcode).lower() for opcode in histogram)
    return vocab


def parse_opcode_query(query: str, vocab: set[str]) -> list[str]:
    normalized = query.strip().lower()
    if not normalized:
        return []
    if len(normalized) == 40 and re.fullmatch(r"[a-f0-9]{40}", normalized):
        return []
    tokens = [token for token in re.split(r"[^A-Za-z0-9_.]+", normalized) if token]
    if not tokens:
        return []
    known_tokens = [token for token in tokens if token in vocab]
    has_sequence_separator = "," in normalized or " " in normalized or "\t" in normalized or "|" in normalized
    if len(known_tokens) >= 2:
        return known_tokens
    if len(tokens) >= 2 and has_sequence_separator and len(known_tokens) >= max(1, len(tokens) // 2):
        return known_tokens
    if len(tokens) == 1 and tokens[0] in vocab and has_sequence_separator:
        return tokens
    return []


def resolve_exact_lookup(query: str, rows: list[dict[str, Any]], opcode_query: list[str]) -> list[dict[str, Any]]:
    q = normalize_query(query)
    sequence_hash = sequence_digest(opcode_query) if opcode_query else ""
    matches: list[tuple[int, str, dict[str, Any]]] = []
    for row in rows:
        symbol = normalize_query(str(row.get("symbol") or ""))
        source_path = normalize_query(str(row.get("source_path") or ""))
        unit = normalize_query(str(row.get("unit") or ""))
        address = normalize_query(str(row.get("address") or ""))
        row_hash = normalize_query(str(row.get("opcode_sequence_hash") or ""))
        match_type = ""
        priority = 100
        if q and symbol == q:
            match_type = "symbol_exact"
            priority = 0
        elif q and address == q:
            match_type = "address_exact"
            priority = 1
        elif q and row_hash == q:
            match_type = "sequence_hash_exact"
            priority = 2
        elif sequence_hash and row_hash == sequence_hash:
            match_type = "opcode_sequence_exact"
            priority = 3
        elif q and source_path == q:
            match_type = "source_path_exact"
            priority = 4
        elif q and unit == q:
            match_type = "unit_exact"
            priority = 5
        elif q and looks_like_path(q) and source_path.endswith(q):
            match_type = "source_path_suffix"
            priority = 6
        elif q and looks_like_path(q) and unit.endswith(q):
            match_type = "unit_suffix"
            priority = 7
        elif opcode_query and sequence_starts_with(list(row.get("opcode_sequence") or []), opcode_query):
            match_type = "opcode_prefix"
            priority = 8
        elif q and looks_like_path(q) and q in source_path:
            match_type = "source_path_contains"
            priority = 9
        elif q and q in symbol:
            match_type = "symbol_contains"
            priority = 10
        if match_type:
            matches.append((priority, match_type, row))
    matches.sort(key=lambda item: (item[0], function_sort_key(item[2])))
    return [format_function_result(row, match_type, 1.0 if priority <= 8 else 0.75) for priority, match_type, row in matches]


def looks_like_path(query: str) -> bool:
    return "/" in query or "\\" in query or "." in query


def sequence_starts_with(sequence: list[Any], prefix: list[str]) -> bool:
    if not prefix or len(sequence) < len(prefix):
        return False
    return [str(value).lower() for value in sequence[: len(prefix)]] == prefix


def format_function_result(row: dict[str, Any], match_type: str, score: float) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "title": row.get("title") or row.get("symbol") or row.get("id"),
        "match_type": match_type,
        "score": score,
        "symbol": row.get("symbol"),
        "source_path": row.get("source_path"),
        "unit": row.get("unit"),
        "address": row.get("address"),
        "opcode_count": row.get("opcode_count"),
        "opcode_prefix": row.get("opcode_prefix"),
        "opcode_sequence_hash": row.get("opcode_sequence_hash"),
        "evidence_ref": row.get("evidence_ref") or row.get("index_path"),
        "payload": row.get("payload") or compact_payload(row),
    }


def compact_payload(row: dict[str, Any]) -> dict[str, Any]:
    excluded = {"text", "opcode_sequence", "opcode_bigrams", "opcode_trigram_sample"}
    return {key: value for key, value in row.items() if key not in excluded}


def neighbor_lookup(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for row in rows:
        source_id = str(row.get("source_sequence_id") or "")
        if source_id:
            lookup[source_id] = row
        fallback_id = f"opcode_sequence:{row.get('unit')}:{row.get('symbol')}"
        lookup.setdefault(fallback_id, row)
    return lookup


def precomputed_neighbors(
    exact_lookup: list[dict[str, Any]],
    sequence_rows_by_id: dict[str, dict[str, Any]],
    neighbor_rows_by_source_id: dict[str, dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for lookup_result in exact_lookup:
        source_id = str(lookup_result.get("id") or "")
        source_row = sequence_rows_by_id.get(source_id)
        neighbor_row = neighbor_rows_by_source_id.get(source_id)
        if not source_row or not neighbor_row:
            continue
        for neighbor in neighbor_row.get("neighbors") or []:
            if not isinstance(neighbor, dict):
                continue
            target_id = str(neighbor.get("id") or "")
            key = (source_id, target_id)
            if key in seen:
                continue
            seen.add(key)
            results.append(format_precomputed_neighbor(source_row, neighbor_row, neighbor))
    results.sort(
        key=lambda item: (
            -float(item.get("score") or 0),
            str(item.get("query_function", {}).get("symbol") or "").lower(),
            str(item.get("symbol") or "").lower(),
            str(item.get("id") or ""),
        )
    )
    return results[:limit]


def format_precomputed_neighbor(source_row: dict[str, Any], neighbor_row: dict[str, Any], neighbor: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": neighbor.get("id"),
        "title": f"{source_row.get('symbol')} -> {neighbor.get('symbol')}",
        "source": "precomputed_neighbors",
        "query_function": function_brief(source_row),
        "rank": neighbor.get("rank"),
        "symbol": neighbor.get("symbol"),
        "source_path": neighbor.get("source_path"),
        "unit": neighbor.get("unit"),
        "address": neighbor.get("address"),
        "opcode_count": neighbor.get("opcode_count"),
        "opcode_prefix": neighbor.get("opcode_prefix"),
        "opcode_sequence_hash": neighbor.get("opcode_sequence_hash"),
        "score": neighbor.get("score"),
        "score_components": neighbor.get("score_components") or {},
        "evidence_refs": {
            "source": source_row.get("evidence_ref"),
            "target": neighbor.get("evidence_ref"),
            "neighbor_index": neighbor_row.get("index_path") or neighbor_row.get("evidence_ref"),
            "source_fingerprint": neighbor.get("source_fingerprint_ref") or neighbor_row.get("source_fingerprint_ref"),
            "target_fingerprint": neighbor.get("fingerprint_ref"),
        },
        "payload": neighbor,
    }


def function_brief(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "symbol": row.get("symbol"),
        "source_path": row.get("source_path"),
        "unit": row.get("unit"),
        "address": row.get("address"),
        "opcode_count": row.get("opcode_count"),
        "opcode_sequence_hash": row.get("opcode_sequence_hash"),
        "evidence_ref": row.get("evidence_ref"),
    }


def on_demand_opcode_neighbors(opcode_query: list[str], rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if not opcode_query:
        return []
    query_row = {
        "id": "opcode_query",
        "symbol": "<opcode-query>",
        "opcode_sequence": opcode_query,
        "opcode_count": len(opcode_query),
        "opcode_prefix": ",".join(opcode_query[:12]),
        "opcode_sequence_hash": sequence_digest(opcode_query),
        "opcode_histogram": dict(sorted({opcode: opcode_query.count(opcode) for opcode in set(opcode_query)}.items())),
        "opcode_count_bucket": count_bucket(len(opcode_query)),
    }
    query_features = similarity_features(opcode_query)
    query_histogram = query_row["opcode_histogram"]
    query_norm = histogram_norm(query_histogram)
    scored: list[dict[str, Any]] = []
    for row in rows:
        target_opcodes = list(row.get("opcode_sequence") or [])
        target_histogram = row.get("opcode_histogram") if isinstance(row.get("opcode_histogram"), dict) else {}
        components = similarity_components(
            query_row,
            row,
            query_features,
            similarity_features(target_opcodes),
            query_histogram,
            target_histogram,
            query_norm,
            histogram_norm(target_histogram),
        )
        if components["score"] <= 0:
            continue
        scored.append(format_on_demand_neighbor(row, opcode_query, components))
    scored.sort(key=lambda item: (-float(item.get("score") or 0), function_sort_key(item)))
    return scored[:limit]


def format_on_demand_neighbor(row: dict[str, Any], opcode_query: list[str], components: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "title": f"Opcode query -> {row.get('symbol')}",
        "source": "on_demand_opcode_query",
        "query_opcode_count": len(opcode_query),
        "query_opcode_prefix": ",".join(opcode_query[:12]),
        "symbol": row.get("symbol"),
        "source_path": row.get("source_path"),
        "unit": row.get("unit"),
        "address": row.get("address"),
        "opcode_count": row.get("opcode_count"),
        "opcode_prefix": row.get("opcode_prefix"),
        "opcode_sequence_hash": row.get("opcode_sequence_hash"),
        "score": components.get("score"),
        "score_components": {key: value for key, value in components.items() if key != "score"},
        "evidence_refs": {
            "target": row.get("evidence_ref"),
            "target_index": row.get("index_path"),
        },
        "payload": compact_payload(row),
    }


def lexical_fallback(query: str, sequence_rows: list[dict[str, Any]], shape_rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    terms = [term for term in re.findall(r"[A-Za-z0-9_./:-]+", query.lower()) if len(term) >= 2]
    phrase = query.lower().strip()
    scored: list[tuple[int, dict[str, Any], str]] = []
    for rows, match_type in ((sequence_rows, "lexical_opcode_sequence"), (shape_rows, "lexical_function_shape")):
        for row in rows:
            text = searchable_text(row).lower()
            score = 0
            if phrase and phrase in text:
                score += 10
            for term in terms:
                if term in text:
                    score += 1
            if score > 0:
                scored.append((score, row, match_type))
    scored.sort(key=lambda item: (-item[0], function_sort_key(item[1])))
    return [format_function_result(row, match_type, float(score)) for score, row, match_type in scored[:limit]]


def searchable_text(row: dict[str, Any]) -> str:
    return "\n".join(
        str(row.get(field) or "")
        for field in ("title", "symbol", "source_path", "unit", "address", "kind", "text", "summary", "evidence_ref")
    )


def function_sort_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("symbol") or "").lower(),
        str(row.get("unit") or "").lower(),
        str(row.get("id") or ""),
    )


def resolution_payload(query: str, exact_lookup: list[dict[str, Any]], opcode_query: list[str], used_precomputed: bool) -> dict[str, Any]:
    match_types: dict[str, int] = defaultdict(int)
    for result in exact_lookup:
        match_types[str(result.get("match_type") or "unknown")] += 1
    if used_precomputed:
        strategy = "function_neighbors"
    elif opcode_query:
        strategy = "opcode_query"
    elif exact_lookup:
        strategy = "lookup_only"
    else:
        strategy = "lexical_fallback"
    return {
        "resolved": bool(exact_lookup or opcode_query),
        "strategy": strategy,
        "query": query,
        "opcode_query": opcode_query,
        "match_types": dict(sorted(match_types.items())),
        "resolved_symbols": [str(result.get("symbol") or "") for result in exact_lookup[:10]],
    }


def build_payload(query: str, limit: int) -> dict[str, Any]:
    descriptor = load_tool_descriptor(TOOL_ROOT)
    sequence_rows = load_rows(SEQUENCE_INDEX)
    fingerprint_rows = load_rows(FINGERPRINT_INDEX)
    neighbor_rows = load_rows(NEIGHBOR_INDEX)
    shape_rows = load_rows(FUNCTION_SHAPES_INDEX)
    sequence_rows_by_id = {str(row.get("id")): row for row in sequence_rows}
    opcode_query = parse_opcode_query(query, opcode_vocabulary(sequence_rows))
    exact_lookup = resolve_exact_lookup(query, sequence_rows, opcode_query)
    neighbor_rows_by_source_id = neighbor_lookup(neighbor_rows)
    precomputed = precomputed_neighbors(exact_lookup, sequence_rows_by_id, neighbor_rows_by_source_id, limit)
    similar_neighbors = precomputed
    if not similar_neighbors and opcode_query:
        similar_neighbors = on_demand_opcode_neighbors(opcode_query, sequence_rows, limit)
    fallback = []
    if not exact_lookup and not similar_neighbors:
        fallback = lexical_fallback(query, sequence_rows, shape_rows, limit)
    results = similar_neighbors or exact_lookup[:limit] or fallback
    return {
        "tool": "opseq",
        "query": query,
        "limit": limit,
        "available": bool(sequence_rows),
        "operation_mode": descriptor.get("operation_mode") or ("live_runner_v2" if sequence_rows else "scaffolded"),
        "limitations": descriptor.get("limitations") or [],
        "query_resolution": resolution_payload(query, exact_lookup, opcode_query, bool(precomputed)),
        "exact_lookup": exact_lookup[:limit],
        "similar_neighbors": similar_neighbors[:limit],
        "lexical_fallback": fallback,
        "results": results,
        "index_counts": {
            **index_counts(),
            "loaded_opcode_sequences": len(sequence_rows),
            "loaded_fingerprints": len(fingerprint_rows),
            "loaded_neighbors": len(neighbor_rows),
        },
        "cache_path": str(tool_storage_root(TOOL_ROOT) / "cache"),
        "indexes_path": str(tool_storage_root(TOOL_ROOT) / "indexes"),
        "shared_data_root": str(env_path("ORCH_TOOL_SHARED_DATA_ROOT")) if env_path("ORCH_TOOL_SHARED_DATA_ROOT") else None,
        "storage_roots": [str(path) for path in tool_storage_roots(TOOL_ROOT)],
        "message": descriptor.get("status_message") or ("Opcode sequence index is ready." if sequence_rows else "No opcode sequence index has been generated yet."),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Find cached opcode-sequence neighbors.")
    parser.add_argument("--query", required=True, help="Function, source path, symbol, or opcode fingerprint query.")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of results.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()
    limit = max(1, args.limit)
    payload = build_payload(args.query, limit)
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
