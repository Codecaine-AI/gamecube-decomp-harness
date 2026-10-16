"""steering_check: reduction with a fake IR oracle, decide rules, context checks.

The fake oracle "compiles" a toy dialect: `DECL(x)` declares, `USE(x)` needs a
prior DECL, `BROKEN` never compiles; lines containing `NEUTRAL` (and the
`GLOBAL(name)` definition lines, which only set the data order) do not
change the fingerprint; every other code line does. Shapes come from
markers (`STEER`, `VOLATILE`, `OTHER`, `REAL`, `CALLADD`) through a patched
classifier, so the tests pin the gate's rules, not the shape classifier.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import steering_check as sc  # noqa: E402
import steering_edits as se  # noqa: E402

# --------------------------------------------------------------------------
# Fake oracle and classifier
# --------------------------------------------------------------------------


class FakeOracle:
    def __init__(self, unit_rules=None):
        self.calls: list[str] = []
        self.unit_rules = unit_rules or {}

    def __call__(self, unit: str, overrides: dict) -> sc.UnitOracle:
        """Fingerprint per toy function (`void name()` blocks), plus `__toplevel`
        for code outside them; `DEFINE(name)` lines define extra symbols."""
        self.calls.append(unit)
        text = "\n".join(t for _, t in sorted(overrides.items()) if t)
        declared: set[str] = set()
        semantic: dict[str, list[str]] = {"__toplevel": []}
        current = "__toplevel"
        for raw in text.splitlines():
            line = raw.strip()
            if "BROKEN" in line:
                return sc.UnitOracle(False, errors=["broken"])
            declared |= set(re.findall(r"DECL\((\w+)\)", line))
            for name in re.findall(r"USE\((\w+)\)", line):
                if name not in declared:
                    return sc.UnitOracle(False, errors=[f"{name} undeclared"])
            head = re.match(r"void (\w+)\(\)", line)
            if head:
                current = head.group(1)
                semantic.setdefault(current, [])
                continue
            if line == "}":
                current = "__toplevel"
                continue
            visible = self.unit_rules.get(unit)
            if not line or line == "{" or line.startswith("//") or "GLOBAL(" in line or "DEFINE(" in line:
                continue
            if "NEUTRAL" in line and not (visible and visible in line):
                continue
            semantic[current].append(line)
        fps = {name: str(hash(tuple(lines))) for name, lines in semantic.items()}
        fps.update({name: "def" for name in re.findall(r"DEFINE\((\w+)\)", text)})
        return sc.UnitOracle(True, fps, re.findall(r"GLOBAL\((\w+)\)", text))


def fake_classify(removed, added, context, typedefs, edits=None):
    if edits is not None and all(se.is_cosmetic(e.removed, e.added) for e in edits):
        return {"shapes": ["cosmetic"], "real_shapes": [], "details": {}}
    text = " ".join(removed + added)
    shapes, real = [], []
    if "STEER" in text:
        shapes.append("temp_alias")
    if "ACCESSOR" in text:
        shapes.append("accessor_swap")
    if "VOLATILE" in text:
        shapes.append("codegen_directive")
    if "OTHER" in text:
        shapes.append("other")
    if "REAL" in text:
        real.append("literal_change")
    if "CALLADD" in text:
        real.append("call_added")
    if not shapes and not real:
        shapes = ["other"]
    return {"shapes": shapes, "real_shapes": real, "details": {}}


@pytest.fixture(autouse=True)
def patched_classifier(monkeypatch):
    monkeypatch.setattr(sc, "classify", fake_classify)


def manifest(files: dict[str, tuple], units=None, header_units=None) -> dict:
    rows = []
    for path, (base, cand) in files.items():
        rows.append({"path": path, "base_exists": base is not None, "cand_exists": cand is not None,
                     "base_text": base, "cand_text": cand})
    return {
        "edits_hash": se.edits_hash("rev", rows),
        "base_rev": "rev",
        "files": rows,
        "units": units or [{"unit": "u1", "source": "src/a.c", "flags": ["cc"]}],
        "header_units": header_units or {},
    }


def reduce(m: dict, oracle=None, **kw) -> dict:
    return sc.Reducer(m, None, {}, oracle=oracle or FakeOracle(), **kw).run()


def by_text(red: dict, needle: str) -> dict:
    return next(g for g in red["groups"] if any(needle in x for x in g["cand_lines"] + g["base_lines"]))


def fn(body: list[str], name: str = "f") -> str:
    return f"void {name}()\n{{\n" + "".join(f"    {line}\n" for line in body) + "}\n"


# --------------------------------------------------------------------------
# Reduction
# --------------------------------------------------------------------------


def test_steering_removable_and_real_retained() -> None:
    base = fn(["DECL(a);", "USE(a);", "x(1);", "y();", "z();"])
    cand = fn(["DECL(a);", "STEER_NEUTRAL(a);", "USE(a);", "x(2) REAL;", "y();", "z();"])
    red = reduce(manifest({"src/a.c": (base, cand)}))
    assert red["analysis"] == "complete", red["incomplete_reasons"]
    steer = by_text(red, "STEER_NEUTRAL")
    real = by_text(red, "REAL")
    assert steer["status"] == "removable" and steer["functions"] == ["f"]
    assert real["status"] == "real" and real["real_shapes"] == ["literal_change"]
    assert sc.revert_edit_ids(red) == steer["edit_ids"]


def test_retained_shape_rules() -> None:
    base = fn(["a();", "", "b();", "", "c();", "", "d();"])
    cand = fn(["a() STEER;", "", "b() OTHER;", "", "c() VOLATILE REAL;", "", "d() REAL STEER;"])
    red = reduce(manifest({"src/a.c": (base, cand)}))
    assert by_text(red, "a() STEER")["status"] == "unresolved"
    assert "only steering" in by_text(red, "a() STEER")["reason"]
    assert by_text(red, "OTHER")["status"] == "unresolved"
    assert "directive" in by_text(red, "VOLATILE")["reason"]
    assert "separate" in by_text(red, "d() REAL STEER")["reason"]


def test_real_with_unexplained_residue_is_unresolved() -> None:
    base = fn(["a();", "", "b();"])
    cand = fn(["a() REAL OTHER;", "", "b() REAL;"])
    red = reduce(manifest({"src/a.c": (base, cand)}))
    assert by_text(red, "a() REAL OTHER")["status"] == "unresolved"
    assert by_text(red, "b() REAL")["status"] == "real"


def test_cosmetic_groups_need_no_oracle() -> None:
    base = fn(["a();"])
    cand = fn(["a();  // explain"])
    oracle = FakeOracle()
    red = reduce(manifest({"src/a.c": (base, cand)}), oracle)
    assert red["groups"][0]["status"] == "removable" and red["groups"][0]["cosmetic"]
    assert sc.revert_edit_ids(red) == []  # S* keeps comments


def test_compile_break_resolved_by_neighbour_merge() -> None:
    base = fn(["DECL(p) NEUTRAL;", "x();", "y();", "z();", "USE(p) NEUTRAL;"])
    cand = fn(["DECL(q) NEUTRAL;", "x();", "y();", "z();", "USE(q) NEUTRAL;"])
    red = reduce(manifest({"src/a.c": (base, cand)}))
    statuses = {g["id"]: g["status"] for g in red["groups"]}
    assert len(statuses) == 2 and set(statuses.values()) == {"removable"}
    assert red["analysis"] == "complete"


def test_compile_blocked_steering_is_unresolved_and_incomplete() -> None:
    base = fn(["DECL(p);", "x();", "y();", "z();", "USE(p);"])
    cand = fn(["DECL(q) STEER;", "x();", "y();", "z();", "USE(q) REAL;"])
    red = reduce(manifest({"src/a.c": (base, cand)}))
    blocked = by_text(red, "DECL(q)")
    assert blocked["compile_blocked"] and blocked["status"] == "unresolved"
    assert red["analysis"] == "incomplete"


def test_compile_blocked_with_only_real_shapes_is_real() -> None:
    base = fn(["DECL(p);", "x();", "y();", "z();", "USE(p);"])
    cand = fn(["DECL(q) REAL;", "x();", "y();", "z();", "USE(q) REAL;"])
    red = reduce(manifest({"src/a.c": (base, cand)}))
    assert {g["status"] for g in red["groups"]} == {"real"}


def test_order_sensitivity_is_incomplete() -> None:
    class Either(FakeOracle):
        def __call__(self, unit, overrides):
            res = super().__call__(unit, overrides)
            text = overrides["src/a.c"]
            if res.ok:
                res.fps = {"f": str("KEEPX" in text or "KEEPY" in text)}
            return res

    base = fn(["a();", "b();", "c();", "d();"])
    cand = fn(["a();", "KEEPX();", "KEEPX();", "b();", "c();", "KEEPY();", "d();"])
    red = reduce(manifest({"src/a.c": (base, cand)}), Either())
    assert red["analysis"] == "incomplete"
    assert any("order sensitive" in r for r in red["incomplete_reasons"])


def test_header_group_checked_in_every_including_unit() -> None:
    hdr_base = "inline int h() { return 1; }\nint k; NEUTRAL\n"
    hdr_cand = "inline int h() { return 1; }\nint k; NEUTRAL U2SEES\n"
    units = [{"unit": "u1", "source": "src/a.c", "flags": ["cc"]}, {"unit": "u2", "source": "src/b.c", "flags": ["cc"]}]
    m = manifest({"include/h.h": (hdr_base, hdr_cand)}, units, {"include/h.h": ["u1", "u2"]})
    oracle = FakeOracle({"u2": "U2SEES"})
    red = reduce(m, oracle)
    g = red["groups"][0]
    assert g["units"] == ["u1", "u2"]
    assert g["status"] != "removable"  # removable for u1 only -> retained
    assert {"u1", "u2"} <= set(oracle.calls)
    red_ok = reduce(m, FakeOracle())
    assert red_ok["groups"][0]["status"] == "removable"


def test_header_unit_cap_is_incomplete() -> None:
    units = [{"unit": f"u{i}", "source": f"src/{i}.c", "flags": ["cc"]} for i in range(sc.HEADER_UNIT_CAP + 4)]
    m = manifest({"include/h.h": ("int k;\n", "int k; NEUTRAL\n")}, units, {"include/h.h": [u["unit"] for u in units]})
    red = reduce(m)
    assert red["analysis"] == "incomplete" and red["groups"][0]["status"] == "unresolved"


def test_budget_and_max_groups_are_incomplete() -> None:
    base = fn(["a();", "", "b();"])
    cand = fn(["a() NEUTRAL;", "", "b() NEUTRAL;"])
    red = reduce(manifest({"src/a.c": (base, cand)}), budget_seconds=0)
    assert red["analysis"] == "incomplete" and any("budget" in r for r in red["incomplete_reasons"])
    assert all(g["status"] == "unresolved" for g in red["groups"])
    red = reduce(manifest({"src/a.c": (base, cand)}), max_groups=1)
    assert red["analysis"] == "incomplete" and any("max-groups" in r for r in red["incomplete_reasons"])


def test_oracle_unavailable_and_candidate_not_compiling() -> None:
    base, cand = fn(["a();"]), fn(["a() NEUTRAL;"])
    red = sc.Reducer(manifest({"src/a.c": (base, cand)}), None, {"context": {"detail": "no clang"}}).run()
    assert red["analysis"] == "incomplete" and red["groups"][0]["status"] == "unresolved"
    red = reduce(manifest({"src/a.c": (base, fn(["a() NEUTRAL BROKEN;"]))}))
    assert red["analysis"] == "incomplete" and red["units"][0]["ok"] is False
    assert red["groups"][0]["status"] == "unresolved"


def test_data_order_move_verified_by_symbols() -> None:
    base = "int gB; // GLOBAL(gB)\nint x;\nint gA; // GLOBAL(gA)\n" + fn(["a();"])
    cand = "int gA; // GLOBAL(gA)\nint gB; // GLOBAL(gB)\nint x;\n" + fn(["a();"])
    m = manifest({"src/a.c": (base, cand)})
    good = "gA = .sbss:0x10; // x\ngB = .sbss:0x14; // x\n"
    red = reduce(m, symbols_text=good)
    move = by_text(red, "GLOBAL(gA)")
    assert "data_order" in move["shapes"] and move["status"] == "real"
    bad = "gA = .sbss:0x18; // x\ngB = .sbss:0x14; // x\n"
    red = reduce(m, symbols_text=bad)
    assert by_text(red, "GLOBAL(gA)")["status"] == "unresolved"
    red = reduce(m, symbols_text=None)
    assert by_text(red, "GLOBAL(gA)")["status"] == "unresolved"


def test_evidence_review_and_approval(monkeypatch) -> None:
    import evidence_search

    monkeypatch.setattr(evidence_search, "map_unit", lambda repo, unit, version=None: {
        "functions": [{"name": "TFoo::getX(void)", "mangled": "getX__4TFooFv", "kind": "weak"}]})
    base = fn(["v = foo->mX NEUTRAL;"])
    cand = fn(["v = foo->getX() NEUTRAL ACCESSOR;"])
    m = manifest({"src/a.c": (base, cand)})
    red = reduce(m, evidence_repo=Path("/nonexistent"))
    g = red["groups"][0]
    assert g["status"] == "unresolved" and g["evidence"]["kind"] == "evidence_review"
    approvals = [{"symbol": "getX__4TFooFv", "function": "f", "provenance": "TP source", "approved_by": "human"}]
    red = reduce(m, evidence_repo=Path("/nonexistent"), approvals=approvals)
    assert red["groups"][0]["status"] == "real" and red["groups"][0]["evidence"]["kind"] == "approved"
    red = reduce(m)  # no evidence repo: plain steering
    assert red["groups"][0]["status"] == "removable"
    # the approval is bound to symbol AND function
    for bad in ({"symbol": "getX__4TFooFv", "function": "other"}, {"symbol": "getX__4TFooFv"},
                {"symbol": "getY__4TFooFv", "function": "f"}):
        red = reduce(m, evidence_repo=Path("/nonexistent"), approvals=[bad])
        assert red["groups"][0]["status"] == "unresolved", bad


def test_approval_never_covers_a_mixed_group(monkeypatch) -> None:
    """Approved accessor + a single-use temp in one group: never real."""
    import evidence_search

    monkeypatch.setattr(evidence_search, "map_unit", lambda repo, unit, version=None: {
        "functions": [{"name": "TFoo::getX(void)", "mangled": "getX__4TFooFv", "kind": "weak"}]})
    base = fn(["use(foo->mX) NEUTRAL;"])
    cand = fn(["int t = foo->getX() NEUTRAL ACCESSOR STEER;", "use(t) NEUTRAL;"])
    approvals = [{"symbol": "getX__4TFooFv", "function": "f", "provenance": "TP", "approved_by": "human"}]
    red = reduce(manifest({"src/a.c": (base, cand)}), evidence_repo=Path("/nonexistent"), approvals=approvals)
    g = red["groups"][0]
    assert len(red["groups"]) == 1 and g["status"] == "unresolved"
    assert g["evidence"]["kind"] == "approved_mixed" and "temp_alias" in g["reason"]
    dec = sc.decide(red, mw_doc([mw_fn()]), probes=False)
    assert dec["attempt"] != "pass"


# --------------------------------------------------------------------------
# decide
# --------------------------------------------------------------------------


def group(gid: str, status: str, *, functions=("T::f",), shapes=(), real_shapes=(), cosmetic=False, **kw) -> dict:
    return {"id": gid, "file": "src/a.c", "edit_ids": [gid + "#e"], "line": 10, "functions": list(functions),
            "units": ["u1"], "shapes": list(shapes), "real_shapes": list(real_shapes), "status": status,
            "reason": kw.pop("reason", ""), "cosmetic": cosmetic, "incomplete": kw.pop("incomplete", False),
            "evidence": kw.pop("evidence", None), "new_calls": kw.pop("new_calls", []),
            "dropped_calls": kw.pop("dropped_calls", []), "base_lines": ["old"], "cand_lines": ["new"],
            "data_order": kw.pop("data_order", None), **kw}


def red_doc(groups: list[dict], analysis: str = "complete", reasons=()) -> dict:
    return {"edits_hash": "h", "analysis": analysis, "incomplete_reasons": list(reasons), "groups": groups,
            "units": [{"unit": "u1", "ok": True}]}


def mw_fn(sstar: str = "identical", *, base=90.0, cand=100.0, real_only=100.0, **kw) -> dict:
    return {"unit": "u1", "name": "f__1TFv", "demangled": "T::f(void)", "target_name": "f__1TFv",
            "base": {"status": "mismatch", "match_percent": base},
            "candidate": {"status": "exact" if cand == 100.0 else "mismatch", "match_percent": cand},
            "real_only": {"status": "exact" if real_only == 100.0 else "mismatch", "match_percent": real_only},
            "sstar_vs_candidate": sstar, "target_relocs": kw.pop("target_relocs", []),
            "candidate_relocs": kw.pop("candidate_relocs", []), "attribution": kw.pop("attribution", []),
            "call_evidence": kw.pop("call_evidence", []), **kw}


FULL = {"base": "ok", "candidate": "ok", "sstar": "ok"}


def mw_doc(functions: list[dict], policy: str = "stop_at_frame", **kw) -> dict:
    coverage = kw.pop("coverage", [{"unit": "u1", "built": FULL, "compared": True}])
    return {"edits_hash": "h", "stack_frame_policy": policy, "functions": functions, "coverage": coverage,
            "errors": kw.pop("errors", []), **kw}


def decide(groups, functions, **kw):
    red = kw.pop("red", None) or red_doc(groups)
    return sc.decide(red, mw_doc(functions, **kw.pop("mw", {})), probes=kw.pop("probes", False), **kw)


def test_decide_pass_only_when_clean_and_identical() -> None:
    dec = decide([group("g1", "real", real_shapes=["literal_change"])], [mw_fn()])
    f = dec["functions"][0]
    assert (dec["attempt"], f["decision"], f["semantic"], f["analysis"], f["audit_label"]) == (
        "pass", "pass", "clean", "complete", "real")


def test_decide_steering_located() -> None:
    dec = decide([group("g1", "removable", shapes=["temp_alias"])], [mw_fn("code", real_only=99.5)])
    f = dec["functions"][0]
    assert dec["attempt"] == "steering_located" and f["decision"] == "steering_located"
    assert f["semantic"] == "steering" and f["audit_label"] == "steering" and dec["removable_noncosmetic"] == ["g1"]


def test_decide_removable_without_codegen_effect_still_rejects_attempt() -> None:
    dec = decide([group("g1", "removable", shapes=["temp_alias"])], [mw_fn()])
    assert dec["functions"][0]["decision"] == "pass"
    assert dec["attempt"] == "steering_located"
    dec = decide([group("g1", "removable", cosmetic=True, shapes=["cosmetic"])], [mw_fn()])
    assert dec["attempt"] == "pass"


def test_decide_unresolved_group_and_incomplete_analysis() -> None:
    dec = decide([group("g1", "unresolved", shapes=["other"], reason="no real shape")], [mw_fn()])
    assert dec["attempt"] == "unresolved" and dec["functions"][0]["semantic"] == "unresolved"
    red = red_doc([group("g1", "real", real_shapes=["literal_change"])], "incomplete", ["budget of 120s exceeded"])
    dec = decide([], [mw_fn()], red=red)
    f = dec["functions"][0]
    assert f["analysis"] == "incomplete" and f["decision"] == "unresolved" and dec["attempt"] == "unresolved"


def test_decide_unresolved_group_elsewhere_still_rejects_attempt() -> None:
    dec = decide([group("g1", "unresolved", functions=["T::other"], shapes=["other"])], [mw_fn()])
    assert dec["functions"][0]["decision"] == "pass" and dec["attempt"] == "unresolved"


def test_decide_stack_only_reported_under_stop_at_frame() -> None:
    dec = decide([group("g1", "removable", shapes=["decl_reorder"])], [mw_fn("stack_only", real_only=99.9)])
    f = dec["functions"][0]
    assert f["decision"] == "steering_located" and f["stack_only_perturbation"]
    assert dec["stack_only_perturbation"] and "stack_only_perturbation" in dec["reasons"]
    dec = decide([group("g1", "removable", shapes=["decl_reorder"])], [mw_fn("stack_only", real_only=99.9)],
                 mw={"policy": "match_frame"})
    assert not dec["functions"][0]["stack_only_perturbation"]


def test_decide_false_same_guard() -> None:
    g = group("g1", "removable", shapes=[], real_shapes=["condition_change"])
    dec = decide([g], [mw_fn("code", real_only=95.0)])
    f = dec["functions"][0]
    assert f["decision"] == "unresolved" and "oracle reverted a group carrying real shapes" in f["reasons"][0]


def test_decide_call_construct_checks() -> None:
    added = group("g1", "real", real_shapes=["call_added"], new_calls=["foo"])
    dec = decide([added], [mw_fn(candidate_relocs=["foo__1TFv"], target_relocs=[])])
    assert dec["attempt"] == "unresolved" and "new callee foo" in dec["functions"][0]["reasons"][0]
    dec = decide([added], [mw_fn(candidate_relocs=["foo__1TFv"], target_relocs=["foo__1TFv"])])
    assert dec["attempt"] == "pass"
    dec = decide([added], [mw_fn(candidate_relocs=[], target_relocs=[])])  # inlined by MWCC: IR rule decides
    assert dec["attempt"] == "pass"
    removed = group("g2", "real", real_shapes=["call_removed"], dropped_calls=["bar"])
    dec = decide([removed], [mw_fn(candidate_relocs=[], target_relocs=["bar__3BazFv"])])
    assert dec["attempt"] == "unresolved" and "removed callee bar" in dec["functions"][0]["reasons"][0]
    dec = decide([removed], [mw_fn(candidate_relocs=[], target_relocs=[])])
    assert dec["attempt"] == "pass"


def test_decide_map_call_evidence_keep(monkeypatch) -> None:
    import evidence_search

    listed = {"callees": [{"name": "TFoo::getX(void)", "mangled": "getX__4TFooFv"}]}
    monkeypatch.setattr(evidence_search, "map_calls",
                        lambda repo, sym, version=None: {"available": True, "found": True, **listed})
    row = {"group": "g1", "callee": "getX", "target": 1, "sstar": 0, "with": 1, "relocs_ok": True}
    ev = {"groups": ["g1"], "real_only": {"status": "exact", "match_percent": 100.0}, "sstar_vs_candidate": "identical"}
    g = group("g1", "removable", shapes=["accessor_swap"], new_calls=["getX"])
    dec = decide([g], [mw_fn("code", real_only=99.0, call_evidence=[row], evidence_sstar=ev)], evidence_repo=Path("/x"))
    f = dec["functions"][0]
    assert dec["evidence_keeps"] == ["g1"] and f["decision"] == "pass" and f["evidence_sstar"]
    assert dec["attempt"] == "pass"
    # temp + map-backed call in one group: unresolved
    g2 = group("g1", "removable", shapes=["temp_alias"], new_calls=["getX"])
    dec = decide([g2], [mw_fn("code", real_only=99.0, call_evidence=[row], evidence_sstar=ev)], evidence_repo=Path("/x"))
    assert dec["functions"][0]["decision"] == "unresolved"
    # the map does not list the callee: stays steering
    listed["callees"] = [{"name": "TFoo::other(void)", "mangled": "other__4TFooFv"}]
    dec = decide([g], [mw_fn("code", real_only=99.0, call_evidence=[row], evidence_sstar=ev)], evidence_repo=Path("/x"))
    assert dec["evidence_keeps"] == [] and dec["functions"][0]["decision"] == "steering_located"
    # relocation counts do not back it: no keep, map not even consulted
    listed["callees"] = [{"name": "TFoo::getX(void)", "mangled": "getX__4TFooFv"}]
    bad = dict(row, relocs_ok=False, sstar=1)
    dec = decide([g], [mw_fn("code", real_only=99.0, call_evidence=[bad])], evidence_repo=Path("/x"))
    assert dec["evidence_keeps"] == [] and dec["functions"][0]["decision"] == "steering_located"
    # no evidence repo: no keep
    dec = decide([g], [mw_fn("code", real_only=99.0, call_evidence=[row], evidence_sstar=ev)])
    assert dec["evidence_keeps"] == []


def test_decide_data_order_mwcc_evidence() -> None:
    g = group("g1", "unresolved", functions=[], shapes=["decl_reorder", "data_order"],
               data_order={"verified": False, "detail": "x"})
    rows = [{"group": "g1", "unit": "u1", "effect": "code", "improves": [".sbss order"], "worsens": []}]
    dec = decide([g], [mw_fn()], mw={"data_evidence": rows})
    assert dec["attempt"] == "pass" and dec["group_updates"][0]["status"] == "real"
    rows = [{"group": "g1", "unit": "u1", "effect": "none", "improves": [], "worsens": []}]
    dec = decide([g], [mw_fn()], mw={"data_evidence": rows})
    assert dec["group_updates"][0]["status"] == "removable" and dec["attempt"] == "steering_located"
    rows = [{"group": "g1", "unit": "u1", "effect": "code", "improves": [], "worsens": [".sbss order"]}]
    assert decide([g], [mw_fn()], mw={"data_evidence": rows})["attempt"] == "unresolved"


def test_decide_mixed_label_and_hash_mismatch() -> None:
    groups = [group("g1", "removable", shapes=["temp_alias"]), group("g2", "real", real_shapes=["member_change"])]
    dec = decide(groups, [mw_fn("code", base=90.0, real_only=97.0)])
    assert dec["functions"][0]["audit_label"] == "mixed"
    red = red_doc(groups)
    red["edits_hash"] = "other"
    dec = decide([], [mw_fn()], red=red)
    assert dec["attempt"] == "unresolved" and any("edits_hash" in r for r in dec["reasons"])


def test_decide_mwcc_variant_failure_is_incomplete() -> None:
    dec = decide([], [mw_fn()], mw={"errors": [{"unit": "u1", "variant": "sstar", "error": "x"}]})
    assert dec["functions"][0]["analysis"] == "incomplete" and dec["attempt"] == "unresolved"


def test_decide_builds_probes() -> None:
    dec = decide([group("g1", "removable", shapes=["temp_alias"])], [mw_fn("code", real_only=99.5)], probes=True)
    probe = dec["probes"][0]
    assert probe["function"] == "T::f(void)" and probe["steering_edits"][0]["shapes"] == ["temp_alias"]
    assert len(json.dumps(probe)) <= 3072


# --------------------------------------------------------------------------
# edits_hash, overlay, host context (tiny git repos)
# --------------------------------------------------------------------------


def git_repo(tmp_path: Path, files: dict[str, str]) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    for rel, text in files.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    env = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"]
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(repo), *env, "commit", "-q", "-m", "base"], check=True)
    return repo


def fake_units(files):
    return "V1", [{"unit": "u1", "source": "src/a.c", "object": "o", "target": "t",
                   "flags": ["clang", "--target=powerpc-eabi", "-Ibuild/V1/include", "-c", "${REPO}/src/a.c"]}], {}


def test_build_edits_overlay_and_hash(tmp_path: Path) -> None:
    repo = git_repo(tmp_path, {"src/a.c": "int f(void) { return 1; }\n", "include/h.h": "int x;\n"})
    (repo / "src/a.c").write_text("int f(void) { return 2; }\n")
    (repo / "src/new.c").write_text("int g;\n")
    overlay = tmp_path / "ov"
    (overlay / "include").mkdir(parents=True)
    (overlay / "include/h.h").write_text("int y;\n")
    e = sc.build_edits(repo, "HEAD", overlay_dir=overlay, unit_resolver=fake_units)
    paths = {f["path"]: f for f in e["files"]}
    assert set(paths) == {"src/a.c", "src/new.c", "include/h.h"}
    assert paths["src/new.c"]["base_exists"] is False and paths["include/h.h"]["cand_text"] == "int y;\n"
    assert e["edits_hash"] == se.edits_hash(e["base_rev"], e["files"]) and e["base_tree"]
    without = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    assert without["edits_hash"] != e["edits_hash"]
    assert (repo / "include/h.h").read_text() == "int x;\n"


def test_mwcc_refuses_edits_hash_mismatch(tmp_path: Path) -> None:
    repo = git_repo(tmp_path, {"src/a.c": "int a;\n"})
    (repo / "src/a.c").write_text("int b;\n")
    with pytest.raises(sc.ToolFailure, match="edits_hash mismatch"):
        sc.run_mwcc(repo, "HEAD", "0" * 64, [])
    code = sc.main(["mwcc", "--repo", str(repo), "--base-ref", "HEAD", "--edits-hash", "0" * 64, "--json"])
    assert code == 2


def test_prepare_oracle_context_checks(tmp_path: Path) -> None:
    repo = git_repo(tmp_path, {"src/a.c": "#include \"gen.h\"\nint f(void) { return GEN; }\n"})
    e = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    e["generated"] = {"root": "build/V1/include", "files": [
        {"path": "build/V1/include/gen.h", "sha256": sc.sha256_bytes(b"#define GEN 3\n"), "text": "#define GEN 3\n"}]}
    ctx, info = sc.prepare_oracle(dict(e, base_tree="0" * 40), repo, tmp_path / "cache", clang="fake-clang")
    assert ctx is None and info["context"]["base_tree_ok"] is False
    bad = json.loads(json.dumps(e))
    bad["generated"]["files"][0]["text"] = "#define GEN 4\n"
    ctx, info = sc.prepare_oracle(bad, repo, tmp_path / "cache", clang="fake-clang")
    assert ctx is None and info["context"]["generated_ok"] is False
    ctx, info = sc.prepare_oracle(e, repo, tmp_path / "cache2", clang="fake-clang")
    try:
        assert info["context"]["base_tree_ok"] and info["context"]["generated_ok"]
        assert (ctx.tree / "src/a.c").is_file()
        argv = ctx.argv("u1")
        assert any(a.startswith("-I") and a.endswith("build/V1/include") and a.startswith("-I/") for a in argv)
        assert argv[-1] == "src/a.c"
    finally:
        ctx.close()
    red = sc.run_reduce(dict(e, base_tree="0" * 40), repo, tmp_path / "cache", budget=10, max_groups=8, jobs=1,
                        approvals_path=None, evidence_repo=None)
    assert red["analysis"] == "incomplete"


CLANG = shutil.which("clang")


@pytest.mark.skipif(CLANG is None, reason="clang not installed")
def test_reduce_with_real_clang(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.undo()  # the real shape classifier
    base = """#include "gen.h"
struct S { int a; int b; };
static inline int get(struct S* s) { return s->a; }
int f(struct S* s, int n)
{
    if (n < s->a * s->a)
        return GEN;
    return s->b + 1;
}
"""
    cand = """#include "gen.h"
struct S { int a; int b; };
static inline int get(struct S* s) { return s->a; }
int f(struct S* s, int n)
{
    int lim = get(s);
    lim *= lim;
    if (n < lim)
        return GEN;
    return s->b + 2;
}
"""
    repo = git_repo(tmp_path, {"src/a.c": base})
    (repo / "src/a.c").write_text(cand)
    e = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    e["generated"] = {"root": "build/V1/include", "files": [
        {"path": "build/V1/include/gen.h", "sha256": sc.sha256_bytes(b"#define GEN 3\n"), "text": "#define GEN 3\n"}]}
    red = sc.run_reduce(e, repo, tmp_path / "cache", budget=60, max_groups=8, jobs=2, approvals_path=None,
                        evidence_repo=None)
    assert red["oracle"]["available"], red["oracle"]
    assert red["analysis"] == "complete", red["incomplete_reasons"]
    temp = by_text(red, "int lim")
    literal = by_text(red, "s->b + 2")
    assert temp["status"] == "removable" and temp["functions"] == ["f"]
    assert literal["status"] == "real" and "literal_change" in literal["real_shapes"]
    assert (repo / "src/a.c").read_text() == cand


def steer_group(gid: str, edit_ids: list[str]) -> dict:
    return {"id": gid, "status": "removable", "cosmetic": False, "edit_ids": edit_ids, "functions": ["f"], "units": ["u1"]}


def steer_row(name: str, groups: list[str]) -> dict:
    return {"unit": "u1", "name": name, "decision": "steering_located", "groups": groups}


def test_apply_writes_line_preserving_sstar(tmp_path: Path) -> None:
    base = "int f(int* p)\n{\n    return p[0] * p[0] + 1;\n}\n"
    cand = "int f(int* p)\n{\n    int t = p[0];\n    t *= t;\n    return t + 2;\n}\n"
    repo = git_repo(tmp_path, {"src/a.c": base})
    (repo / "src/a.c").write_text(cand)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    es = se.enumerate_edits("src/a.c", base, cand)
    temp_ids = [e.id for e in es if any("int t" in x or "t *= t" in x for x in e.added)]
    report = {"edits": sc.omit_texts(edits), "reduce": {"groups": [steer_group("g", temp_ids)]},
              "mwcc": {"revert_edits": temp_ids}, "decision": {"functions": [steer_row("f", ["g"])]}}
    dry = sc.run_apply(report, dry_run=True)
    assert dry["files"][0]["path"] == "src/a.c" and (repo / "src/a.c").read_text() == cand
    sc.run_apply(report, dry_run=False)
    text = (repo / "src/a.c").read_text()
    assert len(text.splitlines()) == len(cand.splitlines())
    (repo / "src/a.c").write_text(cand + "// changed\n")
    with pytest.raises(sc.ToolFailure, match="changed since the check"):
        sc.run_apply(report, dry_run=True)


def test_apply_only_paths_writes_just_those_files(tmp_path: Path) -> None:
    base = "int f(int* p)\n{\n    return p[0] * p[0] + 1;\n}\n"
    cand = "int f(int* p)\n{\n    int t = p[0];\n    t *= t;\n    return t + 2;\n}\n"
    repo = git_repo(tmp_path, {"src/a.c": base, "include/h.h": base})
    (repo / "src/a.c").write_text(cand)
    (repo / "include/h.h").write_text(cand)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    ids = [e.id for path in ("src/a.c", "include/h.h") for e in se.enumerate_edits(path, base, cand)
           if any("int t" in x or "t *= t" in x for x in e.added)]
    report = {"edits": sc.omit_texts(edits), "reduce": {"groups": [steer_group("g", ids)]},
              "mwcc": {"revert_edits": ids}, "decision": {"functions": [steer_row("f", ["g"])]}}
    out = sc.run_apply(report, dry_run=False, only_paths=["src/a.c"])
    assert [f["path"] for f in out["files"]] == ["src/a.c"] and out["only_paths"] == ["src/a.c"]
    assert (repo / "src/a.c").read_text() != cand
    assert (repo / "include/h.h").read_text() == cand
    # The hash check still covers the unwritten file: a second report over the same paths now refuses.
    with pytest.raises(sc.ToolFailure, match="changed since the check"):
        sc.run_apply(report, dry_run=True, only_paths=["include/h.h"])


HELD_BASE = "void T::f()\n{\n    a = 1;\n}\n\nvoid T::g()\n{\n    b = 1;\n}\n"
HELD_CAND = "void T::f()\n{\n    int t = 1;\n    a = t;\n}\n\nvoid T::g()\n{\n    int u = 1;\n    b = u;\n}\n"


def held_report(tmp_path: Path, groups: list[dict], rows: list[dict]) -> tuple[Path, dict]:
    """A one-file repo where f's hunk is edits #0.* and g's hunk is edits #1.*."""
    repo = git_repo(tmp_path, {"src/a.c": HELD_BASE})
    (repo / "src/a.c").write_text(HELD_CAND)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    ids = sorted(i for g in groups if g["status"] == "removable" for i in g["edit_ids"])
    report = {"edits": sc.omit_texts(edits), "reduce": {"groups": groups}, "mwcc": {"revert_edits": ids},
              "decision": {"functions": rows, "violations": []}}
    return repo, report


def held_group(gid: str, edit_ids: list[str], functions: list[str], units=("u1",)) -> dict:
    return {"id": gid, "status": "removable", "cosmetic": False, "edit_ids": edit_ids,
            "functions": functions, "units": list(units)}


def fn_row(name: str, demangled: str, decision: str, groups=()) -> dict:
    return {"unit": "u1", "name": name, "demangled": demangled, "decision": decision, "groups": list(groups)}


F_EDITS, G_EDITS = ["src/a.c#0.0", "src/a.c#0.1"], ["src/a.c#1.0", "src/a.c#1.1"]


def test_apply_holds_groups_of_unresolved_functions(tmp_path: Path) -> None:
    groups = [held_group("g1", F_EDITS, ["T::f"]), held_group("g2", G_EDITS, ["T::g"])]
    rows = [fn_row("f__1TFv", "T::f(void)", "steering_located", ["g1"]),
            fn_row("g__1TFv", "T::g(void)", "unresolved", ["g2"])]
    repo, report = held_report(tmp_path, groups, rows)
    out = sc.run_apply(report, dry_run=False)
    assert out["held_groups"] == ["g2"]
    assert out["files"] == [{"path": "src/a.c", "reverted": F_EDITS, "deleted": False, "held": ["g2"]}]
    text = (repo / "src/a.c").read_text()
    assert "int t" not in text and "a = 1;" in text
    assert "    int u = 1;\n    b = u;\n" in text  # the unresolved function keeps the candidate


def test_held_by_line_location_matches_mangled_and_demangled_names(tmp_path: Path) -> None:
    groups = [held_group("g1", F_EDITS, ["T::f"]), held_group("g2", G_EDITS, ["T::g"])]
    rows = [fn_row("f__1TFv", "T::f(void)", "steering_located", ["g1"]),
            fn_row("g__1TFv", "T::g(void)", "unresolved")]
    assert sc.held_group_ids({"reduce": {"groups": groups}, "decision": {"functions": rows}}) == ["g2"]
    # another unit's group does not match by name; a group without units does
    other = [held_group("g2", G_EDITS, ["T::g"], units=("u2",))]
    assert sc.held_group_ids({"reduce": {"groups": other}, "decision": {"functions": rows}}) == []
    unitless = [held_group("g2", G_EDITS, ["T::g"], units=())]
    assert sc.held_group_ids({"reduce": {"groups": unitless}, "decision": {"functions": rows}}) == ["g2"]
    repo, report = held_report(tmp_path, groups, rows)
    out = sc.run_apply(report, dry_run=False)
    assert out["held_groups"] == ["g2"] and out["files"][0]["reverted"] == F_EDITS
    assert "    int u = 1;\n    b = u;\n" in (repo / "src/a.c").read_text()


def test_group_touching_steering_and_unresolved_functions_is_held(tmp_path: Path) -> None:
    groups = [held_group("g1", F_EDITS + G_EDITS, ["T::f", "T::g"])]
    rows = [fn_row("f__1TFv", "T::f(void)", "steering_located", ["g1"]),
            fn_row("g__1TFv", "T::g(void)", "unresolved")]
    repo, report = held_report(tmp_path, groups, rows)
    out = sc.run_apply(report, dry_run=False)
    # nothing else to revert in the file: it is not written
    assert out["held_groups"] == ["g1"] and out["files"] == []
    assert (repo / "src/a.c").read_text() == HELD_CAND


def test_apply_reverts_only_groups_a_steering_function_claims(tmp_path: Path) -> None:
    # g1: steering f's group. g2: removable but only a passing function lists it. g3: removable, no function claims it.
    groups = [held_group("g1", F_EDITS[:1], ["T::f"]), held_group("g2", G_EDITS[:1], ["T::g"]),
              held_group("g3", F_EDITS[1:] + G_EDITS[1:], [])]
    rows = [fn_row("f__1TFv", "T::f(void)", "steering_located", ["g1"]), fn_row("g__1TFv", "T::g(void)", "pass", ["g2"])]
    repo, report = held_report(tmp_path, groups, rows)
    assert sc.steering_group_ids(report) == ["g1"]
    # Check the no-steering case against the unchanged tree the report measured.
    report["decision"]["functions"] = [fn_row("g__1TFv", "T::g(void)", "pass", ["g2"])]
    assert sc.steering_group_ids(report) == [] and sc.run_apply(report, dry_run=True)["files"] == []
    report["decision"]["functions"] = rows
    out = sc.run_apply(report, dry_run=False)
    assert out["steering_groups"] == ["g1"] and out["held_groups"] == []
    assert out["files"] == [{"path": "src/a.c", "reverted": F_EDITS[:1], "deleted": False}]
    text = (repo / "src/a.c").read_text()
    assert text.split("void T::g")[0] != HELD_CAND.split("void T::g")[0]  # f's steering edit is reverted
    assert "    int u = 1;\n    b = u;\n" in text  # g's code (g2, g3) is left as written


def test_apply_follows_decide_final_status_and_the_measured_sstar(tmp_path: Path) -> None:
    groups = [held_group("g1", F_EDITS, ["T::f"]), held_group("g2", G_EDITS, ["T::g"])]
    rows = [fn_row("f__1TFv", "T::f(void)", "steering_located", ["g1", "g2"])]
    repo, report = held_report(tmp_path, groups, rows)
    # decide promoted g2 to real (map-call evidence): never reverted.
    report["decision"]["group_statuses"] = {"g1": "removable", "g2": "real"}
    assert sc.steering_group_ids(report) == ["g1"]
    # Only edits the measured S* reverted are written.
    report["mwcc"]["revert_edits"] = F_EDITS[:1]
    assert sc.run_apply(report, dry_run=True)["files"][0]["reverted"] == F_EDITS[:1]


def test_apply_dry_run_reports_held_groups_and_writes_nothing(tmp_path: Path) -> None:
    groups = [held_group("g1", F_EDITS, ["T::f"]), held_group("g2", G_EDITS, ["T::g"]),
              dict(held_group("g3", [], ["T::g"]), cosmetic=True)]
    rows = [fn_row("f__1TFv", "T::f(void)", "steering_located", ["g1"]),
            fn_row("g__1TFv", "T::g(void)", "unresolved", ["g2", "g3"])]
    repo, report = held_report(tmp_path, groups, rows)
    dry = sc.run_apply(report, dry_run=True)
    assert dry["held_groups"] == ["g2"] and dry["files"][0]["held"] == ["g2"]
    assert dry["files"][0]["reverted"] == F_EDITS
    assert (repo / "src/a.c").read_text() == HELD_CAND
    assert sc.run_apply(report, dry_run=False)["held_groups"] == dry["held_groups"]


def test_shadow_include_failure_classifies_tool_errors() -> None:
    truncated = sc.shadow_include_failure("# Error: the file 'fdlibm.' cannot be opened")
    assert truncated and truncated.startswith("shadow-root path too long") and "fdlibm." in truncated
    other = sc.shadow_include_failure('# Error: the file "JSystem/JGeometry.h" cannot be opened')
    assert other and other.startswith("shadow-root include failure")
    assert sc.shadow_include_failure("# Error: undefined identifier 'foo'") is None


def test_shadow_roots_default_to_a_short_tmp(tmp_path: Path) -> None:
    import types

    (tmp_path / "r" / "src").mkdir(parents=True)
    pool = sc.ShadowCompiler(types.SimpleNamespace(root=tmp_path / "r"), 1)
    try:
        assert pool.tmp.parent == sc.short_tmp_root() and len(str(sc.short_tmp_root())) <= 24
        assert len(str(pool.tmp / "w0")) < len(str(tmp_path))
    finally:
        pool.close()
    assert not pool.tmp.exists() and not sc.short_tmp_root().exists()


def test_reduce_reports_incomplete_details_by_category(tmp_path: Path) -> None:
    repo = git_repo(tmp_path, {"src/a.c": "int f() { return 1; }\n"})
    (repo / "include").mkdir()
    (repo / "include/new.h").write_text("int g(void);\n")
    edits = sc.build_edits(repo, "HEAD", unit_resolver=lambda files: ("V1", [], {"include/new.h": []}))
    red = sc.run_reduce(edits, repo, tmp_path / "c", budget=60, max_groups=8, jobs=1, approvals_path=None,
                        evidence_repo=None, oracle=FakeOracle())
    [detail] = [d for d in red["incomplete_details"] if d["category"] == "group_no_unit"]
    assert detail["files"] == ["include/new.h"] and detail["units"] == []


def test_decide_missing_requested_function_is_unresolved() -> None:
    dec = decide([], [mw_fn()], mw={"missing_functions": ["T::gone"]})
    assert dec["attempt"] == "unresolved" and any("T::gone" in r for r in dec["reasons"])


def test_local_incompleteness_stays_local() -> None:
    other = group("g9", "unresolved", functions=["T::other"], shapes=["other"], incomplete=True)
    red = red_doc([other], "incomplete", ["groups with incomplete analysis: g9"])
    red["global_incomplete"] = []
    dec = decide([], [mw_fn()], red=red)
    f = dec["functions"][0]
    assert f["analysis"] == "complete" and f["decision"] == "pass"
    assert dec["attempt"] == "unresolved"  # the attempt is still not certified
    red["global_incomplete"] = ["budget of 120s exceeded"]
    assert decide([], [mw_fn()], red=red)["functions"][0]["analysis"] == "incomplete"


def test_decide_requires_unit_coverage() -> None:
    failed = [{"unit": "u1", "built": FULL, "compared": True},
              {"unit": "u2", "built": {"base": "ok", "candidate": "failed", "sstar": "ok"}, "compared": False,
               "reason": "a variant did not build"}]
    dec = decide([], [mw_fn()], mw={"coverage": failed})
    assert dec["attempt"] == "unresolved" and any("u2" in r for r in dec["reasons"])
    assert dec["units"] == [{"unit": "u1", "built": True, "compared": True, "builds": FULL},
                            {"unit": "u2", "built": False, "compared": False, "builds": failed[1]["built"]}]
    assert dec["functions"][0]["decision"] == "pass"  # u1 itself is covered
    dec = decide([], [mw_fn()], mw={"coverage": [{"unit": "u1", "built": {"base": "ok", "candidate": "ok",
                                                                             "sstar": "failed"}, "compared": False}]})
    assert dec["functions"][0]["analysis"] == "incomplete" and dec["attempt"] == "unresolved"
    report = mw_doc([mw_fn()])
    del report["coverage"]
    assert sc.decide(red_doc([]), report, probes=False)["attempt"] == "unresolved"


def test_coverage_gap_beats_steering_located() -> None:
    failed = [{"unit": "u1", "built": FULL, "compared": True},
              {"unit": "u2", "built": {"base": "ok", "candidate": "failed", "sstar": "ok"}, "compared": False}]
    dec = decide([group("g1", "removable", shapes=["temp_alias"])], [mw_fn("code", real_only=99.0)],
                 mw={"coverage": failed})
    assert dec["functions"][0]["decision"] == "steering_located" and dec["attempt"] == "unresolved"



def test_false_same_guard_only_for_purely_real_groups() -> None:
    steering = group("g1", "removable", shapes=["temp_alias"], real_shapes=["call_added"])
    dec = decide([steering], [mw_fn("code", real_only=95.0)])
    assert dec["functions"][0]["decision"] == "steering_located"
    pure = group("g1", "removable", shapes=[], real_shapes=["call_added"])
    dec = decide([pure], [mw_fn("code", real_only=95.0)])
    assert dec["functions"][0]["decision"] == "unresolved"


def test_touches_follow_evidence_not_the_unit() -> None:
    top = group("g1", "unresolved", functions=[], shapes=["other"], ir_functions=["T::other"])
    dec = decide([top], [mw_fn()])
    assert dec["functions"][0]["decision"] == "pass" and dec["functions"][0]["groups"] == []
    assert dec["attempt"] == "unresolved"  # still an uncertified group in the attempt
    top_here = group("g1", "unresolved", functions=[], shapes=["other"], ir_functions=["T::f"])
    assert decide([top_here], [mw_fn()])["functions"][0]["decision"] == "unresolved"
    no_evidence = group("g1", "unresolved", functions=[], shapes=["other"])
    assert decide([no_evidence], [mw_fn()])["functions"][0]["decision"] == "unresolved"
    # removable group: MWCC add-back evidence decides, not the line range
    rem = group("g2", "removable", functions=["T::f"], shapes=["temp_alias"])
    dec = decide([rem], [mw_fn("code", real_only=99.0)], mw={"group_touch": {"g2": {"u1": ["other__1TFv"]}}})
    assert dec["functions"][0]["groups"] == []
    dec = decide([rem], [mw_fn("code", real_only=99.0)], mw={"group_touch": {"g2": {"u1": ["f__1TFv"]}}})
    assert dec["functions"][0]["groups"] == ["g2"]
    # compile-blocked: line range only
    blocked = group("g3", "unresolved", functions=["T::f"], shapes=["other"], compile_blocked=True, ir_functions=[])
    assert decide([blocked], [mw_fn()])["functions"][0]["groups"] == ["g3"]
    blocked_top = group("g3", "unresolved", functions=[], shapes=["other"], compile_blocked=True)
    dec = decide([blocked_top], [mw_fn()])
    assert dec["functions"][0]["groups"] == [] and dec["attempt"] == "unresolved"


def test_data_order_group_touches_by_mwcc_evidence() -> None:
    g = group("g1", "unresolved", functions=[], shapes=["decl_reorder", "data_order"],
               data_order={"verified": False, "detail": "x"})
    rows = [{"group": "g1", "unit": "u1", "effect": "code", "functions": ["x__1TFv"], "improves": [], "worsens": []}]
    dec = decide([g], [mw_fn()], mw={"data_evidence": rows})
    assert dec["functions"][0]["groups"] == [] and dec["functions"][0]["decision"] == "pass"


def test_steering_only_retained_is_labelled_steering_but_not_credited() -> None:
    g = group("g1", "unresolved", shapes=["temp_alias"], reason="IR changes but only steering shapes found")
    ss = {"groups": ["g1"], "real_only": {"status": "mismatch", "match_percent": 98.6}, "sstar_vs_candidate": "code"}
    dec = decide([g], [mw_fn("identical", steering_sstar=ss)])
    f = dec["functions"][0]
    assert f["decision"] == "unresolved" and f["semantic"] == "steering" and f["audit_label"] == "steering"
    assert f["match"]["real_only"] == 98.6 and f["steering_sstar"] and dec["attempt"] == "unresolved"
    same = dict(ss, sstar_vs_candidate="identical")
    f = decide([g], [mw_fn("identical", steering_sstar=same)])["functions"][0]
    assert f["semantic"] == "unresolved"
    other = group("g1", "unresolved", shapes=["other"])
    f = decide([other], [mw_fn("identical", steering_sstar=ss)])["functions"][0]
    assert f["semantic"] == "unresolved"  # not steering-only


def test_ir_symbols_added_give_definition_shape() -> None:
    base = fn(["a();"])
    cand = "DEFINE(newfn) OTHER;\n" + fn(["a();"])
    red = reduce(manifest({"src/a.c": (base, cand)}))
    g = red["groups"][0]
    assert "definition_added_removed" in g["real_shapes"] and "other" not in g["shapes"]
    assert g["status"] == "real" and g["ir_symbols_changed"] == ["newfn"] and g["ir_functions"] == ["newfn"]
    # a definition plus another IR change keeps the unexplained residue
    cand2 = "DEFINE(newfn) OTHER;\n" + fn(["a() OTHER;"])
    red = reduce(manifest({"src/a.c": (base, cand2)}))
    assert any(g["status"] == "unresolved" for g in red["groups"])


def test_default_group_cap_is_generous() -> None:
    assert sc.DEFAULT_MAX_GROUPS >= 256


def test_approval_symbol_must_match_exactly() -> None:
    # map says the introduced callee is TBar::getX (getX__4TBarFv)
    for sym, ok in (("getX__4TBarFv", True), ("TBar::getX", True), ("TFoo::getX", False), ("getX", False),
                    ("getX__4TFooFv", False), ("Outer::TBar::getX", False)):
        row = {"symbol": sym, "function": "f", "approved_by": "human"}
        assert (sc._find_approval([row], "getX", "getX__4TBarFv", ["f"]) is not None) == ok, sym



def test_decide_units_are_booleans_and_group_statuses_are_final() -> None:
    absent = {"base": "absent", "candidate": "ok", "sstar": "ok"}
    dec = decide([], [mw_fn()], mw={"coverage": [{"unit": "u1", "built": absent, "compared": True}]})
    assert dec["units"] == [{"unit": "u1", "built": True, "compared": True, "builds": absent}]
    assert all(isinstance(r["built"], bool) and isinstance(r["compared"], bool) for r in dec["units"])
    dec = decide([], [mw_fn()], mw={"errors": [{"unit": "u1", "variant": "sstar_steering", "kind": "attribution",
                                                "error": "x"}]})
    assert dec["units"][0]["built"] is False and dec["attempt"] == "unresolved"
    # a data-order group promoted in decide leaves unresolved_groups
    g = group("g1", "unresolved", functions=[], shapes=["decl_reorder", "data_order"],
               data_order={"verified": False, "detail": "x"})
    rows = [{"group": "g1", "unit": "u1", "effect": "code", "functions": [], "improves": [".sbss order"], "worsens": []}]
    dec = decide([g], [mw_fn()], mw={"data_evidence": rows})
    assert dec["unresolved_groups"] == [] and dec["group_statuses"] == {"g1": "real"} and dec["attempt"] == "pass"
