#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def load_index_rows(tool_root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted((tool_root / "indexes").glob("*.jsonl")):
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for line_number, line in enumerate(f, start=1):
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


def load_tool_descriptor(tool_root: Path) -> dict[str, Any]:
    path = tool_root / "tool.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def non_readme_runner_files(tool_root: Path) -> list[Path]:
    runners_root = tool_root / "runners"
    if not runners_root.exists():
        return []
    return sorted(path for path in runners_root.iterdir() if path.is_file() and path.name != "README.md")


def load_runner_manifest(tool_root: Path) -> dict[str, Any]:
    path = tool_root / "cache" / "runner_status.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"success": False, "error": "runner_status.json is not valid JSON", "manifest_path": str(path)}
    if not isinstance(data, dict):
        return {"success": False, "error": "runner_status.json is not an object", "manifest_path": str(path)}
    data.setdefault("manifest_path", str(path))
    return data


def existing_paths(paths: Any) -> list[str]:
    if not isinstance(paths, list):
        return []
    existing: list[str] = []
    for value in paths:
        path = Path(str(value))
        if path.exists():
            existing.append(str(path))
    return existing


def status_payload(tool: str, tool_root: Path, empty_message: str) -> dict[str, Any]:
    rows = load_index_rows(tool_root)
    descriptor = load_tool_descriptor(tool_root)
    operation_mode = str(descriptor.get("operation_mode") or ("index_backed_v1" if rows else "scaffolded"))
    runner_files = non_readme_runner_files(tool_root)
    runner_manifest = load_runner_manifest(tool_root)
    runner_success = bool(runner_manifest.get("success"))
    generated_artifacts = existing_paths(runner_manifest.get("generated_artifacts"))
    generated_indexes = existing_paths(runner_manifest.get("generated_indexes"))
    smoke_status = "passed" if runner_success and (generated_artifacts or generated_indexes) else "not_run"
    if runner_manifest and not runner_success:
        smoke_status = "failed"
    runner_status = descriptor.get("runner_status")
    if runner_success and (generated_artifacts or generated_indexes):
        runner_status = "live_smoke_passed"
    elif runner_files:
        runner_status = runner_status or "configured_never_run"
    else:
        runner_status = runner_status or "no_live_runner"
    return {
        "tool": tool,
        "available": bool(rows),
        "status": operation_mode if rows else "scaffolded",
        "operation_mode": operation_mode,
        "runner_available": bool(runner_files),
        "runner_status": runner_status,
        "runner_smoke_status": smoke_status,
        "runner_smoke_passed": smoke_status == "passed",
        "runner_last_success_at": runner_manifest.get("generated_at") if runner_success else None,
        "runner_command": runner_manifest.get("command"),
        "runner_manifest_path": runner_manifest.get("manifest_path"),
        "generated_artifacts": generated_artifacts,
        "generated_indexes": generated_indexes,
        "dependencies": runner_manifest.get("dependencies") or descriptor.get("dependencies") or [],
        "limitations": descriptor.get("limitations") or [],
        "cache_path": str(tool_root / "cache"),
        "indexes_path": str(tool_root / "indexes"),
        "runner_files": [str(path) for path in runner_files],
        "index_records": len(rows),
        "message": descriptor.get("status_message") or ("Index is ready for local lookup." if rows else empty_message),
    }


def search_payload(tool: str, tool_root: Path, query: str, limit: int, empty_message: str) -> dict[str, Any]:
    rows = load_index_rows(tool_root)
    descriptor = load_tool_descriptor(tool_root)
    results = search_rows(rows, query, limit)
    return {
        "tool": tool,
        "query": query,
        "limit": limit,
        "available": bool(rows),
        "operation_mode": descriptor.get("operation_mode") or ("index_backed_v1" if rows else "scaffolded"),
        "limitations": descriptor.get("limitations") or [],
        "results": results,
        "cache_path": str(tool_root / "cache"),
        "indexes_path": str(tool_root / "indexes"),
        "message": descriptor.get("status_message") or ("Index is ready for local lookup." if rows else empty_message),
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


def searchable_text(row: dict[str, Any]) -> str:
    return "\n".join(
        str(row.get(field) or "")
        for field in ("title", "symbol", "source_path", "unit", "address", "kind", "text", "summary", "evidence_ref")
    )


def format_result(row: dict[str, Any], score: int) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "title": row.get("title") or row.get("symbol") or row.get("id"),
        "score": score,
        "snippet": clip(str(row.get("text") or row.get("summary") or searchable_text(row)), 420),
        "evidence_ref": row.get("evidence_ref") or row.get("index_path"),
        "payload": row.get("payload") or {key: value for key, value in row.items() if key not in {"text"}},
    }


def clip(text: str, max_chars: int) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3].rstrip() + "..."
