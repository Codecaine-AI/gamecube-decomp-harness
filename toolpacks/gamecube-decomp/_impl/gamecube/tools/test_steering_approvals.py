"""Site-bound evidence-review approvals (worker-compiler-loop plan 3.1).

With the construct at site A approved, only the exact resubmission
certifies; the same callee at another site, A with other operands, and A
plus a second swap are rejected. Uses the fake oracle and marker classifier
of test_steering_check (ACCESSOR = accessor swap, NEUTRAL = no IR change).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import steering_approvals as sa  # noqa: E402
import steering_check as sc  # noqa: E402
from test_steering_check import fn, manifest, mw_doc, mw_fn, patched_classifier, reduce, site_approval  # noqa: E402,F401

NOWHERE = Path("/nonexistent")
A_BASE = fn(["a();", "v = foo->mX NEUTRAL;", "b();"])
A_CAND = fn(["a();", "v = foo->getX() NEUTRAL ACCESSOR;", "b();"])


@pytest.fixture(autouse=True)
def weak_getx(monkeypatch):
    import evidence_search

    monkeypatch.setattr(evidence_search, "map_unit", lambda repo, unit, version=None: {
        "functions": [{"name": "TFoo::getX(void)", "mangled": "getX__4TFooFv", "kind": "weak"}]})


def run(base: str, cand: str, approvals=()) -> dict:
    return reduce(manifest({"src/a.c": (base, cand)}), evidence_repo=NOWHERE, approvals=list(approvals), game="sms")


def review_group(red: dict) -> dict:
    return next(g for g in red["groups"] if (g.get("evidence") or {}).get("kind") in ("evidence_review", "approved"))


def toy_mw(red: dict) -> dict:
    """An MWCC report for the toy function `f` (S* identical to the candidate)."""
    return mw_doc([mw_fn(name="f__Fv", demangled="f (void)", target_name="f__Fv")], edits_hash=red["edits_hash"])


@pytest.fixture
def approved_a() -> dict:
    red = run(A_BASE, A_CAND)
    g = review_group(red)
    assert g["status"] == "unresolved" and g["evidence"]["kind"] == "evidence_review"
    assert g["evidence"]["site"]["lines"] == [4, 4] and g["evidence"]["site"]["file"] == "src/a.c"
    return site_approval(g)


def test_exact_resubmission_certifies(approved_a) -> None:
    red = run(A_BASE, A_CAND, [approved_a])
    g = review_group(red)
    assert g["status"] == "real" and g["evidence"]["kind"] == "approved"
    dec = sc.decide(red, toy_mw(red), approvals=[approved_a], probes=False)
    assert dec["attempt"] == "pass" and dec["evidence_reviews"] == []


def test_same_callee_at_another_site_is_rejected(approved_a) -> None:
    base = fn(["a();", "c();", "v = foo->mX NEUTRAL;", "b();"])
    cand = fn(["a();", "c();", "v = foo->getX() NEUTRAL ACCESSOR;", "b();"])
    g = review_group(run(base, cand, [approved_a]))
    assert g["status"] == "unresolved" and g["evidence"]["kind"] == "evidence_review"
    # the same line in another function: different target
    other = run(fn(["a();", "v = foo->mX NEUTRAL;", "b();"], name="g"),
                fn(["a();", "v = foo->getX() NEUTRAL ACCESSOR;", "b();"], name="g"), [approved_a])
    assert review_group(other)["status"] == "unresolved"


def test_altered_operands_are_rejected(approved_a) -> None:
    cand = fn(["a();", "v = bar->getX() NEUTRAL ACCESSOR;", "b();"])
    g = review_group(run(A_BASE, cand, [approved_a]))
    assert g["status"] == "unresolved" and g["group_digest"] != approved_a["group_digest"]


def test_a_plus_a_second_swap_is_rejected(approved_a) -> None:
    # in the same group (same statement): a different digest
    cand = fn(["a();", "v = foo->getX() + 0 NEUTRAL ACCESSOR;", "b();"])
    red = run(A_BASE, cand, [approved_a])
    assert len(red["groups"]) == 1 and red["groups"][0]["status"] == "unresolved"
    # its own group: A certifies, the second swap is steering and the attempt is rejected
    base = fn(["a();", "v = foo->mX NEUTRAL;", "u = foo->mY NEUTRAL;"])
    cand = fn(["a();", "v = foo->getX() NEUTRAL ACCESSOR;", "u = foo->getY() NEUTRAL ACCESSOR;"])
    red = run(base, cand, [approved_a])
    statuses = sorted(g["status"] for g in red["groups"])
    assert statuses == ["real", "removable"]
    dec = sc.decide(red, toy_mw(red), approvals=[approved_a], probes=False)
    assert dec["attempt"] != "pass" and dec["removable_noncosmetic"]


def test_approval_is_bound_to_game_base_and_unit(approved_a) -> None:
    for key, value in (("game", "melee"), ("base_rev", "other"), ("unit", "u2"), ("site_file", "src/b.c")):
        assert review_group(run(A_BASE, A_CAND, [{**approved_a, key: value}]))["status"] == "unresolved", key
    # an unknown gate game certifies nothing
    red = reduce(manifest({"src/a.c": (A_BASE, A_CAND)}), evidence_repo=NOWHERE, approvals=[approved_a])
    assert review_group(red)["status"] == "unresolved"


def test_decide_lists_reviews_and_binds_late_approvals_to_the_mangled_target(approved_a) -> None:
    red = run(A_BASE, A_CAND)
    dec = sc.decide(red, toy_mw(red), probes=False)
    [review] = dec["evidence_reviews"]
    assert review["targets"] == [{"unit": "u1", "name": "f__Fv"}]
    assert (review["game"], review["site_file"], review["site_lines"], review["callee"], review["symbol"]) == (
        "sms", "src/a.c", [4, 4], "getX", "getX__4TFooFv")
    assert review["group_digest"] == approved_a["group_digest"] and "+    v = foo->getX()" in review["patch"]
    late = sc.decide(red, toy_mw(red), approvals=[approved_a], probes=False)
    assert late["late_approved"] == [review["group"]] and late["evidence_reviews"] == []
    wrong = sc.decide(red, toy_mw(red), approvals=[{**approved_a, "target": "f__4TFooFv"}], probes=False)
    assert wrong["late_approved"] == [] and len(wrong["evidence_reviews"]) == 1


def test_digest_normalizes_whitespace_only() -> None:
    d = sa.digest_edits([(["  v = foo->mX;\n"], ["\tv  =  foo->getX();\r\n", "   \n"])])
    assert d == sa.digest_edits([(["v = foo->mX;"], ["v = foo->getX();"])])
    assert d != sa.digest_edits([(["v = foo->mX;"], ["v = foo->getX(1);"])])
    assert d != sa.digest_edits([(["v = foo->mX;"], ["v = foo->getX();"]), ([], ["w = 1;"])])


@pytest.mark.parametrize("same, changed", [
    ('v = getX("a  b");', 'v = getX("a b");'),
    ("v = getX(' ');", "v = getX('  ');"),
    ('v = getX(R"x(a  b)x");', 'v = getX(R"x(a b)x");'),
    ('v = getX(u8R"(p\tq)");', 'v = getX(u8R"(p q)");'),
    ('v = getX("a\\"  b");', 'v = getX("a\\" b");'),
])
def test_digest_keeps_literal_contents(same: str, changed: str) -> None:
    """Whitespace inside string, character and raw-string literals (escapes included) is an operand."""
    spaced = "  " + same.replace("v = ", "v  =\t") + "  "
    assert sa.digest_edits([([], [same])]) == sa.digest_edits([([], [spaced])])
    assert sa.digest_edits([([], [same])]) != sa.digest_edits([([], [changed])])


def test_changed_literal_operand_is_not_covered_by_the_approval(monkeypatch) -> None:
    base = fn(["a();", 'v = foo->mX("a  b") NEUTRAL;', "b();"])
    cand = fn(["a();", 'v = foo->getX("a  b") NEUTRAL ACCESSOR;', "b();"])
    approval = site_approval(review_group(run(base, cand)))
    assert review_group(run(base, cand, [approval]))["status"] == "real"
    altered = fn(["a();", 'v = foo->getX("a b") NEUTRAL ACCESSOR;', "b();"])
    assert review_group(run(base, altered, [approval]))["status"] == "unresolved"


def test_digest_carries_literal_state_across_lines() -> None:
    def d(*lines: str) -> str:
        return sa.digest_edits([([], list(lines))])

    # a backslash-continued string: the continuation line's whitespace is literal content
    assert d('v = getX("a \\', '  b");') != d('v = getX("a \\', ' b");')
    # a raw string spanning lines (leading and inner whitespace, and an empty line, are content)
    assert d('v = getX(R"x(a', '  b)x");') != d('v = getX(R"x(a', ' b)x");')
    assert d('v = getX(R"(a', '', 'b)");') != d('v = getX(R"(a', 'b)");')
    # code after the literal closes is normalized again; a block comment does not open a literal
    assert d('v = getX("a \\', ' b")  ;') == d('v  =  getX("a \\', ' b") ;')
    assert d("/* it's", "x  =  1; */", "y  =  2;") == d("/* it's", "x = 1; */", "y = 2;")


def test_an_edit_inside_a_multiline_literal_keeps_its_whitespace() -> None:
    """The edit's first line is inside a raw string opened above it: the file's lexer state at that line applies."""
    from types import SimpleNamespace

    cand = 'v = getX(R"(\nfirst\n  second\n)");\n'
    other = 'v = getX(R"(\nfirst\n second\n)");\n'
    edit = lambda text: SimpleNamespace(removed=["second\n"], added=[text.splitlines()[2]], base_start=2, cand_start=2)  # noqa: E731
    group = lambda text: SimpleNamespace(edits=[edit(text)])  # noqa: E731
    assert sa.group_digest(group(cand), cand, cand) != sa.group_digest(group(other), other, other)
    # without the file context the line would be code and its whitespace would collapse
    assert sa.group_digest(group(cand)) == sa.group_digest(group(other))


def test_multiline_literal_operand_is_not_covered_by_the_approval() -> None:
    base = fn(["a();", "v = foo->mX NEUTRAL;", "b();"])
    cand = fn(["a();", 'NEUTRAL v = foo->getX("p \\', '  q") NEUTRAL ACCESSOR;', "b();"])
    approval = site_approval(review_group(run(base, cand)))
    assert review_group(run(base, cand, [approval]))["status"] == "real"
    altered = fn(["a();", 'NEUTRAL v = foo->getX("p \\', ' q") NEUTRAL ACCESSOR;', "b();"])
    assert review_group(run(base, altered, [approval]))["status"] == "unresolved"


SHARED = [{"unit": "u1", "source": "src/a.c", "flags": ["cc"]}, {"unit": "u2", "source": "src/b.c", "flags": ["cc"]}]


def shared_header(approvals=()) -> dict:
    m = manifest({"include/h.h": (A_BASE, A_CAND)}, SHARED, {"include/h.h": ["u1", "u2"]})
    return reduce(m, evidence_repo=NOWHERE, approvals=list(approvals), game="sms")


def test_a_shared_header_group_needs_an_approval_for_every_unit() -> None:
    g = review_group(shared_header())
    assert g["units"] == ["u1", "u2"] and g["status"] == "unresolved"
    u1 = site_approval(g)  # unit u1 only
    u2 = {**u1, "unit": "u2"}
    g = review_group(shared_header([u1]))
    assert g["status"] == "unresolved" and [m["unit"] for m in g["evidence"]["missing"]] == ["u2"]
    assert review_group(shared_header([u1, u2]))["status"] == "real"


def test_decide_queues_only_the_unapproved_units_of_a_shared_group() -> None:
    red = shared_header()
    u1 = site_approval(review_group(red))
    mw = mw_doc([mw_fn(unit=u, name="f__Fv", demangled="f (void)", target_name="f__Fv") for u in ("u1", "u2")],
                edits_hash=red["edits_hash"], coverage=[{"unit": u, "built": {"base": "ok", "candidate": "ok", "sstar": "ok"},
                                                         "compared": True} for u in ("u1", "u2")])
    dec = sc.decide(red, mw, approvals=[u1], probes=False)
    assert dec["late_approved"] == [] and dec["attempt"] != "pass"
    [review] = dec["evidence_reviews"]
    assert review["targets"] == [{"unit": "u2", "name": "f__Fv"}]
    both = sc.decide(red, mw, approvals=[u1, {**u1, "unit": "u2"}], probes=False)
    assert both["late_approved"] == [review["group"]] and both["evidence_reviews"] == []


def test_game_id_resolution(tmp_path) -> None:
    assert sa.game_id(env={"ORCH_GAME_ID": "sms"}) == "sms"
    (tmp_path / "game.json").write_text(json.dumps({"id": "melee"}))
    assert sa.game_id(env={"ORCH_GAME_DIR": str(tmp_path)}) == "melee"
    path = Path("/x/games/sms/knowledge/sources/injectable/steering_lessons/evidence_approvals.jsonl")
    assert sa.game_id(path, env={}) == "sms"
    assert sa.game_id(None, env={}) is None


def test_migrate_converts_derivable_legacy_rows_and_lists_the_rest(tmp_path, approved_a) -> None:
    red = run(A_BASE, A_CAND)
    dec = sc.decide(red, toy_mw(red), probes=False)
    report = tmp_path / "check.json"
    report.write_text(json.dumps({"reduce": red, "decision": dec}))
    approvals = tmp_path / "evidence_approvals.jsonl"
    legacy = {"symbol": "getX__4TFooFv", "function": "f", "provenance": "TP source", "approved_by": "human"}
    orphan = {"symbol": "getZ__4TFooFv", "function": "f", "provenance": "?", "approved_by": "human"}
    approvals.write_text(json.dumps(legacy) + "\n" + json.dumps(orphan) + "\n")
    assert sa.main(["migrate", "--approvals", str(approvals), "--report", str(report), "--write"]) == 0
    rows = [json.loads(line) for line in approvals.read_text().splitlines()]
    converted, kept = rows
    assert sa.site_bound(converted) and not sa.site_bound(kept) and kept == orphan
    for key in ("game", "unit", "target", "base_rev", "site_file", "site_lines", "group_digest", "callee", "symbol"):
        assert converted[key] == approved_a[key], key
    # the converted row certifies the exact resubmission
    assert review_group(run(A_BASE, A_CAND, [converted]))["status"] == "real"
