#!/usr/bin/env python3
"""Shared JSONL status/search helpers for index-backed tool suites."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any


def env_path(name: str) -> Path | None:
    value = os.environ.get(name)
    if not value:
        return None
    path = Path(value).expanduser()
    return path if path.is_absolute() else package_root_for_tool(Path(__file__).resolve()) / path


def package_root_for_tool(tool_root: Path) -> Path:
    for parent in [tool_root, *tool_root.parents]:
        if (parent / "package.json").exists() and (parent / "apps").is_dir():
            return parent
    return tool_root.parents[5]


def project_dir_for_tool(tool_root: Path) -> Path:
    override = os.environ.get("ORCH_GAME_DIR")
    if override:
        path = Path(override).expanduser()
        return path if path.is_absolute() else package_root_for_tool(tool_root) / path
    project_id = os.environ.get("ORCH_GAME_ID", "melee")
    return package_root_for_tool(tool_root) / "projects" / project_id


def project_knowledge_root(tool_root: Path) -> Path:
    override = os.environ.get("ORCH_GAME_KNOWLEDGE_ROOT")
    if override:
        path = Path(override).expanduser()
        return path if path.is_absolute() else package_root_for_tool(tool_root) / path
    return project_dir_for_tool(tool_root) / "knowledge"


def tools_resource_root(tool_root: Path) -> Path:
    override = os.environ.get("ORCH_TOOLPACK_ROOT")
    if override:
        path = Path(override).expanduser()
        path = path if path.is_absolute() else package_root_for_tool(tool_root) / path
        if (path / "registry.json").exists() or (path / "toolpack.json").exists():
            return path
    for parent in [tool_root, *tool_root.parents]:
        if (parent / "toolpack.json").exists() and (parent / "registry.json").exists():
            return parent
        if parent.name == "gamecube-decomp" and (parent / "registry.json").exists():
            return parent
    return tool_root.parents[3]


def default_project_shared_data_root(tool_root: Path) -> Path:
    package_root = package_root_for_tool(tool_root)
    project_id = os.environ.get("ORCH_GAME_ID", "melee")
    try:
        rel = tool_root.resolve().relative_to(tools_resource_root(tool_root).resolve())
    except ValueError:
        return package_root / "games" / project_id / "shared" / "tool-data" / tool_root.name
    tool_id = rel.parts[-1] if rel.parts else tool_root.name
    return package_root / "games" / project_id / "shared" / "tool-data" / tool_id


def tool_storage_root(tool_root: Path) -> Path:
    roots = tool_storage_roots(tool_root)
    return roots[0]


def tool_storage_roots(tool_root: Path) -> list[Path]:
    roots: list[Path] = []
    shared = env_path("ORCH_TOOL_SHARED_DATA_ROOT")
    if shared:
        roots.append(shared)
    worktree_cache = env_path("ORCH_TOOL_WORKTREE_CACHE_ROOT")
    if worktree_cache and worktree_cache not in roots:
        roots.append(worktree_cache)
    default_root = default_project_shared_data_root(tool_root)
    if default_root not in roots:
        roots.append(default_root)
    return roots


def load_index_rows(tool_root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for storage_root in tool_storage_roots(tool_root):
        for path in sorted((storage_root / "indexes").glob("*.jsonl")):
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
    path = tool_storage_root(tool_root) / "cache" / "runner_status.json"
    for storage_root in tool_storage_roots(tool_root):
        candidate = storage_root / "cache" / "runner_status.json"
        if candidate.exists():
            path = candidate
            break
    else:
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


def status_payload(tool: str, tool_root: Path, empty_message: str, expected_repo_root: str | Path | None = None) -> dict[str, Any]:
    rows = load_index_rows(tool_root)
    descriptor = load_tool_descriptor(tool_root)
    storage_root = tool_storage_root(tool_root)
    operation_mode = str(descriptor.get("operation_mode") or ("index_backed_v1" if rows else "scaffolded"))
    runner_files = non_readme_runner_files(tool_root)
    runner_manifest = load_runner_manifest(tool_root)
    runner_success = bool(runner_manifest.get("success"))
    expected_repo_root_value = normalized_path(expected_repo_root) if expected_repo_root else None
    runner_repo_root = runner_manifest.get("repo_root")
    cache_repo_root_matches = None
    if expected_repo_root_value:
        cache_repo_root_matches = bool(runner_repo_root) and normalized_path(runner_repo_root) == expected_repo_root_value
    generated_artifacts = existing_paths(runner_manifest.get("generated_artifacts"))
    generated_indexes = existing_paths(runner_manifest.get("generated_indexes"))
    smoke_status = "passed" if runner_success and (generated_artifacts or generated_indexes) else "not_run"
    if runner_manifest and not runner_success:
        smoke_status = "failed"
    elif runner_success and cache_repo_root_matches is False:
        smoke_status = "stale_repo_root"
    runner_status = descriptor.get("runner_status")
    if runner_success and (generated_artifacts or generated_indexes) and cache_repo_root_matches is not False:
        runner_status = "live_smoke_passed"
    elif runner_success and cache_repo_root_matches is False:
        runner_status = "live_smoke_stale"
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
        "runner_repo_root": runner_repo_root,
        "expected_repo_root": expected_repo_root_value,
        "cache_repo_root_matches": cache_repo_root_matches,
        "runner_manifest_path": runner_manifest.get("manifest_path"),
        "generated_artifacts": generated_artifacts,
        "generated_indexes": generated_indexes,
        "dependencies": runner_manifest.get("dependencies") or descriptor.get("dependencies") or [],
        "limitations": descriptor.get("limitations") or [],
        "cache_path": str(storage_root / "cache"),
        "indexes_path": str(storage_root / "indexes"),
        "shared_data_root": str(env_path("ORCH_TOOL_SHARED_DATA_ROOT")) if env_path("ORCH_TOOL_SHARED_DATA_ROOT") else None,
        "storage_roots": [str(path) for path in tool_storage_roots(tool_root)],
        "runner_files": [str(path) for path in runner_files],
        "index_records": len(rows),
        "message": descriptor.get("status_message") or ("Index is ready for local lookup." if rows else empty_message),
    }


def normalized_path(value: str | Path | None) -> str:
    if value is None:
        return ""
    return str(Path(str(value)).expanduser().resolve())


def search_payload(tool: str, tool_root: Path, query: str, limit: int, empty_message: str) -> dict[str, Any]:
    rows = load_index_rows(tool_root)
    descriptor = load_tool_descriptor(tool_root)
    storage_root = tool_storage_root(tool_root)
    results = search_rows(rows, query, limit)
    return {
        "tool": tool,
        "query": query,
        "limit": limit,
        "available": bool(rows),
        "operation_mode": descriptor.get("operation_mode") or ("index_backed_v1" if rows else "scaffolded"),
        "limitations": descriptor.get("limitations") or [],
        "results": results,
        "cache_path": str(storage_root / "cache"),
        "indexes_path": str(storage_root / "indexes"),
        "shared_data_root": str(env_path("ORCH_TOOL_SHARED_DATA_ROOT")) if env_path("ORCH_TOOL_SHARED_DATA_ROOT") else None,
        "storage_roots": [str(path) for path in tool_storage_roots(tool_root)],
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
