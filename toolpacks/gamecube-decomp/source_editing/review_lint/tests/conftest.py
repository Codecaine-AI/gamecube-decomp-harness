"""Shared paths and helpers for review_lint QA gate tests."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
REVIEW_LINT_DIR = TESTS_DIR.parent
API_DIR = REVIEW_LINT_DIR / "api"


def find_orchestrator_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "package.json").is_file() and (candidate / "games").is_dir():
            return candidate
    raise RuntimeError(f"Unable to find orchestrator root from {start}")


ORCHESTRATOR_ROOT = find_orchestrator_root(REVIEW_LINT_DIR)
MELEE_GAME = ORCHESTRATOR_ROOT / "games" / "melee"
MELEE_DESCRIPTOR = json.loads((MELEE_GAME / "game.json").read_text())
MELEE_CHECKOUT = (MELEE_GAME / MELEE_DESCRIPTOR.get("repoRoot", "workspace/checkout")).resolve()
FIXTURES_DIR = TESTS_DIR / "fixtures"
SCAN_DIFF = API_DIR / "scan_diff.py"

sys.path.insert(0, str(API_DIR))


@pytest.fixture(scope="session")
def melee_checkout() -> Path:
    if not (MELEE_CHECKOUT / "config" / "GALE01" / "splits.txt").is_file():
        pytest.skip(f"melee checkout not available at {MELEE_CHECKOUT}")
    return MELEE_CHECKOUT


@pytest.fixture(scope="session")
def historical_ownership_checkout(melee_checkout: Path, tmp_path_factory) -> Path:
    """Use the rejected PR era's ownership metadata with the source fixtures."""
    root = tmp_path_factory.mktemp("review-lint-ownership")
    config = root / "config" / "GALE01"
    config.mkdir(parents=True)
    for name in ("symbols.txt", "splits.txt"):
        (config / name).write_bytes((FIXTURES_DIR / "ownership-pr2656" / name).read_bytes())
    (root / "src").symlink_to(melee_checkout / "src", target_is_directory=True)
    return root
