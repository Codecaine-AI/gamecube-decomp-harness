#!/usr/bin/env python3
"""The pinned MWCC compiler source (rayanht/mwcc): where it is, and search.

`evidence_search.py compiler` uses this module. The source is reference data:
a decompilation of `mwcceppc.exe` covering every GameCube version the games
use. Workers read it to explain a codegen difference (why a value took a
register, why an inline stayed a call, where a CSE temp came from); an
explanation is a diagnosis, not evidence for a source spelling.

Search roots, first pinned one wins (else the first that exists):

  1. --compiler-root / $ORCH_MWCC_SOURCE_ROOT (explicit override)
  2. /opt/mwcc, the sandbox image copy (fetch_mwcc_ref.sh --strip-git /opt/mwcc)
  3. <checkout>/../mwcc, the upstream convention; sandboxes link it to /opt/mwcc
  4. $ORCH_GAME_STATE_DIR/refs/mwcc, the host ref (fetch_mwcc_ref.sh)

The pin is `mwcc_ref.lock.json`. A root's commit comes from its `.mwcc-ref`
stamp (written by fetch_mwcc_ref.sh) or its `.git` HEAD.
"""

from __future__ import annotations

import fnmatch
import json
import os
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

TOOLS_DIR = Path(__file__).resolve().parent
LOCK_PATH = TOOLS_DIR / "mwcc_ref.lock.json"
FETCH_SCRIPT = TOOLS_DIR / "fetch_mwcc_ref.sh"
SANDBOX_ROOT = Path("/opt/mwcc")
STAMP_NAME = ".mwcc-ref"
SOURCE_SUFFIXES = (".c", ".h", ".cpp", ".hpp", ".inc")
TEXT_MAX = 240
# Total characters of hit text and context per answer, so the pretty-printed
# tool result stays under the 24k tool-output cap; hits past it are counted, not shown.
OUTPUT_BUDGET = 10000


def lock(path: Path = LOCK_PATH) -> Dict[str, Any]:
    try:
        return dict(json.loads(path.read_text(encoding="utf-8")).get("mwcc") or {})
    except (OSError, json.JSONDecodeError):
        return {}


def ref_commit(root: Path) -> Optional[str]:
    """The commit a source root holds: its fetch stamp, else its .git HEAD."""
    try:
        stamp = json.loads((root / STAMP_NAME).read_text(encoding="utf-8"))
        if isinstance(stamp, dict) and stamp.get("commit"):
            return str(stamp["commit"])
    except (OSError, json.JSONDecodeError):
        pass
    git = root / ".git"
    if git.is_file():  # worktree: "gitdir: <path>"
        try:
            text = git.read_text(encoding="utf-8").strip()
            if text.startswith("gitdir:"):
                git = (root / text[7:].strip()).resolve()
        except OSError:
            return None
    return _git_head(git)


def _git_head(git_dir: Path) -> Optional[str]:
    try:
        text = (git_dir / "HEAD").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not text.startswith("ref:"):
        return text or None
    ref = text[4:].strip()
    try:
        return (git_dir / ref).read_text(encoding="utf-8").strip() or None
    except OSError:
        pass
    try:
        for line in (git_dir / "packed-refs").read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1] == ref:
                return parts[0]
    except OSError:
        pass
    return None


def candidate_roots(explicit: Optional[Path] = None, repo: Optional[Path] = None) -> List[Tuple[str, Path]]:
    """Search roots in priority order, as (origin, path); existence is not checked."""
    roots: List[Tuple[str, Path]] = []
    if explicit is not None:
        roots.append(("explicit", Path(explicit).expanduser()))
    env = os.environ.get("ORCH_MWCC_SOURCE_ROOT")
    if env:
        roots.append(("env", Path(env).expanduser()))
    roots.append(("sandbox", SANDBOX_ROOT))
    if repo is not None:
        roots.append(("checkout_sibling", Path(repo).expanduser().parent / "mwcc"))
    state = os.environ.get("ORCH_GAME_STATE_DIR")
    if state:
        roots.append(("host_ref", Path(state) / "refs" / "mwcc"))
    return roots


def resolve_root(explicit: Optional[Path] = None, repo: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """The root to search: the first pinned candidate, else the first present one."""
    pin = lock().get("commit")
    present: List[Dict[str, Any]] = []
    for origin, path in candidate_roots(explicit, repo):
        if not (path / "src").is_dir():
            continue
        commit = ref_commit(path)
        found = {"root": path, "origin": origin, "commit": commit, "pinned": bool(pin) and commit == pin}
        if found["pinned"]:
            return found
        present.append(found)
    return present[0] if present else None


def _source_files(root: Path, path_filter: Optional[str]) -> Iterator[Tuple[str, Path]]:
    # src/ before include/: definitions first.
    for top in ("src", "include"):
        base = root / top
        if not base.is_dir():
            continue
        for directory, dirnames, filenames in os.walk(base):
            dirnames.sort()
            for name in sorted(filenames):
                if not name.lower().endswith(SOURCE_SUFFIXES):
                    continue
                path = Path(directory) / name
                rel = path.relative_to(root).as_posix()
                if path_filter and not _path_matches(rel, path_filter):
                    continue
                yield rel, path


def _path_matches(rel: str, pattern: str) -> bool:
    pattern = pattern.strip().lstrip("./")
    if any(ch in pattern for ch in "*?["):
        return fnmatch.fnmatch(rel, pattern)
    # A bare file name matches anywhere (Coloring.c); a path is a prefix.
    if "/" not in pattern:
        return rel.rsplit("/", 1)[-1] == pattern or rel.startswith(pattern + "/")
    return rel.startswith(pattern)


def search(
    query: str,
    *,
    root: Optional[Path] = None,
    repo: Optional[Path] = None,
    path: Optional[str] = None,
    limit: int = 20,
    per_file: int = 5,
    context: int = 0,
) -> Dict[str, Any]:
    """Literal search (case-sensitive, then case-folded when nothing matched).

    Without a path filter each file shows at most `per_file` hits, so a common
    term lists several files; with one, hits follow `limit` alone.
    """
    if path:
        per_file = limit
    pinned = lock()
    hint = f"bash {FETCH_SCRIPT} [--strip-git] <dest>  (host: $ORCH_GAME_STATE_DIR/refs/mwcc; image: /opt/mwcc)"
    found = resolve_root(root, repo)
    base: Dict[str, Any] = {"query": query, "path": path, "pin": pinned.get("commit"), "repo_url": pinned.get("repo")}
    if found is None:
        return {
            "available": False, **base, "hits": [], "total": 0,
            "searched": [str(p) for _, p in candidate_roots(root, repo)], "fetch_hint": hint,
        }
    source: Path = found["root"]
    hits: List[Dict[str, Any]] = []
    file_counts: Dict[str, int] = {}
    total = 0
    budget = OUTPUT_BUDGET
    case_sensitive = True
    for case_sensitive in (True, False):
        needle = query if case_sensitive else query.lower()
        for rel, file_path in _source_files(source, path):
            try:
                lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            shown_here = 0
            for number, line in enumerate(lines, 1):
                haystack = line if case_sensitive else line.lower()
                if needle not in haystack:
                    continue
                total += 1
                file_counts[rel] = file_counts.get(rel, 0) + 1
                if len(hits) >= limit or shown_here >= per_file or budget <= 0:
                    continue
                hit: Dict[str, Any] = {"file": rel, "line": number, "text": line.strip()[:TEXT_MAX]}
                if context:
                    lo, hi = max(0, number - 1 - context), min(len(lines), number + context)
                    hit["context"] = "\n".join(text[:TEXT_MAX] for text in lines[lo:hi])
                budget -= len(hit["text"]) + len(hit.get("context", ""))
                hits.append(hit)
                shown_here += 1
        if total:
            break
    top_files = sorted(file_counts.items(), key=lambda item: (-item[1], item[0]))[:20]
    result: Dict[str, Any] = {
        "available": True,
        **base,
        "root": str(source),
        "origin": found["origin"],
        "commit": found["commit"],
        "pinned": found["pinned"],
        "case_sensitive": case_sensitive,
        "hits": hits,
        "shown": len(hits),
        "total": total,
        "files": [{"file": name, "hits": count} for name, count in top_files],
        "files_total": len(file_counts),
    }
    if len(hits) < total:
        result["truncated"] = True
        result["note"] = "More hits than shown: narrow with path (e.g. src/backend/Coloring.c) or a longer query."
    if not found["pinned"]:
        result["pin_warning"] = (
            f"{source} is at {found['commit'] or 'an unknown commit'}, not the pinned "
            f"{pinned.get('commit')}; line numbers may differ. Fetch the pin: {hint}"
        )
    return result
