#!/usr/bin/env python3
"""Build searchable PR JSON records from a melee PR dump.

The default mode is intentionally inexpensive: it writes deterministic draft
records that can be indexed immediately. Pass --run-agent to call the local pi
CLI and replace each draft with an agent-reviewed record.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_ROOT = SCRIPT_DIR.parent
PAST_PRS_DATA_ROOT = SOURCE_ROOT / "data"
ORCHESTRATOR_ROOT = SOURCE_ROOT.parent.parent.parent
DEFAULT_DUMP_ROOT = PAST_PRS_DATA_ROOT / "current"
DEFAULT_LIBRARY_ROOT = PAST_PRS_DATA_ROOT / "prs"
DEFAULT_AGENT_ROOT = ORCHESTRATOR_ROOT / "src" / "agents" / "pr-review"
DEFAULT_SESSION_DIR = ORCHESTRATOR_ROOT / ".pi-sessions" / "pr-review"
SCHEMA_VERSION = "melee_pr_postmortem_v1"
OBJECT_SCHEMA_VERSION = "melee_pr_context_v1"

STOPWORDS = {
    "about",
    "added",
    "after",
    "again",
    "being",
    "break",
    "case",
    "change",
    "const",
    "could",
    "false",
    "files",
    "fixed",
    "from",
    "have",
    "include",
    "int",
    "line",
    "more",
    "null",
    "return",
    "some",
    "static",
    "struct",
    "that",
    "this",
    "true",
    "void",
    "with",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create per-PR JSON knowledge records and searchable CSV/JSONL "
            "indexes from a PR dump."
        )
    )
    parser.add_argument("--dump-root", type=Path, default=DEFAULT_DUMP_ROOT)
    parser.add_argument("--library-root", type=Path, default=DEFAULT_LIBRARY_ROOT)
    parser.add_argument(
        "--agent-root",
        type=Path,
        default=DEFAULT_AGENT_ROOT,
        help="Shared Pi-agent standard files. Defaults to decomp-orchestrator/src/agents/pr-review.",
    )
    parser.add_argument(
        "--pr",
        dest="prs",
        type=int,
        action="append",
        default=[],
        help="Process one PR number. May be provided more than once.",
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--rerun-existing",
        action="store_true",
        help="Regenerate postmortems even when postmortem.json already exists.",
    )
    parser.add_argument(
        "--pending-only",
        action="store_true",
        help="Only select PRs that do not already have a postmortem.json record. Applied before --limit.",
    )
    parser.add_argument(
        "--complete-only",
        action="store_true",
        help="Only select PRs whose local vertical slice has the raw PR JSON streams and diff file.",
    )
    parser.add_argument(
        "--run-agent",
        action="store_true",
        help="Call the local pi CLI instead of writing only the deterministic draft.",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=16,
        help="Number of PR postmortem workers to run concurrently.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build selected PR contexts in memory; do not write records or indexes.",
    )
    parser.add_argument("--provider", default="codex-lb")
    parser.add_argument("--model", default="gpt-5.5")
    parser.add_argument("--thinking", default="medium")
    parser.add_argument("--pi-bin", default="pi")
    parser.add_argument(
        "--session-dir",
        type=Path,
        default=DEFAULT_SESSION_DIR,
        help="Directory for persisted Pi session files. Defaults to decomp-orchestrator/.pi-sessions/pr-review.",
    )
    parser.add_argument(
        "--run-artifact-root",
        type=Path,
        default=None,
        help="Directory for PR-agent run ledgers and prompt snapshots. Defaults to <library-root>/runs/<timestamp>.",
    )
    parser.add_argument("--tools", default="read,grep,find,ls")
    parser.add_argument("--max-diff-chars", type=int, default=20000)
    parser.add_argument("--max-text-chars", type=int, default=12000)
    parser.add_argument(
        "--agent-timeout-seconds",
        type=int,
        default=900,
        help="Maximum wall time for one Pi review before leaving the PR pending.",
    )
    return parser.parse_args()


def now_utc() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_id_now() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")


def agent_runtime(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "provider": args.provider,
        "model": args.model,
        "thinking": args.thinking,
        "tools": args.tools,
        "agent_timeout_seconds": args.agent_timeout_seconds,
        "session_dir": str(args.session_dir.resolve()),
    }


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def read_jsonl(path: Path, limit: int | None = None) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            records.append(json.loads(line))
            if limit is not None and len(records) >= limit:
                break
    return records


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False))
            f.write("\n")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def clean_inline_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_env_line(line: str) -> tuple[str, str] | None:
    trimmed = line.strip()
    if not trimmed or trimmed.startswith("#"):
        return None
    if trimmed.startswith("export "):
        trimmed = trimmed[len("export ") :].strip()
    if "=" not in trimmed:
        return None
    key, value = trimmed.split("=", 1)
    key = key.strip()
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key):
        return None
    value = value.strip()
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        value = value[1:-1]
    return key, value


def load_local_env(root: Path, filenames: tuple[str, ...] = ("local.env",)) -> list[Path]:
    loaded: list[Path] = []
    for filename in filenames:
        path = root / filename
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            parsed = parse_env_line(line)
            if not parsed:
                continue
            key, value = parsed
            if key == "PI_CODING_AGENT_DIR" and value and not Path(value).is_absolute():
                value = str((root / value).resolve())
            os.environ.setdefault(key, value)
        loaded.append(path)
    return loaded


class RunArtifacts:
    def __init__(self, root: Path):
        self.root = root
        self.ledger_path = root / "events.jsonl"
        self.lock = threading.Lock()
        root.mkdir(parents=True, exist_ok=True)

    def append(self, event: dict[str, Any]) -> None:
        row = {"timestamp": now_utc(), **event}
        with self.lock:
            self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
            with self.ledger_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False))
                f.write("\n")


class AgentRunError(RuntimeError):
    pass


def compact_error(text: str, limit: int = 500) -> str:
    line = " ".join((text or "").split())
    if len(line) <= limit:
        return line
    return line[:limit].rstrip() + "..."


def clip_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n\n[truncated]\n"


def find_repo_root(start: Path) -> Path:
    for path in [start, *start.parents]:
        if (path / ".git").exists():
            return path
    return Path.cwd().resolve()


def rel(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


def pr_number(pr: dict[str, Any]) -> int:
    return int(pr.get("number") or pr.get("pr"))


def pr_slice_dir(dump_root: Path, number: int) -> Path:
    return dump_root / "prs" / f"pr-{number}"


def out_pr_dir(library_root: Path, number: int) -> Path:
    return library_root / f"pr-{number}"


def user_login(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("login")
    if isinstance(value, str):
        return value
    return None


def pr_author(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str | None:
    author = index_pr.get("author")
    return user_login(author) or user_login(pr_doc.get("user")) or user_login(pr_doc.get("author"))


def pr_title(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str:
    return str(index_pr.get("title") or pr_doc.get("title") or "")


def pr_state(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str:
    if index_pr.get("mergedAt") or pr_doc.get("merged_at"):
        return "MERGED"
    state = index_pr.get("state") or pr_doc.get("state") or "UNKNOWN"
    return str(state).upper()


def pr_url(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str:
    return str(index_pr.get("url") or pr_doc.get("html_url") or pr_doc.get("url") or "")


def timestamp(index_pr: dict[str, Any], pr_doc: dict[str, Any], camel: str, snake: str) -> str | None:
    value = index_pr.get(camel) or pr_doc.get(snake)
    return value if isinstance(value, str) else None


def load_pr_index(dump_root: Path) -> dict[int, dict[str, Any]]:
    prs = read_json(dump_root / "prs.json", [])
    if not isinstance(prs, list) or not prs:
        raise SystemExit(f"No PR index found at {dump_root / 'prs.json'}")
    return {pr_number(pr): pr for pr in prs}


def select_numbers(args: argparse.Namespace, pr_index: dict[int, dict[str, Any]]) -> list[int]:
    if args.prs:
        missing = [number for number in args.prs if number not in pr_index]
        if missing:
            raise SystemExit(f"PR(s) not found in dump index: {', '.join(map(str, missing))}")
        numbers = args.prs
    else:
        numbers = list(pr_index.keys())

    if args.pending_only and not args.rerun_existing:
        library_root = args.library_root.resolve()
        numbers = [
            number
            for number in numbers
            if is_pending_postmortem(library_root, number, run_agent=args.run_agent)
        ]

    if args.complete_only:
        dump_root = args.dump_root.resolve()
        numbers = [number for number in numbers if has_complete_slice(dump_root, number)]

    if args.limit is not None:
        numbers = numbers[: args.limit]
    return numbers


def has_complete_slice(dump_root: Path, number: int) -> bool:
    slice_dir = pr_slice_dir(dump_root, number)
    required_files = [
        "pr.json",
        "issue_comments.json",
        "review_comments.json",
        "reviews.json",
        "diff.diff",
    ]
    return all((slice_dir / name).exists() for name in required_files)


def is_pending_postmortem(library_root: Path, number: int, *, run_agent: bool) -> bool:
    postmortem_path = library_root / f"pr-{number}" / "postmortem.json"
    if not postmortem_path.exists():
        return True
    if not run_agent:
        return False
    postmortem = read_json(postmortem_path, {})
    if not isinstance(postmortem, dict):
        return True
    return postmortem.get("agent_status") != "agent_completed" or bool(
        postmortem.get("validation_issues")
    )


def top_changed_files(changed_files: list[dict[str, Any]], limit: int = 30) -> list[dict[str, Any]]:
    def weight(record: dict[str, Any]) -> int:
        return int(record.get("added") or 0) + int(record.get("deleted") or 0)

    return sorted(changed_files, key=weight, reverse=True)[:limit]


def classify_system(path: str) -> str:
    if path.startswith("src/melee/ft/"):
        return "fighter"
    if path.startswith("src/melee/it/"):
        return "item"
    if path.startswith("src/melee/gm/"):
        return "game-mode"
    if path.startswith("src/melee/gr/"):
        return "stage"
    if path.startswith("src/melee/ef/"):
        return "effect"
    if path.startswith("src/melee/lb/"):
        return "library"
    if path.startswith("src/melee/"):
        return "melee-core"
    if path.startswith("src/MSL/"):
        return "MSL"
    if path.startswith("src/MetroTRK/"):
        return "MetroTRK"
    if path.startswith("extern/"):
        return "external-sdk"
    if path.startswith("asm/"):
        return "asm"
    if path.startswith("tools/"):
        return "tooling"
    if path.endswith((".md", ".dox")):
        return "docs"
    return path.split("/", 1)[0] if "/" in path else "repo-root"


def classify_categories(title: str, changed_files: list[dict[str, Any]], text: str) -> list[str]:
    haystack = f"{title}\n{text}".lower()
    paths = " ".join(str(record.get("file") or "") for record in changed_files).lower()
    categories: set[str] = set()

    if any(word in haystack for word in ("match", "matching", "decomp", "decompile", "asm")):
        categories.add("decomp-matching")
    if any(word in haystack for word in ("name", "rename", "symbol")):
        categories.add("naming")
    if any(word in haystack for word in ("struct", "field", "type", "typedef")):
        categories.add("types-structs")
    if any(word in haystack for word in ("header", "include", "prototype")) or ".h" in paths:
        categories.add("headers")
    if any(word in haystack for word in ("fix", "bug", "correct")):
        categories.add("fix")
    if any(word in haystack for word in ("cleanup", "format", "style")):
        categories.add("cleanup")
    if "tools/" in paths or any(word in haystack for word in ("script", "tool", "ninja")):
        categories.add("tooling")
    if not categories:
        categories.add("code-change")
    return sorted(categories)


def extract_terms(
    title: str,
    changed_files: list[dict[str, Any]],
    diff_text: str,
    text: str,
    author: str | None,
    limit: int = 80,
) -> list[str]:
    terms: list[str] = []

    def add(term: str) -> None:
        term = term.strip().strip("_").lower()
        if len(term) < 3 or term in STOPWORDS or term in terms:
            return
        terms.append(term)

    if author:
        add(author)
    for token in re.findall(r"[A-Za-z0-9_]{3,}", title):
        add(token)
    for record in changed_files:
        path = str(record.get("file") or "")
        for part in re.split(r"[/.\-]+", path):
            add(part)
    for token in re.findall(r"\b[A-Za-z_][A-Za-z0-9_]{3,}\b", diff_text + "\n" + text):
        if "_" in token or any(ch.isupper() for ch in token) or token.startswith(("ft", "it", "gm", "lb")):
            add(token)
        if len(terms) >= limit:
            break
    return terms[:limit]


def review_feedback(records: list[dict[str, Any]], limit: int = 8) -> list[str]:
    feedback: list[str] = []
    for record in records:
        body = str(record.get("body") or "").strip()
        path = record.get("path")
        if not body:
            continue
        prefix = f"{path}: " if path else ""
        feedback.append(clip_text(prefix + " ".join(body.split()), 320))
        if len(feedback) >= limit:
            break
    return feedback


def file_change_bullets(changed_files: list[dict[str, Any]], limit: int = 12) -> list[str]:
    bullets: list[str] = []
    for record in top_changed_files(changed_files, limit):
        path = record.get("file") or "unknown"
        added = int(record.get("added") or 0)
        deleted = int(record.get("deleted") or 0)
        hunks = int(record.get("hunks") or 0)
        bullets.append(f"{path}: +{added}/-{deleted} across {hunks} hunks")
    return bullets


def summarize_scaffold(
    title: str,
    state: str,
    changed_files: list[dict[str, Any]],
    categories: list[str],
    systems: list[str],
) -> str:
    file_count = len(changed_files)
    system_text = ", ".join(systems[:4]) if systems else "unknown systems"
    category_text = ", ".join(categories)
    return (
        f"{title} is a {state.lower()} PR touching {file_count} changed file(s), "
        f"primarily in {system_text}. Draft classification: {category_text}."
    )


def build_postmortem_object(
    *,
    dump_root: Path,
    library_root: Path,
    repo_root: Path,
    number: int,
    index_pr: dict[str, Any],
    max_diff_chars: int,
    max_text_chars: int,
) -> dict[str, Any]:
    slice_dir = pr_slice_dir(dump_root, number)
    pr_doc = read_json(slice_dir / "pr.json", {})
    counts = read_json(slice_dir / "counts.json", {})
    activity = read_json(slice_dir / "activity.json", {})
    changed_files = read_jsonl(slice_dir / "changed_files.jsonl")
    diff_text = clip_text((slice_dir / "diff.diff").read_text(encoding="utf-8", errors="replace"), max_diff_chars) if (slice_dir / "diff.diff").exists() else ""
    text_records = read_jsonl(slice_dir / "text_corpus.jsonl", limit=80)
    review_records = [record for record in text_records if record.get("kind") == "review_comment"]
    human_text = clip_text((slice_dir / "human_pr_text.md").read_text(encoding="utf-8", errors="replace"), max_text_chars) if (slice_dir / "human_pr_text.md").exists() else ""
    review_text = clip_text((slice_dir / "review_comments.md").read_text(encoding="utf-8", errors="replace"), max_text_chars) if (slice_dir / "review_comments.md").exists() else ""

    title = pr_title(index_pr, pr_doc)
    author = pr_author(index_pr, pr_doc)
    state = pr_state(index_pr, pr_doc)
    systems = sorted({classify_system(str(record.get("file") or "")) for record in changed_files})
    text_blob = "\n".join(str(record.get("body") or "") for record in text_records)
    categories = classify_categories(title, changed_files, text_blob)
    terms = extract_terms(title, changed_files, diff_text, text_blob, author)

    return {
        "schema_version": OBJECT_SCHEMA_VERSION,
        "object_id": f"pr-{number}",
        "generated_at": now_utc(),
        "source": {
            "dump_root": rel(dump_root, repo_root),
            "slice_dir": rel(slice_dir, repo_root),
            "library_root": rel(library_root, repo_root),
        },
        "pr": {
            "number": number,
            "title": title,
            "author": author,
            "state": state,
            "url": pr_url(index_pr, pr_doc),
            "created_at": timestamp(index_pr, pr_doc, "createdAt", "created_at"),
            "updated_at": timestamp(index_pr, pr_doc, "updatedAt", "updated_at"),
            "merged_at": timestamp(index_pr, pr_doc, "mergedAt", "merged_at"),
            "closed_at": timestamp(index_pr, pr_doc, "closedAt", "closed_at"),
            "base_ref": (pr_doc.get("base") or {}).get("ref") if isinstance(pr_doc.get("base"), dict) else None,
            "head_ref": (pr_doc.get("head") or {}).get("ref") if isinstance(pr_doc.get("head"), dict) else None,
        },
        "counts": counts,
        "activity": activity,
        "initial_classification": {
            "categories": categories,
            "systems": systems,
            "search_terms": terms,
        },
        "changed_files": top_changed_files(changed_files, limit=80),
        "human_text_excerpt": human_text,
        "review_comments_excerpt": review_text,
        "review_feedback_examples": review_feedback(review_records),
        "diff_excerpt": diff_text,
    }


def output_schema_text() -> str:
    schema = {
        "schema_version": SCHEMA_VERSION,
        "object_id": "pr-NNNN",
        "pr": {
            "number": 0,
            "title": "",
            "url": "",
            "state": "",
            "author": "",
            "created_at": "",
            "merged_at": "",
        },
        "agent_status": "agent_completed",
        "summary": "",
        "change_classification": {
            "primary_type": "",
            "categories": [],
            "systems": [],
        },
        "key_files": [],
        "what_changed": [],
        "smart_moves": [],
        "decomp_lessons": [],
        "naming_conventions": [],
        "assembly_or_matching_tactics": [],
        "review_feedback": [],
        "searchable_terms": [],
        "follow_up_queries": [],
        "confidence": 0.0,
    }
    return json.dumps(schema, indent=2)


def system_prompt() -> str:
    return "\n".join(
        [
            "You are a Pi-agent past-PR reviewer for the doldecomp/melee decompilation project.",
            "Your job is to turn one GitHub PR dump slice into a compact, searchable JSON knowledge record.",
            "Focus on what changed, why it mattered, what was smart about the fix, and what future decomp work should reuse.",
            "Prioritize evidence from the PR title, body, comments, changed files, and diff excerpt.",
            "When the evidence is weak, say so; do not invent functions, symbols, or reviewer intent.",
            "Extract naming conventions, matching tactics, struct/header lessons, and review feedback when present.",
            "Return exactly one valid JSON object. Do not wrap it in prose.",
            "",
            "Required JSON shape:",
            output_schema_text(),
        ]
    )


def user_message(postmortem_object: dict[str, Any]) -> str:
    return "\n".join(
        [
            "<run>",
            "Inspect this PR context object and produce the required JSON record.",
            "Use the local slice paths if you need to reason about exact files, but keep the answer evidence-grounded.",
            "</run>",
            "",
            "<pr_context>",
            json.dumps(postmortem_object, indent=2, ensure_ascii=False),
            "</pr_context>",
            "",
            "Return exactly one JSON object.",
        ]
    )


def scaffold_postmortem(postmortem_object: dict[str, Any]) -> dict[str, Any]:
    pr = postmortem_object["pr"]
    initial = postmortem_object["initial_classification"]
    changed_files = postmortem_object["changed_files"]
    categories = initial["categories"]
    systems = initial["systems"]
    title = pr["title"]
    state = pr["state"]

    return {
        "schema_version": SCHEMA_VERSION,
        "object_id": postmortem_object["object_id"],
        "pr": {
            "number": pr["number"],
            "title": title,
            "url": pr["url"],
            "state": state,
            "author": pr["author"],
            "created_at": pr["created_at"],
            "merged_at": pr["merged_at"],
        },
        "agent_status": "scaffolded_without_agent",
        "summary": summarize_scaffold(title, state, changed_files, categories, systems),
        "change_classification": {
            "primary_type": categories[0] if categories else "code-change",
            "categories": categories,
            "systems": systems,
        },
        "key_files": file_change_bullets(changed_files),
        "what_changed": file_change_bullets(changed_files, limit=8),
        "smart_moves": [],
        "decomp_lessons": [
            "Run the Pi postmortem agent for evidence-backed lessons before relying on this draft."
        ],
        "naming_conventions": [],
        "assembly_or_matching_tactics": [],
        "review_feedback": postmortem_object["review_feedback_examples"],
        "searchable_terms": initial["search_terms"],
        "follow_up_queries": [
            f"Search past PR records for files related to PR {pr['number']}",
            f"Search review comments for {title}",
        ],
        "confidence": 0.25,
    }


def extract_json_object(raw_text: str) -> dict[str, Any]:
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text, flags=re.I)
    candidate = fence.group(1) if fence else raw_text
    first = candidate.find("{")
    last = candidate.rfind("}")
    if first < 0 or last <= first:
        raise ValueError("Pi response did not contain a JSON object")
    parsed = json.loads(candidate[first : last + 1])
    if not isinstance(parsed, dict):
        raise ValueError("Pi response JSON was not an object")
    return parsed


def validate_postmortem(parsed: dict[str, Any], postmortem_object: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    pr = postmortem_object["pr"]
    if parsed.get("schema_version") != SCHEMA_VERSION:
        issues.append(f"schema_version must be {SCHEMA_VERSION}")
    if parsed.get("object_id") != postmortem_object["object_id"]:
        issues.append(f"object_id must be {postmortem_object['object_id']}")
    parsed_pr = parsed.get("pr")
    if not isinstance(parsed_pr, dict):
        issues.append("pr must be an object")
    elif int(parsed_pr.get("number") or 0) != int(pr["number"]):
        issues.append(f"pr.number must be {pr['number']}")
    for field in (
        "summary",
        "what_changed",
        "smart_moves",
        "decomp_lessons",
        "searchable_terms",
        "confidence",
    ):
        if field not in parsed:
            issues.append(f"missing field: {field}")
    return issues


def run_pi_agent(
    *,
    args: argparse.Namespace,
    repo_root: Path,
    system_text: str,
    user_text: str,
    session_name: str,
    run_artifacts: RunArtifacts | None = None,
    number: int | None = None,
    input_dir: Path | None = None,
) -> str:
    pi_bin = shutil.which(args.pi_bin)
    if pi_bin is None:
        raise SystemExit(f"Missing pi binary: {args.pi_bin}")
    session_dir = args.session_dir.resolve()
    session_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="melee-pr-agent-") as temp_dir:
        user_message_path = Path(temp_dir) / "user_message.md"
        user_message_path.write_text(user_text, encoding="utf-8")
        cmd = [
            pi_bin,
            "-p",
            "--session-dir",
            str(session_dir),
            "--no-context-files",
            "--no-skills",
            "--no-prompt-templates",
            "--tools",
            args.tools,
            "--provider",
            args.provider,
            "--model",
            args.model,
            "--thinking",
            args.thinking,
            "--name",
            session_name,
            "--system-prompt",
            system_text,
            f"@{user_message_path.resolve()}",
            "Return only the requested JSON object.",
        ]
        if run_artifacts:
            run_artifacts.append(
                {
                    "event": "pi_launching",
                    "pr": number,
                    "session_name": session_name,
                    "session_dir": str(session_dir),
                    "input_dir": str(input_dir) if input_dir else None,
                    "provider": args.provider,
                    "model": args.model,
                    "thinking": args.thinking,
                    "tools": args.tools,
                    "timeout_seconds": args.agent_timeout_seconds,
                }
            )
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=repo_root,
                env=os.environ.copy(),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if run_artifacts:
                run_artifacts.append(
                    {
                        "event": "pi_spawned",
                        "pr": number,
                        "pid": proc.pid,
                        "session_name": session_name,
                    }
                )
            stdout, stderr = proc.communicate(timeout=args.agent_timeout_seconds)
        except subprocess.TimeoutExpired as exc:
            proc.kill()
            stdout, stderr = proc.communicate()
            output = stdout or exc.stdout or ""
            error = stderr or exc.stderr or ""
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            if isinstance(error, bytes):
                error = error.decode("utf-8", errors="replace")
            timeout_note = f"pi timed out after {args.agent_timeout_seconds}s"
            if run_artifacts:
                run_artifacts.append(
                    {
                        "event": "pi_finished",
                        "pr": number,
                        "pid": proc.pid,
                        "session_name": session_name,
                        "returncode": proc.returncode,
                        "timed_out": True,
                        "stdout_chars": len(output),
                        "stderr_chars": len(error),
                        "error_excerpt": compact_error(error or timeout_note),
                    }
                )
            raise AgentRunError(compact_error("\n".join(part for part in (error, timeout_note) if part)))
    raw = stdout or ""
    stderr = stderr or ""
    if run_artifacts:
        run_artifacts.append(
            {
                "event": "pi_finished",
                "pr": number,
                "pid": proc.pid,
                "session_name": session_name,
                "returncode": proc.returncode,
                "timed_out": False,
                "stdout_chars": len(raw),
                "stderr_chars": len(stderr),
                "error_excerpt": compact_error(stderr) if proc.returncode != 0 else None,
            }
        )
    if proc.returncode != 0:
        raise AgentRunError(compact_error(stderr or f"pi exited {proc.returncode}"))
    return raw


def process_pr(
    *,
    args: argparse.Namespace,
    repo_root: Path,
    dump_root: Path,
    library_root: Path,
    number: int,
    index_pr: dict[str, Any],
    run_artifacts: RunArtifacts | None = None,
) -> str:
    output_dir = out_pr_dir(library_root, number)
    postmortem_path = output_dir / "postmortem.json"
    should_upgrade_existing = (
        args.run_agent
        and postmortem_path.exists()
        and is_pending_postmortem(library_root, number, run_agent=True)
    )
    if postmortem_path.exists() and not args.rerun_existing and not should_upgrade_existing:
        if run_artifacts:
            run_artifacts.append(
                {
                    "event": "pr_skipped_existing",
                    "pr": number,
                    "postmortem_path": str(postmortem_path),
                }
            )
        return "skipped_existing"
    if run_artifacts:
        run_artifacts.append(
            {
                "event": "pr_started",
                "pr": number,
                "postmortem_path": str(postmortem_path),
            }
        )

    postmortem_object = build_postmortem_object(
        dump_root=dump_root,
        library_root=library_root,
        repo_root=repo_root,
        number=number,
        index_pr=index_pr,
        max_diff_chars=args.max_diff_chars,
        max_text_chars=args.max_text_chars,
    )
    system_text = system_prompt()
    user_text = user_message(postmortem_object)
    input_dir: Path | None = None
    if run_artifacts:
        input_dir = run_artifacts.root / "pr-inputs" / f"pr-{number}"
        write_json(input_dir / "context_object.json", postmortem_object)
        write_text(input_dir / "system_prompt.md", system_text)
        write_text(input_dir / "user_message.md", user_text)
        run_artifacts.append(
            {
                "event": "pr_input_written",
                "pr": number,
                "input_dir": str(input_dir),
                "context_object": str(input_dir / "context_object.json"),
                "system_prompt": str(input_dir / "system_prompt.md"),
                "user_message": str(input_dir / "user_message.md"),
            }
        )

    if args.dry_run:
        if run_artifacts:
            run_artifacts.append({"event": "pr_finished", "pr": number, "status": "dry_run"})
        return "dry_run"

    if args.run_agent:
        raw = run_pi_agent(
            args=args,
            repo_root=repo_root,
            system_text=system_text,
            user_text=user_text,
            session_name=f"PR review {number}",
            run_artifacts=run_artifacts,
            number=number,
            input_dir=input_dir,
        )
        try:
            postmortem = extract_json_object(raw)
            postmortem["agent_status"] = postmortem.get("agent_status") or "agent_completed"
            validation_issues = validate_postmortem(postmortem, postmortem_object)
        except Exception as exc:
            status = "agent_failed_existing_preserved" if postmortem_path.exists() else "agent_failed_pending"
            if run_artifacts:
                run_artifacts.append(
                    {
                        "event": "pr_finished",
                        "pr": number,
                        "status": status,
                        "postmortem_path": str(postmortem_path),
                        "failure": compact_error(str(exc)),
                    }
                )
            return status
    else:
        postmortem = scaffold_postmortem(postmortem_object)
        validation_issues = validate_postmortem(postmortem, postmortem_object)
    if validation_issues:
        postmortem["validation_issues"] = validation_issues
    postmortem["agent_runtime"] = agent_runtime(args)
    write_json(postmortem_path, postmortem)
    status = str(postmortem.get("agent_status") or ("agent_completed" if args.run_agent else "scaffolded"))
    if run_artifacts:
        run_artifacts.append(
            {
                "event": "pr_finished",
                "pr": number,
                "status": status,
                "postmortem_path": str(postmortem_path),
                "validation_issue_count": len(validation_issues),
            }
        )
    return status


def index_record(path: Path, library_root: Path) -> dict[str, Any] | None:
    postmortem = read_json(path, None)
    if not isinstance(postmortem, dict):
        return None
    pr = postmortem.get("pr")
    if not isinstance(pr, dict):
        pr = {}
    classification = postmortem.get("change_classification")
    if not isinstance(classification, dict):
        classification = {}
    rel_json = path.relative_to(library_root)
    return {
        "pr": pr.get("number"),
        "title": pr.get("title"),
        "state": pr.get("state"),
        "author": pr.get("author"),
        "created_at": pr.get("created_at"),
        "merged_at": pr.get("merged_at"),
        "url": pr.get("url"),
        "agent_status": postmortem.get("agent_status"),
        "primary_type": classification.get("primary_type"),
        "categories": ";".join(str(item) for item in classification.get("categories") or []),
        "systems": ";".join(str(item) for item in classification.get("systems") or []),
        "summary": postmortem.get("summary"),
        "searchable_terms": ";".join(str(item) for item in postmortem.get("searchable_terms") or []),
        "confidence": postmortem.get("confidence"),
        "postmortem_json": str(rel_json),
    }


def write_agent_standard_files(agent_root: Path) -> None:
    templates_root = agent_root / "templates"
    write_text(
        agent_root / "README.md",
        "\n".join(
            [
                "# PR Review Agent",
                "",
                "Shared Pi-agent instructions for turning one raw PR slice into a searchable JSON record.",
                "Per-PR folders do not duplicate these prompts; the builder renders the current PR context in memory.",
                "",
                "Files:",
                "",
                "- `templates/system.md`: shared Pi system prompt.",
                "- `templates/initial_user.md`: template for the per-PR context payload.",
                "- `schema.json`: required JSON response shape.",
                "",
                "Default Pi review config:",
                "",
                "- Provider: `codex-lb`",
                "- Model: `gpt-5.5`",
                "- Thinking: `medium`",
                "- Tools: `read,grep,find,ls`",
                "- Auth/config: ignored repo-local `local.env` points Pi at `.pi-agent/`, whose `models.json` carries this project's `codex-lb` key.",
                "",
            ]
        ),
    )
    write_text(templates_root / "system.md", system_prompt().rstrip() + "\n")
    write_text(
        templates_root / "initial_user.md",
        "\n".join(
            [
                "<run>",
                "Inspect this PR context object and produce the required JSON record.",
                "Use the local slice paths if you need to reason about exact files, but keep the answer evidence-grounded.",
                "</run>",
                "",
                "<pr_context>",
                "{pr_context_json}",
                "</pr_context>",
                "",
                "Return exactly one JSON object.",
                "",
            ]
        ),
    )
    write_json(agent_root / "schema.json", json.loads(output_schema_text()))


def write_library_readme(library_root: Path) -> None:
    write_text(
        library_root / "README.md",
        "\n".join(
            [
                "# Past PR Library",
                "",
        "Searchable decomp-orchestrator library generated from `decomp-orchestrator/knowledge/sources/past_prs/data` PR slices.",
                "",
                "Important files:",
                "",
                "- `index.csv`: spreadsheet-friendly index of every processed PR.",
                "- `index.jsonl`: one JSON record per processed PR for script/RAG ingestion.",
                "- `known_fixes.md`: compact human-readable rollup.",
                "- `pr-NNNN/postmortem.json`: structured per-PR knowledge record.",
                "",
                "Shared Pi instructions live in `src/agents/pr-review`; per-PR folders intentionally only store JSON records.",
                "Persisted PR-review Pi sessions are written under `.pi-sessions/pr-review/`, which is ignored by git.",
                "",
                "Records with `agent_status=scaffolded_without_agent` are deterministic drafts. "
                "Rerun with `--run-agent --pending-only --jobs 16` for model-reviewed JSON records. "
                "Pi/API failures stay pending instead of writing fallback postmortems.",
                "",
            ]
        ),
    )


def write_indexes(library_root: Path) -> dict[str, int]:
    records = [
        record
        for path in sorted(library_root.glob("pr-*/postmortem.json"))
        if (record := index_record(path, library_root)) is not None
    ]
    records.sort(key=lambda record: int(record.get("pr") or 0), reverse=True)

    write_jsonl(library_root / "index.jsonl", records)
    fields = [
        "pr",
        "title",
        "state",
        "author",
        "created_at",
        "merged_at",
        "url",
        "agent_status",
        "primary_type",
        "categories",
        "systems",
        "summary",
        "searchable_terms",
        "confidence",
        "postmortem_json",
    ]
    with (library_root / "index.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for record in records:
            writer.writerow({field: clean_inline_text(record.get(field)) for field in fields})

    blocks = ["# Known PR Fixes And Changes", ""]
    for record in records:
        title = clean_inline_text(record.get("title"))
        agent_status = clean_inline_text(record.get("agent_status"))
        primary_type = clean_inline_text(record.get("primary_type"))
        systems = clean_inline_text(record.get("systems"))
        blocks.append(f"## PR #{record.get('pr')}: {title}")
        blocks.append("")
        blocks.append(f"Status: {agent_status}" if agent_status else "Status:")
        blocks.append(f"Type: {primary_type}" if primary_type else "Type:")
        blocks.append(f"Systems: {systems}" if systems else "Systems:")
        blocks.append("")
        blocks.append(str(record.get("summary") or ""))
        blocks.append("")
        blocks.append(f"Postmortem JSON: `{record.get('postmortem_json')}`")
        blocks.append("")
    write_text(library_root / "known_fixes.md", "\n".join(blocks).rstrip() + "\n")
    write_library_readme(library_root)
    return {"indexed_records": len(records)}


def main() -> int:
    args = parse_args()
    dump_root = args.dump_root.resolve()
    library_root = args.library_root.resolve()
    agent_root = args.agent_root.resolve()
    repo_root = find_repo_root(SCRIPT_DIR)
    load_local_env(repo_root)
    pr_index = load_pr_index(dump_root)
    numbers = select_numbers(args, pr_index)
    jobs = max(1, args.jobs)
    run_artifacts: RunArtifacts | None = None
    if args.run_agent and not args.dry_run:
        run_artifact_root = args.run_artifact_root.resolve() if args.run_artifact_root else library_root / "runs" / run_id_now()
        run_artifacts = RunArtifacts(run_artifact_root)
        run_artifacts.append(
            {
                "event": "batch_started",
                "dump_root": str(dump_root),
                "library_root": str(library_root),
                "selected_pr_count": len(numbers),
                "jobs": jobs,
                "agent_runtime": agent_runtime(args),
            }
        )
    if args.run_agent:
        runtime = agent_runtime(args)
        print(
            "Pi review config: "
            f"provider={runtime['provider']} "
            f"model={runtime['model']} "
            f"thinking={runtime['thinking']} "
            f"tools={runtime['tools']} "
            f"agent_timeout_seconds={runtime['agent_timeout_seconds']} "
            f"session_dir={runtime['session_dir']}",
            flush=True,
        )
        if run_artifacts:
            print(f"Pi review artifacts: {run_artifacts.root}", flush=True)
    print(f"selected PRs: {len(numbers)} (jobs={jobs})", flush=True)

    stats: dict[str, int] = {}

    def run_one(number: int) -> tuple[int, str]:
        result = process_pr(
            args=args,
            repo_root=repo_root,
            dump_root=dump_root,
                library_root=library_root,
                number=number,
                index_pr=pr_index[number],
                run_artifacts=run_artifacts,
            )
        return number, result

    if jobs == 1:
        for number in numbers:
            number, result = run_one(number)
            stats[result] = stats.get(result, 0) + 1
            print(f"{result}: PR #{number}", flush=True)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as executor:
            futures = {executor.submit(run_one, number): number for number in numbers}
            for future in concurrent.futures.as_completed(futures):
                number = futures[future]
                try:
                    number, result = future.result()
                except Exception as exc:
                    result = "failed_exception"
                    result_detail = f": {exc}"
                else:
                    result_detail = ""
                stats[result] = stats.get(result, 0) + 1
                print(f"{result}: PR #{number}{result_detail}", flush=True)

    if not args.dry_run:
        write_agent_standard_files(agent_root)
        stats.update(write_indexes(library_root))
        write_json(
            library_root / "run_summary.json",
            {
                "generated_at": now_utc(),
                "dump_root": str(dump_root),
                "library_root": str(library_root),
                "agent_root": str(agent_root),
                "run_artifacts": str(run_artifacts.root) if run_artifacts else None,
                "processed_pr_count": len(numbers),
                "jobs": jobs,
                "run_agent": args.run_agent,
                "agent_runtime": agent_runtime(args) if args.run_agent else None,
                "per_pr_artifacts": ["postmortem.json", "runs/<timestamp>/pr-inputs/pr-*/"],
                "stats": stats,
            },
        )
    if run_artifacts:
        run_artifacts.append(
            {
                "event": "batch_finished",
                "stats": stats,
                "indexed_records": stats.get("indexed_records"),
            }
        )

    print(f"postmortem stats: {stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
