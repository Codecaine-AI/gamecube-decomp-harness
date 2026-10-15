#!/usr/bin/env python3
"""Registered-tool entry point for `real_code_evidence`.

Runs host-side. The game checkout is the host checkout from
$ORCH_GAME_HOST_REPO_ROOT (the worker's own ORCH_GAME_REPO_ROOT points at its
sandbox path), falling back to $ORCH_GAME_REPO_ROOT. All logic lives in
_impl/gamecube/tools/evidence_search.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

TOOLPACK_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(TOOLPACK_ROOT / "_impl" / "gamecube" / "tools"))

import evidence_search  # type: ignore  # noqa: E402

if __name__ == "__main__":
    sys.exit(evidence_search.main())
