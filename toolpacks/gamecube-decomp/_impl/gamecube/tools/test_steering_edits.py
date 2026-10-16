"""steering_edits: deterministic edits, edits_hash, reverts, dependency-aware groups."""

from __future__ import annotations

import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import steering_edits as se  # noqa: E402

BASE = """\
#include <a.h>

static int gCount;

void T::f(Foo* foo)
{
    if (foo->getDist() < foo->mRange.get() * foo->mRange.get()) {
        foo->go();
    }
    bar(foo->x, 1);
}

void T::g(int n)
{
    int i;
    for (i = 0; i < n; i++)
        work(i);
}
"""

CAND = """\
#include <a.h>
#include <b.h>

static int gCount;

void T::f(Foo* foo)
{
    f32 range = foo->mRange.get();
    range *= range;
    if (foo->getDist() < range) {
        foo->go();
    }
    bar(foo->x, 2);
}

void T::g(s32 n)
{
    int i;
    for (i = 0; i < n; i++)
        work(i);
}
"""


def edits_of(base: str = BASE, cand: str = CAND, path: str = "src/x.cpp") -> list[se.Edit]:
    return se.enumerate_edits(path, base, cand)


def test_enumerate_is_deterministic_and_ids_are_stable() -> None:
    a, b = edits_of(), edits_of()
    assert [e.to_json() for e in a] == [e.to_json() for e in b]
    assert [e.id for e in a] == sorted({e.id for e in a}, key=[e.id for e in a].index)
    assert all(e.id.startswith("src/x.cpp#") for e in a)
    assert edits_of(BASE, BASE) == []


def test_refine_pairs_similar_lines_and_keeps_order() -> None:
    removed = ["    bar(foo->x, 1);\n"]
    added = ["    f32 t = 1;\n", "    bar(foo->x, t);\n"]
    segs = se.refine(removed, added)
    assert segs == [(0, 0, 0, 1), (0, 1, 1, 2)]
    # segments partition both sides in order
    assert sum(r1 - r0 for r0, r1, _, _ in segs) == 1 and sum(a1 - a0 for _, _, a0, a1 in segs) == 2


def test_revert_all_gives_base_and_none_gives_candidate() -> None:
    es = edits_of()
    assert se.apply_reverts(BASE, CAND, es, []) == CAND
    assert se.apply_reverts(BASE, CAND, es, [e.id for e in es]) == BASE


def test_partial_revert_only_touches_chosen_edits() -> None:
    es = edits_of()
    literal = next(e for e in es if any("bar(foo->x, 2)" in x for x in e.added))
    text = se.apply_reverts(BASE, CAND, es, [literal.id])
    assert "bar(foo->x, 1);" in text and "#include <b.h>" in text and "s32 n" in text


def test_preserve_lines_pads_and_joins() -> None:
    es = edits_of()
    temp = [e for e in es if any("range" in x for x in e.added)]
    text = se.apply_reverts(BASE, CAND, es, [e.id for e in temp], preserve_lines=True)
    assert len(text.splitlines()) == len(CAND.splitlines())
    base = "alpha(1);\nbeta(2);\ngamma(3);\nend;\n"
    cand = "zz;\nend;\n"
    es2 = se.enumerate_edits("f.c", base, cand)
    assert len(es2) == 1
    joined = se.apply_reverts(base, cand, es2, [e.id for e in es2], preserve_lines=True)
    assert joined == "alpha(1); beta(2); gamma(3);\nend;\n"
    # never joined across a preprocessor line or a // comment
    base3 = "#if X\nbeta(2);\nend;\n"
    es3 = se.enumerate_edits("f.c", base3, cand)
    assert se.apply_reverts(base3, cand, es3, [e.id for e in es3], preserve_lines=True) == base3


def test_new_and_deleted_files() -> None:
    added = se.enumerate_edits("include/new.h", None, "int x;\n")
    assert se.apply_reverts(None, "int x;\n", added, [e.id for e in added]) is None
    assert se.apply_reverts(None, "int x;\n", added, []) == "int x;\n"
    gone = se.enumerate_edits("include/old.h", "int y;\n", None)
    assert se.apply_reverts("int y;\n", None, gone, [e.id for e in gone]) == "int y;\n"
    assert se.apply_reverts("int y;\n", None, gone, []) is None


def test_edits_hash_binds_everything() -> None:
    files = [{"path": "src/x.cpp", "base_exists": True, "cand_exists": True, "base_text": BASE, "cand_text": CAND}]
    h = se.edits_hash("rev1", files)
    assert h == se.edits_hash("rev1", [dict(files[0])])
    assert h != se.edits_hash("rev2", files)
    assert h != se.edits_hash("rev1", [{**files[0], "cand_text": CAND + "\n"}])
    assert h != se.edits_hash("rev1", [{**files[0], "path": "src/y.cpp"}])
    assert h != se.edits_hash("rev1", [{**files[0], "base_exists": False, "base_text": None}])


def test_surrogate_bytes_round_trip() -> None:
    raw = b"// \x82\xa0 sjis\nint x;\n"
    text = se.decode(raw)
    assert se.encode(text) == raw
    es = se.enumerate_edits("f.c", text, text.replace("int x;", "int y;"))
    assert se.encode(se.apply_reverts(text, text.replace("int x;", "int y;"), es, [es[0].id])) == raw


def test_groups_temp_with_its_uses_and_statement() -> None:
    es = edits_of()
    groups = se.group_edits("src/x.cpp", BASE, CAND, es)
    temp = next(g for g in groups if any("f32 range" in x for x in g.added))
    assert any("range *= range" in x for x in temp.added)
    assert any("< range" in x for x in temp.added)
    assert temp.functions == ["T::f"]
    literal = next(g for g in groups if any("bar(foo->x, 2)" in x for x in g.added))
    assert literal is not temp and literal.functions == ["T::f"]
    include = next(g for g in groups if any("#include <b.h>" in x for x in g.added))
    assert include.functions == [] and not include.blocks
    sig = next(g for g in groups if any("s32 n" in x for x in g.added))
    assert sig.functions == ["T::g"]


def test_multiline_statement_edits_group() -> None:
    base = "void f()\n{\n    call(a,\n         b,\n         c);\n}\n"
    cand = "void f()\n{\n    call(x,\n         b,\n         y);\n}\n"
    es = se.enumerate_edits("f.c", base, cand)
    assert len(es) == 2
    assert len(se.group_edits("f.c", base, cand, es)) == 1


def test_moved_declaration_groups_its_two_halves_only() -> None:
    base = "int a;\nvoid f()\n{\n    use(gB);\n}\nstatic int gB;\nvoid g()\n{\n    use(gB);\n}\n"
    cand = "static int gB;\nint a;\nvoid f()\n{\n    use(gB);\n}\nvoid g()\n{\n    use(gB);\n}\n"
    es = se.enumerate_edits("f.c", base, cand)
    groups = se.group_edits("f.c", base, cand, es)
    assert len(groups) == 1
    assert len(groups[0].edits) == 2
    assert not any("use(gB)" in x for x in groups[0].added + groups[0].removed)


def test_brace_structure_groups_control_flow_rewrite() -> None:
    base = """void f()
{
    if (a() && b())
        return;

    if (!c())
        d();
}
"""
    cand = """void f()
{
    if (a()) {
        if (b())
            return;
    } else if (!c())
        d();
}
"""
    es = se.enumerate_edits("f.c", base, cand)
    groups = [g for g in se.group_edits("f.c", base, cand, es)
              if not all(se.is_cosmetic(e.removed, e.added) for e in g.edits)]
    assert len(groups) == 1, [g.edit_ids for g in groups]
    assert any("else if" in x for x in groups[0].added) and any("if (b())" in x for x in groups[0].added)


def test_condition_change_inside_block_does_not_swallow_the_block() -> None:
    base = "void f()\n{\n    if (a < 1) {\n        x();\n        y(1);\n    }\n}\n"
    cand = "void f()\n{\n    if (a <= 1) {\n        x();\n        y(2);\n    }\n}\n"
    es = se.enumerate_edits("f.c", base, cand)
    assert len(se.group_edits("f.c", base, cand, es)) == 2


def test_block_name_and_defining_macros() -> None:
    assert se.block_name("void TFoo::bar(int x) const") == "TFoo::bar"
    assert se.block_name("TFoo::~TFoo()") == "TFoo::~TFoo"
    assert se.block_name("DEFINE_NERVE(TNerveA, TLiveActor)") == "TNerveA::execute"
    assert se.block_name("UNKNOWN_MACRO(x)") is None
    assert se.block_name("class TFoo : public TBar") is None
    assert se.block_name("static void helper(void)") == "helper"


def test_neighbours_same_block_and_loose_runs() -> None:
    es = edits_of()
    groups = se.group_edits("src/x.cpp", BASE, CAND, es)
    temp = next(g for g in groups if any("f32 range" in x for x in g.added))
    nb = se.neighbours(groups, temp)
    assert all("T::f" in g.functions for g in nb) and len(nb) == 2
    include = next(g for g in groups if not g.blocks)
    assert se.neighbours(groups, include) == [include]


def test_declared_names_and_calls() -> None:
    assert se.declared_names(["    f32 range = foo->get();\n"]) == {"range"}
    assert se.declared_names(["    const Vec& scale = local_1c;\n"]) == {"scale"}
    assert se.declared_names(["    x = a * b;\n", "    return x;\n"]) == set()
    assert se.declared_names(["    for (int i = 0; i < n; i++)\n"]) == {"i"}
    assert se.new_calls(["x = mActor;"], ["x = getActor();"]) == ["getActor"]
    assert se.dropped_calls(["foo(); bar();"], ["foo();"]) == ["bar"]
    assert se.call_names(["if (a) return sizeof(x);"]) == []


def test_cosmetic_and_include_only() -> None:
    assert se.is_cosmetic(["  x = 1; // old\n"], ["x = 1;   /* new */\n"])
    assert not se.is_cosmetic(["x = 1;\n"], ["x = 2;\n"])
    assert se.include_only([], ["#include <macros.h>\n"])
    assert not se.include_only([], ["#define X 1\n"])


def test_statement_map_and_brace_pairs() -> None:
    text = "a = 1; b = 2;\nfoo(x,\n    y);\n// c;\n"
    m = se.statement_map(text)
    assert len(m[0]) == 2 and m[1] == m[2] and m[3] == frozenset()
    assert se.brace_pairs("f()\n{\n  if (x) {\n  }\n}\n") == [(2, 3), (1, 4)]


def test_statement_context_widens_to_whole_statements() -> None:
    base = "void f()\n{\n    clean(a,\n          32.0f * get());\n    done();\n}\n"
    cand = "void f()\n{\n    f32 r = get();\n    clean(a,\n          32.0f * r);\n    done();\n}\n"
    es = se.enumerate_edits("f.c", base, cand)
    groups = se.group_edits("f.c", base, cand, es)
    assert len(groups) == 1
    removed, added = se.statement_context(base, cand, groups[0])
    assert removed == ["    clean(a,", "          32.0f * get());"]
    assert added == ["    f32 r = get();", "    clean(a,", "          32.0f * r);"]


def test_moved_call_statement_is_one_group() -> None:
    base = "void f()\n{\n    a->request(1);\n    x();\n    y();\n    b->setLight(2);\n}\n"
    cand = "void f()\n{\n    b->setLight(2);\n    x();\n    y();\n    a->request(1);\n}\n"
    es = se.enumerate_edits("f.c", base, cand)
    groups = se.group_edits("f.c", base, cand, es)
    assert len(groups) == 1 and len(groups[0].edits) == len(es)
    # the same line in two different functions is not a move
    base2 = "void f()\n{\n    a->request(1);\n}\nvoid g()\n{\n}\n"
    cand2 = "void f()\n{\n}\nvoid g()\n{\n    a->request(1);\n}\n"
    es2 = se.enumerate_edits("f.c", base2, cand2)
    assert len(se.group_edits("f.c", base2, cand2, es2)) == 2
