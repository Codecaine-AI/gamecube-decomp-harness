"""snapshot.py backends: the pinned qemu contract and the native captures."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TESTS = Path(__file__).resolve().parent
SUITE = TESTS.parent
sys.path.insert(0, str(TESTS))
sys.path.insert(0, str(SUITE / "api"))

import native_fakes as nf  # noqa: E402
import snapshot  # noqa: E402
from native_backend import choose_backend  # noqa: E402

OBJCACHE_SHIM = SUITE.parents[1] / "_impl" / "gamecube" / "tools" / "mwcc_objcache.py"


class BackendChoiceTests(unittest.TestCase):
    def test_auto_keeps_pcode_captures_on_qemu_and_new_captures_on_native(self) -> None:
        for capture in ("pcode", "coloring", "pair", "trace"):
            self.assertEqual(choose_backend(capture, "auto"), ("qemu", None))
            self.assertEqual(choose_backend(capture, "qemu"), ("qemu", None))
            backend, reason = choose_backend(capture, "native")
            self.assertIsNone(backend)
            self.assertIn("PCode", reason)
        for capture in ("coloring-native", "decisions"):
            self.assertEqual(choose_backend(capture, "auto"), ("native", None))
            self.assertEqual(choose_backend(capture, "native"), ("native", None))
            self.assertIsNone(choose_backend(capture, "qemu")[0])

    def test_default_pair_capture_forwards_the_legacy_arguments(self) -> None:
        # Pins the default artifact contract: same script, same arguments as before --backend.
        args = snapshot.build_parser().parse_args(["--unit", "src/a.c", "--function", "f"])
        self.assertEqual((args.capture, args.backend), ("pair", "auto"))
        self.assertEqual(snapshot.qemu_command(args)[1:], [
            str(SUITE / "sandbox" / "mwcc_alloc_capture.py"), "--unit", "src/a.c", "--function", "f",
            "--capture", "pair", "--trace-detail", "stages", "--timeout-seconds", "900", "--json",
        ])

    def run_cli(self, *args: str) -> dict:
        result = subprocess.run([sys.executable, str(SUITE / "api/snapshot.py"), *args, "--json"],
                                capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def test_unsupported_backend_pairs_are_refused_with_the_backend_named(self) -> None:
        refused = self.run_cli("--unit", "src/a.c", "--function", "f", "--capture", "pair", "--backend", "native")
        self.assertEqual((refused["status"], refused["backend"]), ("backend_unsupported", "native"))
        refused = self.run_cli("--unit", "src/a.c", "--function", "f", "--capture", "decisions", "--backend", "qemu")
        self.assertEqual(refused["status"], "backend_unsupported")

    @unittest.skipIf(sys.platform == "linux" and shutil.which("qemu-i386"), "qemu host would really capture")
    def test_qemu_captures_off_the_sandbox_say_which_backend(self) -> None:
        result = self.run_cli("--unit", "src/a.c", "--function", "f")
        self.assertEqual((result["status"], result["backend"]), ("sandbox_required", "qemu"))


class NativeSnapshotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="native-snapshot-"))
        self.root = nf.make_repo(self.tmp)
        self.env = nf.fake_env(self.tmp, self.root)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def capture(self, capture: str, function: str = "actor_update", env: dict | None = None) -> dict:
        return nf.run_api("snapshot.py", ["--repo-root", str(self.root), "--unit", nf.UNIT, "--function", function,
                                          "--capture", capture], {**self.env, **(env or {})})

    def test_coloring_native_writes_qemu_schema_snapshots_with_provenance(self) -> None:
        result = self.capture("coloring-native")
        self.assertEqual((result["status"], result["backend"]), ("ok", "native"), result)
        self.assertTrue(result["traced_object_matches_stock"])
        provenance = result["provenance"]
        self.assertEqual(provenance["backend"], "native")
        self.assertEqual(provenance["version"], "1.2.5")
        self.assertEqual(provenance["stock_identity"]["label"], "GC/1.2.5")
        self.assertEqual(len(provenance["traced_sha1"]), 40)
        befores = [f for f in result["files"] if f["kind"] == "coloring_before"]
        self.assertEqual(sorted((f["cls"], f["attempt"]) for f in befores), [("fpr", 1), ("gpr", 1)])
        snap = json.loads((self.root / befores[0]["path"]).read_text())
        self.assertEqual(snap["format"], "mwcc-coloring-snapshot-v1")
        self.assertEqual(snap["target_sha256"], provenance["stock_identity"]["sha256"])
        self.assertEqual(snap["provenance"]["traced_sha1"], provenance["traced_sha1"])
        self.assertIn("scheduling", result["unavailable_points"])
        self.assertIn("frame", result["unavailable_points"])
        self.assertEqual(len(result["replay"]), 2)

    def test_decisions_capture(self) -> None:
        result = self.capture("decisions")
        self.assertEqual(result["status"], "ok", result)
        doc = json.loads((self.root / next(f["path"] for f in result["files"] if f["kind"] == "decisions")).read_text())
        self.assertEqual(doc["schema"], "mwcc-decisions-v1")
        self.assertEqual(doc["backend"], "native")
        names = {(v["object"], v["decl_file"], v["decl_line"]) for v in doc["vregs"]}
        self.assertIn(("limit", "include/actor.h", 4), names)  # inlined helper's local
        self.assertEqual(doc["inlines"][0]["callee"], "clamp_hp")
        self.assertEqual(doc["inlines"][0]["site"], f"{nf.UNIT}:5")
        self.assertEqual(set(doc["coloring"]), {"gpr", "fpr"})
        for key in ("vregs", "inlines", "cse", "frame_slots", "available_points", "unavailable_points"):
            self.assertIn(key, doc)
        self.assertFalse(any(f["kind"].startswith("coloring_") for f in result["files"]))

    def test_unknown_function_lists_the_unit_functions(self) -> None:
        result = self.capture("decisions", function="actor_missing")
        self.assertEqual(result["status"], "function_not_found")
        self.assertEqual(sorted(result["unit_functions"]), ["actor_idle", "actor_nop", "actor_update"])

    def test_a_function_without_decisions_is_reported_as_such(self) -> None:
        for capture in ("decisions", "coloring-native"):
            result = self.capture(capture, function="actor_nop")
            self.assertEqual(result["status"], "no_decisions_traced", result)
            self.assertIn("no decisions traced", result["summary"])
            self.assertNotIn("error", result)

    def test_an_overflowing_trace_is_unavailable_not_partial(self) -> None:
        result = self.capture("decisions", env={"FAKE_MWCC_OVERFLOW": "frame_slots"})
        self.assertEqual((result["status"], result["unavailable"]), ("unavailable", "trace overflow (frame_slots)"))
        self.assertNotIn("files", result)

    def test_missing_traced_build_is_unavailable(self) -> None:
        shutil.rmtree(self.root / "build/compilers-traced")
        result = self.capture("coloring-native")
        self.assertEqual((result["status"], result["backend"]), ("unavailable", "native"))
        self.assertIn("no traced build for GC/1.2.5", result["unavailable"])

    def test_capture_works_with_a_warm_object_cache(self) -> None:
        """The MWCC object cache replays objects without running the compiler,
        so a cached traced compile writes no trace. Captures must still trace."""
        shim = self.root / "build/tools/wibo"
        shim.parent.mkdir(parents=True, exist_ok=True)
        shim.write_bytes(b"#!" + sys.executable.encode() + b"\n" + OBJCACHE_SHIM.read_bytes().split(b"\n", 1)[1])
        shim.chmod(0o755)
        cache_env = {"MWCC_CACHE_DIR": str(self.tmp / "cache"), "MWCC_CACHE_REAL_WIBO": str(self.tmp / "runner"),
                     "MWCC_CACHE_STATS": "1"}
        # Warm the cache with the traced compiler, as a ninja build through the shim would.
        (self.root / "build/obj").mkdir()
        trace = self.tmp / "warm.jsonl"
        warm = [str(shim), str(self.root / "build/compilers-traced/GC/1.2.5/mwcceppc.exe"), "-O4,p", "-nosyspath",
                "-i", "include", "-c", nf.UNIT, "-o", "build/obj"]
        outcomes = []
        for _ in range(2):
            trace.unlink(missing_ok=True)
            run = subprocess.run(warm, cwd=self.root, capture_output=True, text=True,
                                 env={**os.environ, **cache_env, "MWCC_TRACE_OUT": str(trace)})
            outcomes.append((run.stderr.strip().splitlines()[-1], trace.exists()))
        self.assertEqual(outcomes[1], ("mwcc_objcache: hits=1 misses=1", False))  # the hazard

        result = self.capture("decisions", env={**cache_env, "MWCC_WIBO": str(shim)})
        self.assertEqual(result["status"], "ok", result)
        self.assertGreater(result["decisions_summary"]["vregs"], 0)
        runs = [json.loads(line) for line in (self.tmp / "mwcc.log").read_text().splitlines()]
        self.assertEqual(runs[-1]["env"].get("MWCC_CACHE_DISABLE"), "1")


if __name__ == "__main__":
    unittest.main()
