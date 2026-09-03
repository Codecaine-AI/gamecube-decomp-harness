"""Locate the project checkout for tool-local helper scripts.

These tools live in `toolpacks/gamecube-decomp/_impl/gamecube/tools/`, not inside
the target checkout, so they can't derive the checkout from their own location.
`resolve_root()` finds it from, in order:

  1. ``$ORCH_GAME_REPO_ROOT`` explicit project binding.
  2. a walk up from the current directory for a ``build/<build id>`` marker.
  3. the current directory as a last resort.

The build id (the objdiff build directory name under `build/`, e.g. Melee's
`GALE01` or Super Mario Sunshine's `GMSP01`) comes from ``$ORCH_GAME_BUILD_ID``,
defaulting to ``GALE01`` for backward compatibility with the existing Melee
sandbox image. Use `build_id()` wherever a script needs this segment instead of
hardcoding a literal.

The result is always absolute: a relative root (e.g. ``ORCH_GAME_REPO_ROOT=.``) leaves
mwcc ``-precompile`` output paths un-relativizable, which mwcc rejects with
OSErr -43.
"""

import os
from pathlib import Path
from typing import Optional

_DEFAULT_BUILD_ID = "GALE01"


def build_id() -> str:
    """The active game's objdiff build directory name under `build/`."""
    return os.environ.get("ORCH_GAME_BUILD_ID") or _DEFAULT_BUILD_ID


def _marker() -> tuple[str, str]:
    # A directory is a GameCube decomp checkout if it has the built object tree.
    return ("build", build_id())


def find_checkout(start: Optional[Path] = None) -> Optional[Path]:
    """Walk up from `start` (default: cwd) for a dir containing build/<build id>.
    Returns the checkout root, or None if none is found."""
    base = (start or Path.cwd()).resolve()
    marker = _marker()
    for d in (base, *base.parents):
        if d.joinpath(*marker).is_dir():
            return d
    return None


def resolve_root() -> Path:
    """Absolute path to the project checkout."""
    env = os.environ.get("ORCH_GAME_REPO_ROOT")
    if env:
        return Path(env).resolve()
    return (find_checkout() or Path.cwd()).resolve()
