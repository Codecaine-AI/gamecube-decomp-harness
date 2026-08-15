#!/usr/bin/env python3
"""Rewrite legacy past-PR layout paths in generated run artifacts.

This is a one-off cleanup for path strings left behind by the vertical-slice
layout migration. It defaults to a dry-run; pass --apply to write changes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SOURCE_ROOT.parent.parent / "_shared"))
from source_index import source_data_root  # type: ignore

DEFAULT_DATA_ROOT = source_data_root(SOURCE_ROOT)
DEFAULT_TARGETS = (
    Path("runs/postmortems"),
    Path("full_corpus_resume_status.md"),
    Path("legacy-past-prs-README.md"),
)
REPORT_NAME = "legacy_path_rewrite_report.json"
TEXT_SUFFIXES = {
    ".csv",
    ".json",
    ".jsonl",
    ".log",
    ".md",
    ".txt",
    ".tsv",
    ".yaml",
    ".yml",
}
NEEDLES = (
    "knowledge/sources/past_prs",
    "knowledge/sources/code_context/past_prs/data/current",
    "knowledge/sources/code_context/past_prs/data/prs/runs",
)


@dataclass(frozen=True)
class RewriteRule:
    name: str
    pattern: re.Pattern[str]
    replacement: str
    description: str


def compile_rule(name: str, pattern: str, replacement: str, description: str) -> RewriteRule:
    return RewriteRule(name, re.compile(pattern), replacement, description)


RULES = (
    compile_rule(
        "current_pr_slice",
        r"knowledge/sources/(?:code_context/)?past_prs/data/current/prs/(pr-\d+)",
        r"knowledge/sources/code_context/past_prs/data/prs/\1",
        "old data/current PR slice path to vertical PR slice path",
    ),
    compile_rule(
        "flat_postmortem_file",
        r"knowledge/sources/(?:code_context/)?past_prs/data/prs/(pr-\d+)/postmortem\.json",
        r"knowledge/sources/code_context/past_prs/data/prs/\1/postmortem/postmortem.json",
        "old flat per-PR postmortem file to nested postmortem file",
    ),
    compile_rule(
        "postmortem_run_root",
        r"knowledge/sources/(?:code_context/)?past_prs/data/prs/runs",
        r"knowledge/sources/code_context/past_prs/data/runs/postmortems",
        "old postmortem run root to data/runs/postmortems",
    ),
    compile_rule(
        "current_data_root",
        r"knowledge/sources/(?:code_context/)?past_prs/data/current",
        r"knowledge/sources/code_context/past_prs/data",
        "old stable data/current root to top-level data root",
    ),
    compile_rule(
        "library_root",
        r"knowledge/sources/(?:code_context/)?past_prs/data/prs(?=(?:[\"'\s,}\]\)]|$))",
        r"knowledge/sources/code_context/past_prs/data/library",
        "old postmortem library root to data/library",
    ),
    compile_rule(
        "library_files",
        r"knowledge/sources/(?:code_context/)?past_prs/data/prs/(README\.md|index\.csv|index\.jsonl|known_fixes\.md|run_summary\.json)",
        r"knowledge/sources/code_context/past_prs/data/library/\1",
        "old postmortem library files to data/library",
    ),
    compile_rule(
        "source_root",
        r"knowledge/sources/past_prs/",
        r"knowledge/sources/code_context/past_prs/",
        "old source root to code_context source root",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rewrite legacy past-PR layout paths in generated run artifacts."
    )
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument(
        "--target",
        type=Path,
        action="append",
        default=[],
        help=(
            "File or directory to scan. Relative paths are resolved under "
            "--data-root. Defaults to run postmortem artifacts and top-level notes."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write rewritten files. Without this, only a dry-run summary is printed.",
    )
    parser.add_argument(
        "--write-report",
        action="store_true",
        help="Write a JSON report during dry-run. Reports are always written with --apply unless --no-report is set.",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Do not write the JSON report.",
    )
    parser.add_argument(
        "--list-limit",
        type=int,
        default=20,
        help="Maximum changed files to list in stdout.",
    )
    return parser.parse_args()


def now_id() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def rel(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


def is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def resolve_target(target: Path, data_root: Path) -> Path:
    if target.is_absolute():
        return target
    data_candidate = data_root / target
    if data_candidate.exists():
        return data_candidate
    return target


def default_targets(data_root: Path) -> list[Path]:
    return [data_root / target for target in DEFAULT_TARGETS if (data_root / target).exists()]


def iter_target_files(targets: list[Path], data_root: Path) -> list[Path]:
    migration_root = data_root / "runs" / "migrations"
    files: dict[Path, None] = {}
    for target in targets:
        if not target.exists():
            print(f"warning: target does not exist: {target}", file=sys.stderr)
            continue
        candidates = target.rglob("*") if target.is_dir() else (target,)
        for path in candidates:
            if not path.is_file() or path.is_symlink():
                continue
            if is_under(path, migration_root):
                continue
            files[path.resolve()] = None
    return sorted(files)


def should_scan(text: str) -> bool:
    if any(needle in text for needle in NEEDLES):
        return True
    if "knowledge/sources/code_context/past_prs/data/prs/" in text and "/postmortem.json" in text:
        return True
    return False


def rewrite_text(text: str) -> tuple[str, dict[str, int]]:
    counts: dict[str, int] = {}
    updated = text
    for rule in RULES:
        updated, count = rule.pattern.subn(rule.replacement, updated)
        if count:
            counts[rule.name] = counts.get(rule.name, 0) + count
    return updated, counts


def read_text_file(path: Path) -> tuple[str | None, str | None]:
    if path.suffix and path.suffix not in TEXT_SUFFIXES:
        return None, "unsupported_suffix"
    try:
        return path.read_text(encoding="utf-8"), None
    except UnicodeDecodeError:
        return None, "non_utf8"
    except OSError as exc:
        return None, f"read_error:{exc}"


def build_report(
    *,
    data_root: Path,
    targets: list[Path],
    apply: bool,
    files_scanned: int,
    skipped: dict[str, int],
    changed_files: list[dict[str, Any]],
) -> dict[str, Any]:
    totals: dict[str, int] = {}
    for entry in changed_files:
        for name, count in entry["replacements"].items():
            totals[name] = totals.get(name, 0) + count
    return {
        "script": "rewrite_legacy_pr_run_paths.py",
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "mode": "apply" if apply else "dry_run",
        "data_root": str(data_root.resolve()),
        "targets": [str(target.resolve()) for target in targets],
        "files_scanned": files_scanned,
        "files_changed": len(changed_files),
        "total_replacements": sum(totals.values()),
        "replacement_counts": totals,
        "skipped": skipped,
        "rules": [
            {
                "name": rule.name,
                "description": rule.description,
                "pattern": rule.pattern.pattern,
                "replacement": rule.replacement,
            }
            for rule in RULES
        ],
        "changed_files": changed_files,
    }


def main() -> int:
    args = parse_args()
    data_root = args.data_root.resolve()
    targets = [resolve_target(target, data_root) for target in args.target] if args.target else default_targets(data_root)
    files = iter_target_files(targets, data_root)

    changed_files: list[dict[str, Any]] = []
    skipped: dict[str, int] = {}

    for path in files:
        text, reason = read_text_file(path)
        if reason:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        if text is None or not should_scan(text):
            continue
        updated, replacements = rewrite_text(text)
        if not replacements or updated == text:
            continue
        changed_files.append(
            {
                "path": rel(path, data_root),
                "replacements": replacements,
            }
        )
        if args.apply:
            path.write_text(updated, encoding="utf-8")

    report = build_report(
        data_root=data_root,
        targets=targets,
        apply=args.apply,
        files_scanned=len(files),
        skipped=skipped,
        changed_files=changed_files,
    )

    report_path: Path | None = None
    if not args.no_report and (args.apply or args.write_report):
        report_path = data_root / "runs" / "migrations" / now_id() / REPORT_NAME
        write_json(report_path, report)

    mode = "applied" if args.apply else "dry-run"
    print(
        f"{mode}: scanned {report['files_scanned']} files, "
        f"{report['files_changed']} files would change, "
        f"{report['total_replacements']} replacements"
    )
    for name, count in sorted(report["replacement_counts"].items()):
        print(f"  {name}: {count}")
    for entry in changed_files[: max(args.list_limit, 0)]:
        print(f"  {entry['path']}: {entry['replacements']}")
    if args.list_limit >= 0 and len(changed_files) > args.list_limit:
        print(f"  ... {len(changed_files) - args.list_limit} more files")
    if report_path:
        print(f"report: {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
