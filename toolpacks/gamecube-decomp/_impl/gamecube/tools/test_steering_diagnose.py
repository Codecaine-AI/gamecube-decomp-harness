"""steering_diagnose: probe content, hypotheses, lessons, evidence guards, 3 KB cap."""

from __future__ import annotations

import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import steering_diagnose as sd  # noqa: E402

FUNCTION = {
    "unit": "Enemy/hanasambo",
    "name": "execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor>",
    "demangled": "TNerveHanaSamboHide::execute(TSpineBase<TLiveActor>*) const",
    "decision": "steering_located",
    "match": {"base": 99.79, "candidate": 100.0, "real_only": 99.79},
    "stack_only_perturbation": False,
}


def group(gid, status, shapes, *, delta_lines=("a = b * b;",), cand=("f32 t = b; t *= t; a = t;",), **kw):
    return {"id": gid, "file": "src/Enemy/hanasambo.cpp", "line": 925, "status": status, "shapes": list(shapes),
            "real_shapes": kw.pop("real_shapes", []), "base_lines": list(delta_lines), "cand_lines": list(cand),
            "reason": kw.pop("reason", ""), "cosmetic": kw.pop("cosmetic", False), **kw}


def test_probe_fields_and_delta_order() -> None:
    groups = [
        group("g1", "removable", ["temp_alias"]),
        group("g2", "removable", ["accessor_swap"], cand=("x = getActor();",)),
        group("g3", "unresolved", ["other"], reason="IR changes but no real shape"),
        group("g4", "removable", ["cosmetic"], cosmetic=True),
    ]
    mwcc = {"attribution": [{"group": "g1", "delta": 0.21}, {"group": "g2", "delta": 0.01}]}
    p = sd.build_probe(FUNCTION, groups, mwcc, prefetch=False)
    assert p["function"].startswith("TNerveHanaSamboHide::execute") and p["unit"] == "Enemy/hanasambo"
    assert p["match"] == FUNCTION["match"]
    assert [r["delta"] for r in p["steering_edits"]] == [0.21, 0.01]
    assert p["steering_edits"][0]["shapes"] == ["temp_alias"]
    assert p["unresolved"][0]["reason"].startswith("IR changes")
    causes = [h["cause"] for h in p["hypotheses"]]
    assert causes[0] == "missing inline function"  # from the largest-delta temp
    assert "wrong inline used" in causes
    assert all(h["how_to_check"] for h in p["hypotheses"])
    assert "TNerveHanaSamboHide" in p["hypotheses"][0]["how_to_check"]


def test_stack_only_and_evidence_review_hypotheses() -> None:
    fn = dict(FUNCTION, stack_only_perturbation=True)
    p = sd.build_probe(fn, [group("g1", "removable", ["decl_reorder"])], None, prefetch=False)
    assert p["hypotheses"][0]["cause"] == "missing inline function"
    assert "stack" in p["hypotheses"][0]["why"]
    ev = group("g2", "unresolved", ["accessor_swap"], evidence={"kind": "evidence_review", "callee": "getMActor"})
    p = sd.build_probe(FUNCTION, [ev], None, prefetch=False)
    assert p["hypotheses"][0]["cause"] == "inline with provenance"


def test_lessons_by_function_and_shape(tmp_path: Path) -> None:
    path = tmp_path / "lessons.jsonl"
    rows = [
        {"id": "a", "function": "TNerveHanaSamboHide::execute", "steering": {"shapes": [], "summary": "same fn"},
         "real_cause": {"summary": "inline"}, "outcome": "real"},
        {"id": "b", "function": "X::y", "steering": {"shapes": ["temp_alias"], "summary": "temp"},
         "real_cause": {"summary": "inline T::get"}, "outcome": "real"},
        {"id": "c", "function": "X::z", "steering": {"shapes": ["bool_form"], "summary": "bool"},
         "real_cause": {"summary": "type"}, "outcome": "mixed"},
    ]
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\nnot json\n")
    p = sd.build_probe(FUNCTION, [group("g1", "removable", ["temp_alias"])], None, lessons_path=path, prefetch=False)
    assert [lesson["id"] for lesson in p["lessons"]] == ["a", "b"]
    assert sd.build_probe(FUNCTION, [], None, lessons_path=tmp_path / "missing.jsonl", prefetch=False)["lessons"] == []


def test_evidence_prefetch_guarded(monkeypatch) -> None:
    import evidence_search

    def boom(*a, **k):
        raise RuntimeError("map missing")

    monkeypatch.setattr(evidence_search, "map_calls", boom)
    monkeypatch.setattr(evidence_search, "map_unit", lambda repo, unit, version=None: {
        "functions": [{"name": "TFoo::getX(void)", "kind": "weak", "unused": False},
                      {"name": "TFoo::theNerve(void)", "kind": "global", "unused": True}]})
    monkeypatch.setattr(evidence_search, "inlines", lambda repo, t, m=None: [{"name": "getX", "file": "a.h", "line": 3}])
    monkeypatch.setattr(evidence_search, "usage", boom)
    monkeypatch.setattr(evidence_search, "jsystem", lambda q, limit=20: {"available": False, "hits": []})
    groups = [group("g1", "removable", ["accessor_swap"], new_calls=["getX"])]
    p = sd.build_probe(FUNCTION, groups, None, evidence_repo=Path("/repo"))
    ev = p["evidence"]
    assert ev["map_callees"] == [] and ev["emitted_inlines"] == ["TFoo::getX(void)"]
    assert ev["unused"] == ["TFoo::theNerve(void)"] and ev["header_inlines"] == ["getX (a.h:3)"]
    assert sd.build_probe(FUNCTION, groups, None)["evidence"]["map_callees"] == []  # no repo


def test_probe_fits_three_kilobytes() -> None:
    long = "x" * 2000
    groups = [group(f"g{i}", "removable", ["temp_alias", "operand_order"], delta_lines=(long,), cand=(long,))
              for i in range(40)]
    groups += [group(f"u{i}", "unresolved", ["other"], reason=long) for i in range(20)]
    p = sd.build_probe(FUNCTION, groups, None, prefetch=False)
    assert len(json.dumps(p, separators=(",", ":"))) <= sd.PROBE_LIMIT
    assert p["function"] and p["hypotheses"]


def test_hypotheses_default_when_no_shapes() -> None:
    hs = sd.hypotheses([], stack_only=False, evidence_review=False, cls=None, member=None, symbol="f")
    assert hs and hs[0]["cause"] == "missing inline function"
