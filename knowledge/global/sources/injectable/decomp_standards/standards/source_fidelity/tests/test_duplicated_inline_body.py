from conftest import make_hunk, make_repo, run

BODY = """
\tf32 x = mPosition.x - other.x;
\tf32 y = mPosition.y - other.y;
\tf32 z = mPosition.z - other.z;
\tf32 lenSq = x * x + y * y + z * z;
\tif (lenSq <= 0.0f)
\t\treturn 0.0f;
\treturn JGeometry::TUtil<f32>::sqrt(lenSq);
"""
HEADER = "inline f32 length(const TVec3f& other) {\n" + BODY + "}\n"


def test_block_copied_from_header(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, {"include/JSystem/JGeometry/Vec.hpp": HEADER}))
    found = run("duplicated_inline_body", make_hunk("f32 TFoo::dist(const TVec3f& other)\n{\n" + BODY + "}\n"))
    assert [f["severity"] for f in found] == ["warning"]
    assert found[0]["detail"]["duplicate_of"].endswith("Vec.hpp")


def test_block_duplicated_elsewhere_in_file(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, {}))
    existing = "f32 TFoo::distA(const TVec3f& other)\n{\n" + BODY + "}\n"
    added = "f32 TFoo::distB(const TVec3f& other)\n{\n" + BODY + "}\n"
    post = existing + "\n" + added
    start = len(existing.splitlines()) + 2
    hunk = make_hunk(added, post=post, start=start)
    found = run("duplicated_inline_body", hunk)
    assert len(found) == 1 and found[0]["detail"]["duplicate_of"].startswith("src/")


def test_short_or_different_blocks_are_fine(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, {"include/Vec.hpp": HEADER}))
    src = "f32 TFoo::dist(const TVec3f& other)\n{\n\tf32 x = mPosition.x - other.x;\n\tf32 y = mPosition.y - other.y;\n\treturn x + y;\n}\n"
    assert run("duplicated_inline_body", make_hunk(src)) == []
