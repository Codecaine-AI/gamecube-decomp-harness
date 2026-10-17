#!/usr/bin/env python3
"""Report which `real_code_evidence` data sources this host has."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

TOOLPACK_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(TOOLPACK_ROOT / "_impl" / "gamecube" / "tools"))

import evidence_search  # type: ignore  # noqa: E402


def _compiler_source(repo: Path | None) -> dict:
    found = evidence_search.compiler_ref.resolve_root(repo=repo)
    if found is None:
        return {"available": False, "pin": evidence_search.compiler_ref.lock().get("commit")}
    return {"available": True, "root": str(found["root"]), "origin": found["origin"],
            "commit": found["commit"], "pinned": found["pinned"]}


def build_payload(repo: Path | None) -> dict:
    refs = evidence_search.default_refs_root()
    payload: dict = {
        "tool": "real_code_evidence",
        "repo": str(repo) if repo else None,
        "jsystem_refs": {game: bool(refs and (refs / game).is_dir()) for game in evidence_search.JSYSTEM_GAMES},
        "compiler_source": _compiler_source(repo),
    }
    if repo is None or not repo.is_dir():
        return {**payload, "available": False, "status": "repo_missing"}
    version = evidence_search.detect_version(repo)
    link_map = evidence_search.find_map(repo, version)
    payload.update({
        "version": version,
        "link_map": str(link_map) if link_map else None,
        "symbols": (repo / "config" / version / "symbols.txt").is_file(),
        "report": (repo / "build" / version / "report.json").is_file(),
    })
    return {**payload, "available": True, "status": "ready"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    payload = build_payload(args.repo_root or evidence_search.default_repo())
    print(json.dumps(payload, indent=None if args.json else 2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
