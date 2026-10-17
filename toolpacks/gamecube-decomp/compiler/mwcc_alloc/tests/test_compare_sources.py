"""compare_sources.py end to end on a throwaway checkout with a fake MWCC.

The fake compiler (fixtures/native/fake_mwcc.py) resolves quote-includes like
MWCC and writes mwcc-trace-v1 for its traced build, so these tests exercise
shadow roots, variant materialization, stock/traced object checks and the
identity-matched diff without a real compiler.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import native_fakes as nf  # noqa: E402

HEADER_WITH_LOCAL = nf.HEADER.replace("    int limit = 99;\n", "    int floor = 0;\n    int limit = 99;\n")
SOURCE_WITH_LOCAL = nf.SOURCE.replace("    int left = hp - dmg;\n", "    int bonus = 3;\n    int left = hp - dmg;\n")


class CompareSourcesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="compare-sources-"))
        self.root = nf.make_repo(self.tmp)
        self.env = nf.fake_env(self.tmp, self.root)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def compare(self, a: str, b: str, *extra: str, env: dict | None = None) -> dict:
        return nf.run_api("compare_sources.py", ["--repo-root", str(self.root), "--unit", nf.UNIT,
                                                 "--function", "actor_update", "--a", a, "--b", b, *extra],
                          {**self.env, **(env or {})})

    def manifest(self, name: str, files: dict) -> str:
        path = self.root / "build" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"files": files}))
        return f"build/{name}"

    def test_tu_only_change_early_local_is_one_new_node(self) -> None:
        (self.root / nf.UNIT).write_text(SOURCE_WITH_LOCAL)
        result = self.compare("@base", "@worktree")
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["change_counts"], {"node_added": 1})
        added = result["changes"][0]
        self.assertEqual(added["b"]["identity"]["object"], "bonus")
        self.assertEqual(added["b"]["identity"]["decl_file"], nf.UNIT)
        self.assertEqual(result["stock"]["code_class"], "code")
        self.assertTrue(result["traced_object_matches_stock"])
        self.assertEqual(result["schema"], "mwcc-decision-diff-v1")
        full = json.loads((self.root / result["full_report"]).read_text())
        self.assertEqual(full["changes"], result["changes"])

    def test_basename_declaration_files_still_map_lines(self) -> None:
        # MWCC writes "actor.c", not "src/game/actor.c": the moved locals must still match.
        (self.root / nf.UNIT).write_text(SOURCE_WITH_LOCAL)
        result = self.compare("@base", "@worktree", env={"FAKE_MWCC_BASENAMES": "1"})
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["change_counts"], {"node_added": 1})
        self.assertEqual(result["changes"][0]["b"]["identity"]["decl_file"], "actor.c")

    def test_worker_output_is_truncated_but_the_full_report_keeps_every_change(self) -> None:
        extra = "".join(f"    int extra{i} = {i};\n" for i in range(35))
        (self.root / nf.UNIT).write_text(nf.SOURCE.replace("    int left = hp - dmg;\n", extra + "    int left = hp - dmg;\n"))
        result = self.compare("@base", "@worktree")
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["change_counts"]["node_added"], 35)
        self.assertEqual((len(result["changes"]), result["changes_omitted"], result["changes_truncated"]), (30, 5, True))
        self.assertIn(result["full_report"], result["note"])
        full = json.loads((self.root / result["full_report"]).read_text())
        self.assertEqual(len(full["changes"]), 35)
        self.assertNotIn("changes_omitted", full)

    def test_header_inline_only_change_is_attributed_to_the_header(self) -> None:
        spec = self.manifest("header.json", {"include/actor.h": HEADER_WITH_LOCAL})
        result = self.compare("@base", spec)
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["change_counts"], {"node_added": 1})
        identity = result["changes"][0]["b"]["identity"]
        self.assertEqual((identity["object"], identity["decl_file"], identity["decl_line"]),
                         ("floor", "include/actor.h", 4))
        self.assertEqual(result["stock"]["code_class"], "code")
        self.assertEqual(result["variants"]["b"]["overlay_files"], ["include/actor.h"])
        # The checkout itself never changes.
        self.assertEqual((self.root / "include/actor.h").read_text(), nf.HEADER)

    def test_mixed_header_and_tu_change(self) -> None:
        spec = self.manifest("mixed.json", {"include/actor.h": HEADER_WITH_LOCAL, nf.UNIT: SOURCE_WITH_LOCAL})
        result = self.compare("@base", spec)
        self.assertEqual(result["status"], "ok", result)
        added = sorted((c["b"]["identity"]["decl_file"], c["b"]["identity"]["object"]) for c in result["changes"])
        self.assertEqual(added, [("include/actor.h", "floor"), (nf.UNIT, "bonus")])
        self.assertEqual(result["change_counts"], {"node_added": 2})

    def test_revert_one_hunk_against_base(self) -> None:
        source = SOURCE_WITH_LOCAL.replace("int tick = 0;", "int tick = 1;")
        (self.root / nf.UNIT).write_text(source)
        result = self.compare(f"@revert:{nf.UNIT}:4", "@worktree")
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["change_counts"], {"node_added": 1})
        self.assertEqual(result["variants"]["a"]["overlay_files"], [nf.UNIT])
        reverted = self.compare(f"@revert:{nf.UNIT}:4", "@base")
        self.assertEqual(reverted["changes"], [])

    def test_identical_variants_report_no_change(self) -> None:
        result = self.compare("@base", "@worktree")
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["changes"], [])
        self.assertEqual(result["stock"]["code_class"], "identical")

    def test_no_decisions_is_not_an_empty_diff(self) -> None:
        result = nf.run_api("compare_sources.py", ["--repo-root", str(self.root), "--unit", nf.UNIT, "--function", "actor_nop",
                                                   "--a", "@base", "--b", "@worktree"], self.env)
        self.assertEqual(result["status"], "no_decisions_traced", result)
        self.assertEqual(result["variants_without_decisions"], ["a", "b"])
        self.assertNotIn("changes", result)
        self.assertEqual(result["stock"]["code_class"], "identical")
        # One side gaining decisions is still not a diff against nothing.
        (self.root / nf.UNIT).write_text(nf.SOURCE.replace("void actor_nop(void) {\n}", "void actor_nop(void) {\n    int spare = 1;\n}"))
        result = nf.run_api("compare_sources.py", ["--repo-root", str(self.root), "--unit", nf.UNIT, "--function", "actor_nop",
                                                   "--a", "@base", "--b", "@worktree"], self.env)
        self.assertEqual((result["status"], result["variants_without_decisions"]), ("no_decisions_traced", ["a"]))
        self.assertEqual(result["stock"]["code_class"], "code")

    def test_an_overflowing_trace_is_unavailable_not_a_partial_diff(self) -> None:
        (self.root / nf.UNIT).write_text(SOURCE_WITH_LOCAL)
        result = self.compare("@base", "@worktree", env={"FAKE_MWCC_OVERFLOW": "deferred_events"})
        self.assertEqual((result["status"], result["unavailable"]), ("unavailable", "trace overflow (deferred_events)"))
        self.assertNotIn("changes", result)

    def test_traced_object_mismatch_is_unavailable_not_a_diff(self) -> None:
        result = self.compare("@base", "@worktree", env={"FAKE_MWCC_DIVERGE": "1"})
        self.assertEqual((result["status"], result["unavailable"]), ("unavailable", "traced-object-mismatch"))
        self.assertNotIn("changes", result)

    def test_traced_runs_disable_the_object_cache_and_filter_the_function(self) -> None:
        self.compare("@base", "@worktree")
        runs = [json.loads(line) for line in (self.tmp / "mwcc.log").read_text().splitlines()]
        traced = [r for r in runs if "compilers-traced" in r["argv"][0]]
        stock = [r for r in runs if "compilers-traced" not in r["argv"][0]]
        self.assertEqual((len(traced), len(stock)), (2, 2))
        for run in traced:
            self.assertEqual(run["env"]["MWCC_CACHE_DISABLE"], "1")
            self.assertEqual(run["env"]["MWCC_TRACE_FUNC"], "actor_update")
        for run in stock:
            self.assertNotIn("MWCC_TRACE_OUT", run["env"])

    def test_unavailable_versions_and_points_are_reported(self) -> None:
        caps_path = self.root / "build/compilers-traced/CAPABILITIES.json"
        caps = json.loads(caps_path.read_text())
        caps["versions"]["1.2.5"]["points"] = ["interference"]
        caps_path.write_text(json.dumps(caps))
        result = self.compare("@base", "@worktree")
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("lacks trace points: coloring", result["unavailable"])
        caps["versions"] = {"1.2.5n": caps["versions"]["1.2.5"]}
        caps_path.write_text(json.dumps(caps))
        result = self.compare("@base", "@worktree")
        self.assertIn("no validated traced build", result["unavailable"])

    def test_a_replaced_traced_binary_is_refused(self) -> None:
        (self.root / "build/compilers-traced/GC/1.2.5/mwcceppc.exe").write_bytes(b"something else")
        result = self.compare("@base", "@worktree")
        self.assertEqual((result["status"], result["unavailable"]), ("unavailable", "traced-binary-mismatch"))

    def test_bad_specs_are_rejected(self) -> None:
        outside = self.manifest("outside.json", {"tools/x.py": "print(1)"})
        self.assertEqual(self.compare("@base", outside)["status"], "invalid_arguments")
        self.assertEqual(self.compare("@base:nope", "@worktree")["status"], "invalid_arguments")
        self.assertIn("no change", self.compare(f"@revert:{nf.UNIT}:4", "@worktree")["error"])
        self.assertEqual(self.compare("missing.json", "@worktree")["status"], "invalid_arguments")

    def test_build_failure_in_a_variant(self) -> None:
        spec = self.manifest("broken.json", {nf.UNIT: '#include "missing.h"\n' + nf.SOURCE})
        result = self.compare("@base", spec)
        self.assertEqual((result["status"], result["variant"]), ("unit_build_failed", "b"))
        self.assertIn("missing.h", result["error"])


if __name__ == "__main__":
    unittest.main()
