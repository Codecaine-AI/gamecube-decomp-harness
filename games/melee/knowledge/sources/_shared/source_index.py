#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Callable


def package_root_for_source(source_root: Path) -> Path:
    for parent in [source_root, *source_root.parents]:
        if (parent / "apps" / "server" / "resources").is_dir() and (parent / "projects").is_dir():
            return parent
    for parent in [source_root, *source_root.parents]:
        if (parent / "package.json").exists() and (parent / "apps").is_dir():
            return parent
    return source_root.parents[3]


def source_root_from_api_file(api_file: str) -> Path:
    return Path(api_file).resolve().parents[1]


def resource_sources_root(source_root: Path) -> Path:
    for parent in [source_root, *source_root.parents]:
        candidate = parent / "apps" / "server" / "resources" / "knowledge" / "sources"
        if (candidate / "registry.json").exists():
            return candidate
        if parent.name == "sources" and (parent / "registry.json").exists():
            return parent
    return source_root.parents[3]


def project_knowledge_root(source_root: Path) -> Path:
    return project_knowledge_root_for_package(package_root_for_source(source_root))


def project_knowledge_root_for_package(package_root: Path) -> Path:
    override = os.environ.get("ORCH_PROJECT_KNOWLEDGE_ROOT") or os.environ.get("ORCHESTRATOR_PROJECT_KNOWLEDGE_ROOT")
    if override:
        path = Path(override).expanduser()
        return path if path.is_absolute() else package_root / path
    return package_root / "projects" / "melee" / "knowledge"


def source_storage_root(source_root: Path) -> Path:
    descriptor = load_source_descriptor(source_root)
    source_path = str(descriptor.get("path") or "")
    if not source_path:
        try:
            source_path = str(source_root.relative_to(resource_sources_root(source_root)))
        except ValueError:
            source_path = source_root.name
    return project_knowledge_root(source_root) / "sources" / source_path


def source_indexes_root(source_root: Path) -> Path:
    return source_storage_root(source_root) / "indexes"


def source_data_root(source_root: Path) -> Path:
    return source_storage_root(source_root) / "data"


def load_source_descriptor(source_root: Path) -> dict[str, Any]:
    path = source_root / "source.json"
    if not path.exists():
        return {"id": source_root.name, "title": source_root.name}
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_declared_path(package_root: Path, path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    if path_value.startswith("knowledge/"):
        return project_knowledge_root_for_package(package_root) / path_value.removeprefix("knowledge/")
    return package_root / path


def index_files(source_root: Path) -> list[Path]:
    descriptor = load_source_descriptor(source_root)
    package_root = package_root_for_source(source_root)
    declared = [
        resolve_declared_path(package_root, str(path_value))
        for path_value in descriptor.get("index_outputs", [])
        if str(path_value).endswith(".jsonl")
    ]
    existing_declared = [path for path in declared if path.exists()]
    if existing_declared:
        return sorted(existing_declared)
    return sorted(source_indexes_root(source_root).glob("*.jsonl"))


def data_path_status(source_root: Path) -> list[dict[str, Any]]:
    descriptor = load_source_descriptor(source_root)
    package_root = package_root_for_source(source_root)
    statuses: list[dict[str, Any]] = []
    for path_value in descriptor.get("data_paths", []):
        path = resolve_declared_path(package_root, str(path_value))
        statuses.append(
            {
                "path": str(path),
                "exists": path.exists(),
                "kind": "directory" if path.is_dir() else "file" if path.is_file() else "missing",
            }
        )
    return statuses


def load_index_rows(source_root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in index_files(source_root):
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


def status_payload(source_root: Path) -> dict[str, Any]:
    descriptor = load_source_descriptor(source_root)
    rows = load_index_rows(source_root)
    files = index_files(source_root)
    payload = {
        "source": descriptor.get("id", source_root.name),
        "title": descriptor.get("title", source_root.name),
        "trust_tier": descriptor.get("trust_tier"),
        "available": bool(rows),
        "status": "ready" if rows else "scaffolded",
        "data_paths": data_path_status(source_root),
        "data_root": str(source_data_root(source_root)),
        "indexes_path": str(source_indexes_root(source_root)),
        "index_files": [str(path) for path in files],
        "index_records": len(rows),
        "message": "Index is ready for local lookup." if rows else "No generated index rows were found.",
    }
    try:
        from vector_index import vector_status_payload

        payload["vector_index"] = vector_status_payload(source_root)
    except Exception as exc:
        payload["vector_index"] = {
            "available": False,
            "status": "error",
            "message": f"Vector status unavailable: {exc}",
        }
    return payload


def search_payload(source_root: Path, query: str, limit: int, *, tool_id: str | None = None) -> dict[str, Any]:
    descriptor = load_source_descriptor(source_root)
    rows = load_index_rows(source_root)
    if tool_id:
        rows = [row for row in rows if str(nested_get(row, ("payload", "tool_id")) or "").lower() == tool_id.lower()]
    results = search_rows(rows, query, limit)
    return {
        "source": descriptor.get("id", source_root.name),
        "query": query,
        "limit": limit,
        "available": bool(rows),
        "results": results,
        "indexes_path": str(source_indexes_root(source_root)),
        "data_root": str(source_data_root(source_root)),
        "message": "Index is ready for local lookup." if rows else "No generated index rows were found.",
    }


def search_rows(rows: list[dict[str, Any]], query: str, limit: int) -> list[dict[str, Any]]:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9_./:-]+", query) if len(term) >= 2]
    phrase = query.lower().strip()
    scored: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        text = searchable_text(row).lower()
        score = 0
        if phrase and phrase in text:
            score += 10
        for term in terms:
            if term in text:
                score += 1
        if score <= 0:
            continue
        scored.append((score, row))
    scored.sort(key=lambda pair: (-pair[0], len(searchable_text(pair[1]))))
    return [format_result(row, score) for score, row in scored[:limit]]


def searchable_text(value: Any) -> str:
    if isinstance(value, dict):
        preferred_fields = (
            "title",
            "symbol",
            "source_path",
            "sourcePath",
            "unit",
            "address",
            "kind",
            "summary",
            "searchable_terms",
            "text",
            "evidence_ref",
        )
        preferred = []
        for field in preferred_fields:
            if field in value:
                preferred.append(searchable_text(value[field]))
        rest = [searchable_text(child) for key, child in value.items() if key not in set(preferred_fields)]
        return "\n".join(preferred + rest)
    if isinstance(value, list):
        return "\n".join(searchable_text(item) for item in value)
    return "" if value is None else str(value)


def format_result(row: dict[str, Any], score: int) -> dict[str, Any]:
    payload = row.get("payload")
    if not isinstance(payload, dict):
        payload = {key: value for key, value in row.items() if key not in {"text"}}
    return {
        "id": row.get("id") or row.get("pr") or row.get("symbol") or row.get("source_path") or row.get("sourcePath"),
        "title": row.get("title") or row.get("symbol") or row.get("source_path") or row.get("sourcePath") or row.get("id"),
        "score": score,
        "snippet": clip(str(row.get("text") or row.get("summary") or searchable_text(row)), 420),
        "evidence_ref": row.get("evidence_ref") or row.get("postmortem_json") or row.get("index_path"),
        "payload": payload,
    }


def nested_get(row: dict[str, Any], path: tuple[str, ...]) -> Any:
    current: Any = row
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def clip(text: str, max_chars: int) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3].rstrip() + "..."


def json_mode(args: argparse.Namespace) -> bool:
    return bool(getattr(args, "json", False))


def print_payload(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2))
        return
    if "results" not in payload:
        print(json.dumps(payload, indent=2))
        return
    for result in payload["results"]:
        print(f"{result.get('score', 0):>3} {result.get('title')}")
        print(f"    {result.get('evidence_ref')}")
        print(f"    {result.get('snippet')}")


def run_status(api_file: str, argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    print_payload(status_payload(source_root_from_api_file(api_file)), json_mode(args))


def run_search(api_file: str, argv: list[str] | None = None, *, query_builder: Callable[[argparse.Namespace], str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", default="")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--terms", default="")
    parser.add_argument("--symbol", default="")
    parser.add_argument("--address", default="")
    parser.add_argument("--offset", default="")
    parser.add_argument("--type", default="")
    parser.add_argument("--mnemonic", default="")
    parser.add_argument("--tool", default="")
    args = parser.parse_args(argv)
    query = query_builder(args) if query_builder else args.query
    if not query:
        parser.error("a query value is required")
    payload = search_payload(source_root_from_api_file(api_file), query, args.limit, tool_id=args.tool or None)
    print_payload(payload, json_mode(args))


def default_query(args: argparse.Namespace) -> str:
    return args.query


def terms_query(args: argparse.Namespace) -> str:
    return args.terms or args.query


def symbol_query(args: argparse.Namespace) -> str:
    return args.symbol or args.query


def address_query(args: argparse.Namespace) -> str:
    return args.address or args.query


def offset_query(args: argparse.Namespace) -> str:
    parts = [args.type, args.offset or args.query]
    return " ".join(part for part in parts if part)


def mnemonic_query(args: argparse.Namespace) -> str:
    return args.mnemonic or args.query


def tool_query(args: argparse.Namespace) -> str:
    return args.query or args.tool


if __name__ == "__main__":
    print("Import source_index from a source api script.", file=sys.stderr)
    raise SystemExit(2)
