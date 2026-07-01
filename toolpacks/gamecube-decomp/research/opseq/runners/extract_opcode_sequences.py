#!/usr/bin/env python3
"""Extract live opcode fingerprints from generated assembly files."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))
from search_index import package_root_for_tool, tool_storage_root  # type: ignore

PACKAGE_ROOT = package_root_for_tool(TOOL_ROOT)
TOOL_STORAGE_ROOT = tool_storage_root(TOOL_ROOT)
DEFAULT_REPO_ROOT = PACKAGE_ROOT / "projects" / "melee" / "checkout"
PREFIX_OPCODE_COUNT = 12
DEFAULT_NEIGHBOR_LIMIT = 10
MAX_CANDIDATE_FEATURES = 48
MAX_POSTING_SIZE = 500
MAX_SCORE_CANDIDATES = 700
MAX_HASH_GROUP_CANDIDATES = 250
MINHASH_SIZE = 16


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate opcode-sequence fingerprints from build/GALE01/asm.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--limit", type=int, default=0, help="Maximum functions to index; 0 means all.")
    parser.add_argument("--neighbors-limit", type=int, default=DEFAULT_NEIGHBOR_LIMIT, help="Top similar functions to persist per function.")
    parser.add_argument("--query", default="", help="Optional symbol/opcode query to include in the smoke summary.")
    return parser.parse_args()


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
            opcode = normalize_opcode(instruction.split()[0])
            if not opcode:
                continue
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


def normalize_opcode(value: str) -> str:
    return value.strip().lower()


def make_row(
    repo_root: Path,
    asm_path: Path,
    start_line: int,
    symbol: str,
    opcodes: list[str],
    formatted: list[str],
    metadata: dict[str, Any],
) -> dict[str, Any]:
    asm_unit = unit_from_asm_path(repo_root, asm_path)
    meta = resolve_report_metadata(metadata, asm_unit, symbol)
    opcode_prefix = ",".join(opcodes[:PREFIX_OPCODE_COUNT])
    opcode_histogram = dict(sorted(Counter(opcodes).items()))
    opcode_bigrams = sorted(opcode_ngrams(opcodes, 2))
    opcode_trigrams = sorted(opcode_ngrams(opcodes, 3))
    sequence_hash = sequence_digest(opcodes)
    histogram_hash = stable_digest(opcode_histogram)
    unique_opcode_count = len(opcode_histogram)
    opcode_count_bucket = count_bucket(len(opcodes))
    unit = str(meta.get("unit") or asm_unit)
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
            sequence_hash,
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
        "opcode_sequence": opcodes,
        "opcode_sequence_text": " ".join(opcodes),
        "opcode_sequence_hash": sequence_hash,
        "opcode_histogram": opcode_histogram,
        "opcode_histogram_hash": histogram_hash,
        "opcode_bigrams": opcode_bigrams,
        "opcode_trigram_sample": opcode_trigrams[:64],
        "opcode_ngram_count": len(similarity_features(opcodes)),
        "unique_opcode_count": unique_opcode_count,
        "opcode_count_bucket": opcode_count_bucket,
        "sample_instructions": formatted,
        "text": text,
        "evidence_ref": f"{asm_path}#line={start_line}",
        "payload": {
            **meta,
            "asm_unit": asm_unit,
            "asm_path": str(asm_path),
            "asm_line": start_line,
            "opcode_count": len(opcodes),
            "opcode_prefix": opcode_prefix,
            "opcode_sequence_hash": sequence_hash,
            "opcode_histogram_hash": histogram_hash,
            "unique_opcode_count": unique_opcode_count,
            "opcode_count_bucket": opcode_count_bucket,
        },
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


def dedupe_sequence_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    unit = str(row.get("unit") or "")
    asm_unit = str(payload.get("asm_unit") or "")
    return (
        1 if asm_unit and asm_unit == unit else 0,
        1 if row.get("source_path") else 0,
        1 if row.get("address") else 0,
        int(row.get("opcode_count") or 0),
        str(row.get("evidence_ref") or ""),
    )


def opcode_ngrams(opcodes: list[str], size: int) -> set[str]:
    if size <= 0 or len(opcodes) < size:
        return set()
    return {" ".join(opcodes[index : index + size]) for index in range(len(opcodes) - size + 1)}


def similarity_features(opcodes: list[str]) -> set[str]:
    features = {f"op:{opcode}" for opcode in opcodes}
    features.update(f"bg:{ngram}" for ngram in opcode_ngrams(opcodes, 2))
    features.update(f"tg:{ngram}" for ngram in opcode_ngrams(opcodes, 3))
    return features


def sequence_digest(opcodes: list[str]) -> str:
    return stable_digest(opcodes)


def stable_digest(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha1(encoded).hexdigest()


def feature_digest(features: set[str]) -> str:
    return stable_digest(sorted(features))


def count_bucket(count: int) -> str:
    if count < 32:
        width = 8
    elif count < 256:
        width = 32
    elif count < 1024:
        width = 128
    else:
        width = 512
    low = (count // width) * width
    return f"{low}-{low + width - 1}"


def xorhash64(features: set[str]) -> str:
    fingerprint = 0
    for feature in sorted(features):
        fingerprint ^= int.from_bytes(hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest(), "big")
    return f"{fingerprint:016x}"


def minhash_signature(features: set[str], size: int = MINHASH_SIZE) -> list[str]:
    if not features:
        return []
    hashes = sorted(int.from_bytes(hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest(), "big") for feature in features)
    return [f"{value:016x}" for value in hashes[:size]]


def make_fingerprint_row(row: dict[str, Any]) -> dict[str, Any]:
    opcodes = list(row.get("opcode_sequence") or [])
    features = similarity_features(opcodes)
    feature_hash = feature_digest(features)
    fingerprint_id = fingerprint_row_id(row)
    text = " ".join(
        part
        for part in [
            str(row.get("symbol") or ""),
            str(row.get("source_path") or ""),
            str(row.get("unit") or ""),
            str(row.get("address") or ""),
            str(row.get("opcode_prefix") or ""),
            str(row.get("opcode_sequence_hash") or ""),
            feature_hash,
        ]
        if part
    )
    return {
        "id": fingerprint_id,
        "kind": "opcode_fingerprint",
        "title": f"Opcode fingerprint: {row.get('symbol')}",
        "symbol": row.get("symbol"),
        "source_path": row.get("source_path"),
        "unit": row.get("unit"),
        "address": row.get("address"),
        "opcode_count": row.get("opcode_count"),
        "opcode_prefix": row.get("opcode_prefix"),
        "opcode_sequence": opcodes,
        "opcode_sequence_hash": row.get("opcode_sequence_hash"),
        "opcode_histogram": row.get("opcode_histogram"),
        "opcode_histogram_hash": row.get("opcode_histogram_hash"),
        "unique_opcode_count": row.get("unique_opcode_count"),
        "opcode_count_bucket": row.get("opcode_count_bucket"),
        "opcode_feature_count": len(features),
        "opcode_feature_hash": feature_hash,
        "opcode_feature_xor64": xorhash64(features),
        "opcode_minhash16": minhash_signature(features),
        "sample_instructions": row.get("sample_instructions") or [],
        "text": text,
        "evidence_ref": row.get("evidence_ref"),
        "payload": {
            **(row.get("payload") if isinstance(row.get("payload"), dict) else {}),
            "opcode_sequence_id": row.get("id"),
            "opcode_fingerprint_id": fingerprint_id,
            "opcode_feature_hash": feature_hash,
        },
    }


def fingerprint_row_id(row: dict[str, Any]) -> str:
    return f"opcode_fingerprint:{row.get('unit')}:{row.get('symbol')}"


def neighbor_row_id(row: dict[str, Any]) -> str:
    return f"opcode_neighbors:{row.get('unit')}:{row.get('symbol')}"


def build_neighbor_rows(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    features_by_index = [similarity_features(list(row.get("opcode_sequence") or [])) for row in rows]
    histograms = [row.get("opcode_histogram") if isinstance(row.get("opcode_histogram"), dict) else {} for row in rows]
    histogram_norms = [histogram_norm(histogram) for histogram in histograms]
    postings: dict[str, list[int]] = defaultdict(list)
    sequence_hash_groups: dict[str, list[int]] = defaultdict(list)
    prefix_groups: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        for feature in features_by_index[index]:
            postings[feature].append(index)
        sequence_hash_groups[str(row.get("opcode_sequence_hash") or "")].append(index)
        prefix_groups[str(row.get("opcode_prefix") or "")].append(index)

    neighbor_rows: list[dict[str, Any]] = []
    for source_index, source_row in enumerate(rows):
        candidate_counts: Counter[int] = Counter()
        selected_features = sorted(
            features_by_index[source_index],
            key=lambda feature: (len(postings.get(feature, [])), feature),
        )[:MAX_CANDIDATE_FEATURES]
        for feature in selected_features:
            feature_postings = postings.get(feature, [])
            if len(feature_postings) > MAX_POSTING_SIZE:
                continue
            for candidate_index in feature_postings:
                if candidate_index != source_index:
                    candidate_counts[candidate_index] += 1

        add_hash_group_candidates(candidate_counts, sequence_hash_groups.get(str(source_row.get("opcode_sequence_hash") or ""), []), source_index, 200)
        add_hash_group_candidates(candidate_counts, prefix_groups.get(str(source_row.get("opcode_prefix") or ""), []), source_index, 40)

        if len(candidate_counts) > MAX_SCORE_CANDIDATES:
            ranked_candidates = sorted(
                candidate_counts,
                key=lambda index: (-candidate_counts[index], function_sort_key(rows[index])),
            )[:MAX_SCORE_CANDIDATES]
        else:
            ranked_candidates = list(candidate_counts)

        scored_neighbors: list[dict[str, Any]] = []
        for target_index in ranked_candidates:
            components = similarity_components(
                source_row,
                rows[target_index],
                features_by_index[source_index],
                features_by_index[target_index],
                histograms[source_index],
                histograms[target_index],
                histogram_norms[source_index],
                histogram_norms[target_index],
            )
            if components["score"] <= 0:
                continue
            scored_neighbors.append(make_neighbor(source_row, rows[target_index], components))
        scored_neighbors.sort(
            key=lambda item: (
                -float(item.get("score") or 0),
                -float(item.get("score_components", {}).get("sequence_exact") or 0),
                str(item.get("symbol") or "").lower(),
                str(item.get("unit") or "").lower(),
                str(item.get("id") or ""),
            )
        )
        neighbors = []
        for rank, neighbor in enumerate(scored_neighbors[:limit], start=1):
            neighbor["rank"] = rank
            neighbors.append(neighbor)
        neighbor_rows.append(make_neighbor_row(source_row, neighbors))
    return neighbor_rows


def add_hash_group_candidates(candidate_counts: Counter[int], group: list[int], source_index: int, weight: int) -> None:
    if len(group) > MAX_HASH_GROUP_CANDIDATES:
        group = sorted(group)[:MAX_HASH_GROUP_CANDIDATES]
    for candidate_index in group:
        if candidate_index != source_index:
            candidate_counts[candidate_index] += weight


def histogram_norm(histogram: dict[str, Any]) -> float:
    return math.sqrt(sum(float(value or 0) ** 2 for value in histogram.values()))


def histogram_cosine(left: dict[str, Any], right: dict[str, Any], left_norm: float, right_norm: float) -> float:
    if not left or not right or left_norm <= 0 or right_norm <= 0:
        return 0.0
    if len(left) > len(right):
        left, right = right, left
    dot = 0.0
    for opcode, value in left.items():
        dot += float(value or 0) * float(right.get(opcode) or 0)
    return dot / (left_norm * right_norm)


def prefix_similarity(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    window = min(PREFIX_OPCODE_COUNT, max(len(left), len(right)))
    matches = 0
    for index in range(min(window, len(left), len(right))):
        if left[index] == right[index]:
            matches += 1
    return matches / max(1, window)


def similarity_components(
    source_row: dict[str, Any],
    target_row: dict[str, Any],
    source_features: set[str],
    target_features: set[str],
    source_histogram: dict[str, Any],
    target_histogram: dict[str, Any],
    source_histogram_norm: float,
    target_histogram_norm: float,
) -> dict[str, Any]:
    source_opcodes = list(source_row.get("opcode_sequence") or [])
    target_opcodes = list(target_row.get("opcode_sequence") or [])
    shared_features = source_features & target_features
    union_size = len(source_features | target_features)
    ngram_jaccard = len(shared_features) / union_size if union_size else 0.0
    hist_cosine = histogram_cosine(source_histogram, target_histogram, source_histogram_norm, target_histogram_norm)
    max_count = max(len(source_opcodes), len(target_opcodes))
    length_ratio = min(len(source_opcodes), len(target_opcodes)) / max_count if max_count else 0.0
    prefix = prefix_similarity(source_opcodes, target_opcodes)
    sequence_exact = 1.0 if source_row.get("opcode_sequence_hash") and source_row.get("opcode_sequence_hash") == target_row.get("opcode_sequence_hash") else 0.0
    score = (
        0.40 * ngram_jaccard
        + 0.30 * hist_cosine
        + 0.15 * length_ratio
        + 0.10 * prefix
        + 0.05 * sequence_exact
    )
    return {
        "score": round(score, 6),
        "ngram_jaccard": round(ngram_jaccard, 6),
        "histogram_cosine": round(hist_cosine, 6),
        "length_ratio": round(length_ratio, 6),
        "prefix_similarity": round(prefix, 6),
        "sequence_exact": sequence_exact,
        "shared_feature_count": len(shared_features),
        "shared_feature_sample": feature_sample(shared_features),
    }


def feature_sample(features: set[str]) -> list[str]:
    sample: list[str] = []
    for feature in sorted(features):
        _, _, value = feature.partition(":")
        sample.append(value)
        if len(sample) >= 8:
            break
    return sample


def make_neighbor(source_row: dict[str, Any], target_row: dict[str, Any], components: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": target_row.get("id"),
        "symbol": target_row.get("symbol"),
        "source_path": target_row.get("source_path"),
        "unit": target_row.get("unit"),
        "address": target_row.get("address"),
        "opcode_count": target_row.get("opcode_count"),
        "opcode_prefix": target_row.get("opcode_prefix"),
        "opcode_sequence_hash": target_row.get("opcode_sequence_hash"),
        "score": components["score"],
        "score_components": {key: value for key, value in components.items() if key != "score"},
        "evidence_ref": target_row.get("evidence_ref"),
        "fingerprint_ref": fingerprint_row_id(target_row),
        "source_fingerprint_ref": fingerprint_row_id(source_row),
    }


def make_neighbor_row(source_row: dict[str, Any], neighbors: list[dict[str, Any]]) -> dict[str, Any]:
    neighbor_terms = " ".join(
        f"{neighbor.get('symbol')} score {neighbor.get('score')} {neighbor.get('opcode_sequence_hash')}"
        for neighbor in neighbors
    )
    text = " ".join(
        part
        for part in [
            str(source_row.get("symbol") or ""),
            str(source_row.get("source_path") or ""),
            str(source_row.get("unit") or ""),
            str(source_row.get("address") or ""),
            str(source_row.get("opcode_sequence_hash") or ""),
            neighbor_terms,
        ]
        if part
    )
    return {
        "id": neighbor_row_id(source_row),
        "kind": "opcode_neighbors",
        "title": f"Opcode neighbors: {source_row.get('symbol')}",
        "symbol": source_row.get("symbol"),
        "source_path": source_row.get("source_path"),
        "unit": source_row.get("unit"),
        "address": source_row.get("address"),
        "opcode_count": source_row.get("opcode_count"),
        "opcode_prefix": source_row.get("opcode_prefix"),
        "opcode_sequence_hash": source_row.get("opcode_sequence_hash"),
        "source_sequence_id": source_row.get("id"),
        "source_fingerprint_ref": fingerprint_row_id(source_row),
        "neighbor_count": len(neighbors),
        "neighbors": neighbors,
        "text": text,
        "evidence_ref": source_row.get("evidence_ref"),
        "payload": {
            "source_sequence_id": source_row.get("id"),
            "source_fingerprint_ref": fingerprint_row_id(source_row),
            "neighbor_count": len(neighbors),
        },
    }


def function_sort_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("symbol") or "").lower(),
        str(row.get("unit") or "").lower(),
        str(row.get("id") or ""),
    )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def write_manifest(
    args: argparse.Namespace,
    rows: list[dict[str, Any]],
    raw_record_count: int,
    fingerprint_rows: list[dict[str, Any]],
    neighbor_rows: list[dict[str, Any]],
    generated: list[Path],
    smoke_results: list[dict[str, Any]],
) -> dict[str, Any]:
    generated_artifacts = [str(path) for path in generated if "cache" in path.parts]
    generated_indexes = [str(path) for path in generated if "indexes" in path.parts]
    manifest = {
        "tool": "opseq",
        "runner": "extract_opcode_sequences.py",
        "success": bool(rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": [
            "python3",
            "toolpacks/gamecube-decomp/research/opseq/runners/extract_opcode_sequences.py",
            "--repo-root",
            str(args.repo_root),
            "--neighbors-limit",
            str(args.neighbors_limit),
        ],
        "repo_root": str(args.repo_root),
        "requested_repo_root": str(getattr(args, "requested_repo_root", args.repo_root)),
        "fallback_reason": getattr(args, "fallback_reason", None),
        "record_count": len(rows),
        "raw_record_count": raw_record_count,
        "deduped_record_count": len(rows),
        "artifact_counts": {
            "opcode_sequences": len(rows),
            "fingerprints": len(fingerprint_rows),
            "neighbors": len(neighbor_rows),
        },
        "generated_artifacts": generated_artifacts,
        "generated_indexes": generated_indexes,
        "smoke_results": smoke_results,
        "dependencies": ["build/GALE01/asm", "build/GALE01/report.json"],
    }
    status_path = TOOL_STORAGE_ROOT / "cache" / "runner_status.json"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest


def main() -> int:
    args = parse_args()
    requested_repo_root = args.repo_root
    repo_root, fallback_reason = resolve_repo_root(requested_repo_root)
    args.requested_repo_root = requested_repo_root
    args.repo_root = repo_root
    args.fallback_reason = fallback_reason
    metadata = report_metadata(repo_root)
    raw_rows = list(iter_asm_functions(repo_root, metadata))
    rows = dedupe_sequence_rows(raw_rows)
    if args.limit > 0:
        rows = rows[: args.limit]
    fingerprint_rows = [make_fingerprint_row(row) for row in rows]
    neighbor_rows = build_neighbor_rows(rows, args.neighbors_limit)
    cache_path = TOOL_STORAGE_ROOT / "cache" / "opcode_fingerprints.jsonl"
    index_path = TOOL_STORAGE_ROOT / "indexes" / "opcode_sequences.jsonl"
    fingerprint_index_path = TOOL_STORAGE_ROOT / "indexes" / "opcode_fingerprints.jsonl"
    neighbor_index_path = TOOL_STORAGE_ROOT / "indexes" / "opcode_neighbors.jsonl"
    if not rows:
        manifest = write_manifest(args, rows, len(raw_rows), fingerprint_rows, neighbor_rows, [], [])
        print(json.dumps(manifest, indent=2, sort_keys=True))
        return 1
    write_jsonl(cache_path, fingerprint_rows)
    write_jsonl(index_path, rows)
    write_jsonl(fingerprint_index_path, fingerprint_rows)
    write_jsonl(neighbor_index_path, neighbor_rows)
    query = args.query.strip().lower()
    smoke_results = []
    if query:
        for row in rows:
            haystack = json.dumps(row, sort_keys=True).lower()
            if query in haystack:
                smoke_results.append({"symbol": row.get("symbol"), "evidence_ref": row.get("evidence_ref")})
            if len(smoke_results) >= 5:
                break
    manifest = write_manifest(
        args,
        rows,
        len(raw_rows),
        fingerprint_rows,
        neighbor_rows,
        [cache_path, index_path, fingerprint_index_path, neighbor_index_path],
        smoke_results,
    )
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
