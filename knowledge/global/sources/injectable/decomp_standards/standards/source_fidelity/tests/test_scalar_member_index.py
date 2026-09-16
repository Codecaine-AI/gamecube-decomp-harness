from conftest import make_hunk, make_repo, run

HEADER = "class TConsoleStr {\npublic:\n\tJ2DPicture* unk2AC;\n\tJ2DPicture* mSlots[3];\n};\n"


def test_direct_index_through_scalar_member_is_error(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, {"include/GC2D/ConsoleStr.hpp": HEADER}))
    src = """
\tfor (int i = 0; i < 3; ++i) {
\t\t(&unk2AC)[i] = gpEmitterManager4D2->unkC8[0][0];
\t}
"""
    found = run("scalar_member_index", make_hunk(src, file="src/GC2D/ConsoleStr.cpp"))
    assert [f["severity"] for f in found] == ["error"]
    assert found[0]["detail"] == {"member": "unk2AC", "header_lookup": "scalar"}


def test_pointer_local_then_indexed(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, {"include/GC2D/ConsoleStr.hpp": HEADER}))
    src = """
\tJ2DPicture** slots = &this->unk2AC;
\tslots[1] = nullptr;
"""
    found = run("scalar_member_index", make_hunk(src))
    assert len(found) == 1 and found[0]["severity"] == "error"


def test_array_member_still_flagged_but_plain_indexing_is_fine(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, {"include/GC2D/ConsoleStr.hpp": HEADER}))
    found = run("scalar_member_index", make_hunk("\t(&mSlots)[2] = nullptr;\n", file="src/GC2D/ConsoleStr.cpp"))
    assert [f["detail"]["header_lookup"] for f in found] == ["array"]
    src = "\tJ2DPicture** slots = mSlots;\n\tslots[1] = nullptr;\n\tmSlots[2] = nullptr;\n\tJ2DPicture** p = &mSlots[0];\n\tp[1] = nullptr;\n"
    assert run("scalar_member_index", make_hunk(src)) == []


def test_owning_header_wins_over_same_name_elsewhere(tmp_path, forced_root):
    other = "class TOther {\npublic:\n\tJ2DPicture* unk2AC[3];\n};\n"
    forced_root(make_repo(tmp_path, {"include/GC2D/ConsoleStr.hpp": HEADER, "include/GC2D/GCConsole2.hpp": other}))
    found = run("scalar_member_index", make_hunk("\t(&unk2AC)[i] = 0;\n", file="src/GC2D/ConsoleStr.cpp"))
    assert found[0]["detail"]["header_lookup"] == "scalar" and found[0]["severity"] == "error"


def test_index_zero_is_fine(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, {"include/GC2D/ConsoleStr.hpp": HEADER}))
    assert run("scalar_member_index", make_hunk("\t(&unk2AC)[0] = nullptr;\n")) == []


def test_unknown_header_downgrades_to_warning(monkeypatch):
    monkeypatch.delenv("REVIEW_LINT_REPO_ROOT", raising=False)
    monkeypatch.delenv("REVIEW_LINT_POST_TREE", raising=False)
    found = run("scalar_member_index", make_hunk("\t(&unkFF)[i] = 0;\n"))
    assert [f["severity"] for f in found] == ["warning"]
    assert found[0]["detail"]["header_lookup"] == "unavailable"
