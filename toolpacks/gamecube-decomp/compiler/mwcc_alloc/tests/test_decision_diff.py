"""mwcc-decision-diff-v1 identity matching, from hand-written mwcc-trace-v1 functions."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

SUITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SUITE / "api"))

import native_trace as nt  # noqa: E402
from decisions import build_decisions, decision_diff  # noqa: E402

STOCK = {"label": "GC/1.2.5", "sha256": "0443b5c02b1aa7b575b61e0e24c4d5ad6bed8fd54cc42de5a2204a5216001914"}
POINTS = ("vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame")


def web(name, line, reg, kind="local", file="src/a.c", **extra):
    return {"name": name, "line": line, "reg": reg, "kind": kind, "file": file, **extra}


def function(webs, *, extra=(), identity=True, cls="gpr", fn="f"):
    """A one-pass function: webs chained by interference, popped in reverse."""
    head = {"v": 1, "fn": fn, "pass": 1, "cls": cls}
    lines = [{**head, "cls": "-", "ev": "function", "name": fn, "display": fn}]
    vregs = list(range(32, 32 + len(webs)))
    for vreg, w in zip(vregs, webs):
        if identity:
            record = {**head, "ev": "vreg", "vreg": vreg, "kind": w["kind"], "object": w.get("object", w["name"])}
            if w.get("line") is not None:
                record.update(decl_file=w["file"], decl_line=w["line"])
            elif w.get("file_only"):
                record.update(decl_file=w["file"], decl_line=None)
            record.update({k: w[k] for k in ("arg_index", "body_file", "body_line", "decl_site") if k in w})
            if w.get("origin"):
                record["origin"] = w["origin"]
            lines.append(record)
        neighbors = [v for v in (vreg - 1, vreg + 1) if v in vregs]
        lines.append({**head, "ev": "node", "vreg": vreg, "degree": len(neighbors), "neighbors": neighbors,
                      "coalesced": bool(w.get("into")) or w.get("into_phys") is not None, "spill_cost": 0})
        if w.get("into"):
            lines.append({**head, "ev": "coalesce", "a": vreg, "b": vregs[[x["name"] for x in webs].index(w["into"])]})
        if w.get("into_phys") is not None:
            # As the traced MWCC writes it: the physical register first, then its commit.
            lines.append({**head, "ev": "coalesce", "a": w["into_phys"], "b": vreg, "reason": "copy"})
            lines.append({**head, "ev": "commit", "vreg": vreg, "reg": f"r{w['into_phys']}"})
    active = [(v, w) for v, w in zip(vregs, webs) if not w.get("into") and w.get("into_phys") is None]
    for v, _ in active:
        lines.append({**head, "ev": "push", "vreg": v, "sweep": 0, "stalled": False})
    for order, (v, w) in enumerate(reversed(active)):
        if w["reg"] is None:
            lines.append({**head, "ev": "spill", "vreg": v})
            continue
        lines.append({**head, "ev": "color", "vreg": v, "color": w["reg"], "order": order})
        lines.append({**head, "ev": "commit", "vreg": v, "reg": f"r{w['reg']}"})
    lines.extend({**head, **e} for e in extra)
    trace = nt.parse_lines(json.dumps(line) for line in lines)
    doc, _ = build_decisions(trace.select(fn), unit="src/a.c", version="1.2.5", stock=STOCK, available_points=POINTS)
    return doc


BASE = [web("this", 3, 31, kind="arg"), web("i", 4, 30), web("count", 5, 29), web("ptr", 6, 28)]


def shifted(line_shift: int, after: int):
    """b line -> a line when b inserted `line_shift` lines after a's line `after`."""
    def map_line(file, line):
        if line <= after:
            return line
        if line <= after + line_shift:
            return None
        return line - line_shift
    return map_line


class DecisionDiffTests(unittest.TestCase):
    def kinds(self, diff):
        return [change["kind"] for change in diff["changes"]]

    def test_an_early_local_is_one_new_node_not_a_register_cascade(self) -> None:
        # b declares `tmp` on a new line 4: every later vreg renumbers and every
        # later declaration moves down one line, but no register changes.
        b = [BASE[0], web("tmp", 4, 27), *[{**w, "line": w["line"] + 1} for w in BASE[1:]]]
        diff = decision_diff(function(BASE), function(b), map_line=shifted(1, 3))
        self.assertEqual(diff["change_counts"].get("node_added"), 1)
        self.assertNotIn("register", diff["change_counts"])
        self.assertNotIn("node_removed", diff["change_counts"])
        added = diff["changes"][0]
        self.assertEqual((added["kind"], added["match"], added["b"]["vreg"]), ("node_added", "by_site", 33))
        self.assertIn("`tmp`", diff["summary_lines"][0])
        self.assertEqual(diff["summary_lines"], [diff["changes"][0]["summary"]])

    def test_register_spill_and_coalesce_changes_name_the_web(self) -> None:
        b = [web("this", 3, 30, kind="arg"), web("i", 4, 31), web("count", 5, None), web("ptr", 6, 28, into="i")]
        diff = decision_diff(function(BASE), function(b))
        by_kind = {c["kind"]: c for c in diff["changes"]}
        registers = {c["summary"]: c["match"] for c in diff["changes"] if c["kind"] == "register"}
        self.assertEqual(registers, {"gpr pass 1: `this` (arg src/a.c:3) r31 -> r30 (v32 -> v32)": "exact",
                                     "gpr pass 1: `i` (local src/a.c:4) r30 -> r31 (v33 -> v33)": "exact"})
        self.assertIn("`count`", by_kind["spill"]["summary"])
        self.assertIn("coalesced into `i`", by_kind["coalesce"]["summary"])

    def test_pop_order_change_reports_only_the_moved_web(self) -> None:
        b = [BASE[0], BASE[2], BASE[1], BASE[3]]  # `count` now numbered (and popped) before `i`
        diff = decision_diff(function(BASE), function(b))
        moved = [c for c in diff["changes"] if c["kind"] == "color_order"]
        self.assertEqual(len(moved), 1)

    def test_duplicate_identities_are_ambiguous(self) -> None:
        dup = [web("this", 3, 31, kind="arg"), web("@12", 7, 30, kind="temp"), web("@13", 7, 29, kind="temp")]
        dup_b = [web("this", 3, 31, kind="arg"), web("@20", 7, 29, kind="temp"), web("@21", 7, 30, kind="temp")]
        diff = decision_diff(function(dup), function(dup_b))
        temps = [c for c in diff["changes"] if c["kind"] == "register"]
        self.assertEqual({c["match"] for c in temps}, {"ambiguous"})

    def test_temps_match_by_origin_despite_renumbered_objects(self) -> None:
        origin = {"pass": "cse", "expr": "this->hp + 4"}
        a = [web("this", 3, 31, kind="arg"), web("@40", None, 30, kind="temp", origin=origin)]
        b = [web("x", 2, 29), web("this", 3, 31, kind="arg"), web("@77", None, 28, kind="temp", origin=origin)]
        diff = decision_diff(function(a), function(b))
        register = [c for c in diff["changes"] if c["kind"] == "register"]
        self.assertEqual(len(register), 1)
        self.assertEqual(register[0]["match"], "by_origin")
        self.assertIn("this->hp + 4", register[0]["summary"])

    def test_without_vreg_identity_nothing_is_paired(self) -> None:
        a, b = function(BASE, identity=False), function([*BASE, web("x", 9, 27)], identity=False)
        diff = decision_diff(a, b)
        self.assertEqual(self.kinds(diff), ["node_added"])
        self.assertEqual(diff["changes"][0]["match"], "ambiguous")
        self.assertIn("without identity", diff["summary_lines"][0])

    def test_inline_cse_and_frame_changes(self) -> None:
        a_extra = [
            {"cls": "-", "ev": "inline", "site": "src/a.h:10", "callee": "clamp", "pass_index": 0, "verdict": "inlined"},
            {"cls": "-", "ev": "cse", "temp": "@40", "expr": "p->x", "block": 2, "occurrence": 1},
            {"cls": "-", "ev": "frame_slot", "offset": 8, "size": 4, "align": 4, "owner": "buf"},
        ]
        b_extra = [
            {"cls": "-", "ev": "inline", "site": "src/a.h:12", "callee": "clamp", "pass_index": 0, "verdict": "called",
             "reason": "too many statements"},
            {"cls": "-", "ev": "cse", "temp": "@41", "expr": "p->x", "block": 2, "occurrence": 1},
            {"cls": "-", "ev": "cse", "temp": "@42", "expr": "p->x", "block": 3, "occurrence": 2},
            {"cls": "-", "ev": "frame_slot", "offset": 12, "size": 4, "align": 4, "owner": "buf"},
        ]
        # src/a.h gained two lines above the call site.
        diff = decision_diff(function(BASE, extra=a_extra), function(BASE, extra=b_extra), map_line=shifted(2, 5))
        by_kind = {c["kind"]: c for c in diff["changes"]}
        self.assertIn("inlined -> called (too many statements)", by_kind["inline_verdict"]["summary"])
        self.assertIn("1 temp(s) in a, 2 in b", by_kind["cse_temp"]["summary"])
        self.assertIn("offset 8 -> 12", by_kind["frame_slot"]["summary"])

    def test_compiler_temp_frame_slots_compare_by_layout_not_name(self) -> None:
        def slots(*layout):
            return [{"cls": "-", "ev": "frame_slot", "offset": off, "size": 4, "align": 4, "owner": f"@{900 + i}"}
                    for i, off in enumerate(layout)]
        a = function(BASE, extra=slots(8, 12))
        renumbered = function(BASE, extra=[{**e, "owner": f"@{e['owner'][1:]}0"} for e in slots(8, 12)])
        self.assertEqual(decision_diff(a, renumbered)["changes"], [])
        grown = decision_diff(a, function(BASE, extra=slots(8, 12, 16)))
        self.assertEqual([(c["kind"], c["match"]) for c in grown["changes"]], [("frame_slot", "ambiguous")])
        self.assertIn("2 in a [8:4, 12:4], 3 in b [8:4, 12:4, 16:4]", grown["summary_lines"][0])

    def test_arguments_match_by_index_then_by_name_in_the_body_file(self) -> None:
        # The traced MWCC gives arguments no declaration line, only their position and body.
        def arg(name, reg, **extra):
            return web(name, None, reg, kind="arg", decl_site="function_body", body_file="src/a.c", **extra)
        a = [arg("self", 31, arg_index=0, body_line=3), arg("n", 30, arg_index=1, body_line=3), BASE[1]]
        # b renames `self` and moves the body: same position, same argument.
        b = [arg("actor", 29, arg_index=0, body_line=9), arg("n", 30, arg_index=1, body_line=9), BASE[1]]
        diff = decision_diff(function(a), function(b))
        self.assertEqual([(c["kind"], c["match"]) for c in diff["changes"]], [("register", "exact")])
        self.assertIn("`actor` (arg #0) r31 -> r29", diff["summary_lines"][0])
        # Without an index, the name within the body's file identifies it.
        no_index = [arg("self", 31), arg("n", 30), BASE[1]]
        swapped = [arg("n", 30), arg("self", 28), BASE[1]]
        diff = decision_diff(function(no_index), function(swapped))
        self.assertEqual([c["summary"] for c in diff["changes"] if c["kind"] == "register"],
                         ["gpr pass 1: `self` (arg in src/a.c) r31 -> r28 (v32 -> v33)"])
        self.assertFalse([c for c in diff["changes"] if c["kind"].startswith("node_")])

    def test_a_declaration_file_without_a_line_matches_by_name(self) -> None:
        a = [BASE[0], web("i", None, 30, file_only=True), web("count", None, 29, file_only=True)]
        b = [BASE[0], web("count", None, 29, file_only=True), web("extra", None, 27, file_only=True),
             web("i", None, 26, file_only=True)]
        diff = decision_diff(function(a), function(b))
        self.assertEqual(diff["change_counts"].get("node_added"), 1)
        self.assertIn("`extra` (local src/a.c)", diff["summary_lines"][0])
        registers = [c["summary"] for c in diff["changes"] if c["kind"] == "register"]
        self.assertEqual(registers, ["gpr pass 1: `i` (local src/a.c) r30 -> r26 (v33 -> v35)"])

    def test_coalescing_into_another_physical_register_is_a_change(self) -> None:
        # Review D r1: `i` coalesced into r3 vs r4 used to compare as equal.
        a = [BASE[0], web("i", 4, None, into_phys=3), BASE[2]]
        b = [BASE[0], web("i", 4, None, into_phys=4), BASE[2]]
        diff = decision_diff(function(a), function(b))
        by_kind = {c["kind"]: c for c in diff["changes"]}
        self.assertIn("coalesced into precolored 3 -> coalesced into precolored 4", by_kind["coalesce"]["summary"])
        self.assertIn("`i` (local src/a.c:4) r3 -> r4", by_kind["register"]["summary"])
        self.assertEqual(decision_diff(function(a), function(a))["changes"], [])

    def test_webs_without_identity_still_report_differences(self) -> None:
        # Review D r1: equal counts of unidentified webs used to hide their changes.
        moved = [BASE[0], BASE[1], {**BASE[2], "reg": 24}, BASE[3]]
        diff = decision_diff(function(BASE, identity=False), function(moved, identity=False))
        self.assertEqual([(c["kind"], c["match"]) for c in diff["changes"]], [("register", "ambiguous")])
        self.assertIn("r29x1", diff["summary_lines"][0])
        self.assertIn("r24x1", diff["summary_lines"][0])
        spilled = [BASE[0], BASE[1], {**BASE[2], "reg": None}, BASE[3]]
        kinds = [(c["kind"], c["match"]) for c in decision_diff(function(BASE, identity=False),
                                                                 function(spilled, identity=False))["changes"]]
        self.assertIn(("spill", "ambiguous"), kinds)
        same = decision_diff(function(BASE, identity=False), function(BASE, identity=False))
        self.assertEqual(same["changes"], [])
        self.assertNotIn("No traced decision differs", same["summary_lines"][0])
        self.assertIn("without identity", same["summary_lines"][0])

    def test_every_change_is_returned_for_the_full_report(self) -> None:
        many = [web(f"v{i}", 10 + i, 31) for i in range(320)]
        moved = [web(f"v{i}", 10 + i, 30) for i in range(320)]
        diff = decision_diff(function(many), function(moved))
        self.assertEqual(diff["change_counts"]["register"], 320)
        self.assertEqual(len(diff["changes"]), 320)
        self.assertIn("280 more changes", diff["summary_lines"][-1])

    def test_cse_counts_temps_and_their_uses_separately(self) -> None:
        def cse(*uses):
            return [{"cls": "-", "ev": "cse", "temp": temp, "expr": "p->x", "block": 1, "occurrence": i}
                    for i, temp in enumerate(uses)]
        one_temp_two_uses = function(BASE, extra=cse("@40", "@40"))
        # The same temp replacing one more occurrence is not a new temp.
        more_uses = decision_diff(one_temp_two_uses, function(BASE, extra=cse("@71", "@71", "@71")))
        self.assertEqual([(c["kind"], c["aspect"]) for c in more_uses["changes"]], [("cse_temp", "uses")])
        self.assertIn("same 1 temp(s), replaced uses 2 -> 3", more_uses["summary_lines"][0])
        new_temp = decision_diff(one_temp_two_uses, function(BASE, extra=cse("@71", "@72")))
        self.assertEqual([(c["kind"], c["aspect"]) for c in new_temp["changes"]], [("cse_temp", "temps")])
        self.assertIn("1 temp(s) in a, 2 in b", new_temp["summary_lines"][0])

    @staticmethod
    def slot(owner, offset, reserved=True, **extra):
        return {"cls": "-", "ev": "frame_slot", "offset": offset, "local_offset": offset - 8, "size": 4, "align": 4,
                "owner": owner, "reserved": reserved, "in_register": False, **extra}

    def test_discarded_slots_are_not_frame_slots_but_reservation_changes_are(self) -> None:
        # Review D r2: `reserved: false` slots were reported as real frame slots.
        frame = {"cls": "-", "ev": "frame", "local_base": 8, "size": 24, "local_size": 16, "slots": 2, "locals_cleared": False}
        doc = function(BASE, extra=[frame, self.slot("kept", 8), self.slot("gone", 12, reserved=False)])
        self.assertEqual([s["owner"] for s in doc["frame_slots"]], ["kept"])
        self.assertEqual([s["owner"] for s in doc["discarded_frame_slots"]], ["gone"])
        self.assertEqual(doc["frame"][0]["local_size"], 16)
        # A discarded slot appearing or moving is no frame change.
        quiet = function(BASE, extra=[frame, self.slot("kept", 8), self.slot("gone", 20, reserved=False)])
        self.assertEqual(decision_diff(doc, quiet)["changes"], [])
        # Only the reservation flips: reported, not "No traced decision differs".
        flipped = function(BASE, extra=[frame, self.slot("kept", 8, reserved=False), self.slot("gone", 12, reserved=False)])
        diff = decision_diff(doc, flipped)
        self.assertEqual([c["summary"] for c in diff["changes"]], ["frame slot kept: reserved -> discarded"])
        grown = function(BASE, extra=[{**frame, "size": 32}, self.slot("kept", 8), self.slot("gone", 12, reserved=False)])
        self.assertEqual([c["summary"] for c in decision_diff(doc, grown)["changes"]], ["frame layout: size 24 -> 32"])

    def test_two_scoped_locals_with_one_name_keep_both_slots(self) -> None:
        # Review D r2: setdefault kept only the first `x`, so moving the second was invisible.
        a = function(BASE, extra=[self.slot("x", 8), self.slot("x", 12)])
        b = function(BASE, extra=[self.slot("x", 8), self.slot("x", 16)])
        diff = decision_diff(a, b)
        self.assertEqual([(c["summary"], c["match"]) for c in diff["changes"]],
                         [("frame slot x (#2 of that name): offset 12 -> 16", "ambiguous")])
        # With declaration sites they are told apart exactly.
        sited_a = function(BASE, extra=[self.slot("x", 8, decl_file="src/a.c", decl_line=20),
                                        self.slot("x", 12, decl_file="src/a.c", decl_line=30)])
        sited_b = function(BASE, extra=[self.slot("x", 16, decl_file="src/a.c", decl_line=30),
                                        self.slot("x", 8, decl_file="src/a.c", decl_line=20)])
        diff = decision_diff(sited_a, sited_b)
        self.assertEqual([(c["summary"], c["match"]) for c in diff["changes"]], [("frame slot x: offset 12 -> 16", "by_site")])

    def test_identical_variants_have_no_changes(self) -> None:
        diff = decision_diff(function(BASE), function(BASE))
        self.assertEqual(diff["changes"], [])
        self.assertEqual(diff["summary_lines"], ["No traced decision differs between a and b."])
        self.assertEqual(diff["schema"], "mwcc-decision-diff-v1")
        self.assertIn("scheduling", diff["unavailable_points"])


if __name__ == "__main__":
    unittest.main()
