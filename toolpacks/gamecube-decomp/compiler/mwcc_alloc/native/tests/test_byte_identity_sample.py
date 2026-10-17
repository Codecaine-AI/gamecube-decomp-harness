"""Byte-identity gate for traced MWCC compilers on a small fixed sample.

The sample tests run validate/byte_identity.py against the SMS and Melee
checkouts and skip when a checkout, the traced root
(MWCC_NATIVE_TRACED_ROOT, default /tmp/wcl-native/bin) or wibo is missing.
The parser test needs nothing external.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

NATIVE = Path(__file__).resolve().parents[1]
SCRIPT = NATIVE / "validate" / "byte_identity.py"
HARNESS = Path("/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness")
CHECKOUTS = {
    "sms": HARNESS / "games/sms/workspace/checkout",
    "melee": HARNESS / "games/melee/workspace/repository",
}
# (the versions the full sweep passed; 1.1p1 fails it, see VALIDATION.md and the known-failure test below)
VERSIONS = ("1.2.5", "1.2.5n")
SAMPLE = 3


def _load_module():
    spec = importlib.util.spec_from_file_location("byte_identity", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


byte_identity = _load_module()


def _traced_root() -> Path:
    return Path(os.environ.get("MWCC_NATIVE_TRACED_ROOT", "/tmp/wcl-native/bin"))


def _wibo(checkout: Path) -> Path | None:
    # SMS has no checkout wibo, and /tmp/rmwcc's wibo cannot run sjiswrap.exe,
    # so borrow Melee's when the checkout has none.
    for candidate in (
        os.environ.get("MWCC_NATIVE_WIBO"),
        checkout / "build/tools/wibo",
        CHECKOUTS["melee"] / "build/tools/wibo",
        "/tmp/rmwcc/mwcc/build/tools/wibo",
    ):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    return None


@pytest.mark.parametrize("game", sorted(CHECKOUTS))
def test_traced_compiler_is_byte_identical_on_sample(game: str) -> None:
    checkout = CHECKOUTS[game]
    if not (checkout / "build.ninja").is_file():
        pytest.skip(f"no checkout at {checkout}")
    traced_root = _traced_root()
    versions = [v for v in VERSIONS if (traced_root / v / "mwcceppc.exe").is_file()]
    if not versions:
        pytest.skip(f"no traced compilers under {traced_root}")
    wibo = _wibo(checkout)
    if wibo is None:
        pytest.skip("no wibo")

    out = Path(tempfile.mkdtemp(prefix=f"byte-identity-{game}-", dir="/tmp"))
    report_path = out / "report.json"
    result = subprocess.run(
        [
            sys.executable, "-I", str(SCRIPT),
            "--checkout", str(checkout),
            "--traced-root", str(traced_root),
            "--versions", ",".join(versions),
            "--sample", str(SAMPLE),
            "--wibo", str(wibo),
            "--out", str(out),
            "--json", str(report_path),
        ],
        capture_output=True,
        text=True,
        timeout=900,
    )
    assert report_path.is_file(), result.stdout + result.stderr
    report = json.loads(report_path.read_text())
    assert result.returncode == 0, result.stdout + result.stderr
    assert report["schema"] == "mwcc-native-byte-identity-v1"
    assert report["mismatches"] == []
    for version in versions:
        totals = report["totals"][version]
        compared = totals["units"] - totals["stock_failed"]
        assert totals["units"] == SAMPLE
        assert compared > 0
        assert totals["identical_off"] == totals["identical_on"] == compared
    shutil.rmtree(out, ignore_errors=True)


NINJA_FIXTURE = """\
# comment line
ninja_required_version = 1.3
mw_version = GC/1.3.2
cflags_base = -O4,p -i $
    include
cflags_cpp = ${cflags_base} -lang=c++
rule mwcc_sjis
  command = wibo $cflags -c $in -o $basedir
  depfile = $basefile.d
build build/a$ b.o | build/a.MAP: mwcc_sjis src/a$ b.c | $
    build/tools/sjiswrap.exe || pre-compile
  mw_version = GC/1.2.5
  cflags = $cflags_cpp -DX=$$HOME -pragma "cats off" $
      -DCOLON$:1
  basedir = build/a
build build/c.o: mwcc src/c.c
  cflags = $cflags_base -prefix $out_base.mch
build include/pch.mch: mwcc_pch include/pch.pch
  cflags = -lang=c++
"""


def test_parse_ninja_handles_continuations_escapes_and_nested_vars() -> None:
    ninja = byte_identity.parse_ninja(NINJA_FIXTURE)
    assert ninja.variables["cflags_cpp"] == "-O4,p -i include -lang=c++"

    first, second, pch = ninja.builds
    assert first.rule == "mwcc_sjis"
    assert first.outputs == ["build/a b.o", "build/a.MAP"]
    assert first.inputs == ["src/a b.c"]
    assert first.implicit == ["build/tools/sjiswrap.exe"]
    assert first.order_only == ["pre-compile"]
    assert first.variables["cflags"] == (
        '-O4,p -i include -lang=c++ -DX=$HOME -pragma "cats off" -DCOLON:1'
    )
    # Unknown variables expand to nothing, as in ninja.
    assert second.variables["cflags"] == "-O4,p -i include -prefix .mch"

    units, skipped, malformed = byte_identity.collect_units(ninja)
    assert [(u.out, u.mw_version) for u in units] == [
        ("build/a b.o", "GC/1.2.5"),
        ("build/c.o", "GC/1.3.2"),  # falls back to the top-level mw_version
    ]
    assert skipped == {"mwcc_pch": 1}
    assert malformed == []
    assert pch.inputs == ["include/pch.pch"]


def test_even_sample_is_deterministic_and_spread() -> None:
    items = list(range(10))
    assert byte_identity.even_sample(items, 3) == [0, 3, 6]
    assert byte_identity.even_sample(items, 20) == items


@pytest.mark.xfail(strict=True, reason="1.1p1 miscompiles msgbuf.c's frame (VALIDATION.md); "
                   "when this passes, rerun the full sweep and let 1.1p1 back into CAPABILITIES.json")
def test_known_1_1p1_msgbuf_mismatch() -> None:
    checkout = CHECKOUTS["melee"]
    traced = _traced_root() / "1.1p1" / "mwcceppc.exe"
    wibo = _wibo(checkout)
    if not (checkout / "build.ninja").is_file() or not traced.is_file() or wibo is None:
        pytest.skip("needs the Melee checkout, the traced 1.1p1 compiler and wibo")
    out = Path(tempfile.mkdtemp(prefix="byte-identity-msgbuf-", dir="/tmp"))
    result = subprocess.run(
        [sys.executable, "-I", str(SCRIPT), "--checkout", str(checkout), "--traced-root", str(_traced_root()),
         "--versions", "1.1p1", "--units", "*MetroTRK/msgbuf.o", "--wibo", str(wibo), "--out", str(out)],
        capture_output=True, text=True, timeout=300,
    )
    shutil.rmtree(out, ignore_errors=True)
    assert result.returncode == 0, result.stdout + result.stderr
