from conftest import make_hunk, run


def test_fixed_pointer_called_immediately():
    src = "\tf32 (*sqrt)(f32) = JGeometry::TUtil<f32>::sqrt;\n\tf32 d = sqrt(dx * dx);\n"
    found = run("fixed_fn_pointer_call", make_hunk(src))
    assert [f["severity"] for f in found] == ["warning"]
    assert found[0]["detail"]["name"] == "sqrt"


def test_pointer_stored_or_not_called_is_fine():
    src = "\tf32 (*fn)(f32) = JGeometry::TUtil<f32>::sqrt;\n\tmCallback = fn;\n\tf32 (*other)(f32) = pick();\n\tother(1.0f);\n"
    assert run("fixed_fn_pointer_call", make_hunk(src)) == []
