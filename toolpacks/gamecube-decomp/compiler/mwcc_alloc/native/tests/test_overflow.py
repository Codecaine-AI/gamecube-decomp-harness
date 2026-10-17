"""Overflow records: a trace that runs out of room says what it dropped.

Runs validate/overflow_check.py: the small-limit test build (build.sh writes it to
<out>/test-builds/small-limits/<ver>/; MWCC_NATIVE_SMALL_LIMITS_ROOT, default /tmp/wcl-native/build-out/test-builds/
small-limits) must write an overflow record for every trace table on the fixtures without changing the objects, and
the traced build (MWCC_NATIVE_TRACED_ROOT, default /tmp/wcl-native/bin) must write none. Skips when either build or
wibo is missing.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
from pathlib import Path

import pytest

NATIVE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NATIVE / "validate"))
spec = importlib.util.spec_from_file_location("overflow_check", NATIVE / "validate" / "overflow_check.py")
overflow_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overflow_check)


def test_every_table_reports_its_overflow() -> None:
    small_root = Path(os.environ.get("MWCC_NATIVE_SMALL_LIMITS_ROOT",
                                     "/tmp/wcl-native/build-out/test-builds/small-limits"))
    traced_root = Path(os.environ.get("MWCC_NATIVE_TRACED_ROOT", "/tmp/wcl-native/bin"))
    version = next((v for v in ("1.2.5n", "1.2.5") if (small_root / v / "mwcceppc.exe").is_file()), None)
    wibo = next((Path(c) for c in overflow_check.event_presence.WIBO_CANDIDATES if c and Path(c).exists()), None)
    if version is None or not (traced_root / version / "mwcceppc.exe").is_file() or wibo is None:
        pytest.skip("needs the small-limit test build, the traced build and wibo")
    with tempfile.TemporaryDirectory(prefix="overflow-") as out:
        report = overflow_check.check(small_root / version / "mwcceppc.exe", traced_root / version / "mwcceppc.exe",
                                      version, wibo, Path(out))
    assert report["ok"], report.get("problems")
    assert report["overflow_kinds"] == sorted(overflow_check.KINDS)
