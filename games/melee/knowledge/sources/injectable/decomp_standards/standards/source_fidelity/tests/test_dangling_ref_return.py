from conftest import make_hunk, run

BAD = """
static inline const JGeometry::TVec3<f32>&
scaleVector(JGeometry::TVec3<f32> vector, f32 scale)
{
\tvector *= scale;
\treturn vector;
}
"""


def test_by_value_param_returned_by_reference():
    found = run("dangling_ref_return", make_hunk(BAD))
    assert [f["severity"] for f in found] == ["error"]
    assert found[0]["detail"]["returned"] == "vector"
    assert found[0]["detail"]["kind"] == "by-value parameter"
    assert "return vector;" in found[0]["excerpt"]


def test_automatic_local_returned_by_reference():
    src = """
const TVec3f& pick(const TVec3f& a)
{
\tTVec3f tmp = a;
\treturn tmp;
}
"""
    found = run("dangling_ref_return", make_hunk(src))
    assert len(found) == 1 and found[0]["detail"]["kind"] == "automatic local"


def test_reference_param_and_member_returns_are_fine():
    src = """
const TVec3f& getPathNodePoint(const TPathNode& node)
{
\treturn node.getPoint();
}
TVec3f& TFoo::ref(TVec3f& v)
{
\treturn v;
}
TVec3f byValue(TVec3f v)
{
\tv *= 2.0f;
\treturn v;
}
"""
    assert run("dangling_ref_return", make_hunk(src)) == []


def test_vendor_paths_excluded():
    assert run("dangling_ref_return", make_hunk(BAD, file="src/JSystem/JGeometry/x.cpp")) == []
