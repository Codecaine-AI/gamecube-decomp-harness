"""byte_identity.py rebuilds precompiled headers instead of reading the build tree's.

SMS units compile with `-prefix SMS.mch`; a stale build/GMSJ01/include/SMS.mch made
42 SMS 1.2.5 units fail (`macro 'RAD_TO_DEG' redefined`) for both compilers. The sweep
now builds the PCH with each compiler and searches it first. The fixture test needs
nothing external; the real test skips without the SMS checkout, traced root or wibo.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

NATIVE = Path(__file__).resolve().parents[1]
SCRIPT = NATIVE / "validate" / "byte_identity.py"
HARNESS = Path("/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness")
SMS = Path(os.environ.get("SMS_CHECKOUT", HARNESS / "games/sms/workspace/checkout"))


def _load():
    spec = importlib.util.spec_from_file_location("byte_identity_pch", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bi = _load()

FLAGS = "-lang=c++ -cwd source -i include -i libs/JSystem/include -i build/GMSJ01/include -DGEKKO"


def _ninja(root: Path) -> str:
    return (
        "rule mwcc_pch_sjis\n  command = x\n"
        f"build $\n    {root}/build/GMSJ01/include/SMS.mch: $\n    mwcc_pch_sjis include/SMS.pch | $\n"
        "    build/compilers/$mw_version/mwcceppc.exe build/tools/sjiswrap.exe\n"
        f"  mw_version = GC/1.2.5\n  cflags = {FLAGS}\n"
        "build build/GMSJ01/src/Camera/cameragc.o: mwcc_sjis src/Camera/cameragc.cpp $\n"
        "    | build/compilers/$mw_version/mwcceppc.exe || pre-compile\n"
        f"  mw_version = GC/1.2.5\n  cflags = {FLAGS} -prefix SMS.mch\n"
    )


def test_pch_is_built_per_compiler_and_searched_first(tmp_path: Path) -> None:
    root = tmp_path / "checkout"
    (root / "include").mkdir(parents=True)
    (root / "include/SMS.pch").write_text("#include <math.h>\n")
    # Fake runner: records argv, writes `-o <dir>`/<-precompile name> naming its compiler.
    runner = tmp_path / "wibo"
    runner.write_text(
        "#!/usr/bin/env python3\nimport sys, os\na = sys.argv[1:]\n"
        "open(os.environ['LOG'], 'a').write(' '.join(a) + '\\n')\n"
        "out = a[a.index('-o') + 1]; name = a[a.index('-precompile') + 1]\n"
        "compiler = [x for x in a if x.endswith('mwcceppc.exe')][0]\n"
        "open(os.path.join(out, name), 'w').write(compiler)\n"
    )
    runner.chmod(0o755)
    log = tmp_path / "log"
    ninja = bi.parse_ninja(_ninja(root))
    units, skipped, _ = bi.collect_units(ninja)
    assert [u.out for u in units] == ["build/GMSJ01/src/Camera/cameragc.o"]
    assert skipped == {"mwcc_pch_sjis": 1}
    ctx = bi.Context(root, tmp_path / "traced", runner, tmp_path / "work", tmp_path / "out", False, 30.0,
                     dict(os.environ, LOG=str(log)))
    record = bi.prepare_pchs(ctx, ninja, units)

    assert record["SMS.mch"]["stock"]["ok"] and record["SMS.mch"]["traced"]["ok"]
    calls = log.read_text().splitlines()
    assert len(calls) == 2 and all("sjiswrap.exe" in call and "-c include/SMS.pch" in call for call in calls)
    stock_dir, traced_dir = ctx.pch_dirs[("stock", "SMS.mch")], ctx.pch_dirs[("traced", "SMS.mch")]
    assert "build/compilers/GC/1.2.5" in (Path(stock_dir) / "SMS.mch").read_text()
    assert str(tmp_path / "traced/1.2.5") in (Path(traced_dir) / "SMS.mch").read_text()

    tail = units[0].cflags.split() + ["-c", units[0].src]
    flags = bi._with_pch(ctx, tail, "traced")
    at = flags.index(traced_dir)
    assert flags[at - 1] == "-i" and flags[at + 1:at + 3] == ["-i", "build/GMSJ01/include"]
    assert bi._with_pch(ctx, ["-O4", "-i", "include"], "stock") == ["-O4", "-i", "include"]


def _wibo() -> Path | None:
    for candidate in (os.environ.get("MWCC_NATIVE_WIBO"), SMS / "build/tools/wibo",
                      HARNESS / "games/melee/workspace/repository/build/tools/wibo"):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    return None


TRACED = Path(os.environ.get("MWCC_NATIVE_TRACED_ROOT", "/tmp/wcl-native/bin"))


@pytest.mark.skipif(not (SMS / "build.ninja").is_file() or _wibo() is None
                    or not (TRACED / "1.2.5/mwcceppc.exe").is_file(),
                    reason="needs the SMS checkout, a wibo and the traced root")
def test_sms_units_that_read_the_pch_compile_and_stay_identical(tmp_path: Path) -> None:
    out = Path("/tmp") / f"bi-pch-{os.getpid()}"
    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--checkout", str(SMS), "--traced-root", str(TRACED),
             "--versions", "1.2.5", "--units", "*/Camera/cameragc.o,*/GC2D/ConsoleStr.o",
             "--out", str(out), "--jobs", "2", "--wibo", str(_wibo())],
            capture_output=True, text=True, timeout=600,
        )
        report = json.loads((out / "byte_identity.json").read_text())
    finally:
        subprocess.run(["rm", "-rf", str(out)])
    assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-2000:]
    assert report["pch"]["SMS.mch"]["stock"]["ok"] and report["pch"]["SMS.mch"]["traced"]["ok"]
    assert [u["status"] for u in report["units"]] == ["identical", "identical"]
