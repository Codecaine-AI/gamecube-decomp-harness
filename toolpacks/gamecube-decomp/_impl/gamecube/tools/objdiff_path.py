"""Resolve the path to an objdiff-cli binary.

Resolution order:
  1. $OBJDIFF_CLI                              explicit override
  2. <project state>/tools/objdiff-cli-3.6.1-score/objdiff-cli
                                                 patched score-server build
  3. <project>/build/tools/objdiff-cli         normal project tool artifact
  4. <tool impl>/bin/objdiff-cli               optional tool-local install
  5. <tool impl>/objdiff/target/release/objdiff-cli
  6. objdiff-cli on PATH                       last-resort fallback
"""

import os
import shutil
from pathlib import Path

_IMPL_ROOT = Path(__file__).resolve().parents[1]


def _repo_root() -> Path:
    env = os.environ.get("ORCH_GAME_REPO_ROOT")
    return Path(env).resolve() if env else Path.cwd().resolve()


def objdiff_cli() -> str:
    override = os.environ.get("OBJDIFF_CLI")
    if override:
        return override

    candidates = []
    state_dir = os.environ.get("ORCH_GAME_STATE_DIR")
    if state_dir:
        candidates.append(
            Path(state_dir).resolve()
            / "tools"
            / "objdiff-cli-3.6.1-score"
            / "objdiff-cli"
        )
    candidates.extend((
        _repo_root() / "build" / "tools" / "objdiff-cli",
        _IMPL_ROOT / "bin" / "objdiff-cli",
        _IMPL_ROOT / "objdiff" / "target" / "release" / "objdiff-cli",
    ))
    for cand in candidates:
        if cand.is_file():
            return str(cand)
    found = shutil.which("objdiff-cli")
    if found:
        return found
    raise SystemExit(
        "objdiff-cli not found. Run `ninja tools` in the project checkout "
        "or set $OBJDIFF_CLI to an existing binary."
    )
