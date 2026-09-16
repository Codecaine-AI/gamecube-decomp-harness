"""Shared fixtures for the source_fidelity slice tests.

Imports the review_lint engine (which loads every slice, including this one)
and exposes the slice module plus a small hunk builder.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import pytest

SLICE_DIR = Path(__file__).resolve().parents[1]
STANDARDS_DIR = SLICE_DIR.parent


def _find_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "package.json").is_file() and (candidate / "games").is_dir():
            return candidate
    raise RuntimeError(f"orchestrator root not found from {start}")


ROOT = _find_root(SLICE_DIR)
API_DIR = ROOT / "toolpacks" / "gamecube-decomp" / "source_editing" / "review_lint" / "api"
sys.path.insert(0, str(API_DIR))
os.environ.setdefault("REVIEW_LINT_STANDARDS_DIR", str(STANDARDS_DIR))

import _qa_rules  # noqa: E402

rules = sys.modules["_review_lint_slice_source_fidelity"]


def make_hunk(
    added: str,
    removed: str = "",
    file: str = "src/Enemy/foo.cpp",
    post: str | None = None,
    start: int = 10,
) -> dict[str, Any]:
    """Build a hunk dict; ``added`` lines are numbered from ``start``.

    When ``post`` is None the post-file text is the added text itself (so
    the added line numbers line up with the whole-file view).
    """

    added_lines = added.strip("\n").splitlines()
    if post is None:
        post_lines = [""] * (start - 1) + added_lines
        post_text = "\n".join(post_lines) + "\n"
    else:
        post_text = post
    return {
        "file": file,
        "added": [(start + i, line) for i, line in enumerate(added_lines)],
        "removed": removed.strip("\n").splitlines() if removed else [],
        "post_file_text": post_text,
    }


def make_repo(tmp_path: Path, headers: dict[str, str]) -> Path:
    for rel, text in headers.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp_path


@pytest.fixture
def forced_root(monkeypatch):
    """Context: point header lookups at a temp repo via the env hint."""

    def _set(root: Path) -> None:
        monkeypatch.setenv(rules.REPO_ROOT_ENV, str(root))
        rules._INCLUDE_INDEX.clear()

    yield _set
    rules._INCLUDE_INDEX.clear()


def run(rule_id: str, hunk: dict[str, Any], surface: str | None = None) -> list[dict[str, Any]]:
    rule = next(r for r in _qa_rules.RULES if r["rule_id"] == rule_id)
    return _qa_rules.run_rules_on_hunk([rule], hunk, surface=surface)
