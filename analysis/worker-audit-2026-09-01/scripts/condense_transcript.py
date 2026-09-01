#!/usr/bin/env python3
"""Condense one worker transcript from the worker-audit manifest."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable


AUDIT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = AUDIT_DIR / "manifest.json"
DEFAULT_OUTPUT_DIR = AUDIT_DIR / "condensed"
DEFAULT_MAX_BYTES = 120_000
IMPORTANT_RESULT_RE = re.compile(
    r"(?:score|fuzzy|similarity|percent|match|mismatch|diff|status|exit[_ -]?code|error|fail|success|exact|[0-9]+(?:\.[0-9]+)?%)",
    re.IGNORECASE,
)
INTERESTING_KEY_RE = re.compile(
    r"(?:^|_)(?:score|fuzzy|similarity|percent|match|mismatch|diff|status|exit_code|error|success|exact)(?:$|_)",
    re.IGNORECASE,
)
FILE_DUMP_TOOLS = {"read", "grep", "glob"}


def compact_json(value: Any) -> str:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return " ".join(value.split())
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    except (TypeError, ValueError):
        return " ".join(str(value).split())


def truncate_chars(text: str, limit: int) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(text) <= limit:
        return text
    if limit <= 1:
        return "…"[:limit]
    return text[: limit - 1] + "…"


def scalar_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [scalar_text(item) for item in value]
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        for key in ("text", "thinking", "reasoning", "content", "value", "output"):
            if key in value:
                return scalar_text(value[key])
    if value is None:
        return ""
    return str(value)


def iter_json_strings(value: Any) -> Iterable[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, (str, int, float, bool)) or child is None:
                yield str(key), "null" if child is None else str(child)
            else:
                yield from iter_json_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_json_strings(child)


def important_result_bits(text: str) -> list[str]:
    candidates: list[str] = []
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        parsed = None

    if parsed is not None:
        for key, value in iter_json_strings(parsed):
            if INTERESTING_KEY_RE.search(key):
                candidates.append(f"{key}={value}")
            if isinstance(value, str):
                candidates.extend(
                    line.strip()
                    for line in value.splitlines()
                    if IMPORTANT_RESULT_RE.search(line)
                )

    candidates.extend(
        line.strip() for line in text.splitlines() if IMPORTANT_RESULT_RE.search(line)
    )
    seen: set[str] = set()
    result: list[str] = []
    for candidate in candidates:
        compact = " ".join(candidate.split())
        if compact and compact not in seen:
            seen.add(compact)
            result.append(compact)
    return result


def compact_result(tool_name: str, text: str, limit: int) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(text) <= limit:
        return " ".join(text.split())

    important = important_result_bits(text)
    if important:
        return truncate_chars(" | ".join(important), limit)

    if tool_name in FILE_DUMP_TOOLS or len(text) > 4_000:
        first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
        marker = f"[long result omitted: {len(text)} chars]"
        if first_line:
            marker += " " + first_line
        return truncate_chars(marker, limit)

    return truncate_chars(" ".join(text.split()), limit)


def tool_call_parts(block: dict[str, Any]) -> tuple[str, Any]:
    function = block.get("function")
    function_dict = function if isinstance(function, dict) else {}
    name = (
        block.get("name")
        or block.get("toolName")
        or block.get("tool_name")
        or function_dict.get("name")
        or "unknown"
    )
    params = block.get("arguments")
    if params is None:
        params = block.get("params")
    if params is None:
        params = block.get("input")
    if params is None:
        params = function_dict.get("arguments", {})
    return str(name), params


def content_blocks(content: Any) -> list[Any]:
    if isinstance(content, list):
        return content
    if content is None:
        return []
    return [content]


def extract_entries(record: Any) -> list[tuple[str, str, str]]:
    """Return ordered entries as (kind, label/tool name, payload)."""
    if not isinstance(record, dict):
        return []
    message = record.get("message")
    if not isinstance(message, dict):
        message = record
    role = str(message.get("role", "")).lower().replace("_", "")
    entries: list[tuple[str, str, str]] = []

    if role == "assistant" or record.get("type") == "assistant":
        for block in content_blocks(message.get("content")):
            if isinstance(block, str):
                entries.append(("assistant", "TEXT", block))
                continue
            if not isinstance(block, dict):
                continue
            block_type = str(block.get("type", "")).lower().replace("_", "")
            if block_type in {"thinking", "reasoning", "analysis"}:
                payload = scalar_text(
                    block.get("thinking", block.get("reasoning", block.get("text", block.get("content"))))
                )
                entries.append(("assistant", "REASONING", payload))
            elif block_type in {"text", "outputtext"}:
                entries.append(("assistant", "TEXT", scalar_text(block)))
            elif block_type in {"toolcall", "functioncall"}:
                name, params = tool_call_parts(block)
                entries.append(("call", name, compact_json(params)))
        return entries

    if role in {"toolresult", "tool"} or record.get("type") in {"tool_result", "toolResult"}:
        name = str(
            message.get("toolName")
            or message.get("tool_name")
            or message.get("name")
            or record.get("toolName")
            or record.get("name")
            or "unknown"
        )
        payload = scalar_text(message.get("content", message.get("result", message.get("output"))))
        entries.append(("result", name, payload))
        return entries

    # Some transcript writers put tool blocks directly in a generic content list.
    for block in content_blocks(message.get("content")):
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type", "")).lower().replace("_", "")
        if block_type in {"toolcall", "functioncall"}:
            name, params = tool_call_parts(block)
            entries.append(("call", name, compact_json(params)))
        elif block_type in {"toolresult", "functionresult"}:
            name = str(block.get("toolName") or block.get("name") or "unknown")
            entries.append(("result", name, scalar_text(block.get("content", block.get("result")))))
    return entries


def render(entries: list[tuple[str, str, str]], result_limit: int, param_limit: int = 200) -> str:
    chunks: list[str] = []
    for kind, label, payload in entries:
        if kind == "assistant":
            chunks.append(f"ASSISTANT {label}\n{payload}\n")
        elif kind == "call":
            chunks.append(f"TOOL {label} {truncate_chars(payload, param_limit)}\n")
        elif kind == "result":
            chunks.append(f"RESULT {label} {compact_result(label, payload, result_limit)}\n")
    return "\n".join(chunks)


def fit_to_limit(entries: list[tuple[str, str, str]], max_bytes: int) -> tuple[str, int, int]:
    result_limit = 400
    param_limit = 200
    output = render(entries, result_limit, param_limit)
    if len(output.encode("utf-8")) <= max_bytes:
        return output, result_limit, param_limit

    low, high = 0, result_limit
    while low < high:
        mid = (low + high + 1) // 2
        candidate = render(entries, mid, param_limit)
        if len(candidate.encode("utf-8")) <= max_bytes:
            low = mid
        else:
            high = mid - 1
    result_limit = low
    output = render(entries, result_limit, param_limit)

    if len(output.encode("utf-8")) > max_bytes:
        low, high = 0, param_limit
        while low < high:
            mid = (low + high + 1) // 2
            candidate = render(entries, result_limit, mid)
            if len(candidate.encode("utf-8")) <= max_bytes:
                low = mid
            else:
                high = mid - 1
        param_limit = low
        output = render(entries, result_limit, param_limit)

    if len(output.encode("utf-8")) > max_bytes:
        raise ValueError(
            f"assistant messages and event headers exceed {max_bytes} bytes; "
            "cannot honor both verbatim-message and size requirements"
        )
    return output, result_limit, param_limit


def resolve_transcript(path_value: Any, manifest_dir: Path) -> Path | None:
    if isinstance(path_value, dict):
        path_value = path_value.get("path")
    if not isinstance(path_value, str) or not path_value:
        return None
    path = Path(path_value)
    if not path.is_absolute():
        path = manifest_dir / path
    return path


def load_worker(manifest_path: Path, ws_id: str) -> dict[str, Any]:
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    records = manifest.values() if isinstance(manifest, dict) else manifest
    for record in records:
        if isinstance(record, dict) and str(record.get("ws_id")) == ws_id:
            return record
    raise LookupError(f"ws_id not found in manifest: {ws_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ws_id", help="worker_state id from manifest.json")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    args = parser.parse_args()

    try:
        worker = load_worker(args.manifest, args.ws_id)
    except (OSError, json.JSONDecodeError, LookupError) as exc:
        print(f"SKIP {args.ws_id}: {exc}", file=sys.stderr)
        return 2

    transcript_values = worker.get("transcript_files") or []
    transcript_paths: list[Path] = []
    missing: list[str] = []
    for value in transcript_values:
        path = resolve_transcript(value, args.manifest.resolve().parent)
        if path is None:
            missing.append(repr(value))
        elif path.is_file():
            transcript_paths.append(path)
        else:
            missing.append(str(path))

    if not transcript_paths:
        reason = "no transcript files in manifest" if not transcript_values else "all transcript files are missing"
        print(f"SKIP {args.ws_id}: {reason}", file=sys.stderr)
        return 3

    entries: list[tuple[str, str, str]] = []
    malformed_lines = 0
    for transcript_path in transcript_paths:
        with transcript_path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    malformed_lines += 1
                    continue
                entries.extend(extract_entries(record))

    try:
        output, result_limit, param_limit = fit_to_limit(entries, args.max_bytes)
    except ValueError as exc:
        print(f"SKIP {args.ws_id}: {exc}", file=sys.stderr)
        return 4

    args.output_dir.mkdir(parents=True, exist_ok=True)
    output_path = args.output_dir / f"{args.ws_id}.md"
    output_path.write_text(output, encoding="utf-8")
    size = output_path.stat().st_size
    notes: list[str] = []
    if missing:
        notes.append(f"missing_files={len(missing)}")
    if malformed_lines:
        notes.append(f"malformed_lines={malformed_lines}")
    if result_limit < 400:
        notes.append(f"result_limit={result_limit}")
    if param_limit < 200:
        notes.append(f"param_limit={param_limit}")
    note_text = " " + " ".join(notes) if notes else ""
    print(
        f"WROTE {args.ws_id} files={len(transcript_paths)} entries={len(entries)} "
        f"bytes={size}{note_text}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
