#!/usr/bin/env python3
"""Registered-tool entry point for `unused_stub_test`.

Runs `steering_check.py unused-test` (the UNUSED stub test for one function)
in the worker sandbox, cwd = the sandbox checkout. The checkout is never
written: the candidate and its stubbed copy compile in shadow roots under
/tmp (steering_check.ShadowCompiler), and ninja_compile's caches (parsed
build edges, extab-clean objects) go to $NINJA_COMPILE_CACHE_DIR, which this
entry point sets to a per-checkout temp dir unless the caller set it.
All logic lives in _impl/gamecube/tools/steering_check.py.

Extra flag: `--timeout-seconds N` caps each MWCC compile
(ORCH_MWCC_COMPILE_TIMEOUT); the harness also uses it for the exec timeout.
"""

from __future__ import annotations

import hashlib
import os
import sys
import tempfile
from pathlib import Path

TOOLPACK_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(TOOLPACK_ROOT / "_impl" / "gamecube" / "tools"))

import steering_check  # type: ignore  # noqa: E402


def split_timeout(argv: list[str]) -> tuple[list[str], str | None]:
    """Remove `--timeout-seconds N` from argv; return the rest and N."""
    rest: list[str] = []
    timeout: str | None = None
    i = 0
    while i < len(argv):
        if argv[i] == "--timeout-seconds" and i + 1 < len(argv):
            timeout = argv[i + 1]
            i += 2
            continue
        rest.append(argv[i])
        i += 1
    return rest, timeout


def cache_dir_for(argv: list[str]) -> Path:
    """A ninja_compile cache dir outside the checkout, one per checkout path."""
    repo = "."
    for i, arg in enumerate(argv[:-1]):
        if arg == "--repo":
            repo = argv[i + 1]
    key = hashlib.sha256(str(Path(repo).resolve()).encode()).hexdigest()[:16]
    return Path(tempfile.gettempdir()) / "ninja-compile-cache" / key


def main(argv: list[str] | None = None) -> int:
    args, timeout = split_timeout(list(sys.argv[1:] if argv is None else argv))
    if timeout is not None:
        os.environ["ORCH_MWCC_COMPILE_TIMEOUT"] = timeout
    # Before ninja_compile is imported (stack_check.Repo imports it lazily).
    os.environ.setdefault("NINJA_COMPILE_CACHE_DIR", str(cache_dir_for(args)))
    return steering_check.main(["unused-test", *args])


if __name__ == "__main__":
    sys.exit(main())
