#!/usr/bin/env python3
"""Build derived analysis files for a doldecomp/melee PR dump."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any

import pr_data_layout as layout

RAW_FILE_MAP = layout.RAW_FILE_MAP


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Regenerate formatted indexes and analysis files for a PR dump."
    )
    parser.add_argument("dump_root", type=Path)
    parser.add_argument("--repo", default=None)
    parser.add_argument("--query", default=None)
    parser.add_argument("--source", default="gh")
    parser.add_argument("--prs-dir", default="prs")
    return parser.parse_args()


def now_utc() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


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


def pr_number(pr: dict[str, Any]) -> int:
    return int(pr.get("number") or pr.get("pr"))


def user_login(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("login")
    if isinstance(value, str):
        return value
    return None


def is_bot_login(login: str | None) -> bool:
    if not login:
        return False
    return login.endswith("[bot]") or login.lower() in {
        "dependabot",
        "github-actions",
    }


def pr_author(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str | None:
    return (
        user_login(index_pr.get("author"))
        or user_login(pr_doc.get("user"))
        or user_login(pr_doc.get("author"))
    )


def pr_title(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str:
    return str(index_pr.get("title") or pr_doc.get("title") or "")


def pr_url(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str:
    return str(index_pr.get("url") or pr_doc.get("html_url") or pr_doc.get("url") or "")


def pr_state(index_pr: dict[str, Any], pr_doc: dict[str, Any]) -> str | None:
    state = index_pr.get("state") or pr_doc.get("state")
    merged_at = index_pr.get("mergedAt") or pr_doc.get("merged_at")
    if merged_at:
        return "MERGED"
    if isinstance(state, str):
        return state.upper()
    return None


def pr_timestamp(
    index_pr: dict[str, Any], pr_doc: dict[str, Any], camel: str, snake: str
) -> str | None:
    value = index_pr.get(camel) or pr_doc.get(snake)
    return value if isinstance(value, str) else None


def pr_dir(dump_root: Path, prs_dir: str, number: int) -> Path:
    return layout.pr_slice_dir(dump_root, number, prs_dir)


def raw_json_path(dump_root: Path, number: int, kind: str) -> Path:
    return layout.legacy_flat_raw_json_path(dump_root, number, kind)


def read_pr_json(
    dump_root: Path, prs_dir: str, number: int, kind: str, default: Any
) -> Any:
    for path in layout.candidate_raw_json_paths(dump_root, number, kind, prs_dir):
        if path.exists():
            return read_json(path, default)
    return default


def read_diff(dump_root: Path, prs_dir: str, number: int) -> str:
    for path in layout.candidate_diff_paths(dump_root, number, prs_dir):
        if path.exists():
            return path.read_text(encoding="utf-8", errors="replace")
    return ""


def normalize_diff_path(raw_path: str) -> str | None:
    raw_path = raw_path.strip()
    if raw_path == "/dev/null":
        return None
    if raw_path.startswith("a/") or raw_path.startswith("b/"):
        return raw_path[2:]
    return raw_path or None


def parse_diff(
    number: int, title: str, diff_text: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    files: list[dict[str, Any]] = []
    line_records: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    current_file: str | None = None
    old_file: str | None = None
    hunk: str | None = None

    def finish_current() -> None:
        nonlocal current
        if current and (current["added"] or current["deleted"] or current["hunks"]):
            files.append(current)
        current = None

    for line in diff_text.splitlines():
        if line.startswith("diff --git "):
            finish_current()
            parts = line.split()
            old_file = normalize_diff_path(parts[2]) if len(parts) > 2 else None
            current_file = normalize_diff_path(parts[3]) if len(parts) > 3 else old_file
            current = {
                "pr": number,
                "title": title,
                "file": current_file or old_file or "unknown",
                "added": 0,
                "deleted": 0,
                "hunks": 0,
            }
            hunk = None
            continue

        if current is None:
            continue

        if line.startswith("--- "):
            old_file = normalize_diff_path(line[4:])
            if current["file"] == "unknown" and old_file:
                current["file"] = old_file
            continue

        if line.startswith("+++ "):
            new_file = normalize_diff_path(line[4:])
            current_file = new_file or old_file or current_file
            current["file"] = current_file or current["file"]
            continue

        if line.startswith("@@ "):
            hunk = line
            current["hunks"] += 1
            continue

        if line.startswith("+") and not line.startswith("+++"):
            current["added"] += 1
            line_records.append(
                {
                    "pr": number,
                    "title": title,
                    "file": current["file"],
                    "change": "add",
                    "hunk": hunk,
                    "line": line[1:],
                }
            )
            continue

        if line.startswith("-") and not line.startswith("---"):
            current["deleted"] += 1
            line_records.append(
                {
                    "pr": number,
                    "title": title,
                    "file": current["file"],
                    "change": "del",
                    "hunk": hunk,
                    "line": line[1:],
                }
            )

    finish_current()
    return files, line_records


def text_record(
    number: int,
    title: str,
    url: str,
    kind: str,
    author: str | None,
    created_at: str | None,
    body: Any,
    **extra: Any,
) -> dict[str, Any]:
    record = {
        "pr": number,
        "title": title,
        "url": url,
        "kind": kind,
        "author": author,
        "created_at": created_at,
        "path": extra.pop("path", None),
        "body": body or "",
    }
    record.update(extra)
    return record


def append_markdown_block(
    blocks: list[str],
    number: int,
    title: str,
    author: str | None,
    url: str,
    body: str,
) -> None:
    body = body.strip()
    if not body:
        return
    blocks.append(
        f"## PR #{number}: {title}\n"
        f"Author: {author or ''}\n"
        f"URL: {url}\n\n"
        f"{body}\n"
    )


def append_review_block(
    blocks: list[str],
    number: int,
    title: str,
    comment: dict[str, Any],
) -> None:
    body = str(comment.get("body") or "").strip()
    if not body:
        return

    hunk = str(comment.get("diff_hunk") or "").rstrip()
    block = (
        f"## PR #{number}: {title}\n"
        f"Path: {comment.get('path') or ''}\n"
        f"URL: {comment.get('html_url') or comment.get('url') or ''}\n"
        f"Author: {user_login(comment.get('user')) or ''}\n\n"
        f"{body}\n"
    )
    if hunk:
        block += f"\nHunk:\n```diff\n{hunk}\n```\n"
    blocks.append(block)


def file_size_kib(path: Path) -> int:
    total = 0
    for child in path.rglob("*"):
        if child.is_file():
            total += child.stat().st_size
    return total // 1024


def count_existing_pr_files(dump_root: Path, prs_dir: str, kind: str) -> int:
    filename = RAW_FILE_MAP[kind]
    numbers = {
        int(path.parent.name.removeprefix("pr-"))
        for path in (dump_root / prs_dir).glob(f"pr-*/{filename}")
        if path.parent.name.removeprefix("pr-").isdigit()
    }
    numbers.update(
        int(path.parent.parent.name.removeprefix("pr-"))
        for path in (dump_root / prs_dir).glob(f"pr-*/raw/{filename}")
        if path.parent.parent.name.removeprefix("pr-").isdigit()
    )
    suffix = f"_{kind}.json"
    numbers.update(
        int(path.name[: -len(suffix)])
        for path in (dump_root / "raw").glob(f"*{suffix}")
        if path.name[: -len(suffix)].isdigit()
    )
    return len(numbers)


def count_existing_diffs(dump_root: Path, prs_dir: str) -> int:
    numbers = {
        int(path.parent.name.removeprefix("pr-"))
        for path in (dump_root / prs_dir).glob("pr-*/diff.diff")
        if path.parent.name.removeprefix("pr-").isdigit()
    }
    numbers.update(
        int(path.parent.parent.name.removeprefix("pr-"))
        for path in (dump_root / prs_dir).glob("pr-*/raw/diff.diff")
        if path.parent.parent.name.removeprefix("pr-").isdigit()
    )
    numbers.update(
        int(path.stem)
        for path in (dump_root / "diffs").glob("*.diff")
        if path.stem.isdigit()
    )
    return len(numbers)


def count_nonempty_diff_errors(dump_root: Path, prs_dir: str) -> int:
    paths = list((dump_root / "diffs").glob("*.diff.err"))
    paths.extend((dump_root / prs_dir).glob("pr-*/diff.err"))
    paths.extend((dump_root / prs_dir).glob("pr-*/raw/diff.err"))
    return sum(1 for path in paths if path.exists() and path.stat().st_size > 0)


def existing_metadata(dump_root: Path) -> dict[str, Any]:
    fetch_metadata = read_json(dump_root / "fetch_metadata.json", {})
    manifest = read_json(dump_root / "manifest.json", {})
    summary = read_json(dump_root / "summary.json", {})
    merged = {}
    if isinstance(fetch_metadata, dict):
        merged.update(fetch_metadata)
    if isinstance(summary, dict):
        merged.update(summary)
    if isinstance(manifest, dict):
        merged.update(manifest)
    return merged


def build_dump(
    dump_root: Path,
    *,
    repo: str | None = None,
    query: str | None = None,
    source: str = "gh",
    prs_dir: str = "prs",
    generated_at: str | None = None,
) -> dict[str, Any]:
    dump_root = dump_root.resolve()
    prs = read_json(dump_root / "prs.json", [])
    if not isinstance(prs, list) or not prs:
        raise SystemExit(f"No PR index found at {dump_root / 'prs.json'}")

    metadata = existing_metadata(dump_root)
    repo = repo or metadata.get("repo") or "doldecomp/melee"
    query = query or metadata.get("query") or ""
    generated_at = generated_at or now_utc()

    text_records: list[dict[str, Any]] = []
    changed_file_records: list[dict[str, Any]] = []
    diff_line_records: list[dict[str, Any]] = []
    counts_records: list[dict[str, Any]] = []
    activity_records: list[dict[str, Any]] = []
    human_blocks: list[str] = []
    review_blocks: list[str] = []

    totals = {
        "issue_comments": 0,
        "review_comments": 0,
        "reviews": 0,
        "nonempty_diff_error_files": 0,
    }

    for index_pr in prs:
        number = pr_number(index_pr)
        pr_doc = read_pr_json(dump_root, prs_dir, number, "pr", {})
        issue_comments = read_pr_json(dump_root, prs_dir, number, "issue_comments", [])
        review_comments = read_pr_json(dump_root, prs_dir, number, "review_comments", [])
        reviews = read_pr_json(dump_root, prs_dir, number, "reviews", [])
        if not isinstance(issue_comments, list):
            issue_comments = []
        if not isinstance(review_comments, list):
            review_comments = []
        if not isinstance(reviews, list):
            reviews = []

        title = pr_title(index_pr, pr_doc)
        url = pr_url(index_pr, pr_doc)
        author = pr_author(index_pr, pr_doc)
        created_at = pr_timestamp(index_pr, pr_doc, "createdAt", "created_at")
        body = pr_doc.get("body", index_pr.get("body", ""))
        diff_text = read_diff(dump_root, prs_dir, number)
        changed_files, diff_lines = parse_diff(number, title, diff_text)

        pr_body_record = text_record(
            number,
            title,
            url,
            "pr_body",
            author,
            created_at,
            body,
        )
        text_records.append(pr_body_record)
        if not is_bot_login(author):
            append_markdown_block(human_blocks, number, title, author, url, str(body or ""))

        for comment in issue_comments:
            login = user_login(comment.get("user"))
            record = text_record(
                number,
                title,
                url,
                "issue_comment",
                login,
                comment.get("created_at"),
                comment.get("body"),
                comment_url=comment.get("html_url") or comment.get("url"),
            )
            text_records.append(record)
            if not is_bot_login(login):
                append_markdown_block(
                    human_blocks,
                    number,
                    title,
                    login,
                    record.get("comment_url") or url,
                    str(comment.get("body") or ""),
                )

        for comment in review_comments:
            login = user_login(comment.get("user"))
            record = text_record(
                number,
                title,
                url,
                "review_comment",
                login,
                comment.get("created_at"),
                comment.get("body"),
                path=comment.get("path"),
                comment_url=comment.get("html_url") or comment.get("url"),
                diff_hunk=comment.get("diff_hunk"),
                line=comment.get("line"),
                side=comment.get("side"),
            )
            text_records.append(record)
            if not is_bot_login(login):
                append_review_block(review_blocks, number, title, comment)

        for review in reviews:
            login = user_login(review.get("user"))
            text_records.append(
                text_record(
                    number,
                    title,
                    url,
                    "review",
                    login,
                    review.get("submitted_at") or review.get("created_at"),
                    review.get("body"),
                    comment_url=review.get("html_url") or review.get("url"),
                    state=review.get("state"),
                )
            )

        text_with_body = sum(
            1
            for record in text_records
            if record["pr"] == number and str(record.get("body") or "").strip()
        )
        added_lines = sum(int(record["added"]) for record in changed_files)
        deleted_lines = sum(int(record["deleted"]) for record in changed_files)

        counts_record = {
            "number": number,
            "title": title,
            "state": pr_state(index_pr, pr_doc),
            "createdAt": pr_timestamp(index_pr, pr_doc, "createdAt", "created_at"),
            "updatedAt": pr_timestamp(index_pr, pr_doc, "updatedAt", "updated_at"),
            "mergedAt": pr_timestamp(index_pr, pr_doc, "mergedAt", "merged_at"),
            "closedAt": pr_timestamp(index_pr, pr_doc, "closedAt", "closed_at"),
            "author": author,
            "url": url,
            "counts": {
                "issue_comments": len(issue_comments),
                "review_comments": len(review_comments),
                "reviews": len(reviews),
                "diff_bytes": len(diff_text.encode("utf-8")),
            },
        }
        counts_records.append(counts_record)
        activity_records.append(
            {
                "pr": number,
                "title": title,
                "url": url,
                "text_records_with_body": text_with_body,
                "review_comments": len(review_comments),
                "changed_files": len(changed_files),
                "added_lines": added_lines,
                "deleted_lines": deleted_lines,
            }
        )

        changed_file_records.extend(changed_files)
        diff_line_records.extend(diff_lines)
        totals["issue_comments"] += len(issue_comments)
        totals["review_comments"] += len(review_comments)
        totals["reviews"] += len(reviews)

    totals["nonempty_diff_error_files"] = count_nonempty_diff_errors(dump_root, prs_dir)

    analysis_dir = layout.aggregate_dir(dump_root)
    write_json(dump_root / "pr_counts.json", counts_records)
    write_json(analysis_dir / "per_pr_activity.json", activity_records)
    write_jsonl(analysis_dir / "text_corpus.jsonl", text_records)
    write_jsonl(analysis_dir / "changed_files.jsonl", changed_file_records)
    write_jsonl(analysis_dir / "diff_lines.jsonl", diff_line_records)
    write_text(analysis_dir / "human_pr_text.md", "\n".join(human_blocks).rstrip() + "\n")
    write_text(analysis_dir / "review_comments.md", "\n".join(review_blocks).rstrip() + "\n")

    summary = {
        "repo": repo,
        "query": query,
        "generated_at": generated_at,
        "pr_count": len(prs),
        "files": {
            "pr_index": "prs.json",
            "per_pr_counts": "pr_counts.json",
            "raw_pr_files": count_existing_pr_files(dump_root, prs_dir, "pr"),
            "diff_files": count_existing_diffs(dump_root, prs_dir),
            "aggregate_dir": "aggregate",
        },
        "totals": totals,
        "size_kib": file_size_kib(dump_root),
    }
    write_json(dump_root / "summary.json", summary)

    manifest = {
        "repo": repo,
        "query": query,
        "generated_at": generated_at,
        "source": source,
        "pr_count": len(prs),
        "notes": (
            "Includes PR metadata, issue comments, inline review comments, "
            "review summaries, and PR diffs. Comment/review list endpoints are "
            "paginated and flattened into JSON arrays."
        ),
        "files": {
            "index": "prs.json",
            "per_pr_counts": "pr_counts.json",
            "aggregate_analysis_dir": "aggregate",
        },
    }
    if (dump_root / "fetch_metadata.json").exists():
        manifest["fetch_metadata"] = {
            "path": "fetch_metadata.json",
            "activity": metadata.get("activity"),
            "since": metadata.get("since"),
            "fetched_at": metadata.get("fetched_at"),
            "stable_dump_root": True,
        }
    write_json(dump_root / "manifest.json", manifest)

    write_text(
        dump_root / "fetch-completed.txt",
        f"PR dump formatted at {generated_at}\nrepo={repo}\nquery={query}\nprs={len(prs)}\n",
    )

    return {
        "pr_count": len(prs),
        "text_records": len(text_records),
        "changed_files": len(changed_file_records),
        "diff_lines": len(diff_line_records),
        "review_comment_blocks": len(review_blocks),
    }


def main() -> int:
    args = parse_args()
    stats = build_dump(
        args.dump_root,
        repo=args.repo,
        query=args.query,
        source=args.source,
        prs_dir=args.prs_dir,
    )
    print(
        "built analysis for "
        f"{stats['pr_count']} PRs "
        f"({stats['text_records']} text records, "
        f"{stats['changed_files']} changed-file records)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
