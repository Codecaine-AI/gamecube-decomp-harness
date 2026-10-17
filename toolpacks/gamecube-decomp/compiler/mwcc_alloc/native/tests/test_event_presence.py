"""Event presence on the fixture for the traced compilers that are present.

Every point the committed CAPABILITIES.json claims for a version (and every point whose sources link there, which
covers 1.1p1, whose points are withheld only for byte identity) must produce its events, and the fixture must compile
to the same object with tracing off, tracing on, and with the stock compiler. The C++ naming fixture (two overloads
of `Counter::step` and `Other::step`) must trace each function under its own mangled name, selected by `*`, by the
plain name and by one mangled name. Skips when the traced binaries
(MWCC_NATIVE_TRACED_ROOT, default /tmp/wcl-native/bin), the stock compilers or wibo are missing.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

NATIVE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("event_presence", NATIVE / "validate" / "event_presence.py")
event_presence = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = event_presence
spec.loader.exec_module(event_presence)

STOCK_ROOTS = [
    Path("/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/melee/workspace/repository/build/compilers/GC"),
    Path("/tmp/rmwcc/mwcc/build/compilers/GC"),
]
# (points whose hooks link from source per version, independent of the byte-identity verdict)
LINKED = {
    "1.2.5": ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame"],
    "1.2.5n": ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame"],
    "1.1p1": ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse"],
}


def test_markers_cover_every_check() -> None:
    markers = event_presence.marker_lines(event_presence.FIXTURE.read_text())
    assert {"decl-count", "decl-copy", "decl-scaled", "inline-helper", "cse", "call-extern", "coalesce",
            "decl-buf"} <= set(markers)
    assert {"decl-total", "decl-total2", "decl-sum"} <= set(event_presence.marker_lines(
        event_presence.CPP_FIXTURE.read_text()))
    assert set(event_presence.checks(markers)) == set(event_presence.POINTS)


@pytest.mark.parametrize("version", sorted(LINKED))
def test_claimed_points_fire_on_the_fixture(version: str) -> None:
    traced = Path(os.environ.get("MWCC_NATIVE_TRACED_ROOT", "/tmp/wcl-native/bin")) / version / "mwcceppc.exe"
    stock = next((root / version / "mwcceppc.exe" for root in STOCK_ROOTS if (root / version / "mwcceppc.exe").exists()),
                 None)
    wibo = next((Path(c) for c in event_presence.WIBO_CANDIDATES if c and Path(c).exists()), None)
    if not traced.exists() or stock is None or wibo is None:
        pytest.skip("needs the traced and stock compilers and wibo")
    committed = json.loads((NATIVE / "CAPABILITIES.json").read_text())["versions"][version]
    with tempfile.TemporaryDirectory(prefix=f"presence-{version}-") as out:
        report = event_presence.run(traced, version, wibo, Path(out), stock)
    assert report["identity"] == {"off_equals_on": True, "stock_equals_off": True}
    # (C++ overloads of one method name, and the same name in another class, keep their own mangled names)
    assert report["naming"] == {"ok": True}
    for point in set(LINKED[version]) | set(committed["points"]):
        assert report["points"][point]["ok"], (point, report["points"][point])
    assert not report["points"]["scheduling"]["ok"]
    if version == "1.1p1":
        assert not report["points"]["frame"]["ok"]
