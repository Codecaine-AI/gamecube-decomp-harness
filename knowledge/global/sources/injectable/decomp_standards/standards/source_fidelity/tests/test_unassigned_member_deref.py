from conftest import make_hunk, make_repo, run

POST = """
class TCoronaParams {
public:
\tu8 unk0[0x16C];
\tf32 unk16C;
\tf32 mSet;
};

f32 TCorona::getRadius()
{
\tmParams->mSet = 1.0f;
\treturn mParams->unk16C + mParams->mSet;
}
"""
OWNER_HEADER = {
    "include/MoveBG/MapObjCorona.hpp": "class TCorona {\npublic:\n\tTCoronaParams* mParams;\n};\n",
}


def _hunk_from(post: str, first_added_index: int, **kwargs):
    """Hunk whose added lines are ``post.splitlines()[first_added_index:]``."""

    lines = post.splitlines()
    return make_hunk("\n".join(lines[first_added_index:]), post=post, start=first_added_index + 1, **kwargs)


def test_local_class_member_never_assigned_via_header_typed_base(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, OWNER_HEADER))
    found = run("unassigned_member_deref", _hunk_from(POST, 9, file="src/MoveBG/MapObjCorona.cpp"))
    assert [f["detail"]["member"] for f in found] == ["unk16C"]
    assert found[0]["severity"] == "warning"


def test_local_class_member_via_locally_typed_base():
    post = "struct P {\n\tf32 unk4;\n};\nf32 g(P* p)\n{\n\treturn p->unk4;\n}\n"
    found = run("unassigned_member_deref", _hunk_from(post, 5))
    assert [f["detail"]["member"] for f in found] == ["unk4"]


def test_base_of_unknown_type_is_skipped(monkeypatch):
    monkeypatch.delenv("REVIEW_LINT_REPO_ROOT", raising=False)
    monkeypatch.delenv("REVIEW_LINT_POST_TREE", raising=False)
    assert run("unassigned_member_deref", _hunk_from(POST, 9)) == []


def test_header_owned_members_are_ignored():
    post = "#include <Foo.hpp>\nf32 TCorona::get()\n{\n\treturn mParams->unk16C;\n}\n"
    hunk = make_hunk("\treturn mParams->unk16C;\n", post=post, start=4)
    assert run("unassigned_member_deref", hunk) == []


def test_ctor_initializer_counts_as_assignment():
    post = "struct P {\n\tf32 unk4;\n\tP() : unk4(1.0f) {}\n};\nf32 g(P* p)\n{\n\treturn p->unk4;\n}\n"
    hunk = make_hunk("\treturn p->unk4;\n", post=post, start=7)
    assert run("unassigned_member_deref", hunk) == []


def test_other_objects_and_method_calls_are_fine():
    post = """
class TBathtubParams {
public:
\tint unk58;
\tTVec3f unk5C;
};
void TCorona::run(TBathtubParams* params)
{
\tint frame = gpMarDirector->unk58;
\tparams->unk5C.set(0.0f, 0.0f, 0.0f);
\tf32 y = params->unk5C.y;
}
"""
    assert run("unassigned_member_deref", _hunk_from(post, 8)) == []
