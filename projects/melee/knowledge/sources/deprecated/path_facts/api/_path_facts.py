#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from source_index import package_root_for_source, project_knowledge_root, source_storage_root  # type: ignore


STRENGTH_SCORE = {"strong_hint": 30, "medium_hint": 20, "weak_hint": 10}


def source_root() -> Path:
    return Path(__file__).resolve().parents[1]


def package_root() -> Path:
    return package_root_for_source(source_root())


def storage_root() -> Path:
    return source_storage_root(source_root())


def descriptor() -> dict[str, Any]:
    return json.loads((source_root() / "source.json").read_text(encoding="utf-8"))


def facts_root() -> Path:
    return storage_root() / "data" / "path_facts"


def slices_root() -> Path:
    return storage_root() / "data" / "slices"


def index_path() -> Path:
    return storage_root() / "indexes" / "path_facts.jsonl"


def inventory_path() -> Path:
    return package_root() / "objectives" / "path-scoped-decomp-knowledge" / "artifacts" / "directory_inventory.json"


def enrichment_path() -> Path:
    return project_knowledge_root(source_root()) / "resource_graph" / "enrichments" / "knowledge_curator_updates.jsonl"


def load_facts() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not facts_root().exists():
        return rows
    for path in sorted(facts_root().glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            row.setdefault("source_file", str(path))
            rows.append(row)
    return rows


def normalize_path(path: str) -> str:
    value = path.strip().replace("\\", "/")
    marker = "/src/melee/"
    if marker in value:
        value = "src/melee/" + value.split(marker, 1)[1]
    include_marker = "/include/"
    if include_marker in value:
        value = "include/" + value.split(include_marker, 1)[1]
    value = re.sub(r"^\.\./", "", value)
    value = re.sub(r"^\./", "", value)
    return value


def match_score(path: str, fact: dict[str, Any]) -> int:
    normalized = normalize_path(path)
    best = 0
    for glob in fact.get("scope_globs", []):
        glob_text = normalize_path(str(glob))
        if not fnmatch.fnmatch(normalized, glob_text):
            continue
        components = [part for part in glob_text.split("/") if part and part != "**" and "*" not in part]
        score = 100 + (len(components) * 5)
        if glob_text == normalized:
            score += 100
        if glob_text.endswith("/**") and normalized.startswith(glob_text[:-3]):
            score += 15
        best = max(best, score)
    if best == 0:
        return 0
    return best + STRENGTH_SCORE.get(str(fact.get("strength")), 0)


def resolve_for_path(path: str, limit: int) -> dict[str, Any]:
    scored: list[tuple[int, dict[str, Any]]] = []
    for fact in load_facts():
        if fact.get("status") != "accepted":
            continue
        score = match_score(path, fact)
        if score > 0:
            scored.append((score, fact))
    scored.sort(key=lambda item: (-item[0], str(item[1].get("id"))))
    matches = [format_fact(fact, score) for score, fact in scored[: max(0, limit)]]
    excluded = [fact.get("id") for score, fact in scored[max(0, limit) :]]
    return {
        "source": "path_facts",
        "path": normalize_path(path),
        "limit": limit,
        "matched_fact_ids": [match["id"] for match in matches],
        "excluded_fact_ids": excluded,
        "facts": matches,
        "trust_rule": "Path facts are curated hints. Current source, headers, symbols, splits, assembly, objdiff, and regression output remain final authority.",
    }


def search_facts(query: str, limit: int) -> list[dict[str, Any]]:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9_./:-]+", query) if len(term) >= 2]
    phrase = query.lower().strip()
    scored: list[tuple[int, dict[str, Any]]] = []
    for fact in load_facts():
        text = fact_text(fact).lower()
        score = 0
        if phrase and phrase in text:
            score += 10
        score += sum(1 for term in terms if term in text)
        if score > 0:
            scored.append((score, fact))
    scored.sort(key=lambda item: (-item[0], str(item[1].get("id"))))
    return [format_fact(fact, score) for score, fact in scored[: max(0, limit)]]


def fact_text(fact: dict[str, Any]) -> str:
    fields = [
        fact.get("id"),
        fact.get("directory"),
        fact.get("title"),
        fact.get("summary"),
        fact.get("scope_globs"),
        fact.get("applies_when"),
        fact.get("do"),
        fact.get("do_not"),
        fact.get("evidence_refs"),
        fact.get("slice_ref"),
    ]
    return json.dumps(fields, sort_keys=True)


def format_fact(fact: dict[str, Any], score: int) -> dict[str, Any]:
    return {
        "id": fact.get("id"),
        "title": fact.get("title"),
        "directory": fact.get("directory"),
        "score": score,
        "strength": fact.get("strength"),
        "scope_globs": fact.get("scope_globs", []),
        "summary": fact.get("summary"),
        "do": fact.get("do", []),
        "do_not": fact.get("do_not", []),
        "evidence_refs": fact.get("evidence_refs", []),
        "watched_paths": fact.get("watched_paths", []),
        "slice_ref": fact.get("slice_ref"),
        "payload": fact,
    }


def proposal_records() -> list[dict[str, Any]]:
    path = enrichment_path()
    if not path.exists():
        return []
    proposals: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        payload = row.get("payload")
        if not isinstance(payload, dict):
            continue
        if payload.get("target_source_id") == "path_facts" or payload.get("update_kind") == "path_fact":
            proposals.append(row)
    return proposals


def inventory_rows() -> list[dict[str, Any]]:
    path = inventory_path()
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("directories", data if isinstance(data, list) else [])
    return rows if isinstance(rows, list) else []


def status_payload() -> dict[str, Any]:
    facts = load_facts()
    proposals = proposal_records()
    rows = inventory_rows()
    return {
        "source": "path_facts",
        "title": descriptor().get("title"),
        "status": "ready" if facts else "missing_records",
        "available": bool(facts),
        "path_fact_count": len(facts),
        "accepted_path_fact_count": sum(1 for fact in facts if fact.get("status") == "accepted"),
        "directory_inventory_count": len(rows),
        "directories_with_facts": sum(1 for row in rows if row.get("status") == "accepted_facts"),
        "directories_no_fact_needed": sum(1 for row in rows if row.get("status") == "no_fact_needed"),
        "facts_path": str(facts_root()),
        "slices_path": str(slices_root()),
        "index_path": str(index_path()),
        "index_ready": index_path().exists(),
        "index_records": count_jsonl(index_path()),
        "resolver_ready": bool(facts),
        "proposal_count": len(proposals),
        "proposal_target_source_id": "path_facts",
        "supported_update_kinds": ["path_fact"],
        "mutation_policy": "proposal_only_until_validated",
    }


def write_index() -> dict[str, Any]:
    rows = []
    for fact in load_facts():
        rows.append(
            {
                "id": fact.get("id"),
                "source_id": "path_facts",
                "title": fact.get("title"),
                "text": "\n".join(
                    [
                        str(fact.get("title", "")),
                        str(fact.get("summary", "")),
                        " ".join(fact.get("scope_globs", [])),
                        " ".join(fact.get("applies_when", [])),
                        " ".join(fact.get("do", [])),
                        " ".join(fact.get("do_not", [])),
                    ]
                ),
                "evidence_ref": ";".join(fact.get("evidence_refs", [])),
                "linked_file_paths": representative_paths(fact),
                "payload": fact,
            }
        )
    index_path().parent.mkdir(parents=True, exist_ok=True)
    index_path().write_text("".join(f"{json.dumps(row, sort_keys=True)}\n" for row in rows), encoding="utf-8")
    return {"index_path": str(index_path()), "records_written": len(rows)}


def representative_paths(fact: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for value in fact.get("watched_paths", []):
        text = normalize_path(str(value))
        if "*" not in text and (text.startswith("src/") or text.startswith("include/")):
            paths.append(text)
    for value in fact.get("scope_globs", []):
        text = normalize_path(str(value))
        if "*" not in text and (text.startswith("src/") or text.startswith("include/")):
            paths.append(text)
    return sorted(set(paths))[:8]


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip())


def print_json(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))


def json_flag_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    return parser
