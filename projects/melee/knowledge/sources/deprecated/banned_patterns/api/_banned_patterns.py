#!/usr/bin/env python3
"""Shared helpers for the banned_patterns injectable source.

Data files (the exact paths review_lint's _qa_rules.py loaders read,
env-overridable there via REVIEW_LINT_BANNED_DIR):

- ``data/banned.jsonl``: one record per maintainer-rejected pattern.
- ``data/tombstones.jsonl``: fuzzy token-shingle hashes of rejected hunks.
- ``data/proposals/<pr>-<comment-id>.json``: PROPOSED candidates extracted
  from inline review comments; promoted to banned.jsonl by a human or the
  curator flow, never automatically.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from source_index import source_storage_root  # type: ignore


def source_root() -> Path:
    return Path(__file__).resolve().parents[1]


def storage_root() -> Path:
    return source_storage_root(source_root())


def descriptor() -> dict[str, Any]:
    return json.loads((source_root() / "source.json").read_text(encoding="utf-8"))


def banned_path() -> Path:
    return storage_root() / "data" / "banned.jsonl"


def tombstones_path() -> Path:
    return storage_root() / "data" / "tombstones.jsonl"


def proposals_dir() -> Path:
    return storage_root() / "data" / "proposals"


def index_path() -> Path:
    return storage_root() / "indexes" / "banned_patterns.jsonl"


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def load_banned_records() -> list[dict[str, Any]]:
    return load_jsonl(banned_path())


def load_tombstone_records() -> list[dict[str, Any]]:
    return load_jsonl(tombstones_path())


def load_proposal_records() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    directory = proposals_dir()
    if not directory.is_dir():
        return rows
    for path in sorted(directory.glob("*.json")):
        try:
            row = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(row, dict):
            row.setdefault("proposal_path", str(path))
            rows.append(row)
    return rows


def record_text(record: dict[str, Any]) -> str:
    detector = record.get("detector") or {}
    parts = [
        record.get("id"),
        record.get("file"),
        record.get("excerpt"),
        record.get("comment"),
        record.get("standard_id"),
        record.get("disposition"),
        record.get("comment_url"),
        str(record.get("source_pr")),
        detector.get("type"),
        detector.get("pattern"),
    ]
    return json.dumps(parts, sort_keys=True)


def format_hit(record: dict[str, Any], score: int, kind: str) -> dict[str, Any]:
    detector = record.get("detector") or {}
    disposition = record.get("disposition")
    if disposition is None and kind == "tombstone":
        disposition = "rejected"
    payload = record
    if "shingles" in record:
        payload = {key: value for key, value in record.items() if key != "shingles"}
        payload["shingle_count"] = len(record.get("shingles") or [])
    return {
        "id": record.get("id"),
        "kind": kind,
        "score": score,
        "source_pr": record.get("source_pr"),
        "file": record.get("file"),
        "disposition": disposition,
        "detector_type": detector.get("type"),
        "standard_id": record.get("standard_id"),
        "comment_url": record.get("comment_url"),
        "snippet": clip(str(record.get("comment") or record.get("excerpt") or "")),
        "payload": payload,
    }


def search_records(query: str, limit: int) -> list[dict[str, Any]]:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9_./:-]+", query) if len(term) >= 2]
    phrase = query.lower().strip()
    hits: list[tuple[int, str, dict[str, Any]]] = []
    pools = [
        ("banned_pattern", load_banned_records()),
        ("tombstone", load_tombstone_records()),
        ("proposal", load_proposal_records()),
    ]
    for kind, records in pools:
        for record in records:
            text = record_text(record).lower()
            score = 0
            if phrase and phrase in text:
                score += 10
            score += sum(1 for term in terms if term in text)
            if score > 0:
                hits.append((score, kind, record))
    hits.sort(key=lambda item: (-item[0], item[1], str(item[2].get("id"))))
    return [format_hit(record, score, kind) for score, kind, record in hits[: max(0, limit)]]


def status_payload() -> dict[str, Any]:
    banned = load_banned_records()
    tombstones = load_tombstone_records()
    proposals = load_proposal_records()
    dispositions: dict[str, int] = {}
    detector_types: dict[str, int] = {}
    for record in banned:
        disposition = str(record.get("disposition") or "unspecified")
        dispositions[disposition] = dispositions.get(disposition, 0) + 1
        detector = (record.get("detector") or {}).get("type") or "unspecified"
        detector_types[str(detector)] = detector_types.get(str(detector), 0) + 1
    return {
        "source": "banned_patterns",
        "title": descriptor().get("title"),
        "status": "ready" if banned or tombstones else "missing_records",
        "available": bool(banned or tombstones),
        "banned_count": len(banned),
        "banned_by_disposition": dispositions,
        "banned_by_detector_type": detector_types,
        "tombstone_count": len(tombstones),
        "proposal_count": len(proposals),
        "banned_path": str(banned_path()),
        "tombstones_path": str(tombstones_path()),
        "proposals_dir": str(proposals_dir()),
        "index_path": str(index_path()),
        "index_ready": index_path().exists(),
        "index_records": count_jsonl(index_path()),
        "consumed_by": "toolpacks/gamecube-decomp/source_editing/review_lint/api/_qa_rules.py",
        "mutation_policy": "proposal_only; regex detectors require human approval before gating",
    }


def write_index() -> dict[str, Any]:
    rows = []
    for record in load_banned_records():
        detector = record.get("detector") or {}
        rows.append(
            {
                "id": record.get("id"),
                "source_id": "banned_patterns",
                "kind": "banned_pattern",
                "disposition": record.get("disposition"),
                "detector_type": detector.get("type"),
                "source_pr": record.get("source_pr"),
                "file": record.get("file"),
                "standard_id": record.get("standard_id"),
                "comment_url": record.get("comment_url"),
                "text": "\n".join(
                    [
                        str(record.get("file", "")),
                        str(record.get("excerpt", "")),
                        str(record.get("comment", "")),
                        str(record.get("standard_id", "")),
                        str(record.get("disposition", "")),
                    ]
                ),
                "payload": record,
            }
        )
    for record in load_tombstone_records():
        payload = {key: value for key, value in record.items() if key != "shingles"}
        payload["shingle_count"] = len(record.get("shingles") or [])
        rows.append(
            {
                "id": record.get("id"),
                "source_id": "banned_patterns",
                "kind": "tombstone",
                "disposition": "rejected",
                "detector_type": "shingle",
                "source_pr": record.get("source_pr"),
                "file": record.get("file"),
                "standard_id": record.get("standard_id"),
                "comment_url": record.get("comment_url"),
                "text": "\n".join(
                    [
                        str(record.get("file", "")),
                        str(record.get("symbol", "")),
                        str(record.get("comment", "")),
                        str(record.get("standard_id", "")),
                    ]
                ),
                "payload": payload,
            }
        )
    index_path().parent.mkdir(parents=True, exist_ok=True)
    index_path().write_text(
        "".join(f"{json.dumps(row, sort_keys=True)}\n" for row in rows), encoding="utf-8"
    )
    return {"index_path": str(index_path()), "records_written": len(rows)}


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip())


def clip(text: str, limit: int = 420) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


def print_json(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))


def json_flag_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    return parser
