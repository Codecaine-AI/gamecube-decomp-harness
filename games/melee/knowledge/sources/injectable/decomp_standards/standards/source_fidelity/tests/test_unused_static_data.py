from conftest import make_hunk, run

POST = """
#include <foo.hpp>
static const int unk2602[] = { 0, 0, 0 };
static const int unk2604[] = { 0x3f800000, 0x3f800000, 0x3f800000 };
static const char sName[] = "used";
static int sData0 = 50;
static const f32 sHalf = 0.5f;

void TFoo::perform()
{
\tprint(sName);
\tmSpeed = sHalf;
}
"""


def test_unreferenced_static_arrays_and_scalars():
    hunk = make_hunk("\n".join(POST.strip("\n").splitlines()[1:6]), post=POST, start=3)
    found = run("unused_static_data", hunk)
    assert sorted(f["detail"]["symbol"] for f in found) == ["sData0", "unk2602", "unk2604"]
    assert all(f["severity"] == "error" for f in found)


def test_dummy_marker_and_functions_and_locals_are_fine():
    post = """
// dummy: emits sZeroVec
static const Vec sZeroVec = { 0, 0, 0 };
static inline int helper() { return 1; }
static void dummy(Vec*);
void f()
{
\tstatic const int local[] = { 1 };
}
"""
    hunk = make_hunk("\n".join(post.strip("\n").splitlines()), post=post, start=2)
    assert run("unused_static_data", hunk) == []


def test_requires_whole_file_context(monkeypatch):
    monkeypatch.delenv("REVIEW_LINT_POST_TREE", raising=False)
    hunk = make_hunk("static const int t[] = { 1 };\n")
    hunk["post_file_text"] = None
    assert run("unused_static_data", hunk) == []
