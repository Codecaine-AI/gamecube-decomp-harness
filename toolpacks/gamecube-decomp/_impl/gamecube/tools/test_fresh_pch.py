"""Direct compiles build the precompiled header from the tree they compile.

SMS TUs compile with `-prefix SMS.mch`, a PCH ninja builds from include/SMS.pch
before any TU. A direct compile (ninja_compile.direct_compile, stack_check.compile_in)
used whatever build/<ver>/include/SMS.mch was on disk: after RAD_TO_DEG moved from
MSL math.h to include/macros.h, the stale PCH still defined the old macro and 42 SMS
units failed with `macro 'RAD_TO_DEG' redefined` (the rest compiled against stale
declarations). The fixture below reproduces that command shape with a fake MWCC;
the last test runs the real SMS checkout when it and a wibo runner are present.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import stack_check  # noqa: E402

# A fake mwcceppc driven through the runner, like wibo: argv = [sjiswrap] compiler flags...
# PCH build: `-precompile NAME -c X.pch -o DIR` writes DIR/NAME (the #defines of every header
# it includes, in order) and DIR/<stem>.d in MWCC's Z:\ DOS form. TU: `-prefix NAME` is
# looked up along the -i dirs; a header redefining a PCH macro differently fails like MWCC.
FAKE_MWCC = r'''#!/usr/bin/env python3
import hashlib, os, re, sys
args = sys.argv[1:]
while args and not args[0].startswith("-"):
    args = args[1:]  # sjiswrap.exe, mwcceppc.exe
log = os.environ.get("FAKE_MWCC_LOG")
if log:
    with open(log, "a") as f:
        f.write(" ".join(args) + "\n")
dirs, prefix, precompile, src, out, md = [], None, None, None, None, False
i = 0
while i < len(args):
    a = args[i]
    if a in ("-i", "-I"): dirs.append(args[i + 1]); i += 2; continue
    if a == "-prefix": prefix = args[i + 1]; i += 2; continue
    if a == "-precompile": precompile = args[i + 1]; i += 2; continue
    if a == "-c": src = args[i + 1]; i += 2; continue
    if a == "-o": out = args[i + 1]; i += 2; continue
    if a in ("-MD", "-MMD"): md = True
    i += 1
def dos(p): return "Z:" + os.path.abspath(p).replace("/", "\\")
def find(name):
    for d in dirs:
        p = os.path.join(d, name)
        if os.path.isfile(p):
            return p
    print("# the file '%s' cannot be opened" % name); sys.exit(2)
deps, defines = [], {}
def define(name, body, where):
    if name in defines and defines[name] != body:
        print("#      In: %s\n#   macro '%s' redefined" % (where, name)); sys.exit(2)
    defines[name] = body
def read(path):
    deps.append(path)
    for line in open(path):
        m = re.match(r'#include [<"](.+)[>"]', line)
        if m: read(find(m.group(1))); continue
        m = re.match(r"#define (\w+(?:\([^)]*\))?)\s*(.*)", line)
        if m: define(m.group(1).split("(")[0], m.group(2).strip(), path)
if precompile:
    read(src)
    target = os.path.join(out, precompile)
    with open(target, "w") as f:
        for k, v in defines.items(): f.write("%s=%s\n" % (k, v))
    if md:
        with open(os.path.join(out, os.path.splitext(precompile)[0] + ".d"), "w") as f:
            f.write("%s: %s \\\n" % (dos(target), src.replace("/", "\\")))
            f.write("".join("\t%s \\\n" % dos(d) for d in deps[1:]))
    sys.exit(0)
if prefix:
    mch = find(prefix)
    deps.append(mch)
    for line in open(mch):
        k, v = line.rstrip("\n").split("=", 1); defines[k] = v
read(src)
with open(out, "w") as f:
    f.write(hashlib.sha256(repr(sorted(defines.items())).encode()).hexdigest())
if md:
    with open(os.path.splitext(os.path.basename(src))[0] + ".d", "w") as f:
        f.write("%s: %s \\\n" % (dos(out), src.replace("/", "\\")))
        f.write("".join("\t%s \\\n" % dos(d) for d in deps[1:]))
'''

UNIT = "build/GMSJ01/src/Camera/cameragc.o"
MACROS_OLD = "#define RAD_TO_DEG(r) (r * (180.0f / M_PI + 0.000005f))\n"
MACROS_NEW = "#define RAD_TO_DEG(r) (r * (180.0f / M_PI))\n"


def build_ninja(root: Path) -> str:
    # The SMS shape: the PCH edge's output is absolute, on a continuation line, and its
    # directory is the TU's last include dir; the TU edge has an order-only pre-compile dep.
    flags = "-lang=c++ -nodefaults -cwd source -i include -i libs/JSystem/include -i build/GMSJ01/include -DGEKKO"
    return (
        "rule mwcc_pch_sjis\n  command = wibo sjiswrap.exe mwcceppc.exe $cflags -MMD -c $in -o $basedir\n"
        "rule mwcc_sjis\n  command = wibo sjiswrap.exe mwcceppc.exe $cflags -MMD -c $in -o $basedir\n"
        "# Precompiled header SMS.mch\nbuild $\n"
        f"    {root}/build/GMSJ01/include/SMS.mch: $\n"
        "    mwcc_pch_sjis include/SMS.pch | $\n"
        "    build/compilers/$mw_version/mwcceppc.exe build/tools/sjiswrap.exe\n"
        "  mw_version = GC/1.2.5\n"
        f"  cflags = {flags}\n"
        f"build {UNIT}: mwcc_sjis src/Camera/cameragc.cpp $\n"
        "    | build/compilers/$mw_version/mwcceppc.exe build/tools/sjiswrap.exe $\n"
        "    tools/transform_dep.py || pre-compile\n"
        "  mw_version = GC/1.2.5\n"
        f"  cflags = {flags} -opt all,nostrength -lang=c++ -prefix SMS.mch\n"
    )


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


@pytest.fixture()
def sms_like(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    root = tmp_path / "checkout"
    write(root / "include/SMS.pch", "#include <math.h>\n#include <JSystem/J3DJoint.hpp>\n")
    write(root / "include/math.h", "#define M_PI 3.14159265358979323846f\n")
    write(root / "libs/JSystem/include/JSystem/J3DJoint.hpp", "#define J3D_JOINT 1\n")
    write(root / "include/macros.h", MACROS_NEW)
    write(root / "src/Camera/cameragc.cpp", '#include "macros.h"\n#define CAMERA 1\n')
    write(root / "build.ninja", build_ninja(root))
    write(root / "objdiff.json", json.dumps({"units": [{
        "name": "main/Camera/cameragc", "base_path": UNIT,
        "target_path": "build/GMSJ01/obj/Camera/cameragc.o"}]}))
    write(root / "build/compilers/GC/1.2.5/mwcceppc.exe", "stock")
    write(root / "build/tools/sjiswrap.exe", "sjiswrap")
    # The stale build-tree PCH: built when math.h still carried the old RAD_TO_DEG.
    write(root / "build/GMSJ01/include/SMS.mch", "M_PI=3.14159265358979323846f\nJ3D_JOINT=1\n"
          "RAD_TO_DEG=" + MACROS_OLD.split(" ", 2)[2].strip() + "\n")
    runner = write(tmp_path / "fake_mwcc.py", FAKE_MWCC)
    runner.chmod(0o755)
    log = tmp_path / "mwcc.log"
    monkeypatch.setenv("MWCC_WIBO", str(runner))
    monkeypatch.setenv("FAKE_MWCC_LOG", str(log))
    monkeypatch.setenv("NINJA_COMPILE_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("MWCC_NO_SJIS_BYPASS", "1")
    monkeypatch.delenv("NINJA_COMPILE_FRESH_PCH", raising=False)
    return root, log


def load_nc(root: Path):
    """ninja_compile binds its repo root at import; load a private copy for `root`."""
    import importlib.util

    previous = os.environ.get("ORCH_GAME_REPO_ROOT")
    os.environ["ORCH_GAME_REPO_ROOT"] = str(root)
    try:
        name = f"ninja_compile_fresh_pch_{time.time_ns()}"
        spec = importlib.util.spec_from_file_location(name, TOOLS / "ninja_compile.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module  # dataclasses resolve annotations through sys.modules
        spec.loader.exec_module(module)
        return module
    finally:
        if previous is None:
            os.environ.pop("ORCH_GAME_REPO_ROOT", None)
        else:
            os.environ["ORCH_GAME_REPO_ROOT"] = previous


def expected_object(root: Path, tmp: Path) -> str:
    """What ninja builds: a fresh PCH in build/GMSJ01/include, then the TU (in a copy)."""
    ref = tmp / f"ref-{time.time_ns()}"
    shutil.copytree(root, ref)
    flags = ["-lang=c++", "-nodefaults", "-cwd", "source", "-i", "include", "-i", "libs/JSystem/include",
             "-i", "build/GMSJ01/include", "-DGEKKO"]
    fake = os.environ["MWCC_WIBO"]
    env = {k: v for k, v in os.environ.items() if k != "FAKE_MWCC_LOG"}
    subprocess.run([fake, "mwcceppc.exe", *flags, "-MMD", "-c", "include/SMS.pch", "-o", "build/GMSJ01/include",
                    "-precompile", "SMS.mch"], cwd=ref, env=env, check=True, capture_output=True)
    subprocess.run([fake, "mwcceppc.exe", *flags, "-prefix", "SMS.mch", "-c", "src/Camera/cameragc.cpp",
                    "-o", str(ref / "out.o")], cwd=ref, env=env, check=True, capture_output=True)
    return (ref / "out.o").read_text()


def pch_builds(log: Path) -> int:
    return sum("-precompile" in line for line in log.read_text().splitlines()) if log.exists() else 0


def test_stale_build_tree_pch_reproduces_the_redefinition(sms_like, monkeypatch, capsys) -> None:
    root, _log = sms_like
    monkeypatch.setenv("NINJA_COMPILE_FRESH_PCH", "0")
    nc = load_nc(root)
    assert nc.direct_compile(UNIT, quiet=False) is None
    assert "macro 'RAD_TO_DEG' redefined" in capsys.readouterr().out


def test_direct_compile_builds_a_fresh_pch_and_matches_ninja(sms_like, tmp_path: Path) -> None:
    root, log = sms_like
    nc = load_nc(root)
    edge = nc.pch_edges()["SMS.mch"]
    assert edge.rule == "mwcc_pch_sjis" and edge.src == "include/SMS.pch"
    assert edge.output == f"{root}/build/GMSJ01/include/SMS.mch"

    compiled = nc.direct_compile(UNIT, quiet=False)
    assert compiled is not None
    assert compiled.obj.read_text() == expected_object(root, tmp_path)
    assert pch_builds(log) == 1

    # The fresh PCH's dir goes on the include path right before the build-tree PCH's dir.
    fresh = nc.fresh_pch_flags(nc.shlex.split(nc.find_build_block(UNIT).cflags))
    position = fresh.flags.index(fresh.include_dir)
    assert fresh.flags[position - 1] == "-i" and fresh.flags[position + 2] == "build/GMSJ01/include"
    assert not fresh.built and set(fresh.deps) == {"include/SMS.pch", "include/math.h",
                                                  "libs/JSystem/include/JSystem/J3DJoint.hpp"}

    # Reused while its inputs are unchanged; rebuilt when one changes.
    assert nc.direct_compile(UNIT, quiet=True) is not None
    assert pch_builds(log) == 1
    write(root / "include/math.h", "#define M_PI 3.14159265358979323846f\n#define M_E 2.718f\n")
    assert nc.direct_compile(UNIT, quiet=True) is not None
    assert pch_builds(log) == 2


def test_a_newly_shadowing_header_rebuilds_the_pch(sms_like, tmp_path: Path) -> None:
    # Review D r2: the PCH read libs/JSystem/include/JSystem/J3DJoint.hpp. Adding
    # include/JSystem/J3DJoint.hpp (searched first) changes resolution without
    # changing any hash the cache checked, so the stale PCH used to be reused.
    root, log = sms_like
    nc = load_nc(root)
    warm = nc.direct_compile(UNIT, quiet=False)
    assert warm is not None and pch_builds(log) == 1
    shadowing = write(root / "include/JSystem/J3DJoint.hpp", "#define J3D_JOINT 7\n")
    shadowed = nc.direct_compile(UNIT, quiet=False)
    assert shadowed is not None and pch_builds(log) == 2
    assert shadowed.obj.read_text() == expected_object(root, tmp_path) != warm.obj.read_text()
    fresh = nc.fresh_pch_flags(nc.shlex.split(nc.find_build_block(UNIT).cflags))
    assert "include/JSystem/J3DJoint.hpp" in fresh.deps
    # Removing it again goes back to the first PCH (still cached), not a third build.
    shadowing.unlink()
    again = nc.direct_compile(UNIT, quiet=False)
    assert again is not None and again.obj.read_text() == warm.obj.read_text() and pch_builds(log) == 2


def test_tu_without_a_generated_pch_is_unchanged(sms_like) -> None:
    root, _log = sms_like
    nc = load_nc(root)
    flags = ["-O4", "-i", "include", "-prefix", "custom.h"]
    assert nc.fresh_pch_flags(flags).flags == flags
    assert nc.fresh_pch_flags(["-O4"]).flags == ["-O4"]


def test_compile_in_uses_the_shadow_roots_headers_for_the_pch(sms_like, tmp_path: Path) -> None:
    root, log = sms_like
    repo = stack_check.Repo.__new__(stack_check.Repo)
    repo.root = root
    repo.nc = load_nc(root)
    repo.runner = os.environ["MWCC_WIBO"]
    block = repo.nc.find_build_block(UNIT)
    repo.edges = {UNIT: stack_check.Edge(block.rule, block.src, block.mw_version, block.cflags, None)}
    unit = stack_check.Unit("Camera/cameragc", UNIT, "build/GMSJ01/obj/Camera/cameragc.o", block.src)
    shadow = tmp_path / "w0"
    stack_check.make_shadow_root(root, shadow)

    base = stack_check.compile_in(repo, shadow, unit, tmp_path / "base.o", depfile=True)
    assert base.ok, base.error
    assert base.obj.read_text() == expected_object(root, tmp_path)
    assert not [k for k in base.deps if k.endswith(".mch")]
    assert {"include/SMS.pch", "include/math.h", "include/macros.h", "src/Camera/cameragc.cpp"} <= set(base.deps)

    # An overlay edit of a header inside the PCH changes the object (it was ignored before).
    header = "libs/JSystem/include/JSystem/J3DJoint.hpp"
    stack_check.write_file(shadow, header, b"#define J3D_JOINT 2\n")
    edited = stack_check.compile_in(repo, shadow, unit, tmp_path / "edited.o", depfile=True)
    assert edited.ok, edited.error
    assert edited.obj.read_text() != base.obj.read_text()
    assert edited.deps[header] == hashlib.sha256(b"#define J3D_JOINT 2\n").hexdigest()
    assert pch_builds(log) == 2

    # A PCH header that no longer compiles is the compile's failure, with MWCC's message.
    stack_check.write_file(shadow, "include/math.h", b"#define M_PI 3\n#include <missing.h>\n")
    broken = stack_check.compile_in(repo, shadow, unit, tmp_path / "broken.o")
    assert not broken.ok and "precompiled header" in broken.error and "missing.h" in broken.error


# ---------------------------------------------------------------------------
# Real SMS checkout (untracked; skipped when absent)
# ---------------------------------------------------------------------------

SMS_CHECKOUT = Path(os.environ.get(
    "SMS_CHECKOUT", TOOLS.parents[4] / "games/sms/workspace/checkout"))
REAL_UNITS = ("Camera/cameragc", "GC2D/ConsoleStr", "System/MovieDirector")


def _real_wibo() -> str | None:
    for candidate in (os.environ.get("MWCC_WIBO"), SMS_CHECKOUT / "build/tools/wibo",
                      TOOLS.parents[4] / "games/melee/workspace/repository/build/tools/wibo"):
        if candidate and Path(candidate).is_file():
            return str(candidate)
    return None


REAL_SCRIPT = r'''
import json, os, sys, tempfile
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import stack_check as sc
repo = sc.Repo(sys.argv[2])
tmp = Path(sys.argv[3]); shadow = tmp / "w0"; sc.make_shadow_root(repo.root, shadow)
rows = {}
for name in sys.argv[4:]:
    unit = repo.unit(name)
    res = sc.compile_in(repo, shadow, unit, tmp / (name.replace("/", "__") + ".o"))
    rows[name] = {"ok": res.ok, "error": res.error[-400:]}
print(json.dumps(rows))
'''


@pytest.mark.skipif(not (SMS_CHECKOUT / "build.ninja").is_file() or _real_wibo() is None,
                    reason="needs the SMS checkout and a wibo runner")
def test_real_sms_units_compile_through_compile_in(tmp_path: Path) -> None:
    """These failed with `macro 'RAD_TO_DEG' redefined` while the checkout's PCH was stale.
    Nothing is written to the checkout: compiles run in a shadow root, caches go to tmp."""
    env = dict(os.environ, MWCC_WIBO=_real_wibo(), NINJA_COMPILE_CACHE_DIR=str(tmp_path / "cache"),
               ORCH_GAME_REPO_ROOT=str(SMS_CHECKOUT))
    started = time.monotonic()
    result = subprocess.run([sys.executable, "-c", REAL_SCRIPT, str(TOOLS), str(SMS_CHECKOUT), str(tmp_path),
                             *REAL_UNITS], env=env, capture_output=True, text=True, timeout=600)
    assert result.returncode == 0, result.stderr[-2000:]
    rows = json.loads(result.stdout.strip().splitlines()[-1])
    assert all(row["ok"] for row in rows.values()), rows
    assert time.monotonic() - started < 600
