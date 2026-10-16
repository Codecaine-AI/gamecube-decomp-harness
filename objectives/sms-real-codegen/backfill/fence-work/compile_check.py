#!/usr/bin/env python3
"""Compile check of the fence-revert overlay: every changed source unit, built in
shadow roots of the read-only clone (/tmp/sms-fence-repo) with the overlay texts
(HEAD + reverted files, deleted files removed). At most 3 MWCC jobs. Units that
fail are rebuilt at HEAD alone (separate phase) to separate pre-existing failures.

usage: compile_check.py OVERLAY_DIR [--out FILE]
"""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path("/tmp/sms-fence-repo")
os.environ["ORCH_GAME_REPO_ROOT"] = str(REPO)
os.environ.pop("ORCH_GAME_STATE_DIR", None)
HERE = Path(__file__).resolve().parent
TOOLS = HERE.parents[3] / "toolpacks/gamecube-decomp/_impl/gamecube/tools"
sys.path.insert(0, str(TOOLS))
import steering_check as sc  # noqa: E402
import steering_edits as se  # noqa: E402

BASE = "81248bdac58da1ff74128ba8c3a3798372fa5371"
PCH_FLAGS = ("-lang=c++ -nodefaults -align powerpc -enum int -fp hardware -Cpp_exceptions off -pragma \"cats off\" "
             "-pragma \"warn_notinlined off\" -maxerrors 1 -nosyspath -RTTI off -str reuse -multibyte -cwd source "
             "-i include -i libs/dolphin/include -i libs/JSystem/include -i libs/THPPlayer/include "
             "-i libs/PowerPC_EABI_Support/include -i libs/TRK_MINNOW_DOLPHIN/include -i libs/OdemuExi2/include "
             "-i libs/PowerPC_EABI_Support/include/PowerPC_EABI_Support/Msl/MSL_C/MSL_Common "
             "-i libs/PowerPC_EABI_Support/include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common "
             "-i build/GMSJ01/include -DBUILD_VERSION=0 -Dnullptr=0 -Dalignof=__builtin_align -DVERSION_GMSJ01 "
             "-proc gekko -DGEKKO -DNDEBUG=1 -O4,p -inline auto -fp_contract on -str reuse,readonly")


def build_pch(texts: dict) -> None:
    """SMS.mch from the phase's header texts, into the clone's own build/GMSJ01/include (never the checkout's)."""
    import shlex
    import shutil
    import stack_check
    dest = REPO / "build/GMSJ01/include"
    assert not dest.is_symlink() and dest.resolve().is_relative_to(Path("/private/tmp").resolve()) or \
        str(dest.resolve()).startswith("/private/tmp/") or str(dest.resolve()).startswith("/tmp/"), dest
    root = Path("/tmp/sms-fence-tmp/pch-root")
    shutil.rmtree(root, ignore_errors=True)
    stack_check.make_shadow_root(REPO, root)
    for rel, content in texts.items():
        stack_check.write_file(root, rel, content)
    import ninja_compile
    runner = str(ninja_compile._runner_command()[1])
    cmd = ([runner, str(REPO / "build/tools/sjiswrap.exe"), str(REPO / "build/compilers/GC/1.2.5/mwcceppc.exe")]
           + shlex.split(PCH_FLAGS) + ["-c", "include/SMS.pch", "-o", str(dest), "-precompile", "SMS.mch"])
    r = subprocess.run(cmd, cwd=root, capture_output=True, text=True, errors="replace")
    shutil.rmtree(root, ignore_errors=True)
    if r.returncode != 0:
        raise SystemExit("PCH build failed: " + (r.stdout + r.stderr)[-1500:])
    print(f"PCH built ({(dest / 'SMS.mch').stat().st_size} bytes)", flush=True)


def main() -> int:
    overlay = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else HERE / "compile-check.json"
    texts = {}
    for p in overlay.rglob("*"):
        rel = p.relative_to(overlay).as_posix()
        if p.is_file() and rel.split("/")[0] in ("src", "include", "libs"):
            texts[rel] = p.read_bytes()
    for rel in (overlay / "DELETED.txt").read_text().split():
        texts[rel] = None
    changed = subprocess.run(["git", "-C", str(REPO), "diff", "--name-only", BASE, "HEAD", "--", "src"],
                             capture_output=True, text=True, check=True).stdout.split()
    rp = sc._repo(REPO, None)
    units = []
    if "--all" in sys.argv:  # every unit with a source file, not only the changed ones
        changed = sorted(rp.units_by_source)
    for rel in changed:
        if se.is_source(rel) and rel in rp.units_by_source:
            units += [(rel, u.name) for u in rp.units_by_source[rel]]
    if "--units" in sys.argv:  # re-run only these units (e.g. after a timeout)
        only = set(sys.argv[sys.argv.index("--units") + 1].split(","))
        units = [u for u in units if u[1] in only]
    rows = {}

    def phase(label, tx, todo):
        build_pch(tx)
        pool = sc.ShadowCompiler(rp, 3, "/tmp/sms-fence-tmp/compile")
        try:
            def one(item):
                rel, name = item
                t0 = time.time()
                res = pool.compile(name, tx, label)
                return item, res.ok, (res.error or "")[:600], round(time.time() - t0, 1)
            with ThreadPoolExecutor(max_workers=3) as ex:
                for (rel, name), ok, err, secs in ex.map(one, todo):
                    rows.setdefault(name, {"file": rel, "unit": name})[label] = {"ok": ok, "error": err, "seconds": secs}
                    print(f"[{label}] {name}: {'ok' if ok else 'FAIL'} {secs}s", flush=True)
        finally:
            pool.close()

    phase("overlay", texts, units)
    failed = [(r["file"], n) for n, r in rows.items() if not r["overlay"]["ok"]]
    if failed:
        phase("head", {}, failed)
    summary = {"overlay": str(overlay), "units": len(rows),
               "overlay_ok": sum(1 for r in rows.values() if r["overlay"]["ok"]),
               "overlay_fail": sorted(n for n, r in rows.items() if not r["overlay"]["ok"]),
               "fail_also_at_head": sorted(n for n, r in rows.items() if "head" in r and not r["head"]["ok"]),
               "regressions": sorted(n for n, r in rows.items() if "head" in r and r["head"]["ok"]),
               "rows": rows}
    out.write_text(json.dumps(summary, indent=1) + "\n")
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
