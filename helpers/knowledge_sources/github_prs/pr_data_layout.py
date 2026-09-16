#!/usr/bin/env python3
"""Path helpers for the past-PR vertical-slice corpus layout."""

from __future__ import annotations

from pathlib import Path


RAW_FILE_MAP = {
    "pr": "pr.json",
    "issue_comments": "issue_comments.json",
    "review_comments": "review_comments.json",
    "reviews": "reviews.json",
}

EXTRACTED_FILES = {
    "text_corpus": "text_corpus.jsonl",
    "changed_files": "changed_files.jsonl",
    "diff_lines": "diff_lines.jsonl",
    "human_pr_text": "human_pr_text.md",
    "review_comments": "review_comments.md",
}


def aggregate_dir(data_root: Path) -> Path:
    return data_root / "aggregate"


def library_dir(data_root: Path) -> Path:
    return data_root / "library"


def runs_dir(data_root: Path) -> Path:
    return data_root / "runs"


def pr_slice_dir(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return data_root / prs_dir / f"pr-{number}"


def pr_raw_dir(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_slice_dir(data_root, number, prs_dir) / "raw"


def pr_extracted_dir(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_slice_dir(data_root, number, prs_dir) / "extracted"


def pr_postmortem_dir(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_slice_dir(data_root, number, prs_dir) / "postmortem"


def raw_json_path(data_root: Path, number: int, kind: str, prs_dir: str = "prs") -> Path:
    return pr_raw_dir(data_root, number, prs_dir) / RAW_FILE_MAP[kind]


def diff_path(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_raw_dir(data_root, number, prs_dir) / "diff.diff"


def diff_error_path(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_raw_dir(data_root, number, prs_dir) / "diff.err"


def extracted_path(data_root: Path, number: int, filename: str, prs_dir: str = "prs") -> Path:
    return pr_extracted_dir(data_root, number, prs_dir) / filename


def postmortem_path(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_postmortem_dir(data_root, number, prs_dir) / "postmortem.json"


def legacy_flat_raw_json_path(data_root: Path, number: int, kind: str) -> Path:
    return data_root / "raw" / f"{number}_{kind}.json"


def legacy_flat_diff_path(data_root: Path, number: int) -> Path:
    return data_root / "diffs" / f"{number}.diff"


def legacy_flat_diff_error_path(data_root: Path, number: int) -> Path:
    return data_root / "diffs" / f"{number}.diff.err"


def legacy_direct_raw_json_path(data_root: Path, number: int, kind: str, prs_dir: str = "prs") -> Path:
    return pr_slice_dir(data_root, number, prs_dir) / RAW_FILE_MAP[kind]


def legacy_direct_diff_path(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_slice_dir(data_root, number, prs_dir) / "diff.diff"


def legacy_direct_diff_error_path(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_slice_dir(data_root, number, prs_dir) / "diff.err"


def legacy_postmortem_path(data_root: Path, number: int, prs_dir: str = "prs") -> Path:
    return pr_slice_dir(data_root, number, prs_dir) / "postmortem.json"


def candidate_raw_json_paths(data_root: Path, number: int, kind: str, prs_dir: str = "prs") -> list[Path]:
    return [
        raw_json_path(data_root, number, kind, prs_dir),
        legacy_direct_raw_json_path(data_root, number, kind, prs_dir),
        legacy_flat_raw_json_path(data_root, number, kind),
    ]


def candidate_diff_paths(data_root: Path, number: int, prs_dir: str = "prs") -> list[Path]:
    return [
        diff_path(data_root, number, prs_dir),
        legacy_direct_diff_path(data_root, number, prs_dir),
        legacy_flat_diff_path(data_root, number),
    ]


def candidate_diff_error_paths(data_root: Path, number: int, prs_dir: str = "prs") -> list[Path]:
    return [
        diff_error_path(data_root, number, prs_dir),
        legacy_direct_diff_error_path(data_root, number, prs_dir),
        legacy_flat_diff_error_path(data_root, number),
    ]


def existing_path(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def has_complete_raw_slice(data_root: Path, number: int, prs_dir: str = "prs") -> bool:
    return all(
        existing_path(candidate_raw_json_paths(data_root, number, kind, prs_dir)) is not None
        for kind in RAW_FILE_MAP
    ) and existing_path(candidate_diff_paths(data_root, number, prs_dir)) is not None
