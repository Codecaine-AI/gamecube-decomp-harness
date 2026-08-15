"""Locate the project checkout for tool-local helper scripts.

These tools live in `toolpacks/gamecube-decomp/_impl/gamecube/tools/`, not inside
the target checkout, so they can't derive the checkout from their own location.
`resolve_root()` finds it from, in order:

  1. ``$ORCH_GAME_REPO_ROOT`` explicit project binding.
  2. a walk up from the current directory for a ``build/GALE01`` marker.
  3. the current directory as a last resort.

The result is always absolute: a relative root (e.g. ``ORCH_GAME_REPO_ROOT=.``) leaves
mwcc ``-precompile`` output paths un-relativizable, which mwcc rejects with
OSErr -43.
"""

import os
from pathlib import Path
from typing import Optional

# A directory is a GameCube decomp checkout if it has the built object tree.
_MARKER = ("build", "GALE01")


def find_checkout(start: Optional[Path] = None) -> Optional[Path]:
    """Walk up from `start` (default: cwd) for a dir containing build/GALE01.
    Returns the checkout root, or None if none is found."""
    base = (start or Path.cwd()).resolve()
    for d in (base, *base.parents):
        if d.joinpath(*_MARKER).is_dir():
            return d
    return None


def resolve_root() -> Path:
    """Absolute path to the project checkout."""
    env = os.environ.get("ORCH_GAME_REPO_ROOT")
    if env:
        return Path(env).resolve()
    return (find_checkout() or Path.cwd()).resolve()
