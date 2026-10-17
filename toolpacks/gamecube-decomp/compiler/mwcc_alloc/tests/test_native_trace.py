"""Rebuilding coloring snapshots from mwcc-trace-v1 and replaying them.

The main fixture holds real allocator decisions: the qemu reader's captures of
mnSnap (function 0021: GPR passes 1-3 with spills, FPR pass 1), re-emitted as
trace events by fixtures/native/qemu_to_trace.py. The originals sit beside it.
"""

from __future__ import annotations

import gzip
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SUITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SUITE / "api"))

import native_trace as nt  # noqa: E402
from allocator_snapshot import validate_coloring_snapshot  # noqa: E402

FIXTURES = SUITE / "tests" / "fixtures" / "native"
STOCK_125N = {"label": "GC/1.2.5n", "sha256": "ccf4b465cec73b5aae9c5c5543dcf8cda8a62aba246f89e2e0b200d742f2e55c"}


def derived_trace() -> nt.Trace:
    with gzip.open(FIXTURES / "mnsnap-0021-qemu-derived.jsonl.gz", "rt") as stream:
        return nt.parse_lines(stream)


def qemu(cls: str, pass_index: int, phase: str) -> dict:
    path = FIXTURES / "qemu-mnsnap-0021" / f"coloring-0021-{cls}-{pass_index:02d}-{phase}.json.gz"
    with gzip.open(path, "rt") as stream:
        return json.load(stream)


class RealDecisionReplayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        fn = derived_trace().select("mnSnap_capture_0021")
        cls.captures = {(c.cls, c.pass_index): c for c in nt.coloring_captures(fn, STOCK_125N)}

    def test_every_class_and_spill_pass_is_rebuilt(self) -> None:
        self.assertEqual(sorted(self.captures), [("fpr", 1), ("gpr", 1), ("gpr", 2), ("gpr", 3)])

    def test_rebuilt_graph_matches_the_qemu_reader(self) -> None:
        for (cls, pass_index), capture in self.captures.items():
            with self.subTest(cls=cls, pass_index=pass_index):
                original = qemu(cls, pass_index, "before")
                self.assertEqual(capture.before["simplify_order"], original["simplify_order"])
                self.assertEqual(capture.before["register_count"], original["register_count"])
                rebuilt = {n["virtual_register"]: n for n in capture.before["nodes"]}
                for node in original["nodes"]:
                    vreg = node["virtual_register"]
                    if vreg < 32:
                        continue
                    self.assertEqual(set(rebuilt[vreg]["neighbors"]), set(node["neighbors"]), vreg)
                    self.assertEqual(rebuilt[vreg]["flags"] & 6, node["flags"] & 6, vreg)
                    self.assertEqual(rebuilt[vreg]["spill_cost"], node["spill_cost"], vreg)
                    if node["flags"] & 4:
                        self.assertEqual(rebuilt[vreg]["physical_register"], node["physical_register"], vreg)
                validate_coloring_snapshot(capture.before)
                validate_coloring_snapshot(capture.after)

    def test_replay_reproduces_pop_order_and_colors_in_every_pass(self) -> None:
        for key, capture in self.captures.items():
            with self.subTest(key=key):
                check = nt.replay_check(capture)
                self.assertTrue(check["ok"], check)
                self.assertGreater(check["colors_checked"], 50)

    def test_captured_spills_are_checked_too(self) -> None:
        check = nt.replay_check(self.captures[("gpr", 2)])
        self.assertTrue(check["ok"], check)
        self.assertGreater(check["spills_checked"], 0)
        self.assertEqual(check["colors_checked"], len(self.captures[("gpr", 2)].before["simplify_order"]))

    def test_later_passes_simplify_with_the_registers_left_after_claims(self) -> None:
        # Pass 1 claimed r14..r31 (18 colors); passes 2 and 3 simplify with 29 - 18.
        self.assertEqual(self.captures[("gpr", 1)].before["available_colors"], 29)
        self.assertEqual(self.captures[("gpr", 2)].before["available_colors"], 11)
        self.assertEqual(self.captures[("gpr", 3)].before["available_colors"], 11)
        self.assertEqual(self.captures[("gpr", 2)].before["coloring_register_count"], 243)
        self.assertEqual(self.captures[("fpr", 1)].before["available_colors"], 32)

    def test_qemu_compare_api_reads_native_snapshots(self) -> None:
        capture = self.captures[("gpr", 2)]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "before.json").write_text(json.dumps(capture.before))
            (root / "after.json").write_text(json.dumps(capture.after))
            result = subprocess.run(
                [sys.executable, str(SUITE / "api/compare.py"), "--repo-root", str(root),
                 "--before", "before.json", "--after", "after.json", "--json"],
                capture_output=True, text=True, check=True)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["format"], "mwcc-coloring-compare-v1")
        self.assertGreater(payload["change_count"], 200)

    def test_spilled_webs_are_flagged_after_coloring(self) -> None:
        after = {n["virtual_register"]: n for n in self.captures[("gpr", 2)].after["nodes"]}
        original = {n["virtual_register"]: n for n in qemu("gpr", 2, "after")["nodes"]}
        spilled = {v for v, n in original.items() if n["flags"] & 1}
        self.assertTrue(spilled)
        self.assertEqual({v for v, n in after.items() if n["flags"] & 1}, spilled)


class TraceStreamTests(unittest.TestCase):
    def lines(self, *events: dict) -> list[str]:
        return [json.dumps({"v": 1, "pass": 1, "cls": "gpr", **event}) for event in events]

    def test_unknown_fields_and_events_are_ignored_and_a_torn_line_tolerated(self) -> None:
        lines = self.lines(
            {"fn": "f__Fv", "ev": "function", "name": "f__Fv", "display": "f()", "extra": 1},
            {"fn": "f__Fv", "ev": "node", "vreg": 32, "degree": 0, "neighbors": [], "future_field": [1]},
            {"fn": "f__Fv", "ev": "some_future_event", "x": 2},
            {"fn": "f__Fv", "ev": "push", "vreg": 32, "sweep": 0, "stalled": False},
            {"fn": "f__Fv", "ev": "color", "vreg": 32, "color": 0, "order": 0},
        ) + ['{"v":1,"fn":"f__Fv","ev":"co']
        trace = nt.parse_lines(lines)
        self.assertEqual(trace.skipped, 1)
        captures = nt.coloring_captures(trace.select("f"), STOCK_125N)
        self.assertEqual(captures[0].after["nodes"][0]["physical_register"], 0)

    def test_a_spill_the_model_would_color_is_a_mismatch(self) -> None:
        # Review D r2: a degree-0 web captured as spilled replays as r0; that used to pass with 0 checked.
        trace = nt.parse_lines(self.lines(
            {"fn": "f", "ev": "function", "name": "f", "display": "f"},
            {"fn": "f", "ev": "node", "vreg": 32, "degree": 0, "neighbors": []},
            {"fn": "f", "ev": "push", "vreg": 32},
            {"fn": "f", "ev": "spill", "vreg": 32},
        ))
        check = nt.replay_check(nt.coloring_captures(trace.select("f"), STOCK_125N)[0])
        self.assertFalse(check["ok"], check)
        self.assertEqual(check["color_mismatches"], [{"register": 32, "replayed": 0, "captured": -1}])
        self.assertEqual(check["colors_checked"], 1)

    def test_overflow_records_mark_the_trace_incomplete(self) -> None:
        trace = nt.parse_lines(self.lines(
            {"fn": "f", "ev": "function", "name": "f", "display": "f"},
            {"fn": "f", "ev": "overflow", "what": "frame_slots", "limit": 1024},
        ) + [json.dumps({"v": 1, "ev": "overflow", "buffer": "deferred_events"})])
        self.assertEqual(trace.overflow_reason(), "trace overflow (frame_slots; deferred_events)")
        self.assertIsNone(nt.parse_lines(self.lines({"fn": "f", "ev": "function"})).overflow_reason())

    def test_other_versions_are_rejected(self) -> None:
        with self.assertRaises(nt.TraceError):
            nt.parse_lines([json.dumps({"v": 2, "fn": "f", "ev": "node"})])

    def test_function_selection_by_mangled_plain_or_display_name(self) -> None:
        trace = nt.parse_lines(self.lines(
            {"fn": "update__6MActorFv", "ev": "function", "name": "update__6MActorFv", "display": "MActor::update()"},
            {"fn": "update__7MEffectFv", "ev": "function", "name": "update__7MEffectFv", "display": "MEffect::update()"},
            {"fn": "calc", "ev": "function", "name": "calc", "display": "calc"},
        ))
        self.assertEqual(trace.select("update__6MActorFv").fn, "update__6MActorFv")
        self.assertEqual(trace.select("MActor::update").fn, "update__6MActorFv")
        self.assertEqual(trace.select("calc").fn, "calc")
        with self.assertRaisesRegex(LookupError, "ambiguous"):
            trace.select("update")
        with self.assertRaisesRegex(LookupError, "no trace records"):
            trace.select("missing")

    def test_a_name_shared_by_several_functions_is_refused(self) -> None:
        # Two classes' `execute` traced under the plain name would mix their graphs.
        trace = nt.parse_lines(self.lines(
            {"fn": "execute", "ev": "function", "name": "execute", "display": "execute"},
            {"fn": "execute", "ev": "push", "vreg": 32},
            {"fn": "execute", "ev": "function", "name": "execute", "display": "execute"},
            {"fn": "execute", "ev": "push", "vreg": 32},
            {"fn": "execute__5TNodeFv", "ev": "inline", "callee": "f", "verdict": "called"},
        ))
        with self.assertRaisesRegex(nt.TraceError, "2 function records"):
            trace.select("execute")
        with self.assertRaisesRegex(nt.TraceError, "0 function records"):
            trace.select("execute__5TNodeFv")

    def test_explicit_pass_settings_override_inference(self) -> None:
        trace = nt.parse_lines(self.lines(
            {"fn": "f", "ev": "function", "name": "f", "display": "f"},
            {"fn": "f", "ev": "simplify", "available": 27, "coloring_register_count": 40},
            {"fn": "f", "ev": "node", "vreg": 32, "degree": 0, "neighbors": []},
            {"fn": "f", "ev": "push", "vreg": 32},
        ))
        before = nt.coloring_captures(trace.select("f"), STOCK_125N)[0].before
        self.assertEqual((before["available_colors"], before["coloring_register_count"]), (27, 40))

    def test_precolored_and_coalesced_neighbors_are_synthesized(self) -> None:
        trace = nt.parse_lines(self.lines(
            {"fn": "f", "ev": "function", "name": "f", "display": "f"},
            {"fn": "f", "ev": "node", "vreg": 33, "degree": 2, "neighbors": [3, 40]},
            {"fn": "f", "ev": "coalesce", "a": 40, "b": 33, "reason": "copy"},
            {"fn": "f", "ev": "push", "vreg": 33},
            {"fn": "f", "ev": "color", "vreg": 33, "color": 4, "order": 0},
        ))
        capture = nt.coloring_captures(trace.select("f"), STOCK_125N)[0]
        nodes = {n["virtual_register"]: n for n in capture.before["nodes"]}
        self.assertEqual(nodes[3]["physical_register"], 3)
        self.assertEqual((nodes[40]["flags"] & 4, nodes[40]["physical_register"]), (4, 33))
        self.assertEqual(nodes[33]["flags"] & 8, 8)
        validate_coloring_snapshot(capture.before)


if __name__ == "__main__":
    unittest.main()
