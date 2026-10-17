"""Real traced MWCC builds on SMS and Melee (skipped unless provisioned).

Set MWCC_NATIVE_TEST_ROOT to a traced root: `<ver>/mwcceppc.exe` (with its
lmgr326b.dll) per version plus a CAPABILITIES.json whose SHA-1s match, e.g.
the output directory of native/build.sh. The game checkouts are only read:
each class clones one with `git clone --shared` into a temp directory and
links its compilers, tools and generated includes. Override them with
SMS_CHECKOUT / MELEE_CHECKOUT and the runner with MWCC_WIBO.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SUITE = Path(__file__).resolve().parents[1]


def harness_roots() -> list[Path]:
    """This checkout, then the main one (game checkouts are untracked, so a worktree lacks them)."""
    roots = [SUITE.parents[3]]
    common = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=SUITE, capture_output=True, text=True)
    if common.returncode == 0:
        roots.append((SUITE / common.stdout.strip()).resolve().parent)
    return roots


def game_checkout(env: str, relative: str) -> Path:
    if os.environ.get(env):
        return Path(os.environ[env])
    return next((root / relative for root in harness_roots() if (root / relative).is_dir()), Path("/nonexistent"))


TRACED_ROOT = Path(os.environ.get("MWCC_NATIVE_TEST_ROOT", "/nonexistent"))
SMS = game_checkout("SMS_CHECKOUT", "games/sms/workspace/checkout")
MELEE = game_checkout("MELEE_CHECKOUT", "games/melee/workspace/repository")
WIBO_CANDIDATES = [os.environ.get("MWCC_WIBO", ""), str(MELEE / "build/tools/wibo"), "/tmp/rmwcc/mwcc/build/tools/wibo"]
WIBO = next((w for w in WIBO_CANDIDATES if w and Path(w).is_file()), None)
READY = (TRACED_ROOT / "CAPABILITIES.json").is_file() and WIBO is not None


def scratch_clone(source: Path, version_dir: str, tmp: Path) -> Path:
    """A writable checkout sharing `source`'s objects; `source` is never written."""
    root = tmp / source.name
    subprocess.run(["git", "clone", "-q", "--shared", "--no-checkout", str(source), str(root)], check=True)
    subprocess.run(["git", "checkout", "-q", "HEAD"], cwd=root, check=True)
    shutil.copy2(source / "build.ninja", root / "build.ninja")
    (root / "build" / version_dir).mkdir(parents=True)
    for rel in ("build/compilers", "build/tools", f"build/{version_dir}/include"):
        (root / rel).symlink_to(source / rel)
    return root


def api(script: str, root: Path, *args: str, timeout: int = 600) -> dict:
    env = {**os.environ, "ORCH_MWCC_TRACED_ROOT": str(TRACED_ROOT), "MWCC_WIBO": str(WIBO), "ORCH_MWCC_NATIVE_CAPABILITIES": ""}
    result = subprocess.run([sys.executable, str(SUITE / "api" / script), "--repo-root", str(root), *args, "--json"],
                            capture_output=True, text=True, env=env, timeout=timeout)
    return json.loads(result.stdout)


@unittest.skipUnless(READY and SMS.is_dir(), "needs MWCC_NATIVE_TEST_ROOT, a wibo runner and the SMS checkout")
class SmsNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = Path(tempfile.mkdtemp(prefix="mwcc-native-sms-"))
        cls.root = scratch_clone(SMS, "GMSJ01", cls.tmp)

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_decisions_for_a_cpp_method_with_a_jammed_gpr_pass(self) -> None:
        result = api("snapshot.py", self.root, "--unit", "src/Enemy/bosseel.cpp",
                     "--function", "updateTearsCnt__8TBossEelFv", "--capture", "coloring-native")
        self.assertEqual(result["status"], "ok", result)
        self.assertTrue(result["traced_object_matches_stock"])
        self.assertEqual(result["provenance"]["stock_identity"]["label"], "GC/1.2.5")
        self.assertEqual({r["cls"] for r in result["replay"]}, {"gpr", "fpr"})
        for check in result["replay"]:
            self.assertTrue(check["ok"], check)
        doc = json.loads((self.root / next(f["path"] for f in result["files"] if f["kind"] == "decisions")).read_text())
        locals_ = {v["object"] for v in doc["vregs"] if v.get("kind") == "local"}
        self.assertTrue({"interval", "height"} & locals_, locals_)
        self.assertTrue(doc["inlines"])

    EXECUTE = "execute__26TNerveBossEelSleepOnBottomCFP24TSpineBase<10TLiveActor>"

    def test_cpp_method_overload_decisions(self) -> None:
        # bosseel.cpp defines 17 `execute` overloads; each is traced under its own mangled name.
        result = api("snapshot.py", self.root, "--unit", "src/Enemy/bosseel.cpp", "--function", self.EXECUTE,
                     "--capture", "coloring-native")
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual((result["function"], result["display"]), (self.EXECUTE, "execute"))
        for check in result["replay"]:
            self.assertTrue(check["ok"], check)
        doc = json.loads((self.root / next(f["path"] for f in result["files"] if f["kind"] == "decisions")).read_text())
        by_name = {v["object"]: v for v in doc["vregs"] if v.get("kind") in ("arg", "local")}
        self.assertEqual(set(by_name), {"spine", "eel"})
        # Arguments have no declaration line; they carry the body they belong to.
        spine = by_name["spine"]
        self.assertIsNone(spine.get("decl_line"))
        self.assertEqual((spine.get("decl_site"), spine.get("body_file")), ("function_body", "src/Enemy/bosseel.cpp"))
        # Locals carry their exact declaration line.
        source = (self.root / "src/Enemy/bosseel.cpp").read_text().splitlines()
        eel = by_name["eel"]
        self.assertEqual(eel["decl_file"], "src/Enemy/bosseel.cpp")
        self.assertIn("TBossEel* eel", source[eel["decl_line"] - 1])
        plain = api("snapshot.py", self.root, "--unit", "src/Enemy/bosseel.cpp", "--function", "execute",
                    "--capture", "decisions")
        self.assertEqual(plain["status"], "function_not_found")
        self.assertIn("ambiguous", plain["error"])

    def test_cpp_method_overload_compare_sources(self) -> None:
        unit = "src/Enemy/bosseel.cpp"
        source = (self.root / unit).read_text()
        old = ("\tif (spine->getTime() % 100 == 1)\n\t\teel->forceShedTears(spine->getTime() % 2);\n\n"
               "\tif (spine->getTime() > 1000")
        self.assertEqual(source.count(old), 1)
        edited = source.replace(old, "\ts32 t = spine->getTime();\n\tif (t % 100 == 1)\n\t\teel->forceShedTears(t % 2);\n\n"
                                     "\tif (spine->getTime() > 1000")
        (self.root / "build/execute.json").write_text(json.dumps({"files": {unit: edited}}))
        result = api("compare_sources.py", self.root, "--unit", unit, "--function", self.EXECUTE,
                     "--a", "@base", "--b", "build/execute.json")
        self.assertEqual(result["status"], "ok", result)
        added = [c for c in result["changes"] if c["kind"] == "node_added" and c["match"] != "ambiguous"]
        self.assertEqual([c["b"]["identity"]["object"] for c in added], ["t"])
        getter = [c for c in result["changes"] if c["kind"] == "inline_verdict"]
        self.assertTrue(getter and all("getTime" in c["summary"] for c in getter), result["summary_lines"])
        self.assertFalse([c for c in result["changes"] if c["kind"] == "register"], result["summary_lines"])
        self.assertEqual(result["stock"]["code_class"], "identical")

    def test_function_without_decisions(self) -> None:
        result = api("snapshot.py", self.root, "--unit", "src/Enemy/bosseel.cpp", "--function", "__sinit_bosseel_cpp",
                     "--capture", "decisions")
        self.assertEqual(result["status"], "no_decisions_traced", result)
        result = api("compare_sources.py", self.root, "--unit", "src/Enemy/bosseel.cpp", "--function",
                     "__sinit_bosseel_cpp", "--a", "@base", "--b", "@worktree")
        self.assertEqual((result["status"], result["variants_without_decisions"]), ("no_decisions_traced", ["a", "b"]))
        self.assertNotIn("changes", result)

    def test_compare_sources_tu_header_and_mixed_changes(self) -> None:
        unit, function = "src/Enemy/bosseel.cpp", "updateTearsCnt__8TBossEelFv"
        source = (self.root / unit).read_text()
        tu = source.replace("\t++mTearCycleTimer;", "\ts32 probe = mTearCycleTimer + 1;\n\tmTearCycleTimer = probe;", 1)
        header = "include/Player/MarioAccess.hpp"
        header_source = (self.root / header).read_text()
        header_text = header_source.replace(
            "inline JGeometry::TVec3<f32>& SMS_GetMarioPos() { return *gpMarioPos; }",
            "inline JGeometry::TVec3<f32>& SMS_GetMarioPos() { JGeometry::TVec3<f32>* pos = gpMarioPos; return *pos; }", 1)
        self.assertNotEqual(tu, source)
        self.assertNotEqual(header_text, header_source)
        variants = {"tu": {unit: tu}, "header": {header: header_text}, "mixed": {unit: tu, header: header_text},
                    "comment": {header: header_source + "\n// comment only\n"}}
        results = {}
        for name, files in variants.items():
            (self.root / "build" / f"{name}.json").write_text(json.dumps({"files": files}))
            results[name] = api("compare_sources.py", self.root, "--unit", unit, "--function", function,
                                "--a", "@base", "--b", f"build/{name}.json")
            with self.subTest(variant=name):
                result = results[name]
                self.assertEqual(result["status"], "ok", result)
                self.assertTrue(result["traced_object_matches_stock"])
                self.assertEqual(result["variants"]["b"]["overlay_files"], sorted(files))
        # The new local is attributed to `probe`, whichever decision it changed.
        for name in ("tu", "mixed"):
            self.assertTrue(any("probe" in line for line in results[name]["summary_lines"]), results[name]["summary_lines"])
        # A trailing comment moves no declaration and no code.
        self.assertEqual(results["comment"]["changes"], [], results["comment"]["summary_lines"])
        self.assertEqual(results["comment"]["stock"]["code_class"], "identical")


@unittest.skipUnless(READY and MELEE.is_dir(), "needs MWCC_NATIVE_TEST_ROOT, a wibo runner and the Melee checkout")
class MeleeNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = Path(tempfile.mkdtemp(prefix="mwcc-native-melee-"))
        cls.root = scratch_clone(MELEE, "GALE01", cls.tmp)

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_replay_reproduces_every_spill_pass_and_class(self) -> None:
        # mnSnap_80257F24 spills twice: three GPR allocation passes plus FPR.
        result = api("snapshot.py", self.root, "--unit", "src/melee/mn/mnsnap.c",
                     "--function", "mnSnap_80257F24", "--capture", "coloring-native")
        self.assertEqual(result["status"], "ok", result)
        attempts = sorted((r["cls"], r["pass"]) for r in result["replay"])
        self.assertEqual([cls for cls, _ in attempts].count("gpr"), 3, attempts)
        self.assertIn("fpr", [cls for cls, _ in attempts])
        for check in result["replay"]:
            self.assertTrue(check["ok"], check)
        later = [r for r in result["replay"] if r["cls"] == "gpr"][1:]
        self.assertTrue(all(r["available_colors"] < 29 for r in later), later)
        names = {f["path"].rsplit("/", 1)[-1] for f in result["files"]}
        self.assertIn("coloring-0001-gpr-03-before.json", names)
        # The qemu compare API reads native snapshots.
        before = next(f["path"] for f in result["files"] if f["path"].endswith("gpr-02-before.json"))
        after = before.replace("before", "after")
        compared = subprocess.run([sys.executable, str(SUITE / "api/compare.py"), "--repo-root", str(self.root),
                                   "--before", before, "--after", after, "--json"], capture_output=True, text=True)
        self.assertEqual(json.loads(compared.stdout)["format"], "mwcc-coloring-compare-v1")

    def test_1_1p1_is_unavailable(self) -> None:
        # Accepted decision: the traced 1.1p1 build fails byte identity, so no trace point is offered.
        result = api("snapshot.py", self.root, "--unit", "src/MetroTRK/mainloop.c",
                     "--function", "TRKHandleRequestEvent", "--capture", "decisions")
        self.assertEqual((result["status"], result["backend"]), ("unavailable", "native"), result)
        self.assertIn("GC/1.1p1", result["unavailable"])
        self.assertNotIn("coloring", result.get("available_points", []))


if __name__ == "__main__":
    unittest.main()
