#!/usr/bin/env python3
"""Migrate the past-PR corpus into the vertical-slice v2 layout."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pr_data_layout as layout


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SOURCE_ROOT.parent.parent / "_shared"))
from source_index import source_data_root  # type: ignore

DEFAULT_DATA_ROOT = source_data_root(SOURCE_ROOT)

RAW_NAMES = set(layout.RAW_FILE_MAP.values()) | {"diff.diff", "diff.err"}
EXTRACTED_NAMES = set(layout.EXTRACTED_FILES.values())
ROOT_METADATA_NAMES = {"counts.json", "activity.json", "manifest.json"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Move legacy data/current + data/prs artifacts into the PR vertical-slice v2 layout."
    )
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--skip-organize",
        action="store_true",
        help="Skip the final organize_pr_dump.py pass that refreshes slice manifests.",
    )
    return parser.parse_args()


def now_id() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalized_state(pr: dict[str, Any]) -> str:
    if pr.get("merged_at"):
        return "MERGED"
    state = str(pr.get("state") or "").upper()
    return state or "UNKNOWN"


def normalize_index_pr(pr: dict[str, Any]) -> dict[str, Any]:
    user = pr.get("user") if isinstance(pr.get("user"), dict) else {}
    login = user.get("login")
    return {
        "author": {
            "id": str(user.get("id")) if user.get("id") is not None else None,
            "is_bot": user.get("type") == "Bot" or (login or "").endswith("[bot]"),
            "login": login,
            "name": user.get("name"),
        },
        "closedAt": pr.get("closed_at"),
        "createdAt": pr.get("created_at"),
        "mergedAt": pr.get("merged_at"),
        "number": pr.get("number"),
        "state": normalized_state(pr),
        "title": pr.get("title"),
        "updatedAt": pr.get("updated_at"),
        "url": pr.get("html_url"),
    }


def same_file(src: Path, dest: Path) -> bool:
    return dest.exists() and src.is_file() and dest.is_file() and sha256(src) == sha256(dest)


class Migrator:
    def __init__(self, data_root: Path, *, dry_run: bool) -> None:
        self.data_root = data_root.resolve()
        self.dry_run = dry_run
        self.report_root = layout.runs_dir(self.data_root) / "migrations" / now_id()
        self.moved: list[dict[str, Any]] = []
        self.skipped_same: list[dict[str, str]] = []
        self.conflicts: list[dict[str, str]] = []
        self.indexed_pr_count = 0

    def rel(self, path: Path) -> str:
        try:
            return str(path.resolve().relative_to(self.data_root))
        except ValueError:
            return str(path)

    def move_file(self, src: Path, dest: Path) -> None:
        if not src.exists():
            return
        if src == dest:
            return
        before_hash = sha256(src)
        if dest.exists():
            if same_file(src, dest):
                if not self.dry_run:
                    src.unlink()
                self.skipped_same.append({"source": self.rel(src), "destination": self.rel(dest)})
                return
            self.conflicts.append({"source": self.rel(src), "destination": self.rel(dest)})
            return
        if self.dry_run:
            self.moved.append({"source": self.rel(src), "destination": self.rel(dest), "sha256": before_hash})
            return
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dest))
        after_hash = sha256(dest)
        if after_hash != before_hash:
            raise SystemExit(f"Checksum mismatch after moving {src} -> {dest}")
        self.moved.append({"source": self.rel(src), "destination": self.rel(dest), "sha256": before_hash})

    def move_tree_contents(self, src_dir: Path, dest_dir: Path) -> None:
        if not src_dir.exists():
            return
        for child in sorted(src_dir.iterdir()):
            dest = dest_dir / child.name
            if child.is_dir():
                self.move_tree_contents(child, dest)
                self.remove_empty_dir(child)
            else:
                self.move_file(child, dest)

    def remove_empty_dir(self, path: Path) -> None:
        if self.dry_run or not path.exists() or not path.is_dir():
            return
        for child in sorted(path.iterdir(), key=lambda item: len(item.parts), reverse=True):
            if child.is_dir():
                self.remove_empty_dir(child)
        if not any(path.iterdir()):
            path.rmdir()

    def migrate_current_root(self) -> None:
        current = self.data_root / "current"
        if not current.exists():
            return
        for child in sorted(current.iterdir()):
            if child.name in {"prs", "analysis"}:
                continue
            if child.is_file():
                self.move_file(child, self.data_root / child.name)
            elif child.is_dir():
                self.move_tree_contents(child, self.data_root / child.name)
                self.remove_empty_dir(child)

    def migrate_aggregate(self) -> None:
        legacy = self.data_root / "current" / "analysis"
        self.move_tree_contents(legacy, layout.aggregate_dir(self.data_root))
        self.remove_empty_dir(legacy)

    def migrate_library(self) -> None:
        prs_root = self.data_root / "prs"
        library_root = layout.library_dir(self.data_root)
        if not prs_root.exists():
            return
        for child in sorted(prs_root.iterdir()):
            if child.is_dir() and child.name.startswith("pr-"):
                old_postmortem = child / "postmortem.json"
                number_text = child.name.removeprefix("pr-")
                if number_text.isdigit():
                    self.move_file(
                        old_postmortem,
                        layout.postmortem_path(self.data_root, int(number_text)),
                    )
                continue
            if child.name == "runs" and child.is_dir():
                self.move_tree_contents(child, layout.runs_dir(self.data_root) / "postmortems")
                self.remove_empty_dir(child)
                continue
            if child.is_file():
                self.move_file(child, library_root / child.name)
            elif child.is_dir():
                self.move_tree_contents(child, library_root / child.name)
                self.remove_empty_dir(child)

    def migrate_pr_slices(self) -> None:
        legacy_prs = self.data_root / "current" / "prs"
        if not legacy_prs.exists():
            return
        for legacy_slice in sorted(legacy_prs.glob("pr-*")):
            number_text = legacy_slice.name.removeprefix("pr-")
            if not number_text.isdigit() or not legacy_slice.is_dir():
                continue
            number = int(number_text)
            dest_slice = layout.pr_slice_dir(self.data_root, number)
            for child in sorted(legacy_slice.iterdir()):
                if child.is_dir():
                    self.move_tree_contents(child, dest_slice / child.name)
                    self.remove_empty_dir(child)
                    continue
                if child.name in RAW_NAMES:
                    dest = layout.pr_raw_dir(self.data_root, number) / child.name
                elif child.name in EXTRACTED_NAMES:
                    dest = layout.pr_extracted_dir(self.data_root, number) / child.name
                elif child.name in ROOT_METADATA_NAMES:
                    dest = dest_slice / child.name
                else:
                    dest = dest_slice / "legacy" / child.name
                self.move_file(child, dest)
            self.remove_empty_dir(legacy_slice)
        self.remove_empty_dir(legacy_prs)

    def rebuild_pr_index(self) -> int:
        by_number: dict[int, dict[str, Any]] = {}
        existing = read_json(self.data_root / "prs.json", [])
        if isinstance(existing, list):
            for record in existing:
                if not isinstance(record, dict):
                    continue
                try:
                    by_number[int(record["number"])] = record
                except (KeyError, TypeError, ValueError):
                    continue
        for path in sorted((self.data_root / "prs").glob("pr-*/raw/pr.json")):
            raw = read_json(path, {})
            if not isinstance(raw, dict):
                continue
            try:
                number = int(raw.get("number") or path.parent.parent.name.removeprefix("pr-"))
            except ValueError:
                continue
            by_number[number] = normalize_index_pr(raw)
        records = sorted(
            by_number.values(),
            key=lambda pr: str(pr.get("mergedAt") or pr.get("updatedAt") or pr.get("createdAt") or ""),
            reverse=True,
        )
        if not self.dry_run:
            write_json(self.data_root / "prs.json", records)
        return len(records)

    def run_organizer(self) -> None:
        if self.dry_run:
            return
        index = self.data_root / "prs.json"
        if not index.exists():
            return
        subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "organize_pr_dump.py"), str(self.data_root)],
            check=True,
        )

    def finish(self) -> dict[str, Any]:
        self.remove_empty_dir(self.data_root / "current")
        report = {
            "schema_version": "past_pr_layout_migration_v1",
            "data_root": str(self.data_root),
            "dry_run": self.dry_run,
            "moved_count": len(self.moved),
            "skipped_same_count": len(self.skipped_same),
            "conflict_count": len(self.conflicts),
            "indexed_pr_count": self.indexed_pr_count,
            "moved": self.moved,
            "skipped_same": self.skipped_same,
            "conflicts": self.conflicts,
        }
        if not self.dry_run:
            write_json(self.report_root / "layout_migration_report.json", report)
        return report


def main() -> int:
    args = parse_args()
    migrator = Migrator(args.data_root, dry_run=args.dry_run)
    migrator.migrate_current_root()
    migrator.migrate_aggregate()
    migrator.migrate_library()
    migrator.migrate_pr_slices()
    indexed_pr_count = migrator.rebuild_pr_index()
    migrator.indexed_pr_count = indexed_pr_count
    if migrator.conflicts:
        report = migrator.finish()
        print(json.dumps(report, indent=2))
        raise SystemExit("Migration stopped because destination conflicts would overwrite data.")
    if not args.skip_organize:
        migrator.run_organizer()
    report = migrator.finish()
    print(
        f"migrated={report['moved_count']} "
        f"skipped_same={report['skipped_same_count']} "
        f"conflicts={report['conflict_count']} "
        f"indexed_prs={indexed_pr_count}"
    )
    if not args.dry_run:
        print(f"report={migrator.report_root / 'layout_migration_report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
