"""Locate the project checkout for tool-local helper scripts.

These tools live in `toolpacks/gamecube-decomp/_impl/gamecube/tools/`, not inside
the target checkout, so they can't derive the checkout from their own location.
`resolve_root()` finds it from, in order:

  1. ``$ORCH_GAME_REPO_ROOT`` explicit project binding.
  2. a walk up for GameCube decomp project metadata.
  3. the current directory as a last resort.

The result is always absolute: a relative root (e.g. ``ORCH_GAME_REPO_ROOT=.``) leaves
mwcc ``-precompile`` output paths un-relativizable, which mwcc rejects with
OSErr -43.
"""

import os
from pathlib import Path
from typing import Optional

def find_checkout(start: Optional[Path] = None) -> Optional[Path]:
    """Walk up from `start` (default: cwd) for configured build metadata.
    Returns the checkout root, or None if none is found."""
    base = (start or Path.cwd()).resolve()
    for d in (base, *base.parents):
        if (
            (d / "build.ninja").is_file()
            or (d / "objdiff.json").is_file()
            or any((d / "build").glob("*/report.json"))
        ):
            return d
    return None


def resolve_root() -> Path:
    """Absolute path to the project checkout."""
    env = os.environ.get("ORCH_GAME_REPO_ROOT")
    if env:
        return Path(env).resolve()
    return (find_checkout() or Path.cwd()).resolve()


def report_path(root: Path) -> Path:
    """Resolve the selected game's report without assuming a build version."""
    configured = os.environ.get("ORCH_GAME_REPORT_PATH")
    if configured:
        path = Path(configured).expanduser()
        return path if path.is_absolute() else root / path
    if os.environ.get("ORCH_GAME_ID"):
        raise ValueError(
            "Selected game requires ORCH_GAME_REPORT_PATH "
            "(tool binding or image environment)"
        )
    from project_layout import get_project_layout

    return get_project_layout(root).report_path


def reference_object_root(root: Path) -> Path:
    """Default objdiff reference layout is beside the configured report."""
    configured = os.environ.get("ORCH_GAME_REFERENCE_OBJECT_ROOT")
    if configured:
        path = Path(configured).expanduser()
        return path if path.is_absolute() else root / path
    from project_layout import get_project_layout

    return get_project_layout(root).obj_root
